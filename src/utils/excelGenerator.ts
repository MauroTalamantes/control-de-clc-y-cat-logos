/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import templateUrl from "../../FORMATO.xlsx?url";
import type { CLCDocument } from "../types";

const XLSX_MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const TEMPLATE_SHEET_NAME = "FORMATO";
const FIRST_ITEM_ROW = 10;
const BASE_CONCEPT_ROW = 11;
const BASE_SIGNATURE_LABEL_ROW = 14;
const BASE_SIGNATURE_NAME_ROW = 15;
const BASE_SIGNATURE_TITLE_ROW = 16;
const BASE_SIGNATURE_SPACER_ROW = 17;
const BASE_FOOTER_SPACER_ROW = 18;
const BASE_FOOTER_ROW = 19;
const BASE_DATE_ROW = 21;
const DEFAULT_ROW_HEIGHT = 15;
const SINGLE_CONCEPT_LIMIT = 1;
const EXTENDED_ONE_PAGE_LIMIT = 22;
const MULTIPAGE_CONCEPTS_PER_PAGE = 32;
const PRINTABLE_HEIGHT_AT_WIDTH_FIT = 645;
const POINTS_TO_CSS_PIXELS = 96 / 72;
const EXCEL_MAX_ROW_HEIGHT = 409.5;
const TEXT_LINE_HEIGHT_MULTIPLIER = 1.275;
const TEXT_HEIGHT_PADDING = 2.7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MONEY_COLUMN_WIDTH_PADDING = 1.5;
const EXCEL_MAX_COLUMN_WIDTH = 255;
const GENERATED_XLSX_MTIME = new Date(Date.UTC(2026, 0, 1));

let templateBufferPromise: Promise<ArrayBuffer> | null = null;

type XmlZip = Record<string, Uint8Array>;

interface FooterRowHeights {
  concept: number;
  spacerAfterConcept: number;
  signatureSeparator: number;
  signatureLabel: number;
  signatureName: number;
  signatureTitle: number;
  signatureSpacer: number;
  footerSpacer: number;
  footer: number;
  date: number;
}

interface PaginationPlan {
  visibleDetailRows: number;
  detailRowHeights: number[];
  conceptsPerPage: number;
  footerHeights: FooterRowHeights;
}

interface TextLayout {
  text: string | number | null | undefined;
  widthPoints: number;
  fontSize: number;
  fontFamily: string;
}

let textMeasureContext: CanvasRenderingContext2D | null | undefined;

function parseXml(xml: string, label: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error(`No se pudo leer el XML de ${label}.`);
  return doc;
}

function serializeXml(doc: XMLDocument) {
  return new XMLSerializer().serializeToString(doc);
}

function childElements(parent: Element, localName: string) {
  return Array.from(parent.childNodes).filter(
    (node): node is Element => node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === localName
  );
}

function findFirstElement(parent: ParentNode, localName: string) {
  return Array.from(parent.childNodes).find(
    (node): node is Element => node.nodeType === Node.ELEMENT_NODE && (node as Element).localName === localName
  );
}

function getSheetPath(zip: XmlZip, sheetName: string) {
  const workbook = parseXml(strFromU8(zip["xl/workbook.xml"]), "workbook.xml");
  const rels = parseXml(strFromU8(zip["xl/_rels/workbook.xml.rels"]), "workbook.xml.rels");
  const sheetsNode = findFirstElement(workbook.documentElement, "sheets");
  if (!sheetsNode) throw new Error("No se encontraron hojas en la plantilla.");

  const sheetNode = childElements(sheetsNode, "sheet").find(sheet => sheet.getAttribute("name") === sheetName);
  const relationId = sheetNode?.getAttributeNS(OFFICE_REL_NS, "id") || sheetNode?.getAttribute("r:id");
  if (!relationId) throw new Error(`No se encontro la hoja ${sheetName}.`);

  const relNode = childElements(rels.documentElement, "Relationship").find(rel => rel.getAttribute("Id") === relationId);
  const target = relNode?.getAttribute("Target");
  if (!target) throw new Error(`No se encontro el archivo XML de la hoja ${sheetName}.`);

  return target.startsWith("/") ? target.slice(1) : `xl/${target}`;
}

function getRelsPathForPart(partPath: string) {
  const slashIndex = partPath.lastIndexOf("/");
  const directory = slashIndex >= 0 ? partPath.slice(0, slashIndex) : "";
  const fileName = slashIndex >= 0 ? partPath.slice(slashIndex + 1) : partPath;
  return `${directory}/_rels/${fileName}.rels`;
}

function resolveRelatedPath(sourcePartPath: string, target: string) {
  if (target.startsWith("/")) return target.slice(1);

  const slashIndex = sourcePartPath.lastIndexOf("/");
  const sourceDirectory = slashIndex >= 0 ? sourcePartPath.slice(0, slashIndex) : "";
  const parts = `${sourceDirectory}/${target}`.split("/");
  const resolved: string[] = [];

  parts.forEach(part => {
    if (!part || part === ".") return;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  });

  return resolved.join("/");
}

function fillDrawingFolio(zip: XmlZip, sheetPath: string, folio: string) {
  const relsPath = getRelsPathForPart(sheetPath);
  if (!zip[relsPath]) return;

  const rels = parseXml(strFromU8(zip[relsPath]), relsPath);
  childElements(rels.documentElement, "Relationship")
    .filter(rel => rel.getAttribute("Type")?.endsWith("/drawing"))
    .forEach(rel => {
      const target = rel.getAttribute("Target");
      if (!target) return;

      const drawingPath = resolveRelatedPath(sheetPath, target);
      if (!zip[drawingPath]) return;

      const drawing = parseXml(strFromU8(zip[drawingPath]), drawingPath);
      const textNodes = Array.from(drawing.getElementsByTagNameNS(DRAWINGML_NS, "t"));
      let changed = false;

      textNodes.forEach(textNode => {
        const currentText = (textNode.textContent || "").trim();
        if (/^CLC-\d+\/\d{4}$/i.test(currentText)) {
          textNode.textContent = folio || "BORRADOR";
          changed = true;
        }
      });

      if (changed) zip[drawingPath] = strToU8(serializeXml(drawing));
    });
}

