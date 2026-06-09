import { createClient } from "@supabase/supabase-js";
import { AppCatalogs, AppDocumentMetrics, CLCDocument, FolioCounter, FolioYearSummary } from "../types";
import { INITIAL_CATALOGS, normalizeCatalogs } from "./initialData";

interface SupabaseSnapshotPayload {
  catalogs: AppCatalogs | null;
  documents: CLCDocument[];
  folioCounters?: FolioCounter[];
}

interface SupabaseMetaPayload {
  catalogs: AppCatalogs | null;
  folioCounters?: FolioCounter[];
  documentMetrics?: Partial<AppDocumentMetrics> | null;
  folioYearSummaries?: FolioYearSummary[];
}

interface SaveDocumentPayload extends SupabaseMetaPayload {
  document?: CLCDocument;
}

interface DeleteDocumentPayload extends SupabaseMetaPayload {
  deletedId?: string;
  deleted?: boolean;
}

interface FinalizePayload extends SupabaseMetaPayload {
  finalizedDoc: CLCDocument;
}

export type DocumentListSortKey = "fecha" | "folio" | "nombre" | "concepto" | "proveedor";
export type DocumentListSortDirection = "asc" | "desc";

export interface DocumentListParams {
  page: number;
  pageSize: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortKey?: DocumentListSortKey;
  sortDirection?: DocumentListSortDirection;
  estado?: "borrador" | "finalizado" | "";
  anio?: number | null;
}

export interface DocumentListResult {
  documents: CLCDocument[];
  total: number;
  page: number;
  pageSize: number;
  storageMode: "supabase" | "electron" | "browser";
}

interface DocumentListPayload {
  documents: CLCDocument[];
  total?: number;
  page?: number;
  pageSize?: number;
}

export interface AppMetaSnapshot {
  catalogs: AppCatalogs;
  documents: CLCDocument[];
  folioCounters: FolioCounter[];
  documentMetrics: AppDocumentMetrics;
  folioYearSummaries: FolioYearSummary[];
  storageMode: "supabase" | "electron" | "browser";
  dataFilePath?: string;
}

export interface SupabaseDocumentMutationResult extends AppMetaSnapshot {
  document: CLCDocument;
}

export interface SupabaseDeleteMutationResult extends AppMetaSnapshot {
  deletedId: string;
  deleted: boolean;
}

export interface SupabaseFinalizeMutationResult extends AppMetaSnapshot {
  finalizedDoc: CLCDocument;
}

export const EMPTY_DOCUMENT_METRICS: AppDocumentMetrics = {
  totalDocuments: 0,
  finalizedCount: 0,
  draftCount: 0,
  totalInvoiced: 0
};

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
  folioCounters: FolioCounter[];
  storageMode: "supabase";
} {
  return {
    catalogs: normalizeCatalogs(payload.catalogs),
    documents: Array.isArray(payload.documents) ? payload.documents : [],
    folioCounters: Array.isArray(payload.folioCounters) ? payload.folioCounters : [],
    storageMode: "supabase"
  };
}

function normalizeMetrics(metrics: Partial<AppDocumentMetrics> | null | undefined): AppDocumentMetrics {
  return {
    totalDocuments: Number(metrics?.totalDocuments) || 0,
    finalizedCount: Number(metrics?.finalizedCount) || 0,
    draftCount: Number(metrics?.draftCount) || 0,
    totalInvoiced: Number(metrics?.totalInvoiced) || 0
  };
}

