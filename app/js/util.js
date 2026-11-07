/* ===== mhdGO – společné funkce ===== */
const MG = window.MG = window.MG || {};
(function(){
 const LS = (()=>{try{const k='__t';localStorage.setItem(k,'1');localStorage.removeItem(k);return localStorage}catch(_){return null}})();
 MG.store = {
  get(k, d){try{const v=LS&&LS.getItem('mhdgo-'+k);return v==null?d:JSON.parse(v)}catch(_){return d}},
  set(k, v){try{LS&&LS.setItem('mhdgo-'+k, JSON.stringify(v))}catch(_){}}
 };
 const saved = MG.store.get('config', {}) || {};
 /* Mapbox token: vložený při sestavení, uložený v nastavení, nebo jednorázově přes #mapbox=pk… v adrese */
 { const m = location.hash.match(/mapbox=(pk\.[\w.-]+)/); if (m) { saved.mapbox = m[1]; MG.store.set('config', saved); history.replaceState(null, '', location.pathname + location.search); } }
 const BRANCH = 'claude/mhdgo-ceska-republika-c1uwdw';
 const bases = [];
 if (saved.data) bases.push(saved.data);
 if (/^https?:/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.host)) bases.push(new URL('data/', location.href).href);
 bases.push('https://raw.githubusercontent.com/prerekhu-cloud/mhd-app/HEAD/data/');
 bases.push('https://raw.githubusercontent.com/prerekhu-cloud/mhd-app/refs/heads/' + BRANCH + '/data/');
 MG.cfg = {
  MAPBOX: saved.mapbox || '@MAPBOX@',
  DATA: bases,
  ODIS: saved.odis ?? 'https://opavago.prerekhu.workers.dev/',
  WORKER: saved.worker || '',
  SZ: 'https://mapy.spravazeleznic.cz/serverside/request2.php?module=Layers\\OsVlaky&&action=load',
  PHOTON: 'https://photon.komoot.io/api/',
  VERSION: '1.3'
 };
 MG.$ = id => document.getElementById(id);
 MG.isWide = () => matchMedia('(min-width:900px) and (min-height:521px), (orientation:landscape) and (max-height:520px)').matches;
 MG.qs = (s, r) => (r || document).querySelector(s);
 MG.qsa = (s, r) => [...(r || document).querySelectorAll(s)];
 MG.h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 MG.fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
 MG.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
 MG.pad = n => String(n).padStart(2, '0');
 MG.hm = m => { m = Math.round(m); m = ((m % 1440) + 1440) % 1440; return Math.floor(m / 60) + ':' + MG.pad(m % 60); };
 MG.hm2 = m => { m = Math.round(m); m = ((m % 1440) + 1440) % 1440; return MG.pad(Math.floor(m / 60)) + ':' + MG.pad(m % 60); };
 MG.dist = (a, b, c, d) => { const R = 6371000, p = Math.PI / 180, x = (d - b) * p * Math.cos((a + c) / 2 * p), y = (c - a) * p; return Math.sqrt(x * x + y * y) * R; };
 MG.bearing = (a, b, c, d) => { const p = Math.PI / 180, y = Math.sin((d - b) * p) * Math.cos(c * p), x = Math.cos(a * p) * Math.sin(c * p) - Math.sin(a * p) * Math.cos(c * p) * Math.cos((d - b) * p); return (Math.atan2(y, x) / p + 360) % 360; };
 MG.fmtDist = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
 MG.decode = (s) => { const out = []; let i = 0, la = 0, lo = 0; while (i < s.length) { for (let w = 0; w < 2; w++) { let sh = 0, r = 0, b; do { b = s.charCodeAt(i++) - 63; r |= (b & 31) << sh; sh += 5 } while (b >= 32); const d = r & 1 ? ~(r >> 1) : r >> 1; if (w) lo += d; else la += d } out.push([la / 1e5, lo / 1e5]) } return out; };
 MG.debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms) } };
 MG.sleep = ms => new Promise(r => setTimeout(r, ms));
 /* čas v Praze bez ohledu na časové pásmo zařízení */
 const PF = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
 MG.pragueParts = (d) => { const o = {}; for (const p of PF.formatToParts(d || new Date())) o[p.type] = p.value; return {y: +o.year, mo: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second, ymd: o.year + '-' + o.month + '-' + o.day}; };
 MG.timeOffset = 0; /* ms – pro ladění */
 MG.now = () => new Date(Date.now() + MG.timeOffset);
 MG.nowMin = () => { const p = MG.pragueParts(MG.now()); return p.h * 60 + p.mi + p.s / 60; };
 MG.ymdAdd = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
 MG.dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
 MG.dowName = ymd => ['neděle','pondělí','úterý','středa','čtvrtek','pátek','sobota'][new Date(ymd + 'T12:00:00Z').getUTCDay()];
 MG.toast = (msg, ms) => { const t = MG.$('toast'); if (!t) return; t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), ms || 2600); };
 MG.err = (tag, e) => { try { console.warn('[mhdGO]', tag, e) } catch (_) {} };
 window.addEventListener('error', e => MG.err('chyba', e.error || e.message));
 window.addEventListener('unhandledrejection', e => { MG.err('promise', e.reason); });
 /* stahování dat s náhradními zdroji */
 MG.fetchJSON = async (path, opt) => {
  let lastErr;
  const order = MG._goodBase ? [MG._goodBase, ...MG.cfg.DATA.filter(b => b !== MG._goodBase)] : MG.cfg.DATA;
  for (const b of order) {
   try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), (opt && opt.timeout) || 45000);
    const r = await fetch(b + path, {signal: ctl.signal, cache: 'default'});
    clearTimeout(to);
    if (!r.ok) throw Error('HTTP ' + r.status);
    const j = await r.json(); MG._goodBase = b; return j;
   } catch (e) { lastErr = e; }
  }
  throw lastErr || Error('Data nejsou dostupná');
 };
 MG.colorMix = (hex, t, to) => { /* t: 0..1 směrem k barvě "to" */ const a = parseInt(hex.slice(1), 16), b = parseInt((to || '#ffffff').slice(1), 16); const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t; return '#' + [r, g, bl].map(x => Math.round(x).toString(16).padStart(2, '0')).join(''); };
 MG.events = {}; MG.on = (n, f) => (MG.events[n] = MG.events[n] || []).push(f); MG.emit = (n, ...a) => (MG.events[n] || []).forEach(f => { try { f(...a) } catch (e) { MG.err(n, e) } });
})();
