// MikHMon — MikroTik Control Service (Phase 2)
//
// gRPC server exposing RouterService RPCs and consuming voucher batch events.
package main

import (
	"context"
	"encoding/json"
	"fmt"
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

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

type voucherBatchCreated struct {
	BatchID     string `json:"batchId"`
	SessionID   string `json:"sessionId"`
	ProfileName string `json:"profileName"`
	Vouchers    []struct {
		Username    string `json:"username"`
		Password    string `json:"password"`
		Profile     string `json:"profile"`
		LimitUptime string `json:"limitUptime,omitempty"`
	} `json:"vouchers"`
}

func handleVoucherBatchCreated(ctx context.Context, routerServer *server.RouterServiceServer, ev redis.Event) error {
	if ev.Type != "voucher.batch.created" {
		return fmt.Errorf("unsupported event type %q", ev.Type)
	}
	if ev.SessionID == "" {
		return fmt.Errorf("voucher.batch.created missing sessionId")
	}
	if len(ev.Data) == 0 {
		return fmt.Errorf("voucher.batch.created missing data")
	}

	var batch voucherBatchCreated
	if err := json.Unmarshal(ev.Data, &batch); err != nil {
		return fmt.Errorf("decode voucher.batch.created: %w", err)
	}
	if batch.SessionID == "" {
		batch.SessionID = ev.SessionID
	}
	if batch.SessionID != ev.SessionID {
		return fmt.Errorf("event session mismatch: envelope=%q payload=%q", ev.SessionID, batch.SessionID)
	}
	if batch.BatchID == "" {
		return fmt.Errorf("voucher.batch.created missing batchId")
	}

	for _, voucher := range batch.Vouchers {
		if voucher.Username == "" || voucher.Profile == "" {
			return fmt.Errorf("batch %s contains voucher with missing username/profile", batch.BatchID)
		}

		// Redis Streams can redeliver a message after a crash. Check the router
		// before creating the user so replay is idempotent.
		users, err := routerServer.ListHotspotUsers(ctx, &pb.ListHotspotUsersRequest{
			SessionId: batch.SessionID,
		})
		if err != nil {
			return fmt.Errorf("list router users for %s: %w", voucher.Username, err)
		}
		if !users.Success {
			return fmt.Errorf("list router users for %s: %s", voucher.Username, users.Error)
		}

		exists := false
		for _, existing := range users.Users {
			if existing.Name != voucher.Username {
				continue
			}
			exists = true
			// Do not overwrite an existing RouterOS account that has a
			// different profile/password. Treat that as a real conflict.
			if existing.Profile != voucher.Profile || existing.Password != voucher.Password {
				return fmt.Errorf("router user %q already exists with different configuration", voucher.Username)
			}
			break
		}
		if exists {
			continue
		}

		res, err := routerServer.AddHotspotUser(ctx, &pb.AddHotspotUserRequest{
			SessionId:   batch.SessionID,
			Name:        voucher.Username,
			Password:    voucher.Password,
			Profile:     voucher.Profile,
			LimitUptime: voucher.LimitUptime,
		})
		if err != nil {
			return fmt.Errorf("add hotspot user %s: %w", voucher.Username, err)
		}
		if !res.Success {
			return fmt.Errorf("add hotspot user %s: %s", voucher.Username, res.Error)
		}
	}

	log.Printf("[mikrotik-go-service] provisioned batch=%s session=%s vouchers=%d", batch.BatchID, batch.SessionID, len(batch.Vouchers))
	return nil
}

func main() {
	grpcAddr := envOr("GRPC_PORT", defaultGRPCPort)

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

	routerServer := server.NewRouterServiceServer(st)

	redisHost := envOr("REDIS_HOST", "localhost")
	redisPass := envOr("REDIS_PASSWORD", "")
	redisPort := 6379
	if n, err := strconv.Atoi(envOr("REDIS_PORT", "6379")); err == nil {
		redisPort = n
	}

	consumer := redis.NewConsumer(
		redisHost,
		redisPort,
		redisPass,
		[]string{"voucher.batch.created"},
		func(c context.Context, ev redis.Event) error {
			return handleVoucherBatchCreated(c, routerServer, ev)
		},
	)
	consumer.Start(ctx)
	defer consumer.Close()

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
