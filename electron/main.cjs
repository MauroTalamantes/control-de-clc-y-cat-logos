const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const AUTO_UPDATE_CHECK_DELAY_MS = 15_000;
const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const EXCEL_PDF_CONVERSION_TIMEOUT_MS = 120_000;
const EXCEL_PDF_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_EXCEL_PDF_CONVERSIONS_PER_WORKER = 100;
const EXCEL_PDF_WORKER_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked", "electron", "excel-pdf-worker.ps1")
  : path.join(__dirname, "excel-pdf-worker.ps1");
const MAX_PDF_CACHE_ENTRIES = 8;
const MAX_PDF_CACHE_BYTES = 32 * 1024 * 1024;
const pdfBufferCache = new Map();
const pendingPdfConversions = new Map();
let pdfBufferCacheBytes = 0;
let excelPdfWorkerState = null;

// The app is form/report oriented and does not need GPU rendering. Some Windows
// graphics drivers can leave Chromium's accelerated surface stale until the
// window is minimized or restored, which makes the UI appear to stop accepting clicks.
if (process.platform === "win32") {
  app.disableHardwareAcceleration();
}

const isDev = !app.isPackaged;
const appIconPath = path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");

if (process.platform === "win32") {
  app.setAppUserModelId("mx.gob.guadalupe.control-clc");
}

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

function showMessageBoxForWindow(window, options) {
  const parentWindow = window && !window.isDestroyed() ? window : undefined;
  return parentWindow
    ? dialog.showMessageBox(parentWindow, options)
    : dialog.showMessageBox(options);
}

function setupAutoUpdates(mainWindow) {
  if (isDev) return;

  let updateDialogOpen = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (...args) => console.info("[auto-update]", ...args),
    warn: (...args) => console.warn("[auto-update]", ...args),
    error: (...args) => console.error("[auto-update]", ...args)
  };

  autoUpdater.on("checking-for-update", () => {
    console.info("[auto-update] Checking for updates.");
  });
  autoUpdater.on("update-available", info => {
    console.info("[auto-update] Update available.", info?.version || "");
  });
  autoUpdater.on("update-not-available", info => {
    console.info("[auto-update] No update available.", info?.version || "");
  });
  autoUpdater.on("error", error => {
    console.error("[auto-update] Update error.", error);
  });
  autoUpdater.on("update-downloaded", async info => {
    if (updateDialogOpen) return;
    updateDialogOpen = true;
    try {
      const { response } = await showMessageBoxForWindow(mainWindow, {
        type: "info",
        buttons: ["Reiniciar ahora", "Despues"],
        defaultId: 0,
        cancelId: 1,
        message: "Actualizacion lista para instalar",
        detail: `Se descargo la version ${info?.version || "mas reciente"}. Reinicia la aplicacion para aplicar la actualizacion.`
      });
      if (response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    } finally {
      updateDialogOpen = false;
    }
  });

  const checkForUpdates = () => {
    if (mainWindow.isDestroyed()) return;
    autoUpdater.checkForUpdates().catch(error => {
      console.error("[auto-update] Could not check for updates.", error);
    });
  };

  setTimeout(checkForUpdates, AUTO_UPDATE_CHECK_DELAY_MS);
  const updateInterval = setInterval(checkForUpdates, AUTO_UPDATE_CHECK_INTERVAL_MS);
  if (typeof updateInterval.unref === "function") updateInterval.unref();
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

function failExcelPdfWorker(state, error) {
  if (!state.ready) state.rejectReady(error);
  for (const request of state.pending.values()) {
    clearTimeout(request.timeoutId);
    request.reject(error);
  }
  state.pending.clear();
  if (excelPdfWorkerState === state) excelPdfWorkerState = null;
}

function handleExcelPdfWorkerMessage(state, message) {
  if (message?.type === "ready") {
    state.ready = true;
    state.resolveReady(state);
    scheduleExcelPdfWorkerIdleShutdown(state);
    return;
  }

  if (message?.type === "fatal") {
    const error = new Error(message.error || "Microsoft Excel no pudo iniciar.");
    failExcelPdfWorker(state, error);
    if (!state.process.killed) state.process.kill();
    return;
  }

  if (message?.type !== "result") return;
  const requestId = String(message.id);
  const request = state.pending.get(requestId);
  if (!request) return;

  state.pending.delete(requestId);
  clearTimeout(request.timeoutId);
  state.completedConversions += 1;
  if (message.ok) request.resolve();
  else request.reject(new Error(message.error || "Microsoft Excel no pudo generar el PDF."));

  if (state.pending.size === 0) {
    if (state.completedConversions >= MAX_EXCEL_PDF_CONVERSIONS_PER_WORKER) {
      shutdownExcelPdfWorker(state);
    } else {
      scheduleExcelPdfWorkerIdleShutdown(state);
    }
  }
}

function consumeExcelPdfWorkerOutput(state, chunk) {
  state.outputBuffer += chunk;
  let newlineIndex = state.outputBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = state.outputBuffer.slice(0, newlineIndex).trim();
    state.outputBuffer = state.outputBuffer.slice(newlineIndex + 1);
    if (line) {
      try {
        handleExcelPdfWorkerMessage(state, JSON.parse(line));
      } catch (error) {
        console.warn("Could not parse Excel PDF worker response.", error);
      }
    }
    newlineIndex = state.outputBuffer.indexOf("\n");
  }
}

