package server

import (
    "context"
    "strings"

    pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) ListLogs(ctx context.Context, req *pb.ListLogsRequest) (*pb.ListLogsResponse, error) {
    resp := &pb.ListLogsResponse{}
    c, err := s.dial(ctx, req.SessionId)
    if err != nil {
        resp.Error = err.Error()
        return resp, nil
    }
    defer c.Close()

    args := []string{}
    if strings.TrimSpace(req.Topics) != "" {
        args = append(args, "?topics="+strings.TrimSpace(req.Topics))
    }
    rows, err := c.Run("/log/print", args...)
    if err != nil {
        resp.Error = err.Error()
        return resp, nil
    }

    for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
        rows[i], rows[j] = rows[j], rows[i]
    }
    if len(rows) > 50 {
        rows = rows[:50]
    }

    for _, r := range rows {
        resp.Logs = append(resp.Logs, &pb.LogEntry{
            Id:       r[".id"],
            Time:     r["time"],
            Topics:   r["topics"],
            Message:  r["message"],
        })
    }
    resp.Success = true
    return resp, nil
}
