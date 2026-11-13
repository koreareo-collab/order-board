// Korean word notes for the BBC (English) and ANTARA (Indonesian) headlines.
//   annotate(lang, text) -> { parts: [...], ko: '문장 번역' }   parts: {w} plain text or {w, ko, pos, base}
// Order of lookup: offline dictionary (위키낱말사전, data\dict.db) -> saved notes -> online translation.
// Everything found online is saved, so each word is looked up once and then works offline.
// Only the public news headline text is sent out; nothing from GAYA_WORK or the calendar.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = path.join(__dirname, 'data', 'dict.db');
let db = null;
function getDb() {
  if (db !== null) return db;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS dict(word TEXT, lang TEXT, pos TEXT, ko TEXT, PRIMARY KEY(word, lang, pos));
      CREATE TABLE IF NOT EXISTS gloss(word TEXT, lang TEXT, ko TEXT, pos TEXT, src TEXT, at INTEGER, PRIMARY KEY(word, lang));
      CREATE TABLE IF NOT EXISTS sent(hash TEXT PRIMARY KEY, lang TEXT, ko TEXT, at INTEGER);
      CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);`);
  } catch (e) { console.log('[gloss] 사전 열기 실패:', e.message); db = false; }
  return db;
}

// ---------- words that need no note ----------
const STOP = {
  en: new Set(`a an the this that these those there here it its it's he she they them we us you i his her their our your my me him
    is are was were be been being am s re ve ll d t don't doesn't didn't isn't aren't wasn't won't can't couldn't
    to of in on at for with by from as into over under after before up down out off than then so if about across among between
    and or but not no nor also too very just only even still yet more most less least much many few all any some other another each both
    has have had do does did will would shall should can could may might must
    who whom whose what which when where why how
    say says said tell told new old one two three four five six seven eight nine ten first last next
    mr mrs ms dr bbc news live latest update video watch`.split(/\s+/)),
  id: new Set(`dan yang di ke dari untuk dengan pada dalam ini itu akan adalah ialah tidak tak bukan juga sudah telah belum
    bisa dapat oleh atau saat ketika karena sebab hingga sampai agar supaya para se nya ada lebih kurang masih hanya saja
    antara kata ujar menurut dia ia mereka kami kita saya anda beliya beliau satu dua tiga empat lima
    tersebut sebagai secara serta namun tetapi tapi jika kalau maka bahwa pun per adalah apa siapa mana bagaimana mengapa kenapa
    kepada terhadap demi hal usai guna baru lalu kini nanti sini situ sana`.split(/\s+/)),
};
const ALWAYS_SKIP = /^(https?|www|com|co|id|org|net|rss|antara|bbc)$/i;

// ---------- base forms ----------
function basesEn(w) {
  const out = [w];
  const add = x => { if (x && x.length >= 2 && !out.includes(x)) out.push(x); };
  if (w.endsWith("'s")) add(w.slice(0, -2));
  if (/ies$/.test(w)) add(w.slice(0, -3) + 'y');
  if (/(ches|shes|sses|xes|zes)$/.test(w)) add(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1));
  if (/ied$/.test(w)) add(w.slice(0, -3) + 'y');
  if (/ed$/.test(w)) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (/ying$/.test(w)) add(w.slice(0, -4) + 'ie');
  if (/ing$/.test(w)) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); }
  if (/([bdgklmnprt])\1(ed|ing)$/.test(w)) add(w.replace(/([bdgklmnprt])\1(ed|ing)$/, '$1'));
  if (/ly$/.test(w)) add(w.slice(0, -2));
  if (/(er|est)$/.test(w)) add(w.replace(/(er|est)$/, ''));
  return out;
}
function basesId(w) {
  const out = [w];
  const add = x => { if (x && x.length >= 3 && !out.includes(x)) out.push(x); };
  let s = w;
  for (const suf of ['nya', 'lah', 'kah', 'pun']) if (s.endsWith(suf) && s.length > suf.length + 2) { s = s.slice(0, -suf.length); add(s); }
  const stems = [s];
  for (const suf of ['kan', 'an', 'i']) if (s.endsWith(suf) && s.length > suf.length + 2) stems.push(s.slice(0, -suf.length));
  for (const st of stems) {
    add(st);
    // meN- / peN- with the first letter of the stem put back
    const pre = [
      [/^meng([aeiou])/, '$1'], [/^meng/, 'k'], [/^meny/, 's'], [/^men([aeiou])/, '$1'], [/^men/, 't'],
      [/^mem([aeiou])/, '$1'], [/^memp/, 'p'], [/^mem/, 'p'], [/^me/, ''],
      [/^peng([aeiou])/, '$1'], [/^peng/, 'k'], [/^peny/, 's'], [/^pen/, 't'], [/^pem/, 'p'], [/^pe/, ''],
      [/^ber/, ''], [/^be/, ''], [/^ter/, ''], [/^te/, ''], [/^per/, ''], [/^di/, ''], [/^ke/, ''], [/^se/, ''],
    ];
    for (const [re, rep] of pre) if (re.test(st)) add(st.replace(re, rep));
  }
  return out;
}
const bases = (lang, w) => (lang === 'id' ? basesId(w) : basesEn(w));

// ---------- offline dictionary / saved notes ----------
const shortKo = s => {
  const t = String(s || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = t.split(/[;,·/]|\.\s|\.$/).map(x => x.trim().replace(/[.。]+$/, '')).filter(x => /[가-힣]/.test(x));
  const short = parts.filter(x => x.length <= 10);
  const use = (short.length ? short : parts).slice(0, 2);
  let out = use.join(', ');
  if (out.length > 16) {
    out = use[0];
    if (out.length > 16) { const cut = out.slice(0, 15); out = (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut) + '…'; }
  }
  return out;
};
// "여자 이름", "남자 이름", "지명" … are no help as a study note
const isNameGloss = s => /(이름|인명|지명|성씨|약어)/.test(String(s || ''));
// some 위키낱말사전 entries explain grammar instead of giving a meaning ("be 동사와 함께 …"):
// no use as a small note, so look the word up online instead
const isExplain = s => /(함께|뒤에|앞에|쓰이|쓴다|나타내|가리키는 말|경우에|때에|따위를|복수형|과거형|약자)/.test(String(s || ''));
function lookupLocal(lang, word) {
  const d = getDb(); if (!d) return null;
  for (const b of bases(lang, word)) {
    const g = d.prepare('SELECT ko, pos FROM gloss WHERE word=? AND lang=?').get(b, lang);
    if (g && g.ko) return { ko: shortKo(g.ko), full: g.ko, pos: g.pos || '', base: b, src: 'saved' };
    const rows = d.prepare('SELECT pos, ko FROM dict WHERE word=? AND lang=?').all(b, lang);
    if (rows.length) {
      const order = ['명사', '동사', '형용사', '부사'];
      rows.sort((a, b2) => (order.indexOf(a.pos) + 9) % 9 - (order.indexOf(b2.pos) + 9) % 9);
      // skip rows that only say it is a name, explain grammar, or are an etymology dump
      const good = rows.filter(r => !isNameGloss(r.ko) && !isExplain(r.ko) && shortKo(r.ko));
      const pick = good[0] || null;
      const full = rows.map(r => (r.pos ? r.pos + ' ' : '') + r.ko).join(' / ');
      if (pick) return { ko: shortKo(pick.ko), full, pos: pick.pos || '', base: b, src: 'wiktionary' };
      return { ko: '', full, pos: '', base: b, src: 'wiktionary' };
    }
  }
  return null;
}
// Google has no Indonesian->Korean dictionary, so Indonesian words go through English:
// 인도네시아어 -> 영어 (kaikki/Wiktionary, data\dict.db idn) -> 한국어 (위키낱말사전).
// Both steps are offline, so this works with no network at all.
const enOf = term => String(term || '').replace(/^to\s+/i, '').replace(/[^A-Za-z' -]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
function englishKo(term) {
  const d = getDb(); if (!d || !term) return null;
  const tries = [term];
  if (term.includes(' ')) tries.push(term.split(' ').pop());   // "social group" -> "group"
  for (const t of tries) {
    const hit = lookupLocal('en', t);
    if (hit && hit.ko) return { ko: hit.ko, full: hit.full, pos: hit.pos, en: t };
  }
  return null;
}
function idnRows(word, depth = 0) {
  const d = getDb(); if (!d) return null;
  for (const b of basesId(word)) {
    const rows = d.prepare('SELECT pos, en FROM idn WHERE word=?').all(b);
    if (!rows.length) continue;
    // "active of tekan", "plural of anak": the meaning lives on the base word
    const ref = rows.map(r => (String(r.en).match(/\b(?:of|from)\s+([a-z-]+)\s*$/i) || [])[1]).find(Boolean);
    if (ref && depth < 2 && rows.every(r => /\b(?:of|from)\s+[a-z-]+\s*$/i.test(r.en))) {
      const deeper = idnRows(ref, depth + 1);
      if (deeper) return { base: deeper.base, rows: deeper.rows, via: b };
    }
    return { base: b, rows };
  }
  return null;
}
function lookupViaEnglish(word) {
  const r = idnRows(word);
  if (!r) return null;
  for (const row of r.rows) {
    for (const term of String(row.en).split(/[;,]/)) {
      const t = enOf(term);
      if (!t || t.length < 2) continue;
      const ko = englishKo(t);
      if (ko) return { ko: ko.ko, full: ko.full, pos: row.pos || ko.pos, base: r.base, en: ko.en, src: 'id-en-ko' };
    }
  }
  // the word is known but none of its English meanings is in the Korean dictionary:
  // hand the English meaning back so it can be translated online once and saved
  const first = enOf(String(r.rows[0].en).split(/[;,]/)[0]);
  return first ? { en: first, pos: r.rows[0].pos || '', base: r.base, needsKo: true, src: 'id-en' } : null;
}

// everything we hold for one word, for the dictionary window on the PC pages
function entries(lang, word) {
  const d = getDb(); if (!d) return { base: word, saved: null, dict: [], idn: [] };
  const idnHit = lang === 'id' ? idnRows(word) : null;
  // the English meanings of an Indonesian word, each with the Korean it leads to
  const idn = idnHit ? idnHit.rows.map(r => ({
    pos: r.pos,
    en: r.en,
    ko: [...new Map(String(r.en).split(/[;,]/)
      .map(t => englishKo(enOf(t)))
      .filter(Boolean)
      .map(k => [k.en, k.en + ' → ' + k.ko])).values()].slice(0, 3).join(' · '),
  })) : [];
  for (const b of bases(lang, word)) {
    const saved = d.prepare('SELECT ko, pos, src FROM gloss WHERE word=? AND lang=?').get(b, lang) || null;
    const dict = d.prepare('SELECT pos, ko FROM dict WHERE word=? AND lang=?').all(b, lang);
    if (saved || dict.length) return { base: b, saved, dict, idn, idnBase: idnHit ? idnHit.base : null };
  }
  return { base: (idnHit && idnHit.base) || word, saved: null, dict: [], idn, idnBase: idnHit ? idnHit.base : null };
}
function saveGloss(lang, word, ko, pos, src) {
  const d = getDb(); if (!d || !ko) return;
  try { d.prepare('INSERT OR REPLACE INTO gloss(word, lang, ko, pos, src, at) VALUES(?,?,?,?,?,?)').run(word, lang, ko, pos || '', src || '', Date.now()); } catch { }
}

// ---------- online (only for words / sentences not known yet) ----------
const GOOGLE = 'https://translate.googleapis.com/translate_a/single';
async function gtx(params, ms = 8000) {
  const r = await fetch(GOOGLE + '?' + params, { signal: AbortSignal.timeout(ms), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
async function translateLines(lang, lines) {
  const j = await gtx(`client=gtx&sl=${lang}&tl=ko&dt=t&q=` + encodeURIComponent(lines.join('\n')));
  const out = (j[0] || []).map(x => String(x[0] || '')).join('').split('\n').map(s => s.trim());
  return lines.map((_, i) => out[i] || '');
}
async function translateSentence(lang, text) {
  const j = await gtx(`client=gtx&sl=${lang}&tl=ko&dt=t&q=` + encodeURIComponent(text));
  return (j[0] || []).map(x => String(x[0] || '')).join('').trim();
}
// full dictionary entry for one word (used when a word is clicked on the PC page)
// tl='en' is used for Indonesian, because Google has no Indonesian→Korean dictionary but a good one into English
async function wordDetail(lang, word, tl = 'ko') {
  const j = await gtx(`client=gtx&sl=${lang}&tl=${tl}&dt=t&dt=bd&q=` + encodeURIComponent(word));
  const main = (j[0] || []).map(x => String(x[0] || '')).join('').trim();
  const groups = (j[1] || []).map(g => ({ pos: String(g[0] || ''), terms: (g[1] || []).slice(0, 6).map(String) }));
  return { ko: main, groups };
}

// ---------- main ----------
const SPLIT = /([A-Za-z][A-Za-z'’-]*|[À-ɏ]+)/;
function tokenize(text) { return String(text || '').split(SPLIT); }

// Words that are names (people, places, brands): capitalised in the middle of some headline, or ALL CAPS.
function namesFrom(titles) {
  const names = new Set();
  for (const t of titles || []) {
    const toks = String(t).split(SPLIT).filter(x => x && SPLIT.test(x) && /[A-Za-zÀ-ɏ]/.test(x));
    toks.forEach((w, i) => {
      const lw = w.toLowerCase().replace(/[’']s$/, '');
      if (/^[A-ZÀ-Þ][a-zß-ÿ]/.test(w) && i > 0) names.add(lw);
      else if (/^[A-Z]{2,}$/.test(w)) names.add(lw);
    });
  }
  return names;
}

function needsNote(lang, w, isFirst) {
  const lw = w.toLowerCase().replace(/[’']s$/, '');
  if (lw.length < 3 || ALWAYS_SKIP.test(lw)) return false;
  if ((STOP[lang] || STOP.en).has(lw)) return false;
  if (/^\d+$/.test(lw)) return false;
  return true;
}

// Returns at once what is already known; anything missing is fetched when `online` is true.
async function annotate(lang, text, { online = true, sentence = true, names = null } = {}) {
  const d = getDb();
  const toks = tokenize(text);
  const parts = [];
  const missing = new Map(); // lowercased word -> [part, …]
  // capitalisation pattern of the words, so a name next to a name can be spotted (Jensen Huang, New York)
  const caps = toks.filter(x => x && SPLIT.test(x) && /[A-Za-zÀ-ɏ]/.test(x)).map(x => /^[A-ZÀ-Þ]/.test(x));
  let isFirst = true, ai = -1;
  for (const t of toks) {
    if (!t) continue;
    if (!SPLIT.test(t) || !/[A-Za-zÀ-ɏ]/.test(t)) { parts.push({ w: t }); continue; }
    ai++;
    const p = { w: t };
    const lw = t.toLowerCase().replace(/[’']s$/, '');
    // names: capitalised in mid-sentence, next to another capitalised word, or seen as a name in the feed
    const nameLike = caps[ai] && (!isFirst || caps[ai + 1] || (names && names.has(lw)));
    if (needsNote(lang, t, isFirst) && !nameLike) {
      const hit = lookupLocal(lang, lw);
      // Indonesian has no direct Korean dictionary, so it goes 인도네시아어 → 영어 → 한국어.
      // That chain can land on a side meaning, so an online lookup is preferred while there is a
      // network; the chain is what keeps it working offline.
      const via = lang === 'id' && (!hit || !hit.ko) ? lookupViaEnglish(lw) : null;
      if (hit && hit.ko) {
        p.ko = hit.ko; p.pos = hit.pos; if (hit.base && hit.base !== lw) p.base = hit.base;
      } else if (via && via.ko && !online) {
        p.ko = via.ko; p.pos = via.pos; p.en = via.en; if (via.base !== lw) p.base = via.base;
      } else {
        if (via) { p.en = via.en; p.fallback = via.ko || null; p.pos = via.pos || ''; if (via.base && via.base !== lw) p.base = via.base; }
        if (!missing.has(lw)) missing.set(lw, []);
        missing.get(lw).push(p);
      }
    }
    isFirst = false;
    parts.push(p);
  }

  let ko = null;
  if (sentence && d) {
    const h = crypto.createHash('sha1').update(lang + '|' + text).digest('hex').slice(0, 16);
    const row = d.prepare('SELECT ko FROM sent WHERE hash=?').get(h);
    if (row) ko = row.ko;
    else if (online) {
      try {
        ko = await translateSentence(lang, text);
        if (ko) d.prepare('INSERT OR REPLACE INTO sent(hash, lang, ko, at) VALUES(?,?,?,?)').run(h, lang, ko, Date.now());
      } catch { /* offline: no sentence line */ }
    }
  }

  if (online && missing.size) {
    // a real dictionary lookup per word (part of speech + meanings) — better than translating the bare word
    const words = [...missing.keys()].slice(0, 16);
    const look = async w => {
      try {
        const dt = await wordDetail(lang, w);
        const g = (dt.groups || []).find(x => (x.terms || []).length);
        const ko = g ? shortKo(g.terms.slice(0, 2).join(', ')) : shortKo(dt.ko);
        const pos = g ? g.pos : '';
        // a "meaning" that is just the word itself, or "여자 이름", is no help
        if (!ko || !/[가-힣]/.test(ko) || ko.toLowerCase() === w || isNameGloss(ko)) return;
        saveGloss(lang, w, g ? g.terms.slice(0, 4).join(', ') : dt.ko, pos, 'google');
        for (const p of missing.get(w)) { p.ko = ko; if (pos) p.pos = pos; p.auto = 1; }
      } catch { /* leave this word without a note */ }
    };
    for (let i = 0; i < words.length; i += 4) await Promise.all(words.slice(i, i + 4).map(look));
  }
  // anything the network could not answer falls back to the offline 인도네시아어 → 영어 → 한국어 chain
  for (const p of parts) {
    if (!p.ko && p.fallback) p.ko = p.fallback;
    delete p.fallback;
  }
  return { parts, ko };
}

function stats() {
  const d = getDb(); if (!d) return {};
  try {
    const n = {};
    for (const r of d.prepare('SELECT lang, count(DISTINCT word) c FROM dict GROUP BY lang').all()) n['dict_' + r.lang] = r.c;
    for (const r of d.prepare('SELECT lang, count(*) c FROM gloss GROUP BY lang').all()) n['saved_' + r.lang] = r.c;
    n.sentences = d.prepare('SELECT count(*) c FROM sent').get().c;
    try { n.idn = d.prepare('SELECT count(DISTINCT word) c FROM idn').get().c; } catch { n.idn = 0; }
    n.built = (d.prepare("SELECT v FROM meta WHERE k='dictBuilt'").get() || {}).v || null;
    return n;
  } catch { return {}; }
}

function saveSent(hash, lang, ko) {
  const d = getDb(); if (!d || !ko) return;
  try { d.prepare('INSERT OR REPLACE INTO sent(hash, lang, ko, at) VALUES(?,?,?,?)').run(hash, lang, ko, Date.now()); } catch { }
}

module.exports = { annotate, wordDetail, lookupLocal, lookupViaEnglish, idnRows, entries, stats, bases, namesFrom, saveGloss, saveSent };
