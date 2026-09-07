begin;

do $migration_guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '038_report_sender_signature_snapshot'
  ) then
    raise exception
      'WidgetFlow migration 038_report_sender_signature_snapshot must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '039_report_signature_assignment_foundation'
  ) then
    raise exception
      'WidgetFlow migration 039_report_signature_assignment_foundation has already been applied';
  end if;
end
$migration_guard$;


create table public.report_signature_assignments (
  id uuid primary key
    default pg_catalog.gen_random_uuid(),

  report_id uuid not null,

  send_cycle_id uuid not null,

  report_assignment_id uuid not null,

  recipient_user_id uuid not null,

  signature_field_key text not null,

  signature_field_label_snapshot text,

  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),

  constraint report_signature_assignments_field_key_not_blank_chk
    check (
      pg_catalog.char_length(
        pg_catalog.btrim(signature_field_key)
      ) > 0
    ),

  constraint report_signature_assignments_report_fk
    foreign key (report_id)
    references public.reports(id)
    on delete restrict,

  constraint report_signature_assignments_cycle_same_report_fk
    foreign key (report_id, send_cycle_id)
    references public.report_send_cycles(report_id, id)
    on delete restrict,

  constraint report_signature_assignments_assignment_same_cycle_fk
    foreign key (
      report_id,
      send_cycle_id,
      report_assignment_id
    )
    references public.report_assignments(
      report_id,
      send_cycle_id,
      id
    )
    on delete restrict,

  constraint report_signature_assignments_recipient_fk
    foreign key (recipient_user_id)
    references public.profiles(id)
    on delete restrict,

  constraint report_signature_assignments_one_field_per_assignment_uid
    unique (report_assignment_id),

  constraint report_signature_assignments_field_once_per_cycle_uid
    unique (send_cycle_id, signature_field_key)
);


create index report_signature_assignments_report_idx
  on public.report_signature_assignments (
    report_id,
    created_at desc
  );


create index report_signature_assignments_cycle_idx
  on public.report_signature_assignments (
    send_cycle_id,
    created_at
  );


create index report_signature_assignments_recipient_idx
  on public.report_signature_assignments (
    recipient_user_id,
    created_at desc
  );


alter table public.report_signature_assignments
  enable row level security;


revoke all
on table public.report_signature_assignments
from anon;


revoke all
on table public.report_signature_assignments
from authenticated;


grant select
on table public.report_signature_assignments
to authenticated;


create policy report_signature_assignments_read_visible_report
on public.report_signature_assignments
for select
to authenticated
using (
  private.current_user_can_read_report(report_id)
);


insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '039_report_signature_assignment_foundation',
  'Immutable recipient-to-signature-field mapping foundation for report send cycles'
);


commit;