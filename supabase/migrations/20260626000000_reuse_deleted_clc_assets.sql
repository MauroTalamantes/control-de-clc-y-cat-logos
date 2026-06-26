-- Allows finalized CLC documents to be deleted without losing invoice history.
-- Released folios are kept in a pool and reused before allocating a new number.

create table if not exists public.clc_reusable_folios (
  anio integer not null,
  folio_number integer not null,
  folio text not null,
  deleted_document_id text not null,
  deleted_at timestamptz not null default now(),
  primary key (anio, folio_number),
  constraint clc_reusable_folios_number_check check (folio_number > 0)
);

alter table public.clc_reusable_folios enable row level security;
revoke all on table public.clc_reusable_folios from anon, authenticated;

alter table public.clc_invoice_registry
  add column if not exists source_folio text,
  add column if not exists removal_context text;

alter table public.clc_invoice_registry
  drop constraint if exists clc_invoice_registry_removal_context_check;

alter table public.clc_invoice_registry
  add constraint clc_invoice_registry_removal_context_check
  check (
    removal_context is null
    or removal_context in ('document_deleted', 'manual', 'document_updated')
  );

update public.clc_invoice_registry registry
set source_folio = coalesce(nullif(document.folio, ''), 'BORRADOR')
from public.clc_documents document
where document.id = registry.clc_id
  and registry.source_folio is null;

