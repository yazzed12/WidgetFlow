begin;

do $guard$
begin
  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '041_report_mapped_recipient_sign'
  ) then
    raise exception 'WidgetFlow migration 041_report_mapped_recipient_sign must be applied first';
  end if;

  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '042_notifications_personal_access'
  ) then
    raise exception 'WidgetFlow migration 042_notifications_personal_access has already been applied';
  end if;
end $guard$;

alter table public.notifications enable row level security;

-- Browser roles receive no write access. Trusted lifecycle RPCs remain
-- SECURITY DEFINER and continue inserting notifications server-side.
revoke all privileges on table public.notifications from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.notifications from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.notifications from anon;

grant select on table public.notifications to authenticated;

create policy notifications_read_own
on public.notifications
for select
to authenticated
using (recipient_user_id = auth.uid());

insert into private.widgetflow_schema_migrations (id, description)
values (
  '042_notifications_personal_access',
  'Personal notification read access with owner-only RLS'
);

commit;
