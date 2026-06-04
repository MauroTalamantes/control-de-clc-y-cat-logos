const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clcDialog", {
  alert: message => ipcRenderer.sendSync("clc-dialog:alert", message),
  confirm: message => ipcRenderer.sendSync("clc-dialog:confirm", message),
  prompt: message => {
    console.warn("window.prompt is not supported in the Electron app.", message);
    return null;
  }
});

contextBridge.exposeInMainWorld("clcStore", {
  get: () => ipcRenderer.invoke("clc-store:get"),
  saveCatalogs: catalogs => ipcRenderer.invoke("clc-store:save-catalogs", catalogs),
  saveDocuments: documents => ipcRenderer.invoke("clc-store:save-documents", documents),
  finalizeDocument: document => ipcRenderer.invoke("clc-store:finalize-document", document),
  setNextFolioNumber: (anio, nextNumber) => ipcRenderer.invoke("clc-store:set-next-folio-number", { anio, nextNumber }),
  selectDataFolder: () => ipcRenderer.invoke("clc-store:select-data-folder")
});

contextBridge.exposeInMainWorld("clcFile", {
  saveExcel: (fileName, bytes, options) => ipcRenderer.invoke("clc-file:save-excel", { fileName, bytes, ...options }),
  createPdf: bytes => ipcRenderer.invoke("clc-file:create-pdf", { bytes }),
  savePdf: (fileName, bytes, options) => ipcRenderer.invoke("clc-file:save-pdf", { fileName, bytes, ...options }),
  printPdf: bytes => ipcRenderer.invoke("clc-file:print-pdf", { bytes })
});
