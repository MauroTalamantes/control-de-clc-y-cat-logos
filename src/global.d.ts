import type { AppCatalogs, CLCDocument } from "./types";

export {};

declare global {
  interface Window {
    clcStore?: {
      get: () => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        dataFilePath: string;
      }>;
      saveCatalogs: (catalogs: AppCatalogs) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        dataFilePath: string;
      }>;
      saveDocuments: (documents: CLCDocument[]) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        dataFilePath: string;
      }>;
      finalizeDocument: (document: CLCDocument) => Promise<{
        finalizedDoc: CLCDocument;
        documents: CLCDocument[];
      }>;
      selectDataFolder: () => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        dataFilePath: string;
      }>;
    };
    clcFile?: {
      saveExcel: (fileName: string, bytes: Uint8Array) => Promise<{
        canceled: boolean;
        filePath?: string;
      }>;
    };
  }
}
