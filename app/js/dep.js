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
  const sp = d.p.c && d.p.c[d.j]; if (!sp) return null;
  for (const v of LV.allBus()) if (v.spoj === sp && ((d.L.cis && d.L.cis.includes(v.cis)) || (v.src === 'PID' && d.L.sys === 'PID' && String(v.line) === String(d.L.n)))) return v;
  return null;
 };
 const dlHtml = (lv) => { if (!lv || lv.delay == null) return ''; const d = lv.delay; return d <= .5 ? '<span class="dl">včas</span>' : '<span class="dl ' + (d <= 3 ? 'mid' : 'bad') + '">+' + Math.round(d) + ' min</span>'; };
 const until = (t, nowM) => { const x = Math.round(t - nowM); return x <= 0 ? 'teď' : x < 60 ? 'za ' + x + ' min' : ''; };
 async function ensureStation(g, okres) {
  if (D.st.has(g)) return true;
  if (okres >= 0) { MG.app.loadbar('Načítám okres ' + D.okresy[okres].name + '…'); try { await D.loadOkres(okres); } catch (_) {} MG.app.loadbar(); MG.map.drawNet(); }
  return D.st.has(g);
 }
 /* lišta Moje místa (jako fav41 v OpavaGO) */
 P.favStrip = (ctx) => {
  const F = MG.store.get('favs', []) || [];
  const has = n => F.some(f => f.label === n);
  return '<div class="fav-strip" data-ctx="' + ctx + '"><span class="fav-lab"><i class="fa-solid fa-star"></i></span>' +
   F.map((f, i) => '<button data-fav="' + i + '"><i class="fa-solid ' + (f.icon || 'fa-star') + '"></i><span>' + MG.h(f.label) + '</span></button>').join('') +
   (has('Domů') ? '' : '<button class="ghost" data-favadd="Domů"><i class="fa-solid fa-house"></i><span>Domů</span><i class="fa-solid fa-plus pl"></i></button>') +
   (has('Práce') ? '' : '<button class="ghost" data-favadd="Práce"><i class="fa-solid fa-briefcase"></i><span>Práce</span><i class="fa-solid fa-plus pl"></i></button>') +
   '<button data-favadd=""><i class="fa-solid fa-plus"></i><span>Jiné</span></button></div>';
 };
 P.bindFav = (el, onPick) => {
  const F = MG.store.get('favs', []) || [];
  MG.qsa('[data-fav]', el).forEach(b => b.onclick = () => onPick(F[+b.dataset.fav]));
  MG.qsa('[data-favadd]', el).forEach(b => b.onclick = () => MG.search.addFavFlow(b.dataset.favadd));
 };
 const cdTxt = (t, nowS) => { const s = Math.round(t * 60 - nowS); if (s <= 30) return 'teď'; if (s >= 3600) return ''; return Math.floor(s / 60) + ':' + MG.pad(s % 60); };
 P.render = () => {
  const el = $('sh-dep');
  const s = P.st != null ? D.st.get(P.st) : null;
  const nowP = MG.pragueParts(MG.now());
  const ymd = P.ymd || nowP.ymd, from = P.when != null ? P.when : nowP.h * 60 + nowP.mi + nowP.s / 60;
  const city = s && D.okresy[s.ok] ? D.okresy[s.ok].seat : '';
  let html = '<div class="sh-grab"></div><div class="sh-head"><div class="sh-ic"><i class="fa-regular fa-clock"></i></div><div class="sh-tt"><div class="sh-eb">Odjezdy podle jízdního řádu</div><div class="sh-title">' + (s ? MG.h(D.shortName(s.name, city)) : 'Odjezdy') + '</div>' + (s && D.shortName(s.name, city) !== s.name ? '<div class="sh-sub">' + MG.h(s.name.split(',')[0]) + (D.okresy[s.ok] ? ' · okres ' + MG.h(D.okresy[s.ok].name) : '') + '</div>' : '') + '</div><button class="xbtn" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>';
  html += '<div class="sh-body"><div class="sugg"><div class="field"><i class="fa-solid fa-magnifying-glass" style="color:var(--faint)"></i><input id="dep-q" placeholder="Vyberte zastávku…" autocomplete="off" value=""><button class="fbtn" id="dep-near" title="Nejbližší zastávka"><i class="fa-solid fa-location-crosshairs"></i></button></div><div class="sugg-list" id="dep-sugg"></div></div>';
  html += '<div style="height:8px"></div>' + P.favStrip('dep');
  html += '<div class="dep-ctl" style="margin-top:0"><button class="chip' + (P.when == null && !P.ymd ? ' on' : '') + '" id="dep-now">Nyní</button><input type="time" id="dep-t" value="' + MG.hm2(from) + '"><input type="date" id="dep-d" value="' + ymd + '" min="' + D.core.d0 + '" max="' + MG.ymdAdd(D.core.d0, D.core.nd - 1) + '"></div>';
  const wx = MG.app.wx;
  html += '<div class="wx-line">' + (wx ? '<i class="fa-solid ' + wx.ic + '"></i>' + wx.t + ' °C <small>' + MG.h(wx.txt.charAt(0).toUpperCase() + wx.txt.slice(1)) + (wx.rain ? ' · ' + MG.h(wx.rain) : '') + '</small>' : '<i class="fa-solid fa-cloud"></i><small>počasí nedostupné</small>') + '</div>';
  if (!s) { html += '<div class="empty"><i class="fa-regular fa-clock"></i>Napiš název zastávky nebo klepni na zastávku na mapě.</div></div>'; el.innerHTML = html; bind(el); return; }
  const allLines = [...s.lines].map(i => D.ln.get(i)).filter(Boolean).filter(L_ => !(MG.app.hideTrains && L_.k === 'vlak')).sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || String(D.lineText(a)).localeCompare(String(D.lineText(b)), 'cs', {numeric: true}));
  html += '<div class="chips"><button class="dep-lc all' + (!P.lines ? ' on' : '') + '" data-ln="all">Vše</button>' + allLines.map(L_ => '<button class="dep-lc' + (P.lines && P.lines.has(L_.i) ? ' on' : '') + '" data-ln="' + L_.i + '" style="--lc:' + L_.c + ';--lt:' + L_.tc + '">' + MG.h(D.lineText(L_)) + '</button>').join('') + '</div>';
  if (s.pls.length > 1) html += '<div class="chips"><button class="chip' + (P.plat == null ? ' on' : '') + '" data-pl="all">Všechna nástupiště</button>' + s.pls.filter(g => D.pl.get(g) && D.pl.get(g).pats.length).map(g => { const pl = D.pl.get(g); return '<button class="chip' + (P.plat === g ? ' on' : '') + '" data-pl="' + g + '">' + (pl.lab ? MG.h(pl.lab) + ' · ' : '') + '→ ' + MG.h(D.shortName(D.plDir(g), '').split(',').pop().trim()) + '</button>'; }).join('') + '</div>';
  const als = MG.alerts ? MG.alerts.forStation(P.st) : [];
  if (als.length) html += '<details class="alert-box"><summary><i class="fa-solid fa-triangle-exclamation"></i>' + als.length + ' ' + (als.length === 1 ? 'mimořádnost' : als.length < 5 ? 'mimořádnosti' : 'mimořádností') + ' na linkách této zastávky</summary>' + als.map(MG.alerts.card).join('') + '</details>';
  const deps = D.departures(P.st, {ymd, from: from - 1, horizon: P.when == null ? 300 : 480, limit: 70, lines: P.lines, platform: P.plat}).filter(d => !(MG.app.hideTrains && d.L.k === 'vlak'));
  if (!deps.length) html += '<div class="empty"><i class="fa-regular fa-calendar-xmark"></i>V tuto dobu odsud nic nejede.</div>';
  const nowS = (nowP.h * 60 + nowP.mi) * 60 + nowP.s, today = ymd === nowP.ymd && P.when == null;
  for (const d of deps) {
   const L_ = d.L, cty = L_.city || '';
   const lv = ymd === nowP.ymd ? P.liveFor(d) : null;
   const hs = D.headsign(d.p, d.j);
   const pl = D.pl.get(d.pl);
   const delay = lv && lv.delay > 0 ? lv.delay : 0;
   const k2 = d.p.i + ':' + d.j + ':' + d.day + ':' + d.k;
   const exp = d.t + delay, cd = today ? cdTxt(exp, nowS) : '';
   html += '<div class="dep" data-k="' + k2 + '">' + D.badge(L_, {size: 'big', text: L_.k === 'vlak' ? D.trainLabel(L_, d.p.n && d.p.n[d.j]) : null}) + '<div class="d-tx"><b>→ ' + MG.h(D.shortName(hs, cty)) + '</b>' + (pl && pl.lab ? '<small>nástupiště ' + MG.h(pl.lab) + (L_.k === 'vlak' ? '' : '') + '</small>' : '') + '</div>' + dlHtml(lv) + '<div class="d-t"><b class="cd" data-exp="' + exp + '">' + (cd || MG.hm2(exp)) + '</b><small>' + MG.hm2(d.t) + (delay >= 1 ? ' → ' + MG.hm2(exp) : '') + '</small></div><i class="fa-solid fa-chevron-' + (P.open === k2 ? 'up' : 'down') + ' chev"></i></div>';
   if (P.open === k2) html += expandTrip(d, delay);
  }
  const upd = MG.live.at && (MG.live.at.odis || MG.live.at.sz) ? new Date(Math.max(MG.live.at.odis || 0, MG.live.at.sz || 0, MG.live.at.worker || 0)) : null;
  html += '<div class="dep-foot"><span>' + (MG.live.on ? '<span class="dot-live"></span> Zpoždění živě' + (upd ? ' · ' + MG.pad(upd.getHours()) + ':' + MG.pad(upd.getMinutes()) : '') : 'Podle jízdního řádu') + '</span><a target="_blank" rel="noopener" href="https://idos.cz/vlakyautobusymhdvse/odjezdy/?f=' + encodeURIComponent(s.name) + '">Ověřit v IDOS <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div></div>';
  el.innerHTML = html; bind(el);
  P.bindFav(el, f => { if (f.st != null) P.show(f.st, D.okresAt(f.lat, f.lon)); else P.nearestTo(f); });
 };
 /* běžící odpočet m:ss (jako OpavaGO) */
 setInterval(() => {
  if (MG.ui.cur !== 'sh-dep' || P.when != null || P.ymd) return;
  const n = MG.pragueParts(MG.now()), nowS = (n.h * 60 + n.mi) * 60 + n.s;
  MG.qsa('#sh-dep .d-t b.cd').forEach(b => { const e = +b.dataset.exp; const c = cdTxt(e, nowS); b.textContent = c || MG.hm2(e); });
 }, 1000);
 P.nearestTo = async (pt) => { const idx = await D.loadIdx(); let best = null, bd = 1e12; for (const s of idx) { const d = MG.dist(pt.lat, pt.lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } } if (best) P.show(best.g, best.ok); };
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
 P.nearestWalk = async () => {
  const me = MG.app.me || (await MG.app.locate(false));
  if (!me) { MG.toast('Poloha není k dispozici'); return; }
  const idx = await D.loadIdx(); let best = null, bd = 1e12;
  for (const s of idx) { const d = MG.dist(me.lat, me.lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } }
  if (!best) return;
  await ensureStation(best.g, best.ok);
  const s = D.st.get(best.g);
  /* nejbližší nástupiště zastávky */
  let pl = null, pd = 1e12; if (s) for (const g of s.pls) { const q = D.pl.get(g); if (!q || !q.pats.length) continue; const d = MG.dist(me.lat, me.lon, q.lat, q.lon); if (d < pd) { pd = d; pl = q; } }
  MG.walk.to({name: best.name + (pl && pl.lab ? ' (' + pl.lab + ')' : ''), lat: pl ? pl.lat : best.lat, lon: pl ? pl.lon : best.lon});
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
  h += '<div style="display:flex;gap:6px;margin-top:10px"><button class="btn sm" id="pp-dep" style="flex:1"><i class="fa-regular fa-clock"></i>Odjezdy</button><button class="btn sec sm" id="pp-to" style="flex:1"><i class="fa-solid fa-route"></i>Spojení</button><button class="btn sec sm" id="pp-walk" title="Pěšky sem"><i class="fa-solid fa-person-walking"></i></button></div></div>';
  if (MG.mode3d) { MG.m3d.popup(lat, lon, h, g); } else {
   pop = L.popup({className: 'pop-mg', autoPanPaddingTopLeft: [20, 80], autoPanPaddingBottomRight: [20, 100], maxWidth: 300}).setLatLng([lat, lon]).setContent(h).openOn(MG.map.m);
  }
  setTimeout(() => {
   const b1 = $('pp-dep'), b2 = $('pp-to');
   if (b1) b1.onclick = () => { MG.map.m.closePopup(); MG.m3d.closePopup && MG.m3d.closePopup(); P.show(g, s.ok); };
   if (b2) b2.onclick = () => { MG.map.m.closePopup(); MG.m3d.closePopup && MG.m3d.closePopup(); MG.search.routeTo({name: s.name, lat: s.lat, lon: s.lon, st: g}); };
   const b3 = $('pp-walk'); if (b3) b3.onclick = () => { MG.m3d.closePopup && MG.m3d.closePopup(); MG.walk.to({name: s.name + (pl && pl.lab ? ' (' + pl.lab + ')' : ''), lat, lon}); };
  }, 30);
 };
 MG.on('live', () => { if (MG.ui.cur === 'sh-dep' && P.st != null && !document.activeElement?.closest?.('#sh-dep')) P.render(); });
 setInterval(() => { if (MG.ui.cur === 'sh-dep' && P.st != null && P.when == null && !document.activeElement?.closest?.('#sh-dep')) P.render(); }, 30000);
})();
