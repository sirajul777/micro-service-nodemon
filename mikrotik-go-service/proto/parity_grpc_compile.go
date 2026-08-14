package proto

import "context"

// Compile-time service contract for the parity RPC implementations. The
// generated gRPC bindings are regenerated separately from router.proto; these
// interfaces let internal/server compile against the new parity methods in
// the meantime without modifying generated code by hand.
type RouterParityServer interface {
	ListDhcpLeases(context.Context, *ListDhcpLeasesRequest) (*ListDhcpLeasesResponse, error)
	ListSchedulers(context.Context, *ListSchedulersRequest) (*ListSchedulersResponse, error)
	AddScheduler(context.Context, *AddSchedulerRequest) (*AddSchedulerResponse, error)
	UpdateScheduler(context.Context, *UpdateSchedulerRequest) (*UpdateSchedulerResponse, error)
	ListLogs(context.Context, *ListLogsRequest) (*ListLogsResponse, error)
}
