/**
 * mhdGO – Cloudflare Worker: sjednocené živé polohy vozidel v ČR
 *
 * Výstup (GET /?bbox=west,south,east,north):
 * {
 *   updated: 1730000000000,
 *   vehicles: [{src, line, cis, spoj, lat, lon, delay, head, last, next, plate, carrier, low, bearing}],
 *   trains:   [{src, num, cat, name, lat, lon, delay, head, from, cur, next, carrier, az}],
 *   stats: {...}, errors: {...}
 * }
 * delay = zpoždění v minutách (záporné = napřed)
 *
 * Zdroje (každý lze vypnout proměnnou prostředí "0"):
 *  - regionální autobusy a MHD z celostátních dat   JDF=1   motis.obehy.cz/get-feeds/cz-jdf-gtfs-rt.pb (GTFS-RT, Oběhy)
 *      obsahuje veřejné mapy poloh IDOL, JIKORD, ODIS, IDZK (CHAPS mpvnet), DÚK (Ústecký kraj, MHD Teplice
 *      a Ústí), DPMD Děčín a Arriva Express; spoje jsou označené číslem linky CIS JŘ a číslem spoje
 *  - ODIS přes proxy OpavaGO                        ODIS_PROXY=https://opavago.prerekhu.workers.dev/ ("" = vypnout)
 *  - PID (Praha a Středočeský kraj)                 PID=1   mapa.pid.cz (veřejná mapa PID); nebo GOLEMIO_TOKEN=... api.golemio.cz
 *  - mimořádnosti a výluky PID                     ALERTS=1 pid.cz RSS (výstup alerts[])
 *  - Správa železnic (všechny vlaky v ČR)          SZ=1
 *  - IREDO (autobusy a vlaky Královéhradeckého a Pardubického kraje) IREDO=1   veřejná mapa iredo.online
 *  - MHD Hradec Králové                            DPMHK=1  veřejná mapa dpmhk.qrbus.me
 *  (Brno a Jihomoravský kraj: aplikace se připojuje přímo k otevřenému streamu poloh na data.brno.cz.)
 *
 * AI rádce: POST /ai/v1/messages – proxy na Claude API. Zapne se tajemstvím ANTHROPIC_API_KEY (bez AI_CODE pro všechny
 *   uživatele aplikace s limity, s AI_CODE jen s přístupovým kódem).
 *
 * Nasazení: Cloudflare → Workers & Pages → Create → Worker „mhdgo-live“ → Edit code → vložit tento soubor → Deploy
 *           (nebo „npx wrangler deploy“ ve složce worker/). Bez proměnných běží vše výchozí.
 * Adresu workeru vlož v mhdGO: Více → Nastavení → Živé polohy a worker.
 */
const CZ = {w: 12.0, s: 48.5, e: 18.95, n: 51.1};
/* rozsahy veřejných map poloh CHAPS (mpvnet.cz/<portál>/map) */
/* paměť v rámci instance workeru (Cache API na *.workers.dev nefunguje) */
let MEM = null, MEM_AT = 0, PENDING = null;

