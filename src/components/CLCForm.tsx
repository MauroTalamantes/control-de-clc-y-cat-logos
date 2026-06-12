/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { AppCatalogs, CLCDocument, CLCItem, AdministrativeUnit, Bank, Provider } from "../types";
import { Plus, Trash, Check, AlertTriangle, Calculator, FileText, ChevronRight, ChevronDown, Upload, ArchiveX } from "lucide-react";
import {
  calculateXmlHash,
  normalizeRfc,
  normalizeUuid,
  parseCfdiXml,
  validateCfdiAgainstProvider,
  type ParsedCfdi
} from "../utils/cfdiParser";
import { checkInvoiceUsage, retireInvoiceUsage, type InvoiceUsage } from "../utils/appStore";
import {
  getActiveProviderByRfc,
  getPreferredProviderAccount,
  getProviderAccounts,
  isCatalogRecordActive
} from "../utils/providerBank";

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
  selectedBancoNombreId?: string;
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
  reposicionFondo: boolean;
}

interface BudgetPickerOption {
  id: string;
  value: string;
  label: string;
  searchText: string;
}

type BudgetPickerType = "fuente" | "proyecto" | "objeto";
type CurrencyField = "subTotal" | "descuento" | "iva" | "isr";
interface BudgetRecordDraft {
  pickerType: BudgetPickerType;
  itemId: string;
  clave: string;
  description: string;
}
interface XmlImportStatus {
  type: "success" | "error";
  message: string;
}
interface XmlBatchResult {
  fileName: string;
  success: boolean;
  message: string;
}
interface RetireInvoiceDraft {
  itemId: string;
  uuid: string;
}
interface AssociationNotice {
  type: "success" | "warning";
  message: string;
}

const RequiredMark = () => <span className="text-red-600 font-black" aria-hidden="true">*</span>;

