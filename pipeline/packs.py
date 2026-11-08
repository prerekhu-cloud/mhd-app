#!/usr/bin/env python3
"""Fáze 5: výstupní data aplikace mhdGO.
 data/core.json         kraje, okresy, kalendáře (služby), metadata
 data/geo.json          zjednodušené hranice okresů, krajů a ČR
 data/stops.json        index všech zastávek pro vyhledávání
 data/okres/<id>.json   balíček okresu: zastávky, nástupiště, linky, vzory tras, jízdní řády, obce
 data/dalkove.json      všechny vlaky a meziregionální linky (pro vyhledávání spojení mezi okresy)
Použití: python3 packs.py <work_dir> <out_dir>"""
import sys, os, json, pickle, math, re, time, collections, colorsys, unicodedata, base64, hashlib, datetime as dt

work, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, 'okres'), exist_ok=True)
t0 = time.time()
def log(*a): print('[%6.1fs]' % (time.time() - t0), *a, flush=True)

G = pickle.load(open(os.path.join(work, 'gtfs2.pkl'), 'rb'))
RG = pickle.load(open(os.path.join(work, 'regions.pkl'), 'rb'))
SH = pickle.load(open(os.path.join(work, 'shapes.pkl'), 'rb'))
S, P, R, PT, TR = G['stations'], G['platforms'], G['routes'], G['patterns'], G['trips']
REG = RG['regions']; OKR = REG['okresy']; KRJ = REG['kraje']
st_okres = RG['st_okres']
okres_kraj = [o['kraj'] for o in OKR]

