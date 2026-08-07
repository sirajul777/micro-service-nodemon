-- db_payment migration
-- ===========================================================
-- payment_config (from SQLite) — runnable COPY
-- ===========================================================
COPY "payment_config" ("key","defaultProvider","midtransEnabled","midtransEnv","midtransServerKey","midtransClientKey","duitkuEnabled","duitkuEnv","duitkuMerchantCode","duitkuApiKey","duitkuCallbackUrl","duitkuReturnUrl","duitkuExpiryMinutes","payhookEnabled","payhookEnv","payhookApiKey","payhookSecretKey","payhookPartnerCode","payhookCallbackUrl","payhookDefaultMethod","payhookUniqueDigits","payhookQrisExpiryMinutes","payhookWaEnabled","payhookWalledGardenHosts") FROM STDIN WITH (FORMAT csv, HEADER false);
\Ndefault,payhook,0,sandbox,\",\",0,sandbox,\",\",\",\",10,1,production,5c4478cebc22705d0a556de63f1077e193b4cd6c23ce762ee23f21744268f53b,test-secret-key-123456,\",https://nodemon.maloka.web.id/payment/payhook/callback,QRIS,3,15,0,
\.

-- ===========================================================
-- voucher_orders (from SQLite) — runnable COPY
-- ===========================================================
COPY "voucher_orders" ("id","orderId","voucherTypeId","voucherName","profile","sessionId","price","uniqueCode","uniqueAmount","qrString","customerName","phone","status","voucherUsername","voucherPassword","paidAt","expiresAt","note","createdAt","updatedAt") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- payhook_callback_logs (from SQLite) — runnable COPY
-- ===========================================================
COPY "payhook_callback_logs" ("id","source","amount","status","matched","matchedOrderId","note","rawPayload","processedAt") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- payhook_payment_transactions (from SQLite) — runnable COPY
-- ===========================================================
COPY "payhook_payment_transactions" ("id","orderId","reference","purpose","referenceId","amount","paymentMethod","paymentUrl","status","transactionStatus","customerName","customerEmail","phoneNumber","productDetails","rawCallback","paidAt","createdAt","updatedAt","qrString") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- midtrans_payment_transactions (from SQLite) — runnable COPY
-- ===========================================================
COPY "midtrans_payment_transactions" ("id","orderId","transactionId","purpose","referenceId","amount","acquirer","qrCodeUrl","status","transactionStatus","customerName","customerEmail","phoneNumber","productDetails","rawNotification","paidAt","createdAt","updatedAt") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- payment_transactions (from SQLite) — runnable COPY
-- ===========================================================
COPY "payment_transactions" ("id","merchantOrderId","reference","publisherOrderId","purpose","referenceId","amount","paymentMethod","qrString","paymentUrl","status","customerName","customerEmail","phoneNumber","productDetails","rawCallback","expiredAt","paidAt","createdAt","updatedAt") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- billing_customers (from SQLite) — runnable COPY
-- ===========================================================
COPY "billing_customers" ("id","name","phone","telegramId","address","type","mikrotikUser","sessionId","profile","price","billDate","status","unsettledCash","autoDisable","graceDays","reminderDays","createdAt","note") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- invoices (from SQLite) — runnable COPY
-- ===========================================================
COPY "invoices" ("id","customerId","customerName","sessionId","type","mikrotikUser","profile","amount","period","dueDate","status","paidAt","paidBy","note","createdAt","reminderSent") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- settlements (from SQLite) — runnable COPY
-- ===========================================================
COPY "settlements" ("id","collectorId","collectorName","sessionId","amount","status","createdAt","verifiedAt") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

-- ===========================================================
-- topup_requests (from SQLite) — runnable COPY
-- ===========================================================
COPY "topup_requests" ("id","resellerId","resellerName","telegramId","amount","note","requestedAt","status") FROM STDIN WITH (FORMAT csv, HEADER false);
\.

