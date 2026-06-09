/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CLCDocument } from "../types";
import { generateExcelBuffer, getDocExportBaseName } from "./excelGenerator";

const MAX_PREVIEW_CACHE_ENTRIES = 6;
const MAX_PREVIEW_CACHE_BYTES = 16 * 1024 * 1024;

type PreviewCacheEntry = {
  promise: Promise<Uint8Array>;
  byteLength: number;
  settled: boolean;
};

const previewBytesCache = new Map<string, PreviewCacheEntry>();
let previewBytesCacheSize = 0;

function requireDesktopPdfSupport() {
  if (!window.clcFile) {
    throw new Error("La generación de PDF oficial está disponible en la aplicación de escritorio.");
  }
  return window.clcFile;
}

function getPreviewCacheKey(doc: CLCDocument) {
  return JSON.stringify(doc);
}

function prunePreviewBytesCache(protectedKey: string) {
  while (
    previewBytesCache.size > MAX_PREVIEW_CACHE_ENTRIES ||
    previewBytesCacheSize > MAX_PREVIEW_CACHE_BYTES
  ) {
    const oldest = Array.from(previewBytesCache.entries()).find(
      ([key, entry]) => key !== protectedKey && entry.settled
    );
    if (!oldest) break;

    const [oldestKey, oldestEntry] = oldest;
    previewBytesCache.delete(oldestKey);
    previewBytesCacheSize -= oldestEntry.byteLength;
  }
}

function getCachedPreviewBytes(doc: CLCDocument) {
  const cacheKey = getPreviewCacheKey(doc);
  const cached = previewBytesCache.get(cacheKey);
  if (cached) {
    previewBytesCache.delete(cacheKey);
    previewBytesCache.set(cacheKey, cached);
    return cached.promise;
  }

  let entry: PreviewCacheEntry;
  const previewPromise = (async () => {
    const clcFile = requireDesktopPdfSupport();
    const excelBuffer = await generateExcelBuffer(doc);
    const result = await clcFile.createPdf(excelBuffer);
    return result.bytes;
  })()
    .then(bytes => {
      entry.settled = true;
      entry.byteLength = bytes.byteLength;
      previewBytesCacheSize += bytes.byteLength;
      prunePreviewBytesCache(cacheKey);
      return bytes;
    })
    .catch(error => {
      if (previewBytesCache.get(cacheKey) === entry) {
        previewBytesCache.delete(cacheKey);
        previewBytesCacheSize -= entry.byteLength;
      }
      throw error;
    });

  entry = { promise: previewPromise, byteLength: 0, settled: false };
  previewBytesCache.set(cacheKey, entry);
  prunePreviewBytesCache(cacheKey);

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
