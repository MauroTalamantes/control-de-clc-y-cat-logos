/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CLCDocument } from "../types";
import { generateExcelBuffer, getDocExportBaseName } from "./excelGenerator";

function requireDesktopPdfSupport() {
  if (!window.clcFile) {
    throw new Error("La generación de PDF oficial está disponible en la aplicación de escritorio.");
  }
  return window.clcFile;
}

export async function createDocPDFPreviewUrl(doc: CLCDocument) {
  const clcFile = requireDesktopPdfSupport();
  const excelBuffer = await generateExcelBuffer(doc);
  const result = await clcFile.createPdf(excelBuffer);
  const blob = new Blob([result.bytes], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}

export async function downloadDocPDF(doc: CLCDocument, options: { openAfterSave?: boolean } = {}) {
  try {
    const clcFile = requireDesktopPdfSupport();
    const excelBuffer = await generateExcelBuffer(doc);
    await clcFile.savePdf(`${getDocExportBaseName(doc)}.pdf`, excelBuffer, options);
  } catch (error) {
    console.error("Error generating official PDF file", error);
    alert(error instanceof Error ? error.message : "No se pudo generar el PDF con el formato oficial.");
  }
}

export async function printDocPDF(doc: CLCDocument) {
  try {
    const clcFile = requireDesktopPdfSupport();
    const excelBuffer = await generateExcelBuffer(doc);
    await clcFile.printPdf(excelBuffer);
  } catch (error) {
    console.error("Error printing official PDF file", error);
    alert(error instanceof Error ? error.message : "No se pudo imprimir el PDF con el formato oficial.");
  }
}
