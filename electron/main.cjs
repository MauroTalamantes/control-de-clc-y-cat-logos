const { app, BrowserWindow, ipcMain, dialog, shell, crashReporter, session } = require("electron");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log/main");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const AUTO_UPDATE_CHECK_DELAY_MS = 15_000;
const AUTO_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_FAILURE_THRESHOLD = 2;
const STARTUP_STATE_FILE_NAME = "startup-state.json";
const EXCEL_PDF_CONVERSION_TIMEOUT_MS = 120_000;
const EXCEL_PDF_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_EXCEL_PDF_CONVERSIONS_PER_WORKER = 100;
const EXCEL_PDF_WORKER_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "app.asar.unpacked", "electron", "excel-pdf-worker.ps1")
  : path.join(__dirname, "excel-pdf-worker.ps1");
const MAX_PDF_CACHE_ENTRIES = 8;
const MAX_PDF_CACHE_BYTES = 32 * 1024 * 1024;
const STORE_SCHEMA_VERSION = 1;
const pdfBufferCache = new Map();
const pendingPdfConversions = new Map();
let pdfBufferCacheBytes = 0;
let excelPdfWorkerState = null;
let mainWindow = null;
let autoUpdatesInitialized = false;

log.transports.file.level = "info";
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.console.level = isRunningSmokeTest() ? "info" : "warn";
log.initialize({ preload: false });
log.errorHandler.startCatching({ showDialog: false });
log.eventLogger.startLogging({ level: "warn" });
Object.assign(console, log.functions);

try {
  crashReporter.start({
    productName: "Control de CLC y Catalogos",
    companyName: "Ayuntamiento de Guadalupe",
    uploadToServer: false,
    compress: true
  });
} catch (error) {
  log.error("Could not initialize the local crash reporter.", error);
}

// The app is form/report oriented and does not need GPU rendering. Some Windows
// graphics drivers can leave Chromium's accelerated surface stale until the
// window is minimized or restored, which makes the UI appear to stop accepting clicks.
if (process.platform === "win32") {
  app.disableHardwareAcceleration();
}

const isDev = !app.isPackaged;
const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
const isSmokeTest = isRunningSmokeTest();
const appIconPath = path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");
const startupStatePath = path.join(app.getPath("userData"), STARTUP_STATE_FILE_NAME);
const startupState = isSmokeTest ? { consecutiveFailures: 0, pending: false } : beginStartupAttempt();
const safeMode = process.argv.includes("--safe-mode") || startupState.consecutiveFailures >= STARTUP_FAILURE_THRESHOLD;

if (process.platform === "win32") {
  app.setAppUserModelId("mx.gob.guadalupe.control-clc");
}

function isRunningSmokeTest() {
  return process.argv.includes("--smoke-test");
}

function writeJsonAtomically(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(tempPath, "w");
    fs.writeFileSync(fileDescriptor, JSON.stringify(value, null, 2), "utf8");
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
    try {
      fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      if (cleanupError?.code !== "ENOENT") log.warn("Could not remove temporary JSON file.", cleanupError);
    }
    throw error;
  }
}

