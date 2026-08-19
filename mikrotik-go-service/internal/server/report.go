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
	if req == nil || strings.TrimSpace(req.SessionId) == "" {
		resp.Error = "session id wajib diisi"
		return resp, nil
	}

	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	// The live report sends idbl (current month) and does not need ROS
	// version detection. Only the historical idhr path needs the RouterOS 6
	// compatibility check.
	isROS7 := true
	if req.Idhr != "" {
		versionRows, versionErr := c.Run("/system/resource/print", "=.proplist=version")
		if versionErr != nil {
			resp.Error = versionErr.Error()
			return resp, nil
		}
		if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") {
			isROS7 = false
		}
	}

	rows, err := s.getSellingRows(c, isROS7, req.Idhr, req.Idbl)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}

	for _, row := range rows {
		select {
		case <-ctx.Done():
			resp.Error = ctx.Err().Error()
			return resp, nil
		default:
		}

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

// scriptProplist limits RouterOS replies to the fields actually consumed by
// the report path. This is especially important for the live month query,
// where /system/script can contain many records with large descriptions or
// other metadata that the report never uses.
const scriptProplist = "=.proplist=.id,name"

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
			rows, err = c.Run("/system/script/print", "?owner="+monthOwner, scriptProplist)
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
		return c.Run("/system/script/print", "?source="+idhr, scriptProplist)
	}

	// Live report path: idbl is already the current month owner (e.g.
	// aug2026), so do not perform any additional RouterOS resource/version
	// query. Keep the single owner-filtered script query for both ROS6/ROS7
	// compatibility with the existing monolith data layout, while limiting
	// each response record to the id and name fields the report consumes.
	if idbl != "" {
		return c.Run("/system/script/print", "?owner="+idbl, scriptProplist)
	}

	now := time.Now()
	months := [...]string{"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
	monthOwner := months[now.Month()-1] + strconv.Itoa(now.Year())
	if isROS7 {
		return c.Run("/system/script/print", "?owner="+monthOwner, scriptProplist)
	}
	return c.Run("/system/script/print", "?comment=mikhmon", scriptProplist)
}

type reportError struct{ message string }

func (e *reportError) Error() string { return e.message }

func valueAt(parts []string, index int) string {
	if index < 0 || index >= len(parts) {
		return ""
	}
	return parts[index]
}
