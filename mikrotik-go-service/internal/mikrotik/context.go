package mikrotik

import (
	"context"
	"net"
	"strconv"
	"time"
)

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

	addr := net.JoinHostPort(host, strconv.Itoa(o.port))
	dialCtx := ctx
	if o.timeout > 0 {
		var cancel context.CancelFunc
		dialCtx, cancel = context.WithTimeout(ctx, o.timeout)
		defer cancel()
	}

	var d net.Dialer
	conn, err := d.DialContext(dialCtx, "tcp", addr)
	if err != nil {
		return nil, err
	}

	c := &Client{
		conn: conn,
		r:    bufio.NewReader(conn),
		w:    bufio.NewWriter(conn),
	}

	// Close the socket as soon as the caller's context is cancelled. This is
	// required because bufio.Reader/Writer operations do not otherwise know
	// about context cancellation.
	done := make(chan struct{})
	go func() {
		select {
		case <-ctx.Done():
			_ = conn.Close()
		case <-done:
		}
	}()

	if err := c.login(host, user, password); err != nil {
		close(done)
		_ = conn.Close()
		return nil, err
	}

	// Keep the watcher alive until the client is explicitly closed. The
	// existing Client.Close method closes the socket, which is sufficient for
	// unblocking any active operation.
	return c, nil
}
