const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cursorMini", {
  runtime: "electron",
  platform: process.platform,
  getStatus: () => ipcRenderer.invoke("get-status"),
  runAutomation: (id, params) => ipcRenderer.invoke("run-automation", id, params),
  locate: (name) => ipcRenderer.invoke("locate", name),
  setAlwaysOnTop: (value) => ipcRenderer.invoke("set-always-on-top", value),
  setAttach: (value) => ipcRenderer.invoke("set-attach", value),
  onHostChange: (handler) => {
    const listener = (_event, data) => handler(data);
    ipcRenderer.on("host-change", listener);
    return () => ipcRenderer.removeListener("host-change", listener);
  },
  close: () => ipcRenderer.send("close-window"),
  minimize: () => ipcRenderer.send("minimize-window"),
});
