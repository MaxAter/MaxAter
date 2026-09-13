const { app, BrowserWindow, ipcMain, screen } = require("electron");
const { execFile, execFileSync } = require("child_process");
const path = require("path");

const WIDTH = 336;
const HEIGHT = 764;
const BRIDGE = path.join(__dirname, "..", "host", "protools_bridge.py");

let mainWindow = null;
let attachEnabled = true;
let lastHost = "";

function createWindow() {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    minWidth: WIDTH,
    maxWidth: WIDTH,
    minHeight: 420,
    useContentSize: true,
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    frame: isMac,
    titleBarStyle: isMac ? "hidden" : undefined,
    trafficLightPosition: isMac ? { x: 10, y: 11 } : undefined,
    backgroundColor: "#2a2a2a",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "floating");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, "..", "ui", "index.html"));
  mainWindow.once("ready-to-show", () => {
    placeDefault();
    mainWindow.show();
    pollHost();
  });
}

function placeDefault() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const x = display.workArea.x + display.workArea.width - WIDTH - 24;
  const y = display.workArea.y + 72;
  mainWindow.setPosition(x, y);
}

function osascript(script) {
  try {
    return execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: 1500,
    }).trim();
  } catch {
    return "";
  }
}

function frontmostApp() {
  if (process.platform !== "darwin") return "";
  return osascript(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  );
}

function proToolsBounds() {
  if (process.platform !== "darwin") return null;
  const raw = osascript(`
    tell application "System Events"
      if not (exists process "Pro Tools") then return ""
      tell process "Pro Tools"
        set frontWin to missing value
        repeat with w in windows
          if visible of w is true then
            set frontWin to w
            exit repeat
          end if
        end repeat
        if frontWin is missing value then return ""
        set p to position of frontWin
        set s to size of frontWin
        return (item 1 of p as text) & "," & (item 2 of p as text) & "," & (item 1 of s as text) & "," & (item 2 of s as text)
      end tell
    end tell
  `);
  if (!raw) return null;
  const [x, y, w, h] = raw.split(",").map((n) => Number(n));
  if (![x, y, w, h].every((n) => Number.isFinite(n))) return null;
  return { x, y, w, h };
}

function attachToProTools() {
  if (!attachEnabled || !mainWindow) return;
  const bounds = proToolsBounds();
  if (!bounds) return;
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const work = display.workArea;
  const paletteH = mainWindow.getBounds().height;
  let x = bounds.x + bounds.w + 8;
  if (x + WIDTH > work.x + work.width) x = bounds.x - WIDTH - 8;
  x = Math.max(work.x + 8, Math.min(x, work.x + work.width - WIDTH - 8));
  let y = bounds.y + 36;
  y = Math.max(work.y + 8, Math.min(y, work.y + work.height - paletteH - 8));
  mainWindow.setPosition(Math.round(x), Math.round(y));
}

function pollHost() {
  if (!mainWindow) return;
  const front = frontmostApp();
  const isProTools = /pro tools/i.test(front);
  if (front && front !== lastHost) {
    lastHost = front;
    mainWindow.webContents.send("host-change", {
      app: front,
      isProTools,
    });
  }
  if (isProTools) attachToProTools();
  setTimeout(pollHost, 900);
}

function runBridge(command) {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [BRIDGE, JSON.stringify(command)],
      { timeout: 45000 },
      (error, stdout, stderr) => {
        if (stdout) {
          try {
            resolve(JSON.parse(stdout));
            return;
          } catch (parseError) {
            resolve({ ok: false, error: String(parseError), raw: stdout, stderr });
            return;
          }
        }
        resolve({
          ok: false,
          error: error ? error.message : "No response from Pro Tools bridge",
          stderr,
        });
      }
    );
  });
}

ipcMain.handle("get-status", async () => {
  const status = await runBridge({ cmd: "status" });
  return {
    ...status,
    hostApp: lastHost,
    isProTools: /pro tools/i.test(lastHost),
    alwaysOnTop: mainWindow ? mainWindow.isAlwaysOnTop() : true,
    attach: attachEnabled,
  };
});

ipcMain.handle("run-automation", async (_event, id, params = {}) => {
  return runBridge({ cmd: "run", automation: id, ...params });
});

ipcMain.handle("locate", async (_event, name) => {
  return runBridge({ cmd: "locate", marker: name });
});

ipcMain.handle("set-always-on-top", (_event, value) => {
  if (mainWindow) mainWindow.setAlwaysOnTop(Boolean(value), "floating");
  return { alwaysOnTop: mainWindow ? mainWindow.isAlwaysOnTop() : Boolean(value) };
});

ipcMain.handle("set-attach", (_event, value) => {
  attachEnabled = Boolean(value);
  if (attachEnabled) attachToProTools();
  return { attach: attachEnabled };
});

ipcMain.on("close-window", () => mainWindow && mainWindow.close());
ipcMain.on("minimize-window", () => mainWindow && mainWindow.minimize());

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
