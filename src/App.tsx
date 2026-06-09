/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { AppCatalogs, AppDocumentMetrics, CLCDocument, FolioCounter, FolioYearSummary } from "./types";
import { INITIAL_CATALOGS, INITIAL_DOCUMENTS } from "./utils/initialData";
import {
  deletePersistedDocument,
  finalizeAndPersistDocument,
  loadAppMetaData,
  persistDocument,
  persistCatalogs,
  setNextFolioNumber
} from "./utils/appStore";
import { downloadDocExcel } from "./utils/excelGenerator";
import CatalogManager from "./components/CatalogManager";
import CLCForm from "./components/CLCForm";
import CLCViewer from "./components/CLCViewer";
import AppShell, { type AppSection } from "./components/AppShell";

type ViewMode = "lista" | "catalogos" | "crear";
type CatalogTarget = "unidades" | "proveedores" | "folios";
type StorageMode = "supabase" | "electron" | "browser";
type CatalogSyncStatus = "idle" | "loading" | "saving" | "saved" | "error";
type DocumentSyncStatus = "connected" | "refreshing" | "error";

const EMPTY_DOCUMENT_METRICS: AppDocumentMetrics = {
  totalDocuments: 0,
  finalizedCount: 0,
  draftCount: 0,
  totalInvoiced: 0
};

function getDocumentsFromPersistResult(result: { documents: CLCDocument[] } | CLCDocument[]): CLCDocument[] {
  return Array.isArray(result) ? result : result.documents;
}

type AppMetaResult = {
  catalogs: AppCatalogs;
  documents: CLCDocument[];
  folioCounters: FolioCounter[];
  documentMetrics: AppDocumentMetrics;
  folioYearSummaries: FolioYearSummary[];
  storageMode: StorageMode;
  dataFilePath?: string;
};

function isSupabaseMetaResult(value: unknown): value is AppMetaResult & { storageMode: "supabase" } {
  return Boolean(value && !Array.isArray(value) && (value as { storageMode?: unknown }).storageMode === "supabase");
}

function parseCLCFolio(folio: string): { number: number; year: number; normalized: string } | null {
  const match = folio.trim().toUpperCase().match(/^CLC-(\d+)\/(\d{4})$/);
  if (!match) return null;

  const number = Number.parseInt(match[1], 10);
  const year = Number.parseInt(match[2], 10);
  if (!Number.isInteger(number) || number < 1 || !Number.isInteger(year)) return null;

  return {
    number,
    year,
    normalized: `CLC-${String(number).padStart(3, "0")}/${year}`
  };
}

function getHighestFinalizedFolioNumber(documents: CLCDocument[], year: number) {
  return documents
    .filter(document => document["a\u00f1o"] === year && document.estado === "finalizado")
    .reduce((max, document) => {
      const parsed = parseCLCFolio(document.folio || "");
      return parsed?.year === year ? Math.max(max, parsed.number) : max;
    }, 0);
}

