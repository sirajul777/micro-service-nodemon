package server

import (
    "context"
    "strings"

    pb "github.com/mikhmon/mikrotik-go-service/proto"
)

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
            Id: r[".id"], Name: r["name"], Type: r["type"], MacAddress: r["mac-address"], Tx: tx, Rx: rx, Running: r["running"],
        })
    }
    resp.Success = true
    return resp, nil
}

func (s *RouterServiceServer) ListPppSecrets(ctx context.Context, req *pb.ListPppSecretsRequest) (*pb.ListPppSecretsResponse, error) {
    resp := &pb.ListPppSecretsResponse{}
    c, err := s.dial(ctx, req.SessionId)
    if err != nil { resp.Error = err.Error(); return resp, nil }
    defer c.Close()
    args := []string{}
    if strings.TrimSpace(req.Profile) != "" { args = append(args, "?profile="+req.Profile) }
    if strings.TrimSpace(req.Name) != "" { args = append(args, "?name="+req.Name) }
    rows, err := c.Run("/ppp/secret/print", args...)
    if err != nil { resp.Error = err.Error(); return resp, nil }
    for _, r := range rows {
        resp.Secrets = append(resp.Secrets, &pb.PppSecret{
            Id: r[".id"], Name: r["name"], Password: r["password"], Service: r["service"], Profile: r["profile"],
            LocalAddress: r["local-address"], RemoteAddress: r["remote-address"], Comment: r["comment"], Disabled: r["disabled"],
        })
    }
    resp.Success = true
    return resp, nil
}
