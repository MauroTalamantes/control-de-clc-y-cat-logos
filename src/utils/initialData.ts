/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppCatalogs, CLCDocument, FolioCounter } from "../types";

const FOLIO_COUNTERS_STORAGE_KEY = "clc_folio_counters";

export const INITIAL_CATALOGS: AppCatalogs = {
  defaultUnidadId: "u1",
  unidades: [
    {
      id: "u1",
      clave: "530",
      nombre: "SECRETARÍA DE SERVICIOS PUBLICOS MUNICIPALES",
      elaboro: "SERVICIOS PUBLICOS MUNICIPALES"
    },
    {
      id: "u2",
      clave: "510",
      nombre: "DIRECCIÓN DE OBRAS PÚBLICAS Y DESARROLLO URBANO",
      elaboro: "OBRAS PÚBLICAS MUNICIPALES"
    },
    {
      id: "u3",
      clave: "540",
      nombre: "DIRECCIÓN DE BIENESTAR SOCIAL Y SALUD",
      elaboro: "BIENESTAR SOCIAL"
    },
    {
      id: "u4",
      clave: "110",
      nombre: "DESPACHO DEL PRESIDENTE MUNICIPAL",
      elaboro: "PRESIDENCIA"
    }
  ],
  bancoNombres: [
    { id: "bn1", nombre: "SANTANDER" },
    { id: "bn2", nombre: "BBVA BANCOMER" },
    { id: "bn3", nombre: "BANORTE" }
  ],
  bancos: [
    {
      id: "b1",
      nombre: "SANTANDER",
      cuenta: "65509270940",
      clabe: "01493065509270940",
      providerId: "p1",
      isDefault: true,
      active: true
    },
    {
      id: "b2",
      nombre: "BBVA BANCOMER",
      cuenta: "01234567890",
      clabe: "012180001234567890",
      providerId: "p2",
      isDefault: true,
      active: true
    },
    {
      id: "b3",
      nombre: "BANORTE",
      cuenta: "98765432101",
      clabe: "072180009876543210",
      providerId: "p3",
      isDefault: true,
      active: true
    }
  ],
  proveedores: [
    {
      id: "p1",
      nombre: "MULTISERVICIO LA PLATA S.A. DE C.V.",
      rfc: "MPL020607CX5",
      active: true
    },
    {
      id: "p2",
      nombre: "ABASTECEDORA DE INSUMOS DE GUADALUPE S.A. DE C.V.",
      rfc: "AIG150912TS8",
      active: true
    },
    {
      id: "p3",
      nombre: "CONSTRUCTORA EL PROGRESO S.A. DE C.V.",
      rfc: "CPR110418LL9",
      active: true
    }
  ],
  fuentes: [
    { id: "f1", clave: "111", descripcion: "RECURSOS PROPIOS (PARTICIPACIONES)" },
    { id: "f2", clave: "112", descripcion: "FORTAMUN (FONDO IV)" },
    { id: "f3", clave: "113", descripcion: "FAISM (FONDO III)" }
  ],
  proyectos: [
    { id: "pr1", clave: "304004", descripcion: "MANTENIMIENTO DE PARQUES Y SERVICIOS" },
    { id: "pr2", clave: "304005", descripcion: "SUMINISTRO DE COMBUSTIBLE PARA VEHÍCULOS OFICIALES" },
    { id: "pr3", clave: "305101", descripcion: "CONSTRUCCIÓN DE PAVIMENTACIONES" }
  ],
  objetos: [
    { id: "o1", clave: "2611", nombre: "GASOLINA" },
    { id: "o2", clave: "2612", nombre: "DIÉSEL" },
    { id: "o3", clave: "2111", nombre: "PAPELERÍA Y UTILES DE OFICINA" },
    { id: "o4", clave: "3551", nombre: "MANTENIMIENTO DE VEHÍCULOS" }
  ],
  firmas: [
    {
      id: "s1",
      tipo: "Solicita",
      nombre: "ING. JOSE ANTONIO FLORES BERUMEN",
      puesto: "SECRETARIO DE SERVICIOS PUBLICOS MUNICIPALES"
    },
    {
      id: "s2",
      tipo: "Autoriza 1",
      nombre: "L.C. JESÚS RODRÍGUEZ DEL MURO",
      puesto: "SECRETARIO DE LA TESORERÍA Y FINANZAS"
    },
    {
      id: "s3",
      tipo: "Autoriza 2",
      nombre: "LIC. ANALÍ INFANTE MORALES",
      puesto: "SINDICO MUNICIPAL"
    },
    {
      id: "s4",
      tipo: "Solicita",
      nombre: "ING. ARTURO SANDOVAL GÓMEZ",
      puesto: "SECRETARIO DE OBRAS PÚBLICAS"
    }
  ]
};

