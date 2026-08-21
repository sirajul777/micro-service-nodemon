package server

import (
	"context"
	"strconv"
	"strings"

	reportpb "github.com/mikhmon/mikrotik-go-service/proto/reportproto"
)

// ReportRouterService exposes report-specific RouterOS data without coupling
// the report path to the large RouterService protobuf contract.
type ReportRouterService struct {
	reportpb.UnimplementedReportRouterServiceServer
	router *RouterServiceServer
}

func NewReportRouterService(router *RouterServiceServer) *ReportRouterService {
	return &ReportRouterService{router: router}
}

func (s *ReportRouterService) ListSellingScripts(ctx context.Context, req *reportpb.ListSellingScriptsRequest) (*reportpb.ListSellingScriptsResponse, error) {
	resp := &reportpb.ListSellingScriptsResponse{}
	if req == nil || strings.TrimSpace(req.SessionId) == "" {
		resp.Error = "session id wajib diisi"
		return resp, nil
	}

	c, err := s.router.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	isROS7 := true
	if req.Idhr != "" {
		versionRows, versionErr := c.RunContext(ctx, "/system/resource/print")
		if versionErr != nil {
			resp.Error = versionErr.Error()
			return resp, nil
		}
		if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") {
			isROS7 = false
		}
	}

	rows, err := s.router.getSellingRows(ctx, c, isROS7, req.Idhr, req.Idbl)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}

	for _, row := range rows {
		parts := strings.Split(row["name"], "- |-")
		if len(parts) < 4 {
			parts = strings.Split(row["name"], "-|-")
		}
		if len(parts) < 4 {
			continue
		}
		price, _ := strconv.ParseFloat(parts[3], 64)
		resp.Scripts = append(resp.Scripts, &reportpb.SellingScript{
			Id:       row[".id"],
			Date:     valueAt(parts, 0),
			Time:     valueAt(parts, 1),
			Username: valueAt(parts, 2),
			Price:    price,
			Profile:  valueAt(parts, 7),
			Comment:  valueAt(parts, 8),
		})
	}

	resp.Success = true
	return resp, nil
}
