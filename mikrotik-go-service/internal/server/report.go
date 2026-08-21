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
	liveReportCacheTTL = 60 * time.Second
)

type liveReportCacheEntry struct {
	rows      []mikrotik.Sentence
	expiresAt time.Time
}

type liveReportInflight struct {
	done chan struct{}
	rows []mikrotik.Sentence
	err  error
}

var liveReportCache sync.Map
var liveReportInflight sync.Map

func (s *RouterServiceServer) ListSellingScripts(ctx context.Context, req *pb.ListSellingScriptsRequest) (*pb.ListSellingScriptsResponse, error) {
	resp := &pb.ListSellingScriptsResponse{}
	if req == nil || strings.TrimSpace(req.SessionId) == "" {
		resp.Error = "session id wajib diisi"
		return resp, nil
	}

	requestStarted := time.Now()
	isROS7 := true
	cacheKey := reportCacheKey(req.SessionId, req.Idhr, req.Idbl, isROS7)

	rows, ok := getLiveReportCache(cacheKey)
	cacheState := "miss"
	queryStarted := time.Now()

	if ok {
		cacheState = "hit"
	} else {
		flight := &liveReportInflight{done: make(chan struct{})}
		actual, loaded := liveReportInflight.LoadOrStore(cacheKey, flight)
		if loaded {
			cacheState = "wait"
			f := actual.(*liveReportInflight)
			select {
			case <-f.done:
				rows, ok = f.rows, f.err == nil
				if f.err != nil {
					resp.Error = f.err.Error()
					return resp, nil
				}
			case <-ctx.Done():
				resp.Error = ctx.Err().Error()
				return resp, nil
			}
		} else {
			defer liveReportInflight.Delete(cacheKey)
			defer close(flight.done)

			c, err := s.dial(ctx, req.SessionId)
			if err != nil {
				flight.err = err
				resp.Error = err.Error()
				return resp, nil
			}
			defer c.Close()

			// Historical requests need RouterOS version detection; current-month
			// requests can query directly without the extra round trip.
			if req.Idhr != "" {
				versionRows, versionErr := c.RunContext(ctx, "/system/resource/print")
				if versionErr != nil {
					flight.err = versionErr
					resp.Error = versionErr.Error()
					return resp, nil
				}
				if len(versionRows) > 0 && strings.HasPrefix(versionRows[0]["version"], "6") {
					isROS7 = false
					cacheKey = reportCacheKey(req.SessionId, req.Idhr, req.Idbl, isROS7)
				}
			}

			rows, err = s.getSellingRows(ctx, c, isROS7, req.Idhr, req.Idbl)
			if err != nil {
				flight.err = err
				resp.Error = err.Error()
				return resp, nil
			}
			flight.rows = rows
			if req.Idbl != "" {
				setLiveReportCache(cacheKey, rows)
			}
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

func (s *RouterServiceServer) getSellingRows(ctx context.Context, c *mikrotik.Client, isROS7 bool, idhr, idbl string) ([]mikrotik.Sentence, error) {
	var rows []mikrotik.Sentence
	var err error

	if idhr != "" {
		parts := strings.Split(idhr, "/")
		if len(parts) != 3 {
			return nil, &reportError{"invalid idhr format"}
		}
		monthOwner := parts[0] + parts[2]
		if isROS7 {
			rows, err = c.RunContext(ctx, "/system/script/print", "?owner="+monthOwner, scriptProplist)
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
		return c.RunContext(ctx, "/system/script/print", "?source="+idhr, scriptProplist)
	}

	if idbl != "" {
		return c.RunContext(ctx, "/system/script/print", "?owner="+idbl, scriptProplist)
	}

	now := time.Now()
	months := [...]string{"jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"}
	monthOwner := months[now.Month()-1] + strconv.Itoa(now.Year())
	if isROS7 {
		return c.RunContext(ctx, "/system/script/print", "?owner="+monthOwner, scriptProplist)
	}
	return c.RunContext(ctx, "/system/script/print", "?comment=mikhmon", scriptProplist)
}

type reportError struct{ message string }
func (e *reportError) Error() string { return e.message }

func valueAt(parts []string, index int) string {
	if index < 0 || index >= len(parts) { return "" }
	return parts[index]
}
