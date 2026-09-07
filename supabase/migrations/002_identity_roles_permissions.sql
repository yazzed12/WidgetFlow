begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '002_identity_roles_permissions'
  ) then
    raise exception 'WidgetFlow migration 002_identity_roles_permissions has already been applied';
  end if;
end
$migration_guard$;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text not null default '',
  role_type text not null check (role_type in ('System', 'Custom')),
  governance_level text not null check (governance_level in ('Employee', 'Manager', 'Director', 'None')),
  is_active boolean not null default true,
  is_protected boolean not null default false,
  created_by_user_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint roles_key_not_blank check (btrim(key) <> ''),
  constraint roles_name_not_blank check (btrim(name) <> ''),
  constraint roles_system_key_format check (
    role_type <> 'System' or lower(key) in ('employee', 'manager', 'director', 'admin')
  )
);

create unique index roles_key_normalized_uq on public.roles (lower(btrim(key)));
create unique index roles_name_normalized_uq on public.roles (lower(btrim(name)));
create index roles_active_governance_idx on public.roles (is_active, governance_level);

create table public.permissions (
  key text primary key,
  group_key text not null,
  label text not null,
  description text,
  created_at timestamptz not null default statement_timestamp(),
  constraint permissions_key_not_blank check (btrim(key) <> ''),
  constraint permissions_group_not_blank check (btrim(group_key) <> ''),
  constraint permissions_label_not_blank check (btrim(label) <> '')
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_key)
);

create index role_permissions_permission_idx on public.role_permissions (permission_key, role_id);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null,
  email text not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  department text not null default '',
  manager_user_id uuid references public.profiles(id) on delete set null,
  status text not null default 'Active'
    check (status in ('Active', 'Inactive', 'Resigned', 'Terminated')),
  avatar_initials text,
  avatar_background text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_full_name_not_blank check (btrim(full_name) <> ''),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_manager_not_self check (manager_user_id is null or manager_user_id <> id)
);

create unique index profiles_email_normalized_uq on public.profiles (lower(btrim(email)));
create index profiles_role_status_idx on public.profiles (role_id, status);
create index profiles_manager_idx on public.profiles (manager_user_id) where manager_user_id is not null;
create index profiles_status_idx on public.profiles (status);

alter table public.roles
  add constraint roles_created_by_user_fk
  foreign key (created_by_user_id) references public.profiles(id) on delete set null;

create index roles_created_by_user_idx on public.roles (created_by_user_id)
where created_by_user_id is not null;

create table public.user_role_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  previous_role_id uuid references public.roles(id) on delete set null,
  new_role_id uuid not null references public.roles(id) on delete restrict,
  previous_role_key text,
  previous_role_name text,
  new_role_key text not null,
  new_role_name text not null,
  changed_by_user_id uuid references public.profiles(id) on delete set null,
  changed_by_name text not null,
  changed_by_role_key text not null,
  reason text,
  changed_at timestamptz not null default statement_timestamp(),
  constraint user_role_history_new_role_key_not_blank check (btrim(new_role_key) <> ''),
  constraint user_role_history_new_role_name_not_blank check (btrim(new_role_name) <> ''),
  constraint user_role_history_actor_name_not_blank check (btrim(changed_by_name) <> '')
);

create index user_role_history_user_time_idx
  on public.user_role_history (user_id, changed_at desc);
create index user_role_history_actor_idx
  on public.user_role_history (changed_by_user_id, changed_at desc)
  where changed_by_user_id is not null;

create trigger roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

insert into public.roles (
  id, key, name, description, role_type, governance_level, is_active, is_protected
)
values
  ('00000000-0000-4000-8000-000000000001', 'employee', 'Employee', 'Standard operational report author.', 'System', 'Employee', true, false),
  ('00000000-0000-4000-8000-000000000002', 'manager', 'Manager', 'Operational manager and assigned template approver.', 'System', 'Manager', true, false),
  ('00000000-0000-4000-8000-000000000003', 'director', 'Director', 'Executive reviewer with organization report visibility.', 'System', 'Director', true, false),
  ('00000000-0000-4000-8000-000000000004', 'admin', 'Admin', 'Protected WidgetFlow platform administrator.', 'System', 'None', true, true);

