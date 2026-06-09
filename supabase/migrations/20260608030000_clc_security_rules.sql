-- Conservative security hardening for critical CLC RPCs.
-- Keeps lightweight mutation responses and does not remove legacy snapshot functions.

alter table public.clc_documents
add column if not exists finalized_at timestamptz;

create or replace function public.clc_validate_document_payload(
  p_document jsonb,
  p_require_finalizable boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id text;
  v_estado text;
  v_anio_text text;
  v_anio integer;
  v_items jsonb;
  v_item jsonb;
  v_field text;
  v_value_text text;
  v_value numeric;
begin
  if coalesce(jsonb_typeof(p_document), 'null') <> 'object' then
    raise exception 'CLC document must be a JSON object' using errcode = '22023';
  end if;

  v_id := nullif(trim(p_document ->> 'id'), '');
  if v_id is null then
    raise exception 'CLC document id is required' using errcode = '22023';
  end if;

  v_estado := nullif(lower(trim(coalesce(p_document ->> 'estado', ''))), '');
  if v_estado is not null and v_estado not in ('borrador', 'finalizado') then
    raise exception 'Invalid CLC document status' using errcode = '22023';
  end if;

  v_anio_text := coalesce(
    nullif(trim(p_document ->> U&'a\00F1o'), ''),
    nullif(trim(p_document ->> 'anio'), '')
  );

  if v_anio_text is not null then
    if v_anio_text !~ '^\d{4}$' then
      raise exception 'Invalid CLC document year' using errcode = '22023';
    end if;

    v_anio := v_anio_text::integer;
    if v_anio < 2000 or v_anio > 9999 then
      raise exception 'Invalid CLC document year' using errcode = '22023';
    end if;
  elsif p_require_finalizable then
    raise exception 'CLC document year is required to finalize' using errcode = '22023';
  end if;

  v_items := p_document -> 'items';
  if v_items is not null and coalesce(jsonb_typeof(v_items), 'null') <> 'array' then
    raise exception 'CLC document items must be a JSON array' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(v_items), 'null') = 'array' then
    for v_item in select value from jsonb_array_elements(v_items)
    loop
      if coalesce(jsonb_typeof(v_item), 'null') <> 'object' then
        raise exception 'CLC document item must be a JSON object' using errcode = '22023';
      end if;

      foreach v_field in array array['subTotal', 'descuento', 'iva', 'isr', 'importe']
      loop
        v_value_text := nullif(trim(v_item ->> v_field), '');
        if v_value_text is null then
          continue;
        end if;

        if v_value_text !~ '^-?\d+(\.\d+)?$' then
          raise exception 'CLC document amount field % must be numeric', v_field using errcode = '22023';
        end if;

        v_value := v_value_text::numeric;
        if v_value < 0 then
          raise exception 'CLC document amount field % cannot be negative', v_field using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;

  if not p_require_finalizable then
    return;
  end if;

  if nullif(trim(p_document ->> 'unidadClave'), '') is null
    or nullif(trim(p_document ->> 'unidadNombre'), '') is null then
    raise exception 'CLC document administrative unit is required to finalize' using errcode = '22023';
  end if;

  if nullif(trim(p_document ->> 'proveedorNombre'), '') is null
    or nullif(trim(p_document ->> 'proveedorRfc'), '') is null then
    raise exception 'CLC document provider name and RFC are required to finalize' using errcode = '22023';
  end if;

  if nullif(trim(p_document ->> 'bancoNombre'), '') is null
    or nullif(trim(p_document ->> 'bancoCuenta'), '') is null
    or nullif(trim(p_document ->> 'bancoClabe'), '') is null then
    raise exception 'CLC document payment bank, account and CLABE are required to finalize' using errcode = '22023';
  end if;

  if nullif(trim(p_document ->> 'concepto'), '') is null then
    raise exception 'CLC document concept is required to finalize' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(v_items), 'null') <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'CLC document must include at least one item to finalize' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    if nullif(trim(v_item ->> 'numFactura'), '') is null then
      raise exception 'CLC document item invoice number is required to finalize' using errcode = '22023';
    end if;

    if nullif(trim(v_item ->> 'fuenteClave'), '') is null
      or nullif(trim(v_item ->> 'proyectoClave'), '') is null
      or nullif(trim(v_item ->> 'objetoClave'), '') is null then
      raise exception 'CLC document item budget keys are required to finalize' using errcode = '22023';
    end if;

    v_value_text := nullif(trim(v_item ->> 'subTotal'), '');
    if v_value_text is null or v_value_text !~ '^-?\d+(\.\d+)?$' or v_value_text::numeric <= 0 then
      raise exception 'CLC document item subtotal must be greater than zero to finalize' using errcode = '22023';
    end if;

    v_value_text := nullif(trim(v_item ->> 'importe'), '');
    if v_value_text is null or v_value_text !~ '^-?\d+(\.\d+)?$' or v_value_text::numeric <= 0 then
      raise exception 'CLC document item amount must be greater than zero to finalize' using errcode = '22023';
    end if;
  end loop;
