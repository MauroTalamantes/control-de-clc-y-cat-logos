/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from "xlsx";
import { CLCDocument } from "../types";

export function generateExcelBuffer(doc: CLCDocument) {
  // We will build an Array of Arrays (AOA) representing cell values.
  const aoa: any[][] = [];
  
  // Row 0-2: Header Block
  aoa.push(["", "", ""]); // Empty spacer row
  
  // Row 1: Header title block
  aoa.push([
    "Ayuntamiento de Guadalupe 2024-2027", 
    "", 
    "", 
    "CUENTA POR LIQUIDAR CERTIFICADA PARA EL REGISTRO DEL EJERCICIO PRESUPUESTARIO", 
    "", 
    "", 
    "", 
    "", 
    "", 
    "FOLIO:", 
    "", 
    doc.folio || "BORRADOR"
  ]);
  
  aoa.push(["", "", "", "", "", "", "", ""]); // Spacer row
  
  // Row 3: Meta headings
  aoa.push([
    "Unidad Administrativa", "", "", "", 
    "Banco:", "", 
    "Cuenta:", "", 
    "Clabe:", "", "", ""
  ]);
  
  // Row 4: Meta values
  aoa.push([
    doc.unidadNombre, "", "", "", 
    doc.bancoNombre, "", 
    doc.bancoCuenta, "", 
    doc.bancoClabe, "", "", ""
  ]);
  
  // Row 5: Meta headings 2
  aoa.push([
    "Clave de la unidad administrativa", "", 
    "Proveedor", "", "", "", "", "", 
    "R.F.C", "", "", ""
  ]);
  
  // Row 6: Meta values 2
  aoa.push([
    doc.unidadClave, "", 
    doc.proveedorNombre, "", "", "", "", "", 
    doc.proveedorRfc, "", "", ""
  ]);
  
  aoa.push(["", "", "", "", "", "", "", ""]); // Spacer row
  
  // Row 8: Grid Header Row 1
  aoa.push([
    "O.C.", 
    "Clasificación presupuestal", "", "", "", 
    "Número de factura", 
    "Fecha de factura", 
    "Sub Total", 
    "Desc.", 
    "I.V.A.", 
    "I.S.R.", 
    "Importe"
  ]);
  
  // Row 9: Grid Header Row 2 (Subcolumns)
  aoa.push([
    "", 
    "Fuente Clave", 
    "Proyecto Clave", 
    "Gasto Clave", 
    "Objeto Gasto Nombre", 
    "", 
    "", 
    "", 
    "", 
    "", 
    "", 
    ""
  ]);
  
  // Dynamic Items Rows
  let subtotalSum = 0;
  let descuentoSum = 0;
  let ivaSum = 0;
  let isrSum = 0;
  let importeSum = 0;
  
  const startItemRowIdx = aoa.length;
  
  doc.items.forEach(item => {
    subtotalSum += item.subTotal;
    descuentoSum += item.descuento;
    ivaSum += item.iva;
    isrSum += item.isr;
    importeSum += item.importe;
    
    aoa.push([
      item.oc,
      item.fuenteClave,
      item.proyectoClave,
      item.objetoClave,
      item.objetoNombre,
      item.numFactura,
      item.fechaFactura,
      item.subTotal,
      item.descuento,
      item.iva,
      item.isr,
      item.importe
    ]);
  });
  
  // Concept and Totals
  const conceptRowIdx = aoa.length;
  aoa.push([
    `CONCEPTO: ${doc.concepto.toUpperCase()}`, "", "", "", "", "", "",
    subtotalSum,
    descuentoSum,
    ivaSum,
    isrSum,
    importeSum
  ]);
  
  aoa.push(["", ""]); // Spacer
  
  // Signatures block headers
  aoa.push([
    "Solicita:", "", "", "", 
    "Autoriza:", "", "", "", 
    "Autoriza:", "", "", ""
  ]);
  
  // Signatures names
  aoa.push([
    doc.solicitaNombre, "", "", "", 
    doc.autoriza1Nombre, "", "", "", 
    doc.autoriza2Nombre, "", "", ""
  ]);
  
  // Signatures titles
  aoa.push([
    doc.solicitaPuesto, "", "", "", 
    doc.autoriza1Puesto, "", "", "", 
    doc.autoriza2Puesto, "", "", ""
  ]);
  
  aoa.push(["", ""]); // Spacer
  
  // Elaboro and Legal Foundation info
  aoa.push([`Elaboró: ${doc.elaboro || "Servicios Públicos Municipales"}`]);
  aoa.push([
    "FUNDAMENTO LEGAL: LEY ORGÁNICA DEL MUNICIPIO EN SUS ARTÍCULOS CORRESPONDIENTES FACULTA A LOS SÍNDICOS Y AUTORIDADES DEL AYUNTAMIENTO RESPECTIVO."
  ]);
  
  // Build sheet
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  
  // Setup cell merges (merging headings and sub-headings to match design perfectly)
  // Indexes are 0-based
  const merges = [
    // Header Row Merges
    { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }, // Ayuntamiento
    { s: { r: 1, c: 3 }, e: { r: 1, c: 8 } }, // Title
    { s: { r: 1, c: 11 }, e: { r: 1, c: 12 } }, // Folio value
    
    // Unidades Administrativas, Banco, etc. header merges
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } }, // Unidad Admin Title
    { s: { r: 3, c: 4 }, e: { r: 3, c: 5 } }, // Banco Title
    { s: { r: 3, c: 6 }, e: { r: 3, c: 7 } }, // Cuenta Title
    { s: { r: 3, c: 8 }, e: { r: 3, c: 11 } }, // Clabe Title
    
    { s: { r: 4, c: 0 }, e: { r: 4, c: 3 } }, // Unidad Admin value
    { s: { r: 4, c: 4 }, e: { r: 4, c: 5 } }, // Banco value
    { s: { r: 4, c: 6 }, e: { r: 4, c: 7 } }, // Cuenta value
    { s: { r: 4, c: 8 }, e: { r: 4, c: 11 } }, // Clabe value
    
    // Clave, Proveedor, RFC
    { s: { r: 5, c: 0 }, e: { r: 5, c: 1 } }, // Clave Title
    { s: { r: 5, c: 2 }, e: { r: 5, c: 7 } }, // Proveedor Title
    { s: { r: 5, c: 8 }, e: { r: 5, c: 11 } }, // RFC Title
    
    { s: { r: 6, c: 0 }, e: { r: 6, c: 1 } }, // Clave value
    { s: { r: 6, c: 2 }, e: { r: 6, c: 7 } }, // Proveedor value
    { s: { r: 6, c: 8 }, e: { r: 6, c: 11 } }, // RFC value
    
    // Grid Header classification merge
    { s: { r: 8, c: 1 }, e: { r: 8, c: 4 } }, // Clasificación presupuestal
    
    // Merge vertically for O.C, Invoice etc over the two budget subheader rows
    { s: { r: 8, c: 0 }, e: { r: 9, c: 0 } }, // OC
    { s: { r: 8, c: 5 }, e: { r: 9, c: 5 } }, // Factura Num
    { s: { r: 8, c: 6 }, e: { r: 9, c: 6 } }, // Fecha
    { s: { r: 8, c: 7 }, e: { r: 9, c: 7 } }, // Subtotal
    { s: { r: 8, c: 8 }, e: { r: 9, c: 8 } }, // Desc
    { s: { r: 8, c: 9 }, e: { r: 9, c: 9 } }, // IVA
    { s: { r: 8, c: 10 }, e: { r: 9, c: 10 } }, // ISR
    { s: { r: 8, c: 11 }, e: { r: 9, c: 11 } }, // Importe
    
    // Concept merges
    { s: { r: conceptRowIdx, c: 0 }, e: { r: conceptRowIdx, c: 6 } }, // Concept labels spans OC through Facturas
    
    // Signatures blocks
    { s: { r: conceptRowIdx + 2, c: 0 }, e: { r: conceptRowIdx + 2, c: 3 } }, // Solicita header
    { s: { r: conceptRowIdx + 2, c: 4 }, e: { r: conceptRowIdx + 2, c: 7 } }, // Autoriza 1 header
    { s: { r: conceptRowIdx + 2, c: 8 }, e: { r: conceptRowIdx + 2, c: 11 } }, // Autoriza 2 header
    
    { s: { r: conceptRowIdx + 3, c: 0 }, e: { r: conceptRowIdx + 3, c: 3 } }, // Solicita name
    { s: { r: conceptRowIdx + 3, c: 4 }, e: { r: conceptRowIdx + 3, c: 7 } }, // Autoriza 1 name
    { s: { r: conceptRowIdx + 3, c: 8 }, e: { r: conceptRowIdx + 3, c: 11 } }, // Autoriza 2 name
    
    { s: { r: conceptRowIdx + 4, c: 0 }, e: { r: conceptRowIdx + 4, c: 3 } }, // Solicita puesto
    { s: { r: conceptRowIdx + 4, c: 4 }, e: { r: conceptRowIdx + 4, c: 7 } }, // Autoriza 1 puesto
    { s: { r: conceptRowIdx + 4, c: 8 }, e: { r: conceptRowIdx + 4, c: 11 } } // Autoriza 2 puesto
  ];
  
  ws["!merges"] = merges;
  
  // Set elegant column widths
  ws["!cols"] = [
    { wch: 10 }, // A (OC)
    { wch: 12 }, // B (Fuente)
    { wch: 14 }, // C (Proyecto)
    { wch: 11 }, // D (Objeto Clave)
    { wch: 20 }, // E (Objeto Nombre)
    { wch: 36 }, // F (Factura Num)
    { wch: 12 }, // G (Fecha)
    { wch: 14 }, // H (Sub Total)
    { wch: 10 }, // I (Descuento)
    { wch: 12 }, // J (IVA)
    { wch: 10 }, // K (ISR)
    { wch: 14 }  // L (Importe)
  ];
  
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CLC Report");
  
  // Generate binary
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return wbout;
}

export function downloadDocExcel(doc: CLCDocument) {
  const buffer = generateExcelBuffer(doc);
  const blob = new Blob([buffer], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileName = `${doc.folio || "CLC_Borrador"}_${doc.proveedorNombre.replace(/\s+/g, "_")}.xlsx`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
