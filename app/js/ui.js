/* ===== mhdGO – rozhraní: listy, záložky, nabídky ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const U = MG.ui = {cur: null};
 const SHEETS = ['sh-search', 'sh-dep', 'sh-ai', 'sh-wx', 'sh-misc', 'bedekr'];
 U.head = (o) => '<div class="sh-grab"></div><div class="sh-head">' + (o.icon ? '<div class="sh-ic"><i class="' + o.icon + '"></i></div>' : '') + '<div class="sh-tt">' + (o.eb ? '<div class="sh-eb">' + o.eb + '</div>' : '') + '<div class="sh-title">' + o.title + '</div>' + (o.sub ? '<div class="sh-sub" id="' + (o.subId || '') + '">' + o.sub + '</div>' : '') + '</div>' + (o.extra || '') + '<button class="xbtn" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>';
 const TAB_OF = {'sh-search': 'search', 'sh-dep': 'dep', 'sh-ai': 'ai', 'sh-wx': 'wx', 'sh-more': 'more'};
 const syncBtns = () => {
  MG.qsa('#tabs button:not(.tg)').forEach(b => b.classList.toggle('on', ('sh-' + b.dataset.t) === U.cur || (b.dataset.t === 'bedekr' && U.cur === 'bedekr') || (b.dataset.t === 'info' && U.cur === 'sh-misc')));
  MG.qsa('.hdr-btns .rb:not(.tg)').forEach(b => b.classList.toggle('on', ('sh-' + b.dataset.a) === U.cur));
  document.body.classList.toggle('has-panel', !!U.cur);
  clearTimeout(U._rs); U._rs = setTimeout(() => { try { MG.map.m.invalidateSize({pan: false}); MG.m3d.map && MG.m3d.map.resize(); } catch (_) {} }, 330);
 };
 U.open = (id, opt) => {
  opt = opt || {};
  for (const s of SHEETS) if (s !== id) { const e = $(s); e.classList.remove('open', 'tall'); e.setAttribute('aria-hidden', 'true'); }
  const el = $(id); el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); el.classList.toggle('tall', !!opt.tall);
  U.cur = id; syncBtns();
  bindSheet(el);
 };
 U.close = (id) => { const el = $(id); if (!el) return; el.classList.remove('open', 'tall'); el.setAttribute('aria-hidden', 'true'); if (U.cur === id) U.cur = null; syncBtns(); MG.emit('sheetclose', id); };
 U.closeSheets = () => { for (const s of SHEETS) if ($(s).classList.contains('open')) U.close(s); };
 U.isOpen = id => $(id).classList.contains('open');
 function bindSheet(el) {
  const grab = MG.qs('.sh-grab', el); if (!grab || grab._b) return; grab._b = 1;
  let y0 = null, dy = 0;
  const down = e => { y0 = e.clientY; dy = 0; el.style.transition = 'none'; grab.setPointerCapture(e.pointerId); };
  const move = e => { if (y0 == null) return; dy = e.clientY - y0; if (dy > 0) el.style.transform = 'translateY(' + dy + 'px)'; };
  const up = () => { if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 90) U.close(el.id); else if (dy < -40) el.classList.add('tall'); else if (Math.abs(dy) < 6) el.classList.toggle('tall'); y0 = null; };
  grab.addEventListener('pointerdown', down); grab.addEventListener('pointermove', move); grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
 }
 /* ---------- nápovědy nad tlačítky (jako OpavaGO) ---------- */
 const TIPS = {search: 'Hledat zastávku nebo spojení', dep: 'Odjezdy ze zastávky', ai: 'Rádce – zeptej se na cestu', wx: 'Počasí a rada na cestu', ride: 'Jízda vozidlem ve 3D', more: 'Další funkce a nastavení', info: 'Návod a informace', bedekr: 'Bedekr – památky a zajímavosti', dark: 'Tmavý / světlý režim', regio: 'Regionální linky', vlak: 'Vlaky',
  'legend-btn': 'Legenda – co znamenají barvy a značky', 'live-btn': 'Živé polohy a zpoždění vozidel', compass: 'Sever nahoru', 'btn-cz': 'Celá Česká republika', 'btn-center': 'Vycentrovat na tvou polohu', clock: 'Čas', scale: 'Měřítko mapy'};
 U.tip = (el, text) => {
  const t = $('tip'); if (!t || !el || !text) return;
  t.textContent = text; t.classList.add('on');
  const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let x = r.left + r.width / 2 - w / 2, y = r.top - h - 8;
  if (y < 8) y = r.bottom + 8;
  t.style.left = MG.clamp(x, 8, innerWidth - w - 8) + 'px'; t.style.top = y + 'px';
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 1700);
 };
 /* ---------- záložky, hlavička ---------- */
 U.act = (t, from) => {
  const id = 'sh-' + t;
  if (from) U.tip(from, TIPS[t] || from.title);
  if (t === 'ride') { U.closeSheets(); MG.m3d.open({ride: true}); return; }
  if (t === 'bedekr') return MG.bedekr.open();
  if (t === 'info') return U.help();
  if (t === 'dark') { MG.app.setDark(!document.body.classList.contains('dark')); return; }
  if (t === 'regio') return MG.app.toggleRegio();
  if (t === 'vlak') return MG.app.toggleTrains();
  if (U.cur === id) { U.close(id); return; }
  if (t === 'net') return;
  if (t === 'search') MG.search.render();
  if (t === 'dep') MG.dep.render();
  if (t === 'ai') U.renderAI();
  if (t === 'wx') U.renderWx();
  if (t === 'more') { U.toggleMore(); return; }
  U.hideMore();
  U.open(id, {tall: t === 'dep' || t === 'ai' || t === 'wx'});
 };
 U.toggleMore = () => { const c = $('more-card'); if (!c.hidden) return U.hideMore(); U.closeSheets(); renderMore(); c.hidden = false; MG.qsa('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === 'more')); MG.qsa('.hdr-btns .rb[data-a=more]').forEach(b => b.classList.add('on')); };
 U.hideMore = () => { const c = $('more-card'); if (!c || c.hidden) return; c.hidden = true; MG.qsa('#tabs button[data-t=more], .hdr-btns .rb[data-a=more]').forEach(b => b.classList.remove('on')); };
 U.initTabs = () => {
  /* křížek funguje vždy – i po překreslení obsahu panelu */
  document.addEventListener('click', e => { const b = e.target.closest('[data-close]'); if (!b) return; const sh = b.closest('.sheet'); if (sh) { e.preventDefault(); e.stopPropagation(); U.close(sh.id); } }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if ($('modal') && !$('modal').hidden) return U.closeModal(); if (U.cur) U.close(U.cur); } });
  const mc = document.createElement('div'); mc.id = 'more-card'; mc.hidden = true; document.body.appendChild(mc);
  document.addEventListener('pointerdown', e => { if (!mc.hidden && !mc.contains(e.target) && !e.target.closest('#tabs button[data-t=more], .rb[data-a=more]')) U.hideMore(); }, true);
  /* ikony jako v OpavaGO */
  const setIc = (sel, n) => MG.qsa(sel).forEach(b => { const i = b.querySelector('i'); if (i) i.outerHTML = MG.mi(n); });
  setIc('.rb[data-a=bedekr]', 'museum'); setIc('.rb[data-a=regio]', 'r'); setIc('.rb[data-a=vlak]', 'v'); setIc('.rb[data-a=dep]', 'clock'); setIc('#tabs button[data-t=dep]', 'clock');
  setIc('#tabs button[data-t=bedekr]', 'museum'); setIc('#tabs button[data-t=regio]', 'r'); setIc('#tabs button[data-t=vlak]', 'v');
  MG.qsa('#tabs button').forEach(b => b.onclick = () => U.act(b.dataset.t, b));
  MG.qsa('.hdr-btns .rb').forEach(b => b.onclick = () => U.act(b.dataset.a, b));
  const wxb = () => U.act('wx'); if ($('hdr-wx')) $('hdr-wx').onclick = wxb; if ($('weather')) $('weather').onclick = wxb;
  $('brand').onclick = () => U.info(); $('brand-tx').onclick = () => U.info();
  $('legend-btn').onclick = (e) => { U.tip(e.currentTarget, TIPS['legend-btn']); U.legend(); };
  $('live-btn').onclick = (e) => { MG.live.toggle(!MG.live.on); U.tip(e.currentTarget, MG.live.on ? 'Živé polohy zapnuty' : 'Živé polohy vypnuty – vozidla podle jízdního řádu'); };
  $('compass').onclick = (e) => { if (MG.mode3d) MG.m3d.north(); U.tip(e.currentTarget, TIPS.compass); };
  $('btn-cz').onclick = (e) => { U.tip(e.currentTarget, TIPS['btn-cz']); MG.app.showCZ(); };
  $('btn-center').onclick = (e) => { U.tip(e.currentTarget, MG.mode3d ? 'Centrum tvé obce' : TIPS['btn-center']); MG.app.center(); };
  $('m-2d').onclick = () => MG.m3d.close();
  $('m-3d').onclick = () => { if (MG.m3d.ride) MG.m3d.endRide(); else MG.m3d.open({}); };
  if ($('m-ride')) $('m-ride').onclick = () => { U.closeSheets(); MG.m3d.open({ride: true}); };
  if ($('ride-go')) $('ride-go').onclick = () => { U.closeSheets(); MG.m3d.open({ride: true}); };
  U.syncToggles();
 };
 U.syncToggles = () => {
  MG.qsa('.rb[data-a=regio], #tabs [data-t=regio]').forEach(r => r.classList.toggle('on', !MG.app.hideRegio));
  MG.qsa('.rb[data-a=vlak], #tabs [data-t=vlak]').forEach(v => v.classList.toggle('on', !MG.app.hideTrains));
  const on = document.body.classList.contains('dark');
  MG.qsa('.rb[data-a=dark], #tabs [data-t=dark]').forEach(dk => { dk.querySelector('i').className = on ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; const t = dk.querySelector('em, span'); if (t) t.textContent = on ? 'Světlý' : 'Tmavý'; });
 };
 /* ---------- Rádce (AI) a Počasí ---------- */
 U.renderAI = () => {
  const el = $('sh-ai');
  if (!el.querySelector('#ai-body')) el.innerHTML = U.head({icon: 'fa-solid fa-wand-magic-sparkles', eb: 'mhd<b>GO</b> · AI', title: 'Rádce', sub: 'Zeptej se na spojení, odjezdy, cestu pěšky, počasí nebo jízdné'}) + '<div class="sh-body as"><div id="ai-body"></div></div>';
  MG.ai && MG.ai.show();
 };
 let wxOpen = null;
 U.renderWx = async () => {
  const el = $('sh-wx'), C = MG.core, A = MG.app;
  const paint = () => {
   const j = A.wxData, p = A.wxPoint();
   el.innerHTML = U.head({icon: 'fa-solid fa-cloud-sun', eb: 'Počasí', title: MG.h(j && j._name || p.name), sub: 'Open-Meteo · předpověď na 7 dní'}) +
    '<div class="sh-body as"><div class="wx-place"><div class="srch in"><i class="fa-solid fa-magnifying-glass"></i><input id="wq" placeholder="Počasí jinde – město nebo zastávka" autocomplete="off"><button type="button" class="ib" id="wq-me" title="Moje poloha / střed mapy"><i class="fa-solid fa-location-crosshairs"></i></button></div><div class="sug" id="wq-sug" hidden></div></div><div id="wx-body">' +
    (j && j.current ? C.wxHTML(j, wxOpen) : '<div class="empty"><span class="spin"></span> Načítám počasí…</div>') + '</div></div>';
   MG.qsa('[data-wd]', el).forEach(b => b.onclick = () => { const k = +b.dataset.wd; wxOpen = wxOpen === k ? null : k; paint(); });
   const q = $('wq'), sg = $('wq-sug');
   q.oninput = MG.debounce(async () => { const v = q.value.trim(); if (v.length < 2) { sg.hidden = true; return; } const st = await C.findStops(v, 4), ad = await C.geocode(v, 4); const it = ad.concat(st.map(x => ({name: x.name, lat: x.lat, lon: x.lon}))).slice(0, 7); sg.innerHTML = it.map((r, i) => '<button type="button" class="sg-it" data-i="' + i + '"><span class="sg-ic"><i class="fa-solid fa-location-dot"></i></span><span class="sg-tx"><b>' + MG.h(r.name) + '</b>' + (r.sub ? '<small>' + MG.h(r.sub) + '</small>' : '') + '</span></button>').join(''); sg.hidden = !it.length; MG.qsa('.sg-it', sg).forEach(b => b.onclick = async () => { const r = it[+b.dataset.i]; A.wxPlace = {name: r.name, lat: r.lat, lon: r.lon}; A.wxData = null; paint(); await A.weather(); paint(); }); }, 250);
   $('wq-me').onclick = async () => { A.wxPlace = null; A.wxData = null; paint(); await A.weather(); paint(); };
  };
  paint();
  if (!A.wxData) { await A.weather(); paint(); }
 };
 MG.on('wx', () => { if (U.cur === 'sh-wx' && !document.activeElement.closest('#sh-wx .srch')) U.renderWx(); });
 /* ---------- Více ---------- */
 function renderMore() {
  const el = $('more-card'), dark = document.body.classList.contains('dark');
  const I = c => '<i class="' + c + '"></i>';
  /* jen to, co není v hlavním panelu (Hledat, Odjezdy, Rádce, Počasí, 2D/3D, živé polohy, celá ČR) */
  const items = [
   ['fav', I('fa-solid fa-star'), 'Moje místa'], ['bedekr', MG.mi('museum'), 'Bedekr'], ['help', '<i class="ri" style="font:italic 800 17px Georgia,serif">i</i>', 'Návod'],
   ['dark', I('fa-solid fa-' + (dark ? 'sun' : 'moon')), dark ? 'Světlý režim' : 'Tmavý režim'], ['regio', MG.mi('r'), 'Regio linky', 0, !MG.app.hideRegio], ['trains', MG.mi('v'), 'Vlaky', 0, !MG.app.hideTrains],
   ['alerts', I('fa-solid fa-triangle-exclamation'), 'Mimořádnosti'], ['walk', I('fa-solid fa-person-walking'), 'K zastávce'], ['set', I('fa-solid fa-gear'), 'Nastavení']
  ];
  if (MG.pwa && MG.pwa.can && MG.pwa.can()) items.push(['install', I('fa-solid fa-mobile-screen'), 'Na plochu']);
  el.innerHTML = '<div class="more-grid">' + items.map(([k, ic, t, d3, on]) => '<button data-m="' + k + '" class="' + (on ? 'on' : '') + '">' + ic + '<span>' + t + (d3 ? '<sup class="b3d" style="position:static;margin-left:4px">3D</sup>' : '') + '</span></button>').join('') + '</div>';
  MG.qsa('.more-grid button', el).forEach(b => b.onclick = () => {
   const k = b.dataset.m;
   const keep = ['dark', 'regio', 'trains', 'live', 'color'].includes(k);
   if (!keep) U.hideMore();
   if (k === 'fav') return U.favs();
   if (k === 'bedekr') return MG.bedekr.open();
   if (k === 'help') return U.help();
   if (k === 'dark') MG.app.setDark(!document.body.classList.contains('dark'));
   if (k === 'regio') MG.app.toggleRegio();
   if (k === 'trains') MG.app.toggleTrains();
   if (k === 'live') MG.live.toggle(!MG.live.on);
   if (k === 'live3d') return MG.mode3d ? MG.m3d.close() : MG.m3d.open({});
   if (k === 'info') return U.info();
   if (k === 'set') return U.settings();
   if (k === 'alerts') return MG.alerts.show();
   if (k === 'install') return MG.pwa.install();
   if (k === 'walk') return MG.dep.nearestWalk();
   if (k === 'cz') return MG.app.showCZ();
   if (keep) renderMore();
  });
 }
 U.renderMore = renderMore;
 const misc = (head, body, tall) => { const el = $('sh-misc'); el.innerHTML = U.head(head) + '<div class="sh-body">' + body + '</div>'; U.open('sh-misc', {tall}); return el; };
 U.misc = misc;
 /* ---------- legenda ---------- */
 U.legend = () => {
  const el = $('legend'), btn = $('legend-btn');
  if (!el.hidden) { el.hidden = true; btn.classList.remove('on'); return; }
  const dark = document.body.classList.contains('dark');
  const ln = (c, extra) => '<span class="lg-s"><span class="lg-l" style="background:' + c + ';' + (extra || '') + '"></span></span>';
  el.innerHTML = '<div class="lg-h">Legenda<button type="button" aria-label="Zavřít">✕</button></div>' +
   '<div class="lg-r">' + ln(dark ? '#E39A70' : '#C1784F') + 'Linky MHD (tramvaje, trolejbusy, autobusy)</div>' +
   '<div class="lg-r">' + ln('#b98c6e', 'height:4px') + 'Regionální a dálkové autobusy</div>' +
   '<div class="lg-r">' + ln('#4a4f5a', 'background:repeating-linear-gradient(90deg,#4a4f5a 0 7px,#fff 7px 12px);border:1.5px solid #4a4f5a;height:7px') + 'Železnice (vlaky)</div>' +
   '<div class="lg-r">' + ln('transparent', 'border-top:3px dotted #6b625b;height:0') + 'Pěší úsek vyhledaného spojení</div>' +
   '<div class="lg-r"><span class="lg-s"><span style="width:13px;height:13px;border-radius:50%;border:2.5px solid #24201c;background:#fff;display:inline-block"></span></span>Zastávka · <span class="plat" style="transform:none;display:inline-grid;width:16px;height:16px;font-size:8.5px">A</span> nástupiště</div>' +
   '<div class="lg-r"><span class="lg-s"><span class="veh" style="transform:none;--c:#2344c7"><span class="veh-l" style="min-width:24px;height:18px;font-size:10px">202</span><span class="veh-d" style="min-width:16px;height:16px;font-size:9px">✓</span></span></span>Vozidlo – živě, včas / +min zpoždění</div>' +
   '<div class="lg-r"><span class="lg-s"><span class="veh" style="transform:none;--c:#3923c7"><span class="veh-l" style="min-width:24px;height:18px;font-size:10px">203</span></span></span>Vozidlo podle jízdního řádu</div>' +
   '<div class="lg-n">Regionální linky a vlaky zapneš tlačítky Regio a Vlak (na telefonu v nabídce Více). Každé město má vlastní barvy linek, každý vlak vlastní barvu. Měřítko a čas jsou vlevo dole, sever ukazuje směrovka. Podklad © OpenStreetMap, Mapbox.</div>';
  el.hidden = false; btn.classList.add('on');
  el.querySelector('button').onclick = () => { el.hidden = true; btn.classList.remove('on'); };
 };
 /* ---------- živá data ---------- */
 U.liveSettings = () => {
  const LV = MG.live, st = x => x === 'ok' ? '<b style="color:var(--ok)">funguje</b>' : x === 'err' ? '<b style="color:var(--bad)">nedostupné</b>' : '<span style="color:var(--faint)">neaktivní</span>';
  const el = misc({icon: 'fa-solid fa-tower-broadcast', eb: 'Živé polohy', title: 'Polohy a zpoždění', sub: 'Vozidla bez živých dat jezdí podle jízdního řádu'},
   '<div class="list-item" id="lv-tg"><i class="fa-solid fa-power-off" style="color:var(--acc)"></i><div class="li-tx"><b>Živé polohy ' + (LV.on ? 'zapnuty' : 'vypnuty') + '</b><small>Klepnutím přepneš</small></div></div>' +
   '<div class="sec-t">Zdroje</div><div class="info-p"><p><b>Vlaky celé ČR</b> – Správa železnic: ' + st(LV.st.sz) + ' (' + LV.trains.size + ' vlaků)</p><p><b>IDS JMK</b> (Brno a Jihomoravský kraj) – stream data.brno.cz: ' + st(LV.st.jmk === 'wait' ? '' : LV.st.jmk) + '</p><p><b>Worker mhdGO</b> – PID, regionální GTFS-RT (IDOL, JIKORD, ODIS, IDZK, DÚK, DPMD), ODIS: ' + (MG.cfg.WORKER ? st(LV.st.worker) : '<span style="color:var(--faint)">nenastaven</span>') + '</p><p><b>ODIS přímo</b> (proxy OpavaGO): ' + st(LV.st.odis) + '</p></div>' +
   '<div class="sec-t">Adresa workeru mhdGO</div><div class="field"><i class="fa-solid fa-link"></i><input id="lv-w" placeholder="https://…workers.dev/" value="' + MG.h(MG.cfg.WORKER) + '"></div><div class="status">Worker (soubor <b>worker/mhdgo-worker.js</b> v repozitáři) sjednocuje živé polohy dalších systémů.</div>' +
   '<div class="field"><i class="fa-solid fa-link"></i><input id="lv-o" placeholder="Proxy ODIS" value="' + MG.h(MG.cfg.ODIS) + '"></div><div style="height:8px"></div><button class="btn" id="lv-save"><i class="fa-solid fa-floppy-disk"></i>Uložit</button>');
  $('lv-tg').onclick = () => { LV.toggle(!LV.on); U.liveSettings(); };
  $('lv-save').onclick = () => { const c = MG.store.get('config', {}) || {}; c.worker = $('lv-w').value.trim(); c.odis = $('lv-o').value.trim(); MG.store.set('config', c); MG.cfg.WORKER = c.worker; MG.cfg.ODIS = c.odis; MG.toast('Uloženo'); LV.toggle(true); };
 };
 /* ---------- nastavení ---------- */
 U.settings = () => {
  const c = MG.store.get('config', {}) || {};
  misc({icon: 'fa-solid fa-gear', eb: 'mhd<b>GO</b>', title: 'Nastavení', sub: 'Mapové podklady, data a živé polohy'},
   '<div class="sec-t">Mapbox token (3D mapa a podklady Mapbox)</div><div class="field"><i class="fa-solid fa-key"></i><input id="st-mb" placeholder="pk.…" value="' + MG.h(c.mapbox || '') + '" autocomplete="off"></div>' +
   '<div class="status">' + (MG.cfg.MAPBOX ? 'Token je nastaven.' : 'Bez tokenu se použijí podklady CARTO/OpenStreetMap a 3D mapa není dostupná.') + ' Veřejný token (pk.) získáš zdarma na mapbox.com; uloží se jen v tomto prohlížeči.</div>' +
   '<div class="sec-t">Zdroj dat jízdních řádů (volitelné)</div><div class="field"><i class="fa-solid fa-database"></i><input id="st-data" placeholder="https://…/data/" value="' + MG.h(c.data || '') + '"></div><div class="status">Výchozí: repozitář prerekhu-cloud/mhd-app na GitHubu. Teď: ' + MG.h(MG._goodBase || MG.cfg.DATA[0]) + '</div>' +
   '<div style="height:6px"></div><button class="btn" id="st-save"><i class="fa-solid fa-floppy-disk"></i>Uložit a znovu načíst</button><div style="height:8px"></div><button class="btn sec" id="st-live"><i class="fa-solid fa-tower-broadcast"></i>Živé polohy a worker</button>', true);
  $('st-save').onclick = () => { const c2 = MG.store.get('config', {}) || {}; c2.mapbox = $('st-mb').value.trim(); c2.data = $('st-data').value.trim(); MG.store.set('config', c2); location.reload(); };
  $('st-live').onclick = () => U.liveSettings();
 };
 /* ---------- modální okno ---------- */
 U.modal = (html) => { let m = $('modal'); if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); m.addEventListener('pointerdown', e => { if (e.target === m) U.closeModal(); }); } m.innerHTML = '<div class="md">' + html + '</div>'; m.hidden = false; MG.qsa('[data-mclose]', m).forEach(b => b.onclick = U.closeModal); return m; };
 U.closeModal = () => { const m = $('modal'); if (m) m.hidden = true; };
 /* ---------- moje místa (jako fav41) ---------- */
 U.favs = () => {
  const F = MG.store.get('favs', []) || [];
  const m = U.modal('<div class="md-h"><div class="sh-ic"><i class="fa-solid fa-star"></i></div><div class="sh-tt"><div class="sh-eb brand-eb">mhd<b>GO</b></div><div class="sh-title">Moje místa</div></div><button class="xbtn" data-mclose><i class="fa-solid fa-xmark"></i></button></div>' +
   (F.length ? F.map((f, i) => '<div class="list-item" data-i="' + i + '"><i class="fa-solid ' + (f.icon || 'fa-star') + '" style="color:var(--acc);width:18px;text-align:center"></i><div class="li-tx"><b>' + MG.h(f.label) + '</b><small>' + MG.h(f.name) + '</small></div><button class="xbtn" data-dep="' + i + '" title="Odjezdy"><i class="fa-regular fa-clock"></i></button><button class="xbtn" data-del="' + i + '" title="Smazat"><i class="fa-solid fa-trash"></i></button></div>').join('') :
    '<div class="md-e"><i class="fa-regular fa-star"></i>Uložte si místa, kam často jezdíte – domov, práci, školu… Spojení a odjezdy pak máte na jeden klik.</div>') +
   '<div class="md-f"><button class="btn sm" id="fav-new"><i class="fa-solid fa-plus"></i>Přidat místo</button></div>');
  MG.qsa('[data-del]', m).forEach(b => b.onclick = (e) => { e.stopPropagation(); F.splice(+b.dataset.del, 1); MG.store.set('favs', F); U.favs(); });
  MG.qsa('[data-dep]', m).forEach(b => b.onclick = (e) => { e.stopPropagation(); U.closeModal(); const f = F[+b.dataset.dep]; if (f.st != null) MG.dep.show(f.st, D.okresAt(f.lat, f.lon)); else MG.dep.nearestTo(f); });
  MG.qsa('.list-item[data-i]', m).forEach(r => r.onclick = () => { U.closeModal(); const f = F[+r.dataset.i]; MG.search.routeTo({name: f.name, lat: f.lat, lon: f.lon, st: f.st}); });
  $('fav-new').onclick = () => { U.closeModal(); MG.search.addFavFlow(''); };
 };
 /* ---------- návod (jako help41) ---------- */
 U.help = () => {
  const IT = [
   ['fa-solid fa-map', 'Mapa 2D, Model 3D a Jízda 3D', 'Vpravo nahoře přepínáš mezi plochou mapou (2D) a 3D modelem města s vozidly; jízdu vozidlem spustíš tlačítkem přímo na 3D mapě. Ve 2D mapě měníš podklad (základní, světlá/tmavá, letecká). Dole vlevo jsou hodiny, měřítko, směrovka severu (ve 3D klikem natočí mapu na sever), legenda a živé polohy. Tlačítko s terčem vycentruje mapu na tvůj okres, ve 3D na centrum tvé obce; tlačítko se zeměkoulí ukáže celou ČR.', '<div class="row"><button class="chip" data-h="3d">▶ Otevřít 3D model</button><button class="chip" data-h="2d">▶ Zpět na 2D</button></div>'],
   ['fa-solid fa-route', 'Trasy na mapě', 'Mapa ukazuje celou republiku najednou. Trasu vidíš u vozidla, na které klepneš (od jeho polohy do cíle), a u spojení z hledání – trasa „proudí“ ve směru jízdy a pěší úseky vedou po chodnících.'],
   ['fa-solid fa-wand-magic-sparkles', 'Rádce a počasí', 'Rádce (AI) odpoví na otázky typu „Jak se dostanu domů?“ nebo „Stihnu přestup?“ podle stejných jízdních řádů a živých dat. Počasí ukazuje stav teď, radu na cestu, 24 hodin a 7 dní; ve 3D se obloha a denní doba řídí skutečností.'],
   ['fa-solid fa-magnifying-glass', 'Hledání zastávek a spojení', 'Najdi zastávku nebo adresu kdekoli v ČR. V záložce Spojení zadej odkud a kam – mhdGO najde spojení s přestupy, vlaky i pěšími úseky. Šipkami « » u jízdy ji posuneš na předchozí nebo další spoj. U jízdy můžeš nastavit budík na výstup nebo navigaci pěšky k nástupu.'],
   ['fa-regular fa-clock', 'Odjezdy ze zastávek', 'Odjezdy z libovolné zastávky s odpočtem a živým zpožděním. Lze zvolit jiný čas a den a filtrovat linky. Klepnutím na odjezd uvidíš další zastávky spoje.'],
   ['fa-solid fa-star', 'Moje místa', 'Ulož si Domů, Práci nebo jiná místa. Z lišty Moje místa pak jedním klepnutím vyhledáš spojení nebo odjezdy.'],
   ['fa-solid fa-tower-broadcast', 'Živé polohy a zpoždění', 'Zelená fajfka = vozidlo jede včas podle živých dat, oranžová/červená = zpoždění v minutách, bez odznaku = poloha podle jízdního řádu. Živě: vlaky celé ČR (Správa železnic), Brno a JMK (IDS JMK), Praha a Středočeský kraj (PID), Liberecký, Jihočeský, Zlínský, Moravskoslezský a Ústecký kraj (Oběhy), Královéhradecký a Pardubický kraj (IREDO) a MHD Hradec Králové. Kde zdroj neudává zpoždění, mhdGO ho odhadne z polohy (~). Ikona vysílačky zapíná a vypíná živá data.'],
   ['fa-solid fa-bell', 'Budík a pěší navigace', 'V bublině vozidla zvol Budík a klepni na zastávku, kde vystupuješ – mhdGO tě upozorní zvukem, vibrací a oznámením. V okně zastávky spustíš pěší navigaci.'],
   ['fa-solid fa-book-open', 'Bedekr', 'Památky a zajímavá místa celé ČR po krajích a okresech s fotografiemi a popisem, včetně cesty k nim.'],
   ['fa-solid fa-triangle-exclamation', 'Mimořádnosti a výluky', 'Aktuální výluky a mimořádnosti (IDS JMK, PID) se ukazují u linek, v odjezdech a na mapě.']
  ];
  const el = misc({icon: 'fa-solid fa-circle-question', eb: 'Návod', title: 'Jak používat mhd<b style="color:var(--acc);font-style:italic">GO</b>'},
   '<div class="hp-links"><button data-hl="info"><i class="fa-solid fa-circle-info"></i>O aplikaci</button><button data-hl="fav"><i class="fa-solid fa-star"></i>Moje místa</button><button data-hl="alerts"><i class="fa-solid fa-triangle-exclamation"></i>Mimořádnosti</button><button data-hl="walk"><i class="fa-solid fa-person-walking"></i>K zastávce</button><button data-hl="set"><i class="fa-solid fa-gear"></i>Nastavení</button><button data-hl="lite"><i class="fa-solid fa-list"></i>Bez mapy + AI rádce</button>' + (MG.pwa.can() ? '<button data-hl="install"><i class="fa-solid fa-mobile-screen"></i>Na plochu</button>' : '') + '</div>' +
   IT.map((x, i) => '<div class="hp-it' + (i === 0 ? ' open' : '') + '"><div class="hp-h"><span class="hp-i"><i class="' + x[0] + '"></i></span><span>' + x[1] + '</span><i class="fa-solid fa-chevron-down chev"></i></div><div class="hp-b">' + x[2] + (x[3] || '') + '</div></div>').join(''), true);
  const ic = el.querySelector('.sh-ic'); if (ic) { ic.innerHTML = MG.qs('#hdr .brand-ic').innerHTML; ic.style.background = 'none'; ic.style.boxShadow = 'none'; ic.style.padding = '0'; }
  MG.qsa('.hp-h', el).forEach(h => h.onclick = () => { const it = h.parentNode, o = it.classList.contains('open'); MG.qsa('.hp-it', el).forEach(x => x.classList.remove('open')); if (!o) it.classList.add('open'); });
  MG.qsa('[data-h]', el).forEach(b => b.onclick = () => { U.close('sh-misc'); if (b.dataset.h === '3d') MG.m3d.open({}); else MG.m3d.close(); });
  MG.qsa('[data-hl]', el).forEach(b => b.onclick = () => { const k = b.dataset.hl; if (k === 'info') return U.info(); if (k === 'fav') return U.favs(); if (k === 'alerts') return MG.alerts.show(); if (k === 'walk') return MG.dep.nearestWalk(); if (k === 'set') return U.settings(); if (k === 'install') return MG.pwa.install(); if (k === 'lite') location.href = 'mhdgo-lite.html'; });
 };
 /* ---------- o aplikaci ---------- */
 U.info = () => {
  const c = D.core || {stats: {}};
  misc({icon: 'fa-solid fa-circle-info', eb: 'mhd<b>GO</b> ' + MG.cfg.VERSION, title: 'O aplikaci', sub: 'Veřejná doprava celé České republiky'}, '<div class="info-p">' +
   '<p><b>mhdGO</b> je nástupce aplikace <b>OpavaGO</b> – stejný vzhled a ovládání, ale pro celou republiku: městská doprava všech měst, regionální a meziregionální autobusy a všechny vlaky.</p>' +
   '<div class="kv"><div><b>' + (c.stats.lines || 0).toLocaleString('cs') + '</b><small>linek</small></div><div><b>' + (c.stats.stations || 0).toLocaleString('cs') + '</b><small>zastávek</small></div><div><b>' + (c.stats.platforms || 0).toLocaleString('cs') + '</b><small>nástupišť</small></div></div>' +
   '<div class="kv"><div><b>' + (c.stats.trips || 0).toLocaleString('cs') + '</b><small>spojů</small></div><div><b>1</b><small>celá ČR</small></div><div><b>14</b><small>krajů</small></div></div>' +
   '<h3>Data</h3><ul><li>Jízdní řády: <b>CIS JŘ</b> (Celostátní informační systém o jízdních řádech, GTFS projektu Spojenka MFF UK), platnost od ' + MG.h(c.d0 || '') + ' na ' + (c.nd || 0) + ' dní. Data sestavena ' + MG.h(c.built || '') + '.</li>' +
   '<li>Trasy linek: <b>PID</b> (data.pid.cz), ostatní dopočítány po silnicích a kolejích z <b>OpenStreetMap</b> (Valhalla).</li>' +
   '<li>Nástupiště: CIS JŘ, PID, IDS JMK, IDOL, ODIS a zastávkové sloupky z OpenStreetMap.</li>' +
   '<li>Živé polohy: <b>Správa železnic</b> (vlaky celé ČR); <b>IDS JMK</b> – otevřený stream poloh data.brno.cz (KORDIS JMK, CC BY 4.0); přes worker mhdGO <b>PID</b> (Praha a Středočeský kraj), celostátní GTFS-RT <b>Oběhy</b> (IDOL, JIKORD, ODIS, IDZK, DÚK, DPMD Děčín, Arriva Express), <b>ODIS</b>, <b>IREDO</b> (Královéhradecký a Pardubický kraj) a <b>MHD Hradec Králové</b>. Kde zdroj neudává zpoždění, mhdGO ho odhadne z polohy vozidla proti jízdnímu řádu. Bez živých dat zatím: MHD Plzeň, Olomouc, Hradec Králové, Pardubice, Zlín, Liberec, Jihlava, Karlovy Vary a autobusy v krajích Plzeňském, Karlovarském, Královéhradeckém, Pardubickém, Vysočině a Olomouckém – tam vozidla jedou podle jízdního řádu.</li>' +
   '<li>Mimořádnosti a výluky: <b>IDS JMK</b> (data.brno.cz), přes worker <b>PID</b>. Pěší trasy: Valhalla (OpenStreetMap).</li>' +
   '<li>Bedekr: <b>Wikidata</b>, <b>Wikipedie</b> a fotografie z <b>Wikimedia Commons</b> (autoři uvedeni u fotografií na Commons).</li>' +
   '<li>Mapy: © Mapbox © OpenStreetMap, počasí Open-Meteo, geokódování Photon (komoot).</li>' +
   '<li>3D modely (ilustrační): trolejbusy Škoda 26Tr/32Tr/36Tr, autobusy SOR, Iveco, Irisbus, Z-Group a vlaky RegioNova, RegioShark a řada 810 z OpavaGO; <b>Tatra T3</b> – conflig, CC BY-NC 4.0; <b>ČD 810</b> – voxellation, CC BY 4.0 (Sketchfab). Ostatní vozidla jsou zjednodušené modely mhdGO.</li></ul>' +
   '<h3>Upozornění</h3><p><small>Polohy vozidel bez živých dat jsou vypočteny z jízdního řádu a nemusí odpovídat skutečnosti. Pro závazné informace použij oficiální jízdní řády dopravců a IDOS. Vzhled 3D modelů vozidel je orientační.</small></p></div>', true);
 };
})();
