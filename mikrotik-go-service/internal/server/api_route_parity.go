package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) ListHotspotUsers(ctx context.Context, req *pb.ListHotspotUsersRequest) (*pb.ListHotspotUsersResponse, error) {
	resp := &pb.ListHotspotUsersResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	args := []string{}
	if req.Profile != "" {
		args = append(args, "?profile="+req.Profile)
	}
	if req.Comment != "" {
		args = append(args, "?comment="+req.Comment)
	}
	rows, err := c.Run("/ip/hotspot/user/print", args...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range rows {
		resp.Users = append(resp.Users, &pb.HotspotUser{
			Id: r[".id"], Name: r["name"], Password: r["password"], Profile: r["profile"],
			Comment: r["comment"], LimitUptime: r["limit-uptime"], Disabled: r["disabled"],
		})
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

	rows, err := c.Run("/ip/hotspot/user/profile/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range rows {
		resp.Profiles = append(resp.Profiles, &pb.HotspotProfile{
			Id: r[".id"], Name: r["name"], OnLogin: r["on-login"], SessionTimeout: r["session-timeout"],
			IdleTimeout: r["idle-timeout"], RateLimit: r["rate-limit"], SharedUsers: r["shared-users"],
			AddressPool: r["address-pool"],
		})
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

	rows, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(rows) == 0 {
		resp.Error = "profile tidak ditemukan"
		return resp, nil
	}
	r := rows[0]
	resp.Profile = &pb.HotspotProfile{
		Id: r[".id"], Name: r["name"], OnLogin: r["on-login"], SessionTimeout: r["session-timeout"],
		IdleTimeout: r["idle-timeout"], RateLimit: r["rate-limit"], SharedUsers: r["shared-users"],
		AddressPool: r["address-pool"],
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListPppActive(ctx context.Context, req *pb.ListPppActiveRequest) (*pb.ListPppActiveResponse, error) {
	resp := &pb.ListPppActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	rows, err := c.Run("/ppp/active/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range rows {
		resp.Actives = append(resp.Actives, &pb.PppActive{
			Id: r[".id"], Name: r["name"], Service: r["service"], CallerId: r["caller-id"],
			Address: r["address"], Uptime: r["uptime"], Encoding: r["encoding"], SessionId: r["session-id"],
		})
	}
	resp.Success = true
	return resp, nil
}
