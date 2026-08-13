package server

import (
	"context"
	"strings"
	"time"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

// ReportRouterServiceServer provides report-script access without changing the
// existing RouterService protobuf contract. The ERP report path uses the
// existing ListHotspotUsers/RemoveHotspotUser RPCs with an internal marker.
// This keeps rolling deployments compatible until the dedicated
// ListSellingScripts RPC is generated everywhere.
type ReportRouterServiceServer struct {
	*RouterServiceServer
}

const reportScriptsMarker = "__REPORT_SCRIPTS__"
const reportDeleteMarker = "__REPORT_DELETE__"

func NewReportRouterServiceServer(base *RouterServiceServer) *ReportRouterServiceServer {
	return &ReportRouterServiceServer{RouterServiceServer: base}
}

func parseReportMarker(value string) (idhr, idbl string, ok bool) {
	if !strings.HasPrefix(value, reportScriptsMarker) {
		return "", "", false
	}
	for _, part := range strings.Split(value, "|")[1:] {
		if strings.HasPrefix(part, "idhr=") {
			idhr = strings.TrimPrefix(part, "idhr=")
		}
		if strings.HasPrefix(part, "idbl=") {
			idbl = strings.TrimPrefix(part, "idbl=")
		}
	}
	return idhr, idbl, true
}

func (s *ReportRouterServiceServer) sellingScripts(ctx context.Context, sessionID, marker string) ([]map[string]string, error) {
	idhr, idbl, ok := parseReportMarker(marker)
	if !ok {
		return nil, nil
	}

	c, err := s.dial(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	defer c.Close()

	resource, err := c.Run("/system/resource/print")
	if err != nil {
		return nil, err
	}
	ros7 := true
	if len(resource) > 0 && strings.HasPrefix(resource[0]["version"], "6") {
		ros7 = false
	}

	toMaps := func(rows []map[string]string) []map[string]string {
		return rows
	}
	_ = toMaps

	if idhr != "" {
		parts := strings.Split(idhr, "/")
		if len(parts) >= 3 {
			idbl = parts[0] + parts[2]
		}
		if ros7 {
			rows, err := c.Run("/system/script/print", "?owner="+idbl)
			if err != nil {
				return nil, err
			}
			filtered := make([]map[string]string, 0, len(rows))
			for _, row := range rows {
				name := row["name"]
				date := name
				if i := strings.Index(name, "-|-"); i >= 0 {
					date = name[:i]
				}
				if date == idhr {
					filtered = append(filtered, map[string]string(row))
				}
			}
			return filtered, nil
		}
		rows, err := c.Run("/system/script/print", "?source="+idhr)
		if err != nil {
			return nil, err
		}
		filtered := make([]map[string]string, 0, len(rows))
		for _, row := range rows {
			filtered = append(filtered, map[string]string(row))
		}
		return filtered, nil
	}

	if idbl != "" {
		rows, err := c.Run("/system/script/print", "?owner="+idbl)
		if err != nil {
			return nil, err
		}
		filtered := make([]map[string]string, 0, len(rows))
		for _, row := range rows {
			filtered = append(filtered, map[string]string(row))
		}
		return filtered, nil
	}

	now := time.Now()
	months := [...]string{"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
	idbl = months[now.Month()-1] + formatYear(now.Year())
	if ros7 {
		rows, err := c.Run("/system/script/print", "?owner="+idbl)
		if err != nil {
			return nil, err
		}
		filtered := make([]map[string]string, 0, len(rows))
		for _, row := range rows {
			filtered = append(filtered, map[string]string(row))
		}
		return filtered, nil
	}
	rows, err := c.Run("/system/script/print", "?comment=mikhmon")
	if err != nil {
		return nil, err
	}
	filtered := make([]map[string]string, 0, len(rows))
	for _, row := range rows {
		filtered = append(filtered, map[string]string(row))
	}
	return filtered, nil
}

func formatYear(year int) string {
	return string([]byte{byte('0' + (year/1000)%10), byte('0' + (year/100)%10), byte('0' + (year/10)%10), byte('0' + year%10)})
}

func (s *ReportRouterServiceServer) ListHotspotUsers(ctx context.Context, req *pb.ListHotspotUsersRequest) (*pb.ListHotspotUsersResponse, error) {
	if !strings.HasPrefix(req.Profile, reportScriptsMarker) {
		return s.RouterServiceServer.ListHotspotUsers(ctx, req)
	}

	rows, err := s.sellingScripts(ctx, req.SessionId, req.Profile)
	resp := &pb.ListHotspotUsersResponse{}
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, row := range rows {
		resp.Users = append(resp.Users, &pb.HotspotUser{
			Id:      row[".id"],
			Name:    row["name"],
			Profile: row["owner"],
			Comment: row["comment"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *ReportRouterServiceServer) RemoveHotspotUser(ctx context.Context, req *pb.RemoveHotspotUserRequest) (*pb.RemoveHotspotUserResponse, error) {
	if !strings.HasPrefix(req.Name, reportDeleteMarker) {
		return s.RouterServiceServer.RemoveHotspotUser(ctx, req)
	}

	marker := strings.TrimPrefix(req.Name, reportDeleteMarker)
	rows, err := s.sellingScripts(ctx, req.SessionId, reportScriptsMarker+marker)
	resp := &pb.RemoveHotspotUserResponse{}
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}

	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	for _, row := range rows {
		if id := row[".id"]; id != "" {
			if _, err := c.Run("/system/script/remove", "=.id="+id); err != nil {
				resp.Error = err.Error()
				return resp, nil
			}
		}
	}
	resp.Success = true
	return resp, nil
}
