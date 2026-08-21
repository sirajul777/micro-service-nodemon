// Package mikrotik implements a minimal RouterOS API client in Go.
//
// It speaks the RouterOS binary API protocol (port 8728) directly — the Go
// equivalent of the monolith's `node-routeros` package. Supports login
// (plaintext + challenge/response), running commands with query (`?key=`)
// and set (`=key=`) attributes, and streaming sentence replies.
package mikrotik

import (
	"bufio"
	"context"
	"crypto/md5"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
)

// Sentence is a single reply record from RouterOS: a map of attribute key →
// value. Keys include ".id", "name", ".type", etc.
type Sentence map[string]string

// Client is a RouterOS API connection.
type Client struct {
	conn net.Conn
	r    *bufio.Reader
	w    *bufio.Writer
	// apiVersion negotiated (1 = plaintext, 2 = challenge/response)
	apiVersion int
}

// Option configures a Dial.
type Option func(*options)

type options struct {
	port    int
	timeout time.Duration
}

// WithPort overrides the default RouterOS API port (8728).
func WithPort(port int) Option {
	return func(o *options) { o.port = port }
}

// WithTimeout overrides the dial/read timeout (default 15s).
func WithTimeout(d time.Duration) Option {
	return func(o *options) { o.timeout = d }
}

// Dial connects and authenticates to a RouterOS router using a background context.
func Dial(host, user, password string, opts ...Option) (*Client, error) {
	return DialContext(context.Background(), host, user, password, opts...)
}

// RunContext executes a RouterOS command while honoring ctx cancellation/deadlines.
func (c *Client) RunContext(ctx context.Context, cmd string, words ...string) ([]Sentence, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	if deadline, ok := ctx.Deadline(); ok {
		if err := c.conn.SetDeadline(deadline); err != nil {
			return nil, err
		}
	}
	defer func() {
		_ = c.conn.SetDeadline(time.Time{})
	}()

	if err := c.runSentence(cmd, words...); err != nil {
		return nil, err
	}
	return c.readReplies("!done")
}

// Run executes a RouterOS command with optional query/set words and returns
// all reply sentences. Words may be formatted as "?key=value" (query) or
// "=key=value" (set attribute).
func (c *Client) Run(cmd string, words ...string) ([]Sentence, error) {
	return c.RunContext(context.Background(), cmd, words...)
}

// login performs RouterOS authentication. It first tries the modern
// challenge/response (api-version 2) and falls back to plaintext (v1).
func (c *Client) login(host, user, password string) error {
	if err := c.runSentence("/login", "=name="+user, "=password="+password); err != nil {
		return err
	}
	sentences, err := c.readReplies("!done")
	if err != nil {
		return err
	}
	for _, s := range sentences {
		if ret, ok := s["ret"]; ok {
			c.apiVersion = 1
			stage2 := md5Of(password + challengeHex(ret))
			ch := md5.Sum([]byte(stage2))
			resp := fmt.Sprintf("00%x", ch)
			if err := c.runSentence("/login", "=name="+user, "=response="+resp); err != nil {
				return err
			}
			sentences, err = c.readReplies("!done")
			if err != nil {
				return err
			}
			for _, s := range sentences {
				if s[".tag"] != "" || s["ret"] != "" {
					continue
				}
				if msg, ok := s["message"]; ok && msg != "done" {
					return fmt.Errorf("login rejected: %s", msg)
				}
			}
			return nil
		}
	}
	c.apiVersion = 2
	return nil
}

func challengeHex(ret string) string {
	return ret
}

func md5Of(s string) string {
	h := md5.Sum([]byte(s))
	return fmt.Sprintf("%x", h)
}

func (c *Client) runSentence(cmd string, words ...string) error {
	if err := c.writeWord(cmd); err != nil {
		return err
	}
	for _, w := range words {
		if w == "" {
			continue
		}
		if err := c.writeWord(w); err != nil {
			return err
		}
	}
	return c.writeWord("")
}

func (c *Client) writeWord(word string) error {
	if err := c.writeLen(len(word)); err != nil {
		return err
	}
	if _, err := c.w.WriteString(word); err != nil {
		return err
	}
	return c.w.Flush()
}

func (c *Client) writeLen(l int) error {
	var buf []byte
	switch {
	case l < 0x80:
		buf = []byte{byte(l)}
	case l < 0x4000:
		buf = []byte{byte(l>>8) | 0x80, byte(l)}
	case l < 0x200000:
		buf = []byte{byte(l>>16) | 0xC0, byte(l >> 8), byte(l)}
	case l < 0x10000000:
		buf = []byte{byte(l>>24) | 0xE0, byte(l >> 16), byte(l >> 8), byte(l)}
	default:
		buf = append([]byte{0xF0}, make([]byte, 4)...)
		binary.BigEndian.PutUint32(buf[1:], uint32(l))
	}
	_, err := c.w.Write(buf)
	return err
}

func (c *Client) readReplies(terminator string) ([]Sentence, error) {
	var out []Sentence
	for {
		word, err := c.readWord()
		if err != nil {
			return nil, err
		}
		if word == terminator {
			return out, nil
		}
		if word == "!trap" {
			msg := ""
			for {
				w, err := c.readWord()
				if err != nil {
					return nil, err
				}
				if w == "" {
					break
				}
				if strings.HasPrefix(w, "=message=") {
					msg = strings.TrimPrefix(w, "=message=")
				}
			}
			return out, fmt.Errorf("routeros trap: %s", msg)
		}
		if word == "!fatal" {
			return out, errors.New("routeros fatal error")
		}
		if word == "!re" {
			s := Sentence{}
			for {
				w, err := c.readWord()
				if err != nil {
					return nil, err
				}
				if w == "" {
					break
				}
				if strings.HasPrefix(w, "=") {
					rest := w[1:]
					if eq := strings.IndexByte(rest, '='); eq >= 0 {
						key := rest[:eq]
						val := rest[eq+1:]
						s[key] = val
					}
				}
			}
			out = append(out, s)
		}
	}
}

func (c *Client) readWord() (string, error) {
	l, err := c.readLen()
	if err != nil {
		return "", err
	}
	buf := make([]byte, l)
	if _, err := io.ReadFull(c.r, buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

func (c *Client) readLen() (int, error) {
	b, err := c.r.ReadByte()
	if err != nil {
		return 0, err
	}
	switch {
	case b < 0x80:
		return int(b), nil
	case b < 0xC0:
		b2, err := c.r.ReadByte()
		if err != nil {
			return 0, err
		}
		return (int(b&0x3f) << 8) | int(b2), nil
	case b < 0xE0:
		b2, err := c.r.ReadByte()
		if err != nil {
			return 0, err
		}
		b3, err := c.r.ReadByte()
		if err != nil {
			return 0, err
		}
		return (int(b&0x1f) << 16) | (int(b2) << 8) | int(b3), nil
	case b < 0xF0:
		b2, err := c.r.ReadByte()
		if err != nil {
			return 0, err
		}
		b3, err := c.r.ReadByte()
		if err != nil {
			return 0, err
		}
		b4, err := c.r.ReadByte()
		if err != nil {
			return 0, err
		}
		return (int(b&0x0f) << 24) | (int(b2) << 16) | (int(b3) << 8) | int(b4), nil
	default:
		var buf [4]byte
		if _, err := io.ReadFull(c.r, buf[:]); err != nil {
			return 0, err
		}
		return int(binary.BigEndian.Uint32(buf[:])), nil
	}
}

func (c *Client) Close() {
	if c.conn != nil {
		_ = c.conn.Close()
	}
}
