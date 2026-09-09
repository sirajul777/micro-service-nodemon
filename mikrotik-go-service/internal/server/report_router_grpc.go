package server

import (
	"context"
	"strconv"
	"strings"
	"time"

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
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	isROS7 := true
	if req.Idhr != "" {
		versionRows, versionErr := c.RunContext(ctx, "/system/resource/print")
		if versionErr != nil { resp.Error = versionErr.Error(); return resp, nil }
		if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") { isROS7 = false }
	}
	rows, err := s.router.getSellingRows(ctx, c, isROS7, req.Idhr, req.Idbl)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	for _, row := range rows {
		parts := strings.Split(row["name"], "- |-")
		if len(parts) < 4 { parts = strings.Split(row["name"], "-|-") }
		if len(parts) < 4 { continue }
		price, _ := strconv.ParseFloat(parts[3], 64)
		resp.Scripts = append(resp.Scripts, &reportpb.SellingScript{Id: row[".id"], Date: valueAt(parts, 0), Time: valueAt(parts, 1), Username: valueAt(parts, 2), Price: price, Profile: valueAt(parts, 7), Comment: valueAt(parts, 8)})
	}
	resp.Success = true
	return resp, nil
}

func (s *ReportRouterService) GetResumeReport(ctx context.Context, req *reportpb.GetResumeReportRequest) (*reportpb.GetResumeReportResponse, error) {
	resp := &reportpb.GetResumeReportResponse{}
	if req == nil || strings.TrimSpace(req.SessionId) == "" { resp.Error = "session id wajib diisi"; return resp, nil }
	monthId := strings.TrimSpace(req.Idbl)
	if monthId == "" { now := time.Now(); months := [...]string{"jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"}; monthId = months[now.Month()-1] + strconv.Itoa(now.Year()) }
	c, err := s.router.dial(ctx, req.SessionId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	defer c.Close()
	isROS7 := true
	versionRows, versionErr := c.RunContext(ctx, "/system/resource/print")
	if versionErr != nil { resp.Error = versionErr.Error(); return resp, nil }
	if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") { isROS7 = false }
	rows, err := s.router.getSellingRows(ctx, c, isROS7, "", monthId)
	if err != nil { resp.Error = err.Error(); return resp, nil }
	mm := strings.ToLower(monthId[:minReportInt(3, len(monthId))]); year := ""
	if len(monthId) > 3 { year = monthId[3:] }
	monthNums := map[string]int{"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
	monthNum := monthNums[mm]; if monthNum == 0 { monthNum = int(time.Now().Month()) }
	yearNum, parseErr := strconv.Atoi(year); if parseErr != nil || yearNum < 1 { yearNum = time.Now().Year(); year = strconv.Itoa(yearNum) }
	daysInMonth := time.Date(yearNum, time.Month(monthNum)+1, 0, 0, 0, 0, 0, time.Local).Day(); maxDay := daysInMonth
	now := time.Now(); if yearNum == now.Year() && monthNum == int(now.Month()) { maxDay = now.Day() }
	daily := make(map[string]*reportpb.ResumeDaily, maxDay)
	for day := 1; day <= maxDay; day++ { daily[strings.ToLower(mm)+"/"+strconv.Itoa(day)+"/"+strconv.Itoa(yearNum)] = &reportpb.ResumeDaily{Date: strconv.Itoa(day)} }
	for _, row := range rows {
		nameParts := strings.Split(row["name"], "- |-"); if len(nameParts) < 4 { nameParts = strings.Split(row["name"], "-|-" ) }; if len(nameParts) < 4 { continue }
		price, _ := strconv.ParseFloat(nameParts[3], 64); entry, ok := daily[normalizeReportDate(valueAt(nameParts, 0))]; if !ok { continue }; entry.Vouchers++; entry.Total += price
	}
	for day := 1; day <= maxDay; day++ { resp.Daily = append(resp.Daily, daily[strings.ToLower(mm)+"/"+strconv.Itoa(day)+"/"+strconv.Itoa(yearNum)]) }
	resp.TotalVouchers = int32(len(rows)); for _, row := range resp.Daily { resp.TotalIncome += row.Total }; resp.Currency = "Rp"; resp.IsIndo = true; resp.Month = mm; resp.Year = year; resp.Success = true
	return resp, nil
}

func normalizeReportDate(value string) string { parts := strings.Split(strings.TrimSpace(value), "/"); if len(parts) != 3 { return "" }; return strings.ToLower(parts[0]) + "/" + strings.TrimLeft(parts[1], "0") + "/" + parts[2] }
func minReportInt(a, b int) int { if a < b { return a }; return b }
