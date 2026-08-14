package server

import (
    "context"
    pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) GetDashboard(ctx context.Context, req *pb.GetDashboardRequest) (*pb.GetDashboardResponse, error) {
    resp := &pb.GetDashboardResponse{}
    c, err := s.dial(ctx, req.SessionId); if err != nil { resp.Error = err.Error(); return resp, nil }; defer c.Close()
    id, err := c.Run("/system/identity/print"); if err != nil { resp.Error = err.Error(); return resp, nil }
    rs, err := c.Run("/system/resource/print"); if err != nil { resp.Error = err.Error(); return resp, nil }
    if len(id)>0 { resp.Identity=id[0]["name"] }
    if len(rs)>0 { r:=rs[0]; resp.Version=r["version"]; resp.RosVersion=r["version"]; resp.Uptime=r["uptime"]; resp.CpuLoad=r["cpu-load"]; resp.FreeMemory=r["free-memory"]; resp.TotalMemory=r["total-memory"]; resp.FreeHdd=r["free-hdd-space"]; resp.TotalHdd=r["total-hdd-space"] }
    if a,e:=c.Run("/ip/hotspot/active/print"); e==nil { resp.ActiveHotspotUsers=int32(len(a)) }
    if u,e:=c.Run("/ip/hotspot/user/print"); e==nil { resp.TotalHotspotUsers=int32(len(u)) }
    resp.Success=true; return resp,nil
}

func (s *RouterServiceServer) ListActiveHotspotUsers(ctx context.Context, req *pb.ListActiveRequest) (*pb.ListActiveResponse, error) {
    resp:=&pb.ListActiveResponse{}; c,err:=s.dial(ctx,req.SessionId); if err!=nil{resp.Error=err.Error();return resp,nil}; defer c.Close()
    words:=[]string{}; if req.Server!=""{words=append(words,"?server="+req.Server)}
    rows,err:=c.Run("/ip/hotspot/active/print",words...); if err!=nil{resp.Error=err.Error();return resp,nil}
    for _,r:=range rows{resp.Users=append(resp.Users,&pb.ActiveHotspotUser{Id:r[".id"],User:r["user"],Address:r["address"],MacAddress:r["mac-address"],Uptime:r["uptime"],BytesIn:r["bytes-in"],BytesOut:r["bytes-out"],PacketsIn:r["packets-in"],PacketsOut:r["packets-out"],Server:r["server"]})}
    resp.Success=true; return resp,nil
}

func (s *RouterServiceServer) GetInterfaces(ctx context.Context, req *pb.InterfacesRequest) (*pb.InterfacesResponse, error) {
    resp:=&pb.InterfacesResponse{}; c,err:=s.dial(ctx,req.SessionId); if err!=nil{resp.Error=err.Error();return resp,nil}; defer c.Close()
    rows,err:=c.Run("/interface/print"); if err!=nil{resp.Error=err.Error();return resp,nil}
    for _,r:=range rows{tx:=r["tx-byte"];if tx==""{tx=r["tx"]};rx:=r["rx-byte"];if rx==""{rx=r["rx"]};resp.Interfaces=append(resp.Interfaces,&pb.InterfaceInfo{Id:r[".id"],Name:r["name"],Type:r["type"],MacAddress:r["mac-address"],Tx:tx,Rx:rx,Running:r["running"]})}
    resp.Success=true; return resp,nil
}

func (s *RouterServiceServer) ListPppSecrets(ctx context.Context, req *pb.ListPppSecretsRequest) (*pb.ListPppSecretsResponse, error) {
    resp:=&pb.ListPppSecretsResponse{}; c,err:=s.dial(ctx,req.SessionId); if err!=nil{resp.Error=err.Error();return resp,nil}; defer c.Close()
    words:=[]string{};if req.Profile!=""{words=append(words,"?profile="+req.Profile)};if req.Name!=""{words=append(words,"?name="+req.Name)}
    rows,err:=c.Run("/ppp/secret/print",words...);if err!=nil{resp.Error=err.Error();return resp,nil}
    for _,r:=range rows{resp.Secrets=append(resp.Secrets,&pb.PppSecret{Id:r[".id"],Name:r["name"],Password:r["password"],Service:r["service"],Profile:r["profile"],LocalAddress:r["local-address"],RemoteAddress:r["remote-address"],Comment:r["comment"],Disabled:r["disabled"]})}
    resp.Success=true;return resp,nil
}
