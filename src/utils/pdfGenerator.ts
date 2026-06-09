/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CLCDocument } from "../types";
import { generateExcelBuffer, getDocExportBaseName } from "./excelGenerator";

const MAX_PREVIEW_CACHE_ENTRIES = 10;
const previewBytesCache = new Map<string, Promise<Uint8Array>>();

function requireDesktopPdfSupport() {
  if (!window.clcFile) {
    throw new Error("La generación de PDF oficial está disponible en la aplicación de escritorio.");
  }
  return window.clcFile;
}

function getPreviewCacheKey(doc: CLCDocument) {
  return JSON.stringify(doc);
}

function getCachedPreviewBytes(doc: CLCDocument) {
  const cacheKey = getPreviewCacheKey(doc);
  const cached = previewBytesCache.get(cacheKey);
  if (cached) {
    previewBytesCache.delete(cacheKey);
    previewBytesCache.set(cacheKey, cached);
    return cached;
  }

  const previewPromise = (async () => {
    const clcFile = requireDesktopPdfSupport();
    const excelBuffer = await generateExcelBuffer(doc);
    const result = await clcFile.createPdf(excelBuffer);
    return result.bytes;
  })().catch(error => {
    previewBytesCache.delete(cacheKey);
    throw error;
  });

  previewBytesCache.set(cacheKey, previewPromise);
  while (previewBytesCache.size > MAX_PREVIEW_CACHE_ENTRIES) {
    const oldestKey = previewBytesCache.keys().next().value;
    if (oldestKey === undefined) break;
    previewBytesCache.delete(oldestKey);
  }

  return previewPromise;
}

export async function createDocPDFPreviewUrl(doc: CLCDocument) {
  const pdfBytes = await getCachedPreviewBytes(doc);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
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
