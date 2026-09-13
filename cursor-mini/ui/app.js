const AUTOMATIONS = [
  {
    id: "pop-form",
    title: "POP FORM",
    sub: "Radio-ready 3:20 map",
    ready: "10 markers · 100 bars",
    detail: (bpm) =>
      `Intro–Outro at ${bpm} BPM. Chorus 1 lands at bar 33 (${formatDuration(32 * barSeconds(bpm))}).`,
  },
  {
    id: "radio-edit",
    title: "RADIO EDIT",
    sub: "Chorus by 0:40",
    ready: "Tight 2:50 form",
    detail: (bpm) =>
      `Compressed hit form at ${bpm} BPM. First chorus at bar 17 (${formatDuration(16 * barSeconds(bpm))}).`,
  },
  {
    id: "skeleton",
    title: "SESSION SKELETON",
    sub: "20-track pop template",
    ready: "Drums · Band · Vox · Buses",
    detail: () =>
      "Creates Kick through MIX: 15 audio, 4 aux, 1 master. Big-picture tracking layout.",
  },
  {
    id: "color-roles",
    title: "COLOR ROLES",
    sub: "Sort the session",
    ready: "Group by instrument",
    detail: () =>
      "Classifies tracks into drums, bass, guitars, keys, vox, FX, and buses. Applies color when PTSL allows.",
  },
  {
    id: "prep-mix",
    title: "PREP MIX",
    sub: "Clear + save a version",
    ready: "Unmute · unsolo · increment",
    detail: () =>
      "Clears mute/solo across the session and saves the next version (_v02, _v03…).",
  },
  {
    id: "snapshot",
    title: "SNAPSHOT",
    sub: "Read the session",
    ready: "Name, tracks, markers",
    detail: () =>
      "Pulls session name, sample rate, length, track list, and memory locations into the scribble.",
  },
];

const LOCATORS = [
  { label: "IN", name: "Intro" },
  { label: "V1", name: "Verse 1" },
  { label: "PR", name: "Pre-Chorus 1" },
  { label: "C1", name: "Chorus 1" },
  { label: "V2", name: "Verse 2" },
  { label: "C2", name: "Chorus 2" },
  { label: "BR", name: "Bridge" },
  { label: "FC", name: "Final Chorus" },
  { label: "OUT", name: "Outro" },
  { label: "P2", name: "Pre-Chorus 2" },
];

const api = window.cursorMini || null;
const isElectron = Boolean(api && api.runtime === "electron");

const state = {
  armed: null,
  busy: false,
  bpm: 120,
  hostIsProTools: true,
  mode: "demo",
  session: "Demo Session",
};

function barSeconds(bpm) {
  return (4 * 60) / bpm;
}

