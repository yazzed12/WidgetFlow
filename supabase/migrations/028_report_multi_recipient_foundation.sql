begin;

-- ============================================================
-- WidgetFlow
-- Migration 028
-- Report Multi-Recipient Foundation — corrected integrity version
-- ============================================================

-- ------------------------------------------------------------
-- 0. Migration guards
-- ------------------------------------------------------------
do $migration_guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '027_operational_active_category_read'
  ) then
    raise exception 'WidgetFlow migration 027_operational_active_category_read must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '028_report_multi_recipient_foundation'
  ) then
    raise exception 'WidgetFlow migration 028_report_multi_recipient_foundation has already been applied';
  end if;
end
$migration_guard$;

-- ------------------------------------------------------------
-- 1. Report send cycles
-- ------------------------------------------------------------
create table public.report_send_cycles (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete restrict,
  cycle_number integer not null check (cycle_number > 0),

  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  sender_name_snapshot text not null,
  sender_email_snapshot text,
  sender_role_id_snapshot uuid references public.roles(id) on delete set null,
  sender_role_key_snapshot text not null,
  sender_role_name_snapshot text not null,
  sender_governance_level_snapshot text not null
    check (sender_governance_level_snapshot in ('Employee', 'Manager', 'Director', 'None')),

  sender_note text,
  content_hash text not null,

  status text not null default 'active'
    check (status in ('active', 'returned', 'rejected', 'finalized', 'cancelled')),

  sent_at timestamptz not null default statement_timestamp(),
  closed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),

  constraint report_send_cycles_sender_not_blank check (
    btrim(sender_name_snapshot) <> ''
    and btrim(sender_role_key_snapshot) <> ''
    and btrim(sender_role_name_snapshot) <> ''
  ),

  constraint report_send_cycles_hash_not_blank check (
    btrim(content_hash) <> ''
  ),

  constraint report_send_cycles_close_shape check (
    (status = 'active' and closed_at is null)
    or
    (status <> 'active' and closed_at is not null)
  ),

  constraint report_send_cycles_time_shape check (
    closed_at is null or closed_at >= sent_at
  ),

  constraint report_send_cycles_report_cycle_unique
    unique (report_id, cycle_number),

  constraint report_send_cycles_report_id_id_unique
    unique (report_id, id)
);

create index report_send_cycles_report_status_idx
  on public.report_send_cycles (report_id, status, cycle_number desc);

create unique index report_send_cycles_one_active_per_report_uidx
  on public.report_send_cycles (report_id)
  where status = 'active';

-- ------------------------------------------------------------
-- 2. Report assignments
-- ------------------------------------------------------------
create table public.report_assignments (
  id uuid primary key default gen_random_uuid(),

  report_id uuid not null references public.reports(id) on delete restrict,
  send_cycle_id uuid not null,

  recipient_user_id uuid not null references public.profiles(id) on delete restrict,
  recipient_name_snapshot text not null,
  recipient_email_snapshot text,
  recipient_role_id_snapshot uuid references public.roles(id) on delete set null,
  recipient_role_key_snapshot text not null,
  recipient_role_name_snapshot text not null,
  recipient_governance_level_snapshot text not null
    check (recipient_governance_level_snapshot in ('Employee', 'Manager', 'Director', 'None')),

  assignment_status text not null default 'pending'
    check (assignment_status in ('pending', 'signed', 'returned', 'rejected', 'cancelled')),

  assignment_sequence integer not null check (assignment_sequence > 0),

  sent_at timestamptz not null default statement_timestamp(),
  signed_at timestamptz,
  returned_at timestamptz,
  rejected_at timestamptz,
  closed_at timestamptz,

  return_reason text,
  rejection_reason text,
  created_at timestamptz not null default statement_timestamp(),

  constraint report_assignments_recipient_not_blank check (
    btrim(recipient_name_snapshot) <> ''
    and btrim(recipient_role_key_snapshot) <> ''
    and btrim(recipient_role_name_snapshot) <> ''
  ),

  constraint report_assignments_outcome_shape check (
    (
      assignment_status = 'pending'
      and signed_at is null
      and returned_at is null
      and rejected_at is null
      and closed_at is null
      and return_reason is null
      and rejection_reason is null
    )
    or
    (
      assignment_status = 'signed'
      and signed_at is not null
      and returned_at is null
      and rejected_at is null
      and closed_at is not null
      and return_reason is null
      and rejection_reason is null
    )
    or
    (
      assignment_status = 'returned'
      and signed_at is null
      and returned_at is not null
      and rejected_at is null
      and closed_at is not null
      and nullif(btrim(return_reason), '') is not null
      and rejection_reason is null
    )
    or
    (
      assignment_status = 'rejected'
      and signed_at is null
      and returned_at is null
      and rejected_at is not null
      and closed_at is not null
      and return_reason is null
      and nullif(btrim(rejection_reason), '') is not null
    )
    or
    (
      assignment_status = 'cancelled'
      and signed_at is null
      and returned_at is null
      and rejected_at is null
      and closed_at is not null
      and return_reason is null
      and rejection_reason is null
    )
  ),

  constraint report_assignments_time_shape check (
    (signed_at is null or signed_at >= sent_at)
    and (returned_at is null or returned_at >= sent_at)
    and (rejected_at is null or rejected_at >= sent_at)
    and (closed_at is null or closed_at >= sent_at)
  ),

  constraint report_assignments_cycle_same_report_fk
    foreign key (report_id, send_cycle_id)
    references public.report_send_cycles (report_id, id)
    on delete restrict,

  constraint report_assignments_cycle_recipient_unique
    unique (send_cycle_id, recipient_user_id),

  constraint report_assignments_cycle_sequence_unique
    unique (send_cycle_id, assignment_sequence),

  constraint report_assignments_report_cycle_id_unique
    unique (report_id, send_cycle_id, id)
);

