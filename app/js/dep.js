/* ===== mhdGO – odjezdy a okno zastávky ===== */
(function(){
 const D = MG.D, $ = MG.$, LV = MG.live;
 const P = MG.dep = {st: null, when: null, ymd: null, lines: null, plat: null, open: null};
 /* zpoždění spoje (přesné párování: vlak podle čísla, ODIS podle čísla linky a spoje) */
 P.liveFor = (d) => {
  const key = d.p.i + ':' + d.j + ':' + d.day;
  const m = MG.veh.liveMap.get(key); if (m) return m;
  if (!LV.on) return null;
  if (d.L.k === 'vlak') { const n = d.p.n && d.p.n[d.j]; return n ? LV.trains.get(String(n)) || null : null; }
  const sp = d.p.c && d.p.c[d.j]; if (!sp || !d.L.cis) return null;
  for (const v of LV.allBus()) if (v.spoj === sp && d.L.cis.includes(v.cis)) return v;
  return null;
 };
 const dlHtml = (lv) => { if (!lv || lv.delay == null) return ''; const d = lv.delay; return d <= .5 ? '<span class="dl">včas</span>' : '<span class="dl ' + (d <= 3 ? 'mid' : 'bad') + '">+' + Math.round(d) + ' min</span>'; };
 const until = (t, nowM) => { const x = Math.round(t - nowM); return x <= 0 ? 'teď' : x < 60 ? 'za ' + x + ' min' : ''; };
 async function ensureStation(g, okres) {
  if (D.st.has(g)) return true;
  if (okres >= 0) { MG.app.loadbar('Načítám okres ' + D.okresy[okres].name + '…'); try { await D.loadOkres(okres); } catch (_) {} MG.app.loadbar(); MG.map.drawNet(); }
  return D.st.has(g);
 }
 P.render = () => {
  const el = $('sh-dep');
  const s = P.st != null ? D.st.get(P.st) : null;
  const nowP = MG.pragueParts(MG.now());
  const ymd = P.ymd || nowP.ymd, from = P.when != null ? P.when : nowP.h * 60 + nowP.mi + nowP.s / 60;
  let html = MG.ui.head({icon: 'fa-regular fa-clock', eb: 'Odjezdy podle jízdního řádu' + (LV.on ? ' · živě' : ''), title: s ? MG.h(s.name) : 'Odjezdy', sub: s ? (D.okresy[s.ok] ? 'okres ' + MG.h(D.okresy[s.ok].name) + ' · ' : '') + s.pls.length + ' nástupišť' : 'Vyber zastávku kdekoli v ČR'});
  html += '<div class="sh-body"><div class="sugg"><div class="field"><i class="fa-solid fa-magnifying-glass"></i><input id="dep-q" placeholder="Vyberte zastávku…" autocomplete="off" value=""><button class="fbtn" id="dep-near" title="Nejbližší zastávka"><i class="fa-solid fa-location-crosshairs"></i></button></div><div class="sugg-list" id="dep-sugg"></div></div>';
  html += '<div class="dep-ctl"><button class="chip' + (P.when == null && !P.ymd ? ' on' : '') + '" id="dep-now">Nyní</button><input type="time" id="dep-t" value="' + MG.hm2(from) + '"><input type="date" id="dep-d" value="' + ymd + '" min="' + D.core.d0 + '" max="' + MG.ymdAdd(D.core.d0, D.core.nd - 1) + '"></div>';
  if (MG.app.wx) html += '<div class="weather-line"><i class="fa-solid ' + MG.app.wx.ic + '" style="color:var(--acc)"></i>' + MG.app.wx.t + ' °C · ' + MG.h(MG.app.wx.txt) + '</div>';
  if (!s) { html += '<div class="empty"><i class="fa-regular fa-clock"></i>Napiš název zastávky nebo klepni na zastávku na mapě.</div></div>'; el.innerHTML = html; bind(el); return; }
  const allLines = [...s.lines].map(i => D.ln.get(i)).filter(Boolean).sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || String(D.lineText(a)).localeCompare(String(D.lineText(b)), 'cs', {numeric: true}));
  html += '<div class="chips"><button class="chip' + (!P.lines ? ' on' : '') + '" data-ln="all">Vše</button>' + allLines.map(L_ => '<button class="chip' + (P.lines && P.lines.has(L_.i) ? ' on' : '') + '" data-ln="' + L_.i + '" style="padding:0 6px">' + D.badge(L_) + '</button>').join('') + '</div>';
  if (s.pls.length > 1) html += '<div class="chips"><button class="chip' + (P.plat == null ? ' on' : '') + '" data-pl="all">Všechna nástupiště</button>' + s.pls.filter(g => D.pl.get(g) && D.pl.get(g).pats.length).map(g => { const pl = D.pl.get(g); return '<button class="chip' + (P.plat === g ? ' on' : '') + '" data-pl="' + g + '">' + (pl.lab ? MG.h(pl.lab) + ' · ' : '') + '→ ' + MG.h(D.shortName(D.plDir(g), '').split(',').pop().trim()) + '</button>'; }).join('') + '</div>';
  const deps = D.departures(P.st, {ymd, from: from - 1, horizon: P.when == null ? 300 : 480, limit: 70, lines: P.lines, platform: P.plat});
  if (!deps.length) html += '<div class="empty"><i class="fa-regular fa-calendar-xmark"></i>V tuto dobu odsud nic nejede.</div>';
  const nowM = nowP.h * 60 + nowP.mi + nowP.s / 60, today = ymd === nowP.ymd;
  for (const d of deps) {
   const L_ = d.L, city = L_.city || '';
   const lv = today ? P.liveFor(d) : null;
   const hs = D.headsign(d.p, d.j);
   const pl = D.pl.get(d.pl);
   const delay = lv && lv.delay > 0 ? lv.delay : 0;
   const k2 = d.p.i + ':' + d.j + ':' + d.day + ':' + d.k;
   html += '<div class="dep" data-k="' + k2 + '">' + D.badge(L_, {size: 'big', text: L_.k === 'vlak' ? D.trainLabel(L_, d.p.n && d.p.n[d.j]) : null}) + '<div class="d-tx"><b>→ ' + MG.h(D.shortName(hs, city)) + '</b><small>' + (L_.k === 'vlak' && L_.lab ? MG.h(L_.lab) + ' · ' : '') + MG.h(V_KN(L_)) + '</small></div>' + dlHtml(lv) + (pl && pl.lab ? '<span class="pl">' + MG.h(pl.lab) + '</span>' : '') + '<div class="d-t"><b>' + (today ? (until(d.t + delay, nowM) || MG.hm2(d.t + delay)) : MG.hm2(d.t)) + '</b><small>' + MG.hm2(d.t) + (delay >= 1 ? ' → ' + MG.hm2(d.t + delay) : '') + '</small></div></div>';
   if (P.open === k2) html += expandTrip(d, delay);
  }
  html += '<div class="row" style="justify-content:space-between;margin-top:8px"><span class="status">Zpoždění: živá data, kde jsou k dispozici</span><a class="status" style="color:var(--acc);font-weight:800" target="_blank" rel="noopener" href="https://idos.cz/vlakyautobusymhdvse/odjezdy/?f=' + encodeURIComponent(s.name) + '">Ověřit v IDOS <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div></div>';
  el.innerHTML = html; bind(el);
 };
 const V_KN = L_ => ({metro: 'Metro', tram: 'Tramvaj', trol: 'Trolejbus', mhd: 'Autobus MHD', regio: 'Regionální autobus', mezi: 'Dálkový autobus', vlak: 'Vlak', lan: 'Lanovka', lod: 'Přívoz'})[L_.k] + (L_.a && L_.a[0] ? ' · ' + D.agency(L_.a[0]) : '');
 function expandTrip(d, delay) {
  const p = d.p, dep = p.dep[d.prof], arr = p.arr[d.prof], st0 = p.T[3 * d.j], city = d.L.city || '';
  let h = '<div class="dep-x card"><div class="vc-st" style="padding:4px 0">';
  for (let k = d.k; k < p.s.length && k < d.k + 12; k++) {
   const pl = D.pl.get(p.s[k]); const t = st0 + (k === d.k ? dep[k] : arr[k]);
   h += '<div class="tl-s' + (k === d.k ? ' nx' : '') + (k === p.s.length - 1 ? ' end' : '') + '"><i></i><span>' + MG.h(D.shortName(pl ? D.stName(pl.st) : '?', city)) + '</span><b>' + MG.hm2(t + delay) + '</b></div>';
  }
  if (p.s.length > d.k + 12) h += '<div class="status">… a dalších ' + (p.s.length - d.k - 12) + ' zastávek do ' + MG.h(D.plName(p.s[p.s.length - 1])) + '</div>';
  h += '</div><div class="row"><button class="btn sec sm" data-show="' + p.i + ':' + d.j + ':' + d.day + '"><i class="fa-solid fa-map-location-dot"></i>Na mapě</button><button class="btn sec sm" data-line="' + d.L.i + '" data-pat="' + p.i + '"><i class="fa-solid fa-route"></i>Linka</button></div></div>';
  return h;
 }
 function bind(el) {
  const q = $('dep-q'), sg = $('dep-sugg');
  const doSug = MG.debounce(async () => {
   const v = q.value.trim(); if (v.length < 2) { sg.innerHTML = ''; return; }
   const res = await MG.search.findStops(v, 8);
   sg.innerHTML = res.map((r, i) => '<div class="sg" data-g="' + r.g + '" data-o="' + r.ok + '"><i class="fa-solid ' + (r.m & 1 ? 'fa-train' : r.m & 2 ? 'fa-train-tram' : 'fa-location-dot') + '"></i><div class="tx"><b>' + MG.h(r.name) + '</b><small>' + (D.okresy[r.ok] ? 'okres ' + MG.h(D.okresy[r.ok].name) : '') + '</small></div></div>').join('');
   MG.qsa('.sg', sg).forEach(x => x.onclick = () => P.show(+x.dataset.g, +x.dataset.o));
  }, 160);
  q.oninput = doSug;
  q.onkeydown = e => { if (e.key === 'Enter') { const f = MG.qs('.sg', sg); if (f) f.click(); } };
  $('dep-near').onclick = () => P.nearest();
  $('dep-now').onclick = () => { P.when = null; P.ymd = null; P.render(); };
  $('dep-t').onchange = e => { const [h, m] = e.target.value.split(':').map(Number); if (isFinite(h)) { P.when = h * 60 + m; P.render(); } };
  $('dep-d').onchange = e => { P.ymd = e.target.value || null; if (P.when == null) { const n = MG.pragueParts(MG.now()); P.when = n.h * 60 + n.mi; } P.render(); };
  MG.qsa('[data-ln]', el).forEach(b => b.onclick = () => { const v = b.dataset.ln; if (v === 'all') P.lines = null; else { P.lines = P.lines || new Set(); const i = +v; P.lines.has(i) ? P.lines.delete(i) : P.lines.add(i); if (!P.lines.size) P.lines = null; } P.render(); });
  MG.qsa('[data-pl]', el).forEach(b => b.onclick = () => { const v = b.dataset.pl; P.plat = v === 'all' ? null : +v; P.render(); });
  MG.qsa('.dep', el).forEach(r => r.onclick = () => { P.open = P.open === r.dataset.k ? null : r.dataset.k; P.render(); });
  MG.qsa('[data-show]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); MG.veh.sel = b.dataset.show; MG.veh.select(b.dataset.show); });
  MG.qsa('[data-line]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); MG.net.openLine(+b.dataset.line, {pattern: +b.dataset.pat}); });
 }
 P.show = async (g, okres) => {
  if (!(await ensureStation(g, okres))) { MG.toast('Zastávku se nepodařilo načíst'); return; }
  P.st = g; P.lines = null; P.plat = null; P.open = null;
  if (MG.mode3d) MG.m3d.close();
  P.render(); MG.ui.open('sh-dep', {tall: true}); P.render();
  const s = D.st.get(g); if (s) MG.map.m.flyTo([s.lat, s.lon], Math.max(MG.map.m.getZoom(), 15.5), {duration: .7});
 };
 P.nearest = async () => {
  const me = MG.app.me || (await MG.app.locate(false));
  if (!me) { MG.toast('Poloha není k dispozici'); return; }
  const idx = await D.loadIdx(); let best = null, bd = 1e12;
  for (const s of idx) { const d = MG.dist(me.lat, me.lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } }
  if (best) P.show(best.g, best.ok);
 };
 /* ---------- okno zastávky na mapě ---------- */
 let pop = null;
 P.stopPopup = (g, plg) => {
  const s = D.st.get(g); if (!s) return;
  const pl = plg != null ? D.pl.get(plg) : null;
  const lat = pl ? pl.lat : s.lat, lon = pl ? pl.lon : s.lon;
  const deps = D.departures(g, {limit: 5, horizon: 180, platform: pl ? plg : null});
  const nowM = MG.nowMin();
  const lines = [...s.lines].map(i => D.ln.get(i)).filter(Boolean).sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || String(D.lineText(a)).localeCompare(String(D.lineText(b)), 'cs', {numeric: true}));
  let h = '<div style="min-width:230px;max-width:280px;font-family:Outfit,sans-serif"><div style="font:800 15px/1.2 Outfit,sans-serif;margin-bottom:2px">' + MG.h(s.name) + '</div>';
  if (pl && pl.lab) h += '<div style="font:700 11px Outfit,sans-serif;color:var(--mut);margin-bottom:6px">nástupiště ' + MG.h(pl.lab) + ' · směr ' + MG.h(D.plDir(plg)) + '</div>';
  h += '<div class="lns" style="margin:6px 0 8px">' + lines.slice(0, 14).map(x => D.badge(x)).join('') + (lines.length > 14 ? '<span class="ln" style="--lc:var(--hover);--lt:var(--mut)">+' + (lines.length - 14) + '</span>' : '') + '</div>';
  for (const d of deps) { const lv = P.liveFor(d); const dl = lv && lv.delay > 0 ? lv.delay : 0; h += '<div style="display:flex;align-items:center;gap:7px;padding:3px 0;font:600 12.5px Outfit,sans-serif">' + D.badge(d.L) + '<span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + MG.h(D.shortName(D.headsign(d.p, d.j), d.L.city || '')) + '</span><b style="font-variant-numeric:tabular-nums">' + (until(d.t + dl, nowM) || MG.hm2(d.t + dl)) + '</b></div>'; }
  if (!deps.length) h += '<div style="font:600 12px Outfit,sans-serif;color:var(--faint)">V nejbližších 3 hodinách nic nejede.</div>';
  h += '<div style="display:flex;gap:6px;margin-top:10px"><button class="btn sm" id="pp-dep" style="flex:1"><i class="fa-regular fa-clock"></i>Odjezdy</button><button class="btn sec sm" id="pp-to" style="flex:1"><i class="fa-solid fa-route"></i>Trasa sem</button></div></div>';
  if (MG.mode3d) { MG.m3d.popup(lat, lon, h, g); } else {
   pop = L.popup({className: 'pop-mg', autoPanPaddingTopLeft: [20, 80], autoPanPaddingBottomRight: [20, 100], maxWidth: 300}).setLatLng([lat, lon]).setContent(h).openOn(MG.map.m);
  }
  setTimeout(() => {
   const b1 = $('pp-dep'), b2 = $('pp-to');
   if (b1) b1.onclick = () => { MG.map.m.closePopup(); MG.m3d.closePopup && MG.m3d.closePopup(); P.show(g, s.ok); };
   if (b2) b2.onclick = () => { MG.map.m.closePopup(); MG.m3d.closePopup && MG.m3d.closePopup(); MG.search.routeTo({name: s.name, lat: s.lat, lon: s.lon, st: g}); };
  }, 30);
 };
 MG.on('live', () => { if (MG.ui.cur === 'sh-dep' && P.st != null && !document.activeElement?.closest?.('#sh-dep')) P.render(); });
 setInterval(() => { if (MG.ui.cur === 'sh-dep' && P.st != null && P.when == null && !document.activeElement?.closest?.('#sh-dep')) P.render(); }, 30000);
})();