function formatDuration(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function $(id) {
  return document.getElementById(id);
}

function scribble(kicker, main, sub) {
  $("scribble").innerHTML = `
    <div class="scribble-kicker">${kicker}</div>
    <div class="scribble-main">${main}</div>
    <div class="scribble-sub">${sub}</div>
  `;
}

function setLed(id, value) {
  $(id).dataset.state = value;
}

function updateFormLength() {
  const seconds = 100 * barSeconds(state.bpm);
  $("formLength").textContent = `${formatDuration(seconds)} · 100 bars`;
  $("sessionMeta").textContent = `48 kHz · 24-bit · ${state.bpm.toFixed(2)} BPM`;
  if (state.armed) renderArmed();
}

function renderArmed() {
  const auto = AUTOMATIONS.find((item) => item.id === state.armed);
  if (!auto) return;
  scribble("ARMED", auto.title, auto.detail(state.bpm));
  $("executeBtn").disabled = !state.hostIsProTools || state.busy;
}

function renderAutomations() {
  $("autoGrid").innerHTML = AUTOMATIONS.map(
    (item) => `
      <button class="key${state.armed === item.id ? " armed" : ""}" data-auto="${item.id}">
        <span class="k-title">${item.title}</span>
        <span class="k-sub">${item.sub}</span>
      </button>
    `
  ).join("");
}

function renderLocators() {
  $("locateGrid").innerHTML = LOCATORS.map(
    (item) => `<button class="locate" data-marker="${item.name}">${item.label}</button>`
  ).join("");
}

function arm(id) {
  state.armed = id;
  renderAutomations();
  renderArmed();
}

async function execute() {
  if (!state.armed || state.busy || !state.hostIsProTools) return;
  const auto = AUTOMATIONS.find((item) => item.id === state.armed);
  state.busy = true;
  $("executeBtn").disabled = true;
  setLed("connLed", "busy");
  scribble("RUNNING", auto.title, auto.ready);

  const result = api
    ? await api.runAutomation(auto.id, { bpm: state.bpm })
    : demoRun(auto);

  state.busy = false;
  $("executeBtn").disabled = false;
  applyResult(auto, result);
}

function demoRun(auto) {
  if (auto.id === "snapshot") {
    return {
      ok: true,
      mode: "demo",
      result: {
        name: state.session,
        sampleRate: 48000,
        trackCount: 0,
        markers: [],
      },
    };
  }
  if (auto.id === "pop-form" || auto.id === "radio-edit") {
    return { ok: true, mode: "demo", result: { count: 10, bpm: state.bpm } };
  }
  if (auto.id === "skeleton") {
    return { ok: true, mode: "demo", result: { count: 20 } };
  }
  return { ok: true, mode: "demo", result: { note: "Demo complete" } };
}

function applyResult(auto, result) {
  if (!result || result.ok === false) {
    setLed("connLed", "err");
    scribble("ERROR", auto.title, result && result.error ? result.error : "Automation failed");
    return;
  }

  state.mode = result.mode || state.mode;
  setLed("connLed", state.mode === "live" ? "live" : "demo");
  $("connText").textContent = (state.mode === "live" ? "LIVE" : "DEMO");

  const payload = result.result || {};
  if (auto.id === "snapshot") {
    if (payload.name) {
      state.session = payload.name;
      $("sessionName").textContent = payload.name;
    }
    scribble(
      "SNAPSHOT",
      payload.name || state.session,
      `${payload.trackCount || 0} tracks · ${
        (payload.markers && payload.markers.length) || payload.markerCount || 0
      } markers · ${payload.sampleRate || 48000} Hz`
    );
    return;
  }

  if (auto.id === "pop-form" || auto.id === "radio-edit") {
    scribble("DONE", auto.title, `${payload.count || 10} markers written · ${payload.bpm || state.bpm} BPM`);
    return;
  }
  if (auto.id === "skeleton") {
    scribble("DONE", auto.title, `${payload.count || 20} tracks created`);
    return;
  }
  if (auto.id === "save-version" || auto.id === "prep-mix") {
    scribble("DONE", auto.title, payload.to ? `Saved ${payload.to}` : "Session versioned");
    return;
  }
  if (auto.id === "color-roles") {
    scribble("DONE", auto.title, payload.note || "Roles classified");
    return;
  }
  scribble("DONE", auto.title, "Automation finished");
}

async function locate(name) {
  if (state.busy) return;
  scribble("LOCATE", name, "Recalling memory location");
  const result = api ? await api.locate(name) : { ok: true, mode: "demo", located: name };
  if (result && result.ok === false) {
    scribble("ERROR", name, result.error || "Marker not found");
    return;
  }
  scribble("LOCATED", name, result.mode === "live" ? "Playhead moved" : "Demo locate");
}

function setHost(isProTools, appName) {
  state.hostIsProTools = isProTools;
  $("palette").classList.toggle("is-away", !isProTools);
  $("hostLabel").textContent = isProTools ? "PRO TOOLS" : "STANDBY";
  $("hostApp").textContent = (appName || (isProTools ? "PRO TOOLS" : "OTHER APP")).toUpperCase();
  setLed("hostLed", isProTools ? "on" : "off");
  $("previewHostBtn").classList.toggle("on", isProTools);
  $("previewHostBtn").setAttribute("aria-pressed", String(isProTools));
  if (!isProTools) {
    scribble("HOST AWAY", "Waiting for Pro Tools", "Palette follows the frontmost Avid session");
    $("executeBtn").disabled = true;
  } else if (state.armed) {
    renderArmed();
  } else {
    scribble("READY", "Select a big-picture move", "Then press Execute");
  }
}

function applyStatus(status) {
  if (!status) return;
  state.mode = status.mode || state.mode;
  if (status.session) {
    state.session = status.session;
    $("sessionName").textContent = status.session;
  }
  if (status.sampleRate) {
    $("sessionMeta").textContent = `${status.sampleRate / 1000} kHz · 24-bit · ${state.bpm.toFixed(2)} BPM`;
  }
  setLed("connLed", status.mode === "live" ? "live" : "demo");
  $("connText").textContent = status.mode === "live" ? "LIVE" : "DEMO";
  $("footNote").textContent =
    status.mode === "live" ? "PTSL connected" : "Demo · open Pro Tools to go live";
  if (typeof status.isProTools === "boolean") {
    setHost(status.isProTools, status.hostApp);
  }
}

function tickClock() {
  const now = new Date();
  const fps = 30;
  const frames = Math.floor((now.getMilliseconds() / 1000) * fps);
  $("clock").textContent = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
    String(frames).padStart(2, "0"),
  ].join(":");
}

