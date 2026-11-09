/* ===== mhdGO – data: okresy, zastávky, linky, vzory tras, jízdní řády ===== */
(function(){
 const D = MG.D = {
  core: null, geo: null, idx: null, bed: null,
  st: new Map(), pl: new Map(), ln: new Map(), pt: new Map(),
  okLines: new Map(), okSt: new Map(), loaded: new Set(), loading: new Map(),
  svc: [], dalkove: false
 };
 const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
 D.loadCore = async () => {
  D.core = await MG.fetchJSON('core.json?v=' + Date.now().toString(36).slice(0, -4));
  D.svc = D.core.svc.map(b64);
  D.okresy = D.core.okresy; D.kraje = D.core.kraje;
  return D.core;
 };
 D.loadGeo = async () => {
  if (D.geo) return D.geo;
  const g = await MG.fetchJSON('geo.json');
  D.geo = {okresy: g.okresy.map(rings => rings.map(MG.decode)), kraje: g.kraje.map(rings => rings.map(MG.decode)), cz: (g.cz || []).map(MG.decode)};
  return D.geo;
 };
 D.loadIdx = async () => {
  if (D.idx) return D.idx;
  if (D._idxP) return D._idxP;
  D._idxP = MG.fetchJSON('stops.json').then(j => { D.idx = j.st.map(s => ({g: s[0], name: s[1], lat: s[2], lon: s[3], ok: s[4], m: s[5], f: MG.fold(s[1])})); return D.idx; });
  return D._idxP;
 };
 /* ---------- kalendář ---------- */
 D.dayIdx = (ymd) => MG.dayDiff(D.core.d0, ymd || MG.pragueParts(MG.now()).ymd);
 D.svcOn = (svc, day) => { if (day < 0 || day >= D.core.nd) return false; const u = D.svc[svc]; return !!(u && (u[day >> 3] >> (day & 7) & 1)); };
 D.dataValid = () => { const d = D.dayIdx(); return d >= 0 && d < D.core.nd; };
 /* ---------- balíčky ---------- */
 D.loadOkres = (oi) => {
  if (D.all || D.loaded.has(oi)) return D.all ? Promise.resolve(true) : Promise.resolve(true);
  if (D.loading.has(oi)) return D.loading.get(oi);
  const p = MG.fetchJSON('okres/' + oi + '.json').then(pk => { D.merge(pk, oi); D.loaded.add(oi); D.loading.delete(oi); MG.emit('pack', oi); return true; })
   .catch(e => { D.loading.delete(oi); throw e; });
  D.loading.set(oi, p);
  return p;
 };
 /* celá ČR najednou: jízdní řády bez geometrií (cz.json); trasy se dotahují po dlaždicích (shp/<id>.json) */
 D.loadAll = () => {
  if (D.all) return Promise.resolve(true);
  if (D._allP) return D._allP;
  D._allP = MG.fetchJSON('cz.json?v=' + (D.core && D.core.d0 || '')).then(pk => {
   D.merge(pk, -1);
   for (const l of pk.ln) { const L_ = D.ln.get(l.i); if (L_ && l.o) for (const o of l.o) L_.okresy.add(o); }
   D.all = true; D.dalkove = true; D.okresy.forEach((_, i) => D.loaded.add(i));
   MG.emit('pack', -1); return true;
  }).catch(e => { D._allP = null; throw e; });
  return D._allP;
 };
 D.shpLoaded = new Set(); D.shpLoading = new Map();
 D.loadShapes = (t) => {
  if (t == null || t < 0 || D.shpLoaded.has(t)) return Promise.resolve(true);
  if (D.shpLoading.has(t)) return D.shpLoading.get(t);
  const pr = MG.fetchJSON('shp/' + t + '.json').then(j => {
   for (const k in j) { const p = D.pt.get(+k); if (p && !p.g) { p.g = j[k][0]; p.x = j[k][1]; delete p._geo; } }
   D.shpLoaded.add(t); D.shpLoading.delete(t); MG.emit('shapes', t); return true;
  }).catch(e => { D.shpLoading.delete(t); D.shpLoaded.add(t); MG.err('shp', e); return false; });
  D.shpLoading.set(t, pr); return pr;
 };
 /* geometrie vzoru: hned vrátí, co je (případně přímky mezi zastávkami), a v pozadí dotáhne skutečnou trasu */
 D.wantShape = (p) => { if (!p.g && p.gt != null && p.gt >= 0 && !D.shpLoaded.has(p.gt)) D.loadShapes(p.gt); };
 D.shapeOf = async (p) => { if (!p.g && p.gt != null && p.gt >= 0) await D.loadShapes(p.gt); return D.geo3(p); };
 D.loadDalkove = () => {
  if (D.all) return Promise.resolve(true);
  if (D.dalkove) return Promise.resolve(true);
  if (D._dalP) return D._dalP;
  D._dalP = MG.fetchJSON('dalkove.json').then(pk => { D.merge(pk, -1); D.dalkove = true; return true; });
  return D._dalP;
 };
 D.merge = (pk, oi) => {
  for (const s of pk.st) if (!D.st.has(s[0])) D.st.set(s[0], {g: s[0], name: s[1], lat: s[2], lon: s[3], ok: s[4], pls: [], lines: new Set()});
  for (const p of pk.pl) if (!D.pl.has(p[0])) {
   const o = {g: p[0], st: p[1], lat: p[2], lon: p[3], lab: p[4] || '', wc: !!p[5], pats: []};
   D.pl.set(p[0], o); const s = D.st.get(p[1]); if (s) s.pls.push(p[0]);
  }
  for (const l of pk.ln) if (!D.ln.has(l.i)) { l.pats = []; l.okresy = new Set(); D.ln.set(l.i, l); }
  for (const l of pk.ln) if (oi >= 0) D.ln.get(l.i).okresy.add(oi);
  for (const p of pk.pt) {
   if (D.pt.has(p.i)) { if (p.g && !D.pt.get(p.i).g) { const q = D.pt.get(p.i); q.g = p.g; q.x = p.x; } continue; }
   prepPattern(p); D.pt.set(p.i, p);
   const L = D.ln.get(p.l); if (L) L.pats.push(p);
   p.s.forEach((pg, k) => { const pl = D.pl.get(pg); if (pl) pl.pats.push([p, k]); const st = pl && D.st.get(pl.st); if (st) st.lines.add(p.l); });
  }
  if (oi >= 0) { D.okLines.set(oi, pk.ln.map(l => l.i)); D.okSt.set(oi, pk.st.filter(s => s[4] === oi).map(s => s[0])); D.okNet = D.okNet || new Map(); if (pk.net) D.okNet.set(oi, {mhd: (pk.net.mhd || []).map(MG.decode), regio: (pk.net.regio || []).map(MG.decode), vlak: (pk.net.vlak || []).map(MG.decode)}); D.okObce = D.okObce || new Map(); D.okObce.set(oi, (pk.ob || []).map(o => ({name: o[0], lat: o[1], lon: o[2], pop: o[3], rings: o[4].map(MG.decode)}))); }
 };
 function prepPattern(p) {
  p.dep = []; p.arr = [];
  for (const pr of p.p) {
   const dd = pr[0], dw = pr[1], n = dd.length, dep = new Int16Array(n), arr = new Int16Array(n);
   let c = 0; for (let k = 0; k < n; k++) { c += dd[k]; dep[k] = c; arr[k] = dw ? c - dw[k] : c; }
   p.dep.push(dep); p.arr.push(arr);
  }
  p.T = Int32Array.from(p.t); p.nt = p.T.length / 3;
  p.dur = 0; for (const d of p.dep) p.dur = Math.max(p.dur, d[d.length - 1]);
  const fl = new Uint8Array(p.s.length); if (p.f) for (const [k, f] of p.f) fl[k] = f; p.fl = fl;
  delete p.t; delete p.p;
 }
 /* příznaky zastávky: pickup*4 + drop_off; 1 = nelze, 3 = na znamení */
 D.canBoard = (p, k) => (p.fl[k] >> 2) !== 1 && k < p.s.length - 1;
 D.canAlight = (p, k) => (p.fl[k] & 3) !== 1 && k > 0;
 D.isRequest = (p, k) => (p.fl[k] >> 2) === 3 || (p.fl[k] & 3) === 3;
 /* ---------- geometrie vzoru ---------- */
 D.geo3 = (p) => {
  if (p._geo) return p._geo;
  let pts, x;
  if (p.g) { pts = MG.decode(p.g); x = p.x; }
  else { pts = p.s.map(g => { const q = D.pl.get(g); return [q.lat, q.lon]; }); x = p.s.map((_, i) => i); }
  const tmp = !p.g && p.gt != null && p.gt >= 0 && !D.shpLoaded.has(p.gt);
  const n = pts.length, lat = new Float64Array(n), lon = new Float64Array(n), cd = new Float64Array(n);
  for (let i = 0; i < n; i++) { lat[i] = pts[i][0]; lon[i] = pts[i][1]; if (i) cd[i] = cd[i - 1] + MG.dist(lat[i - 1], lon[i - 1], lat[i], lon[i]); }
  const G = {lat, lon, cd, x, pts, tmp};
  if (!tmp) p._geo = G;
  return G;
 };
 D.pointAt = (g, d) => {
  const cd = g.cd; let lo = 0, hi = cd.length - 1;
  if (d <= 0) return [g.lat[0], g.lon[0], hi > 0 ? MG.bearing(g.lat[0], g.lon[0], g.lat[1], g.lon[1]) : 0, 0];
  if (d >= cd[hi]) return [g.lat[hi], g.lon[hi], hi > 0 ? MG.bearing(g.lat[hi - 1], g.lon[hi - 1], g.lat[hi], g.lon[hi]) : 0, hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cd[m] <= d) lo = m; else hi = m; }
  const f = (d - cd[lo]) / ((cd[hi] - cd[lo]) || 1);
  return [g.lat[lo] + (g.lat[hi] - g.lat[lo]) * f, g.lon[lo] + (g.lon[hi] - g.lon[lo]) * f, MG.bearing(g.lat[lo], g.lon[lo], g.lat[hi], g.lon[hi]), lo];
 };
 /* poloha spoje v čase t (minuty od odjezdu z výchozí zastávky) */
 D.tripPos = (p, prof, t) => {
  const dep = p.dep[prof], arr = p.arr[prof], n = dep.length, g = D.geo3(p);
  let k;
  if (t <= 0) { k = 0; const d = g.cd[g.x[0]]; const r = D.pointAt(g, d); return {lat: r[0], lon: r[1], hd: r[2], k: 0, at: true, f: 0, d}; }
  if (t >= arr[n - 1]) { const d = g.cd[g.x[n - 1]]; const r = D.pointAt(g, d); return {lat: r[0], lon: r[1], hd: r[2], k: n - 1, at: true, f: 1, d, end: true}; }
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= t) lo = m; else hi = m; }
  k = lo;
  if (t < dep[k]) { const d = g.cd[g.x[k]]; const r = D.pointAt(g, d); return {lat: r[0], lon: r[1], hd: r[2], k, at: true, f: 0, d}; }
  const span = arr[k + 1] - dep[k], f = span > 0 ? MG.clamp((t - dep[k]) / span, 0, 1) : 1;
  const d0 = g.cd[g.x[k]], d1 = g.cd[g.x[k + 1]], d = d0 + (d1 - d0) * f;
  const r = D.pointAt(g, d);
  return {lat: r[0], lon: r[1], hd: r[2], k, at: false, f, d};
 };
 /* odhad zpoždění z polohy vozidla: průmět na trasu spoje → plánovaný čas v tom místě (min). Pro zdroje bez zpoždění. */
 D.estDelay = (it, lat, lon) => {
  const p = it.p, g = D.geo3(p), dep = p.dep[it.prof], arr = p.arr[it.prof], n = dep.length, N = g.lat.length;
  const kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110574;
  const tNow = it.m - it.start;
  let best = null;
  for (let i = 0; i < N - 1; i++) {
   const ax = (g.lon[i] - lon) * kx, ay = (g.lat[i] - lat) * ky, bx = (g.lon[i + 1] - lon) * kx, by = (g.lat[i + 1] - lat) * ky;
   const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
   let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
   const px = ax + dx * t, py = ay + dy * t, dist = Math.hypot(px, py);
   if (dist > 160) continue;
   const d = g.cd[i] + (g.cd[i + 1] - g.cd[i]) * t;
   /* plánovaný čas ve vzdálenosti d */
   let k = 0; while (k < n - 2 && g.cd[g.x[k + 1]] < d) k++;
   const d0 = g.cd[g.x[k]], d1 = g.cd[g.x[k + 1]], f = d1 > d0 ? MG.clamp((d - d0) / (d1 - d0), 0, 1) : 0;
   const ts = dep[k] + (arr[k + 1] - dep[k]) * f;
   const del = tNow - ts, score = Math.abs(del) + dist / 80;
   if (!best || score < best.s) best = {s: score, del};
  }
  if (!best || best.del < -15 || best.del > 120) return null;
  return Math.round(best.del * 2) / 2;
 };
 /* ---------- linky ---------- */
 const KIND = {metro: ['fa-train-subway', 'Metro'], tram: ['fa-train-tram', 'Tramvaje'], trol: ['fa-bolt', 'Trolejbusy'], mhd: ['fa-bus', 'Autobusy MHD'], regio: ['fa-bus-simple', 'Regionální autobusy'], mezi: ['fa-route', 'Meziregionální a dálkové'], vlak: ['fa-train', 'Vlaky'], lan: ['fa-cable-car', 'Lanové dráhy'], lod: ['fa-ferry', 'Přívozy']};
 D.KIND = KIND;
 D.kindOrder = ['metro', 'tram', 'trol', 'mhd', 'regio', 'mezi', 'vlak', 'lan', 'lod'];
 D.trainLabel = (L, num) => { if (L.lab) return num ? L.lab + ' · ' + num : L.lab; const cat = L.cat || (num && +num < 2000 ? 'R' : 'Os'); return num ? cat + ' ' + num : cat; };
 D.lineText = (L) => L.k === 'vlak' ? (L.lab || L.cat || 'Vlak') : (L.n || '?');
 D.badge = (L, opt) => {
  opt = opt || {}; const cls = 'ln' + (opt.size ? ' ' + opt.size : '') + (L.k === 'vlak' ? ' train' : '');
  let t = opt.text || D.lineText(L); const ic = L.k === 'vlak' ? '<i class="fa-solid fa-train"></i>' : (L.k === 'lan' ? '<i class="fa-solid fa-cable-car"></i>' : L.k === 'lod' ? '<i class="fa-solid fa-ferry"></i>' : '');
  return '<span class="' + cls + '" style="--lc:' + L.c + ';--lt:' + L.tc + '"' + (opt.attr ? ' ' + opt.attr : '') + '>' + ic + MG.h(t) + '</span>';
 };
 D.mainPats = (L) => {
  const by = [null, null];
  for (const p of L.pats) { const d = p.d ? 1 : 0; if (!by[d] || p.nt > by[d].nt || (p.nt === by[d].nt && p.s.length > by[d].s.length)) by[d] = p; }
  return by;
 };
 D.agency = (a) => String(a || '').replace(/,?\s*(akciová společnost|a\.\s?s\.|s\.\s?r\.\s?o\.|spol\. s r\.\s?o\.|z\.\s?s\.|o\.\s?p\.\s?s\.)\s*$/i, '').replace(/^Dopravní podnik hl\. m\. Prahy/, 'DPP').trim();
 D.stName = (g) => { const s = D.st.get(g); return s ? s.name : '?'; };
 /* linky zastávky seřazené, bez duplicit (stejné číslo a barva z více systémů) */
 D.stLines = (g) => { const st = D.st.get(g); if (!st) return []; const seen = new Set(), out = []; for (const L_ of [...st.lines].map(i => D.ln.get(i)).filter(Boolean).sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || String(D.lineText(a)).localeCompare(String(D.lineText(b)), 'cs', {numeric: true}))) { const k = D.lineText(L_) + '|' + L_.c; if (seen.has(k)) continue; seen.add(k); out.push(L_); } return out; };
 D.plName = (g) => { const p = D.pl.get(g); return p ? D.stName(p.st) : '?'; };
 D.shortName = (name, city) => { if (!name) return ''; if (city && name.startsWith(city + ', ')) return name.slice(city.length + 2); return name; };
 D.headsign = (p, j) => (p.hs && p.hs[j]) || p.h || D.plName(p.s[p.s.length - 1]);
 D.trainNum = (p, j) => p.n ? p.n[j] : '';
 D.ttUrl = (L) => {
  const n = String(L.n || '');
  if (L.sys === 'PID' && L.k !== 'vlak' && n) return {href: 'https://pid.cz/linka/' + encodeURIComponent(n), src: 'PID · pid.cz'};
  if (L.sys === 'ODIS' && /^\d{1,3}$/.test(n)) return {href: 'https://www.kodis.cz/lines/detail/' + encodeURIComponent(n), src: 'ODIS · kodis.cz'};
  const [a, b] = D.mainPats(L); const p = a || b; if (!p) return null;
  const f = D.plName(p.s[0]), t = D.plName(p.s[p.s.length - 1]);
  const kind = L.k === 'vlak' ? 'vlaky' : 'vlakyautobusymhdvse';
  return {href: 'https://idos.cz/' + kind + '/spojeni/?f=' + encodeURIComponent(f) + '&t=' + encodeURIComponent(t), src: 'IDOS · jízdní řád ' + (L.k === 'vlak' ? 'vlaku' : 'linky') + (L.cis && L.cis[0] && L.k !== 'vlak' ? ' (CIS JŘ ' + L.cis[0] + ')' : '')};
 };
 /* ---------- odjezdy ze zastávky ---------- */
 D.departures = (stG, opt) => {
  opt = opt || {}; const s = D.st.get(stG); if (!s) return [];
  const ymd = opt.ymd || MG.pragueParts(MG.now()).ymd, day = D.dayIdx(ymd);
  const from = opt.from != null ? opt.from : MG.nowMin(), hor = opt.horizon || 240, lim = opt.limit || 60;
  const out = [];
  const pls = opt.platform != null ? [opt.platform] : s.pls;
  for (const pg of pls) {
   const pl = D.pl.get(pg); if (!pl) continue;
   for (const [p, k] of pl.pats) {
    if (!D.canBoard(p, k)) continue;
    if (opt.lines && !opt.lines.has(p.l)) continue;
    const T = p.T;
    for (let j = 0; j < p.nt; j++) {
     const st = T[3 * j], prof = T[3 * j + 1], svc = T[3 * j + 2];
     const tm = st + p.dep[prof][k];
     for (let dd = 0; dd <= 1; dd++) {
      const t = tm - dd * 1440; if (t < from - 1 || t > from + hor) continue;
      if (!D.svcOn(svc, day - dd)) continue;
      out.push({p, j, k, prof, day: day - dd, t, pl: pg, L: D.ln.get(p.l)});
     }
    }
   }
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(0, lim);
 };
 /* směr nástupiště (nejčastější další zastávka / cíl) */
 D.plDir = (pg) => {
  const pl = D.pl.get(pg); if (!pl) return '';
  if (pl._dir !== undefined) return pl._dir;
  const c = new Map();
  for (const [p, k] of pl.pats) { if (k >= p.s.length - 1) continue; const h = D.headsign(p, 0); c.set(h, (c.get(h) || 0) + p.nt); }
  let best = '', bn = 0; for (const [h, n] of c) if (n > bn) { bn = n; best = h; }
  return (pl._dir = best);
 };
 /* instance spoje v absolutním čase (minuty od začátku dne "day") */
 D.instAt = (p, j, day) => ({p, j, day, start: p.T[3 * j], prof: p.T[3 * j + 1], svc: p.T[3 * j + 2]});
 D.tripTimes = (inst) => { const dep = inst.p.dep[inst.prof], arr = inst.p.arr[inst.prof]; return {dep: Array.from(dep, x => x + inst.start), arr: Array.from(arr, x => x + inst.start)}; };
 /* okres podle polohy (polygony z geo.json) */
 D.okresAt = (lat, lon) => {
  if (!D.geo) return -1;
  const inRing = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (((a[0] > lat) !== (b[0] > lat)) && (lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1])) c = !c; } return c; };
  for (let i = 0; i < D.geo.okresy.length; i++) { const bb = D.okresy[i].bbox; if (lon < bb[0] - .01 || lon > bb[2] + .01 || lat < bb[1] - .01 || lat > bb[3] + .01) continue; if (D.geo.okresy[i].some(inRing)) return i; }
  return -1;
 };
 D.obecAt = (oi, lat, lon) => {
  const ob = D.okObce && D.okObce.get(oi); if (!ob) return null;
  const inRing = (r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i], b = r[j]; if (((a[0] > lat) !== (b[0] > lat)) && (lon < (b[1] - a[1]) * (lat - a[0]) / (b[0] - a[0]) + a[1])) c = !c; } return c; };
  for (const o of ob) if (o.rings.some(inRing)) return o;
  let best = null, bd = 1e18; for (const o of ob) { const d = MG.dist(lat, lon, o.lat, o.lon); if (d < bd) { bd = d; best = o; } }
  return best;
 };
 D.kraj = (oi) => D.kraje[D.okresy[oi].kraj];
})();