function removeCalcChain(zip: XmlZip) {
  delete zip["xl/calcChain.xml"];

  if (zip["xl/_rels/workbook.xml.rels"]) {
    const rels = parseXml(strFromU8(zip["xl/_rels/workbook.xml.rels"]), "workbook.xml.rels");
    childElements(rels.documentElement, "Relationship")
      .filter(rel => rel.getAttribute("Type")?.endsWith("/calcChain"))
      .forEach(rel => rel.parentNode?.removeChild(rel));
    zip["xl/_rels/workbook.xml.rels"] = strToU8(serializeXml(rels));
  }

  if (zip["[Content_Types].xml"]) {
    const types = parseXml(strFromU8(zip["[Content_Types].xml"]), "[Content_Types].xml");
    childElements(types.documentElement, "Override")
      .filter(node => node.getAttribute("PartName") === "/xl/calcChain.xml")
      .forEach(node => node.parentNode?.removeChild(node));
    zip["[Content_Types].xml"] = strToU8(serializeXml(types));
  }

  if (zip["xl/workbook.xml"]) {
    const workbook = parseXml(strFromU8(zip["xl/workbook.xml"]), "workbook.xml");
    const calcPr = findFirstElement(workbook.documentElement, "calcPr");
    if (calcPr) {
      calcPr.setAttribute("fullCalcOnLoad", "1");
      calcPr.setAttribute("forceFullCalc", "1");
    }
    zip["xl/workbook.xml"] = strToU8(serializeXml(workbook));
  }
}

function columnFromCellRef(ref: string) {
  return ref.replace(/\d+$/, "");
}

function rowFromCellRef(ref: string) {
  const match = ref.match(/\d+$/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function withRow(ref: string, row: number) {
  return `${columnFromCellRef(ref)}${row}`;
}

function parseRangeRows(ref: string) {
  const [startRef, endRef = startRef] = ref.split(":");
  return {
    startRef,
    endRef,
    startRow: rowFromCellRef(startRef),
    endRow: rowFromCellRef(endRef)
  };
}

function shiftRefRows(ref: string, afterRow: number, offset: number) {
  const [startRef, endRef] = ref.split(":");
  const shiftOne = (cellRef: string) => {
    const row = rowFromCellRef(cellRef);
    return row > afterRow ? withRow(cellRef, row + offset) : cellRef;
  };
  const shiftedStart = shiftOne(startRef);
  const shiftedEnd = endRef ? shiftOne(endRef) : undefined;
  return shiftedEnd ? `${shiftedStart}:${shiftedEnd}` : shiftedStart;
}

function updateCellReference(cell: Element, rowNumber: number) {
  const ref = cell.getAttribute("r");
  if (ref) cell.setAttribute("r", withRow(ref, rowNumber));
}

function setRowNumber(row: Element, rowNumber: number) {
  row.setAttribute("r", String(rowNumber));
  childElements(row, "c").forEach(cell => updateCellReference(cell, rowNumber));
}

function shiftRowsBelow(sheetDoc: XMLDocument, afterRow: number, offset: number) {
  if (offset <= 0) return;
  const rows = Array.from(sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "row"));
  rows
    .sort((a, b) => Number(b.getAttribute("r") || 0) - Number(a.getAttribute("r") || 0))
    .forEach(row => {
      const rowNumber = Number(row.getAttribute("r") || 0);
      if (rowNumber > afterRow) setRowNumber(row, rowNumber + offset);
    });
}

function getSheetData(sheetDoc: XMLDocument) {
  const sheetData = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "sheetData")[0];
  if (!sheetData) throw new Error("La hoja de formato no contiene sheetData.");
  return sheetData;
}

function getRow(sheetDoc: XMLDocument, rowNumber: number) {
  return Array.from(sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "row")).find(
    row => Number(row.getAttribute("r") || 0) === rowNumber
  );
}

function getCell(sheetDoc: XMLDocument, address: string) {
  const rowNumber = rowFromCellRef(address);
  const row = getRow(sheetDoc, rowNumber);
  if (!row) throw new Error(`No se encontro la fila ${rowNumber} en el formato.`);
  const cell = childElements(row, "c").find(node => node.getAttribute("r") === address);
  if (!cell) throw new Error(`No se encontro la celda ${address} en el formato.`);
  return cell;
}

function clearCell(cell: Element) {
  Array.from(cell.childNodes).forEach(child => cell.removeChild(child));
  cell.removeAttribute("t");
}

function clearCellValue(sheetDoc: XMLDocument, address: string) {
  clearCell(getCell(sheetDoc, address));
}

function setTextCell(sheetDoc: XMLDocument, address: string, value: string | number | null | undefined) {
  const cell = getCell(sheetDoc, address);
  const text = value == null ? "" : String(value);
  clearCell(cell);
  if (!text) return;

  cell.setAttribute("t", "inlineStr");
  const inlineString = sheetDoc.createElementNS(XLSX_MAIN_NS, "is");
  const textNode = sheetDoc.createElementNS(XLSX_MAIN_NS, "t");
  if (/^\s|\s$|\r|\n/.test(text)) textNode.setAttribute("xml:space", "preserve");
  textNode.textContent = text;
  inlineString.appendChild(textNode);
  cell.appendChild(inlineString);
}

function setNumberCell(sheetDoc: XMLDocument, address: string, value: number, formula?: string) {
  const cell = getCell(sheetDoc, address);
  clearCell(cell);
  if (formula) {
    const formulaNode = sheetDoc.createElementNS(XLSX_MAIN_NS, "f");
    formulaNode.textContent = formula;
    cell.appendChild(formulaNode);
  }
  const valueNode = sheetDoc.createElementNS(XLSX_MAIN_NS, "v");
  valueNode.textContent = Number.isFinite(value) ? String(value) : "0";
  cell.appendChild(valueNode);
}

function excelSerialFromDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return (value.getTime() - EXCEL_EPOCH_UTC) / MS_PER_DAY;
  }

  const raw = String(value);
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return (Date.UTC(Number(year), Number(month) - 1, Number(day)) - EXCEL_EPOCH_UTC) / MS_PER_DAY;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : (parsed.getTime() - EXCEL_EPOCH_UTC) / MS_PER_DAY;
}

function setDateCell(sheetDoc: XMLDocument, address: string, value: string | Date | null | undefined) {
  const serial = excelSerialFromDate(value);
  if (serial == null) {
    setTextCell(sheetDoc, address, "");
    return;
  }
  setNumberCell(sheetDoc, address, Number(serial.toFixed(8)));
}

function getColumnNumber(column: string) {
  return column
    .toUpperCase()
    .split("")
    .reduce((number, character) => number * 26 + character.charCodeAt(0) - 64, 0);
}

function getColumnDefinition(sheetDoc: XMLDocument, column: string) {
  const columnNumber = getColumnNumber(column);
  return Array.from(sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "col")).find(columnNode => {
    const min = Number(columnNode.getAttribute("min") || 0);
    const max = Number(columnNode.getAttribute("max") || 0);
    return min <= columnNumber && columnNumber <= max;
  });
}

function ensureColumnRangeWidth(sheetDoc: XMLDocument, startColumn: string, endColumn: string, requiredWidth: number) {
  const startColumnNumber = getColumnNumber(startColumn);
  const endColumnNumber = getColumnNumber(endColumn);
  const columnDefinitions: Element[] = [];

  for (let columnNumber = startColumnNumber; columnNumber <= endColumnNumber; columnNumber += 1) {
    const column = Array.from(sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "col")).find(columnNode => {
      const min = Number(columnNode.getAttribute("min") || 0);
      const max = Number(columnNode.getAttribute("max") || 0);
      return min <= columnNumber && columnNumber <= max;
    });
    if (!column || columnDefinitions.includes(column)) continue;
    columnDefinitions.push(column);
  }

  if (!columnDefinitions.length) return;

  const currentWidth = columnDefinitions.reduce(
    (total, column) => total + Number(column.getAttribute("width") || 0),
    0
  );
  if (currentWidth >= requiredWidth) return;

  const lastColumn = getColumnDefinition(sheetDoc, endColumn);
  if (!lastColumn) return;

  const lastColumnWidth = Number(lastColumn.getAttribute("width") || 0);
  const adjustedWidth = Math.min(EXCEL_MAX_COLUMN_WIDTH, lastColumnWidth + requiredWidth - currentWidth);
  lastColumn.setAttribute("width", String(adjustedWidth));
  lastColumn.setAttribute("customWidth", "1");
}

function getRequiredMoneyColumnWidth(values: number[]) {
  const longestDisplayValue = values.reduce((longest, value) => {
    const roundedValue = roundMoney(value);
    const amount = Math.abs(roundedValue).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const displayValue = roundedValue === 0 ? "$ -" : `${roundedValue < 0 ? "-" : ""}$ ${amount}`;
    return displayValue.length > longest.length ? displayValue : longest;
  }, "");

  return Math.min(EXCEL_MAX_COLUMN_WIDTH, longestDisplayValue.length + MONEY_COLUMN_WIDTH_PADDING);
}

// Expands only monetary columns whose generated values would otherwise render as #### in Excel.
function applyContentAwareMoneyColumnWidths(sheetDoc: XMLDocument, doc: CLCDocument) {
  const totalImporte = doc.items.reduce((sum, item) => sum + roundMoney(item.importe), 0);
  const moneyColumns = [
    { start: "R", end: "R", values: doc.items.map(item => item.subTotal) },
    { start: "S", end: "T", values: doc.items.map(item => item.descuento) },
    { start: "U", end: "U", values: doc.items.map(item => item.iva) },
    { start: "V", end: "V", values: doc.items.map(item => item.isr) },
    { start: "W", end: "W", values: [...doc.items.map(item => item.importe), totalImporte] }
  ];

  moneyColumns.forEach(column => {
    ensureColumnRangeWidth(sheetDoc, column.start, column.end, getRequiredMoneyColumnWidth(column.values));
  });
}

function cloneItemRows(sheetDoc: XMLDocument, itemCount: number) {
  const extraRows = Math.max(itemCount, 1) - 1;
  if (extraRows <= 0) return 0;

  const sheetData = getSheetData(sheetDoc);
  const templateRow = getRow(sheetDoc, FIRST_ITEM_ROW);
  if (!templateRow) throw new Error("No se encontro la fila base de partidas en el formato.");

  shiftRowsBelow(sheetDoc, FIRST_ITEM_ROW, extraRows);
  const shiftedConceptRow = getRow(sheetDoc, BASE_CONCEPT_ROW + extraRows);

  for (let offset = 1; offset <= extraRows; offset += 1) {
    const rowNumber = FIRST_ITEM_ROW + offset;
    const clonedRow = templateRow.cloneNode(true) as Element;
    setRowNumber(clonedRow, rowNumber);
    sheetData.insertBefore(clonedRow, shiftedConceptRow || templateRow.nextSibling);
  }

  return extraRows;
}

function adjustDimension(sheetDoc: XMLDocument, rowOffset: number) {
  const dimension = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "dimension")[0];
  if (!dimension) return;
  const ref = dimension.getAttribute("ref");
  if (!ref) return;
  const [startRef, endRef = startRef] = ref.split(":");
  dimension.setAttribute("ref", `${startRef}:${withRow(endRef, rowFromCellRef(endRef) + rowOffset)}`);
}

