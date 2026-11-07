#!/usr/bin/env python3
"""Fáze 4: trasy linek (geometrie) pro každý vzor.
 - PID: geometrie z PID GTFS (shapes.txt) přes vazbu spoje PID:<trip_id>
 - vlaky, tramvaje: nejkratší cesta po kolejích z OSM (vlastní graf)
 - autobusy, trolejbusy: Valhalla (profil bus) mezi po sobě jdoucími nástupišti
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

def cut_shape(shape, stops):
    """Rozřízne geometrii na úseky mezi zastávkami (monotónní projekce). Vrací seznam úseků nebo None."""
    X = np.array([xy(a, b) for a, b in shape]); n = len(X)
    if n < 2: return None
    segA = X[:-1]; segB = X[1:]; AB = segB - segA; L2 = (AB ** 2).sum(1); L2[L2 == 0] = 1e-9
    cum = np.concatenate([[0], np.cumsum(np.sqrt(L2))])
    pos = []; last = -1.0
    for (la, lo) in stops:
        q = np.array(xy(la, lo))
        t = np.clip(((q - segA) * AB).sum(1) / L2, 0, 1)
        proj = segA + AB * t[:, None]; d = np.hypot(*(proj - q).T)
        s = cum[:-1] + t * np.sqrt(L2)
        d = np.where(s >= last - 1, d, d + 1e6)   # musí jít dopředu
        i = int(np.argmin(d))
        if d[i] > 400: return None
        last = s[i]; pos.append((i, float(t[i]), s[i]))
    out = []
    for k in range(len(stops) - 1):
        (i1, t1, s1), (i2, t2, s2) = pos[k], pos[k + 1]
        if s2 < s1: return None
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
            pts = [(P[a]['lat'], P[a]['lon'])] + [(C[i][1] / KY, C[i][0] / KX) for i in path] + [(P[b]['lat'], P[b]['lon'])]
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

def _vroute(job):
    (a, b, la, lo, lb, lob, ha, hb) = job
    loc_a = {'lat': la, 'lon': lo, 'type': 'break', 'radius': 25}
    loc_b = {'lat': lb, 'lon': lob, 'type': 'break', 'radius': 25}
    if ha is not None: loc_a['heading'] = ha; loc_a['heading_tolerance'] = 70
    if hb is not None: loc_b['heading'] = hb; loc_b['heading_tolerance'] = 70
    q = {'locations': [loc_a, loc_b], 'costing': 'bus', 'directions_type': 'none',
         'costing_options': {'bus': {'use_highways': 0.6, 'use_tolls': 1.0, 'use_living_streets': 0.5, 'ignore_access': False}}}
    for attempt in range(2):
        try:
            r = json.loads(_actor.route(json.dumps(q)))
            pts = decode6(r['trip']['legs'][0]['shape'])
            return (a, b, pts, r['trip']['summary']['length'] * 1000)
        except Exception:
            loc_a.pop('heading', None); loc_b.pop('heading', None)
            q['costing_options']['bus']['ignore_access'] = True
    return (a, b, None, 0)

def heading(p, q):
    (y1, x1), (y2, x2) = p, q
    dx = (x2 - x1) * math.cos(math.radians(y1)); dy = y2 - y1
    if abs(dx) + abs(dy) < 1e-7: return None
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360

# ---------------- sběr úseků ----------------
need = {'bus': {}, 'rail': set(), 'tram': set()}
for pi_, pt in enumerate(PT):
    if pi_ in pid_shape_of_pattern: continue
    m = mode(pt['route']); seq = pt['stops']
    for k in range(len(seq) - 1):
        a, b = seq[k], seq[k + 1]
        if a == b: continue
        if m == 'bus':
            if (a, b) not in need['bus']:
                pa = (P[a]['lat'], P[a]['lon']); pb = (P[b]['lat'], P[b]['lon'])
                prev = (P[seq[k - 1]]['lat'], P[seq[k - 1]]['lon']) if k > 0 else None
                nxt = (P[seq[k + 2]]['lat'], P[seq[k + 2]]['lon']) if k + 2 < len(seq) else None
                ha = heading(prev, pb) if prev else heading(pa, pb)
                hb = heading(pa, nxt) if nxt else heading(pa, pb)
                need['bus'][(a, b)] = (ha, hb)
        elif m == 'rail': need['rail'].add((a, b))
        elif m == 'tram': need['tram'].add((a, b))
log('segments bus', len(need['bus']), 'rail', len(need['rail']), 'tram', len(need['tram']), 'pid patterns', len(pid_shape_of_pattern))

seg = {}
cache_f = os.path.join(work, 'seg_cache.pkl')
if os.path.exists(cache_f):
    seg = pickle.load(open(cache_f, 'rb')); log('cache', len(seg))
seg_rail = rail_paths({p for p in need['rail'] if ('rail',) + p not in seg}, {'rail', 'narrow_gauge', 'light_rail'}, 'rail')
for k, v in seg_rail.items(): seg[('rail',) + k] = v
seg_tram = rail_paths({p for p in need['tram'] if ('tram',) + p not in seg}, {'tram', 'light_rail'}, 'tram')
for k, v in seg_tram.items(): seg[('tram',) + k] = v
pickle.dump(seg, open(cache_f, 'wb'))

jobs = []
for (a, b), (ha, hb) in need['bus'].items():
    if ('bus', a, b) in seg: continue
    jobs.append((a, b, P[a]['lat'], P[a]['lon'], P[b]['lat'], P[b]['lon'],
                 None if ha is None else int(ha), None if hb is None else int(hb)))
log('valhalla jobs', len(jobs))
bad = 0
with Pool(4, initializer=_vinit, initargs=(vcfg,)) as pool:
    for i, (a, b, pts, L) in enumerate(pool.imap_unordered(_vroute, jobs, chunksize=64)):
        if pts is None:
            bad += 1; continue
        straight = math.dist(xy(P[a]['lat'], P[a]['lon']), xy(P[b]['lat'], P[b]['lon']))
        if L > 4 * straight + 1500:   # nesmyslná objížďka -> přímka
            bad += 1; continue
        seg[('bus', a, b)] = simplify(pts, 4.0)
        if i % 20000 == 0:
            log('valhalla', i, '/', len(jobs), 'bad', bad)
            pickle.dump(seg, open(cache_f, 'wb'))
log('valhalla done bad', bad)
pickle.dump(seg, open(cache_f, 'wb'))

# ---------------- složení geometrie vzorů ----------------
SH = {}
nstraight = 0
for pi_, pt in enumerate(PT):
    seq = pt['stops']; m = mode(pt['route'])
    stops_ll = [(P[x]['lat'], P[x]['lon']) for x in seq]
    parts = None
    if pi_ in pid_shape_of_pattern:
        parts = cut_shape(pid_shape_of_pattern[pi_], stops_ll)
        if parts: parts = [simplify(pp, 3.0) for pp in parts]
    if parts is None:
        parts = []
        for k in range(len(seq) - 1):
            a, b = seq[k], seq[k + 1]
            key = ({'bus': 'bus', 'rail': 'rail', 'tram': 'tram'}.get(m, 'x'), a, b)
            s = seg.get(key)
            if s is None:
                s = [stops_ll[k], stops_ll[k + 1]]; nstraight += 1
            parts.append(s)
    pts = [stops_ll[0]]; sx = [0]
    for k, s in enumerate(parts):
        body = list(s[1:-1]) + [stops_ll[k + 1]]
        for q in body:
            if q != pts[-1]: pts.append(q)
        sx.append(len(pts) - 1)
    SH[pi_] = (pts, sx)
log('pattern shapes', len(SH), 'straight segments', nstraight)
pickle.dump(SH, open(os.path.join(work, 'shapes.pkl'), 'wb'), protocol=5)
log('saved')
