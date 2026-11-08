#!/usr/bin/env python3
"""Fáze 4: trasy linek (geometrie) pro každý vzor.
 - PID: geometrie z PID GTFS (shapes.txt) přes vazbu spoje PID:<trip_id>
 - vlaky, tramvaje: nejkratší cesta po kolejích z OSM (vlastní graf)
 - autobusy, trolejbusy: Valhalla (profil bus) – celá trasa vzoru jedním dotazem, bez otáčení na zastávkách
 - ostatní (lanovky, přívozy, chybějící data): přímka
Použití: python3 shapes.py <work_dir> <valhalla_config> [pid_gtfs_zip]"""
import sys, os, pickle, math, time, json, collections, zipfile, io
import numpy as np
from multiprocessing import Pool
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

work, vcfg = sys.argv[1], sys.argv[2]
pidzip = sys.argv[3] if len(sys.argv) > 3 else None
t0 = time.time()
def log(*a): print('[%6.1fs]' % (time.time() - t0), *a, flush=True)

G = pickle.load(open(os.path.join(work, 'gtfs2.pkl'), 'rb'))
S, P, R, PT, TR = G['stations'], G['platforms'], G['routes'], G['patterns'], G['trips']
LAT0 = 49.8; KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def xy(lat, lon): return (lon * KX, lat * KY)

def mode(rt):
    t = R[rt]['type']
    return {0: 'tram', 1: 'metro', 2: 'rail', 3: 'bus', 4: 'ferry', 7: 'funi', 11: 'bus'}.get(t, 'bus')

def simplify(pts, tol=4.0):
    """Douglas-Peucker v metrech; pts [(lat,lon)]"""
    if len(pts) <= 2: return pts
    X = np.array([xy(a, b) for a, b in pts])
    keep = np.zeros(len(pts), bool); keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1: continue
        A, B = X[a], X[b]; AB = B - A; L = np.hypot(*AB)
        seg = X[a + 1:b]
        if L < 1e-6: d = np.hypot(*(seg - A).T)
        else: d = np.abs(AB[0] * (seg[:, 1] - A[1]) - AB[1] * (seg[:, 0] - A[0])) / L
        i = int(np.argmax(d))
        if d[i] > tol:
            k = a + 1 + i; keep[k] = True; stack.append((a, k)); stack.append((k, b))
    return [pts[i] for i in range(len(pts)) if keep[i]]

