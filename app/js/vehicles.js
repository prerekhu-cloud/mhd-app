/* ===== mhdGO – vozidla na mapě (jízdní řád + živé polohy) ===== */
(function(){
 const D = MG.D, LV = MG.live;
 const V = MG.veh = {mk: new Map(), insts: [], byKey: new Map(), sel: null, liveMap: new Map(), extra: [], cap: 420};
 let simPats = null;
 MG.on('pack', () => { simPats = null; });
 function buildSim() {
  simPats = []; const seen = new Set();
  for (const oi of D.loaded) for (const li of (D.okLines.get(oi) || [])) {
   const L_ = D.ln.get(li); if (!L_) continue;
   for (const p of L_.pats) { if (seen.has(p.i)) continue; seen.add(p.i); simPats.push(p); }
  }
 }
 function bbox(p) {
  if (p._bb) return p._bb;
  let a = 90, b = 180, c = -90, d = -180;
  for (const g of p.s) { const q = D.pl.get(g); if (!q) continue; if (q.lat < a) a = q.lat; if (q.lat > c) c = q.lat; if (q.lon < b) b = q.lon; if (q.lon > d) d = q.lon; }
  return (p._bb = [a - .01, b - .015, c + .01, d + .015]);
 }
 V.clock = () => { const P = MG.pragueParts(MG.now()); return {P, day: D.dayIdx(P.ymd), m: P.h * 60 + P.mi + P.s / 60}; };
 /* aktivní spoje v okně (bounds = [s,w,n,e]) */
 V.active = (bounds, opt) => {
  opt = opt || {};
  if (!simPats) buildSim();
  const {day, m} = V.clock();
  const out = [];
  const [S, W, N, E] = bounds || [-90, -180, 90, 180];
  for (const p of simPats) {
   const L_ = D.ln.get(p.l); if (!L_) continue;
   if (MG.app.hideTrains && L_.k === 'vlak') continue;
   if (MG.app.hideRegio && (L_.k === 'regio' || L_.k === 'mezi')) continue;
   if (opt.trainsOnly && L_.k !== 'vlak') continue;
   const bb = bbox(p); if (bb[2] < S || bb[0] > N || bb[3] < W || bb[1] > E) continue;
   const T = p.T, nt = p.nt;
   for (let dd = 0; dd <= 1; dd++) {
    const mm = m + dd * 1440, d = day - dd;
    let lo = 0, hi = nt; while (lo < hi) { const mid = (lo + hi) >> 1; if (T[3 * mid] <= mm) lo = mid + 1; else hi = mid; }
    for (let j = lo - 1; j >= 0; j--) {
     const st = T[3 * j]; if (st < mm - p.dur - 45) break;
     const prof = T[3 * j + 1], dep = p.dep[prof], end = st + p.arr[prof][dep.length - 1];
     const key = p.i + ':' + j + ':' + d;
     const lv = V.liveMap.get(key);
     const dl = lv && lv.delay > 0 ? lv.delay : 0;
     if (end + dl < mm - .2) continue;
     if (st - 1.5 > mm) continue;
     if (!D.svcOn(T[3 * j + 2], d)) continue;
     out.push({key, p, j, day: d, prof, start: st, m: mm, L: L_, spoj: p.c ? p.c[j] : 0, num: p.n ? p.n[j] : '', head: D.headsign(p, j)});
    }
   }
  }
  return out;
 };
 V.place = (it) => {
  const lv = V.liveMap.get(it.key);
  /* zdroje bez zpoždění (celostátní GTFS-RT): odhad z polohy proti jízdnímu řádu */
  if (lv && lv.delay == null && isFinite(lv.lat) && (lv._estAt == null || Date.now() - lv._estAt > 15000)) { lv._est = D.estDelay(it, lv.lat, lv.lon); lv._estAt = Date.now(); }
  const delay = lv ? (lv.delay != null ? lv.delay : (lv._est != null ? lv._est : null)) : null;
  const t = it.m - it.start - (delay && delay > 0 ? delay : 0);
  const pos = D.tripPos(it.p, it.prof, t);
  it.pos = pos; it.delay = delay; it.live = lv || null; it.delayEst = !!(lv && lv.delay == null && delay != null);
  if (lv && isFinite(lv.lat)) { it.lat = lv.lat; it.lon = lv.lon; } else { it.lat = pos.lat; it.lon = pos.lon; }
  it.hd = pos.hd;
  return it;
 };
 /* ---------- živé párování ---------- */
 V.rematch = () => {
  const m = new Map();
  if (LV.on) {
   const vis = V.insts;
   for (const it of vis) {
    if (it.L.k === 'vlak' && it.num) { const t = LV.trains.get(String(it.num)); if (t) m.set(it.key, t); }
   }
   const {res, extra} = LV.matchBus(vis.filter(it => it.L.k !== 'vlak'));
   for (const [k, v] of res) m.set(k, v);
   V.extra = extra;
   const usedTrains = new Set([...m.values()].filter(v => v.train).map(v => v.num));
   V.extraTrains = [...LV.trains.values()].filter(t => !usedTrains.has(t.num));
  } else { V.extra = []; V.extraTrains = []; }
  V.liveMap = m;
  LV.liveCount = m.size;
  LV.updBtn && LV.updBtn();
 };
 MG.on('live', () => { V.rematch(); V.tick(true); });
 /* ---------- vykreslení ---------- */
 const dCls = d => d == null ? 'tt' : d <= 0.5 ? '' : d <= 3 ? 'mid' : 'bad';
 const dTxt = d => d == null ? '' : d <= 0.5 ? (d < -1 ? Math.round(d) : '✓') : '+' + Math.round(d);
 V.label = (it) => { const L_ = it.L; if (L_.k === 'vlak') { if (L_.lab) return L_.lab; return D.trainLabel(L_, it.num); } return L_.n || '?'; };
 function html(it, cls) {
  const L_ = it.L, dc = dCls(it.delay), train = L_.k === 'vlak';
  const ic = train ? '<i class="fa-solid fa-train"></i>' : '';
  const d = it.live ? '<span class="veh-d ' + dc + '"' + (it.delayEst ? ' title="odhad podle polohy"' : '') + '>' + (it.delay == null ? '<i class="fa-solid fa-tower-broadcast" style="font-size:7px"></i>' : (it.delayEst && it.delay > .5 ? '~' : '') + dTxt(it.delay)) + '</span>' : '';
  return '<div class="veh' + (train ? ' train' : '') + cls + '" style="--c:' + L_.c + ';--t:' + L_.tc + '"><span class="veh-arr" style="transform:translate(-50%,-50%) rotate(' + Math.round(it.hd || 0) + 'deg) translateY(-17px)"></span><span class="veh-l">' + ic + MG.h(V.label(it)) + '</span>' + d + '</div>';
 }
 let lastFull = 0;
 V.tick = (force) => {
  const map = MG.map.m; if (!map || !D.core) return;
  if (MG.mode3d) { V.insts = V.active(MG.m3d.bounds()); V.insts.forEach(V.place); MG.m3d.syncVehicles(V.insts); updCard(); return; }
  const z = map.getZoom(), b = map.getBounds().pad(.12);
  const bounds = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
  let insts = V.active(bounds, {trainsOnly: z < 9.5});
  insts.forEach(V.place);
  insts = insts.filter(it => it.lat >= bounds[0] && it.lat <= bounds[2] && it.lon >= bounds[1] && it.lon <= bounds[3]);
  const c = map.getCenter();
  if (insts.length > V.cap) { insts.forEach(it => it._dc = MG.dist(c.lat, c.lng, it.lat, it.lon) * (it.L.k === 'vlak' ? .5 : 1)); insts.sort((a, b2) => a._dc - b2._dc); insts = insts.slice(0, V.cap); }
  V.insts = insts; V.byKey = new Map(insts.map(i => [i.key, i]));
  if (V.sel && !V.byKey.has(V.sel)) { const it = V.findSel(); if (it) { V.insts.push(it); V.byKey.set(it.key, it); } }
  const cls = z < 11 ? ' dot' : z < 12.5 ? ' small' : '';
  const keep = new Set();
  const add = (key, lat, lon, h, onClick, sel) => {
   keep.add(key);
   let mk = V.mk.get(key);
   if (!mk) {
    mk = L.marker([lat, lon], {icon: L.divIcon({className: 'veh-ic', html: h, iconSize: [0, 0]}), pane: 'veh', keyboard: false, riseOnHover: true});
    mk._h = h; mk.on('click', (e) => { L.DomEvent.stop(e); onClick(); }); mk.addTo(map); V.mk.set(key, mk);
   } else {
    mk.setLatLng([lat, lon]);
    if (mk._h !== h) { mk._h = h; const el = mk.getElement(); if (el) el.innerHTML = h; }
   }
   mk.setZIndexOffset(sel ? 10000 : 0);
  };
  for (const it of V.insts) {
   const sel = V.sel === it.key;
   add(it.key, it.lat, it.lon, html(it, cls + (sel ? ' sel' : '')), () => V.select(it.key), sel);
  }
  /* živé vozy bez spoje v datech */
  if (LV.on) {
   for (const v of (z >= 10 ? (V.extra || []) : [])) {
    if (v._ok == null) v._ok = D.okresAt(v.lat, v.lon); if (!D.loaded.has(v._ok)) continue;
    if (v.lat < bounds[0] || v.lat > bounds[2] || v.lon < bounds[1] || v.lon > bounds[3]) continue;
    const key = 'x:' + v.src + ':' + (v.plate || v.cis + ':' + v.spoj || v.line);
    const L_ = lineForLive(v);
    const pseudo = {L: L_, delay: v.delay, live: v, hd: 0, num: ''};
    add(key, v.lat, v.lon, html(pseudo, cls), () => V.selectExtra(v, L_), false);
   }
   for (const t of (V.extraTrains || [])) {
    if (MG.app.hideTrains) continue;
    if (t.lat < bounds[0] || t.lat > bounds[2] || t.lon < bounds[1] || t.lon > bounds[3]) continue;
    const L_ = {k: 'vlak', c: '#5b6270', tc: '#fff', cat: t.cat, lab: ''};
    const pseudo = {L: L_, delay: t.delay, live: t, hd: t.az || 0, num: t.num};
    add('t:' + t.num, t.lat, t.lon, html(pseudo, cls), () => V.selectExtra(t, L_), false);
   }
  }
  for (const [k, mk] of V.mk) if (!keep.has(k)) { map.removeLayer(mk); V.mk.delete(k); }
  updCard();
  if (V.sel && Date.now() - lastFull > 4000) { lastFull = Date.now(); const it = V.byKey.get(V.sel); if (it) MG.map.showPattern(it.p, {fromD: it.pos.d, kind: 'veh', flow: true}); }
 };
 function lineForLive(v) {
  for (const L_ of D.ln.values()) if (L_.cis && v.cis && L_.cis.includes(v.cis)) return L_;
  for (const L_ of D.ln.values()) if (L_.n === String(v.line) && (L_.k === 'mhd' || L_.k === 'trol' || L_.k === 'tram')) return L_;
  return {k: 'mhd', n: String(v.line || '?'), c: '#8a8079', tc: '#fff'};
 }
 V.findSel = () => V.findKey(V.sel);
 V.findKey = (key) => {
  if (!key) return null;
  if (V.byKey.has(key)) return V.byKey.get(key);
  const [pi, j, d] = key.split(':').map(Number);
  const p = D.pt.get(pi); if (!p) return null;
  const {day, m} = V.clock();
  const st = p.T[3 * j], prof = p.T[3 * j + 1];
  const it = {key, p, j, day: d, prof, start: st, m: m + (day - d) * 1440, L: D.ln.get(p.l), spoj: p.c ? p.c[j] : 0, num: p.n ? p.n[j] : '', head: D.headsign(p, j)};
  return V.place(it);
 };
 /* ---------- bublina vozidla nad vozidlem (jako OpavaGO) ---------- */
 let pop = null, popEl = null, popSig = '';
 function openPop(lat, lon) {
  closePopOnly();
  popEl = document.createElement('div'); popEl.className = 'lv'; popSig = '';
  if (MG.mode3d) { MG.m3d.vehPopup(lat, lon, popEl, () => V.close(true)); return; }
  pop = L.popup({className: 'lv-pop', maxWidth: 300, minWidth: 282, offset: [0, -12], autoPanPaddingTopLeft: [20, 90], autoPanPaddingBottomRight: [20, 120]}).setLatLng([lat, lon]).setContent(popEl);
  pop.on('remove', () => { if (pop && !pop._quiet) V.close(true); });
  pop.openOn(MG.map.m);
 }
 function closePopOnly() { if (pop) { pop._quiet = true; MG.map.m.closePopup(pop); pop = null; } if (MG.m3d && MG.m3d.closeVehPopup) MG.m3d.closeVehPopup(); }
 function movePop(lat, lon) { if (pop) pop.setLatLng([lat, lon]); if (MG.mode3d && MG.m3d.moveVehPopup) MG.m3d.moveVehPopup(lat, lon); }
 V.select = (key, opt) => {
  V.sel = key; V.selExtra = null; V.showAll = false; V.pick = false;
  const it = V.byKey.get(key) || V.findSel(); if (!it) return;
  if (!MG.isWide || !MG.isWide()) MG.ui && MG.ui.closeSheets();
  MG.map.showPattern(it.p, {fromD: it.pos.d, kind: 'veh', flow: true}); lastFull = Date.now();
  openPop(it.lat, it.lon); renderCard(it);
  V.tick();
 };
 V.selectExtra = (v, L_) => { V.sel = null; V.selExtra = {v, L: L_}; MG.map.clearSel(); openPop(v.lat, v.lon); renderExtra(v, L_); };
 V.close = (fromPopup) => { const had = V.sel || V.selExtra; V.sel = null; V.selExtra = null; V.pick = false; if (!fromPopup) closePopOnly(); else { pop = null; } if (had && MG.map.selKind === 'veh') MG.map.clearSel(); V.tick(); };
 function updCard() {
  if (!popEl) return;
  if (V.sel) { const it = V.byKey.get(V.sel) || V.findSel(); if (it) { movePop(it.lat, it.lon); renderCard(it); } }
  else if (V.selExtra) { movePop(V.selExtra.v.lat, V.selExtra.v.lon); renderExtra(V.selExtra.v, V.selExtra.L); }
 }
 const KN = {metro: 'Metro', tram: 'Tramvaj', trol: 'Trolejbus', mhd: 'Autobus', regio: 'Regio autobus', mezi: 'Dálkový autobus', vlak: 'Vlak', lan: 'Lanovka', lod: 'Přívoz'};
 const KI = {metro: 'fa-train-subway', tram: 'fa-train-tram', trol: 'fa-bolt', mhd: 'fa-bus', regio: 'fa-bus-simple', mezi: 'fa-bus', vlak: 'fa-train', lan: 'fa-cable-car', lod: 'fa-ferry'};
 V.KN = KN; V.KI = KI;
 function delayChip(it) {
  if (!it.live) return '<span class="vc-dl tt" title="Poloha podle jízdního řádu"><i class="fa-regular fa-clock"></i> JŘ</span>';
  const d = it.delay; if (d == null) return '<span class="vc-dl">živě</span>';
  const est = it.delayEst ? ' title="Odhad zpoždění podle polohy vozidla"' : '', tl = it.delayEst ? '~' : '';
  if (d <= .5) return '<span class="vc-dl"' + est + '>' + (d < -1 ? tl + '−' + Math.abs(Math.round(d)) + ' min' : (it.delayEst ? '~včas' : 'včas')) + '</span>';
  return '<span class="vc-dl ' + (d <= 3 ? 'mid' : 'bad') + '"' + est + '>' + tl + '+' + Math.round(d) + ' min</span>';
 }
 function renderCard(it) {
  if (!popEl) return;
  const L_ = it.L, p = it.p, dep = p.dep[it.prof], arr = p.arr[it.prof], n = p.s.length, city = L_.city || '';
  const delay = it.delay && it.delay > 0 ? it.delay : 0;
  const pos = it.pos || {k: 0, at: true};
  let next = pos.at ? pos.k : pos.k + 1;
  if (pos.end) next = n - 1;
  const al0 = MG.alarm && MG.alarm.cur && MG.alarm.cur.key === it.key ? MG.alarm.cur.k : -1;
  const sig = [it.key, next, Math.round(delay), Math.floor(it.m), V.showAll, V.pick, al0, !!it.live].join('|');
  if (sig === popSig) { const s = popEl.querySelector('.vc-src em'); if (s && it.live) s.textContent = ageTxt(it.live); return; }
  popSig = sig;
  const rows = [];
  const first = V.showAll ? 0 : Math.max(1, next), last = V.showAll ? n - 1 : Math.min(n - 1, first + 3);
  for (let k = first; k <= last; k++) {
   const pl = D.pl.get(p.s[k]); const nm = D.shortName(D.stName(pl ? pl.st : 0), city);
   const sched = it.start + (k === 0 ? dep[k] : arr[k]);
   const exp = sched + delay, past = k < next;
   const tm = '<b>' + MG.hm2(past ? sched : exp) + '</b>' + (delay >= 1 && !past ? '<s>' + MG.hm2(sched) + '</s>' : '');
   const al = al0 === k;
   rows.push('<div class="tl-s' + (k === next ? ' nx' : '') + (past ? ' past' : '') + (k === n - 1 ? ' end' : '') + (V.pick && !past ? ' pick' : '') + '" data-k="' + k + '" data-st="' + (pl ? pl.st : '') + '" data-pl="' + p.s[k] + '"><i></i><span>' + (al ? '<em class="bell"><i class="fa-solid fa-bell"></i></em> ' : '') + MG.h(nm) + (D.isRequest(p, k) ? ' <span class="req-ic sm" title="Zastávka na znamení"><i class="fa-solid fa-thumbs-up"></i></span>' : '') + '</span>' + (pl && pl.lab && V.showAll ? '<em class="pl">' + MG.h(pl.lab) + '</em>' : '') + tm + '</div>');
  }
  const lv = it.live;
  const meta = [];
  meta.push('<span><i class="fa-solid ' + KI[L_.k] + '"></i>' + MG.h(KN[L_.k] || '') + '</span>');   /* typ vozu neznáme – jen druh dopravy */
  if (lv && lv.plate) meta.push('<span>ev. č. ' + MG.h(lv.plate) + '</span>');
  if (L_.k === 'vlak' && it.num) meta.push('<span>vlak ' + MG.h(it.num) + (lv && lv.name ? ' ' + MG.h(lv.name) : '') + '</span>');
  else if (it.spoj) meta.push('<span>spoj ' + it.spoj + '</span>');
  if ((p.w === 1) || (typeof p.w === 'string' && p.w[it.j] === '1') || (lv && lv.low)) meta.push('<span title="Nízkopodlažní"><i class="fa-solid fa-wheelchair"></i></span>');
  if (lv && lv.stand) meta.push('<span class="st"><i class="fa-solid fa-pause"></i>stojí</span>');
  const isAl = al0 >= 0;
  popEl.innerHTML = '<div class="vc-hd" style="--c:' + L_.c + '"><span class="vc-ln">' + (L_.k === 'vlak' ? '<i class="fa-solid fa-train"></i>' : '') + MG.h(V.label(it)) + '</span><div class="vc-hs"><small>' + (L_.k === 'vlak' ? MG.h(D.trainLabel(L_, it.num)) : 'Směr') + '</small><b>' + MG.h(D.shortName(it.head, city)) + '</b></div>' + delayChip(it) + '</div>' +
   '<div class="vc-st">' + (rows.length ? rows.join('') : '<div class="tl-s nx end"><i></i><span>' + MG.h(D.shortName(it.head, city)) + '</span><b>cíl</b></div>') + '</div>' +
   (V.pick ? '<div class="pick-hint"><i class="fa-solid fa-bell"></i>Klepni na zastávku, kde vystupuješ</div>' : '') +
   '<div class="vc-mt">' + meta.join('') + '</div>' +
   '<div class="lv-acts"><button data-a="bell" class="' + (V.pick || isAl ? 'on' : '') + '"><i class="fa-solid fa-bell"></i>' + (isAl ? 'Budík' : 'Budík') + '</button><button data-a="all"><i class="fa-solid fa-list"></i>' + (V.showAll ? 'Méně' : 'Celý spoj') + '</button><button data-a="line"><i class="fa-solid fa-route"></i>Linka</button><button data-a="3d"><i class="fa-solid fa-cubes"></i>Jízda 3D</button></div>' +
   '<div class="vc-src">' + (lv ? '<span class="dot-live"></span>Živě · ' + MG.h(lv.src || '') + ' · <em style="font-style:normal">' + ageTxt(lv) + '</em>' : '<span class="dot-tt"></span>Podle jízdního řádu') + '</div>';
  const A = (k, f) => { const b = popEl.querySelector('[data-a="' + k + '"]'); if (b) b.onclick = (e) => { e.stopPropagation(); f(); }; };
  A('bell', () => { if (isAl && !V.pick) { MG.alarm.clear(); MG.toast('Budík zrušen'); popSig = ''; renderCard(it); return; } V.pick = !V.pick; if (V.pick) V.showAll = true; popSig = ''; renderCard(it); });
  A('all', () => { V.showAll = !V.showAll; V.pick = false; popSig = ''; renderCard(it); });
  A('line', () => { const li = L_.i; V.close(); MG.net.openLine(li, {pattern: p.i}); });
  A('3d', () => { V.close && V.close(); MG.m3d.open({follow: it.key, ride: true, it}); });
  popEl.querySelectorAll('.tl-s').forEach(r => r.onclick = (e) => { e.stopPropagation(); if (V.pick && r.classList.contains('pick')) { V.pick = false; MG.alarm.set(it.key, +r.dataset.k); popSig = ''; renderCard(it); return; } });
  if (pop) pop.update();
 }
 function ageTxt(lv) {
  /* stáří polohy: vlastní čas zdroje (stream, GTFS-RT), jinak čas posledního načtení zdroje */
  let at = lv.t || (lv.ts ? lv.ts * 1000 : 0) || (lv.src === 'Správa železnic' ? LV.at.sz : lv.src === 'IDS JMK' ? LV.at.jmk : (lv.src === 'ODIS' && LV.at.odis ? LV.at.odis : LV.at.worker));
  if (!at) return '';
  const a = Math.max(0, Math.round((Date.now() - at) / 1000));
  return a > 3600 ? '' : 'před ' + (a < 60 ? a + ' s' : Math.round(a / 60) + ' min');
 }
 function renderExtra(v, L_) {
  if (!popEl) return;
  const isT = !!v.train;
  const lab = isT ? ((v.cat || 'Vlak') + ' ' + v.num) : (L_.n || v.line);
  const d = v.delay;
  const dl = d == null ? '<span class="vc-dl">živě</span>' : d <= .5 ? '<span class="vc-dl">včas</span>' : '<span class="vc-dl ' + (d <= 3 ? 'mid' : 'bad') + '">+' + Math.round(d) + ' min</span>';
  const rows = [];
  if (v.next) rows.push('<div class="tl-s nx"><i></i><span>' + MG.h(v.next) + '</span><b>' + (v.nextT ? MG.h(v.nextT) : 'příští') + '</b></div>');
  else if (v.cur || v.last) rows.push('<div class="tl-s nx"><i></i><span>' + MG.h(v.cur || v.last) + '</span><b>poslední</b></div>');
  const sig = 'x|' + lab + '|' + rows.join('') + '|' + d; if (sig === popSig) return; popSig = sig;
  popEl.innerHTML = '<div class="vc-hd" style="--c:' + (L_.c || '#5b6270') + '"><span class="vc-ln">' + (isT ? '<i class="fa-solid fa-train"></i>' : '') + MG.h(lab) + '</span><div class="vc-hs"><small>' + (isT ? MG.h((v.cat || 'Vlak') + ' ' + v.num + (v.name ? ' ' + v.name : '')) : 'Směr') + '</small><b>' + MG.h(v.head || '') + '</b></div>' + dl + '</div>' +
   '<div class="vc-st">' + rows.join('') + '</div><div class="vc-mt">' + (v.from ? '<span><i class="fa-solid fa-flag"></i>z ' + MG.h(v.from) + '</span>' : '') + (v.carrier ? '<span>' + MG.h(D.agency(v.carrier)) + '</span>' : '') + (v.plate ? '<span>ev. č. ' + MG.h(v.plate) + '</span>' : '') + '</div>' +
   '<div class="vc-src"><span class="dot-live"></span>Živě · ' + MG.h(v.src || '') + '</div>';
  if (pop) pop.update();
 }
 V.start = () => { setInterval(() => { try { V.tick() } catch (e) { MG.err('veh', e) } }, 1000); MG.on('view', () => V.tick()); };
})();
