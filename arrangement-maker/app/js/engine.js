const NEVER_KEY_FIELDS = new Set(["key", "songKey", "tonality", "mode", "scale"]);

function stripKeyFields(value) {
  if (Array.isArray(value)) return value.map(stripKeyFields);
  if (value && typeof value === "object") {
    const next = {};
    for (const [k, v] of Object.entries(value)) {
      if (NEVER_KEY_FIELDS.has(k)) continue;
      next[k] = stripKeyFields(v);
    }
    return next;
  }
  return value;
}

function pickWeighted(items, rng) {
  const total = items.reduce((sum, item) => sum + (item.weight || 1), 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight || 1;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function overlap(a = [], b = []) {
  return a.some((item) => b.includes(item));
}

function compatibleInstrument(inst, style, selected) {
  if (inst.styles && inst.styles.length && !inst.styles.includes(style.id) && !inst.styles.includes("any")) {
    return false;
  }
  if (inst.avoidStyles && inst.avoidStyles.includes(style.id)) return false;
  if (inst.era && style.eras && !overlap(inst.era, style.eras) && !inst.era.includes("any")) {
    return false;
  }
  const selectedIds = new Set(selected.map((item) => item.id));
  if (inst.requiresAny && !inst.requiresAny.some((id) => selectedIds.has(id))) return false;
  if (inst.conflictsWith && inst.conflictsWith.some((id) => selectedIds.has(id))) return false;
  if (inst.maxWithRoles) {
    for (const [role, max] of Object.entries(inst.maxWithRoles)) {
      const count = selected.filter((item) => item.role === role).length;
      if (count > max) return false;
    }
  }
  const occupiesSub = (item) => item.occupiesSub || (item.band === "sub" && item.occupiesSub !== false);
  if (occupiesSub(inst) && selected.some(occupiesSub)) return false;
  const sameBand = selected.filter((item) => item.band === inst.band && inst.band !== "mid" && item.family !== inst.family);
  if (inst.band && inst.band !== "mid" && sameBand.length >= 2) return false;
  const sameRole = selected.filter((item) => item.role === inst.role);
  if (sameRole.length >= (inst.roleLimit || (inst.role === "fx" ? 3 : 2))) return false;
  return true;
}

function chooseBpm(style, rng) {
  const min = style.bpm.min;
  const max = style.bpm.max;
  let bpm = randomInt(rng, min, max);
  if (style.bpm.prefer) {
    const [pMin, pMax] = style.bpm.prefer;
    if (rng() < 0.7) bpm = randomInt(rng, pMin, pMax);
  }
  return {
    bpm,
    feel: style.bpm.feel || "straight",
    dawDoubleTime: style.bpm.dawDoubleTime ? bpm * 2 : null,
    sourceIds: style.bpm.sourceIds,
  };
}

function chooseTimeSignature(catalog, style, rng) {
  const options = catalog.timeSignatures.filter((ts) => {
    if (ts.styles && !ts.styles.includes(style.id) && !ts.styles.includes("any")) return false;
    return true;
  });
  return pickWeighted(options, rng);
}

function barsFor(sectionType, catalog, rng) {
  const rule = catalog.sectionLengths.find((item) => item.section === sectionType) || catalog.sectionLengths.find((item) => item.section === "default");
  return pick(rng, rule.bars);
}

function buildSections(structure, catalog, rng) {
  return structure.sections.map((section, index) => {
    const type = section.type;
    const energy = catalog.energyBySection[type] || { start: 0.4, end: 0.5 };
    const wobble = (rng() - 0.5) * 0.06;
    return {
      id: `${type}-${index + 1}`,
      type,
      label: section.label || type.replace(/-/g, " "),
      bars: barsFor(type, catalog, rng),
      energy: Number(Math.min(1, Math.max(0.08, energy.start + wobble)).toFixed(2)),
      energyEnd: Number(Math.min(1, Math.max(0.1, energy.end + wobble)).toFixed(2)),
      function: energy.function,
    };
  });
}

function durationHint(sections, bpm, timeSignature) {
  const beatsPerBar = timeSignature.beats;
  const totalBeats = sections.reduce((sum, section) => sum + section.bars * beatsPerBar, 0);
  const seconds = Math.round((totalBeats * 60) / bpm);
  const minutes = Math.floor(seconds / 60);
  const rem = String(seconds % 60).padStart(2, "0");
  return { seconds, display: `${minutes}:${rem}` };
}

function selectInstruments(catalog, style, structure, rng) {
  const selected = [];
  const requiredRoles = style.requiredRoles || ["drums", "bass", "lead"];
  const pool = catalog.instruments.filter((inst) => compatibleInstrument(inst, style, []));

  for (const role of requiredRoles) {
    const candidates = pool.filter((inst) => inst.role === role && compatibleInstrument(inst, style, selected));
    if (candidates.length) selected.push(pickWeighted(candidates, rng));
  }

  const pairingHits = catalog.pairings.filter((pair) => {
    if (pair.styles && !pair.styles.includes(style.id) && !pair.styles.includes("any")) return false;
    return selected.some((inst) => pair.with.includes(inst.id) || pair.with.includes(inst.family));
  });

  for (const pair of pairingHits) {
    if (rng() > (pair.weight || 0.7)) continue;
    const add = catalog.instruments.find((inst) => pair.add === inst.id);
    if (add && compatibleInstrument(add, style, selected) && !selected.some((inst) => inst.id === add.id)) {
      selected.push(add);
    }
  }

  const densityBudget = style.densityBudget || 8;
  const extras = pool
    .filter((inst) => !selected.some((item) => item.id === inst.id))
    .sort((a, b) => (b.weight || 1) - (a.weight || 1));

  for (const inst of extras) {
    if (selected.length >= densityBudget) break;
    if (!compatibleInstrument(inst, style, selected)) continue;
    const styleBoost = inst.styles && inst.styles.includes(style.id) ? 0.25 : 0;
    if (rng() < (0.22 + styleBoost + (inst.weight || 1) * 0.04)) {
      selected.push(inst);
    }
  }

  if (structure.needsFx && !selected.some((inst) => inst.role === "fx")) {
    const fx = pool.filter((inst) => inst.role === "fx" && compatibleInstrument(inst, style, selected));
    if (fx.length) selected.push(pickWeighted(fx, rng));
  }

  return selected;
}

function selectNotes(catalog, style, structure, instruments, timeSignature, rng) {
  const ids = new Set(instruments.map((inst) => inst.id));
  const families = new Set(instruments.map((inst) => inst.family));
  const notes = catalog.productionNotes.filter((note) => {
    if (note.styles && !note.styles.includes(style.id) && !note.styles.includes("any")) return false;
    if (note.structures && !note.structures.includes(structure.id) && !note.structures.includes("any")) return false;
    if (note.requiresInstrument && !note.requiresInstrument.some((id) => ids.has(id) || families.has(id))) return false;
    if (note.timeSignatures && !note.timeSignatures.includes(timeSignature.id)) return false;
    return true;
  });
  const picked = [];
  const shuffled = [...notes].sort(() => rng() - 0.5);
  for (const note of shuffled) {
    if (picked.length >= 6) break;
    if (picked.some((item) => item.bucket === note.bucket)) continue;
    picked.push(note);
  }
  return picked;
}

function generateArrangement(catalog, options = {}) {
  const rng = options.rng || mulberry32(options.seed ?? Math.floor(Math.random() * 1e9));
  const styles = options.styleId
    ? catalog.styles.filter((style) => style.id === options.styleId)
    : catalog.styles;
  const style = pickWeighted(styles, rng);
  const structures = catalog.structures.filter((item) => item.styles.includes(style.id) || item.styles.includes("any"));
  const structure = pickWeighted(structures, rng);
  const timeSignature = chooseTimeSignature(catalog, style, rng);
  const tempo = chooseBpm(style, rng);
  const sections = buildSections(structure, catalog, rng);
  const instruments = selectInstruments(catalog, style, structure, rng);
  const productionNotes = selectNotes(catalog, style, structure, instruments, timeSignature, rng);
  const length = durationHint(sections, tempo.bpm, timeSignature);

  return stripKeyFields({
    generatedAt: new Date().toISOString(),
    style,
    structure,
    timeSignature,
    tempo,
    sections,
    length,
    instruments,
    productionNotes,
    constraintsApplied: [
      "No song key is generated or suggested.",
      "Instrument choices respect role, band, style, and attested pairing constraints.",
      "Section lengths stay on attested 4-bar multiples.",
    ],
  });
}

async function loadCatalog(base = "../data") {
  const response = await fetch(`${base}/catalog.json`);
  if (!response.ok) throw new Error(`Could not load catalog from ${base}`);
  return response.json();
}

if (typeof window !== "undefined") {
  window.ArrangementEngine = { loadCatalog, generateArrangement, stripKeyFields, mulberry32 };
}
if (typeof module !== "undefined") {
  module.exports = { loadCatalog, generateArrangement, stripKeyFields, mulberry32 };
}