end;
$$;

create or replace function public.clc_validate_catalogs(p_catalogs jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duplicate text;
begin
  if coalesce(jsonb_typeof(p_catalogs), 'null') <> 'object' then
    raise exception 'CLC catalogs must be a JSON object' using errcode = '22023';
  end if;

  if p_catalogs ? 'proveedores' and coalesce(jsonb_typeof(p_catalogs -> 'proveedores'), 'null') <> 'array' then
    raise exception 'CLC catalog proveedores must be a JSON array' using errcode = '22023';
  end if;

  if p_catalogs ? 'bancos' and coalesce(jsonb_typeof(p_catalogs -> 'bancos'), 'null') <> 'array' then
    raise exception 'CLC catalog bancos must be a JSON array' using errcode = '22023';
  end if;

  if p_catalogs ? 'fuentes' and coalesce(jsonb_typeof(p_catalogs -> 'fuentes'), 'null') <> 'array' then
    raise exception 'CLC catalog fuentes must be a JSON array' using errcode = '22023';
  end if;

  if p_catalogs ? 'proyectos' and coalesce(jsonb_typeof(p_catalogs -> 'proyectos'), 'null') <> 'array' then
    raise exception 'CLC catalog proyectos must be a JSON array' using errcode = '22023';
  end if;

  if p_catalogs ? 'objetos' and coalesce(jsonb_typeof(p_catalogs -> 'objetos'), 'null') <> 'array' then
    raise exception 'CLC catalog objetos must be a JSON array' using errcode = '22023';
  end if;

  select s.rfc
  into v_duplicate
  from (
    select lower(regexp_replace(value ->> 'rfc', '\s+', '', 'g')) as rfc
    from jsonb_array_elements(
      case when jsonb_typeof(p_catalogs -> 'proveedores') = 'array' then p_catalogs -> 'proveedores' else '[]'::jsonb end
    ) as item(value)
    where nullif(regexp_replace(coalesce(value ->> 'rfc', ''), '\s+', '', 'g'), '') is not null
  ) s
  group by s.rfc
  having count(*) > 1
  limit 1;

  if v_duplicate is not null then
    raise exception 'Duplicate provider RFC in CLC catalogs: %', v_duplicate using errcode = '23505';
  end if;

  v_duplicate := null;
  select s.clabe
  into v_duplicate
  from (
    select regexp_replace(value ->> 'clabe', '\s+', '', 'g') as clabe
    from jsonb_array_elements(
      case when jsonb_typeof(p_catalogs -> 'bancos') = 'array' then p_catalogs -> 'bancos' else '[]'::jsonb end
    ) as item(value)
    where nullif(regexp_replace(coalesce(value ->> 'clabe', ''), '\s+', '', 'g'), '') is not null
  ) s
  group by s.clabe
  having count(*) > 1
  limit 1;

  if v_duplicate is not null then
    raise exception 'Duplicate bank CLABE in CLC catalogs: %', v_duplicate using errcode = '23505';
  end if;

  v_duplicate := null;
  select s.clave
  into v_duplicate
  from (
    select upper(trim(value ->> 'clave')) as clave
    from jsonb_array_elements(
      case when jsonb_typeof(p_catalogs -> 'fuentes') = 'array' then p_catalogs -> 'fuentes' else '[]'::jsonb end
    ) as item(value)
    where nullif(trim(coalesce(value ->> 'clave', '')), '') is not null
  ) s
  group by s.clave
  having count(*) > 1
  limit 1;

  if v_duplicate is not null then
    raise exception 'Duplicate budget source key in CLC catalogs: %', v_duplicate using errcode = '23505';
  end if;

  v_duplicate := null;
  select s.clave
  into v_duplicate
  from (
    select upper(trim(value ->> 'clave')) as clave
    from jsonb_array_elements(
      case when jsonb_typeof(p_catalogs -> 'proyectos') = 'array' then p_catalogs -> 'proyectos' else '[]'::jsonb end
    ) as item(value)
    where nullif(trim(coalesce(value ->> 'clave', '')), '') is not null
  ) s
  group by s.clave
  having count(*) > 1
  limit 1;

  if v_duplicate is not null then
    raise exception 'Duplicate budget project key in CLC catalogs: %', v_duplicate using errcode = '23505';
  end if;

  v_duplicate := null;
  select s.clave
  into v_duplicate
  from (
    select upper(trim(value ->> 'clave')) as clave
    from jsonb_array_elements(
      case when jsonb_typeof(p_catalogs -> 'objetos') = 'array' then p_catalogs -> 'objetos' else '[]'::jsonb end
    ) as item(value)
    where nullif(trim(coalesce(value ->> 'clave', '')), '') is not null
  ) s
  group by s.clave
  having count(*) > 1
  limit 1;

  if v_duplicate is not null then
    raise exception 'Duplicate expense object key in CLC catalogs: %', v_duplicate using errcode = '23505';
  end if;
end;
$$;

create or replace function public.clc_save_catalogs(
  p_catalogs jsonb,
  p_app_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.clc_require_app_key(p_app_key);
  perform public.clc_validate_catalogs(p_catalogs);

  update public.clc_app_settings
  set catalogs = p_catalogs
  where id = 'default';

  return public.clc_build_app_meta();
end;
$$;

create or replace function public.clc_save_document(
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
  v_folio text;
  v_anio integer;
  v_requested_estado text;
  v_draft jsonb;
  v_written_count integer;
begin
  perform public.clc_require_app_key(p_app_key);
  perform public.clc_validate_document_payload(p_document, false);

  v_id := nullif(trim(p_document ->> 'id'), '');
  v_folio := nullif(trim(p_document ->> 'folio'), '');
  v_requested_estado := lower(coalesce(nullif(trim(p_document ->> 'estado'), ''), 'borrador'));

  if v_requested_estado = 'finalizado' then
    raise exception 'Use clc_finalize_document to finalize CLC documents' using errcode = '22023';
  end if;

  if v_requested_estado <> 'borrador' then
    raise exception 'clc_save_document only accepts draft CLC documents' using errcode = '22023';
  end if;

  if v_folio is not null then
    raise exception 'Draft CLC documents cannot include a folio' using errcode = '22023';
  end if;

  v_anio := public.clc_document_year(p_document);
  if v_anio < 2000 or v_anio > 9999 then
    raise exception 'Invalid CLC document year' using errcode = '22023';
  end if;

  v_draft := jsonb_set(p_document, '{estado}', to_jsonb('borrador'::text), true);
  v_draft := jsonb_set(v_draft, '{folio}', to_jsonb(''::text), true);

  insert into public.clc_documents (id, folio, anio, estado, payload)
  values (v_id, null, v_anio, 'borrador', v_draft)
  on conflict (id) do update
  set folio = excluded.folio,
      anio = excluded.anio,
      estado = excluded.estado,
      payload = excluded.payload
  where public.clc_documents.estado <> 'finalizado';

  get diagnostics v_written_count = row_count;
  if v_written_count = 0 then
    raise exception 'Finalized CLC documents cannot be overwritten by clc_save_document' using errcode = '42501';
  end if;

  return jsonb_build_object('document', v_draft) || public.clc_build_app_meta();
end;
$$;

create or replace function public.clc_delete_document(
  p_id text,
  p_app_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_deleted_count integer := 0;
begin
  perform public.clc_require_app_key(p_app_key);

  select estado
  into v_estado
  from public.clc_documents
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object(
      'deletedId', p_id,
      'deleted', false
    ) || public.clc_build_app_meta();
  end if;

  if v_estado = 'finalizado' then
    raise exception 'Finalized CLC documents cannot be deleted' using errcode = '42501';
  end if;

  delete from public.clc_documents
  where id = p_id
    and estado <> 'finalizado';

  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'deletedId', p_id,
    'deleted', v_deleted_count > 0
  ) || public.clc_build_app_meta();
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
  v_now timestamptz;
  v_now_iso text;
  v_finalized jsonb;
  v_written_count integer;
begin
  perform public.clc_require_app_key(p_app_key);
  perform public.clc_validate_document_payload(p_document, true);

  v_id := nullif(trim(p_document ->> 'id'), '');

  select payload
  into v_existing
  from public.clc_documents
  where id = v_id and estado = 'finalizado';

  if v_existing is not null then
    return jsonb_build_object('finalizedDoc', v_existing) || public.clc_build_app_meta();
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
  v_now := clock_timestamp();
  v_now_iso := to_char(v_now at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  v_finalized := jsonb_set(p_document, '{folio}', to_jsonb(v_folio), true);
  v_finalized := jsonb_set(v_finalized, '{estado}', to_jsonb('finalizado'::text), true);
  v_finalized := jsonb_set(v_finalized, '{fechaCreacion}', to_jsonb(v_now_iso), true);

  insert into public.clc_documents (id, folio, anio, estado, payload, finalized_at)
  values (v_id, v_folio, v_anio, 'finalizado', v_finalized, v_now)
  on conflict (id) do update
  set folio = excluded.folio,
      anio = excluded.anio,
      estado = excluded.estado,
      payload = excluded.payload,
      finalized_at = coalesce(public.clc_documents.finalized_at, excluded.finalized_at)
  where public.clc_documents.estado <> 'finalizado';

  get diagnostics v_written_count = row_count;
  if v_written_count = 0 then
    select payload
    into v_existing
    from public.clc_documents
    where id = v_id and estado = 'finalizado';

    if v_existing is not null then
      return jsonb_build_object('finalizedDoc', v_existing) || public.clc_build_app_meta();
    end if;

    raise exception 'Finalized CLC documents cannot be overwritten by clc_finalize_document' using errcode = '42501';
  end if;

  return jsonb_build_object('finalizedDoc', v_finalized) || public.clc_build_app_meta();
end;
$$;

revoke all on function public.clc_validate_document_payload(jsonb, boolean) from public;
revoke all on function public.clc_validate_catalogs(jsonb) from public;
revoke all on function public.clc_save_catalogs(jsonb, text) from public;
revoke all on function public.clc_save_document(jsonb, text) from public;
revoke all on function public.clc_delete_document(text, text) from public;
revoke all on function public.clc_finalize_document(jsonb, text) from public;

grant execute on function public.clc_save_catalogs(jsonb, text) to anon, authenticated;
grant execute on function public.clc_save_document(jsonb, text) to anon, authenticated;
grant execute on function public.clc_delete_document(text, text) to anon, authenticated;
grant execute on function public.clc_finalize_document(jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';