def fold(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def town(name):
    return re.sub(r'\s*\[[^\]]*\]\s*$', '', name.split(',')[0]).strip()

# ---------------------------------------------------------------- linky
DP_RE = re.compile(r'dopravn[íi] podnik|městsk[ýá] dopravn|^DP[A-ZÚ]|^MDP|^DPO$|^DPMB|^DPMO|^PMDP|^DSZO|^DPKV|^DPMLJ|^DPMÚL|^DPMHK|^DPMP|^DPMCB|^DPMJ|^DPmML|^DPMD|^DPML|^DPMK|^MHD|Dopravní společnost Zlín|Plzeňské městské dopravní|Městská doprava|TEDOM BUS', re.I)
LONG_RE = re.compile(r'RegioJet|FlixBus|Student Agency|Leo Express|BlaBlaCar|Eurolines|ALSA|Gepard', re.I)

# druh linky podle celostátních dat JDF (Oběhy, CC0): 704 = městská (MHD), 701 = regionální, 202 = dálková,
# 800 = trolejbus, 900 = tramvaj. Klíč = číslo linky CIS JŘ. (PID a IDS JMK v tomto souboru nejsou.)
JDF = {}
_jz = os.environ.get('JDF_ZIP') or os.path.join(work, 'src', 'jdf_filtered.zip')
if os.path.exists(_jz):
    import zipfile, csv, io
    with zipfile.ZipFile(_jz) as _z:
        for _r in csv.DictReader(io.TextIOWrapper(_z.open('routes.txt'), 'utf-8-sig')):
            JDF.setdefault(_r['route_id'].split(':')[-1], collections.Counter())[_r['route_type']] += 1
    JDF = {k: v.most_common(1)[0][0] for k, v in JDF.items()}
log('JDF line types', len(JDF), collections.Counter(JDF.values()))
def jdf_type(r): return JDF.get(r['rel'].get('CISJR', ''))

# veřejné číslo linky (CIS JŘ často uvádí 6místné licenční číslo) a čistší název
LN_RE = re.compile(r'linka\s*(?:č\.)?\s*:?\s*([0-9A-Za-z]+)\s*:?\s*', re.I)
for r in R:
    sn = r['short'] or ''; lg = r['long'] or ''
    m = LN_RE.search(lg)
    if m and (re.fullmatch(r'\d{6}', sn) or not sn):
        r['short'] = m.group(1)
        lg = lg[m.end():]
    elif re.fullmatch(r'\d{6}', sn):
        m2 = re.match(r'^(\d{1,3})\s+(.*)$', lg)
        if m2 and DP_RE.search(r['agency']):
            r['short'] = m2.group(1); lg = m2.group(2)
        elif DP_RE.search(r['agency']) or r['type'] in (0, 11, 7) or jdf_type(r) in ('704', '800', '900'):
            r['short'] = str(int(sn[3:]))
    if re.match(r'^MHD\s+\S', r['short'] or ''):          # „MHD 1“ (PID – Benešov, Kolín, Říčany…) → „1“, linka je městská
        r['short'] = re.sub(r'^MHD\s+', '', r['short']); r['_mhd'] = True
    m3 = (re.match(r'^MHD\s+([^:0-9]+?)\s+linka', lg) or re.match(r'^MHD\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][^:0-9]*?)(?:\s+(?:[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]{3,}|\d)|:)', lg)
          or re.match(r'^MHD\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+(?:\s+(?:nad|pod|u|v)?\s*[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]?[a-záčďéěíňóřšťúůýž]+){0,3})\s*$', lg))
    if m3:
        c3 = m3.group(1).strip()
        r['_mhd'] = True; r['_city'] = ' '.join(w if w in ('nad', 'pod', 'u', 'v') else w.capitalize() for w in c3.lower().split()) if c3.isupper() else c3
    lg = re.sub(r'^MHD\s+[^:]*:\s*', '', lg)
    lg = re.sub(r',\s*,', ', ', lg).replace(' ,', ',')
    lg = re.sub(r'^\d{1,3}\s+(?=[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])', '', lg) if r['short'] and lg.startswith(r['short'] + ' ') else lg
    r['long'] = re.sub(r'\s{2,}', ' ', lg).strip(' -:')

route_st = collections.defaultdict(collections.Counter)
route_trips = collections.Counter()
for pi_, pt in enumerate(PT):
    route_trips[pt['route']] += pt['n']
    for x in pt['stops']:
        route_st[pt['route']][P[x]['st']] += pt['n']

PID_CITY = re.compile(r'^(AE|[1-2]\d\d|9(0\d|1[0-7]))$')
def classify(ri):
    """Druh linky. Pořadí důkazů: typ vozidla v GTFS → oficiální druh linky JDF (704 = MHD) → číselné řady PID
    → heuristika (dopravní podnik / všechny zastávky v jednom městě; o „MHD“ se rozhodne až podle celého města)."""
    r = R[ri]; t = r['type']
    if t == 1: return 'metro'
    if t == 0: return 'tram'
    if t == 11: return 'trol'
    if t == 7: return 'lan'
    if t == 4: return 'lod'
    if t == 2: return 'vlak'
    jt = jdf_type(r)
    if jt == '704': return 'mhd'
    if jt == '800': return 'trol'
    if jt == '900': return 'tram'
    if jt == '202': return 'mezi'
    short = r['short'] or ''
    sts = list(route_st[ri].keys())
    if not sts: return 'regio'
    if r.get('_mhd') and jt in (None, '704'): return 'mhd'
    if jt is None and 'PID' in r['rel']:
        if PID_CITY.match(short) or re.match(r'^X(?:[1-2]\d\d|9\d\d)$', short): return 'mhd'
        return regional(ri, sts)
    if jt is None:
        towns = collections.Counter(town(S[s]['name']) for s in sts)
        top, cnt = towns.most_common(1)[0]
        if DP_RE.search(r['agency']) and len(short) <= 4 and cnt / len(sts) >= .5: return 'mhd'
        if cnt / len(sts) >= 0.7 and len(short) <= 3 and len(sts) >= 3: return 'mhd?'
    return regional(ri, sts)

def regional(ri, sts):
    r = R[ri]
    kraje = collections.Counter(okres_kraj[st_okres[s]] if st_okres[s] >= 0 else -1 for s in sts)
    foreign = kraje.get(-1, 0)
    if LONG_RE.search(r['agency']) or foreign >= 2:
        return 'mezi'
    ks = [k for k in kraje.most_common() if k[0] >= 0]
    if len(ks) >= 2 and (ks[1][1] / len(sts) >= 0.2 or len(ks) >= 3):
        return 'mezi'
    lat = [S[s]['lat'] for s in sts if S[s]['lat']]; lon = [S[s]['lon'] for s in sts if S[s]['lon']]
    if lat and math.hypot((max(lat) - min(lat)) * 111, (max(lon) - min(lon)) * 72) > 110:
        return 'mezi'
    return 'regio'

kind = {ri: classify(ri) for ri in range(len(R)) if route_trips[ri]}
# „MHD?“ (všechny zastávky v jednom městě, bez oficiálního údaje): MHD jen tam, kde město MHD opravdu má –
# potvrzená linka MHD (JDF/dopravní podnik) nebo aspoň 2 takové linky; osamocené místní linky na vesnicích jsou regionální
def town_of(ri): return collections.Counter(town(S[s]['name']) for s in route_st[ri]).most_common(1)[0][0]
mhd_towns = collections.Counter(town_of(ri) for ri, k in kind.items() if k in ('mhd', 'trol', 'tram'))
cand_towns = collections.Counter(town_of(ri) for ri, k in kind.items() if k == 'mhd?')
for ri, k in list(kind.items()):
    if k == 'mhd?':
        tw = town_of(ri)
        kind[ri] = 'mhd' if (mhd_towns[tw] or cand_towns[tw] >= 2) else regional(ri, list(route_st[ri].keys()))
log('route kinds', collections.Counter(kind.values()))

def home_okres(ri):
    c = collections.Counter()
    for s, n in route_st[ri].items():
        if st_okres[s] >= 0: c[st_okres[s]] += 1
    return c.most_common(1)[0][0] if c else -1

def city_of(ri):
    towns = collections.Counter()
    for s in route_st[ri]:
        towns[town(S[s]['name'])] += 1
    return towns.most_common(1)[0][0] if towns else ''

TRAIN_LABEL = re.compile(r'^(S|R|Sp|Ex|Os|U|L|T|V|P|RE|EC|IC|EN|NJ|rj|RJ|LE|SC|TLX|Rx|D|A)\s?\d+[A-Z]?\b')

# logické linky (sloučení licenčních čísel a dopravců se shodným číslem linky)
lines = []      # dict
route_line = {}
groups = {}
for ri in sorted(kind, key=lambda r: (kind[r], R[r]['short'], -route_trips[r])):
    r = R[ri]; k = kind[ri]
    ho = home_okres(ri)
    if k in ('mhd', 'tram', 'trol', 'metro', 'lan', 'lod'):
        city = r.get('_city') or ('Praha' if ('PID' in r['rel'] and (k in ('trol', 'tram', 'metro') or PID_CITY.match(r['short'] or '') or re.match(r'^X\d', r['short'] or '')) and not r.get('_mhd')) else city_of(ri))
        key = ('city' if k in ('mhd', 'trol') else k, r['short'], city)   # bus a trolejbus téhož čísla = jedna linka
    elif k == 'vlak':
        m = TRAIN_LABEL.match(r['short'] or '')
        city = ''
        key = ('vlak', m.group(0).replace(' ', '') if m else r['id'], '')
    else:
        city = ''
        key = (k, r['short'], ho if ho < 0 else okres_kraj[ho])
    stset = set(route_st[ri])
    gl = None
    for cand in groups.get(key, []):
        L = lines[cand]
        if k in ('regio', 'mezi'):
            inter = len(stset & L['_st']); uni = len(stset | L['_st'])
            if not (inter / max(1, min(len(stset), len(L['_st']))) > 0.3 or fold(r['long']) == fold(L['long'])):
                continue
        gl = cand; break
    if gl is None:
        gl = len(lines)
        groups.setdefault(key, []).append(gl)
        lines.append({'kind': k, 'short': r['short'], 'long': r['long'], 'city': city, 'type': r['type'], 'routes': [],
                      'agencies': [], '_st': set(), 'home': ho, 'trips': 0, 'night': r['night'], 'cis': [], '_kt': collections.Counter()})
    L = lines[gl]
    L['routes'].append(ri); L['_st'] |= stset; L['trips'] += route_trips[ri]; L['_kt'][k] += route_trips[ri]
    L['kind'] = L['_kt'].most_common(1)[0][0]
    if r['agency'] and r['agency'] not in L['agencies']: L['agencies'].append(r['agency'])
    if 'CISJR' in r['rel'] and r['rel']['CISJR'] not in L['cis']: L['cis'].append(r['rel']['CISJR'])
    if 'PID' in r['rel']: L['pid'] = True
    route_line[ri] = gl
log('logical lines', len(lines), collections.Counter(l['kind'] for l in lines))

# ---------------------------------------------------------------- vlaky: kategorie a označení
def train_cat(L):
    sn = L['short'] or ''
    m = TRAIN_LABEL.match(sn)
    if m:
        return re.match(r'[A-Za-z]+', m.group(0)).group(0), m.group(0).replace(' ', '')
    ag = ' '.join(L['agencies'])
    if re.search(r'RegioJet', ag): return 'RJ', ''
    if re.search(r'Leo Express', ag): return 'LE', ''
    return '', ''

# ---------------------------------------------------------------- barvy
def hsl(h, s, l):
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, l, s)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))

