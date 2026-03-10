-- 007_users_permission_columns.sql
-- Phase 1a: adds employee_status + permission-gate columns to the users table
-- Source board: 1729562303 (Auth board)
-- Column mapping:
--   can_team       ← boolean_mm1699jc
--   can_calendar   ← boolean_mm1680j8
--   can_clients    ← boolean_mm16kwda
--   can_equipment  ← boolean_mm16e9yf
--   can_assistant  ← boolean_mm16vydm
--   can_ai_ask     ← boolean_mm16vdk4
-- Safe to re-run (all IF NOT EXISTS / IF EXISTS guards)

alter table if exists users
  add column if not exists employee_status text,
  add column if not exists can_team        boolean not null default false,
  add column if not exists can_calendar    boolean not null default false,
  add column if not exists can_clients     boolean not null default false,
  add column if not exists can_equipment   boolean not null default false,
  add column if not exists can_assistant   boolean not null default false,
  add column if not exists can_ai_ask      boolean not null default false;
