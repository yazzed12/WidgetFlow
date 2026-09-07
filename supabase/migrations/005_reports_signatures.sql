begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '005_reports_signatures'
  ) then
    raise exception 'WidgetFlow migration 005_reports_signatures has already been applied';
  end if;
end
$migration_guard$;

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete restrict,
  template_version_id uuid not null references public.template_versions(id) on delete restrict,
  template_name_snapshot text not null,
  template_version_snapshot text not null,
  category_id uuid not null references public.categories(id) on delete restrict,
  category_name_snapshot text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft', 'completed', 'sent', 'returned', 'signed', 'rejected')),
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  creator_name text not null,
  creator_email text,
  creator_role_id uuid references public.roles(id) on delete set null,
  creator_role_key text not null,
  creator_role_name text not null,
  creator_governance_level text not null
    check (creator_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  recipient_user_id uuid references public.profiles(id) on delete restrict,
  recipient_name_snapshot text,
  recipient_email_snapshot text,
  recipient_role_id_snapshot uuid references public.roles(id) on delete set null,
  recipient_role_key_snapshot text,
  recipient_role_name_snapshot text,
  recipient_governance_level_snapshot text
    check (recipient_governance_level_snapshot is null or recipient_governance_level_snapshot in ('Employee', 'Manager', 'Director', 'None')),
  sender_note text,
  return_reason text,
  rejection_reason text,
  completed_at timestamptz,
  sent_at timestamptz,
  returned_at timestamptz,
  signed_at timestamptz,
  rejected_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint reports_title_not_blank check (btrim(title) <> ''),
  constraint reports_template_snapshot_not_blank check (
    btrim(template_name_snapshot) <> '' and btrim(template_version_snapshot) <> ''
  ),
  constraint reports_creator_snapshot_not_blank check (
    btrim(creator_name) <> '' and btrim(creator_role_key) <> '' and btrim(creator_role_name) <> ''
  ),
  constraint reports_no_self_recipient check (
    recipient_user_id is null or recipient_user_id <> created_by_user_id
  ),
  constraint reports_completed_shape check (
    status not in ('completed', 'sent', 'returned', 'signed', 'rejected') or completed_at is not null
  ),
  constraint reports_sent_shape check (
    status not in ('sent', 'returned', 'signed', 'rejected')
    or (recipient_user_id is not null and sent_at is not null)
  ),
  constraint reports_returned_shape check (
    status <> 'returned'
    or (returned_at is not null and nullif(btrim(return_reason), '') is not null)
  ),
  constraint reports_signed_shape check (
    status <> 'signed' or (signed_at is not null and locked_at is not null)
  ),
  constraint reports_rejected_shape check (
    status <> 'rejected'
    or (rejected_at is not null and locked_at is not null and nullif(btrim(rejection_reason), '') is not null)
  )
);

create index reports_creator_status_idx
  on public.reports (created_by_user_id, status, updated_at desc);
create index reports_recipient_status_idx
  on public.reports (recipient_user_id, status, sent_at desc)
  where recipient_user_id is not null;
create index reports_status_updated_idx
  on public.reports (status, updated_at desc);
create index reports_template_version_idx
  on public.reports (template_version_id, created_at desc);
create index reports_category_status_idx
  on public.reports (category_id, status, updated_at desc);

create table public.report_values (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  template_field_id uuid references public.template_fields(id) on delete set null,
  field_key text not null,
  field_label_snapshot text not null,
  field_type_snapshot text not null,
  value jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint report_values_field_key_not_blank check (btrim(field_key) <> ''),
  constraint report_values_field_label_not_blank check (btrim(field_label_snapshot) <> ''),
  constraint report_values_field_type_not_blank check (btrim(field_type_snapshot) <> ''),
  unique (report_id, field_key)
);

create index report_values_template_field_idx
  on public.report_values (template_field_id)
  where template_field_id is not null;

create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
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
  constraint report_comments_author_not_blank check (
    btrim(author_name) <> '' and btrim(author_role_key) <> '' and btrim(author_role_name) <> ''
  ),
  constraint report_comments_message_not_blank check (btrim(message) <> '')
);

create index report_comments_report_time_idx
  on public.report_comments (report_id, created_at);
create index report_comments_author_time_idx
  on public.report_comments (author_user_id, created_at desc)
  where author_user_id is not null;

