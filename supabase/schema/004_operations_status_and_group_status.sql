alter table if exists operations
  add column if not exists business_status text,
  add column if not exists operation_group_status text;
