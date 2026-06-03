/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { AppCatalogs, CLCDocument } from "./types";
import { 
  getStoredCatalogs, 
  saveStoredCatalogs, 
  getStoredDocuments, 
  saveStoredDocuments, 
  finalizeDocumentAndAssignFolio 
} from "./utils/initialData";
import CatalogManager from "./components/CatalogManager";
import CLCForm from "./components/CLCForm";
import CLCViewer from "./components/CLCViewer";
import { 
  Building2, 
  Layers, 
  FileText, 
  Plus, 
  Activity, 
  TrendingUp, 
  Sparkles, 
  FileSpreadsheet, 
  HelpCircle,
  Clock
} from "lucide-react";

type ViewMode = "lista" | "catalogos" | "crear";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [catalogs, setCatalogs] = useState<AppCatalogs>(getStoredCatalogs());
  const [documents, setDocuments] = useState<CLCDocument[]>(getStoredDocuments());
  const [editingDoc, setEditingDoc] = useState<CLCDocument | null>(null);

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

  // Sync Catalogs list
  const handleCatalogsChange = (updated: AppCatalogs) => {
    setCatalogs(updated);
    saveStoredCatalogs(updated);
  };

  // Safe document save operation
  const handleSaveDocument = (doc: CLCDocument, finalize: boolean) => {
    let updatedDocs = [...documents];
    const isEdit = updatedDocs.some(d => d.id === doc.id);

    if (finalize) {
      // 1. Concurrent safe assignment: Fetch the absolute latest documents from state/storage
      // and calculate next folio to lock it synchronously without overlaps!
      const currentList = getStoredDocuments();
      const { finalizedDoc, updatedGlobalList } = finalizeDocumentAndAssignFolio(doc, currentList);
      
      setDocuments(updatedGlobalList);
      saveStoredDocuments(updatedGlobalList);
      
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

      setDocuments(updatedDocs);
      saveStoredDocuments(updatedDocs);

      const logTime = new Date().toLocaleTimeString();
      setSimulationLog(prev => [
        {
          time: logTime,
          text: `Borrador "${draftDoc.concepto.substring(0, 30)}..." guardado de forma local. Folio pendiente.`,
          type: "info"
        },
        ...prev
      ]);
      
      alert("Borrador guardado correctamente. Podrá editarlo y finalizarlo en cualquier momento.");
    }

    setEditingDoc(null);
    setViewMode("lista");
  };

  // Concurrency Simulation Callback
  const handleSimulateConcurrent = (deptName: string, providerName: string, amount: number) => {
    const currentYear = 2026;
    
    // Fetch latest storage state to prevent out-of-sync simulation state
    const latestDocs = getStoredDocuments();
    const yearDocs = latestDocs.filter(d => d.año === currentYear && d.estado === "finalizado");
    
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
    saveStoredDocuments(updated);

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
      saveStoredDocuments(updated);
      
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

  // Analytics calculated fields
  const finalizedDocs = documents.filter(d => d.estado === "finalizado");
  const draftCount = documents.filter(d => d.estado === "borrador").length;
  const totalInvoiced = finalizedDocs.reduce((sum, doc) => {
    return sum + doc.items.reduce((itemSum, item) => itemSum + item.importe, 0);
  }, 0);

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-800 flex flex-col font-sans select-text">
      
      {/* Dynamic Header navbar */}
      <header className="bg-white border-b border-slate-200/80 shadow-3xs sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo brand */}
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-indigo-600 to-slate-900 p-2.5 rounded-xl text-white shadow-md shadow-indigo-900/10 shrink-0">
              <Building2 className="h-6 w-6 text-indigo-50" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-widest text-indigo-900 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-full select-none">
                  AYUNTAMIENTO DE GUADALUPE 2024-2027
                </span>
                <span className="text-[10px] font-semibold text-slate-400">Guadalupe, Zacatecas</span>
              </div>
              <h1 className="text-md font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                Sistema de Gestión de Cuentas por Liquidar Certificadas.
              </h1>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-2">
            <button
              id="nav-clc-list"
              onClick={() => { setViewMode("lista"); setEditingDoc(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                viewMode === "lista" 
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Expedientes CLC
            </button>
            <button
              id="nav-catalogs"
              onClick={() => { setViewMode("catalogos"); setEditingDoc(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                viewMode === "catalogos" 
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Administrar Catálogos
            </button>
            <button
              id="nav-create-clc"
              onClick={() => { setViewMode("crear"); setEditingDoc(null); }}
              className="bg-slate-900 hover:bg-slate-800 text-indigo-50 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Nueva CLC
            </button>
          </div>

        </div>
      </header>

      {/* Analytics Summary Stats Panel */}
      <section className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white p-6 select-none shrink-0 border-b border-indigo-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="bg-indigo-950/40 backdrop-blur-sm border border-indigo-700/30 p-4 rounded-xl flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-indigo-200 tracking-wider block uppercase">Total Ejercicio Liquidado</span>
              <span className="text-xl font-black font-mono tracking-tight text-white mt-1 block">
                $ {totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-indigo-950/40 backdrop-blur-sm border border-indigo-700/30 p-4 rounded-xl flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-indigo-200 tracking-wider block uppercase">Folios CLC Emitidos</span>
              <span className="text-xl font-black text-white mt-1 block">
                {finalizedDocs.length} Expedientes
              </span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-indigo-950/40 backdrop-blur-sm border border-indigo-700/30 p-4 rounded-xl flex items-center gap-4 shadow-sm">
            <div className="p-3 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg">
              <Clock className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-indigo-200 tracking-wider block uppercase">Borradores en Tránsito</span>
              <span className="text-xl font-black text-indigo-100 mt-1 block">
                {draftCount} Activos
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {viewMode === "lista" && (
          <CLCViewer
            documents={documents}
            onEdit={handleStartEdit}
            onDelete={handleDeleteDocument}
          />
        )}

        {viewMode === "catalogos" && (
          <CatalogManager
            catalogs={catalogs}
            onChange={handleCatalogsChange}
          />
        )}

        {viewMode === "crear" && (
          <CLCForm
            catalogs={catalogs}
            onCancel={() => { setViewMode("lista"); setEditingDoc(null); }}
            onSave={handleSaveDocument}
            documentToEdit={editingDoc}
          />
        )}
      </main>

      {/* Footer copyright */}
      <footer className="bg-white border-t border-gray-100 py-6 text-center select-none text-[11px] text-gray-400">
        <p>© 2026 Ayuntamiento de Guadalupe, Zacatecas - Comisión del Gasto Público Local.</p>
        <p className="mt-1 font-mono text-[9px] text-gray-300">Modulo de Asignación y Control Fiscal Anti-Duplicado para CLC.</p>
      </footer>

    </div>
  );
}
