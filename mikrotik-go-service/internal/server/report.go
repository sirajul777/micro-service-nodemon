package server

import (
	"context"
	"strconv"
	"strings"
	"time"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

// ListSellingScripts reads selling records directly from MikroTik
// /system/script/print, matching the monolith's report source.
func (s *RouterServiceServer) ListSellingScripts(ctx context.Context, req *pb.ListSellingScriptsRequest) (*pb.ListSellingScriptsResponse, error) {
	resp := &pb.ListSellingScriptsResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	versionRows, err := c.Run("/system/resource/print")
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	rosVersion := "7"
	if len(versionRows) > 0 && versionRows[0]["version"] != "" {
		rosVersion = versionRows[0]["version"][:1]
	}
	isROS7 := rosVersion != "6"

	var rows []map[string]string
	if req.Idhr != "" {
		parts := strings.Split(req.Idhr, "/")
		if len(parts) != 3 {
			resp.Error = "invalid idhr format"
			return resp, nil
		}
		idbl := parts[0] + parts[2]
		if isROS7 {
			rows, err = c.Run("/system/script/print", "?owner="+idbl)
		} else {
			rows, err = c.Run("/system/script/print", "?source="+req.Idhr)
		}
		if err != nil {
			resp.Error = err.Error()
			return resp, nil
		}
		if isROS7 {
			filtered := rows[:0]
			for _, row := range rows {
				if strings.HasPrefix(row["name"], req.Idhr+"-|-") {
					filtered = append(filtered, row)
				}
			}
			rows = filtered
		}
	} else if req.Idbl != "" {
		rows, err = c.Run("/system/script/print", "?owner="+req.Idbl)
		if err != nil {
			resp.Error = err.Error()
			return resp, nil
		}
	} else {
		now := time.Now()
		months := [...]string{"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
		idbl := months[now.Month()-1] + strconv.Itoa(now.Year())
		if isROS7 {
			rows, err = c.Run("/system/script/print", "?owner="+idbl)
		} else {
			rows, err = c.Run("/system/script/print", "?comment=mikhmon")
		}
		if err != nil {
			resp.Error = err.Error()
			return resp, nil
		}
	}

	for _, row := range rows {
		parts := strings.Split(row["name"], "-|-")
		price := 0.0
		if len(parts) > 3 {
			price, _ = strconv.ParseFloat(parts[3], 64)
		}
		resp.Scripts = append(resp.Scripts, &pb.SellingScript{
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

func valueAt(parts []string, index int) string {
	if index < 0 || index >= len(parts) {
		return ""
	}
	return parts[index]
}
