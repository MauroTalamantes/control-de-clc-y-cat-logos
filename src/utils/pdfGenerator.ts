/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from "jspdf";
import { CLCDocument } from "../types";

export function downloadDocPDF(doc: CLCDocument) {
  // Use landscape orientation since it matches the image
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter" // Letter: 279.4 x 215.9 mm
  });

  const pageWidth = 279.4;
  const pageHeight = 215.9;

  // Let's set some bounds and padding
  const marginX = 10;
  const marginY = 10;
  const contentWidth = pageWidth - (marginX * 2); // 259.4 mm

  // Helper for drawing grid blocks
  pdf.setDrawColor(180, 180, 180);
  pdf.setLineWidth(0.2);

  // 1. Header Row
  // Header Logo Box Placeholder
  pdf.rect(marginX, marginY, 40, 22);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("Ayuntamiento de", marginX + 2, marginY + 6);
  pdf.setFontSize(14);
  pdf.setTextColor(110, 40, 40); // Guadalupe dark red brown color
  pdf.text("Guadalupe", marginX + 2, marginY + 12);
  pdf.setFontSize(7);
  pdf.setTextColor(100, 100, 100);
  pdf.text("2024 | 2027", marginX + 2, marginY + 17);

  // Header Title Box
  pdf.rect(marginX + 40, marginY, 160, 22);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Cuenta por liquidar certificada para el", marginX + 45, marginY + 9);
  pdf.text("registro del ejercicio presupuestario", marginX + 45, marginY + 16);

  // Header QR / Folio Box
  pdf.rect(marginX + 200, marginY, 59.4, 22);
  
  // Fake QR Code drawing (little nested squares)
  pdf.setDrawColor(20, 20, 20);
  pdf.setFillColor(40, 40, 40);
  // Outer QR locator blocks
  pdf.rect(marginX + 204, marginY + 3, 4, 4);
  pdf.rect(marginX + 214, marginY + 3, 4, 4);
  pdf.rect(marginX + 204, marginY + 13, 4, 4);
  // Random small dots
  pdf.rect(marginX + 210, marginY + 6, 2, 1);
  pdf.rect(marginX + 212, marginY + 10, 1, 2);
  pdf.rect(marginX + 216, marginY + 12, 1, 1);
  pdf.rect(marginX + 209, marginY + 15, 3, 2);

  // Folio Label & Value
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(210, 40, 40); // Red
  const docFolio = doc.folio || "BORRADOR";
  pdf.text(docFolio, marginX + 224, marginY + 12);

  // Reset text color to gray/black
  pdf.setTextColor(40, 40, 40);

  // Spacer
  let currY = marginY + 22 + 4;

  // 2. Metadata Block Row 1 (Unidad Administrativa, Banco, Cuenta, Clabe)
  // Sub-header tags
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 100, 100);
  pdf.text("Unidad Administrativa", marginX + 2, currY + 4);
  pdf.text("Banco:", marginX + 112, currY + 4);
  pdf.text("Cuenta:", marginX + 152, currY + 4);
  pdf.text("Clabe:", marginX + 192, currY + 4);

  // Values text
  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(20, 20, 20);
  pdf.text(doc.unidadNombre, marginX + 2, currY + 9, { maxWidth: 105 });
  pdf.text(doc.bancoNombre, marginX + 112, currY + 9);
  pdf.text(doc.bancoCuenta, marginX + 152, currY + 9);
  pdf.text(doc.bancoClabe, marginX + 192, currY + 9);

  // Draw grid rectangles
  pdf.setDrawColor(180, 180, 180);
  pdf.rect(marginX, currY, 110, 12); // Unidad
  pdf.rect(marginX + 110, currY, 40, 12); // Banco
  pdf.rect(marginX + 150, currY, 40, 12); // Cuenta
  pdf.rect(marginX + 190, currY, 69.4, 12); // Clabe

  currY += 12;

  // Metadata Block Row 2 (Clave de la unidad, Proveedor, R.F.C)
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 100, 100);
  pdf.text("Clave de la unidad administrativa", marginX + 2, currY + 4);
  pdf.text("Proveedor", marginX + 42, currY + 4);
  pdf.text("R.F.C", marginX + 192, currY + 4);

  pdf.setFontSize(9);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(210, 40, 40); // Clave Red
  pdf.text(doc.unidadClave, marginX + 15, currY + 10);
  pdf.setTextColor(20, 20, 20);
  pdf.text(doc.proveedorNombre, marginX + 42, currY + 10);
  pdf.text(doc.proveedorRfc, marginX + 192, currY + 10);

  pdf.rect(marginX, currY, 40, 12); // Clave
  pdf.rect(marginX + 40, currY, 150, 12); // Proveedor
  pdf.rect(marginX + 190, currY, 69.4, 12); // RFC

  currY += 12 + 4; // Add spacer before budget items

  // 3. Grid Table of Budget Items
  // Table Headers
  const tableHeaders = [
    { name: "O.C.", x: marginX, w: 15 },
    { name: "Fuente", x: marginX + 15, w: 14 },
    { name: "Proyecto", x: marginX + 29, w: 18 },
    { name: "Gasto Clv", x: marginX + 47, w: 16 },
    { name: "Objeto Gasto Nombre", x: marginX + 63, w: 35 },
    { name: "Número de factura", x: marginX + 98, w: 55 },
    { name: "Fecha", x: marginX + 153, w: 22 },
    { name: "Sub Total", x: marginX + 175, w: 20 },
    { name: "Desc.", x: marginX + 195, w: 15 },
    { name: "I.V.A.", x: marginX + 210, w: 17 },
    { name: "I.S.R.", x: marginX + 227, w: 15 },
    { name: "Importe", x: marginX + 242, w: 17.4 }
  ];

  // Draw header boxes
  pdf.setFillColor(245, 245, 245);
  pdf.rect(marginX, currY, contentWidth, 10, "F");
  pdf.setDrawColor(180, 180, 180);
  pdf.rect(marginX, currY, contentWidth, 10, "S");

  tableHeaders.forEach(h => {
    // Draw vertical divider
    pdf.line(h.x, currY, h.x, currY + 10);
    
    // Draw text
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(60, 60, 60);
    // Alignments
    if (h.name === "Sub Total" || h.name === "Desc." || h.name === "I.V.A." || h.name === "I.S.R." || h.name === "Importe") {
      pdf.text(h.name, h.x + h.w - 2, currY + 6.5, { align: "right" });
    } else {
      pdf.text(h.name, h.x + 2, currY + 6.5);
    }
  });

  currY += 10;

  // Draw Items Rows
  let rSubtotal = 0;
  let rDescuento = 0;
  let rIva = 0;
  let rIsr = 0;
  let rImporte = 0;

  doc.items.forEach((item, index) => {
    rSubtotal += item.subTotal;
    rDescuento += item.descuento;
    rIva += item.iva;
    rIsr += item.isr;
    rImporte += item.importe;

    // Draw row container box
    pdf.rect(marginX, currY, contentWidth, 8);

    // Draw values
    pdf.setFontSize(7.5);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(40, 40, 40);

    // Dynamic vertical dividers & content
    tableHeaders.forEach(h => {
      pdf.line(h.x, currY, h.x, currY + 8);
    });

    // Draw content fields
    pdf.text(item.oc, marginX + 1.5, currY + 5.5);
    pdf.text(item.fuenteClave, marginX + 15 + 2, currY + 5.5);
    pdf.text(item.proyectoClave, marginX + 29 + 2, currY + 5.5);
    pdf.text(item.objetoClave, marginX + 47 + 2, currY + 5.5);
    
    // Object name in red bold to highlight
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(180, 50, 50);
    pdf.text(item.objetoNombre.toUpperCase(), marginX + 63 + 1.5, currY + 5.5, { maxWidth: 33 });
    
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(60, 60, 60);
    pdf.text(item.numFactura, marginX + 98 + 1.5, currY + 5.5, { maxWidth: 53 });
    
    // Format date beautifully
    const formattedDate = item.fechaFactura.split("-").reverse().join("/");
    pdf.text(formattedDate, marginX + 153 + 2, currY + 5.5);

    // Numeric calculations
    const formatCurrency = (val: number) => {
      return `$ ${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    pdf.text(formatCurrency(item.subTotal), marginX + 175 + 18, currY + 5.5, { align: "right" });
    pdf.text(item.descuento > 0 ? formatCurrency(item.descuento) : "$ -", marginX + 195 + 13, currY + 5.5, { align: "right" });
    pdf.text(formatCurrency(item.iva), marginX + 210 + 15, currY + 5.5, { align: "right" });
    pdf.text(item.isr > 0 ? formatCurrency(item.isr) : "$ -", marginX + 227 + 13, currY + 5.5, { align: "right" });
    
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(20, 20, 20);
    pdf.text(formatCurrency(item.importe), marginX + 242 + 16, currY + 5.5, { align: "right" });

    currY += 8;
  });

  // 4. Concept Box and Grand Total Row
  pdf.rect(marginX, currY, contentWidth, 10);
  // Vertical line separating concept from totals
  pdf.line(marginX + 175, currY, marginX + 175, currY + 10);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(40, 40, 40);
  pdf.text(`CONCEPTO: ${doc.concepto.toUpperCase()}`, marginX + 2, currY + 6.5, { maxWidth: 170 });

  // Totals column labels
  pdf.setFontSize(8.5);
  pdf.text("Total(Imp - ISR):", marginX + 177, currY + 6.5);
  
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  const formattedTotal = `$ ${rImporte.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  pdf.text(formattedTotal, marginX + 258, currY + 6.5, { align: "right" });

  currY += 10 + 8; // Spacer

  // 5. Signatures Block
  // Row for "Solicita:", "Autoriza:", "Autoriza:"
  const sigColWidth = contentWidth / 3;

  // First block (Solicita)
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(80, 80, 80);
  pdf.text("Solicita:", marginX + 2, currY);
  pdf.line(marginX + 2, currY + 12, marginX + sigColWidth - 4, currY + 12);
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  pdf.text(doc.solicitaNombre, marginX + (sigColWidth / 2) - 2, currY + 16, { align: "center", maxWidth: sigColWidth - 8 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(110, 110, 110);
  pdf.text(doc.solicitaPuesto.toUpperCase(), marginX + (sigColWidth / 2) - 2, currY + 20, { align: "center", maxWidth: sigColWidth - 8 });

  // Second block (Autoriza - Tesoreria)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Autoriza:", marginX + sigColWidth + 2, currY);
  pdf.line(marginX + sigColWidth + 2, currY + 12, marginX + (sigColWidth * 2) - 4, currY + 12);
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  pdf.text(doc.autoriza1Nombre, marginX + sigColWidth + (sigColWidth / 2) - 2, currY + 16, { align: "center", maxWidth: sigColWidth - 8 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(110, 110, 110);
  pdf.text(doc.autoriza1Puesto.toUpperCase(), marginX + sigColWidth + (sigColWidth / 2) - 2, currY + 20, { align: "center", maxWidth: sigColWidth - 8 });

  // Third block (Autoriza - Sindicatura)
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  pdf.text("Autoriza:", marginX + (sigColWidth * 2) + 2, currY);
  pdf.line(marginX + (sigColWidth * 2) + 2, currY + 12, marginX + (sigColWidth * 3) - 4, currY + 12);
  pdf.setFontSize(8);
  pdf.setTextColor(20, 20, 20);
  pdf.text(doc.autoriza2Nombre, marginX + (sigColWidth * 2) + (sigColWidth / 2) - 2, currY + 16, { align: "center", maxWidth: sigColWidth - 8 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(110, 110, 110);
  pdf.text(doc.autoriza2Puesto.toUpperCase(), marginX + (sigColWidth * 2) + (sigColWidth / 2) - 2, currY + 20, { align: "center", maxWidth: sigColWidth - 8 });

  currY += 28;

  // 6. Footer Legal block
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(40, 40, 40);
  pdf.text(`Elaboró: ${doc.elaboro.toUpperCase()}`, marginX, currY);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.5);
  pdf.setTextColor(130, 130, 130);
  const legal1 = "FUNDAMENTO LEGAL: LEY ORGÁNICA DEL MUNICIPIO EN SUS ARTÍCULOS 84 FRACCIÓN II FACULTA AL SÍNDICO MUNICIPAL PARA AUTORIZAR LOS GASTOS DE LA ADMINISTRACIÓN PÚBLICA MUNICIPAL ASÍ COMO VIGILAR";
  const legal2 = "EL MANEJO Y APLICACIÓN DE LOS RECURSOS DE ESTE AYUNTAMIENTO, VELANDO SIEMPRE POR LA LEGALIDAD, EFICIENCIA Y TRANSPARENCIA CONFORME A LA NORMATIVIDAD DE DISCIPLINA FINANCIERA VIGENTE.";
  pdf.text(legal1, marginX, currY + 3.5);
  pdf.text(legal2, marginX, currY + 5.5);

  // Download PDF
  const filename = `${doc.folio || "CLC_Borrador"}_${doc.proveedorNombre.replace(/\s+/g, "_")}.pdf`;
  pdf.save(filename);
}
