package server

import (
	"context"
	"sync"
	"time"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

var hotspotProfilesCache sync.Map
const hotspotProfilesCacheTTL = 30 * time.Second

type hotspotProfilesCacheEntry struct {
	profiles  []*pb.HotspotProfile
	expiresAt time.Time
}

func getHotspotProfilesCache(key string) ([]*pb.HotspotProfile, bool) {
	value, ok := hotspotProfilesCache.Load(key)
	if !ok {
		return nil, false
	}
	entry, ok := value.(hotspotProfilesCacheEntry)
	if !ok || time.Now().After(entry.expiresAt) {
		hotspotProfilesCache.Delete(key)
		return nil, false
	}
	return entry.profiles, true
}

func setHotspotProfilesCache(key string, profiles []*pb.HotspotProfile) {
	hotspotProfilesCache.Store(key, hotspotProfilesCacheEntry{
		profiles:  profiles,
		expiresAt: time.Now().Add(hotspotProfilesCacheTTL),
	})
}

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
	rows, err := c.RunContext(ctx, "/ip/hotspot/user/print", args...)
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
	cacheKey := req.SessionId
	if profiles, ok := getHotspotProfilesCache(cacheKey); ok {
		resp.Profiles = profiles
		resp.Success = true
		return resp, nil
	}

	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	rows, err := c.RunContext(ctx, "/ip/hotspot/user/profile/print",
		"=.proplist=.id,name,on-login,session-timeout,idle-timeout,rate-limit,shared-users,address-pool")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	profiles := make([]*pb.HotspotProfile, 0, len(rows))
	for _, r := range rows {
		profiles = append(profiles, &pb.HotspotProfile{
			Id: r[".id"], Name: r["name"], OnLogin: r["on-login"], SessionTimeout: r["session-timeout"],
			IdleTimeout: r["idle-timeout"], RateLimit: r["rate-limit"], SharedUsers: r["shared-users"],
			AddressPool: r["address-pool"],
		})
	}
	setHotspotProfilesCache(cacheKey, profiles)
	resp.Profiles = profiles
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

	rows, err := c.RunContext(ctx, "/ip/hotspot/user/profile/print", "?name="+req.Name,
		"=.proplist=.id,name,on-login,session-timeout,idle-timeout,rate-limit,shared-users,address-pool")
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

	rows, err := c.RunContext(ctx, "/ppp/active/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range rows {
		resp.Connections = append(resp.Connections, &pb.PppActive{
			Id: r[".id"],
			Name: r["name"],
			Service: r["service"],
			CallId: r["caller-id"],
			Address: r["address"],
			Uptime: r["uptime"],
			BytesIn: r["bytes-in"],
			BytesOut: r["bytes-out"],
			Profile: r["profile"],
		})
	}
	resp.Success = true
	return resp, nil
}
