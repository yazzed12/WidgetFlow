-- READ ONLY verification for optional migration 022.
select id, description, applied_at from private.widgetflow_schema_migrations
where id = '022_standard_pack_production_bootstrap';

select count(*) as pack_count,
  count(*) filter (where status = 'published') as published_pack_count
from public.standard_packs;

select p.name, p.category_name_snapshot as category, p.status,
  v.version_label, count(i.id) as component_count
from public.standard_packs p
left join public.standard_pack_versions v on v.pack_id = p.id and v.status = 'published'
left join public.standard_pack_items i on i.pack_version_id = v.id
group by p.id, p.name, p.category_name_snapshot, p.status, v.version_label
order by p.name;
