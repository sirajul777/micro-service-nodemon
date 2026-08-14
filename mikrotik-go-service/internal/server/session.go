package server

import (
    "context"

    pb "github.com/mikhmon/mikrotik-go-service/proto"
    "github.com/mikhmon/mikrotik-go-service/internal/store"
)

func (s *RouterServiceServer) ListSessions(ctx context.Context, req *pb.ListSessionsRequest) (*pb.ListSessionsResponse, error) {
    sessions, err := s.store.List(ctx)
    if err != nil {
        return &pb.ListSessionsResponse{Success: false, Error: err.Error()}, nil
    }
    resp := &pb.ListSessionsResponse{Success: true}
    for i := range sessions {
        resp.Sessions = append(resp.Sessions, toRouterSessionInfo(&sessions[i]))
    }
    return resp, nil
}

func toRouterSessionInfo(rs *store.RouterSession) *pb.RouterSessionInfo {
    return &pb.RouterSessionInfo{
        Id: rs.ID,
        Name: rs.Name,
        Ip: rs.IP,
        Port: int32(rs.Port),
        User: rs.User,
        HotspotName: rs.HotspotName,
        DnsName: rs.DNSName,
        Currency: rs.Currency,
        ReloadInterval: int32(rs.ReloadInterval),
        Iface: rs.Iface,
        IdleTo: int32(rs.IdleTo),
        Livereport: rs.Livereport,
    }
}

func (s *RouterServiceServer) GetSession(ctx context.Context, req *pb.GetSessionRequest) (*pb.GetSessionResponse, error) {
    if req == nil || req.Id == "" {
        return &pb.GetSessionResponse{Success: false, Error: "id wajib diisi"}, nil
    }
    rs, err := s.store.Get(ctx, req.Id)
    if err != nil {
        return &pb.GetSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
    }
    return &pb.GetSessionResponse{Success: true, Session: toRouterSessionInfo(rs)}, nil
}

func (s *RouterServiceServer) CreateSession(ctx context.Context, req *pb.CreateSessionRequest) (*pb.CreateSessionResponse, error) {
    if req == nil || req.Id == "" || req.Name == "" || req.Ip == "" {
        return &pb.CreateSessionResponse{Success: false, Error: "id, name, dan ip wajib diisi"}, nil
    }
    if req.Password == "" {
        return &pb.CreateSessionResponse{Success: false, Error: "password wajib diisi"}, nil
    }
    exists, err := s.store.Exists(ctx, req.Id)
    if err != nil {
        return &pb.CreateSessionResponse{Success: false, Error: err.Error()}, nil
    }
    if exists {
        return &pb.CreateSessionResponse{Success: false, Error: "session id sudah digunakan"}, nil
    }
    rs := store.RouterSession{
        ID: req.Id, Name: req.Name, IP: req.Ip, Port: int(req.Port), User: req.User, Password: req.Password,
        HotspotName: req.HotspotName, DNSName: req.DnsName, Currency: req.Currency,
        ReloadInterval: int(req.ReloadInterval), Iface: req.Iface, IdleTo: int(req.IdleTo), Livereport: req.Livereport,
    }
    if err := s.store.Create(ctx, rs); err != nil {
        return &pb.CreateSessionResponse{Success: false, Error: err.Error()}, nil
    }
    saved, err := s.store.Get(ctx, req.Id)
    if err != nil {
        return &pb.CreateSessionResponse{Success: false, Error: err.Error()}, nil
    }
    return &pb.CreateSessionResponse{Success: true, Session: toRouterSessionInfo(saved)}, nil
}

func (s *RouterServiceServer) UpdateSession(ctx context.Context, req *pb.UpdateSessionRequest) (*pb.UpdateSessionResponse, error) {
    if req == nil || req.Id == "" || req.Name == "" || req.Ip == "" {
        return &pb.UpdateSessionResponse{Success: false, Error: "id, name, dan ip wajib diisi"}, nil
    }
    current, err := s.store.Get(ctx, req.Id)
    if err != nil {
        return &pb.UpdateSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
    }
    password := req.Password
    if password == "" {
        password = current.Password
    }
    rs := store.RouterSession{
        ID: req.Id, Name: req.Name, IP: req.Ip, Port: int(req.Port), User: req.User, Password: password,
        HotspotName: req.HotspotName, DNSName: req.DnsName, Currency: req.Currency,
        ReloadInterval: int(req.ReloadInterval), Iface: req.Iface, IdleTo: int(req.IdleTo), Livereport: req.Livereport,
    }
    updated, err := s.store.Update(ctx, rs)
    if err != nil {
        return &pb.UpdateSessionResponse{Success: false, Error: err.Error()}, nil
    }
    if !updated {
        return &pb.UpdateSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
    }
    saved, err := s.store.Get(ctx, req.Id)
    if err != nil {
        return &pb.UpdateSessionResponse{Success: false, Error: err.Error()}, nil
    }
    return &pb.UpdateSessionResponse{Success: true, Session: toRouterSessionInfo(saved)}, nil
}

func (s *RouterServiceServer) DeleteSession(ctx context.Context, req *pb.DeleteSessionRequest) (*pb.DeleteSessionResponse, error) {
    if req == nil || req.Id == "" {
        return &pb.DeleteSessionResponse{Success: false, Error: "id wajib diisi"}, nil
    }
    deleted, err := s.store.Delete(ctx, req.Id)
    if err != nil {
        return &pb.DeleteSessionResponse{Success: false, Error: err.Error()}, nil
    }
    if !deleted {
        return &pb.DeleteSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
    }
    return &pb.DeleteSessionResponse{Success: true}, nil
}
