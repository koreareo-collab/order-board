// Order Board add-on: number search, "가격" tab, style page (price · costing sheets · tech pack)
// and an in-app viewer for Excel (SheetJS) and PDF (pdf.js). Uses globals from board.html:
// $, esc, num, DATA, REPO, TOKEN, isLocalPC, ghGet, render, tab.
let STYLE = null; // style-index.json

(function addStyles() {
  const css = `
  .search { position: relative; flex: 0 1 300px; }
  .search input { width: 100%; font: inherit; font-size: 15px; padding: 8px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--text); }
  .sres { position: absolute; top: 42px; left: 0; right: 0; z-index: 9; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; max-height: 60vh; overflow-y: auto; box-shadow: 0 12px 30px rgba(0,0,0,.5); display: none; }
  .sres.on { display: block; }
  .sres button { display: block; width: 100%; text-align: left; font: inherit; background: none; border: 0; border-top: 1px solid var(--line); color: var(--text); padding: 10px 12px; cursor: pointer; }
  .sres button:first-child { border-top: 0; }
  .sres small { color: var(--muted); margin-left: 6px; }
  .sec { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
  .sec h3 { margin: 0 0 8px; font-size: 15px; color: var(--muted); }
  .files button { display: flex; width: 100%; gap: 10px; align-items: baseline; text-align: left; font: inherit; font-size: 14px; background: var(--panel2); border: 1px solid var(--line); color: var(--text); border-radius: 10px; padding: 9px 11px; margin-bottom: 6px; cursor: pointer; }
  .files button[disabled] { opacity: .55; cursor: default; }
  .files .fn { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .files .fm { color: var(--muted); font-size: 12px; white-space: nowrap; }
  .tag { font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 6px; background: rgba(90,169,255,.16); color: var(--accent); white-space: nowrap; }
  .tp-thumb { display: block; width: 100%; max-height: 420px; object-fit: contain; background: #fff; border-radius: 10px; cursor: pointer; }
  .pricebox { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .pricebox div { background: var(--panel2); border-radius: 10px; padding: 8px 10px; }
  .pricebox b { display: block; font-size: 18px; }
  .pricebox span { color: var(--muted); font-size: 12px; }
  .bad { color: var(--bad) !important; } .good { color: var(--fab) !important; }
  details.more summary { cursor: pointer; color: var(--accent); font-size: 14px; margin: 6px 0; }
  .viewer { position: fixed; inset: 0; z-index: 30; background: var(--bg); display: none; flex-direction: column; }
  .viewer.on { display: flex; }
  .viewer .vbar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); }
  .viewer .vbar b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .viewer .vtabs { display: flex; gap: 6px; overflow-x: auto; padding: 8px 12px; border-bottom: 1px solid var(--line); }
  .viewer .vtabs button { font: inherit; font-size: 13px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--muted); white-space: nowrap; }
  .viewer .vtabs button.on { color: var(--text); border-color: var(--accent); }
  .viewer .vbody { flex: 1; overflow: auto; background: #fff; color: #111; -webkit-overflow-scrolling: touch; }
  .viewer .vbody table { border-collapse: collapse; font-size: 13px; font-family: Arial, sans-serif; }
  .viewer .vbody td { border: 1px solid #d0d4da; padding: 3px 6px; white-space: nowrap; max-width: 360px; overflow: hidden; text-overflow: ellipsis; }
  .viewer .vbody canvas { display: block; margin: 8px auto; max-width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  .viewer .msg { padding: 30px; color: #444; font-size: 15px; }
  .ptable { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .ptable th, .ptable td { padding: 8px 10px; border-top: 1px solid var(--line); text-align: right; white-space: nowrap; }
  .ptable th:first-child, .ptable td:first-child, .ptable td.l { text-align: left; }
  .ptable th { color: var(--muted); font-weight: 600; font-size: 12.5px; }
  .ptable tr.click { cursor: pointer; } .ptable tr.click:active { background: var(--panel2); }
  .tablewrap { overflow-x: auto; }`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  document.body.insertAdjacentHTML('beforeend', `<div class="viewer" id="viewer"><div class="vbar"><button class="icon" id="vClose">←</button><b id="vTitle"></b><button class="icon" id="vZoomOut">−</button><button class="icon" id="vZoomIn">＋</button></div><div class="vtabs" id="vTabs"></div><div class="vbody" id="vBody"></div></div>`);
})();

