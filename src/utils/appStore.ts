import { AppCatalogs, AppDocumentMetrics, CLCDocument, FolioCounter, FolioYearSummary } from "../types";
import {
  INITIAL_CATALOGS,
  INITIAL_DOCUMENTS,
  finalizeDocumentAndAssignFolio,
  getStoredCatalogs,
  getStoredDocuments,
  getStoredFolioCounters,
  saveStoredCatalogs,
  saveStoredDocuments,
  saveStoredFolioCounters,
  setStoredNextFolioNumber
} from "./initialData";
import {
  deleteSupabaseDocument,
  finalizeSupabaseDocument,
  EMPTY_DOCUMENT_METRICS,
  isSupabaseConfigured,
  listDocuments as listSupabaseDocuments,
  loadSupabaseAppData,
  loadSupabaseAppMeta,
  saveSupabaseCatalogs,
  saveSupabaseDocument,
  setSupabaseNextFolioNumber,
  type AppMetaSnapshot,
  type DocumentListParams,
  type DocumentListResult,
  type DocumentListSortKey,
  type SupabaseDeleteMutationResult,
  type SupabaseDocumentMutationResult,
  type SupabaseFinalizeMutationResult
} from "./supabaseStore";

export type { DocumentListParams, DocumentListResult, DocumentListSortKey } from "./supabaseStore";

export interface AppDataSnapshot {
  catalogs: AppCatalogs;
  documents: CLCDocument[];
  folioCounters: FolioCounter[];
  dataFilePath?: string;
  storageMode: "supabase" | "electron" | "browser";
}

const isElectronStoreAvailable = () => Boolean(window.clcStore);

function getDocumentYear(document: CLCDocument) {
  const year = (document as unknown as Record<string, unknown>)["a\u00f1o"];
  return typeof year === "number" ? year : Number(year);
}

