package server

import (
	"context"

	pb "github.com/mikhmon/mikrotik-go-service/proto"
)

func (s *RouterServiceServer) ListPppSecrets(ctx context.Context, req *pb.ListPppSecretsRequest) (*pb.ListPppSecretsResponse, error) {
	resp := &pb.ListPppSecretsResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	args := []string{}
	if req.Profile != "" {
		args = append(args, "?profile="+req.Profile)
	}
	if req.Name != "" {
		args = append(args, "?name="+req.Name)
	}
	rows, err := c.Run("/ppp/secret/print", args...)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	for _, r := range rows {
		resp.Secrets = append(resp.Secrets, &pb.PppSecret{
			Id: r[".id"], Name: r["name"], Password: r["password"], Service: r["service"],
			Profile: r["profile"], LocalAddress: r["local-address"], RemoteAddress: r["remote-address"],
			Comment: r["comment"], Disabled: r["disabled"],
		})
	}
	resp.Success = true
	return resp, nil
}

func (s *RouterServiceServer) GetPppSecret(ctx context.Context, req *pb.GetPppSecretRequest) (*pb.GetPppSecretResponse, error) {
	resp := &pb.GetPppSecretResponse{}
	c, err := s.dial(ctx, req.SessionId)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	defer c.Close()

	rows, err := c.Run("/ppp/secret/print", "?name="+req.Name)
	if err != nil {
		resp.Error = err.Error()
		return resp, nil
	}
	if len(rows) == 0 {
		resp.Error = "secret tidak ditemukan"
		return resp, nil
	}
	r := rows[0]
	resp.Secret = &pb.PppSecret{
		Id: r[".id"], Name: r["name"], Password: r["password"], Service: r["service"],
		Profile: r["profile"], LocalAddress: r["local-address"], RemoteAddress: r["remote-address"],
		Comment: r["comment"], Disabled: r["disabled"],
	}
	resp.Success = true
	return resp, nil
}