function bind() {
  document.body.classList.add(isElectron ? "is-electron" : "is-browser");
  if (isElectron && api.platform !== "darwin") document.body.classList.add("not-mac");

  renderAutomations();
  renderLocators();
  updateFormLength();
  tickClock();
  setInterval(tickClock, 80);

  $("autoGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-auto]");
    if (button) arm(button.dataset.auto);
  });

  $("locateGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-marker]");
    if (button) locate(button.dataset.marker);
  });

  $("executeBtn").addEventListener("click", execute);

  $("tempo").addEventListener("change", () => {
    state.bpm = Math.min(240, Math.max(40, Number($("tempo").value) || 120));
    $("tempo").value = String(state.bpm);
    updateFormLength();
  });
  $("tempoDown").addEventListener("click", () => {
    $("tempo").value = String(Number($("tempo").value) - 1);
    $("tempo").dispatchEvent(new Event("change"));
  });
  $("tempoUp").addEventListener("click", () => {
    $("tempo").value = String(Number($("tempo").value) + 1);
    $("tempo").dispatchEvent(new Event("change"));
  });

  $("collapseBtn").addEventListener("click", () => {
    $("palette").classList.toggle("is-collapsed");
  });

  $("closeBtn").addEventListener("click", () => {
    if (api) api.close();
  });
  $("minBtn").addEventListener("click", () => {
    if (api) api.minimize();
  });

  $("aotBtn").addEventListener("click", async () => {
    const next = !$("aotBtn").classList.contains("on");
    $("aotBtn").classList.toggle("on", next);
    $("aotBtn").setAttribute("aria-pressed", String(next));
    if (api) await api.setAlwaysOnTop(next);
  });

  $("attachBtn").addEventListener("click", async () => {
    const next = !$("attachBtn").classList.contains("on");
    $("attachBtn").classList.toggle("on", next);
    $("attachBtn").setAttribute("aria-pressed", String(next));
    if (api) await api.setAttach(next);
  });
  $("attachBtn").classList.add("on");

  $("previewHostBtn").addEventListener("click", () => {
    if (isElectron) return;
    setHost(!state.hostIsProTools, state.hostIsProTools ? "Finder" : "Pro Tools");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") execute();
    if (event.key === "Escape") {
      state.armed = null;
      renderAutomations();
      scribble("READY", "Select a big-picture move", "Then press Execute");
      $("executeBtn").disabled = true;
    }
  });

  if (api) {
    api.onHostChange((data) => setHost(Boolean(data.isProTools), data.app));
    api.getStatus().then(applyStatus).catch(() => applyStatus({ mode: "demo" }));
  } else {
    applyStatus({ mode: "demo", session: "Demo Session", isProTools: true, hostApp: "Pro Tools" });
  }
}

bind();