// Keeps horizontal fit but lets Excel paginate vertically instead of squeezing all rows.
function applyPrintSettings(sheetDoc: XMLDocument) {
  let sheetPr = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "sheetPr")[0];
  if (!sheetPr) {
    sheetPr = sheetDoc.createElementNS(XLSX_MAIN_NS, "sheetPr");
    const dimension = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "dimension")[0];
    sheetDoc.documentElement.insertBefore(sheetPr, dimension || sheetDoc.documentElement.firstChild);
  }

  let pageSetUpPr = childElements(sheetPr, "pageSetUpPr")[0];
  if (!pageSetUpPr) {
    pageSetUpPr = sheetDoc.createElementNS(XLSX_MAIN_NS, "pageSetUpPr");
    sheetPr.appendChild(pageSetUpPr);
  }
  pageSetUpPr.setAttribute("fitToPage", "1");

  let pageSetup = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "pageSetup")[0];
  if (!pageSetup) {
    pageSetup = sheetDoc.createElementNS(XLSX_MAIN_NS, "pageSetup");
    sheetDoc.documentElement.appendChild(pageSetup);
  }
  pageSetup.removeAttribute("scale");
  pageSetup.setAttribute("fitToWidth", "1");
  pageSetup.setAttribute("fitToHeight", "0");
  pageSetup.setAttribute("orientation", pageSetup.getAttribute("orientation") || "landscape");
}

function adjustWorkbookPrintArea(zip: XmlZip, sheetName: string, rowOffset: number) {
  if (!zip["xl/workbook.xml"]) return;

  const workbook = parseXml(strFromU8(zip["xl/workbook.xml"]), "workbook.xml");
  let definedNames = workbook.getElementsByTagNameNS(XLSX_MAIN_NS, "definedNames")[0];
  if (!definedNames) {
    definedNames = workbook.createElementNS(XLSX_MAIN_NS, "definedNames");
    workbook.documentElement.appendChild(definedNames);
  }

  let printArea = childElements(definedNames, "definedName").find(
    node => node.getAttribute("name") === "_xlnm.Print_Area" && node.getAttribute("localSheetId") === "0"
  );
  if (!printArea) {
    printArea = workbook.createElementNS(XLSX_MAIN_NS, "definedName");
    printArea.setAttribute("name", "_xlnm.Print_Area");
    printArea.setAttribute("localSheetId", "0");
    definedNames.appendChild(printArea);
  }

  const lastPrintRow = BASE_DATE_ROW + rowOffset;
  printArea.textContent = `${sheetName}!$A$1:$W$${lastPrintRow}`;
  zip["xl/workbook.xml"] = strToU8(serializeXml(workbook));
}

// Uses only the real detail rows; a single concept keeps the original template spacing.
function moveSignaturesToBottom(totalConceptos: number) {
  return Math.max(totalConceptos, 1);
}

// Progressively compacts detail rows as the number of concepts grows.
function getRowHeightByConceptCount(totalConceptos: number) {
  if (totalConceptos <= SINGLE_CONCEPT_LIMIT) return 59.25;
  if (totalConceptos <= 3) return 38;
  if (totalConceptos <= 5) return 24;
  if (totalConceptos <= 10) return 16;
  if (totalConceptos <= 16) return 12.75;
  if (totalConceptos <= EXTENDED_ONE_PAGE_LIMIT) return 10.5;
  return 11.25;
}

// Defines the manual pagination cadence for extended documents.
function getConceptsPerPage(totalConceptos: number) {
  if (totalConceptos <= EXTENDED_ONE_PAGE_LIMIT) return totalConceptos;
  return MULTIPAGE_CONCEPTS_PER_PAGE;
}

function getTextMeasureContext() {
  if (textMeasureContext !== undefined) return textMeasureContext;
  if (typeof document === "undefined") {
    textMeasureContext = null;
    return textMeasureContext;
  }

  textMeasureContext = document.createElement("canvas").getContext("2d");
  return textMeasureContext;
}

function measureTextWidthPoints(text: string, fontSize: number, fontFamily: string) {
  const context = getTextMeasureContext();
  if (!context) return text.length * fontSize * 0.62;

  context.font = `${fontSize}pt "${fontFamily}"`;
  return context.measureText(text).width / POINTS_TO_CSS_PIXELS;
}

function estimateWrappedLineCount(layout: TextLayout) {
  const text = layout.text == null ? "" : String(layout.text);
  if (!text) return 1;

  const availableWidth = Math.max(layout.widthPoints, 1);
  const spaceWidth = measureTextWidthPoints(" ", layout.fontSize, layout.fontFamily);
  let lineCount = 0;

  text.replace(/\r\n?/g, "\n").split("\n").forEach(paragraph => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    lineCount += 1;
    if (!words.length) return;

    let currentWidth = 0;
    words.forEach(word => {
      const wordWidth = measureTextWidthPoints(word, layout.fontSize, layout.fontFamily);

      if (wordWidth <= availableWidth) {
        const widthWithSpace = currentWidth ? currentWidth + spaceWidth + wordWidth : wordWidth;
        if (widthWithSpace <= availableWidth) {
          currentWidth = widthWithSpace;
        } else {
          lineCount += 1;
          currentWidth = wordWidth;
        }
        return;
      }

      if (currentWidth) {
        lineCount += 1;
        currentWidth = 0;
      }

      Array.from(word).forEach(character => {
        const characterWidth = measureTextWidthPoints(character, layout.fontSize, layout.fontFamily);
        if (currentWidth && currentWidth + characterWidth > availableWidth) {
          lineCount += 1;
          currentWidth = 0;
        }
        currentWidth += characterWidth;
      });
    });
  });

  return Math.max(lineCount, 1);
}

function getContentAwareRowHeight(minimumHeight: number, layouts: TextLayout[]) {
  const requiredHeight = layouts.reduce((height, layout) => {
    const lines = estimateWrappedLineCount(layout);
    return Math.max(height, lines * layout.fontSize * TEXT_LINE_HEIGHT_MULTIPLIER + TEXT_HEIGHT_PADDING);
  }, minimumHeight);

  return Math.min(EXCEL_MAX_ROW_HEIGHT, Math.ceil(requiredHeight * 4) / 4);
}