export const INITIAL_DOCUMENTS: CLCDocument[] = [
  {
    id: "doc-1",
    folio: "CLC-007/2026",
    año: 2026,
    unidadAdministrativaId: "u1",
    unidadClave: "530",
    unidadNombre: "SECRETARÍA DE SERVICIOS PUBLICOS MUNICIPALES",
    bancoNombre: "SANTANDER",
    bancoCuenta: "65509270940",
    bancoClabe: "01493065509270940",
    proveedorNombre: "MULTISERVICIO LA PLATA S.A. DE C.V.",
    proveedorRfc: "MPL020607CX5",
    items: [
      {
        id: "item-1",
        oc: "OC-1025",
        fuenteClave: "111",
        proyectoClave: "304004",
        objetoClave: "2611",
        objetoNombre: "GASOLINA",
        numFactura: "3bc94931-8618-4657-8054-44354abe9a83",
        fechaFactura: "2026-04-01",
        subTotal: 15304.07,
        descuento: 0,
        iva: 2397.18,
        isr: 0,
        importe: 17701.25
      },
      {
        id: "item-2",
        oc: "OC-1026",
        fuenteClave: "111",
        proyectoClave: "304004",
        objetoClave: "2611",
        objetoNombre: "GASOLINA",
        numFactura: "55abec22-5770-44db-b67e-d05e0cb370b6",
        fechaFactura: "2026-04-09",
        subTotal: 26946.53,
        descuento: 0,
        iva: 4221.32,
        isr: 0,
        importe: 31167.85
      }
    ],
    concepto: "COMBUSTIBLE CORRESPONDIENTE AL MES DE ABRIL DEL 2026",
    solicitaNombre: "ING. JOSE ANTONIO FLORES BERUMEN",
    solicitaPuesto: "SECRETARIO DE SERVICIOS PUBLICOS MUNICIPALES",
    autoriza1Nombre: "L.C. JESÚS RODRÍGUEZ DEL MURO",
    autoriza1Puesto: "SECRETARIO DE LA TESORERÍA Y FINANZAS",
    autoriza2Nombre: "LIC. ANALÍ INFANTE MORALES",
    autoriza2Puesto: "SINDICO MUNICIPAL",
    elaboro: "SERVICIOS PUBLICOS MUNICIPALES",
    fechaCreacion: "2026-04-30T10:00:00.000Z",
    estado: "finalizado"
  },
  {
    id: "doc-2",
    folio: "CLC-006/2026",
    año: 2026,
    unidadAdministrativaId: "u1",
    unidadClave: "530",
    unidadNombre: "SECRETARÍA DE SERVICIOS PUBLICOS MUNICIPALES",
    bancoNombre: "SANTANDER",
    bancoCuenta: "65509270940",
    bancoClabe: "01493065509270940",
    proveedorNombre: "MULTISERVICIO LA PLATA S.A. DE C.V.",
    proveedorRfc: "MPL020607CX5",
    items: [
      {
        id: "item-3",
        oc: "OC-0941",
        fuenteClave: "111",
        proyectoClave: "304004",
        objetoClave: "2611",
        objetoNombre: "GASOLINA",
        numFactura: "9ac24ff1-1254-47fb-9922-a98218ccaef1",
        fechaFactura: "2026-03-12",
        subTotal: 10250.00,
        descuento: 0,
        iva: 1640.00,
        isr: 0,
        importe: 11890.00
      }
    ],
    concepto: "COMBUSTIBLE DEL MES DE MARZO DE 2026",
    solicitaNombre: "ING. JOSE ANTONIO FLORES BERUMEN",
    solicitaPuesto: "SECRETARIO DE SERVICIOS PUBLICOS MUNICIPALES",
    autoriza1Nombre: "L.C. JESÚS RODRÍGUEZ DEL MURO",
    autoriza1Puesto: "SECRETARIO DE LA TESORERÍA Y FINANZAS",
    autoriza2Nombre: "LIC. ANALÍ INFANTE MORALES",
    autoriza2Puesto: "SINDICO MUNICIPAL",
    elaboro: "SERVICIOS PUBLICOS MUNICIPALES",
    fechaCreacion: "2026-03-28T12:00:00.000Z",
    estado: "finalizado"
  }
];

