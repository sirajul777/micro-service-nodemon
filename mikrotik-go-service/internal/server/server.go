// Package server implements the RouterService gRPC server, translating gRPC
// calls into RouterOS API commands via the internal/mikrotik client.
package server

import (
	"context"

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

// dial opens a RouterOS client for the given session id.
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

func (s *RouterServiceServer) TestConnect(ctx context.Context, req *pb.TestConnectRequest) (*pb.TestConnectResponse, error) {
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		return &pb.TestConnectResponse{Success: false, Error: err.Error()}, nil
	}
	defer c.Close()

	identity := ""
	version := ""
	replies, err := c.Run("/system/identity/print")
	if err == nil && len(replies) > 0 {
		identity = replies[0]["name"]
	}
	rs, err := c.Run("/system/resource/print")
	if err == nil && len(rs) > 0 {
		version = rs[0]["version"]
	}
	return &pb.TestConnectResponse{Success: true, Identity: identity, RosVersion: version}, nil
}

func (s *RouterServiceServer) GetDashboard(ctx context.Context, req *pb.GetDashboardRequest) (*pb.GetDashboardResponse, error) {
	resp := &pb.GetDashboardResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	if id, e := c.Run("/system/identity/print"); e == nil && len(id) > 0 {
		resp.Identity = id[0]["name"]
	}
	if res, e := c.Run("/system/resource/print"); e == nil && len(res) > 0 {
		resp.RosVersion = res[0]["version"]
		resp.Uptime = res[0]["uptime"]
		resp.FreeMemory = res[0]["free-memory"]
		resp.TotalMemory = res[0]["total-memory"]
		resp.FreeHdd = res[0]["free-hdd-space"]
		resp.TotalHdd = res[0]["total-hdd-space"]
		resp.CpuLoad = res[0]["cpu-load"]
	}
	if act, e := c.Run("/ip/hotspot/active/print"); e == nil {
		resp.ActiveHotspotUsers = int32(len(act))
	}
	if all, e := c.Run("/ip/hotspot/user/print"); e == nil {
		resp.TotalHotspotUsers = int32(len(all))
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListActiveHotspotUsers(ctx context.Context, req *pb.ListActiveRequest) (*pb.ListActiveResponse, error) {
	resp := &pb.ListActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	words := []string{}
	if req.Server != "" {
		words = append(words, "?server="+req.Server)
	}
	replies, err := c.Run("/ip/hotspot/active/print", words...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		u := &pb.ActiveHotspotUser{
			Id:         r[".id"],
			User:       r["user"],
			Address:    r["address"],
			MacAddress: r["mac-address"],
			Uptime:     r["uptime"],
			BytesIn:    r["bytes-in"],
			BytesOut:   r["bytes-out"],
			PacketsIn:  r["packets-in"],
			PacketsOut: r["packets-out"],
			Server:     r["server"],
		}
		resp.Users = append(resp.Users, u)
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListHotspotUsers(ctx context.Context, req *pb.ListHotspotUsersRequest) (*pb.ListHotspotUsersResponse, error) {
	resp := &pb.ListHotspotUsersResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	words := []string{}
	if req.Profile != "" {
		words = append(words, "?profile="+req.Profile)
	}
	if req.Comment != "" {
		words = append(words, "?comment="+req.Comment)
	}
	replies, err := c.Run("/ip/hotspot/user/print", words...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		u := &pb.HotspotUser{
			Id:          r[".id"],
			Name:        r["name"],
			Password:    r["password"],
			Profile:     r["profile"],
			Comment:     r["comment"],
			LimitUptime: r["limit-uptime"],
			Disabled:    r["disabled"],
		}
		resp.Users = append(resp.Users, u)
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) AddHotspotUser(ctx context.Context, req *pb.AddHotspotUserRequest) (*pb.AddHotspotUserResponse, error) {
	resp := &pb.AddHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	params := []string{
		"=name=" + req.Name,
		"=password=" + req.Password,
		"=profile=" + req.Profile,
	}
	if req.Comment != "" {
		params = append(params, "=comment="+req.Comment)
	}
	if req.LimitUptime != "" {
		params = append(params, "=limit-uptime="+req.LimitUptime)
	}
	if _, err := c.Run("/ip/hotspot/user/add", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) RemoveHotspotUser(ctx context.Context, req *pb.RemoveHotspotUserRequest) (*pb.RemoveHotspotUserResponse, error) {
	resp := &pb.RemoveHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	id := replies[0][".id"]
	if id == "" {
		resp.Success = true
		return resp, nil
	}
	if _, err := c.Run("/ip/hotspot/user/remove", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListHotspotProfiles(ctx context.Context, req *pb.ListProfilesRequest) (*pb.ListProfilesResponse, error) {
	resp := &pb.ListProfilesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/profile/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		p := &pb.HotspotProfile{
			Id:             r[".id"],
			Name:           r["name"],
			OnLogin:        r["on-login"],
			SessionTimeout: r["session-timeout"],
			IdleTimeout:    r["idle-timeout"],
			RateLimit:      r["rate-limit"],
			SharedUsers:    r["shared-users"],
			AddressPool:    r["address-pool"],
		}
		resp.Profiles = append(resp.Profiles, p)
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetHotspotProfile(ctx context.Context, req *pb.GetProfileRequest) (*pb.GetProfileResponse, error) {
	resp := &pb.GetProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	r := replies[0]
	resp.Profile = &pb.HotspotProfile{
		Id:             r[".id"],
		Name:           r["name"],
		OnLogin:        r["on-login"],
		SessionTimeout: r["session-timeout"],
		IdleTimeout:    r["idle-timeout"],
		RateLimit:      r["rate-limit"],
		SharedUsers:    r["shared-users"],
		AddressPool:    r["address-pool"],
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetSystemResource(ctx context.Context, req *pb.SystemResourceRequest) (*pb.SystemResourceResponse, error) {
	resp := &pb.SystemResourceResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/system/resource/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) > 0 {
		r := replies[0]
		resp.Version = r["version"]
		resp.Uptime = r["uptime"]
		resp.CpuLoad = r["cpu-load"]
		resp.FreeMemory = r["free-memory"]
		resp.TotalMemory = r["total-memory"]
		resp.FreeHdd = r["free-hdd-space"]
		resp.TotalHdd = r["total-hdd-space"]
		resp.RosVersion = r["version"]
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetInterfaces(ctx context.Context, req *pb.InterfacesRequest) (*pb.InterfacesResponse, error) {
	resp := &pb.InterfacesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/interface/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		tx := r["tx-byte"]
		rx := r["rx-byte"]
		if tx == "" {
			tx = r["tx"]
		}
		if rx == "" {
			rx = r["rx"]
		}
		iface := &pb.InterfaceInfo{
			Id:         r[".id"],
			Name:       r["name"],
			Type:       r["type"],
			MacAddress: r["mac-address"],
			Tx:         tx,
			Rx:         rx,
			Running:    r["running"],
		}
		resp.Interfaces = append(resp.Interfaces, iface)
	}
	resp.Success = true
	return resp, nil
}
