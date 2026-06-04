const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

// The app is form/report oriented and does not need GPU rendering. Some Windows
// graphics drivers can leave Chromium's accelerated surface stale until the
// window is minimized or restored, which makes the UI appear to stop accepting clicks.
if (process.platform === "win32") {
  app.disableHardwareAcceleration();
}

const isDev = !app.isPackaged;

function getDefaultDataPath() {
  return path.join(app.getPath("userData"), "clc-data.json");
}

function repaintWindow(window) {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.invalidate();
  }
}

function getDialogWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || undefined;
}

function normalizeDialogMessage(message) {
  return typeof message === "string" ? message : String(message ?? "");
}

function showMessageBoxSyncForEvent(event, options) {
  const parentWindow = getDialogWindow(event);
  return parentWindow
    ? dialog.showMessageBoxSync(parentWindow, options)
    : dialog.showMessageBoxSync(options);
}

function normalizeExcelFileName(fileName) {
  const rawName = typeof fileName === "string" ? fileName.replace(/\.xlsx$/i, "") : "CLC";
  const safeName = rawName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return `${safeName || "CLC"}.xlsx`;
}

function normalizePdfFileName(fileName) {
  const rawName = typeof fileName === "string" ? fileName.replace(/\.pdf$/i, "") : "CLC";
  const safeName = rawName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 180);
  return `${safeName || "CLC"}.pdf`;
}

function getFileBuffer(bytes) {
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(bytes);
  }
  throw new TypeError("Excel file bytes are required.");
}

function getTemporaryExportPaths() {
  const exportDir = path.join(app.getPath("temp"), "control-clc-exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const baseName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    xlsxPath: path.join(exportDir, `${baseName}.xlsx`),
    pdfPath: path.join(exportDir, `${baseName}.pdf`)
  };
}

async function removeTemporaryExport(paths) {
  await Promise.all(
    [paths.xlsxPath, paths.pdfPath].map(async filePath => {
      try {
        await fs.promises.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") console.warn("Could not remove temporary export file.", error);
      }
    })
  );
}

async function convertExcelFileToPdf(xlsxPath, pdfPath) {
  const powershellLiteral = value => `'${String(value).replace(/'/g, "''")}'`;
  const script = `
$ErrorActionPreference = 'Stop'
$xlsxPath = ${powershellLiteral(xlsxPath)}
$pdfPath = ${powershellLiteral(pdfPath)}
$excel = $null
$workbook = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($xlsxPath, 0, $true)
  $workbook.ExportAsFixedFormat(0, $pdfPath)
}
finally {
  if ($workbook -ne $null) {
    $workbook.Close($false)
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook)
  }
  if ($excel -ne $null) {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
`;
  const encodedCommand = Buffer.from(script, "utf16le").toString("base64");

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodedCommand],
    { windowsHide: true, timeout: 120000 }
  );

  if (!fs.existsSync(pdfPath)) {
    throw new Error("Microsoft Excel no generó el archivo PDF.");
  }
}

async function createPdfBufferFromExcel(bytes) {
  const paths = getTemporaryExportPaths();
  try {
    await fs.promises.writeFile(paths.xlsxPath, getFileBuffer(bytes));
    await removeMarkOfTheWeb(paths.xlsxPath);
    await convertExcelFileToPdf(paths.xlsxPath, paths.pdfPath);
    return await fs.promises.readFile(paths.pdfPath);
  } catch (error) {
    throw new Error(`No se pudo convertir el formato de Excel a PDF. Verifica que Microsoft Excel esté instalado. ${error.message || ""}`.trim());
  } finally {
    await removeTemporaryExport(paths);
  }
}

async function removeMarkOfTheWeb(filePath) {
  if (process.platform !== "win32") return;
  try {
    await fs.promises.unlink(`${filePath}:Zone.Identifier`);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Could not remove Zone.Identifier from generated Excel file.", error);
    }
  }
}

function createInitialData() {
  return {
    catalogs: null,
    documents: [],
    folioCounters: [],
    dataFilePath: getDefaultDataPath()
  };
}

function ensureDataFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(createInitialData(), null, 2), "utf8");
  }
}

function readStore(filePath = getDefaultDataPath()) {
  ensureDataFile(filePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return {
      catalogs: parsed.catalogs ?? null,
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      folioCounters: Array.isArray(parsed.folioCounters) ? parsed.folioCounters : [],
      dataFilePath: filePath
    };
  } catch {
    return { ...createInitialData(), dataFilePath: filePath };
  }
}

