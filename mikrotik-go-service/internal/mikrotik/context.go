package mikrotik

import (
	"bufio"
	"context"
	"net"
	"strconv"
	"sync"
	"time"
)

// contextConn wraps a net.Conn so Client.Close also stops the cancellation
// watcher created by DialContext. Without this wrapper a successful request
// would leave one goroutine blocked on ctx.Done() until the request context
// happened to be cancelled.
type contextConn struct {
	net.Conn
	done     chan struct{}
	closeOnce sync.Once
}

func (c *contextConn) Close() error {
	var err error
	c.closeOnce.Do(func() {
		close(c.done)
		err = c.Conn.Close()
	})
	return err
}

// DialContext connects and authenticates to RouterOS while binding the
// lifetime of the connection to ctx. Cancelling ctx closes the socket so a
// blocked RouterOS read/write cannot outlive the gRPC request.
func DialContext(ctx context.Context, host, user, password string, opts ...Option) (*Client, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	o := &options{port: 8728, timeout: 15 * time.Second}
	for _, fn := range opts {
		fn(o)
	}

	dialCtx := ctx
	cancel := func() {}
	if o.timeout > 0 {
		dialCtx, cancel = context.WithTimeout(ctx, o.timeout)
	}
	defer cancel()

	addr := net.JoinHostPort(host, strconv.Itoa(o.port))
	var d net.Dialer
	conn, err := d.DialContext(dialCtx, "tcp", addr)
	if err != nil {
		return nil, err
	}

	done := make(chan struct{})
	cc := &contextConn{Conn: conn, done: done}
	c := &Client{
		conn: cc,
		r:    bufio.NewReader(cc),
		w:    bufio.NewWriter(cc),
	}

	go func() {
		select {
		case <-ctx.Done():
			_ = cc.Close()
		case <-done:
		}
	}()

	if err := c.login(host, user, password); err != nil {
		_ = cc.Close()
		return nil, err
	}

	return c, nil
}
