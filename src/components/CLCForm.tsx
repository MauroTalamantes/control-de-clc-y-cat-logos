/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { 
  AppCatalogs, 
  CLCDocument, 
  CLCItem, 
  AdministrativeUnit, 
  Bank, 
  Provider 
} from "../types";
import { Plus, Trash, Check, AlertTriangle, Calculator, FileText, ChevronRight, ChevronDown } from "lucide-react";

interface CLCFormProps {
  catalogs: AppCatalogs;
  onSave: (doc: CLCDocument, finalize: boolean) => void | Promise<void>;
  onCatalogsChange: (updated: AppCatalogs) => void | Promise<AppCatalogs>;
  onCancel: () => void;
  documentToEdit?: CLCDocument | null;
}

const FORM_AUTOSAVE_KEY = "clc_form_autosave";

interface SavedCLCFormDraft {
  anio: number;
  selectedUnidadId: string;
  selectedBancoId: string;
  bancoCuenta: string;
  bancoClabe: string;
  selectedProveedorId: string;
  proveedorRfc: string;
  customProveedorNombre: string;
  customBancoNombre: string;
  items: CLCItem[];
  concepto: string;
  selectedSolicitaId: string;
  selectedAutoriza1Id: string;
  selectedAutoriza2Id: string;
  autoIva: boolean;
}

interface BudgetPickerOption {
  id: string;
  value: string;
  label: string;
  searchText: string;
}

