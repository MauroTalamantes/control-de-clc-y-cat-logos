/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { 
  AppCatalogs, 
  AdministrativeUnit, 
  Bank, 
  BankName,
  Provider, 
  BudgetSource, 
  BudgetProject, 
  ExpenseObject, 
  Signature 
} from "../types";
import { Plus, Trash2, Edit2, Check, X, ShieldAlert, BookOpen, Layers } from "lucide-react";
import { AlertTriangle, CheckCircle2, Database, RefreshCw, Save } from "lucide-react";

interface CatalogManagerProps {
  catalogs: AppCatalogs;
  onChange: (updated: AppCatalogs) => void;
  storageMode: "supabase" | "electron" | "browser";
  saveStatus: "idle" | "loading" | "saving" | "saved" | "error";
  saveError: string | null;
  onReload: () => void;
}

type ActiveTab = "unidades" | "bancos" | "proveedores" | "presupuesto" | "firmas";
type NewRecordId = "new_unidad" | "new_banco_nombre" | "new_banco" | "new_proveedor" | "new_firma" | "new_f" | "new_pr" | "new_o";

export default function CatalogManager({
  catalogs,
  onChange,
  storageMode,
  saveStatus,
  saveError,
  onReload
}: CatalogManagerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("unidades");
  
  // Local state for editing or adding items
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Temporary form states
  const [unidadForm, setUnidadForm] = useState<Partial<AdministrativeUnit>>({});
  const [bancoNombreForm, setBancoNombreForm] = useState<Partial<BankName>>({});
  const [bancoForm, setBancoForm] = useState<Partial<Bank>>({});
  const [proveedorForm, setProveedorForm] = useState<Partial<Provider>>({});
  const [firmaForm, setFirmaForm] = useState<Partial<Signature>>({});
  
  // Budget classification forms
  const [fuenteForm, setFuenteForm] = useState<Partial<BudgetSource>>({});
  const [proyectoForm, setProyectoForm] = useState<Partial<BudgetProject>>({});
  const [objetoForm, setObjetoForm] = useState<Partial<ExpenseObject>>({});
  const defaultUnidadId = catalogs.defaultUnidadId || catalogs.unidades[0]?.id || "";
  const defaultUnidad = catalogs.unidades.find(u => u.id === defaultUnidadId) || catalogs.unidades[0];
  const bancoNombres = catalogs.bancoNombres?.length
    ? catalogs.bancoNombres
    : Array.from(new Set(catalogs.bancos.map(b => b.nombre))).map((nombre, index) => ({ id: `bn_${index + 1}`, nombre }));
  const storageLabel = storageMode === "supabase"
    ? "Base central"
    : storageMode === "electron"
      ? "Archivo local"
      : "Navegador";
  const storageDescription = storageMode === "supabase"
    ? "Supabase/Postgres"
    : storageMode === "electron"
      ? "clc-data.json"
      : "localStorage";
  const statusConfig = {
    idle: { label: "Listo", className: "bg-slate-100 text-slate-600 border-slate-200", icon: Database },
    loading: { label: "Cargando", className: "bg-blue-50 text-blue-700 border-blue-100", icon: RefreshCw },
    saving: { label: "Guardando", className: "bg-amber-50 text-amber-700 border-amber-100", icon: Save },
    saved: { label: "Guardado", className: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: CheckCircle2 },
    error: { label: "Error", className: "bg-rose-50 text-rose-700 border-rose-100", icon: AlertTriangle }
  }[saveStatus];
  const StatusIcon = statusConfig.icon;

  const startAddUnit = () => {
    setEditingId("new_unidad");
    setUnidadForm({ clave: "", nombre: "", elaboro: "" });
  };

  const startEditUnit = (u: AdministrativeUnit) => {
    setEditingId(u.id);
    setUnidadForm({ ...u });
  };

  const saveUnit = () => {
    if (!unidadForm.clave || !unidadForm.nombre) return;
    let list = [...catalogs.unidades];
    if (editingId === "new_unidad") {
      list.push({
        id: "u_" + Math.random().toString(36).substr(2, 9),
        clave: unidadForm.clave,
        nombre: unidadForm.nombre,
        elaboro: unidadForm.elaboro || unidadForm.nombre.replace("SECRETARÍA DE ", "")
      });
    } else {
      list = list.map(u => u.id === editingId ? { ...u, ...unidadForm } as AdministrativeUnit : u);
    }
    onChange({
      ...catalogs,
      unidades: list,
      defaultUnidadId: catalogs.defaultUnidadId || list[0]?.id
    });
    setEditingId(null);
  };

  const deleteUnit = (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar esta Unidad Administrativa?")) {
      const list = catalogs.unidades.filter(u => u.id !== id);
      onChange({
        ...catalogs,
        unidades: list,
        defaultUnidadId: catalogs.defaultUnidadId === id ? list[0]?.id : catalogs.defaultUnidadId
      });
    }
  };

  // CATALOGO DE BANCOS
  const startAddBancoNombre = () => {
    setEditingId("new_banco_nombre");
    setBancoNombreForm({ nombre: "" });
  };
  const startEditBancoNombre = (b: BankName) => {
    setEditingId(b.id);
    setBancoNombreForm({ ...b });
  };
  const saveBancoNombre = () => {
    if (!bancoNombreForm.nombre) return;
    const nombre = bancoNombreForm.nombre.toUpperCase().trim();
    const oldNombre = bancoNombres.find(b => b.id === editingId)?.nombre;
    const isDuplicate = bancoNombres.some(b => b.nombre.toUpperCase().trim() === nombre && b.id !== editingId);
    if (isDuplicate) {
      alert("Error: El banco ya se encuentra registrado.");
      return;
    }
    let list = [...bancoNombres];
    if (editingId === "new_banco_nombre") {
      list.push({
        id: "bn_" + Math.random().toString(36).substr(2, 9),
        nombre
      });
    } else {
      list = list.map(b => b.id === editingId ? { ...b, nombre } : b);
    }
    onChange({
      ...catalogs,
      bancoNombres: list,
      bancos: oldNombre ? catalogs.bancos.map(b => b.nombre === oldNombre ? { ...b, nombre } : b) : catalogs.bancos
    });
    setEditingId(null);
  };
  const deleteBancoNombre = (id: string) => {
    if (confirm("¿Deseas eliminar este banco del catálogo?")) {
      const bancoNombre = bancoNombres.find(b => b.id === id)?.nombre;
      if (bancoNombre && catalogs.bancos.some(b => b.nombre === bancoNombre)) {
        alert("No se puede eliminar: hay cuentas bancarias usando este banco.");
        return;
      }
      onChange({ ...catalogs, bancoNombres: bancoNombres.filter(b => b.id !== id) });
    }
  };

  // BANCOS
  const startAddBanco = () => {
    setEditingId("new_banco");
    setBancoForm({ nombre: bancoNombres[0]?.nombre || "", cuenta: "", clabe: "" });
  };
  const startEditBanco = (b: Bank) => {
    setEditingId(b.id);
    setBancoForm({ ...b });
  };
  const saveBanco = () => {
    if (!bancoForm.nombre || !bancoForm.cuenta) return;
    let list = [...catalogs.bancos];
    
    // Check duplicate CLABE
    if (bancoForm.clabe) {
      const isDuplicate = catalogs.bancos.some(b => b.clabe === bancoForm.clabe && b.id !== editingId);
      if (isDuplicate) {
        alert("Error: La CLABE Interbancaria ya se encuentra registrada para otra cuenta.");
        return;
      }
    }

    if (editingId === "new_banco") {
      list.push({
        id: "b_" + Math.random().toString(36).substr(2, 9),
        nombre: bancoForm.nombre,
        cuenta: bancoForm.cuenta,
        clabe: bancoForm.clabe || ""
      });
    } else {
      list = list.map(b => b.id === editingId ? { ...b, ...bancoForm } as Bank : b);
    }
    onChange({ ...catalogs, bancos: list });
    setEditingId(null);
  };
  const deleteBanco = (id: string) => {
    if (confirm("¿Deseas eliminar este Banco?")) {
      onChange({ ...catalogs, bancos: catalogs.bancos.filter(b => b.id !== id) });
    }
  };

  // PROVEEDORES
  const startAddProveedor = () => {
    setEditingId("new_proveedor");
    setProveedorForm({ nombre: "", rfc: "" });
  };
  const startEditProveedor = (p: Provider) => {
    setEditingId(p.id);
    setProveedorForm({ ...p });
  };
  const saveProveedor = () => {
    if (!proveedorForm.nombre || !proveedorForm.rfc) return;
    let list = [...catalogs.proveedores];
    
    // Check duplicate RFC
    const pRfc = proveedorForm.rfc.toUpperCase().trim();
    const isDuplicate = catalogs.proveedores.some(p => p.rfc.toUpperCase().trim() === pRfc && p.id !== editingId);
    if (isDuplicate) {
      alert("Error: El R.F.C. ya se encuentra registrado para otro proveedor.");
      return;
    }

    if (editingId === "new_proveedor") {
      list.push({
        id: "p_" + Math.random().toString(36).substr(2, 9),
        nombre: proveedorForm.nombre,
        rfc: pRfc
      });
    } else {
      list = list.map(p => p.id === editingId ? { ...p, ...proveedorForm, rfc: pRfc } as Provider : p);
    }
    onChange({ ...catalogs, proveedores: list });
    setEditingId(null);
  };
  const deleteProveedor = (id: string) => {
    if (confirm("¿Deseas eliminar este Proveedor?")) {
      onChange({ ...catalogs, proveedores: catalogs.proveedores.filter(p => p.id !== id) });
    }
  };

  // FIRMAS
  const startAddFirma = () => {
    setEditingId("new_firma");
    setFirmaForm({ tipo: "General", nombre: "", puesto: "" });
  };
  const startEditFirma = (f: Signature) => {
    setEditingId(f.id);
    setFirmaForm({ ...f });
  };
  const saveFirma = () => {
    if (!firmaForm.nombre || !firmaForm.puesto) return;
    let list = [...catalogs.firmas];
    if (editingId === "new_firma") {
      list.push({
        id: "s_" + Math.random().toString(36).substr(2, 9),
        tipo: firmaForm.tipo || "General",
        nombre: firmaForm.nombre,
        puesto: firmaForm.puesto
      });
    } else {
      list = list.map(f => f.id === editingId ? { ...f, ...firmaForm } as Signature : f);
    }
    onChange({ ...catalogs, firmas: list });
    setEditingId(null);
  };
  const deleteFirma = (id: string) => {
    if (confirm("¿Deseas eliminar este Firmante?")) {
      onChange({ ...catalogs, firmas: catalogs.firmas.filter(f => f.id !== id) });
    }
  };

  // CLASIFICACIONES PRESUPUESTALES: FUENTE, PROYECTO, OBJETO
  const saveFuente = () => {
    if (!fuenteForm.clave || !fuenteForm.descripcion) return;
    let list = [...catalogs.fuentes];
    if (editingId === "new_f") {
      list.push({
        id: "f_" + Math.random().toString(36).substr(2, 9),
        clave: fuenteForm.clave,
        descripcion: fuenteForm.descripcion
      });
    } else {
      list = list.map(f => f.id === editingId ? { ...f, ...fuenteForm } as BudgetSource : f);
    }
    onChange({ ...catalogs, fuentes: list });
    setEditingId(null);
  };
  const saveProyecto = () => {
    if (!proyectoForm.clave || !proyectoForm.descripcion) return;
    let list = [...catalogs.proyectos];
    if (editingId === "new_pr") {
      list.push({
        id: "pr_" + Math.random().toString(36).substr(2, 9),
        clave: proyectoForm.clave,
        descripcion: proyectoForm.descripcion
      });
    } else {
      list = list.map(p => p.id === editingId ? { ...p, ...proyectoForm } as BudgetProject : p);
    }
    onChange({ ...catalogs, proyectos: list });
    setEditingId(null);
  };
  const saveObjeto = () => {
    if (!objetoForm.clave || !objetoForm.nombre) return;
    let list = [...catalogs.objetos];
    if (editingId === "new_o") {
      list.push({
        id: "o_" + Math.random().toString(36).substr(2, 9),
        clave: objetoForm.clave,
        nombre: objetoForm.nombre
      });
    } else {
      list = list.map(o => o.id === editingId ? { ...o, ...objetoForm } as ExpenseObject : o);
    }
    onChange({ ...catalogs, objetos: list });
    setEditingId(null);
  };

  const setDefaultUnidad = (id: string) => {
    onChange({ ...catalogs, defaultUnidadId: id });
  };

  const isNewRecord = (id: string | null): id is NewRecordId => {
    return id === "new_unidad" || id === "new_banco_nombre" || id === "new_banco" || id === "new_proveedor" || id === "new_firma" || id === "new_f" || id === "new_pr" || id === "new_o";
  };

  const saveNewRecord = () => {
    if (editingId === "new_unidad") saveUnit();
    if (editingId === "new_banco_nombre") saveBancoNombre();
    if (editingId === "new_banco") saveBanco();
    if (editingId === "new_proveedor") saveProveedor();
    if (editingId === "new_firma") saveFirma();
    if (editingId === "new_f") saveFuente();
    if (editingId === "new_pr") saveProyecto();
    if (editingId === "new_o") saveObjeto();
  };

  const getNewRecordTitle = () => {
    if (editingId === "new_unidad") return "Nueva Unidad Administrativa";
    if (editingId === "new_banco_nombre") return "Nuevo Banco";
    if (editingId === "new_banco") return "Nueva Cuenta Bancaria";
    if (editingId === "new_proveedor") return "Nuevo Proveedor";
    if (editingId === "new_firma") return "Nuevo Firmante";
    if (editingId === "new_f") return "Nueva Fuente de Financiamiento";
    if (editingId === "new_pr") return "Nuevo Proyecto / Programa";
    if (editingId === "new_o") return "Nuevo Objeto del Gasto";
    return "Nuevo Registro";
  };

  return (
    <div id="catalog-manager" className="bg-white rounded-xl shadow-xs border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 border-b border-gray-100 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Layers className="h-5 w-5 text-gray-500" />
              Administración de Catálogos de Registro
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Define y administra los datos de autocompletado rápido para generar folios óptimos y ágiles.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <Database className="h-4 w-4 text-slate-500" />
              <div className="leading-tight">
                <p className="text-[11px] font-bold text-slate-700">{storageLabel}</p>
                <p className="text-[10px] text-slate-400">{storageDescription}</p>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 ${statusConfig.className}`}>
              <StatusIcon className={`h-3.5 w-3.5 ${saveStatus === "loading" || saveStatus === "saving" ? "animate-spin" : ""}`} />
              <span className="text-[11px] font-bold">{statusConfig.label}</span>
            </div>
            <button
              type="button"
              onClick={onReload}
              disabled={saveStatus === "loading" || saveStatus === "saving"}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              title="Recargar catálogos"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Recargar
            </button>
          </div>
        </div>
        {saveError && (
          <div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700">
            {saveError}
          </div>
        )}
      </div>

      {/* Tabs navigation */}
      <div className="flex border-b border-gray-100 bg-gray-50/50 scrollbar-none overflow-x-auto">
        <button
          id="tab-unidades"
          onClick={() => { setActiveTab("unidades"); setEditingId(null); }}
          className={`px-5 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "unidades" 
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/10" 
              : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/30"
          }`}
        >
          Unidades Administrativas
        </button>
        <button
          id="tab-bancos"
          onClick={() => { setActiveTab("bancos"); setEditingId(null); }}
          className={`px-5 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "bancos" 
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/10" 
              : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/30"
          }`}
        >
          Cuentas Bancarias
        </button>
        <button
          id="tab-proveedores"
          onClick={() => { setActiveTab("proveedores"); setEditingId(null); }}
          className={`px-5 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "proveedores" 
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/10" 
              : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/30"
          }`}
        >
          Proveedores
        </button>
        <button
          id="tab-presupuesto"
          onClick={() => { setActiveTab("presupuesto"); setEditingId(null); }}
          className={`px-5 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "presupuesto" 
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/10" 
              : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/30"
          }`}
        >
          Clasificaciones Presupuestales
        </button>
        <button
          id="tab-firmas"
          onClick={() => { setActiveTab("firmas"); setEditingId(null); }}
          className={`px-5 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === "firmas" 
              ? "border-indigo-600 text-indigo-700 bg-indigo-50/10" 
              : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-100/30"
          }`}
        >
          Firmantes y Puestos
        </button>
      </div>

      <div className="p-6">
        {/* TAB: UNIDADES */}
        {activeTab === "unidades" && (
          <div id="panel-unidades" className="space-y-4">
            <div className="flex justify-between items-center bg-indigo-50/20 p-4 rounded-lg border border-indigo-100/50">
              <span className="text-xs text-indigo-950 leading-relaxed max-w-lg">
                Administra las unidades administrativas y selecciona cual sera la predeterminada para los formatos.
              </span>
              {editingId !== "new_unidad" && (
                <button
                  id="btn-add-unit"
                  onClick={startAddUnit}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Nueva Unidad
                </button>
              )}
            </div>

            <div className="bg-white border border-gray-100 rounded-xl p-4">
              <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Unidad predeterminada</label>
              <select
                value={defaultUnidadId}
                onChange={e => setDefaultUnidad(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                {catalogs.unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.clave} - {u.nombre}</option>
                ))}
              </select>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100 select-none">
                    <th className="p-3 w-20">Clave</th>
                    <th className="p-3">Nombre Oficial Completo</th>
                    <th className="p-3 text-center w-28">Predeterminada</th>
                    <th className="p-3 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {catalogs.unidades.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/40">
                      {editingId === u.id ? (
                        <>
                          <td className="p-2">
                            <input
                              type="text"
                              value={unidadForm.clave || ""}
                              onChange={e => setUnidadForm({ ...unidadForm, clave: e.target.value })}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={unidadForm.nombre || ""}
                              onChange={e => setUnidadForm({ ...unidadForm, nombre: e.target.value.toUpperCase() })}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2 text-center">-</td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={saveUnit} className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 cursor-pointer"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 cursor-pointer"><X className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-mono font-bold text-indigo-700">{u.clave}</td>
                          <td className="p-3 font-medium text-gray-800">{u.nombre}</td>
                          <td className="p-3 text-center">
                            {defaultUnidadId === u.id ? (
                              <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full text-[10px] font-bold">Default</span>
                            ) : (
                              <button onClick={() => setDefaultUnidad(u.id)} className="text-[10px] font-bold text-gray-400 hover:text-indigo-700 cursor-pointer">Usar</button>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => startEditUnit(u)} className="p-1 text-zinc-400 hover:text-indigo-600 rounded-md hover:bg-indigo-50 cursor-pointer" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteUnit(u.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* TAB: BANCOS */}
        {activeTab === "bancos" && (
          <div id="panel-bancos" className="space-y-4">
            <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-lg border border-blue-100">
              <span className="text-xs text-blue-900 leading-relaxed max-w-lg">
                Registra las cuentas bancarias oficiales con banco, cuenta y clabe para el llenado masivo inmediato.
              </span>
              {editingId !== "new_banco" && (
                <button
                  id="btn-add-banco"
                  onClick={startAddBanco}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Nueva Cuenta
                </button>
              )}
            </div>

            <details className="group rounded-xl border border-amber-100 bg-amber-50/40 overflow-hidden">
              <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
                <div>
                  <span className="text-xs font-bold text-amber-900">Catálogo de bancos</span>
                  <p className="text-[11px] text-amber-700 mt-0.5">Administra los nombres disponibles para las cuentas bancarias.</p>
                </div>
                <span className="text-[11px] font-bold text-amber-700 group-open:hidden">Mostrar</span>
                <span className="hidden text-[11px] font-bold text-amber-700 group-open:inline">Ocultar</span>
              </summary>

              <div className="border-t border-amber-100 bg-white p-4 space-y-3">
                <div className="flex justify-end">
                  {editingId !== "new_banco_nombre" && (
                    <button
                      id="btn-add-banco-nombre"
                      onClick={startAddBancoNombre}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                    >
                      <Plus className="h-4 w-4" /> Nuevo Banco
                    </button>
                  )}
                </div>

                <div className="border border-gray-100 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100 select-none">
                        <th className="p-3">Nombre del Banco</th>
                        <th className="p-3 text-right w-24">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {bancoNombres.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50/40">
                          {editingId === b.id ? (
                            <>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={bancoNombreForm.nombre || ""}
                                  onChange={e => setBancoNombreForm({ ...bancoNombreForm, nombre: e.target.value.toUpperCase() })}
                                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                                />
                              </td>
                              <td className="p-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={saveBancoNombre} className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 cursor-pointer"><Check className="h-4 w-4" /></button>
                                  <button onClick={() => setEditingId(null)} className="p-1 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 cursor-pointer"><X className="h-4 w-4" /></button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="p-3 font-semibold text-gray-800">{b.nombre}</td>
                              <td className="p-3 text-right">
                                <div className="flex justify-end gap-1">
                                  <button onClick={() => startEditBancoNombre(b)} className="p-1 text-gray-400 hover:text-amber-600 rounded-md hover:bg-amber-50 cursor-pointer" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                                  <button onClick={() => deleteBancoNombre(b.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>

            {false && editingId === "new_banco" && (
              <div id="banco-form-card" className="bg-blue-50/30 border border-blue-100 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold text-blue-800">Agregar Información Bancaria</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre Banco *</label>
                    <select
                      value={bancoForm.nombre || ""}
                      onChange={e => setBancoForm({ ...bancoForm, nombre: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    >
                      {bancoNombres.map(b => (
                        <option key={b.id} value={b.nombre}>{b.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Número de Cuenta *</label>
                    <input
                      type="text"
                      placeholder="Ej: 65509270940"
                      value={bancoForm.cuenta || ""}
                      onChange={e => setBancoForm({ ...bancoForm, cuenta: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Clabe Interbancaria</label>
                    <input
                      type="text"
                      placeholder="Ej: 01493065509270940"
                      value={bancoForm.clabe || ""}
                      onChange={e => setBancoForm({ ...bancoForm, clabe: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 cursor-pointer">
                    Cancelar
                  </button>
                  <button onClick={saveBanco} className="px-3.5 py-1.5 bg-blue-600 text-white font-medium text-xs rounded-lg hover:bg-blue-700 cursor-pointer">
                    Guardar
                  </button>
                </div>
              </div>
            )}

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100 select-none">
                    <th className="p-3">Banco</th>
                    <th className="p-3">N° Cuenta</th>
                    <th className="p-3">Clabe</th>
                    <th className="p-3 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {catalogs.bancos.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50/40">
                      {editingId === b.id ? (
                        <>
                          <td className="p-2">
                            <select
                              value={bancoForm.nombre || ""}
                              onChange={e => setBancoForm({ ...bancoForm, nombre: e.target.value })}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                            >
                              {bancoNombres.map(bankName => (
                                <option key={bankName.id} value={bankName.nombre}>{bankName.nombre}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={bancoForm.cuenta || ""} 
                              onChange={e => setBancoForm({ ...bancoForm, cuenta: e.target.value })} 
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={bancoForm.clabe || ""} 
                              onChange={e => setBancoForm({ ...bancoForm, clabe: e.target.value })} 
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={saveBanco} className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 cursor-pointer"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 cursor-pointer"><X className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-semibold text-gray-800">{b.nombre}</td>
                          <td className="p-3 font-mono font-medium text-gray-600">{b.cuenta}</td>
                          <td className="p-3 font-mono text-gray-500">{b.clabe || "-"}</td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => startEditBanco(b)} className="p-1 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 cursor-pointer" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteBanco(b.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PROVEEDORES */}
        {activeTab === "proveedores" && (
          <div id="panel-proveedores" className="space-y-4">
            <div className="flex justify-between items-center bg-teal-50/50 p-4 rounded-lg border border-teal-100">
              <span className="text-xs text-teal-900 leading-relaxed max-w-lg">
                Administra los proveedores certificados del municipio. Al seleccionar un proveedor en el formulario, se cargará automáticamente su R.F.C.
              </span>
              {editingId !== "new_proveedor" && (
                <button
                  id="btn-add-proveedor"
                  onClick={startAddProveedor}
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Nuevo Proveedor
                </button>
              )}
            </div>

            {false && editingId === "new_proveedor" && (
              <div id="proveedor-form-card" className="bg-teal-50/30 border border-teal-100 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold text-teal-800">Agregar Proveedor</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre o Razón Social *</label>
                    <input
                      type="text"
                      placeholder="Ej: MULTISERVICIO LA PLATA S.A. DE C.V."
                      value={proveedorForm.nombre || ""}
                      onChange={e => setProveedorForm({ ...proveedorForm, nombre: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">R.F.C *</label>
                    <input
                      type="text"
                      placeholder="Ej: MPL020607CX5"
                      value={proveedorForm.rfc || ""}
                      onChange={e => setProveedorForm({ ...proveedorForm, rfc: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 cursor-pointer">
                    Cancelar
                  </button>
                  <button onClick={saveProveedor} className="px-3.5 py-1.5 bg-teal-600 text-white font-medium text-xs rounded-lg hover:bg-teal-700 cursor-pointer">
                    Guardar
                  </button>
                </div>
              </div>
            )}

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100 select-none">
                    <th className="p-3">Razón Social del Proveedor</th>
                    <th className="p-3 w-52">R.F.C.</th>
                    <th className="p-3 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {catalogs.proveedores.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/40">
                      {editingId === p.id ? (
                        <>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={proveedorForm.nombre || ""} 
                              onChange={e => setProveedorForm({ ...proveedorForm, nombre: e.target.value.toUpperCase() })} 
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={proveedorForm.rfc || ""} 
                              onChange={e => setProveedorForm({ ...proveedorForm, rfc: e.target.value.toUpperCase() })} 
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={saveProveedor} className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 cursor-pointer"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 cursor-pointer"><X className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-semibold text-gray-800">{p.nombre}</td>
                          <td className="p-3 font-mono font-bold text-teal-800">{p.rfc}</td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => startEditProveedor(p)} className="p-1 text-gray-400 hover:text-teal-600 rounded-md hover:bg-teal-50 cursor-pointer" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteProveedor(p.id)} className="p-1 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PRESUPUESTALES (Fuentes, Proyectos, Objetos) */}
        {activeTab === "presupuesto" && (
          <div id="panel-presupuesto" className="space-y-6">
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-start gap-3">
              <BookOpen className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-700 space-y-1">
                <p className="font-semibold text-slate-800">Catálogos de Clasificación del Gasto Público</p>
                <p>Las claves se estructuran jerárquicamente. Al agregar partidas en la CLC, ingresarás un O.C., y seleccionarás de forma rápida la Fuente, Proyecto y Objeto (Gasto) correspondientes.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* FUENTES */}
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-700">Fuentes de Financiamiento</h3>
                  {editingId !== "new_f" && (
                    <button onClick={() => { setEditingId("new_f"); setFuenteForm({ clave: "", descripcion: "" }); }} className="text-indigo-700 font-semibold hover:text-indigo-800 text-[11px] flex items-center gap-0.5 cursor-pointer">
                      <Plus className="h-3 w-3" /> Agregar
                    </button>
                  )}
                </div>

                {false && editingId === "new_f" && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-2 text-xs">
                    <input 
                      placeholder="Clave (ej: 111)" 
                      value={fuenteForm.clave || ""} 
                      onChange={e => setFuenteForm({ ...fuenteForm, clave: e.target.value })} 
                      className="w-full px-2 py-1 border border-gray-200 rounded-md"
                    />
                    <input 
                      placeholder="Descripción..." 
                      value={fuenteForm.descripcion || ""} 
                      onChange={e => setFuenteForm({ ...fuenteForm, descripcion: e.target.value.toUpperCase() })} 
                      className="w-full px-2 py-1 border border-gray-200 rounded-md"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setEditingId(null)} className="px-2 py-0.5 border border-gray-300 text-[10px] rounded hover:bg-gray-100 cursor-pointer">Cancelar</button>
                      <button onClick={saveFuente} className="px-2.5 py-0.5 bg-indigo-600 text-white font-medium text-[10px] rounded hover:bg-indigo-700 cursor-pointer">OK</button>
                    </div>
                  </div>
                )}

                <div className="border border-gray-100 rounded-lg overflow-y-auto max-h-60">
                  {catalogs.fuentes.map(item => (
                    <div key={item.id} className="p-2 border-b border-gray-50 flex justify-between items-center hover:bg-gray-50/50">
                      {editingId === item.id ? (
                        <>
                          <div className="grid grid-cols-3 gap-1.5 flex-1">
                            <input value={fuenteForm.clave || ""} onChange={e => setFuenteForm({ ...fuenteForm, clave: e.target.value })} className="text-[11px] border border-gray-200 rounded px-2 py-1" />
                            <input value={fuenteForm.descripcion || ""} onChange={e => setFuenteForm({ ...fuenteForm, descripcion: e.target.value.toUpperCase() })} className="col-span-2 text-[11px] border border-gray-200 rounded px-2 py-1" />
                          </div>
                          <div className="flex gap-1 ml-2">
                            <button onClick={saveFuente} className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded cursor-pointer"><Check className="h-3 w-3" /></button>
                            <button onClick={() => setEditingId(null)} className="text-rose-600 hover:bg-rose-50 p-0.5 rounded cursor-pointer"><X className="h-3 w-3" /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[11px]">
                            <span className="font-mono font-bold text-indigo-700 mr-2 bg-indigo-50 px-1 py-0.5 rounded">{item.clave}</span>
                            <span className="text-gray-700">{item.descripcion}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingId(item.id); setFuenteForm({ ...item }); }} className="text-gray-300 hover:text-indigo-600 p-0.5 cursor-pointer"><Edit2 className="h-3 w-3" /></button>
                            <button onClick={() => onChange({ ...catalogs, fuentes: catalogs.fuentes.filter(f => f.id !== item.id) })} className="text-gray-300 hover:text-rose-500 p-0.5 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* PROYECTOS */}
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-700">Proyectos / Programas</h3>
                  {editingId !== "new_pr" && (
                    <button onClick={() => { setEditingId("new_pr"); setProyectoForm({ clave: "", descripcion: "" }); }} className="text-indigo-700 font-semibold hover:text-indigo-800 text-[11px] flex items-center gap-0.5 cursor-pointer">
                      <Plus className="h-3 w-3" /> Agregar
                    </button>
                  )}
                </div>

                {false && editingId === "new_pr" && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-2 text-xs">
                    <input 
                      placeholder="Clave (ej: 304004)" 
                      value={proyectoForm.clave || ""} 
                      onChange={e => setProyectoForm({ ...proyectoForm, clave: e.target.value })} 
                      className="w-full px-2 py-1 border border-gray-200 rounded-md"
                    />
                    <input 
                      placeholder="Descripción del programa..." 
                      value={proyectoForm.descripcion || ""} 
                      onChange={e => setProyectoForm({ ...proyectoForm, descripcion: e.target.value.toUpperCase() })} 
                      className="w-full px-2 py-1 border border-gray-200 rounded-md"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setEditingId(null)} className="px-2 py-0.5 border border-gray-300 text-[10px] rounded hover:bg-gray-100 cursor-pointer">Cancelar</button>
                      <button onClick={saveProyecto} className="px-2.5 py-0.5 bg-indigo-600 text-white font-medium text-[10px] rounded hover:bg-indigo-700 cursor-pointer">OK</button>
                    </div>
                  </div>
                )}

                <div className="border border-gray-100 rounded-lg overflow-y-auto max-h-60">
                  {catalogs.proyectos.map(item => (
                    <div key={item.id} className="p-2 border-b border-gray-50 flex justify-between items-center hover:bg-gray-50/50">
                      {editingId === item.id ? (
                        <>
                          <div className="grid grid-cols-3 gap-1.5 flex-1">
                            <input value={proyectoForm.clave || ""} onChange={e => setProyectoForm({ ...proyectoForm, clave: e.target.value })} className="text-[11px] border border-gray-200 rounded px-2 py-1" />
                            <input value={proyectoForm.descripcion || ""} onChange={e => setProyectoForm({ ...proyectoForm, descripcion: e.target.value.toUpperCase() })} className="col-span-2 text-[11px] border border-gray-200 rounded px-2 py-1" />
                          </div>
                          <div className="flex gap-1 ml-2">
                            <button onClick={saveProyecto} className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded cursor-pointer"><Check className="h-3 w-3" /></button>
                            <button onClick={() => setEditingId(null)} className="text-rose-600 hover:bg-rose-50 p-0.5 rounded cursor-pointer"><X className="h-3 w-3" /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[11px]">
                            <span className="font-mono font-bold text-blue-700 mr-2 bg-blue-50 px-1 py-0.5 rounded">{item.clave}</span>
                            <span className="text-gray-700">{item.descripcion}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingId(item.id); setProyectoForm({ ...item }); }} className="text-gray-300 hover:text-blue-600 p-0.5 cursor-pointer"><Edit2 className="h-3 w-3" /></button>
                            <button onClick={() => onChange({ ...catalogs, proyectos: catalogs.proyectos.filter(p => p.id !== item.id) })} className="text-gray-300 hover:text-rose-500 p-0.5 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* OBJETOS DEL GASTO */}
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                  <h3 className="text-xs font-bold text-gray-700">Objetos del Gasto (Categorías)</h3>
                  {editingId !== "new_o" && (
                    <button onClick={() => { setEditingId("new_o"); setObjetoForm({ clave: "", nombre: "" }); }} className="text-indigo-700 font-semibold hover:text-indigo-800 text-[11px] flex items-center gap-0.5 cursor-pointer">
                      <Plus className="h-3 w-3" /> Agregar
                    </button>
                  )}
                </div>

                {false && editingId === "new_o" && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 space-y-2 text-xs">
                    <input 
                      placeholder="Clave (ej: 2611)" 
                      value={objetoForm.clave || ""} 
                      onChange={e => setObjetoForm({ ...objetoForm, clave: e.target.value })} 
                      className="w-full px-2 py-1 border border-gray-200 rounded-md"
                    />
                    <input 
                      placeholder="Nombre del bien o servicio..." 
                      value={objetoForm.nombre || ""} 
                      onChange={e => setObjetoForm({ ...objetoForm, nombre: e.target.value.toUpperCase() })} 
                      className="w-full px-2 py-1 border border-gray-200 rounded-md"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => setEditingId(null)} className="px-2 py-0.5 border border-gray-300 text-[10px] rounded hover:bg-gray-100 cursor-pointer">Cancelar</button>
                      <button onClick={saveObjeto} className="px-2.5 py-0.5 bg-indigo-600 text-white font-medium text-[10px] rounded hover:bg-indigo-700 cursor-pointer">OK</button>
                    </div>
                  </div>
                )}

                <div className="border border-gray-100 rounded-lg overflow-y-auto max-h-60">
                  {catalogs.objetos.map(item => (
                    <div key={item.id} className="p-2 border-b border-gray-50 flex justify-between items-center hover:bg-gray-50/50">
                      {editingId === item.id ? (
                        <>
                          <div className="grid grid-cols-3 gap-1.5 flex-1">
                            <input value={objetoForm.clave || ""} onChange={e => setObjetoForm({ ...objetoForm, clave: e.target.value })} className="text-[11px] border border-gray-200 rounded px-2 py-1" />
                            <input value={objetoForm.nombre || ""} onChange={e => setObjetoForm({ ...objetoForm, nombre: e.target.value.toUpperCase() })} className="col-span-2 text-[11px] border border-gray-200 rounded px-2 py-1" />
                          </div>
                          <div className="flex gap-1 ml-2">
                            <button onClick={saveObjeto} className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded cursor-pointer"><Check className="h-3 w-3" /></button>
                            <button onClick={() => setEditingId(null)} className="text-rose-600 hover:bg-rose-50 p-0.5 rounded cursor-pointer"><X className="h-3 w-3" /></button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-[11px]">
                            <span className="font-mono font-bold text-emerald-700 mr-2 bg-emerald-50 px-1 py-0.5 rounded">{item.clave}</span>
                            <strong className="text-emerald-900 border-b border-dashed border-emerald-300 mr-2">{item.nombre}</strong>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingId(item.id); setObjetoForm({ ...item }); }} className="text-gray-300 hover:text-emerald-600 p-0.5 cursor-pointer"><Edit2 className="h-3 w-3" /></button>
                            <button onClick={() => onChange({ ...catalogs, objetos: catalogs.objetos.filter(o => o.id !== item.id) })} className="text-gray-300 hover:text-rose-500 p-0.5 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: FIRMAS */}
        {activeTab === "firmas" && (
          <div id="panel-firmas" className="space-y-4">
            <div className="flex justify-between items-center bg-violet-50/50 p-4 rounded-lg border border-violet-100">
              <span className="text-xs text-violet-900 leading-relaxed max-w-lg">
                Agrega al personal firmante con sus puestos oficiales correspondientes. El sistema te permite seleccionarlos en el bloque final para la firma de Solicitud y Autorización de Tesorería y Sindicatura.
              </span>
              {editingId !== "new_firma" && (
                <button
                  id="btn-add-firma"
                  onClick={startAddFirma}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                >
                  <Plus className="h-4 w-4" /> Nuevo Firmante
                </button>
              )}
            </div>

            {false && editingId === "new_firma" && (
              <div id="firma-form-card" className="bg-violet-50/30 border border-violet-100 rounded-xl p-4 space-y-3">
                <h3 className="text-xs font-semibold text-violet-800">Cargar Firmante Autorizado</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      placeholder="Ej: L.C. JESÚS RODRÍGUEZ DEL MURO"
                      value={firmaForm.nombre || ""}
                      onChange={e => setFirmaForm({ ...firmaForm, nombre: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Puesto o Cargo *</label>
                    <input
                      type="text"
                      placeholder="Ej: SECRETARIO DE LA TESORERÍA Y FINANZAS"
                      value={firmaForm.puesto || ""}
                      onChange={e => setFirmaForm({ ...firmaForm, puesto: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo de Firma (Bloque)</label>
                    <select
                      value={firmaForm.tipo || "General"}
                      onChange={e => setFirmaForm({ ...firmaForm, tipo: e.target.value as any })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-violet-500 focus:outline-hidden"
                    >
                      <option value="Solicita">Solicita</option>
                      <option value="Autoriza 1">Autoriza (Módulo 1)</option>
                      <option value="Autoriza 2">Autoriza (Módulo 2)</option>
                      <option value="General">General / Libre</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-gray-50 cursor-pointer">
                    Cancelar
                  </button>
                  <button onClick={saveFirma} className="px-3.5 py-1.5 bg-violet-600 text-white font-medium text-xs rounded-lg hover:bg-violet-700 cursor-pointer">
                    Guardar
                  </button>
                </div>
              </div>
            )}

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100 select-none">
                    <th className="p-3">Nombre</th>
                    <th className="p-3">Puesto Autorizado</th>
                    <th className="p-3 w-40">Rol Predeterminado</th>
                    <th className="p-3 text-right w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {catalogs.firmas.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50/40">
                      {editingId === f.id ? (
                        <>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={firmaForm.nombre || ""} 
                              onChange={e => setFirmaForm({ ...firmaForm, nombre: e.target.value.toUpperCase() })} 
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="text" 
                              value={firmaForm.puesto || ""} 
                              onChange={e => setFirmaForm({ ...firmaForm, puesto: e.target.value.toUpperCase() })} 
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={firmaForm.tipo || "General"}
                              onChange={e => setFirmaForm({ ...firmaForm, tipo: e.target.value as any })}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                            >
                              <option value="Solicita">Solicita</option>
                              <option value="Autoriza 1">Autoriza 1</option>
                              <option value="Autoriza 2">Autoriza 2</option>
                              <option value="General">General</option>
                            </select>
                          </td>
                          <td className="p-2 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={saveFirma} className="p-1 bg-emerald-50 text-emerald-600 rounded-md hover:bg-emerald-100 cursor-pointer"><Check className="h-4 w-4" /></button>
                              <button onClick={() => setEditingId(null)} className="p-1 bg-rose-50 text-rose-600 rounded-md hover:bg-rose-100 cursor-pointer"><X className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 font-semibold text-gray-800">{f.nombre}</td>
                          <td className="p-3 text-gray-600 font-medium">{f.puesto}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              f.tipo === "Solicita" ? "bg-indigo-100 text-indigo-850" :
                              f.tipo === "Autoriza 1" ? "bg-blue-100 text-blue-800" :
                              f.tipo === "Autoriza 2" ? "bg-teal-100 text-teal-800" :
                              "bg-gray-100 text-gray-700"
                            }`}>
                              {f.tipo}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => startEditFirma(f)} className="p-1 text-gray-400 hover:text-violet-600 rounded-md hover:bg-violet-50 cursor-pointer" title="Editar"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => onChange({ ...catalogs, firmas: catalogs.firmas.filter(item => item.id !== f.id) })} className="p-1 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer" title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isNewRecord(editingId) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setEditingId(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 bg-[#f9fafb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-850">{getNewRecordTitle()}</h3>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {editingId === "new_unidad" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Clave de Unidad *</label>
                    <input
                      type="text"
                      placeholder="Ej: 530"
                      value={unidadForm.clave || ""}
                      onChange={e => setUnidadForm({ ...unidadForm, clave: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      value={unidadForm.nombre || ""}
                      onChange={e => setUnidadForm({ ...unidadForm, nombre: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {editingId === "new_banco_nombre" && (
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre del Banco *</label>
                  <input
                    type="text"
                    placeholder="Ej: SANTANDER"
                    value={bancoNombreForm.nombre || ""}
                    onChange={e => setBancoNombreForm({ ...bancoNombreForm, nombre: e.target.value.toUpperCase() })}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-hidden"
                  />
                </div>
              )}

              {editingId === "new_banco" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre Banco *</label>
                    <select
                      value={bancoForm.nombre || ""}
                      onChange={e => setBancoForm({ ...bancoForm, nombre: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    >
                      {bancoNombres.map(b => (
                        <option key={b.id} value={b.nombre}>{b.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Numero de Cuenta *</label>
                    <input
                      type="text"
                      placeholder="Ej: 65509270940"
                      value={bancoForm.cuenta || ""}
                      onChange={e => setBancoForm({ ...bancoForm, cuenta: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Clabe Interbancaria</label>
                    <input
                      type="text"
                      placeholder="Ej: 01493065509270940"
                      value={bancoForm.clabe || ""}
                      onChange={e => setBancoForm({ ...bancoForm, clabe: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {editingId === "new_proveedor" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre o Razon Social *</label>
                    <input
                      type="text"
                      placeholder="Ej: MULTISERVICIO LA PLATA S.A. DE C.V."
                      value={proveedorForm.nombre || ""}
                      onChange={e => setProveedorForm({ ...proveedorForm, nombre: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">R.F.C *</label>
                    <input
                      type="text"
                      placeholder="Ej: MPL020607CX5"
                      value={proveedorForm.rfc || ""}
                      onChange={e => setProveedorForm({ ...proveedorForm, rfc: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {editingId === "new_firma" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      value={firmaForm.nombre || ""}
                      onChange={e => setFirmaForm({ ...firmaForm, nombre: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Puesto o Cargo *</label>
                    <input
                      type="text"
                      value={firmaForm.puesto || ""}
                      onChange={e => setFirmaForm({ ...firmaForm, puesto: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Tipo de Firma</label>
                    <select
                      value={firmaForm.tipo || "General"}
                      onChange={e => setFirmaForm({ ...firmaForm, tipo: e.target.value as any })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-1 focus:ring-violet-500 focus:outline-hidden"
                    >
                      <option value="Solicita">Solicita</option>
                      <option value="Autoriza 1">Autoriza 1</option>
                      <option value="Autoriza 2">Autoriza 2</option>
                      <option value="General">General</option>
                    </select>
                  </div>
                </div>
              )}

              {editingId === "new_f" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Clave *</label>
                    <input
                      placeholder="Ej: 111"
                      value={fuenteForm.clave || ""}
                      onChange={e => setFuenteForm({ ...fuenteForm, clave: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Descripcion *</label>
                    <input
                      value={fuenteForm.descripcion || ""}
                      onChange={e => setFuenteForm({ ...fuenteForm, descripcion: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {editingId === "new_pr" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Clave *</label>
                    <input
                      placeholder="Ej: 304004"
                      value={proyectoForm.clave || ""}
                      onChange={e => setProyectoForm({ ...proyectoForm, clave: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Descripcion *</label>
                    <input
                      value={proyectoForm.descripcion || ""}
                      onChange={e => setProyectoForm({ ...proyectoForm, descripcion: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              {editingId === "new_o" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Clave *</label>
                    <input
                      placeholder="Ej: 2611"
                      value={objetoForm.clave || ""}
                      onChange={e => setObjetoForm({ ...objetoForm, clave: e.target.value })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-medium text-gray-500 mb-1">Nombre *</label>
                    <input
                      value={objetoForm.nombre || ""}
                      onChange={e => setObjetoForm({ ...objetoForm, nombre: e.target.value.toUpperCase() })}
                      className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 border border-gray-200 text-gray-500 text-xs rounded-lg hover:bg-white cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveNewRecord}
                className="px-3.5 py-1.5 bg-slate-900 text-white font-medium text-xs rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