def numkey(s):
    m = re.match(r'(\d+)', s or '')
    return (0, int(m.group(1)), s) if m else (1, 0, s or '')

METRO = {'A': '#00a562', 'B': '#f8b322', 'C': '#e3001e', 'D': '#1a7fc1'}
# MHD: každé město má vlastní kolo barev jako OpavaGO (posun odstínu linka od linky)
by_city = collections.defaultdict(list)
for i, L in enumerate(lines):
    if L['kind'] in ('mhd', 'tram', 'trol', 'metro', 'lan', 'lod'):
        by_city[L['city']].append(i)
KORD = {'metro': 0, 'tram': 1, 'trol': 2, 'mhd': 3, 'lan': 4, 'lod': 5}
for city, ids in by_city.items():
    ids.sort(key=lambda i: (KORD[lines[i]['kind']], lines[i]['night'], numkey(lines[i]['short'])))
    n = len(ids); step = 20.0 if n <= 18 else max(11.0, 360.0 / n)
    for j, i in enumerate(ids):
        L = lines[i]
        if L['kind'] == 'metro' and L['short'] in METRO:
            L['color'] = METRO[L['short']]; continue
        h = (208 + j * step) % 360
        light = 0.46 if (j // max(1, int(360 / step))) % 2 == 0 else 0.36
        if L['night']: L['color'] = hsl(230, 0.35, 0.25); continue
        L['color'] = hsl(h, 0.70, light)
# regio a meziregio: podobná barva, v každém okrese trochu jiný odstín
for i, L in enumerate(lines):
    if L['kind'] in ('regio', 'mezi'):
        o = max(L['home'], 0)
        jitter = ((o * 37) % 41) - 20          # -20..20°
        lj = (((o * 53) % 9) - 4) / 100.0       # -0.04..0.04
        if L['kind'] == 'regio':
            L['color'] = hsl(22 + jitter * 0.9, 0.62, 0.44 + lj)
        else:
            L['color'] = hsl(178 + jitter * 0.8, 0.55, 0.36 + lj)
# vlaky: každý vlak (linka) jinou barvou
for i, L in enumerate(lines):
    if L['kind'] == 'vlak':
        hh = int(hashlib.md5((L['short'] + '|' + ','.join(L['cis']) + str(L['routes'][0])).encode()).hexdigest()[:6], 16)
        L['color'] = hsl(hh % 360, 0.62, 0.36 + (hh >> 9) % 10 / 100.0)

def text_color(hexc):
    r, g, b = int(hexc[1:3], 16), int(hexc[3:5], 16), int(hexc[5:7], 16)
    return '#1b1712' if (0.299 * r + 0.587 * g + 0.114 * b) > 170 else '#ffffff'

# ---------------------------------------------------------------- systémy, odkazy na jízdní řády
IDS_BY_KRAJ = {'PHA': 'PID', 'STC': 'PID', 'JHC': 'IDS JK', 'PLK': 'IDPK', 'KVK': 'IDOK', 'ULK': 'DÚK', 'LBK': 'IDOL',
               'HKK': 'IREDO', 'PAK': 'IREDO', 'VYS': 'VDV', 'JHM': 'IDS JMK', 'OLK': 'IDSOK', 'ZLK': 'IDZK', 'MSK': 'ODIS'}
def system_of(L):
    if L['kind'] == 'vlak': return 'vlak'
    if L.get('pid'): return 'PID'
    if L['home'] >= 0: return IDS_BY_KRAJ.get(KRJ[okres_kraj[L['home']]]['code'], '')
    return ''

# ---------------------------------------------------------------- služby (kalendáře)
svc_ids = {}; svc_list = []
ND = G['ND']
def svc_index(sid):
    bits = G['services'][sid]
    j = svc_ids.get(bits)
    if j is None:
        j = svc_ids[bits] = len(svc_list)
        b = bits.to_bytes((ND + 7) // 8, 'little')
        svc_list.append(base64.b64encode(b).decode())
    return j

# ---------------------------------------------------------------- polyline
def enc_num(v):
    v = ~(v << 1) if v < 0 else (v << 1)
    out = []
    while v >= 0x20:
        out.append(chr((0x20 | (v & 0x1f)) + 63)); v >>= 5
    out.append(chr(v + 63))
    return ''.join(out)
def encode(pts):
    o = []; pla = plo = 0
    for la, lo in pts:
        a = int(round(la * 1e5)); b = int(round(lo * 1e5))
        o.append(enc_num(a - pla)); o.append(enc_num(b - plo)); pla, plo = a, b
    return ''.join(o)

# ---------------------------------------------------------------- vzory -> linky, spoje
pat_trips = collections.defaultdict(list)
for t in TR:
    pat_trips[t[0]].append(t)
line_pats = collections.defaultdict(list)
for pi_, pt in enumerate(PT):
    if pt['route'] in route_line and pat_trips.get(pi_):
        line_pats[route_line[pt['route']]].append(pi_)

def pattern_obj(pi_):
    pt = PT[pi_]; L = lines[route_line[pt['route']]]
    trips = sorted(pat_trips[pi_], key=lambda t: t[1])
    profs = {}; plist = []
    tr = []; nums = []; hs = {}; wc = []; cs = []
    last_name = S[P[pt['stops'][-1]]['st']]['name']
    hcount = collections.Counter(t[5] for t in trips)
    hdef = hcount.most_common(1)[0][0] if hcount else ''
    for j, t in enumerate(trips):
        prof = G['profiles'][t[2]]
        k = profs.get(t[2])
        if k is None:
            k = profs[t[2]] = len(plist)
            deps, arrs = prof
            dd = [deps[0]] + [deps[i] - deps[i - 1] for i in range(1, len(deps))]
            if arrs:
                dw = [deps[i] - arrs[i] for i in range(len(deps))]
                plist.append([dd, dw])
            else:
                plist.append([dd])
        tr += [t[1], k, svc_index(t[3])]
        if L['kind'] == 'vlak': nums.append(t[4] or '')
        rel = t[7]; cn = (rel['PID'].split('_')[1] if 'PID' in rel and rel['PID'].count('_') >= 2 else '') or rel.get('CISJR') or (rel.get('SCC', '').split(':')[-1]) or rel.get('DPO') or ''
        cs.append(int(cn) if str(cn).isdigit() else 0)
        if t[5] != hdef: hs[j] = t[5]
        wc.append('1' if t[6] == '1' else '0')
    o = {'i': pi_, 'l': route_line[pt['route']], 'd': pt['dir'], 's': list(pt['stops']), 'p': plist, 't': tr}
    if hdef and fold(hdef) != fold(last_name): o['h'] = hdef
    if hs: o['hs'] = hs
    if nums: o['n'] = nums
    if any(cs): o['c'] = cs
    wcs = ''.join(wc)
    if '1' in wcs: o['w'] = 1 if '0' not in wcs else wcs
    fl = [[k, f] for k, f in enumerate(pt['flags']) if f]
    if fl: o['f'] = fl
    shp = SH.get(pi_)
    if shp:
        o['g'] = encode(shp[0]); o['x'] = shp[1]
    return o

def line_obj(li):
    L = lines[li]
    o = {'i': li, 'n': L['short'] or '', 'k': L['kind'], 'c': L['color'], 'tc': text_color(L['color']),
         'ln': L['long'], 'a': L['agencies'][:3], 'sys': system_of(L)}
    if L['city']: o['city'] = L['city']
    if L['cis']: o['cis'] = L['cis'][:4]
    if L['night']: o['night'] = 1
    if L['kind'] == 'vlak':
        cat, lab = train_cat(L)
        if cat: o['cat'] = cat
        if lab: o['lab'] = lab
    if L['home'] >= 0: o['ho'] = L['home']
    return o

def station_obj(si):
    s = S[si]
    return [si, s['name'], round(s['lat'] or 0, 6), round(s['lon'] or 0, 6), st_okres[si]]

def platform_obj(pj):
    p = P[pj]
    o = [pj, p['st'], round(p['lat'], 6), round(p['lon'], 6), p.get('label', '') or '']
    if p.get('wc') == '1': o.append(1)
    return o

# ---------------------------------------------------------------- balíčky okresů
line_okresy = collections.defaultdict(set)
for li, L in enumerate(lines):
    for s in L['_st']:
        if st_okres[s] >= 0: line_okresy[li].add(st_okres[s])
okres_lines = collections.defaultdict(list)
for li, oks in line_okresy.items():
    for o in oks: okres_lines[o].append(li)

pat_cache = {}
def get_pat(pi_):
    if pi_ not in pat_cache: pat_cache[pi_] = pattern_obj(pi_)
    return pat_cache[pi_]

sizes = {}
built = dt.date.today().isoformat()
for oi, O in enumerate(OKR):
    lis = sorted(okres_lines.get(oi, []))
    pats = [get_pat(p) for li in lis for p in line_pats[li]]
    pls = sorted({x for p in pats for x in p['s']})
    sts = sorted({P[x]['st'] for x in pls})
    obce = RG['obce'].get(oi, [])
    pack = {'v': 1, 'okres': oi, 'name': O['name'], 'built': built,
            'st': [station_obj(s) for s in sts], 'pl': [platform_obj(x) for x in pls],
            'ln': [line_obj(li) for li in lis], 'pt': pats,
            'ob': [[ob['name'], ob['c'][0], ob['c'][1], ob['pop'], [encode([(y, x) for x, y in ring]) for ring in ob['poly']]] for ob in obce]}
    s = json.dumps(pack, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(out, 'okres', '%d.json' % oi), 'w', encoding='utf-8').write(s)
    sizes[O['name']] = len(s)
    log('okres', oi, O['name'], 'lines', len(lis), 'patterns', len(pats), 'stations', len(sts), 'size %.1f MB' % (len(s) / 1e6))

# ---------------------------------------------------------------- dálkové (vlaky + meziregionální)
lis = [li for li, L in enumerate(lines) if L['kind'] in ('vlak', 'mezi')]
pats = [get_pat(p) for li in lis for p in line_pats[li]]
# bez geometrie (pro vyhledávání spojení stačí sekvence)
pats2 = [{k: v for k, v in p.items() if k not in ('g', 'x')} for p in pats]
pls = sorted({x for p in pats for x in p['s']}); sts = sorted({P[x]['st'] for x in pls})
pack = {'v': 1, 'name': 'dalkove', 'built': built, 'st': [station_obj(s) for s in sts], 'pl': [platform_obj(x) for x in pls],
        'ln': [line_obj(li) for li in lis], 'pt': pats2}
s = json.dumps(pack, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(out, 'dalkove.json'), 'w', encoding='utf-8').write(s)
log('dalkove', len(lis), 'lines', len(pats2), 'patterns size %.1f MB' % (len(s) / 1e6))

# ---------------------------------------------------------------- index zastávek
modes_of_st = collections.defaultdict(set)
MB = {'vlak': 1, 'tram': 2, 'metro': 4, 'trol': 8, 'mhd': 16, 'regio': 32, 'mezi': 32, 'lan': 64, 'lod': 128}
for li, L in enumerate(lines):
    for s in L['_st']: modes_of_st[s].add(MB[L['kind']])
idx = []
for si, s in enumerate(S):
    if si not in modes_of_st or not s['lat']: continue
    idx.append([si, s['name'], round(s['lat'], 5), round(s['lon'], 5), st_okres[si], sum(modes_of_st[si])])
json.dump({'v': 1, 'st': idx}, open(os.path.join(out, 'stops.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
log('stops index', len(idx))

# ---------------------------------------------------------------- core + geo
core = {'v': 1, 'built': built, 'd0': G['D0'], 'nd': ND, 'svc': svc_list,
        'kraje': KRJ, 'okresy': OKR,
        'stats': {'lines': len(lines), 'stations': len(idx), 'platforms': len(P), 'trips': len(TR)},
        'sizes': {str(i): sizes.get(o['name'], 0) for i, o in enumerate(OKR)}}
json.dump(core, open(os.path.join(out, 'core.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
geo = RG['geo']
geo_out = {'okresy': [[encode([(y, x) for x, y in ring]) for ring in polys] for polys in geo['okresy']],
           'kraje': [[encode([(y, x) for x, y in ring]) for ring in polys] for polys in geo['kraje']],
           'cz': [encode([(y, x) for x, y in ring]) for ring in geo['cz']] if geo.get('cz') else []}
json.dump(geo_out, open(os.path.join(out, 'geo.json'), 'w', encoding='utf-8'), separators=(',', ':'))
log('core services', len(svc_list), 'done')
