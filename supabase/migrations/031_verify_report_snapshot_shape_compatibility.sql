select
  exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '031_report_snapshot_shape_compatibility'
  ) as migration_031_applied,

  position(
    'field_key'
    in pg_get_functiondef(
      'private.normalized_report_snapshot_fields(uuid,jsonb)'::regprocedure
    )
  ) > 0 as supports_field_key,

  position(
    'key'
    in pg_get_functiondef(
      'private.normalized_report_snapshot_fields(uuid,jsonb)'::regprocedure
    )
  ) > 0 as supports_legacy_key,

  position(
    'field_type'
    in pg_get_functiondef(
      'private.normalized_report_snapshot_fields(uuid,jsonb)'::regprocedure
    )
  ) > 0 as supports_field_type,

  position(
    'is_required'
    in pg_get_functiondef(
      'private.normalized_report_snapshot_fields(uuid,jsonb)'::regprocedure
    )
  ) > 0 as supports_is_required,

  position(
    'defaultValue'
    in pg_get_functiondef(
      'private.normalized_report_snapshot_fields(uuid,jsonb)'::regprocedure
    )
  ) > 0 as supports_legacy_default,

  position(
    'current_send_cycle_id is not null'
    in pg_get_functiondef(
      'public.complete_report(uuid,text,jsonb)'::regprocedure
    )
  ) > 0 as completion_send_cycle_guard,

  position(
    'sent_at is not null'
    in pg_get_functiondef(
      'public.complete_report(uuid,text,jsonb)'::regprocedure
    )
  ) > 0 as completion_sent_guard,

  has_function_privilege(
    'authenticated',
    'private.normalized_report_snapshot_fields(uuid,jsonb)',
    'EXECUTE'
  ) as authenticated_can_execute_private_normalizer,

  has_function_privilege(
    'authenticated',
    'public.create_report_from_template(uuid,text,jsonb)',
    'EXECUTE'
  ) as authenticated_can_create_report,

  has_function_privilege(
    'authenticated',
    'public.complete_report(uuid,text,jsonb)',
    'EXECUTE'
  ) as authenticated_can_complete_report;