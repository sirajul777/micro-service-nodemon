// Package redis implements the Redis event consumer for the MikroTik service.
package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

type Event struct {
	EventID   string          `json:"eventId,omitempty"`
	Type      string          `json:"type"`
	SessionID string          `json:"sessionId"`
	Data      json.RawMessage `json:"data"`
}

type Handler func(context.Context, Event) error

type Consumer struct {
	client        *redis.Client
	topics        []string
	handler       Handler
	useStreams    bool
	group         string
	consumer      string
	maxDeliveries int64
	dlqSuffix     string
}

func NewConsumer(host string, port int, password string, topics []string, handler Handler) *Consumer {
	rdb := redis.NewClient(&redis.Options{Addr: host + ":" + strconv.Itoa(port), Password: password})
	maxDeliveries := int64(5)
	if n, err := strconv.ParseInt(envOrDefault("REDIS_MAX_DELIVERIES", "5"), 10, 64); err == nil && n > 0 {
		maxDeliveries = n
	}
	cname, _ := os.Hostname()
	return &Consumer{
		client:        rdb,
		topics:        topics,
		handler:       handler,
		useStreams:    os.Getenv("USE_REDIS_STREAMS") == "true",
		group:         envOrDefault("REDIS_STREAM_GROUP", "mikrotik-group"),
		consumer:      cname + "-" + strconv.FormatInt(time.Now().UnixNano(), 10),
		maxDeliveries: maxDeliveries,
		dlqSuffix:     envOrDefault("REDIS_DLQ_SUFFIX", ".dlq"),
	}
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func (c *Consumer) Start(ctx context.Context) { go c.loop(ctx) }

func (c *Consumer) loop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if err := c.consumeOnce(ctx); err != nil {
			log.Printf("[mikrotik-go-service] redis consume error: %v (retrying in 3s)", err)
			select {
			case <-ctx.Done():
				return
			case <-time.After(3 * time.Second):
			}
		}
	}
}

func (c *Consumer) deadLetter(ctx context.Context, stream, messageID, reason string, payload any, attempts int64) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal dlq payload: %w", err)
	}
	_, err = c.client.XAdd(ctx, &redis.XAddArgs{
		Stream: stream + c.dlqSuffix,
		Values: map[string]any{
			"originalStream":    stream,
			"originalMessageId": messageID,
			"reason":            reason,
			"attempts":          attempts,
			"failedAt":          time.Now().UTC().Format(time.RFC3339Nano),
			"payload":           string(raw),
		},
	}).Result()
	if err != nil {
		return fmt.Errorf("write dlq: %w", err)
	}
	return nil
}

func (c *Consumer) ack(ctx context.Context, stream, id string) error {
	_, err := c.client.XAck(ctx, stream, c.group, id).Result()
	return err
}

