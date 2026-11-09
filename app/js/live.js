/* ===== mhdGO – živé polohy a zpoždění =====
 Zdroje:
  • Správa železnic – polohy všech osobních vlaků v ČR se zpožděním (veřejné API, CORS povolen)
  • IDS JMK (Brno a Jihomoravský kraj) – otevřený stream poloh data.brno.cz (KORDIS JMK, CC BY 4.0), přímo z prohlížeče
  • worker mhdGO (worker/mhdgo-worker.js) – PID, celostátní GTFS-RT regionálních autobusů a MHD (IDOL, JIKORD, ODIS, IDZK,
    DÚK, DPMD…), ODIS přes proxy OpavaGO, IREDO (Královéhradecký a Pardubický kraj), MHD Hradec Králové
  • záložně ODIS přímo přes proxy OpavaGO */
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
 /* zdroje vázané na kraj se stahují, jen když je kraj v zorném poli (celá ČR je načtená najednou) */
 const krajBox = {};
 const needKraj = (code) => {
  const b = LV.bounds(.2); if (!b || !D.okresy) return false;
  let kb = krajBox[code];
  if (!kb) { kb = [90, 180, -90, -180]; D.okresy.forEach(o => { const k = D.kraje[o.kraj]; if (!k || k.code !== code) return; kb[0] = Math.min(kb[0], o.bbox[1]); kb[1] = Math.min(kb[1], o.bbox[0]); kb[2] = Math.max(kb[2], o.bbox[3]); kb[3] = Math.max(kb[3], o.bbox[2]); }); krajBox[code] = kb; }
  return !(b[2] < kb[0] || b[0] > kb[2] || b[3] < kb[1] || b[1] > kb[3]);
 };
 const needOdis = () => needKraj('MSK');
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
 /* oblast, pro kterou se stahují živé polohy: [jih, západ, sever, východ]; verze bez mapy nastaví MG.liveBounds */
 LV.bounds = (pad) => {
  if (MG.liveBounds) return MG.liveBounds(pad);
  if (MG.mode3d && MG.m3d && MG.m3d.map) return MG.m3d.bounds();
  if (!MG.map || !MG.map.m) return null;
  const b = MG.map.m.getBounds().pad(pad || 0); return [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
 };
 /* ---------- vlastní worker mhdGO ---------- */
 async function fetchWorker() {
  if (!MG.cfg.WORKER) { LV.st.worker = ''; return; }
  if (LV.wFail >= 3 && Date.now() - LV.wLast < 120000) return; /* nedostupný worker zkoušíme jen občas */
  try {
   const b = LV.bounds(0); if (!b) return;
   const u = MG.cfg.WORKER + (MG.cfg.WORKER.includes('?') ? '&' : '?') + 'bbox=' + [b[1], b[0], b[3], b[2]].map(x => x.toFixed(3)).join(',');
   const j = await getJSON(u, 12000);
   LV.busWorker = (j.vehicles || []).filter(v => isFinite(v.lat) && isFinite(v.lon)).map(v => Object.assign({src: v.src || 'mhdGO'}, v));
   for (const t of (j.trains || [])) if (t.num && !LV.trains.has(String(t.num))) LV.trains.set(String(t.num), Object.assign({train: true, src: t.src || 'mhdGO'}, t));
   LV.wStats = j.stats || {}; LV.at.worker = Date.now(); LV.st.worker = 'ok'; LV.wFail = 0;
  } catch (e) { LV.st.worker = 'err'; LV.err.worker = String(e.message || e); LV.wFail = (LV.wFail || 0) + 1; LV.wLast = Date.now(); LV.busWorker = []; }
 }
 /* ---------- IDS JMK: otevřený stream poloh (data.brno.cz) ---------- */
 const JMK = LV.jmk = {ws: null, veh: new Map(), names: null, filt: '', next: 0};
 const JMK_URL = 'wss://gis.brno.cz/geoevent/ws/services/Kordis_stream/StreamServer/subscribe';
 const needJmk = () => needKraj('JHM');
 function jmkFilter() {
  const ws = JMK.ws; if (!ws || ws.readyState !== 1) return;
  const bb = LV.bounds(.35); if (!bb) return;
  const [s_, w_, n_, e_] = bb;
  const r = x => Math.round(x * 50) / 50;
  const box = {xmin: r(w_) - .02, ymin: r(s_) - .02, xmax: r(e_) + .02, ymax: r(n_) + .02};
  const key = JSON.stringify(box); if (key === JMK.filt) return; JMK.filt = key;
  ws.send(JSON.stringify({filter: {geometry: JSON.stringify(Object.assign(box, {spatialReference: {wkid: 4326}})), outFields: 'ID,LineName,Delay,FinalStopID,Bearing,LF,VType,IsInactive'}}));
 }
 function jmkSync() {
  const want = LV.on && needJmk() && !document.hidden;
  if (!want) { if (JMK.ws) { const w = JMK.ws; JMK.ws = null; try { w.close(); } catch (_) {} } JMK.veh.clear(); LV.st.jmk = ''; return; }
  if (!JMK.names) { JMK.names = {}; MG.fetchJSON('kordis_stops.json').then(j => { JMK.names = j || {}; }).catch(() => {}); }
  if (JMK.ws) { jmkFilter(); return; }
  if (Date.now() < JMK.next || typeof WebSocket === 'undefined') return;
  try {
   const ws = JMK.ws = new WebSocket(JMK_URL); JMK.filt = ''; LV.st.jmk = LV.st.jmk || 'wait';
   ws.onopen = () => jmkFilter();
   ws.onmessage = ev => {
    let j; try { j = JSON.parse(ev.data); } catch (_) { return; }
    const a = j && j.attributes; if (!a || a.ID == null) return;
    if (String(a.IsInactive) === 'true' || a.VType === 5 || a.VType === 0) { JMK.veh.delete(a.ID); return; }
    const g = j.geometry || {}; if (!isFinite(g.y) || !isFinite(g.x)) return;
    JMK.veh.set(a.ID, {line: String(a.LineName || ''), lat: g.y, lon: g.x, delay: isFinite(a.Delay) ? +a.Delay : null, fin: a.FinalStopID, lf: String(a.LF) === 'true', b: a.Bearing, t: Date.now()});
    LV.st.jmk = 'ok'; LV.at.jmk = Date.now();
   };
   ws.onclose = ws.onerror = () => { if (JMK.ws === ws) { JMK.ws = null; JMK.next = Date.now() + 15000; if (LV.st.jmk !== 'ok') LV.st.jmk = 'err'; } };
  } catch (e) { JMK.ws = null; JMK.next = Date.now() + 30000; LV.st.jmk = 'err'; }
 }
 document.addEventListener('visibilitychange', () => jmkSync());
 function jmkList() {
  const now = Date.now(), out = [];
  for (const [id, v] of JMK.veh) { if (now - v.t > 180000) { JMK.veh.delete(id); continue; } out.push({src: 'IDS JMK', line: v.line, lat: v.lat, lon: v.lon, delay: v.delay, head: (JMK.names && JMK.names[v.fin]) || '', low: v.lf, bearing: v.b, plate: String(id), sys: 'JMK', t: v.t}); }
  return out;
 }
 LV.allBus = () => (LV.busOdis || []).concat(LV.busWorker || [], jmkList());
 /* ---------- párování živých vozů se spoji jízdního řádu ----------
  1) přesně: číslo linky CIS JŘ + číslo spoje (ODIS, celostátní GTFS-RT), PID: linka + spoj
  2) jinak (IDS JMK stream): stejná linka a cíl, nejbližší spoj k poloze podle jízdního řádu posunuté o hlášené zpoždění;
     přiřazení globálně od nejbližších dvojic, takže se vozy „nekradou“ */
 LV.matchBus = (insts) => {
  const res = new Map();
  const bus = LV.allBus(); if (!bus.length) return {res, extra: []};
  const byCis = new Map(), byShort = new Map(), byPid = new Map(), byCity = new Map();
  for (const it of insts) {
   const L_ = it.L; if (!L_ || L_.k === 'vlak') continue;
   if (it.spoj) for (const c of (L_.cis || [])) byCis.set(c + ':' + it.spoj, it);
   if (it.spoj && L_.city) byCity.set(L_.city + ':' + L_.n + ':' + it.spoj, it);
   if (L_.sys === 'PID' && it.spoj) byPid.set(L_.n + ':' + it.spoj, it);
   (byShort.get(L_.n) || byShort.set(L_.n, []).get(L_.n)).push(it);
  }
  const used = new Set(), rest = [], extra = [];
  for (const v of bus) {
   const it = v.cis && v.spoj ? byCis.get(v.cis + ':' + v.spoj) : (v.src === 'PID' && v.spoj ? byPid.get(v.line + ':' + v.spoj) : v.city && v.spoj ? byCity.get(v.city + ':' + v.line + ':' + v.spoj) : null);
   if (it && !used.has(it.key)) { used.add(it.key); res.set(it.key, v); }
   else if (v.cis && v.spoj) extra.push(v);         /* přesný klíč bez spoje v datech – nehádat */
   else rest.push(v);
  }
  const pairs = [];
  rest.forEach((v, vi) => {
   let cands = byShort.get(String(v.line)) || [];
   if (v.sys === 'JMK') cands = cands.filter(c => /JMK/.test(c.L.sys || ''));
   const vf = fold(v.head), hf = vf.split(' ').pop();
   for (const c of cands) {
    if (used.has(c.key)) continue;
    let lat = c.lat, lon = c.lon;
    if (v.delay != null && c.p) { const q = D.tripPos(c.p, c.prof, c.m - c.start - Math.max(-5, v.delay)); lat = q.lat; lon = q.lon; }
    const hs = fold(c.head);
    const okHead = !hf || hs.includes(hf) || vf.includes(hs.split(' ').pop());
    const d = MG.dist(v.lat, v.lon, lat, lon) * (okHead ? 1 : 4);
    const lim = c.L.k === 'regio' || c.L.k === 'mezi' ? 8000 : 2500;
    if (d < lim) pairs.push([d, vi, c]);
   }
  });
  pairs.sort((x, y) => x[0] - y[0]);
  const vUsed = new Set();
  for (const [d, vi, c] of pairs) { if (vUsed.has(vi) || used.has(c.key)) continue; vUsed.add(vi); used.add(c.key); res.set(c.key, rest[vi]); }
  rest.forEach((v, vi) => { if (!vUsed.has(vi)) extra.push(v); });
  return {res, extra};
 };
 /* ---------- smyčka ---------- */
 let tSZ = 0, tB = 0;
 LV.tick = async () => {
  if (!LV.on) return;
  const now = Date.now();
  const jobs = [];
  if (now - tSZ > 20000) { tSZ = now; jobs.push(fetchSZ()); }
  jmkSync();
  if (now - tB > 10000) { tB = now; const wOdis = LV.st.worker === 'ok' && Date.now() - LV.at.worker < 60000 && ((LV.wStats || {}).odis > 0 || (LV.wStats || {})['mpvnet:odis'] > 0); jobs.push(fetchWorker()); if (!wOdis) jobs.push(fetchOdis()); else { LV.busOdis = []; LV.st.odis = ''; } }
  if (jobs.length) { await Promise.all(jobs); MG.emit('live'); updBtn(); }
 };
 function updBtn() {
  const b = MG.$('live-btn'); if (!b) return;
  b.classList.remove('ok', 'warn', 'off');
  if (!LV.on) { b.classList.add('off'); b.title = 'Živé polohy vypnuty'; return; }
  const ok = LV.st.sz === 'ok' || LV.st.odis === 'ok' || LV.st.worker === 'ok' || LV.st.jmk === 'ok';
  const err = LV.st.sz === 'err' && (LV.st.odis === 'err' || !LV.st.odis);
  b.classList.add(ok ? 'ok' : err ? 'warn' : 'off');
  const ln = MG.$('live-n'); if (ln) ln.textContent = '';
  b.title = 'Živé polohy: vlaky ' + (LV.st.sz || '–') + (LV.st.worker === 'ok' ? ', worker mhdGO ' + Object.keys(LV.wStats || {}).filter(k => k !== 'alerts').map(k => ({jdf: 'regionální GTFS-RT', pid: 'PID', sz: 'SŽ', odis: 'ODIS', iredo: 'IREDO', dpmhk: 'MHD Hradec Králové'})[k] || k).join(', ') : '') + (LV.st.odis ? ', ODIS ' + LV.st.odis : '') + (LV.st.jmk ? ', IDS JMK ' + LV.st.jmk : '');
 }
 LV.updBtn = updBtn;
 LV.toggle = (on) => { LV.on = on; MG.store.set('live', on); if (on) { tSZ = tB = 0; LV.tick(); } else { LV.trains = new Map(); LV.busOdis = []; LV.busWorker = []; jmkSync(); MG.emit('live'); } updBtn(); };
 LV.start = () => { setInterval(() => LV.tick(), 2000); LV.tick(); };
})();
