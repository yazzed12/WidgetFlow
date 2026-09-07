begin;

-- ============================================================
-- WidgetFlow
-- Migration 024
-- Production Starter Templates Bootstrap
--
-- IMPORTANT:
--   - No demo users
--   - No hardcoded user UUIDs
--   - Resolves a real active Director dynamically
--   - Creates templates as DRAFT first
--   - Builds sections / fields / tags
--   - Publishes only after composition is complete
--   - Creates immutable v1.0 snapshots
-- ============================================================


-- ============================================================
-- 1. Migration guards
-- ============================================================

do $migration_guard$
begin

  if not exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '023_template_domain_operations'
  ) then
    raise exception
      'WidgetFlow migration 023_template_domain_operations must be applied first';
  end if;


  if exists (
    select 1
    from private.widgetflow_schema_migrations
    where id = '024_template_production_bootstrap'
  ) then
    raise exception
      'WidgetFlow migration 024_template_production_bootstrap has already been applied';
  end if;

end
$migration_guard$;


-- ============================================================
-- 2. Production Template Bootstrap
-- ============================================================

do $bootstrap$
declare

  -- ----------------------------------------------------------
  -- Operational bootstrap publisher.
  -- Must be a real active Director.
  -- ----------------------------------------------------------

  a record;

  -- ----------------------------------------------------------
  -- Current template specification.
  -- ----------------------------------------------------------

  v_spec jsonb;

  v_specs jsonb;

  -- ----------------------------------------------------------
  -- Category.
  -- ----------------------------------------------------------

  c record;

  -- ----------------------------------------------------------
  -- Template / section identity.
  -- ----------------------------------------------------------

  v_template_id uuid;

  v_section_id uuid;

  -- ----------------------------------------------------------
  -- JSON composition.
  -- ----------------------------------------------------------

  v_section jsonb;

  v_component jsonb;

  v_components jsonb;

  v_section_titles jsonb;

  v_snapshot jsonb;

  -- ----------------------------------------------------------
  -- Other loop state.
  -- ----------------------------------------------------------

  v_field_order integer;

  v_tag text;

  v_now timestamptz;

