-- Prevent concurrent delivery of the same PayHook event from being
-- recorded twice. PostgreSQL UNIQUE permits multiple NULL values, so
-- callbacks without event_id remain supported.
CREATE UNIQUE INDEX IF NOT EXISTS ux_payhook_callback_logs_event_id
  ON payhook_callback_logs (event_id)
  WHERE event_id IS NOT NULL;