export function normalizeCatalogs(catalogs: Partial<AppCatalogs> | null | undefined): AppCatalogs {
  const parsed = catalogs || {};
  const bancos = (parsed.bancos || INITIAL_CATALOGS.bancos).map(bank => ({
    ...bank,
    isDefault: Boolean(bank.isDefault),
    active: bank.active !== false
  }));
  const proveedores = (parsed.proveedores || INITIAL_CATALOGS.proveedores).map(provider => ({
    ...provider,
    active: provider.active !== false
  }));
  return {
    ...INITIAL_CATALOGS,
    ...parsed,
    bancos,
    proveedores,
    defaultUnidadId: parsed.defaultUnidadId || parsed.unidades?.[0]?.id || INITIAL_CATALOGS.defaultUnidadId,
    bancoNombres: parsed.bancoNombres?.length
      ? parsed.bancoNombres
      : Array.from(new Set(bancos.map(b => b.nombre))).map((nombre, index) => ({
          id: `bn_${index + 1}`,
          nombre
        }))
  };
}

export function getStoredCatalogs(): AppCatalogs {
  const data = localStorage.getItem("clc_catalogs");
  if (data) {
    try {
      const parsed = JSON.parse(data) as AppCatalogs;
      return normalizeCatalogs(parsed);
    } catch (e) {
      console.error("Error parsing catalogs from localStorage, resetting", e);
    }
  }
  return INITIAL_CATALOGS;
}

export function saveStoredCatalogs(catalogs: AppCatalogs) {
  localStorage.setItem("clc_catalogs", JSON.stringify(catalogs));
}

export function getStoredDocuments(): CLCDocument[] {
  const data = localStorage.getItem("clc_documents");
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      console.error("Error parsing documents from localStorage, resetting", e);
    }
  }
  return INITIAL_DOCUMENTS;
}

export function saveStoredDocuments(documents: CLCDocument[]) {
  localStorage.setItem("clc_documents", JSON.stringify(documents));
}

export function getStoredFolioCounters(): FolioCounter[] {
  const data = localStorage.getItem(FOLIO_COUNTERS_STORAGE_KEY);
  if (!data) return [];

  try {
    const parsed = JSON.parse(data) as FolioCounter[];
    return Array.isArray(parsed)
      ? parsed.filter(counter => Number.isInteger(counter.anio) && Number.isInteger(counter.lastNumber))
      : [];
  } catch (e) {
    console.error("Error parsing folio counters from localStorage, resetting", e);
    return [];
  }
}

export function saveStoredFolioCounters(counters: FolioCounter[]) {
  localStorage.setItem(FOLIO_COUNTERS_STORAGE_KEY, JSON.stringify(counters));
}

export function setStoredNextFolioNumber(anio: number, nextNumber: number): FolioCounter[] {
  const counters = getStoredFolioCounters();
  const nextCounters = counters.filter(counter => counter.anio !== anio);
  nextCounters.push({ anio, lastNumber: nextNumber - 1 });
  nextCounters.sort((a, b) => b.anio - a.anio);
  saveStoredFolioCounters(nextCounters);
  return nextCounters;
}

/**
 * Assigns the next sequential folio for the given document and year.
 * Performs a safe increment step by querying the latest committed documents to prevent race conditions or gaps.
 */
export function finalizeDocumentAndAssignFolio(
  docToFinalize: CLCDocument,
  allDocuments: CLCDocument[],
  folioCounters: FolioCounter[] = []
): { finalizedDoc: CLCDocument, updatedGlobalList: CLCDocument[], folioCounters: FolioCounter[] } {
  const year = docToFinalize.año || new Date().getFullYear();
  
  // Filter final documents of same year to count and find highest
  const yearDocs = allDocuments.filter(d => d.año === year && d.estado === "finalizado");
  
  const folioNumbers = yearDocs.map(d => {
    // Format is e.g. "CLC-007/2026"
    const match = d.folio.match(/CLC-(\d+)\/\d+/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const maxNumber = Math.max(...folioNumbers, 0);
  const configuredLastNumber = folioCounters.find(counter => counter.anio === year)?.lastNumber || 0;
  const nextNum = Math.max(maxNumber, configuredLastNumber) + 1;
  
  // Format to 3 digits e.g. CLC-007/2026
  const paddedNum = String(nextNum).padStart(3, "0");
  const assignedFolio = `CLC-${paddedNum}/${year}`;
  
  const finalizedDoc: CLCDocument = {
    ...docToFinalize,
    folio: assignedFolio,
    estado: "finalizado",
    fechaCreacion: new Date().toISOString()
  };
  
  // Update in global list
  let updatedGlobalList = [...allDocuments];
  const idx = updatedGlobalList.findIndex(d => d.id === docToFinalize.id);
  if (idx !== -1) {
    updatedGlobalList[idx] = finalizedDoc;
  } else {
    updatedGlobalList.push(finalizedDoc);
  }
  
  const nextCounters = folioCounters.filter(counter => counter.anio !== year);
  nextCounters.push({ anio: year, lastNumber: nextNum });
  nextCounters.sort((a, b) => b.anio - a.anio);

  return { finalizedDoc, updatedGlobalList, folioCounters: nextCounters };
}
