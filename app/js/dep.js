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
 const lvDelay = lv => !lv ? null : lv.delay != null ? lv.delay : (lv._est != null ? lv._est : null);
 const dlHtml = (lv) => { const d = lvDelay(lv); if (d == null) return ''; const t = lv.delay == null ? '~' : '', ti = lv.delay == null ? ' title="odhad podle polohy vozidla"' : ''; return d <= .5 ? '<span class="dl"' + ti + '>' + t + 'včas</span>' : '<span class="dl ' + (d <= 3 ? 'mid' : 'bad') + '"' + ti + '>' + t + '+' + Math.round(d) + ' min</span>'; };
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
 const cdTxt = (t, nowS) => { const s = Math.round(t * 60 - nowS); if (s <= 20) return 'teď'; if (s >= 3600) return ''; return Math.floor(s / 60) + ':' + MG.pad(s % 60); };
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
  if (!s) { html += '<div id="dep-nearby"><div class="empty"><i class="fa-regular fa-clock"></i>Napiš název zastávky nebo klepni na zastávku na mapě.</div></div></div>'; el.innerHTML = html; bind(el); P.bindFav(el, f => { if (f.st != null) P.show(f.st, D.okresAt(f.lat, f.lon)); else P.nearestTo(f); }); nearby(); return; }
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
   const delay = lvDelay(lv) > 0 ? lvDelay(lv) : 0;
   const k2 = d.p.i + ':' + d.j + ':' + d.day + ':' + d.k;
   const exp = d.t + delay, cd = today ? cdTxt(exp, nowS) : '';
   const op = P.open === k2, mins = Math.round((exp * 60 - nowS) / 60);
   const tb = today && mins <= 10 ? '<b class="cd" data-exp="' + exp + '">' + (cd || MG.hm2(exp)) + '</b><small>' + MG.hm2(exp) + '</small>' : '<b class="tm">' + MG.hm2(exp) + '</b><small class="za">' + (today && mins < 60 ? 'za ' + mins + ' min' : (delay >= 1 ? 'plán ' + MG.hm2(d.t) : '')) + '</small>';
   html += '<div class="dep-card' + (op ? ' open' : '') + '"><div class="dep" data-k="' + k2 + '">' + D.badge(L_, {size: 'big', text: L_.k === 'vlak' ? D.trainLabel(L_, d.p.n && d.p.n[d.j]) : null}) + '<div class="d-tx"><b><i class="fa-solid fa-arrow-right"></i> ' + MG.h(D.shortName(hs, cty)) + '</b>' + (pl && pl.lab ? '<small>nástupiště ' + MG.h(pl.lab) + '</small>' : '') + '</div>' + dlHtml(lv) + '<div class="d-t">' + tb + '</div><i class="fa-solid fa-chevron-down chev"></i></div>' + (op ? expandTrip(d, delay) : '') + '</div>';
  }
  const upd = MG.live.at && (MG.live.at.odis || MG.live.at.sz) ? new Date(Math.max(MG.live.at.odis || 0, MG.live.at.sz || 0, MG.live.at.worker || 0)) : null;
  html += '<div class="dep-foot"><span>' + (MG.live.on ? '<span class="dot-live"></span> Zpoždění živě' + (upd ? ' · ' + MG.pad(upd.getHours()) + ':' + MG.pad(upd.getMinutes()) : '') : 'Podle jízdního řádu') + '</span><a target="_blank" rel="noopener" href="https://idos.cz/vlakyautobusymhdvse/odjezdy/?f=' + encodeURIComponent(s.name) + '">Ověřit v IDOS <i class="fa-solid fa-arrow-up-right-from-square"></i></a></div></div>';
  el.innerHTML = html; bind(el);
  P.bindFav(el, f => { if (f.st != null) P.show(f.st, D.okresAt(f.lat, f.lon)); else P.nearestTo(f); });
 };
 /* bez vybrané zastávky: zastávky v okolí (jako běžné dopravní aplikace) */
 async function nearby() {
  const box = $('dep-nearby'); if (!box) return;
  const me = MG.app.me, c = me ? {lat: me.lat, lon: me.lon} : (() => { const m = MG.map.m.getCenter(); return {lat: m.lat, lon: m.lng}; })();
  const idx = await D.loadIdx();
  const near = idx.map(x => [MG.dist(c.lat, c.lon, x.lat, x.lon), x]).sort((a, b) => a[0] - b[0]).slice(0, 5);
  if (!$('dep-nearby') || P.st != null) return;
  const chips = g => { const ls = D.stLines(g); return ls.slice(0, 12).map(x => D.badge(x)).join('') + (ls.length > 12 ? '<span class="ln more">+' + (ls.length - 12) + '</span>' : ''); };
  box.innerHTML = '<div class="list41-title">' + (me ? 'Zastávky v okolí' : 'Zastávky u středu mapy') + '</div>' + near.map(([d, x], i) => '<div class="card41" data-g="' + x.g + '" data-ok="' + x.ok + '"><div class="card41-top"><span class="card41-ico"><i class="fa-solid ' + (x.m & 1 ? 'fa-train' : x.m & 2 ? 'fa-train-tram' : 'fa-bus-simple') + '"></i></span><span class="card41-name">' + MG.h(x.name) + '</span><span class="card41-dist">' + MG.fmtDist(d) + (me ? ' · ' + Math.max(1, Math.round(d * 1.25 / 75)) + ' min' : '') + '</span></div><div class="card41-lines">' + (chips(x.g) || '<span class="muted41">odjezdy po klepnutí</span>') + '</div></div>').join('');
  MG.qsa('.card41', box).forEach(c2 => c2.onclick = () => P.show(+c2.dataset.g, +c2.dataset.ok));
 }
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
  let h = '<div class="dep-sub">';
  for (let k = d.k + 1; k < p.s.length; k++) {
   const pl = D.pl.get(p.s[k]); const t = st0 + arr[k];
   h += '<div class="dep-st"><span class="dep-sd"></span><span class="dep-sn">' + MG.h(D.shortName(pl ? D.stName(pl.st) : '?', city)) + (D.isRequest(p, k) ? ' <i class="fa-solid fa-hand" style="font-size:9px;color:var(--faint)"></i>' : '') + '</span><b>' + MG.hm2(t + delay) + '</b></div>';
  }
  h += '</div><div class="dep-acts"><button class="chip" data-show="' + p.i + ':' + d.j + ':' + d.day + '"><i class="fa-solid fa-map-location-dot"></i>Na mapě</button><button class="chip" data-line="' + d.L.i + '" data-pat="' + p.i + '"><i class="fa-solid fa-route"></i>Linka</button><button class="chip" data-bell="' + p.i + ':' + d.j + ':' + d.day + '"><i class="fa-solid fa-bell"></i>Budík</button></div>';
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
  MG.qsa('.dep', el).forEach(r => r.onclick = () => { P.open = P.open === r.dataset.k ? null : r.dataset.k; const sc = el.querySelector('.sh-body').scrollTop; P.render(); el.querySelector('.sh-body').scrollTop = sc; });
  MG.qsa('[data-bell]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); MG.veh.sel = null; MG.veh.select(b.dataset.bell); setTimeout(() => { MG.veh.pick = true; MG.veh.showAll = true; MG.veh.tick(); }, 300); });
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
  const ok = D.okresy[s.ok], seat = ok ? ok.seat : '';
  const lines = D.stLines(g);
  const grp = {mhd: [], regio: [], vlak: []};
  for (const L_ of lines) { if (L_.k === 'vlak') grp.vlak.push(L_); else if (L_.k === 'regio' || L_.k === 'mezi') grp.regio.push(L_); else grp.mhd.push(L_); }
  /* na znamení / bezbariérová */
  let rq = false; for (const pg of (pl ? [plg] : s.pls)) { const q = D.pl.get(pg); if (!q) continue; for (const [p, k] of q.pats) if (D.isRequest(p, k)) { rq = true; break; } if (rq) break; }
  const wc = (pl ? [pl] : s.pls.map(x => D.pl.get(x))).some(q => q && q.wc);
  const city = grp.mhd.length && grp.mhd[0].city ? grp.mhd[0].city : (s.name.split(',')[0]);
  const type = grp.vlak.length && !grp.mhd.length ? 'Železniční stanice / zastávka' : grp.mhd.length ? 'Zastávka MHD ' + city : 'Zastávka regionálních linek';
  const sec = (t, ls) => ls.length ? '<div class="stp-sec">' + t + '</div><div class="stp-lns">' + ls.slice(0, 24).map(x => '<a data-ln="' + x.i + '">' + D.badge(x, {text: x.k === 'vlak' ? (x.lab || x.cat || 'Vlak') : null}) + '</a>').join('') + (ls.length > 24 ? '<span class="ln" style="--lc:var(--hover);--lt:var(--mut)">+' + (ls.length - 24) + '</span>' : '') + '</div>' : '';
  const h = '<div class="stp"><div class="stp-n">' + MG.h(D.shortName(s.name, seat)) + '</div>' +
   '<div class="stp-chips">' + (rq ? '<span><i class="fa-solid fa-hand"></i>na znamení</span>' : '') + (wc ? '<span><i class="fa-solid fa-wheelchair"></i>bezbariérová</span>' : '') + (pl && pl.lab ? '<span>nástupiště ' + MG.h(pl.lab) + '</span>' : '') + '</div>' +
   '<div class="stp-sub">' + MG.h(type) + (pl ? ' · směr ' + MG.h(D.shortName(D.plDir(plg), city)) : '') + '</div>' +
   sec('Linky MHD', grp.mhd) + sec('Regionální linky', grp.regio) + sec('Vlaky', grp.vlak) +
   '<div class="stp-acts"><button class="wide" id="pp-to" title="Spojení sem"><i class="fa-solid fa-route"></i>Spojení</button><button class="walk" id="pp-walk" title="Pěšky sem"><i class="fa-solid fa-person-walking-arrow-right"></i></button><button id="pp-dep" title="Odjezdy">' + MG.mi('clock') + '</button></div></div>';
  if (MG.mode3d) { MG.m3d.popup(lat, lon, h, g); } else {
   L.popup({className: 'pop-mg stp-pop', autoPanPaddingTopLeft: [20, 80], autoPanPaddingBottomRight: [20, 110], maxWidth: 300, minWidth: 240}).setLatLng([lat, lon]).setContent(h).openOn(MG.map.m);
  }
  setTimeout(() => {
   const cl = () => { MG.map.m.closePopup(); MG.m3d.closePopup && MG.m3d.closePopup(); };
   const b1 = $('pp-dep'), b2 = $('pp-to'), b3 = $('pp-walk');
   if (b1) b1.onclick = () => { cl(); P.show(g, s.ok); };
   if (b2) b2.onclick = () => { cl(); MG.search.routeTo({name: s.name, lat: s.lat, lon: s.lon, st: g}); };
   if (b3) b3.onclick = () => { cl(); MG.walk.to({name: s.name + (pl && pl.lab ? ' (' + pl.lab + ')' : ''), lat, lon}); };
   MG.qsa('.stp [data-ln]').forEach(a2 => a2.onclick = () => { cl(); MG.net.openLine(+a2.dataset.ln); });
  }, 30);
 };
 MG.on('live', () => { if (MG.ui.cur === 'sh-dep' && P.st != null && !document.activeElement?.closest?.('#sh-dep')) P.render(); });
 setInterval(() => { if (MG.ui.cur === 'sh-dep' && P.st != null && P.when == null && !document.activeElement?.closest?.('#sh-dep')) P.render(); }, 30000);
})();