export default function CLCForm({ catalogs, onSave, onCatalogsChange, onCancel, documentToEdit }: CLCFormProps) {
  // Setup standard state
  const [año, setAño] = useState<number>(2026);
  const [selectedUnidadId, setSelectedUnidadId] = useState<string>("");
  const [selectedBancoId, setSelectedBancoId] = useState<string>("");
  const [bancoCuenta, setBancoCuenta] = useState<string>("");
  const [bancoClabe, setBancoClabe] = useState<string>("");
  
  const [selectedProveedorId, setSelectedProveedorId] = useState<string>("");
  const [proveedorRfc, setProveedorRfc] = useState<string>("");
  
  const [customProveedorNombre, setCustomProveedorNombre] = useState<string>("");
  const [customBancoNombre, setCustomBancoNombre] = useState<string>("");
  
  const [items, setItems] = useState<CLCItem[]>([]);
  const [concepto, setConcepto] = useState<string>("");
  
  const [selectedSolicitaId, setSelectedSolicitaId] = useState<string>("");
  const [selectedAutoriza1Id, setSelectedAutoriza1Id] = useState<string>("");
  const [selectedAutoriza2Id, setSelectedAutoriza2Id] = useState<string>("");
  
  const [autoIva, setAutoIva] = useState<boolean>(true);
  const [fuenteSearch, setFuenteSearch] = useState<Record<string, string>>({});
  const [proyectoSearch, setProyectoSearch] = useState<Record<string, string>>({});
  const [objetoSearch, setObjetoSearch] = useState<Record<string, string>>({});
  const [openBudgetPicker, setOpenBudgetPicker] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initializedNewFormRef = useRef(false);

  useEffect(() => {
    if (!openBudgetPicker) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-budget-picker]")) return;
      setOpenBudgetPicker(null);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openBudgetPicker]);

  const normalizeSearch = (value: string) => {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const matchesSearch = (query: string, ...values: string[]) => {
    const normalizedQuery = normalizeSearch(query.trim());
    if (!normalizedQuery) return true;
    return values.some(value => normalizeSearch(value).includes(normalizedQuery));
  };

  const parseCurrency = (value: string) => {
    return parseFloat(value.replace(/,/g, "")) || 0;
  };

  const formatCurrencyInput = (value: number) => {
    if (!value) return "";
    return value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  const normalizeCatalogText = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

  const createCatalogId = (prefix: string) => `${prefix}_${Math.random().toString(36).substr(2, 9)}`;

  const getDefaultBanco = () => catalogs.bancos[0] || null;

  const restoreBankDraft = (draft: SavedCLCFormDraft) => {
    if (draft.selectedBancoId === "custom") {
      setSelectedBancoId("custom");
      setCustomBancoNombre(draft.customBancoNombre || "");
      setBancoCuenta(draft.bancoCuenta || "");
      setBancoClabe(draft.bancoClabe || "");
      return;
    }

    const selectedBank = catalogs.bancos.find(b => b.id === draft.selectedBancoId) || getDefaultBanco();
    setSelectedBancoId(selectedBank?.id || "");
    setCustomBancoNombre("");
    setBancoCuenta(selectedBank?.cuenta || "");
    setBancoClabe(selectedBank?.clabe || "");
  };

  const restoreProviderDraft = (draft: SavedCLCFormDraft) => {
    if (draft.selectedProveedorId === "custom") {
      setSelectedProveedorId("custom");
      setCustomProveedorNombre(draft.customProveedorNombre || "");
      setProveedorRfc(draft.proveedorRfc || "");
      return;
    }

    const selectedProvider = catalogs.proveedores.find(p => p.id === draft.selectedProveedorId);
    setSelectedProveedorId(selectedProvider?.id || "");
    setCustomProveedorNombre("");
    setProveedorRfc(selectedProvider?.rfc || "");
  };

  const withManualCatalogRecords = (bancoNombre: string, proveedorNombre: string): AppCatalogs | null => {
    let nextCatalogs = catalogs;
    let changed = false;

    if (selectedBancoId === "custom") {
      const normalizedBankName = normalizeCatalogText(bancoNombre);
      const normalizedCuenta = bancoCuenta.trim();
      const normalizedClabe = bancoClabe.trim();
      const bancoNombres = nextCatalogs.bancoNombres || [];
      const bankNameExists = bancoNombres.some(b => normalizeCatalogText(b.nombre) === normalizedBankName);
      const bankAccountExists = nextCatalogs.bancos.some(b => {
        const sameClabe = normalizedClabe && b.clabe.trim() === normalizedClabe;
        const sameAccount = normalizeCatalogText(b.nombre) === normalizedBankName && b.cuenta.trim() === normalizedCuenta;
        return sameClabe || sameAccount;
      });

      if (!bankNameExists || !bankAccountExists) {
        nextCatalogs = {
          ...nextCatalogs,
          bancoNombres: bankNameExists
            ? bancoNombres
            : [...bancoNombres, { id: createCatalogId("bn"), nombre: normalizedBankName }],
          bancos: bankAccountExists
            ? nextCatalogs.bancos
            : [
                ...nextCatalogs.bancos,
                {
                  id: createCatalogId("b"),
                  nombre: normalizedBankName,
                  cuenta: normalizedCuenta,
                  clabe: normalizedClabe
                }
              ]
        };
        changed = true;
      }
    }

    if (selectedProveedorId === "custom") {
      const normalizedProviderName = normalizeCatalogText(proveedorNombre);
      const normalizedRfc = normalizeCatalogText(proveedorRfc);
      const providerExists = nextCatalogs.proveedores.some(p => (
        normalizeCatalogText(p.rfc) === normalizedRfc ||
        normalizeCatalogText(p.nombre) === normalizedProviderName
      ));

      if (!providerExists) {
        const newProvider: Provider = {
          id: createCatalogId("p"),
          nombre: normalizedProviderName,
          rfc: normalizedRfc
        };
        nextCatalogs = {
          ...nextCatalogs,
          proveedores: [...nextCatalogs.proveedores, newProvider]
        };
        changed = true;
      }
    }

    return changed ? nextCatalogs : null;
  };

  // Initialize form
  useEffect(() => {
    if (documentToEdit) {
      initializedNewFormRef.current = false;
      setAño(documentToEdit.año);
      
      const matchedUnidad = catalogs.unidades.find(u => u.clave === documentToEdit.unidadClave);
      setSelectedUnidadId(matchedUnidad ? matchedUnidad.id : "");
      
      const matchedBanco = catalogs.bancos.find(b => b.nombre === documentToEdit.bancoNombre);
      setSelectedBancoId(matchedBanco ? matchedBanco.id : "custom");
      setCustomBancoNombre(matchedBanco ? "" : documentToEdit.bancoNombre);
      setBancoCuenta(documentToEdit.bancoCuenta);
      setBancoClabe(documentToEdit.bancoClabe);
      
      const matchedProveedor = catalogs.proveedores.find(p => p.nombre === documentToEdit.proveedorNombre);
      setSelectedProveedorId(matchedProveedor ? matchedProveedor.id : "custom");
      setCustomProveedorNombre(matchedProveedor ? "" : documentToEdit.proveedorNombre);
      setProveedorRfc(documentToEdit.proveedorRfc);
      
      setItems(documentToEdit.items);
      setConcepto(documentToEdit.concepto);
      
      const matchedSolicita = catalogs.firmas.find(f => f.nombre === documentToEdit.solicitaNombre);
      setSelectedSolicitaId(matchedSolicita ? matchedSolicita.id : "");
      
      const matchedAutoriza1 = catalogs.firmas.find(f => f.nombre === documentToEdit.autoriza1Nombre);
      setSelectedAutoriza1Id(matchedAutoriza1 ? matchedAutoriza1.id : "");
      
      const matchedAutoriza2 = catalogs.firmas.find(f => f.nombre === documentToEdit.autoriza2Nombre);
      setSelectedAutoriza2Id(matchedAutoriza2 ? matchedAutoriza2.id : "");
    } else {
      if (initializedNewFormRef.current) return;
      initializedNewFormRef.current = true;

      const savedDraft = localStorage.getItem(FORM_AUTOSAVE_KEY);
      if (savedDraft) {
        try {
          const draft = JSON.parse(savedDraft) as SavedCLCFormDraft;
          const shouldContinue = window.confirm("Dejaste una Cuenta por Liquidar Certificada a medias. ¿Quieres continuar con esa captura?");
          if (shouldContinue) {
            setAño(draft.anio || 2026);
            const selectedUnit = catalogs.unidades.find(u => u.id === draft.selectedUnidadId);
            setSelectedUnidadId(selectedUnit?.id || catalogs.defaultUnidadId || catalogs.unidades[0]?.id || "");
            restoreBankDraft(draft);
            restoreProviderDraft(draft);
            setItems(draft.items?.length ? draft.items : [createEmptyItem()]);
            setConcepto(draft.concepto || "");
            setSelectedSolicitaId(draft.selectedSolicitaId || "");
            setSelectedAutoriza1Id(draft.selectedAutoriza1Id || "");
            setSelectedAutoriza2Id(draft.selectedAutoriza2Id || "");
            setAutoIva(draft.autoIva ?? true);
            return;
          }
        } catch (err) {
          console.error("Error restoring CLC form autosave", err);
        }
        localStorage.removeItem(FORM_AUTOSAVE_KEY);
      }

      if (catalogs.unidades.length > 0) {
        setSelectedUnidadId(catalogs.defaultUnidadId || catalogs.unidades[0].id);
      }
      setSelectedBancoId("");
      setBancoCuenta("");
      setBancoClabe("");
      setSelectedProveedorId("");
      setProveedorRfc("");
      setCustomProveedorNombre("");
      setCustomBancoNombre("");
      
      const solic = catalogs.firmas.find(f => f.tipo === "Solicita");
      if (solic) setSelectedSolicitaId(solic.id);
      
      const aut1 = catalogs.firmas.find(f => f.tipo === "Autoriza 1");
      if (aut1) setSelectedAutoriza1Id(aut1.id);
      
      const aut2 = catalogs.firmas.find(f => f.tipo === "Autoriza 2");
      if (aut2) setSelectedAutoriza2Id(aut2.id);
      
      setAño(2026);
      setConcepto("");
      setItems([createEmptyItem()]);
    }
  }, [documentToEdit, catalogs]);

  useEffect(() => {
    if (documentToEdit || !initializedNewFormRef.current) return;

    const hasMeaningfulDraft =
      concepto.trim() !== "" ||
      selectedProveedorId !== "" ||
      proveedorRfc.trim() !== "" ||
      customProveedorNombre.trim() !== "" ||
      (
        selectedBancoId === "custom" &&
        (
          customBancoNombre.trim() !== "" ||
          bancoCuenta.trim() !== "" ||
          bancoClabe.trim() !== ""
        )
      ) ||
      items.some(item =>
        item.numFactura.trim() !== "" ||
        item.oc.trim() !== "" ||
        item.subTotal > 0 ||
        item.descuento > 0 ||
        item.iva > 0 ||
        item.isr > 0
      );

    if (!hasMeaningfulDraft) {
      localStorage.removeItem(FORM_AUTOSAVE_KEY);
      return;
    }

    const draft: SavedCLCFormDraft = {
      anio: año,
      selectedUnidadId,
      selectedBancoId,
      bancoCuenta,
      bancoClabe,
      selectedProveedorId,
      proveedorRfc,
      customProveedorNombre,
      customBancoNombre,
      items,
      concepto,
      selectedSolicitaId,
      selectedAutoriza1Id,
      selectedAutoriza2Id,
      autoIva,
    };

    localStorage.setItem(FORM_AUTOSAVE_KEY, JSON.stringify(draft));
  }, [
    documentToEdit,
    año,
    selectedUnidadId,
    selectedBancoId,
    bancoCuenta,
    bancoClabe,
    selectedProveedorId,
    proveedorRfc,
    customProveedorNombre,
    customBancoNombre,
    items,
    concepto,
    selectedSolicitaId,
    selectedAutoriza1Id,
    selectedAutoriza2Id,
    autoIva,
  ]);

  // Handle autocompletes
  const handleUnidadChange = (id: string) => {
    setSelectedUnidadId(id);
  };

  const handleBancoChange = (id: string) => {
    setSelectedBancoId(id);
    setCustomBancoNombre("");
    if (!id || id === "custom") {
      setBancoCuenta("");
      setBancoClabe("");
    } else {
      const b = catalogs.bancos.find(b => b.id === id);
      if (b) {
        setBancoCuenta(b.cuenta);
        setBancoClabe(b.clabe);
      }
    }
  };

  const handleProveedorChange = (id: string) => {
    setSelectedProveedorId(id);
    setCustomProveedorNombre("");
    if (id === "custom") {
      setProveedorRfc("");
    } else {
      const p = catalogs.proveedores.find(p => p.id === id);
      if (p) {
        setProveedorRfc(p.rfc);
      }
    }
  };

  // Item mechanics
  function createEmptyItem(): CLCItem {
    return {
      id: "item_" + Math.random().toString(36).substr(2, 9),
      oc: "",
      fuenteClave: "",
      proyectoClave: "",
      objetoClave: "",
      objetoNombre: "",
      numFactura: "",
      fechaFactura: "",
      subTotal: 0,
      descuento: 0,
      iva: 0,
      isr: 0,
      importe: 0
    };
  }

  const addItemRow = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter(it => it.id !== id));
  };

  const updateItem = (itemId: string, field: keyof CLCItem, value: any) => {
    setItems(prevItems => prevItems.map(item => {
      if (item.id === itemId) {
        const updated = { ...item, [field]: value };

        if (field === "objetoClave") {
          const matchedO = catalogs.objetos.find(o => o.clave === value);
          if (matchedO) {
            updated.objetoNombre = matchedO.nombre;
          }
        }

        let subT = updated.subTotal;
        let desc = updated.descuento;
        let iva = updated.iva;
        let isr = updated.isr;

        if (field === "subTotal" || field === "descuento" || field === "iva" || field === "isr" || autoIva) {
          if (autoIva && (field === "subTotal" || field === "descuento")) {
            iva = Math.round((subT - desc) * 0.16 * 100) / 100;
            updated.iva = iva < 0 ? 0 : iva;
          }
          updated.importe = Math.round((subT - desc + iva - isr) * 100) / 100;
        }

        return updated;
      }
      return item;
    }));
  };

  // Re-calculate all items on autoIva change
  useEffect(() => {
    setItems(prevItems => prevItems.map(item => {
      const subT = item.subTotal;
      const desc = item.descuento;
      let iva = item.iva;
      const isr = item.isr;
      
      if (autoIva) {
        iva = Math.round((subT - desc) * 0.16 * 100) / 100;
        iva = iva < 0 ? 0 : iva;
      }
      const importe = Math.round((subT - desc + iva - isr) * 100) / 100;
      
      return { ...item, iva, importe };
    }));
  }, [autoIva]);

  // Aggregate Totals
  const sumSubtotal = items.reduce((sum, i) => sum + i.subTotal, 0);
  const sumDescuento = items.reduce((sum, i) => sum + i.descuento, 0);
  const sumIva = items.reduce((sum, i) => sum + i.iva, 0);
  const sumIsr = items.reduce((sum, i) => sum + i.isr, 0);
  const sumImporte = items.reduce((sum, i) => sum + i.importe, 0);

  // Auto fill concept if empty based on first invoice date
  useEffect(() => {
    if (!documentToEdit && concepto === "" && items.length > 0 && items[0].fechaFactura) {
      try {
        const dateParts = items[0].fechaFactura.split("-");
        if (dateParts.length === 3) {
          const mNum = parseInt(dateParts[1], 10);
          const yNum = dateParts[0];
          const months = [
            "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
            "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
          ];
          const monthName = months[mNum - 1] || "";
          setConcepto(`ADQUISICIÓN DE COMPRAS Y SERVICIOS COMPLEMENTARIOS DEL MES DE ${monthName} DEL ${yNum}`);
        }
      } catch (err) {
        console.error("Error evaluating concept name auto-fill", err);
      }
    }
  }, [items, documentToEdit]);

  // Handle submit logic
  const handleSubmit = async (finalize: boolean) => {
    if (isSubmitting) return;

    const unidadeObj = catalogs.unidades.find(u => u.id === selectedUnidadId);
    if (!unidadeObj) {
      alert("Error: Selecciona una Unidad Administrativa válida.");
      return;
    }

    let provNom = "";
    if (selectedProveedorId === "custom") {
      provNom = customProveedorNombre.trim();
    } else {
      const p = catalogs.proveedores.find(p => p.id === selectedProveedorId);
      if (p) provNom = p.nombre;
    }

    if (!provNom) {
      alert("Error: El campo del Proveedor es obligatorio.");
      return;
    }

    if (!proveedorRfc.trim()) {
      alert("Error: El R.F.C. del Proveedor es obligatorio.");
      return;
    }

    let bancoNom = "";
    if (selectedBancoId === "custom") {
      bancoNom = customBancoNombre.trim();
    } else {
      const b = catalogs.bancos.find(b => b.id === selectedBancoId);
      if (b) bancoNom = b.nombre;
    }

    if (!bancoNom) {
      alert("Error: El nombre del Banco es obligatorio.");
      return;
    }

    if (!bancoCuenta.trim()) {
      alert("Error: El Número de Cuenta bancaria es obligatorio.");
      return;
    }

    if (!bancoClabe.trim()) {
      alert("Error: La CLABE Interbancaria es obligatoria.");
      return;
    }

    const validItems = items.filter(it => it.numFactura.trim() !== "" || it.subTotal > 0);
    if (validItems.length === 0) {
      alert("Error: Debe registrar al menos una Factura válida con número y subtotal.");
      return;
    }

    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      if (!item.numFactura.trim()) {
        alert(`Error en Factura #${i + 1}: El número de factura (UUID / Folio) es obligatorio.`);
        return;
      }
      if (item.subTotal <= 0) {
        alert(`Error en Factura #${i + 1}: El subtotal debe ser un número positivo mayor que cero.`);
        return;
      }
      if (item.descuento < 0) {
        alert(`Error en Factura #${i + 1}: El descuento no puede ser un número negativo.`);
        return;
      }
      if (item.iva < 0) {
        alert(`Error en Factura #${i + 1}: El I.V.A. no puede ser un número negativo.`);
        return;
      }
      if (item.isr < 0) {
        alert(`Error en Factura #${i + 1}: La retención de I.S.R. no puede ser un número negativo.`);
        return;
      }
      if (item.importe <= 0) {
        alert(`Error en Factura #${i + 1}: El importe final calculado de la factura debe ser mayor que cero.`);
        return;
      }
    }

    const solObj = catalogs.firmas.find(f => f.id === selectedSolicitaId);
    const aut1Obj = catalogs.firmas.find(f => f.id === selectedAutoriza1Id);
    const aut2Obj = catalogs.firmas.find(f => f.id === selectedAutoriza2Id);

    const doc: CLCDocument = {
      id: documentToEdit?.id || "doc_" + Math.random().toString(36).substr(2, 9),
      folio: documentToEdit?.folio || "", 
      año: año,
      unidadAdministrativaId: unidadeObj.id,
      unidadClave: unidadeObj.clave,
      unidadNombre: unidadeObj.nombre,
      bancoNombre: bancoNom,
      bancoCuenta: bancoCuenta,
      bancoClabe: bancoClabe,
      proveedorNombre: provNom,
      proveedorRfc: proveedorRfc.toUpperCase(),
      items: validItems,
      concepto: concepto.trim() || "ADQUISICIÓN DE INSUMOS MUNICIPALES",
      solicitaNombre: solObj ? solObj.nombre : "ING. JOSE ANTONIO FLORES BERUMEN",
      solicitaPuesto: solObj ? solObj.puesto : "SECRETARIO DE SERVICIOS PUBLICOS MUNICIPALES",
      autoriza1Nombre: aut1Obj ? aut1Obj.nombre : "L.C. JESÚS RODRÍGUEZ DEL MURO",
      autoriza1Puesto: aut1Obj ? aut1Obj.puesto : "SECRETARIO DE LA TESORERÍA Y FINANZAS",
      autoriza2Nombre: aut2Obj ? aut2Obj.nombre : "LIC. ANALÍ INFANTE MORALES",
      autoriza2Puesto: aut2Obj ? aut2Obj.puesto : "SINDICO MUNICIPAL",
      elaboro: unidadeObj.elaboro || "SERVICIOS PUBLICOS MUNICIPALES",
      fechaCreacion: documentToEdit ? documentToEdit.fechaCreacion : new Date().toISOString(),
      estado: finalize ? "finalizado" : "borrador"
    };

    const updatedCatalogs = withManualCatalogRecords(bancoNom, provNom);

    setIsSubmitting(true);
    try {
      if (updatedCatalogs) {
        await onCatalogsChange(updatedCatalogs);
      }
      localStorage.removeItem(FORM_AUTOSAVE_KEY);
      await onSave(doc, finalize);
    } catch (error) {
      console.error("Error saving CLC with related catalogs", error);
      alert("No se pudo guardar la CLC con el banco o proveedor en la base de datos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBudgetPicker = (
    item: CLCItem,
    pickerType: string,
    label: string,
    value: string,
    options: BudgetPickerOption[],
    searchState: Record<string, string>,
    setSearchState: typeof setFuenteSearch,
    onSelect: (value: string) => void,
    color: "indigo" | "emerald" = "indigo"
  ) => {
    const pickerId = `${item.id}-${pickerType}`;
    const query = searchState[item.id] || "";
    const filteredOptions = options.filter(option => matchesSearch(query, option.value, option.label, option.searchText));
    const selectedOption = options.find(option => option.value === value);
    const isOpen = openBudgetPicker === pickerId;
    const buttonColorClass = color === "emerald"
      ? "focus:ring-emerald-500 text-emerald-850"
      : "focus:ring-indigo-500 text-slate-800";

    return (
      <div className="relative" data-budget-picker>
        <label className="block text-[11px] font-bold text-slate-600 mb-1">
          {label}
        </label>
        <button
          type="button"
          onClick={() => setOpenBudgetPicker(isOpen ? null : pickerId)}
          className={`w-full min-h-9 text-left text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-2 bg-white flex items-center justify-between gap-2 focus:ring-1 focus:outline-hidden ${buttonColorClass}`}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : "Selecciona una opción..."}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
        {isOpen && (
          <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl p-2">
            <input
              type="text"
              autoFocus
              placeholder="Filtrar por clave o texto..."
              value={query}
              onChange={e => setSearchState(prev => ({ ...prev, [item.id]: e.target.value }))}
              className="w-full text-[11px] border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
            />
            <div className="mt-1.5 max-h-48 overflow-y-auto space-y-0.5">
              {filteredOptions.length > 0 ? (
                filteredOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSelect(option.value);
                      setOpenBudgetPicker(null);
                    }}
                    className={`w-full text-left text-[11px] rounded-md px-2.5 py-1.5 transition-colors ${
                      option.value === value
                        ? "bg-indigo-50 text-indigo-900 font-black"
                        : "text-slate-700 hover:bg-slate-100 font-semibold"
                    }`}
                  >
                    {option.label}
                  </button>
                ))
              ) : (
                <div className="text-[11px] text-slate-400 px-2 py-2 font-semibold">
                  Sin coincidencias
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div id="clc-form-container" className="bg-white rounded-xl shadow-xs border border-gray-150 overflow-hidden">
      
      {/* Form header */}
      <div className="bg-gradient-to-r from-indigo-800 via-slate-900 to-indigo-950 text-white p-5-6 py-6 border-b border-indigo-950 select-none">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2.5 rounded-xl border border-white/10 shadow-3xs">
              <FileText className="h-6 w-6 text-indigo-50" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {documentToEdit ? `Modificando Registro: ${documentToEdit.folio || "Borrador"}` : "Nueva Cuenta por Liquidar Certificada"}
              </h2>
              <p className="text-xs text-indigo-200 mt-0.5 font-medium leading-normal">
                Rellena la información de asignación presupuestal y montos. El folio se asignará de forma automatica al guardar.
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-200">
              Ejercicio presupuestal
            </label>
            <select
              value={año}
              onChange={e => setAño(parseInt(e.target.value, 10))}
              className="bg-white border border-indigo-200 rounded-xl px-4 py-2 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500/30 focus:outline-hidden cursor-pointer shadow-sm min-w-48"
            >
              <option value={2026}>Ejercicio presupuestal 2026</option>
              <option value={2027}>Ejercicio presupuestal 2027</option>
              <option value={2025}>Ejercicio presupuestal 2025</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Forms Layout with numbered step blocks */}
      <div className="p-6 md:p-8 space-y-8">
        
        {/* STEP 1 COGNITIVE BLOCK */}
        <div className="bg-slate-50/40 p-5 md:p-6 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 select-none">
            <span className="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[11px] font-black rounded-full">
              1
            </span>
            <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
              Unidad Solicitante e Información de Destino de Pago
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Unidad dropdown */}
            <div className="lg:col-span-5">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Unidad Administrativa Responsable</label>
              <select
                id="field-unidad"
                value={selectedUnidadId}
                onChange={e => handleUnidadChange(e.target.value)}
                className="w-full text-xs font-bold border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-indigo-950 select-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-hidden"
              >
                {catalogs.unidades.map(u => (
                  <option key={u.id} value={u.id}>({u.clave}) - {u.nombre}</option>
                ))}
              </select>
              

            </div>

            {/* Banco dropdown and inputs */}
            <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Institución Bancaria</label>
                <select
                  id="field-banco"
                  value={selectedBancoId}
                  onChange={e => handleBancoChange(e.target.value)}
                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-850 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                >
                  <option value="">Selecciona institución bancaria...</option>
                  {catalogs.bancos.map(b => (
                    <option key={b.id} value={b.id}>{b.nombre}</option>
                  ))}
                  <option value="custom" className="text-indigo-600 font-bold">-- REGISTRAR OTRO BANCO --</option>
                </select>
                {selectedBancoId === "custom" && (
                  <input
                    type="text"
                    placeholder="Escribe el nombre del banco..."
                    value={customBancoNombre}
                    onChange={e => setCustomBancoNombre(e.target.value.toUpperCase())}
                    className="mt-1.5 w-full text-xs border border-slate-350 rounded-lg px-2.5 py-2 bg-amber-50 text-slate-800 font-bold placeholder:text-amber-700/55 focus:outline-hidden"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Número de Cuenta</label>
                <input
                  type="text"
                  placeholder="Ej: 65509270940"
                  value={bancoCuenta}
                  onChange={e => setBancoCuenta(e.target.value)}
                  className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">CLABE Interbancaria (18 d.)</label>
                <input
                  type="text"
                  placeholder="Ej: 01493065509270940"
                  value={bancoClabe}
                  onChange={e => setBancoClabe(e.target.value)}
                  className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-800 truncate"
                />
              </div>
            </div>
          </div>
        </div>

        {/* STEP 2 COGNITIVE BLOCK */}
        <div className="bg-slate-50/40 p-5 md:p-6 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 select-none">
            <span className="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[11px] font-black rounded-full">
              2
            </span>
            <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
              Información de Identidad de la Entidad Beneficiaria (Proveedor)
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8">
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Socio Comercial / Proveedor Oficial Autorizado</label>
              <select
                id="field-proveedor"
                value={selectedProveedorId}
                onChange={e => handleProveedorChange(e.target.value)}
              className="w-full text-xs font-extrabold border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-850 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="">Selecciona proveedor...</option>
                {catalogs.proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
                <option value="custom" className="text-indigo-600 font-bold">-- REGISTRAR PROVEEDOR NO RECURRENT (Manual) --</option>
              </select>
              {selectedProveedorId === "custom" && (
                <input
                  type="text"
                  placeholder="Completo nombre o Razón Social del Proveedor..."
                  value={customProveedorNombre}
                  onChange={e => setCustomProveedorNombre(e.target.value.toUpperCase())}
                  className="mt-1.5 w-full text-xs border border-slate-350 rounded-lg px-2.5 py-2.5 bg-amber-50 text-slate-800 font-bold placeholder:text-amber-700/55 focus:outline-hidden"
                />
              )}
            </div>

            <div className="lg:col-span-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">R.F.C. (Cédula Fiscal Beneficiario)</label>
              <input
                type="text"
                placeholder="Ej: MPL020607CX5"
                value={proveedorRfc}
                onChange={e => setProveedorRfc(e.target.value.toUpperCase())}
                className="w-full text-xs font-extrabold font-mono border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-indigo-950 uppercase"
              />
              <span className="text-[10px] text-slate-400 block pl-1 mt-1 font-semibold selection:bg-slate-200">
                Por favor, verifique homoclave para reportes SAT oficiales.
              </span>
            </div>
          </div>
        </div>

        {/* STEP 3 COGNITIVE BLOCK: BEAUTIFUL CARDS INPUT (REPLACING CRAP TABLE!) */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-200 select-none">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[11px] font-black rounded-full">
                3
              </span>
              <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
                Desglose Detallado de Facturas y Clasificación Presupuestaria
              </span>
            </div>
            
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 shrink-0">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-650">
                <input
                  type="checkbox"
                  checked={autoIva}
                  onChange={e => setAutoIva(e.target.checked)}
                  className="h-3.5 w-3.5 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                Auto-Calcular I.V.A (16%)
              </label>
            </div>
          </div>

          {/* List of clean cards */}
          <div className="space-y-5">
            {items.map((item, index) => {
              return (
                <div 
                  key={item.id} 
                  className="relative bg-white border border-slate-200 rounded-xl p-5 shadow-3xs space-y-4 hover:border-indigo-300 hover:shadow-2xs transition-all animate-in fade-in slide-in-from-bottom-2 duration-150"
                >
                  {/* Card Header Panel */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 flex items-center justify-center bg-indigo-50 text-indigo-800 font-black text-xs rounded-lg border border-indigo-150">
                        P{index + 1}
                      </span>
                      <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider">
                        Factura / Partida de Gasto Registrada
                      </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <span className="text-xs font-black font-mono text-indigo-700 bg-indigo-50/50 border border-indigo-100 px-3 py-1.5 rounded-lg select-text text-right shrink-0">
                        Total Facturado: $ {item.importe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItemRow(item.id)}
                          className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 hover:border-transparent px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer shrink-0"
                        >
                          <Trash className="h-3.5 w-3.5" /> Eliminar Partida
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inputs Grid with 3 columns layout to secure readability */}
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                    
                    {/* LEFT COLUMN: Clasificación Presupuestaria Programática */}
                    <div className="md:col-span-5 bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="text-[9.5px] uppercase font-bold text-indigo-900 tracking-wider select-none">
                        Imputación Presupuestaria Oficial
                      </div>
                      
                      {renderBudgetPicker(
                        item,
                        "fuente",
                        "Fuente de Financiamiento *",
                        item.fuenteClave,
                        catalogs.fuentes.map(f => ({
                          id: f.id,
                          value: f.clave,
                          label: `(${f.clave}) - ${f.descripcion}`,
                          searchText: `${f.clave} ${f.descripcion}`,
                        })),
                        fuenteSearch,
                        setFuenteSearch,
                        value => updateItem(item.id, "fuenteClave", value)
                      )}

                      {renderBudgetPicker(
                        item,
                        "proyecto",
                        "Proyecto Presupuestal Asociado *",
                        item.proyectoClave,
                        catalogs.proyectos.map(p => ({
                          id: p.id,
                          value: p.clave,
                          label: `(${p.clave}) - ${p.descripcion}`,
                          searchText: `${p.clave} ${p.descripcion}`,
                        })),
                        proyectoSearch,
                        setProyectoSearch,
                        value => updateItem(item.id, "proyectoClave", value)
                      )}

                      {renderBudgetPicker(
                        item,
                        "objeto",
                        "Clasificador / Objeto del Gasto (Partida) *",
                        item.objetoClave,
                        catalogs.objetos.map(o => ({
                          id: o.id,
                          value: o.clave,
                          label: `[${o.clave}] ${o.nombre}`,
                          searchText: `${o.clave} ${o.nombre}`,
                        })),
                        objetoSearch,
                        setObjetoSearch,
                        value => updateItem(item.id, "objetoClave", value),
                        "emerald"
                      )}
                    </div>

                    {/* MIDDLE COLUMN: Datos del Documento Factura */}
                    <div className="md:col-span-4 space-y-3.5">
                      <div className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider select-none">
                        Datos del Archivo XML / Factura
                      </div>
                      
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                          Número de Factura * (Folio Digital / UUID)
                        </label>
                        <input
                          type="text"
                          placeholder="Ingresa clave o UUID del comprobante..."
                          value={item.numFactura}
                          onChange={e => updateItem(item.id, "numFactura", e.target.value.toUpperCase())}
                          className="w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2.5 text-indigo-950 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                            Fecha Factura
                          </label>
                          <input
                            type="date"
                            value={item.fechaFactura}
                            onChange={e => updateItem(item.id, "fechaFactura", e.target.value)}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white text-slate-800"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                            O. Compra (O.C.)
                          </label>
                          <input
                            type="text"
                            placeholder="OC-0000"
                            value={item.oc}
                            onChange={e => updateItem(item.id, "oc", e.target.value.toUpperCase())}
                            className="w-full text-xs font-semibold font-mono border border-slate-200 rounded-lg px-2.5 py-2 text-slate-850"
                          />
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Desglose Numérico y Montos */}
                    <div className="md:col-span-3 bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                      <div className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider select-none">
                        Desglose en Pesos MXN
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Subtotal *</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400 select-none">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={formatCurrencyInput(item.subTotal)}
                              onChange={e => updateItem(item.id, "subTotal", parseCurrency(e.target.value))}
                              className="w-full text-xs border border-slate-200 bg-white rounded-lg pl-5 pr-1 py-1.5 font-bold font-mono text-slate-850"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Descuento</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400 select-none">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={formatCurrencyInput(item.descuento)}
                              onChange={e => updateItem(item.id, "descuento", parseCurrency(e.target.value))}
                              className="w-full text-xs border border-slate-200 bg-white rounded-lg pl-5 pr-1 py-1.5 font-mono text-slate-500"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">I.V.A (16%)</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400 select-none">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={autoIva}
                              value={formatCurrencyInput(item.iva)}
                              onChange={e => updateItem(item.id, "iva", parseCurrency(e.target.value))}
                              className={`w-full text-xs border border-slate-200 rounded-lg pl-5 pr-1 py-1.5 font-bold font-mono ${
                                autoIva 
                                  ? "bg-slate-100 text-slate-500 border-dashed cursor-not-allowed" 
                                  : "bg-white text-slate-800"
                              }`}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Retención I.S.R</label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-rose-500 select-none">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={formatCurrencyInput(item.isr)}
                              onChange={e => updateItem(item.id, "isr", parseCurrency(e.target.value))}
                              className="w-full text-xs border border-slate-200 bg-white rounded-lg pl-5 pr-1 py-1.5 text-rose-700 font-bold font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-200/80 pt-2 flex justify-between items-center select-none font-medium">
                        <span className="text-[10.5px] font-bold text-slate-500">Monto Final:</span>
                        <span className="text-xs font-black font-mono text-indigo-700 bg-white border border-indigo-100 px-2.5 py-0.5 rounded-md">
                          $ {item.importe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Invoice button */}
          <div className="flex justify-start">
            <button
              type="button"
              onClick={addItemRow}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Agregar Otra Factura (Partida)
            </button>
          </div>
        </div>

        {/* STEP 4 COGNITIVE BLOCK: Concepto General */}
        <div className="bg-slate-50/40 p-5 md:p-6 rounded-xl border border-slate-200/80 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 select-none">
            <span className="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[11px] font-black rounded-full">
              4
            </span>
            <span className="text-xs font-black text-slate-800 uppercase tracking-widest">
              Concepto General del Expediente y Comentarios de Registro
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Descripción o Concepto (Glosa Presupuestal Oficial) *</label>
            <textarea
              placeholder="Escribe la glosa o concepto oficial del expediente (ej: COMBUSTIBLE CORRESPONDIENTE AL MES DE...)"
              value={concepto}
              onChange={e => setConcepto(e.target.value.toUpperCase())}
              rows={2}
              className="w-full text-xs font-bold border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 uppercase focus:ring-1 focus:ring-indigo-500 unicode-bidi-isolate"
            />
            <span className="text-[10px] text-slate-400 block pl-1 mt-1 font-semibold select-none leading-relaxed">
              * Nota: Se recomienda escribir en Mayúsculas tal como se exportará al sistema de contabilidad gubernamental armonizado.
            </span>
          </div>
        </div>

        {/* STEP 5 COGNITIVE BLOCK: Firmas y Validación oficial */}
        <div className="p-5 md:p-6 rounded-xl border border-indigo-200 space-y-4 bg-indigo-50/70 text-slate-900 shadow-sm">
          <div className="flex items-center gap-2 pb-2.5 border-b border-indigo-100 select-none">
            <span className="w-6 h-6 flex items-center justify-center bg-indigo-600 text-white text-[11px] font-black rounded-full">
              5
            </span>
            <span className="text-xs font-black text-indigo-950 uppercase tracking-widest">
              Firmantes Autorizados y Guardado Consolidado
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">1. Solicita Gasto Administrativo</label>
              <select
                value={selectedSolicitaId}
                onChange={e => setSelectedSolicitaId(e.target.value)}
                className="w-full text-xs font-bold border border-indigo-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 shadow-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                {catalogs.firmas.filter(f => f.tipo === "Solicita" || f.tipo === "General").map(f => (
                  <option key={f.id} value={f.id}>{f.nombre} ({f.puesto.substring(0, 20)}...)</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">2. Autoriza (Tesorería Municipal)</label>
              <select
                value={selectedAutoriza1Id}
                onChange={e => setSelectedAutoriza1Id(e.target.value)}
                className="w-full text-xs font-bold border border-indigo-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 shadow-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                {catalogs.firmas.filter(f => f.tipo === "Autoriza 1" || f.tipo === "General").map(f => (
                  <option key={f.id} value={f.id}>{f.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">3. Fiscaliza / Autoriza (Síndico Municipal)</label>
              <select
                value={selectedAutoriza2Id}
                onChange={e => setSelectedAutoriza2Id(e.target.value)}
                className="w-full text-xs font-bold border border-indigo-200 rounded-lg px-3 py-2.5 bg-white text-slate-900 shadow-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                {catalogs.firmas.filter(f => f.tipo === "Autoriza 2" || f.tipo === "General").map(f => (
                  <option key={f.id} value={f.id}>{f.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Aggregate sum box */}
          <div className="bg-white rounded-xl p-4 md:p-5 border border-indigo-150 flex flex-col md:flex-row justify-between items-center gap-4 select-text shadow-xs">
            <div className="space-y-1.5 text-center md:text-left select-none">
              <span className="text-[10px] font-extrabold text-slate-500 tracking-wider uppercase block">Resumen del Expediente de Gasto</span>
              <div className="flex flex-wrap justify-center md:justify-start gap-4 text-xs">
                <span className="text-indigo-700 font-bold">Subtotal: <strong className="font-mono">${sumSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                <span className="text-slate-600 font-bold">Desc.: <strong className="font-mono">${sumDescuento.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                <span className="text-slate-600 font-bold">I.V.A.: <strong className="font-mono">${sumIva.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
                <span className="text-rose-600 font-bold">I.S.R Ret: <strong className="font-mono">${sumIsr.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
              </div>
            </div>

            <div className="text-center md:text-right shrink-0">
              <span className="text-[9.5px] font-black uppercase text-indigo-600 block tracking-widest select-none">Cotejo / Total General Certificable</span>
              <span className="text-xl md:text-2xl font-black font-mono tracking-tight text-indigo-950 block mt-1">
                $ {sumImporte.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Warnings on network duplication */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-xs text-amber-800 select-none">
            <div className="p-1.5 bg-amber-100 border border-amber-200 text-amber-700 rounded-lg shrink-0 w-8 h-8 flex items-center justify-center">
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <div className="space-y-1">
              <p className="font-black text-amber-900 uppercase tracking-wide text-[10.5px]">Cotejo Secuencial y Bloqueo de Red Concurrente Activo</p>
              <p className="text-amber-800/90 leading-relaxed text-[11px]">
                Al presionar <strong>Finalizar y Generar Folio</strong>, se consultarán en milisegundos las transacciones vigentes para asignarle un folio correlativo único. El folio NO se reserva al iniciar, por lo que esta CLC se guardará de forma completamente segura y libre de duplicidades sin importar que otros departamentos la finalicen simultáneamente.
              </p>
            </div>
          </div>
        </div>

        {/* Outer Action Controllers */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-end select-none">
          {/* Cancel button */}
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-slate-250 text-slate-600 hover:bg-slate-50 text-xs font-black rounded-xl transition-all cursor-pointer text-center"
          >
            Regresar al Historial
          </button>

          {/* Finalize with official serial code */}
          <button
            type="button"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-md hover:shadow-indigo-650/15 text-xs font-black px-5 py-2.5 rounded-xl transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Check className="h-4 w-4" /> {isSubmitting
              ? "Guardando..."
              : documentToEdit?.estado === "finalizado"
                ? "Guardar Cambios"
                : "Finalizar y Generar Folio Definitivo"}
          </button>
        </div>

      </div>

    </div>
  );
}


