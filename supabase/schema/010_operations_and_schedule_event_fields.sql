-- 010_operations_and_schedule_event_fields.sql
-- Adds missing event-related fields used by the sync process
-- Safe to re-run (all IF NOT EXISTS / IF EXISTS guards)

alter table if exists operations
  add column if not exists operation_content  text,
  add column if not exists calendar_event_id   text,
  add column if not exists calendar_event_url  text;

alter table if exists schedule_entries
  add column if not exists calendar_event_url  text;

create index if not exists idx_operations_calendar_event_id on operations(calendar_event_id);
create index if not exists idx_schedule_calendar_event_id   on schedule_entries(calendar_event_id);
