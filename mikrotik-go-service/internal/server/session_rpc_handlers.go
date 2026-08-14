package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func toSessionInfo(rs any) *pb.RouterSessionInfo {
	r := rs.(*sessionInfoSource)
	return &pb.RouterSessionInfo{Id:r.ID,Name:r.Name,Ip:r.IP,Port:int32(r.Port),User:r.User,HotspotName:r.HotspotName,DnsName:r.DNSName,Currency:r.Currency,ReloadInterval:int32(r.ReloadInterval),Iface:r.Iface,IdleTo:int32(r.IdleTo),Livereport:r.Livereport}
}

type sessionInfoSource struct {
	ID, Name, IP, User, Password, HotspotName, DNSName, Currency, Iface, Livereport string
	Port, ReloadInterval, IdleTo int
}

func (s *RouterServiceServer) ListSessions(ctx context.Context, req *pb.ListSessionsRequest) (*pb.ListSessionsResponse, error) {
	resp := &pb.ListSessionsResponse{}
	rows, err := s.store.List(ctx)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for i := range rows {
		r := rows[i]
		resp.Sessions = append(resp.Sessions, &pb.RouterSessionInfo{Id:r.ID,Name:r.Name,Ip:r.IP,Port:int32(r.Port),User:r.User,HotspotName:r.HotspotName,DnsName:r.DNSName,Currency:r.Currency,ReloadInterval:int32(r.ReloadInterval),Iface:r.Iface,IdleTo:int32(r.IdleTo),Livereport:r.Livereport})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetSession(ctx context.Context, req *pb.GetSessionRequest) (*pb.GetSessionResponse, error) {
	resp := &pb.GetSessionResponse{}
	if req.Id == "" { resp.Error = "id wajib diisi"; return resp, nil }
	r, err := s.store.Get(ctx, req.Id)
	if err != nil { resp.Error = "router session tidak ditemukan"; return resp, nil }
	resp.Session = &pb.RouterSessionInfo{Id:r.ID,Name:r.Name,Ip:r.IP,Port:int32(r.Port),User:r.User,HotspotName:r.HotspotName,DnsName:r.DNSName,Currency:r.Currency,ReloadInterval:int32(r.ReloadInterval),Iface:r.Iface,IdleTo:int32(r.IdleTo),Livereport:r.Livereport}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) CreateSession(ctx context.Context, req *pb.CreateSessionRequest) (*pb.CreateSessionResponse, error) {
	resp := &pb.CreateSessionResponse{}
	if req.Id=="" || req.Name=="" || req.Ip=="" { resp.Error="id, name, dan ip wajib diisi"; return resp,nil }
	if req.Password=="" { resp.Error="password wajib diisi"; return resp,nil }
	if ok, err := s.store.Exists(ctx, req.Id); err != nil { resp.Error=err.Error(); return resp,nil } else if ok { resp.Error="session id sudah digunakan"; return resp,nil }
	rs := storeSession(req)
	if err := s.store.Create(ctx, rs); err != nil { resp.Error=err.Error(); return resp,nil }
	resp.Success=true; resp.Session=&pb.RouterSessionInfo{Id:rs.ID,Name:rs.Name,Ip:rs.IP,Port:int32(rs.Port),User:rs.User,HotspotName:rs.HotspotName,DnsName:rs.DNSName,Currency:rs.Currency,ReloadInterval:int32(rs.ReloadInterval),Iface:rs.Iface,IdleTo:int32(rs.IdleTo),Livereport:rs.Livereport}; return resp,nil
}

func (s *RouterServiceServer) UpdateSession(ctx context.Context, req *pb.UpdateSessionRequest) (*pb.UpdateSessionResponse, error) {
	resp := &pb.UpdateSessionResponse{}
	if req.Id=="" { resp.Error="id wajib diisi"; return resp,nil }
	old, err := s.store.Get(ctx, req.Id); if err != nil { resp.Error="router session tidak ditemukan"; return resp,nil }
	rs := storeSessionUpdate(req, old)
	ok, err := s.store.Update(ctx, rs); if err != nil { resp.Error=err.Error(); return resp,nil }; if !ok { resp.Error="router session tidak ditemukan"; return resp,nil }
	resp.Success=true; resp.Session=&pb.RouterSessionInfo{Id:rs.ID,Name:rs.Name,Ip:rs.IP,Port:int32(rs.Port),User:rs.User,HotspotName:rs.HotspotName,DnsName:rs.DNSName,Currency:rs.Currency,ReloadInterval:int32(rs.ReloadInterval),Iface:rs.Iface,IdleTo:int32(rs.IdleTo),Livereport:rs.Livereport}; return resp,nil
}

func (s *RouterServiceServer) DeleteSession(ctx context.Context, req *pb.DeleteSessionRequest) (*pb.DeleteSessionResponse, error) {
	resp := &pb.DeleteSessionResponse{}
	if req.Id=="" { resp.Error="id wajib diisi"; return resp,nil }
	ok, err := s.store.Delete(ctx, req.Id); if err != nil { resp.Error=err.Error(); return resp,nil }; if !ok { resp.Error="router session tidak ditemukan"; return resp,nil }
	resp.Success=true; return resp,nil
}