function getDetailRowHeights(doc: CLCDocument, baseHeight: number, visibleDetailRows: number) {
  return Array.from({ length: visibleDetailRows }, (_, index) => {
    const item = doc.items[index];
    if (!item) return baseHeight;

    return getContentAwareRowHeight(baseHeight, [
      { text: item.oc, widthPoints: 31.8, fontSize: 9, fontFamily: "Arial MT" },
      { text: item.fuenteClave, widthPoints: 54.6, fontSize: 8, fontFamily: "Arial" },
      { text: item.proyectoClave, widthPoints: 52.2, fontSize: 8, fontFamily: "Arial" },
      { text: item.objetoClave, widthPoints: 42, fontSize: 8, fontFamily: "Arial" },
      { text: item.objetoNombre, widthPoints: 180, fontSize: 8, fontFamily: "Arial" },
      { text: item.numFactura, widthPoints: 169.2, fontSize: 8, fontFamily: "Arial" }
    ]);
  });
}

// Compacts only footer/signature spacing, keeping the template styles and fonts intact.
function getFooterHeightsByConceptCount(totalConceptos: number): FooterRowHeights {
  if (totalConceptos <= SINGLE_CONCEPT_LIMIT) {
    return {
      concept: 48.75,
      spacerAfterConcept: 14.25,
      signatureSeparator: 12,
      signatureLabel: 12.75,
      signatureName: 76.5,
      signatureTitle: 25.5,
      signatureSpacer: 25.5,
      footerSpacer: 12.75,
      footer: 57,
      date: DEFAULT_ROW_HEIGHT
    };
  }

  if (totalConceptos <= 3) {
    return {
      concept: 42,
      spacerAfterConcept: 12,
      signatureSeparator: 10,
      signatureLabel: 12.75,
      signatureName: 62,
      signatureTitle: 24,
      signatureSpacer: 16,
      footerSpacer: 10,
      footer: 50,
      date: DEFAULT_ROW_HEIGHT
    };
  }

  if (totalConceptos <= 5) {
    return {
      concept: 42,
      spacerAfterConcept: 12,
      signatureSeparator: 10,
      signatureLabel: 12.75,
      signatureName: 58,
      signatureTitle: 22,
      signatureSpacer: 12,
      footerSpacer: 6,
      footer: 44,
      date: DEFAULT_ROW_HEIGHT
    };
  }

  if (totalConceptos <= 10) {
    return {
      concept: 42,
      spacerAfterConcept: 10,
      signatureSeparator: 8,
      signatureLabel: 12,
      signatureName: 62,
      signatureTitle: 23,
      signatureSpacer: 16,
      footerSpacer: 8,
      footer: 52,
      date: DEFAULT_ROW_HEIGHT
    };
  }

  if (totalConceptos <= 16) {
    return {
      concept: 38,
      spacerAfterConcept: 8,
      signatureSeparator: 6,
      signatureLabel: 11,
      signatureName: 50,
      signatureTitle: 21,
      signatureSpacer: 10,
      footerSpacer: 6,
      footer: 46,
      date: 12
    };
  }

  if (totalConceptos <= EXTENDED_ONE_PAGE_LIMIT) {
    return {
      concept: 30,
      spacerAfterConcept: 4,
      signatureSeparator: 4,
      signatureLabel: 10,
      signatureName: 34,
      signatureTitle: 18,
      signatureSpacer: 4,
      footerSpacer: 4,
      footer: 35,
      date: 12
    };
  }

  return {
    concept: 48.75,
    spacerAfterConcept: 14.25,
    signatureSeparator: 12,
    signatureLabel: 12.75,
    signatureName: 76.5,
    signatureTitle: 25.5,
    signatureSpacer: 25.5,
    footerSpacer: 12.75,
    footer: 57,
    date: DEFAULT_ROW_HEIGHT
  };
}

// Centralizes visible rows and content-aware heights for one generation.
function buildPaginationPlan(doc: CLCDocument): PaginationPlan {
  const totalConceptos = doc.items.length;
  const visibleDetailRows = moveSignaturesToBottom(totalConceptos);
  const baseDetailRowHeight = getRowHeightByConceptCount(totalConceptos);

  return {
    visibleDetailRows,
    detailRowHeights: getDetailRowHeights(doc, baseDetailRowHeight, visibleDetailRows),
    conceptsPerPage: getConceptsPerPage(totalConceptos),
    footerHeights: getFooterHeightsByConceptCount(totalConceptos)
  };
}

function setRowHeight(sheetDoc: XMLDocument, rowNumber: number, height: number) {
  const row = getRow(sheetDoc, rowNumber);
  if (!row) return;
  row.setAttribute("ht", String(height));
  row.setAttribute("customHeight", "1");
}

function getRowHeight(sheetDoc: XMLDocument, rowNumber: number) {
  const row = getRow(sheetDoc, rowNumber);
  const height = Number(row?.getAttribute("ht") || DEFAULT_ROW_HEIGHT);
  return Number.isFinite(height) && height > 0 ? height : DEFAULT_ROW_HEIGHT;
}

function sumRowHeights(sheetDoc: XMLDocument, startRow: number, endRow: number) {
  let total = 0;
  for (let row = startRow; row <= endRow; row += 1) total += getRowHeight(sheetDoc, row);
  return total;
}

