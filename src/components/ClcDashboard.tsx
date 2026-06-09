import {
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Edit,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Users
} from "lucide-react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import type { CLCDocument } from "../types";
import presidenciaGuadalupe from "../assets/presidencia-guadalupe.jpg";

export function HeroSection({ syncIndicator }: { syncIndicator: ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-[22px] bg-[#4b0c20] px-6 py-7 text-white sm:px-9 sm:py-9">
      <img
        src={presidenciaGuadalupe}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[50%] object-cover object-[center_38%] opacity-62 mix-blend-luminosity"
        style={{
          maskImage: "linear-gradient(90deg, transparent 0%, black 30%, black 100%)",
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, black 30%, black 100%)"
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#4b0c20_0%,#4b0c20_50%,rgba(75,12,32,.92)_60%,rgba(75,12,32,.42)_78%,rgba(75,12,32,.56)_100%)]" />
      <div className="relative flex max-w-3xl items-start gap-4 sm:items-center sm:gap-6">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full border border-[#cf9b63]/45 bg-white/5 text-[#e1bb80] shadow-inner sm:h-16 sm:w-16">
          <BookOpen className="h-7 w-7 sm:h-8 sm:w-8" />
        </span>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Historial de Expedientes CLC</h1>
            {syncIndicator}
          </div>
          <p className="mt-2 max-w-2xl text-xs font-medium leading-relaxed text-white/72 sm:text-sm">
            Consulta, imprime, descarga o edita Cuentas por Liquidar Certificadas.
          </p>
        </div>
      </div>
    </section>
  );
}

export function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "wine"
}: {
  icon: typeof FolderOpen;
  label: string;
  value: string;
  note: string;
  tone?: "wine" | "gold" | "slate" | "green";
}) {
  const tones = {
    wine: "border-[#ead2d8] bg-[#fffafb] text-[#781730]",
    gold: "border-[#eadfc9] bg-[#fffdf8] text-[#9c681d]",
    slate: "border-slate-200 bg-[#fbfcfd] text-slate-600",
    green: "border-emerald-100 bg-[#fbfefc] text-emerald-700"
  };

  return (
    <article className={`flex min-w-0 items-center gap-4 rounded-2xl border p-4 shadow-[0_10px_30px_rgba(69,35,43,0.045)] ${tones[tone]}`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-current/15 bg-white/75">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-bold text-slate-500">{label}</p>
        <p className="mt-0.5 truncate text-lg font-extrabold tracking-tight text-slate-900">{value}</p>
        <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{note}</p>
      </div>
    </article>
  );
}

interface ClcFiltersProps {
  searchTerm: string;
  dateRangeLabel: string;
  dateFrom: string;
  dateTo: string;
  isDateFilterOpen: boolean;
  dateFilterRef: RefObject<HTMLDivElement | null>;
  selectedCount: number;
  onSearchChange: (value: string) => void;
  onToggleDateFilter: () => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onCloseDateFilter: () => void;
  onClear: () => void;
  onDownloadSelectedExcel: () => void;
  onDownloadSelectedPDF: () => void;
}

export function ClcFilters({
  searchTerm,
  dateRangeLabel,
  dateFrom,
  dateTo,
  isDateFilterOpen,
  dateFilterRef,
  selectedCount,
  onSearchChange,
  onToggleDateFilter,
  onDateFromChange,
  onDateToChange,
  onCloseDateFilter,
  onClear,
  onDownloadSelectedExcel,
  onDownloadSelectedPDF
}: ClcFiltersProps) {
  return (
    <section className="rounded-2xl border border-[#e9e1de] bg-[#fefefe] p-3 shadow-[0_10px_30px_rgba(69,35,43,0.04)]">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Buscar por folio, proveedor o concepto..."
            className="h-11 w-full rounded-xl border border-[#e7e1df] bg-[#fdfcfb] pb-[2px] pl-10 pr-4 pt-0 text-[11px] font-semibold leading-normal text-slate-700 outline-none transition placeholder:text-[11px] focus:border-[#8c2942] focus:ring-3 focus:ring-[#8c2942]/10"
          />
        </label>

        <div className="relative" ref={dateFilterRef}>
          <button
            type="button"
            onClick={onToggleDateFilter}
            className="flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-[#e7e1df] bg-[#fdfcfb] px-3 text-[8px] font-bold text-slate-600 transition hover:border-[#cdbfc0] lg:w-72"
          >
            <span className="flex min-w-0 items-center gap-2">
              <CalendarDays className="h-4 w-4 shrink-0 text-[#8c2942]" />
              <span className="truncate">{dateRangeLabel}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </button>

          {isDateFilterOpen && (
            <div className="absolute right-0 top-full z-20 mt-2 w-[min(24rem,calc(100vw-3rem))] space-y-3 rounded-2xl border border-[#e4dad8] bg-white p-4 shadow-xl">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Desde</span>
                  <input type="date" value={dateFrom} onChange={event => onDateFromChange(event.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-2 text-[8px] outline-none focus:border-[#8c2942]" />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Hasta</span>
                  <input type="date" value={dateTo} onChange={event => onDateToChange(event.target.value)} className="min-w-0 w-full rounded-lg border border-slate-200 px-2 py-2 text-[8px] outline-none focus:border-[#8c2942]" />
                </label>
              </div>
              <button type="button" onClick={onCloseDateFilter} className="w-full rounded-lg bg-[#68142e] px-3 py-2 text-[9px] font-extrabold text-white">
                Aplicar fecha
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClear}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#e7e1df] bg-white px-4 text-[10px] font-bold text-slate-500 transition hover:bg-slate-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Limpiar
        </button>

        {selectedCount > 0 && (
          <div className="flex gap-2">
            <button type="button" onClick={onDownloadSelectedExcel} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[10px] font-extrabold text-white">
              <FileSpreadsheet className="h-4 w-4" /> Excel ({selectedCount})
            </button>
            <button type="button" onClick={onDownloadSelectedPDF} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#781730] px-4 text-[10px] font-extrabold text-white">
              <FileText className="h-4 w-4" /> PDF ({selectedCount})
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

type SortKey = "fecha" | "folio" | "nombre" | "concepto" | "proveedor";

interface ClcTableProps {
  documents: CLCDocument[];
  isLoading: boolean;
  listError: string | null;
  selectedDocumentIds: string[];
  selectedDocId: string | null;
  activeExport: { docId: string; type: "excel" | "pdf" } | null;
  currentPage: number;
  totalPages: number;
  firstVisible: number;
  lastVisible: number;
  totalDocuments: number;
  pageSize: number;
  sortIndicator: (key: SortKey) => string;
  onSort: (key: SortKey) => void;
  onSelectAll: (checked: boolean) => void;
  onSelect: (docId: string, checked: boolean) => void;
  onOpenPreview: (docId: string) => void;
  onEdit: (doc: CLCDocument) => void;
  onDelete: (id: string) => void;
  onDownloadExcel: (doc: CLCDocument) => void;
  onDownloadPDF: (doc: CLCDocument) => void;
  onPageSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
  onShowTooltip: (event: MouseEvent<HTMLElement>, text: string) => void;
  onHideTooltip: () => void;
}

const getConceptName = (doc: CLCDocument) => doc.items[0]?.objetoNombre || doc.concepto;
const getConceptKey = (doc: CLCDocument) => doc.items[0]?.objetoClave || "-";

export function ClcTable(props: ClcTableProps) {
  const areAllSelected = props.documents.length > 0 && props.documents.every(doc => props.selectedDocumentIds.includes(doc.id));
  const actionClass = "grid h-8 w-8 place-items-center rounded-full border shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e5dcda] bg-white shadow-[0_14px_36px_rgba(69,35,43,0.055)]">
      {props.isLoading ? (
        <div className="p-16 text-center" role="status">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#7c1631]" />
          <p className="mt-3 text-xs font-bold text-slate-500">Cargando historial de expedientes...</p>
        </div>
      ) : props.listError ? (
        <div className="p-16 text-center">
          <FileText className="mx-auto h-10 w-10 text-rose-300" />
          <p className="mt-3 text-xs font-bold text-rose-700">No se pudo cargar el historial de expedientes.</p>
          <p className="mt-1 text-[10px] text-rose-500">{props.listError}</p>
        </div>
      ) : props.documents.length === 0 ? (
        <div className="p-16 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-xs font-bold text-slate-500">No se encontraron expedientes con los criterios indicados.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-[11px]">
            <colgroup>
              <col className="w-12" />
              <col className="w-32" />
              <col className="w-52" />
              <col className="w-52" />
              <col className="w-52" />
              <col className="w-56" />
            </colgroup>
            <thead>
              <tr className="border-b border-[#eadfdd] bg-[#fdfbf9] text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400">
                <th className="px-4 py-3 text-center"><input type="checkbox" checked={areAllSelected} onChange={event => props.onSelectAll(event.target.checked)} className="h-3.5 w-3.5 accent-[#781730]" /></th>
                <TableHeading label="Folio" sortKey="folio" onSort={props.onSort} indicator={props.sortIndicator("folio")} />
                <TableHeading label="Unidad administrativa" sortKey="nombre" onSort={props.onSort} indicator={props.sortIndicator("nombre")} />
                <TableHeading label="Concepto de gasto" sortKey="concepto" onSort={props.onSort} indicator={props.sortIndicator("concepto")} />
                <TableHeading label="Proveedor" sortKey="proveedor" onSort={props.onSort} indicator={props.sortIndicator("proveedor")} />
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eee7e5]">
              {props.documents.map(doc => (
                <tr key={doc.id} onClick={() => props.onOpenPreview(doc.id)} className={`cursor-pointer transition hover:bg-[#fdf8f9] ${props.selectedDocId === doc.id ? "bg-[#fbf1f3]" : ""}`}>
                  <td className="px-4 py-4 text-center" onClick={event => event.stopPropagation()}>
                    <input type="checkbox" checked={props.selectedDocumentIds.includes(doc.id)} onChange={event => props.onSelect(doc.id, event.target.checked)} className="h-3.5 w-3.5 accent-[#781730]" />
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex rounded-full border border-[#e6cdd3] bg-[#fff9fa] px-2.5 py-1 font-mono text-[9px] font-extrabold text-[#8b1c38]">{doc.folio || "Sin folio"}</span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="truncate font-bold text-slate-700" title={doc.unidadNombre}>{doc.unidadNombre}</p>
                    <p className="mt-1 text-[9px] font-semibold text-slate-400">{doc.unidadClave}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="truncate font-bold text-slate-700" title={getConceptName(doc)}>{getConceptName(doc)}</p>
                    <p className="mt-1 text-[9px] font-semibold text-slate-400">{getConceptKey(doc)}</p>
                  </td>
                  <td className="px-4 py-4"><p className="truncate font-semibold text-slate-600" title={doc.proveedorNombre}>{doc.proveedorNombre}</p></td>
                  <td className="px-4 py-4" onClick={event => event.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      <ActionButton label="Ver expediente" className={`${actionClass} border-indigo-100 bg-indigo-50 text-indigo-700 hover:border-indigo-600 hover:bg-indigo-600 hover:text-white`} onClick={() => props.onOpenPreview(doc.id)} onShowTooltip={props.onShowTooltip} onHideTooltip={props.onHideTooltip}><Eye className="h-3.5 w-3.5" /></ActionButton>
                      <ActionButton label="Editar expediente" className={`${actionClass} border-amber-100 bg-amber-50 text-amber-700 hover:border-amber-600 hover:bg-amber-600 hover:text-white`} onClick={() => props.onEdit(doc)} onShowTooltip={props.onShowTooltip} onHideTooltip={props.onHideTooltip}><Edit className="h-3.5 w-3.5" /></ActionButton>
                      <ActionButton label="Descargar Excel" className={`${actionClass} border-emerald-100 bg-emerald-50 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-600 hover:text-white`} disabled={Boolean(props.activeExport)} onClick={() => props.onDownloadExcel(doc)} onShowTooltip={props.onShowTooltip} onHideTooltip={props.onHideTooltip}>{props.activeExport?.docId === doc.id && props.activeExport.type === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />}</ActionButton>
                      <ActionButton label="Descargar PDF" className={`${actionClass} border-red-100 bg-red-50 text-red-700 hover:border-red-700 hover:bg-red-700 hover:text-white`} disabled={Boolean(props.activeExport)} onClick={() => props.onDownloadPDF(doc)} onShowTooltip={props.onShowTooltip} onHideTooltip={props.onHideTooltip}>{props.activeExport?.docId === doc.id && props.activeExport.type === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}</ActionButton>
                      <ActionButton label="Eliminar expediente" className={`${actionClass} border-rose-100 bg-rose-50 text-rose-600 hover:border-rose-600 hover:bg-rose-600 hover:text-white`} onClick={() => props.onDelete(doc.id)} onShowTooltip={props.onShowTooltip} onHideTooltip={props.onHideTooltip}><Trash2 className="h-3.5 w-3.5" /></ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {props.totalDocuments > 0 && (
        <footer className="flex flex-col items-start justify-between gap-3 border-t border-[#eee7e5] bg-[#fffdfb] px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
            <span>Mostrando</span>
            <select value={props.pageSize} onChange={event => props.onPageSizeChange(Number(event.target.value))} className="rounded-lg border border-[#e5dddb] bg-white px-2 py-1.5 text-[10px] font-bold outline-none">
              <option value={5}>5</option><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
            </select>
            <span>{props.firstVisible}-{props.lastVisible} de {props.totalDocuments} expedientes</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={props.currentPage === 1} onClick={() => props.onPageChange(props.currentPage - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4dcda] bg-white text-slate-500 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="rounded-lg bg-[#781730] px-3 py-2 text-[10px] font-extrabold text-white">{props.currentPage}</span>
            <span className="text-[10px] font-bold text-slate-400">de {props.totalPages}</span>
            <button type="button" disabled={props.currentPage === props.totalPages} onClick={() => props.onPageChange(props.currentPage + 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-[#e4dcda] bg-white text-slate-500 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </footer>
      )}
    </section>
  );
}

function TableHeading({ label, sortKey, onSort, indicator }: { label: string; sortKey: SortKey; onSort: (key: SortKey) => void; indicator: string }) {
  return <th onClick={() => onSort(sortKey)} className="cursor-pointer px-4 py-3 transition hover:text-[#781730]">{label} <span className="font-mono">{indicator}</span></th>;
}

function ActionButton({
  children,
  className,
  disabled,
  label,
  onClick,
  onShowTooltip,
  onHideTooltip
}: {
  children: ReactNode;
  className: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  onShowTooltip: (event: MouseEvent<HTMLElement>, text: string) => void;
  onHideTooltip: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={event => onShowTooltip(event, label)}
      onMouseLeave={onHideTooltip}
      className={className}
    >
      {children}
    </button>
  );
}

export const summaryIcons = {
  total: FolderOpen,
  providers: Users,
  amount: CircleDollarSign,
  folio: FileText
};
