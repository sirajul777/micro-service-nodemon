-- db_auth migration
-- ===========================================================
-- users (from SQLite) — runnable COPY
-- ===========================================================
COPY "users" ("id","username","password","name","role","active","allowedSessions","permissions","createdAt","lastLogin","note") FROM STDIN WITH (FORMAT csv, HEADER false);
USR-1777454671404,testing123,$2b$10$MDInZm04f1r.070uzzc1W.ZvFkiVInCZQacnlmC/K8yfvKUik9Yvq,testing123,reseller,1,"[""SIWARNET""]","{""viewDashboard"":true,""manageVoucher"":true,""manageBilling"":false,""manageReseller"":false,""managePppoe"":false,""manageHotspot"":false,""viewReport"":true,""manageSystem"":false}","2026-04-29 09:24:31.524",2026-05-08T16:05:37.108Z,
USR-1777455086665,collector,$2b$10$TNLbp9kJaJS9iYtRkc0akO1BAw1ZoAH6OuXXRcKqsBlyHPw23zwh.,collector,collector,1,"[""SIWARNET""]","{""viewDashboard"":false,""manageVoucher"":false,""manageBilling"":true,""manageReseller"":false,""managePppoe"":false,""manageHotspot"":false,""viewReport"":true,""manageSystem"":false}","2026-04-29 09:31:26.763",2026-08-03T09:27:22.281Z,
USR-1777626408962,siwarnet,$2b$10$lE.FMmVn5qnMPyIHR4YNA.aAbdtX6GcuLerkaJGtyku3NpCaBhwjO,"SIRAJUL WATHANI",admin,1,[],"{""viewDashboard"":true,""manageVoucher"":true,""manageBilling"":true,""manageReseller"":true,""managePppoe"":true,""manageHotspot"":true,""viewReport"":true,""manageSystem"":true}","2026-05-01 09:06:49.059",2026-08-05T16:00:21.366Z,
USR-1778165428593,mirza,$2b$10$E69XcVir1gU/EKXnKLqh0.qdLI1xcxDZ65JZwyzEUC7GZ./k3BFGe,"FATHUL KHAIRI",collector,1,[],"{""viewDashboard"":true,""manageVoucher"":false,""manageBilling"":true,""manageReseller"":false,""managePppoe"":false,""manageHotspot"":false,""viewReport"":true,""manageSystem"":false}","2026-05-07 14:50:28.701",2026-08-03T09:26:22.304Z,""
\.

-- ===========================================================
-- app_config (from SQLite) — runnable COPY
-- ===========================================================
COPY "app_config" ("key","adminUser","adminPass","currency") FROM STDIN WITH (FORMAT csv, HEADER false);
default,mikhmon,NCljE82eMspaxz2NzhHcZg==:poz+PMteqFBJqwEbc2cvkA==,Rp
\.

-- ===========================================================
-- mobile_user_tokens (from SQLite) — runnable COPY
-- ===========================================================
COPY "mobile_user_tokens" ("id","token","userId","username","name","role","permissions","sessionId","createdAt","expiresAt","lastUsed") FROM STDIN WITH (FORMAT csv, HEADER false);
d1789e6e-5c29-4ca6-981b-e8a0cad4b2b0,2d00bd998f9d4723fe4d0799053b4e4638fa779405a428f4e7ddff15d4ea77bc,USR-1777454671404,testing123,testing123,reseller,"{""viewDashboard"":true,""manageVoucher"":true,""manageBilling"":false,""manageReseller"":false,""managePppoe"":false,""manageHotspot"":false,""viewReport"":true,""manageSystem"":false}",S,"2026-05-08 16:05:37.109",2026-06-07T16:05:37.109Z,2026-05-08T16:06:04.367Z
24b2e095-655f-413c-b102-2408e3d31782,0f28280123c5b0ce2ff9698b612ca49b7dadab71c0f1ac8bb58427d887d24fd8,USR-1778165428593,mirza,"FATHUL KHAIRI",collector,"{""viewDashboard"":true,""manageVoucher"":false,""manageBilling"":true,""manageReseller"":false,""managePppoe"":false,""manageHotspot"":false,""viewReport"":true,""manageSystem"":false}",B,"2026-06-08 10:50:35.346",2026-07-08T10:50:35.346Z,2026-06-08T10:51:55.975Z
\.

