import { AppCatalogs, CLCDocument } from "../types";
import {
  INITIAL_CATALOGS,
  INITIAL_DOCUMENTS,
  finalizeDocumentAndAssignFolio,
  getStoredCatalogs,
  getStoredDocuments,
  saveStoredCatalogs,
  saveStoredDocuments
} from "./initialData";
import {
  deleteSupabaseDocument,
  finalizeSupabaseDocument,
  isSupabaseConfigured,
  loadSupabaseAppData,
  saveSupabaseCatalogs,
  saveSupabaseDocument
} from "./supabaseStore";

export interface AppDataSnapshot {
  catalogs: AppCatalogs;
  documents: CLCDocument[];
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
      dataFilePath: store.dataFilePath,
      storageMode: "electron"
    };
  }

  return {
    catalogs: getStoredCatalogs(),
    documents: getStoredDocuments(),
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
): Promise<{ finalizedDoc: CLCDocument; documents: CLCDocument[] }> {
  if (isSupabaseConfigured()) {
    return finalizeSupabaseDocument(doc);
  }

  if (isElectronStoreAvailable() && window.clcStore) {
    return window.clcStore.finalizeDocument(doc);
  }

  const latestDocuments = getStoredDocuments();
  const { finalizedDoc, updatedGlobalList } = finalizeDocumentAndAssignFolio(
    doc,
    latestDocuments.length ? latestDocuments : currentDocuments
  );
  saveStoredDocuments(updatedGlobalList);
  return { finalizedDoc, documents: updatedGlobalList };
}
