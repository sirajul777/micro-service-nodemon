package proto

// Parity request/response messages for DHCP, scheduler, and MikroTik log RPCs.
// These types mirror the fields declared in proto/router.proto. The generated
// bindings will replace this compatibility layer once protoc generation is run.

type ListDhcpLeasesRequest struct {
	SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3" json:"session_id,omitempty"`
}

type DhcpLease struct {
	Id                string `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
	Address           string `protobuf:"bytes,2,opt,name=address,proto3" json:"address,omitempty"`
	MacAddress        string `protobuf:"bytes,3,opt,name=mac_address,json=macAddress,proto3" json:"mac_address,omitempty"`
	ClientId          string `protobuf:"bytes,4,opt,name=client_id,json=clientId,proto3" json:"client_id,omitempty"`
	Server            string `protobuf:"bytes,5,opt,name=server,proto3" json:"server,omitempty"`
	Status            string `protobuf:"bytes,6,opt,name=status,proto3" json:"status,omitempty"`
	ExpiresAfter      string `protobuf:"bytes,7,opt,name=expires_after,json=expiresAfter,proto3" json:"expires_after,omitempty"`
	LastSeen          string `protobuf:"bytes,8,opt,name=last_seen,json=lastSeen,proto3" json:"last_seen,omitempty"`
	ActiveAddress     string `protobuf:"bytes,9,opt,name=active_address,json=activeAddress,proto3" json:"active_address,omitempty"`
	ActiveMacAddress  string `protobuf:"bytes,10,opt,name=active_mac_address,json=activeMacAddress,proto3" json:"active_mac_address,omitempty"`
	HostName          string `protobuf:"bytes,11,opt,name=host_name,json=hostName,proto3" json:"host_name,omitempty"`
	Comment           string `protobuf:"bytes,12,opt,name=comment,proto3" json:"comment,omitempty"`
	Disabled          string `protobuf:"bytes,13,opt,name=disabled,proto3" json:"disabled,omitempty"`
}

type ListDhcpLeasesResponse struct {
	Success bool         `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Error   string       `protobuf:"bytes,2,opt,name=error,proto3" json:"error,omitempty"`
	Leases  []*DhcpLease `protobuf:"bytes,3,rep,name=leases,proto3" json:"leases,omitempty"`
}

type ListLogsRequest struct {
	SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3" json:"session_id,omitempty"`
	Topics    string `protobuf:"bytes,2,opt,name=topics,proto3" json:"topics,omitempty"`
}

type LogEntry struct {
	Id      string `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
	Time    string `protobuf:"bytes,2,opt,name=time,proto3" json:"time,omitempty"`
	Topics  string `protobuf:"bytes,3,opt,name=topics,proto3" json:"topics,omitempty"`
	Message string `protobuf:"bytes,4,opt,name=message,proto3" json:"message,omitempty"`
}

type ListLogsResponse struct {
	Success bool        `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Error   string      `protobuf:"bytes,2,opt,name=error,proto3" json:"error,omitempty"`
	Logs    []*LogEntry `protobuf:"bytes,3,rep,name=logs,proto3" json:"logs,omitempty"`
}

type Scheduler struct {
	Id        string `protobuf:"bytes,1,opt,name=id,proto3" json:"id,omitempty"`
	Name      string `protobuf:"bytes,2,opt,name=name,proto3" json:"name,omitempty"`
	StartDate string `protobuf:"bytes,3,opt,name=start_date,json=startDate,proto3" json:"start_date,omitempty"`
	StartTime string `protobuf:"bytes,4,opt,name=start_time,json=startTime,proto3" json:"start_time,omitempty"`
	Interval  string `protobuf:"bytes,5,opt,name=interval,proto3" json:"interval,omitempty"`
	OnEvent   string `protobuf:"bytes,6,opt,name=on_event,json=onEvent,proto3" json:"on_event,omitempty"`
	Disabled  string `protobuf:"bytes,7,opt,name=disabled,proto3" json:"disabled,omitempty"`
	Comment   string `protobuf:"bytes,8,opt,name=comment,proto3" json:"comment,omitempty"`
}

type ListSchedulersRequest struct {
	SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3" json:"session_id,omitempty"`
}

type ListSchedulersResponse struct {
	Success    bool         `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Error      string       `protobuf:"bytes,2,opt,name=error,proto3" json:"error,omitempty"`
	Schedulers []*Scheduler `protobuf:"bytes,3,rep,name=schedulers,proto3" json:"schedulers,omitempty"`
}

type AddSchedulerRequest struct {
	SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3" json:"session_id,omitempty"`
	Name      string `protobuf:"bytes,2,opt,name=name,proto3" json:"name,omitempty"`
	StartDate string `protobuf:"bytes,3,opt,name=start_date,json=startDate,proto3" json:"start_date,omitempty"`
	StartTime string `protobuf:"bytes,4,opt,name=start_time,json=startTime,proto3" json:"start_time,omitempty"`
	Interval  string `protobuf:"bytes,5,opt,name=interval,proto3" json:"interval,omitempty"`
	OnEvent   string `protobuf:"bytes,6,opt,name=on_event,json=onEvent,proto3" json:"on_event,omitempty"`
	Disabled  string `protobuf:"bytes,7,opt,name=disabled,proto3" json:"disabled,omitempty"`
	Comment   string `protobuf:"bytes,8,opt,name=comment,proto3" json:"comment,omitempty"`
}

type AddSchedulerResponse struct {
	Success bool   `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Error   string `protobuf:"bytes,2,opt,name=error,proto3" json:"error,omitempty"`
}

type UpdateSchedulerRequest struct {
	SessionId string `protobuf:"bytes,1,opt,name=session_id,json=sessionId,proto3" json:"session_id,omitempty"`
	Name      string `protobuf:"bytes,2,opt,name=name,proto3" json:"name,omitempty"`
	OnEvent   string `protobuf:"bytes,3,opt,name=on_event,json=onEvent,proto3" json:"on_event,omitempty"`
	Disabled  string `protobuf:"bytes,4,opt,name=disabled,proto3" json:"disabled,omitempty"`
	Comment   string `protobuf:"bytes,5,opt,name=comment,proto3" json:"comment,omitempty"`
}

type UpdateSchedulerResponse struct {
	Success bool   `protobuf:"varint,1,opt,name=success,proto3" json:"success,omitempty"`
	Error   string `protobuf:"bytes,2,opt,name=error,proto3" json:"error,omitempty"`
}
