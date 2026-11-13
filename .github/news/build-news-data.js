// Builds news.json for the tablet news app: BBC (English) and ANTARA (Indonesian) headlines with
// the Korean word notes and the sentence translation already worked out, plus a small dictionary of
// the words used, so the tablet needs no server of its own and works offline once loaded.
//   node build-news-data.js [out.json]
// Runs both on this PC and in GitHub Actions (so the tablet stays current with the PC off).
const fs = require('fs');
const path = require('path');
const bbc = require('./bbc');
const gloss = require('./gloss');

const OUT = process.argv[2] || path.join(__dirname, 'data', 'news.json');
const PER_FEED = 24;
const log = (...a) => console.log(new Date().toLocaleString('sv-SE').slice(5, 16), '[news]', ...a);

// seed the saved-word cache from the previous file, so words learnt in an earlier run are not looked up again
function seedFrom(file) {
  try {
    const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
    let n = 0;
    for (const [key, w] of Object.entries(prev.words || {})) {
      const i = key.indexOf('|');
      if (w.src === 'google' && w.full) { gloss.saveGloss(key.slice(0, i), key.slice(i + 1), w.full, w.pos || '', 'google'); n++; }
    }
    for (const [h, s] of Object.entries(prev.sent || {})) gloss.saveSent(h, s.lang, s.ko);
    if (n) log(`이전 파일에서 단어 ${n}개 이어받음`);
  } catch { /* first run */ }
}

(async () => {
  seedFrom(OUT);
  const feeds = [
    { key: 'bbc', name: 'BBC News World', lang: 'en', feed: bbc.bbc, site: 'bbc.com' },
    { key: 'indonesia', name: 'ANTARA', lang: 'id', feed: bbc.indonesia, site: 'antaranews.com' },
  ];
  const out = { builtAt: new Date().toISOString(), by: process.env.GITHUB_ACTIONS ? 'actions' : 'pc', feeds: [], words: {}, sent: {} };

  for (const f of feeds) {
    await f.feed.refresh();
    const items = f.feed.headlines().slice(0, PER_FEED);
    const names = gloss.namesFrom(items.map(x => x.title));
    const list = [];
    for (const it of items) {
      const a = await gloss.annotate(f.lang, it.title, { names });
      list.push({ t: it.title, d: it.desc, link: it.link, time: it.time, parts: a.parts, ko: a.ko });
      // dictionary for every word that got a note, so tapping it works with no connection
      for (const p of a.parts) {
        if (!p.ko) continue;
        const w = (p.base || p.w).toLowerCase().replace(/[’']s$/, '');
        const key = f.lang + '|' + w;
        if (out.words[key]) continue;
        const e = gloss.entries(f.lang, w);
        out.words[key] = {
          ko: p.ko, pos: p.pos || '', en: p.en || '',
          full: (e.saved && e.saved.ko) || '',
          src: (e.saved && e.saved.src) || '',
          dict: (e.dict || []).filter(x => x.ko).slice(0, 4),
          idn: (e.idn || []).slice(0, 3),
        };
      }
    }
    out.feeds.push({ key: f.key, name: f.name, lang: f.lang, site: f.site, items: list });
    log(`${f.name}: ${list.length}건`);
  }
  out.dict = gloss.stats();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  log(`${path.basename(OUT)} 작성 (${Math.round(fs.statSync(OUT).size / 1024)}KB, 단어 ${Object.keys(out.words).length}개)`);
})().catch(e => { log('실패:', e.message); process.exitCode = 1; });
