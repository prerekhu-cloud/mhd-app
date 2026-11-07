/* ===== mhdGO – rozhraní: listy, záložky, nabídky ===== */
(function(){
 const D = MG.D, $ = MG.$;
 const U = MG.ui = {cur: null};
 const SHEETS = ['sh-search', 'sh-dep', 'sh-net', 'sh-more', 'sh-okres', 'sh-misc'];
 U.head = (o) => '<div class="sh-grab"></div><div class="sh-head">' + (o.icon ? '<div class="sh-ic"><i class="' + o.icon + '"></i></div>' : '') + '<div class="sh-tt">' + (o.eb ? '<div class="sh-eb">' + o.eb + '</div>' : '') + '<div class="sh-title">' + o.title + '</div>' + (o.sub ? '<div class="sh-sub" id="' + (o.subId || '') + '">' + o.sub + '</div>' : '') + '</div>' + (o.extra || '') + '<button class="xbtn" data-close title="Zavřít"><i class="fa-solid fa-xmark"></i></button></div>';
 const TAB_OF = {'sh-search': 'search', 'sh-dep': 'dep', 'sh-net': 'net', 'sh-more': 'more'};
 const syncBtns = () => {
  MG.qsa('#tabs button').forEach(b => b.classList.toggle('on', ('sh-' + b.dataset.t) === U.cur));
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
  MG.qsa('[data-close]', el).forEach(b => b.onclick = () => U.close(el.id));
  const grab = MG.qs('.sh-grab', el); if (!grab || grab._b) return; grab._b = 1;
  let y0 = null, dy = 0;
  const down = e => { y0 = e.clientY; dy = 0; el.style.transition = 'none'; grab.setPointerCapture(e.pointerId); };
  const move = e => { if (y0 == null) return; dy = e.clientY - y0; if (dy > 0) el.style.transform = 'translateY(' + dy + 'px)'; };
  const up = () => { if (y0 == null) return; el.style.transition = ''; el.style.transform = ''; if (dy > 90) U.close(el.id); else if (dy < -40) el.classList.add('tall'); else if (Math.abs(dy) < 6) el.classList.toggle('tall'); y0 = null; };
  grab.addEventListener('pointerdown', down); grab.addEventListener('pointermove', move); grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
 }
 /* ---------- nápovědy nad tlačítky (jako OpavaGO) ---------- */
 const TIPS = {search: 'Hledat zastávku nebo spojení', dep: 'Odjezdy ze zastávky', net: 'Dopravní síť – linky a trasy', ride: 'Jízda vozidlem ve 3D', more: 'Další funkce a nastavení',
  'legend-btn': 'Legenda – co znamenají barvy a značky', 'live-btn': 'Živé polohy a zpoždění vozidel', compass: 'Sever nahoru', 'btn-cz': 'Celá Česká republika', 'btn-center': 'Vycentrovat na tvůj okres', clock: 'Čas', scale: 'Měřítko mapy'};
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
  if (t === 'info') return U.info();
  if (t === 'dark') { MG.app.setDark(!document.body.classList.contains('dark')); return; }
  if (t === 'regio') return MG.app.toggleRegio();
  if (t === 'vlak') return MG.app.toggleTrains();
  if (U.cur === id) { U.close(id); return; }
  if (t === 'search') MG.search.render();
  if (t === 'dep') MG.dep.render();
  if (t === 'net') MG.net.render();
  if (t === 'more') renderMore();
  U.open(id, {tall: t === 'net' || t === 'dep'});
 };
 U.initTabs = () => {
  MG.qsa('#tabs button').forEach(b => b.onclick = () => U.act(b.dataset.t, b));
  MG.qsa('.hdr-btns .rb').forEach(b => b.onclick = () => U.act(b.dataset.a, b));
  $('okres-chip').onclick = () => { renderOkres(); U.open('sh-okres', {tall: true}); };
  $('brand').onclick = () => U.info(); $('brand-tx').onclick = () => U.info();
  $('legend-btn').onclick = (e) => { U.tip(e.currentTarget, TIPS['legend-btn']); U.legend(); };
  $('live-btn').onclick = (e) => { MG.live.toggle(!MG.live.on); U.tip(e.currentTarget, MG.live.on ? 'Živé polohy zapnuty' : 'Živé polohy vypnuty – vozidla podle jízdního řádu'); };
  $('compass').onclick = (e) => { if (MG.mode3d) MG.m3d.north(); U.tip(e.currentTarget, TIPS.compass); };
  $('btn-cz').onclick = (e) => { U.tip(e.currentTarget, TIPS['btn-cz']); MG.app.showCZ(); };
  $('btn-center').onclick = (e) => { U.tip(e.currentTarget, MG.mode3d ? 'Centrum tvé obce' : TIPS['btn-center']); MG.app.center(); };
  $('m-2d').onclick = () => MG.m3d.close();
  $('m-3d').onclick = () => MG.m3d.open({});
  $('m-ride').onclick = () => { U.closeSheets(); MG.m3d.open({ride: true}); };
  U.syncToggles();
 };
 U.syncToggles = () => {
  const r = MG.qs('.rb[data-a=regio]'), v = MG.qs('.rb[data-a=vlak]');
  if (r) r.classList.toggle('on', !MG.app.hideRegio); if (v) v.classList.toggle('on', !MG.app.hideTrains);
  const dk = MG.qs('.rb[data-a=dark]'); if (dk) { const on = document.body.classList.contains('dark'); dk.querySelector('i').className = on ? 'fa-solid fa-sun' : 'fa-solid fa-moon'; dk.querySelector('em').textContent = on ? 'Světlý' : 'Tmavý'; }
 };
 /* ---------- výběr okresu ---------- */
 let okKraj = null;
 function renderOkres() {
  const cur = MG.app.cur; if (okKraj == null) okKraj = cur >= 0 ? D.okresy[cur].kraj : 0;
  const el = $('sh-okres');
  el.innerHTML = U.head({icon: 'fa-solid fa-map-location-dot', eb: 'mhd<b>GO</b> · dopravní síť', title: 'Vyber okres', sub: 'Síť linek, odjezdy a vozidla se načtou pro zvolený okres'}) +
   '<div class="sh-body"><div class="row" style="margin:0 2px 10px"><button class="btn sec sm" id="ok-me"><i class="fa-solid fa-location-crosshairs"></i>Můj okres</button><button class="btn sec sm" id="ok-cz"><i class="fa-solid fa-earth-europe"></i>Celá ČR</button><button class="btn sec sm" id="ok-rnd"><i class="fa-solid fa-shuffle"></i>Náhodný</button></div>' +
   '<div class="kraj-tabs">' + D.kraje.map((k, i) => '<button class="chip' + (i === okKraj ? ' on' : '') + '" data-k="' + i + '">' + MG.h(k.short) + '</button>').join('') + '</div>' +
   '<div class="ok-grid">' + D.okresy.map((o, i) => o.kraj !== okKraj ? '' : '<button data-o="' + i + '" class="' + (i === cur ? 'on' : '') + '"><i class="fa-solid ' + (D.loaded.has(i) ? 'fa-circle-check' : 'fa-location-dot') + '"></i><span>' + MG.h(o.name) + '<small>' + ((MG.D.core.sizes[i] || 0) / 1e6 * .22).toFixed(1).replace('.', ',') + ' MB · ' + MG.h(o.seat) + '</small></span></button>').join('') + '</div></div>';
  U.open('sh-okres', {tall: true});
  MG.qsa('.kraj-tabs .chip', el).forEach(b => b.onclick = () => { okKraj = +b.dataset.k; renderOkres(); });
  MG.qsa('.ok-grid button', el).forEach(b => b.onclick = () => { U.close('sh-okres'); MG.app.selectOkres(+b.dataset.o, {fly: true}); });
  $('ok-me').onclick = () => { U.close('sh-okres'); MG.app.locate(true); };
  $('ok-cz').onclick = () => { U.close('sh-okres'); MG.app.showCZ(); };
  $('ok-rnd').onclick = () => { U.close('sh-okres'); MG.app.selectOkres(Math.floor(Math.random() * D.okresy.length), {fly: true}); };
 }
 U.renderOkres = renderOkres;
 /* ---------- Více ---------- */
 function renderMore() {
  const el = $('sh-more'), dark = document.body.classList.contains('dark');
  const items = [
   ['fav', 'fa-solid fa-star', 'Moje místa'], ['bedekr', 'fa-solid fa-landmark', 'Bedekr'], ['help', 'fa-solid fa-circle-question', 'Návod'],
   ['dark', dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon', dark ? 'Světlý režim' : 'Tmavý režim'], ['regio', 'fa-solid fa-bus-simple', 'Regio linky', 0, !MG.app.hideRegio], ['trains', 'fa-solid fa-train', 'Vlaky', 0, !MG.app.hideTrains],
   ['live', 'fa-solid fa-tower-broadcast', 'Živé polohy', 0, MG.live.on], ['live3d', 'fa-solid fa-cube', 'ŽIVĚ ve 3D', 1], ['alerts', 'fa-solid fa-triangle-exclamation', 'Mimořádnosti'],
   ['okres', 'fa-solid fa-map-location-dot', 'Okres'], ['cz', 'fa-solid fa-earth-europe', 'Celá ČR'], ['walk', 'fa-solid fa-person-walking', 'K zastávce'],
   ['color', 'fa-solid fa-palette', 'Barevná síť', 0, MG.map.colorNet], ['install', 'fa-solid fa-mobile-screen', 'Na plochu'], ['set', 'fa-solid fa-gear', 'Nastavení'],
   ['info', 'fa-solid fa-circle-info', 'O aplikaci']
  ];
  el.innerHTML = U.head({icon: 'fa-solid fa-ellipsis', eb: 'mhd<b>GO</b>', title: 'Další funkce', sub: 'Místa, bedekr, zobrazení a nastavení'}) +
   '<div class="sh-body"><div class="more-grid">' + items.map(([k, ic, t, d3, on]) => '<button data-m="' + k + '" class="' + (on ? 'on' : '') + '"><i class="' + ic + '"></i>' + t + (d3 ? '<sup class="b3d">3D</sup>' : '') + '</button>').join('') + '</div></div>';
  MG.qsa('.more-grid button', el).forEach(b => b.onclick = () => {
   const k = b.dataset.m;
   if (k === 'fav') return U.favs();
   if (k === 'bedekr') { U.close('sh-more'); return MG.bedekr.open(); }
   if (k === 'help') return U.help();
   if (k === 'dark') { MG.app.setDark(!document.body.classList.contains('dark')); return renderMore(); }
   if (k === 'regio') { MG.app.toggleRegio(); return renderMore(); }
   if (k === 'trains') { MG.app.toggleTrains(); return renderMore(); }
   if (k === 'live') return U.liveSettings();
   if (k === 'live3d') { U.close('sh-more'); return MG.m3d.open({}); }
   if (k === 'okres') return renderOkres();
   if (k === 'color') { MG.map.colorNet = !MG.map.colorNet; MG.store.set('colornet', MG.map.colorNet); MG.map.drawNet(); MG.toast(MG.map.colorNet ? 'Síť v barvách linek' : 'Síť v barvě mhdGO'); return renderMore(); }
   if (k === 'info') return U.info();
   if (k === 'set') return U.settings();
   if (k === 'alerts') return MG.alerts.show();
   if (k === 'install') return MG.pwa.install();
   if (k === 'walk') { U.close('sh-more'); return MG.dep.nearestWalk(); }
   if (k === 'cz') { U.close('sh-more'); return MG.app.showCZ(); }
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
   '<div class="lg-n">Regionální linky a vlaky zapneš v nabídce Více (na počítači tlačítky Regio a Vlak). Každé město má vlastní barvy linek, každý vlak vlastní barvu. Měřítko a čas jsou vlevo dole, sever ukazuje směrovka. Podklad © OpenStreetMap, Mapbox.</div>';
  el.hidden = false; btn.classList.add('on');
  el.querySelector('button').onclick = () => { el.hidden = true; btn.classList.remove('on'); };
 };
 /* ---------- živá data ---------- */
 U.liveSettings = () => {
  const LV = MG.live, st = x => x === 'ok' ? '<b style="color:var(--ok)">funguje</b>' : x === 'err' ? '<b style="color:var(--bad)">nedostupné</b>' : '<span style="color:var(--faint)">neaktivní</span>';
  const el = misc({icon: 'fa-solid fa-tower-broadcast', eb: 'Živé polohy', title: 'Polohy a zpoždění', sub: 'Vozidla bez živých dat jezdí podle jízdního řádu'},
   '<div class="list-item" id="lv-tg"><i class="fa-solid fa-power-off" style="color:var(--acc)"></i><div class="li-tx"><b>Živé polohy ' + (LV.on ? 'zapnuty' : 'vypnuty') + '</b><small>Klepnutím přepneš</small></div></div>' +
   '<div class="sec-t">Zdroje</div><div class="info-p"><p><b>Vlaky celé ČR</b> – Správa železnic: ' + st(LV.st.sz) + ' (' + LV.trains.size + ' vlaků)</p><p><b>ODIS</b> (Moravskoslezský kraj – MHD i regionální autobusy): ' + st(LV.st.odis) + '</p><p><b>Vlastní worker mhdGO</b>: ' + (MG.cfg.WORKER ? st(LV.st.worker) : '<span style="color:var(--faint)">nenastaven</span>') + '</p></div>' +
   '<div class="sec-t">Adresa workeru mhdGO</div><div class="field"><i class="fa-solid fa-link"></i><input id="lv-w" placeholder="https://…workers.dev/" value="' + MG.h(MG.cfg.WORKER) + '"></div><div class="status">Worker (soubor <b>worker/mhdgo-worker.js</b> v repozitáři) sjednocuje živé polohy dalších dopravců – PID, IDS JMK a další.</div>' +
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
 /* ---------- moje místa ---------- */
 U.favs = () => {
  const F = MG.store.get('favs', []) || [];
  const el = misc({icon: 'fa-solid fa-star', eb: 'Oblíbené', title: 'Moje místa', sub: 'Domů, práce a další – pro rychlé hledání spojení'},
   (F.length ? F.map((f, i) => '<div class="list-item" data-i="' + i + '"><i class="fa-solid ' + (f.icon || 'fa-star') + '" style="color:var(--acc)"></i><div class="li-tx"><b>' + MG.h(f.label) + '</b><small>' + MG.h(f.name) + '</small></div><button class="xbtn" data-del="' + i + '"><i class="fa-solid fa-trash"></i></button></div>').join('') : '<div class="empty"><i class="fa-regular fa-star"></i>Zatím žádná místa. Uložíš je v hledání spojení hvězdičkou.</div>'));
  MG.qsa('[data-del]', el).forEach(b => b.onclick = (e) => { e.stopPropagation(); F.splice(+b.dataset.del, 1); MG.store.set('favs', F); U.favs(); });
  MG.qsa('.list-item[data-i]', el).forEach(r => r.onclick = () => { const f = F[+r.dataset.i]; MG.search.routeTo({name: f.name, lat: f.lat, lon: f.lon}); });
 };
 /* ---------- návod ---------- */
 U.help = () => misc({icon: 'fa-solid fa-circle-question', eb: 'Návod', title: 'Jak mhdGO používat'}, '<div class="info-p">' +
  '<h3><i class="fa-solid fa-location-dot"></i> Okres</h3><p>Po spuštění se načte tvůj okres (podle polohy). Bez povolení polohy se vybere náhodný okres – jakmile polohu povolíš, mapa se přepne na tvůj okres. Okres změníš klepnutím na jeho název v horní liště. Při posunu mapy do jiného okresu se jeho síť načte sama.</p>' +
  '<h3><i class="fa-solid fa-bus"></i> Vozidla</h3><p>Klepni na vozidlo: uvidíš linku, směr, zpoždění, čtyři příští zastávky s časy a trasu do cílové zastávky. Zelená fajfka = živá poloha a jede včas, oranžová/červená = zpoždění v minutách, bez odznaku = poloha podle jízdního řádu.</p>' +
  '<h3><i class="fa-solid fa-route"></i> Síť</h3><p>Seznam linek okresu. Po rozbalení se linka ukáže na mapě se zastávkami, tlačítko <b>Otočit směr</b> přepne směr a odkaz vede na oficiální jízdní řád.</p>' +
  '<h3><i class="fa-regular fa-clock"></i> Odjezdy</h3><p>Odjezdová tabule z libovolné zastávky v ČR, i na jiný den a čas, s filtrem linek a nástupišti.</p>' +
  '<h3><i class="fa-solid fa-magnifying-glass"></i> Hledat</h3><p>Zastávky v celé ČR, adresy a místa a vyhledání spojení včetně přestupů a vlaků mezi okresy.</p>' +
  '<h3><i class="fa-solid fa-cube"></i> 3D</h3><p>Model 3D se otevře v centru obce, kde jsi. Vozidla jsou 3D modely v barvách dopravců; v režimu Jízda 3D se svezeš vybraným spojem.</p>' +
  '<h3><i class="fa-solid fa-earth-europe"></i> Celá ČR a Vycentrovat</h3><p><b>Celá ČR</b> ukáže celou republiku s hranicemi okresů (klepnutím na okres ho otevřeš). <b>Vycentrovat</b> vrátí mapu na tvůj okres (bez polohy na celou ČR), ve 3D na centrum tvé obce.</p></div>', true);
 /* ---------- o aplikaci ---------- */
 U.info = () => {
  const c = D.core || {stats: {}};
  misc({icon: 'fa-solid fa-circle-info', eb: 'mhd<b>GO</b> ' + MG.cfg.VERSION, title: 'O aplikaci', sub: 'Veřejná doprava celé České republiky'}, '<div class="info-p">' +
   '<p><b>mhdGO</b> je nástupce aplikace <b>OpavaGO</b> – stejný vzhled a ovládání, ale pro celou republiku: městská doprava všech měst, regionální a meziregionální autobusy a všechny vlaky.</p>' +
   '<div class="kv"><div><b>' + (c.stats.lines || 0).toLocaleString('cs') + '</b><small>linek</small></div><div><b>' + (c.stats.stations || 0).toLocaleString('cs') + '</b><small>zastávek</small></div><div><b>' + (c.stats.platforms || 0).toLocaleString('cs') + '</b><small>nástupišť</small></div></div>' +
   '<div class="kv"><div><b>' + (c.stats.trips || 0).toLocaleString('cs') + '</b><small>spojů</small></div><div><b>77</b><small>okresů</small></div><div><b>14</b><small>krajů</small></div></div>' +
   '<h3>Data</h3><ul><li>Jízdní řády: <b>CIS JŘ</b> (Celostátní informační systém o jízdních řádech, GTFS projektu Spojenka MFF UK), platnost od ' + MG.h(c.d0 || '') + ' na ' + (c.nd || 0) + ' dní. Data sestavena ' + MG.h(c.built || '') + '.</li>' +
   '<li>Trasy linek: <b>PID</b> (data.pid.cz), ostatní dopočítány po silnicích a kolejích z <b>OpenStreetMap</b> (Valhalla).</li>' +
   '<li>Nástupiště: CIS JŘ, PID, IDS JMK, IDOL, ODIS a zastávkové sloupky z OpenStreetMap.</li>' +
   '<li>Živé polohy: <b>Správa železnic</b> (vlaky celé ČR), <b>ODIS</b> (Moravskoslezský kraj), přes worker mhdGO také <b>PID</b> (Praha a Středočeský kraj).</li>' +
   '<li>Mimořádnosti a výluky: <b>IDS JMK</b> (data.brno.cz), přes worker <b>PID</b>. Pěší trasy: Valhalla (OpenStreetMap).</li>' +
   '<li>Bedekr: <b>Wikidata</b>, <b>Wikipedie</b> a fotografie z <b>Wikimedia Commons</b> (autoři uvedeni u fotografií na Commons).</li>' +
   '<li>Mapy: © Mapbox © OpenStreetMap, počasí Open-Meteo, geokódování Photon (komoot).</li></ul>' +
   '<h3>Upozornění</h3><p><small>Polohy vozidel bez živých dat jsou vypočteny z jízdního řádu a nemusí odpovídat skutečnosti. Pro závazné informace použij oficiální jízdní řády dopravců a IDOS. Vzhled 3D modelů vozidel je orientační.</small></p></div>', true);
 };
})();
