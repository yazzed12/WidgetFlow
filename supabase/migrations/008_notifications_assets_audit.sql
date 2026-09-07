begin;

do $migration_guard$
begin
  if exists (
    select 1 from private.widgetflow_schema_migrations
    where id = '008_notifications_assets_audit'
  ) then
    raise exception 'WidgetFlow migration 008_notifications_assets_audit has already been applied';
  end if;
end
$migration_guard$;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  notification_type text not null,
  title text not null,
  message text not null,
  related_template_id uuid references public.templates(id) on delete set null,
  related_report_id uuid references public.reports(id) on delete set null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint notifications_type_not_blank check (btrim(notification_type) <> ''),
  constraint notifications_title_not_blank check (btrim(title) <> ''),
  constraint notifications_message_not_blank check (btrim(message) <> ''),
  constraint notifications_read_shape check (
    (is_read and read_at is not null) or (not is_read and read_at is null)
  )
);

create index notifications_recipient_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where not is_read;
create index notifications_recipient_time_idx
  on public.notifications (recipient_user_id, created_at desc);
create index notifications_template_idx
  on public.notifications (related_template_id, created_at desc)
  where related_template_id is not null;
create index notifications_report_idx
  on public.notifications (related_report_id, created_at desc)
  where related_report_id is not null;

create table public.asset_metadata (
  id uuid primary key default gen_random_uuid(),
  bucket_name text not null,
  object_path text not null,
  asset_purpose text not null
    check (asset_purpose in ('template_asset', 'report_attachment', 'signature_profile', 'import_source')),
  owner_user_id uuid references public.profiles(id) on delete set null,
  owner_name_snapshot text not null,
  owner_role_key_snapshot text not null,
  linked_template_id uuid references public.templates(id) on delete set null,
  linked_report_id uuid references public.reports(id) on delete set null,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  content_hash text not null,
  lifecycle_state text not null default 'active'
    check (lifecycle_state in ('active', 'archived', 'quarantined', 'deleted')),
  is_immutable boolean not null default false,
  locked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint asset_metadata_bucket_not_blank check (btrim(bucket_name) <> ''),
  constraint asset_metadata_path_not_blank check (btrim(object_path) <> ''),
  constraint asset_metadata_filename_not_blank check (btrim(original_filename) <> ''),
  constraint asset_metadata_mime_not_blank check (btrim(mime_type) <> ''),
  constraint asset_metadata_hash_not_blank check (btrim(content_hash) <> ''),
  constraint asset_metadata_owner_snapshot_not_blank check (
    btrim(owner_name_snapshot) <> '' and btrim(owner_role_key_snapshot) <> ''
  ),
  constraint asset_metadata_domain_link_shape check (
    num_nonnulls(linked_template_id, linked_report_id) <= 1
  ),
  constraint asset_metadata_immutable_shape check (
    not is_immutable or locked_at is not null
  ),
  unique (bucket_name, object_path)
);

create index asset_metadata_owner_state_idx
  on public.asset_metadata (owner_user_id, lifecycle_state, created_at desc)
  where owner_user_id is not null;
create index asset_metadata_template_idx
  on public.asset_metadata (linked_template_id, lifecycle_state, created_at desc)
  where linked_template_id is not null;
create index asset_metadata_report_idx
  on public.asset_metadata (linked_report_id, lifecycle_state, created_at desc)
  where linked_report_id is not null;
create index asset_metadata_hash_idx on public.asset_metadata (content_hash);

alter table public.signature_profiles
  add constraint signature_profiles_asset_fk
  foreign key (signature_asset_id) references public.asset_metadata(id) on delete restrict;

alter table public.report_signature_events
  add constraint report_signature_events_asset_fk
  foreign key (signature_asset_id) references public.asset_metadata(id) on delete restrict;

create index signature_profiles_asset_idx
  on public.signature_profiles (signature_asset_id)
  where signature_asset_id is not null;
create index report_signature_events_asset_idx
  on public.report_signature_events (signature_asset_id)
  where signature_asset_id is not null;

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  actor_email text,
  actor_role_id uuid references public.roles(id) on delete set null,
  actor_role_key text not null,
  actor_role_name text not null,
  target_type text not null,
  target_id text,
  target_label text not null,
  previous_value jsonb,
  new_value jsonb,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint admin_audit_type_not_blank check (btrim(event_type) <> ''),
  constraint admin_audit_actor_not_blank check (
    btrim(actor_name) <> '' and btrim(actor_role_key) <> '' and btrim(actor_role_name) <> ''
  ),
  constraint admin_audit_target_not_blank check (
    btrim(target_type) <> '' and btrim(target_label) <> ''
  )
);

create index admin_audit_time_idx
  on public.admin_audit_events (occurred_at desc);
create index admin_audit_actor_time_idx
  on public.admin_audit_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index admin_audit_target_time_idx
  on public.admin_audit_events (target_type, target_id, occurred_at desc);
create index admin_audit_event_type_time_idx
  on public.admin_audit_events (event_type, occurred_at desc);

create table public.application_auth_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  user_id uuid references public.profiles(id) on delete set null,
  user_name_snapshot text,
  user_email_snapshot text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_name_snapshot text,
  outcome text not null check (outcome in ('success', 'failure', 'blocked')),
  ip_address inet,
  user_agent text,
  context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint application_auth_event_type_not_blank check (btrim(event_type) <> '')
);

create index application_auth_user_time_idx
  on public.application_auth_events (user_id, occurred_at desc)
  where user_id is not null;
create index application_auth_actor_time_idx
  on public.application_auth_events (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index application_auth_type_time_idx
  on public.application_auth_events (event_type, occurred_at desc);

create trigger asset_metadata_set_updated_at
before update on public.asset_metadata
for each row execute function private.set_updated_at();

insert into private.widgetflow_schema_migrations (id, description)
values ('008_notifications_assets_audit', 'Notifications, private Storage metadata, and application-level Admin/Auth audit events');

commit;