function writeStore(nextStore, filePath = getDefaultDataPath()) {
  const normalized = {
    catalogs: nextStore.catalogs ?? null,
    documents: Array.isArray(nextStore.documents) ? nextStore.documents : [],
    folioCounters: Array.isArray(nextStore.folioCounters) ? nextStore.folioCounters : [],
    dataFilePath: filePath
  };
  ensureDataFile(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
  return normalized;
}

function getDocumentYear(document) {
  return document?.["año"] || document?.["aÃ±o"] || document?.anio || new Date().getFullYear();
}

function getHighestFolioNumber(allDocuments, year) {
  const yearDocs = allDocuments.filter(doc => getDocumentYear(doc) === year && doc.estado === "finalizado");
  return yearDocs.reduce((max, doc) => {
    const match = String(doc.folio || "").match(/CLC-(\d+)\/\d+/);
    return Math.max(max, match ? Number.parseInt(match[1], 10) : 0);
  }, 0);
}

function assignFolio(docToFinalize, allDocuments, folioCounters) {
  const year = getDocumentYear(docToFinalize);
  const maxNumber = getHighestFolioNumber(allDocuments, year);
  const configuredLastNumber = folioCounters.find(counter => counter.anio === year)?.lastNumber || 0;
  const nextNumber = Math.max(maxNumber, configuredLastNumber) + 1;
  const assignedFolio = `CLC-${String(nextNumber).padStart(3, "0")}/${year}`;
  const finalizedDoc = {
    ...docToFinalize,
    folio: assignedFolio,
    estado: "finalizado",
    fechaCreacion: new Date().toISOString()
  };
  const updatedDocuments = [...allDocuments];
  const docIndex = updatedDocuments.findIndex(doc => doc.id === docToFinalize.id);
  if (docIndex >= 0) updatedDocuments[docIndex] = finalizedDoc;
  else updatedDocuments.push(finalizedDoc);
  const updatedFolioCounters = folioCounters.filter(counter => counter.anio !== year);
  updatedFolioCounters.push({ anio: year, lastNumber: nextNumber });
  updatedFolioCounters.sort((a, b) => b.anio - a.anio);
  return { finalizedDoc, updatedDocuments, folioCounters: updatedFolioCounters };
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "Control de CLC y Catalogos",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true
    }
  });
  mainWindow.removeMenu();

  if (isDev) {
    mainWindow.loadURL("http://localhost:3001");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("focus", () => repaintWindow(mainWindow));
  mainWindow.on("restore", () => repaintWindow(mainWindow));
  mainWindow.on("unresponsive", () => {
    console.error("The main window renderer became unresponsive.");
  });
  mainWindow.on("responsive", () => {
    console.info("The main window renderer became responsive again.");
    repaintWindow(mainWindow);
  });
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("The main window renderer process ended.", details);
  });
}

