-- Lightweight app metadata for initial load and automatic refresh.
-- Does not include the full document list.

create or replace function public.clc_get_app_meta(p_app_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.clc_require_app_key(p_app_key);

  return (
    with document_amounts as (
      select
        d.id,
        d.anio,
        d.estado,
        d.folio,
        coalesce(
          sum(
            case
              when item.value ->> 'importe' ~ '^-?\d+(\.\d+)?$'
                then (item.value ->> 'importe')::numeric
              else 0
            end
          ),
          0
        ) as importe
      from public.clc_documents d
      left join lateral jsonb_array_elements(
        case
          when jsonb_typeof(d.payload -> 'items') = 'array' then d.payload -> 'items'
          else '[]'::jsonb
        end
      ) as item(value) on true
      group by d.id, d.anio, d.estado, d.folio
    ),
    document_metrics as (
      select jsonb_build_object(
        'totalDocuments', count(*),
        'finalizedCount', count(*) filter (where estado = 'finalizado'),
        'draftCount', count(*) filter (where estado = 'borrador'),
        'totalInvoiced', coalesce(sum(importe) filter (where estado = 'finalizado'), 0)
      ) as metrics
      from document_amounts
    ),
    folio_year_rows as (
      select
        anio,
        coalesce(max(nullif(substring(folio from '^CLC-(\d+)/'), '')::integer) filter (where estado = 'finalizado'), 0) as highest_finalized_folio_number,
        count(*) filter (where estado = 'finalizado') as finalized_count,
        count(*) filter (where estado = 'borrador') as draft_count,
        coalesce(sum(importe) filter (where estado = 'finalizado'), 0) as total_invoiced
      from document_amounts
      group by anio
    ),
    folio_years as (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'anio', anio,
            'highestFinalizedFolioNumber', highest_finalized_folio_number,
            'finalizedCount', finalized_count,
            'draftCount', draft_count,
            'totalInvoiced', total_invoiced
          )
          order by anio desc
        ),
        '[]'::jsonb
      ) as summaries
      from folio_year_rows
    )
    select jsonb_build_object(
      'catalogs',
      (select catalogs from public.clc_app_settings where id = 'default'),
      'folioCounters',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('anio', anio, 'lastNumber', last_number)
            order by anio desc
          )
          from public.clc_folio_counters
        ),
        '[]'::jsonb
      ),
      'documentMetrics',
      coalesce(
        (select metrics from document_metrics),
        jsonb_build_object('totalDocuments', 0, 'finalizedCount', 0, 'draftCount', 0, 'totalInvoiced', 0)
      ),
      'folioYearSummaries',
      coalesce((select summaries from folio_years), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.clc_get_app_meta(text) from public;
grant execute on function public.clc_get_app_meta(text) to anon, authenticated;

notify pgrst, 'reload schema';