export default function CLCForm({ catalogs, onSave, onCatalogsChange, onCancel, documentToEdit }: CLCFormProps) {
  // Setup standard state
  const [folio, setFolio] = useState<string>("");
  const [año, setAño] = useState<number>(2026);
  const [selectedUnidadId, setSelectedUnidadId] = useState<string>("");
  const [selectedBancoId, setSelectedBancoId] = useState<string>("");
  const [selectedBancoNombreId, setSelectedBancoNombreId] = useState<string>("");
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
  const [reposicionFondo, setReposicionFondo] = useState<boolean>(false);
  const [bancoSearch, setBancoSearch] = useState<string>("");
  const [isBancoPickerOpen, setIsBancoPickerOpen] = useState(false);
  const [fuenteSearch, setFuenteSearch] = useState<Record<string, string>>({});
  const [proyectoSearch, setProyectoSearch] = useState<Record<string, string>>({});
  const [objetoSearch, setObjetoSearch] = useState<Record<string, string>>({});
  const [openBudgetPicker, setOpenBudgetPicker] = useState<string | null>(null);
  const [budgetRecordDraft, setBudgetRecordDraft] = useState<BudgetRecordDraft | null>(null);
  const [currencyDrafts, setCurrencyDrafts] = useState<Record<string, string>>({});
  const [xmlImportStatuses, setXmlImportStatuses] = useState<Record<string, XmlImportStatus>>({});
  const [xmlBatchResults, setXmlBatchResults] = useState<XmlBatchResult[]>([]);
  const [retireInvoiceDraft, setRetireInvoiceDraft] = useState<RetireInvoiceDraft | null>(null);
  const [retireReason, setRetireReason] = useState("");
  const [isRetiringInvoice, setIsRetiringInvoice] = useState(false);
  const [associationNotice, setAssociationNotice] = useState<AssociationNotice | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initializedNewFormRef = useRef(false);
  const bancoNombres = catalogs.bancoNombres?.length
    ? catalogs.bancoNombres
    : Array.from(new Set(catalogs.bancos.map(banco => banco.nombre))).map((nombre, index) => ({
        id: `bn_${index + 1}`,
        nombre
      }));
  const isEditingFinalized = documentToEdit?.estado === "finalizado";
  const selectedCatalogBank = catalogs.bancos.find(bank => bank.id === selectedBancoId);
  const hasUnlinkedSelectedBank = Boolean(selectedCatalogBank && !selectedCatalogBank.providerId);
  const availableBankAccounts = catalogs.bancos.filter(bank => (
    isCatalogRecordActive(bank) &&
    (
      !selectedProveedorId ||
      selectedProveedorId === "custom" ||
      bank.providerId === selectedProveedorId ||
      (bank.id === selectedBancoId && !bank.providerId)
    )
  ));
  const availableProviders = catalogs.proveedores.filter(provider => (
    isCatalogRecordActive(provider) &&
    (
      !hasUnlinkedSelectedBank ||
      getProviderAccounts(catalogs, provider.id).length === 0
    )
  ));

  useEffect(() => {
    if (!openBudgetPicker && !isBancoPickerOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-budget-picker]")) return;
      if (target instanceof Element && target.closest("[data-bank-picker]")) return;
      setOpenBudgetPicker(null);
      setIsBancoPickerOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [openBudgetPicker, isBancoPickerOpen]);

  const normalizeSearch = (value: string) => {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  };

  const normalizeFolioInput = (value: string) => {
    const match = value.trim().toUpperCase().match(/^CLC-(\d+)\/(\d{4})$/);
    if (!match) return value.trim().toUpperCase();
    return `CLC-${String(Number.parseInt(match[1], 10)).padStart(3, "0")}/${match[2]}`;
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

  const restoreBankDraft = (draft: SavedCLCFormDraft) => {
    if (draft.selectedBancoId === "custom") {
      const matchedBankName = bancoNombres.find(
        bankName => normalizeCatalogText(bankName.nombre) === normalizeCatalogText(draft.customBancoNombre || "")
      );
      setSelectedBancoId("custom");
      setSelectedBancoNombreId(draft.selectedBancoNombreId || matchedBankName?.id || (draft.customBancoNombre ? "custom" : ""));
      setCustomBancoNombre(draft.selectedBancoNombreId === "custom" || !matchedBankName ? draft.customBancoNombre || "" : "");
      setBancoCuenta(draft.bancoCuenta || "");
      setBancoClabe(draft.bancoClabe || "");
      return;
    }

    const selectedBank = catalogs.bancos.find(b => b.id === draft.selectedBancoId);
    setSelectedBancoId(selectedBank?.id || "");
    setSelectedBancoNombreId("");
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
    let providerId = selectedProveedorId !== "custom" ? selectedProveedorId : "";

    if (selectedProveedorId === "custom") {
      const normalizedProviderName = normalizeCatalogText(proveedorNombre);
      const normalizedRfc = normalizeCatalogText(proveedorRfc);
      const existingProvider = nextCatalogs.proveedores.find(p => (
        normalizeCatalogText(p.rfc) === normalizedRfc ||
        normalizeCatalogText(p.nombre) === normalizedProviderName
      ));

      if (existingProvider) {
        providerId = existingProvider.id;
      } else {
        providerId = createCatalogId("p");
        const newProvider: Provider = {
          id: providerId,
          nombre: normalizedProviderName,
          rfc: normalizedRfc,
          active: true
        };
        nextCatalogs = {
          ...nextCatalogs,
          proveedores: [...nextCatalogs.proveedores, newProvider]
        };
        changed = true;
      }
    }

    if (selectedBancoId === "custom") {
      const normalizedBankName = normalizeCatalogText(bancoNombre);
      const normalizedCuenta = bancoCuenta.trim();
      const normalizedClabe = bancoClabe.trim();
      const bancoNombres = nextCatalogs.bancoNombres || [];
      const bankNameExists = bancoNombres.some(b => normalizeCatalogText(b.nombre) === normalizedBankName);
      const existingBank = nextCatalogs.bancos.find(b => {
        const sameClabe = normalizedClabe && b.clabe.trim() === normalizedClabe;
        const sameAccount = normalizeCatalogText(b.nombre) === normalizedBankName && b.cuenta.trim() === normalizedCuenta;
        return sameClabe || sameAccount;
      });

      if (!bankNameExists || !existingBank || !existingBank.providerId) {
        const providerHasDefault = nextCatalogs.bancos.some(bank => (
          bank.providerId === providerId && bank.isDefault && isCatalogRecordActive(bank)
        ));
        nextCatalogs = {
          ...nextCatalogs,
          bancoNombres: bankNameExists
            ? bancoNombres
            : [...bancoNombres, { id: createCatalogId("bn"), nombre: normalizedBankName }],
          bancos: existingBank
            ? nextCatalogs.bancos.map(bank => bank.id === existingBank.id
              ? {
                  ...bank,
                  providerId,
                  isDefault: bank.isDefault || !providerHasDefault,
                  active: true
                }
              : bank)
            : [
                ...nextCatalogs.bancos,
                {
                  id: createCatalogId("b"),
                  nombre: normalizedBankName,
                  cuenta: normalizedCuenta,
                  clabe: normalizedClabe,
                  providerId,
                  isDefault: !providerHasDefault,
                  active: true
                }
              ]
        };
        changed = true;
      }
    } else {
      const existingBank = nextCatalogs.bancos.find(bank => bank.id === selectedBancoId);
      if (existingBank && !existingBank.providerId && providerId) {
        const providerHasDefault = nextCatalogs.bancos.some(bank => (
          bank.providerId === providerId && bank.isDefault && isCatalogRecordActive(bank)
        ));
        nextCatalogs = {
          ...nextCatalogs,
          bancos: nextCatalogs.bancos.map(bank => bank.id === existingBank.id
            ? {
                ...bank,
                providerId,
                isDefault: bank.isDefault || !providerHasDefault,
                active: true
              }
            : bank)
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
      setFolio(documentToEdit.folio || "");
      setAño(documentToEdit.año);
      
      const matchedUnidad = catalogs.unidades.find(u => u.clave === documentToEdit.unidadClave);
      setSelectedUnidadId(matchedUnidad ? matchedUnidad.id : "");
      
      const matchedBanco = catalogs.bancos.find(b => (
        b.cuenta === documentToEdit.bancoCuenta &&
        b.clabe === documentToEdit.bancoClabe
      ));
      const matchedBancoNombre = bancoNombres.find(b => b.nombre === documentToEdit.bancoNombre);
      setSelectedBancoId(matchedBanco ? matchedBanco.id : "custom");
      setSelectedBancoNombreId(matchedBanco ? "" : matchedBancoNombre?.id || "custom");
      setCustomBancoNombre(matchedBanco || matchedBancoNombre ? "" : documentToEdit.bancoNombre);
      setBancoCuenta(documentToEdit.bancoCuenta);
      setBancoClabe(documentToEdit.bancoClabe);
      
      const matchedProveedor = catalogs.proveedores.find(p => p.nombre === documentToEdit.proveedorNombre);
      setSelectedProveedorId(matchedProveedor ? matchedProveedor.id : "custom");
      setCustomProveedorNombre(matchedProveedor ? "" : documentToEdit.proveedorNombre);
      setProveedorRfc(documentToEdit.proveedorRfc);
      setReposicionFondo(documentToEdit.reposicionFondo ?? false);
      
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
      setFolio("");

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
            setReposicionFondo(draft.reposicionFondo ?? false);
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
      setFolio("");
      setSelectedBancoId("");
      setSelectedBancoNombreId("");
      setBancoCuenta("");
      setBancoClabe("");
      setSelectedProveedorId("");
      setProveedorRfc("");
      setCustomProveedorNombre("");
      setCustomBancoNombre("");
      setReposicionFondo(false);
      
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
      selectedBancoNombreId,
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
      reposicionFondo,
    };

    localStorage.setItem(FORM_AUTOSAVE_KEY, JSON.stringify(draft));
  }, [
    documentToEdit,
    año,
    selectedUnidadId,
    selectedBancoId,
    selectedBancoNombreId,
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
    reposicionFondo,
  ]);

  // Handle autocompletes
  const handleUnidadChange = (id: string) => {
    setSelectedUnidadId(id);
  };

  const clearBankSelection = () => {
    setSelectedBancoId("");
    setSelectedBancoNombreId("");
    setCustomBancoNombre("");
    setBancoCuenta("");
    setBancoClabe("");
  };

  const selectCatalogBank = (bank: Bank) => {
    setSelectedBancoId(bank.id);
    setSelectedBancoNombreId("");
    setCustomBancoNombre("");
    setBancoCuenta(bank.cuenta);
    setBancoClabe(bank.clabe);
  };

  const selectProviderAndPreferredAccount = (provider: Provider) => {
    setSelectedProveedorId(provider.id);
    setCustomProveedorNombre("");
    setProveedorRfc(provider.rfc);

    const accounts = getProviderAccounts(catalogs, provider.id);
    if (hasUnlinkedSelectedBank && accounts.length === 0) {
      setAssociationNotice({
        type: "success",
        message: "Al guardar, la cuenta bancaria quedará vinculada al proveedor seleccionado."
      });
      return;
    }

    const preferredAccount = getPreferredProviderAccount(catalogs, provider.id);
    if (preferredAccount) {
      selectCatalogBank(preferredAccount);
      setAssociationNotice(null);
    } else {
      clearBankSelection();
      setAssociationNotice({
        type: "warning",
        message: accounts.length
          ? "Selecciona la cuenta bancaria del proveedor."
          : "El proveedor seleccionado no tiene cuenta bancaria registrada."
      });
    }
  };

  const handleBancoChange = (id: string) => {
    setSelectedBancoId(id);
    setSelectedBancoNombreId("");
    setCustomBancoNombre("");
    setBancoSearch("");
    setIsBancoPickerOpen(false);
    if (!id || id === "custom") {
      setBancoCuenta("");
      setBancoClabe("");
      if (id === "custom" && !selectedProveedorId) {
        setSelectedProveedorId("");
        setProveedorRfc("");
        setCustomProveedorNombre("");
        setAssociationNotice({
          type: "warning",
          message: "La cuenta bancaria seleccionada no está vinculada a ningún proveedor."
        });
      } else if (id === "custom") {
        setAssociationNotice(null);
      }
    } else {
      const b = catalogs.bancos.find(b => b.id === id);
      if (b) {
        setBancoCuenta(b.cuenta);
        setBancoClabe(b.clabe);
        const provider = catalogs.proveedores.find(candidate => (
          candidate.id === b.providerId && isCatalogRecordActive(candidate)
        ));
        if (provider) {
          setSelectedProveedorId(provider.id);
          setCustomProveedorNombre("");
          setProveedorRfc(provider.rfc);
          setAssociationNotice(null);
        } else {
          setSelectedProveedorId("");
          setCustomProveedorNombre("");
          setProveedorRfc("");
          setAssociationNotice({
            type: "warning",
            message: "La cuenta bancaria seleccionada no está vinculada a ningún proveedor."
          });
        }
      }
    }
  };

  const handleProveedorChange = (id: string) => {
    setSelectedProveedorId(id);
    setCustomProveedorNombre("");
    if (!id) {
      setProveedorRfc("");
      if (hasUnlinkedSelectedBank) {
        setAssociationNotice({
          type: "warning",
          message: "La cuenta bancaria seleccionada no está vinculada a ningún proveedor."
        });
      } else {
        clearBankSelection();
        setAssociationNotice(null);
      }
    } else if (id === "custom") {
      setProveedorRfc("");
      if (selectedBancoId !== "custom" && !hasUnlinkedSelectedBank) clearBankSelection();
      setAssociationNotice(hasUnlinkedSelectedBank
        ? {
            type: "success",
            message: "Al guardar, la cuenta bancaria quedará vinculada al nuevo proveedor."
          }
        : null);
    } else {
      const p = catalogs.proveedores.find(p => p.id === id);
      if (p) {
        selectProviderAndPreferredAccount(p);
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

  const isEmptyItem = (item: CLCItem) => (
    !item.oc &&
    !item.fuenteClave &&
    !item.proyectoClave &&
    !item.objetoClave &&
    !item.numFactura &&
    !item.fechaFactura &&
    item.subTotal === 0 &&
    item.descuento === 0 &&
    item.iva === 0 &&
    item.isr === 0 &&
    item.importe === 0
  );

  const addItemRow = () => {
    setItems([...items, createEmptyItem()]);
  };

  const removeItemRow = (id: string) => {
    if (items.length <= 1) return;
    setItems(items.filter(it => it.id !== id));
    setXmlImportStatuses(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
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

        if (field === "subTotal" || field === "descuento" || field === "iva" || field === "isr") {
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

  const getCurrencyDraftKey = (itemId: string, field: CurrencyField) => `${itemId}-${field}`;

  const sanitizeCurrencyDraft = (rawValue: string) => {
    const stripped = rawValue.replace(/,/g, "").replace(/[^\d.]/g, "");
    const [integerPart, ...decimalParts] = stripped.split(".");
    if (decimalParts.length === 0) return integerPart;
    return `${integerPart}.${decimalParts.join("").slice(0, 2)}`;
  };

  const formatCurrencyDraft = (value: string) => {
    if (!value) return "";
    const [integerPart, decimalPart] = value.split(".");
    const formattedInteger = Number(integerPart || "0").toLocaleString("en-US");
    return value.includes(".") ? `${formattedInteger}.${decimalPart ?? ""}` : formattedInteger;
  };

  const handleCurrencyChange = (itemId: string, field: CurrencyField, rawValue: string) => {
    const draftKey = getCurrencyDraftKey(itemId, field);
    const sanitizedValue = sanitizeCurrencyDraft(rawValue);
    setCurrencyDrafts(prev => ({ ...prev, [draftKey]: formatCurrencyDraft(sanitizedValue) }));
    updateItem(itemId, field, parseCurrency(sanitizedValue));
  };

  const handleCurrencyFocus = (itemId: string, field: CurrencyField, value: number) => {
    const draftKey = getCurrencyDraftKey(itemId, field);
    setCurrencyDrafts(prev => ({ ...prev, [draftKey]: value ? formatCurrencyInput(value) : "" }));
  };

  const handleCurrencyBlur = (itemId: string, field: CurrencyField) => {
    const draftKey = getCurrencyDraftKey(itemId, field);
    setCurrencyDrafts(prev => {
      const next = { ...prev };
      delete next[draftKey];
      return next;
    });
  };

  const getInvoiceUsageMessage = (usage: InvoiceUsage) => {
    return `Esta factura ya está registrada en la CLC ${usage.folio || usage.clcId}. Para reutilizarla primero debe retirarse de la CLC donde fue registrada.`;
  };

  const createItemFromCfdi = (cfdi: ParsedCfdi, xmlHash: string, baseItem?: CLCItem): CLCItem => ({
    ...(baseItem || createEmptyItem()),
    numFactura: cfdi.uuid.toUpperCase(),
    fechaFactura: cfdi.fechaFactura,
    subTotal: cfdi.subTotal,
    descuento: cfdi.descuento,
    iva: cfdi.iva,
    isr: cfdi.isr,
    importe: cfdi.total,
    cfdi: {
      uuid: cfdi.uuid,
      version: cfdi.version,
      serie: cfdi.serie,
      folio: cfdi.folio,
      rfcEmisor: cfdi.rfcEmisor,
      nombreEmisor: cfdi.nombreEmisor,
      rfcReceptor: cfdi.rfcReceptor,
      concepto: cfdi.concepto,
      moneda: cfdi.moneda,
      formaPago: cfdi.formaPago,
      metodoPago: cfdi.metodoPago,
      xmlHash,
    }
  });

  const resolveCfdiProvider = (cfdi: ParsedCfdi, expectedRfc: string) => {
    if (reposicionFondo) {
      return {
        providerRfc: normalizeRfc(expectedRfc),
        detected: false,
        acceptedForReposicion: true
      };
    }

    if (normalizeRfc(expectedRfc)) {
      validateCfdiAgainstProvider(cfdi, expectedRfc);
      return { providerRfc: normalizeRfc(expectedRfc), detected: false, acceptedForReposicion: false };
    }

    const provider = getActiveProviderByRfc(catalogs, cfdi.rfcEmisor);
    if (!provider) {
      throw new Error("El RFC emisor del XML no existe en el catálogo de proveedores.");
    }

    selectProviderAndPreferredAccount(provider);
    return { providerRfc: normalizeRfc(provider.rfc), detected: true, acceptedForReposicion: false };
  };

  const validateImportedCfdi = async (cfdi: ParsedCfdi, itemId?: string) => {
    const providerMatch = resolveCfdiProvider(cfdi, proveedorRfc);

    const duplicatedItem = items.find(item => (
      item.id !== itemId &&
      normalizeUuid(item.numFactura) === cfdi.uuid
    ));
    if (duplicatedItem) {
      throw new Error("Esta factura ya está capturada en otra partida de la CLC actual.");
    }

    const usage = await checkInvoiceUsage(cfdi.uuid, documentToEdit?.id, itemId);
    if (usage) throw new Error(getInvoiceUsageMessage(usage));
    return providerMatch;
  };

  const handleCfdiFile = async (itemId: string, file: File) => {
    try {
      const xmlText = await file.text();
      const cfdi = parseCfdiXml(xmlText);
      const providerMatch = await validateImportedCfdi(cfdi, itemId);
      const xmlHash = await calculateXmlHash(xmlText);

      setItems(prevItems => prevItems.map(item => {
        if (item.id !== itemId) return item;
        return createItemFromCfdi(cfdi, xmlHash, item);
      }));

      if (!concepto.trim() && cfdi.concepto) {
        setConcepto(cfdi.concepto.toUpperCase());
      }

      const reference = cfdi.referenciaFactura || cfdi.uuid || file.name;
      setXmlImportStatuses(prev => ({
        ...prev,
        [itemId]: {
          type: "success",
          message: providerMatch.acceptedForReposicion
            ? `XML aceptado para reposición de fondo: ${reference}`
            : providerMatch.detected
              ? `Proveedor detectado desde XML y autollenado correctamente. XML cargado: ${reference}`
              : `XML cargado: ${reference}`,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer el archivo XML seleccionado.";
      setXmlImportStatuses(prev => ({
        ...prev,
        [itemId]: { type: "error", message },
      }));
    }
  };

  const handleCfdiFiles = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;

    const results: XmlBatchResult[] = [];
    const loadedItems: CLCItem[] = [];
    const batchUuids = new Set<string>();
    const currentUuids = new Set(items.map(item => normalizeUuid(item.numFactura)).filter(Boolean));
    let firstConcept = "";
    let expectedProviderRfc = proveedorRfc;

    for (const file of selectedFiles) {
      try {
        const xmlText = await file.text();
        const cfdi = parseCfdiXml(xmlText);
        const providerMatch = resolveCfdiProvider(cfdi, expectedProviderRfc);
        expectedProviderRfc = providerMatch.providerRfc;

        if (batchUuids.has(cfdi.uuid)) {
          throw new Error("Este XML está duplicado dentro de los archivos seleccionados.");
        }
        batchUuids.add(cfdi.uuid);

        if (currentUuids.has(cfdi.uuid)) {
          throw new Error("Esta factura ya está capturada en una partida de la CLC actual.");
        }

        const usage = await checkInvoiceUsage(cfdi.uuid, documentToEdit?.id);
        if (usage) throw new Error(getInvoiceUsageMessage(usage));

        const xmlHash = await calculateXmlHash(xmlText);
        loadedItems.push(createItemFromCfdi(cfdi, xmlHash));
        currentUuids.add(cfdi.uuid);
        firstConcept ||= cfdi.concepto;
        results.push({
          fileName: file.name,
          success: true,
          message: providerMatch.acceptedForReposicion
            ? `Aceptado para reposición de fondo: ${cfdi.referenciaFactura || cfdi.uuid.toUpperCase()}`
            : providerMatch.detected
              ? `Proveedor detectado desde XML y autollenado correctamente. Cargado: ${cfdi.referenciaFactura || cfdi.uuid.toUpperCase()}`
              : `Cargado: ${cfdi.referenciaFactura || cfdi.uuid.toUpperCase()}`
        });
      } catch (error) {
        results.push({
          fileName: file.name,
          success: false,
          message: error instanceof Error ? error.message : "El archivo seleccionado no parece ser un CFDI válido."
        });
      }
    }

    if (loadedItems.length) {
      setItems(prevItems => {
        const emptyItemIndex = prevItems.findIndex(isEmptyItem);
        if (emptyItemIndex < 0) return [...prevItems, ...loadedItems];
        return [
          ...prevItems.slice(0, emptyItemIndex),
          loadedItems[0],
          ...prevItems.slice(emptyItemIndex + 1),
          ...loadedItems.slice(1),
        ];
      });
      if (!concepto.trim() && firstConcept) setConcepto(firstConcept.toUpperCase());
    }
    setXmlBatchResults(results);
  };

  const startRetireInvoice = (item: CLCItem) => {
    if (!documentToEdit || documentToEdit.estado === "finalizado") {
      alert("No se puede retirar una factura de una CLC finalizada.");
      return;
    }
    if (!window.confirm("Esta acción retirará el UUID de esta CLC y permitirá usarlo en otra. ¿Deseas continuar?")) return;
    setRetireInvoiceDraft({ itemId: item.id, uuid: item.numFactura });
    setRetireReason("");
  };

  const confirmRetireInvoice = async () => {
    if (!retireInvoiceDraft || !documentToEdit) return;
    if (!retireReason.trim()) {
      alert("El motivo para retirar la factura es obligatorio.");
      return;
    }

    setIsRetiringInvoice(true);
    try {
      await retireInvoiceUsage(
        retireInvoiceDraft.uuid,
        documentToEdit.id,
        retireInvoiceDraft.itemId,
        retireReason
      );
      setItems(prevItems => {
        const remainingItems = prevItems.filter(item => item.id !== retireInvoiceDraft.itemId);
        return remainingItems.length ? remainingItems : [createEmptyItem()];
      });
      setRetireInvoiceDraft(null);
      setRetireReason("");
      alert("La factura fue retirada de esta CLC y su UUID quedó disponible.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo retirar la factura.");
    } finally {
      setIsRetiringInvoice(false);
    }
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
      if (selectedBancoNombreId === "custom") {
        bancoNom = customBancoNombre.trim();
      } else {
        bancoNom = bancoNombres.find(bankName => bankName.id === selectedBancoNombreId)?.nombre || "";
      }
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

    const selectedCatalogProvider = catalogs.proveedores.find(provider => provider.id === selectedProveedorId);
    const selectedCatalogBankForSubmit = catalogs.bancos.find(bank => bank.id === selectedBancoId);
    const manuallyMatchedProvider = selectedProveedorId === "custom"
      ? getActiveProviderByRfc(catalogs, proveedorRfc)
      : undefined;
    const manuallyMatchedBank = selectedBancoId === "custom"
      ? catalogs.bancos.find(bank => (
          isCatalogRecordActive(bank) &&
          (bank.clabe.trim() === bancoClabe.trim() || bank.cuenta.trim() === bancoCuenta.trim())
        ))
      : undefined;
    if (
      selectedCatalogProvider &&
      normalizeRfc(selectedCatalogProvider.rfc) !== normalizeRfc(proveedorRfc)
    ) {
      alert("La cuenta bancaria seleccionada no pertenece al proveedor seleccionado.");
      return;
    }
    if (
      selectedCatalogBankForSubmit?.providerId &&
      selectedCatalogBankForSubmit.providerId !== selectedProveedorId
    ) {
      alert("La cuenta bancaria seleccionada no pertenece al proveedor seleccionado.");
      return;
    }
    if (
      manuallyMatchedBank?.providerId &&
      manuallyMatchedBank.providerId !== (selectedCatalogProvider?.id || manuallyMatchedProvider?.id)
    ) {
      alert("La cuenta bancaria seleccionada no pertenece al proveedor seleccionado.");
      return;
    }

    const validItems = items.filter(it => it.numFactura.trim() !== "" || it.subTotal > 0);
    if (validItems.length === 0) {
      alert("Error: Debe registrar al menos una Factura válida con número y subtotal.");
      return;
    }

    const capturedUuids = new Set<string>();
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      if (!item.numFactura.trim()) {
        alert(`Error en Factura #${i + 1}: El número de factura (UUID / Folio) es obligatorio.`);
        return;
      }
      if (!item.fuenteClave.trim() || !item.proyectoClave.trim() || !item.objetoClave.trim()) {
        alert(`Error en Factura #${i + 1}: La imputación presupuestaria oficial es obligatoria.`);
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

      const normalizedItemUuid = normalizeUuid(item.numFactura);
      if (capturedUuids.has(normalizedItemUuid)) {
        alert(`Error: El UUID ${item.numFactura.toUpperCase()} está duplicado dentro de esta CLC.`);
        return;
      }
      capturedUuids.add(normalizedItemUuid);

      if (
        !reposicionFondo &&
        item.cfdi?.rfcEmisor &&
        normalizeRfc(item.cfdi.rfcEmisor) !== normalizeRfc(proveedorRfc)
      ) {
        alert(`Error en Factura #${i + 1}: El RFC emisor del XML no coincide con el RFC del proveedor seleccionado.`);
        return;
      }

      try {
        const usage = await checkInvoiceUsage(item.numFactura, documentToEdit?.id, item.id);
        if (usage) {
          alert(getInvoiceUsageMessage(usage));
          return;
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : "No se pudo validar si la factura ya está registrada.");
        return;
      }
    }

    if (!concepto.trim()) {
      alert("Error: La descripción o concepto del expediente es obligatorio.");
      return;
    }

    let submittedFolio = documentToEdit?.folio || "";
    if (isEditingFinalized && finalize) {
      submittedFolio = normalizeFolioInput(folio);
      const folioMatch = submittedFolio.match(/^CLC-(\d+)\/(\d{4})$/);
      const folioNumber = folioMatch ? Number.parseInt(folioMatch[1], 10) : 0;
      const folioYear = folioMatch ? Number.parseInt(folioMatch[2], 10) : 0;
      if (!folioMatch || folioNumber < 1) {
        alert("Error: El folio debe tener el formato CLC-001/2026.");
        return;
      }
      if (folioYear !== año) {
        alert("Error: El anio del folio debe coincidir con el ejercicio presupuestal.");
        return;
      }
    }

    const solObj = catalogs.firmas.find(f => f.id === selectedSolicitaId);
    const aut1Obj = catalogs.firmas.find(f => f.id === selectedAutoriza1Id);
    const aut2Obj = catalogs.firmas.find(f => f.id === selectedAutoriza2Id);

    const doc: CLCDocument = {
      id: documentToEdit?.id || "doc_" + Math.random().toString(36).substr(2, 9),
      folio: submittedFolio, 
      año: año,
      unidadAdministrativaId: unidadeObj.id,
      unidadClave: unidadeObj.clave,
      unidadNombre: unidadeObj.nombre,
      bancoNombre: bancoNom,
      bancoCuenta: bancoCuenta,
      bancoClabe: bancoClabe,
      proveedorNombre: provNom,
      proveedorRfc: proveedorRfc.toUpperCase(),
      reposicionFondo,
      items: validItems,
      concepto: concepto.trim(),
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
      await onSave(doc, finalize);
      localStorage.removeItem(FORM_AUTOSAVE_KEY);
    } catch (error) {
      console.error("Error saving CLC with related catalogs", error);
      alert(error instanceof Error ? error.message : "No se pudo guardar la CLC con el banco o proveedor en la base de datos.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBancoNombreChange = (id: string) => {
    setSelectedBancoNombreId(id);
    setCustomBancoNombre("");
  };

  const getBudgetDescriptionLabel = (pickerType: BudgetPickerType) => {
    return pickerType === "objeto" ? "Nombre del objeto del gasto" : "Descripcion oficial";
  };

  const startBudgetRecord = (pickerType: BudgetPickerType, itemId: string, query: string) => {
    const guessedClave = query.trim().match(/^[\[(]?([A-Za-z0-9.-]+)/)?.[1] || "";
    setBudgetRecordDraft({ pickerType, itemId, clave: guessedClave, description: "" });
    setOpenBudgetPicker(null);
  };

  const createBudgetRecord = async () => {
    if (!budgetRecordDraft) return;

    const { pickerType, itemId } = budgetRecordDraft;
    const clave = budgetRecordDraft.clave.trim();
    if (!clave) return;

    const normalizedClave = normalizeCatalogText(clave);
    const isDuplicate =
      pickerType === "fuente"
        ? catalogs.fuentes.some(record => normalizeCatalogText(record.clave) === normalizedClave)
        : pickerType === "proyecto"
          ? catalogs.proyectos.some(record => normalizeCatalogText(record.clave) === normalizedClave)
          : catalogs.objetos.some(record => normalizeCatalogText(record.clave) === normalizedClave);
    if (isDuplicate) {
      alert("La clave ya existe en el catálogo.");
      return;
    }

    const description = budgetRecordDraft.description.trim();
    if (!description) return;
    const normalizedDescription = normalizeCatalogText(description);

    let updatedCatalogs: AppCatalogs;
    if (pickerType === "fuente") {
      updatedCatalogs = {
        ...catalogs,
        fuentes: [...catalogs.fuentes, { id: createCatalogId("f"), clave: normalizedClave, descripcion: normalizedDescription }]
      };
    } else if (pickerType === "proyecto") {
      updatedCatalogs = {
        ...catalogs,
        proyectos: [...catalogs.proyectos, { id: createCatalogId("pr"), clave: normalizedClave, descripcion: normalizedDescription }]
      };
    } else {
      updatedCatalogs = {
        ...catalogs,
        objetos: [...catalogs.objetos, { id: createCatalogId("o"), clave: normalizedClave, nombre: normalizedDescription }]
      };
    }

    try {
      await onCatalogsChange(updatedCatalogs);
      setItems(prevItems => prevItems.map(item => {
        if (item.id !== itemId) return item;
        if (pickerType === "fuente") return { ...item, fuenteClave: normalizedClave };
        if (pickerType === "proyecto") return { ...item, proyectoClave: normalizedClave };
        return { ...item, objetoClave: normalizedClave, objetoNombre: normalizedDescription };
      }));
      if (pickerType === "fuente") setFuenteSearch(prev => ({ ...prev, [itemId]: "" }));
      if (pickerType === "proyecto") setProyectoSearch(prev => ({ ...prev, [itemId]: "" }));
      if (pickerType === "objeto") setObjetoSearch(prev => ({ ...prev, [itemId]: "" }));
      setBudgetRecordDraft(null);
      setOpenBudgetPicker(null);
    } catch (error) {
      console.error("Error creating budget catalog record", error);
      alert("No se pudo guardar el nuevo registro presupuestario.");
    }
  };

  const renderBudgetPicker = (
    item: CLCItem,
    pickerType: BudgetPickerType,
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
          {label} <RequiredMark />
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
            <button
              type="button"
              onClick={() => startBudgetRecord(pickerType, item.id, query)}
              className="mt-2 w-full rounded-md border border-dashed border-indigo-200 bg-indigo-50/50 px-2.5 py-1.5 text-left text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
            >
              <Plus className="mr-1 inline h-3 w-3" />
              Agregar registro al catálogo
            </button>
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
          {isEditingFinalized && (
            <div className="space-y-1">
              <label className="block text-[10px] font-black uppercase tracking-widest text-indigo-200">
                Folio
              </label>
              <input
                type="text"
                value={folio}
                onChange={event => setFolio(event.target.value.toUpperCase())}
                onBlur={() => setFolio(normalizeFolioInput(folio))}
                className="bg-white border border-indigo-200 rounded-xl px-4 py-2 text-xs text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500/30 focus:outline-hidden shadow-sm min-w-40 font-mono"
              />
            </div>
          )}
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Unidad Administrativa Responsable <RequiredMark /></label>
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
              <div className="relative" data-bank-picker>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Número de Cuenta <RequiredMark /></label>
                <button
                  type="button"
                  id="field-banco"
                  onClick={() => setIsBancoPickerOpen(prev => !prev)}
                  className="w-full min-h-10 text-left text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-850 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {selectedBancoId === "custom"
                      ? bancoCuenta || "Registrar otro numero de cuenta"
                      : catalogs.bancos.find(b => b.id === selectedBancoId)?.cuenta || "Selecciona numero de cuenta..."}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isBancoPickerOpen ? "rotate-180" : ""}`} />
                </button>
                {isBancoPickerOpen && (
                  <div className="absolute z-40 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl p-2">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Filtrar por cuenta, banco o CLABE..."
                      value={bancoSearch}
                      onChange={e => setBancoSearch(e.target.value)}
                      className="w-full text-[11px] border border-slate-200 rounded-md px-2.5 py-1.5 bg-slate-50 text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    />
                    <div className="mt-1.5 max-h-48 overflow-y-auto space-y-0.5">
                      {availableBankAccounts
                        .filter(b => matchesSearch(bancoSearch, b.cuenta, b.nombre, b.clabe))
                        .map(b => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => handleBancoChange(b.id)}
                            className={`w-full text-left text-[11px] rounded-md px-2.5 py-1.5 transition-colors ${
                              b.id === selectedBancoId
                                ? "bg-indigo-50 text-indigo-900 font-black"
                                : "text-slate-700 hover:bg-slate-100 font-semibold"
                            }`}
                          >
                            <span className="block font-mono">{b.cuenta}</span>
                            <span className="block truncate text-[10px] text-slate-400">{b.nombre} - CLABE {b.clabe}</span>
                          </button>
                        ))}
                      {availableBankAccounts.filter(b => matchesSearch(bancoSearch, b.cuenta, b.nombre, b.clabe)).length === 0 && (
                        <div className="text-[11px] text-slate-400 px-2 py-2 font-semibold">
                          Sin coincidencias
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleBancoChange("custom")}
                      className="mt-2 w-full rounded-md border border-dashed border-indigo-200 bg-indigo-50/50 px-2.5 py-1.5 text-left text-[11px] font-bold text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                    >
                      <Plus className="mr-1 inline h-3 w-3" />
                      Registrar otro numero de cuenta
                    </button>
                  </div>
                )}
                {selectedBancoId === "custom" && (
                  <input
                    type="text"
                    placeholder="Escribe el número de cuenta..."
                    value={bancoCuenta}
                    onChange={e => setBancoCuenta(e.target.value)}
                    className="mt-1.5 w-full text-xs font-bold font-mono border border-slate-350 rounded-lg px-2.5 py-2 bg-amber-50 text-slate-800 placeholder:text-amber-700/55 focus:outline-hidden"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">CLABE Interbancaria (18 d.) <RequiredMark /></label>
                <input
                  type="text"
                  placeholder="Ej: 01493065509270940"
                  value={bancoClabe}
                  onChange={e => setBancoClabe(e.target.value)}
                  readOnly={selectedBancoId !== "custom"}
                  className={`w-full text-xs font-bold font-mono border border-slate-200 rounded-lg px-3 py-2.5 text-slate-800 truncate ${
                    selectedBancoId === "custom" ? "bg-white" : "bg-slate-100"
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Institución Bancaria <RequiredMark /></label>
                {selectedBancoId === "custom" ? (
                  <>
                    <select
                      value={selectedBancoNombreId}
                      onChange={e => handleBancoNombreChange(e.target.value)}
                      className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-850 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                    >
                      <option value="">Selecciona institución bancaria...</option>
                      {bancoNombres.map(bankName => (
                        <option key={bankName.id} value={bankName.id}>{bankName.nombre}</option>
                      ))}
                      <option value="custom" className="text-indigo-600 font-bold">-- REGISTRAR OTRO BANCO --</option>
                    </select>
                    {selectedBancoNombreId === "custom" && (
                      <input
                        type="text"
                        placeholder="Escribe el nombre del banco..."
                        value={customBancoNombre}
                        onChange={e => setCustomBancoNombre(e.target.value.toUpperCase())}
                        className="mt-1.5 w-full text-xs border border-slate-350 rounded-lg px-2.5 py-2 bg-amber-50 text-slate-800 font-bold placeholder:text-amber-700/55 focus:outline-hidden"
                      />
                    )}
                  </>
                ) : (
                  <input
                    type="text"
                    value={catalogs.bancos.find(b => b.id === selectedBancoId)?.nombre || ""}
                    readOnly
                    placeholder="Se autollenará al elegir la cuenta"
                    className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-100 text-slate-800"
                  />
                )}
              </div>
            </div>
          </div>
          {associationNotice && (
            <p
              role={associationNotice.type === "warning" ? "alert" : "status"}
              className={`text-[11px] font-semibold ${
                associationNotice.type === "warning" ? "text-amber-700" : "text-emerald-700"
              }`}
            >
              {associationNotice.message}
            </p>
          )}
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Socio Comercial / Proveedor Oficial Autorizado <RequiredMark /></label>
              <select
                id="field-proveedor"
                value={selectedProveedorId}
                onChange={e => handleProveedorChange(e.target.value)}
              className="w-full text-xs font-extrabold border border-slate-200 rounded-lg px-3 py-2.5 bg-white text-slate-850 focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="">Selecciona proveedor...</option>
                {availableProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
                <option value="custom" className="text-indigo-600 font-bold">-- REGISTRAR OTRO PROVEEDOR --</option>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">R.F.C. (Cédula Fiscal Beneficiario) <RequiredMark /></label>
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
            
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">
                <Upload className="h-3.5 w-3.5" />
                Cargar varios XML
                <input
                  type="file"
                  multiple
                  accept=".xml,application/xml,text/xml"
                  className="sr-only"
                  onChange={event => {
                    if (event.target.files) void handleCfdiFiles(event.target.files);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-650">
                  <input
                    type="checkbox"
                    checked={autoIva}
                    onChange={e => setAutoIva(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  Auto-Calcular I.V.A (16%)
                </label>
                <label
                  className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-650"
                  title="Permite cargar XML cuyo RFC emisor no exista en el catálogo o no coincida con el beneficiario de la CLC."
                >
                  <input
                    type="checkbox"
                    checked={reposicionFondo}
                    onChange={e => setReposicionFondo(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  Reposición de fondo
                </label>
              </div>
            </div>
          </div>

          {reposicionFondo && (
            <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              Reposición de fondo activa: se aceptarán XML de emisores no registrados o distintos al beneficiario. Los UUID y archivos duplicados continúan bloqueados.
            </div>
          )}

          {xmlBatchResults.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-[11px] shadow-3xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-black uppercase tracking-wide text-slate-700">Resumen de carga masiva</p>
                  {xmlBatchResults.some(result => !result.success) && (
                    <p className="mt-0.5 font-semibold text-rose-700">Algunos XML no pudieron cargarse. Revisa el detalle de errores.</p>
                  )}
                </div>
                <p className="font-bold text-slate-500">
                  {xmlBatchResults.filter(result => result.success).length} cargados · {xmlBatchResults.filter(result => !result.success).length} rechazados
                </p>
              </div>
              <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                {xmlBatchResults.map((result, index) => (
                  <div
                    key={`${result.fileName}-${index}`}
                    className={`rounded-md border px-2 py-1.5 font-semibold ${
                      result.success
                        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                        : "border-rose-100 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <span className="font-black">{result.fileName}:</span> {result.message}
                  </div>
                ))}
              </div>
            </div>
          )}

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
                      {documentToEdit?.estado === "borrador" && item.numFactura.trim() && (
                        <button
                          type="button"
                          onClick={() => startRetireInvoice(item)}
                          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition-colors hover:bg-amber-100"
                        >
                          <ArchiveX className="h-3.5 w-3.5" /> Retirar factura/XML
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
                        "Fuente de Financiamiento",
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
                        "Proyecto Presupuestal Asociado",
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
                        "Clasificador / Objeto del Gasto (Partida)",
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
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[9.5px] uppercase font-bold text-slate-400 tracking-wider select-none">
                          Datos del Archivo XML / Factura
                        </div>
                        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50/60 px-2 py-1 text-[10px] font-bold text-indigo-700 transition-colors hover:bg-indigo-100">
                          <Upload className="h-3 w-3" />
                          Cargar XML
                          <input
                            type="file"
                            accept=".xml,application/xml,text/xml"
                            className="sr-only"
                            onChange={event => {
                              const file = event.target.files?.[0];
                              if (file) void handleCfdiFile(item.id, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </div>
                      {xmlImportStatuses[item.id] && (
                        <div
                          role={xmlImportStatuses[item.id].type === "error" ? "alert" : "status"}
                          className={`flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-semibold leading-snug ${
                            xmlImportStatuses[item.id].type === "error"
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {xmlImportStatuses[item.id].type === "error" && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
                          <span>{xmlImportStatuses[item.id].message}</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                          Número de Factura <RequiredMark /> (Folio Digital / UUID)
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
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Subtotal <RequiredMark /></label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400 select-none">$</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="0.00"
                              value={currencyDrafts[getCurrencyDraftKey(item.id, "subTotal")] ?? formatCurrencyInput(item.subTotal)}
                              onFocus={() => handleCurrencyFocus(item.id, "subTotal", item.subTotal)}
                              onBlur={() => handleCurrencyBlur(item.id, "subTotal")}
                              onChange={e => handleCurrencyChange(item.id, "subTotal", e.target.value)}
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
                              value={currencyDrafts[getCurrencyDraftKey(item.id, "descuento")] ?? formatCurrencyInput(item.descuento)}
                              onFocus={() => handleCurrencyFocus(item.id, "descuento", item.descuento)}
                              onBlur={() => handleCurrencyBlur(item.id, "descuento")}
                              onChange={e => handleCurrencyChange(item.id, "descuento", e.target.value)}
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
                              value={currencyDrafts[getCurrencyDraftKey(item.id, "iva")] ?? formatCurrencyInput(item.iva)}
                              onFocus={() => handleCurrencyFocus(item.id, "iva", item.iva)}
                              onBlur={() => handleCurrencyBlur(item.id, "iva")}
                              onChange={e => handleCurrencyChange(item.id, "iva", e.target.value)}
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
                              value={currencyDrafts[getCurrencyDraftKey(item.id, "isr")] ?? formatCurrencyInput(item.isr)}
                              onFocus={() => handleCurrencyFocus(item.id, "isr", item.isr)}
                              onBlur={() => handleCurrencyBlur(item.id, "isr")}
                              onChange={e => handleCurrencyChange(item.id, "isr", e.target.value)}
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
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Descripción o Concepto (Glosa Presupuestal Oficial) <RequiredMark /></label>
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

      {retireInvoiceDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl">
            <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
              <h3 className="text-sm font-black text-amber-950">Retirar factura/XML de esta CLC</h3>
              <p className="mt-1 text-[11px] font-semibold text-amber-800">
                UUID: {retireInvoiceDraft.uuid.toUpperCase()}
              </p>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xs font-semibold leading-relaxed text-slate-600">
                El registro conservará trazabilidad y quedará disponible para otra CLC. No se permite retirar facturas de CLC finalizadas.
              </p>
              <label className="block text-[11px] font-bold text-slate-700">
                Motivo obligatorio <RequiredMark />
              </label>
              <textarea
                autoFocus
                rows={3}
                value={retireReason}
                onChange={event => setRetireReason(event.target.value)}
                placeholder="Describe por qué se registró en la CLC incorrecta..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                disabled={isRetiringInvoice}
                onClick={() => setRetireInvoiceDraft(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isRetiringInvoice || !retireReason.trim()}
                onClick={() => void confirmRetireInvoice()}
                className="rounded-lg bg-amber-700 px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRetiringInvoice ? "Retirando..." : "Confirmar retiro"}
              </button>
            </div>
          </div>
        </div>
      )}

      {budgetRecordDraft && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setBudgetRecordDraft(null)}
        >
          <form
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
            onClick={event => event.stopPropagation()}
            onSubmit={event => {
              event.preventDefault();
              void createBudgetRecord();
            }}
          >
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <h3 className="text-sm font-black text-slate-900">
                Agregar registro presupuestario
              </h3>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {budgetRecordDraft.pickerType === "fuente"
                  ? "Fuente de Financiamiento"
                  : budgetRecordDraft.pickerType === "proyecto"
                    ? "Proyecto Presupuestal Asociado"
                    : "Clasificador / Objeto del Gasto"}
              </p>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-slate-600">
                  Clave oficial <RequiredMark />
                </label>
                <input
                  type="text"
                  autoFocus
                  value={budgetRecordDraft.clave}
                  onChange={event => setBudgetRecordDraft({
                    ...budgetRecordDraft,
                    clave: event.target.value.toUpperCase()
                  })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold text-slate-600">
                  {getBudgetDescriptionLabel(budgetRecordDraft.pickerType)} <RequiredMark />
                </label>
                <input
                  type="text"
                  value={budgetRecordDraft.description}
                  onChange={event => setBudgetRecordDraft({
                    ...budgetRecordDraft,
                    description: event.target.value.toUpperCase()
                  })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={() => setBudgetRecordDraft(null)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-slate-800 cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