app.whenReady().then(() => {
  ipcMain.on("clc-dialog:alert", (event, message) => {
    showMessageBoxSyncForEvent(event, {
      type: "info",
      buttons: ["Aceptar"],
      defaultId: 0,
      message: normalizeDialogMessage(message)
    });
    event.returnValue = true;
  });

  ipcMain.on("clc-dialog:confirm", (event, message) => {
    const selectedButton = showMessageBoxSyncForEvent(event, {
      type: "question",
      buttons: ["Cancelar", "Aceptar"],
      cancelId: 0,
      defaultId: 1,
      message: normalizeDialogMessage(message)
    });
    event.returnValue = selectedButton === 1;
  });

  ipcMain.handle("clc-store:get", () => readStore());

  ipcMain.handle("clc-store:save-catalogs", (_event, catalogs) => {
    const current = readStore();
    return writeStore({ ...current, catalogs });
  });

  ipcMain.handle("clc-store:save-documents", (_event, documents) => {
    const current = readStore();
    return writeStore({ ...current, documents });
  });

  ipcMain.handle("clc-store:finalize-document", (_event, docToFinalize) => {
    const current = readStore();
    const { finalizedDoc, updatedDocuments, folioCounters } = assignFolio(
      docToFinalize,
      current.documents,
      current.folioCounters
    );
    const store = writeStore({ ...current, documents: updatedDocuments, folioCounters });
    return { finalizedDoc, documents: store.documents, folioCounters: store.folioCounters };
  });

  ipcMain.handle("clc-store:set-next-folio-number", (_event, payload) => {
    const year = Number(payload?.anio);
    const nextNumber = Number(payload?.nextNumber);
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new Error("El ejercicio del folio no es valido.");
    }
    if (!Number.isInteger(nextNumber) || nextNumber < 1) {
      throw new Error("El siguiente numero de folio debe ser mayor que cero.");
    }

    const current = readStore();
    const highestExisting = getHighestFolioNumber(current.documents, year);
    if (nextNumber <= highestExisting) {
      throw new Error(`El siguiente folio debe ser mayor que CLC-${String(highestExisting).padStart(3, "0")}/${year}.`);
    }

    const folioCounters = current.folioCounters.filter(counter => counter.anio !== year);
    folioCounters.push({ anio: year, lastNumber: nextNumber - 1 });
    folioCounters.sort((a, b) => b.anio - a.anio);
    return writeStore({ ...current, folioCounters });
  });

  ipcMain.handle("clc-store:select-data-folder", async () => {
    const result = await dialog.showOpenDialog({
      title: "Seleccionar carpeta de datos CLC",
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return readStore();
    const nextPath = path.join(result.filePaths[0], "clc-data.json");
    const current = readStore();
    return writeStore(current, nextPath);
  });

  ipcMain.handle("clc-file:save-excel", async (event, payload) => {
    const fileName = normalizeExcelFileName(payload?.fileName);
    const fileBuffer = getFileBuffer(payload?.bytes);
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Guardar archivo Excel",
      defaultPath: path.join(app.getPath("downloads"), fileName),
      filters: [{ name: "Libro de Excel", extensions: ["xlsx"] }]
    };
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) return { canceled: true };

    const filePath = result.filePath.toLowerCase().endsWith(".xlsx")
      ? result.filePath
      : `${result.filePath}.xlsx`;
    await fs.promises.writeFile(filePath, fileBuffer);
    await removeMarkOfTheWeb(filePath);
    if (payload?.openAfterSave) {
      const openError = await shell.openPath(filePath);
      if (openError) throw new Error(openError);
    }
    return { canceled: false, filePath };
  });

  ipcMain.handle("clc-file:create-pdf", async (_event, payload) => {
    const pdfBuffer = await createPdfBufferFromExcel(payload?.bytes);
    return { bytes: pdfBuffer };
  });

  ipcMain.handle("clc-file:save-pdf", async (event, payload) => {
    const fileName = normalizePdfFileName(payload?.fileName);
    const pdfBuffer = await createPdfBufferFromExcel(payload?.bytes);
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const options = {
      title: "Guardar archivo PDF",
      defaultPath: path.join(app.getPath("downloads"), fileName),
      filters: [{ name: "Documento PDF", extensions: ["pdf"] }]
    };
    const result = parentWindow
      ? await dialog.showSaveDialog(parentWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) return { canceled: true };

    const filePath = result.filePath.toLowerCase().endsWith(".pdf")
      ? result.filePath
      : `${result.filePath}.pdf`;
    await fs.promises.writeFile(filePath, pdfBuffer);
    if (payload?.openAfterSave) {
      const openError = await shell.openPath(filePath);
      if (openError) throw new Error(openError);
    }
    return { canceled: false, filePath };
  });

  ipcMain.handle("clc-file:print-pdf", async (event, payload) => {
    const pdfBuffer = await createPdfBufferFromExcel(payload?.bytes);
    const paths = getTemporaryExportPaths();
    await fs.promises.writeFile(paths.pdfPath, pdfBuffer);

    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const printWindow = new BrowserWindow({
      show: false,
      parent: parentWindow || undefined,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        plugins: true
      }
    });

    try {
      await printWindow.loadURL(pathToFileURL(paths.pdfPath).toString());
      await new Promise((resolve, reject) => {
        printWindow.webContents.print(
          { silent: false, printBackground: true },
          (success, failureReason) => {
            if (success) resolve();
            else reject(new Error(failureReason || "No se pudo imprimir el PDF."));
          }
        );
      });
      return { printed: true };
    } finally {
      if (!printWindow.isDestroyed()) printWindow.close();
      await removeTemporaryExport(paths);
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