insert into public.permissions (key, group_key, label)
values
  ('templates.view_approved', 'templates', 'View Approved Templates'),
  ('templates.create', 'templates', 'Create Templates'),
  ('templates.edit_own_draft', 'templates', 'Edit Own Draft Templates'),
  ('templates.submit', 'templates', 'Submit Templates'),
  ('templates.preview', 'templates', 'Preview Templates'),
  ('templates.use', 'templates', 'Use Templates'),
  ('studio.access', 'studio', 'Use Template Studio'),
  ('studio.elements.use', 'studio', 'Use Elements'),
  ('studio.data_fields.use', 'studio', 'Use Data Fields'),
  ('studio.content.use', 'studio', 'Use Content Library'),
  ('studio.standard_packs.use', 'studio', 'Use Standard Packs'),
  ('studio.my_packs.create', 'studio', 'Create My Packs'),
  ('studio.themes.use', 'studio', 'Use Themes'),
  ('studio.sections.use', 'studio', 'Use Sections'),
  ('studio.text.use', 'studio', 'Use Text Tools'),
  ('studio.workflow.use', 'studio', 'Use Workflow Designer'),
  ('template_approvals.view', 'template-governance', 'View Template Approval Queue'),
  ('template_approvals.approve', 'template-governance', 'Approve Templates'),
  ('template_approvals.reject', 'template-governance', 'Reject Templates'),
  ('template_approvals.comment', 'template-governance', 'Comment on Template Requests'),
  ('reports.view_own', 'reports', 'View Own Reports'),
  ('reports.view_received', 'reports', 'View Received Reports'),
  ('reports.view_signed', 'reports', 'View Signed Reports'),
  ('reports.view_organization', 'reports', 'View Organization Reports'),
  ('reports.create', 'reports', 'Create Reports'),
  ('reports.edit_draft', 'reports', 'Edit Draft Reports'),
  ('reports.complete', 'reports', 'Complete Reports'),
  ('reports.send', 'reports', 'Send Reports'),
  ('reports.comment', 'reports', 'Comment on Reports'),
  ('reports.return', 'reports', 'Return Reports for Changes'),
  ('reports.reject', 'reports', 'Reject Reports'),
  ('reports.sign', 'reports', 'Sign Reports'),
  ('notifications.view', 'notifications', 'View Notifications'),
  ('notifications.read_state.manage', 'notifications', 'Manage Notification Read State'),
  ('search.use', 'other', 'Use Global Search'),
  ('audit_history.view', 'other', 'View Audit History'),
  ('signature_profile.use', 'other', 'Use Personal Signature Profile');

with common_permission(permission_key) as (
  select unnest(array[
    'templates.view_approved', 'templates.create', 'templates.edit_own_draft',
    'templates.submit', 'templates.preview', 'templates.use', 'studio.access',
    'studio.elements.use', 'studio.data_fields.use', 'studio.content.use',
    'studio.standard_packs.use', 'studio.my_packs.create', 'studio.themes.use',
    'studio.sections.use', 'studio.text.use', 'studio.workflow.use',
    'template_approvals.comment', 'reports.view_own', 'reports.view_received',
    'reports.view_signed', 'reports.create', 'reports.edit_draft', 'reports.complete',
    'reports.send', 'reports.comment', 'reports.return', 'reports.reject',
    'reports.sign', 'notifications.view', 'notifications.read_state.manage',
    'search.use', 'audit_history.view', 'signature_profile.use'
  ]::text[])
), operational_roles(role_key) as (
  values ('employee'), ('manager'), ('director')
)
insert into public.role_permissions (role_id, permission_key)
select r.id, cp.permission_key
from operational_roles operation_role
join public.roles r on r.key = operation_role.role_key
cross join common_permission cp;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.roles r
cross join (
  values
    ('template_approvals.view'),
    ('template_approvals.approve'),
    ('template_approvals.reject')
) as p(permission_key)
where r.key in ('manager', 'director');

insert into public.role_permissions (role_id, permission_key)
select r.id, 'reports.view_organization'
from public.roles r
where r.key = 'director';


-- Lock down every table created by this migration immediately.
-- Phase 2/3 will add only the explicit grants and RLS policies required by the product.
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_role_history enable row level security;

revoke all privileges on table
  public.roles,
  public.permissions,
  public.role_permissions,
  public.profiles,
  public.user_role_history
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('002_identity_roles_permissions', 'Supabase Auth profiles, database-backed roles, permissions, and role history');

commit;