function ensureExcelPdfWorker() {
  if (excelPdfWorkerState) return excelPdfWorkerState.readyPromise;

  const workerProcess = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", EXCEL_PDF_WORKER_PATH],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] }
  );

  const state = {
    process: workerProcess,
    pending: new Map(),
    outputBuffer: "",
    stderr: "",
    ready: false,
    intentionalShutdown: false,
    requestId: 0,
    completedConversions: 0
  };
  state.readyPromise = new Promise((resolve, reject) => {
    state.resolveReady = resolve;
    state.rejectReady = reject;
  });
  excelPdfWorkerState = state;

  workerProcess.stdout.setEncoding("utf8");
  workerProcess.stdout.on("data", chunk => consumeExcelPdfWorkerOutput(state, chunk));
  workerProcess.stderr.setEncoding("utf8");
  workerProcess.stderr.on("data", chunk => {
    state.stderr += chunk;
  });
  workerProcess.on("error", error => {
    failExcelPdfWorker(state, error);
  });
  workerProcess.on("exit", (code, signal) => {
    if (state.shutdownTimer) clearTimeout(state.shutdownTimer);
    if (state.intentionalShutdown) {
      failExcelPdfWorker(state, new Error("El conversor de PDF se cerro."));
      return;
    }
    const details = state.stderr.trim();
    const suffix = details ? ` ${details}` : "";
    failExcelPdfWorker(
      state,
      new Error(`El conversor de PDF termino inesperadamente (${code ?? signal ?? "sin codigo"}).${suffix}`)
    );
  });

  return state.readyPromise;
}

async function convertExcelFileToPdf(xlsxPath, pdfPath) {
  const state = await ensureExcelPdfWorker();
  const requestId = String(++state.requestId);
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }

  await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      state.pending.delete(requestId);
      reject(new Error("Microsoft Excel excedio el tiempo limite para generar el PDF."));
      failExcelPdfWorker(state, new Error("El conversor de PDF dejo de responder."));
      if (!state.process.killed) state.process.kill();
    }, EXCEL_PDF_CONVERSION_TIMEOUT_MS);

    state.pending.set(requestId, { resolve, reject, timeoutId });
    state.process.stdin.write(
      `${JSON.stringify({ type: "convert", id: requestId, xlsxPath, pdfPath })}\n`,
      "utf8",
      error => {
        if (!error) return;
        state.pending.delete(requestId);
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });

  if (!fs.existsSync(pdfPath)) {
    throw new Error("Microsoft Excel no generó el archivo PDF.");
  }
}

function scheduleExcelPdfWorkerIdleShutdown(state) {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    if (state.pending.size === 0 && excelPdfWorkerState === state) {
      shutdownExcelPdfWorker(state);
    }
  }, EXCEL_PDF_IDLE_TIMEOUT_MS);
}

