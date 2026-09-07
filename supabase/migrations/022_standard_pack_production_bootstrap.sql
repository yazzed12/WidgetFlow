begin;

do $migration_guard$
begin
  if not exists (select 1 from private.widgetflow_schema_migrations where id = '021_admin_standard_pack_domain_operations') then
    raise exception 'WidgetFlow migration 021_admin_standard_pack_domain_operations must be applied first';
  end if;
  if exists (select 1 from private.widgetflow_schema_migrations where id = '022_standard_pack_production_bootstrap') then
    raise exception 'WidgetFlow migration 022_standard_pack_production_bootstrap has already been applied';
  end if;
end
$migration_guard$;

do $bootstrap$
declare
  v_admin record;
  v_spec jsonb;
  v_pack public.standard_packs%rowtype;
  v_version public.standard_pack_versions%rowtype;
  v_category_id uuid;
  v_category_name text;
  v_component jsonb;
  v_order integer;
  v_specs jsonb := jsonb_build_array(
    jsonb_build_object('name','Executive Reporting Pack','category','Executive Reporting','description','Reusable executive reporting summary blocks.',
      'structure',jsonb_build_array(jsonb_build_object('id','exec-summary','title','Executive Summary','order',0,'components',jsonb_build_array(
        jsonb_build_object('id','exec-period','type','text','key','reporting_period','label','Reporting Period','order',0),
        jsonb_build_object('id','exec-summary-text','type','paragraph','key','executive_summary','label','Executive Summary','order',1),
        jsonb_build_object('id','exec-kpi','type','kpi','key','headline_kpi','label','Headline KPI','order',2),
        jsonb_build_object('id','exec-status','type','select','key','overall_status','label','Overall Status','order',3,'options',jsonb_build_array('On Track','At Risk','Off Track'))
      )))),
    jsonb_build_object('name','Monthly Finance Pack','category','Finance & Budget','description','Reusable monthly finance review building blocks.',
      'structure',jsonb_build_array(jsonb_build_object('id','finance-review','title','Monthly Finance Review','order',0,'components',jsonb_build_array(
        jsonb_build_object('id','finance-period','type','text','key','reporting_period','label','Reporting Period','order',0),
        jsonb_build_object('id','finance-revenue','type','currency','key','revenue','label','Revenue','order',1),
        jsonb_build_object('id','finance-expense','type','currency','key','expenses','label','Expenses','order',2),
        jsonb_build_object('id','finance-variance','type','percentage','key','variance','label','Budget Variance','order',3),
        jsonb_build_object('id','finance-comment','type','textarea','key','finance_commentary','label','Finance Commentary','order',4)
      )))),
    jsonb_build_object('name','Operational Review Pack','category','Operations','description','Reusable operational performance review blocks.',
      'structure',jsonb_build_array(jsonb_build_object('id','ops-review','title','Operational Review','order',0,'components',jsonb_build_array(
        jsonb_build_object('id','ops-period','type','text','key','reporting_period','label','Reporting Period','order',0),
        jsonb_build_object('id','ops-status','type','select','key','operational_status','label','Operational Status','order',1,'options',jsonb_build_array('Stable','Watch','Critical')),
        jsonb_build_object('id','ops-kpi','type','number','key','throughput','label','Throughput','order',2),
        jsonb_build_object('id','ops-issues','type','textarea','key','issues','label','Issues and Blockers','order',3)
      )))),
    jsonb_build_object('name','Project Status Pack','category','Projects & PMO','description','Reusable project status and delivery blocks.',
      'structure',jsonb_build_array(jsonb_build_object('id','project-status','title','Project Status','order',0,'components',jsonb_build_array(
        jsonb_build_object('id','project-name','type','text','key','project_name','label','Project Name','order',0),
        jsonb_build_object('id','project-status-value','type','select','key','project_status','label','Project Status','order',1,'options',jsonb_build_array('On Track','At Risk','Delayed')),
        jsonb_build_object('id','project-progress','type','percentage','key','completion','label','Completion','order',2),
        jsonb_build_object('id','project-owner','type','text','key','action_owner','label','Action Owner','order',3),
        jsonb_build_object('id','project-due','type','date','key','next_due_date','label','Next Due Date','order',4)
      )))),
    jsonb_build_object('name','Risk & Compliance Pack','category','Risk & Compliance','description','Reusable risk and compliance tracking blocks.',
      'structure',jsonb_build_array(jsonb_build_object('id','risk-review','title','Risk and Compliance Review','order',0,'components',jsonb_build_array(
        jsonb_build_object('id','risk-title','type','text','key','risk_title','label','Risk or Finding','order',0),
        jsonb_build_object('id','risk-severity','type','select','key','severity','label','Severity','order',1,'options',jsonb_build_array('Low','Medium','High','Critical')),
        jsonb_build_object('id','risk-owner','type','text','key','risk_owner','label','Risk Owner','order',2),
        jsonb_build_object('id','risk-due','type','date','key','remediation_due','label','Remediation Due','order',3),
        jsonb_build_object('id','risk-notes','type','textarea','key','risk_notes','label','Risk Notes','order',4)
      )))),
    jsonb_build_object('name','Quality & Audit Pack','category','Quality & Audit','description','Reusable quality and audit evidence blocks.',
      'structure',jsonb_build_array(jsonb_build_object('id','quality-audit','title','Quality and Audit Review','order',0,'components',jsonb_build_array(
        jsonb_build_object('id','quality-period','type','text','key','audit_period','label','Audit Period','order',0),
        jsonb_build_object('id','quality-score','type','percentage','key','quality_score','label','Quality Score','order',1),
        jsonb_build_object('id','quality-finding','type','textarea','key','finding_summary','label','Finding Summary','order',2),
        jsonb_build_object('id','quality-action','type','text','key','corrective_action_owner','label','Corrective Action Owner','order',3),
        jsonb_build_object('id','quality-date','type','date','key','follow_up_date','label','Follow-up Date','order',4)
      ))))
  );