export default {
 async fetch(req, env, ctx) {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/ai')) return aiProxy(req, env, url);
  if (req.method === 'OPTIONS') return new Response(null, {headers: cors()});
  if (req.method !== 'GET') return new Response('Method not allowed', {status: 405, headers: cors()});
  const bbox = parseBbox(url.searchParams.get('bbox')) || CZ;
  let all = null;
  if (MEM && Date.now() - MEM_AT < 9000) all = MEM;
  else {
   if (!PENDING) PENDING = collect(env).then(r => { MEM = r; MEM_AT = Date.now(); PENDING = null; return r; }).catch(e => { PENDING = null; throw e; });
   all = await PENDING;
  }
  const inB = v => v.lat >= bbox.s && v.lat <= bbox.n && v.lon >= bbox.w && v.lon <= bbox.e;
  if (url.searchParams.get('alerts')) return new Response(JSON.stringify({updated: all.updated, alerts: all.alerts || []}), {headers: {...cors(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
  const out = {updated: all.updated, vehicles: all.vehicles.filter(inB), trains: url.searchParams.get('trains') === '0' ? [] : all.trains.filter(inB), stats: all.stats, errors: all.errors};
  return new Response(JSON.stringify(out), {headers: {...cors(), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
 }
};

/* ---------- AI rádce: průchozí proxy na Claude Messages API ----------
 Klíč Anthropic je jen tady (tajemství ANTHROPIC_API_KEY) – do aplikace se nikdy nedostane.
 • bez AI_CODE: rádce je zapnutý pro všechny uživatele aplikace (otevřený režim) s limity níže,
 • s AI_CODE: aplikace musí znát přístupový kód (zadá se v Rádce → Nastavení rádce).
 Propustí se jen dotazy rádce mhdGO (jeho systémová výzva a nástroje), jen streamované, s omezeným počtem
 tokenů a povolenými modely; v otevřeném režimu navíc limit dotazů na IP adresu a celkový limit za hodinu.
 Doporučení: v console.anthropic.com nastav pro klíč měsíční limit útraty (Limits → Spend limit).
   wrangler secret put ANTHROPIC_API_KEY
   wrangler secret put AI_CODE            (volitelné)
 Proměnné: AI_MODEL (vynutí model, např. claude-sonnet-5-5), AI_IP_LIMIT (dotazů / 10 min, výchozí 40),
           AI_HOUR_LIMIT (dotazů za hodinu na instanci, výchozí 600). */
const AI_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']);
const AI_TOOLS = new Set(['plan_trip', 'get_departures', 'nearby_stops', 'walking_route', 'get_weather', 'get_ticket_info', 'list_favorites', 'web_search']);
const AI_HITS = new Map(); let AI_HOUR = {t: 0, n: 0};
function aiCors(req) {
 return {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || 'authorization, content-type, anthropic-version, anthropic-beta',
  'Access-Control-Max-Age': '86400'};
}
const timingSafeEq = (a, b) => { a = String(a || ''); b = String(b || ''); let r = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) r |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return r === 0; };
function aiLimit(req, env) {
 const now = Date.now(), ip = req.headers.get('cf-connecting-ip') || 'x', per = +env.AI_IP_LIMIT || 40, hour = +env.AI_HOUR_LIMIT || 600;
 const a = (AI_HITS.get(ip) || []).filter(t => now - t < 600000);
 if (a.length >= per) return 'Too many requests from this address, try again in a few minutes';
 if (now - AI_HOUR.t > 3600000) AI_HOUR = {t: now, n: 0};
 if (AI_HOUR.n >= hour) return 'The advisor is busy, try again later';
 a.push(now); AI_HITS.set(ip, a); AI_HOUR.n++;
 if (AI_HITS.size > 5000) AI_HITS.clear();
 return '';
}
async function aiProxy(req, env, url) {
 const h = aiCors(req), on = !!env.ANTHROPIC_API_KEY, open = on && !env.AI_CODE;
 const json = (o, st) => new Response(JSON.stringify(o), {status: st || 200, headers: Object.assign({'Content-Type': 'application/json'}, h)});
 const err = (st, type, message) => json({type: 'error', error: {type, message}}, st);
 if (req.method === 'OPTIONS') return new Response(null, {headers: h});
 if (url.pathname === '/ai/status') return json({enabled: on, open, code: on && !open, model: env.AI_MODEL || null});
 if (url.pathname !== '/ai/v1/messages' || req.method !== 'POST') return err(404, 'not_found_error', 'Not found');
 if (!on) return err(403, 'permission_error', 'AI proxy is disabled on this worker');
 if (!open) { const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || req.headers.get('x-api-key') || ''; if (!timingSafeEq(auth, env.AI_CODE)) return err(401, 'authentication_error', 'Invalid access code'); }
 let body; try { body = await req.json(); } catch (_) { return err(400, 'invalid_request_error', 'Invalid JSON'); }
 if (env.AI_MODEL) body.model = env.AI_MODEL;
 if (!AI_MODELS.has(body.model)) return err(400, 'invalid_request_error', 'Model not allowed');
 if (!body.stream) return err(400, 'invalid_request_error', 'Only streaming requests are allowed');
 const sys = typeof body.system === 'string' ? body.system : Array.isArray(body.system) ? body.system.map(b => b && b.text || '').join('') : '';
 if (!sys.startsWith('Jsi Rádce mhdGO')) return err(403, 'permission_error', 'Only the mhdGO advisor may use this proxy');
 if (!Array.isArray(body.tools) || body.tools.some(t => !t || !AI_TOOLS.has(t.name))) return err(403, 'permission_error', 'Tools not allowed');
 for (const t of body.tools) if (t.name === 'web_search') t.max_uses = Math.min(+t.max_uses || 3, 3);
 if (open) { const lim = aiLimit(req, env); if (lim) return err(429, 'rate_limit_error', lim); }
 body.max_tokens = Math.min(+body.max_tokens || 4000, 16000);
 const fh = {'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': req.headers.get('anthropic-version') || '2023-06-01'};
 const beta = req.headers.get('anthropic-beta'); if (beta) fh['anthropic-beta'] = beta;
 if (body.model === 'claude-haiku-5-5') { delete body.fallbacks; if (beta) { const b = beta.split(',').map(x => x.trim()).filter(x => !/^server-side-fallback/.test(x)); if (b.length) fh['anthropic-beta'] = b.join(','); else delete fh['anthropic-beta']; } }
 const r = await fetch('https://api.anthropic.com/v1/messages', {method: 'POST', headers: fh, body: JSON.stringify(body)});
 const oh = new Headers(h); oh.set('Content-Type', r.headers.get('content-type') || 'text/event-stream'); const rid = r.headers.get('request-id'); if (rid) oh.set('request-id', rid);
 return new Response(r.body, {status: r.status, headers: oh});
}
function cors() { return {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'}; }
function parseBbox(s) { if (!s) return null; const a = s.split(',').map(Number); if (a.length !== 4 || a.some(x => !isFinite(x))) return null; return {w: a[0], s: a[1], e: a[2], n: a[3]}; }
const on = (env, k, def) => { const v = env[k]; return v == null ? def : !(v === '0' || v === 'false'); };

async function collect(env) {
 const stats = {}, errors = {}, vehicles = [], trains = [], alerts = [];
 const jobs = [];
 if (on(env, 'JDF', true)) jobs.push(run('jdf', () => jdfRT(), r => { vehicles.push(...r); return r.length; }));
 const px = env.ODIS_PROXY != null ? env.ODIS_PROXY : 'https://opavago.prerekhu.workers.dev/';
 if (on(env, 'ODIS', true) && px) jobs.push(run('odis', () => odisProxy(px), r => { vehicles.push(...r.vehicles); trains.push(...r.trains); return r.vehicles.length; }));
 if (env.GOLEMIO_TOKEN) jobs.push(run('pid', () => golemio(env.GOLEMIO_TOKEN), r => { vehicles.push(...r); return r.length; }));
 else if (on(env, 'PID', true)) jobs.push(run('pid', () => pidmap(), r => { vehicles.push(...r); return r.length; }));
 if (on(env, 'ALERTS', true)) jobs.push(run('alerts', () => pidAlerts(), r => { alerts.push(...r); return r.length; }));
 if (env.IDSJMK_URL) jobs.push(run('idsjmk', () => idsjmk(env.IDSJMK_URL), r => { vehicles.push(...r); return r.length; }));
 if (on(env, 'SZ', true)) jobs.push(run('sz', () => sz(), r => { const have = new Set(trains.map(t => t.num)); for (const t of r) if (!have.has(t.num)) trains.push(t); return r.length; }));
 const extraTrains = [];
 if (on(env, 'IREDO', true)) jobs.push(run('iredo', () => iredo(), r => { vehicles.push(...r.vehicles); extraTrains.push(...r.trains); return r.vehicles.length + r.trains.length; }));
 if (on(env, 'DPMHK', true)) jobs.push(run('dpmhk', () => dpmhk(), r => { vehicles.push(...r); return r.length; }));
 await Promise.all(jobs);
 { const have = new Set(trains.map(t => String(t.num))); for (const t of extraTrains) if (!have.has(String(t.num))) trains.push(t); }
 return {updated: Date.now(), vehicles, trains, alerts, stats, errors};
 async function run(name, f, put) {
  try { const r = await withTimeout(f(), 9000); stats[name] = put(r); }
  catch (e) { errors[name] = String(e && e.message || e); }
 }
}
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

/* ---------- IREDO (Královéhradecký a Pardubický kraj): veřejná mapa iredo.online „Aktuální poloha spojů“ ----------
 id spoje: „S-<linka CIS>-<spoj>“ (autobus) nebo „K-<číslo vlaku>“; zpoždění v minutách; time = čas poslední polohy (Praha). */
const KHPA = {w: 14.95, s: 49.45, e: 16.95, n: 50.85};
function pragueOffsetMin(d) { const s = d.toLocaleString('en-US', {timeZone: 'Europe/Prague', hour12: false, hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit'}); const m = s.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+)/); if (!m) return 60; const loc = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4] % 24, +m[5]); return Math.round((loc - Math.floor(d.getTime() / 60000) * 60000) / 60000); }
function pragueClockAge(hms) { if (!/^\d{1,2}:\d{2}/.test(hms || '')) return 0; const now = new Date(), off = pragueOffsetMin(now); const [h, m, sec] = hms.split(':').map(Number); const loc = ((now.getUTCHours() * 60 + now.getUTCMinutes() + off) % 1440 + 1440) % 1440; let d = loc - (h * 60 + m + (sec || 0) / 60); if (d < -720) d += 1440; return d; }
async function iredo() {
 const r = await fetch('https://iredo.online/map/mapData', {method: 'POST', headers: {'Content-Type': 'application/json', 'Accept': 'application/json'}, body: JSON.stringify(Object.assign({zoom: 12}, KHPA))});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json(), vehicles = [], trains = [];
 for (const c of (j.connections || [])) {
  if (!c || !isFinite(c.lat) || !isFinite(c.lon)) continue;
  if (pragueClockAge(c.time) > 10) continue; /* spoj už dojel – poloha stará */
  const delay = isFinite(c.delay) ? +c.delay : null;
  const m = /^S-(\d{6})-(\d+)$/.exec(String(c.id || ''));
  if (c.vehicleType === 'V' || /^K-/.test(c.id || '')) { const num = String(c.trainNumber || String(c.id || '').replace(/^K-/, '')).replace(/\D/g, ''); if (num) trains.push({src: 'IREDO', num, cat: '', lat: c.lat, lon: c.lon, delay, head: String(c.dest || '').split(',').filter(Boolean).join(', '), carrier: c.operator || ''}); continue; }
  vehicles.push({src: 'IREDO', cis: m ? m[1] : '', line: c.extLineName || (c.lineNumber != null ? String(c.lineNumber) : (m ? String(+m[1].slice(3)) : '')), spoj: m ? +m[2] : 0, lat: c.lat, lon: c.lon, delay, head: String(c.dest || '').split(',').filter(Boolean).join(', '), bearing: isFinite(c.angle) ? c.angle : null, carrier: c.operator || '', ts: Date.now()});
 }
 return {vehicles, trains};
}
/* ---------- MHD Hradec Králové (DPmHK): veřejná mapa dpmhk.qrbus.me ----------
 ln = linka, tn = číslo spoje, la/lo = souřadnice × 1e5, d = zpoždění v sekundách, l = čas poslední komunikace (místní). */
async function dpmhk() {
 const r = await fetch('https://dpmhk.qrbus.me/index/getAllRtdVehicles', {method: 'POST', headers: {'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json(), out = [], now = Date.now(), off = pragueOffsetMin(new Date()) * 60000;
 for (const v of (j.vehicles || [])) {
  if (!v || !v.ln || !v.tn || !/^\d+$/.test(String(v.ln))) continue;
  const lat = v.la * 1e-5, lon = v.lo * 1e-5; if (!(lat > 49 && lat < 51 && lon > 15 && lon < 17)) continue;
  const t = Date.parse(v.l); if (isFinite(t) && now - (t - off) > 5 * 60000) continue;
  out.push({src: 'DPMHK', city: 'Hradec Králové', line: String(+v.ln), spoj: +v.tn, lat, lon, delay: typeof v.d === 'number' && Math.abs(v.d) < 10800 ? v.d / 60 : null, plate: v.li ? String(v.li) : '', bearing: v.az || null, ts: now});
 }
 return out;
}

/* ---------- GTFS-RT: regionální autobusy a MHD (Oběhy, celostátní data JDF) ---------- */
const JDF_SRC = {mpvnet: 'CHAPS', duk: 'DÚK', dpmd: 'DPMD', 'arriva-express': 'Arriva Express'};
async function jdfRT() {
 const r = await fetch('https://motis.obehy.cz/get-feeds/cz-jdf-gtfs-rt.pb');
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const u = new Uint8Array(await r.arrayBuffer());
 const out = [];
 for (const v of gtfsrtVehicles(u)) {
  const src = (v.vid.split(':')[0] || '');
  if (src === 'pid') continue;                       /* PID je z mapa.pid.cz i se zpožděním */
  const p = v.trip.split(':'); if (p[0] !== 'jdf' || p[1] !== 'trip' || !/^\d{6}$/.test(p[2] || '')) continue;
  let spoj = 0; for (let i = 4; i < p.length; i++) { if (p[i] === 'overlay') break; if (/^\d+$/.test(p[i])) { spoj = +p[i]; break; } }
  if (!spoj || !isFinite(v.lat) || !isFinite(v.lon)) continue;
  out.push({src: JDF_SRC[src] || src.toUpperCase(), cis: p[2], line: String(+p[2].slice(3)), spoj, lat: +v.lat.toFixed(6), lon: +v.lon.toFixed(6), bearing: isFinite(v.bearing) ? Math.round(v.bearing) : null,
   delay: null, plate: src === 'mpvnet' ? v.vid.slice(7) : '', ts: v.ts || 0});
 }
 return out;
}
/* minimální čtečka GTFS-RT (protobuf) – jen VehiclePosition: trip_id, poloha, směr, čas, vozidlo */
function gtfsrtVehicles(u) {
 const dv = new DataView(u.buffer, u.byteOffset, u.byteLength), td = new TextDecoder();
 const out = [];
 let pos = 0;
 const vint = () => { let x = 0, m = 1, b; do { b = u[pos++]; x += (b & 127) * m; m *= 128; } while (b & 128); return x; };
 const skip = (wt) => { if (wt === 0) vint(); else if (wt === 1) pos += 8; else if (wt === 2) { const l = vint(); pos += l; } else if (wt === 5) pos += 4; else throw new Error('pb wt ' + wt); };
 const str = (l) => { const s = td.decode(u.subarray(pos, pos + l)); pos += l; return s; };
 function msg(end, onField) { while (pos < end) { const tag = vint(), f = Math.floor(tag / 8), wt = tag & 7; if (!onField(f, wt)) skip(wt); } }
 msg(u.length, (f, wt) => {
  if (f !== 2 || wt !== 2) return false;                     /* FeedMessage.entity */
  const ln = vint(), end = pos + ln;
  msg(end, (f2, wt2) => {
   if (f2 !== 4 || wt2 !== 2) return false;                  /* FeedEntity.vehicle */
   const ln2 = vint(), e2 = pos + ln2, v = {trip: '', vid: '', lat: NaN, lon: NaN, bearing: NaN, ts: 0};
   msg(e2, (f3, wt3) => {
    if (f3 === 1 && wt3 === 2) { const ln3 = vint(), e3 = pos + ln3; msg(e3, (f4, wt4) => { if (f4 === 1 && wt4 === 2) { v.trip = str(vint()); return true; } return false; }); return true; }
    if (f3 === 2 && wt3 === 2) { const ln3 = vint(), e3 = pos + ln3; msg(e3, (f4, wt4) => { if (wt4 === 5) { const x = dv.getFloat32(pos, true); pos += 4; if (f4 === 1) v.lat = x; else if (f4 === 2) v.lon = x; else if (f4 === 3) v.bearing = x; return true; } return false; }); return true; }
    if (f3 === 5 && wt3 === 0) { v.ts = vint(); return true; }
    if (f3 === 8 && wt3 === 2) { const ln3 = vint(), e3 = pos + ln3; msg(e3, (f4, wt4) => { if (f4 === 1 && wt4 === 2) { v.vid = str(vint()); return true; } return false; }); return true; }
    return false;
   });
   pos = e2; out.push(v); return true;
  });
  pos = end; return true;
 });
 return out;
}

/* ---------- ODIS přes proxy OpavaGO ---------- */
async function odisProxy(px) {
 const r = await fetch(px, {headers: {'Accept': 'application/json'}}); if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const portal = 'odis';
 const list = Array.isArray(j) ? j : (j.transmitters || j.odis || []);
 const vehicles = [], trains = [];
 for (const t of list) {
  if (!t || !isFinite(t.x) || !isFinite(t.y)) continue;
  const f = String(t.cn || '').split('|');
  if (t.cat === 1) {
   const [cat = '', tn = ''] = String(t.n || f[0] || '').split(' ');
   trains.push({src: portal.toUpperCase(), num: f[2] || tn, cat, lat: t.x, lon: t.y, delay: isFinite(t.dm) ? t.dm : null, head: f[9] || '', cur: f[3] || '', carrier: t.cr || ''});
   continue;
  }
  if (t.t && t.t !== 'H') continue;
  const cis = /^\d{6}$/.test(f[0]) ? f[0] : '';
  vehicles.push({src: portal.toUpperCase(), cis, line: cis ? String(+cis.slice(3)) : f[0], spoj: +f[2] || 0, lat: t.x, lon: t.y,
   delay: isFinite(t.dm) ? t.dm : delayStr(t.ds), last: f[3] || '', next: f[5] || '', from: f[8] || '', head: f[9] || '', low: f[10] === '1',
   plate: (f[11] || '').replace(/^Ev\.\s*č\.\s*/i, '').trim(), carrier: t.cr || '', stand: /stoji/.test(t.ico || '')});
 }
 return {vehicles, trains};
}
function delayStr(ds) { const m = /\$([zp])-?(\d+)~min\.~(\d+)~s/.exec(ds || ''); if (!m) return null; const s = +m[2] * 60 + +m[3]; return (m[1] === 'p' ? -s : s) / 60; }

/* ---------- PID – Golemio ---------- */
async function golemio(token) {
 const r = await fetch('https://api.golemio.cz/v2/vehiclepositions?limit=10000&includeNotTracking=false&includePositions=false', {headers: {'X-Access-Token': token, 'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const out = [];
 for (const f of (j.features || [])) {
  const c = f.geometry && f.geometry.coordinates; if (!c) continue;
  const p = f.properties || {}, lp = p.last_position || {}, tr = p.trip || {}, g = tr.gtfs || {};
  const d = lp.delay && lp.delay.actual;
  out.push({src: 'PID', line: String(g.route_short_name || ''), pidTrip: g.trip_id || '', lat: c[1], lon: c[0], delay: isFinite(d) ? d / 60 : null,
   head: g.trip_headsign || '', bearing: lp.bearing, plate: String(tr.vehicle_registration_number || ''), carrier: (tr.agency_name && (tr.agency_name.real || tr.agency_name.scheduled)) || '', low: !!tr.wheelchair_accessible});
 }
 return out;
}

/* ---------- PID – veřejná mapa mapa.pid.cz ---------- */
async function pidmap() {
 const r = await fetch('https://mapa.pid.cz/getData.php', {headers: {'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const out = [];
 for (const t of (j.trips || [])) {
  if (!isFinite(t.lat) || !isFinite(t.lon) || t.inactive || t.routeType === 2) continue;
  const parts = String(t.tripId || '').split('_');
  out.push({src: 'PID', line: String(t.route || ''), spoj: +parts[1] || 0, pidTrip: t.tripId || '', lat: t.lat, lon: t.lon,
   delay: isFinite(t.delay) ? t.delay / 60 : null, bearing: t.bearing, plate: t.vehicle != null ? String(t.vehicle) : '', low: t.wheelchair === 1, state: t.statePosition || ''});
 }
 return out;
}
/* ---------- PID – mimořádnosti a výluky (RSS) ---------- */
async function pidAlerts() {
 const out = [];
 for (const [u, type] of [['https://pid.cz/feed/rss-mimoradnosti/', 'mimořádnost'], ['https://pid.cz/feed/rss-vyluky/', 'výluka']]) {
  const r = await fetch(u); if (!r.ok) continue;
  const x = await r.text();
  for (const it of x.split('<item>').slice(1)) {
   const g = (tag) => { const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(it); return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : ''; };
   const lines = [...it.matchAll(/<line>([^<]*)<\/line>/g)].map(m => m[1].trim()).filter(Boolean);
   const from = +g('dateFrom'), to = +g('dateTo');
   out.push({src: 'PID', type, title: unent(g('title')), text: unent(g('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 1200), url: g('link'), lines,
    from: from ? from * 1000 : null, to: to ? to * 1000 : null});
  }
 }
 return out;
}
function unent(s) { return String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' '); }

/* ---------- IDS JMK (volitelně vlastní adresa) ---------- */
async function idsjmk(u) {
 const r = await fetch(u, {headers: {'Accept': 'application/json'}});
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const list = j.Vehicles || j.vehicles || (Array.isArray(j) ? j : []);
 return list.filter(v => !v.IsInactive).map(v => ({src: 'IDS JMK', line: String(v.LineName ?? v.lineName ?? v.LineID ?? ''), lat: +(v.Lat ?? v.lat), lon: +(v.Lng ?? v.lon ?? v.lng), delay: isFinite(+(v.Delay ?? v.delay)) ? +(v.Delay ?? v.delay) : null,
  head: String(v.FinalStopName ?? v.finalStop ?? ''), bearing: v.Bearing, plate: String(v.ID ?? ''), low: !!(v.LF ?? v.lowFloor)})).filter(v => isFinite(v.lat) && isFinite(v.lon));
}

/* ---------- Správa železnic ---------- */
async function sz() {
 const r = await fetch('https://mapy.spravazeleznic.cz/serverside/request2.php?module=Layers\\OsVlaky&&action=load');
 if (!r.ok) throw new Error('HTTP ' + r.status);
 const j = await r.json();
 const out = [];
 for (const f of (j.result || [])) {
  const p = f.properties || {}, c = f.geometry && f.geometry.coordinates; if (!c) continue;
  const [lat, lon] = jtsk(c[0], c[1]);
  out.push({src: 'Správa železnic', num: String(p.tn || '').trim(), cat: String(p.tt || '').trim(), name: p.na || '', lat, lon, delay: p.de === '' || p.de == null ? null : +p.de, from: p.fn || '', head: p.ln || '', cur: p.cna || '', next: p.nsn || '', nextT: p.nst || '', carrier: p.d || '', az: p.a});
 }
 return out;
}
/* S-JTSK (EPSG:5514) -> WGS84 */
function jtsk(ex, ny) {
 const X = -ny, Y = -ex, H = 245;
 const n = 0.97992470462083, konst = 12310230.12797036, sinUQ = 0.863499969506341, cosUQ = 0.504348889819882, sinVQ = 0.420215144586493, cosVQ = 0.907424504992097, alfa = 1.000597498371542, k = 1.003419163966575, e = 0.081696831215303;
 const ro = Math.sqrt(X * X + Y * Y), eps = 2 * Math.atan(Y / (ro + X)), D = eps / n, S = 2 * Math.atan(Math.exp(1 / n * Math.log(konst / ro))) - Math.PI / 2;
 const sinS = Math.sin(S), cosS = Math.cos(S), sinU = sinUQ * sinS - cosUQ * cosS * Math.cos(D), cosU = Math.sqrt(1 - sinU * sinU);
 const sinDV = Math.sin(D) * cosS / cosU, cosDV = Math.sqrt(1 - sinDV * sinDV), sinV = sinVQ * cosDV - cosVQ * sinDV, cosV = cosVQ * cosDV + sinVQ * sinDV;
 const Lj = 2 * Math.atan(sinV / (1 + cosV)) / alfa, t = Math.exp(2 / alfa * Math.log((1 + sinU) / cosU / k));
 let pom = (t - 1) / (t + 1), sinB, it = 0;
 do { sinB = pom; pom = t * Math.exp(e * Math.log((1 + e * sinB) / (1 - e * sinB))); pom = (pom - 1) / (pom + 1); } while (Math.abs(pom - sinB) > 1e-15 && ++it < 50);
 const Bj = Math.atan(pom / Math.sqrt(1 - pom * pom));
 const a = 6377397.15508, f1 = 299.152812853, e2 = 1 - (1 - 1 / f1) * (1 - 1 / f1), r = a / Math.sqrt(1 - e2 * Math.sin(Bj) ** 2);
 const x = (r + H) * Math.cos(Bj) * Math.cos(Lj), y = (r + H) * Math.cos(Bj) * Math.sin(Lj), z = ((1 - e2) * r + H) * Math.sin(Bj);
 const dx = 570.69, dy = 85.69, dz = 462.84, wz = -5.2611 / 3600 * Math.PI / 180, wy = -1.58676 / 3600 * Math.PI / 180, wx = -4.99821 / 3600 * Math.PI / 180, m = 3.543e-6;
 const xn = dx + (1 + m) * (x + wz * y - wy * z), yn = dy + (1 + m) * (-wz * x + y + wx * z), zn = dz + (1 + m) * (wy * x - wx * y + z);
 const a2 = 6378137.0, f2 = 298.257223563, ab = f2 / (f2 - 1), p = Math.sqrt(xn * xn + yn * yn), e22 = 1 - (1 - 1 / f2) ** 2;
 const th = Math.atan(zn * ab / p), st = Math.sin(th), ct = Math.cos(th);
 const B = Math.atan((zn + e22 * ab * ab * a2 / ab * st ** 3) / (p - e22 * a2 * ct ** 3)), L = 2 * Math.atan(yn / (p + xn));
 return [B * 180 / Math.PI, L * 180 / Math.PI];
}
