-- db_router migration
-- ===========================================================
-- router_sessions (from SQLite) — runnable COPY
-- ===========================================================
COPY "router_sessions" ("id","name","ip","port","user","password","hotspotName","dnsName","currency","reloadInterval","iface","idleTo","livereport") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

