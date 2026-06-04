/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, type MouseEvent, useMemo } from "react";
import { CLCDocument } from "../types";
import { downloadDocExcel } from "../utils/excelGenerator";
import { downloadDocPDF } from "../utils/pdfGenerator";
import { 
  FileSpreadsheet, // Added for download selected button
  FileText, 
  Edit, 
  Trash2, 
  Eye, 
  X,
  Printer
} from "lucide-react";

interface CLCViewerProps {
  documents: CLCDocument[];
  onEdit: (doc: CLCDocument) => void;
  onDelete: (id: string) => void;
}

type SortKey = "folio" | "nombre" | "concepto" | "proveedor";
type SortDirection = "asc" | "desc";
type TooltipState = { text: string; left: number; top: number } | null;

export default function CLCViewer({ 
  documents, 
  onEdit, 
  onDelete
}: CLCViewerProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("folio");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [activeTooltip, setActiveTooltip] = useState<TooltipState>(null);
  const [previewMode, setPreviewMode] = useState<"formato" | "datos">("formato");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const dateFilterRef = useRef<HTMLDivElement>(null);

  const handleSelectDoc = (docId: string, isChecked: boolean) => {
    setSelectedDocumentIds(prev =>
      isChecked ? [...prev, docId] : prev.filter(id => id !== docId)
    );
  };

  const handleSelectAllDocs = (isChecked: boolean) => {
    if (isChecked) {
      setSelectedDocumentIds(paginatedDocs.map(doc => doc.id));
    } else {
      setSelectedDocumentIds([]);
    }
  };

  const getConceptName = (doc: CLCDocument) => doc.items[0]?.objetoNombre || doc.concepto;
  const getConceptKey = (doc: CLCDocument) => doc.items[0]?.objetoClave || "-";
  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} - ${dateTo}`
    : dateFrom
      ? `Desde ${dateFrom}`
      : dateTo
        ? `Hasta ${dateTo}`
        : "Filtrar fecha";

  const showTooltip = (event: MouseEvent<HTMLElement>, text: string) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActiveTooltip({
      text,
      left: rect.left + rect.width / 2,
      top: rect.top - 8
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (!dateFilterRef.current?.contains(event.target as Node)) {
        setIsDateFilterOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSort = (key: SortKey) => {
    setCurrentPage(1);
    if (sortKey === key) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "-";
    return sortDirection === "asc" ? "^" : "v";
  };
  // Filter records based on search word and date range
  const filteredDocs = documents.filter(doc => {
    const docDate = doc.fechaCreacion?.slice(0, 10);
    if (dateFrom && docDate < dateFrom) return false;
    if (dateTo && docDate > dateTo) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase().trim();
    return (
      (doc.folio && doc.folio.toLowerCase().includes(term)) ||
      doc.unidadNombre.toLowerCase().includes(term) ||
      doc.proveedorNombre.toLowerCase().includes(term) ||
      doc.proveedorRfc.toLowerCase().includes(term) ||
      doc.concepto.toLowerCase().includes(term) ||
      getConceptName(doc).toLowerCase().includes(term) ||
      getConceptKey(doc).toLowerCase().includes(term)
    );
  });

  const sortedDocs = [...filteredDocs].sort((a, b) => {
    const values: Record<SortKey, [string, string]> = {
      folio: [a.folio || "BORRADOR", b.folio || "BORRADOR"],
      nombre: [a.unidadNombre, b.unidadNombre],
      concepto: [getConceptName(a), getConceptName(b)],
      proveedor: [a.proveedorNombre, b.proveedorNombre]
    };
    const [aValue, bValue] = values[sortKey];
    return aValue.localeCompare(bValue, "es", { numeric: true, sensitivity: "base" }) * (sortDirection === "asc" ? 1 : -1);
  });

  const totalPages = Math.max(1, Math.ceil(sortedDocs.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStart = (safeCurrentPage - 1) * pageSize;
  const paginatedDocs = sortedDocs.slice(pageStart, pageStart + pageSize);

  const selectedDocs = documents.filter(doc => selectedDocumentIds.includes(doc.id));

const areAllPageDocsSelected =
  paginatedDocs.length > 0 &&
  paginatedDocs.every(doc => selectedDocumentIds.includes(doc.id));

const handleDownloadSelectedExcel = () => {
  selectedDocs.forEach(doc => downloadDocExcel(doc));
  setSelectedDocumentIds([]);
};

const handleDownloadSelectedPDF = () => {
  selectedDocs.forEach(doc => downloadDocPDF(doc));
  setSelectedDocumentIds([]);
};

  const firstVisible = sortedDocs.length === 0 ? 0 : pageStart + 1;
  const lastVisible = Math.min(pageStart + pageSize, sortedDocs.length);

  const getDocById = (id: string) => documents.find(d => d.id === id);
  const selectedDoc = selectedDocId ? getDocById(selectedDocId) : null;

  return (
    <div className="space-y-6" id="clc-lists-viewer">
      
      {/* 1. DOCUMENTS LIST (Full modular width with spacious padding) */}
      <div className="bg-white rounded-xl shadow-xs border border-gray-200 overflow-hidden">
        
        {/* Header & filters bar */}
        <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white">
          <div>
            <h2 className="text-base font-bold text-slate-800">Historial de Expedientes (CLC)</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Consulta, imprime, descarga o edita borradores. Mostrando <strong className="text-indigo-600 font-bold">{filteredDocs.length}</strong> de <strong className="text-slate-700">{documents.length}</strong> registros.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* Download Selected Button */}
            {selectedDocumentIds.length > 0 && (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={handleDownloadSelectedExcel}
      className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
    >
      <FileSpreadsheet className="w-4 h-4" />
      Excel ({selectedDocumentIds.length})
    </button>

    <button
      type="button"
      onClick={handleDownloadSelectedPDF}
      className="bg-red-600 text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-red-700 transition-all flex items-center justify-center gap-2"
    >
      <FileText className="w-4 h-4" />
      PDF ({selectedDocumentIds.length})
    </button>
  </div>
)}
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Buscar por folio, rfc, proveedor..."
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 text-slate-850 rounded-lg pl-3 pr-8 py-2 text-xs w-full sm:w-64 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-650 font-bold text-xs"
                >
                  ×
                </button>
              )}
            </div>
            
            {/* Date range filter */}
            <div className="relative shrink-0" ref={dateFilterRef}>
              <button
                type="button"
                onClick={() => setIsDateFilterOpen(open => !open)}
                className="bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-2 text-xs font-semibold min-w-44 text-left hover:border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden transition-all cursor-pointer"
              >
                {dateRangeLabel}
              </button>

              {isDateFilterOpen && (
                <div className="absolute right-0 top-full mt-2 z-20 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Desde</span>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => {
                          setDateFrom(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full bg-white border border-slate-200 text-slate-600 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Hasta</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => {
                          setDateTo(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full bg-white border border-slate-200 text-slate-600 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
                      />
                    </label>
                  </div>

                  <div className="flex justify-end gap-2">
                    {(dateFrom || dateTo) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom("");
                          setDateTo("");
                          setCurrentPage(1);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all cursor-pointer"
                      >
                        Limpiar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsDateFilterOpen(false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* List Content Table */}
        {filteredDocs.length === 0 ? (
          <div className="p-16 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto stroke-1" />
            <p className="text-xs text-slate-500 font-semibold mt-3">No se encontraron expedientes con los criterios de búsqueda.</p>
            <p className="text-[11px] text-slate-400 mt-1">Intente cambiar el filtro o el término de búsqueda ingresado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-gray-100 text-[10px] font-bold text-slate-400 uppercase select-none tracking-wider">
                  <th className="p-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={areAllPageDocsSelected}
                      onChange={e => handleSelectAllDocs(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-indigo-600"
                    />
                  </th>
                  <th onClick={() => handleSort("folio")} className="p-4 w-32 text-center cursor-pointer hover:text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      Folio <span className="font-mono">{sortIndicator("folio")}</span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("nombre")} className="p-4 text-center cursor-pointer hover:text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      Nombre <span className="font-mono">{sortIndicator("nombre")}</span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("concepto")} className="p-4 text-center cursor-pointer hover:text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      Concepto de Gasto <span className="font-mono">{sortIndicator("concepto")}</span>
                    </span>
                  </th>
                  <th onClick={() => handleSort("proveedor")} className="p-4 text-center cursor-pointer hover:text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      Proveedor (Nombre) <span className="font-mono">{sortIndicator("proveedor")}</span>
                    </span>
                  </th>
                  <th className="p-4 text-center w-52">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedDocs.map(doc => {
                  const isSelected = selectedDocId === doc.id;
                  
                  return (
                    <tr 
                      key={doc.id} 
                      className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                        isSelected 
                          ? "bg-indigo-50/40 hover:bg-indigo-50/60 border-l-3 border-l-indigo-600" 
                          : ""
                      }`} 
                      onClick={() => setSelectedDocId(doc.id)}
                    >
                      <td className="p-4 text-center align-middle" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedDocumentIds.includes(doc.id)}
                          onChange={e => handleSelectDoc(doc.id, e.target.checked)}
                          className="h-4 w-4 cursor-pointer accent-indigo-600"
                        />
                      </td>
                      {/* Folio */}
                      <td className="p-4 align-middle">
                        <div className="space-y-1">
                          <span className="font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px]">
                            {doc.folio || "BORRADOR"}
                          </span>
                        </div>
                      </td>

                      {/* Unidad Administrativa */}
                      <td className="p-4 align-top">
                        <div className="space-y-1">
                          <strong className="text-slate-800 font-bold block max-w-xs truncate" title={doc.unidadNombre}>
                            {doc.unidadNombre}
                          </strong>
                        </div>
                      </td>

                      {/* Concepto de Gasto */}
                      <td className="p-4 align-top">
                        <div className="space-y-1 max-w-sm">
                          <span className="font-extrabold text-slate-800 block truncate" title={getConceptName(doc)}>
                            {getConceptName(doc)}
                          </span>
                          <span className="text-[10px] text-slate-500 font-medium block truncate uppercase leading-tight" title={getConceptKey(doc)}>
                            {getConceptKey(doc)}
                          </span>
                        </div>
                      </td>

                      {/* Proveedor */}
                      <td className="p-4 align-middle font-extrabold text-slate-800 text-xs">
                        <span className="block truncate" title={doc.proveedorNombre}>
                          {doc.proveedorNombre}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-4 align-middle" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Ver Formato */}
                          <div
                            className="relative"
                            onMouseEnter={event => showTooltip(event, "Ver previsualizacion")}
                            onMouseLeave={() => setActiveTooltip(null)}
                          >
                            <button
                              onClick={() => setSelectedDocId(doc.id)}
                              className="bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer border border-indigo-150/40"
                              aria-label="Ver previsualizacion"
                            >
                              <Eye className="h-3.5 w-3.5" /> Ver
                            </button>
                          </div>

                          {/* Editar */}
                          {doc.estado === "borrador" && (
                            <div
                              className="relative"
                              onMouseEnter={event => showTooltip(event, "Editar borrador")}
                              onMouseLeave={() => setActiveTooltip(null)}
                            >
                              <button
                                onClick={() => onEdit(doc)}
                                className="bg-slate-100 hover:bg-amber-600 text-slate-700 hover:text-white px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
                                aria-label="Editar borrador"
                              >
                                <Edit className="h-3.5 w-3.5" /> Editar
                              </button>
                            </div>
                          )}

                          {/* Descargar Excel */}
                          <div
                            className="relative"
                            onMouseEnter={event => showTooltip(event, "Descargar Excel")}
                            onMouseLeave={() => setActiveTooltip(null)}
                          >
                            <button
                              onClick={() => downloadDocExcel(doc)}
                              className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white p-1.5 rounded-lg transition-all border border-emerald-100 cursor-pointer"
                              aria-label="Descargar Excel"
                            >
                              <FileSpreadsheet className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Descargar PDF */}
                          <div
                            className="relative"
                            onMouseEnter={event => showTooltip(event, "Descargar PDF")}
                            onMouseLeave={() => setActiveTooltip(null)}
                          >
                            <button
                              onClick={() => downloadDocPDF(doc)}
                              className="bg-red-50 hover:bg-red-700 text-red-700 hover:text-white p-1.5 rounded-lg transition-all border border-red-100 hover:border-red-700 cursor-pointer"
                              aria-label="Descargar PDF"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Eliminar */}
                          <div
                            className="relative"
                            onMouseEnter={event => showTooltip(event, "Eliminar expediente")}
                            onMouseLeave={() => setActiveTooltip(null)}
                          >
                            <button
                              onClick={() => onDelete(doc.id)}
                              className="bg-slate-50 hover:bg-rose-600 text-slate-400 hover:text-white p-1.5 rounded-lg transition-all border border-slate-200 hover:border-rose-600 cursor-pointer"
                              aria-label="Eliminar expediente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredDocs.length > 0 && (
          <div className="bg-white px-5 py-3 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
              <span>Mostrar</span>
              <select
                value={pageSize}
                onChange={e => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-hidden"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>por pagina</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-[11px] text-slate-500 font-semibold">
                {firstVisible}-{lastVisible} de {sortedDocs.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.max(1, page - 1))}
                  disabled={safeCurrentPage === 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Anterior
                </button>
                <span className="px-2 text-[11px] text-slate-500 font-bold">
                  {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(page => Math.min(totalPages, page + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* 2. DYNAMIC PREVIEW MODAL OVERLAY (Shown on select row) */}

      {selectedDoc && (
        <div
          id="print-preview-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-slate-900/60 backdrop-blur-xs transition-all"
          onClick={() => setSelectedDocId(null)}
        >
          
          {/* Modal Container */}
          <div
            className="relative bg-slate-100 rounded-2xl shadow-2xl border border-slate-300 max-w-5xl w-full max-h-[92vh] overflow-y-auto flex flex-col z-10 animate-in fade-in zoom-in-95 duration-250"
            onClick={e => e.stopPropagation()}
          >
            
            {/* Sticky Action Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 z-30 shadow-3xs">
              <div>
                <span className="text-[9px] font-black uppercase text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full select-none">
                  Vista Previa Oficial Sincronizada
                </span>
                <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5 mt-1 select-none">
                  Formato de Cuenta por Liquidar Certificada (CLC)
                </h3>
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex border border-slate-200 p-1 rounded-lg bg-slate-100 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("formato")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      previewMode === "formato"
                        ? "bg-white text-indigo-700 shadow-3xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Formato
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("datos")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                      previewMode === "datos"
                        ? "bg-white text-indigo-700 shadow-3xs"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Datos
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => downloadDocExcel(selectedDoc)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-3xs hover:-translate-y-0.5 pointer-events-auto cursor-pointer"
                  title="Exportar archivo .xlsx certificado"
                >
                  <FileSpreadsheet className="h-4 w-4" /> Excel Certificado
                </button>
                <button
                  type="button"
                  onClick={() => downloadDocPDF(selectedDoc)}
                  className="bg-red-650 hover:bg-red-750 text-white text-xs font-extrabold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-3xs hover:-translate-y-0.5 pointer-events-auto cursor-pointer"
                  title="Descargar archivo PDF homologado"
                >
                  <FileText className="h-4 w-4" /> Exportar PDF
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-extrabold px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-3xs hover:-translate-y-0.5 cursor-pointer"
                  title="Imprimir documento directament"
                >
                  <Printer className="h-4 w-4" /> Imprimir Formato
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDocId(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-250 font-bold text-xs px-3.5 py-2 rounded-lg transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1">
                    <X className="h-4 w-4" /> Cerrar Vista
                  </span>
                </button>
              </div>
            </div>

            {/* Modal Body: Displays the actual simulated print layout sheet */}
            <div className="p-8 flex justify-center bg-slate-100/60 overflow-y-auto">
              {previewMode === "formato" ? (
              <div className="bg-white p-8 border border-gray-300 rounded-lg flex flex-col space-y-4 shadow-md w-[850px] font-sans text-gray-800 select-text">
                
                {/* Header Box */}
                <div className="grid grid-cols-12 border border-gray-300 text-center items-center select-none">
                  <div className="col-span-3 border-r border-gray-300 p-4 text-left flex flex-col justify-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">Ayuntamiento de</span>
                    <span className="text-xl font-black text-indigo-950 tracking-tight leading-6">Guadalupe</span>
                    <span className="text-[9px] font-semibold text-gray-400 mt-1">2024 | 2027</span>
                  </div>
                  
                  <div className="col-span-6 border-r border-gray-300 p-4 flex flex-col justify-center">
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide leading-5">
                      Cuenta por liquidar certificada para el registro del ejercicio presupuestario
                    </h4>
                  </div>
                  
                  <div className="col-span-3 p-3 flex flex-col items-center justify-center space-y-1">
                    {/* Pseudo QR Code */}
                    <div className="w-10 h-10 border-2 border-gray-800 p-0.5 flex flex-wrap gap-0.5 pointer-events-none opacity-80">
                      <div className="w-3 h-3 bg-gray-900"></div>
                      <div className="w-1 h-3 bg-transparent"></div>
                      <div className="w-3 h-3 bg-gray-900"></div>
                      <div className="w-3 h-1 bg-transparent"></div>
                      <div className="w-3 h-3 bg-gray-900"></div>
                      <div className="w-3 h-3 bg-gray-900"></div>
                    </div>
                    <span id="preview-folio-badge" className="text-[11px] font-mono font-black text-red-650 tracking-wider">
                      {selectedDoc.folio || "BORRADOR SIN FOLIO"}
                    </span>
                  </div>
                </div>

                {/* Box Metadata Block 1 */}
                <div className="grid grid-cols-12 border border-gray-300 select-text">
                  <div className="col-span-6 border-r border-gray-300 p-2.5">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">Unidad Administrativa</div>
                    <div className="text-[11px] font-extrabold text-indigo-950">{selectedDoc.unidadNombre}</div>
                  </div>
                  <div className="col-span-2 border-r border-gray-300 p-2.5">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">Banco:</div>
                    <div className="text-[11px] font-extrabold text-slate-800">{selectedDoc.bancoNombre}</div>
                  </div>
                  <div className="col-span-2 border-r border-gray-300 p-2.5">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">Cuenta:</div>
                    <div className="text-[11px] font-bold font-mono text-slate-800">{selectedDoc.bancoCuenta || "-"}</div>
                  </div>
                  <div className="col-span-2 p-2.5">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">Clabe:</div>
                    <div className="text-[11px] font-mono font-bold text-slate-800 truncate" title={selectedDoc.bancoClabe}>
                      {selectedDoc.bancoClabe || "-"}
                    </div>
                  </div>
                </div>

                {/* Box Metadata Block 2 */}
                <div className="grid grid-cols-12 border border-gray-300 select-text">
                  <div className="col-span-3 border-r border-gray-300 p-2.5 text-center">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">Clave Unidad Administrativa</div>
                    <div className="text-sm font-black text-red-600 mt-1">{selectedDoc.unidadClave}</div>
                  </div>
                  <div className="col-span-6 border-r border-gray-300 p-2.5">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">Proveedor Certificado</div>
                    <div className="text-[11px] font-extrabold text-slate-850">{selectedDoc.proveedorNombre}</div>
                  </div>
                  <div className="col-span-3 p-2.5">
                    <div className="text-[9px] text-gray-400 font-bold mb-0.5 uppercase">R.F.C. del Proveedor</div>
                    <div className="text-[11px] font-mono font-black text-slate-800">{selectedDoc.proveedorRfc}</div>
                  </div>
                </div>

                {/* Items Grid */}
                <div className="border border-gray-300 overflow-hidden text-center text-[10.5px] select-text">
                  {/* Table headers */}
                  <div className="grid grid-cols-12 bg-gray-50 border-b border-gray-300 font-bold text-gray-500 min-h-10 items-center">
                    <div className="col-span-1 border-r border-gray-300 py-2.5 text-[9px] uppercase">O.C.</div>
                    
                    <div className="col-span-4 border-r border-gray-300 py-1 grid grid-cols-4 h-full items-center">
                      <div className="col-span-4 border-b border-gray-200 pb-1.5 text-[8.5px] uppercase tracking-wider font-bold text-indigo-500">
                        Clasificación presupuestal y programática
                      </div>
                      <div className="col-span-1 pt-1.5 border-r border-gray-100 text-[8.5px]">Fuente</div>
                      <div className="col-span-1 pt-1.5 border-r border-gray-100 text-[8.5px]">Proy.</div>
                      <div className="col-span-1 pt-1.5 border-r border-gray-100 text-[8.5px]">Objeto</div>
                      <div className="col-span-1 pt-1.5 text-[8.5px]">Partida</div>
                    </div>
                    
                    <div className="col-span-2 border-r border-gray-300 py-2 text-[9.5px]">Factura</div>
                    <div className="col-span-1 border-r border-gray-300 py-2 text-[9.5px]">Fecha</div>
                    <div className="col-span-1 border-r border-gray-300 py-2 text-right pr-2">Subtotal</div>
                    <div className="col-span-1 border-r border-gray-300 py-2 text-right pr-1">Desc.</div>
                    <div className="col-span-1 border-r border-gray-300 py-2 text-right pr-1">I.V.A.</div>
                    <div className="col-span-1 text-right pr-2 font-bold text-slate-800">Importe</div>
                  </div>

                  {/* Table rows mapping */}
                  {selectedDoc.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-12 border-b border-dashed border-gray-200 items-center min-h-[35px] text-gray-700 font-semibold bg-white">
                      <div className="col-span-1 border-r border-gray-300 py-2.5 font-mono text-left pl-2 text-[10px]">
                        {it.oc || "-"}
                      </div>
                      
                      <div className="col-span-4 border-r border-gray-300 py-2.5 grid grid-cols-4 items-center">
                        <div className="col-span-1 border-r border-gray-200 font-mono font-bold text-indigo-650">{it.fuenteClave}</div>
                        <div className="col-span-1 border-r border-gray-200 font-mono text-slate-600">{it.proyectoClave}</div>
                        <div className="col-span-1 border-r border-gray-200 font-mono text-slate-600">{it.objetoClave}</div>
                        <div id="preview-item-objeto-name" className="col-span-1 text-red-600 font-bold px-0.5 truncate uppercase text-[8.5px]">
                          {it.objetoNombre}
                        </div>
                      </div>
                      
                      <div className="col-span-2 border-r border-gray-300 py-2.5 px-2 font-mono text-left truncate text-[10px]" title={it.numFactura}>
                        {it.numFactura}
                      </div>
                      <div className="col-span-1 border-r border-gray-300 py-2.5 font-mono text-[9px]">
                        {it.fechaFactura.split("-").reverse().join("/")}
                      </div>
                      <div className="col-span-1 border-r border-gray-300 py-2.5 text-right pr-2 font-mono">
                        $ {it.subTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-1 border-r border-gray-300 py-2.5 text-right pr-1 text-gray-400 font-mono">
                        {it.descuento > 0 ? `$ ${it.descuento.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "-"}
                      </div>
                      <div className="col-span-1 border-r border-gray-300 py-2.5 text-right pr-1 font-mono text-slate-600">
                        $ {it.iva.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="col-span-1 text-right pr-2 font-mono font-bold text-gray-900">
                        $ {it.importe.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}

                  {/* Concept and aggregate totals bottom strip */}
                  <div className="grid grid-cols-12 bg-slate-50 items-center justify-between min-h-[40px] border-t border-gray-300 font-medium">
                    <div className="col-span-8 p-2.5 text-left border-r border-gray-300 select-text">
                      <span className="font-extrabold text-gray-400 text-[9px] uppercase mr-1.5 select-none">CONCEPTO GENERAL:</span>
                      <strong className="text-gray-800 text-[10.5px] break-words leading-tight">{selectedDoc.concepto}</strong>
                    </div>
                    <div className="col-span-2 p-1.5 text-right pr-2 font-bold text-gray-500 border-r border-gray-300 uppercase text-[9px]">
                      Suma Cuentas (MXN):
                    </div>
                    <div id="preview-total-display" className="col-span-2 text-right pr-3 font-mono font-black text-gray-950 text-[13px]">
                      $ {selectedDoc.items.reduce((sum, i) => sum + i.importe, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Signatures Columns */}
                <div className="grid grid-cols-3 gap-6 pt-5 text-center text-[10.5px] select-none">
                  <div className="flex flex-col items-center">
                    <span className="font-extrabold text-gray-400 uppercase text-[8.5px] self-start mb-4">Solicita gasto:</span>
                    <div className="border-t border-slate-350 w-full pt-1.5 font-bold text-slate-800 uppercase leading-normal">
                      {selectedDoc.solicitaNombre}
                    </div>
                    <div className="text-[8px] text-gray-400 uppercase font-bold mt-0.5">{selectedDoc.solicitaPuesto}</div>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="font-extrabold text-gray-400 uppercase text-[8.5px] self-start mb-4">Autoriza Finanzas:</span>
                    <div className="border-t border-slate-350 w-full pt-1.5 font-bold text-slate-800 uppercase leading-normal">
                      {selectedDoc.autoriza1Nombre}
                    </div>
                    <div className="text-[8px] text-gray-400 uppercase font-bold mt-0.5">{selectedDoc.autoriza1Puesto}</div>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="font-extrabold text-gray-400 uppercase text-[8.5px] self-start mb-4">Autoriza Sindicatura:</span>
                    <div className="border-t border-slate-350 w-full pt-1.5 font-bold text-slate-800 uppercase leading-normal">
                      {selectedDoc.autoriza2Nombre}
                    </div>
                    <div className="text-[8px] text-gray-400 uppercase font-bold mt-0.5">{selectedDoc.autoriza2Puesto}</div>
                  </div>
                </div>

                {/* Disclaimer Footnotes */}
                <div className="text-[8.5px] text-gray-400 space-y-1 block leading-3 border-t border-gray-150 pt-2.5 selection:bg-indigo-100">
                  <div className="font-bold text-gray-500 uppercase">ELABORÓ EXPEDIENTE: {selectedDoc.elaboro}</div>
                  <p className="font-medium text-gray-400/90 text-justify">
                    FUNDAMENTO LEGAL: LEY ORGÁNICA DEL MUNICIPIO EN SUS ARTÍCULOS 84 FRACCIÓN II FACULTA AL SÍNDICO MUNICIPAL PARA AUTORIZAR LOS GASTOS DE LA ADMINISTRACIÓN PÚBLICA MUNICIPAL ASÍ COMO VIGILAR EL MANEJO Y APLICACIÓN DE LOS RECURSOS DE ESTE AYUNTAMIENTO, VELANDO SIEMPRE POR LA LEGALIDAD, EFICIENCIA Y TRANSPARENCIA CONFORME A LA NORMATIVIDAD DE DISCIPLINA FINANCIERA VIGENTE.
                  </p>
                </div>

              </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl shadow-md w-full max-w-4xl font-sans text-slate-800 select-text overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100 bg-[#f9fafb]">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vista rapida de datos</span>
                        <h4 className="text-lg font-black text-slate-900 mt-1">{selectedDoc.folio || "BORRADOR SIN FOLIO"}</h4>
                        <p className="text-xs text-slate-500 mt-1">{selectedDoc.concepto}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">Total</span>
                        <span className="text-xl font-black font-mono text-slate-950">
                          $ {selectedDoc.items.reduce((sum, i) => sum + i.importe, 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Unidad administrativa</span>
                        <p className="text-sm font-bold text-slate-850">{selectedDoc.unidadNombre}</p>
                        <p className="text-xs font-mono text-slate-500">{selectedDoc.unidadClave}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Proveedor</span>
                        <p className="text-sm font-bold text-slate-850">{selectedDoc.proveedorNombre}</p>
                        <p className="text-xs font-mono text-slate-500">{selectedDoc.proveedorRfc}</p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Banco</span>
                        <p className="text-sm font-bold text-slate-850">{selectedDoc.bancoNombre}</p>
                        <p className="text-xs font-mono text-slate-500">{selectedDoc.bancoCuenta || "-"} / {selectedDoc.bancoClabe || "-"}</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Conceptos e importes</span>
                        <span className="text-[10px] font-bold text-slate-400">{selectedDoc.items.length} registro(s)</span>
                      </div>

                      <div className="space-y-2">
                        {selectedDoc.items.map((it, idx) => (
                          <div key={it.id || idx} className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-black text-slate-850 uppercase">{it.objetoNombre}</p>
                                <p className="text-[11px] font-mono text-slate-500 mt-1">
                                  {it.objetoClave} | Fuente {it.fuenteClave} | Proyecto {it.proyectoClave}
                                </p>
                                <p className="text-[11px] text-slate-500 mt-1">
                                  Factura {it.numFactura || "-"} | {it.fechaFactura ? it.fechaFactura.split("-").reverse().join("/") : "-"}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[10px] font-bold uppercase text-slate-400 block">Importe</span>
                                <span className="text-sm font-black font-mono text-slate-950">
                                  $ {it.importe.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-[11px]">
                              <div>
                                <span className="block font-bold uppercase text-slate-400">Subtotal</span>
                                <span className="font-mono text-slate-700">$ {it.subTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div>
                                <span className="block font-bold uppercase text-slate-400">IVA</span>
                                <span className="font-mono text-slate-700">$ {it.iva.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div>
                                <span className="block font-bold uppercase text-slate-400">Descuento</span>
                                <span className="font-mono text-slate-700">$ {it.descuento.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div>
                                <span className="block font-bold uppercase text-slate-400">O.C.</span>
                                <span className="font-mono text-slate-700">{it.oc || "-"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-5">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Solicita</span>
                        <p className="text-xs font-bold text-slate-850 mt-1">{selectedDoc.solicitaNombre}</p>
                        <p className="text-[10px] text-slate-500">{selectedDoc.solicitaPuesto}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Autoriza Finanzas</span>
                        <p className="text-xs font-bold text-slate-850 mt-1">{selectedDoc.autoriza1Nombre}</p>
                        <p className="text-[10px] text-slate-500">{selectedDoc.autoriza1Puesto}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Autoriza Sindicatura</span>
                        <p className="text-xs font-bold text-slate-850 mt-1">{selectedDoc.autoriza2Nombre}</p>
                        <p className="text-[10px] text-slate-500">{selectedDoc.autoriza2Puesto}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {activeTooltip && (
        <div
          className="pointer-events-none fixed z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-semibold text-white shadow-md"
          style={{ left: activeTooltip.left, top: activeTooltip.top }}
        >
          {activeTooltip.text}
        </div>
      )}

    </div>
  );
}






