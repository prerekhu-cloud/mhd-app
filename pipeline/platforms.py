#!/usr/bin/env python3
"""Fáze 3: zpřesnění nástupišť.
CIS JŘ má u mnoha zastávek jediné „nástupiště“ se souřadnicí zastávky, ačkoli autobusy v každém směru
stojí na jiné straně silnice. Nástupiště proto rozdělíme podle směru jízdy (shluky azimutů spojů)
a umístíme je na odpovídající zastávkové sloupky z OpenStreetMap (strana silnice vpravo ve směru jízdy).
Kde OSM sloupky chybí, nástupiště odsadíme o několik metrů vpravo od osy.
Použití: python3 platforms.py <work_dir>"""
import sys, os, pickle, math, re, time, collections, unicodedata
import numpy as np
from scipy.spatial import cKDTree
from scipy.optimize import linear_sum_assignment

work = sys.argv[1]
t0 = time.time()
def log(*a): print('[%6.1fs]' % (time.time() - t0), *a, flush=True)

G = pickle.load(open(os.path.join(work, 'gtfs.pkl'), 'rb'))
OSM = pickle.load(open(os.path.join(work, 'osm_stops.pkl'), 'rb'))
S, P, R, PT = G['stations'], G['platforms'], G['routes'], G['patterns']

# chybějící souřadnice nástupišť doplň interpolací ze sousedních zastávek ve vzorech
_fill = collections.defaultdict(list)
for pt in PT:
    seq = pt['stops']
    for k, x in enumerate(seq):
        if P[x]['lat'] is not None: continue
        a = next((P[seq[j]] for j in range(k - 1, -1, -1) if P[seq[j]]['lat'] is not None), None)
        b = next((P[seq[j]] for j in range(k + 1, len(seq)) if P[seq[j]]['lat'] is not None), None)
        if a and b: _fill[x].append(((a['lat'] + b['lat']) / 2, (a['lon'] + b['lon']) / 2))
        elif a or b: _fill[x].append(((a or b)['lat'] + 0.002, (a or b)['lon'] + 0.002))
for x, v in _fill.items():
    P[x]['lat'] = sum(q[0] for q in v) / len(v); P[x]['lon'] = sum(q[1] for q in v) / len(v); P[x]['guess'] = True
    s_ = S[P[x]['st']]
    if s_['lat'] is None: s_['lat'], s_['lon'] = P[x]['lat'], P[x]['lon']
print('filled missing coords', len(_fill), 'still missing', sum(1 for p in P if p['lat'] is None))
for p in P:
    if p['lat'] is None: p['lat'], p['lon'] = 0.0, 0.0

LAT0 = 49.8
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def xy(lat, lon): return (lon * KX, lat * KY)
def ll(x, y): return (y / KY, x / KX)

def fold(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r'\b(zel st|zst|z st|aut st|aut nadr|nadr)\b', lambda m: m.group(0), s)
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def name_keys(n):
    """Klíče pro porovnání názvů: celý název a poslední části za čárkou."""
    f = fold(n); parts = [fold(x) for x in n.split(',')]
    keys = {f}
    if len(parts) > 1:
        keys.add(fold(','.join(n.split(',')[1:])))
        keys.add(parts[-1])
    return {k for k in keys if k}

# --- OSM kandidáti ---
osm_xy = np.array([xy(o[1], o[2]) for o in OSM]) if OSM else np.zeros((0, 2))
tree = cKDTree(osm_xy) if len(osm_xy) else None
osm_keys = [name_keys(o[3].get('name', '')) | name_keys(o[3].get('official_name', '')) for o in OSM]
def osm_kind(t):
    if t.get('railway') in ('tram_stop',) or t.get('tram') == 'yes': return 'tram'
    if t.get('railway') in ('station', 'halt') or t.get('train') == 'yes' or t.get('railway') == 'platform': return 'rail'
    if t.get('highway') == 'bus_stop' or t.get('bus') == 'yes' or t.get('trolleybus') == 'yes': return 'bus'
    if t.get('public_transport') == 'platform': return 'bus'
    return 'pos'  # stop_position

# --- směry jízdy na nástupištích ---
mode_of_route = {}
for i, r in enumerate(R):
    t = r['type']
    mode_of_route[i] = 'rail' if t in (1, 2, 7) else 'tram' if t == 0 else 'bus'

st_xy = {}
for i, s in enumerate(S):
    if s['lat'] is not None: st_xy[i] = xy(s['lat'], s['lon'])
pl_xy = [xy(p['lat'], p['lon']) if p['lat'] is not None else None for p in P]

def bearing_vec(a, b):
    if a is None or b is None: return None
    dx, dy = b[0] - a[0], b[1] - a[1]; d = math.hypot(dx, dy)
    return (dx / d, dy / d) if d > 1 else None

