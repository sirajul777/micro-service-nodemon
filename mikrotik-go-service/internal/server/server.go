// Package server implements the RouterService gRPC server, translating RouterOS API commands.
package server

import (
	"context"
	"strings"

	"github.com/mikhmon/mikrotik-go-service/internal/mikrotik"
	"github.com/mikhmon/mikrotik-go-service/internal/store"
	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

type RouterServiceServer struct {
	pb.UnimplementedRouterServiceServer
	store *store.Store
}

func NewRouterServiceServer(st *store.Store) *RouterServiceServer {
	return &RouterServiceServer{store: st}
}

func (s *RouterServiceServer) dial(ctx context.Context, sessionID string) (*mikrotik.Client, error) {
	rs, err := s.store.Get(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	port := rs.Port
	if port == 0 {
		port = 8728
	}
	return mikrotik.Dial(rs.IP, rs.User, rs.Password, mikrotik.WithPort(port))
}

func (s *RouterServiceServer) ListPppActive(ctx context.Context, req *pb.ListPppActiveRequest) (*pb.ListPppActiveResponse, error) {
	resp := &pb.ListPppActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()
	replies, err := c.Run("/ppp/active/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		resp.Connections = append(resp.Connections, &pb.PppActive{
			Id: r[".id"], Name: r["name"], Service: r["service"], CallId: r["caller-id"],
			Address: r["address"], Uptime: r["uptime"], BytesIn: r["bytes-in"], BytesOut: r["bytes-out"], Profile: r["profile"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListPppPools(ctx context.Context, req *pb.ListPppPoolsRequest) (*pb.ListPppPoolsResponse, error) {
	resp := &pb.ListPppPoolsResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()
	replies, err := c.Run("/ip/pool/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		resp.Pools = append(resp.Pools, &pb.PppPool{Id: r[".id"], Name: r["name"], Ranges: r["ranges"], NextPool: r["next-pool"]})
	}
	resp.Success = true
	return resp, nil
}

// Remaining RouterService methods are implemented in the other server files.
func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}