// ---------- data ----------
async function ghRaw(file) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${file.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
  if (!r.ok) throw new Error('파일을 가져오지 못했습니다 (' + r.status + ')');
  return r.arrayBuffer();
}
async function fetchAsset(file) {
  if (REPO && TOKEN) return ghRaw(file);
  const r = await fetch('/style-data/' + file); if (!r.ok) throw new Error('파일 없음'); return r.arrayBuffer();
}
async function loadStyleIndex() {
  try {
    const buf = await fetchAsset('style-index.json');
    STYLE = JSON.parse(new TextDecoder().decode(buf));
    try { localStorage.setItem('ob.style', JSON.stringify(STYLE)); } catch {}
  } catch { try { STYLE = JSON.parse(localStorage.getItem('ob.style') || 'null'); } catch {} }
}

// ---------- search ----------
const keyOf = s => { const m = String(s).match(/(\d{4,})(?!.*\d{4,})/); const tail = String(s).split('/').pop(); return /^F\d{8}$/i.test(tail) || /^\d{6}$/.test(tail) ? tail.toUpperCase() : (m ? m[1] : String(s).toUpperCase()); };
function searchStyles(q) {
  q = q.trim().toUpperCase(); if (!q) return [];
  const out = new Map();
  const add = (key, label, sub) => { if (!out.has(key)) out.set(key, { key, label, sub }); };
  for (const s of Object.values((STYLE && STYLE.styles) || {})) {
    if (s.key.includes(q) || s.codes.some(c => c.includes(q)) || (s.name || '').toUpperCase().includes(q))
      add(s.key, s.codes.join(' / '), [s.name, s.season].filter(Boolean).join(' · '));
  }
  for (const r of (DATA && DATA.rows) || []) {
    if ((r.style + ' ' + r.name).toUpperCase().includes(q)) add(keyOf(r.style), r.style, [r.name, r.season].filter(Boolean).join(' · '));
  }
  return [...out.values()].slice(0, 30);
}
function mountSearch() {
  if (document.getElementById('search')) return;
  const bar = document.querySelector('.bar');
  bar.insertBefore(Object.assign(document.createElement('div'), { className: 'search', innerHTML: '<input id="search" type="search" inputmode="search" placeholder="스타일 검색 (숫자만: 6279)" autocomplete="off"><div class="sres" id="sres"></div>' }), document.getElementById('reload'));
  const inp = $('search'), box = $('sres');
  inp.oninput = () => {
    const res = searchStyles(inp.value);
    box.innerHTML = res.length ? res.map(r => `<button data-skey="${esc(r.key)}"><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></button>`).join('') : (inp.value.trim() ? '<button disabled>찾는 스타일이 없습니다</button>' : '');
    box.classList.toggle('on', !!inp.value.trim());
  };
  inp.onkeydown = e => { if (e.key === 'Enter') { const b = box.querySelector('[data-skey]'); if (b) b.click(); } };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) box.classList.remove('on'); });
}

