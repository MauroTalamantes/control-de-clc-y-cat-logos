import { createClient } from "@supabase/supabase-js";
import { AppCatalogs, CLCDocument } from "../types";
import { INITIAL_CATALOGS } from "./initialData";

interface SupabaseSnapshotPayload {
  catalogs: AppCatalogs | null;
  documents: CLCDocument[];
}

interface FinalizePayload {
  finalizedDoc: CLCDocument;
  documents: CLCDocument[];
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
const supabaseAppKey = import.meta.env.VITE_SUPABASE_APP_KEY?.trim() || null;

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseAnonKey);

const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    })
  : null;

function assertSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase no esta configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}

function normalizeSnapshot(payload: SupabaseSnapshotPayload): {
  catalogs: AppCatalogs;
  documents: CLCDocument[];
  storageMode: "supabase";
} {
  return {
    catalogs: payload.catalogs || INITIAL_CATALOGS,
    documents: Array.isArray(payload.documents) ? payload.documents : [],
    storageMode: "supabase"
  };
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = assertSupabaseClient();
  const { data, error } = await client.rpc(name, args);

  if (error) {
    throw new Error(`${name}: ${error.message}`);
  }

  return data as T;
}

export async function loadSupabaseAppData() {
  const payload = await callRpc<SupabaseSnapshotPayload>("clc_get_snapshot", {
    p_app_key: supabaseAppKey
  });
  return normalizeSnapshot(payload);
}

export async function saveSupabaseCatalogs(catalogs: AppCatalogs) {
  const payload = await callRpc<SupabaseSnapshotPayload>("clc_save_catalogs", {
    p_catalogs: catalogs,
    p_app_key: supabaseAppKey
  });
  return normalizeSnapshot(payload);
}

export async function saveSupabaseDocument(document: CLCDocument) {
  const payload = await callRpc<SupabaseSnapshotPayload>("clc_save_document", {
    p_document: document,
    p_app_key: supabaseAppKey
  });
  return normalizeSnapshot(payload);
}

export async function deleteSupabaseDocument(id: string) {
  const payload = await callRpc<SupabaseSnapshotPayload>("clc_delete_document", {
    p_id: id,
    p_app_key: supabaseAppKey
  });
  return normalizeSnapshot(payload);
}

export async function finalizeSupabaseDocument(document: CLCDocument): Promise<FinalizePayload> {
  return callRpc<FinalizePayload>("clc_finalize_document", {
    p_document: document,
    p_app_key: supabaseAppKey
  });
}
