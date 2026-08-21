// Package server implements the RouterService gRPC server, translating gRPC
// calls into RouterOS API commands via the internal/mikrotik client.
package server

import (
	"context"
	"strings"

	"github.com/mikhmon/mikrotik-go-service/internal/mikrotik"
	"github.com/mikhmon/mikrotik-go-service/internal/store"
	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

// RouterServiceServer implements pb.RouterServiceServer.
type RouterServiceServer struct {
	pb.UnimplementedRouterServiceServer
	store *store.Store
}

// NewRouterServiceServer creates a gRPC server bound to the router store.
func NewRouterServiceServer(st *store.Store) *RouterServiceServer {
	return &RouterServiceServer{store: st}
}

// dial opens a RouterOS client for the given session id and honors the gRPC context.
func (s *RouterServiceServer) dial(ctx context.Context, sessionID string) (*mikrotik.Client, error) {
	rs, err := s.store.Get(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	port := rs.Port
	if port == 0 {
		port = 8728
	}
	return mikrotik.DialContext(ctx, rs.IP, rs.User, rs.Password, mikrotik.WithPort(port))
}

func (s *RouterServiceServer) SetupExpiryScheduler(ctx context.Context, req *pb.SetupExpirySchedulerRequest) (*pb.SetupExpirySchedulerResponse, error) {
	resp := &pb.SetupExpirySchedulerResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()

	const schedulerName = "mikhmon-cleanup-expired"
	script := cleanupScriptROS7
	if replies, e := c.RunContext(ctx, "/system/resource/print"); e == nil && len(replies) > 0 && strings.HasPrefix(replies[0]["version"], "6") {
		script = cleanupScriptROS6
	}

	existing, err := c.RunContext(ctx, "/system/scheduler/print", "?name="+schedulerName)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(existing) > 0 {
		id := existing[0][".id"]
		if id == "" { resp.Error = "scheduler cleanup tidak memiliki id"; return resp, nil }
		if _, err := c.RunContext(ctx, "/system/scheduler/set", "=.id="+id, "=interval=2h", "=start-time=00:00:00", "=on-event="+script, "=comment=mikhmon-auto-cleanup", "=disabled=no"); err != nil {
			resp.Error = err.Error(); return resp, nil
		}
	} else {
		if _, err := c.RunContext(ctx, "/system/scheduler/add", "=name="+schedulerName, "=interval=2h", "=start-time=00:00:00", "=on-event="+script, "=comment=mikhmon-auto-cleanup", "=disabled=no"); err != nil {
			resp.Error = err.Error(); return resp, nil
		}
	}
	resp.Success = true
	return resp, nil
}
