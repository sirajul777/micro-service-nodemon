-- db_erp migration
-- ===========================================================
-- voucher_types (from SQLite) — runnable COPY
-- ===========================================================
COPY "voucher_types" ("id","name","price","profile","duration","codeLength","codeFormat","maxPerOrder","userType","active","createdAt") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- voucher_batches (from SQLite) — runnable COPY
-- ===========================================================
COPY "voucher_batches" ("id","sessionId","profileName","profileColor","price","totalPrice","validity","caption","nasName","createdBy","createdAt","resellerId","resellerName","vouchers") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- profile_meta (from SQLite) — runnable COPY
-- ===========================================================
COPY "profile_meta" ("id","kind","sessionId","profileName","price","validity","profileColor","caption","active") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

