// Package store provides persistence for router sessions in Postgres (db_router).
package store

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RouterSession mirrors the monolith's router_sessions entity.
type RouterSession struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	IP             string `json:"ip"`
	Port           int    `json:"port"`
	User           string `json:"user"`
	Password       string `json:"password"`
	HotspotName    string `json:"hotspotName"`
	DNSName        string `json:"dnsName"`
	Currency       string `json:"currency"`
	ReloadInterval int    `json:"reloadInterval"`
	Iface          string `json:"iface"`
	IdleTo         int    `json:"idleTo"`
	Livereport     string `json:"livereport"`
}

// Store is a Postgres-backed router-session repository.
type Store struct {
	pool *pgxpool.Pool
}

// New creates a Store and ensures the router_sessions table exists.
func New(ctx context.Context, dsn string) (*Store, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("connect postgres: %w", err)
	}
	s := &Store{pool: pool}
	if err := s.migrate(ctx); err != nil {
		s.Close()
		return nil, err
	}
	return s, nil
}

// NewWithoutMigration creates a Store without running startup migrations.
// The pool still connects lazily and can recover once Postgres becomes reachable.
func NewWithoutMigration(ctx context.Context, dsn string) *Store {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Printf("[mikrotik-go-service] postgres pool init failed: %v", err)
		return nil
	}
	return &Store{pool: pool}
}

func (s *Store) migrate(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS router_sessions (
			id            TEXT PRIMARY KEY,
			name          TEXT NOT NULL,
			ip            TEXT NOT NULL,
			port          INTEGER NOT NULL DEFAULT 8728,
			"user"        TEXT NOT NULL,
			password      TEXT NOT NULL,
			hotspot_name  TEXT NOT NULL DEFAULT '',
			dns_name      TEXT NOT NULL DEFAULT '',
			currency      TEXT NOT NULL DEFAULT 'Rp',
			reload_interval INTEGER NOT NULL DEFAULT 10,
			iface         TEXT NOT NULL DEFAULT 'ether1',
			idle_to       INTEGER NOT NULL DEFAULT 0,
			livereport    TEXT NOT NULL DEFAULT 'enable'
		)
	`)
	if err != nil {
		return fmt.Errorf("migrate router_sessions: %w", err)
	}
	return nil
}

// Get returns a router session by id.
func (s *Store) Get(ctx context.Context, id string) (*RouterSession, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, name, ip, port, "user", password, hotspot_name, dns_name,
		       currency, reload_interval, iface, idle_to, livereport
		FROM router_sessions WHERE id = $1
	`, id)
	rs := &RouterSession{}
	if err := row.Scan(
		&rs.ID, &rs.Name, &rs.IP, &rs.Port, &rs.User, &rs.Password,
		&rs.HotspotName, &rs.DNSName, &rs.Currency, &rs.ReloadInterval,
		&rs.Iface, &rs.IdleTo, &rs.Livereport,
	); err != nil {
		return nil, err
	}
	return rs, nil
}

// List returns all router sessions.
func (s *Store) List(ctx context.Context) ([]RouterSession, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, name, ip, port, "user", password, hotspot_name, dns_name,
		       currency, reload_interval, iface, idle_to, livereport
		FROM router_sessions ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []RouterSession
	for rows.Next() {
		rs := RouterSession{}
		if err := rows.Scan(
			&rs.ID, &rs.Name, &rs.IP, &rs.Port, &rs.User, &rs.Password,
			&rs.HotspotName, &rs.DNSName, &rs.Currency, &rs.ReloadInterval,
			&rs.Iface, &rs.IdleTo, &rs.Livereport,
		); err != nil {
			return nil, err
		}
		out = append(out, rs)
	}
	return out, rows.Err()
}

// Create inserts a new router session. Returns an error if the id already exists.
func (s *Store) Create(ctx context.Context, rs RouterSession) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO router_sessions
			(id, name, ip, port, "user", password, hotspot_name, dns_name,
			 currency, reload_interval, iface, idle_to, livereport)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
	`,
		rs.ID, rs.Name, rs.IP, rs.Port, rs.User, rs.Password,
		rs.HotspotName, rs.DNSName, rs.Currency, rs.ReloadInterval,
		rs.Iface, rs.IdleTo, rs.Livereport,
	)
	if err != nil {
		return fmt.Errorf("create router_session: %w", err)
	}
	return nil
}

// Update overwrites an existing router session's fields (full replace,
// keyed by id). Returns pgx.ErrNoRows-style behaviour via rows-affected
// check so callers can distinguish "not found" from a DB error.
func (s *Store) Update(ctx context.Context, rs RouterSession) (bool, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE router_sessions SET
			name = $2, ip = $3, port = $4, "user" = $5, password = $6,
			hotspot_name = $7, dns_name = $8, currency = $9,
			reload_interval = $10, iface = $11, idle_to = $12, livereport = $13
		WHERE id = $1
	`,
		rs.ID, rs.Name, rs.IP, rs.Port, rs.User, rs.Password,
		rs.HotspotName, rs.DNSName, rs.Currency, rs.ReloadInterval,
		rs.Iface, rs.IdleTo, rs.Livereport,
	)
	if err != nil {
		return false, fmt.Errorf("update router_session: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// Delete removes a router session by id. Returns whether a row was deleted.
func (s *Store) Delete(ctx context.Context, id string) (bool, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM router_sessions WHERE id = $1`, id)
	if err != nil {
		return false, fmt.Errorf("delete router_session: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// Exists reports whether a router session with the given id already exists.
func (s *Store) Exists(ctx context.Context, id string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM router_sessions WHERE id = $1)`, id).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check router_session exists: %w", err)
	}
	return exists, nil
}

// Close releases the pool.
func (s *Store) Close() {
	if s == nil || s.pool == nil {
		return
	}
	s.pool.Close()
	_ = log.Output(2, "store closed")
}