function getFolioNumber(document: CLCDocument) {
  const match = String(document.folio || "").match(/CLC-(\d+)\/\d+/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getDocumentTotal(document: CLCDocument) {
  return document.items.reduce((sum, item) => sum + (Number(item.importe) || 0), 0);
}

function calculateDocumentMetrics(documents: CLCDocument[]): AppDocumentMetrics {
  return documents.reduce<AppDocumentMetrics>((metrics, document) => {
    metrics.totalDocuments += 1;
    if (document.estado === "finalizado") {
      metrics.finalizedCount += 1;
      metrics.totalInvoiced += getDocumentTotal(document);
    } else if (document.estado === "borrador") {
      metrics.draftCount += 1;
    }
    return metrics;
  }, { ...EMPTY_DOCUMENT_METRICS });
}

function calculateFolioYearSummaries(documents: CLCDocument[]): FolioYearSummary[] {
  const summaries = new Map<number, FolioYearSummary>();

  for (const document of documents) {
    const anio = getDocumentYear(document);
    if (!Number.isInteger(anio)) continue;

    const summary = summaries.get(anio) || {
      anio,
      highestFinalizedFolioNumber: 0,
      finalizedCount: 0,
      draftCount: 0,
      totalInvoiced: 0
    };

    if (document.estado === "finalizado") {
      summary.finalizedCount += 1;
      summary.totalInvoiced += getDocumentTotal(document);
      summary.highestFinalizedFolioNumber = Math.max(summary.highestFinalizedFolioNumber, getFolioNumber(document));
    } else if (document.estado === "borrador") {
      summary.draftCount += 1;
    }

    summaries.set(anio, summary);
  }

  return Array.from(summaries.values()).sort((a, b) => b.anio - a.anio);
}

function buildLocalMetaSnapshot(
  catalogs: AppCatalogs,
  documents: CLCDocument[],
  folioCounters: FolioCounter[],
  storageMode: "electron" | "browser",
  dataFilePath?: string
): AppMetaSnapshot {
  return {
    catalogs,
    documents,
    folioCounters,
    documentMetrics: calculateDocumentMetrics(documents),
    folioYearSummaries: calculateFolioYearSummaries(documents),
    dataFilePath,
    storageMode
  };
}

function getConceptName(document: CLCDocument) {
  return document.items[0]?.objetoNombre || document.concepto;
}

function getSearchText(document: CLCDocument) {
  const itemText = document.items
    .map(item => [item.objetoNombre, item.objetoClave, item.numFactura, item.oc].join(" "))
    .join(" ");

  return [
    document.folio,
    document.unidadNombre,
    document.proveedorNombre,
    document.proveedorRfc,
    document.concepto,
    itemText
  ].join(" ").toLowerCase();
}

function getSortValue(document: CLCDocument, sortKey: DocumentListSortKey) {
  if (sortKey === "fecha") return document.fechaCreacion || "";
  if (sortKey === "folio") return document.folio || "BORRADOR";
  if (sortKey === "nombre") return document.unidadNombre;
  if (sortKey === "concepto") return getConceptName(document);
  if (sortKey === "proveedor") return document.proveedorNombre;
  return document.fechaCreacion || "";
}

function listLocalDocuments(
  documents: CLCDocument[],
  params: DocumentListParams,
  storageMode: "electron" | "browser"
): DocumentListResult {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(Math.max(params.pageSize || 10, 1), 100);
  const search = params.search?.trim().toLowerCase() || "";
  const sortKey = params.sortKey || "fecha";
  const sortDirection = params.sortDirection === "asc" ? "asc" : "desc";

  const filtered = documents.filter(document => {
    const docDate = document.fechaCreacion?.slice(0, 10);
    if (params.estado && document.estado !== params.estado) return false;
    if (params.anio && getDocumentYear(document) !== params.anio) return false;
    if (params.dateFrom && docDate && docDate < params.dateFrom) return false;
    if (params.dateTo && docDate && docDate > params.dateTo) return false;
    if (!search) return true;
    return getSearchText(document).includes(search);
  });

  const sorted = [...filtered].sort((a, b) => {
    const left = getSortValue(a, sortKey);
    const right = getSortValue(b, sortKey);
    return left.localeCompare(right, "es", { numeric: true, sensitivity: "base" }) * (sortDirection === "asc" ? 1 : -1);
  });

  const pageStart = (page - 1) * pageSize;
  return {
    documents: sorted.slice(pageStart, pageStart + pageSize),
    total: sorted.length,
    page,
    pageSize,
    storageMode
  };
}

export async function loadAppData(): Promise<AppDataSnapshot> {
  if (isSupabaseConfigured()) {
    return loadSupabaseAppData();
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    const store = await window.clcStore.get();
    return {
      catalogs: store.catalogs || INITIAL_CATALOGS,
      documents: store.documents.length ? store.documents : INITIAL_DOCUMENTS,
      folioCounters: store.folioCounters || [],
      dataFilePath: store.dataFilePath,
      storageMode: "electron"
    };
  }

  return {
    catalogs: getStoredCatalogs(),
    documents: getStoredDocuments(),
    folioCounters: getStoredFolioCounters(),
    storageMode: "browser"
  };
}

export async function loadAppMetaData(): Promise<AppMetaSnapshot> {
  if (isSupabaseConfigured()) {
    return loadSupabaseAppMeta();
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    const store = await window.clcStore.get();
    const documents = store.documents.length ? store.documents : INITIAL_DOCUMENTS;
    return buildLocalMetaSnapshot(
      store.catalogs || INITIAL_CATALOGS,
      documents,
      store.folioCounters || [],
      "electron",
      store.dataFilePath
    );
  }

  const documents = getStoredDocuments();
  return buildLocalMetaSnapshot(getStoredCatalogs(), documents, getStoredFolioCounters(), "browser");
}

export async function listDocuments(params: DocumentListParams): Promise<DocumentListResult> {
  if (isSupabaseConfigured()) {
    return listSupabaseDocuments(params);
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    const store = await window.clcStore.get();
    return listLocalDocuments(store.documents.length ? store.documents : INITIAL_DOCUMENTS, params, "electron");
  }

  return listLocalDocuments(getStoredDocuments(), params, "browser");
}

export async function persistCatalogs(catalogs: AppCatalogs): Promise<AppMetaSnapshot | void> {
  if (isSupabaseConfigured()) {
    return saveSupabaseCatalogs(catalogs);
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    await window.clcStore.saveCatalogs(catalogs);
    return;
  }

  saveStoredCatalogs(catalogs);
}

export async function persistDocuments(documents: CLCDocument[]): Promise<void> {
  if (isElectronStoreAvailable() && window.clcStore) {
    await window.clcStore.saveDocuments(documents);
    return;
  }

  saveStoredDocuments(documents);
}

export async function persistDocument(
  document: CLCDocument,
  optimisticDocuments: CLCDocument[]
): Promise<SupabaseDocumentMutationResult | CLCDocument[]> {
  if (isSupabaseConfigured()) {
    return saveSupabaseDocument(document);
  }

  await persistDocuments(optimisticDocuments);
  return optimisticDocuments;
}

export async function deletePersistedDocument(
  id: string,
  optimisticDocuments: CLCDocument[]
): Promise<SupabaseDeleteMutationResult | CLCDocument[]> {
  if (isSupabaseConfigured()) {
    return deleteSupabaseDocument(id);
  }

  await persistDocuments(optimisticDocuments);
  return optimisticDocuments;
}

export async function finalizeAndPersistDocument(
  doc: CLCDocument,
  currentDocuments: CLCDocument[]
): Promise<SupabaseFinalizeMutationResult | { finalizedDoc: CLCDocument; documents: CLCDocument[]; folioCounters: FolioCounter[] }> {
  if (isSupabaseConfigured()) {
    return finalizeSupabaseDocument(doc);
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    return window.clcStore.finalizeDocument(doc);
  }

  const latestDocuments = getStoredDocuments();
  const { finalizedDoc, updatedGlobalList, folioCounters } = finalizeDocumentAndAssignFolio(
    doc,
    latestDocuments.length ? latestDocuments : currentDocuments,
    getStoredFolioCounters()
  );
  saveStoredDocuments(updatedGlobalList);
  saveStoredFolioCounters(folioCounters);
  return { finalizedDoc, documents: updatedGlobalList, folioCounters };
}

export async function setNextFolioNumber(anio: number, nextNumber: number): Promise<AppMetaSnapshot> {
  if (isSupabaseConfigured()) {
    return setSupabaseNextFolioNumber(anio, nextNumber);
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    const store = await window.clcStore.setNextFolioNumber(anio, nextNumber);
    const documents = store.documents.length ? store.documents : INITIAL_DOCUMENTS;
    return buildLocalMetaSnapshot(
      store.catalogs || INITIAL_CATALOGS,
      documents,
      store.folioCounters || [],
      "electron",
      store.dataFilePath
    );
  }

  const documents = getStoredDocuments();
  const highestExisting = documents
    .filter(document => document.año === anio && document.estado === "finalizado")
    .reduce((max, document) => {
      const match = document.folio.match(/CLC-(\d+)\/\d+/);
      return Math.max(max, match ? Number.parseInt(match[1], 10) : 0);
    }, 0);
  if (nextNumber <= highestExisting) {
    throw new Error(`El siguiente folio debe ser mayor que CLC-${String(highestExisting).padStart(3, "0")}/${anio}.`);
  }

  return buildLocalMetaSnapshot(
    getStoredCatalogs(),
    documents,
    setStoredNextFolioNumber(anio, nextNumber),
    "browser"
  );
}
