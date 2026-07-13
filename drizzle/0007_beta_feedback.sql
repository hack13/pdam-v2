CREATE TABLE IF NOT EXISTS feedback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'general',
  message text NOT NULL,
  page_url text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  reviewed_by_user_id text REFERENCES auth_user(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_items_status_idx ON feedback_items(status);
CREATE INDEX IF NOT EXISTS feedback_items_user_idx ON feedback_items(user_id);
CREATE INDEX IF NOT EXISTS feedback_items_created_at_idx ON feedback_items(created_at);

CREATE TABLE IF NOT EXISTS feedback_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  storage_key text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_attachments_feedback_idx ON feedback_attachments(feedback_id);
