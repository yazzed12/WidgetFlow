begin;

do $guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '043_report_sign_historical_signature_shape_hotfix') then
    raise exception 'WidgetFlow migration 043_report_sign_historical_signature_shape_hotfix must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '044_signature_profile_v2_foundation') then
    raise exception 'WidgetFlow migration 044_signature_profile_v2_foundation has already been applied';
  end if;
end
$guard$;

alter table public.signature_profiles
  add column if not exists typed_font_key text null,
  add column if not exists source_image_filename text null,
  add column if not exists extraction_version text null;

update public.signature_profiles
set typed_font_key = 'signature_default',
    updated_at = updated_at
where signature_method = 'typed'
  and typed_font_key is null;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.signature_profiles'::regclass
      and conname = 'signature_profiles_typed_font_key_nonblank'
  ) then
    alter table public.signature_profiles
      add constraint signature_profiles_typed_font_key_nonblank
      check (typed_font_key is null or btrim(typed_font_key) <> '');
  end if;
end
$constraint$;

insert into private.widgetflow_schema_migrations (id, description)
values ('044_signature_profile_v2_foundation', 'Signature profile V2 metadata and typed font foundation');

commit;