function shutdownExcelPdfWorker(workerState = excelPdfWorkerState) {
  const state = workerState;
  if (!state || state.intentionalShutdown) return;

  if (excelPdfWorkerState === state) excelPdfWorkerState = null;
  state.intentionalShutdown = true;
  if (state.idleTimer) clearTimeout(state.idleTimer);
  try {
    state.process.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`);
  } catch (error) {
    console.warn("Could not close Excel PDF worker gracefully.", error);
  }
  state.shutdownTimer = setTimeout(() => {
    if (!state.process.killed) state.process.kill();
  }, 5_000);
}

async function printPdfWithDefaultApplication(pdfPath) {
  await new Promise((resolve, reject) => {
    const printProcess = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "Start-Process -FilePath $env:CLC_PDF_PRINT_PATH -Verb Print -WindowStyle Hidden"
      ],
      {
        windowsHide: true,
        env: { ...process.env, CLC_PDF_PRINT_PATH: pdfPath },
        stdio: ["ignore", "ignore", "pipe"]
      }
    );

    let stderr = "";
    printProcess.stderr.setEncoding("utf8");
    printProcess.stderr.on("data", chunk => {
      stderr += chunk;
    });
    printProcess.on("error", reject);
    printProcess.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || "No se pudo enviar el PDF a la impresora."));
    });
  });
}

function cachePdfBuffer(cacheKey, pdfBuffer) {
  const previous = pdfBufferCache.get(cacheKey);
  if (previous) {
    pdfBufferCacheBytes -= previous.byteLength;
    pdfBufferCache.delete(cacheKey);
  }

  pdfBufferCache.set(cacheKey, pdfBuffer);
  pdfBufferCacheBytes += pdfBuffer.byteLength;

  while (pdfBufferCache.size > MAX_PDF_CACHE_ENTRIES || pdfBufferCacheBytes > MAX_PDF_CACHE_BYTES) {
    const oldestKey = pdfBufferCache.keys().next().value;
    if (oldestKey === undefined || (oldestKey === cacheKey && pdfBufferCache.size === 1)) break;
    const oldestBuffer = pdfBufferCache.get(oldestKey);
    if (oldestBuffer) pdfBufferCacheBytes -= oldestBuffer.byteLength;
    pdfBufferCache.delete(oldestKey);
  }
}

async function createPdfBufferFromExcel(bytes) {
  const excelBuffer = getFileBuffer(bytes);
  const cacheKey = crypto.createHash("sha256").update(excelBuffer).digest("hex");
  const cachedPdf = pdfBufferCache.get(cacheKey);
  if (cachedPdf) {
    pdfBufferCache.delete(cacheKey);
    pdfBufferCache.set(cacheKey, cachedPdf);
    return cachedPdf;
  }

  const pendingConversion = pendingPdfConversions.get(cacheKey);
  if (pendingConversion) {
    return pendingConversion;
  }

  const conversionPromise = createUncachedPdfBufferFromExcel(excelBuffer)
    .then(pdfBuffer => {
      cachePdfBuffer(cacheKey, pdfBuffer);
      return pdfBuffer;
    })
    .finally(() => {
      pendingPdfConversions.delete(cacheKey);
    });

  pendingPdfConversions.set(cacheKey, conversionPromise);
  return conversionPromise;
}

async function createUncachedPdfBufferFromExcel(excelBuffer) {
  const paths = getTemporaryExportPaths();
  try {
    await fs.promises.writeFile(paths.xlsxPath, excelBuffer);
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
    icon: appIconPath,
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
  mainWindow.webContents.once("did-finish-load", () => {
    void ensureExcelPdfWorker().catch(error => {
      console.warn("Could not warm up Excel PDF worker.", error);
    });
  });

  setupAutoUpdates(mainWindow);
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

  ipcMain.handle("clc-file:print-pdf", async (_event, payload) => {
    const pdfBuffer = await createPdfBufferFromExcel(payload?.bytes);
    const paths = getTemporaryExportPaths();
    await fs.promises.writeFile(paths.pdfPath, pdfBuffer);

    try {
      await printPdfWithDefaultApplication(paths.pdfPath);
      return { printed: true };
    } finally {
      const cleanupTimer = setTimeout(() => {
        void removeTemporaryExport(paths);
      }, 10 * 60_000);
      if (typeof cleanupTimer.unref === "function") cleanupTimer.unref();
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

app.on("before-quit", () => {
  shutdownExcelPdfWorker();
});