// ---------- style page ----------
const money = v => v == null || v === '' ? '-' : typeof v === 'number' ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : esc(v);
const pct = v => v == null || v === '' ? '-' : typeof v === 'number' ? (Math.abs(v) <= 1 ? (v * 100).toFixed(1) : v.toFixed(1)) + '%' : esc(v);
function fileButtons(list, emptyText) {
  if (!list || !list.length) return `<div class="hint">${emptyText}</div>`;
  return '<div class="files">' + list.map(f => `<button ${f.file ? `data-open="${esc(f.file)}" data-name="${esc(f.name)}"` : 'disabled'} title="${esc(f.folder + '/' + f.name)}">
      <span class="tag">${esc(f.type)}</span><span class="fn">${esc(f.name)}</span><span class="fm">${esc(f.season || '')} ${esc(f.date || '')}${f.file ? '' : ' · PC 폴더에만'}</span></button>`).join('') + '</div>';
}
function openStyle(key) {
  const s = STYLE && STYLE.styles[key];
  const p = (STYLE && STYLE.prices[key]) || {};
  const rows = ((DATA && DATA.rows) || []).filter(r => keyOf(r.style) === key);
  const title = s ? s.codes.join(' / ') : (rows[0] ? rows[0].style : key);
  const name = (s && s.name) || (rows[0] && rows[0].name) || (p.cm && p.cm.name) || (p.fob && p.fob.name) || '';
  let priceHtml = '';
  if (p.cm) priceHtml += `<div class="pricebox"><div><span>CM 단가</span><b>${money(p.cm.cm)}</b></div><div><span>자수·프린트</span><b>${money(p.cm.extra)}</b></div>
      <div><span>TOTAL CM</span><b>${money(p.cm.totalCm)}</b></div><div><span>가격 상태</span><b>${esc(p.cm.status || '-')}</b></div></div>
      <div class="hint" style="margin-top:6px">${esc([p.cm.source, p.cm.note].filter(Boolean).join(' · '))} · 출처 ${esc(p.cm.file)}</div>`;
  if (p.fob) {
    const low = /12% 미만|미달/.test(p.fob.flag || '');
    priceHtml += `<div class="pricebox"><div><span>Final FOB</span><b>${money(p.fob.fob)}</b></div><div><span>FENC Target / Offer</span><b>${money(p.fob.target)} / ${money(p.fob.offer)}</b></div>
      <div><span>Net Cost (BV)</span><b>${money(p.fob.netCost)}</b></div><div><span>마진 $/pc · %</span><b class="${low ? 'bad' : 'good'}">${money(p.fob.margin)} · ${pct(p.fob.marginPct)}</b></div></div>
      <div class="hint" style="margin-top:6px">${esc(p.fob.brand)} ${esc(p.fob.season)} · ${esc(p.fob.flag || '')} · 확정 ${esc(p.fob.confirmed || '-')} · 출처 ${esc(p.fob.file)}</div>`;
  }
  const order = rows.length ? `<div class="sec"><h3>오더</h3>${rows.map(r => `<div class="row" data-id="${esc(r.id)}"><div class="t">${esc(r.style)}<span>Buy ${esc(r.buy)}</span></div><div class="q">${num(r.qty)}</div><div class="m">${esc(r.factory)} · EX-F ${esc(r.exf || '-')} · 원단 ${esc(r.fab || '-')}</div></div>`).join('')}</div>` : '';
  const c = s ? s.costing : { rep: [], same: [], older: [] }, t = s ? s.techpack : { rep: [], others: [] };
  $('sheetBox').innerHTML = `<h2>${esc(title)}</h2><div class="sub">${esc(name)}${s && s.season ? ' · ' + esc(s.season) : ''}</div>
    ${priceHtml ? `<div class="sec"><h3>💲 가격</h3>${priceHtml}</div>` : ''}
    ${order}
    <div class="sec"><h3>📄 코스팅 시트</h3>${fileButtons(c.rep, '이 스타일의 코스팅 파일을 찾지 못했습니다')}
      ${c.same.length ? `<details class="more"><summary>같은 시즌 다른 버전 ${c.same.length}개</summary>${fileButtons(c.same)}</details>` : ''}
      ${c.older.length ? `<details class="more"><summary>이전 시즌 · 예전 파일 ${c.older.length}개 (목록만)</summary>${fileButtons(c.older)}</details>` : ''}</div>
    <div class="sec"><h3>✏️ 테크팩 (T/P) 스케치</h3>${t.rep.length && t.rep[0].file ? `<img class="tp-thumb" id="tpThumb" alt="스케치 불러오는 중…" data-open="${esc(t.rep[0].file)}" data-name="${esc(t.rep[0].name)}">` : ''}
      ${fileButtons(t.rep, '테크팩 PDF를 찾지 못했습니다')}
      ${t.others.length ? `<details class="more"><summary>다른 테크팩 ${t.others.length}개 (목록만)</summary>${fileButtons(t.others)}</details>` : ''}</div>
    <div class="actions"><button class="btn" id="close">닫기</button></div>`;
  $('sheet').classList.add('on');
  $('close').onclick = () => $('sheet').classList.remove('on');
  if (t.rep.length && t.rep[0].file) renderThumb(t.rep[0].file, t.rep[0].sketchPage, t.rep[0].thumb);
}

