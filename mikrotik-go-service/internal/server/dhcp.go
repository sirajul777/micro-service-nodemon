package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) ListDhcpLeases(ctx context.Context, req *pb.ListDhcpLeasesRequest) (*pb.ListDhcpLeasesResponse, error) {
	resp := &pb.ListDhcpLeasesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/ip/dhcp-server/lease/print")
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, r := range rows {
		resp.Leases = append(resp.Leases, &pb.DhcpLease{
			Id: r[".id"], Address: r["address"], MacAddress: r["mac-address"], ClientId: r["client-id"],
			Server: r["server"], Status: r["status"], ExpiresAfter: r["expires-after"], LastSeen: r["last-seen"],
			ActiveAddress: r["active-address"], ActiveMacAddress: r["active-mac-address"], HostName: r["host-name"],
			Comment: r["comment"], Disabled: r["disabled"],
		})
	}
	resp.Success = true
	return resp, nil
}
