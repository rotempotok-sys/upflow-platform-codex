alter table if exists operations
  add column if not exists sales_status text,
  add column if not exists procurement_status text;
