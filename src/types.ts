/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AdministrativeUnit {
  id: string; // e.g. "530"
  clave: string; // e.g. "530"
  nombre: string; // e.g. "SECRETARÍA DE SERVICIOS PUBLICOS MUNICIPALES"
  elaboro: string; // e.g. "SERVICIOS PUBLICOS MUNICIPALES"
}

export interface Bank {
  id: string;
  nombre: string; // e.g. "SANTANDER"
  cuenta: string; // e.g. "65509270940"
  clabe: string; // e.g. "01493065509270940"
  providerId?: string;
  isDefault?: boolean;
  active?: boolean;
}

export interface BankName {
  id: string;
  nombre: string; // e.g. "SANTANDER"
}

export interface Provider {
  id: string;
  nombre: string; // e.g. "MULTISERVICIO LA PLATA S.A. DE C.V."
  rfc: string; // e.g. "MPL020607CX5"
  active?: boolean;
}

export interface BudgetSource {
  id: string;
  clave: string; // e.g. "111"
  descripcion: string;
}

export interface BudgetProject {
  id: string;
  clave: string; // e.g. "304004"
  descripcion: string;
}

export interface ExpenseObject {
  id: string;
  clave: string; // e.g. "2611"
  nombre: string; // e.g. "GASOLINA"
}

export interface Signature {
  id: string;
  tipo: "Solicita" | "Autoriza 1" | "Autoriza 2" | "General";
  nombre: string; // e.g. "ING. JOSE ANTONIO FLORES BERUMEN"
  puesto: string; // e.g. "SECRETARIO DE SERVICIOS PUBLICOS MUNICIPALES"
}

export interface FolioCounter {
  anio: number;
  lastNumber: number;
}

export interface AppDocumentMetrics {
  totalDocuments: number;
  finalizedCount: number;
  draftCount: number;
  totalInvoiced: number;
}

export interface FolioYearSummary {
  anio: number;
  highestFinalizedFolioNumber: number;
  finalizedCount: number;
  draftCount: number;
  totalInvoiced: number;
}

export interface CLCItem {
  id: string;
  oc: string; // Orden de Compra
  fuenteClave: string; // e.g. "111"
  proyectoClave: string; // e.g. "304004"
  objetoClave: string; // e.g. "2611"
  objetoNombre: string; // e.g. "GASOLINA"
  numFactura: string;
  fechaFactura: string;
  subTotal: number;
  descuento: number;
  iva: number;
  isr: number;
  importe: number;
  cfdi?: CfdiMetadata;
}

export interface CfdiMetadata {
  uuid: string;
  version: string;
  serie: string;
  folio: string;
  rfcEmisor: string;
  nombreEmisor: string;
  rfcReceptor: string;
  concepto: string;
  moneda: string;
  formaPago: string;
  metodoPago: string;
  xmlHash: string;
}

export interface CLCDocument {
  id: string;
  folio: string; // e.g. "CLC-007/2026" (Assigned on finalize)
  año: number; // e.g. 2026
  unidadAdministrativaId: string;
  unidadClave: string;
  unidadNombre: string;
  bancoNombre: string;
  bancoCuenta: string;
  bancoClabe: string;
  proveedorNombre: string;
  proveedorRfc: string;
  items: CLCItem[];
  concepto: string; // e.g. "COMBUSTIBLE CORRESPONDIENTE AL MES DE ABRIL DEL 2026"
  solicitaNombre: string;
  solicitaPuesto: string;
  autoriza1Nombre: string;
  autoriza1Puesto: string;
  autoriza2Nombre: string;
  autoriza2Puesto: string;
  elaboro: string;
  fechaCreacion: string; // ISO String
  estado: "borrador" | "finalizado";
}

export interface AppCatalogs {
  defaultUnidadId?: string;
  unidades: AdministrativeUnit[];
  bancoNombres: BankName[];
  bancos: Bank[];
  proveedores: Provider[];
  fuentes: BudgetSource[];
  proyectos: BudgetProject[];
  objetos: ExpenseObject[];
  firmas: Signature[];
}
