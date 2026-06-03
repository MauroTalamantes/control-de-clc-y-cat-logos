const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const isDev = !app.isPackaged;

function getDefaultDataPath() {
  return path.join(app.getPath("userData"), "clc-data.json");
}

function createInitialData() {
  return {
    catalogs: null,
    documents: [],
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
    dataFilePath: filePath
  };
  ensureDataFile(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(normalized, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
  return normalized;
}

function assignFolio(docToFinalize, allDocuments) {
  const year = docToFinalize["aÃ±o"] || new Date().getFullYear();
  const yearDocs = allDocuments.filter(doc => doc["aÃ±o"] === year && doc.estado === "finalizado");
  const maxNumber = yearDocs.reduce((max, doc) => {
    const match = String(doc.folio || "").match(/CLC-(\d+)\/\d+/);
    return Math.max(max, match ? Number.parseInt(match[1], 10) : 0);
  }, 0);
  const assignedFolio = `CLC-${String(maxNumber + 1).padStart(3, "0")}/${year}`;
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
  return { finalizedDoc, updatedDocuments };
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "Control de CLC y Catalogos",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
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
    const { finalizedDoc, updatedDocuments } = assignFolio(docToFinalize, current.documents);
    const store = writeStore({ ...current, documents: updatedDocuments });
    return { finalizedDoc, documents: store.documents };
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

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
