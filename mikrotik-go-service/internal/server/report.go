package server

import (
	"context"
	"strconv"
	"strings"
	"time"

	"github.com/mikhmon/mikrotik-go-service/internal/mikrotik"
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
	if len(versionRows) > 0 {
		version := versionRows[0]["version"]
		if len(version) > 0 {
			rosVersion = version[:1]
		}
	}
	isROS7 := rosVersion != "6"

	rows, err := s.getSellingRows(c, isROS7, req.Idhr, req.Idbl)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
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

func (s *RouterServiceServer) getSellingRows(c interface{ Run(string, ...string) ([]mikrotik.Sentence, error) }, isROS7 bool, idhr, idbl string) ([]mikrotik.Sentence, error) {
	var rows []mikrotik.Sentence
	var err error

	if idhr != "" {
		parts := strings.Split(idhr, "/")
		if len(parts) != 3 {
			return nil, &reportError{"invalid idhr format"}
		}
		monthOwner := parts[0] + parts[2]
		if isROS7 {
			rows, err = c.Run("/system/script/print", "?owner="+monthOwner)
			if err != nil {
				return nil, err
			}
			filtered := rows[:0]
			for _, row := range rows {
				if strings.HasPrefix(row["name"], idhr+"-|-") {
					filtered = append(filtered, row)
				}
			}
			return filtered, nil
		}
		return c.Run("/system/script/print", "?source="+idhr)
	}

	if idbl != "" {
		return c.Run("/system/script/print", "?owner="+idbl)
	}

	now := time.Now()
	months := [...]string{"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
	monthOwner := months[now.Month()-1] + strconv.Itoa(now.Year())
	if isROS7 {
		return c.Run("/system/script/print", "?owner="+monthOwner)
	}
	return c.Run("/system/script/print", "?comment=mikhmon")
}

type reportError struct{ message string }

func (e *reportError) Error() string { return e.message }

func valueAt(parts []string, index int) string {
	if index < 0 || index >= len(parts) {
		return ""
	}
	return parts[index]
}