// ---------- viewer ----------
const loadScript = src => new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('뷰어를 불러오지 못했습니다 (인터넷 확인)')); document.head.appendChild(s); });
const XLSX_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const PDF_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let vZoom = 1, vRender = null;
async function pdfDoc(buf) { await loadScript(PDF_SRC); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER; return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; }
// The sketch is usually not page 1 (Columbia tech packs start with BOM tables and put the
// "TECH SKETCHES" near the end). A sketch page is drawn with many vector lines and has little
// text, so score every page by lines-per-text, plus a bonus for the word "sketch".
const SKETCH = {}; // file -> page number
async function findSketchPage(doc) {
  const OPS = window.pdfjsLib.OPS; let best = 1, bestScore = -Infinity;
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    let img = 0, path = 0;
    ops.fnArray.forEach(f => { if (f === OPS.paintImageXObject || f === OPS.paintJpegXObject || f === OPS.paintInlineImageXObject) img++; else if (f === OPS.constructPath) path++; });
    const tc = await page.getTextContent();
    const words = tc.items.map(t => t.str).join(' ');
    // photos/raster sketches (img >= 2) count too; a single image is usually just the logo
    const score = path / (tc.items.length + 30) * 10 + (img >= 2 ? img * 8 : 0) + (/sketch|flat drawing|technical drawing/i.test(words) ? 40 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
async function renderThumb(file, known, thumb) {
  try {
    if (known) SKETCH[file] = known;
    if (thumb) { // ready-made sketch image from GitHub (fast)
      const url = URL.createObjectURL(new Blob([await fetchAsset(thumb)], { type: 'image/jpeg' }));
      const img = $('tpThumb'); if (img) { img.src = url; img.alt = `스케치 (p.${known}) · 누르면 전체 테크팩`; img.dataset.page = known; }
      return;
    }
    const doc = await pdfDoc(await fetchAsset(file));
    const n = SKETCH[file] || 1; // page found in advance by the index builder
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1.6 }); const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const img = $('tpThumb'); if (img) { img.src = cv.toDataURL('image/jpeg', .85); img.alt = `스케치 (p.${n}) · 누르면 전체 테크팩`; img.dataset.page = n; }
  } catch (e) { const img = $('tpThumb'); if (img) img.alt = '스케치 미리보기 실패: ' + e.message; }
}
async function openViewer(file, name, startPage) {
  $('viewer').classList.add('on'); $('vTitle').textContent = name; $('vTabs').innerHTML = ''; $('vBody').innerHTML = '<div class="msg">불러오는 중…</div>'; vZoom = 1;
  try {
    const buf = await fetchAsset(file);
    if (/\.pdf$/i.test(file)) {
      const doc = await pdfDoc(buf);
      // page buttons; the sketch page (if known) is shown first, the rest render as you scroll
      const start = startPage || SKETCH[file] || 1;
      $('vTabs').innerHTML = Array.from({ length: doc.numPages }, (_, i) => `<button data-page="${i + 1}">${i + 1 === SKETCH[file] ? '✏️ ' : ''}p.${i + 1}</button>`).join('');
      vRender = async () => {
        $('vBody').innerHTML = '';
        const holders = [];
        for (let i = 1; i <= doc.numPages; i++) { const d = document.createElement('div'); d.dataset.p = i; d.style.minHeight = '200px'; $('vBody').appendChild(d); holders.push(d); }
        const drawn = new Set();
        const draw = async i => {
          if (drawn.has(i)) return; drawn.add(i);
          const page = await doc.getPage(i); const vp = page.getViewport({ scale: 1.5 * vZoom });
          const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; holders[i - 1].replaceChildren(cv); holders[i - 1].style.minHeight = '';
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        };
        await draw(start); holders[start - 1].scrollIntoView();
        const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) draw(+e.target.dataset.p); }), { root: $('vBody'), rootMargin: '600px' });
        holders.forEach(h => io.observe(h));
        $('vTabs').onclick = e => { const b = e.target.closest('[data-page]'); if (b) { const p = +b.dataset.page; draw(p).then(() => holders[p - 1].scrollIntoView()); } };
      };
    } else {
      await loadScript(XLSX_SRC);
      const wb = window.XLSX.read(buf, { type: 'array' });
      let cur = wb.SheetNames[0];
      $('vTabs').innerHTML = wb.SheetNames.map(n => `<button data-sheet="${esc(n)}">${esc(n)}</button>`).join('');
      vRender = async () => {
        document.querySelectorAll('#vTabs button').forEach(b => b.classList.toggle('on', b.dataset.sheet === cur));
        $('vBody').innerHTML = `<div style="zoom:${vZoom};padding:6px">${window.XLSX.utils.sheet_to_html(wb.Sheets[cur], { editable: false })}</div>`;
      };
      $('vTabs').onclick = e => { const b = e.target.closest('[data-sheet]'); if (b) { cur = b.dataset.sheet; vRender(); } };
    }
    await vRender();
  } catch (e) { $('vBody').innerHTML = `<div class="msg">열 수 없습니다: ${esc(e.message)}</div>`; }
}
document.addEventListener('click', e => {
  const sk = e.target.closest('[data-skey]'); if (sk) { $('sres').classList.remove('on'); $('search').value = ''; openStyle(sk.dataset.skey); return; }
  const op = e.target.closest('[data-open]'); if (op) { openViewer(op.dataset.open, op.dataset.name, +op.dataset.page || 0); return; }
  const sp = e.target.closest('[data-style]'); if (sp) { openStyle(sp.dataset.style); return; }
}, true);
$('vClose').onclick = () => { $('viewer').classList.remove('on'); $('vBody').innerHTML = ''; };
$('vZoomIn').onclick = () => { vZoom = Math.min(3, vZoom * 1.25); vRender && vRender(); };
$('vZoomOut').onclick = () => { vZoom = Math.max(.4, vZoom / 1.25); vRender && vRender(); };

