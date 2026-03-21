-- Runtime sync expansion: enforce idempotent upsert key for operation assignments.
-- Required for upsert(onConflict: operation_id,user_email,role,source).

create unique index if not exists idx_assignments_operation_user_role_source
  on assignments(operation_id, user_email, role, source);