func (c *Consumer) handleStreamMessage(ctx context.Context, stream string, msg redis.XMessage, attempts int64) {
	raw, ok := msg.Values["data"].(string)
	if !ok {
		if b, ok2 := msg.Values["data"].([]byte); ok2 {
			raw = string(b)
		}
	}
	if raw == "" {
		if err := c.deadLetter(ctx, stream, msg.ID, "missing data field", msg.Values, attempts); err != nil {
			log.Printf("[mikrotik-go-service] DLQ failed for %s: %v", msg.ID, err)
			return
		}
		if err := c.ack(ctx, stream, msg.ID); err != nil {
			log.Printf("[mikrotik-go-service] xack after DLQ failed: %v", err)
		}
		return
	}

	var ev Event
	if err := json.Unmarshal([]byte(raw), &ev); err != nil {
		if dlqErr := c.deadLetter(ctx, stream, msg.ID, "invalid JSON event", raw, attempts); dlqErr != nil {
			log.Printf("[mikrotik-go-service] DLQ failed for malformed message %s: %v", msg.ID, dlqErr)
			return
		}
		if err := c.ack(ctx, stream, msg.ID); err != nil {
			log.Printf("[mikrotik-go-service] xack after malformed DLQ failed: %v", err)
		}
		return
	}
	if ev.Type == "" || ev.SessionID == "" || len(ev.Data) == 0 {
		reason := "missing event data"
		if ev.Type == "" {
			reason = "missing event type"
		} else if ev.SessionID == "" {
			reason = "missing sessionId"
		}
		if dlqErr := c.deadLetter(ctx, stream, msg.ID, reason, ev, attempts); dlqErr != nil {
			log.Printf("[mikrotik-go-service] DLQ failed for %s: %v", msg.ID, dlqErr)
			return
		}
		if err := c.ack(ctx, stream, msg.ID); err != nil {
			log.Printf("[mikrotik-go-service] xack after envelope DLQ failed: %v", err)
		}
		return
	}

	if c.handler != nil {
		if err := c.handler(ctx, ev); err != nil {
			if attempts >= c.maxDeliveries {
				if dlqErr := c.deadLetter(ctx, stream, msg.ID, err.Error(), ev, attempts); dlqErr != nil {
					log.Printf("[mikrotik-go-service] DLQ failed after %d attempts for %s: %v", attempts, msg.ID, dlqErr)
					return
				}
				if ackErr := c.ack(ctx, stream, msg.ID); ackErr != nil {
					log.Printf("[mikrotik-go-service] xack after retry exhaustion failed: %v", ackErr)
				}
				log.Printf("[mikrotik-go-service] message %s (event %s) moved to DLQ after %d attempts: %v", msg.ID, ev.EventID, attempts, err)
				return
			}
			log.Printf("[mikrotik-go-service] handler error for %s (event %s, msg %s left pending, attempt %d/%d): %v", ev.Type, ev.EventID, msg.ID, attempts, c.maxDeliveries, err)
			return
		}
	}
	if err := c.ack(ctx, stream, msg.ID); err != nil {
		log.Printf("[mikrotik-go-service] xack failed for event %s: %v", ev.EventID, err)
	}
}

func (c *Consumer) claimStalePending(ctx context.Context, stream string, minIdle time.Duration) {
	start := "-"
	for {
		entries, err := c.client.XPendingExt(ctx, &redis.XPendingExtArgs{Stream: stream, Group: c.group, Start: start, End: "+", Count: 50}).Result()
		if err != nil || len(entries) == 0 {
			return
		}
		var ids []string
		attemptsByID := make(map[string]int64, len(entries))
		for _, e := range entries {
			if e.Idle >= minIdle {
				ids = append(ids, e.ID)
				attemptsByID[e.ID] = e.RetryCount
			}
		}
		if len(ids) > 0 {
			claimed, err := c.client.XClaim(ctx, &redis.XClaimArgs{Stream: stream, Group: c.group, Consumer: c.consumer, MinIdle: minIdle, Messages: ids}).Result()
			if err != nil {
				log.Printf("[mikrotik-go-service] xclaim error for %s: %v", stream, err)
			} else {
				for _, msg := range claimed {
					attempts := attemptsByID[msg.ID]
					if attempts < 1 {
						attempts = 1
					}
					c.handleStreamMessage(ctx, stream, msg, attempts)
				}
			}
		}
		start = "(" + entries[len(entries)-1].ID
		if len(entries) < 50 {
			return
		}
	}
}

func (c *Consumer) consumeOnce(ctx context.Context) error {
	if !c.useStreams {
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
					log.Printf("[mikrotik-go-service] bad pubsub event payload: %v", err)
					continue
				}
				if c.handler != nil {
					if err := c.handler(ctx, ev); err != nil {
						log.Printf("[mikrotik-go-service] handler error for %s (event %s): %v", ev.Type, ev.EventID, err)
					}
				}
			}
		}
	}

	for _, stream := range c.topics {
		err := c.client.XGroupCreateMkStream(ctx, stream, c.group, "$").Err()
		if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
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
		args := &redis.XReadGroupArgs{Group: c.group, Consumer: c.consumer, Streams: append(append([]string{}, c.topics...), make([]string, len(c.topics))...), Count: 10, Block: 5 * time.Second}
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
				c.handleStreamMessage(ctx, stream.Stream, msg, 1)
			}
		}
	}
}

func (c *Consumer) Close() error { return c.client.Close() }
