// Indonesian conversation sentences (indo-phrases.json) shared by the tablet news build.
// Each sentence carries its own Korean word notes, so no dictionary lookup is needed.
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'indo-phrases.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}
function parts(text, w) {
  const dict = {};
  for (const [k, v] of Object.entries(w || {})) dict[k.toLowerCase()] = v;
  const toks = String(text).split(/([A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’-]*)/);
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!t) continue;
    if (i % 2 === 0) { out.push({ w: t }); continue; }
    let done = false;
    for (let n = 3; n >= 2 && !done; n--) {
      const idx = Array.from({ length: n }, (_, k) => i + 2 * k);
      if (idx[n - 1] >= toks.length || !idx.slice(1).every(j => toks[j - 1] === ' ')) continue;
      const ph = idx.map(j => toks[j]).join(' ');
      const ko = dict[ph.toLowerCase()];
      if (ko) { out.push({ w: ph, ko, base: ph }); i = idx[n - 1]; done = true; }
    }
    if (!done) { const ko = dict[t.toLowerCase()]; out.push(ko ? { w: t, ko, base: t } : { w: t }); }
  }
  return out;
}
module.exports = { load, parts };
