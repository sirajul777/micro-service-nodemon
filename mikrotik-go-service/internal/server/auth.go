package server

import (
	"context"
	"crypto/subtle"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// ServiceAuthInterceptor protects the internal RouterService API with a
// service-to-service token. User JWT authorization remains in the Node
// services; this boundary only establishes that the caller is trusted.
func ServiceAuthInterceptor(expectedToken string) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if expectedToken == "" {
			return nil, status.Error(codes.Unauthenticated, "gRPC service token is not configured")
		}

		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing gRPC metadata")
		}

		values := md.Get("x-service-token")
		if len(values) == 0 || values[0] == "" {
			return nil, status.Error(codes.Unauthenticated, "missing service token")
		}

		provided := []byte(values[0])
		expected := []byte(expectedToken)
		if len(provided) != len(expected) || subtle.ConstantTimeCompare(provided, expected) != 1 {
			return nil, status.Error(codes.Unauthenticated, "invalid service token")
		}

		return handler(ctx, req)
	}
}
