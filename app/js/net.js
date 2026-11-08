/* ===== mhdGO – Dopravní síť okresu ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const N = MG.net = {open: null, dir: 0, pat: null, q: ''};
 const numKey = s => { const m = /^(\D*)(\d+)(.*)$/.exec(s || ''); return m ? [m[1], +m[2], m[3]] : [s || '', 1e9, '']; };
 const cmpLine = (a, b) => { const x = numKey(D.lineText(a)), y = numKey(D.lineText(b)); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || (x[2] < y[2] ? -1 : 1); };
 function termOf(L_, p) { const city = L_.city || ''; return D.shortName(D.plName(p.s[0]), city) + ' → ' + D.shortName(D.plName(p.s[p.s.length - 1]), city); }
 function terminals(L_) {
  const [a, b] = D.mainPats(L_); const p = a || b; if (!p) return L_.ln || '';
  const city = L_.city || '';
  return D.shortName(D.plName(p.s[0]), city) + ' → ' + D.shortName(D.plName(p.s[p.s.length - 1]), city);
 }
 N.render = () => {
  const el = $('sh-net'), oi = MG.app.cur;
  const ok = oi >= 0 ? D.okresy[oi] : null;
  const ids = (oi >= 0 && D.okLines.get(oi)) || [];
  const lines = ids.map(i => D.ln.get(i)).filter(Boolean);
  const q = MG.fold(N.q);
  const groups = new Map();
  for (const L_ of lines) {
   if (q && !MG.fold(D.lineText(L_) + ' ' + (L_.ln || '') + ' ' + (L_.city || '')).includes(q)) continue;
   (groups.get(L_.k) || groups.set(L_.k, []).get(L_.k)).push(L_);
  }
  if (N.open != null && !(N.pat && N.pat.l === N.open)) { const L0 = D.ln.get(N.open); if (L0) { const mp = D.mainPats(L0); N.pat = mp[N.dir] || mp[0] || mp[1] || null; } }
  let html = U_head(ok, lines.length);
  html += '<div class="sh-body"><div class="field" style="margin:0 2px 8px"><i class="fa-solid fa-magnifying-glass"></i><input id="net-q" placeholder="Číslo nebo název linky…" value="' + MG.h(N.q) + '" autocomplete="off"></div>';
  if (!lines.length) html += '<div class="empty"><i class="fa-solid fa-bus"></i>' + (D.loaded.has(oi) ? 'V okrese nejsou žádné linky.' : 'Načítám síť okresu…') + '</div>';
  /* pořadí jako v OpavaGO: nejdřív MHD okresního města (trolejbusy, autobusy…), pak MHD dalších měst, regionální, dálkové, vlaky */
  const seat = ok ? ok.seat : '';
  const CITYK = ['metro', 'tram', 'trol', 'mhd'];
  const row = L_ => { const isOpen = N.open === L_.i, mp = isOpen ? D.mainPats(L_) : null;
   return '<div class="ln-row' + (isOpen ? ' open' : '') + '" data-l="' + L_.i + '"><div class="ln-h">' + thumb(L_) + D.badge(L_, {size: 'big'}) + (MG.alerts && MG.alerts.forLine(L_.i).length ? '<i class="fa-solid fa-triangle-exclamation" style="color:#c98a14" title="mimořádnost"></i>' : '') + '<div class="tx">' + MG.h(isOpen && N.pat ? termOf(L_, N.pat) : terminals(L_)) + (L_.k === 'vlak' || L_.k === 'regio' || L_.k === 'mezi' || (CITYK.includes(L_.k) && L_.city && L_.city !== seat) ? '<small>' + MG.h(CITYK.includes(L_.k) ? 'MHD ' + (L_.city || '') : (L_.ln || '')) + '</small>' : '') + '</div>' + (isOpen && mp[0] && mp[1] ? '<button class="dir-btn" data-flip title="Otočit směr"><i class="fa-solid fa-right-left"></i>Otočit směr</button>' : '') + '<i class="fa-solid fa-chevron-down chev"></i></div>' + (isOpen ? expand(L_) : '') + '</div>'; };
  const cnt = n => n + ' ' + (n === 1 ? 'linka' : n < 5 ? 'linky' : 'linek');
  const sec = (title, ls) => { if (!ls.length) return; ls.sort(cmpLine); html += '<div class="sec-t">' + title + ' • ' + cnt(ls.length) + '</div>' + ls.map(row).join(''); };
  const all = [...groups.values()].flat();
  const mine = all.filter(L_ => CITYK.includes(L_.k) && (!L_.city || L_.city === seat));
  for (const k of CITYK) sec(D.KIND[k][1].replace(' MHD', ''), mine.filter(L_ => L_.k === k));
  const other = all.filter(L_ => CITYK.includes(L_.k) && L_.city && L_.city !== seat);
  if (other.length) {
   const byCity = new Map(); for (const L_ of other) (byCity.get(L_.city) || byCity.set(L_.city, []).get(L_.city)).push(L_);
   for (const [city, ls] of [...byCity].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'cs'))) sec('MHD ' + city, ls);
  }
  for (const k of ['regio', 'mezi', 'vlak', 'lan', 'lod']) sec(D.KIND[k][1], all.filter(L_ => L_.k === k));
  html += '<div class="status" style="text-align:center;margin-top:10px">Jízdní řády CIS JŘ · platnost od ' + MG.h(D.core.d0) + '</div></div>';
  el.innerHTML = html;
  bind(el);
 };
 function U_head(ok, n) {
  return '<div class="sh-grab"></div><div class="sh-head"><div class="sh-tt"><div class="sh-eb brand-eb">mhd<b>GO</b></div><div class="sh-title">Dopravní síť</div><div class="sh-sub">' + (ok ? 'Okres ' + MG.h(ok.name) + ' · ' + n + ' linek' : '') + '</div></div><button class="xbtn" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>';
 }
 /* obrázek vozidla u linky (jako OpavaGO) */
 function thumb(L_) {
  const T = MG.THUMBS || {}, dark = document.body.classList.contains('dark');
  /* fotky vozů z OpavaGO jen u linek, kde opravdu jezdí (MHD Opava, ODIS); jinde neutrální ikona – nic nepředstírat */
  const opava = L_.city === 'Opava', odis = L_.sys === 'ODIS';
  const src = {trol: opava ? (dark ? T.trolD : T.trol) : null, mhd: opava ? (dark ? T.busD : T.bus) : null, regio: odis ? T.regio : null, mezi: null, vlak: T.vlak, tram: T.tram, metro: T.metro}[L_.k];
  if (src) return '<span class="ln-th"><img src="' + src + '" alt="" loading="lazy"></span>';
  const ic = {trol: 'fa-bus', mhd: 'fa-bus', regio: 'fa-bus-simple', mezi: 'fa-bus-simple', lan: 'fa-cable-car', lod: 'fa-ferry'}[L_.k] || D.KIND[L_.k][0];
  return '<span class="ln-th gen" style="--lc:' + L_.c + '"><i class="fa-solid ' + ic + '"></i>' + (L_.k === 'trol' ? '<i class="fa-solid fa-bolt tb"></i>' : '') + '</span>';
 }
 function expand(L_) {
  const pats = D.mainPats(L_);
  let p = (N.pat && N.pat.l === L_.i) ? N.pat : (pats[N.dir] || pats[0] || pats[1]);
  if (!p) return '';
  N.pat = p;
  const u = D.ttUrl(L_), city = L_.city || '';
  const ag = L_.a && L_.a[0] ? D.agency(L_.a[0]) : '';
  let h = '<div class="ln-x">';
  if (u) h += '<a class="jr-link" href="' + MG.h(u.href) + '" target="_blank" rel="noopener"><i class="fa-regular fa-calendar-days"></i><span><em>Jízdní řád ' + (L_.k === 'vlak' ? 'vlaku' : 'linky') + ' <b>' + MG.h(D.lineText(L_)) + '</b></em><small>' + MG.h([ag, u.src].filter(Boolean).join(' · ')) + '</small></span><i class="fa-solid fa-arrow-up-right-from-square"></i></a>';
  const als = MG.alerts ? MG.alerts.forLine(L_.i) : [];
  if (als.length) h += '<details class="alert-box" open><summary><i class="fa-solid fa-triangle-exclamation"></i>Mimořádnosti na lince (' + als.length + ')</summary>' + als.map(MG.alerts.card).join('') + '</details>';
  h += '<div class="st-list" style="--lc:' + L_.c + '">';
  p.s.forEach((pg, k) => {
   const pl = D.pl.get(pg); if (!pl) return; const s = D.st.get(pl.st);
   const others = s ? [...s.lines].filter(x => x !== L_.i).map(x => D.ln.get(x)).filter(Boolean).filter(x => x.k !== 'vlak' || L_.k === 'vlak' || true) : [];
   others.sort((a, b) => D.kindOrder.indexOf(a.k) - D.kindOrder.indexOf(b.k) || cmpLine(a, b));
   const chips = others.slice(0, 5).map(x => D.badge(x)).join('') + (others.length > 5 ? '<span class="ln" style="--lc:transparent;--lt:var(--faint);box-shadow:none">+' + (others.length - 5) + '</span>' : '');
   h += '<div class="st-r' + (k === 0 || k === p.s.length - 1 ? ' term' : '') + '" data-st="' + pl.st + '" data-pl="' + pg + '"><i></i><span>' + MG.h(D.shortName(s ? s.name : '?', city)) + '</span>' + (D.isRequest(p, k) ? '<span class="req-ic" title="Zastávka na znamení"><i class="fa-solid fa-thumbs-up"></i></span>' : '') + '<div class="lns">' + chips + '</div></div>';
  });
  h += '</div></div>';
  return h;
 }
 function bind(el) {
  const qi = $('net-q');
  if (qi) qi.oninput = MG.debounce(() => { N.q = qi.value; const pos = qi.selectionStart; N.render(); const q2 = $('net-q'); q2.focus(); try { q2.setSelectionRange(pos, pos) } catch (_) {} }, 250);
  MG.qsa('.ln-h', el).forEach(h => h.onclick = () => {
   const li = +h.parentNode.dataset.l;
   if (N.open === li) { N.open = null; N.pat = null; MG.map.clearSel(); N.render(); return; }
   N.open = li; N.dir = 0; N.pat = null; N.render(); show(true);
   const row = MG.qs('.ln-row.open', el); if (row) row.scrollIntoView({block: 'start', behavior: 'smooth'});
  });
  const flip = MG.qs('[data-flip]', el);
  if (flip) flip.onclick = (e) => { e.stopPropagation(); N.dir = N.pat && N.pat.d ? 0 : 1; N.pat = null; N.render(); show(true); };
  MG.qsa('.st-r', el).forEach(r => r.onclick = () => { const pl = D.pl.get(+r.dataset.pl); if (pl) MG.map.m.flyTo([pl.lat, pl.lon], Math.max(MG.map.m.getZoom(), 16), {duration: .6}); MG.dep.stopPopup(+r.dataset.st, +r.dataset.pl); });
 }
 function show(fit) { if (!N.pat) return; MG.veh.close && MG.veh.sel && MG.veh.close(); MG.map.showPattern(N.pat, {kind: 'line'}); if (fit) MG.map.fitPad(L.latLngBounds(D.geo3(N.pat).pts)); }
 N.openLine = async (li, opt) => {
  opt = opt || {};
  const L_ = D.ln.get(li); if (!L_) return;
  N.open = li; N.dir = 0; N.pat = opt.pattern != null ? D.pt.get(opt.pattern) : null; N.q = '';
  if (MG.mode3d) MG.m3d.close();
  N.render(); MG.ui.open('sh-net', {tall: false}); N.render(); show(true);
  setTimeout(() => { const row = MG.qs('#sh-net .ln-row.open'); if (row) row.scrollIntoView({block: 'start'}); }, 50);
 };
 MG.on('sheetclose', id => { if (id === 'sh-net' && MG.map.selKind === 'line') { MG.map.clearSel(); N.open = null; N.pat = null; } });
})();
