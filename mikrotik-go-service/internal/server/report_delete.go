package server

import (
	"context"
	"strings"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) DeleteSellingScripts(ctx context.Context, req *pb.DeleteSellingScriptsRequest) (*pb.DeleteSellingScriptsResponse, error) {
	resp := &pb.DeleteSellingScriptsResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	versionRows, err := c.Run("/system/resource/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	ros7 := true
	if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") {
		ros7 = false
	}

	rows, err := s.getSellingRows(c, ros7, req.Idhr, req.Idbl)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}

	for _, row := range rows {
		if id := row[".id"]; id != "" {
			if _, err := c.Run("/system/script/remove", "=.id="+id); err != nil {
				resp.Error = err.Error()
				return resp, nil
			}
			resp.Deleted++
		}
	}
	resp.Success = true
	return resp, nil
}