function getConfiguredLastFolioNumber(folioCounters: FolioCounter[], year: number) {
  return folioCounters.find(counter => counter.anio === year)?.lastNumber || 0;
}

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [catalogTarget, setCatalogTarget] = useState<CatalogTarget>("unidades");
  const [catalogs, setCatalogs] = useState<AppCatalogs>(INITIAL_CATALOGS);
  const [documents, setDocuments] = useState<CLCDocument[]>([]);
  const [folioCounters, setFolioCounters] = useState<FolioCounter[]>([]);
  const [documentMetrics, setDocumentMetrics] = useState<AppDocumentMetrics>(EMPTY_DOCUMENT_METRICS);
  const [folioYearSummaries, setFolioYearSummaries] = useState<FolioYearSummary[]>([]);
  const [documentListRefreshKey, setDocumentListRefreshKey] = useState(0);
  const [documentSyncStatus, setDocumentSyncStatus] = useState<DocumentSyncStatus>("refreshing");
  const [isInitialDataLoading, setIsInitialDataLoading] = useState(true);
  const [editingDoc, setEditingDoc] = useState<CLCDocument | null>(null);
  const [storageMode, setStorageMode] = useState<StorageMode>("browser");
  const [catalogSyncStatus, setCatalogSyncStatus] = useState<CatalogSyncStatus>("loading");
  const [catalogSyncError, setCatalogSyncError] = useState<string | null>(null);
  const refreshDocumentList = () => setDocumentListRefreshKey(key => key + 1);
  const applyAppMeta = (snapshot: AppMetaResult, options: { updateDocuments?: boolean } = {}) => {
    const updateDocuments = options.updateDocuments ?? snapshot.storageMode !== "supabase";
    setCatalogs(snapshot.catalogs);
    if (updateDocuments) {
      setDocuments(snapshot.documents);
    }
    setFolioCounters(snapshot.folioCounters);
    setDocumentMetrics(snapshot.documentMetrics);
    setFolioYearSummaries(snapshot.folioYearSummaries);
    setStorageMode(snapshot.storageMode);
  };

  // Concurrency Simulation Logs list
  const [simulationLog, setSimulationLog] = useState<{ time: string; text: string; type: "info" | "success" | "warning" }[]>([
    {
      time: new Date().toLocaleTimeString(),
      text: "Conexión segura al Servidor de Asignación de Folios del Municipio establecida.",
      type: "info"
    },
    {
      time: new Date().toLocaleTimeString(),
      text: "Catálogos base cargados de forma exitosa.",
      type: "info"
    }
  ]);

  useEffect(() => {
    let isMounted = true;

    loadAppMetaData()
      .then(snapshot => {
        if (!isMounted) return;
        applyAppMeta(snapshot);
        setCatalogSyncStatus("idle");
        setCatalogSyncError(null);
        setDocumentSyncStatus("connected");
        setIsInitialDataLoading(false);
        if (snapshot.storageMode === "supabase") {
          setSimulationLog(prev => [
            {
              time: new Date().toLocaleTimeString(),
              text: "Base central Supabase activa. Folios, expedientes y catalogos se guardan en Postgres.",
              type: "info"
            },
            ...prev
          ]);
        } else if (snapshot.dataFilePath) {
          setSimulationLog(prev => [
            {
              time: new Date().toLocaleTimeString(),
              text: `Archivo local de datos activo: ${snapshot.dataFilePath}`,
              type: "info"
            },
            ...prev
          ]);
        }
      })
      .catch(error => {
        if (!isMounted) return;
        console.error("Error loading app data", error);
        setDocuments(INITIAL_DOCUMENTS);
        setCatalogSyncStatus("error");
        setCatalogSyncError("No se pudo cargar la base de datos configurada.");
        setDocumentSyncStatus("error");
        setIsInitialDataLoading(false);
        setSimulationLog(prev => [
          {
            time: new Date().toLocaleTimeString(),
            text: "No se pudo cargar la base de datos configurada. Se usaran datos iniciales en memoria.",
            type: "warning"
          },
          ...prev
        ]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (storageMode !== "supabase" || isInitialDataLoading) return;

    let isMounted = true;
    let isRefreshing = false;

    const refreshAppMeta = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      setDocumentSyncStatus("refreshing");
      try {
        const snapshot = await loadAppMetaData();
        if (!isMounted) return;
        applyAppMeta(snapshot, { updateDocuments: false });
        setDocumentSyncStatus("connected");
        if (viewMode === "lista") {
          refreshDocumentList();
        }
      } catch (error) {
        if (isMounted) setDocumentSyncStatus("error");
        console.error("Error refreshing Supabase app metadata", error);
      } finally {
        isRefreshing = false;
      }
    };

    const intervalId = window.setInterval(refreshAppMeta, 3000);
    window.addEventListener("focus", refreshAppMeta);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshAppMeta);
    };
  }, [storageMode, isInitialDataLoading, viewMode]);

  const persistCatalogChanges = async (
    updated: AppCatalogs,
    options: { rethrow?: boolean; showAlert?: boolean } = {}
  ): Promise<AppCatalogs> => {
    const { rethrow = false, showAlert = true } = options;
    setCatalogs(updated);
    setCatalogSyncStatus("saving");
    setCatalogSyncError(null);

    try {
      const result = await persistCatalogs(updated);
      if (result) {
        applyAppMeta(result);
        setCatalogSyncStatus("saved");
        return result.catalogs;
      }
      setCatalogSyncStatus("saved");
      return updated;
    } catch (error) {
      console.error("Error saving catalogs", error);
      setCatalogSyncStatus("error");
      setCatalogSyncError(error instanceof Error ? error.message : "No se pudieron guardar los catalogos.");
      if (showAlert) {
        alert("No se pudieron guardar los catalogos.");
      }
      if (rethrow) {
        throw error;
      }
      return updated;
    }
  };

  // Sync Catalogs list
  const handleCatalogsChange = (updated: AppCatalogs) => {
    void persistCatalogChanges(updated);
  };

  const handleReloadCatalogs = async () => {
    setCatalogSyncStatus("loading");
    setCatalogSyncError(null);
    try {
      const snapshot = await loadAppMetaData();
      applyAppMeta(snapshot);
      refreshDocumentList();
      setCatalogSyncStatus("idle");
      setSimulationLog(prev => [
        {
          time: new Date().toLocaleTimeString(),
          text: "Catalogos recargados desde el almacenamiento activo.",
          type: "info"
        },
        ...prev
      ]);
    } catch (error) {
      console.error("Error reloading catalogs", error);
      setCatalogSyncStatus("error");
      setCatalogSyncError(error instanceof Error ? error.message : "No se pudieron recargar los catalogos.");
      alert("No se pudieron recargar los catalogos.");
    }
  };

  // Safe document save operation
  const handleSaveDocument = async (doc: CLCDocument, finalize: boolean) => {
    let updatedDocs = [...documents];
    const existingDoc = updatedDocs.find(d => d.id === doc.id) || (editingDoc?.id === doc.id ? editingDoc : undefined);
    const isEdit = Boolean(existingDoc);

    if (finalize && existingDoc?.estado === "finalizado") {
      const parsedFolio = parseCLCFolio(doc.folio || "");
      if (!parsedFolio) {
        alert("El folio debe tener el formato CLC-001/2026.");
        return;
      }
      if (parsedFolio.year !== doc["a\u00f1o"]) {
        alert("El ejercicio del folio debe coincidir con el ejercicio presupuestal del registro.");
        return;
      }

      const duplicatedFolioDoc = documents.find(d => (
        d.id !== doc.id &&
        d.estado === "finalizado" &&
        (d.folio || "").trim().toUpperCase() === parsedFolio.normalized
      ));
      if (duplicatedFolioDoc) {
        alert(`El folio ${parsedFolio.normalized} ya existe en otro registro.`);
        return;
      }

      const updatedFinalizedDoc: CLCDocument = {
        ...doc,
        folio: parsedFolio.normalized,
        estado: "finalizado",
        fechaCreacion: existingDoc.fechaCreacion
      };

      updatedDocs = updatedDocs.map(d => d.id === doc.id ? updatedFinalizedDoc : d);
      const persisted = await persistDocument(updatedFinalizedDoc, updatedDocs);
      if (isSupabaseMetaResult(persisted)) {
        applyAppMeta(persisted, { updateDocuments: false });
        const highestFolioAfterSave = persisted.folioYearSummaries.find(summary => summary.anio === parsedFolio.year)
          ?.highestFinalizedFolioNumber || parsedFolio.number;
        const configuredLastFolio = getConfiguredLastFolioNumber(persisted.folioCounters, parsedFolio.year);
        if (highestFolioAfterSave > configuredLastFolio) {
          const snapshot = await setNextFolioNumber(parsedFolio.year, highestFolioAfterSave + 1);
          applyAppMeta(snapshot, { updateDocuments: false });
        }
      } else {
        const persistedDocuments = getDocumentsFromPersistResult(persisted);
        const highestFolioAfterSave = getHighestFinalizedFolioNumber(persistedDocuments, parsedFolio.year);
        const configuredLastFolio = getConfiguredLastFolioNumber(folioCounters, parsedFolio.year);
        if (highestFolioAfterSave > configuredLastFolio) {
          const snapshot = await setNextFolioNumber(parsedFolio.year, highestFolioAfterSave + 1);
          applyAppMeta(snapshot);
        } else {
          setDocuments(persistedDocuments);
        }
      }

      const logTime = new Date().toLocaleTimeString();
      setSimulationLog(prev => [
        {
          time: logTime,
          text: `Expediente ${updatedFinalizedDoc.folio} actualizado para ${updatedFinalizedDoc.proveedorNombre}.`,
          type: "info"
        },
        ...prev
      ]);

      await downloadDocExcel(updatedFinalizedDoc, { openAfterSave: false });
      alert(`Expediente ${updatedFinalizedDoc.folio} actualizado correctamente.`);
    } else if (finalize) {
      const persisted = await finalizeAndPersistDocument(doc, documents);
      const { finalizedDoc } = persisted;

      if (isSupabaseMetaResult(persisted)) {
        applyAppMeta(persisted, { updateDocuments: false });
      } else {
        setDocuments(persisted.documents);
        setFolioCounters(persisted.folioCounters);
      }
      
      // Update logs
      const logTime = new Date().toLocaleTimeString();
      setSimulationLog(prev => [
        {
          time: logTime,
          text: `¡ÉXITO! Folio definitivo asignado: ${finalizedDoc.folio} para ${finalizedDoc.proveedorNombre}.`,
          type: "success"
        },
        ...prev
      ]);
      
      await downloadDocExcel(finalizedDoc, { openAfterSave: true });
      alert(`Expediente Finalizado con Éxito.\nFolio del Ejercicio Asignado: ${finalizedDoc.folio}`);
    } else {
      // Just save as draft
      const draftDoc: CLCDocument = {
        ...doc,
        folio: "",
        estado: "borrador"
      };

      if (isEdit) {
        updatedDocs = updatedDocs.map(d => d.id === doc.id ? draftDoc : d);
      } else {
        updatedDocs.push(draftDoc);
      }

      const persisted = await persistDocument(draftDoc, updatedDocs);
      if (isSupabaseMetaResult(persisted)) {
        applyAppMeta(persisted, { updateDocuments: false });
      } else {
        setDocuments(getDocumentsFromPersistResult(persisted));
      }

      const logTime = new Date().toLocaleTimeString();
      setSimulationLog(prev => [
        {
          time: logTime,
          text: `Borrador "${draftDoc.concepto.substring(0, 30)}..." guardado. Folio pendiente.`,
          type: "info"
        },
        ...prev
      ]);
      
      alert("Borrador guardado correctamente. Podrá editarlo y finalizarlo en cualquier momento.");
    }

    refreshDocumentList();
    setEditingDoc(null);
    setViewMode("lista");
  };

  const handleSetNextFolioNumber = async (anio: number, nextNumber: number) => {
    const snapshot = await setNextFolioNumber(anio, nextNumber);
    applyAppMeta(snapshot);
    refreshDocumentList();
  };

  // Concurrency Simulation Callback
  const handleSimulateConcurrent = (deptName: string, providerName: string, amount: number) => {
    const currentYear = 2026;
    
    // Fetch latest storage state to prevent out-of-sync simulation state
    const yearDocs = documents.filter(d => d.año === currentYear && d.estado === "finalizado");
    
    let nextNum = 1;
    if (yearDocs.length > 0) {
      const folioNumbers = yearDocs.map(d => {
        const match = d.folio.match(/CLC-(\d+)\/\d+/);
        return match ? parseInt(match[1], 10) : 0;
      });
      nextNum = Math.max(...folioNumbers, 0) + 1;
    }
    
    const paddedNum = String(nextNum).padStart(3, "0");
    const simulatedFolio = `CLC-${paddedNum}/${currentYear}`;
    
    const simDoc: CLCDocument = {
      id: "sim_" + Math.random().toString(36).substr(2, 9),
      folio: simulatedFolio,
      año: currentYear,
      unidadAdministrativaId: "sim",
      unidadClave: deptName.includes("OBRAS") ? "510" : "540",
      unidadNombre: deptName,
      bancoNombre: "BANORTE",
      bancoCuenta: "98765432101",
      bancoClabe: "072180009876543210",
      proveedorNombre: providerName,
      proveedorRfc: deptName.includes("OBRAS") ? "CPR110418LL9" : "AIG150912TS8",
      items: [
        {
          id: "sim_item",
          oc: "OC-" + (2000 + Math.floor(Math.random() * 1000)),
          fuenteClave: "111",
          proyectoClave: deptName.includes("OBRAS") ? "305101" : "304005",
          objetoClave: deptName.includes("OBRAS") ? "3551" : "2111",
          objetoNombre: deptName.includes("OBRAS") ? "MANTENIMIENTO DE VEHÍCULOS" : "PAPELERÍA Y UTILES DE OFICINA",
          numFactura: "9ac24ff1-" + Math.random().toString(36).substr(2, 4),
          fechaFactura: new Date().toISOString().split("T")[0],
          subTotal: Math.round(amount / 1.16),
          descuento: 0,
          iva: amount - Math.round(amount / 1.16),
          isr: 0,
          importe: amount
        }
      ],
      concepto: deptName.includes("OBRAS") ? "CONSTRUCCIÓN Y ASFALTO CONCURRENTE" : "PAPELERÍA Y CONSUMIBLES OFICINAS",
      solicitaNombre: "REGINALDO GÓMEZ",
      solicitaPuesto: "TITULAR DE AREA SIMULADA",
      autoriza1Nombre: "L.C. JESÚS RODRÍGUEZ DEL MURO",
      autoriza1Puesto: "SECRETARIO DE LA TESORERÍA Y FINANZAS",
      autoriza2Nombre: "LIC. ANALÍ INFANTE MORALES",
      autoriza2Puesto: "SINDICO MUNICIPAL",
      elaboro: deptName.replace("DIRECCIÓN DE ", "").replace("SECRETARÍA DE ", ""),
      fechaCreacion: new Date().toISOString(),
      estado: "finalizado"
    };

    const updated = [...documents, simDoc];
    setDocuments(updated);
    persistDocument(simDoc, updated).then(result => {
      if (isSupabaseMetaResult(result)) {
        applyAppMeta(result, { updateDocuments: false });
        refreshDocumentList();
      } else {
        setDocuments(getDocumentsFromPersistResult(result));
      }
    }).catch(error => {
      console.error("Error saving simulation document", error);
    });

    const logTime = new Date().toLocaleTimeString();
    setSimulationLog(prev => [
      {
        time: logTime,
        text: `Usuario externo finalizó ${simulatedFolio} (${deptName.split(" ")[2] || deptName.substring(0, 15)}) por Monto: $ ${amount.toLocaleString()}`,
        type: "warning"
      },
      ...prev
    ]);
  };

  // Handle deletion of documents
  const handleDeleteDocument = (id: string) => {
    if (confirm("¿Estás completamente seguro de que deseas eliminar este registro de la lista oficial?")) {
      const updated = documents.filter(d => d.id !== id);
      setDocuments(updated);
      deletePersistedDocument(id, updated).then(result => {
        if (isSupabaseMetaResult(result)) {
          applyAppMeta(result, { updateDocuments: false });
        } else {
          setDocuments(getDocumentsFromPersistResult(result));
        }
        refreshDocumentList();
      }).catch(error => {
        console.error("Error deleting document", error);
        alert("No se pudo actualizar la base de datos despues de eliminar.");
      });
      
      const logTime = new Date().toLocaleTimeString();
      setSimulationLog(prev => [
        {
          time: logTime,
          text: "Documento eliminado permanentemente por el usuario.",
          type: "info"
        },
        ...prev
      ]);
    }
  };

  // Triggers editing draft
  const handleStartEdit = (doc: CLCDocument) => {
    setEditingDoc(doc);
    setViewMode("crear");
  };

  const handleNavigate = (section: AppSection) => {
    setEditingDoc(null);
    if (section === "lista") {
      setViewMode("lista");
      return;
    }

    setViewMode("catalogos");
    setCatalogTarget(section === "proveedores" ? "proveedores" : section === "parametros" ? "folios" : "unidades");
  };

  const activeSection: AppSection = viewMode === "catalogos"
    ? catalogTarget === "proveedores"
      ? "proveedores"
      : catalogTarget === "folios"
        ? "parametros"
        : "catalogos"
    : "lista";

  const latestYear = folioYearSummaries[0]?.anio || new Date().getFullYear();

  return (
    <AppShell
      activeSection={activeSection}
      onNavigate={handleNavigate}
      onCreate={() => { setViewMode("crear"); setEditingDoc(null); }}
      periodLabel={`Ejercicio ${latestYear}`}
    >
      <main className="mx-auto w-full max-w-[1664px] px-4 pb-5 pt-0 sm:px-6 lg:px-8 lg:pb-7 lg:pt-0">
        {viewMode === "lista" && (
          <CLCViewer
            documents={documents}
            documentMetrics={documentMetrics}
            providerCount={catalogs.proveedores.length}
            folioYearSummaries={folioYearSummaries}
            refreshToken={documentListRefreshKey}
            syncStatus={documentSyncStatus}
            isLoading={isInitialDataLoading}
            onEdit={handleStartEdit}
            onDelete={handleDeleteDocument}
          />
        )}

        {viewMode === "catalogos" && (
          <CatalogManager
            catalogs={catalogs}
            onChange={handleCatalogsChange}
            storageMode={storageMode}
            saveStatus={catalogSyncStatus}
            saveError={catalogSyncError}
            onReload={handleReloadCatalogs}
            documents={documents}
            folioCounters={folioCounters}
            folioYearSummaries={folioYearSummaries}
            onSetNextFolioNumber={handleSetNextFolioNumber}
            initialTab={catalogTarget}
          />
        )}

        {viewMode === "crear" && (
          <CLCForm
            catalogs={catalogs}
            onCancel={() => { setViewMode("lista"); setEditingDoc(null); }}
            onSave={handleSaveDocument}
            onCatalogsChange={updated => persistCatalogChanges(updated, { rethrow: true, showAlert: false })}
            documentToEdit={editingDoc}
          />
        )}
      </main>
    </AppShell>
  );
}
