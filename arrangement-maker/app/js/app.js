const sheet = document.getElementById("sheet");
const generateBtn = document.getElementById("generateBtn");
const chipsEl = document.getElementById("styleChips");

let catalog = null;
let selectedStyle = null;

function el(html) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function renderChips() {
  chipsEl.innerHTML = "";
  const any = el(`<button class="chip" type="button" aria-pressed="${selectedStyle ? "false" : "true"}" data-style="">Any attested lane</button>`);
  chipsEl.appendChild(any);
  for (const style of catalog.styles) {
    const chip = el(`<button class="chip" type="button" aria-pressed="${selectedStyle === style.id ? "true" : "false"}" data-style="${style.id}">${style.name}</button>`);
    chipsEl.appendChild(chip);
  }
}

function energyHeight(value) {
  return `${Math.round(18 + value * 110)}px`;
}

function renderArrangement(result) {
  const sections = result.sections.map((section) => `
    <article class="section-block" title="${section.function}">
      <div>
        <em>${section.bars} bars</em>
        <h3>${section.label}</h3>
      </div>
      <p>${section.function}</p>
    </article>
  `).join("");

  const energy = result.sections.map((section) => `
    <div class="energy-col">
      <div class="energy-bar" style="height:${energyHeight(section.energyEnd)}"></div>
      <span>${section.label}</span>
    </div>
  `).join("");

  const instruments = result.instruments.map((inst) => `
    <article class="inst">
      <div class="inst-top">
        <strong>${inst.name}</strong>
        <span class="role">${inst.role} · ${inst.density} density</span>
      </div>
      <p>${inst.detail}</p>
      <p class="why">${inst.why}</p>
    </article>
  `).join("");

  const notes = result.productionNotes.map((note) => `
    <article class="note">
      <strong>${note.title}</strong>
      <p>${note.body}</p>
    </article>
  `).join("");

  const daw = result.tempo.dawDoubleTime
    ? `Felt pulse ${result.tempo.bpm}; DAW double-time ${result.tempo.dawDoubleTime}`
    : result.tempo.feel;

  sheet.classList.remove("empty");
  sheet.innerHTML = `
    <div class="meta-row">
      <div class="stat"><b>Lane</b><strong>${result.style.name}</strong><span>${result.style.eraLabel}</span></div>
      <div class="stat"><b>BPM</b><strong>${result.tempo.bpm}</strong><span>${daw}</span></div>
      <div class="stat"><b>Time signature</b><strong>${result.timeSignature.label}</strong><span>${result.timeSignature.detail}</span></div>
      <div class="stat"><b>Length hint</b><strong>${result.length.display}</strong><span>${result.structure.name}</span></div>
    </div>
    <h3 class="block-title">Structure</h3>
    <div class="timeline">${sections}</div>
    <h3 class="block-title">Energy map</h3>
    <div class="energy">${energy}</div>
    <div class="grid-2">
      <div>
        <h3 class="block-title">Instruments</h3>
        <div class="inst-list">${instruments}</div>
      </div>
      <div>
        <h3 class="block-title">Production notes</h3>
        <div class="notes">${notes}</div>
      </div>
    </div>
    <p class="why" style="margin-top:16px">${result.constraintsApplied.join(" ")} Style source: ${result.style.summary}</p>
  `;
}

async function generate() {
  if (!catalog) return;
  generateBtn.classList.add("spinning");
  generateBtn.disabled = true;
  await new Promise((resolve) => setTimeout(resolve, 280));
  const result = window.ArrangementEngine.generateArrangement(catalog, {
    styleId: selectedStyle || undefined,
  });
  renderArrangement(result);
  generateBtn.classList.remove("spinning");
  generateBtn.disabled = false;
}

chipsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-style]");
  if (!button) return;
  selectedStyle = button.dataset.style || null;
  renderChips();
});

generateBtn.addEventListener("click", generate);

async function boot() {
  try {
    catalog = await window.ArrangementEngine.loadCatalog("../data");
    renderChips();
  } catch (error) {
    sheet.classList.add("empty");
    sheet.innerHTML = `<p class="empty-copy">Catalog failed to load. Serve the app from the arrangement-maker folder so <code>data/catalog.json</code> is reachable.</p>`;
    console.error(error);
  }
}

boot();
