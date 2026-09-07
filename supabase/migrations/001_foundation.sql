begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.widgetflow_schema_migrations (
  id text primary key,
  description text not null,
  applied_at timestamptz not null default statement_timestamp()
);

do $migration_guard$
begin
  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '001_foundation'
  ) then
    raise exception 'WidgetFlow migration 001_foundation has already been applied';
  end if;
end
$migration_guard$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := statement_timestamp();
  return new;
end
$function$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

insert into private.widgetflow_schema_migrations (id, description)
values ('001_foundation', 'Private migration ledger and shared timestamp infrastructure');

commit;