create index report_assignments_report_idx
  on public.report_assignments (report_id, created_at desc);

create index report_assignments_cycle_idx
  on public.report_assignments (send_cycle_id, assignment_sequence);

create index report_assignments_recipient_status_idx
  on public.report_assignments (recipient_user_id, assignment_status, sent_at desc);

-- ------------------------------------------------------------
-- 3. Current cycle pointer
-- ------------------------------------------------------------
alter table public.reports
  add column current_send_cycle_id uuid;

alter table public.reports
  add constraint reports_current_cycle_same_report_fk
  foreign key (id, current_send_cycle_id)
  references public.report_send_cycles (report_id, id)
  on delete restrict;

create index reports_current_send_cycle_idx
  on public.reports (current_send_cycle_id)
  where current_send_cycle_id is not null;

-- Transitional legacy compatibility
alter table public.reports
  drop constraint reports_sent_shape;

alter table public.reports
  add constraint reports_sent_shape check (
    status not in ('sent', 'returned', 'signed', 'rejected')
    or (
      sent_at is not null
      and (
        recipient_user_id is not null
        or current_send_cycle_id is not null
      )
    )
  );

-- ------------------------------------------------------------
-- 4. Signature linkage
-- ------------------------------------------------------------
alter table public.report_signature_events
  add column send_cycle_id uuid,
  add column report_assignment_id uuid;

alter table public.report_signature_events
  add constraint report_signature_events_assignment_context_shape check (
    report_assignment_id is null or send_cycle_id is not null
  ),
  add constraint report_signature_events_cycle_same_report_fk
    foreign key (report_id, send_cycle_id)
    references public.report_send_cycles (report_id, id)
    on delete restrict,
  add constraint report_signature_events_assignment_same_context_fk
    foreign key (report_id, send_cycle_id, report_assignment_id)
    references public.report_assignments (report_id, send_cycle_id, id)
    on delete restrict;

create index report_signature_events_cycle_assignment_idx
  on public.report_signature_events (send_cycle_id, report_assignment_id, occurred_at desc);

-- ------------------------------------------------------------
-- 5. Comments linkage
-- ------------------------------------------------------------
alter table public.report_comments
  add column send_cycle_id uuid,
  add column report_assignment_id uuid;

alter table public.report_comments
  add constraint report_comments_assignment_context_shape check (
    report_assignment_id is null or send_cycle_id is not null
  ),
  add constraint report_comments_cycle_same_report_fk
    foreign key (report_id, send_cycle_id)
    references public.report_send_cycles (report_id, id)
    on delete restrict,
  add constraint report_comments_assignment_same_context_fk
    foreign key (report_id, send_cycle_id, report_assignment_id)
    references public.report_assignments (report_id, send_cycle_id, id)
    on delete restrict;

create index report_comments_assignment_time_idx
  on public.report_comments (report_assignment_id, created_at)
  where report_assignment_id is not null;

-- ------------------------------------------------------------
-- 6. Audit linkage
-- ------------------------------------------------------------
alter table public.report_audit_events
  add column send_cycle_id uuid,
  add column report_assignment_id uuid;

