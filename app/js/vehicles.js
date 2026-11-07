/* ===== mhdGO – vozidla na mapě (jízdní řád + živé polohy) ===== */
(function(){
 const D = MG.D, LV = MG.live;
 const V = MG.veh = {mk: new Map(), insts: [], byKey: new Map(), sel: null, liveMap: new Map(), extra: [], hideTrains: MG.store.get('hidetrains', false), cap: 420};
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
   if (V.hideTrains && L_.k === 'vlak') continue;
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
  const delay = lv && lv.delay != null ? lv.delay : null;
  const t = it.m - it.start - (delay && delay > 0 ? delay : 0);
  const pos = D.tripPos(it.p, it.prof, t);
  it.pos = pos; it.delay = delay; it.live = lv || null;
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
  const d = it.live ? '<span class="veh-d ' + dc + '">' + dTxt(it.delay) + '</span>' : '';
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
    if (v.lat < bounds[0] || v.lat > bounds[2] || v.lon < bounds[1] || v.lon > bounds[3]) continue;
    const key = 'x:' + v.src + ':' + (v.plate || v.cis + ':' + v.spoj || v.line);
    const L_ = lineForLive(v);
    const pseudo = {L: L_, delay: v.delay, live: v, hd: 0, num: ''};
    add(key, v.lat, v.lon, html(pseudo, cls), () => V.selectExtra(v, L_), false);
   }
   for (const t of (V.extraTrains || [])) {
    if (V.hideTrains) continue;
    if (t.lat < bounds[0] || t.lat > bounds[2] || t.lon < bounds[1] || t.lon > bounds[3]) continue;
    const L_ = {k: 'vlak', c: '#5b6270', tc: '#fff', cat: t.cat, lab: ''};
    const pseudo = {L: L_, delay: t.delay, live: t, hd: t.az || 0, num: t.num};
    add('t:' + t.num, t.lat, t.lon, html(pseudo, cls), () => V.selectExtra(t, L_), false);
   }
  }
  for (const [k, mk] of V.mk) if (!keep.has(k)) { map.removeLayer(mk); V.mk.delete(k); }
  updCard();
  if (V.sel && Date.now() - lastFull > 4000) { lastFull = Date.now(); const it = V.byKey.get(V.sel); if (it) MG.map.showPattern(it.p, {fromD: it.pos.d, kind: 'veh'}); }
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
 /* ---------- karta vozidla ---------- */
 const card = MG.$('vcard');
 V.select = (key, opt) => {
  V.sel = key; V.selExtra = null; V.showAll = false; V.pick = false;
  const it = V.byKey.get(key) || V.findSel(); if (!it) return;
  MG.ui && MG.ui.closeSheets();
  MG.map.showPattern(it.p, {fromD: it.pos.d, kind: 'veh'}); lastFull = Date.now();
  card.classList.add('open'); card.setAttribute('aria-hidden', 'false');
  renderCard(it);
  if (!opt || !opt.noPan) { const map = MG.map.m; if (!map.getBounds().pad(-.15).contains([it.lat, it.lon])) map.panTo([it.lat, it.lon]); }
  V.tick();
 };
 V.selectExtra = (v, L_) => { V.sel = null; V.selExtra = {v, L: L_}; MG.ui && MG.ui.closeSheets(); MG.map.clearSel(); card.classList.add('open'); renderExtra(v, L_); };
 V.close = () => { V.sel = null; V.selExtra = null; card.classList.remove('open'); card.setAttribute('aria-hidden', 'true'); if (MG.map.selKind === 'veh') MG.map.clearSel(); V.tick(); };
 function updCard() {
  if (!card.classList.contains('open')) return;
  if (V.sel) { const it = V.byKey.get(V.sel) || V.findSel(); if (it) renderCard(it); }
  else if (V.selExtra) renderExtra(V.selExtra.v, V.selExtra.L);
 }
 const KN = {metro: 'Metro', tram: 'Tramvaj', trol: 'Trolejbus', mhd: 'Autobus MHD', regio: 'Regionální autobus', mezi: 'Dálkový autobus', vlak: 'Vlak', lan: 'Lanovka', lod: 'Přívoz'};
 const KI = {metro: 'fa-train-subway', tram: 'fa-train-tram', trol: 'fa-bolt', mhd: 'fa-bus', regio: 'fa-bus-simple', mezi: 'fa-bus', vlak: 'fa-train', lan: 'fa-cable-car', lod: 'fa-ferry'};
 V.KN = KN; V.KI = KI;
 function delayChip(it) {
  if (!it.live) return '<div class="vc-dl tt"><i class="fa-regular fa-clock"></i> dle JŘ</div>';
  const d = it.delay; if (d == null) return '<div class="vc-dl">živě</div>';
  if (d <= .5) return '<div class="vc-dl">' + (d < -1 ? 'napřed ' + Math.abs(Math.round(d)) + ' min' : 'včas') + '</div>';
  return '<div class="vc-dl ' + (d <= 3 ? 'mid' : 'bad') + '">+' + Math.round(d) + ' min</div>';
 }
 function renderCard(it) {
  const L_ = it.L, p = it.p, dep = p.dep[it.prof], arr = p.arr[it.prof], n = p.s.length, city = L_.city || '';
  const delay = it.delay && it.delay > 0 ? it.delay : 0;
  const pos = it.pos || {k: 0, at: true};
  let next = pos.at ? pos.k : pos.k + 1;
  if (pos.end) next = n - 1;
  const rows = [];
  const first = V.showAll ? 0 : next, last = V.showAll ? n - 1 : Math.min(n - 1, next + 3);
  for (let k = first; k <= last; k++) {
   const pl = D.pl.get(p.s[k]); const nm = D.shortName(D.stName(pl ? pl.st : 0), city);
   const sched = it.start + (k === 0 ? dep[k] : arr[k]) - (it.day - V.clock().day) * 1440 * 0;
   const exp = sched + delay;
   const past = k < next;
   const tm = delay >= 1 && !past ? '<s>' + MG.hm2(sched) + '</s> <b>' + MG.hm2(exp) + '</b>' : '<b>' + MG.hm2(sched) + '</b>';
   const al = MG.alarm && MG.alarm.cur && MG.alarm.cur.key === it.key && MG.alarm.cur.k === k;
   rows.push('<div class="tl-s' + (k === next ? ' nx' : '') + (past ? ' past' : '') + (k === n - 1 ? ' end' : '') + (V.pick && !past ? ' pick' : '') + '" data-k="' + k + '" data-st="' + (pl ? pl.st : '') + '" data-pl="' + p.s[k] + '"><i></i><span>' + (al ? '<em class="bell"><i class="fa-solid fa-bell"></i></em> ' : '') + MG.h(nm) + (D.isRequest(p, k) ? ' <em class="rq" title="na znamení">✕</em>' : '') + '</span>' + (pl && pl.lab ? '<em class="pl">' + MG.h(pl.lab) + '</em>' : '') + tm + '</div>');
  }
  const more = n > 4 ? '<button class="btn sec sm" id="vc-all" style="margin:2px 14px 6px;width:calc(100% - 28px)">' + (V.showAll ? 'Jen příští zastávky' : 'Celý spoj (' + n + ' zastávek)') + '</button>' : '';
  const lv = it.live;
  const meta = [];
  meta.push('<span><i class="fa-solid ' + KI[L_.k] + '"></i>' + KN[L_.k] + (lv && lv.plate ? ' · ev. č. ' + MG.h(lv.plate) : '') + '</span>');
  if (L_.k === 'vlak' && it.num) meta.push('<span><i class="fa-solid fa-hashtag"></i>vlak ' + MG.h(it.num) + (lv && lv.name ? ' ' + MG.h(lv.name) : '') + '</span>');
  else if (it.spoj) meta.push('<span><i class="fa-solid fa-hashtag"></i>spoj ' + it.spoj + '</span>');
  if ((p.w === 1) || (typeof p.w === 'string' && p.w[it.j] === '1') || (lv && lv.low)) meta.push('<span><i class="fa-solid fa-wheelchair"></i>bezbariérový</span>');
  const ag = (lv && lv.carrier) || D.agency(L_.a && L_.a[0]); if (ag) meta.push('<span><i class="fa-solid fa-building"></i>' + MG.h(ag) + '</span>');
  if (lv && lv.stand) meta.push('<span><i class="fa-solid fa-circle-pause"></i>stojí</span>');
  const age = lv ? Math.max(0, Math.round((Date.now() - (lv.src === 'Správa železnic' ? LV.at.sz : LV.at.odis || LV.at.worker)) / 1000)) : 0;
  const src = lv ? '<span class="dot-live"></span>Živá poloha · ' + MG.h(lv.src || '') + (age < 600 ? ' · před ' + age + ' s' : '') : '<span class="dot-tt"></span>Poloha podle jízdního řádu – živá data pro tento spoj nejsou k dispozici';
  card.innerHTML = '<div class="vc-hd" style="--c:' + L_.c + '"><div class="vc-ln">' + (L_.k === 'vlak' ? '<i class="fa-solid fa-train"></i>' : '') + MG.h(V.label(it)) + '</div><div class="vc-hs"><small>' + KN[L_.k] + ' · směr</small><b>' + MG.h(D.shortName(it.head, city)) + '</b></div>' + delayChip(it) + '<button class="vc-x" id="vc-x" title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>' +
   '<div class="vc-body"><div class="vc-st">' + rows.join('') + '</div>' + more + '<div class="vc-mt">' + meta.join('') + '</div>' +
   (V.pick ? '<div class="pick-hint"><i class="fa-solid fa-bell"></i>Klepni na zastávku, kde vystupuješ – budík tě upozorní předem</div>' : '') +
   '<div class="vc-acts"><button class="btn sec" id="vc-line"><i class="fa-solid fa-route"></i>Linka</button><button class="btn sec' + (V.pick ? ' on' : '') + '" id="vc-bell"><i class="fa-solid fa-bell"></i>Budík</button><button class="btn sec" id="vc-3d"><i class="fa-solid fa-cube"></i>3D</button><button class="btn sec" id="vc-fol"><i class="fa-solid fa-location-crosshairs"></i>Sledovat</button></div></div>' +
   '<div class="vc-src">' + src + '</div>';
  MG.$('vc-x').onclick = V.close;
  MG.$('vc-line').onclick = () => { const li = L_.i; V.close(); MG.net.openLine(li, {pattern: p.i}); };
  MG.$('vc-3d').onclick = () => { MG.m3d.open({follow: it.key}); };
  MG.$('vc-fol').onclick = () => { V.follow = !V.follow; MG.toast(V.follow ? 'Mapa sleduje vozidlo' : 'Sledování vypnuto'); };
  const all = MG.$('vc-all'); if (all) all.onclick = () => { V.showAll = !V.showAll; renderCard(it); };
  MG.$('vc-bell').onclick = () => { if (MG.alarm.cur && MG.alarm.cur.key === it.key && !V.pick) { MG.alarm.clear(); MG.toast('Budík zrušen'); renderCard(it); return; } V.pick = !V.pick; V.showAll = V.pick || V.showAll; renderCard(it); };
  MG.qsa('.tl-s', card).forEach(r => r.onclick = () => { if (V.pick && r.classList.contains('pick')) { V.pick = false; MG.alarm.set(it.key, +r.dataset.k); renderCard(it); return; } const st = +r.dataset.st; if (st || st === 0) MG.dep.stopPopup(st, +r.dataset.pl); });
  if (V.follow && !MG.mode3d) MG.map.m.panTo([it.lat, it.lon], {animate: true, duration: .8});
 }
 function renderExtra(v, L_) {
  const isT = !!v.train;
  const lab = isT ? ((v.cat || 'Vlak') + ' ' + v.num) : (L_.n || v.line);
  const d = v.delay;
  const dl = d == null ? '<div class="vc-dl">živě</div>' : d <= .5 ? '<div class="vc-dl">včas</div>' : '<div class="vc-dl ' + (d <= 3 ? 'mid' : 'bad') + '">+' + Math.round(d) + ' min</div>';
  const rows = [];
  if (v.cur || v.last) rows.push('<div class="tl-s past"><i></i><span>' + MG.h(v.cur || v.last) + '</span></div>');
  if (v.next) rows.push('<div class="tl-s nx"><i></i><span>' + MG.h(v.next) + '</span>' + (v.nextT ? '<b>' + MG.h(v.nextT) + '</b>' : '') + '</div>');
  if (v.head) rows.push('<div class="tl-s end"><i></i><span>' + MG.h(v.head) + '</span></div>');
  card.innerHTML = '<div class="vc-hd" style="--c:' + (L_.c || '#5b6270') + '"><div class="vc-ln">' + (isT ? '<i class="fa-solid fa-train"></i>' : '') + MG.h(lab) + '</div><div class="vc-hs"><small>' + (isT ? 'Vlak' : 'Vozidlo') + ' · směr</small><b>' + MG.h(v.head || '') + '</b></div>' + dl + '<button class="vc-x" id="vc-x"><i class="fa-solid fa-xmark"></i></button></div>' +
   '<div class="vc-body"><div class="vc-st">' + rows.join('') + '</div><div class="vc-mt">' + (v.name ? '<span><i class="fa-solid fa-tag"></i>' + MG.h(v.name) + '</span>' : '') + (v.from ? '<span><i class="fa-solid fa-flag"></i>z ' + MG.h(v.from) + '</span>' : '') + (v.carrier ? '<span><i class="fa-solid fa-building"></i>' + MG.h(v.carrier) + '</span>' : '') + (v.plate ? '<span>ev. č. ' + MG.h(v.plate) + '</span>' : '') + '</div></div>' +
   '<div class="vc-src"><span class="dot-live"></span>Živá poloha · ' + MG.h(v.src || '') + ' · spoj není v načtených jízdních řádech</div>';
  MG.$('vc-x').onclick = V.close;
 }
 V.start = () => { setInterval(() => { try { V.tick() } catch (e) { MG.err('veh', e) } }, 1000); MG.on('view', () => V.tick()); };
})();
