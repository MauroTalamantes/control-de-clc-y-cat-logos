-- Core Supabase schema for Control de CLC y Catalogos.
-- Run this SQL once in the Supabase SQL editor before enabling the app env vars.

create table if not exists public.clc_app_settings (
  id text primary key default 'default',
  catalogs jsonb,
  app_key text,
  updated_at timestamptz not null default now(),
  constraint clc_app_settings_singleton check (id = 'default')
);

insert into public.clc_app_settings (id, catalogs, app_key)
values ('default', null, null)
on conflict (id) do nothing;

create table if not exists public.clc_folio_counters (
  anio integer primary key,
  last_number integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.clc_documents (
  id text primary key,
  folio text,
  anio integer not null,
  estado text not null check (estado in ('borrador', 'finalizado')),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists clc_documents_unique_folio
on public.clc_documents (folio)
where folio is not null and folio <> '';

create index if not exists clc_documents_anio_estado_idx
on public.clc_documents (anio, estado);

alter table public.clc_app_settings enable row level security;
alter table public.clc_folio_counters enable row level security;
alter table public.clc_documents enable row level security;

revoke all on table public.clc_app_settings from anon, authenticated;
revoke all on table public.clc_folio_counters from anon, authenticated;
revoke all on table public.clc_documents from anon, authenticated;

create or replace function public.clc_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clc_app_settings_updated_at on public.clc_app_settings;
create trigger clc_app_settings_updated_at
before update on public.clc_app_settings
for each row execute function public.clc_set_updated_at();

drop trigger if exists clc_folio_counters_updated_at on public.clc_folio_counters;
create trigger clc_folio_counters_updated_at
before update on public.clc_folio_counters
for each row execute function public.clc_set_updated_at();

drop trigger if exists clc_documents_updated_at on public.clc_documents;
create trigger clc_documents_updated_at
before update on public.clc_documents
for each row execute function public.clc_set_updated_at();

create or replace function public.clc_require_app_key(p_app_key text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required_key text;
begin
  select app_key
  into v_required_key
  from public.clc_app_settings
  where id = 'default';

  if v_required_key is not null and length(trim(v_required_key)) > 0 then
    if p_app_key is null or p_app_key <> v_required_key then
      raise exception 'Invalid CLC app key' using errcode = '42501';
    end if;
  end if;
end;
$$;

create or replace function public.clc_document_year(p_document jsonb)
returns integer
language sql
stable
as $$
  select coalesce(
    nullif(p_document ->> U&'a\00F1o', '')::integer,
    nullif(p_document ->> 'anio', '')::integer,
    extract(year from now())::integer
  );
$$;

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
    )
  );
$$;

create or replace function public.clc_get_snapshot(p_app_key text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.clc_require_app_key(p_app_key);
  return public.clc_build_snapshot();
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

  update public.clc_app_settings
  set catalogs = p_catalogs
  where id = 'default';

  return public.clc_build_snapshot();
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
  v_estado text;
begin
  perform public.clc_require_app_key(p_app_key);

  if jsonb_typeof(p_document) <> 'object' then
    raise exception 'CLC document must be a JSON object' using errcode = '22023';
  end if;

  v_id := nullif(p_document ->> 'id', '');
  if v_id is null then
    raise exception 'CLC document id is required' using errcode = '22023';
  end if;

  v_folio := nullif(p_document ->> 'folio', '');
  v_anio := public.clc_document_year(p_document);
  v_estado := coalesce(nullif(p_document ->> 'estado', ''), 'borrador');

  insert into public.clc_documents (id, folio, anio, estado, payload)
  values (v_id, v_folio, v_anio, v_estado, p_document)
  on conflict (id) do update
  set folio = excluded.folio,
      anio = excluded.anio,
      estado = excluded.estado,
      payload = excluded.payload;

  return public.clc_build_snapshot();
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
begin
  perform public.clc_require_app_key(p_app_key);

  delete from public.clc_documents
  where id = p_id;

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
      'documents', public.clc_build_snapshot() -> 'documents'
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
    'documents', public.clc_build_snapshot() -> 'documents'
  );
end;
$$;

revoke all on function public.clc_set_updated_at() from public;
revoke all on function public.clc_require_app_key(text) from public;
revoke all on function public.clc_document_year(jsonb) from public;
revoke all on function public.clc_build_snapshot() from public;
revoke all on function public.clc_get_snapshot(text) from public;
revoke all on function public.clc_save_catalogs(jsonb, text) from public;
revoke all on function public.clc_save_document(jsonb, text) from public;
revoke all on function public.clc_delete_document(text, text) from public;
revoke all on function public.clc_finalize_document(jsonb, text) from public;

grant execute on function public.clc_get_snapshot(text) to anon, authenticated;
grant execute on function public.clc_save_catalogs(jsonb, text) to anon, authenticated;
grant execute on function public.clc_save_document(jsonb, text) to anon, authenticated;
grant execute on function public.clc_delete_document(text, text) to anon, authenticated;
grant execute on function public.clc_finalize_document(jsonb, text) to anon, authenticated;

-- Optional production gate:
-- update public.clc_app_settings set app_key = 'CHANGE_ME' where id = 'default';
-- Then set VITE_SUPABASE_APP_KEY to the same value before building the app.
