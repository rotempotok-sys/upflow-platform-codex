-- 006_operations_canonical_fields.sql
-- Phase 1a: adds missing canonical columns to the operations table
-- Safe to re-run (all IF NOT EXISTS / IF EXISTS guards)

alter table if exists operations
  add column if not exists title                text,
  add column if not exists request_purpose_raw  text,
  add column if not exists operation_category   text,
  add column if not exists is_open              boolean not null default false,
  add column if not exists requires_schedule    boolean not null default false,
  add column if not exists requires_report      boolean not null default false,
  add column if not exists requires_qa          boolean not null default false,
  add column if not exists closed_at            timestamptz;

create index if not exists idx_operations_category  on operations(operation_category);
create index if not exists idx_operations_is_open   on operations(is_open);
create index if not exists idx_operations_client_id on operations(client_id);
