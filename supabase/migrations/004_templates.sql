begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '004_templates'
  ) then
    raise exception 'WidgetFlow migration 004_templates has already been applied';
  end if;
end
$migration_guard$;

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category_id uuid not null references public.categories(id) on delete restrict,
  version_label text not null default 'v1.0',
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'approved', 'rejected', 'archived', 'superseded')),
  creation_method text not null default 'blank'
    check (creation_method in ('blank', 'template', 'import')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  creator_name text not null,
  creator_email text,
  creator_role_id uuid references public.roles(id) on delete set null,
  creator_role_key text not null,
  creator_role_name text not null,
  creator_governance_level text not null
    check (creator_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  assignment_strategy text
    check (assignment_strategy in ('SPECIFIC_USER', 'ROLE_QUEUE', 'DIRECT_PUBLISH')),
  target_role_id uuid references public.roles(id) on delete restrict,
  target_role_key_snapshot text,
  target_role_name_snapshot text,
  routing_specific_user_id uuid references public.profiles(id) on delete restrict,
  assigned_reviewer_user_id uuid references public.profiles(id) on delete restrict,
  assigned_reviewer_name_snapshot text,
  assigned_reviewer_role_id_snapshot uuid references public.roles(id) on delete set null,
  assigned_reviewer_role_key_snapshot text,
  assigned_reviewer_role_name_snapshot text,
  assigned_reviewer_governance_level_snapshot text
    check (assigned_reviewer_governance_level_snapshot is null or assigned_reviewer_governance_level_snapshot in ('Employee', 'Manager', 'Director', 'None')),
  submitted_at timestamptz,
  claimed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  archived_at timestamptz,
  rejection_reason text,
  supersedes_template_id uuid references public.templates(id) on delete restrict,
  rules jsonb not null default '[]'::jsonb,
  calculations jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  header_config jsonb not null default '{}'::jsonb,
  footer_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint templates_name_not_blank check (btrim(name) <> ''),
  constraint templates_version_not_blank check (btrim(version_label) <> ''),
  constraint templates_creator_snapshot_not_blank check (
    btrim(creator_name) <> '' and btrim(creator_role_key) <> '' and btrim(creator_role_name) <> ''
  ),
  constraint templates_not_self_superseding check (supersedes_template_id is null or supersedes_template_id <> id),
  constraint templates_routing_shape check (
    assignment_strategy is null
    or (
      assignment_strategy = 'DIRECT_PUBLISH'
      and target_role_id is null
      and routing_specific_user_id is null
      and assigned_reviewer_user_id is null
    )
    or (
      assignment_strategy = 'ROLE_QUEUE'
      and target_role_id is not null
      and routing_specific_user_id is null
    )
    or (
      assignment_strategy = 'SPECIFIC_USER'
      and target_role_id is not null
      and routing_specific_user_id is not null
      and assigned_reviewer_user_id = routing_specific_user_id
    )
  ),
  constraint templates_submission_shape check (
    status in ('draft', 'rejected', 'archived', 'superseded')
    or submitted_at is not null
  ),
  constraint templates_rejection_shape check (
    status <> 'rejected'
    or (rejected_at is not null and nullif(btrim(rejection_reason), '') is not null)
  )
);

create index templates_creator_status_idx
  on public.templates (created_by_user_id, status, updated_at desc);
create index templates_status_category_idx
  on public.templates (status, category_id, updated_at desc);
create index templates_target_role_queue_idx
  on public.templates (target_role_id, submitted_at)
  where status = 'pending_approval' and assignment_strategy = 'ROLE_QUEUE';
create index templates_unclaimed_role_queue_idx
  on public.templates (target_role_id, submitted_at)
  where status = 'pending_approval'
    and assignment_strategy = 'ROLE_QUEUE'
    and assigned_reviewer_user_id is null;
create index templates_reviewer_pending_idx
  on public.templates (assigned_reviewer_user_id, submitted_at)
  where status = 'pending_approval' and assigned_reviewer_user_id is not null;
create index templates_supersedes_idx
  on public.templates (supersedes_template_id)
  where supersedes_template_id is not null;

create table public.template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  name text not null,
  description text,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint template_sections_name_not_blank check (btrim(name) <> ''),
  unique (template_id, display_order)
);

create index template_sections_template_idx
  on public.template_sections (template_id, display_order);

