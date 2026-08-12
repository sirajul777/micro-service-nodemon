CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY,
  topic varchar(255) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_topic ON outbox_events(topic);
CREATE INDEX IF NOT EXISTS idx_outbox_events_status ON outbox_events(status);
CREATE INDEX IF NOT EXISTS idx_outbox_events_processed_at ON outbox_events(processed_at);