// Applies deterministic content-aware heights because Excel cannot auto-fit merged cells reliably.
function applyPaginationRowHeights(
  sheetDoc: XMLDocument,
  pagination: PaginationPlan,
  rowOffset: number,
  doc: CLCDocument,
  footerText: string
) {
  setRowHeight(
    sheetDoc,
    3,
    getContentAwareRowHeight(getRowHeight(sheetDoc, 3), [
      { text: doc.unidadNombre, widthPoints: 284.4, fontSize: 9.5, fontFamily: "Arial" },
      { text: doc.bancoNombre, widthPoints: 108.6, fontSize: 9, fontFamily: "Arial" },
      { text: doc.bancoCuenta, widthPoints: 185.4, fontSize: 9, fontFamily: "Arial" },
      { text: doc.bancoClabe, widthPoints: 208.2, fontSize: 9, fontFamily: "Arial" }
    ])
  );
  setRowHeight(
    sheetDoc,
    5,
    getContentAwareRowHeight(getRowHeight(sheetDoc, 5), [
      { text: doc.proveedorNombre, widthPoints: 508.8, fontSize: 9, fontFamily: "Arial" },
      { text: doc.proveedorRfc, widthPoints: 208.2, fontSize: 9, fontFamily: "Arial" }
    ])
  );

  const lastItemRow = FIRST_ITEM_ROW + pagination.visibleDetailRows - 1;
  for (let row = FIRST_ITEM_ROW; row <= lastItemRow; row += 1) {
    setRowHeight(sheetDoc, row, pagination.detailRowHeights[row - FIRST_ITEM_ROW]);
  }

  setRowHeight(
    sheetDoc,
    BASE_CONCEPT_ROW + rowOffset,
    getContentAwareRowHeight(pagination.footerHeights.concept, [
      { text: doc.concepto.toUpperCase(), widthPoints: 664.8, fontSize: 8, fontFamily: "Arial MT" }
    ])
  );
  setRowHeight(sheetDoc, BASE_CONCEPT_ROW + rowOffset + 1, pagination.footerHeights.spacerAfterConcept);
  setRowHeight(sheetDoc, BASE_CONCEPT_ROW + rowOffset + 2, pagination.footerHeights.signatureSeparator);
  setRowHeight(sheetDoc, BASE_SIGNATURE_LABEL_ROW + rowOffset, pagination.footerHeights.signatureLabel);
  setRowHeight(
    sheetDoc,
    BASE_SIGNATURE_NAME_ROW + rowOffset,
    getContentAwareRowHeight(pagination.footerHeights.signatureName, [
      { text: doc.solicitaNombre, widthPoints: 284.4, fontSize: 10, fontFamily: "Times New Roman" },
      { text: doc.autoriza1Nombre, widthPoints: 219.6, fontSize: 10, fontFamily: "Times New Roman" },
      { text: doc.autoriza2Nombre, widthPoints: 290.4, fontSize: 10, fontFamily: "Times New Roman" }
    ])
  );
  setRowHeight(
    sheetDoc,
    BASE_SIGNATURE_TITLE_ROW + rowOffset,
    getContentAwareRowHeight(pagination.footerHeights.signatureTitle, [
      { text: doc.solicitaPuesto, widthPoints: 284.4, fontSize: 9, fontFamily: "Arial MT" },
      { text: doc.autoriza1Puesto, widthPoints: 219.6, fontSize: 9, fontFamily: "Arial MT" },
      { text: doc.autoriza2Puesto, widthPoints: 290.4, fontSize: 9, fontFamily: "Arial MT" }
    ])
  );
  setRowHeight(sheetDoc, BASE_SIGNATURE_SPACER_ROW + rowOffset, pagination.footerHeights.signatureSpacer);
  setRowHeight(sheetDoc, BASE_FOOTER_SPACER_ROW + rowOffset, pagination.footerHeights.footerSpacer);
  setRowHeight(
    sheetDoc,
    BASE_FOOTER_ROW + rowOffset,
    getContentAwareRowHeight(pagination.footerHeights.footer, [
      { text: footerText, widthPoints: 873, fontSize: 6, fontFamily: "Arial MT" }
    ])
  );
  setRowHeight(sheetDoc, BASE_DATE_ROW + rowOffset, pagination.footerHeights.date);
}

function getDetailPageBreakRows(sheetDoc: XMLDocument, pagination: PaginationPlan) {
  const breakRows: number[] = [];
  const lastItemRow = FIRST_ITEM_ROW + pagination.visibleDetailRows - 1;
  let currentPageHeight = sumRowHeights(sheetDoc, 1, FIRST_ITEM_ROW - 1);
  let conceptsOnCurrentPage = 0;

  for (let row = FIRST_ITEM_ROW; row <= lastItemRow; row += 1) {
    const rowHeight = getRowHeight(sheetDoc, row);
    const exceedsPageHeight = currentPageHeight + rowHeight > PRINTABLE_HEIGHT_AT_WIDTH_FIT;
    const exceedsConceptLimit = conceptsOnCurrentPage >= pagination.conceptsPerPage;

    if (row > FIRST_ITEM_ROW && (exceedsPageHeight || exceedsConceptLimit)) {
      breakRows.push(row);
      currentPageHeight = 0;
      conceptsOnCurrentPage = 0;
    }

    currentPageHeight += rowHeight;
    conceptsOnCurrentPage += 1;
  }

  return breakRows;
}

// Adds a final-page break before "Solicita:" when signatures, legal text and date
// no longer fit together on the current printed page.
function createSignaturePageIfNeeded(sheetDoc: XMLDocument, pagination: PaginationPlan, rowOffset: number) {
  const breakRows = getDetailPageBreakRows(sheetDoc, pagination);
  const protectedBlockStartRow = BASE_SIGNATURE_LABEL_ROW + rowOffset;
  const dateRow = BASE_DATE_ROW + rowOffset;
  const currentPageStartRow = breakRows.length ? breakRows[breakRows.length - 1] : 1;
  const heightBeforeProtectedBlock = sumRowHeights(sheetDoc, currentPageStartRow, protectedBlockStartRow - 1);
  const protectedBlockHeight = sumRowHeights(sheetDoc, protectedBlockStartRow, dateRow);

  if (heightBeforeProtectedBlock + protectedBlockHeight > PRINTABLE_HEIGHT_AT_WIDTH_FIT) {
    breakRows.push(protectedBlockStartRow);
  }

  return breakRows;
}

