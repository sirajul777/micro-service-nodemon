// Package redis implements the Redis event consumer for the MikroTik service.
//
// It subscribes to stream/topic events published by other services and reacts
// to them. In Phase 2 the primary consumer is `voucher.batch.created` — when
// the ERP service creates a voucher batch, this service pushes the hotspot
// users onto the router.
package redis

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// Event is a decodable broker event.
type Event struct {
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId"`
	Data      json.RawMessage `json:"data"`
}

// Handler processes a decoded event.
type Handler func(ctx context.Context, ev Event) error

// Consumer subscribes to Redis pub/sub topics.
type Consumer struct {
	client     *redis.Client
	topics     []string
	handler    Handler
	useStreams bool
	group      string
	consumer   string
}

// NewConsumer connects to Redis and prepares a subscription.
func NewConsumer(host string, port int, password string, topics []string, handler Handler) *Consumer {
	rdb := redis.NewClient(&redis.Options{
		Addr:     host + ":" + strconv.Itoa(port),
		Password: password,
	})
	useStreams := false
	if os.Getenv("USE_REDIS_STREAMS") == "true" {
		useStreams = true
	}
	group := os.Getenv("REDIS_STREAM_GROUP")
	if group == "" {
		group = "mikrotik-group"
	}
	cname, _ := os.Hostname()
	consumerName := cname + "-" + strconv.FormatInt(time.Now().UnixNano(), 10)
	return &Consumer{
		client:     rdb,
		topics:     topics,
		handler:    handler,
		useStreams: useStreams,
		group:      group,
		consumer:   consumerName,
	}
}

// Start begins consuming from the configured topics in the background.
func (c *Consumer) Start(ctx context.Context) {
	go c.loop(ctx)
}

// loop re-connects and consumes until ctx is cancelled.
func (c *Consumer) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		err := c.consumeOnce(ctx)
		if err != nil {
			log.Printf("[mikrotik-go-service] redis consume error: %v (retrying in 3s)", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
		}
	}
}

// claimStalePending reclaims and reprocesses messages that have been
// sitting in another (likely dead) consumer's PEL for longer than
// minIdle. This is what actually bounds the damage from a crash or a
// deploy that kills a consumer mid-handler: without it, a message whose
// original consumer died before acking would sit in the stream forever,
// invisible to new reads (XREADGROUP only returns '>' i.e. never-delivered
// entries), and delivery quietly stops for that message.
func (c *Consumer) claimStalePending(ctx context.Context, stream string, minIdle time.Duration) {
	start := "-"
	for {
		entries, err := c.client.XPendingExt(ctx, &redis.XPendingExtArgs{
			Stream: stream,
			Group:  c.group,
			Start:  start,
			End:    "+",
			Count:  50,
		}).Result()
		if err != nil || len(entries) == 0 {
			return
		}
		var ids []string
		for _, e := range entries {
			if e.Idle >= minIdle {
				ids = append(ids, e.ID)
			}
		}
		if len(ids) > 0 {
			claimed, err := c.client.XClaim(ctx, &redis.XClaimArgs{
				Stream:   stream,
				Group:    c.group,
				Consumer: c.consumer,
				MinIdle:  minIdle,
				Messages: ids,
			}).Result()
			if err != nil {
				log.Printf("[mikrotik-go-service] xclaim error for %s: %v", stream, err)
			}
			for _, msg := range claimed {
				var ev Event
				raw, _ := msg.Values["data"].(string)
				if err := json.Unmarshal([]byte(raw), &ev); err != nil {
					log.Printf("[mikrotik-go-service] bad reclaimed payload (msg %s): %v", msg.ID, err)
					continue
				}
				var handlerErr error
				if c.handler != nil {
					handlerErr = c.handler(ctx, ev)
				}
				if handlerErr != nil {
					log.Printf("[mikrotik-go-service] reclaimed handler error for %s (msg %s still pending): %v", ev.Type, msg.ID, handlerErr)
					continue
				}
				if _, err := c.client.XAck(ctx, stream, c.group, msg.ID).Result(); err != nil {
					log.Printf("[mikrotik-go-service] xack (reclaim) failed: %v", err)
				}
			}
		}
		// entries[] is ID-sorted; page from the id after the last one seen.
		start = "(" + entries[len(entries)-1].ID
		if len(entries) < 50 {
			return
		}
	}
}

func (c *Consumer) consumeOnce(ctx context.Context) error {
	if c.useStreams {
		// Ensure consumer groups exist
		for _, stream := range c.topics {
			err := c.client.XGroupCreateMkStream(ctx, stream, c.group, "$").Err()
			if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
				// ignore BUSYGROUP; log others
				log.Printf("[mikrotik-go-service] xgroup create error for %s: %v", stream, err)
			}
		}

		lastRecovery := time.Now()
		const recoveryInterval = 30 * time.Second
		const staleAfter = 60 * time.Second

		for {
			select {
			case <-ctx.Done():
				return nil
			default:
			}
			if time.Since(lastRecovery) >= recoveryInterval {
				for _, stream := range c.topics {
					c.claimStalePending(ctx, stream, staleAfter)
				}
				lastRecovery = time.Now()
			}
			// Build streams args: stream -> '>' for new messages
			// Use ReadGroup across all streams
			args := &redis.XReadGroupArgs{
				Group:    c.group,
				Consumer: c.consumer,
				Streams:  append(append([]string{}, c.topics...), make([]string, len(c.topics))...),
				Count:    10,
				Block:    5 * time.Second,
			}
			// fill the second half with ">"
			for i := range c.topics {
				args.Streams[len(c.topics)+i] = ">"
			}

			resp, err := c.client.XReadGroup(ctx, args).Result()
			if err != nil {
				if err == redis.Nil {
					continue
				}
				return err
			}
			for _, stream := range resp {
				for _, msg := range stream.Messages {
					var ev Event
					raw, ok := msg.Values["data"].(string)
					if !ok {
						// try byte slice
						if b, ok2 := msg.Values["data"].([]byte); ok2 {
							raw = string(b)
						}
					}
					if err := json.Unmarshal([]byte(raw), &ev); err != nil {
						log.Printf("[mikrotik-go-service] bad event payload: %v", err)
						continue
					}
					// Only XAck on success. Acking unconditionally here was the
					// bug: a failed handler (e.g. router unreachable) would
					// still have its message marked delivered, so it was
					// silently dropped instead of retried — the delivery
					// guarantee streams were supposed to add over pub/sub.
					handlerErr := error(nil)
					if c.handler != nil {
						handlerErr = c.handler(ctx, ev)
					}
					if handlerErr != nil {
						log.Printf("[mikrotik-go-service] handler error for %s (msg %s left pending for retry): %v", ev.Type, msg.ID, handlerErr)
						continue
					}
					if _, err := c.client.XAck(ctx, stream.Stream, c.group, msg.ID).Result(); err != nil {
						log.Printf("[mikrotik-go-service] xack failed: %v", err)
					}
				}
			}
		}
	}

	sub := c.client.Subscribe(ctx, c.topics...)
	defer sub.Close()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return nil
		case msg, ok := <-ch:
			if !ok {
				return nil
			}
			var ev Event
			if err := json.Unmarshal([]byte(msg.Payload), &ev); err != nil {
				log.Printf("[mikrotik-go-service] bad event payload: %v", err)
				continue
			}
			if c.handler != nil {
				if err := c.handler(ctx, ev); err != nil {
					log.Printf("[mikrotik-go-service] handler error for %s: %v", ev.Type, err)
				}
			}
		}
	}
}

// Close closes the Redis client.
func (c *Consumer) Close() error {
	return c.client.Close()
}
