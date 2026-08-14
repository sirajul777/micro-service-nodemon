package mikrotik

import (
	"context"
	"net"
	"testing"
	"time"
)

func TestContextConnCloseStopsWatcher(t *testing.T) {
	left, right := net.Pipe()
	defer right.Close()

	done := make(chan struct{})
	cc := &contextConn{Conn: left, done: done}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		select {
		case <-ctx.Done():
			_ = cc.Close()
		case <-done:
		}
	}()

	if err := cc.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("context watcher did not stop")
	}
}

func TestContextConnCancellationClosesSocket(t *testing.T) {
	left, right := net.Pipe()
	defer right.Close()

	done := make(chan struct{})
	cc := &contextConn{Conn: left, done: done}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		select {
		case <-ctx.Done():
			_ = cc.Close()
		case <-done:
		}
	}()

	cancel()

	deadline := time.Now().Add(time.Second)
	for {
		if err := right.SetReadDeadline(time.Now().Add(25 * time.Millisecond)); err != nil {
			t.Fatalf("set deadline: %v", err)
		}
		var b [1]byte
		_, err := right.Read(b[:])
		if err != nil {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("socket was not closed after context cancellation")
		}
	}
}
