/* ===== mhdGO bez mapy – odjezdy, spojení, navigace na zastávku, počasí, jízdné, Moje místa =====
 Jádro (data.js, raptor.js, live.js) je stejné jako v mapové verzi; živé polohy se stahují pro okolí
 vybrané zastávky / spojení a slouží ke zpoždění v odjezdech i ve spojeních. */
(function(){
 const D = MG.D, LV = MG.live, $ = MG.$, H = MG.h;
 const A = MG.lite = {view: 'dep', me: null, perm: 'prompt', st: null, near: null,
  dep: {when: null, ymd: null, lines: null, plat: null, open: null},
  conn: {from: null, to: null, res: null, sel: 0, t: null, ymd: null, busy: false},
  wx: {place: null, data: null, open: null}, focus: []};
 MG.app = MG.app || {}; /* sdílené moduly čtou MG.app.hideTrains apod. */

 /* ---------- drobnosti ---------- */
 const K = MG.core, clk = K.clk, fmtDur = K.fmtDur, walkMin = K.walkMin;
 const czN = (n, a, b, c) => n === 1 ? a : n >= 2 && n <= 4 ? b : c;
 const stIcon = m => m & 1 ? 'fa-train' : m & 4 ? 'fa-train-subway' : m & 2 ? 'fa-train-tram' : 'fa-bus-simple';
 const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
 A.fmtDur = fmtDur;
 const okName = oi => D.okresy && D.okresy[oi] ? D.okresy[oi].name : '';
 const legLabel = (L_, p, j) => L_.k === 'vlak' ? D.trainLabel(L_, p.n && p.n[j]) : null;

 /* ---------- poloha ---------- */
 A.locate = (quiet) => new Promise(res => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(p => { setMe(p); res(A.me); }, e => { if (e.code === 1) A.perm = 'denied'; if (!quiet) MG.toast(e.code === 1 ? 'Přístup k poloze je zakázaný – povol ho v prohlížeči' : 'Polohu se nepodařilo zjistit'); res(null); }, {enableHighAccuracy: true, timeout: 12000, maximumAge: 30000});
 });
 function setMe(p) {
  const c = p.coords, had = !!A.me; A.me = {lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: Date.now()}; A.perm = 'granted';
  if (!had) startWatch();
  MG.emit('me', A.me);
 }
 let watchId = null;
 function startWatch() { if (watchId != null || !navigator.geolocation) return; try { watchId = navigator.geolocation.watchPosition(p => { const c = p.coords; A.me = {lat: c.latitude, lon: c.longitude, acc: c.accuracy, hd: c.heading, t: Date.now()}; MG.emit('mepos', A.me); }, () => {}, {enableHighAccuracy: true, maximumAge: 5000}); } catch (_) {} }
 A.ensureAt = async (lat, lon) => { await D.loadAll().catch(() => {}); return D.okresAt(lat, lon); };
 function busy(on, txt) { const b = $('busy'); if (!b) return; b.hidden = !on; if (txt) $('busy-t').textContent = txt; }
 A.busy = busy;

 /* ---------- Moje místa ---------- */
 const FAV_IC = K.FAV_IC;
 A.favs = K.favs; A.saveFavs = K.saveFavs; A.addFav = K.addFav;
 A.isFav = (st) => A.favs().some(f => f.st === st);

 /* ---------- hledání zastávek a míst ---------- */
 A.findStops = K.findStops; A.geocode = K.geocode; A.nearestStops = K.nearestStops;
 async function suggest(q, opt) {
  opt = opt || {}; const out = [], f = MG.fold(q), F = A.favs();
  if (!f) {
   if (opt.me) out.push({kind: 'me', name: 'Moje poloha', sub: A.me ? 'aktuální poloha' : 'zjistit polohu'});
   for (const x of F) out.push({kind: 'fav', icon: x.icon, name: x.label, sub: x.name, lat: x.lat, lon: x.lon, st: x.st});
   return out;
  }
  if (opt.me && 'moje poloha'.startsWith(f)) out.push({kind: 'me', name: 'Moje poloha', sub: 'aktuální poloha'});
  for (const x of F) if (MG.fold(x.label + ' ' + x.name).includes(f)) out.push({kind: 'fav', icon: x.icon, name: x.label, sub: x.name, lat: x.lat, lon: x.lon, st: x.st});
  for (const s of await A.findStops(q, 7)) out.push({kind: 'stop', name: s.name, sub: okName(s.ok) ? 'okres ' + okName(s.ok) : '', lat: s.lat, lon: s.lon, st: s.g, ok: s.ok, m: s.m});
  return out;
 }
 A.suggest = suggest;
 const sugRow = (r, i) => { const ic = r.kind === 'me' ? 'fa-location-crosshairs' : r.kind === 'fav' ? (r.icon || 'fa-star') : r.kind === 'addr' ? 'fa-location-dot' : stIcon(r.m);
  const chips = r.kind === 'stop' && D.st.has(r.st) ? D.stLines(r.st).slice(0, 8).map(x => D.badge(x)).join('') : '';
  return '<button type="button" class="sg-it" data-i="' + i + '"><span class="sg-ic ' + r.kind + '"><i class="fa-solid ' + ic + '"></i></span><span class="sg-tx"><b>' + H(r.name) + '</b>' + (chips ? '<span class="sg-ln">' + chips + '</span>' : '<small>' + H(r.sub || (r.kind === 'addr' ? 'adresa' : '')) + '</small>') + '</span></button>'; };
 /* našeptávač: zastávky okamžitě, adresy z Photonu po chvilce */
 A.attachSug = (input, box, onPick, opt) => {
  let items = [], seq = 0, hi = -1;
  const close = () => { seq++; box.hidden = true; box.innerHTML = ''; hi = -1; };
  const paint = () => {
   if (document.activeElement !== input) return; /* mezitím vybráno nebo opuštěno */
   if (!items.length) { const v = input.value.trim(); box.innerHTML = v.length > 1 ? '<div class="sg-empty">Nic nenalezeno</div>' : ''; box.hidden = !box.innerHTML; return; }
   box.innerHTML = items.map(sugRow).join(''); box.hidden = false;
   MG.qsa('.sg-it', box).forEach(x => { x.onpointerdown = e => e.preventDefault(); x.onclick = () => { const r = items[+x.dataset.i]; close(); input.blur(); onPick(r); }; });
  };
  const run = MG.debounce(async () => {
   const my = ++seq, v = input.value.trim();
   items = await suggest(v, opt); if (my !== seq) return; paint();
   if (v.length >= 3) { const ad = await A.geocode(v, 4); if (my !== seq) return; items = items.concat(ad).slice(0, 12); paint(); }
  }, 140);
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', e => {
   const its = MG.qsa('.sg-it', box);
   if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); hi = MG.clamp(hi + (e.key === 'ArrowDown' ? 1 : -1), 0, its.length - 1); its.forEach((x, i) => x.classList.toggle('hi', i === hi)); }
   else if (e.key === 'Enter') { e.preventDefault(); const r = items[hi >= 0 ? hi : 0]; if (r) { close(); input.blur(); onPick(r); } }
   else if (e.key === 'Escape') close();
  });
  return {close};
 };
 /* "Moje poloha" → bod */
 A.mePoint = K.mePoint;
 K.me = () => A.me; K.locate = () => A.locate(false);
 K.ctx = () => ({stop: A.st, conn: A.conn, center: A.focusPt()});
 K.wxPlace = () => A.wxPlace();

 /* ---------- živé polohy: instance spojů a párování ---------- */
 A.mkInst = K.mkInst; A.liveOf = K.liveOf; A.delayOf = K.delayOf; A.dlBadge = K.dlBadge;
 /* oblast pro worker a stream IDS JMK: okolí vybraných míst */
 A.focusPt = () => { const f = A.focus[0]; if (f) return {lat: f[0], lon: f[1]}; return A.me ? {lat: A.me.lat, lon: A.me.lon} : null; };
 MG.liveBounds = (pad) => {
  const pts = A.focus.length ? A.focus : (A.me ? [[A.me.lat, A.me.lon]] : []);
  if (!pts.length) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const [la, lo] of pts) { s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo); }
  const py = .22 + (n - s) * (pad || 0), px = .34 + (e - w) * (pad || 0);
  return [s - py, w - px, n + py, e + px];
 };
 function setFocus(pts) { A.focus = pts.filter(p => p && isFinite(p[0])); }

 /* =====================================================================
  ODJEZDY
 ===================================================================== */
 A.showStop = async (g, ok, opt) => {
  opt = opt || {};
  if (!D.st.has(g)) {
   const idx = await D.loadIdx(); const x = idx.find(s => s.g === g);
   if (ok == null || ok < 0) ok = x ? x.ok : -1;
   await D.loadAll().catch(() => {});
  }
  if (!D.st.has(g)) { MG.toast('Zastávku se nepodařilo načíst'); return; }
  A.st = g; A.dep.lines = null; A.dep.plat = null; A.dep.open = null;
  if (!opt.keepTime) { A.dep.when = null; A.dep.ymd = null; }
  const s = D.st.get(g); setFocus([[s.lat, s.lon]]);
  const q = $('dq'); if (q) q.value = s.name;
  if ($('dq-x')) $('dq-x').hidden = false;
  A.go('dep'); renderDep(); LV.tick();
  MG.emit('stop', g);
 };
 A.clearStop = () => { A.st = null; setFocus([]); const q = $('dq'); if (q) q.value = ''; if ($('dq-x')) $('dq-x').hidden = true; renderDep(); };
 A.nearestStop = async (pt) => { const n = await A.nearestStops(pt.lat, pt.lon, 1, 3000); if (n.length) A.showStop(n[0][1].g, n[0][1].ok); else MG.toast('V okolí není žádná zastávka'); };
 function bindDepTop() {
  A.attachSug($('dq'), $('dq-sug'), r => {
   if (r.kind === 'me') return A.mePoint().then(p => p && A.nearestStop(p));
   if (r.st != null) return A.showStop(r.st, r.ok);
   A.nearestStop(r);
  });
  $('dq-x').onclick = () => A.clearStop();
  $('dq-me').onclick = async () => { const p = await A.mePoint(); if (p) A.nearestStop(p); };
 }
 const favStrip = (ctx) => {
  const F = A.favs(), has = n => F.some(f => f.label === n);
  return '<div class="favs" data-ctx="' + ctx + '">' + F.map((f, i) => '<button type="button" class="fav" data-fav="' + i + '"><i class="fa-solid ' + (f.icon || 'fa-star') + '"></i><span>' + H(f.label) + '</span></button>').join('') +
   (has('Domů') ? '' : '<button type="button" class="fav ghost" data-favadd="Domů"><i class="fa-solid fa-house"></i><span>Domů</span><i class="fa-solid fa-plus pl"></i></button>') +
   (has('Práce') ? '' : '<button type="button" class="fav ghost" data-favadd="Práce"><i class="fa-solid fa-briefcase"></i><span>Práce</span><i class="fa-solid fa-plus pl"></i></button>') +
   '<button type="button" class="fav ghost" data-favadd=""><i class="fa-solid fa-plus"></i><span>Přidat</span></button></div>';
 };
 function bindFavs(el, onPick) {
  const F = A.favs();
  MG.qsa('[data-fav]', el).forEach(b => b.onclick = () => onPick(F[+b.dataset.fav]));
  MG.qsa('[data-favadd]', el).forEach(b => b.onclick = () => A.favDialog(b.dataset.favadd));
 }
 A.favStrip = favStrip; A.bindFavs = bindFavs;
 async function renderDepHome(body) {
  const F = A.favs();
  let h = favStrip('dep');
  h += '<div id="home-favs"></div><div id="home-near"></div>';
  body.innerHTML = h;
  bindFavs(body, f => { if (f.st != null) A.showStop(f.st); else A.nearestStop(f); });
  /* Moje místa: nejbližší zastávka a nejbližší odjezdy + rychlé spojení */
  if (F.length) {
   const box = $('home-favs');
   const cards = [];
   for (const f of F.slice(0, 6)) {
    let g = f.st, sname = '', dist = 0, ok = -1;
    if (g == null) { const n = await A.nearestStops(f.lat, f.lon, 1, 900); if (n.length) { g = n[0][1].g; dist = n[0][0]; sname = n[0][1].name; ok = n[0][1].ok; } }
    else { const s = D.st.get(g); sname = s ? s.name : f.name; }
    let deps = '';
    if (g != null && D.st.has(g)) {
     const ds = D.departures(g, {limit: 3, horizon: 90}), c = clk();
     deps = ds.map(d => D.badge(d.L, {text: legLabel(d.L, d.p, d.j)}) + '<span class="hf-t">' + (Math.round(d.t - c.m) <= 0 ? 'teď' : Math.round(d.t - c.m) < 60 ? Math.round(d.t - c.m) + ' min' : MG.hm2(d.t)) + '</span>').join('');
    }
    cards.push('<div class="hf"><div class="hf-top"><span class="hf-ic"><i class="fa-solid ' + (f.icon || 'fa-star') + '"></i></span><span class="hf-tx"><b>' + H(f.label) + '</b><small>' + H(sname ? (sname !== f.name ? sname + (dist ? ' · ' + MG.fmtDist(dist) : '') : f.name) : f.name) + '</small></span></div>' +
     (deps ? '<div class="hf-deps">' + deps + '</div>' : '') +
     '<div class="hf-acts"><button type="button" class="btn sm pri" data-hfto="' + F.indexOf(f) + '"><i class="fa-solid fa-route"></i> Spojení sem</button>' + (g != null ? '<button type="button" class="btn sm" data-hfst="' + g + '" data-hfok="' + ok + '"><i class="fa-regular fa-clock"></i> Odjezdy</button>' : '') + '</div></div>');
   }
   if ($('home-favs') === box) {
    box.innerHTML = '<div class="sec-t">Moje místa</div><div class="hf-grid">' + cards.join('') + '</div>';
    MG.qsa('[data-hfto]', box).forEach(b => b.onclick = async () => { const f = F[+b.dataset.hfto]; const me = await A.mePoint(); A.connTo({name: f.label, lat: f.lat, lon: f.lon, st: f.st, kind: 'fav'}, me); });
    MG.qsa('[data-hfst]', box).forEach(b => b.onclick = () => A.showStop(+b.dataset.hfst, +b.dataset.hfok));
   }
  }
  renderNear();
 }
 async function renderNear() {
  const box = $('home-near'); if (!box) return;
  if (!A.me) {
   box.innerHTML = '<div class="sec-t">Zastávky v okolí</div><div class="empty"><i class="fa-solid fa-location-crosshairs"></i><p>Povol polohu a uvidíš nejbližší zastávky s odjezdy, nebo napiš název zastávky.</p><button type="button" class="btn pri" id="near-loc"><i class="fa-solid fa-location-arrow"></i> Povolit polohu</button></div>';
   $('near-loc').onclick = () => A.locate(false);
   return;
  }
  const near = await A.nearestStops(A.me.lat, A.me.lon, 6, 1500);
  if ($('home-near') !== box) return;
  if (!near.length) { box.innerHTML = '<div class="sec-t">Zastávky v okolí</div><div class="empty"><i class="fa-solid fa-map-pin"></i><p>Do 1,5 km tu není žádná zastávka.</p></div>'; return; }
  const c = clk();
  box.innerHTML = '<div class="sec-t">Zastávky v okolí</div>' + near.map(([d, x]) => {
   let nx = '';
   if (D.st.has(x.g)) { const ds = D.departures(x.g, {limit: 4, horizon: 60}); nx = ds.map(q => '<span class="nx">' + D.badge(q.L, {text: legLabel(q.L, q.p, q.j)}) + '<small>' + (Math.round(q.t - c.m) <= 0 ? 'teď' : Math.round(q.t - c.m) + ' min') + '</small></span>').join(''); }
   return '<button type="button" class="ncard" data-g="' + x.g + '" data-ok="' + x.ok + '"><span class="nc-ic"><i class="fa-solid ' + stIcon(x.m) + '"></i></span><span class="nc-main"><b>' + H(x.name) + '</b><span class="nc-nx">' + (nx || '<small class="mut">odjezdy po klepnutí</small>') + '</span></span><span class="nc-d"><b>' + walkMin(d) + ' min</b><small>' + MG.fmtDist(d) + '</small></span></button>';
  }).join('');
  MG.qsa('.ncard', box).forEach(b => b.onclick = () => A.showStop(+b.dataset.g, +b.dataset.ok));
 }
 function renderDep() {
  const body = $('dep-body'); if (!body) return;
  if (A.st == null) return renderDepHome(body);
  const s = D.st.get(A.st), c = clk();
  const ymd = A.dep.ymd || c.ymd, from = A.dep.when != null ? A.dep.when : c.m;
  const dist = A.me ? MG.dist(A.me.lat, A.me.lon, s.lat, s.lon) : null;
  let h = '<div class="stop-card"><div class="sc-top"><span class="sc-ic"><i class="fa-solid ' + stIcon(D.stLines(A.st).some(L_ => L_.k === 'vlak') ? 1 : D.stLines(A.st).some(L_ => L_.k === 'tram') ? 2 : 0) + '"></i></span><span class="sc-tx"><b>' + H(s.name) + '</b><small>okres ' + H(okName(s.ok)) + (dist != null ? ' · ' + MG.fmtDist(dist) + ' · pěšky ' + walkMin(dist) + ' min' : '') + '</small></span>' +
   '<button type="button" class="ib' + (A.isFav(A.st) ? ' on' : '') + '" id="sc-fav" title="Uložit do Mých míst"><i class="fa-' + (A.isFav(A.st) ? 'solid' : 'regular') + ' fa-star"></i></button></div>' +
   '<div class="sc-acts"><button type="button" class="btn sm pri" id="sc-nav"><i class="fa-solid fa-person-walking"></i> Navigovat sem</button><button type="button" class="btn sm" id="sc-from"><i class="fa-solid fa-route"></i> Spojení odsud</button><button type="button" class="btn sm" id="sc-to"><i class="fa-solid fa-flag-checkered"></i> Spojení sem</button></div>' +
   '<div class="sc-lines">' + D.stLines(A.st).map(L_ => '<button type="button" class="lnf' + (A.dep.lines && A.dep.lines.has(L_.i) ? ' on' : '') + '" data-ln="' + L_.i + '">' + D.badge(L_) + '</button>').join('') + '</div>';
  const pls = s.pls.filter(g => D.pl.get(g) && D.pl.get(g).pats.length);
  if (pls.length > 1) h += '<div class="chips"><button type="button" class="chip' + (A.dep.plat == null ? ' on' : '') + '" data-pl="all">Všechna nástupiště</button>' + pls.map(g => { const pl = D.pl.get(g); return '<button type="button" class="chip' + (A.dep.plat === g ? ' on' : '') + '" data-pl="' + g + '">' + (pl.lab ? H(pl.lab) + ' · ' : '') + '→ ' + H(D.shortName(D.plDir(g), '').split(',').pop().trim()) + '</button>'; }).join('') + '</div>';
  h += '</div>';
  h += '<div class="tctl"><button type="button" class="chip' + (A.dep.when == null && !A.dep.ymd ? ' on' : '') + '" id="dt-now">Teď</button><input type="time" id="dt-t" value="' + MG.hm2(from) + '"><input type="date" id="dt-d" value="' + ymd + '" min="' + D.core.d0 + '" max="' + MG.ymdAdd(D.core.d0, D.core.nd - 1) + '"></div>';
  h += '<div id="dep-list"></div>';
  body.innerHTML = h;
  $('sc-fav').onclick = () => { if (A.isFav(A.st)) { A.saveFavs(A.favs().filter(f => f.st !== A.st)); MG.toast('Odebráno z Mých míst'); renderDep(); } else A.favDialog('', {name: s.name, lat: s.lat, lon: s.lon, st: A.st}); };
  $('sc-nav').onclick = () => A.nav({name: s.name, lat: s.lat, lon: s.lon, st: A.st});
  $('sc-from').onclick = () => A.connTo(null, {kind: 'stop', name: s.name, lat: s.lat, lon: s.lon, st: A.st});
  $('sc-to').onclick = async () => A.connTo({kind: 'stop', name: s.name, lat: s.lat, lon: s.lon, st: A.st}, await A.mePoint());
  MG.qsa('[data-ln]', body).forEach(b => b.onclick = () => { const i = +b.dataset.ln; A.dep.lines = A.dep.lines || new Set(); A.dep.lines.has(i) ? A.dep.lines.delete(i) : A.dep.lines.add(i); if (!A.dep.lines.size) A.dep.lines = null; renderDep(); });
  MG.qsa('[data-pl]', body).forEach(b => b.onclick = () => { A.dep.plat = b.dataset.pl === 'all' ? null : +b.dataset.pl; renderDep(); });
  $('dt-now').onclick = () => { A.dep.when = null; A.dep.ymd = null; renderDep(); };
  $('dt-t').onchange = e => { const [hh, mm] = e.target.value.split(':').map(Number); if (isFinite(hh)) { A.dep.when = hh * 60 + mm; renderDep(); } };
  $('dt-d').onchange = e => { A.dep.ymd = e.target.value || null; if (A.dep.when == null) A.dep.when = Math.floor(clk().m); renderDep(); };
  renderDepList();
 }
 A.renderDep = renderDep;
 const cdTxt = (t, nowS) => { const s = Math.round(t * 60 - nowS); if (s <= 20) return 'teď'; if (s >= 600) return ''; return Math.floor(s / 60) + ':' + MG.pad(s % 60); };
 A.depItems = K.depItems;
 function renderDepList() {
  const box = $('dep-list'); if (!box || A.st == null) return;
  const c = clk(), ymd = A.dep.ymd || c.ymd, today = ymd === c.ymd && A.dep.when == null;
  const items = A.depItems(A.st, {ymd, from: A.dep.when, lines: A.dep.lines, platform: A.dep.plat});
  if (!items.length) { box.innerHTML = '<div class="empty"><i class="fa-regular fa-calendar-xmark"></i><p>V tuto dobu odsud nic nejede.</p></div>'; return; }
  let h = '', nLive = 0;
  for (const {d, x, exp, dl} of items) {
   const L_ = d.L, hs = D.headsign(d.p, d.j), pl = D.pl.get(d.pl);
   const k2 = d.p.i + ':' + d.j + ':' + d.day + ':' + d.k, op = A.dep.open === k2;
   const mins = Math.round(exp - c.m);
   if (x) nLive++;
   let tb;
   if (today && mins <= 9) { const cd = cdTxt(exp, c.s); tb = '<b class="cd" data-exp="' + exp + '">' + (cd || MG.hm2(exp)) + '</b><small>' + MG.hm2(exp) + '</small>'; }
   else tb = '<b>' + MG.hm2(exp) + '</b><small>' + (today && mins < 60 ? 'za ' + mins + ' min' : dl >= 1 ? 'plán ' + MG.hm2(d.t) : '') + '</small>';
   h += '<div class="dcard' + (op ? ' open' : '') + (x ? ' live' : '') + '"><button type="button" class="drow" data-k="' + k2 + '">' + D.badge(L_, {size: 'big', text: legLabel(L_, d.p, d.j)}) +
    '<span class="d-tx"><b>' + H(D.shortName(hs, L_.city || '')) + '</b><small>' + (pl && pl.lab ? 'nástupiště ' + H(pl.lab) + ' · ' : '') + H(({metro: 'metro', tram: 'tramvaj', trol: 'trolejbus', mhd: 'autobus MHD', regio: 'autobus', mezi: 'dálkový autobus', vlak: 'vlak', lan: 'lanovka', lod: 'přívoz'})[L_.k] || '') + (dl >= 1 ? ' · <s>' + MG.hm2(d.t) + '</s>' : '') + '</small></span>' +
    A.dlBadge(x) + '<span class="d-t">' + tb + '</span></button>' + (op ? tripDetail(d, dl) : '') + '</div>';
  }
  const upd = Math.max(LV.at.sz || 0, LV.at.worker || 0, LV.at.odis || 0, LV.at.jmk || 0);
  const updT = upd ? MG.hm2(MG.nowMin() - (Date.now() - upd) / 60000) : '';
  h += '<div class="foot"><span>' + (LV.on ? '<span class="pulse"></span> ' + (nLive ? 'Živě ' + nLive + ' ' + czN(nLive, 'spoj', 'spoje', 'spojů') : 'Živě – vozidla těchto spojů zatím nevidíme') + (updT ? ' · ' + updT : '') : 'Podle jízdního řádu') + '</span><a target="_blank" rel="noopener" href="https://idos.cz/vlakyautobusymhdvse/odjezdy/?f=' + encodeURIComponent(D.st.get(A.st).name) + '">IDOS <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div>';
  box.innerHTML = h;
  MG.qsa('.drow', box).forEach(b => b.onclick = () => { A.dep.open = A.dep.open === b.dataset.k ? null : b.dataset.k; renderDepList(); });
  MG.qsa('[data-navpl]', box).forEach(b => b.onclick = e => { e.stopPropagation(); const pl = D.pl.get(+b.dataset.navpl); A.nav({name: D.stName(pl.st) + (pl.lab ? ' (nástupiště ' + pl.lab + ')' : ''), lat: pl.lat, lon: pl.lon, st: pl.st}); });
  MG.qsa('[data-connst]', box).forEach(b => b.onclick = e => { e.stopPropagation(); const s = D.st.get(+b.dataset.connst); A.connTo({kind: 'stop', name: s.name, lat: s.lat, lon: s.lon, st: s.g}, {kind: 'stop', name: D.stName(A.st), lat: D.st.get(A.st).lat, lon: D.st.get(A.st).lon, st: A.st}); });
 }
 A.renderDepList = renderDepList;
 function tripDetail(d, dl) {
  const p = d.p, arr = p.arr[d.prof], st0 = p.T[3 * d.j], city = d.L.city || '';
  let h = '<div class="trip">';
  const n = p.s.length;
  for (let k = d.k + 1; k < n; k++) {
   const pl = D.pl.get(p.s[k]); const t = st0 + arr[k] + (d.day - D.dayIdx(A.dep.ymd || clk().ymd)) * 1440;
   h += '<div class="tr-st' + (k === n - 1 ? ' last' : '') + '"><span class="tr-dot"></span><span class="tr-n">' + H(D.shortName(pl ? D.stName(pl.st) : '?', city)) + (D.isRequest(p, k) ? ' <i class="fa-solid fa-hand" title="na znamení"></i>' : '') + '</span><b>' + MG.hm2(t + dl) + '</b>' + (k === n - 1 && pl ? '' : '') + '</div>';
  }
  const last = D.pl.get(p.s[n - 1]);
  h += '</div><div class="trip-acts"><button type="button" class="btn sm" data-navpl="' + d.pl + '"><i class="fa-solid fa-person-walking"></i> K nástupišti</button>' + (last ? '<button type="button" class="btn sm" data-connst="' + last.st + '"><i class="fa-solid fa-route"></i> Spojení do ' + H(D.shortName(D.stName(last.st), city)) + '</button>' : '') + '</div>';
  return h;
 }
 /* běžící odpočet m:ss */
 setInterval(() => {
  if (A.view !== 'dep' || A.dep.when != null || A.dep.ymd) return;
  const c = clk();
  MG.qsa('#dep-list b.cd').forEach(b => { const e = +b.dataset.exp; b.textContent = cdTxt(e, c.s) || MG.hm2(e); });
 }, 1000);

 /* =====================================================================
  SPOJENÍ
 ===================================================================== */
 const C = A.conn;
 A.connTo = (to, from) => {
  A.go('conn');
  if (to !== undefined && to !== null) C.to = to;
  if (from) C.from = from;
  if (!C.from && A.me) C.from = {kind: 'me', name: 'Moje poloha', lat: A.me.lat, lon: A.me.lon};
  C.res = null; paintOD();
  if (C.from && C.to) A.findConn(); else (C.from ? $('ct') : $('cf')).focus();
 };
 function paintOD() { const f = $('cf'), t = $('ct'); if (f) f.value = C.from ? C.from.name : ''; if (t) t.value = C.to ? C.to.name : ''; }
 function bindConnTop() {
  const fi = $('cf'), ti = $('ct');
  const pick = (which) => async r => {
   if (r.kind === 'me') { r = await A.mePoint(); if (!r) return; }
   C[which] = r; paintOD();
   if (C.from && C.to) A.findConn(); else (which === 'from' ? ti : fi).focus();
  };
  A.attachSug(fi, $('cf-sug'), pick('from'), {me: true});
  A.attachSug(ti, $('ct-sug'), pick('to'), {me: true});
  fi.addEventListener('input', () => { C.from = null; }); ti.addEventListener('input', () => { C.to = null; });
  $('cf-me').onclick = async () => { const p = await A.mePoint(); if (p) { C.from = p; paintOD(); if (C.to) A.findConn(); else ti.focus(); } };
  $('c-swap').onclick = () => { const a = C.from; C.from = C.to; C.to = a; paintOD(); if (C.from && C.to) A.findConn(); };
  const c = clk();
  $('c-t').value = MG.hm2(c.m); $('c-d').value = c.ymd; $('c-d').min = D.core.d0; $('c-d').max = MG.ymdAdd(D.core.d0, D.core.nd - 1);
  $('c-now').onclick = () => { C.t = null; C.ymd = null; const c2 = clk(); $('c-t').value = MG.hm2(c2.m); $('c-d').value = c2.ymd; $('c-now').classList.add('on'); if (C.from && C.to) A.findConn(); };
  $('c-t').onchange = e => { const [hh, mm] = e.target.value.split(':').map(Number); if (isFinite(hh)) { C.t = hh * 60 + mm; $('c-now').classList.remove('on'); } };
  $('c-d').onchange = e => { C.ymd = e.target.value || null; $('c-now').classList.remove('on'); };
  $('c-go').onclick = async () => {
   for (const [k, el] of [['from', fi], ['to', ti]]) if (!C[k] && el.value.trim()) { const r = (await suggest(el.value))[0] || (await A.geocode(el.value, 1))[0]; if (r) { C[k] = r.kind === 'me' ? await A.mePoint() : r; } }
   paintOD(); A.findConn();
  };
 }
 function renderConnFavs() { const box = $('c-favs'); if (!box) return; box.innerHTML = favStrip('conn'); bindFavs(box, async f => { C.to = {kind: 'fav', name: f.label, lat: f.lat, lon: f.lon, st: f.st}; if (!C.from) C.from = await A.mePoint(); paintOD(); if (C.from) A.findConn(); }); }
 /* hledání; vrací i data pro AI rádce */
 A.planTrip = K.planTrip;
 A.findConn = async (tOverride) => {
  if (!C.from || !C.to) { $('c-st').textContent = 'Vyber, odkud a kam.'; return; }
  if (MG.dist(C.from.lat, C.from.lon, C.to.lat, C.to.lon) < 120) { $('c-st').textContent = 'Cíl je hned vedle – už jsi na místě.'; $('c-res').innerHTML = ''; C.res = null; return; }
  const c = clk(), ymd = C.ymd || c.ymd, t = tOverride != null ? tOverride : C.t != null ? C.t : Math.ceil(c.m);
  $('c-st').innerHTML = '<span class="spin"></span> Hledám spojení…'; $('c-res').innerHTML = '';
  C.busy = true; await MG.sleep(20);
  try {
   const r = await A.planTrip(C.from, C.to, ymd, t, 6);
   C.busy = false;
   if (r.err) { $('c-st').textContent = r.err; return; }
   C.res = r; C.sel = 0;
   $('c-st').textContent = r.results.length || r.walkOnly ? '' : 'Spojení nenalezeno. Zkus jiný čas nebo bližší zastávku.';
   connFocus(); renderConn(); LV.tick();
  } catch (e) { busy(false); C.busy = false; MG.err('raptor', e); $('c-st').textContent = 'Při hledání nastala chyba.'; }
 };
 A.legTimes = K.legTimes; A.connTimes = K.connTimes;
 function connFocus() { const r = C.res; if (!r) return; const pts = []; for (const c of r.results) for (const l of c.legs) if (!l.walk) { const pl = D.pl.get(l.p.s[l.bi]); if (pl) pts.push([pl.lat, pl.lon]); } setFocus(pts.slice(0, 40)); }
 /* živé info pro spojení: zpoždění jednotlivých jízd a ohrožené přestupy */
 A.connLive = K.connLive;
 const legChip = l => { const L_ = D.ln.get(l.p.l); return D.badge(L_, {text: legLabel(L_, l.p, l.j)}); };
 function renderConn() {
  const box = $('c-res'); if (!box) return;
  const r = C.res; if (!r) { box.innerHTML = ''; return; }
  const c0 = clk(), today = r.ymd === c0.ymd;
  let h = '';
  if (r.walkOnly) h += '<div class="crow walk"><span class="cr-t"><i class="fa-solid fa-person-walking"></i></span><span class="cr-mid">Pěšky ' + MG.fmtDist(r.walkOnly.dist) + '</span><span class="cr-d"><b>' + r.walkOnly.dur + ' min</b><small>bez MHD</small></span></div>';
  let list = '';
  if (r.results.length) {
   list += '<button type="button" class="more" id="c-less"><i class="fa-solid fa-angles-up"></i> Dřívější</button>';
   r.results.forEach((c, i) => {
    const {dep, arr, rides} = A.connTimes(r, c), lv = A.connLive(r, c);
    const d0 = lv[0].x && lv[0].x.d > 0 ? lv[0].x.d : 0, dN = lv[lv.length - 1].x && lv[lv.length - 1].x.d > 0 ? lv[lv.length - 1].x.d : 0;
    const risk = lv.some(x => x.risk), mins = Math.round(dep + d0 - c0.m);
    const qd = r.ymd === c0.ymd ? 0 : 1, nd = Math.floor((dep + d0) / 1440), dayTag = nd >= 1 ? '<small class="dtag">' + (nd === 1 && !qd ? 'zítra' : '+' + nd + ' d') + '</small>' : '';
    list += '<button type="button" class="crow' + (i === C.sel ? ' sel' : '') + (risk ? ' risk' : '') + '" data-c="' + i + '"><span class="cr-t">' + dayTag + '<b>' + MG.hm(dep + d0) + '</b><span>' + MG.hm(arr + dN) + '</span></span><span class="cr-mid"><span class="cr-lines">' + rides.map(legChip).join('<i class="fa-solid fa-chevron-right"></i>') + '</span><small>' + (today && mins >= 0 && mins < 90 ? 'odchod za ' + mins + ' min · ' : '') + (rides.length - 1 ? (rides.length - 1) + '× přestup' : 'přímo') + (risk ? ' · <b class="bad">přestup ohrožen</b>' : '') + '</small></span><span class="cr-d"><b>' + fmtDur(arr + dN - dep - d0) + '</b>' + (lv[0].x ? A.dlBadge(lv[0].x) : '') + '</span></button>';
   });
   list += '<button type="button" class="more" id="c-more"><i class="fa-solid fa-angles-down"></i> Pozdější</button>';
   h += '<div class="csplit"><div class="clist">' + list + '</div><div class="cdet" id="c-det">' + plan(r, r.results[C.sel]) + '</div></div>';
  }
  box.innerHTML = h;
  MG.qsa('.crow[data-c]', box).forEach(x => x.onclick = () => { C.sel = +x.dataset.c; renderConn(); if (!MG.isWide()) { const d = $('c-det'); if (d) d.scrollIntoView({behavior: 'smooth', block: 'start'}); } });
  if ($('c-less')) $('c-less').onclick = () => { const d0 = A.connTimes(r, r.results[0]).dep; A.findConn(Math.max(0, d0 - 75)); };
  if ($('c-more')) $('c-more').onclick = () => { const dl = A.connTimes(r, r.results[r.results.length - 1]).dep; A.findConn(dl + 1); };
  MG.qsa('[data-walkto]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); const [ll, nm] = b.dataset.walkto.split('|'); const [la, lo] = ll.split(',').map(Number); A.nav({name: nm, lat: la, lon: lo}); });
  MG.qsa('[data-depst]', box).forEach(b => b.onclick = (e) => { e.stopPropagation(); A.showStop(+b.dataset.depst, -1, {}); });
 }
 A.renderConn = renderConn;
 function plan(r, c) {
  const nm = i => D.stName(r.n.stArr[i]);
  const {dep, arr, rides} = A.connTimes(r, c), lv = A.connLive(r, c);
  const byLeg = new Map(lv.map(x => [x.l, x]));
  let h = '<div class="plan"><div class="pl-head"><span>' + H(r.from.name) + '</span><i class="fa-solid fa-arrow-right"></i><span>' + H(r.to.name) + '</span><em>' + MG.hm(dep) + ' – ' + MG.hm(arr) + ' · ' + fmtDur(arr - dep) + '</em></div>';
  const first = rides[0];
  const walkIn = c.acc[1] > 0 ? c.acc[1] : (c.legs[0].walk ? c.legs[0].dur : 0);
  if (walkIn > 0) { const pb = D.pl.get(first.p.s[first.bi]); h += '<div class="st walk"><span class="st-rail"></span><div class="st-b"><i class="fa-solid fa-person-walking"></i> Pěšky ' + walkIn + ' min na zastávku <b>' + H(D.stName(pb.st)) + '</b><button type="button" class="btn xs" data-walkto="' + pb.lat + ',' + pb.lon + '|' + H(D.stName(pb.st)) + (pb.lab ? ' (' + H(pb.lab) + ')' : '') + '"><i class="fa-solid fa-diamond-turn-right"></i> Navigovat</button></div></div>'; }
  let prev = null;
  for (const l of c.legs) {
   if (l.walk) { if (l.from >= 0 && l.dur > 0) h += '<div class="st xfer"><span class="st-rail"></span><div class="st-b"><i class="fa-solid fa-person-walking"></i> Přestup pěšky ' + l.dur + ' min · ' + H(nm(l.from)) + ' → ' + H(nm(l.to)) + ' · ' + MG.fmtDist(l.dist) + '</div></div>'; continue; }
   const L_ = D.ln.get(l.p.l), info = byLeg.get(l), t = info.t, pb = D.pl.get(l.p.s[l.bi]), pa = D.pl.get(l.p.s[l.ai]);
   const dl = info.x && info.x.d > 0 ? info.x.d : 0;
   if (prev) { const wait = Math.round(t.dep - A.legTimes(r, prev).arr); h += '<div class="st xfer' + (info.risk ? ' risk' : '') + '"><span class="st-rail"></span><div class="st-b"><i class="fa-solid fa-arrow-right-arrow-left"></i> Přestup – ' + H(D.stName(pb.st)) + (wait > 0 ? ' · čekání ' + wait + ' min' : '') + (info.risk ? '<div class="warn"><i class="fa-solid fa-triangle-exclamation"></i> Přestup je ohrožen – předchozí spoj má zpoždění. Rezerva ' + Math.round(info.slack) + ' min.</div>' : '') + '</div></div>'; }
   const mids = l.p.s.slice(l.bi + 1, l.ai).map(pg => { const pl = D.pl.get(pg); return pl ? D.stName(pl.st) : ''; });
   const kn = ({metro: 'Metro', tram: 'Tramvaj', trol: 'Trolejbus', mhd: 'Autobus', regio: 'Autobus', mezi: 'Dálkový autobus', vlak: 'Vlak', lan: 'Lanovka', lod: 'Přívoz'})[L_.k] || '';
   h += '<div class="st ride" style="--lc:' + L_.c + '"><span class="st-rail"></span><div class="st-b"><div class="st-top">' + legChip(l) + '<span class="st-dir">' + H(kn) + ' směr ' + H(D.headsign(l.p, l.j)) + '</span>' + A.dlBadge(info.x) + '</div>' +
    '<div class="st-stop"><span class="tm">' + (dl >= 1 ? '<s>' + MG.hm2(t.dep) + '</s> ' + MG.hm2(t.dep + dl) : MG.hm2(t.dep)) + '</span><b>' + H(D.stName(pb.st)) + '</b>' + (pb.lab ? '<span class="plab">' + H(pb.lab) + '</span>' : '') + '<button type="button" class="btn xs" data-depst="' + pb.st + '"><i class="fa-regular fa-clock"></i></button></div>' +
    (mids.length ? '<details class="st-mid"><summary>' + (l.ai - l.bi) + ' ' + czN(l.ai - l.bi, 'zastávka', 'zastávky', 'zastávek') + ' · ' + fmtDur(t.arr - t.dep) + '</summary>' + mids.map(x => '<div>' + H(x) + '</div>').join('') + '</details>' : '<div class="st-mid plain">' + (l.ai - l.bi) + ' ' + czN(l.ai - l.bi, 'zastávka', 'zastávky', 'zastávek') + ' · ' + fmtDur(t.arr - t.dep) + '</div>') +
    '<div class="st-stop"><span class="tm">' + (dl >= 1 ? '<s>' + MG.hm2(t.arr) + '</s> ' + MG.hm2(t.arr + dl) : MG.hm2(t.arr)) + '</span><b>' + H(D.stName(pa.st)) + '</b>' + (pa.lab ? '<span class="plab">' + H(pa.lab) + '</span>' : '') + '</div></div></div>';
   prev = l;
  }
  if (c.egress > 0) h += '<div class="st walk"><span class="st-rail"></span><div class="st-b"><i class="fa-solid fa-flag-checkered"></i> Pěšky ' + c.egress + ' min do cíle ' + H(r.to.name) + '</div></div>';
  const sys = MG.tickets.forPoint(r.from.lat, r.from.lon), sys2 = MG.tickets.forPoint(r.to.lat, r.to.lon);
  h += '<div class="pl-tix"><i class="fa-solid fa-ticket"></i><span>Jízdné: ' + (sys ? '<b>' + H(sys.name) + '</b>' + (sys2 && sys2 !== sys ? ' → <b>' + H(sys2.name) + '</b>' : '') : 'podle dopravce') + '</span><button type="button" class="btn xs" id="pl-tix">Ceny a nákup</button></div>';
  const fn = r.from.st != null ? D.stName(r.from.st) : (c.acc && c.acc[0] != null ? nm(c.acc[0]) : r.from.name), tn = r.to.st != null ? D.stName(r.to.st) : nm(c.end);
  h += '<div class="pl-note">Podle jízdního řádu CIS JŘ' + (LV.on ? '; zpoždění ze živých poloh vozidel (~ = odhad z polohy)' : '') + '.</div><a class="idos" target="_blank" rel="noopener" href="' + MG.tickets.idos(fn, tn, r.ymd, dep) + '"><i class="fa-solid fa-arrow-up-right-from-square"></i> Ověřit a koupit v IDOS</a></div>';
  setTimeout(() => { const b = $('pl-tix'); if (b) b.onclick = () => { A.tixPoint = {lat: r.from.lat, lon: r.from.lon}; A.go('tix'); }; });
  return h;
 }

 /* =====================================================================
  NAVIGACE NA ZASTÁVKU (pěšky, bez mapy: šipka, vzdálenost, pokyny, náčrtek trasy)
 ===================================================================== */
 const NV = A.navState = {dest: null, route: null, at: 0, heading: null, reAt: 0};
 A.walkRoute = K.walkRoute;
 const manIcon = t => ({1: 'fa-play', 4: 'fa-flag-checkered', 5: 'fa-flag-checkered', 6: 'fa-flag-checkered', 9: 'fa-arrow-turn-up fa-rotate-90', 10: 'fa-arrow-turn-up fa-rotate-90', 11: 'fa-arrow-right', 12: 'fa-rotate-left', 13: 'fa-rotate-left', 14: 'fa-arrow-left', 15: 'fa-arrow-left', 16: 'fa-arrow-turn-up fa-flip-horizontal', 26: 'fa-circle-notch', 27: 'fa-circle-notch'})[t] || 'fa-arrow-up';
 A.nav = async (dest) => {
  NV.dest = dest; NV.route = null; NV.at = 0; NV.far = 0;
  openSheet('nav', navShell());
  if (!A.me) { const me = await A.locate(false); if (!me) { paintNav('Pro navigaci povol přístup k poloze. Trasu si můžeš otevřít i v aplikaci Mapy.cz nebo Google Maps.'); return; } }
  const air = MG.dist(A.me.lat, A.me.lon, dest.lat, dest.lon);
  if (air > 5000) { NV.far = air; paintNav(); return; }
  NV.far = 0; paintNav();
  try { NV.route = await A.walkRoute(A.me, dest); NV.from = {lat: A.me.lat, lon: A.me.lon}; paintNav(); }
  catch (e) { MG.err('walk', e); paintNav('Pěší trasu se nepodařilo spočítat – zobrazuji směr vzdušnou čarou.'); }
  compass();
 };
 const navShell = () => '<div class="sh-h"><span class="sh-ic"><i class="fa-solid fa-person-walking"></i></span><span class="sh-tt"><small>Pěšky na zastávku</small><b>' + H(NV.dest.name) + '</b></span><button type="button" class="ib" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div><div class="sh-b" id="nav-b"></div>';
 function navProgress() {
  const r = NV.route; if (!r || !A.me) return null;
  let bi = 0, bd = 1e12;
  const kx = Math.cos(A.me.lat * Math.PI / 180) * 111320, ky = 110574;
  let bt = 0;
  for (let i = 0; i < r.pts.length - 1; i++) {
   const ax = (r.pts[i][1] - A.me.lon) * kx, ay = (r.pts[i][0] - A.me.lat) * ky, bx = (r.pts[i + 1][1] - A.me.lon) * kx, by = (r.pts[i + 1][0] - A.me.lat) * ky;
   const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy; let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0; t = MG.clamp(t, 0, 1);
   const d = Math.hypot(ax + dx * t, ay + dy * t); if (d < bd) { bd = d; bi = i; bt = t; }
  }
  const along = r.cd[bi] + (r.cd[bi + 1] - r.cd[bi]) * bt, left = Math.max(0, r.cd[r.cd.length - 1] - along);
  let mi = 0; for (let k = 0; k < r.man.length; k++) if (r.man[k].i <= bi) mi = k;
  const next = r.man[Math.min(mi + 1, r.man.length - 1)], toNext = Math.max(0, r.cd[Math.min(next.i, r.cd.length - 1)] - along);
  return {off: bd, left, mi, next, toNext, bi};
 }
 function paintNav(msg) {
  const b = $('nav-b'); if (!b || !NV.dest) return;
  const d = NV.dest, me = A.me;
  const lnk = '<div class="nav-ext"><a class="btn sm" target="_blank" rel="noopener" href="https://mapy.cz/fnc/v1/route?mapset=basic&start=' + (me ? me.lon.toFixed(6) + ',' + me.lat.toFixed(6) : '') + '&end=' + d.lon.toFixed(6) + ',' + d.lat.toFixed(6) + '&routeType=foot_fast"><i class="fa-solid fa-map"></i> Mapy.cz</a><a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1' + (me ? '&origin=' + me.lat.toFixed(6) + ',' + me.lon.toFixed(6) : '') + '&destination=' + d.lat.toFixed(6) + ',' + d.lon.toFixed(6) + '&travelmode=walking"><i class="fa-brands fa-google"></i> Google Maps</a></div>';
  if (!me) { b.innerHTML = '<div class="empty"><i class="fa-solid fa-location-crosshairs"></i><p>' + H(msg || 'Zjišťuji polohu…') + '</p><button type="button" class="btn pri" id="nav-loc">Povolit polohu</button></div>' + lnk; const x = $('nav-loc'); if (x) x.onclick = () => A.nav(d); return; }
  if (NV.far) { b.innerHTML = '<div class="empty"><i class="fa-solid fa-route"></i><p>Zastávka je ' + MG.fmtDist(NV.far) + ' daleko – pěšky to nepůjde. Najdu ti spojení?</p><button type="button" class="btn pri" id="nav-conn"><i class="fa-solid fa-route"></i> Spojení sem</button></div>'; $('nav-conn').onclick = async () => { closeSheet(); A.connTo({kind: d.st != null ? 'stop' : 'addr', name: d.name, lat: d.lat, lon: d.lon, st: d.st}, await A.mePoint()); }; return; }
  const air = MG.dist(me.lat, me.lon, d.lat, d.lon), br = MG.bearing(me.lat, me.lon, d.lat, d.lon);
  const pr = navProgress(), left = pr ? pr.left : air, arrived = air < 22;
  const mins = Math.max(1, Math.round(left / 75)), eta = MG.hm2(MG.nowMin() + mins);
  const rot = NV.heading != null ? br - NV.heading : br;
  let h = (msg ? '<div class="note">' + H(msg) + '</div>' : '') +
   '<div class="nav-hero' + (arrived ? ' done' : '') + '"><div class="nav-arrow" title="Směr k zastávce' + (NV.heading == null ? ' (sever nahoře)' : '') + '"><i class="fa-solid fa-location-arrow" style="transform:rotate(' + Math.round(rot - 45) + 'deg)"></i>' + (NV.heading == null ? '<span class="nav-n">S</span>' : '') + '</div>' +
   '<div class="nav-num">' + (arrived ? '<b>Jsi na místě</b><small>' + H(d.name) + '</small>' : '<b>' + MG.fmtDist(left) + '</b><small>asi ' + mins + ' min · příchod ' + eta + (pr && pr.off > 45 ? ' · <span class="bad">mimo trasu</span>' : '') + '</small>') + '</div></div>';
  if (pr && !arrived) h += '<div class="nav-next"><i class="fa-solid ' + manIcon(pr.next.type) + '"></i><span><small>za ' + MG.fmtDist(pr.toNext) + '</small><b>' + H(pr.next.t) + '</b></span></div>';
  if (NV.route) h += sketch(NV.route, pr);
  if (arrived && d.st != null) h += '<button type="button" class="btn pri wide" id="nav-dep"><i class="fa-regular fa-clock"></i> Odjezdy ze zastávky</button>';
  if (NV.route) h += '<div class="sec-t">Pokyny</div><ol class="nav-steps">' + NV.route.man.map((m, k) => '<li class="' + (pr && k <= pr.mi ? 'past' : '') + (pr && k === pr.mi + 1 ? ' cur' : '') + '"><i class="fa-solid ' + manIcon(m.type) + '"></i><span>' + H(m.t) + (m.len > 0 ? ' <small>' + MG.fmtDist(m.len) + '</small>' : '') + '</span></li>').join('') + '</ol>';
  if (NV.heading == null && window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') h += '<button type="button" class="btn sm" id="nav-cmp"><i class="fa-regular fa-compass"></i> Zapnout kompas</button>';
  h += lnk + '<div class="pl-note">Pěší trasa: Valhalla nad OpenStreetMap. Dávej pozor na provoz.</div>';
  b.innerHTML = h;
  if ($('nav-dep')) $('nav-dep').onclick = () => { closeSheet(); A.showStop(d.st); };
  if ($('nav-cmp')) $('nav-cmp').onclick = () => DeviceOrientationEvent.requestPermission().then(s => { if (s === 'granted') compass(true); }).catch(() => {});
 }
 /* náčrtek trasy (bez mapových podkladů): čára trasy, poloha a cíl */
 function sketch(r, pr) {
  const pts = r.pts; if (pts.length < 2) return '';
  const k = Math.cos(pts[0][0] * Math.PI / 180);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const P = pts.map(([la, lo]) => [lo * k, -la]);
  const me = A.me ? [A.me.lon * k, -A.me.lat] : null;
  for (const [x, y] of P.concat(me ? [me] : [])) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const W = 320, Hh = 170, pad = 16, s = Math.min((W - 2 * pad) / ((x1 - x0) || 1e-6), (Hh - 2 * pad) / ((y1 - y0) || 1e-6));
  const ox = (W - (x1 - x0) * s) / 2, oy = (Hh - (y1 - y0) * s) / 2;
  const tx = ([x, y]) => ((x - x0) * s + ox).toFixed(1) + ',' + ((y - y0) * s + oy).toFixed(1);
  const cut = pr ? pr.bi + 1 : 0;
  const done = P.slice(0, cut + 1).map(tx).join(' '), rest = P.slice(cut).map(tx).join(' ');
  const end = tx(P[P.length - 1]).split(','), m = me ? tx(me).split(',') : null;
  return '<svg class="nav-sk" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Náčrtek pěší trasy">' + (cut > 0 ? '<polyline points="' + done + '" class="sk-done"/>' : '') + '<polyline points="' + rest + '" class="sk-rest"/>' +
   '<circle cx="' + end[0] + '" cy="' + end[1] + '" r="7" class="sk-end"/>' + (m ? '<circle cx="' + m[0] + '" cy="' + m[1] + '" r="9" class="sk-me-h"/><circle cx="' + m[0] + '" cy="' + m[1] + '" r="5" class="sk-me"/>' : '') + '</svg>';
 }
 let cmpOn = false;
 function compass(force) {
  if (cmpOn && !force) return; cmpOn = true;
  const onO = e => { let hd = null; if (e.webkitCompassHeading != null) hd = e.webkitCompassHeading; else if (e.absolute && e.alpha != null) hd = 360 - e.alpha; if (hd != null) { NV.heading = hd; const ar = MG.qs('.nav-arrow i'); if (ar && A.me && NV.dest) { const br = MG.bearing(A.me.lat, A.me.lon, NV.dest.lat, NV.dest.lon); ar.style.transform = 'rotate(' + Math.round(br - hd - 45) + 'deg)'; const n = MG.qs('.nav-n'); if (n) n.remove(); } } };
  window.addEventListener('deviceorientationabsolute', onO); window.addEventListener('deviceorientation', onO);
 }
 MG.on('mepos', () => {
  if (A.sheet !== 'nav' || !NV.dest) return;
  const pr = navProgress();
  /* mimo trasu → po chvíli přepočítat */
  if (pr && pr.off > 60 && Date.now() - NV.reAt > 30000) { NV.reAt = Date.now(); A.walkRoute(A.me, NV.dest).then(r => { NV.route = r; paintNav(); }).catch(() => {}); }
  paintNav();
 });

 /* =====================================================================
  POČASÍ (Open-Meteo)
 ===================================================================== */
 const wxIc = K.wxIc, wxTx = K.wxText; A.wxText = K.wxText; A.weather = K.weather; A.wxAdvice = K.wxAdvice;
 A.wxPlace = () => A.wx.place || (A.st != null && D.st.get(A.st) ? {name: D.st.get(A.st).name, lat: D.st.get(A.st).lat, lon: D.st.get(A.st).lon} : A.me ? {name: 'Moje poloha', lat: A.me.lat, lon: A.me.lon} : {name: 'Praha', lat: 50.0875, lon: 14.4213});
 async function loadWx(force) {
  const p = A.wxPlace(), cur = A.wx.data;
  if (!force && cur && Date.now() - cur._at < 15 * 60000 && MG.dist(cur._lat, cur._lon, p.lat, p.lon) < 3000) return cur;
  if (A.wx.pending && !force) return A.wx.pending;
  A.wx.pending = A.weather(p.lat, p.lon);
  try { A.wx.data = await A.wx.pending; A.wx.data._name = p.name; A.wx.err = false; } catch (e) { MG.err('wx', e); A.wx.err = true; }
  A.wx.pending = null;
  hdrWx(); if (A.view === 'wx') renderWx();
  return A.wx.data;
 }
 A.loadWx = loadWx;
 function hdrWx() {
  const b = $('wx-chip'), j = A.wx.data; if (!b) return;
  if (!j || !j.current) { b.hidden = true; return; }
  b.hidden = false; b.innerHTML = '<i class="fa-solid ' + wxIc(j.current.weather_code, j.current.is_day) + '"></i><span>' + Math.round(j.current.temperature_2m) + '°</span>';
  b.title = 'Počasí: ' + wxTx(j.current.weather_code);
 }
 function renderWx() {
  const el = $('wx-body'); if (!el) return;
  const j = A.wx.data, p = A.wxPlace();
  $('wx-place').textContent = p.name;
  if (!j || !j.current) { el.innerHTML = A.wx.err ? '<div class="empty"><i class="fa-solid fa-cloud"></i><p>Počasí se nepodařilo načíst.</p><button type="button" class="btn" id="wx-re">Zkusit znovu</button></div>' : '<div class="empty"><span class="spin"></span><p>Načítám počasí…</p></div>'; const x = $('wx-re'); if (x) x.onclick = () => loadWx(true); return; }
  el.innerHTML = K.wxHTML(j, A.wx.open);
  MG.qsa('[data-wd]', el).forEach(b => b.onclick = () => { const k = +b.dataset.wd; A.wx.open = A.wx.open === k ? null : k; renderWx(); });
 }
 function bindWxTop() {
  A.attachSug($('wq'), $('wq-sug'), async r => { if (r.kind === 'me') { const p = await A.mePoint(); if (!p) return; A.wx.place = null; } else A.wx.place = {name: r.name, lat: r.lat, lon: r.lon}; $('wq').value = ''; A.wx.data = null; renderWx(); loadWx(true); }, {me: true});
  $('wq-me').onclick = async () => { const p = await A.mePoint(); if (!p) return; A.wx.place = null; A.wx.data = null; renderWx(); loadWx(true); };
 }

 /* =====================================================================
  JÍZDNÉ
 ===================================================================== */
 function renderTix() {
  const el = $('tix-body'); if (!el) return;
  const TK = MG.tickets;
  const pt = A.tixPoint || (A.st != null && D.st.get(A.st)) || A.me || null;
  const sys = pt ? TK.forPoint(pt.lat, pt.lon) : null;
  const oi = pt ? D.okresAt(pt.lat, pt.lon) : -1;
  const card = (s, open) => {
   let h = '<div class="tix' + (open ? ' main' : '') + '"><div class="tx-h"><span class="tx-badge">' + H(s.name) + '</span><span class="tx-n"><b>' + H(s.full) + '</b><small>' + s.kraje.map(k => H((D.kraje.find(x => x.code === k) || {}).name || k)).join(', ') + '</small></span></div>';
   if (s.tip) h += '<div class="note"><i class="fa-solid fa-circle-info"></i> ' + H(s.tip) + '</div>';
   if (s.prices) h += '<div class="tx-pr"><div class="tx-pt">' + H(s.prices.title) + ' <small>' + H(s.prices.valid) + '</small></div><table><thead><tr><th></th>' + s.prices.cols.map(c => '<th>' + H(c) + '</th>').join('') + '</tr></thead><tbody>' + s.prices.rows.map(r => '<tr><td>' + H(r[0]) + '</td>' + r.slice(1).map(v => '<td><b>' + v + ' Kč</b></td>').join('') + '</tr>').join('') + '</tbody></table>' + (s.prices.note ? '<small class="mut">' + H(s.prices.note) + '</small>' : '') + '</div>';
   else h += '<div class="tx-np"><i class="fa-solid fa-scale-balanced"></i> Ceny se liší podle zón a typu jízdenky – aktuální ceník najdeš na oficiálním webu.</div>';
   h += '<div class="tx-buy">' + s.buy.map(b => '<div><i class="fa-solid ' + b[0] + '"></i><span><b>' + H(b[1]) + '</b>' + (b[2] ? '<small>' + H(b[2]) + '</small>' : '') + '</span></div>').join('') + '</div>';
   h += '<div class="tx-links">' + (s.web ? '<a class="btn sm pri" target="_blank" rel="noopener" href="' + s.web + '"><i class="fa-solid fa-globe"></i> ' + H(s.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')) + '</a>' : '') + (s.links || []).map(l => '<a class="btn sm" target="_blank" rel="noopener" href="' + l[1] + '"><i class="fa-solid fa-arrow-up-right-from-square"></i> ' + H(l[0]) + '</a>').join('') + '</div></div>';
   return h;
  };
  let h = '<div class="tx-where"><i class="fa-solid fa-location-dot"></i> ' + (pt ? (oi >= 0 ? 'okres ' + H(okName(oi)) + ' · ' + H(D.kraj(oi).name) : 'mimo ČR') : 'poloha neznámá – vyber kraj níže') + '</div>';
  if (sys) h += card(sys, true);
  h += '<div class="tix-ai"><i class="fa-solid fa-wand-magic-sparkles"></i><span>Nevíš, jakou jízdenku koupit? Rádce dohledá aktuální cenu konkrétní cesty na oficiálních webech.</span><button type="button" class="btn sm pri" id="tix-ask">Zeptat se</button></div>';
  h += '<div class="sec-t">Vlaky</div><div class="tx-tr">' + TK.TRAINS.map(t => '<a target="_blank" rel="noopener" href="' + t[1] + '"><b>' + H(t[0]) + '</b><small>' + H(t[2]) + '</small><i class="fa-solid fa-arrow-up-right-from-square"></i></a>').join('') + '</div><small class="mut">Ve vlacích v krajích obvykle platí i jízdenky integrovaného systému – podrobnosti v tarifu kraje.</small>';
  h += '<div class="sec-t">Ostatní kraje</div>' + TK.SYS.filter(s => s !== sys).map(s => '<details class="tx-other"><summary><span class="tx-badge">' + H(s.name) + '</span>' + H(s.full) + '</summary>' + card(s, false) + '</details>').join('');
  h += '<div class="pl-note">Ceny uvádíme jen tam, kde jsou ověřené z platného tarifu (stav k listopadu 2026). Cenu konkrétního spojení ukáže IDOS nebo e-shop dopravce.</div>';
  el.innerHTML = h;
  $('tix-ask').onclick = () => { A.go('ai'); MG.ai && MG.ai.prefill('Kolik bude stát jízdenka ' + (C.from && C.to ? 'z ' + C.from.name + ' do ' + C.to.name : 'na cestu po městě') + ' a kde ji nejlépe koupím?'); };
 }

 /* =====================================================================
  okna (sheet), nastavení, Moje místa
 ===================================================================== */
 function openSheet(id, html) {
  A.sheet = id; const s = $('sheet'); s.innerHTML = '<div class="sh" role="dialog" aria-modal="true">' + html + '</div>'; s.hidden = false; requestAnimationFrame(() => s.classList.add('on'));
  s.onclick = e => { if (e.target === s) closeSheet(); };
 }
 function closeSheet() { const s = $('sheet'); if (s.hidden) return; s.classList.remove('on'); A.sheet = null; NV.dest = null; setTimeout(() => { if (!A.sheet) { s.hidden = true; s.innerHTML = ''; } }, 220); }
 A.openSheet = openSheet; A.closeSheet = closeSheet;
 document.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
 document.addEventListener('keydown', e => { if (e.key === 'Escape' && A.sheet) closeSheet(); });
 A.favDialog = (label, pt) => {
  let sel = pt || null, icon = FAV_IC[label] || (pt && pt.st != null ? 'fa-bus-simple' : 'fa-star');
  openSheet('fav', '<div class="sh-h"><span class="sh-ic"><i class="fa-solid fa-star"></i></span><span class="sh-tt"><small>Moje místa</small><b>Uložit místo</b></span><button type="button" class="ib" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div><div class="sh-b">' +
   '<label class="lab">Název</label><input class="inp" id="fv-l" maxlength="30" placeholder="např. Domů, Babička, Gym" value="' + H(label || (pt ? pt.name : '')) + '">' +
   '<label class="lab">Místo</label><div class="srch in"><i class="fa-solid fa-magnifying-glass"></i><input id="fv-q" placeholder="Adresa nebo zastávka" value="' + H(pt ? pt.name : '') + '"><button type="button" class="ib" id="fv-me" title="Moje poloha"><i class="fa-solid fa-location-crosshairs"></i></button></div><div class="sug" id="fv-sug" hidden></div>' +
   '<label class="lab">Ikona</label><div class="icons">' + ['fa-house', 'fa-briefcase', 'fa-graduation-cap', 'fa-heart', 'fa-dumbbell', 'fa-cart-shopping', 'fa-hospital', 'fa-star', 'fa-bus-simple'].map(i => '<button type="button" class="icb' + (i === icon ? ' on' : '') + '" data-ic="' + i + '"><i class="fa-solid ' + i + '"></i></button>').join('') + '</div>' +
   '<button type="button" class="btn pri wide" id="fv-ok"><i class="fa-solid fa-check"></i> Uložit</button></div>');
  A.attachSug($('fv-q'), $('fv-sug'), async r => { if (r.kind === 'me') r = await A.mePoint(); if (!r) return; sel = r; $('fv-q').value = r.name; if (!$('fv-l').value) $('fv-l').value = r.name; }, {me: true});
  $('fv-me').onclick = async () => { const p = await A.mePoint(); if (p) { sel = p; $('fv-q').value = 'Moje poloha'; } };
  MG.qsa('[data-ic]').forEach(b => b.onclick = () => { icon = b.dataset.ic; MG.qsa('[data-ic]').forEach(x => x.classList.toggle('on', x === b)); });
  $('fv-ok').onclick = () => {
   const l = $('fv-l').value.trim(); if (!sel) return MG.toast('Vyber místo'); if (!l) return MG.toast('Zadej název');
   A.addFav({name: sel.kind === 'me' ? 'Uložená poloha' : sel.name, lat: sel.lat, lon: sel.lon, st: sel.st, icon}, l);
   const F = A.favs(); const f = F.find(x => x.label === l); if (f) { f.icon = icon; A.saveFavs(F); }
   closeSheet();
  };
 };
 A.settings = () => {
  const F = A.favs(), dark = MG.store.get('dark', null);
  openSheet('set', '<div class="sh-h"><span class="sh-ic"><i class="fa-solid fa-sliders"></i></span><span class="sh-tt"><small>mhdGO bez mapy</small><b>Nastavení</b></span><button type="button" class="ib" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div><div class="sh-b">' +
   '<div class="set-row"><span><b>Živé polohy a zpoždění</b><small>vlaky SŽ, PID, IDS JMK, ODIS a regionální GTFS-RT</small></span><label class="sw"><input type="checkbox" id="st-live"' + (LV.on ? ' checked' : '') + '><i></i></label></div>' +
   '<div class="set-row"><span><b>Vzhled</b></span><div class="seg"><button type="button" data-dk="auto" class="' + (dark == null ? 'on' : '') + '">Auto</button><button type="button" data-dk="0" class="' + (dark === false ? 'on' : '') + '">Světlý</button><button type="button" data-dk="1" class="' + (dark === true ? 'on' : '') + '">Tmavý</button></div></div>' +
   '<div class="sec-t">Moje místa</div>' + (F.length ? F.map((f, i) => '<div class="set-fav"><i class="fa-solid ' + (f.icon || 'fa-star') + '"></i><span><b>' + H(f.label) + '</b><small>' + H(f.name) + '</small></span><button type="button" class="ib" data-fup="' + i + '" title="Posunout nahoru"' + (i ? '' : ' disabled') + '><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="ib" data-fdel="' + i + '" title="Smazat"><i class="fa-solid fa-trash"></i></button></div>').join('') : '<small class="mut">Zatím nic. Ulož si Domů, Práci nebo oblíbenou zastávku.</small>') +
   '<button type="button" class="btn sm" id="st-addfav"><i class="fa-solid fa-plus"></i> Přidat místo</button>' +
   '<div class="sec-t">Zdroje a informace</div><div class="about"><p>Jízdní řády: CIS JŘ (celostátní informační systém), platné ' + H(D.core ? D.core.d0.split('-').reverse().join('. ') : '') + ' + ' + (D.core ? D.core.nd : '') + ' dní. Živě: Správa železnic, PID (Golemio), IDS JMK (data.brno.cz), ODIS, celostátní GTFS-RT (Oběhy). Počasí: Open-Meteo. Pěší trasy: Valhalla / OpenStreetMap. Hledání adres: Photon.</p><p>Kde zdroj zpoždění nehlásí, odhadujeme ho z polohy vozidla (označeno „~“).</p><a class="btn sm" href="mhdgo.html"><i class="fa-solid fa-map"></i> Verze s mapou</a></div></div>');
  $('st-live').onchange = e => { LV.toggle(e.target.checked); updPill(); };
  MG.qsa('[data-dk]').forEach(b => b.onclick = () => { const v = b.dataset.dk; MG.store.set('dark', v === 'auto' ? null : v === '1'); applyDark(); A.settings(); });
  MG.qsa('[data-fdel]').forEach(b => b.onclick = () => { const F2 = A.favs(); F2.splice(+b.dataset.fdel, 1); A.saveFavs(F2); A.settings(); });
  MG.qsa('[data-fup]').forEach(b => b.onclick = () => { const F2 = A.favs(), i = +b.dataset.fup; if (i > 0) { [F2[i - 1], F2[i]] = [F2[i], F2[i - 1]]; A.saveFavs(F2); A.settings(); } });
  $('st-addfav').onclick = () => A.favDialog('');
 };
 function applyDark() { const v = MG.store.get('dark', null); const on = v == null ? matchMedia('(prefers-color-scheme: dark)').matches : v; document.body.classList.toggle('dark', on); const m = MG.qs('meta[name=theme-color]'); if (m) m.content = on ? '#151413' : '#f4ebe2'; }
 MG.on('favs', () => { if (A.view === 'dep' && A.st == null) renderDep(); renderConnFavs(); });

 /* ---------- živý stav v záhlaví ---------- */
 function updPill() {
  const b = $('live-pill'); if (!b) return;
  const ok = LV.st.sz === 'ok' || LV.st.worker === 'ok' || LV.st.jmk === 'ok' || LV.st.odis === 'ok';
  b.className = 'pill' + (!LV.on ? ' off' : ok ? ' ok' : ' wait');
  b.innerHTML = '<span class="pdot"></span>' + (!LV.on ? 'Jízdní řád' : ok ? 'Živě' : 'Připojuji…');
  b.title = !LV.on ? 'Živé polohy vypnuty' : 'Vlaky SŽ: ' + (LV.st.sz || '–') + ' · worker mhdGO: ' + (LV.st.worker || '–') + (LV.st.jmk ? ' · IDS JMK: ' + LV.st.jmk : '') + (LV.st.odis ? ' · ODIS: ' + LV.st.odis : '');
 }
 MG.on('live', () => {
  updPill();
  if (A.view === 'dep' && A.st != null) renderDepList();
  if (A.view === 'conn' && C.res && !C.busy) { const y = window.scrollY; renderConn(); window.scrollTo(0, y); }
 });
 MG.on('me', () => { if (A.view === 'dep' && A.st == null) renderNear(); if (!A.wx.place && A.st == null) loadWx(); });

 /* ---------- přepínání sekcí ---------- */
 A.go = (v) => {
  if (A.view === v && $('v-' + v) && !$('v-' + v).hidden) return;
  A.view = v;
  MG.qsa('.view').forEach(x => x.hidden = x.id !== 'v-' + v);
  MG.qsa('[data-view]').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  if (v === 'dep') renderDep();
  if (v === 'conn') { renderConnFavs(); renderConn(); }
  if (v === 'wx') { renderWx(); loadWx(); }
  if (v === 'tix') renderTix();
  if (v !== 'tix') A.tixPoint = null;
  if (v === 'ai' && MG.ai) MG.ai.show();
  MG.store.set('lite-view', v);
  window.scrollTo(0, 0);
 };

 /* ---------- start ---------- */
 A.boot = async () => {
  applyDark();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyDark);
  MG.qsa('[data-view]').forEach(b => b.onclick = () => A.go(b.dataset.view));
  $('set-btn').onclick = () => A.settings();
  $('wx-chip').onclick = () => A.go('wx');
  $('live-pill').onclick = () => A.settings();
  $('brand').onclick = () => { A.clearStop(); A.go('dep'); };
  try { await Promise.all([D.loadCore(), D.loadGeo()]); const sp = MG.qs('#splash .spin'); if (sp) sp.insertAdjacentHTML('afterend', '<small id="sp-t">Načítám jízdní řády celé ČR…</small>'); await D.loadAll(); }
  catch (e) { $('dep-body').innerHTML = '<div class="empty"><i class="fa-solid fa-wifi"></i><p>Data se nepodařilo načíst – zkontroluj připojení k internetu.</p><button type="button" class="btn pri" onclick="location.reload()">Zkusit znovu</button></div>'; MG.err('core', e); return; }
  if (!D.dataValid()) MG.toast('Pozor: jízdní řády jsou pro jiné období (' + D.core.d0 + ')', 6000);
  bindDepTop(); bindConnTop(); bindWxTop();
  D.loadIdx().catch(() => {});
  try { if (navigator.permissions) { const p = await navigator.permissions.query({name: 'geolocation'}); A.perm = p.state; p.onchange = () => { A.perm = p.state; if (p.state === 'granted') A.locate(true); }; } } catch (_) {}
  if (A.perm === 'granted') await Promise.race([A.locate(true), MG.sleep(5000)]);
  if (A.me) await A.ensureAt(A.me.lat, A.me.lon);
  const v0 = MG.store.get('lite-view', 'dep');
  A.go(['dep', 'conn', 'ai', 'wx', 'tix'].includes(v0) ? v0 : 'dep');
  if (A.view !== 'dep') renderDep();
  LV.start(); updPill();
  loadWx(); setInterval(() => loadWx(), 15 * 60000);
  setInterval(() => { if (A.view === 'dep' && A.st != null && !document.hidden) renderDepList(); }, 30000);
  const sp = $('splash'); if (sp) { sp.classList.add('out'); setTimeout(() => sp.remove(), 500); }
  /* poloha: zeptáme se až po startu (bez polohy aplikace funguje, jen bez okolí) */
  if (A.perm === 'prompt') setTimeout(() => A.locate(true), 900);
  MG.emit('ready');
 };
 document.addEventListener('visibilitychange', () => { if (!document.hidden) LV.tick(); });
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => A.boot()); else A.boot();
})();