usage = collections.defaultdict(list)   # platform -> [(pattern, pos, unit vec, weight)]
for pi_, pt in enumerate(PT):
    seq = pt['stops']; m = mode_of_route[pt['route']]
    pts = [st_xy.get(P[x]['st']) or pl_xy[x] for x in seq]
    for k, x in enumerate(seq):
        a = pts[k - 1] if k > 0 else None; b = pts[k + 1] if k + 1 < len(seq) else None
        v = None
        if pts[k] is None:
            usage[x].append((pi_, k, None, pt['n'], m)); continue
        if a is not None and b is not None:
            v1 = bearing_vec(a, pts[k]); v2 = bearing_vec(pts[k], b)
            if v1 and v2: v = (v1[0] + v2[0], v1[1] + v2[1])
            else: v = v1 or v2 or bearing_vec(a, b)
        elif b is not None: v = bearing_vec(pts[k], b)
        elif a is not None: v = bearing_vec(a, pts[k])
        if v:
            n = math.hypot(*v)
            if n > 0: v = (v[0] / n, v[1] / n)
            else: v = None
        usage[x].append((pi_, k, v, pt['n'], m))

def cluster_dirs(us):
    """Shluky azimutů (max. 3), sloučení shluků bližších než 70°."""
    vs = [(u[2], u[3]) for u in us if u[2] is not None]
    if not vs: return [(None, [i for i in range(len(us))])]
    cl = []  # [sumx, sumy, members]
    for i, u in enumerate(us):
        v = u[2]
        if v is None: continue
        best = None; bd = -2
        for c in cl:
            n = math.hypot(c[0], c[1]); d = (c[0] * v[0] + c[1] * v[1]) / n if n else -2
            if d > bd: bd, best = d, c
        if best is not None and bd > math.cos(math.radians(70)):
            best[0] += v[0] * u[3]; best[1] += v[1] * u[3]; best[2].append(i)
        else:
            cl.append([v[0] * u[3], v[1] * u[3], [i]])
    # členové bez směru -> největší shluk
    nodir = [i for i, u in enumerate(us) if u[2] is None]
    if cl:
        big = max(cl, key=lambda c: len(c[2])); big[2].extend(nodir)
    cl.sort(key=lambda c: -sum(us[i][3] for i in c[2]))
    cl = cl[:3] if len(cl) > 3 else cl
    # ořezané shluky
    assigned = set(i for c in cl for i in c[2])
    for i in range(len(us)):
        if i not in assigned: cl[0][2].append(i)
    out = []
    for c in cl:
        n = math.hypot(c[0], c[1]); out.append(((c[0] / n, c[1] / n) if n else None, c[2]))
    return out