// Writes explicit Excel row breaks. breakRows are the first rows of the next page.
function insertManualPageBreaks(sheetDoc: XMLDocument, breakRows: number[]) {
  Array.from(sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "rowBreaks")).forEach(rowBreaks =>
    rowBreaks.parentNode?.removeChild(rowBreaks)
  );

  const uniqueBreakRows = Array.from(new Set(breakRows.filter(row => row > 1))).sort((a, b) => a - b);
  if (!uniqueBreakRows.length) return;

  const rowBreaks = sheetDoc.createElementNS(XLSX_MAIN_NS, "rowBreaks");
  rowBreaks.setAttribute("count", String(uniqueBreakRows.length));
  rowBreaks.setAttribute("manualBreakCount", String(uniqueBreakRows.length));

  uniqueBreakRows.forEach(row => {
    const breakNode = sheetDoc.createElementNS(XLSX_MAIN_NS, "brk");
    breakNode.setAttribute("id", String(row - 1));
    breakNode.setAttribute("max", "16383");
    breakNode.setAttribute("man", "1");
    rowBreaks.appendChild(breakNode);
  });

  const insertBefore =
    findFirstElement(sheetDoc.documentElement, "colBreaks") ||
    findFirstElement(sheetDoc.documentElement, "customProperties") ||
    findFirstElement(sheetDoc.documentElement, "drawing") ||
    findFirstElement(sheetDoc.documentElement, "legacyDrawingHF");
  sheetDoc.documentElement.insertBefore(rowBreaks, insertBefore || null);
}

function adjustMergeCells(sheetDoc: XMLDocument, rowOffset: number) {
  if (rowOffset <= 0) return;
  const mergeCells = sheetDoc.getElementsByTagNameNS(XLSX_MAIN_NS, "mergeCells")[0];
  if (!mergeCells) return;

  const originalRefs = childElements(mergeCells, "mergeCell")
    .map(node => node.getAttribute("ref"))
    .filter((ref): ref is string => Boolean(ref));

  childElements(mergeCells, "mergeCell").forEach(node => {
    const ref = node.getAttribute("ref");
    if (!ref) return;
    const { startRow } = parseRangeRows(ref);
    if (startRow > FIRST_ITEM_ROW) node.setAttribute("ref", shiftRefRows(ref, FIRST_ITEM_ROW, rowOffset));
  });

  originalRefs.forEach(ref => {
    const { startRef, endRef, startRow, endRow } = parseRangeRows(ref);
    if (startRow !== FIRST_ITEM_ROW || endRow !== FIRST_ITEM_ROW) return;

    for (let offset = 1; offset <= rowOffset; offset += 1) {
      const rowNumber = FIRST_ITEM_ROW + offset;
      const mergeCell = sheetDoc.createElementNS(XLSX_MAIN_NS, "mergeCell");
      mergeCell.setAttribute("ref", `${withRow(startRef, rowNumber)}:${withRow(endRef, rowNumber)}`);
      mergeCells.appendChild(mergeCell);
    }
  });

  mergeCells.setAttribute("count", String(childElements(mergeCells, "mergeCell").length));
}

function readSharedStrings(zip: XmlZip) {
  if (!zip["xl/sharedStrings.xml"]) return [];
  const sharedStrings = parseXml(strFromU8(zip["xl/sharedStrings.xml"]), "sharedStrings.xml");
  return Array.from(sharedStrings.getElementsByTagNameNS(XLSX_MAIN_NS, "si")).map(item => {
    return Array.from(item.getElementsByTagNameNS(XLSX_MAIN_NS, "t"))
      .map(textNode => textNode.textContent || "")
      .join("");
  });
}

function getCellText(sheetDoc: XMLDocument, sharedStrings: string[], address: string) {
  const cell = getCell(sheetDoc, address);
  const inlineText = Array.from(cell.getElementsByTagNameNS(XLSX_MAIN_NS, "t"))
    .map(textNode => textNode.textContent || "")
    .join("");
  if (inlineText) return inlineText;

  if (cell.getAttribute("t") === "s") {
    const index = Number(cell.getElementsByTagNameNS(XLSX_MAIN_NS, "v")[0]?.textContent || -1);
    return sharedStrings[index] || "";
  }

  return "";
}

