-- 008_schedule_entries_canonical_fields.sql
-- Phase 1a: adds task_type, planned_date, planned_datetime to schedule_entries
-- Required by: Exception Engine (OVERDUE_EXECUTION), technician-view projection
-- Safe to re-run (all IF NOT EXISTS / IF EXISTS guards)

alter table if exists schedule_entries
  add column if not exists task_type        text,
  add column if not exists planned_date     date,
  add column if not exists planned_datetime timestamptz;

create index if not exists idx_schedule_planned_date on schedule_entries(planned_date);
create index if not exists idx_schedule_task_type    on schedule_entries(task_type);