new_pl = []       # nová nástupiště
remap = {}        # (old platform, pattern, pos) -> new platform
stats = collections.Counter()
for si, s in enumerate(S):
    pls = s['pl']
    if not pls: continue
    used = [p for p in pls if usage.get(p)]
    if not used:
        continue
    modes = collections.Counter(u[4] for p in used for u in usage[p])
    mode = modes.most_common(1)[0][0]
    distinct = len({(round(P[p]['lat'], 5), round(P[p]['lon'], 5)) for p in used}) > 1
    own = any(P[p]['own'] for p in used)
    sxy = st_xy.get(si) or pl_xy[used[0]]
    if mode == 'rail' or (own and distinct) or sxy is None:
        # vlastní přesné souřadnice nebo železnice: beze změny
        for p in used:
            j = len(new_pl)
            new_pl.append({'orig': p, 'st': si, 'lat': P[p]['lat'], 'lon': P[p]['lon'], 'code': P[p]['code'], 'wc': P[p]['wc'], 'src': 'cis'})
            for u in usage[p]: remap[(p, u[0], u[1])] = j
        stats['keep'] += 1
        continue
    # shluky směrů přes všechna nástupiště stanice
    groups = []  # (platform, dirvec, usages)
    for p in used:
        for v, members in cluster_dirs(usage[p]):
            groups.append((p, v, [usage[p][i] for i in members]))
    # kandidáti z OSM
    cands = []
    if tree is not None:
        keys = name_keys(s['name'])
        for oi in tree.query_ball_point(sxy, 260):
            o = OSM[oi]; k = osm_kind(o[3])
            if k == 'pos': continue
            if mode == 'tram' and k not in ('tram', 'bus'): continue
            if mode == 'bus' and k not in ('bus', 'tram'): continue
            if keys & osm_keys[oi]:
                cands.append(oi)
        # sloučit duplicitní kandidáty (uzel + plocha nástupiště) < 6 m
        ded = []
        for oi in cands:
            if all(math.dist(osm_xy[oi], osm_xy[d]) > 6 for d in ded): ded.append(oi)
        cands = ded
    if len(groups) == 1 and len(cands) <= 1:
        p, v, us = groups[0]
        if cands: lat, lon = OSM[cands[0]][1], OSM[cands[0]][2]; src = 'osm'
        else: lat, lon = P[p]['lat'], P[p]['lon']; src = 'cis'
        j = len(new_pl)
        new_pl.append({'orig': p, 'st': si, 'lat': lat, 'lon': lon, 'code': P[p]['code'], 'wc': P[p]['wc'], 'src': src})
        for u in us: remap[(p, u[0], u[1])] = j
        stats['single'] += 1
        continue
    pos = []
    if cands:
        cxy = np.array([osm_xy[c] for c in cands]); ctr = cxy.mean(axis=0) if len(cands) > 1 else np.array(sxy)
        cost = np.zeros((len(groups), len(cands)))
        for gi, (p, v, us) in enumerate(groups):
            for ci, c in enumerate(cands):
                off = cxy[ci] - ctr
                d = math.hypot(*(cxy[ci] - np.array(sxy)))
                side = 0.0
                if v is not None:
                    rn = (v[1], -v[0])  # pravá normála (x=východ, y=sever)
                    side = -(off[0] * rn[0] + off[1] * rn[1])  # kladná vzdálenost vpravo snižuje cenu
                    # posun ve směru jízdy (sloupek bývá za křižovatkou) - mírně
                    side += -0.15 * (off[0] * v[0] + off[1] * v[1])
                lr = OSM[c][3].get('local_ref') or OSM[c][3].get('ref') or ''
                bonus = -40 if lr and lr == P[p]['code'] and len(used) > 1 else 0
                cost[gi, ci] = side + d * 0.05 + bonus
        if len(cands) >= len(groups):
            rows, cols = linear_sum_assignment(cost)
            asg = dict(zip(rows, cols))
        else:
            asg = {gi: int(np.argmin(cost[gi])) for gi in range(len(groups))}
        for gi in range(len(groups)):
            c = cands[asg[gi]]; pos.append((OSM[c][1], OSM[c][2], 'osm', OSM[c][3].get('local_ref', '')))
        stats['osm'] += 1
    else:
        for p, v, us in groups:
            x, y = sxy
            if v is not None:
                x += v[1] * 9; y += -v[0] * 9   # 9 m vpravo
            la, lo = ll(x, y); pos.append((la, lo, 'synth', ''))
        stats['synth'] += 1
    # sloučit skupiny na stejné pozici
    placed = {}
    for gi, (p, v, us) in enumerate(groups):
        la, lo, src, lref = pos[gi]
        key = (round(la, 6), round(lo, 6), p)
        j = placed.get(key)
        if j is None:
            j = placed[key] = len(new_pl)
            new_pl.append({'orig': p, 'st': si, 'lat': la, 'lon': lo, 'code': P[p]['code'], 'lref': lref, 'wc': P[p]['wc'], 'src': src})
        for u in us: remap[(p, u[0], u[1])] = j
log('platform refine', stats, 'new platforms', len(new_pl), 'old', len(P))

# kódy nástupišť: pokud má stanice víc nových nástupišť se stejným kódem, přidej písmena A, B, C
by_st = collections.defaultdict(list)
for j, p in enumerate(new_pl): by_st[p['st']].append(j)
for si, js in by_st.items():
    codes = collections.Counter(new_pl[j]['code'] for j in js)
    if len(js) > 1:
        letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        k = 0
        for j in sorted(js, key=lambda j: (new_pl[j]['code'], new_pl[j]['lat'])):
            p = new_pl[j]
            if p.get('lref'): p['label'] = p['lref']
            elif codes[p['code']] > 1 or not p['code']: p['label'] = letters[k % 26]; k += 1
            else: p['label'] = p['code']
    else:
        new_pl[js[0]]['label'] = ''
# přepis vzorů
miss = 0
for pi_, pt in enumerate(PT):
    ns = []
    for k, x in enumerate(pt['stops']):
        j = remap.get((x, pi_, k))
        if j is None:
            miss += 1
            j = len(new_pl); new_pl.append({'orig': x, 'st': P[x]['st'], 'lat': P[x]['lat'], 'lon': P[x]['lon'], 'code': P[x]['code'], 'label': '', 'wc': P[x]['wc'], 'src': 'cis'})
            remap[(x, pi_, k)] = j
        ns.append(j)
    pt['stops'] = tuple(ns)
log('remapped patterns, missing', miss)
for i, s in enumerate(S): s['pl'] = []
for j, p in enumerate(new_pl): S[p['st']]['pl'].append(j)
G['platforms'] = new_pl
pickle.dump(G, open(os.path.join(work, 'gtfs2.pkl'), 'wb'), protocol=5)
log('saved')
