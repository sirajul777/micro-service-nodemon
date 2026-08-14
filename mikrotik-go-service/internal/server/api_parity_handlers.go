package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) GetDashboard(ctx context.Context, req *pb.GetDashboardRequest) (*pb.GetDashboardResponse, error) {
	resp := &pb.GetDashboardResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	if id, e := c.Run("/system/identity/print"); e == nil && len(id) > 0 { resp.Identity = id[0]["name"] }
	if res, e := c.Run("/system/resource/print"); e == nil && len(res) > 0 {
		r := res[0]
		resp.RosVersion = r["version"]
		resp.Uptime = r["uptime"]
		resp.Version = r["version"]
		resp.FreeMemory = r["free-memory"]
		resp.TotalMemory = r["total-memory"]
		resp.FreeHdd = r["free-hdd-space"]
		resp.TotalHdd = r["total-hdd-space"]
		resp.CpuLoad = r["cpu-load"]
	}
	if act, e := c.Run("/ip/hotspot/active/print"); e == nil { resp.ActiveHotspotUsers = int32(len(act)) }
	if all, e := c.Run("/ip/hotspot/user/print"); e == nil { resp.TotalHotspotUsers = int32(len(all)) }
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListActiveHotspotUsers(ctx context.Context, req *pb.ListActiveRequest) (*pb.ListActiveResponse, error) {
	resp := &pb.ListActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	args := []string{}
	if req.Server != "" { args = append(args, "?server="+req.Server) }
	rows, err := c.Run("/ip/hotspot/active/print", args...)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, r := range rows {
		resp.Users = append(resp.Users, &pb.ActiveHotspotUser{
			Id: r[".id"], User: r["user"], Address: r["address"], MacAddress: r["mac-address"],
			Uptime: r["uptime"], BytesIn: r["bytes-in"], BytesOut: r["bytes-out"],
			PacketsIn: r["packets-in"], PacketsOut: r["packets-out"], Server: r["server"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetSystemResource(ctx context.Context, req *pb.SystemResourceRequest) (*pb.SystemResourceResponse, error) {
	resp := &pb.SystemResourceResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/system/resource/print")
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(rows) > 0 {
		r := rows[0]
		resp.Version = r["version"]
		resp.RosVersion = r["version"]
		resp.Uptime = r["uptime"]
		resp.CpuLoad = r["cpu-load"]
		resp.FreeMemory = r["free-memory"]
		resp.TotalMemory = r["total-memory"]
		resp.FreeHdd = r["free-hdd-space"]
		resp.TotalHdd = r["total-hdd-space"]
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetInterfaces(ctx context.Context, req *pb.InterfacesRequest) (*pb.InterfacesResponse, error) {
	resp := &pb.InterfacesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/interface/print")
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, r := range rows {
		tx, rx := r["tx-byte"], r["rx-byte"]
		if tx == "" { tx = r["tx"] }
		if rx == "" { rx = r["rx"] }
		resp.Interfaces = append(resp.Interfaces, &pb.InterfaceInfo{
			Id: r[".id"], Name: r["name"], Type: r["type"], MacAddress: r["mac-address"],
			Tx: tx, Rx: rx, Running: r["running"],
		})
	}
	resp.Success = true
	return resp, nil
}
