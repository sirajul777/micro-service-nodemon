-- db_router migration
-- ===========================================================
-- router_sessions -> router_sessions
-- ===========================================================
COPY "router_sessions" ("id","name","ip","port","user","password","currency","iface","livereport") FROM STDIN WITH (FORMAT csv, HEADER false);
SIWARNET,RB450GX4,172.16.101.12,8728,JULZ,YQT9apdSMSHq7/k6kBBzZA==:HkYI/YMXTzE7zZ6lY19akA==,Rp,ether1,enable
\.