function beginStartupAttempt() {
  let previousState = {};
  try {
    previousState = JSON.parse(fs.readFileSync(startupStatePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") log.warn("Could not read startup state; it will be recreated.", error);
  }

  const consecutiveFailures = previousState?.pending
    ? Math.max(0, Number(previousState.consecutiveFailures) || 0) + 1
    : 0;
  const nextState = {
    pending: true,
    consecutiveFailures,
    version: app.getVersion(),
    executablePath: process.execPath,
    startedAt: new Date().toISOString()
  };

  try {
    writeJsonAtomically(startupStatePath, nextState);
  } catch (error) {
    log.error("Could not persist startup state.", error);
  }
  return nextState;
}

function markStartupHealthy() {
  if (isSmokeTest) return;
  try {
    writeJsonAtomically(startupStatePath, {
      pending: false,
      consecutiveFailures: 0,
      version: app.getVersion(),
      executablePath: process.execPath,
      healthyAt: new Date().toISOString()
    });
  } catch (error) {
    log.error("Could not mark startup as healthy.", error);
  }
}

function getDiagnosticsPath() {
  return path.dirname(log.transports.file.getFile().path);
}

async function openDiagnosticsFolder() {
  const errorMessage = await shell.openPath(getDiagnosticsPath());
  if (errorMessage) throw new Error(errorMessage);
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

function setupAutoUpdates(window) {
  if (isDev || isPortable || safeMode || isSmokeTest || autoUpdatesInitialized) {
    log.info("Automatic updates disabled for this run.", { isDev, isPortable, safeMode, isSmokeTest });
    return;
  }
  autoUpdatesInitialized = true;

  let updateDialogOpen = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = log.scope("auto-update");

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
      const { response } = await showMessageBoxForWindow(window, {
        type: "info",
        buttons: ["Reiniciar ahora", "Despues"],
        defaultId: 0,
        cancelId: 1,
        message: "Actualizacion lista para instalar",
        detail: `Se descargo la version ${info?.version || "mas reciente"}. Reinicia la aplicacion para aplicar la actualizacion.`
      });
      if (response === 0) {
        log.info("User accepted installation of downloaded update.", info?.version || "");
        await shutdownExcelPdfWorkerAndWait();
        autoUpdater.quitAndInstall(false, true);
      }
    } finally {
      updateDialogOpen = false;
    }
  });

  const checkForUpdates = () => {
    if (window.isDestroyed()) return;
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
  state.exitPromise = new Promise(resolve => {
    state.resolveExit = resolve;
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
    state.exited = true;
    state.resolveExit({ code, signal });
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

async function shutdownExcelPdfWorkerAndWait() {
  const state = excelPdfWorkerState;
  if (!state) return;

  shutdownExcelPdfWorker(state);
  const exitedGracefully = await Promise.race([
    state.exitPromise.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 5_000))
  ]);

  if (!exitedGracefully && !state.process.killed) {
    log.warn("Excel PDF worker did not stop in time; terminating it before update.");
    state.process.kill();
    await Promise.race([
      state.exitPromise,
      new Promise(resolve => setTimeout(resolve, 1_000))
    ]);
  }
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

function createInitialData(filePath = getDefaultDataPath()) {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    catalogs: null,
    documents: [],
    folioCounters: [],
    dataFilePath: filePath
  };
}

function ensureDataFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    writeJsonAtomically(filePath, createInitialData(filePath));
  }
}

function preserveCorruptStore(filePath, error) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const corruptPath = `${filePath}.corrupt-${timestamp}`;
  try {
    fs.copyFileSync(filePath, corruptPath, fs.constants.COPYFILE_EXCL);
    log.error("Local data file is invalid. A recovery copy was created.", { filePath, corruptPath, error });
  } catch (copyError) {
    log.error("Local data file is invalid and could not be backed up.", { filePath, error, copyError });
  }
}

function readStore(filePath = getDefaultDataPath()) {
  ensureDataFile(filePath);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError("El archivo de datos no contiene un objeto valido.");
    }
    return {
      catalogs: parsed.catalogs ?? null,
      documents: Array.isArray(parsed.documents) ? parsed.documents : [],
      folioCounters: Array.isArray(parsed.folioCounters) ? parsed.folioCounters : [],
      dataFilePath: filePath
    };
  } catch (error) {
    preserveCorruptStore(filePath, error);
    throw new Error(`No se pudo leer el archivo local de datos. Se conservo una copia para recuperacion: ${filePath}`, {
      cause: error
    });
  }
}

