/* ===== mhdGO bez mapy – AI rádce (Claude) =====
 Volá Claude Messages API oficiálním Anthropic SDK (@anthropic-ai/sdk, ESM z jsDelivr) přímo z prohlížeče.
 Přístup: a) přes worker mhdGO – klíč Anthropic je jen na serveru, aplikace zná jen přístupový kód,
          b) vlastní API klíč uložený pouze v tomto zařízení (localStorage).
 Nástroje běží v prohlížeči nad stejnými daty jako aplikace: odjezdy (se živým zpožděním), spojení,
 zastávky v okolí, počasí, jízdné, Moje místa a pěší trasa. Ceny může rádce dohledat i na oficiálních webech. */
(function(){
 const A = MG.core, D = MG.D, $ = MG.$, H = MG.h;
 const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.2.0/+esm';
 const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5', 'nejchytřejší'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5', 'rychlejší a levnější'], ['claude-haiku-5-5', 'Claude Haiku 5.5', 'nejrychlejší a nejlevnější']];
 const WEB_DOMAINS = ['pid.cz', 'idsjmk.cz', 'dpmb.cz', 'odis.cz', 'kodis.cz', 'dpo.cz', 'iidol.cz', 'dpmlj.cz', 'dopravauk.cz', 'dpmul.cz', 'iredo.info', 'dpmhk.cz', 'dpmp.cz', 'idsok.cz', 'dpmo.cz', 'idzk.cz', 'dszo.cz', 'idpk.cz', 'pmdp.cz', 'dpmcb.cz', 'dpmj.cz', 'dpkv.cz', 'cd.cz', 'regiojet.cz', 'leoexpress.com', 'arriva.cz', 'idos.cz', 'spravazeleznic.cz', 'md.gov.cz'];
 const AI = MG.ai = {msgs: [], log: [], busy: false, stream: null, noWeb: false, status: null,
  cfg: Object.assign({mode: '', key: '', code: '', model: 'claude-opus-5-5', web: true}, MG.store.get('ai', {}) || {})};
 const saveCfg = () => MG.store.set('ai', AI.cfg);
 try { const s = MG.store.get('ai-chat', null); if (s && Array.isArray(s.msgs) && Array.isArray(s.log)) { AI.msgs = s.msgs; AI.log = s.log; } } catch (_) {}
 const saveChat = () => { try { const o = {msgs: AI.msgs, log: AI.log.map(x => ({r: x.r, t: x.t, err: x.err, src: x.src}))}; if (JSON.stringify(o).length < 300000) MG.store.set('ai-chat', o); else MG.store.set('ai-chat', null); } catch (_) {} };
 const workerBase = () => { const w = MG.cfg.WORKER || ''; return w ? w.replace(/\/?(\?.*)?$/, '/') : ''; };

 /* ---------- SDK a klient ---------- */
 let SDKP = null;
 const sdk = () => SDKP || (SDKP = import(SDK_URL).then(m => m.default).catch(e => { SDKP = null; throw e; }));
 AI.sdk = sdk;
 async function client() {
  const Anthropic = await sdk();
  if (AI.cfg.mode !== 'key') return new Anthropic({apiKey: AI.cfg.code || 'mhdgo-open', baseURL: workerBase() + 'ai', dangerouslyAllowBrowser: true, maxRetries: 1});
  return new Anthropic({apiKey: AI.cfg.key, dangerouslyAllowBrowser: true, maxRetries: 1});
 }
 /* připraveno: vlastní klíč, nebo worker (otevřený rádce bez kódu, případně s přístupovým kódem) */
 const ready = () => (AI.cfg.mode === 'key' && /^sk-ant-/.test(AI.cfg.key || '')) || (AI.cfg.mode !== 'key' && !!AI.status && AI.status.enabled && (AI.status.open || !!AI.cfg.code));
 async function workerStatus() {
  if (AI.status) return AI.status;
  try { const r = await fetch(workerBase() + 'ai/status', {cache: 'no-store'}); const j = await r.json(); AI.status = {enabled: !!j && j.enabled === true, open: !!j && j.open === true, model: j && j.model}; }
  catch (_) { AI.status = {enabled: false, open: false}; }
  return AI.status;
 }

 /* ---------- nástroje (spouští je prohlížeč) ---------- */
 const S = (props, req) => ({type: 'object', properties: props, required: req || [], additionalProperties: false});
 const TOOLS = [
  {name: 'plan_trip', description: 'Najde spojení veřejnou dopravou (MHD, autobusy, vlaky v celé ČR) podle jízdních řádů CIS JŘ, včetně živého zpoždění spojů, které už jedou, a ohrožených přestupů. Použij vždy, když se uživatel ptá, jak se někam dostane, kdy mu něco jede z A do B nebo kdy dorazí. Místo může být „moje poloha“, název z Mých míst (např. „Domů“), zastávka nebo adresa.',
   input_schema: S({from: {type: 'string', description: 'Odkud: „moje poloha“, Moje místo, zastávka nebo adresa'}, to: {type: 'string', description: 'Kam: Moje místo, zastávka nebo adresa'}, time: {type: 'string', description: 'Čas odjezdu HH:MM (Praha); bez něj teď'}, date: {type: 'string', description: 'Datum YYYY-MM-DD; bez něj dnes'}, count: {type: 'integer', description: 'Počet spojení 1–6, výchozí 3'}}, ['from', 'to'])},
  {name: 'get_departures', description: 'Odjezdy ze zastávky podle jízdního řádu se živým zpožděním vozidel na trase. Použij, když se uživatel ptá, co/kdy jede z konkrétní zastávky nebo z nejbližší zastávky.',
   input_schema: S({stop: {type: 'string', description: 'Název zastávky, Moje místo, nebo „nejbližší“ pro zastávku nejblíž uživateli'}, line: {type: 'string', description: 'Jen tato linka (číslo nebo označení vlaku), volitelné'}, time: {type: 'string', description: 'Od času HH:MM, volitelné'}, date: {type: 'string', description: 'YYYY-MM-DD, volitelné'}, limit: {type: 'integer', description: 'Počet odjezdů 1–20, výchozí 8'}}, ['stop'])},
  {name: 'nearby_stops', description: 'Zastávky v okolí místa (výchozí: poloha uživatele) se vzdáleností, dobou chůze a nejbližšími odjezdy. Použij při otázkách typu „kde je nejbližší zastávka“ nebo „co mi jede poblíž“.',
   input_schema: S({place: {type: 'string', description: 'Místo; bez něj poloha uživatele'}})},
  {name: 'walking_route', description: 'Pěší trasa (vzdálenost, čas a pokyny) k zastávce nebo místu. Použij, když se uživatel ptá, jak dojít na zastávku nebo jak daleko to je pěšky.',
   input_schema: S({to: {type: 'string', description: 'Cíl: zastávka, Moje místo nebo adresa'}, from: {type: 'string', description: 'Start; bez něj poloha uživatele'}}, ['to'])},
  {name: 'get_weather', description: 'Aktuální počasí, hodinová předpověď na 12 hodin a 3 dny a rada na cestu. Použij při otázkách na počasí, deštník, oblečení nebo jestli jít pěšky.',
   input_schema: S({place: {type: 'string', description: 'Místo; bez něj poloha uživatele nebo vybraná zastávka'}})},
  {name: 'get_ticket_info', description: 'Integrovaný dopravní systém pro místo, ověřené ceny jízdenek (jen kde jsou k dispozici), jak a kde koupit jízdenku a odkazy na oficiální ceník. Použij vždy před odpovědí na otázku o ceně nebo nákupu jízdenky.',
   input_schema: S({place: {type: 'string', description: 'Místo nebo město; bez něj poloha uživatele'}})},
  {name: 'list_favorites', description: 'Uživatelova Moje místa (Domů, Práce…) s adresami. Použij, když uživatel mluví o svém uloženém místě a není jasné, kde je.',
   input_schema: S({})}
 ];
 const STR = v => typeof v === 'string', INT = v => Number.isInteger(v);
 function validate(t, inp) {
  if (!inp || typeof inp !== 'object' || Array.isArray(inp)) return false;
  const sc = t.input_schema, pr = sc.properties || {};
  for (const r of sc.required || []) if (inp[r] == null || inp[r] === '') return false;
  for (const [k, v] of Object.entries(inp)) { const p = pr[k]; if (!p) return false; if (p.type === 'string' && !STR(v)) return false; if (p.type === 'integer' && !INT(v)) return false; }
  if (inp.time != null && !/^\d{1,2}:\d{2}$/.test(inp.time)) return false;
  if (inp.date != null && !/^\d{4}-\d{2}-\d{2}$/.test(inp.date)) return false;
  return true;
 }
 const ME_RE = /^(moje poloha|moje misto|tady|odsud|odtud|sem|zde|aktualni poloha|ja|me|my location|current location)$/;
 async function resolvePlace(q) {
  const s = String(q || '').trim(), f = MG.fold(s);
  if (!f || ME_RE.test(f)) { const p = await A.mePoint(); if (!p) throw Error('Poloha uživatele není dostupná (nepovolil ji). Zeptej se, odkud jede, nebo ať polohu povolí.'); return p; }
  const F = A.favs(), fv = F.find(x => MG.fold(x.label) === f) || F.find(x => f.length > 2 && MG.fold(x.label).startsWith(f));
  if (fv) return {kind: 'fav', name: fv.label, sub: fv.name, lat: fv.lat, lon: fv.lon, st: fv.st};
  const stops = await A.findStops(s, 3), st = stops[0];
  const words = f.split(' ').filter(w => w.length > 1);
  const good = st && (st.f === f || st.f.startsWith(f) || words.every(w => st.f.includes(w)));
  if (good) return {kind: 'stop', name: st.name, lat: st.lat, lon: st.lon, st: st.g, ok: st.ok};
  const ad = (await A.geocode(s, 1))[0];
  if (ad) return Object.assign(ad, {name: ad.name + (ad.sub ? ', ' + ad.sub : '')});
  if (st) return {kind: 'stop', name: st.name, lat: st.lat, lon: st.lon, st: st.g, ok: st.ok};
  throw Error('Místo „' + s + '“ jsem nenašel.');
 }
 async function resolveStop(q) {
  const f = MG.fold(q);
  if (!f || /^(nejblizsi|nejblizsi zastavka|nearest)$/.test(f) || ME_RE.test(f)) { const p = await A.mePoint(); if (!p) throw Error('Poloha uživatele není dostupná – zeptej se na název zastávky.'); const n = await A.nearestStops(p.lat, p.lon, 1, 3000); if (!n.length) throw Error('V okolí uživatele není zastávka.'); return {g: n[0][1].g, ok: n[0][1].ok, dist: n[0][0]}; }
  const pl = await resolvePlace(q);
  if (pl.st != null) return {g: pl.st, ok: pl.ok};
  const n = await A.nearestStops(pl.lat, pl.lon, 1, 1500); if (!n.length) throw Error('U místa „' + q + '“ není zastávka.'); return {g: n[0][1].g, ok: n[0][1].ok, dist: n[0][0], near: pl.name};
 }
 const hmToMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
 const kindCz = k => ({metro: 'metro', tram: 'tramvaj', trol: 'trolejbus', mhd: 'autobus MHD', regio: 'regionální autobus', mezi: 'dálkový autobus', vlak: 'vlak', lan: 'lanovka', lod: 'přívoz'})[k] || k;
 const lineName = (L_, p, j) => L_.k === 'vlak' ? D.trainLabel(L_, p.n && p.n[j]) : String(L_.n || '?');
 const liveOut = x => !x ? {live: false} : x.d == null ? {live: true, delay_min: null} : {live: true, delay_min: Math.round(x.d), delay_estimated: !!x.est};
 async function ensureStop(g, ok) { if (!D.st.has(g) && ok != null && ok >= 0) await D.loadOkres(ok).catch(() => {}); if (!D.st.has(g)) { const idx = await D.loadIdx(); const x = idx.find(s => s.g === g); if (x) await D.loadOkres(x.ok).catch(() => {}); } if (!D.st.has(g)) throw Error('Jízdní řády zastávky se nepodařilo načíst.'); }
 const RUN = {
  async plan_trip(i) {
   const from = await resolvePlace(i.from), to = await resolvePlace(i.to);
   const c = MG.pragueParts(MG.now()), ymd = i.date || c.ymd, t = i.time ? hmToMin(i.time) : Math.ceil(MG.nowMin());
   const r = await A.planTrip(from, to, ymd, t, MG.clamp(i.count || 3, 1, 6));
   if (r.err) return {error: r.err};
   const nm = si => D.stName(r.n.stArr[si]);
   return {from: from.name, to: to.name, date: ymd, searched_from_time: MG.hm2(t),
    walk_only: r.walkOnly ? {minutes: r.walkOnly.dur, distance_m: Math.round(r.walkOnly.dist)} : null,
    connections: r.results.map(cn => {
     const {dep, arr, rides} = A.connTimes(r, cn), lv = A.connLive(r, cn), byL = new Map(lv.map(x => [x.l, x]));
     const legs = []; const walkIn = cn.acc[1] > 0 ? cn.acc[1] : (cn.legs[0].walk ? cn.legs[0].dur : 0);
     if (walkIn > 0) legs.push({type: 'walk', minutes: walkIn, to_stop: D.stName(D.pl.get(rides[0].p.s[rides[0].bi]).st)});
     for (const l of cn.legs) {
      if (l.walk) { if (l.from >= 0 && l.dur > 0) legs.push({type: 'walk_transfer', minutes: l.dur, from_stop: nm(l.from), to_stop: nm(l.to)}); continue; }
      const L_ = D.ln.get(l.p.l), x = byL.get(l), pb = D.pl.get(l.p.s[l.bi]), pa = D.pl.get(l.p.s[l.ai]);
      legs.push(Object.assign({type: 'ride', line: lineName(L_, l.p, l.j), kind: kindCz(L_.k), direction: D.headsign(l.p, l.j), board: D.stName(pb.st), platform: pb.lab || undefined, departs: MG.hm2(x.t.dep), alight: D.stName(pa.st), arrives: MG.hm2(x.t.arr), stops: l.ai - l.bi, transfer_at_risk: x.risk || undefined}, liveOut(x.x)));
     }
     if (cn.egress > 0) legs.push({type: 'walk', minutes: cn.egress, to: to.name});
     return {leave_at: MG.hm2(dep), arrive_at: MG.hm2(arr), duration_min: Math.round(arr - dep), transfers: rides.length - 1, legs};
    })};
  },
  async get_departures(i) {
   const s = await resolveStop(i.stop); await ensureStop(s.g, s.ok);
   const st = D.st.get(s.g), c = MG.pragueParts(MG.now());
   let items = A.depItems(s.g, {ymd: i.date || c.ymd, from: i.time ? hmToMin(i.time) : null, limit: 60});
   if (i.line) { const lf = MG.fold(i.line); items = items.filter(x => MG.fold(D.lineText(x.d.L)) === lf || MG.fold(lineName(x.d.L, x.d.p, x.d.j)).includes(lf)); }
   const nowM = MG.nowMin();
   return {stop: st.name, district: (D.okresy[st.ok] || {}).name, distance_from_user_m: s.dist != null ? Math.round(s.dist) : undefined, near_place: s.near, now: MG.hm2(nowM),
    departures: items.slice(0, MG.clamp(i.limit || 8, 1, 20)).map(({d, x, exp}) => Object.assign({line: lineName(d.L, d.p, d.j), kind: kindCz(d.L.k), direction: D.headsign(d.p, d.j), platform: (D.pl.get(d.pl) || {}).lab || undefined, scheduled: MG.hm2(d.t), expected: MG.hm2(exp), in_min: i.date || i.time ? undefined : Math.round(exp - nowM)}, liveOut(x)))};
  },
  async nearby_stops(i) {
   const p = i.place ? await resolvePlace(i.place) : await A.mePoint(); if (!p) throw Error('Poloha uživatele není dostupná.');
   await D.loadAll().catch(() => {});
   const near = await A.nearestStops(p.lat, p.lon, 5, 1500), nowM = MG.nowMin();
   return {place: p.name, stops: near.map(([d, x]) => ({name: x.name, distance_m: Math.round(d), walk_min: Math.max(1, Math.round(d * 1.25 / 75)),
    next: D.st.has(x.g) ? A.depItems(x.g, {limit: 4, horizon: 60}).map(({d: q, exp, x: lx}) => ({line: lineName(q.L, q.p, q.j), direction: D.headsign(q.p, q.j), in_min: Math.round(exp - nowM), delay_min: lx && lx.d != null ? Math.round(lx.d) : undefined})) : undefined}))};
  },
  async walking_route(i) {
   const to = await resolvePlace(i.to), from = i.from ? await resolvePlace(i.from) : await A.mePoint();
   if (!from) throw Error('Poloha uživatele není dostupná.');
   let tgt = to;
   if (to.st != null && D.st.has(to.st)) { const s = D.st.get(to.st); tgt = {name: s.name, lat: s.lat, lon: s.lon}; }
   if (MG.dist(from.lat, from.lon, tgt.lat, tgt.lon) > 15000) return {error: 'Cíl je přes 15 km daleko – pěšky to nedává smysl, použij plan_trip.'};
   const r = await A.walkRoute(from, tgt);
   return {from: from.name, to: tgt.name, distance_m: Math.round(r.len), minutes: Math.round(r.time), steps: r.man.slice(0, 14).map(m => m.t), tip: 'V aplikaci lze spustit pěší navigaci k zastávce.'};
  },
  async get_weather(i) {
   const p = i.place ? await resolvePlace(i.place) : (A.wxPlace ? A.wxPlace() : await A.mePoint()) || {name: 'Praha', lat: 50.0875, lon: 14.4213};
   const j = await A.weather(p.lat, p.lon), c = j.current, hh = j.hourly, dd = j.daily;
   const n = Math.max(0, hh.time.findIndex(t => t >= c.time.slice(0, 13)));
   const WXT = A.wxText || (x => x);
   return {place: p.name, now: {temp_c: Math.round(c.temperature_2m), feels_c: Math.round(c.apparent_temperature), text: WXT(c.weather_code), precip_mm: c.precipitation, wind_kmh: Math.round(c.wind_speed_10m), gusts_kmh: Math.round(c.wind_gusts_10m), humidity: c.relative_humidity_2m},
    next_hours: hh.time.slice(n, n + 12).map((t, k) => ({time: t.slice(11, 16), temp_c: Math.round(hh.temperature_2m[n + k]), rain_prob: hh.precipitation_probability[n + k], text: WXT(hh.weather_code[n + k])})),
    days: dd.time.slice(0, 3).map((t, k) => ({date: t, min_c: Math.round(dd.temperature_2m_min[k]), max_c: Math.round(dd.temperature_2m_max[k]), rain_prob: dd.precipitation_probability_max[k], rain_mm: dd.precipitation_sum[k], text: WXT(dd.weather_code[k])})),
    travel_advice: A.wxAdvice(j).map(x => x[1]), source: 'Open-Meteo'};
  },
  async get_ticket_info(i) {
   const me = A.me(); const p = i.place ? await resolvePlace(i.place) : (me ? {lat: me.lat, lon: me.lon, name: 'Moje poloha'} : null);
   if (!p) return {error: 'Neznám místo – zeptej se, ve kterém městě nebo kraji uživatel jede.', systems: MG.tickets.SYS.map(s => s.name + ' (' + s.kraje.join(', ') + ')')};
   const s = MG.tickets.forPoint(p.lat, p.lon), oi = D.okresAt(p.lat, p.lon);
   return {place: p.name, district: oi >= 0 ? D.okresy[oi].name : null, region: oi >= 0 ? D.kraj(oi).name : null, system: MG.tickets.summary(s),
    trains: MG.tickets.TRAINS.map(t => ({carrier: t[0], url: t[1]})), price_of_exact_trip: 'Cenu konkrétního spojení ukáže IDOS (idos.cz) nebo e-shop dopravce; ceny mimo verified_prices nevymýšlej.'};
  },
  async list_favorites() { return {favorites: A.favs().map(f => ({label: f.label, address_or_stop: f.name}))}; }
 };
 const toolLabel = (tu) => { const i = tu.input || {}; return ({plan_trip: 'Hledám spojení' + (i.from || i.to ? ' ' + (i.from || '') + ' → ' + (i.to || '') : ''), get_departures: 'Načítám odjezdy ' + (i.stop || ''), nearby_stops: 'Hledám zastávky v okolí', walking_route: 'Počítám pěší trasu', get_weather: 'Zjišťuji počasí', get_ticket_info: 'Zjišťuji jízdné', list_favorites: 'Dívám se do Mých míst'})[tu.name] || tu.name; };
 async function runTool(tu) {
  const t = TOOLS.find(x => x.name === tu.name);
  if (!t) return {type: 'tool_result', tool_use_id: tu.id, is_error: true, content: 'Neznámý nástroj'};
  if (!validate(t, tu.input)) return {type: 'tool_result', tool_use_id: tu.id, is_error: true, content: JSON.stringify({INVALID_JSON: JSON.stringify(tu.input)})};
  try { const out = await RUN[tu.name](tu.input); return {type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out)}; }
  catch (e) { return {type: 'tool_result', tool_use_id: tu.id, is_error: true, content: String(e.message || e)}; }
 }
 AI.tools = {TOOLS, RUN, runTool, resolvePlace};

 /* ---------- výzva a kontext ---------- */
 const SYSTEM = 'Jsi Rádce mhdGO – přátelský a věcný průvodce veřejnou dopravou v Česku uvnitř aplikace mhdGO (verze bez mapy). Odpovídáš česky, stručně a prakticky, protože uživatel čte na mobilu: krátké odstavce nebo odrážky, časy jako 14:05, tučně jen to podstatné (čas odjezdu, linka).\n\n' +
  'Zásady:\n' +
  '- Odjezdy, spojení, zpoždění, pěší trasy, počasí a ceny nikdy nevymýšlej – zjisti je nástroji. Když nástroj nic nenajde nebo selže, řekni to a navrhni, co dál.\n' +
  '- Jízdní řády jsou z CIS JŘ. Živé zpoždění je známé jen u spojů, které už jedou; delay_estimated znamená odhad z polohy vozidla – uváděj ho s „asi“ nebo „~“. U spojů bez živých dat neříkej, že jedou včas, ale že jedou podle jízdního řádu.\n' +
  '- U spojení uveď, kdy vyrazit, odjezd a příjezd, linky a směr, přestupy a pěší úseky. Upozorni na transfer_at_risk.\n' +
  '- Ceny jízdného uváděj jen z get_ticket_info (verified_prices) nebo z oficiálních webů dopravců a koordinátorů, které najdeš webovým hledáním, vždy i se zdrojem. Jinak odkaž na oficiální ceník nebo IDOS.\n' +
  '- „Domů“, „Práce“ a podobné jsou uložená Moje místa – předej je nástrojům rovnou jako místo. „Odsud“ nebo „moje poloha“ je aktuální poloha uživatele.\n' +
  '- Když chybí podstatná informace (odkud, kam), zeptej se jednou krátkou otázkou.\n' +
  '- Na otázky mimo cestování, dopravu a počasí odpověz krátce a nabídni pomoc s cestou.\n' +
  '- Nepiš interní identifikátory ani JSON. Odkazy piš jako markdown [text](url).';
 async function contextText() {
  const p = MG.pragueParts(MG.now()), out = [];
  out.push('Dnes je ' + MG.dowName(p.ymd) + ' ' + p.d + '. ' + p.mo + '. ' + p.y + ', ' + MG.pad(p.h) + ':' + MG.pad(p.mi) + ' (Praha).');
  const me = A.me(), cx = A.ctx() || {};
  if (me) {
   const oi = D.okresAt(me.lat, me.lon); let near = '';
   try { const n = await A.nearestStops(me.lat, me.lon, 1, 1500); if (n.length) near = ', nejbližší zastávka ' + n[0][1].name + ' (' + Math.round(n[0][0]) + ' m)'; } catch (_) {}
   out.push('Poloha uživatele je známá: okres ' + (oi >= 0 ? D.okresy[oi].name + ', ' + D.kraj(oi).name : 'mimo ČR') + near + '.');
  } else out.push('Poloha uživatele není známá.');
  if (cx.stop != null && D.st.get(cx.stop)) out.push('V aplikaci má otevřené odjezdy ze zastávky ' + D.st.get(cx.stop).name + '.');
  if (cx.conn && cx.conn.from && cx.conn.to) out.push('Naposledy hledal spojení ' + cx.conn.from.name + ' → ' + cx.conn.to.name + '.');
  const F = A.favs(); out.push(F.length ? 'Moje místa: ' + F.map(f => f.label + (f.name && f.name !== f.label ? ' (' + f.name + ')' : '')).join('; ') + '.' : 'Moje místa: zatím žádná.');
  if (D.core) out.push('Jízdní řády v aplikaci platí ' + D.core.d0 + ' až ' + MG.ymdAdd(D.core.d0, D.core.nd - 1) + '.');
  return '[Kontext z aplikace, doplněný automaticky]\n' + out.join('\n');
 }
 function params() {
  const m = AI.cfg.model, tools = TOOLS.map(t => Object.assign({}, t, {eager_input_streaming: true}));
  if (AI.cfg.web && !AI.noWeb) tools.push({type: 'web_search_20260209', name: 'web_search', max_uses: 3, allowed_domains: WEB_DOMAINS, user_location: {type: 'approximate', country: 'CZ', timezone: 'Europe/Prague'}});
  const p = {model: m, max_tokens: 16000, system: SYSTEM, tools, messages: AI.msgs.slice(), thinking: {type: 'adaptive'}, cache_control: {type: 'ephemeral'}};
  /* záložní model při odmítnutí (Haiku 5.5 server-side fallback nemá) */
  if (m !== 'claude-haiku-5-5') { p.betas = ['server-side-fallback-2026-07-01']; p.fallbacks = 'default'; }
  return p;
 }

 /* ---------- konverzace ---------- */
 AI.send = async (text) => {
  text = String(text || '').trim(); if (!text || AI.busy) return;
  if (!ready()) { await workerStatus(); if (!ready()) { AI.show(true); return; } }
  const Anthropic = await sdk().catch(() => null);
  if (!Anthropic) { pushLog({r: 'err', t: 'Knihovnu rádce se nepodařilo načíst – zkontroluj připojení.'}); return; }
  AI.busy = true; paintInput();
  const ctx = await contextText();
  const start = AI.msgs.length;
  AI.msgs.push({role: 'user', content: [{type: 'text', text: ctx}, {type: 'text', text}]});
  pushLog({r: 'u', t: text});
  const bot = {r: 'a', t: '', st: 'Přemýšlím…', src: []}; pushLog(bot);
  let webRetry = false, jsonRetries = 0;
  try {
   const cl = await client();
   for (let guard = 0; guard < 12; guard++) {
    const stream = AI.stream = cl.beta.messages.stream(params());
    const base = bot.t;
    stream.on('text', d => { bot.t += d; bot.st = ''; paintBot(bot); });
    stream.on('streamEvent', ev => { if (ev.type === 'content_block_start' && ev.content_block && ev.content_block.type === 'server_tool_use') { bot.st = 'Hledám na oficiálních webech…'; paintBot(bot); } });
    let msg;
    try { msg = await stream.finalMessage(); jsonRetries = 0; }
    catch (err) {
     if (err instanceof Anthropic.APIUserAbortError) throw err;
     if (err instanceof Anthropic.BadRequestError && AI.cfg.web && !AI.noWeb && !webRetry) { AI.noWeb = true; webRetry = true; bot.t = base; continue; }
     if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
     bot.t = base; continue; /* nástroj s neparsovatelným vstupem – zopakovat tah */
    }
    if (msg.stop_reason === 'refusal') { AI.msgs.length = start; bot.t = ''; bot.err = 'Na tohle rádce neodpoví. Zkus se zeptat jinak – třeba na spojení, odjezdy nebo počasí.'; break; }
    for (const b of msg.content) if (b.type === 'text' && Array.isArray(b.citations)) for (const c of b.citations) if (c.url && !bot.src.some(s => s.url === c.url)) bot.src.push({url: c.url, title: c.title || c.url});
    AI.msgs.push({role: 'assistant', content: msg.content});
    if (msg.stop_reason === 'pause_turn') continue;
    const tus = msg.content.filter(b => b.type === 'tool_use');
    if (!tus.length) break;
    if (msg.stop_reason === 'max_tokens') { bot.err = 'Odpověď byla příliš dlouhá – zkus otázku zúžit.'; break; }
    const res = [];
    for (const tu of tus) { bot.st = toolLabel(tu) + '…'; paintBot(bot); res.push(await runTool(tu)); }
    if (bot.t && !/\n$/.test(bot.t)) bot.t += '\n\n';
    AI.msgs.push({role: 'user', content: res});
   }
  } catch (e) {
   const An = Anthropic;
   if (e instanceof An.APIUserAbortError) { bot.st = ''; bot.t = bot.t || '(zastaveno)'; AI.msgs.length = start; }
   else {
    AI.msgs.length = start;
    bot.err = e instanceof An.AuthenticationError ? (AI.cfg.mode === 'worker' ? 'Neplatný přístupový kód k workeru.' : 'Neplatný API klíč.') :
     e instanceof An.PermissionDeniedError ? (AI.cfg.mode === 'worker' ? 'Rádce na workeru není zapnutý.' : 'Klíč nemá oprávnění k tomuto modelu.') :
     e instanceof An.RateLimitError ? 'Rádce je teď přetížený nebo došel limit – zkus to za chvíli.' :
     e instanceof An.APIConnectionError ? 'Rádce je nedostupný – zkontroluj připojení.' :
     e instanceof An.APIError ? 'Chyba služby (' + (e.status || '?') + '). Zkus to znovu.' : 'Něco se pokazilo: ' + (e.message || e);
    MG.err('ai', e);
   }
  } finally {
   AI.stream = null; AI.busy = false; bot.st = ''; paintBot(bot); paintInput(); saveChat();
  }
 };
 AI.stop = () => { if (AI.stream) try { AI.stream.abort(); } catch (_) {} };
 AI.reset = () => { AI.stop(); AI.msgs = []; AI.log = []; saveChat(); AI.show(); };
 AI.prefill = (t) => { const i = $('ai-in'); if (i) { i.value = t; i.focus(); autoGrow(i); } };

 /* ---------- vykreslení ---------- */
 function md(s) {
  const inl = t => H(t).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, a, u) => '<a href="' + u + '" target="_blank" rel="noopener">' + a + '</a>')
   .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, a, u) => a + '<a href="' + u + '" target="_blank" rel="noopener">' + u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40) + '</a>')
   .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = String(s || '').split('\n'); let h = '', list = null;
  const endList = () => { if (list) { h += '</' + list + '>'; list = null; } };
  for (const ln of lines) {
   let m;
   if ((m = ln.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== 'ul') { endList(); h += '<ul>'; list = 'ul'; } h += '<li>' + inl(m[1]) + '</li>'; }
   else if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { endList(); h += '<ol>'; list = 'ol'; } h += '<li>' + inl(m[1]) + '</li>'; }
   else if ((m = ln.match(/^#{1,4}\s+(.*)$/))) { endList(); h += '<p class="h">' + inl(m[1]) + '</p>'; }
   else if (!ln.trim()) endList();
   else { endList(); h += '<p>' + inl(ln) + '</p>'; }
  }
  endList(); return h;
 }
 AI.md = md;
 const bubble = (x) => x.r === 'u' ? '<div class="msg u"><div class="bb">' + H(x.t) + '</div></div>' :
  x.r === 'err' ? '<div class="msg a"><div class="bb err">' + H(x.t) + '</div></div>' :
  '<div class="msg a"><span class="av"><i class="fa-solid fa-wand-magic-sparkles"></i></span><div class="bb">' + (x.t ? md(x.t) : '') + (x.st ? '<div class="st-l"><span class="spin"></span>' + H(x.st) + '</div>' : '') + (x.err ? '<div class="err">' + H(x.err) + '</div>' : '') +
   (x.src && x.src.length ? '<div class="srcs"><small>Zdroje</small>' + x.src.slice(0, 6).map(s => '<a href="' + H(s.url) + '" target="_blank" rel="noopener">' + H(s.title.slice(0, 60)) + '</a>').join('') + '</div>' : '') + '</div></div>';
 function pushLog(x) { AI.log.push(x); const box = $('ai-log'); if (!box) return; const e = $('ai-empty'); if (e) e.remove(); box.insertAdjacentHTML('beforeend', bubble(x)); x._el = box.lastElementChild; scrollEnd(); }
 let raf = 0;
 function paintBot(x) { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (x._el && x._el.isConnected) { const n = document.createElement('div'); n.innerHTML = bubble(x); const ne = n.firstElementChild; x._el.replaceWith(ne); x._el = ne; } scrollEnd(); }); }
 function scrollEnd() { const box = $('ai-log'); if (box) box.scrollTop = box.scrollHeight; }
 function paintInput() { const b = $('ai-send'); if (!b) return; b.innerHTML = AI.busy ? '<i class="fa-solid fa-stop"></i>' : '<i class="fa-solid fa-arrow-up"></i>'; b.title = AI.busy ? 'Zastavit' : 'Odeslat'; b.classList.toggle('busy', AI.busy); }
 function autoGrow(i) { i.style.height = 'auto'; i.style.height = Math.min(140, i.scrollHeight) + 'px'; }
 const SUGG = [['fa-house', 'Jak se dostanu domů?'], ['fa-clock', 'Co mi jede z nejbližší zastávky?'], ['fa-umbrella', 'Budu dnes potřebovat deštník?'], ['fa-ticket', 'Kolik stojí jízdenka a kde ji koupím?'], ['fa-person-walking', 'Jak daleko je to pěšky na zastávku?']];
 AI.show = async (forceSet) => {
  const el = $('ai-body'); if (!el) return;
  if (!AI.status) { el.innerHTML = '<div class="ai-empty"><span class="spin"></span></div>'; await workerStatus(); }
  if (forceSet || !ready()) return setup(el);
  el.innerHTML = '<div class="ai-chat"><div class="ai-log" id="ai-log">' + (AI.log.length ? AI.log.map(x => { const c = Object.assign({}, x); delete c._el; return bubble(c); }).join('') : '<div class="ai-empty" id="ai-empty"><div class="ai-hi"><i class="fa-solid fa-wand-magic-sparkles"></i></div><b>Ahoj, jsem Rádce mhdGO</b><p>Najdu ti spojení, odjezdy se zpožděním, cestu pěšky na zastávku, počasí na cestu i informace o jízdném.</p><div class="ai-sug">' + SUGG.map(s => '<button type="button" class="chip" data-q="' + H(s[1]) + '"><i class="fa-solid ' + s[0] + '"></i> ' + H(s[1]) + '</button>').join('') + '</div></div>') + '</div>' +
   '<div class="ai-bar"><button type="button" class="ib" id="ai-new" title="Nová konverzace"><i class="fa-solid fa-rotate-left"></i></button><textarea id="ai-in" rows="1" placeholder="Zeptej se na cestu, odjezd, počasí…" enterkeyhint="send"></textarea><button type="button" class="sendb" id="ai-send" title="Odeslat"><i class="fa-solid fa-arrow-up"></i></button></div>' +
   '<div class="ai-foot"><span>' + H((MODELS.find(m => m[0] === AI.cfg.model) || MODELS[0])[1]) + ' · ' + (AI.cfg.mode !== 'key' ? 'přes worker mhdGO' : 'vlastní klíč') + '</span><button type="button" class="lnk" id="ai-set">Nastavení rádce</button></div></div>';
  AI.log.forEach(x => x._el = null);
  const kids = MG.qsa('#ai-log > .msg'); AI.log.forEach((x, k) => { x._el = kids[k] || null; });
  const inp = $('ai-in');
  inp.oninput = () => autoGrow(inp);
  inp.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); } };
  const go = () => { if (AI.busy) return AI.stop(); const t = inp.value; inp.value = ''; autoGrow(inp); AI.send(t); };
  $('ai-send').onclick = go;
  $('ai-new').onclick = () => AI.reset();
  $('ai-set').onclick = () => AI.show(true);
  MG.qsa('[data-q]', el).forEach(b => b.onclick = () => AI.send(b.dataset.q));
  paintInput(); scrollEnd();
  sdk().catch(() => {});
 };
 async function setup(el) {
  const st = await workerStatus(), c = AI.cfg;
  const mode = c.mode || (st.enabled ? 'worker' : 'key');
  const open = st.enabled && st.open;
  el.innerHTML = '<div class="ai-setup"><div class="ai-hi"><i class="fa-solid fa-wand-magic-sparkles"></i></div><h2>Rádce mhdGO</h2><p>Chytrý pomocník s cestou: „Jak se dostanu domů?“, „Stihnu přestup?“, „Vezmu si deštník?“. Odpovídá podle stejných jízdních řádů a živých dat jako aplikace. Běží na modelu Claude od společnosti Anthropic.</p>' +
   '<div class="seg wide"><button type="button" data-m="worker" class="' + (mode === 'worker' ? 'on' : '') + '">Přes worker mhdGO</button><button type="button" data-m="key" class="' + (mode === 'key' ? 'on' : '') + '">Vlastní API klíč</button></div>' +
   '<div id="ai-m-worker"' + (mode === 'worker' ? '' : ' hidden') + '><p class="mut">' + (open ? 'Rádce je na workeru mhdGO zapnutý pro všechny – nic dalšího zadávat nemusíš.' : st.enabled ? 'Worker má rádce zapnutý. Zadej přístupový kód od správce aplikace.' : 'Worker ' + H(workerBase() || '(není nastaven)') + ' rádce zatím nemá. Zapne se tajemstvím ANTHROPIC_API_KEY ve workeru (návod v README, kapitola o workeru). Do té doby můžeš použít vlastní API klíč.') + '</p>' + (open ? '<input type="hidden" id="ai-code" value="">' : '<label class="lab">Přístupový kód</label><input class="inp" id="ai-code" type="password" autocomplete="off" value="' + H(c.code || '') + '">') + '</div>' +
   '<div id="ai-m-key"' + (mode === 'key' ? '' : ' hidden') + '><p class="mut">Klíč z console.anthropic.com se uloží jen v tomto zařízení a posílá se přímo do Anthropic API. Používej klíč s nastaveným limitem útraty; útratu platíš ty.</p><label class="lab">Anthropic API klíč</label><input class="inp" id="ai-key" type="password" autocomplete="off" placeholder="sk-ant-…" value="' + H(c.key || '') + '"></div>' +
   '<label class="lab">Model</label><div class="mlist">' + MODELS.map(m => '<label class="mopt"><input type="radio" name="aim" value="' + m[0] + '"' + (c.model === m[0] ? ' checked' : '') + '><span><b>' + m[1] + '</b><small>' + m[2] + '</small></span></label>').join('') + '</div>' +
   '<div class="set-row"><span><b>Hledat ceny na oficiálních webech</b><small>webové hledání jen na stránkách dopravců a koordinátorů</small></span><label class="sw"><input type="checkbox" id="ai-web"' + (c.web ? ' checked' : '') + '><i></i></label></div>' +
   '<button type="button" class="btn pri wide" id="ai-ok"><i class="fa-solid fa-check"></i> Uložit a začít</button>' + (ready() ? '<button type="button" class="btn wide" id="ai-back">Zpět ke konverzaci</button>' : '') +
   (c.key ? '<button type="button" class="lnk" id="ai-forget">Smazat uložený klíč z tohoto zařízení</button>' : '') + '</div>';
  let m = mode;
  MG.qsa('[data-m]', el).forEach(b => b.onclick = () => { m = b.dataset.m; MG.qsa('[data-m]', el).forEach(x => x.classList.toggle('on', x === b)); $('ai-m-worker').hidden = m !== 'worker'; $('ai-m-key').hidden = m !== 'key'; });
  $('ai-ok').onclick = () => {
   const key = $('ai-key').value.trim(), code = $('ai-code').value.trim();
   if (m === 'key' && !/^sk-ant-/.test(key)) return MG.toast('Zadej platný API klíč (začíná sk-ant-)');
   if (m === 'worker' && !code && !open) return MG.toast(st.enabled ? 'Zadej přístupový kód' : 'Rádce na workeru zatím není zapnutý');
   Object.assign(AI.cfg, {mode: m, key: m === 'key' ? key : AI.cfg.key, code: m === 'worker' ? code : AI.cfg.code, model: (MG.qs('input[name=aim]:checked', el) || {}).value || 'claude-opus-5-5', web: $('ai-web').checked});
   AI.noWeb = false; saveCfg(); AI.show();
  };
  if ($('ai-back')) $('ai-back').onclick = () => AI.show();
  if ($('ai-forget')) $('ai-forget').onclick = () => { AI.cfg.key = ''; if (AI.cfg.mode === 'key') AI.cfg.mode = ''; saveCfg(); MG.toast('Klíč smazán'); AI.show(true); };
 }
})();
