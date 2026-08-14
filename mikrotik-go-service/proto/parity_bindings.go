package proto

import (
	context "context"
	grpc "google.golang.org/grpc"
)

type ListLogsRequest struct { SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3"`; Topics string `protobuf:"bytes,2,opt,name=topics,proto3"` }
type LogEntry struct { Id string `protobuf:"bytes,1,opt,name=id,proto3"`; Time string `protobuf:"bytes,2,opt,name=time,proto3"`; Topics string `protobuf:"bytes,3,opt,name=topics,proto3"`; Message string `protobuf:"bytes,4,opt,name=message,proto3"` }
type ListLogsResponse struct { Success bool `protobuf:"varint,1,opt,name=success,proto3"`; Error string `protobuf:"bytes,2,opt,name=error,proto3"`; Logs []*LogEntry `protobuf:"bytes,3,rep,name=logs,proto3"` }

type ListDhcpLeasesRequest struct { SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3"` }
type DhcpLease struct { Id string `protobuf:"bytes,1,opt,name=id,proto3"`; Address string `protobuf:"bytes,2,opt,name=address,proto3"`; MacAddress string `protobuf:"bytes,3,opt,name=mac_address,json=macAddress,proto3"`; ClientId string `protobuf:"bytes,4,opt,name=client_id,json=clientId,proto3"`; Server string `protobuf:"bytes,5,opt,name=server,proto3"`; Status string `protobuf:"bytes,6,opt,name=status,proto3"`; ExpiresAfter string `protobuf:"bytes,7,opt,name=expires_after,json=expiresAfter,proto3"`; LastSeen string `protobuf:"bytes,8,opt,name=last_seen,json=lastSeen,proto3"`; ActiveAddress string `protobuf:"bytes,9,opt,name=active_address,json=activeAddress,proto3"`; ActiveMacAddress string `protobuf:"bytes,10,opt,name=active_mac_address,json=activeMacAddress,proto3"`; HostName string `protobuf:"bytes,11,opt,name=host_name,json=hostName,proto3"`; Comment string `protobuf:"bytes,12,opt,name=comment,proto3"`; Disabled string `protobuf:"bytes,13,opt,name=disabled,proto3"` }
type ListDhcpLeasesResponse struct { Success bool `protobuf:"varint,1,opt,name=success,proto3"`; Error string `protobuf:"bytes,2,opt,name=error,proto3"`; Leases []*DhcpLease `protobuf:"bytes,3,rep,name=leases,proto3"` }

type Scheduler struct { Id string `protobuf:"bytes,1,opt,name=id,proto3"`; Name string `protobuf:"bytes,2,opt,name=name,proto3"`; StartDate string `protobuf:"bytes,3,opt,name=start_date,json=startDate,proto3"`; StartTime string `protobuf:"bytes,4,opt,name=start_time,json=startTime,proto3"`; Interval string `protobuf:"bytes,5,opt,name=interval,proto3"`; OnEvent string `protobuf:"bytes,6,opt,name=on_event,json=onEvent,proto3"`; Disabled string `protobuf:"bytes,7,opt,name=disabled,proto3"`; Comment string `protobuf:"bytes,8,opt,name=comment,proto3"` }
type ListSchedulersRequest struct { SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3"` }
type ListSchedulersResponse struct { Success bool `protobuf:"varint,1,opt,name=success,proto3"`; Error string `protobuf:"bytes,2,opt,name=error,proto3"`; Schedulers []*Scheduler `protobuf:"bytes,3,rep,name=schedulers,proto3"` }
type AddSchedulerRequest struct { SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3"`; Name string `protobuf:"bytes,2,opt,name=name,proto3"`; StartDate string `protobuf:"bytes,3,opt,name=start_date,json=startDate,proto3"`; StartTime string `protobuf:"bytes,4,opt,name=start_time,json=startTime,proto3"`; Interval string `protobuf:"bytes,5,opt,name=interval,proto3"`; OnEvent string `protobuf:"bytes,6,opt,name=on_event,json=onEvent,proto3"`; Disabled string `protobuf:"bytes,7,opt,name=disabled,proto3"`; Comment string `protobuf:"bytes,8,opt,name=comment,proto3"` }
type AddSchedulerResponse struct { Success bool `protobuf:"varint,1,opt,name=success,proto3"`; Error string `protobuf:"bytes,2,opt,name=error,proto3"` }
type UpdateSchedulerRequest struct { SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3"`; Name string `protobuf:"bytes,2,opt,name=name,proto3"`; OnEvent string `protobuf:"bytes,3,opt,name=on_event,json=onEvent,proto3"`; Disabled string `protobuf:"bytes,4,opt,name=disabled,proto3"`; Comment string `protobuf:"bytes,5,opt,name=comment,proto3"` }
type UpdateSchedulerResponse struct { Success bool `protobuf:"varint,1,opt,name=success,proto3"`; Error string `protobuf:"bytes,2,opt,name=error,proto3"` }

func (x *ListLogsRequest) GetSessionId() string { if x!=nil{return x.SessionId}; return "" }
func (x *ListLogsRequest) GetTopics() string { if x!=nil{return x.Topics}; return "" }
func (x *ListDhcpLeasesRequest) GetSessionId() string { if x!=nil{return x.SessionId}; return "" }
func (x *ListSchedulersRequest) GetSessionId() string { if x!=nil{return x.SessionId}; return "" }
func (x *AddSchedulerRequest) GetSessionId() string { if x!=nil{return x.SessionId}; return "" }
func (x *AddSchedulerRequest) GetName() string { if x!=nil{return x.Name}; return "" }
func (x *AddSchedulerRequest) GetStartDate() string { if x!=nil{return x.StartDate}; return "" }
func (x *AddSchedulerRequest) GetStartTime() string { if x!=nil{return x.StartTime}; return "" }
func (x *AddSchedulerRequest) GetInterval() string { if x!=nil{return x.Interval}; return "" }
func (x *AddSchedulerRequest) GetOnEvent() string { if x!=nil{return x.OnEvent}; return "" }
func (x *AddSchedulerRequest) GetDisabled() string { if x!=nil{return x.Disabled}; return "" }
func (x *AddSchedulerRequest) GetComment() string { if x!=nil{return x.Comment}; return "" }
func (x *UpdateSchedulerRequest) GetSessionId() string { if x!=nil{return x.SessionId}; return "" }
func (x *UpdateSchedulerRequest) GetName() string { if x!=nil{return x.Name}; return "" }
func (x *UpdateSchedulerRequest) GetOnEvent() string { if x!=nil{return x.OnEvent}; return "" }
func (x *UpdateSchedulerRequest) GetDisabled() string { if x!=nil{return x.Disabled}; return "" }
func (x *UpdateSchedulerRequest) GetComment() string { if x!=nil{return x.Comment}; return "" }

const (
	RouterService_ListDhcpLeases_FullMethodName = "/router.RouterService/ListDhcpLeases"
	RouterService_ListSchedulers_FullMethodName = "/router.RouterService/ListSchedulers"
	RouterService_AddScheduler_FullMethodName = "/router.RouterService/AddScheduler"
	RouterService_UpdateScheduler_FullMethodName = "/router.RouterService/UpdateScheduler"
	RouterService_ListLogs_FullMethodName = "/router.RouterService/ListLogs"
)

func parityInvoke(ctx context.Context, cc grpc.ClientConnInterface, method string, in, out interface{}, opts ...grpc.CallOption) error { return cc.Invoke(ctx, method, in, out, opts...) }
