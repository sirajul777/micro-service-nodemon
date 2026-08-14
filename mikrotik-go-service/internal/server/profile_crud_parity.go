package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) AddHotspotProfile(ctx context.Context, req *pb.AddHotspotProfileRequest) (*pb.AddHotspotProfileResponse, error) {
	resp := &pb.AddHotspotProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	_, err = c.Run("/ip/hotspot/user/profile/add", 
		"=name="+req.Name,
		"=on-login="+req.OnLogin,
		"=session-timeout="+req.SessionTimeout,
		"=idle-timeout="+req.IdleTimeout,
		"=rate-limit="+req.RateLimit,
		"=shared-users="+req.SharedUsers,
		"=address-pool="+req.AddressPool,
	)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) UpdateHotspotProfile(ctx context.Context, req *pb.UpdateHotspotProfileRequest) (*pb.UpdateHotspotProfileResponse, error) {
	resp := &pb.UpdateHotspotProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(rows) == 0 { resp.Error = "profile tidak ditemukan"; return resp, nil }
	params := []string{"=.id=" + rows[0][".id"]}
	if req.OnLogin != "" { params = append(params, "=on-login="+req.OnLogin) }
	if req.SessionTimeout != "" { params = append(params, "=session-timeout="+req.SessionTimeout) }
	if req.IdleTimeout != "" { params = append(params, "=idle-timeout="+req.IdleTimeout) }
	if req.RateLimit != "" { params = append(params, "=rate-limit="+req.RateLimit) }
	if req.SharedUsers != "" { params = append(params, "=shared-users="+req.SharedUsers) }
	if req.AddressPool != "" { params = append(params, "=address-pool="+req.AddressPool) }
	if len(params) == 1 { resp.Success = true; return resp, nil }
	_, err = c.Run("/ip/hotspot/user/profile/set", params...)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DeleteHotspotProfile(ctx context.Context, req *pb.DeleteHotspotProfileRequest) (*pb.DeleteHotspotProfileResponse, error) {
	resp := &pb.DeleteHotspotProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(rows) == 0 { resp.Error = "profile tidak ditemukan"; return resp, nil }
	_, err = c.Run("/ip/hotspot/user/profile/remove", "=.id="+rows[0][".id"])
	if err != nil { resp.Error = err.Error(); return resp, nil }
	resp.Success = true
	return resp, nil
}
