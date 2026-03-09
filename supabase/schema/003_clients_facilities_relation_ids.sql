alter table if exists clients
  add column if not exists facilities_relation_ids text[] not null default '{}';
