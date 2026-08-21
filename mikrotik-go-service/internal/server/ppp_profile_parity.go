package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

// ListPppProfiles implements the RouterService RPC used by the ERP/BFF PPPoE
// profile page. Keep the response shape aligned with router.proto.
func (s *RouterServiceServer) ListPppProfiles(ctx context.Context, req *pb.ListPppProfilesRequest) (*pb.ListPppProfilesResponse, error) {
	resp := &pb.ListPppProfilesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	rows, err := c.RunContext(ctx, "/ppp/profile/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}

	resp.Profiles = make([]*pb.PppProfile, 0, len(rows))
	for _, r := range rows {
		resp.Profiles = append(resp.Profiles, &pb.PppProfile{
			Id:          r[".id"],
			Name:        r["name"],
			LocalAddress: r["local-address"],
			RemoteAddress: r["remote-address"],
			RateLimit:   r["rate-limit"],
			Dns:         r["dns-server"],
			Bridge:      r["bridge"],
			OnlyOne:     r["only-one"],
			ChangeTcpMss: r["change-tcp-mss"],
		})
	}
	resp.Success = true
	return resp, nil
}