create or replace function public.clc_check_invoice_uuid(
  p_uuid text,
  p_current_clc_id text default null,
  p_current_partida_id text default null,
  p_app_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_usage jsonb;
begin
  perform public.clc_require_app_key(p_app_key);

  -- Editing the same active item is not reuse, even when an older deleted
  -- document also contains historical use of the UUID.
  if exists (
    select 1
    from public.clc_invoice_registry registry
    where registry.uuid = public.clc_normalize_invoice_uuid(p_uuid)
      and registry.status = 'active'
      and registry.clc_id = coalesce(p_current_clc_id, '')
      and coalesce(registry.partida_id, '') = coalesce(p_current_partida_id, '')
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'uuid', registry.uuid,
    'clcId', registry.clc_id,
    'folio', coalesce(nullif(document.folio, ''), registry.source_folio, 'BORRADOR'),
    'partidaId', coalesce(registry.partida_id, ''),
    'status', 'active'
  )
  into v_usage
  from public.clc_invoice_registry registry
  left join public.clc_documents document on document.id = registry.clc_id
  where registry.uuid = public.clc_normalize_invoice_uuid(p_uuid)
    and registry.status = 'active'
  limit 1;

  if v_usage is not null then
    return v_usage;
  end if;

  select jsonb_build_object(
    'uuid', registry.uuid,
    'clcId', registry.clc_id,
    'folio', coalesce(registry.source_folio, 'BORRADOR'),
    'partidaId', coalesce(registry.partida_id, ''),
    'status', 'deleted',
    'deletedAt', registry.deleted_at
  )
  into v_usage
  from public.clc_invoice_registry registry
  where registry.uuid = public.clc_normalize_invoice_uuid(p_uuid)
    and registry.status = 'removed'
    and registry.removal_context = 'document_deleted'
  order by registry.deleted_at desc nulls last, registry.id desc
  limit 1;

  return v_usage;
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
  perform public.clc_validate_provider_bank_relation(p_document);

  v_id := nullif(trim(p_document ->> 'id'), '');
  select payload into v_existing
  from public.clc_documents
  where id = v_id and estado = 'finalizado';

  if v_existing is not null then
    return jsonb_build_object('finalizedDoc', v_existing) || public.clc_build_app_meta();
  end if;

  v_anio := public.clc_document_year(p_document);
  perform pg_advisory_xact_lock(20260603, v_anio);

  -- Discard stale pool entries if a folio was assigned manually after deletion.
  delete from public.clc_reusable_folios reusable
  where reusable.anio = v_anio
    and exists (
      select 1
      from public.clc_documents document
      where document.anio = reusable.anio
        and document.estado = 'finalizado'
        and document.folio = reusable.folio
    );

  select reusable.folio_number
  into v_next_number
  from public.clc_reusable_folios reusable
  where reusable.anio = v_anio
  order by reusable.folio_number
  limit 1
  for update;

  if v_next_number is not null then
    delete from public.clc_reusable_folios
    where anio = v_anio and folio_number = v_next_number;
  else
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
  end if;

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
    raise exception 'Finalized CLC documents cannot be overwritten by clc_finalize_document'
      using errcode = '42501';
  end if;

  perform public.clc_sync_invoice_registry(v_finalized);
  return jsonb_build_object('finalizedDoc', v_finalized) || public.clc_build_app_meta();
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
  v_document public.clc_documents%rowtype;
  v_folio_number integer;
  v_deleted_count integer := 0;
begin
  perform public.clc_require_app_key(p_app_key);

  select *
  into v_document
  from public.clc_documents
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('deletedId', p_id, 'deleted', false) || public.clc_build_app_meta();
  end if;

  if v_document.estado = 'finalizado' and v_document.folio ~ '^CLC-[0-9]+/[0-9]{4}$' then
    v_folio_number := substring(v_document.folio from '^CLC-([0-9]+)/')::integer;
    insert into public.clc_reusable_folios (
      anio, folio_number, folio, deleted_document_id, deleted_at
    )
    values (
      v_document.anio, v_folio_number, v_document.folio, v_document.id, clock_timestamp()
    )
    on conflict (anio, folio_number) do update
    set folio = excluded.folio,
        deleted_document_id = excluded.deleted_document_id,
        deleted_at = excluded.deleted_at;
  end if;

  update public.clc_invoice_registry
  set status = 'removed',
      deleted_at = clock_timestamp(),
      deleted_reason = 'CLC eliminada',
      removal_context = 'document_deleted',
      source_folio = coalesce(nullif(v_document.folio, ''), 'BORRADOR')
  where clc_id = p_id and status = 'active';

  delete from public.clc_documents where id = p_id;
  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object(
    'deletedId', p_id,
    'deleted', v_deleted_count > 0
  ) || public.clc_build_app_meta();
end;
$$;

create or replace function public.clc_retire_invoice(
  p_uuid text,
  p_clc_id text,
  p_partida_id text,
  p_reason text,
  p_app_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_removed_count integer;
  v_next_items jsonb;
begin
  perform public.clc_require_app_key(p_app_key);
  if nullif(trim(p_reason), '') is null then
    raise exception 'El motivo para retirar la factura es obligatorio.' using errcode = '22023';
  end if;

  select estado into v_status
  from public.clc_documents
  where id = p_clc_id
  for update;

  if not found then
    raise exception 'No se encontró la CLC donde está registrada la factura.' using errcode = 'P0002';
  end if;
  if v_status = 'finalizado' then
    raise exception 'No se puede retirar una factura de una CLC finalizada.' using errcode = '42501';
  end if;

  update public.clc_invoice_registry
  set status = 'removed',
      deleted_at = now(),
      deleted_reason = trim(p_reason),
      removal_context = 'manual',
      source_folio = coalesce(source_folio, 'BORRADOR')
  where uuid = public.clc_normalize_invoice_uuid(p_uuid)
    and clc_id = p_clc_id
    and coalesce(partida_id, '') = coalesce(p_partida_id, '')
    and status = 'active';
  get diagnostics v_removed_count = row_count;

  select coalesce(jsonb_agg(item.value order by item.ordinality), '[]'::jsonb)
  into v_next_items
  from jsonb_array_elements(
    case
      when jsonb_typeof((select payload -> 'items' from public.clc_documents where id = p_clc_id)) = 'array'
        then (select payload -> 'items' from public.clc_documents where id = p_clc_id)
      else '[]'::jsonb
    end
  ) with ordinality item(value, ordinality)
  where coalesce(item.value ->> 'id', '') <> coalesce(p_partida_id, '');

  update public.clc_documents
  set payload = jsonb_set(payload, '{items}', v_next_items, true)
  where id = p_clc_id;

  return jsonb_build_object('removed', v_removed_count > 0);
end;
$$;

revoke all on function public.clc_check_invoice_uuid(text, text, text, text) from public;
revoke all on function public.clc_finalize_document(jsonb, text) from public;
revoke all on function public.clc_delete_document(text, text) from public;
revoke all on function public.clc_retire_invoice(text, text, text, text, text) from public;

grant execute on function public.clc_check_invoice_uuid(text, text, text, text) to anon, authenticated;
grant execute on function public.clc_finalize_document(jsonb, text) to anon, authenticated;
grant execute on function public.clc_delete_document(text, text) to anon, authenticated;
grant execute on function public.clc_retire_invoice(text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