// ---------- "가격" tab ----------
function viewPrice() {
  if (!STYLE) return '<div class="hint">가격 자료를 아직 불러오지 못했습니다. ↻ 를 눌러 주세요.</div>';
  const b = STYLE.buyers || [];
  const cm = Object.entries(STYLE.prices).filter(([, p]) => p.cm).map(([k, p]) => ({ k, ...p.cm })).sort((a, b) => (b.totalCm || 0) - (a.totalCm || 0));
  const fob = Object.entries(STYLE.prices).filter(([, p]) => p.fob).map(([k, p]) => ({ k, ...p.fob })).sort((a, b) => a.brand.localeCompare(b.brand) || (b.amount || 0) - (a.amount || 0));
  const usd = v => typeof v === 'number' ? '$' + Math.round(v).toLocaleString('en-US') : (v ? esc(v) : '-');
  return `<div class="card"><h2>바이어별 수주 · 예상 금액<small>${esc((STYLE.sources.buyers || '').split('/').pop())}</small></h2><div class="tablewrap"><table class="ptable">
      <tr><th>바이어 / 프로그램</th><th>형태</th><th>시즌</th><th>확정 수량</th><th>확정 금액</th><th>예상 수량</th><th>예상 금액</th><th>평균 단가</th><th>상태</th></tr>
      ${b.map(r => `<tr><td class="l">${esc(r.buyer)}</td><td>${esc(r.type || '')}</td><td>${esc(r.season || '')}</td><td>${typeof r.qty === 'number' ? num(r.qty) : esc(r.qty || '')}</td><td>${usd(r.amount)}</td><td>${typeof r.estQty === 'number' ? num(r.estQty) : esc(r.estQty || '')}</td><td>${usd(r.estAmount)}</td><td>${money(r.avg)}</td><td class="l">${esc(r.note || '')}</td></tr>`).join('')}
    </table></div></div>
    <div class="card"><h2>Columbia CM (스타일별)<small>${esc((STYLE.sources.cm || '').split('/').pop())} · 누르면 스타일 화면</small></h2><div class="tablewrap"><table class="ptable">
      <tr><th>스타일</th><th>품명</th><th>수량</th><th>CM</th><th>자수·프린트</th><th>TOTAL CM</th><th>상태</th></tr>
      ${cm.map(r => `<tr class="click" data-style="${esc(r.k)}"><td>${esc(r.style)}</td><td class="l">${esc(r.name || '')}</td><td>${typeof r.qty === 'number' ? num(r.qty) : ''}</td><td>${money(r.cm)}</td><td>${money(r.extra)}</td><td>${usd(r.totalCm)}</td><td class="l">${esc(r.status || '')}</td></tr>`).join('')}
    </table></div></div>
    <div class="card"><h2>FOB · 마진 (KMD · Macpac)<small>${esc((STYLE.sources.fob || '').split('/').pop())} · 빨간색 = 마진 12% 미만·Target 미달</small></h2><div class="tablewrap"><table class="ptable">
      <tr><th>스타일</th><th>브랜드</th><th>수량</th><th>Final FOB</th><th>Net Cost</th><th>마진 %</th><th>FOB 금액</th><th>판정</th></tr>
      ${fob.map(r => { const low = /12% 미만|미달/.test(r.flag || ''); return `<tr class="click" data-style="${esc(r.k)}"><td>${esc(r.style)}</td><td>${esc(r.brand)} ${esc(r.season)}</td><td>${typeof r.qty === 'number' ? num(r.qty) : ''}</td><td>${money(r.fob)}</td><td>${money(r.netCost)}</td><td class="${low ? 'bad' : 'good'}">${pct(r.marginPct)}</td><td>${usd(r.amount)}</td><td class="l ${low ? 'bad' : ''}">${esc(r.flag || '')}</td></tr>`; }).join('')}
    </table></div></div>
    <div class="hint">Fjällräven 등 다른 FOB 스타일은 위 검색창에서 스타일 번호로 찾아 코스팅 시트를 여세요.</div>`;
}

mountSearch();
