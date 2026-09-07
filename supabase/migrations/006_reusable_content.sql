begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '006_reusable_content'
  ) then
    raise exception 'WidgetFlow migration 006_reusable_content has already been applied';
  end if;
end
$migration_guard$;

create table public.content_library_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null,
  content_type text not null
    check (content_type in ('Heading', 'Text Block', 'Disclaimer', 'Instruction', 'Label', 'Section Intro')),
  content_value text not null,
  configuration jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  creator_name_snapshot text not null,
  creator_role_key_snapshot text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint content_library_name_not_blank check (btrim(name) <> ''),
  constraint content_library_category_not_blank check (btrim(category) <> ''),
  constraint content_library_value_not_blank check (btrim(content_value) <> ''),
  constraint content_library_creator_not_blank check (
    btrim(creator_name_snapshot) <> '' and btrim(creator_role_key_snapshot) <> ''
  )
);

create index content_library_enabled_category_idx
  on public.content_library_items (is_enabled, category, name);
create index content_library_creator_idx
  on public.content_library_items (created_by_user_id, created_at desc)
  where created_by_user_id is not null;

create table public.standard_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category_id uuid references public.categories(id) on delete set null,
  category_name_snapshot text,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'disabled', 'archived')),
  created_by_user_id uuid references public.profiles(id) on delete set null,
  creator_name_snapshot text not null,
  creator_role_key_snapshot text not null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint standard_packs_name_not_blank check (btrim(name) <> ''),
  constraint standard_packs_creator_not_blank check (
    btrim(creator_name_snapshot) <> '' and btrim(creator_role_key_snapshot) <> ''
  )
);

create index standard_packs_status_category_idx
  on public.standard_packs (status, category_id, updated_at desc);

create table public.standard_pack_versions (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.standard_packs(id) on delete restrict,
  version_label text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded')),
  structure_snapshot jsonb not null default '[]'::jsonb,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  creator_name_snapshot text not null,
  creator_role_key_snapshot text not null,
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz,
  constraint standard_pack_versions_label_not_blank check (btrim(version_label) <> ''),
  constraint standard_pack_versions_creator_not_blank check (
    btrim(creator_name_snapshot) <> '' and btrim(creator_role_key_snapshot) <> ''
  ),
  constraint standard_pack_versions_publish_shape check (
    status <> 'published' or published_at is not null
  ),
  unique (pack_id, version_label)
);

create index standard_pack_versions_pack_status_idx
  on public.standard_pack_versions (pack_id, status, created_at desc);

create table public.standard_pack_items (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null references public.standard_pack_versions(id) on delete cascade,
  source_type text not null check (source_type in ('field', 'element', 'content')),
  source_key text,
  source_content_item_id uuid references public.content_library_items(id) on delete set null,
  label text not null,
  configuration_snapshot jsonb not null,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default statement_timestamp(),
  constraint standard_pack_items_label_not_blank check (btrim(label) <> ''),
  constraint standard_pack_items_content_source_shape check (
    source_type = 'content' or source_content_item_id is null
  ),
  unique (pack_version_id, display_order)
);

create index standard_pack_items_source_content_idx
  on public.standard_pack_items (source_content_item_id)
  where source_content_item_id is not null;

create table public.user_packs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  normalized_name text not null,
  category text not null,
  description text not null default '',
  icon_name text,
  schema_snapshot jsonb not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_packs_name_not_blank check (btrim(name) <> ''),
  constraint user_packs_normalized_name_not_blank check (btrim(normalized_name) <> ''),
  constraint user_packs_category_not_blank check (btrim(category) <> '')
);

create unique index user_packs_owner_name_uq
  on public.user_packs (owner_user_id, lower(btrim(normalized_name)))
  where status = 'active';
create index user_packs_owner_updated_idx
  on public.user_packs (owner_user_id, updated_at desc);

create trigger content_library_items_set_updated_at
before update on public.content_library_items
for each row execute function private.set_updated_at();

create trigger standard_packs_set_updated_at
before update on public.standard_packs
for each row execute function private.set_updated_at();

create trigger user_packs_set_updated_at
before update on public.user_packs
for each row execute function private.set_updated_at();


-- Lock down every table created by this migration immediately.
-- Phase 2/3 will add only the explicit grants and RLS policies required by the product.
alter table public.content_library_items enable row level security;
alter table public.standard_packs enable row level security;
alter table public.standard_pack_versions enable row level security;
alter table public.standard_pack_items enable row level security;
alter table public.user_packs enable row level security;

revoke all privileges on table
  public.content_library_items,
  public.standard_packs,
  public.standard_pack_versions,
  public.standard_pack_items,
  public.user_packs
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('006_reusable_content', 'Versioned Admin Standard Packs, user-owned Packs, and Content Library');

commit;
