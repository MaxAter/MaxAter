const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("arrangementMaker", {
  platform: process.platform,
  neverSuggestsKey: true,
});