create table public.report_audit_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_email text,
  actor_role_id uuid references public.roles(id) on delete set null,
  actor_role_key text not null,
  actor_role_name text not null,
  actor_governance_level text not null
    check (actor_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  report_title_snapshot text not null,
  from_status text,
  to_status text,
  comment text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint report_audit_event_type_not_blank check (btrim(event_type) <> ''),
  constraint report_audit_actor_not_blank check (
    btrim(actor_name) <> '' and btrim(actor_role_key) <> '' and btrim(actor_role_name) <> ''
  )
);

create index report_audit_report_time_idx
  on public.report_audit_events (report_id, occurred_at desc);
create index report_audit_actor_time_idx
  on public.report_audit_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index report_audit_type_time_idx
  on public.report_audit_events (event_type, occurred_at desc);

create table public.signature_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete restrict,
  signature_method text not null
    check (signature_method in ('uploaded', 'drawn', 'typed')),
  signature_asset_id uuid,
  typed_name text,
  drawing_data jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint signature_profiles_method_shape check (
    (signature_method = 'typed' and nullif(btrim(typed_name), '') is not null)
    or (signature_method = 'drawn' and drawing_data is not null)
    or (signature_method = 'uploaded' and signature_asset_id is not null)
  )
);

create index signature_profiles_active_user_idx
  on public.signature_profiles (user_id)
  where is_active;

create table public.report_signature_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  event_type text not null check (event_type in ('signed', 'superseded', 'revoked')),
  supersedes_event_id uuid references public.report_signature_events(id) on delete restrict,
  component_id text,
  component_key text,
  signer_user_id uuid references public.profiles(id) on delete set null,
  signer_name text not null,
  signer_email text,
  signer_role_id uuid references public.roles(id) on delete set null,
  signer_role_key text not null,
  signer_role_name text not null,
  signer_governance_level text not null
    check (signer_governance_level in ('Employee', 'Manager', 'Director', 'None')),
  signature_role text check (signature_role in ('sender', 'receiver')),
  signature_method text check (signature_method in ('uploaded', 'drawn', 'typed')),
  signature_profile_id uuid references public.signature_profiles(id) on delete set null,
  signature_asset_id uuid,
  typed_name_snapshot text,
  confirmation_statement text,
  verification_id text unique,
  signed_content_hash text,
  event_reason text,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint report_signature_events_signer_not_blank check (
    btrim(signer_name) <> '' and btrim(signer_role_key) <> '' and btrim(signer_role_name) <> ''
  ),
  constraint report_signature_events_event_shape check (
    (
      event_type = 'signed'
      and supersedes_event_id is null
      and signature_role is not null
      and signature_method is not null
      and nullif(btrim(verification_id), '') is not null
      and nullif(btrim(signed_content_hash), '') is not null
    )
    or (
      event_type in ('superseded', 'revoked')
      and supersedes_event_id is not null
      and nullif(btrim(event_reason), '') is not null
    )
  )
);

create index report_signature_events_report_time_idx
  on public.report_signature_events (report_id, occurred_at desc);
create index report_signature_events_signer_time_idx
  on public.report_signature_events (signer_user_id, occurred_at desc)
  where signer_user_id is not null;
create index report_signature_events_supersedes_idx
  on public.report_signature_events (supersedes_event_id)
  where supersedes_event_id is not null;
create index report_signature_events_component_idx
  on public.report_signature_events (report_id, component_key, occurred_at desc)
  where component_key is not null;

create trigger reports_set_updated_at
before update on public.reports
for each row execute function private.set_updated_at();

create trigger report_values_set_updated_at
before update on public.report_values
for each row execute function private.set_updated_at();

create trigger signature_profiles_set_updated_at
before update on public.signature_profiles
for each row execute function private.set_updated_at();


-- Lock down every table created by this migration immediately.
-- Phase 2/3 will add only the explicit grants and RLS policies required by the product.
alter table public.reports enable row level security;
alter table public.report_values enable row level security;
alter table public.report_comments enable row level security;
alter table public.report_audit_events enable row level security;
alter table public.signature_profiles enable row level security;
alter table public.report_signature_events enable row level security;

revoke all privileges on table
  public.reports,
  public.report_values,
  public.report_comments,
  public.report_audit_events,
  public.signature_profiles,
  public.report_signature_events
from anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('005_reports_signatures', 'Version-bound reports, values, comments, audit events, and consolidated signature events');

commit;