create table public.template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  section_id uuid references public.template_sections(id) on delete set null,
  field_key text not null,
  label text not null,
  field_type text not null,
  is_required boolean not null default false,
  placeholder text,
  description text,
  default_value jsonb,
  layout_width text not null default 'full'
    check (layout_width in ('full', 'half', 'third')),
  validation_rules jsonb not null default '{}'::jsonb,
  options jsonb not null default '[]'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint template_fields_key_not_blank check (btrim(field_key) <> ''),
  constraint template_fields_label_not_blank check (btrim(label) <> ''),
  constraint template_fields_type_not_blank check (btrim(field_type) <> ''),
  unique (template_id, field_key),
  unique (template_id, display_order)
);

create index template_fields_template_section_idx
  on public.template_fields (template_id, section_id, display_order);

create table public.template_tags (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint template_tags_tag_not_blank check (btrim(tag) <> '')
);

create unique index template_tags_template_normalized_uq
  on public.template_tags (template_id, lower(btrim(tag)));

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete restrict,
  version_label text not null,
  schema_snapshot jsonb not null,
  published_by_user_id uuid references public.profiles(id) on delete set null,
  publisher_name text not null,
  publisher_email text,
  publisher_role_id uuid references public.roles(id) on delete set null,
  publisher_role_key text not null,
  publisher_role_name text not null,
  publisher_governance_level text not null
    check (publisher_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  source_status text not null default 'approved'
    check (source_status in ('approved', 'archived', 'superseded')),
  created_at timestamptz not null default statement_timestamp(),
  published_at timestamptz not null default statement_timestamp(),
  constraint template_versions_version_not_blank check (btrim(version_label) <> ''),
  constraint template_versions_publisher_not_blank check (
    btrim(publisher_name) <> '' and btrim(publisher_role_key) <> '' and btrim(publisher_role_name) <> ''
  ),
  unique (template_id, version_label)
);

create index template_versions_template_published_idx
  on public.template_versions (template_id, published_at desc);

create table public.template_comments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete restrict,
  author_user_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_email text,
  author_role_id uuid references public.roles(id) on delete set null,
  author_role_key text not null,
  author_role_name text not null,
  author_governance_level text not null
    check (author_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  message text not null,
  created_at timestamptz not null default statement_timestamp(),
  constraint template_comments_author_not_blank check (
    btrim(author_name) <> '' and btrim(author_role_key) <> '' and btrim(author_role_name) <> ''
  ),
  constraint template_comments_message_not_blank check (btrim(message) <> '')
);

create index template_comments_template_time_idx
  on public.template_comments (template_id, created_at);
create index template_comments_author_time_idx
  on public.template_comments (author_user_id, created_at desc)
  where author_user_id is not null;

create table public.template_audit_events (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_email text,
  actor_role_id uuid references public.roles(id) on delete set null,
  actor_role_key text not null,
  actor_role_name text not null,
  actor_governance_level text not null
    check (actor_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  template_name_snapshot text not null,
  template_version_snapshot text not null,
  from_status text,
  to_status text,
  comment text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint template_audit_event_type_not_blank check (btrim(event_type) <> ''),
  constraint template_audit_actor_not_blank check (
    btrim(actor_name) <> '' and btrim(actor_role_key) <> '' and btrim(actor_role_name) <> ''
  )
);

create index template_audit_template_time_idx
  on public.template_audit_events (template_id, occurred_at desc);
create index template_audit_actor_time_idx
  on public.template_audit_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index template_audit_type_time_idx
  on public.template_audit_events (event_type, occurred_at desc);

create trigger templates_set_updated_at
before update on public.templates
for each row execute function private.set_updated_at();

create trigger template_sections_set_updated_at
before update on public.template_sections
for each row execute function private.set_updated_at();

create trigger template_fields_set_updated_at
before update on public.template_fields
for each row execute function private.set_updated_at();


-- Lock down every table created by this migration immediately.
-- Phase 2/3 will add only the explicit grants and RLS policies required by the product.
alter table public.templates enable row level security;
alter table public.template_sections enable row level security;
alter table public.template_fields enable row level security;
alter table public.template_tags enable row level security;
alter table public.template_versions enable row level security;
alter table public.template_comments enable row level security;
alter table public.template_audit_events enable row level security;

revoke all privileges on table
  public.templates,
  public.template_sections,
  public.template_fields,
  public.template_tags,
  public.template_versions,
  public.template_comments,
  public.template_audit_events
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('004_templates', 'Versioned templates, compositional fields, approval routing snapshots, comments, and audit events');

commit;
