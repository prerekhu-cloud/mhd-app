/* ===== mhdGO – živé polohy a zpoždění =====
 Zdroje:
  • Správa železnic – polohy všech osobních vlaků v ČR se zpožděním (veřejné API, CORS povolen)
  • ODIS (Moravskoslezský kraj) – autobusy, trolejbusy, tramvaje přes proxy (Cloudflare Worker OpavaGO)
  • volitelně vlastní worker mhdGO (worker/mhdgo-worker.js) – sjednocený formát pro další systémy */
(function(){
 const D = MG.D;
 const LV = MG.live = {on: MG.store.get('live', true), trains: new Map(), bus: [], st: {sz: '', odis: '', worker: ''}, at: {sz: 0, odis: 0, worker: 0}, err: {}};
 const fold = MG.fold;
 const parseDelay = ds => { const m = /\$([zp])-?(\d+)~min\.~(\d+)~s/.exec(ds || ''); if (!m) return null; const s = +m[2] * 60 + +m[3]; return m[1] === 'p' ? -s / 60 : s / 60; };
 async function getJSON(url, ms) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms || 12000);
  try { const r = await fetch(url, {signal: ctl.signal, cache: 'no-store'}); if (!r.ok) throw Error('HTTP ' + r.status); return await r.json(); } finally { clearTimeout(to); }
 }
 /* ---------- vlaky SŽ ---------- */
 async function fetchSZ() {
  try {
   const j = await getJSON(MG.cfg.SZ, 15000);
   const m = new Map();
   for (const f of (j.result || [])) {
    const p = f.properties || {}; const c = f.geometry && f.geometry.coordinates; if (!c) continue;
    const [lat, lon] = MG.jtsk(c[0], c[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const num = String(p.tn || '').trim();
    m.set(num, {num, cat: String(p.tt || '').trim(), name: p.na || '', lat, lon, delay: p.de == null || p.de === '' ? null : +p.de, from: p.fn || '', head: p.ln || '', cur: p.cna || '', next: p.nsn || '', nextT: p.nst || '', carrier: p.d || '', az: p.a, src: 'Správa železnic', train: true});
   }
   LV.trains = m; LV.at.sz = Date.now(); LV.st.sz = 'ok'; LV.err.sz = '';
  } catch (e) { LV.st.sz = 'err'; LV.err.sz = String(e.message || e); }
 }
 /* ---------- ODIS (proxy) ---------- */
 const needOdis = () => { for (const oi of D.loaded) { const k = D.kraje[D.okresy[oi].kraj]; if (k && k.code === 'MSK') return true; } return false; };
 async function fetchOdis() {
  if (!MG.cfg.ODIS || !needOdis()) { LV.st.odis = ''; return; }
  try {
   const j = await getJSON(MG.cfg.ODIS, 12000);
   const list = Array.isArray(j) ? j : (j.transmitters || j.odis || []);
   const out = [];
   for (const t of list) {
    if (!t || !isFinite(t.x) || !isFinite(t.y)) continue;
    const f = String(t.cn || '').split('|');
    if (t.cat === 1) { /* vlaky z ODIS – použijí se, když SŽ nejsou dostupné */
     const [cat = '', tn = ''] = String(t.n || f[0] || '').split(' ');
     const num = f[2] || tn; if (!LV.trains.has(num)) LV.trains.set(num, {num, cat: cat || '', lat: t.x, lon: t.y, delay: isFinite(t.dm) ? t.dm : null, head: f[9] || '', cur: f[3] || '', next: '', carrier: t.cr || '', src: 'ODIS', train: true});
     continue;
    }
    if (t.t && t.t !== 'H') continue;
    const cis = /^\d{6}$/.test(f[0]) ? f[0] : '';
    out.push({src: 'ODIS', cis, line: cis ? String(+cis.slice(3)) : f[0], spoj: +f[2] || 0, lat: t.x, lon: t.y, delay: isFinite(t.dm) ? t.dm : parseDelay(t.ds), last: f[3] || '', next: f[5] || '', from: f[8] || '', head: f[9] || '', low: f[10] === '1', plate: (f[11] || '').replace(/^Ev\.\s*č\.\s*/i, '').trim(), carrier: t.cr || '', stand: /stoji/.test(t.ico || ''), dpo: t.cat === 3 || /^DPO/.test(t.cr || '')});
   }
   LV.busOdis = out; LV.at.odis = Date.now(); LV.st.odis = 'ok'; LV.err.odis = '';
  } catch (e) { LV.st.odis = 'err'; LV.err.odis = String(e.message || e); }
 }
 /* ---------- vlastní worker mhdGO ---------- */
 async function fetchWorker() {
  if (!MG.cfg.WORKER) { LV.st.worker = ''; return; }
  if (LV.wFail >= 3 && Date.now() - LV.wLast < 120000) return; /* nedostupný worker zkoušíme jen občas */
  try {
   const c = MG.map.m.getBounds();
   const u = MG.cfg.WORKER + (MG.cfg.WORKER.includes('?') ? '&' : '?') + 'bbox=' + [c.getWest(), c.getSouth(), c.getEast(), c.getNorth()].map(x => x.toFixed(3)).join(',');
   const j = await getJSON(u, 12000);
   LV.busWorker = (j.vehicles || []).filter(v => isFinite(v.lat) && isFinite(v.lon)).map(v => Object.assign({src: v.src || 'mhdGO'}, v));
   for (const t of (j.trains || [])) if (t.num && !LV.trains.has(String(t.num))) LV.trains.set(String(t.num), Object.assign({train: true, src: t.src || 'mhdGO'}, t));
   LV.wStats = j.stats || {}; LV.at.worker = Date.now(); LV.st.worker = 'ok'; LV.wFail = 0;
  } catch (e) { LV.st.worker = 'err'; LV.err.worker = String(e.message || e); LV.wFail = (LV.wFail || 0) + 1; LV.wLast = Date.now(); LV.busWorker = []; }
 }
 LV.allBus = () => (LV.busOdis || []).concat(LV.busWorker || []);
 /* ---------- párování živých vozů se spoji jízdního řádu ---------- */
 LV.matchBus = (insts) => {
  const res = new Map();
  const bus = LV.allBus(); if (!bus.length) return {res, extra: []};
  const byCis = new Map(), byShort = new Map(), byPid = new Map();
  for (const it of insts) {
   const L_ = it.L; if (!L_ || L_.k === 'vlak') continue;
   for (const c of (L_.cis || [])) { const k = c + ':' + it.spoj; if (it.spoj) byCis.set(k, it); }
   if (L_.sys === 'PID' && it.spoj) byPid.set(L_.n + ':' + it.spoj, it);
   const ks = (L_.n || '') + '|' + (L_.city || L_.sys || '');
   (byShort.get(L_.n) || byShort.set(L_.n, []).get(L_.n)).push(it);
  }
  const used = new Set(), extra = [];
  for (const v of bus) {
   let it = v.cis && v.spoj ? byCis.get(v.cis + ':' + v.spoj) : (v.src === 'PID' && v.spoj ? byPid.get(v.line + ':' + v.spoj) : null);
   if (!it) {
    const cands = byShort.get(String(v.line)) || [];
    const hf = fold(v.head).split(' ').pop();
    let best = null, bd = 1e9;
    for (const c of cands) {
     if (used.has(c.key)) continue;
     const hs = fold(c.head);
     const okHead = !hf || hs.includes(hf) || fold(v.head).includes(hs.split(' ').pop());
     const d = MG.dist(v.lat, v.lon, c.lat, c.lon) * (okHead ? 1 : 3);
     if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < (best.L.k === 'regio' || best.L.k === 'mezi' ? 9000 : 3500)) it = best;
   }
   if (it && !used.has(it.key)) { used.add(it.key); res.set(it.key, v); }
   else extra.push(v);
  }
  return {res, extra};
 };
 /* ---------- smyčka ---------- */
 let tSZ = 0, tB = 0;
 LV.tick = async () => {
  if (!LV.on) return;
  const now = Date.now();
  const jobs = [];
  if (now - tSZ > 20000) { tSZ = now; jobs.push(fetchSZ()); }
  if (now - tB > 10000) { tB = now; const wOdis = LV.st.worker === 'ok' && Date.now() - LV.at.worker < 60000 && (LV.wStats || {})['mpvnet:odis'] > 0; jobs.push(fetchWorker()); if (!wOdis) jobs.push(fetchOdis()); else { LV.busOdis = []; LV.st.odis = ''; } }
  if (jobs.length) { await Promise.all(jobs); MG.emit('live'); updBtn(); }
 };
 function updBtn() {
  const b = MG.$('live-btn'); if (!b) return;
  b.classList.remove('ok', 'warn', 'off');
  if (!LV.on) { b.classList.add('off'); MG.$('live-n').textContent = ''; b.title = 'Živé polohy vypnuty'; return; }
  const ok = LV.st.sz === 'ok' || LV.st.odis === 'ok' || LV.st.worker === 'ok';
  const err = LV.st.sz === 'err' && (LV.st.odis === 'err' || !LV.st.odis);
  b.classList.add(ok ? 'ok' : err ? 'warn' : 'off');
  MG.$('live-n').textContent = LV.liveCount ? String(LV.liveCount) : '';
  b.title = 'Živé polohy: vlaky ' + (LV.st.sz || '–') + (LV.st.worker === 'ok' ? ', worker mhdGO ' + Object.keys(LV.wStats || {}).filter(k => k !== 'alerts').join(', ').replace(/mpvnet:/g, '').toUpperCase() : '') + (LV.st.odis ? ', ODIS ' + LV.st.odis : '');
 }
 LV.updBtn = updBtn;
 LV.toggle = (on) => { LV.on = on; MG.store.set('live', on); if (on) { tSZ = tB = 0; LV.tick(); } else { LV.trains = new Map(); LV.busOdis = []; LV.busWorker = []; MG.emit('live'); } updBtn(); };
 LV.start = () => { setInterval(() => LV.tick(), 2000); LV.tick(); };
})();
