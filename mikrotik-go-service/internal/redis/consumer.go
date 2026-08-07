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
	client  *redis.Client
	topics  []string
	handler Handler
}

// NewConsumer connects to Redis and prepares a subscription.
func NewConsumer(host string, port int, password string, topics []string, handler Handler) *Consumer {
	rdb := redis.NewClient(&redis.Options{
		Addr:     host + ":" + strconv.Itoa(port),
		Password: password,
	})
	return &Consumer{
		client:  rdb,
		topics:  topics,
		handler: handler,
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

func (c *Consumer) consumeOnce(ctx context.Context) error {
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
