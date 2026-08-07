-- db_auth migration
-- ===========================================================
-- users (from SQLite) — runnable COPY
-- ===========================================================
COPY "users" ("id","username","password","name","role","active","allowedSessions","permissions","createdAt","lastLogin","note") FROM STDIN WITH (FORMAT csv, HEADER false);
\NUSR-ADMIN,mikhmon,$2b$10$M0JEZ.CCsLcvmjCRMX/pveqIKSUNhnQjmegWyR4MUGBBaFRAPMllO,mikhmon,admin,1,[],"{\"viewDashboard\":true,\"manageVoucher\":true,\"manageBilling\":true,\"manageReseller\":true,\"managePppoe\":true,\"manageHotspot\":true,\"viewReport\":true,\"manageSystem\":true}","2026-08-02 03:06:40.680",2026-08-02T13:22:02.918Z,
\.

-- ===========================================================
-- app_config (from SQLite) — runnable COPY
-- ===========================================================
COPY "app_config" ("key","adminUser","adminPass","currency") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- mobile_user_tokens (from SQLite) — runnable COPY
-- ===========================================================
COPY "mobile_user_tokens" ("id","token","userId","username","name","role","permissions","sessionId","createdAt","expiresAt","lastUsed") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

