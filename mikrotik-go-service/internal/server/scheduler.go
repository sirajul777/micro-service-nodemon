package server

import (
	"context"
	"strings"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) ListSchedulers(ctx context.Context, req *pb.ListSchedulersRequest) (*pb.ListSchedulersResponse, error) {
	resp := &pb.ListSchedulersResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/system/scheduler/print")
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, r := range rows {
		resp.Schedulers = append(resp.Schedulers, &pb.Scheduler{
			Id: r[".id"], Name: r["name"], StartDate: r["start-date"], StartTime: r["start-time"],
			Interval: r["interval"], OnEvent: r["on-event"], Disabled: r["disabled"], Comment: r["comment"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) AddScheduler(ctx context.Context, req *pb.AddSchedulerRequest) (*pb.AddSchedulerResponse, error) {
	resp := &pb.AddSchedulerResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	name := strings.TrimSpace(req.Name)
	if name == "" { resp.Error = "name wajib diisi"; return resp, nil }
	existing, err := c.Run("/system/scheduler/print", "?name="+name)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(existing) > 0 {
		id := existing[0][".id"]
		params := []string{"=.id="+id, "=on-event="+req.OnEvent}
		if req.Disabled != "" { params = append(params, "=disabled="+req.Disabled) }
		if req.Comment != "" { params = append(params, "=comment="+req.Comment) }
		if _, err := c.Run("/system/scheduler/set", params...); err != nil { resp.Error = err.Error(); return resp, nil }
		resp.Success = true
		return resp, nil
	}
	params := []string{"=name="+name, "=on-event="+req.OnEvent}
	if req.StartDate != "" { params = append(params, "=start-date="+req.StartDate) }
	if req.StartTime != "" { params = append(params, "=start-time="+req.StartTime) }
	if req.Interval != "" { params = append(params, "=interval="+req.Interval) }
	if req.Disabled != "" { params = append(params, "=disabled="+req.Disabled) }
	if req.Comment != "" { params = append(params, "=comment="+req.Comment) }
	if _, err := c.Run("/system/scheduler/add", params...); err != nil { resp.Error = err.Error(); return resp, nil }
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) UpdateScheduler(ctx context.Context, req *pb.UpdateSchedulerRequest) (*pb.UpdateSchedulerResponse, error) {
	resp := &pb.UpdateSchedulerResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	rows, err := c.Run("/system/scheduler/print", "?name="+req.Name)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(rows) == 0 { resp.Error = "scheduler tidak ditemukan"; return resp, nil }
	params := []string{"=.id="+rows[0][".id"], "=on-event="+req.OnEvent}
	if req.Disabled != "" { params = append(params, "=disabled="+req.Disabled) }
	if req.Comment != "" { params = append(params, "=comment="+req.Comment) }
	if _, err := c.Run("/system/scheduler/set", params...); err != nil { resp.Error = err.Error(); return resp, nil }
	resp.Success = true
	return resp, nil
}
