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
	replies, err := c.Run("/system/identity/print")
	if err == nil && len(replies) > 0 {
		identity = replies[0]["name"]
	}
	rs, err := c.Run("/system/resource/print")
	if err == nil && len(rs) > 0 {
		version = rs[0]["version"]
	}
	return &pb.TestConnectResponse{Success: true, Identity: identity, RosVersion: version}, nil
}

func (s *RouterServiceServer) GetDashboard(ctx context.Context, req *pb.GetDashboardRequest) (*pb.GetDashboardResponse, error) {
	resp := &pb.GetDashboardResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	if id, e := c.Run("/system/identity/print"); e == nil && len(id) > 0 {
		resp.Identity = id[0]["name"]
	}
	if res, e := c.Run("/system/resource/print"); e == nil && len(res) > 0 {
		resp.RosVersion = res[0]["version"]
		resp.Uptime = res[0]["uptime"]
		resp.FreeMemory = res[0]["free-memory"]
		resp.TotalMemory = res[0]["total-memory"]
		resp.FreeHdd = res[0]["free-hdd-space"]
		resp.TotalHdd = res[0]["total-hdd-space"]
		resp.CpuLoad = res[0]["cpu-load"]
	}
	if act, e := c.Run("/ip/hotspot/active/print"); e == nil {
		resp.ActiveHotspotUsers = int32(len(act))
	}
	if all, e := c.Run("/ip/hotspot/user/print"); e == nil {
		resp.TotalHotspotUsers = int32(len(all))
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListActiveHotspotUsers(ctx context.Context, req *pb.ListActiveRequest) (*pb.ListActiveResponse, error) {
	resp := &pb.ListActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	words := []string{}
	if req.Server != "" {
		words = append(words, "?server="+req.Server)
	}
	replies, err := c.Run("/ip/hotspot/active/print", words...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		u := &pb.ActiveHotspotUser{
			Id:         r[".id"],
			User:       r["user"],
			Address:    r["address"],
			MacAddress: r["mac-address"],
			Uptime:     r["uptime"],
			BytesIn:    r["bytes-in"],
			BytesOut:   r["bytes-out"],
			PacketsIn:  r["packets-in"],
			PacketsOut: r["packets-out"],
			Server:     r["server"],
		}
		resp.Users = append(resp.Users, u)
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListHotspotUsers(ctx context.Context, req *pb.ListHotspotUsersRequest) (*pb.ListHotspotUsersResponse, error) {
	resp := &pb.ListHotspotUsersResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	words := []string{}
	if req.Profile != "" {
		words = append(words, "?profile="+req.Profile)
	}
	if req.Comment != "" {
		words = append(words, "?comment="+req.Comment)
	}
	replies, err := c.Run("/ip/hotspot/user/print", words...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		u := &pb.HotspotUser{
			Id:          r[".id"],
			Name:        r["name"],
			Password:    r["password"],
			Profile:     r["profile"],
			Comment:     r["comment"],
			LimitUptime: r["limit-uptime"],
			Disabled:    r["disabled"],
		}
		resp.Users = append(resp.Users, u)
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) AddHotspotUser(ctx context.Context, req *pb.AddHotspotUserRequest) (*pb.AddHotspotUserResponse, error) {
	resp := &pb.AddHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	params := []string{
		"=name=" + req.Name,
		"=password=" + req.Password,
		"=profile=" + req.Profile,
	}
	if req.Comment != "" {
		params = append(params, "=comment="+req.Comment)
	}
	if req.LimitUptime != "" {
		params = append(params, "=limit-uptime="+req.LimitUptime)
	}
	if _, err := c.Run("/ip/hotspot/user/add", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) RemoveHotspotUser(ctx context.Context, req *pb.RemoveHotspotUserRequest) (*pb.RemoveHotspotUserResponse, error) {
	resp := &pb.RemoveHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	id := replies[0][".id"]
	if id == "" {
		resp.Success = true
		return resp, nil
	}
	if _, err := c.Run("/ip/hotspot/user/remove", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

// DisableHotspotUser and EnableHotspotUser suspend/restore a customer
// without deleting their voucher — used by payment-service's billing
// overdue-suspension flow. Mirrors DisablePppSecret/EnablePppSecret below.
func (s *RouterServiceServer) DisableHotspotUser(ctx context.Context, req *pb.DisableHotspotUserRequest) (*pb.DisableHotspotUserResponse, error) {
	resp := &pb.DisableHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "hotspot user tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ip/hotspot/user/disable", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) EnableHotspotUser(ctx context.Context, req *pb.EnableHotspotUserRequest) (*pb.EnableHotspotUserResponse, error) {
	resp := &pb.EnableHotspotUserResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "hotspot user tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ip/hotspot/user/enable", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListHotspotProfiles(ctx context.Context, req *pb.ListProfilesRequest) (*pb.ListProfilesResponse, error) {
	resp := &pb.ListProfilesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/profile/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		p := &pb.HotspotProfile{
			Id:             r[".id"],
			Name:           r["name"],
			OnLogin:        r["on-login"],
			SessionTimeout: r["session-timeout"],
			IdleTimeout:    r["idle-timeout"],
			RateLimit:      r["rate-limit"],
			SharedUsers:    r["shared-users"],
			AddressPool:    r["address-pool"],
		}
		resp.Profiles = append(resp.Profiles, p)
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetHotspotProfile(ctx context.Context, req *pb.GetProfileRequest) (*pb.GetProfileResponse, error) {
	resp := &pb.GetProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	r := replies[0]
	resp.Profile = &pb.HotspotProfile{
		Id:             r[".id"],
		Name:           r["name"],
		OnLogin:        r["on-login"],
		SessionTimeout: r["session-timeout"],
		IdleTimeout:    r["idle-timeout"],
		RateLimit:      r["rate-limit"],
		SharedUsers:    r["shared-users"],
		AddressPool:    r["address-pool"],
	}
	resp.Success = true
	return resp, nil
}

// AddHotspotProfile/UpdateHotspotProfile/DeleteHotspotProfile mirror
// AddPppProfile/UpdatePppProfile/DeletePppProfile below exactly — generic
// field passthrough. `on_login` is whatever script text the caller built
// (erp-node-service owns that logic, ported from the monolith's
// buildOnLoginScript); this layer doesn't interpret it.
func (s *RouterServiceServer) AddHotspotProfile(ctx context.Context, req *pb.AddHotspotProfileRequest) (*pb.AddHotspotProfileResponse, error) {
	resp := &pb.AddHotspotProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	params := []string{"=name=" + req.Name}
	if req.OnLogin != "" {
		params = append(params, "=on-login="+req.OnLogin)
	}
	if req.SessionTimeout != "" {
		params = append(params, "=session-timeout="+req.SessionTimeout)
	}
	if req.IdleTimeout != "" {
		params = append(params, "=idle-timeout="+req.IdleTimeout)
	}
	if req.RateLimit != "" {
		params = append(params, "=rate-limit="+req.RateLimit)
	}
	if req.SharedUsers != "" {
		params = append(params, "=shared-users="+req.SharedUsers)
	}
	if req.AddressPool != "" {
		params = append(params, "=address-pool="+req.AddressPool)
	}
	if _, err := c.Run("/ip/hotspot/user/profile/add", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) UpdateHotspotProfile(ctx context.Context, req *pb.UpdateHotspotProfileRequest) (*pb.UpdateHotspotProfileResponse, error) {
	resp := &pb.UpdateHotspotProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "hotspot profile tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	params := []string{"=.id=" + id}
	if req.OnLogin != "" {
		params = append(params, "=on-login="+req.OnLogin)
	}
	if req.SessionTimeout != "" {
		params = append(params, "=session-timeout="+req.SessionTimeout)
	}
	if req.IdleTimeout != "" {
		params = append(params, "=idle-timeout="+req.IdleTimeout)
	}
	if req.RateLimit != "" {
		params = append(params, "=rate-limit="+req.RateLimit)
	}
	if req.SharedUsers != "" {
		params = append(params, "=shared-users="+req.SharedUsers)
	}
	if req.AddressPool != "" {
		params = append(params, "=address-pool="+req.AddressPool)
	}
	if _, err := c.Run("/ip/hotspot/user/profile/set", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DeleteHotspotProfile(ctx context.Context, req *pb.DeleteHotspotProfileRequest) (*pb.DeleteHotspotProfileResponse, error) {
	resp := &pb.DeleteHotspotProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/hotspot/user/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ip/hotspot/user/profile/remove", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

// BulkRemoveHotspotUsers loops RemoveHotspotUser server-side over a single
// dialed connection, so the caller (bulk-delete in the UI) makes one
// round-trip instead of N. Best-effort: one bad name doesn't abort the
// rest — it's collected in failed_names instead.
func (s *RouterServiceServer) BulkRemoveHotspotUsers(ctx context.Context, req *pb.BulkRemoveHotspotUsersRequest) (*pb.BulkRemoveHotspotUsersResponse, error) {
	resp := &pb.BulkRemoveHotspotUsersResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	for _, name := range req.Names {
		replies, err := c.Run("/ip/hotspot/user/print", "?name="+name)
		if err != nil || len(replies) == 0 {
			resp.FailedNames = append(resp.FailedNames, name)
			continue
		}
		id := replies[0][".id"]
		if _, err := c.Run("/ip/hotspot/user/remove", "=.id="+id); err != nil {
			resp.FailedNames = append(resp.FailedNames, name)
			continue
		}
		resp.Removed++
	}
	resp.Success = true
	return resp, nil
}

// SetupExpiryScheduler creates (or re-confirms) the "mikhmon-cleanup-expired"
// scheduler that removes hotspot users whose comment holds an expiry date
// that's passed. The script itself is ported verbatim from the monolith's
// setupExpiryScheduler() — it's fixed/static, no per-call parameters.
func (s *RouterServiceServer) SetupExpiryScheduler(ctx context.Context, req *pb.SetupExpirySchedulerRequest) (*pb.SetupExpirySchedulerResponse, error) {
	resp := &pb.SetupExpirySchedulerResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	const schedulerName = "mikhmon-cleanup-expired"
	const cleanupScript = `{ :local now [/system clock get date]; :if ([:pick $now 4 5] = "-") do={ :local arraybln {"01"="jan";"02"="feb";"03"="mar";"04"="apr";"05"="may";"06"="jun";"07"="jul";"08"="aug";"09"="sep";"10"="oct";"11"="nov";"12"="dec"}; :local tgl [:pick $now 8 10]; :local bulan [:pick $now 5 7]; :local tahun [:pick $now 0 4]; :local bln ($arraybln->$bulan); :set $now ($bln."/".$tgl."/".$tahun); }; :foreach u in=[/ip hotspot user find] do={ :local comment [/ip hotspot user get $u comment]; :local ucode [:pick $comment 0 2]; :if ($ucode != "vc" and $ucode != "up" and $comment != "") do={ :local expDate [:pick $comment 0 11]; :if ($expDate < $now) do={ /ip hotspot user remove $u; }; }; }; }`

	existing, err := c.Run("/system/scheduler/print", "?name="+schedulerName)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(existing) > 0 {
		if _, err := c.Run("/system/scheduler/set", "=.id="+existing[0][".id"], "=on-event="+cleanupScript); err != nil {
			resp.Error = err.Error()
			return resp, nil
		}
	} else {
		_, err := c.Run("/system/scheduler/add",
			"=name="+schedulerName,
			"=interval=2h",
			"=start-time=00:00:00",
			"=on-event="+cleanupScript,
			"=comment=mikhmon-auto-cleanup",
			"=disabled=no",
		)
		if err != nil {
			resp.Error = err.Error()
			return resp, nil
		}
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetSystemResource(ctx context.Context, req *pb.SystemResourceRequest) (*pb.SystemResourceResponse, error) {
	resp := &pb.SystemResourceResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/system/resource/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) > 0 {
		r := replies[0]
		resp.Version = r["version"]
		resp.Uptime = r["uptime"]
		resp.CpuLoad = r["cpu-load"]
		resp.FreeMemory = r["free-memory"]
		resp.TotalMemory = r["total-memory"]
		resp.FreeHdd = r["free-hdd-space"]
		resp.TotalHdd = r["total-hdd-space"]
		resp.RosVersion = r["version"]
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetInterfaces(ctx context.Context, req *pb.InterfacesRequest) (*pb.InterfacesResponse, error) {
	resp := &pb.InterfacesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/interface/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		tx := r["tx-byte"]
		rx := r["rx-byte"]
		if tx == "" {
			tx = r["tx"]
		}
		if rx == "" {
			rx = r["rx"]
		}
		iface := &pb.InterfaceInfo{
			Id:         r[".id"],
			Name:       r["name"],
			Type:       r["type"],
			MacAddress: r["mac-address"],
			Tx:         tx,
			Rx:         rx,
			Running:    r["running"],
		}
		resp.Interfaces = append(resp.Interfaces, iface)
	}
	resp.Success = true
	return resp, nil
}

// ── Router sessions (CRUD) ──────────────────────────────────────────

func toSessionInfo(rs *store.RouterSession) *pb.RouterSessionInfo {
	return &pb.RouterSessionInfo{
		Id:             rs.ID,
		Name:           rs.Name,
		Ip:             rs.IP,
		Port:           int32(rs.Port),
		User:           rs.User,
		HotspotName:    rs.HotspotName,
		DnsName:        rs.DNSName,
		Currency:       rs.Currency,
		ReloadInterval: int32(rs.ReloadInterval),
		Iface:          rs.Iface,
		IdleTo:         int32(rs.IdleTo),
		Livereport:     rs.Livereport,
	}
}

func (s *RouterServiceServer) ListSessions(ctx context.Context, req *pb.ListSessionsRequest) (*pb.ListSessionsResponse, error) {
	sessions, err := s.store.List(ctx)
	if err != nil {
		return &pb.ListSessionsResponse{Success: false, Error: err.Error()}, nil
	}
	resp := &pb.ListSessionsResponse{Success: true}
	for i := range sessions {
		resp.Sessions = append(resp.Sessions, toSessionInfo(&sessions[i]))
	}
	return resp, nil
}

func (s *RouterServiceServer) GetSession(ctx context.Context, req *pb.GetSessionRequest) (*pb.GetSessionResponse, error) {
	if strings.TrimSpace(req.Id) == "" {
		return &pb.GetSessionResponse{Success: false, Error: "id wajib diisi"}, nil
	}
	rs, err := s.store.Get(ctx, req.Id)
	if err != nil {
		return &pb.GetSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
	}
	return &pb.GetSessionResponse{Success: true, Session: toSessionInfo(rs)}, nil
}

func (s *RouterServiceServer) CreateSession(ctx context.Context, req *pb.CreateSessionRequest) (*pb.CreateSessionResponse, error) {
	if strings.TrimSpace(req.Id) == "" || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Ip) == "" {
		return &pb.CreateSessionResponse{Success: false, Error: "id, name, dan ip wajib diisi"}, nil
	}
	if strings.TrimSpace(req.Password) == "" {
		return &pb.CreateSessionResponse{Success: false, Error: "password wajib diisi"}, nil
	}
	if exists, err := s.store.Exists(ctx, req.Id); err != nil {
		return &pb.CreateSessionResponse{Success: false, Error: err.Error()}, nil
	} else if exists {
		return &pb.CreateSessionResponse{Success: false, Error: "session id sudah digunakan"}, nil
	}

	rs := store.RouterSession{
		ID: req.Id, Name: req.Name, IP: req.Ip, Port: int(orDefaultPort(req.Port)),
		User: orDefault(req.User, "admin"), Password: req.Password,
		HotspotName: req.HotspotName, DNSName: req.DnsName,
		Currency: orDefault(req.Currency, "Rp"), ReloadInterval: orDefaultInt(int(req.ReloadInterval), 10),
		Iface: orDefault(req.Iface, "ether1"), IdleTo: int(req.IdleTo),
		Livereport: orDefault(req.Livereport, "enable"),
	}
	if err := s.store.Create(ctx, rs); err != nil {
		return &pb.CreateSessionResponse{Success: false, Error: err.Error()}, nil
	}
	return &pb.CreateSessionResponse{Success: true, Session: toSessionInfo(&rs)}, nil
}

func (s *RouterServiceServer) UpdateSession(ctx context.Context, req *pb.UpdateSessionRequest) (*pb.UpdateSessionResponse, error) {
	if strings.TrimSpace(req.Id) == "" {
		return &pb.UpdateSessionResponse{Success: false, Error: "id wajib diisi"}, nil
	}
	existing, err := s.store.Get(ctx, req.Id)
	if err != nil {
		return &pb.UpdateSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
	}

	password := existing.Password
	// Sentinel "***" (sent by the UI when the password field is left blank
	// on edit) or an empty string both mean "keep the existing password".
	if req.Password != "" && req.Password != "***" {
		password = req.Password
	}

	rs := store.RouterSession{
		ID:             req.Id,
		Name:           orDefault(req.Name, existing.Name),
		IP:             orDefault(req.Ip, existing.IP),
		Port:           int(orDefaultPortExisting(req.Port, existing.Port)),
		User:           orDefault(req.User, existing.User),
		Password:       password,
		HotspotName:    orDefault(req.HotspotName, existing.HotspotName),
		DNSName:        orDefault(req.DnsName, existing.DNSName),
		Currency:       orDefault(req.Currency, existing.Currency),
		ReloadInterval: int(orDefaultIntExisting(req.ReloadInterval, existing.ReloadInterval)),
		Iface:          orDefault(req.Iface, existing.Iface),
		IdleTo:         int(req.IdleTo),
		Livereport:     orDefault(req.Livereport, existing.Livereport),
	}
	if ok, err := s.store.Update(ctx, rs); err != nil {
		return &pb.UpdateSessionResponse{Success: false, Error: err.Error()}, nil
	} else if !ok {
		return &pb.UpdateSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
	}
	return &pb.UpdateSessionResponse{Success: true, Session: toSessionInfo(&rs)}, nil
}

func (s *RouterServiceServer) DeleteSession(ctx context.Context, req *pb.DeleteSessionRequest) (*pb.DeleteSessionResponse, error) {
	if strings.TrimSpace(req.Id) == "" {
		return &pb.DeleteSessionResponse{Success: false, Error: "id wajib diisi"}, nil
	}
	ok, err := s.store.Delete(ctx, req.Id)
	if err != nil {
		return &pb.DeleteSessionResponse{Success: false, Error: err.Error()}, nil
	}
	if !ok {
		return &pb.DeleteSessionResponse{Success: false, Error: "router session tidak ditemukan"}, nil
	}
	return &pb.DeleteSessionResponse{Success: true}, nil
}

// ── PPPoE secrets ──────────────────────────────────────────────────

func (s *RouterServiceServer) ListPppSecrets(ctx context.Context, req *pb.ListPppSecretsRequest) (*pb.ListPppSecretsResponse, error) {
	resp := &pb.ListPppSecretsResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	words := []string{}
	if req.Profile != "" {
		words = append(words, "?profile="+req.Profile)
	}
	if req.Name != "" {
		words = append(words, "?name="+req.Name)
	}
	replies, err := c.Run("/ppp/secret/print", words...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		resp.Secrets = append(resp.Secrets, &pb.PppSecret{
			Id:            r[".id"],
			Name:          r["name"],
			Password:      r["password"],
			Service:       r["service"],
			Profile:       r["profile"],
			LocalAddress:  r["local-address"],
			RemoteAddress: r["remote-address"],
			Comment:       r["comment"],
			Disabled:      r["disabled"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetPppSecret(ctx context.Context, req *pb.GetPppSecretRequest) (*pb.GetPppSecretResponse, error) {
	resp := &pb.GetPppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/secret/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	r := replies[0]
	resp.Secret = &pb.PppSecret{
		Id:            r[".id"],
		Name:          r["name"],
		Password:      r["password"],
		Service:       r["service"],
		Profile:       r["profile"],
		LocalAddress:  r["local-address"],
		RemoteAddress: r["remote-address"],
		Comment:       r["comment"],
		Disabled:      r["disabled"],
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) AddPppSecret(ctx context.Context, req *pb.AddPppSecretRequest) (*pb.AddPppSecretResponse, error) {
	resp := &pb.AddPppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	params := []string{"=name=" + req.Name, "=password=" + req.Password}
	if req.Service != "" {
		params = append(params, "=service="+req.Service)
	}
	if req.Profile != "" {
		params = append(params, "=profile="+req.Profile)
	}
	if req.LocalAddress != "" {
		params = append(params, "=local-address="+req.LocalAddress)
	}
	if req.RemoteAddress != "" {
		params = append(params, "=remote-address="+req.RemoteAddress)
	}
	if req.Comment != "" {
		params = append(params, "=comment="+req.Comment)
	}
	if _, err := c.Run("/ppp/secret/add", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) UpdatePppSecret(ctx context.Context, req *pb.UpdatePppSecretRequest) (*pb.UpdatePppSecretResponse, error) {
	resp := &pb.UpdatePppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/secret/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "ppp secret tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	params := []string{"=.id=" + id}
	if req.Password != "" {
		params = append(params, "=password="+req.Password)
	}
	if req.Service != "" {
		params = append(params, "=service="+req.Service)
	}
	if req.Profile != "" {
		params = append(params, "=profile="+req.Profile)
	}
	if req.LocalAddress != "" {
		params = append(params, "=local-address="+req.LocalAddress)
	}
	if req.RemoteAddress != "" {
		params = append(params, "=remote-address="+req.RemoteAddress)
	}
	if req.Comment != "" {
		params = append(params, "=comment="+req.Comment)
	}
	if _, err := c.Run("/ppp/secret/set", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DeletePppSecret(ctx context.Context, req *pb.DeletePppSecretRequest) (*pb.DeletePppSecretResponse, error) {
	resp := &pb.DeletePppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/secret/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ppp/secret/remove", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) EnablePppSecret(ctx context.Context, req *pb.EnablePppSecretRequest) (*pb.EnablePppSecretResponse, error) {
	resp := &pb.EnablePppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/secret/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "ppp secret tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ppp/secret/enable", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DisablePppSecret(ctx context.Context, req *pb.DisablePppSecretRequest) (*pb.DisablePppSecretResponse, error) {
	resp := &pb.DisablePppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/secret/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "ppp secret tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ppp/secret/disable", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

// ── PPPoE profiles ─────────────────────────────────────────────────

func (s *RouterServiceServer) ListPppProfiles(ctx context.Context, req *pb.ListPppProfilesRequest) (*pb.ListPppProfilesResponse, error) {
	resp := &pb.ListPppProfilesResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/profile/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		resp.Profiles = append(resp.Profiles, &pb.PppProfile{
			Id:            r[".id"],
			Name:          r["name"],
			LocalAddress:  r["local-address"],
			RemoteAddress: r["remote-address"],
			Dns:           r["dns-server"],
			RateLimit:     r["rate-limit"],
			Bridge:        r["bridge"],
			OnlyOne:       r["only-one"],
			ChangeTcpMss:  r["change-tcp-mss"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) AddPppProfile(ctx context.Context, req *pb.AddPppProfileRequest) (*pb.AddPppProfileResponse, error) {
	resp := &pb.AddPppProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	params := []string{"=name=" + req.Name}
	if req.LocalAddress != "" {
		params = append(params, "=local-address="+req.LocalAddress)
	}
	if req.RemoteAddress != "" {
		params = append(params, "=remote-address="+req.RemoteAddress)
	}
	if req.Dns != "" {
		params = append(params, "=dns-server="+req.Dns)
	}
	if req.RateLimit != "" {
		params = append(params, "=rate-limit="+req.RateLimit)
	}
	if req.Bridge != "" {
		params = append(params, "=bridge="+req.Bridge)
	}
	if req.OnlyOne != "" {
		params = append(params, "=only-one="+req.OnlyOne)
	}
	if req.ChangeTcpMss != "" {
		params = append(params, "=change-tcp-mss="+req.ChangeTcpMss)
	}
	if _, err := c.Run("/ppp/profile/add", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) UpdatePppProfile(ctx context.Context, req *pb.UpdatePppProfileRequest) (*pb.UpdatePppProfileResponse, error) {
	resp := &pb.UpdatePppProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Error = "ppp profile tidak ditemukan"
		return resp, nil
	}
	id := replies[0][".id"]
	params := []string{"=.id=" + id}
	if req.LocalAddress != "" {
		params = append(params, "=local-address="+req.LocalAddress)
	}
	if req.RemoteAddress != "" {
		params = append(params, "=remote-address="+req.RemoteAddress)
	}
	if req.Dns != "" {
		params = append(params, "=dns-server="+req.Dns)
	}
	if req.RateLimit != "" {
		params = append(params, "=rate-limit="+req.RateLimit)
	}
	if req.Bridge != "" {
		params = append(params, "=bridge="+req.Bridge)
	}
	if req.OnlyOne != "" {
		params = append(params, "=only-one="+req.OnlyOne)
	}
	if req.ChangeTcpMss != "" {
		params = append(params, "=change-tcp-mss="+req.ChangeTcpMss)
	}
	if _, err := c.Run("/ppp/profile/set", params...); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DeletePppProfile(ctx context.Context, req *pb.DeletePppProfileRequest) (*pb.DeletePppProfileResponse, error) {
	resp := &pb.DeletePppProfileResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/profile/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ppp/profile/remove", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

// ── PPPoE active & pools ───────────────────────────────────────────

func (s *RouterServiceServer) ListPppActive(ctx context.Context, req *pb.ListPppActiveRequest) (*pb.ListPppActiveResponse, error) {
	resp := &pb.ListPppActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/active/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		resp.Connections = append(resp.Connections, &pb.PppActive{
			Id:       r[".id"],
			Name:     r["name"],
			Service:  r["service"],
			CallId:   r["caller-id"],
			Address:  r["address"],
			Uptime:   r["uptime"],
			BytesIn:  r["bytes-in"],
			BytesOut: r["bytes-out"],
			Profile:  r["profile"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) DisconnectPppActive(ctx context.Context, req *pb.DisconnectPppActiveRequest) (*pb.DisconnectPppActiveResponse, error) {
	resp := &pb.DisconnectPppActiveResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ppp/active/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(replies) == 0 {
		resp.Success = true
		return resp, nil
	}
	id := replies[0][".id"]
	if _, err := c.Run("/ppp/active/remove", "=.id="+id); err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) ListPppPools(ctx context.Context, req *pb.ListPppPoolsRequest) (*pb.ListPppPoolsResponse, error) {
	resp := &pb.ListPppPoolsResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	replies, err := c.Run("/ip/pool/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range replies {
		resp.Pools = append(resp.Pools, &pb.PppPool{
			Id:       r[".id"],
			Name:     r["name"],
			Ranges:   r["ranges"],
			NextPool: r["next-pool"],
		})
	}
	resp.Success = true
	return resp, nil
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

func orDefaultPort(v int32) int32 {
	if v == 0 {
		return 8728
	}
	return v
}

func orDefaultPortExisting(v int32, existing int) int32 {
	if v == 0 {
		return int32(existing)
	}
	return v
}

func orDefaultInt(v, def int) int {
	if v == 0 {
		return def
	}
	return v
}

func orDefaultIntExisting(v int32, existing int) int32 {
	if v == 0 {
		return int32(existing)
	}
	return v
}
