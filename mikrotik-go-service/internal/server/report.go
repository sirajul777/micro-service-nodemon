package server

import (
	"context"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/mikhmon/mikrotik-go-service/internal/mikrotik"
	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

const (
	scriptProplist     = "=.proplist=.id,name"
	liveReportCacheTTL = 10 * time.Second
)

type liveReportCacheEntry struct {
	rows      []mikrotik.Sentence
	expiresAt time.Time
}

var liveReportCache sync.Map

// ListSellingScripts reads selling records directly from MikroTik
// /system/script/print, matching the monolith's report source.
func (s *RouterServiceServer) ListSellingScripts(ctx context.Context, req *pb.ListSellingScriptsRequest) (*pb.ListSellingScriptsResponse, error) {
	resp := &pb.ListSellingScriptsResponse{}
	if req == nil || strings.TrimSpace(req.SessionId) == "" {
		resp.Error = "session id wajib diisi"
		return resp, nil
	}

	requestStarted := time.Now()

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
		versionRows, versionErr := c.Run("/system/resource/print")
		if versionErr != nil {
			resp.Error = versionErr.Error()
			return resp, nil
		}
		if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") {
			isROS7 = false
		}
	}

	cacheKey := reportCacheKey(req.SessionId, req.Idhr, req.Idbl, isROS7)
	rows, ok := getLiveReportCache(cacheKey)
	cacheState := "miss"
	queryStarted := time.Now()
	if ok {
		cacheState = "hit"
	} else {
		rows, err = s.getSellingRows(c, isROS7, req.Idhr, req.Idbl)
		if err != nil {
			resp.Error = err.Error()
			return resp, nil
		}
		if req.Idbl != "" {
			setLiveReportCache(cacheKey, rows)
		}
	}
	queryDuration := time.Since(queryStarted)

	parseStarted := time.Now()
	for _, row := range rows {
		select {
		case <-ctx.Done():
			resp.Error = ctx.Err().Error()
			return resp, nil
		default:
		}

		parts := strings.Split(row["name"], "-|-")
		if len(parts) < 4 {
			continue
		}
		price, _ := strconv.ParseFloat(parts[3], 64)
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
	parseDuration := time.Since(parseStarted)

	log.Printf("[report] session=%s idbl=%s idhr=%s cache=%s rows=%d parsed=%d query_ms=%d parse_ms=%d total_ms=%d",
		req.SessionId,
		req.Idbl,
		req.Idhr,
		cacheState,
		len(rows),
		len(resp.Scripts),
		queryDuration.Milliseconds(),
		parseDuration.Milliseconds(),
		time.Since(requestStarted).Milliseconds(),
	)

	resp.Success = true
	return resp, nil
}

func reportCacheKey(sessionId, idhr, idbl string, isROS7 bool) string {
	return strings.Join([]string{sessionId, idhr, idbl, strconv.FormatBool(isROS7)}, "|")
}

func getLiveReportCache(key string) ([]mikrotik.Sentence, bool) {
	value, ok := liveReportCache.Load(key)
	if !ok {
		return nil, false
	}
	entry, ok := value.(liveReportCacheEntry)
	if !ok || time.Now().After(entry.expiresAt) {
		liveReportCache.Delete(key)
		return nil, false
	}
	return entry.rows, true
}

func setLiveReportCache(key string, rows []mikrotik.Sentence) {
	liveReportCache.Store(key, liveReportCacheEntry{
		rows:      rows,
		expiresAt: time.Now().Add(liveReportCacheTTL),
	})
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