function buildFooterText(originalFooterText: string, elaboro: string) {
  const legalStart = originalFooterText.indexOf("FUNDAMENTO LEGAL:");
  const legalText = legalStart >= 0 ? originalFooterText.slice(legalStart) : "";
  const label = originalFooterText.match(/^(.*?Elabor\S*:)/)?.[1] || "Elaboro:";
  return legalText ? `${label}   ${elaboro}\r\n${legalText}` : `${label}   ${elaboro}`;
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function fillGeneralData(sheetDoc: XMLDocument, doc: CLCDocument) {
  setTextCell(sheetDoc, "C3", doc.unidadNombre);
  setTextCell(sheetDoc, "M3", doc.bancoNombre);
  setTextCell(sheetDoc, "P3", doc.bancoCuenta);
  setTextCell(sheetDoc, "T3", doc.bancoClabe);
  setTextCell(sheetDoc, "C5", doc.unidadClave);
  setTextCell(sheetDoc, "H5", doc.proveedorNombre);
  setTextCell(sheetDoc, "T5", doc.proveedorRfc);
}

function fillItemRows(sheetDoc: XMLDocument, doc: CLCDocument, itemCount: number) {
  const items = doc.items.length ? doc.items : [];

  for (let index = 0; index < itemCount; index += 1) {
    const row = FIRST_ITEM_ROW + index;
    const item = items[index];

    setTextCell(sheetDoc, `C${row}`, item?.oc || "");
    setTextCell(sheetDoc, `E${row}`, item?.fuenteClave || "");
    setTextCell(sheetDoc, `F${row}`, item?.proyectoClave || "");
    setTextCell(sheetDoc, `G${row}`, item?.objetoClave || "");
    setTextCell(sheetDoc, `I${row}`, item?.objetoNombre || "");
    setTextCell(sheetDoc, `N${row}`, item?.numFactura || "");

    if (!item) {
      clearCellValue(sheetDoc, `Q${row}`);
      clearCellValue(sheetDoc, `R${row}`);
      clearCellValue(sheetDoc, `S${row}`);
      clearCellValue(sheetDoc, `U${row}`);
      clearCellValue(sheetDoc, `V${row}`);
      clearCellValue(sheetDoc, `W${row}`);
      continue;
    }

    setDateCell(sheetDoc, `Q${row}`, item?.fechaFactura || null);
    setNumberCell(sheetDoc, `R${row}`, roundMoney(item?.subTotal || 0));
    setNumberCell(sheetDoc, `S${row}`, roundMoney(item?.descuento || 0));
    setNumberCell(sheetDoc, `U${row}`, roundMoney(item?.iva || 0));
    setNumberCell(sheetDoc, `V${row}`, roundMoney(item?.isr || 0));
    setNumberCell(
      sheetDoc,
      `W${row}`,
      roundMoney(item?.importe || 0),
      `R${row}-S${row}+U${row}-V${row}`
    );
  }
}

function fillFooterData(
  sheetDoc: XMLDocument,
  sharedStrings: string[],
  doc: CLCDocument,
  rowOffset: number,
  itemCount: number
) {
  const conceptRow = BASE_CONCEPT_ROW + rowOffset;
  const signatureNameRow = BASE_SIGNATURE_NAME_ROW + rowOffset;
  const signatureTitleRow = BASE_SIGNATURE_TITLE_ROW + rowOffset;
  const footerRow = BASE_FOOTER_ROW + rowOffset;
  const dateRow = BASE_DATE_ROW + rowOffset;
  const lastItemRow = FIRST_ITEM_ROW + itemCount - 1;
  const totalImporte = doc.items.reduce((sum, item) => sum + roundMoney(item.importe), 0);
  const originalFooterText = getCellText(sheetDoc, sharedStrings, `C${footerRow}`);

  setTextCell(sheetDoc, `C${conceptRow}`, doc.concepto.toUpperCase());
  setNumberCell(sheetDoc, `W${conceptRow}`, roundMoney(totalImporte), `SUM(W${FIRST_ITEM_ROW}:W${lastItemRow})`);

  setTextCell(sheetDoc, `C${signatureNameRow}`, doc.solicitaNombre);
  setTextCell(sheetDoc, `L${signatureNameRow}`, doc.autoriza1Nombre);
  setTextCell(sheetDoc, `R${signatureNameRow}`, doc.autoriza2Nombre);
  setTextCell(sheetDoc, `C${signatureTitleRow}`, doc.solicitaPuesto);
  setTextCell(sheetDoc, `L${signatureTitleRow}`, doc.autoriza1Puesto);
  setTextCell(sheetDoc, `R${signatureTitleRow}`, doc.autoriza2Puesto);
  setTextCell(sheetDoc, `C${footerRow}`, buildFooterText(originalFooterText, doc.elaboro || ""));
  setDateCell(sheetDoc, `E${dateRow}`, doc.fechaCreacion || new Date());
}

async function loadTemplateBuffer() {
  if (!templateBufferPromise) {
    templateBufferPromise = fetch(templateUrl).then(response => {
      if (!response.ok) throw new Error("No se pudo cargar FORMATO.xlsx.");
      return response.arrayBuffer();
    });
  }
  return templateBufferPromise;
}

export async function generateExcelBuffer(doc: CLCDocument) {
  const templateBuffer = await loadTemplateBuffer();
  const zip = unzipSync(new Uint8Array(templateBuffer)) as XmlZip;
  const sheetPath = getSheetPath(zip, TEMPLATE_SHEET_NAME);
  const sheetDoc = parseXml(strFromU8(zip[sheetPath]), sheetPath);
  const sharedStrings = readSharedStrings(zip);
  const originalFooterText = getCellText(sheetDoc, sharedStrings, `C${BASE_FOOTER_ROW}`);
  const footerText = buildFooterText(originalFooterText, doc.elaboro || "");
  const pagination = buildPaginationPlan(doc);
  const itemCount = pagination.visibleDetailRows;
  const rowOffset = cloneItemRows(sheetDoc, itemCount);

  adjustDimension(sheetDoc, rowOffset);
  applyPrintSettings(sheetDoc);
  adjustWorkbookPrintArea(zip, TEMPLATE_SHEET_NAME, rowOffset);
  adjustMergeCells(sheetDoc, rowOffset);
  applyPaginationRowHeights(sheetDoc, pagination, rowOffset, doc, footerText);
  insertManualPageBreaks(sheetDoc, createSignaturePageIfNeeded(sheetDoc, pagination, rowOffset));
  fillGeneralData(sheetDoc, doc);
  fillItemRows(sheetDoc, doc, itemCount);
  fillFooterData(sheetDoc, sharedStrings, doc, rowOffset, itemCount);
  applyContentAwareMoneyColumnWidths(sheetDoc, doc);
  fillDrawingFolio(zip, sheetPath, doc.folio || "BORRADOR");

  zip[sheetPath] = strToU8(serializeXml(sheetDoc));
  removeCalcChain(zip);

  return zipSync(zip, { level: 6, mtime: GENERATED_XLSX_MTIME });
}

export function getDocExportBaseName(doc: CLCDocument) {
  return `${doc.folio || "CLC_Borrador"}_${doc.proveedorNombre.replace(/\s+/g, "_")}`;
}

export async function downloadDocExcel(doc: CLCDocument, options: { openAfterSave?: boolean } = {}) {
  try {
    const buffer = await generateExcelBuffer(doc);
    const fileName = `${getDocExportBaseName(doc)}.xlsx`;

    if (window.clcFile) {
      await window.clcFile.saveExcel(fileName, buffer, options);
      return;
    }

    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error generating Excel file", error);
    alert("No se pudo generar o guardar el archivo Excel con el formato.");
  }
}
