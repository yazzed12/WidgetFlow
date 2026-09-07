begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '007_workflows'
  ) then
    raise exception 'WidgetFlow migration 007_workflows has already been applied';
  end if;
end
$migration_guard$;

create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.templates(id) on delete restrict,
  name text not null,
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  creator_name_snapshot text not null,
  creator_role_key_snapshot text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint workflow_definitions_name_not_blank check (btrim(name) <> ''),
  constraint workflow_definitions_creator_not_blank check (
    btrim(creator_name_snapshot) <> '' and btrim(creator_role_key_snapshot) <> ''
  )
);

create index workflow_definitions_template_status_idx
  on public.workflow_definitions (template_id, status, updated_at desc)
  where template_id is not null;

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_definition_id uuid not null references public.workflow_definitions(id) on delete restrict,
  version_label text not null,
  steps_snapshot jsonb not null,
  published_by_user_id uuid references public.profiles(id) on delete set null,
  publisher_name_snapshot text not null,
  publisher_role_key_snapshot text not null,
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz not null default statement_timestamp(),
  constraint workflow_versions_label_not_blank check (btrim(version_label) <> ''),
  constraint workflow_versions_publisher_not_blank check (
    btrim(publisher_name_snapshot) <> '' and btrim(publisher_role_key_snapshot) <> ''
  ),
  unique (workflow_definition_id, version_label)
);

create index workflow_versions_definition_published_idx
  on public.workflow_versions (workflow_definition_id, published_at desc);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete restrict,
  workflow_version_id uuid not null references public.workflow_versions(id) on delete restrict,
  current_step_key text not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'returned', 'rejected', 'completed', 'cancelled')),
  started_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  constraint workflow_instances_step_not_blank check (btrim(current_step_key) <> ''),
  constraint workflow_instances_completion_shape check (
    status not in ('rejected', 'completed', 'cancelled') or completed_at is not null
  )
);

create index workflow_instances_status_updated_idx
  on public.workflow_instances (status, updated_at desc);
create index workflow_instances_version_idx
  on public.workflow_instances (workflow_version_id, started_at desc);

create table public.workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete restrict,
  step_key text not null,
  step_name text not null,
  attempt_number integer not null default 1 check (attempt_number > 0),
  assignment_type text not null check (assignment_type in ('user', 'role')),
  assigned_user_id uuid references public.profiles(id) on delete set null,
  assigned_user_name_snapshot text,
  assigned_role_id uuid references public.roles(id) on delete restrict,
  assigned_role_key_snapshot text,
  assigned_role_name_snapshot text,
  claimed_by_user_id uuid references public.profiles(id) on delete set null,
  claimed_by_name_snapshot text,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'returned', 'rejected', 'cancelled')),
  concurrency_version bigint not null default 0 check (concurrency_version >= 0),
  created_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz,
  completed_at timestamptz,
  due_at timestamptz,
  constraint workflow_tasks_step_key_not_blank check (btrim(step_key) <> ''),
  constraint workflow_tasks_step_name_not_blank check (btrim(step_name) <> ''),
  constraint workflow_tasks_assignment_shape check (
    (
      assignment_type = 'user'
      and assigned_user_id is not null
      and assigned_user_name_snapshot is not null
      and assigned_role_id is null
    )
    or (
      assignment_type = 'role'
      and assigned_role_id is not null
      and assigned_role_key_snapshot is not null
      and assigned_role_name_snapshot is not null
      and assigned_user_id is null
    )
  ),
  constraint workflow_tasks_completion_shape check (
    status = 'pending' or completed_at is not null
  ),
  constraint workflow_tasks_claim_shape check (
    claimed_by_user_id is null
    or (assignment_type = 'role' and claimed_by_name_snapshot is not null and claimed_at is not null)
  ),
  unique (workflow_instance_id, step_key, attempt_number)
);

create index workflow_tasks_user_pending_idx
  on public.workflow_tasks (assigned_user_id, created_at)
  where status = 'pending' and assigned_user_id is not null;
create index workflow_tasks_role_pending_idx
  on public.workflow_tasks (assigned_role_id, created_at)
  where status = 'pending' and assigned_role_id is not null;
create index workflow_tasks_claimed_by_idx
  on public.workflow_tasks (claimed_by_user_id, claimed_at desc)
  where claimed_by_user_id is not null;
create index workflow_tasks_instance_status_idx
  on public.workflow_tasks (workflow_instance_id, status, created_at);

create table public.workflow_events (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete restrict,
  workflow_task_id uuid references public.workflow_tasks(id) on delete restrict,
  event_type text not null,
  step_key_snapshot text not null,
  step_name_snapshot text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_email text,
  actor_role_id uuid references public.roles(id) on delete set null,
  actor_role_key text not null,
  actor_role_name text not null,
  actor_governance_level text not null
    check (actor_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  action text,
  comment text,
  from_status text,
  to_status text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint workflow_events_type_not_blank check (btrim(event_type) <> ''),
  constraint workflow_events_step_not_blank check (
    btrim(step_key_snapshot) <> '' and btrim(step_name_snapshot) <> ''
  ),
  constraint workflow_events_actor_not_blank check (
    btrim(actor_name) <> '' and btrim(actor_role_key) <> '' and btrim(actor_role_name) <> ''
  )
);

create index workflow_events_instance_time_idx
  on public.workflow_events (workflow_instance_id, occurred_at desc);
create index workflow_events_task_time_idx
  on public.workflow_events (workflow_task_id, occurred_at desc)
  where workflow_task_id is not null;
create index workflow_events_actor_time_idx
  on public.workflow_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

create trigger workflow_definitions_set_updated_at
before update on public.workflow_definitions
for each row execute function private.set_updated_at();

create trigger workflow_instances_set_updated_at
before update on public.workflow_instances
for each row execute function private.set_updated_at();


-- Lock down every table created by this migration immediately.
-- Phase 2/3 will add only the explicit grants and RLS policies required by the product.
alter table public.workflow_definitions enable row level security;
alter table public.workflow_versions enable row level security;
alter table public.workflow_instances enable row level security;
alter table public.workflow_tasks enable row level security;
alter table public.workflow_events enable row level security;

revoke all privileges on table
  public.workflow_definitions,
  public.workflow_versions,
  public.workflow_instances,
  public.workflow_tasks,
  public.workflow_events
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('007_workflows', 'Versioned workflow definitions and role-ID/user-ID based execution foundation');

commit;
