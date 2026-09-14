const fs = require("fs");
const path = require("path");
const png2icons = require("png2icons");

const pngPath = path.join(__dirname, "../build/icon.png");
const icnsPath = path.join(__dirname, "../build/icon.icns");
const input = fs.readFileSync(pngPath);
const icns = png2icons.createICNS(input, png2icons.BILINEAR, 0);
if (!icns) {
  console.error("Failed to build icon.icns from build/icon.png");
  process.exit(1);
}
fs.writeFileSync(icnsPath, icns);
console.log("Wrote", icnsPath, icns.length, "bytes");