function writeStore(nextStore, filePath = getDefaultDataPath()) {
  const normalized = {
    schemaVersion: STORE_SCHEMA_VERSION,
    catalogs: nextStore.catalogs ?? null,
    documents: Array.isArray(nextStore.documents) ? nextStore.documents : [],
    folioCounters: Array.isArray(nextStore.folioCounters) ? nextStore.folioCounters : [],
    dataFilePath: filePath
  };
  ensureDataFile(filePath);
  const backupPath = `${filePath}.bak`;
  try {
    fs.copyFileSync(filePath, backupPath);
    writeJsonAtomically(filePath, normalized);
  } catch (error) {
    log.error("Could not write local data store.", { filePath, backupPath, error });
    throw error;
  }
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

async function runSmokeTest() {
  const expectedVersionArgument = process.argv.find(argument => argument.startsWith("--expected-version="));
  const expectedVersion = expectedVersionArgument?.slice("--expected-version=".length);
  const requiredFiles = [
    path.join(__dirname, "preload.cjs"),
    EXCEL_PDF_WORKER_PATH,
    path.join(__dirname, "..", "dist", "index.html")
  ];

  if (expectedVersion && app.getVersion() !== expectedVersion) {
    throw new Error(`Expected version ${expectedVersion}, but the packaged app reports ${app.getVersion()}.`);
  }
  for (const requiredFile of requiredFiles) {
    if (!fs.existsSync(requiredFile)) throw new Error(`Required packaged file is missing: ${requiredFile}`);
  }

  const smokeWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  try {
    await smokeWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    await new Promise(resolve => setTimeout(resolve, 750));
    const rendererState = await smokeWindow.webContents.executeJavaScript(`({
      rootChildren: document.getElementById("root")?.childElementCount || 0,
      hasErrorBoundary: document.body.innerText.includes("no pudo mostrar la interfaz")
    })`);
    if (!rendererState.rootChildren || rendererState.hasErrorBoundary) {
      throw new Error(`Renderer smoke test failed: ${JSON.stringify(rendererState)}`);
    }
  } finally {
    if (!smokeWindow.isDestroyed()) smokeWindow.destroy();
  }
  log.info("Packaged application smoke test passed.", { version: app.getVersion(), executablePath: process.execPath });
}

async function prepareSafeMode() {
  if (!safeMode) return;
  log.warn("Starting in safe mode after repeated incomplete startups.", startupState);
  try {
    await session.defaultSession.clearCache();
  } catch (error) {
    log.warn("Could not clear Chromium cache in safe mode.", error);
  }
}

async function showStartupRecoveryDialog() {
  if (!safeMode || process.argv.includes("--safe-mode")) return true;
  const { response } = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Continuar en modo seguro", "Abrir diagnostico y salir", "Salir"],
    defaultId: 0,
    cancelId: 2,
    message: "La aplicacion no completo sus ultimos arranques",
    detail: "Se desactivaran las actualizaciones durante este arranque y se limpiara la cache. Los datos de CLC no se eliminaran."
  });
  if (response === 1) {
    await openDiagnosticsFolder().catch(error => log.error("Could not open diagnostics folder.", error));
    return false;
  }
  return response === 0;
}

function createWindow() {
  mainWindow = new BrowserWindow({
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
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:3001").catch(error => log.error("Could not load development UI.", error));
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html")).catch(error => {
      log.error("Could not load packaged UI.", error);
      dialog.showErrorBox(
        "No se pudo abrir Control de CLC",
        `La interfaz no pudo cargarse. Consulta los diagnosticos en:\n${getDiagnosticsPath()}`
      );
    });
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

  setupAutoUpdates(mainWindow);
}

const hasSingleInstanceLock = isSmokeTest || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  log.info("A second application instance was rejected.");
  markStartupHealthy();
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!app.isReady()) return;
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

app.whenReady().then(async () => {
  if (!(await showStartupRecoveryDialog())) {
    app.quit();
    return;
  }
  await prepareSafeMode();

  ipcMain.on("clc-diagnostics:renderer-ready", () => {
    markStartupHealthy();
  });

  ipcMain.on("clc-diagnostics:renderer-error", (_event, payload) => {
    log.error("Renderer error reported.", {
      message: String(payload?.message || "Unknown renderer error"),
      stack: String(payload?.stack || ""),
      source: String(payload?.source || "renderer")
    });
  });

  ipcMain.handle("clc-diagnostics:open-folder", async () => {
    await openDiagnosticsFolder();
    return getDiagnosticsPath();
  });

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

  if (isSmokeTest) {
    try {
      await runSmokeTest();
      app.exit(0);
    } catch (error) {
      log.error("Packaged application smoke test failed.", error);
      app.exit(1);
    }
    return;
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch(error => {
  log.error("Application initialization failed.", error);
  dialog.showErrorBox(
    "Control de CLC no pudo iniciar",
    `Ocurrio un error durante el arranque. Consulta los diagnosticos en:\n${getDiagnosticsPath()}`
  );
  app.exit(1);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  shutdownExcelPdfWorker();
});
}
