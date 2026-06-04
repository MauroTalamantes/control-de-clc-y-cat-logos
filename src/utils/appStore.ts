import { AppCatalogs, CLCDocument, FolioCounter } from "../types";
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
  isSupabaseConfigured,
  loadSupabaseAppData,
  saveSupabaseCatalogs,
  saveSupabaseDocument,
  setSupabaseNextFolioNumber
} from "./supabaseStore";

export interface AppDataSnapshot {
  catalogs: AppCatalogs;
  documents: CLCDocument[];
  folioCounters: FolioCounter[];
  dataFilePath?: string;
  storageMode: "supabase" | "electron" | "browser";
}

const isElectronStoreAvailable = () => Boolean(window.clcStore);

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

export async function persistCatalogs(catalogs: AppCatalogs): Promise<AppDataSnapshot | void> {
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
): Promise<AppDataSnapshot | CLCDocument[]> {
  if (isSupabaseConfigured()) {
    return saveSupabaseDocument(document);
  }

  await persistDocuments(optimisticDocuments);
  return optimisticDocuments;
}

export async function deletePersistedDocument(
  id: string,
  optimisticDocuments: CLCDocument[]
): Promise<AppDataSnapshot | CLCDocument[]> {
  if (isSupabaseConfigured()) {
    return deleteSupabaseDocument(id);
  }

  await persistDocuments(optimisticDocuments);
  return optimisticDocuments;
}

export async function finalizeAndPersistDocument(
  doc: CLCDocument,
  currentDocuments: CLCDocument[]
): Promise<{ finalizedDoc: CLCDocument; documents: CLCDocument[]; folioCounters: FolioCounter[] }> {
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

export async function setNextFolioNumber(anio: number, nextNumber: number): Promise<AppDataSnapshot> {
  if (isSupabaseConfigured()) {
    return setSupabaseNextFolioNumber(anio, nextNumber);
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    const store = await window.clcStore.setNextFolioNumber(anio, nextNumber);
    return {
      catalogs: store.catalogs || INITIAL_CATALOGS,
      documents: store.documents.length ? store.documents : INITIAL_DOCUMENTS,
      folioCounters: store.folioCounters || [],
      dataFilePath: store.dataFilePath,
      storageMode: "electron"
    };
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

  return {
    catalogs: getStoredCatalogs(),
    documents,
    folioCounters: setStoredNextFolioNumber(anio, nextNumber),
    storageMode: "browser"
  };
}
