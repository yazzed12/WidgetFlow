begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '003_configuration_governance'
  ) then
    raise exception 'WidgetFlow migration 003_configuration_governance has already been applied';
  end if;
end
$migration_guard$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  status text not null default 'Active' check (status in ('Active', 'Inactive')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint categories_name_not_blank check (btrim(name) <> '')
);

create unique index categories_name_normalized_uq on public.categories (lower(btrim(name)));
create index categories_status_name_idx on public.categories (status, name);

create table public.feature_settings (
  key text primary key,
  name text not null,
  category text not null,
  description text not null default '',
  enabled boolean not null default true,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint feature_settings_key_not_blank check (btrim(key) <> ''),
  constraint feature_settings_name_not_blank check (btrim(name) <> '')
);

create index feature_settings_category_enabled_idx
  on public.feature_settings (category, enabled);

create table public.element_settings (
  key text primary key,
  name text not null,
  category text not null,
  description text not null default '',
  enabled boolean not null default true,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint element_settings_key_not_blank check (btrim(key) <> ''),
  constraint element_settings_name_not_blank check (btrim(name) <> '')
);

create index element_settings_category_enabled_idx
  on public.element_settings (category, enabled);

create table public.system_settings (
  id text primary key default 'default' check (id = 'default'),
  organization_name text not null default 'WidgetFlow',
  platform_name text not null default 'WidgetFlow',
  default_template_version text not null default 'v1.0',
  allow_report_rejection boolean not null default true,
  allow_report_return boolean not null default true,
  digital_signatures_enabled boolean not null default true,
  template_governance_enabled boolean not null default true,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint system_settings_org_name_not_blank check (btrim(organization_name) <> ''),
  constraint system_settings_platform_name_not_blank check (btrim(platform_name) <> ''),
  constraint system_settings_version_not_blank check (btrim(default_template_version) <> '')
);

create table public.governance_routes (
  id uuid primary key default gen_random_uuid(),
  creator_governance_level text not null
    check (creator_governance_level in ('Employee', 'Manager', 'Director')),
  strategy text not null
    check (strategy in ('SPECIFIC_USER', 'ROLE_QUEUE', 'DIRECT_PUBLISH')),
  target_role_id uuid references public.roles(id) on delete restrict,
  specific_user_id uuid references public.profiles(id) on delete restrict,
  is_active boolean not null default true,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint governance_routes_strategy_shape check (
    (strategy = 'DIRECT_PUBLISH' and target_role_id is null and specific_user_id is null)
    or (strategy = 'ROLE_QUEUE' and target_role_id is not null and specific_user_id is null)
    or (strategy = 'SPECIFIC_USER' and target_role_id is not null and specific_user_id is not null)
  )
);

create unique index governance_routes_active_level_uq
  on public.governance_routes (creator_governance_level)
  where is_active;
create index governance_routes_target_role_idx
  on public.governance_routes (target_role_id)
  where target_role_id is not null;
create index governance_routes_specific_user_idx
  on public.governance_routes (specific_user_id)
  where specific_user_id is not null;

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create trigger system_settings_set_updated_at
before update on public.system_settings
for each row execute function private.set_updated_at();

create trigger governance_routes_set_updated_at
before update on public.governance_routes
for each row execute function private.set_updated_at();


-- Lock down every table created by this migration immediately.
-- Phase 2/3 will add only the explicit grants and RLS policies required by the product.
alter table public.categories enable row level security;
alter table public.feature_settings enable row level security;
alter table public.element_settings enable row level security;
alter table public.system_settings enable row level security;
alter table public.governance_routes enable row level security;

revoke all privileges on table
  public.categories,
  public.feature_settings,
  public.element_settings,
  public.system_settings,
  public.governance_routes
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('003_configuration_governance', 'Typed platform configuration, categories, feature and element settings, and governance routes');

commit;
