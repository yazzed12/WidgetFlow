select count(*) as template_count from public.templates;
select count(*) as approved_template_count from public.templates where status='approved';
select count(*) as template_version_count from public.template_versions;
select count(*) as section_count from public.template_sections;
select count(*) as field_count from public.template_fields;
select t.name,c.name as category,t.status,t.version_label as internal_version,'' as business_revision_label_expectation,(select count(*) from public.template_sections s where s.template_id=t.id) as section_count,(select count(*) from public.template_fields f where f.template_id=t.id) as field_count from public.templates t join public.categories c on c.id=t.category_id order by t.name;