# ---------------- PID geometrie ----------------
pid_shape_of_pattern = {}
if pidzip and os.path.exists(pidzip):
    import pandas as pd
    z = zipfile.ZipFile(pidzip)
    trips = pd.read_csv(z.open('trips.txt'), usecols=['trip_id', 'shape_id'], dtype=str)
    tshape = dict(zip(trips.trip_id, trips.shape_id))
    want = {}
    for t in TR:
        rel = t[7]
        if 'PID' in rel and t[0] not in want:
            sid = tshape.get(rel['PID'])
            if sid: want[t[0]] = sid
    log('PID patterns with shape', len(want))
    need = set(want.values())
    sh = pd.read_csv(z.open('shapes.txt'), usecols=['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
                     dtype={'shape_id': str, 'shape_pt_lat': float, 'shape_pt_lon': float, 'shape_pt_sequence': int})
    sh = sh[sh.shape_id.isin(need)].sort_values(['shape_id', 'shape_pt_sequence'])
    shapes = {}
    for sid, g in sh.groupby('shape_id', sort=False):
        shapes[sid] = list(zip(g.shape_pt_lat.round(6), g.shape_pt_lon.round(6)))
    for p, sid in want.items():
        if sid in shapes: pid_shape_of_pattern[p] = shapes[sid]
    log('PID shapes loaded', len(shapes))

def cut_shape(shape, stops, maxd=400):
    """Rozřízne geometrii na úseky mezi zastávkami. Každá zastávka se promítne na geometrii;
    pořadí průmětů musí být neklesající (dynamické programování přes kandidátní polohy –
    zvládne i okružní linky, kde trasa míjí zastávku vícekrát). Vrací seznam úseků nebo None."""
    X = np.array([xy(a, b) for a, b in shape]); n = len(X)
    if n < 2: return None
    segA = X[:-1]; AB = X[1:] - segA; L2 = (AB ** 2).sum(1); L2[L2 == 0] = 1e-9
    cum = np.concatenate([[0], np.cumsum(np.sqrt(L2))])
    cands = []
    for (la, lo) in stops:
        q = np.array(xy(la, lo))
        t = np.clip(((q - segA) * AB).sum(1) / L2, 0, 1)
        proj = segA + AB * t[:, None]; d = np.hypot(*(proj - q).T)
        dmin = d.min()
        if dmin > maxd: return None
        ok = np.where(d <= min(maxd, dmin + 40))[0]
        cs = []; run = [ok[0]]
        for j in ok[1:]:
            if j == run[-1] + 1: run.append(j)
            else: cs.append(run); run = [j]
        cs.append(run)
        best = []
        for r in cs:
            j = r[int(np.argmin(d[r]))]; best.append((float(d[j]), int(j), float(t[j]), float(cum[j] + t[j] * np.sqrt(L2[j]))))
        best.sort(); cands.append(best[:12])
    # DP: minimální součet vzdáleností při neklesajícím pořadí
    INF = 1e18
    prev = [(c[0], None) for c in cands[0]]
    back = [prev]
    for k in range(1, len(cands)):
        cur = []
        for c in cands[k]:
            bv, bi = INF, None
            for pi, pc in enumerate(cands[k - 1]):
                if back[-1][pi][0] < INF and pc[3] <= c[3] + 1 and back[-1][pi][0] < bv: bv, bi = back[-1][pi][0], pi
            cur.append((bv + c[0] if bi is not None else INF, bi))
        back.append(cur)
    last = min(range(len(back[-1])), key=lambda i: back[-1][i][0])
    if back[-1][last][0] >= INF: return None
    pos = [None] * len(cands); ci = last
    for k in range(len(cands) - 1, -1, -1):
        c = cands[k][ci]; pos[k] = (c[1], c[2], c[3]); ci = back[k][ci][1]
    out = []
    for k in range(len(stops) - 1):
        (i1, t1, s1), (i2, t2, s2) = pos[k], pos[k + 1]
        p1 = X[i1] + AB[i1] * t1; p2 = X[i2] + AB[i2] * t2
        pts = [p1] + [X[j] for j in range(i1 + 1, i2 + 1)] + [p2]
        out.append([(y / KY, x / KX) for x, y in pts])
    return out

# ---------------- železniční / tramvajový graf ----------------
def build_rail(kinds):
    ways = pickle.load(open(os.path.join(work, 'rail_ways.pkl'), 'rb'))
    idx = {}; coords = []; rows = []; cols = []; w = []
    for kind, ids, pts, ow in ways:
        if kind not in kinds: continue
        prev = None
        for nid, (la, lo) in zip(ids, pts):
            j = idx.get(nid)
            if j is None:
                j = idx[nid] = len(coords); coords.append(xy(la, lo))
            if prev is not None and prev != j:
                d = math.dist(coords[prev], coords[j]); rows.append(prev); cols.append(j); w.append(max(d, 0.01))
            prev = j
    C = np.array(coords); n = len(C)
    M = coo_matrix((w + w, (rows + cols, cols + rows)), shape=(n, n)).tocsr()
    return C, M, cKDTree(C)

def rail_paths(pairs, kinds, label):
    """pairs: {(a,b)} indexy nástupišť -> dict (a,b)->[(lat,lon)]"""
    if not pairs: return {}
    C, M, T = build_rail(kinds)
    log(label, 'graph nodes', len(C), 'pairs', len(pairs))
    pxy = {}
    for a, b in pairs:
        for x in (a, b):
            if x not in pxy: pxy[x] = xy(P[x]['lat'], P[x]['lon'])
    snap = {}
    for x, q in pxy.items():
        d, i = T.query(q)
        snap[x] = int(i) if d < 400 else None
    bysrc = collections.defaultdict(list)
    for a, b in pairs: bysrc[a].append(b)
    out = {}; fail = 0
    for k, (a, bs) in enumerate(bysrc.items()):
        sa = snap.get(a)
        if sa is None:
            fail += len(bs); continue
        targets = [(b, snap.get(b)) for b in bs]
        maxd = max(math.dist(pxy[a], pxy[b]) for b in bs)
        dist, pred = dijkstra(M, directed=False, indices=sa, return_predecessors=True, limit=maxd * 2.2 + 3000)
        for b, sb in targets:
            if sb is None or not np.isfinite(dist[sb]):
                fail += 1; continue
            straight = math.dist(pxy[a], pxy[b])
            if dist[sb] > 3.0 * straight + 2000:
                fail += 1; continue
            path = [sb]; j = sb
            while j != sa and j >= 0:
                j = pred[j]; path.append(j)
                if len(path) > 200000: break
            path.reverse()
            pts = [(C[i][1] / KY, C[i][0] / KX) for i in path]
            if len(pts) < 2: pts = [(P[a]['lat'], P[a]['lon']), (P[b]['lat'], P[b]['lon'])]
            out[(a, b)] = simplify(pts, 3.0)
        if k % 500 == 0: log(label, k, '/', len(bysrc), 'fail', fail)
    log(label, 'done', len(out), 'fail', fail)
    return out

# ---------------- Valhalla ----------------
_actor = None
def _vinit(cfg):
    global _actor
    import valhalla
    _actor = valhalla.Actor(cfg)

def decode6(s):
    pts = []; i = lat = lon = 0
    while i < len(s):
        for which in (0, 1):
            sh = res = 0
            while True:
                b = ord(s[i]) - 63; i += 1; res |= (b & 0x1f) << sh; sh += 5
                if b < 0x20: break
            d = ~(res >> 1) if res & 1 else res >> 1
            if which == 0: lat += d
            else: lon += d
        pts.append((lat / 1e6, lon / 1e6))
    return pts

BUS_OPT = {'bus': {'use_highways': 0.6, 'use_tolls': 1.0, 'use_living_streets': 0.5, 'ignore_access': False}}
def _vroute(job):
    """Jeden úsek mezi dvěma nástupišti (záloha, když celá trasa nejde spočítat)."""
    (a, b, la, lo, lb, lob) = job
    q = {'locations': [{'lat': la, 'lon': lo, 'type': 'break', 'radius': 25}, {'lat': lb, 'lon': lob, 'type': 'break', 'radius': 25}],
         'costing': 'bus', 'directions_type': 'none', 'costing_options': json.loads(json.dumps(BUS_OPT))}
    for attempt in range(2):
        try:
            r = json.loads(_actor.route(json.dumps(q)))
            return (a, b, decode6(r['trip']['legs'][0]['shape']), r['trip']['summary']['length'] * 1000)
        except Exception:
            q['costing_options']['bus']['ignore_access'] = True
    return (a, b, None, 0)

RANK = {'motorway': 0, 'trunk': 1, 'primary': 2, 'secondary': 3, 'tertiary': 4, 'unclassified': 5, 'residential': 6, 'service_other': 7}
_snapc = {}
def _snap(q):
    """Bod zastávky na silnici: z kandidátů do 30 m vybere hlavnější silnici, pokud je nejvýš o 12 m dál
    než nejbližší (zastávka u křižovatky se jinak chytí na boční ulici a trasa objíždí blok)."""
    if q in _snapc: return _snapc[q]
    try:
        r = json.loads(_actor.locate(json.dumps({'locations': [{'lat': q[0], 'lon': q[1], 'radius': 30}], 'costing': 'bus', 'verbose': True})))
        E = [(e['distance'], RANK.get(e['edge'].get('classification', {}).get('classification'), 8), e['correlated_lat'], e['correlated_lon']) for e in (r[0].get('edges') or [])]
    except Exception:
        E = []
    res = q
    if E:
        dmin = min(e[0] for e in E)
        ok = [e for e in E if e[0] <= dmin + 12 and e[0] <= 30]
        if ok:
            best = min(ok, key=lambda e: (e[1], e[0])); res = (best[2], best[3])
    _snapc[q] = res
    return res

def _dist_to_path(q, X):
    A_ = X[:-1]; B_ = X[1:]; AB = B_ - A_; L2 = (AB ** 2).sum(1); L2[L2 == 0] = 1e-9
    t = np.clip(((q - A_) * AB).sum(1) / L2, 0, 1); P_ = A_ + AB * t[:, None]
    return float(np.hypot(*(P_ - q).T).min())

def _plen(pts): return sum(math.dist(xy(*pts[i]), xy(*pts[i + 1])) for i in range(len(pts) - 1))

def _vreq(pts, W, T):
    n = len(pts)
    locs = []
    for k in W:
        la, lo = _snap(pts[k])
        locs.append({'lat': la, 'lon': lo, 'type': 'break' if k in (0, n - 1) else T})
    q = {'locations': locs, 'costing': 'bus', 'directions_type': 'none', 'costing_options': BUS_OPT}
    r = json.loads(_actor.route(json.dumps(q)))
    return [p for l in r['trip']['legs'] for p in decode6(l['shape'])]

def _viter(pts, osm, T):
    """Trasa přes nejméně zastávek: začne jen koncovými, pak přidává ty, které leží daleko od trasy
    (sloupek z OSM > 30 m, poloha z CIS JŘ > 70 m). Zastávky u silnice se na trasu jen promítnou –
    nevznikají odbočky k nepřesně umístěným zastávkám."""
    n = len(pts); W = {0, n - 1}
    PX = [np.array(xy(*p)) for p in pts]
    sh = None
    for it in range(6):
        try: sh = _vreq(pts, sorted(W), T)
        except Exception:
            if T == 'break': raise
            sh = _vreq(pts, sorted(W), 'break')
        X = np.array([xy(*p) for p in sh])
        if len(X) < 2: break
        far = [k for k in range(n) if k not in W and _dist_to_path(PX[k], X) > (30 if osm[k] else 70)]
        if not far:
            if len(W) < n and cut_shape(sh, pts) is None:
                W = set(range(n)); continue          # trasa míjí zastávky v jiném pořadí – vést přes všechny
            break
        W |= set(far)
    return sh

def _despike(sh, maxdepth=90, step=2.0):
    """Odstraní „háčky“ – zajetí do boční ulice a návrat po stejné cestě (hloubka do 90 m)."""
    X = np.array([xy(*p) for p in sh])
    if len(X) < 3: return sh
    seg_ = np.hypot(*(X[1:] - X[:-1]).T); cum = np.concatenate([[0], np.cumsum(seg_)])
    if cum[-1] < 10: return sh
    s_ = np.arange(0, cum[-1], step); Y = np.c_[np.interp(s_, cum, X[:, 0]), np.interp(s_, cum, X[:, 1])]
    Y = np.vstack([Y, X[-1]])
    keep = np.ones(len(Y), bool); j = 3; nrem = 0
    while j < len(Y) - 3:
        a = Y[j] - Y[j - 3]; b = Y[j + 3] - Y[j]; na = np.hypot(*a); nb = np.hypot(*b)
        if na > 1 and nb > 1 and (a @ b) / (na * nb) < -0.8:
            k = 1
            while j - k >= 0 and j + k < len(Y) and np.hypot(*(Y[j - k] - Y[j + k])) < 9: k += 1
            depth = np.hypot(*(Y[j - k:j + k + 1] - Y[max(j - k, 0)]).T).max()
            if k >= 3 and depth < maxdepth:
                keep[j - k + 1:j + k] = False; nrem += 1; j += k; continue
        j += 1
    if not nrem: return sh
    return simplify([(y / KY, x / KX) for x, y in Y[keep]], 2.0)

def _vpattern(job):
    """Celá trasa vzoru: varianta bez otáčení na zastávkách (break_through) a varianta s povoleným
    otočením (break, poté odstranění háčků); bere se break_through, pokud není delší o víc než 2 %.
    Výsledek se rozřízne na úseky promítnutím zastávek."""
    key, pts, osm = job
    a = b = None
    try: a = _despike(_viter(pts, osm, 'break'))
    except Exception: pass
    try: b = _viter(pts, osm, 'break_through')
    except Exception: pass
    order = []
    if b and (not a or _plen(b) <= _plen(a) * 1.02 + 30): order = [b, a]
    else: order = [a, b]
    for sh in order:
        if not sh or len(sh) < 2: continue
        parts = cut_shape(sh, pts)
        if parts: return (key, parts)
    return (key, None)

def heading(p, q):
    (y1, x1), (y2, x2) = p, q
    dx = (x2 - x1) * math.cos(math.radians(y1)); dy = y2 - y1
    if abs(dx) + abs(dy) < 1e-7: return None
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360

# ---------------- sběr úseků ----------------
TEST = os.environ.get('SHAPES_TEST')   # "s,w,n,e" – jen vzory v tomto výřezu (ladění)
if TEST:
    _s, _w, _n, _e = map(float, TEST.split(','))
    _in = lambda x: _s <= P[x]['lat'] <= _n and _w <= P[x]['lon'] <= _e
    ONLY = {i for i, pt in enumerate(PT) if all(_in(x) for x in pt['stops'])}
    cache_f = os.path.join(work, 'seg_cache_test.pkl')
else: ONLY = None
need = {'bus': set(), 'rail': set(), 'tram': set()}
for pi_, pt in enumerate(PT):
    if ONLY is not None and pi_ not in ONLY: continue
    if pi_ in pid_shape_of_pattern: continue
    m = mode(pt['route']); seq = pt['stops']
    if m == 'bus':
        need['bus'].add(tuple(seq)); continue
    for k in range(len(seq) - 1):
        a, b = seq[k], seq[k + 1]
        if a == b: continue
        if m in ('rail', 'metro'): need['rail'].add((a, b))
        elif m == 'tram': need['tram'].add((a, b))
log('bus sequences', len(need['bus']), 'rail', len(need['rail']), 'tram', len(need['tram']), 'pid patterns', len(pid_shape_of_pattern))

seg = {}
if not TEST: cache_f = os.path.join(work, 'seg_cache.pkl')
if os.path.exists(cache_f):
    seg = pickle.load(open(cache_f, 'rb')); log('cache', len(seg))
seg_rail = rail_paths({p for p in need['rail'] if ('rail',) + p not in seg}, {'rail', 'narrow_gauge', 'light_rail'}, 'rail')
for k, v in seg_rail.items(): seg[('rail',) + k] = v
seg_tram = rail_paths({p for p in need['tram'] if ('tram',) + p not in seg}, {'tram', 'light_rail'}, 'tram')
for k, v in seg_tram.items(): seg[('tram',) + k] = v
pickle.dump(seg, open(cache_f, 'wb'))

def straight_m(a, b): return math.dist(xy(*a), xy(*b))
busleg = {}   # tuple(stops) -> [úseky]
jobs = []; IDX = {}
for seq in need['bus']:
    if ('busseq', seq) in seg: busleg[seq] = seg[('busseq', seq)]; continue
    # sloučit po sobě jdoucí shodné polohy
    pts = []; osm = []; idx = []
    for x in seq:
        q = (P[x]['lat'], P[x]['lon'])
        if not pts or straight_m(pts[-1], q) > 3:
            pts.append(q); osm.append(P[x].get('src') == 'osm')
        idx.append(len(pts) - 1)
    if len(pts) < 2:
        busleg[seq] = [None] * (len(seq) - 1); continue
    jobs.append((seq, pts, osm)); IDX[seq] = idx
log('valhalla pattern jobs', len(jobs))
bad = 0
with Pool(4, initializer=_vinit, initargs=(vcfg,)) as pool:
    for i, (seq, parts) in enumerate(pool.imap_unordered(_vpattern, jobs, chunksize=8)):
        idx = IDX.pop(seq)
        if parts is None: bad += 1
        out = []
        for k in range(len(seq) - 1):
            i1, i2 = idx[k], idx[k + 1]
            if i1 == i2: out.append(None)                                   # stejná poloha
            elif parts is not None and i2 == i1 + 1: out.append(simplify(parts[i1], 3.0))
            else: out.append(False)                                          # nepodařilo se
        busleg[seq] = out
        if i % 2000 == 0: log('valhalla', i, '/', len(jobs), 'bad', bad)
    log('valhalla patterns done, bad', bad)
    # záloha po úsecích pro vzory, které se nepodařilo spočítat celé
    pairs = set()
    for seq, out in busleg.items():
        for k, s_ in enumerate(out):
            if s_ is False: pairs.add((seq[k], seq[k + 1]))
    pj = [(a, b, P[a]['lat'], P[a]['lon'], P[b]['lat'], P[b]['lon']) for (a, b) in pairs if ('bus', a, b) not in seg]
    log('pair fallback jobs', len(pj))
    for (a, b, pts, L) in pool.imap_unordered(_vroute, pj, chunksize=64):
        if pts is None: continue
        if L > 4 * math.dist(xy(P[a]['lat'], P[a]['lon']), xy(P[b]['lat'], P[b]['lon'])) + 1500: continue
        seg[('bus', a, b)] = simplify(pts, 3.0)
for seq, out in busleg.items():
    for k, s_ in enumerate(out):
        if s_ is False: out[k] = seg.get(('bus', seq[k], seq[k + 1]))
    seg[('busseq', seq)] = out
pickle.dump(seg, open(cache_f, 'wb'))

# ---------------- složení geometrie vzorů ----------------
SH = {}
nstraight = 0
for pi_, pt in enumerate(PT):
    if ONLY is not None and pi_ not in ONLY: continue
    seq = pt['stops']; m = mode(pt['route'])
    stops_ll = [(P[x]['lat'], P[x]['lon']) for x in seq]
    parts = None
    if pi_ in pid_shape_of_pattern:
        parts = cut_shape(pid_shape_of_pattern[pi_], stops_ll)
        if parts: parts = [simplify(pp, 3.0) for pp in parts]
    if parts is None:
        if m == 'bus':
            parts = list(busleg.get(tuple(seq)) or [None] * (len(seq) - 1))
        else:
            parts = []
            for k in range(len(seq) - 1):
                a, b = seq[k], seq[k + 1]
                parts.append(seg.get(({'rail': 'rail', 'metro': 'rail', 'tram': 'tram'}.get(m, 'x'), a, b)))
        for k in range(len(parts)):
            if parts[k] is None:
                if seq[k] != seq[k + 1] and straight_m(stops_ll[k], stops_ll[k + 1]) > 3: nstraight += 1
                parts[k] = [stops_ll[k], stops_ll[k + 1]]
    # geometrie jde po silnici/kolejích – zastávky se na ni promítají, nevkládají se do ní
    pts = [tuple(parts[0][0])]; sx = [0]
    for k, s in enumerate(parts):
        for q in s[1:]:
            q = tuple(q)
            if q != pts[-1]: pts.append(q)
        sx.append(len(pts) - 1)
    SH[pi_] = (pts, sx)
log('pattern shapes', len(SH), 'straight segments', nstraight)
pickle.dump(SH, open(os.path.join(work, 'shapes_test.pkl' if TEST else 'shapes.pkl'), 'wb'), protocol=5)
log('saved')
