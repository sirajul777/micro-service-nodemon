-- db_router migration
-- ===========================================================
-- router_sessions (from SQLite) — runnable COPY
-- ===========================================================
COPY "router_sessions" ("id","name","ip","port","user","password","hotspotName","dnsName","currency","reloadInterval","iface","idleTo","livereport") FROM STDIN WITH (FORMAT csv, HEADER false);
\NSIWARNET,RB450GX4,172.16.101.12,8728,JULZ,YQT9apdSMSHq7/k6kBBzZA==:HkYI/YMXTzE7zZ6lY19akA==,\",\",Rp,10,ether1,0,enable
\.