function normalizeMeta(payload: SupabaseMetaPayload): AppMetaSnapshot {
  return {
    catalogs: normalizeCatalogs(payload.catalogs),
    documents: [],
    folioCounters: Array.isArray(payload.folioCounters) ? payload.folioCounters : [],
    documentMetrics: normalizeMetrics(payload.documentMetrics),
    folioYearSummaries: Array.isArray(payload.folioYearSummaries) ? payload.folioYearSummaries : [],
    storageMode: "supabase"
  };
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = assertSupabaseClient();
  const { data, error } = await client.rpc(name, args);

  if (error) {
    if (name === "clc_set_next_folio_number" && /schema cache|Could not find the function/i.test(error.message)) {
      throw new Error(
        "No se encontro la funcion de Supabase para modificar folios. Ejecuta las migraciones pendientes, incluida supabase/migrations/20260608020000_clc_light_mutations.sql, y despues recarga el schema cache."
      );
    }

    throw new Error(`${name}: ${error.message}`);
  }

  return data as T;
}

export async function loadSupabaseAppData() {
  const payload = await callRpc<SupabaseSnapshotPayload>("clc_get_snapshot", {
    p_app_key: supabaseAppKey
  });

  if (!payload.catalogs) {
    await saveSupabaseCatalogs(normalizeCatalogs(INITIAL_CATALOGS));
    return loadSupabaseAppData();
  }

  return normalizeSnapshot(payload);
}

export async function loadSupabaseAppMeta() {
  const payload = await callRpc<SupabaseMetaPayload>("clc_get_app_meta", {
    p_app_key: supabaseAppKey
  });

  return normalizeMeta(payload);
}

export async function listDocuments(params: DocumentListParams): Promise<DocumentListResult> {
  const payload = await callRpc<DocumentListPayload>("clc_list_documents", {
    p_page: params.page,
    p_page_size: params.pageSize,
    p_search: params.search?.trim() || null,
    p_date_from: params.dateFrom || null,
    p_date_to: params.dateTo || null,
    p_sort_key: params.sortKey || "fecha",
    p_sort_direction: params.sortDirection || "desc",
    p_estado: params.estado || null,
    p_anio: params.anio ?? null,
    p_app_key: supabaseAppKey
  });

  return {
    documents: Array.isArray(payload.documents) ? payload.documents : [],
    total: Number.isFinite(payload.total) ? Number(payload.total) : 0,
    page: Number.isFinite(payload.page) ? Number(payload.page) : params.page,
    pageSize: Number.isFinite(payload.pageSize) ? Number(payload.pageSize) : params.pageSize,
    storageMode: "supabase"
  };
}

export async function saveSupabaseCatalogs(catalogs: AppCatalogs) {
  const payload = await callRpc<SupabaseMetaPayload>("clc_save_catalogs", {
    p_catalogs: normalizeCatalogs(catalogs),
    p_app_key: supabaseAppKey
  });
  return normalizeMeta(payload);
}

export async function saveSupabaseDocument(document: CLCDocument) {
  const payload = await callRpc<SaveDocumentPayload>("clc_save_document", {
    p_document: document,
    p_app_key: supabaseAppKey
  });
  return {
    ...normalizeMeta(payload),
    document: payload.document || document
  };
}

export async function deleteSupabaseDocument(id: string) {
  const payload = await callRpc<DeleteDocumentPayload>("clc_delete_document", {
    p_id: id,
    p_app_key: supabaseAppKey
  });
  return {
    ...normalizeMeta(payload),
    deletedId: payload.deletedId || id,
    deleted: Boolean(payload.deleted)
  };
}

export async function finalizeSupabaseDocument(document: CLCDocument): Promise<SupabaseFinalizeMutationResult> {
  const payload = await callRpc<FinalizePayload>("clc_finalize_document", {
    p_document: document,
    p_app_key: supabaseAppKey
  });
  return {
    ...normalizeMeta(payload),
    finalizedDoc: payload.finalizedDoc,
  };
}

export async function setSupabaseNextFolioNumber(anio: number, nextNumber: number) {
  const payload = await callRpc<SupabaseMetaPayload>("clc_set_next_folio_number", {
    p_anio: anio,
    p_next_number: nextNumber,
    p_app_key: supabaseAppKey
  });
  return normalizeMeta(payload);
}
