const fs = require("fs");
const path = require("path");
const { generateArrangement, mulberry32 } = require("../app/js/engine.js");

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/catalog.json"), "utf8"));
const forbidden = /"key"\s*:|"songKey"|tonality|suggest(?:ed)? key/i;
let failures = 0;

for (let i = 0; i < 80; i += 1) {
  const style = catalog.styles[i % catalog.styles.length];
  const result = generateArrangement(catalog, { rng: mulberry32(1000 + i), styleId: style.id });
  const json = JSON.stringify(result);
  if (forbidden.test(json)) {
    console.error("Key leakage in seed", i, style.id);
    failures += 1;
  }
  if (!result.tempo || !result.sections?.length || !result.instruments?.length) {
    console.error("Incomplete arrangement", i, style.id);
    failures += 1;
  }
  const subOccupants = result.instruments.filter((item) => item.occupiesSub || (item.band === "sub" && item.occupiesSub !== false));
  if (subOccupants.length > 1) {
    console.error("Multiple subs", i, style.id, subOccupants.map((item) => item.id));
    failures += 1;
  }
}

if (failures) {
  console.error(failures, "failures");
  process.exit(1);
}
console.log("80 generates across 10 lanes: no key fields, complete sheets, one sub max.");