begin

  -- ==========================================================
  -- Resolve a REAL active Director.
  --
  -- Director is used because the normal production governance
  -- model supports direct publication at Director level.
  --
  -- No UUID is hardcoded.
  -- ==========================================================

  select
    p.id,
    p.full_name,
    p.email,

    r.id as role_id,
    r.key,
    r.name,
    r.governance_level

  into a

  from public.profiles p

  join public.roles r
    on r.id = p.role_id

  where
    p.status = 'Active'

    and r.is_active = true

    and r.role_type = 'System'

    and lower(btrim(r.key)) = 'director'

    and r.governance_level = 'Director'

    and exists (
      select 1
      from public.role_permissions rp
      where
        rp.role_id = r.id
        and rp.permission_key = 'templates.create'
    )

    and exists (
      select 1
      from public.role_permissions rp
      where
        rp.role_id = r.id
        and rp.permission_key = 'templates.submit'
    )

  order by
    p.created_at,
    p.id

  limit 1;


  if not found then
    raise exception
      'No active Director with templates.create and templates.submit is available for production Template bootstrap';
  end if;


  -- ==========================================================
  -- Production Starter Template Definitions
  -- ==========================================================

  v_specs := jsonb_build_array(


    -- ========================================================
    -- 1. Executive Monthly Report
    -- ========================================================

    jsonb_build_object(

      'name',
      'Executive Monthly Report',

      'category',
      'Executive Reporting',

      'description',
      'Structured monthly executive reporting template for headline performance, status and management commentary.',

      'tags',
      jsonb_build_array(
        'Executive',
        'Monthly',
        'Performance'
      ),

      'structure',
      jsonb_build_array(

        jsonb_build_object(

          'id',
          'executive-overview',

          'title',
          'Executive Overview',

          'order',
          0,

          'components',
          jsonb_build_array(

            jsonb_build_object(
              'id',
              'executive-reporting-period',
              'type',
              'text',
              'key',
              'reporting_period',
              'label',
              'Reporting Period',
              'required',
              true,
              'placeholder',
              'Example: September 2026',
              'width',
              'half',
              'order',
              0
            ),

            jsonb_build_object(
              'id',
              'executive-overall-status',
              'type',
              'select',
              'key',
              'overall_status',
              'label',
              'Overall Status',
              'required',
              true,
              'options',
              jsonb_build_array(
                'On Track',
                'At Risk',
                'Off Track'
              ),
              'width',
              'half',
              'order',
              1
            ),

            jsonb_build_object(
              'id',
              'executive-headline-kpi',
              'type',
              'kpi',
              'key',
              'headline_kpi',
              'label',
              'Headline KPI',
              'required',
              false,
              'width',
              'half',
              'order',
              2
            ),

            jsonb_build_object(
              'id',
              'executive-summary',
              'type',
              'textarea',
              'key',
              'executive_summary',
              'label',
              'Executive Summary',
              'required',
              true,
              'placeholder',
              'Summarize major achievements, concerns and decisions required.',
              'width',
              'full',
              'order',
              3
            )

          )
        )
      )
    ),


    -- ========================================================
    -- 2. Monthly Financial Performance Report
    -- ========================================================

    jsonb_build_object(

      'name',
      'Monthly Financial Performance Report',

      'category',
      'Finance & Budget',

      'description',
      'Monthly financial performance template covering revenue, expenditure, variance and finance commentary.',

      'tags',
      jsonb_build_array(
        'Finance',
        'Monthly',
        'Budget'
      ),

      'structure',
      jsonb_build_array(

        jsonb_build_object(

          'id',
          'financial-performance',

          'title',
          'Financial Performance',

          'order',
          0,

          'components',
          jsonb_build_array(

            jsonb_build_object(
              'id',
              'finance-reporting-period',
              'type',
              'text',
              'key',
              'reporting_period',
              'label',
              'Reporting Period',
              'required',
              true,
              'placeholder',
              'Example: September 2026',
              'width',
              'full',
              'order',
              0
            ),

            jsonb_build_object(
              'id',
              'finance-revenue',
              'type',
              'currency',
              'key',
              'revenue',
              'label',
              'Revenue',
              'required',
              true,
              'width',
              'half',
              'order',
              1
            ),

            jsonb_build_object(
              'id',
              'finance-expenses',
              'type',
              'currency',
              'key',
              'expenses',
              'label',
              'Expenses',
              'required',
              true,
              'width',
              'half',
              'order',
              2
            ),

            jsonb_build_object(
              'id',
              'finance-budget-variance',
              'type',
              'percentage',
              'key',
              'budget_variance',
              'label',
              'Budget Variance',
              'required',
              false,
              'width',
              'half',
              'order',
              3
            ),

            jsonb_build_object(
              'id',
              'finance-commentary',
              'type',
              'textarea',
              'key',
              'finance_commentary',
              'label',
              'Finance Commentary',
              'required',
              false,
              'placeholder',
              'Explain material movements, risks and corrective actions.',
              'width',
              'full',
              'order',
              4
            )

          )
        )
      )
    ),


    -- ========================================================
    -- 3. Operational Performance Review
    -- ========================================================

    jsonb_build_object(

      'name',
      'Operational Performance Review',

      'category',
      'Operations',

      'description',
      'Operational review template for performance status, throughput, issues and corrective management actions.',

      'tags',
      jsonb_build_array(
        'Operations',
        'Performance',
        'Review'
      ),

      'structure',
      jsonb_build_array(

        jsonb_build_object(

          'id',
          'operational-review',

          'title',
          'Operational Review',

          'order',
          0,

          'components',
          jsonb_build_array(

            jsonb_build_object(
              'id',
              'operations-reporting-period',
              'type',
              'text',
              'key',
              'reporting_period',
              'label',
              'Reporting Period',
              'required',
              true,
              'width',
              'half',
              'order',
              0
            ),

            jsonb_build_object(
              'id',
              'operations-status',
              'type',
              'select',
              'key',
              'operational_status',
              'label',
              'Operational Status',
              'required',
              true,
              'options',
              jsonb_build_array(
                'Stable',
                'Watch',
                'Critical'
              ),
              'width',
              'half',
              'order',
              1
            ),

            jsonb_build_object(
              'id',
              'operations-throughput',
              'type',
              'number',
              'key',
              'throughput',
              'label',
              'Throughput',
              'required',
              false,
              'width',
              'half',
              'order',
              2
            ),

            jsonb_build_object(
              'id',
              'operations-issues',
              'type',
              'textarea',
              'key',
              'issues_and_blockers',
              'label',
              'Issues and Blockers',
              'required',
              false,
              'placeholder',
              'Describe material operational issues, blockers and required support.',
              'width',
              'full',
              'order',
              3
            )

          )
        )
      )
    ),


    -- ========================================================
    -- 4. Project Status Report
    -- ========================================================

    jsonb_build_object(

      'name',
      'Project Status Report',

      'category',
      'Projects & PMO',

      'description',
      'Reusable project status template covering delivery health, progress, ownership and next milestones.',

      'tags',
      jsonb_build_array(
        'Project',
        'PMO',
        'Status'
      ),

      'structure',
      jsonb_build_array(

        jsonb_build_object(

          'id',
          'project-status',

          'title',
          'Project Status',

          'order',
          0,

          'components',
          jsonb_build_array(

            jsonb_build_object(
              'id',
              'project-name',
              'type',
              'text',
              'key',
              'project_name',
              'label',
              'Project Name',
              'required',
              true,
              'width',
              'full',
              'order',
              0
            ),

            jsonb_build_object(
              'id',
              'project-status-value',
              'type',
              'select',
              'key',
              'project_status',
              'label',
              'Project Status',
              'required',
              true,
              'options',
              jsonb_build_array(
                'On Track',
                'At Risk',
                'Delayed'
              ),
              'width',
              'half',
              'order',
              1
            ),

            jsonb_build_object(
              'id',
              'project-completion',
              'type',
              'percentage',
              'key',
              'completion',
              'label',
              'Completion',
              'required',
              false,
              'width',
              'half',
              'order',
              2
            ),

            jsonb_build_object(
              'id',
              'project-action-owner',
              'type',
              'text',
              'key',
              'action_owner',
              'label',
              'Action Owner',
              'required',
              false,
              'width',
              'half',
              'order',
              3
            ),

            jsonb_build_object(
              'id',
              'project-next-due-date',
              'type',
              'date',
              'key',
              'next_due_date',
              'label',
              'Next Due Date',
              'required',
              false,
              'width',
              'half',
              'order',
              4
            )

          )
        )
      )
    ),


    -- ========================================================
    -- 5. Risk & Compliance Review
    -- ========================================================

    jsonb_build_object(

      'name',
      'Risk & Compliance Review',

      'category',
      'Risk & Compliance',

      'description',
      'Risk and compliance review template covering findings, severity, ownership and remediation tracking.',

      'tags',
      jsonb_build_array(
        'Risk',
        'Compliance',
        'Review'
      ),

      'structure',
      jsonb_build_array(

        jsonb_build_object(

          'id',
          'risk-compliance-review',

          'title',
          'Risk and Compliance Review',

          'order',
          0,

          'components',
          jsonb_build_array(

            jsonb_build_object(
              'id',
              'risk-finding',
              'type',
              'text',
              'key',
              'risk_finding',
              'label',
              'Risk or Finding',
              'required',
              true,
              'width',
              'full',
              'order',
              0
            ),

            jsonb_build_object(
              'id',
              'risk-severity',
              'type',
              'select',
              'key',
              'severity',
              'label',
              'Severity',
              'required',
              true,
              'options',
              jsonb_build_array(
                'Low',
                'Medium',
                'High',
                'Critical'
              ),
              'width',
              'half',
              'order',
              1
            ),

            jsonb_build_object(
              'id',
              'risk-owner',
              'type',
              'text',
              'key',
              'risk_owner',
              'label',
              'Risk Owner',
              'required',
              false,
              'width',
              'half',
              'order',
              2
            ),

            jsonb_build_object(
              'id',
              'risk-remediation-due',
              'type',
              'date',
              'key',
              'remediation_due',
              'label',
              'Remediation Due',
              'required',
              false,
              'width',
              'half',
              'order',
              3
            ),

            jsonb_build_object(
              'id',
              'risk-notes',
              'type',
              'textarea',
              'key',
              'risk_notes',
              'label',
              'Risk Notes',
              'required',
              false,
              'width',
              'full',
              'order',
              4
            )

          )
        )
      )
    ),


    -- ========================================================
    -- 6. Quality & Audit Review
    -- ========================================================

    jsonb_build_object(

      'name',
      'Quality & Audit Review',

      'category',
      'Quality & Audit',

      'description',
      'Quality and audit review template covering scoring, findings, corrective ownership and follow-up.',

      'tags',
      jsonb_build_array(
        'Quality',
        'Audit',
        'Review'
      ),

      'structure',
      jsonb_build_array(

        jsonb_build_object(

          'id',
          'quality-audit-review',

          'title',
          'Quality and Audit Review',

          'order',
          0,

          'components',
          jsonb_build_array(

            jsonb_build_object(
              'id',
              'quality-audit-period',
              'type',
              'text',
              'key',
              'audit_period',
              'label',
              'Audit Period',
              'required',
              true,
              'width',
              'full',
              'order',
              0
            ),

            jsonb_build_object(
              'id',
              'quality-score',
              'type',
              'percentage',
              'key',
              'quality_score',
              'label',
              'Quality Score',
              'required',
              false,
              'width',
              'half',
              'order',
              1
            ),

            jsonb_build_object(
              'id',
              'quality-finding-summary',
              'type',
              'textarea',
              'key',
              'finding_summary',
              'label',
              'Finding Summary',
              'required',
              true,
              'width',
              'full',
              'order',
              2
            ),

            jsonb_build_object(
              'id',
              'quality-action-owner',
              'type',
              'text',
              'key',
              'corrective_action_owner',
              'label',
              'Corrective Action Owner',
              'required',
              false,
              'width',
              'half',
              'order',
              3
            ),

            jsonb_build_object(
              'id',
              'quality-follow-up-date',
              'type',
              'date',
              'key',
              'follow_up_date',
              'label',
              'Follow-up Date',
              'required',
              false,
              'width',
              'half',
              'order',
              4
            )

          )
        )
      )
    )

  );


  -- ==========================================================
  -- Process every starter Template.
  -- ==========================================================

  for v_spec in

    select value
    from jsonb_array_elements(v_specs)

  loop

    -- --------------------------------------------------------
    -- Idempotency:
    --
    -- Do not duplicate a starter Template if a normalized name
    -- already exists.
    -- --------------------------------------------------------

    if exists (
      select 1
      from public.templates t
      where
        lower(btrim(t.name))
        =
        lower(btrim(v_spec->>'name'))
    ) then
      continue;
    end if;


    -- --------------------------------------------------------
    -- Resolve required ACTIVE production category.
    -- --------------------------------------------------------

    select
      id,
      name

    into c

    from public.categories

    where
      status = 'Active'

      and lower(btrim(name))
          =
          lower(btrim(v_spec->>'category'))

    limit 1;


    if not found then
      raise exception
        'Required production Template category is missing or inactive: %',
        v_spec->>'category';
    end if;


    v_now := statement_timestamp();


    -- ========================================================
    -- Step 1
    -- Create the Template as DRAFT.
    --
    -- We intentionally DO NOT insert directly as approved.
    --
    -- This ensures:
    -- - submission constraint remains valid
    -- - composition can be built first
    -- - publication happens as a lifecycle transition
    -- ========================================================

    insert into public.templates (

      name,
      description,
      category_id,

      version_label,
      status,
      creation_method,

      created_by_user_id,
      creator_name,
      creator_email,

      creator_role_id,
      creator_role_key,
      creator_role_name,
      creator_governance_level,

      assignment_strategy,

      rules,
      calculations,
      theme,
      header_config,
      footer_config

    )
    values (

      v_spec->>'name',

      v_spec->>'description',

      c.id,

      'v1.0',

      'draft',

      'template',

      a.id,
      a.full_name,
      a.email,

      a.role_id,
      a.key,
      a.name,
      a.governance_level,

      'DIRECT_PUBLISH',

      '[]'::jsonb,

      '[]'::jsonb,

      jsonb_build_object(
        'preset',
        'corporate',
        'accent',
        'indigo',
        'density',
        'comfortable',
        'pageStyle',
        'plain'
      ),

      jsonb_build_object(
        'showLogo',
        true
      ),

      jsonb_build_object(
        'showPageNumbers',
        true
      )

    )

    returning id
    into v_template_id;


    -- ========================================================
    -- Step 2
    -- Create Sections + Fields.
    -- ========================================================

    v_field_order := 0;


    for v_section in

      select value
      from jsonb_array_elements(
        v_spec->'structure'
      )

    loop

      -- ------------------------------------------------------
      -- Create Section
      -- ------------------------------------------------------

      insert into public.template_sections (

        template_id,
        name,
        description,
        display_order

      )
      values (

        v_template_id,

        v_section->>'title',

        nullif(
          btrim(
            coalesce(
              v_section->>'description',
              ''
            )
          ),
          ''
        ),

        coalesce(
          (v_section->>'order')::integer,
          0
        )

      )

      returning id
      into v_section_id;


      -- ------------------------------------------------------
      -- Create Section Fields / Components.
      --
      -- NOTE:
      -- template_fields has a unique
      -- (template_id, display_order), therefore display_order
      -- is generated globally across the whole Template.
      -- ------------------------------------------------------

      for v_component in

        select value
        from jsonb_array_elements(
          v_section->'components'
        )

        order by
          coalesce(
            (value->>'order')::integer,
            0
          )

      loop

        insert into public.template_fields (

          template_id,
          section_id,

          field_key,
          label,
          field_type,

          is_required,

          placeholder,
          description,

          default_value,

          layout_width,

          validation_rules,

          options,

          configuration,

          display_order

        )
        values (

          v_template_id,

          v_section_id,

          v_component->>'key',

          v_component->>'label',

          v_component->>'type',

          coalesce(
            (v_component->>'required')::boolean,
            false
          ),

          nullif(
            btrim(
              coalesce(
                v_component->>'placeholder',
                ''
              )
            ),
            ''
          ),

          nullif(
            btrim(
              coalesce(
                v_component->>'description',
                ''
              )
            ),
            ''
          ),

          v_component->'defaultValue',

          case

            when v_component->>'width'
              in (
                'full',
                'half',
                'third'
              )

            then v_component->>'width'

            else 'full'

          end,

          case

            when jsonb_typeof(
              v_component->'validation'
            ) = 'object'

            then v_component->'validation'

            else '{}'::jsonb

          end,

          case

            when jsonb_typeof(
              v_component->'options'
            ) = 'array'

            then v_component->'options'

            else '[]'::jsonb

          end,

          -- Keep the complete component definition as a
          -- detached configuration snapshot.
          v_component,

          v_field_order

        );


        v_field_order := v_field_order + 1;

      end loop;

    end loop;


    -- ========================================================
    -- Step 3
    -- Create Template Tags.
    -- ========================================================

    for v_tag in

      select
        value #>> '{}'

      from jsonb_array_elements(
        coalesce(
          v_spec->'tags',
          '[]'::jsonb
        )
      )

    loop

      if nullif(
        btrim(
          coalesce(
            v_tag,
            ''
          )
        ),
        ''
      ) is not null then

        insert into public.template_tags (
          template_id,
          tag
        )
        values (
          v_template_id,
          btrim(v_tag)
        );

      end if;

    end loop;


    -- ========================================================
    -- Step 4
    -- Prepare a complete immutable Template snapshot.
    -- ========================================================

    select
      coalesce(
        jsonb_agg(
          comp.value
          order by
            sec.sec_ord,
            comp.comp_ord
        ),
        '[]'::jsonb
      )

    into v_components

    from jsonb_array_elements(
      v_spec->'structure'
    )
    with ordinality
      as sec(value, sec_ord)

    cross join lateral

      jsonb_array_elements(
        sec.value->'components'
      )
      with ordinality
      as comp(value, comp_ord);


    select
      coalesce(
        jsonb_agg(
          sec.value->'title'
          order by sec.sec_ord
        ),
        '[]'::jsonb
      )

    into v_section_titles

    from jsonb_array_elements(
      v_spec->'structure'
    )
    with ordinality
      as sec(value, sec_ord);


    v_snapshot := jsonb_build_object(

      -- ------------------------------------------------------
      -- Core Template Metadata
      -- ------------------------------------------------------

      'id',
      v_template_id::text,

      'name',
      v_spec->>'name',

      'description',
      v_spec->>'description',

      'categoryId',
      c.id::text,

      'categoryName',
      c.name,

      'version',
      'v1.0',

      'versionLabel',
      'v1.0',

      'status',
      'Approved',

      'creationMethod',
      'template',


      -- ------------------------------------------------------
      -- Composition
      -- ------------------------------------------------------

      'tags',
      coalesce(
        v_spec->'tags',
        '[]'::jsonb
      ),

      'sections',
      v_section_titles,

      'dynamicSections',
      v_spec->'structure',

      'components',
      v_components,

      'fields',
      v_components,


      -- ------------------------------------------------------
      -- Logic / Presentation
      -- ------------------------------------------------------

      'rules',
      '[]'::jsonb,

      'calculations',
      '[]'::jsonb,

      'theme',
      jsonb_build_object(
        'preset',
        'corporate',
        'accent',
        'indigo',
        'density',
        'comfortable',
        'pageStyle',
        'plain'
      ),

      'headerConfig',
      jsonb_build_object(
        'showLogo',
        true
      ),

      'footerConfig',
      jsonb_build_object(
        'showPageNumbers',
        true
      ),


      -- ------------------------------------------------------
      -- Publication / Provenance
      -- ------------------------------------------------------

      'createdById',
      a.id::text,

      'createdByName',
      a.full_name,

      'createdByRole',
      a.key,

      'publishedAt',
      v_now

    );


    -- ========================================================
    -- Step 5
    -- Publish Template.
    --
    -- IMPORTANT:
    -- templates_submission_shape requires submitted_at for
    -- approved / pending_approval rows.
    --
    -- draft
    --   ↓
    -- approved
    --
    -- with submitted_at + approved_at set atomically.
    -- ========================================================

    update public.templates

    set
      status = 'approved',

      submitted_at = v_now,

      approved_at = v_now,

      rejection_reason = null,

      rejected_at = null

    where
      id = v_template_id

      and status = 'draft';


    if not found then
      raise exception
        'Unable to publish production starter Template: %',
        v_spec->>'name';
    end if;


    -- ========================================================
    -- Step 6
    -- Create immutable Published Version v1.0.
    -- ========================================================

    insert into public.template_versions (

      template_id,

      version_label,

      schema_snapshot,

      published_by_user_id,

      publisher_name,
      publisher_email,

      publisher_role_id,
      publisher_role_key,
      publisher_role_name,
      publisher_governance_level,

      source_status,

      created_at,
      published_at

    )
    values (

      v_template_id,

      'v1.0',

      v_snapshot,

      a.id,

      a.full_name,
      a.email,

      a.role_id,
      a.key,
      a.name,
      a.governance_level,

      'approved',

      v_now,
      v_now

    );


    -- ========================================================
    -- Step 7
    -- Template Audit Event
    -- ========================================================

    insert into public.template_audit_events (

      template_id,

      event_type,

      actor_user_id,

      actor_name,
      actor_email,

      actor_role_id,
      actor_role_key,
      actor_role_name,
      actor_governance_level,

      template_name_snapshot,

      template_version_snapshot,

      from_status,
      to_status,

      comment,

      event_data,

      occurred_at

    )
    values (

      v_template_id,

      'TEMPLATE_PUBLISHED_DIRECT',

      a.id,

      a.full_name,
      a.email,

      a.role_id,
      a.key,
      a.name,
      a.governance_level,

      v_spec->>'name',

      'v1.0',

      'draft',

      'approved',

      'Production starter Template bootstrap',

      jsonb_build_object(
        'bootstrap',
        true,
        'creationMethod',
        'template',
        'assignmentStrategy',
        'DIRECT_PUBLISH',
        'categoryId',
        c.id,
        'categoryName',
        c.name
      ),

      v_now

    );

  end loop;

end
$bootstrap$;


-- ============================================================
-- 3. Migration Ledger
-- ============================================================

insert into private.widgetflow_schema_migrations (
  id,
  description
)
values (
  '024_template_production_bootstrap',
  'Production starter approved Templates with immutable v1.0 snapshots'
);


commit;