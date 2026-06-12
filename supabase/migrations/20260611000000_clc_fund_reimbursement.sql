create or replace function public.clc_sync_invoice_registry(p_document jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clc_id text := nullif(trim(p_document ->> 'id'), '');
  v_provider_rfc text := public.clc_normalize_rfc(p_document ->> 'proveedorRfc');
  v_provider_name text := nullif(trim(p_document ->> 'proveedorNombre'), '');
  v_is_fund_reimbursement boolean := lower(coalesce(p_document ->> 'reposicionFondo', 'false')) = 'true';
  v_items jsonb := case
    when jsonb_typeof(p_document -> 'items') = 'array' then p_document -> 'items'
    else '[]'::jsonb
  end;
  v_item jsonb;
  v_uuid text;
  v_item_id text;
  v_cfdi jsonb;
  v_registry_id bigint;
  v_duplicate_uuid text;
  v_conflict_folio text;
  v_conflict_uuid text;
  v_conflict_hash text;
begin
  select public.clc_normalize_invoice_uuid(item.value ->> 'numFactura')
  into v_duplicate_uuid
  from jsonb_array_elements(v_items) item(value)
  where public.clc_normalize_invoice_uuid(item.value ->> 'numFactura') <> ''
  group by public.clc_normalize_invoice_uuid(item.value ->> 'numFactura')
  having count(*) > 1
  limit 1;

  if v_duplicate_uuid is not null then
    raise exception 'El UUID % está duplicado dentro de esta CLC.', upper(v_duplicate_uuid)
      using errcode = '23505';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(invoice.uuid, 20260610))
  from (
    select distinct public.clc_normalize_invoice_uuid(item.value ->> 'numFactura') as uuid
    from jsonb_array_elements(v_items) item(value)
    where public.clc_normalize_invoice_uuid(item.value ->> 'numFactura') <> ''
    order by uuid
  ) invoice;

  select nullif(trim(item.value -> 'cfdi' ->> 'xmlHash'), '')
  into v_conflict_hash
  from jsonb_array_elements(v_items) item(value)
  where nullif(trim(item.value -> 'cfdi' ->> 'xmlHash'), '') is not null
  group by nullif(trim(item.value -> 'cfdi' ->> 'xmlHash'), '')
  having count(*) > 1
  limit 1;

  if v_conflict_hash is not null then
    raise exception 'El mismo archivo XML está duplicado dentro de esta CLC.'
      using errcode = '23505';
  end if;

  if not v_is_fund_reimbursement and exists (
    select 1
    from jsonb_array_elements(v_items) item(value)
    where public.clc_normalize_rfc(item.value -> 'cfdi' ->> 'rfcEmisor') <> ''
      and public.clc_normalize_rfc(item.value -> 'cfdi' ->> 'rfcEmisor') <> v_provider_rfc
  ) then
    raise exception 'El RFC emisor del XML no coincide con el RFC del proveedor seleccionado.'
      using errcode = '23514';
  end if;

  select registry.uuid, coalesce(nullif(document.folio, ''), 'BORRADOR')
  into v_conflict_uuid, v_conflict_folio
  from public.clc_invoice_registry registry
  left join public.clc_documents document on document.id = registry.clc_id
  join jsonb_array_elements(v_items) item(value)
    on registry.uuid = public.clc_normalize_invoice_uuid(item.value ->> 'numFactura')
  where registry.status = 'active'
    and not (
      registry.clc_id = v_clc_id
      and coalesce(registry.partida_id, '') = coalesce(item.value ->> 'id', '')
    )
  limit 1;

  if v_conflict_uuid is not null then
    raise exception 'Esta factura ya está registrada en la CLC %.', v_conflict_folio
      using errcode = '23505';
  end if;

  v_conflict_hash := null;
  select registry.xml_hash, coalesce(nullif(document.folio, ''), 'BORRADOR')
  into v_conflict_hash, v_conflict_folio
  from public.clc_invoice_registry registry
  left join public.clc_documents document on document.id = registry.clc_id
  join jsonb_array_elements(v_items) item(value)
    on registry.xml_hash = nullif(trim(item.value -> 'cfdi' ->> 'xmlHash'), '')
  where registry.status = 'active'
    and registry.xml_hash is not null
    and not (
      registry.clc_id = v_clc_id
      and coalesce(registry.partida_id, '') = coalesce(item.value ->> 'id', '')
    )
  limit 1;

  if v_conflict_hash is not null then
    raise exception 'Este archivo XML ya está registrado en la CLC %.', v_conflict_folio
      using errcode = '23505';
  end if;

  update public.clc_invoice_registry registry
  set status = 'removed',
      deleted_at = now(),
      deleted_reason = coalesce(registry.deleted_reason, 'Retirada al guardar cambios en la CLC')
  where registry.clc_id = v_clc_id
    and registry.status = 'active'
    and not exists (
      select 1
      from jsonb_array_elements(v_items) item(value)
      where public.clc_normalize_invoice_uuid(item.value ->> 'numFactura') = registry.uuid
        and coalesce(item.value ->> 'id', '') = coalesce(registry.partida_id, '')
    );

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_uuid := public.clc_normalize_invoice_uuid(v_item ->> 'numFactura');
    if v_uuid = '' then
      continue;
    end if;

    v_item_id := nullif(trim(v_item ->> 'id'), '');
    v_cfdi := case when jsonb_typeof(v_item -> 'cfdi') = 'object' then v_item -> 'cfdi' else '{}'::jsonb end;

    select id
    into v_registry_id
    from public.clc_invoice_registry
    where uuid = v_uuid and status = 'active'
    for update;

    if v_registry_id is null then
      insert into public.clc_invoice_registry (
        uuid, serie, folio, rfc_emisor, nombre_emisor, rfc_receptor, fecha_factura,
        subtotal, descuento, iva, isr, total, concepto, xml_hash, clc_id, partida_id
      )
      values (
        v_uuid,
        nullif(trim(v_cfdi ->> 'serie'), ''),
        nullif(trim(v_cfdi ->> 'folio'), ''),
        coalesce(nullif(public.clc_normalize_rfc(v_cfdi ->> 'rfcEmisor'), ''), v_provider_rfc),
        coalesce(nullif(trim(v_cfdi ->> 'nombreEmisor'), ''), v_provider_name),
        nullif(public.clc_normalize_rfc(v_cfdi ->> 'rfcReceptor'), ''),
        case when v_item ->> 'fechaFactura' ~ '^\d{4}-\d{2}-\d{2}$' then (v_item ->> 'fechaFactura')::date else null end,
        public.clc_invoice_numeric(v_item, 'subTotal'),
        public.clc_invoice_numeric(v_item, 'descuento'),
        public.clc_invoice_numeric(v_item, 'iva'),
        public.clc_invoice_numeric(v_item, 'isr'),
        public.clc_invoice_numeric(v_item, 'importe'),
        nullif(trim(v_cfdi ->> 'concepto'), ''),
        nullif(trim(v_cfdi ->> 'xmlHash'), ''),
        v_clc_id,
        v_item_id
      );
    else
      update public.clc_invoice_registry
      set serie = nullif(trim(v_cfdi ->> 'serie'), ''),
          folio = nullif(trim(v_cfdi ->> 'folio'), ''),
          rfc_emisor = coalesce(nullif(public.clc_normalize_rfc(v_cfdi ->> 'rfcEmisor'), ''), v_provider_rfc),
          nombre_emisor = coalesce(nullif(trim(v_cfdi ->> 'nombreEmisor'), ''), v_provider_name),
          rfc_receptor = nullif(public.clc_normalize_rfc(v_cfdi ->> 'rfcReceptor'), ''),
          fecha_factura = case when v_item ->> 'fechaFactura' ~ '^\d{4}-\d{2}-\d{2}$' then (v_item ->> 'fechaFactura')::date else null end,
          subtotal = public.clc_invoice_numeric(v_item, 'subTotal'),
          descuento = public.clc_invoice_numeric(v_item, 'descuento'),
          iva = public.clc_invoice_numeric(v_item, 'iva'),
          isr = public.clc_invoice_numeric(v_item, 'isr'),
          total = public.clc_invoice_numeric(v_item, 'importe'),
          concepto = nullif(trim(v_cfdi ->> 'concepto'), ''),
          xml_hash = nullif(trim(v_cfdi ->> 'xmlHash'), ''),
          clc_id = v_clc_id,
          partida_id = v_item_id,
          deleted_at = null,
          deleted_reason = null
      where id = v_registry_id;
    end if;

    v_registry_id := null;
  end loop;
end;
$$;

revoke all on function public.clc_sync_invoice_registry(jsonb) from public;
