const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clcStore", {
  get: () => ipcRenderer.invoke("clc-store:get"),
  saveCatalogs: catalogs => ipcRenderer.invoke("clc-store:save-catalogs", catalogs),
  saveDocuments: documents => ipcRenderer.invoke("clc-store:save-documents", documents),
  finalizeDocument: document => ipcRenderer.invoke("clc-store:finalize-document", document),
  selectDataFolder: () => ipcRenderer.invoke("clc-store:select-data-folder")
});

contextBridge.exposeInMainWorld("clcFile", {
  saveExcel: (fileName, bytes) => ipcRenderer.invoke("clc-file:save-excel", { fileName, bytes })
});
