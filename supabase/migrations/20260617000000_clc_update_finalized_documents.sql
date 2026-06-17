create or replace function public.clc_update_finalized_document(
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
  v_existing_payload jsonb;
  v_existing_finalized_at timestamptz;
  v_anio integer;
  v_requested_folio text;
  v_folio_number integer;
  v_folio_year integer;
  v_normalized_folio text;
  v_fecha_creacion text;
  v_finalized jsonb;
  v_written_count integer;
begin
  perform public.clc_require_app_key(p_app_key);
  perform public.clc_validate_document_payload(p_document, true);
  perform public.clc_validate_provider_bank_relation(p_document);

  v_id := nullif(trim(p_document ->> 'id'), '');
  v_requested_folio := upper(nullif(trim(p_document ->> 'folio'), ''));
  if v_requested_folio is null or v_requested_folio !~ '^CLC-[0-9]+/[0-9]{4}$' then
    raise exception 'The finalized CLC folio must use format CLC-001/2026' using errcode = '22023';
  end if;

  v_folio_number := substring(v_requested_folio from '^CLC-([0-9]+)/')::integer;
  v_folio_year := substring(v_requested_folio from '/([0-9]{4})$')::integer;
  v_normalized_folio := 'CLC-' || lpad(v_folio_number::text, 3, '0') || '/' || v_folio_year::text;
  v_anio := public.clc_document_year(p_document);

  if v_folio_number < 1 or v_folio_year <> v_anio then
    raise exception 'The finalized CLC folio must match the document fiscal year' using errcode = '22023';
  end if;

  select payload, finalized_at
  into v_existing_payload, v_existing_finalized_at
  from public.clc_documents
  where id = v_id and estado = 'finalizado'
  for update;

  if v_existing_payload is null then
    raise exception 'Finalized CLC document not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.clc_documents
    where id <> v_id
      and estado = 'finalizado'
      and folio = v_normalized_folio
  ) then
    raise exception 'The folio % already exists in another finalized CLC document', v_normalized_folio
      using errcode = '23505';
  end if;

  v_fecha_creacion := coalesce(
    nullif(v_existing_payload ->> 'fechaCreacion', ''),
    nullif(p_document ->> 'fechaCreacion', ''),
    to_char(coalesce(v_existing_finalized_at, clock_timestamp()) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  v_finalized := jsonb_set(p_document, '{folio}', to_jsonb(v_normalized_folio), true);
  v_finalized := jsonb_set(v_finalized, '{estado}', to_jsonb('finalizado'::text), true);
  v_finalized := jsonb_set(v_finalized, '{fechaCreacion}', to_jsonb(v_fecha_creacion), true);

  update public.clc_documents
  set folio = v_normalized_folio,
      anio = v_anio,
      estado = 'finalizado',
      payload = v_finalized,
      finalized_at = coalesce(public.clc_documents.finalized_at, clock_timestamp())
  where id = v_id and estado = 'finalizado';

  get diagnostics v_written_count = row_count;
  if v_written_count = 0 then
    raise exception 'Finalized CLC document could not be updated' using errcode = '42501';
  end if;

  perform public.clc_sync_invoice_registry(v_finalized);
  return jsonb_build_object('document', v_finalized, 'finalizedDoc', v_finalized) || public.clc_build_app_meta();
end;
$$;

revoke all on function public.clc_update_finalized_document(jsonb, text) from public;
grant execute on function public.clc_update_finalized_document(jsonb, text) to anon, authenticated;
