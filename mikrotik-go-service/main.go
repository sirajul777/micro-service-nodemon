// MikHMon — MikroTik Control Service (Phase 2)
//
// gRPC server exposing the RouterService RPCs (hotspot user/profile management,
// dashboard/system info) to the other microservices. Uses a RouterOS API client
// (internal/mikrotik), Postgres-backed session store (internal/store), and a
// Redis event consumer (internal/redis) for voucher.batch.created events.
//
// Run locally: go run .
// Health:      curl http://localhost:8081/healthz

package main

import (
	"context"
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"google.golang.org/grpc"

	"github.com/mikhmon/mikrotik-go-service/internal/redis"
	"github.com/mikhmon/mikrotik-go-service/internal/server"
	"github.com/mikhmon/mikrotik-go-service/internal/store"
	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

const defaultGRPCPort = ":50051"
const healthPort = "8081"

// envOr returns the value of env key or the provided fallback.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	grpcAddr := envOr("GRPC_PORT", defaultGRPCPort)

	// Postgres connection for router sessions (db_router).
	pgUser := envOr("DB_USER", "admin_mikrotik")
	pgPass := envOr("DB_PASSWORD", "super_postgres_password_123")
	pgHost := envOr("DB_HOST", "localhost")
	pgPort := envOr("DB_PORT", "5432")
	pgName := envOr("DB_NAME", "db_router")
	pgDSN := "postgres://" + pgUser + ":" + pgPass + "@" + pgHost + ":" + pgPort + "/" + pgName

	ctx := context.Background()
	st, err := store.New(ctx, pgDSN)
	if err != nil {
		log.Fatalf("[mikrotik-go-service] store init failed: %v", err)
	}
	defer st.Close()

	// Redis connection for the event consumer.
	redisHost := envOr("REDIS_HOST", "localhost")
	redisPass := envOr("REDIS_PASSWORD", "")
	redisPort := 6379
	if n, err := strconv.Atoi(envOr("REDIS_PORT", "6379")); err == nil {
		redisPort = n
	}

	// The Redis consumer reacts to voucher.batch.created by pushing hotspot
	// users onto the router via the same RouterService logic.
	consumer := redis.NewConsumer(
		redisHost,
		redisPort,
		redisPass,
		[]string{"voucher.batch.created"},
		func(c context.Context, ev redis.Event) error {
			log.Printf("[mikrotik-go-service] event received: type=%s session=%s", ev.Type, ev.SessionID)
			// Placeholder: parse ev.Data and call AddHotspotUser for each user.
			// Full implementation arrives with the ERP voucher-batch producer.
			return nil
		},
	)
	consumer.Start(ctx)
	defer consumer.Close()

	// gRPC server with the RouterService implementation.
	routerServer := server.NewRouterServiceServer(st)

	lis, err := net.Listen("tcp", grpcAddr)
	if err != nil {
		log.Fatalf("[mikrotik-go-service] failed to listen on %s: %v", grpcAddr, err)
	}
	gs := grpc.NewServer()
	pb.RegisterRouterServiceServer(gs, routerServer)

	log.Printf("[mikrotik-go-service] gRPC listener ready on %s", grpcAddr)
	go func() {
		if err := gs.Serve(lis); err != nil {
			log.Fatalf("[mikrotik-go-service] gRPC serve failed: %v", err)
		}
	}()

	// Health endpoint for container health checks / orchestration.
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":  "ok",
			"service": "mikrotik-go-service",
			"grpc":    grpcAddr,
			"db":      pgName,
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	srv := &http.Server{Addr: ":" + healthPort, Handler: mux}
	log.Printf("[mikrotik-go-service] health endpoint on :%s/healthz", healthPort)
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("[mikrotik-go-service] health server failed: %v", err)
	}
}