alter table public.report_audit_events
  add constraint report_audit_events_assignment_context_shape check (
    report_assignment_id is null or send_cycle_id is not null
  ),
  add constraint report_audit_events_cycle_same_report_fk
    foreign key (report_id, send_cycle_id)
    references public.report_send_cycles (report_id, id)
    on delete restrict,
  add constraint report_audit_events_assignment_same_context_fk
    foreign key (report_id, send_cycle_id, report_assignment_id)
    references public.report_assignments (report_id, send_cycle_id, id)
    on delete restrict;

create index report_audit_assignment_time_idx
  on public.report_audit_events (report_assignment_id, occurred_at desc)
  where report_assignment_id is not null;

-- ------------------------------------------------------------
-- 7. Notification linkage
-- ------------------------------------------------------------
alter table public.notifications
  add column send_cycle_id uuid,
  add column report_assignment_id uuid;

alter table public.notifications
  add constraint notifications_cycle_requires_report check (
    send_cycle_id is null or related_report_id is not null
  ),
  add constraint notifications_assignment_context_shape check (
    report_assignment_id is null
    or (related_report_id is not null and send_cycle_id is not null)
  ),
  add constraint notifications_cycle_same_report_fk
    foreign key (related_report_id, send_cycle_id)
    references public.report_send_cycles (report_id, id)
    on delete restrict,
  add constraint notifications_assignment_same_context_fk
    foreign key (related_report_id, send_cycle_id, report_assignment_id)
    references public.report_assignments (report_id, send_cycle_id, id)
    on delete restrict;

create index notifications_assignment_idx
  on public.notifications (report_assignment_id, created_at desc)
  where report_assignment_id is not null;

-- ------------------------------------------------------------
-- 8. Report read helper
-- ------------------------------------------------------------
create or replace function private.current_user_can_read_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((
    select
      private.current_user_is_active()
      and (
        (
          r.created_by_user_id = auth.uid()
          and private.current_user_has_permission('reports.view_own')
        )
        or private.current_user_has_permission('reports.view_organization')
        or (
          private.current_user_has_permission('reports.view_received')
          and exists (
            select 1
            from public.report_assignments a
            where a.report_id = r.id
              and a.send_cycle_id = r.current_send_cycle_id
              and a.recipient_user_id = auth.uid()
          )
        )
      )
    from public.reports r
    where r.id = p_report_id
  ), false)
$function$;

revoke all on function private.current_user_can_read_report(uuid)
from public, anon, authenticated;

grant execute on function private.current_user_can_read_report(uuid)
to authenticated;

-- ------------------------------------------------------------
-- 9. RLS
-- ------------------------------------------------------------
alter table public.report_send_cycles enable row level security;
alter table public.report_assignments enable row level security;

create policy reports_select_foundation
on public.reports
for select
to authenticated
using (private.current_user_can_read_report(id));

create policy report_values_select_foundation
on public.report_values
for select
to authenticated
using (private.current_user_can_read_report(report_id));

create policy report_send_cycles_select_foundation
on public.report_send_cycles
for select
to authenticated
using (private.current_user_can_read_report(report_id));

create policy report_assignments_select_foundation
on public.report_assignments
for select
to authenticated
using (private.current_user_can_read_report(report_id));

create policy report_comments_select_foundation
on public.report_comments
for select
to authenticated
using (private.current_user_can_read_report(report_id));

create policy report_audit_events_select_foundation
on public.report_audit_events
for select
to authenticated
using (private.current_user_can_read_report(report_id));

create policy report_signature_events_select_foundation
on public.report_signature_events
for select
to authenticated
using (private.current_user_can_read_report(report_id));

-- ------------------------------------------------------------
-- 10. Browser privileges
-- ------------------------------------------------------------
revoke all privileges on table
  public.report_send_cycles,
  public.report_assignments
from public, anon, authenticated;

revoke all privileges on table
  public.reports,
  public.report_values,
  public.report_comments,
  public.report_audit_events,
  public.report_signature_events
from public, anon;

revoke insert, update, delete, truncate, references, trigger on table
  public.reports,
  public.report_values,
  public.report_send_cycles,
  public.report_assignments,
  public.report_comments,
  public.report_audit_events,
  public.report_signature_events
from authenticated;

grant select on table
  public.reports,
  public.report_values,
  public.report_send_cycles,
  public.report_assignments,
  public.report_comments,
  public.report_audit_events,
  public.report_signature_events
to authenticated;

-- ------------------------------------------------------------
-- 11. Migration ledger
-- ------------------------------------------------------------
insert into private.widgetflow_schema_migrations (id, description)
values (
  '028_report_multi_recipient_foundation',
  'Normalized report send cycles, dynamic recipient assignments, cross-report integrity, signature/comment/audit/notification context, and RLS read foundation'
);

commit;