import type { AppCatalogs, CLCDocument, FolioCounter } from "./types";

export {};

declare global {
  interface Window {
    clcStore?: {
      get: () => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        dataFilePath: string;
      }>;
      saveCatalogs: (catalogs: AppCatalogs) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        dataFilePath: string;
      }>;
      saveDocuments: (documents: CLCDocument[]) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        dataFilePath: string;
      }>;
      finalizeDocument: (document: CLCDocument) => Promise<{
        finalizedDoc: CLCDocument;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
      }>;
      setNextFolioNumber: (anio: number, nextNumber: number) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        dataFilePath: string;
      }>;
      selectDataFolder: () => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        dataFilePath: string;
      }>;
    };
    clcFile?: {
      saveExcel: (fileName: string, bytes: Uint8Array, options?: { openAfterSave?: boolean }) => Promise<{
        canceled: boolean;
        filePath?: string;
      }>;
      createPdf: (bytes: Uint8Array) => Promise<{
        bytes: Uint8Array;
      }>;
      savePdf: (fileName: string, bytes: Uint8Array) => Promise<{
        canceled: boolean;
        filePath?: string;
      }>;
      printPdf: (bytes: Uint8Array) => Promise<{
        printed: boolean;
      }>;
    };
  }
}