begin
  select p.id, p.full_name, p.email, r.key as role_key into v_admin
  from public.profiles p join public.roles r on r.id = p.role_id
  where p.status = 'Active' and r.is_active and r.role_type = 'System'
    and lower(btrim(r.key)) = 'admin' and r.is_protected
  order by p.created_at, p.id limit 1;
  if not found then raise exception 'No active protected Admin is available for production Pack bootstrap'; end if;

  for v_spec in select value from jsonb_array_elements(v_specs)
  loop
    if exists (select 1 from public.standard_packs where lower(btrim(name)) = lower(btrim(v_spec->>'name'))) then continue; end if;
    select id, name into v_category_id, v_category_name from public.categories
    where status = 'Active' and lower(btrim(name)) = lower(btrim(v_spec->>'category'));
    if not found then raise exception 'Required production Pack category is missing: %', v_spec->>'category'; end if;
    insert into public.standard_packs (name, description, category_id, category_name_snapshot, status,
      created_by_user_id, creator_name_snapshot, creator_role_key_snapshot)
    values (v_spec->>'name', v_spec->>'description', v_category_id, v_category_name, 'published',
      v_admin.id, v_admin.full_name, v_admin.role_key)
    returning * into v_pack;
    insert into public.standard_pack_versions (pack_id, version_label, status, structure_snapshot,
      name_snapshot, description_snapshot, category_id_snapshot, category_name_snapshot,
      created_by_user_id, creator_name_snapshot, creator_role_key_snapshot, published_at)
    values (v_pack.id, 'v1.0', 'published', v_spec->'structure', v_pack.name, v_pack.description,
      v_pack.category_id, v_pack.category_name_snapshot, v_pack.created_by_user_id, v_admin.full_name, v_admin.role_key, statement_timestamp())
    returning * into v_version;
    v_order := 0;
    for v_component in select component.value from jsonb_array_elements(v_spec->'structure') section cross join lateral jsonb_array_elements(section.value->'components') as component(value)
    loop
      insert into public.standard_pack_items (pack_version_id, source_type, source_key, label, configuration_snapshot, display_order)
      values (v_version.id, 'element', 'elements.' || (v_component->>'type'), v_component->>'label', v_component, v_order);
      v_order := v_order + 1;
    end loop;
  end loop;
end
$bootstrap$;

insert into private.widgetflow_schema_migrations (id, description)
values ('022_standard_pack_production_bootstrap', 'Optional idempotent production starter Standard Packs');

commit;
