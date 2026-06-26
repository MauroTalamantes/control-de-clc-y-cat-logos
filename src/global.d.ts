import type {
  AppCatalogs,
  CLCDocument,
  DeletedInvoiceUsage,
  FolioCounter,
  ReusableFolio
} from "./types";

export {};

declare global {
  interface Window {
    clcDialog?: {
      alert: (message?: unknown) => true;
      confirm: (message?: unknown) => boolean;
      prompt: (message?: unknown, defaultValue?: string) => string | null;
    };
    clcStore?: {
      get: () => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        reusableFolios: ReusableFolio[];
        deletedInvoiceUsage: DeletedInvoiceUsage[];
        dataFilePath: string;
      }>;
      saveCatalogs: (catalogs: AppCatalogs) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        reusableFolios: ReusableFolio[];
        deletedInvoiceUsage: DeletedInvoiceUsage[];
        dataFilePath: string;
      }>;
      saveDocuments: (documents: CLCDocument[]) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        reusableFolios: ReusableFolio[];
        deletedInvoiceUsage: DeletedInvoiceUsage[];
        dataFilePath: string;
      }>;
      deleteDocument: (id: string) => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        reusableFolios: ReusableFolio[];
        deletedInvoiceUsage: DeletedInvoiceUsage[];
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
        reusableFolios: ReusableFolio[];
        deletedInvoiceUsage: DeletedInvoiceUsage[];
        dataFilePath: string;
      }>;
      selectDataFolder: () => Promise<{
        catalogs: AppCatalogs | null;
        documents: CLCDocument[];
        folioCounters: FolioCounter[];
        reusableFolios: ReusableFolio[];
        deletedInvoiceUsage: DeletedInvoiceUsage[];
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
      savePdf: (fileName: string, bytes: Uint8Array, options?: { openAfterSave?: boolean }) => Promise<{
        canceled: boolean;
        filePath?: string;
      }>;
      printPdf: (bytes: Uint8Array) => Promise<{
        printed: boolean;
      }>;
    };
    clcDiagnostics?: {
      markReady: () => void;
      reportError: (error: { message: string; stack?: string; source?: string }) => void;
      openFolder: () => Promise<string>;
    };
  }
}
