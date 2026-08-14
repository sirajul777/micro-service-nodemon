// Package server implements the RouterService gRPC server, translating gRPC
// calls into RouterOS API commands via the internal/mikrotik client.
package server

import (
	"context"
	"strings"

	"github.com/mikhmon/mikrotik-go-service/internal/mikrotik"
	"github.com/mikhmon/mikrotik-go-service/internal/store"
	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

// RouterServiceServer implements pb.RouterServiceServer.
type RouterServiceServer struct {
	pb.UnimplementedRouterServiceServer
	store *store.Store
}

// NewRouterServiceServer creates a gRPC server bound to the router store.
func NewRouterServiceServer(st *store.Store) *RouterServiceServer {
	return &RouterServiceServer{store: st}
}

// dial opens a RouterOS client for the given session id.
func (s *RouterServiceServer) dial(ctx context.Context, sessionID string) (*mikrotik.Client, error) {
	rs, err := s.store.Get(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	port := rs.Port
	if port == 0 {
		port = 8728
	}
	return mikrotik.Dial(rs.IP, rs.User, rs.Password, mikrotik.WithPort(port))
}

func (s *RouterServiceServer) TestConnect(ctx context.Context, req *pb.TestConnectRequest) (*pb.TestConnectResponse, error) {
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		return &pb.TestConnectResponse{Success: false, Error: err.Error()}, nil
	}
	defer c.Close()
	identity := ""
	version := ""
	if replies, e := c.Run("/system/identity/print"); e == nil && len(replies) > 0 {
		identity = replies[0]["name"]
	}
	if replies, e := c.Run("/system/resource/print"); e == nil && len(replies) > 0 {
		version = replies[0]["version"]
	}
	return &pb.TestConnectResponse{Success: true, Identity: identity, RosVersion: version}, nil
}

func (s *RouterServiceServer) GetDashboard(ctx context.Context, req *pb.GetDashboardRequest) (*pb.GetDashboardResponse, error) {
	resp := &pb.GetDashboardResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	if id, e := c.Run("/system/identity/print"); e == nil && len(id) > 0 { resp.Identity = id[0]["name"] }
	if res, e := c.Run("/system/resource/print"); e == nil && len(res) > 0 {
		resp.RosVersion = res[0]["version"]
		resp.Uptime = res[0]["uptime"]
		resp.FreeMemory = res[0]["free-memory"]
		resp.TotalMemory = res[0]["total-memory"]
		resp.FreeHdd = res[0]["free-hdd-space"]
		resp.TotalHdd = res[0]["total-hdd-space"]
		resp.CpuLoad = res[0]["cpu-load"]
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
	words := []string{}
	if req.Server != "" { words = append(words, "?server="+req.Server) }
	replies, err := c.Run("/ip/hotspot/active/print", words...)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, r := range replies {
		resp.Users = append(resp.Users, &pb.ActiveHotspotUser{Id:r[".id"], User:r["user"], Address:r["address"], MacAddress:r["mac-address"], Uptime:r["uptime"], BytesIn:r["bytes-in"], BytesOut:r["bytes-out"], PacketsIn:r["packets-in"], PacketsOut:r["packets-out"], Server:r["server"]})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListHotspotUsers(ctx context.Context, req *pb.ListHotspotUsersRequest) (*pb.ListHotspotUsersResponse, error) {
	resp := &pb.ListHotspotUsersResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	words := []string{}
	if req.Profile != "" { words = append(words, "?profile="+req.Profile) }
	if req.Comment != "" { words = append(words, "?comment="+req.Comment) }
	replies, err := c.Run("/ip/hotspot/user/print", words...)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, r := range replies {
		resp.Users = append(resp.Users, &pb.HotspotUser{Id:r[".id"], Name:r["name"], Password:r["password"], Profile:r["profile"], Comment:r["comment"], LimitUptime:r["limit-uptime"], Disabled:r["disabled"]})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) AddHotspotUser(ctx context.Context, req *pb.AddHotspotUserRequest) (*pb.AddHotspotUserResponse, error) {
	resp := &pb.AddHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	params := []string{"=name="+req.Name,"=password="+req.Password,"=profile="+req.Profile}
	if req.Comment != "" { params = append(params, "=comment="+req.Comment) }
	if req.LimitUptime != "" { params = append(params, "=limit-uptime="+req.LimitUptime) }
	if _, err := c.Run("/ip/hotspot/user/add", params...); err != nil { resp.Error = err.Error(); return resp, nil }
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) RemoveHotspotUser(ctx context.Context, req *pb.RemoveHotspotUserRequest) (*pb.RemoveHotspotUserResponse, error) {
	resp := &pb.RemoveHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	if len(replies) == 0 { resp.Success = true; return resp, nil }
	id := replies[0][".id"]
	if id != "" { if _, err := c.Run("/ip/hotspot/user/remove", "=.id="+id); err != nil { resp.Error = err.Error(); return resp, nil } }
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DisableHotspotUser(ctx context.Context, req *pb.DisableHotspotUserRequest) (*pb.DisableHotspotUserResponse, error) {
	resp := &pb.DisableHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId); if err != nil { resp.Error=err.Error(); return resp,nil }; defer c.Close()
	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name); if err != nil { resp.Error=err.Error(); return resp,nil }
	if len(replies)==0 { resp.Error="hotspot user tidak ditemukan"; return resp,nil }
	if _, err := c.Run("/ip/hotspot/user/disable", "=.id="+replies[0][".id"]); err != nil { resp.Error=err.Error(); return resp,nil }
	resp.Success=true; return resp,nil
}

func (s *RouterServiceServer) EnableHotspotUser(ctx context.Context, req *pb.EnableHotspotUserRequest) (*pb.EnableHotspotUserResponse, error) {
	resp := &pb.EnableHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId); if err != nil { resp.Error=err.Error(); return resp,nil }; defer c.Close()
	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name); if err != nil { resp.Error=err.Error(); return resp,nil }
	if len(replies)==0 { resp.Error="hotspot user tidak ditemukan"; return resp,nil }
	if _, err := c.Run("/ip/hotspot/user/enable", "=.id="+replies[0][".id"]); err != nil { resp.Error=err.Error(); return resp,nil }
	resp.Success=true; return resp,nil
}

func (s *RouterServiceServer) ListHotspotProfiles(ctx context.Context, req *pb.ListProfilesRequest) (*pb.ListProfilesResponse, error) {
	resp:=&pb.ListProfilesResponse{}; c,err:=s.dial(ctx,req.SessionId); if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close()
	replies,err:=c.Run("/ip/hotspot/user/profile/print");if err!=nil{resp.Error=err.Error();return resp,nil}
	for _,r:=range replies{resp.Profiles=append(resp.Profiles,&pb.HotspotProfile{Id:r[".id"],Name:r["name"],OnLogin:r["on-login"],SessionTimeout:r["session-timeout"],IdleTimeout:r["idle-timeout"],RateLimit:r["rate-limit"],SharedUsers:r["shared-users"],AddressPool:r["address-pool"]})}
	resp.Success=true;return resp,nil
}

func (s *RouterServiceServer) GetHotspotProfile(ctx context.Context, req *pb.GetProfileRequest) (*pb.GetProfileResponse, error) {
	resp:=&pb.GetProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close()
	replies,err:=c.Run("/ip/hotspot/user/profile/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(replies)==0{resp.Success=true;return resp,nil};r:=replies[0]
	resp.Profile=&pb.HotspotProfile{Id:r[".id"],Name:r["name"],OnLogin:r["on-login"],SessionTimeout:r["session-timeout"],IdleTimeout:r["idle-timeout"],RateLimit:r["rate-limit"],SharedUsers:r["shared-users"],AddressPool:r["address-pool"]};resp.Success=true;return resp,nil
}

func (s *RouterServiceServer) AddHotspotProfile(ctx context.Context, req *pb.AddHotspotProfileRequest) (*pb.AddHotspotProfileResponse, error) {
	resp:=&pb.AddHotspotProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();params:=[]string{"=name="+req.Name}
	if req.OnLogin!=""{params=append(params,"=on-login="+req.OnLogin)};if req.SessionTimeout!=""{params=append(params,"=session-timeout="+req.SessionTimeout)};if req.IdleTimeout!=""{params=append(params,"=idle-timeout="+req.IdleTimeout)};if req.RateLimit!=""{params=append(params,"=rate-limit="+req.RateLimit)};if req.SharedUsers!=""{params=append(params,"=shared-users="+req.SharedUsers)};if req.AddressPool!=""{params=append(params,"=address-pool="+req.AddressPool)}
	if _,err:=c.Run("/ip/hotspot/user/profile/add",params...);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil
}

func (s *RouterServiceServer) UpdateHotspotProfile(ctx context.Context, req *pb.UpdateHotspotProfileRequest) (*pb.UpdateHotspotProfileResponse,error){
	resp:=&pb.UpdateHotspotProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();replies,err:=c.Run("/ip/hotspot/user/profile/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(replies)==0{resp.Error="hotspot profile tidak ditemukan";return resp,nil};params:=[]string{"=.id="+replies[0][".id"]}
	if req.OnLogin!=""{params=append(params,"=on-login="+req.OnLogin)};if req.SessionTimeout!=""{params=append(params,"=session-timeout="+req.SessionTimeout)};if req.IdleTimeout!=""{params=append(params,"=idle-timeout="+req.IdleTimeout)};if req.RateLimit!=""{params=append(params,"=rate-limit="+req.RateLimit)};if req.SharedUsers!=""{params=append(params,"=shared-users="+req.SharedUsers)};if req.AddressPool!=""{params=append(params,"=address-pool="+req.AddressPool)}
	if _,err:=c.Run("/ip/hotspot/user/profile/set",params...);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil
}

func (s *RouterServiceServer) DeleteHotspotProfile(ctx context.Context, req *pb.DeleteHotspotProfileRequest) (*pb.DeleteHotspotProfileResponse,error){resp:=&pb.DeleteHotspotProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();replies,err:=c.Run("/ip/hotspot/user/profile/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(replies)==0{resp.Success=true;return resp,nil};if _,err:=c.Run("/ip/hotspot/user/profile/remove","=.id="+replies[0][".id"]);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) BulkRemoveHotspotUsers(ctx context.Context, req *pb.BulkRemoveHotspotUsersRequest) (*pb.BulkRemoveHotspotUsersResponse,error){resp:=&pb.BulkRemoveHotspotUsersResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();for _,name:=range req.Names{rows,e:=c.Run("/ip/hotspot/user/print","?name="+name);if e!=nil{resp.FailedNames=append(resp.FailedNames,name);continue};if len(rows)==0{continue};if _,e=c.Run("/ip/hotspot/user/remove","=.id="+rows[0][".id"]);e!=nil{resp.FailedNames=append(resp.FailedNames,name);continue};resp.Removed++};resp.Success=len(resp.FailedNames)==0;return resp,nil}

func (s *RouterServiceServer) SetupExpiryScheduler(ctx context.Context, req *pb.SetupExpirySchedulerRequest) (*pb.SetupExpirySchedulerResponse,error){resp:=&pb.SetupExpirySchedulerResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();script:=cleanupScriptROS7;if replies,e:=c.Run("/system/resource/print");e==nil&&len(replies)>0&&strings.HasPrefix(replies[0]["version"],"6"){script=cleanupScriptROS6};if _,err:=c.Run("/system/script/add","=name=hotspot-expiry-cleanup","=source="+script);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) ListPppSecrets(ctx context.Context, req *pb.ListPppSecretsRequest) (*pb.ListPppSecretsResponse,error){resp:=&pb.ListPppSecretsResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();words:=[]string{};if req.Profile!=""{words=append(words,"?profile="+req.Profile)};if req.Name!=""{words=append(words,"?name="+req.Name)};rows,err:=c.Run("/ppp/secret/print",words...);if err!=nil{resp.Error=err.Error();return resp,nil};for _,r:=range rows{resp.Secrets=append(resp.Secrets,&pb.PppSecret{Id:r[".id"],Name:r["name"],Password:r["password"],Service:r["service"],Profile:r["profile"],LocalAddress:r["local-address"],RemoteAddress:r["remote-address"],Comment:r["comment"],Disabled:r["disabled"]})};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) GetPppSecret(ctx context.Context, req *pb.GetPppSecretRequest)(*pb.GetPppSecretResponse,error){resp:=&pb.GetPppSecretResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/secret/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Success=true;return resp,nil};r:=rows[0];resp.Secret=&pb.PppSecret{Id:r[".id"],Name:r["name"],Password:r["password"],Service:r["service"],Profile:r["profile"],LocalAddress:r["local-address"],RemoteAddress:r["remote-address"],Comment:r["comment"],Disabled:r["disabled"]};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) AddPppSecret(ctx context.Context, req *pb.AddPppSecretRequest)(*pb.AddPppSecretResponse,error){resp:=&pb.AddPppSecretResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();params:=[]string{"=name="+req.Name,"=password="+req.Password};if req.Service!=""{params=append(params,"=service="+req.Service)};if req.Profile!=""{params=append(params,"=profile="+req.Profile)};if req.LocalAddress!=""{params=append(params,"=local-address="+req.LocalAddress)};if req.RemoteAddress!=""{params=append(params,"=remote-address="+req.RemoteAddress)};if req.Comment!=""{params=append(params,"=comment="+req.Comment)};if _,err:=c.Run("/ppp/secret/add",params...);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) UpdatePppSecret(ctx context.Context, req *pb.UpdatePppSecretRequest)(*pb.UpdatePppSecretResponse,error){resp:=&pb.UpdatePppSecretResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/secret/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Error="ppp secret tidak ditemukan";return resp,nil};params:=[]string{"=.id="+rows[0][".id"]};if req.Password!=""{params=append(params,"=password="+req.Password)};if req.Service!=""{params=append(params,"=service="+req.Service)};if req.Profile!=""{params=append(params,"=profile="+req.Profile)};if req.LocalAddress!=""{params=append(params,"=local-address="+req.LocalAddress)};if req.RemoteAddress!=""{params=append(params,"=remote-address="+req.RemoteAddress)};if req.Comment!=""{params=append(params,"=comment="+req.Comment)};if _,err:=c.Run("/ppp/secret/set",params...);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) DeletePppSecret(ctx context.Context, req *pb.DeletePppSecretRequest)(*pb.DeletePppSecretResponse,error){resp:=&pb.DeletePppSecretResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/secret/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Success=true;return resp,nil};if _,err:=c.Run("/ppp/secret/remove","=.id="+rows[0][".id"]);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) EnablePppSecret(ctx context.Context, req *pb.EnablePppSecretRequest)(*pb.EnablePppSecretResponse,error){resp:=&pb.EnablePppSecretResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/secret/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Error="ppp secret tidak ditemukan";return resp,nil};if _,err:=c.Run("/ppp/secret/enable","=.id="+rows[0][".id"]);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) DisablePppSecret(ctx context.Context, req *pb.DisablePppSecretRequest)(*pb.DisablePppSecretResponse,error){resp:=&pb.DisablePppSecretResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/secret/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Error="ppp secret tidak ditemukan";return resp,nil};if _,err:=c.Run("/ppp/secret/disable","=.id="+rows[0][".id"]);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) ListPppProfiles(ctx context.Context, req *pb.ListPppProfilesRequest)(*pb.ListPppProfilesResponse,error){resp:=&pb.ListPppProfilesResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/profile/print");if err!=nil{resp.Error=err.Error();return resp,nil};for _,r:=range rows{resp.Profiles=append(resp.Profiles,&pb.PppProfile{Id:r[".id"],Name:r["name"],LocalAddress:r["local-address"],RemoteAddress:r["remote-address"],Dns:r["dns-server"],RateLimit:r["rate-limit"],Bridge:r["bridge"],OnlyOne:r["only-one"],ChangeTcpMss:r["change-tcp-mss"]})};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) AddPppProfile(ctx context.Context, req *pb.AddPppProfileRequest)(*pb.AddPppProfileResponse,error){resp:=&pb.AddPppProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();params:=[]string{"=name="+req.Name};if req.LocalAddress!=""{params=append(params,"=local-address="+req.LocalAddress)};if req.RemoteAddress!=""{params=append(params,"=remote-address="+req.RemoteAddress)};if req.Dns!=""{params=append(params,"=dns-server="+req.Dns)};if req.RateLimit!=""{params=append(params,"=rate-limit="+req.RateLimit)};if req.Bridge!=""{params=append(params,"=bridge="+req.Bridge)};if req.OnlyOne!=""{params=append(params,"=only-one="+req.OnlyOne)};if req.ChangeTcpMss!=""{params=append(params,"=change-tcp-mss="+req.ChangeTcpMss)};if _,err:=c.Run("/ppp/profile/add",params...);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) UpdatePppProfile(ctx context.Context, req *pb.UpdatePppProfileRequest)(*pb.UpdatePppProfileResponse,error){resp:=&pb.UpdatePppProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/profile/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Error="ppp profile tidak ditemukan";return resp,nil};params:=[]string{"=.id="+rows[0][".id"]};if req.LocalAddress!=""{params=append(params,"=local-address="+req.LocalAddress)};if req.RemoteAddress!=""{params=append(params,"=remote-address="+req.RemoteAddress)};if req.Dns!=""{params=append(params,"=dns-server="+req.Dns)};if req.RateLimit!=""{params=append(params,"=rate-limit="+req.RateLimit)};if req.Bridge!=""{params=append(params,"=bridge="+req.Bridge)};if req.OnlyOne!=""{params=append(params,"=only-one="+req.OnlyOne)};if req.ChangeTcpMss!=""{params=append(params,"=change-tcp-mss="+req.ChangeTcpMss)};if _,err:=c.Run("/ppp/profile/set",params...);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) DeletePppProfile(ctx context.Context, req *pb.DeletePppProfileRequest)(*pb.DeletePppProfileResponse,error){resp:=&pb.DeletePppProfileResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/profile/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Success=true;return resp,nil};if _,err:=c.Run("/ppp/profile/remove","=.id="+rows[0][".id"]);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) ListPppActive(ctx context.Context, req *pb.ListPppActiveRequest)(*pb.ListPppActiveResponse,error){resp:=&pb.ListPppActiveResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/active/print");if err!=nil{resp.Error=err.Error();return resp,nil};for _,r:=range rows{resp.Connections=append(resp.Connections,&pb.PppActive{Id:r[".id"],Name:r["name"],Service:r["service"],CallId:r["caller-id"],Address:r["address"],Uptime:r["uptime"],BytesIn:r["bytes-in"],BytesOut:r["bytes-out"],Profile:r["profile"]})};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) DisconnectPppActive(ctx context.Context, req *pb.DisconnectPppActiveRequest)(*pb.DisconnectPppActiveResponse,error){resp:=&pb.DisconnectPppActiveResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ppp/active/print","?name="+req.Name);if err!=nil{resp.Error=err.Error();return resp,nil};if len(rows)==0{resp.Success=true;return resp,nil};if _,err:=c.Run("/ppp/active/remove","=.id="+rows[0][".id"]);err!=nil{resp.Error=err.Error();return resp,nil};resp.Success=true;return resp,nil}

func (s *RouterServiceServer) ListPppPools(ctx context.Context, req *pb.ListPppPoolsRequest)(*pb.ListPppPoolsResponse,error){resp:=&pb.ListPppPoolsResponse{};c,err:=s.dial(ctx,req.SessionId);if err!=nil{resp.Error=err.Error();return resp,nil};defer c.Close();rows,err:=c.Run("/ip/pool/print");if err!=nil{resp.Error=err.Error();return resp,nil};for _,r:=range rows{resp.Pools=append(resp.Pools,&pb.PppPool{Id:r[".id"],Name:r["name"],Ranges:r["ranges"],NextPool:r["next-pool"]})};resp.Success=true;return resp,nil}

func orDefault(v, def string) string { if strings.TrimSpace(v)=="" { return def }; return v }
func orDefaultPort(v int32) int32 { if v==0 { return 8728 }; return v }
func orDefaultPortExisting(v int32, existing int) int32 { if v==0 { return int32(existing) }; return v }
func orDefaultInt(v, def int) int { if v==0 { return def }; return v }
func orDefaultIntExisting(v int32, existing int) int32 { if v==0 { return int32(existing) }; return v }
