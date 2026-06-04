-- Adds folio counter visibility and a protected operation to define the next folio.

create or replace function public.clc_build_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'catalogs',
    (select catalogs from public.clc_app_settings where id = 'default'),
    'documents',
    coalesce(
      (
        select jsonb_agg(payload order by anio desc, updated_at desc, id asc)
        from public.clc_documents
      ),
      '[]'::jsonb
    ),
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
    )
  );
$$;

create or replace function public.clc_set_next_folio_number(
  p_anio integer,
  p_next_number integer,
  p_app_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_existing integer;
begin
  perform public.clc_require_app_key(p_app_key);

  if p_anio is null or p_anio < 2000 or p_anio > 9999 then
    raise exception 'Invalid folio year' using errcode = '22023';
  end if;

  if p_next_number is null or p_next_number < 1 then
    raise exception 'Next folio number must be greater than zero' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(20260603, p_anio);

  select coalesce(max(nullif(substring(folio from '^CLC-(\d+)/'), '')::integer), 0)
  into v_max_existing
  from public.clc_documents
  where anio = p_anio and estado = 'finalizado';

  if p_next_number <= v_max_existing then
    raise exception 'Next folio number must be greater than the highest existing folio (%)', v_max_existing
      using errcode = '22023';
  end if;

  insert into public.clc_folio_counters (anio, last_number)
  values (p_anio, p_next_number - 1)
  on conflict (anio) do update
  set last_number = excluded.last_number;

  return public.clc_build_snapshot();
end;
$$;

create or replace function public.clc_finalize_document(
  p_document jsonb,
  p_app_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_existing jsonb;
  v_anio integer;
  v_max_existing integer;
  v_next_number integer;
  v_folio text;
  v_now_iso text;
  v_finalized jsonb;
begin
  perform public.clc_require_app_key(p_app_key);

  if jsonb_typeof(p_document) <> 'object' then
    raise exception 'CLC document must be a JSON object' using errcode = '22023';
  end if;

  v_id := nullif(p_document ->> 'id', '');
  if v_id is null then
    raise exception 'CLC document id is required' using errcode = '22023';
  end if;

  select payload
  into v_existing
  from public.clc_documents
  where id = v_id and estado = 'finalizado';

  if v_existing is not null then
    return jsonb_build_object(
      'finalizedDoc', v_existing,
      'documents', public.clc_build_snapshot() -> 'documents',
      'folioCounters', public.clc_build_snapshot() -> 'folioCounters'
    );
  end if;

  v_anio := public.clc_document_year(p_document);

  perform pg_advisory_xact_lock(20260603, v_anio);

  select coalesce(max(nullif(substring(folio from '^CLC-(\d+)/'), '')::integer), 0)
  into v_max_existing
  from public.clc_documents
  where anio = v_anio and estado = 'finalizado';

  insert into public.clc_folio_counters (anio, last_number)
  values (v_anio, v_max_existing)
  on conflict (anio) do update
  set last_number = greatest(public.clc_folio_counters.last_number, excluded.last_number);

  update public.clc_folio_counters
  set last_number = last_number + 1
  where anio = v_anio
  returning last_number into v_next_number;

  v_folio := 'CLC-' || lpad(v_next_number::text, 3, '0') || '/' || v_anio::text;
  v_now_iso := to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  v_finalized := jsonb_set(p_document, '{folio}', to_jsonb(v_folio), true);
  v_finalized := jsonb_set(v_finalized, '{estado}', to_jsonb('finalizado'::text), true);
  v_finalized := jsonb_set(v_finalized, '{fechaCreacion}', to_jsonb(v_now_iso), true);

  insert into public.clc_documents (id, folio, anio, estado, payload)
  values (v_id, v_folio, v_anio, 'finalizado', v_finalized)
  on conflict (id) do update
  set folio = excluded.folio,
      anio = excluded.anio,
      estado = excluded.estado,
      payload = excluded.payload;

  return jsonb_build_object(
    'finalizedDoc', v_finalized,
    'documents', public.clc_build_snapshot() -> 'documents',
    'folioCounters', public.clc_build_snapshot() -> 'folioCounters'
  );
end;
$$;

revoke all on function public.clc_set_next_folio_number(integer, integer, text) from public;
grant execute on function public.clc_set_next_folio_number(integer, integer, text) to anon, authenticated;
