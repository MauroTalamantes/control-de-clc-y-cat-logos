import {
  BookOpen,
  Building2,
  ChevronRight,
  FileText,
  Menu,
  Plus,
  Settings2,
  SlidersHorizontal,
  Users,
  X
} from "lucide-react";
import { useState, type ReactNode } from "react";
import sidebarGuadalupe from "../assets/sidebar-guadalupe.png";

export type AppSection = "lista" | "catalogos" | "proveedores" | "parametros";

interface AppShellProps {
  activeSection: AppSection;
  children: ReactNode;
  onNavigate: (section: AppSection) => void;
  onCreate: () => void;
  periodLabel: string;
}

interface AppSidebarProps {
  activeSection: AppSection;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (section: AppSection) => void;
}

const logoUrl = "https://gpe.gob.mx/wp-content/uploads/2025/03/AYTO-GPE-GUINDA1-300x168.png";

function NavButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean;
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontFamily: '"Segoe UI", Arial, sans-serif' }}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[8px] font-semibold transition-all ${
        active
          ? "bg-[#6d1224] text-white shadow-[0_8px_18px_rgba(91,15,39,0.18)]"
          : "text-[#2b2d3e] hover:bg-[#f7f1f2] hover:text-[#6b1029]"
      }`}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${active ? "bg-white/12" : "bg-slate-100 group-hover:bg-white"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 whitespace-nowrap">{label}</span>
      <ChevronRight className={`h-3.5 w-3.5 transition-transform ${active ? "opacity-80" : "opacity-30 group-hover:translate-x-0.5 group-hover:opacity-70"}`} />
    </button>
  );
}

export function AppSidebar({ activeSection, isOpen, onClose, onNavigate }: AppSidebarProps) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          aria-label="Cerrar navegacion"
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-[1px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col overflow-hidden border-r border-[#eadfe1] bg-[#f9f4ed] transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative z-10 flex h-[104px] items-center justify-center px-5">
          <img
            src={logoUrl}
            alt="Ayuntamiento de Guadalupe"
            className="h-[88px] w-auto max-w-[205px] object-contain"
            style={{ filter: "brightness(0) saturate(100%) invert(12%) sepia(54%) saturate(3472%) hue-rotate(330deg) brightness(84%) contrast(100%)" }}
          />
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 grid h-9 w-9 place-items-center rounded-xl border border-slate-200 text-slate-500 lg:hidden"
            aria-label="Cerrar navegacion"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="relative z-10 flex-1 space-y-7 overflow-y-auto px-4 py-6">
          <section>
            <div className="mb-2 flex items-center gap-3 px-3">
              <p className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#a18b80]">Principal</p>
              <span className="h-px flex-1 bg-[#e8ddd6]" />
            </div>
            <div className="space-y-1">
              <NavButton active={activeSection === "lista"} icon={FileText} label="Expedientes CLC" onClick={() => onNavigate("lista")} />
              <div className="hidden">
                <NavButton active={activeSection === "catalogos"} icon={BookOpen} label="Catálogos" onClick={() => onNavigate("catalogos")} />
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center gap-3 px-3">
              <p className="shrink-0 text-[9px] font-extrabold uppercase tracking-[0.18em] text-[#a18b80]">Configuración</p>
              <span className="h-px flex-1 bg-[#e8ddd6]" />
            </div>
            <div className="space-y-1">
              <div className="hidden">
                <NavButton active={activeSection === "proveedores"} icon={Users} label="Proveedores" onClick={() => onNavigate("proveedores")} />
              </div>
              <NavButton active={activeSection === "parametros"} icon={SlidersHorizontal} label="Parámetros" onClick={() => onNavigate("parametros")} />
            </div>
          </section>
        </nav>

        <img
          src={sidebarGuadalupe}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[-20px] z-0 w-full select-none object-contain opacity-70 mix-blend-multiply"
          style={{
            maskImage: "linear-gradient(to bottom, transparent 0%, black 22%, black 82%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 22%, black 82%, transparent 100%)"
          }}
        />

        <div className="relative z-10 hidden bg-[#faf8f5]/85 p-4 backdrop-blur-[1px]">
          <div className="flex items-center gap-3 rounded-2xl border border-[#eadfe1] bg-white p-3 shadow-[0_8px_25px_rgba(71,33,43,0.05)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f3e5e8] text-[#7c1631]">
              <Building2 className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-extrabold text-slate-800">Administración</p>
              <p className="truncate text-[9px] font-semibold text-slate-400">Sesión institucional</p>
            </div>
            <Settings2 className="h-4 w-4 text-slate-300" />
          </div>
        </div>
      </aside>
    </>
  );
}

export function AppHeader({
  onCreate,
  onOpenMenu,
  periodLabel
}: {
  onCreate: () => void;
  onOpenMenu: () => void;
  periodLabel: string;
}) {
  return (
    <header className="sticky top-0 z-30 bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 rounded-2xl border border-[#eadfe1] bg-[#fefefe] px-3 py-2 shadow-[0_6px_20px_rgba(69,35,43,0.04)] sm:px-4">
        <button
          type="button"
          onClick={onOpenMenu}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[#e8dde0] bg-white text-[#74142e] lg:hidden"
          aria-label="Abrir navegacion"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="hidden shrink-0 text-center leading-tight sm:block">
            <p className="text-[10px] font-semibold text-slate-500">Ejercicio</p>
            <p className="mt-0.5 text-[10px] font-extrabold text-[#2b2d3e]">{periodLabel.replace("Ejercicio ", "")}</p>
          </div>
          <span className="hidden h-8 w-px bg-[#d8c89f] sm:block" />
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-[#311c25] sm:text-sm">Sistema de Gestión de Cuentas por Liquidar Certificadas</p>
          </div>
        </div>

        <button
          id="nav-create-clc"
          type="button"
          onClick={onCreate}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#651028] px-4 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-[#7a1532] sm:px-5"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nueva CLC</span>
          <span className="sm:hidden">Nueva</span>
        </button>
      </div>
    </header>
  );
}

export default function AppShell({ activeSection, children, onNavigate, onCreate, periodLabel }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleNavigate = (section: AppSection) => {
    onNavigate(section);
    setIsSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <AppSidebar
        activeSection={activeSection}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onNavigate={handleNavigate}
      />
      <div className="min-h-screen lg:pl-[250px]">
        <AppHeader onCreate={onCreate} onOpenMenu={() => setIsSidebarOpen(true)} periodLabel={periodLabel} />
        {children}
      </div>
    </div>
  );
}
