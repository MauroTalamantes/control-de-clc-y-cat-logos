-- Paginated document listing for the CLC history view.

create or replace function public.clc_list_documents(
  p_page integer default 1,
  p_page_size integer default 10,
  p_search text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_sort_key text default 'fecha',
  p_sort_direction text default 'desc',
  p_estado text default null,
  p_anio integer default null,
  p_app_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  v_offset integer;
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_sort_key text := lower(coalesce(nullif(trim(p_sort_key), ''), 'fecha'));
  v_sort_direction text := lower(coalesce(nullif(trim(p_sort_direction), ''), 'desc'));
  v_estado text := nullif(lower(trim(coalesce(p_estado, ''))), '');
begin
  perform public.clc_require_app_key(p_app_key);

  if v_sort_key not in ('fecha', 'folio', 'nombre', 'concepto', 'proveedor') then
    v_sort_key := 'fecha';
  end if;

  if v_sort_direction not in ('asc', 'desc') then
    v_sort_direction := 'desc';
  end if;

  if v_estado is not null and v_estado not in ('borrador', 'finalizado') then
    raise exception 'Invalid document status' using errcode = '22023';
  end if;

  if p_anio is not null and (p_anio < 2000 or p_anio > 9999) then
    raise exception 'Invalid document year' using errcode = '22023';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  return (
    with base as (
      select
        d.id,
        d.payload,
        d.folio,
        d.anio,
        d.estado,
        d.updated_at,
        case
          when left(coalesce(d.payload ->> 'fechaCreacion', ''), 10) ~ '^\d{4}-\d{2}-\d{2}$'
            then left(d.payload ->> 'fechaCreacion', 10)::date
          else d.created_at::date
        end as fecha_creacion,
        coalesce(nullif(d.folio, ''), 'BORRADOR') as folio_sort,
        coalesce(d.payload ->> 'unidadNombre', '') as nombre_sort,
        coalesce(d.payload #>> '{items,0,objetoNombre}', d.payload ->> 'concepto', '') as concepto_sort,
        coalesce(d.payload ->> 'proveedorNombre', '') as proveedor_sort,
        concat_ws(
          ' ',
          d.folio,
          d.payload ->> 'unidadNombre',
          d.payload ->> 'proveedorNombre',
          d.payload ->> 'proveedorRfc',
          d.payload ->> 'concepto'
        ) as search_text,
        case
          when jsonb_typeof(d.payload -> 'items') = 'array' then d.payload -> 'items'
          else '[]'::jsonb
        end as items_payload
      from public.clc_documents d
    ),
    filtered as (
      select b.*
      from base b
      where (v_estado is null or b.estado = v_estado)
        and (p_anio is null or b.anio = p_anio)
        and (p_date_from is null or b.fecha_creacion >= p_date_from)
        and (p_date_to is null or b.fecha_creacion <= p_date_to)
        and (
          v_search is null
          or b.search_text ilike ('%' || v_search || '%')
          or exists (
            select 1
            from jsonb_array_elements(b.items_payload) as item(value)
            where concat_ws(
              ' ',
              item.value ->> 'objetoNombre',
              item.value ->> 'objetoClave',
              item.value ->> 'numFactura',
              item.value ->> 'oc'
            ) ilike ('%' || v_search || '%')
          )
        )
    ),
    ranked as (
      select
        f.*,
        row_number() over (
          order by
            case when v_sort_key = 'fecha' and v_sort_direction = 'asc' then f.fecha_creacion end asc nulls last,
            case when v_sort_key = 'fecha' and v_sort_direction = 'desc' then f.fecha_creacion end desc nulls last,
            case when v_sort_key = 'folio' and v_sort_direction = 'asc' then f.folio_sort end asc nulls last,
            case when v_sort_key = 'folio' and v_sort_direction = 'desc' then f.folio_sort end desc nulls last,
            case when v_sort_key = 'nombre' and v_sort_direction = 'asc' then f.nombre_sort end asc nulls last,
            case when v_sort_key = 'nombre' and v_sort_direction = 'desc' then f.nombre_sort end desc nulls last,
            case when v_sort_key = 'concepto' and v_sort_direction = 'asc' then f.concepto_sort end asc nulls last,
            case when v_sort_key = 'concepto' and v_sort_direction = 'desc' then f.concepto_sort end desc nulls last,
            case when v_sort_key = 'proveedor' and v_sort_direction = 'asc' then f.proveedor_sort end asc nulls last,
            case when v_sort_key = 'proveedor' and v_sort_direction = 'desc' then f.proveedor_sort end desc nulls last,
            f.updated_at desc,
            f.id asc
        ) as row_number
      from filtered f
    ),
    page_rows as (
      select *
      from ranked
      where row_number > v_offset
        and row_number <= v_offset + v_page_size
    )
    select jsonb_build_object(
      'documents',
      coalesce(
        (select jsonb_agg(payload order by row_number) from page_rows),
        '[]'::jsonb
      ),
      'total',
      (select count(*) from filtered),
      'page',
      v_page,
      'pageSize',
      v_page_size
    )
  );
end;
$$;

revoke all on function public.clc_list_documents(integer, integer, text, date, date, text, text, text, integer, text) from public;
grant execute on function public.clc_list_documents(integer, integer, text, date, date, text, text, text, integer, text) to anon, authenticated;

notify pgrst, 'reload schema';
