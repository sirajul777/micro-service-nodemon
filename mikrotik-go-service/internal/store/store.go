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
		return nil, err
	}
	return s, nil
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

// Close releases the pool.
func (s *Store) Close() {
	s.pool.Close()
	_ = log.Output(2, "store closed")
}
