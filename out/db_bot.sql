-- db_bot migration
-- ===========================================================
-- bot_resellers (from SQLite) — runnable COPY
-- ===========================================================
COPY "bot_resellers" ("id","name","username","telegramId","sessionId","saldo","totalVoucher","totalIncome","status","markup","discount","createdAt","lastActive","note") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- bot_topup_logs (from SQLite) — runnable COPY
-- ===========================================================
COPY "bot_topup_logs" ("id","reselerId","amount","type","note","by","at","balanceBefore","balanceAfter") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- telegram_configs (from SQLite) — runnable COPY
-- ===========================================================
COPY "telegram_configs" ("id","token","chatId","sessionId","notifSale","notifDaily","dailyTime","botEnabled","allowedUsers","defaultProfile","welcomeMsg") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

