#!/usr/bin/env python3
"""Fáze 1: načte GTFS CIS JŘ (spojenka) a vytvoří kompaktní mezivýsledek:
zastávky (stanice) a nástupiště, linky, vzory tras (sekvence nástupišť), jízdní profily
(odjezdové posuny), spoje a kalendáře (bitové masky dní).

Použití: python3 gtfs_load.py <adresář_gtfs> <work_dir> [YYYYMMDD_od] [počet_dní]
"""
import sys, os, csv, pickle, time, datetime as dt, collections
import numpy as np
import pandas as pd

src, work = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
t0 = time.time()
today = dt.date.today()
D0 = dt.datetime.strptime(sys.argv[3], '%Y%m%d').date() if len(sys.argv) > 3 else today
ND = int(sys.argv[4]) if len(sys.argv) > 4 else 42

def log(*a):
    print('[%6.1fs]' % (time.time() - t0), *a, flush=True)

def rd(name):
    return list(csv.DictReader(open(os.path.join(src, name), encoding='utf-8-sig')))

# ---------- zastávky ----------
stations, platforms = [], []
sidx, pidx = {}, {}
rows = rd('stops.txt')
for r in rows:
    if r['location_type'] == '1':
        sidx[r['stop_id']] = len(stations)
        rel = dict(x.split(':', 1) for x in r['relations'].split('|') if ':' in x)
        stations.append({'id': r['stop_id'], 'name': r['stop_name'],
                         'lat': float(r['stop_lat']) if r['stop_lat'] else None,
                         'lon': float(r['stop_lon']) if r['stop_lon'] else None,
                         'rel': rel, 'pl': []})
for r in rows:
    if r['location_type'] in ('', '0'):
        par = r['parent_station']
        if par not in sidx:  # nástupiště bez stanice -> vlastní stanice
            sidx[par or r['stop_id']] = len(stations)
            stations.append({'id': par or r['stop_id'], 'name': r['stop_name'],
                             'lat': float(r['stop_lat']) if r['stop_lat'] else None,
                             'lon': float(r['stop_lon']) if r['stop_lon'] else None, 'rel': {}, 'pl': []})
            par = par or r['stop_id']
        s = sidx[par]
        pidx[r['stop_id']] = len(platforms)
        rel = dict(x.split(':', 1) for x in r['relations'].split('|') if ':' in x)
        code = r['platform_code'] or ''
        if not code:
            # SC37447.P1.ZK24 -> "1"
            parts = r['stop_id'].split('.')
            if len(parts) > 1 and parts[1].startswith('P'):
                code = parts[1][1:]
        platforms.append({'id': r['stop_id'], 'st': s, 'name': r['stop_name'],
                          'lat': float(r['stop_lat']) if r['stop_lat'] else None,
                          'lon': float(r['stop_lon']) if r['stop_lon'] else None,
                          'code': code, 'zone': r['zone_id'], 'wc': r['wheelchair_boarding'] or '',
                          'own': bool(rel), 'rel': rel})
        stations[s]['pl'].append(len(platforms) - 1)
# souřadnice nástupiště převezmi ze stanice, chybí-li
for p in platforms:
    if p['lat'] is None:
        s = stations[p['st']]
        p['lat'], p['lon'] = s['lat'], s['lon']
for s in stations:
    if s['lat'] is None and s['pl']:
        ps = [platforms[i] for i in s['pl'] if platforms[i]['lat'] is not None]
        if ps:
            s['lat'] = sum(p['lat'] for p in ps) / len(ps); s['lon'] = sum(p['lon'] for p in ps) / len(ps)
log('stations', len(stations), 'platforms', len(platforms))

# ---------- dopravci, linky ----------
agencies = {a['agency_id']: a for a in rd('agency.txt')}
routes = []
ridx = {}
for r in rd('routes.txt'):
    rel = dict(x.split(':', 1) for x in r['relations'].split('|') if ':' in x)
    ridx[r['route_id']] = len(routes)
    a = agencies.get(r['agency_id'], {})
    routes.append({'id': r['route_id'], 'short': r['route_short_name'], 'long': r['route_long_name'],
                   'type': int(r['route_type']), 'agency': a.get('agency_name', ''), 'agency_url': a.get('agency_url', ''),
                   'night': r.get('is_night') == '1', 'subst': r.get('is_substitute_transport') == '1', 'rel': rel})
log('routes', len(routes))

# ---------- kalendář ----------
days = [D0 + dt.timedelta(days=i) for i in range(ND)]
dkey = {d.strftime('%Y%m%d'): i for i, d in enumerate(days)}
svc_bits = {}
for c in rd('calendar.txt'):
    a = dt.datetime.strptime(c['start_date'], '%Y%m%d').date()
    b = dt.datetime.strptime(c['end_date'], '%Y%m%d').date()
    wd = [c[k] == '1' for k in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')]
    bits = 0
    for i, d in enumerate(days):
        if a <= d <= b and wd[d.weekday()]:
            bits |= 1 << i
    svc_bits[c['service_id']] = bits
for c in rd('calendar_dates.txt'):
    i = dkey.get(c['date'])
    if i is None:
        continue
    b = svc_bits.get(c['service_id'], 0)
    if c['exception_type'] == '1':
        b |= 1 << i
    else:
        b &= ~(1 << i)
    svc_bits[c['service_id']] = b
log('services', len(svc_bits))

# ---------- spoje ----------
trips = pd.read_csv(os.path.join(src, 'trips.txt'), dtype=str, keep_default_na=False)
trips = trips[trips['service_id'].map(lambda s: svc_bits.get(s, 0) != 0)]
log('trips running in window', len(trips))
trip_info = {}
for r in trips.itertuples(index=False):
    rel = dict(x.split(':', 1) for x in r.relations.split('|') if ':' in x)
    trip_info[int(r.trip_id)] = (ridx[r.route_id], r.service_id, r.trip_short_name, r.trip_headsign,
                                 int(r.direction_id or 0), r.wheelchair_accessible, rel)

st = pd.read_csv(os.path.join(src, 'stop_times.txt'),
                 usecols=['trip_id', 'stop_id', 'arrival_time', 'departure_time', 'stop_sequence', 'pickup_type', 'drop_off_type'],
                 dtype={'trip_id': 'int64', 'stop_id': 'string', 'arrival_time': 'string', 'departure_time': 'string',
                        'stop_sequence': 'int32', 'pickup_type': 'float32', 'drop_off_type': 'float32'})
st = st[st['trip_id'].isin(trip_info.keys())]
log('stop_times', len(st))

def tsec(s):
    s = s.fillna('')
    parts = s.str.split(':', expand=True)
    h = pd.to_numeric(parts[0], errors='coerce'); m = pd.to_numeric(parts[1], errors='coerce'); x = pd.to_numeric(parts[2], errors='coerce')
    return (h * 3600 + m * 60 + x)

st['arr'] = tsec(st['arrival_time'])
st['dep'] = tsec(st['departure_time'])
st['arr'] = st['arr'].fillna(st['dep'])
st['dep'] = st['dep'].fillna(st['arr'])
st['pi'] = st['stop_id'].map(pidx)
missing = st['pi'].isna().sum()
if missing:
    log('WARN stop_times with unknown stop', missing)
    st = st[st['pi'].notna()]
st['pi'] = st['pi'].astype('int64')
st['pu'] = st['pickup_type'].fillna(0).astype('int8')
st['do'] = st['drop_off_type'].fillna(0).astype('int8')
st = st.sort_values(['trip_id', 'stop_sequence'])
log('sorted')

tid = st['trip_id'].to_numpy(); pi = st['pi'].to_numpy(); arr = st['arr'].to_numpy(); dep = st['dep'].to_numpy()
pu = st['pu'].to_numpy(); do = st['do'].to_numpy()
bounds = np.flatnonzero(np.diff(tid)) + 1
starts = np.concatenate([[0], bounds]); ends = np.concatenate([bounds, [len(tid)]])

# vzory a profily
patterns = {}      # key -> idx
pat_list = []      # dict(route, dir, stops, flags)
prof_map = {}
prof_list = []
trip_list = []     # (pattern, start_sec, profile, service, short, headsign, wc, rel)
interp_fix = 0
for a, b in zip(starts, ends):
    t = int(tid[a]); info = trip_info[t]
    seq = tuple(int(x) for x in pi[a:b])
    if len(seq) < 2:
        continue
    A = arr[a:b].astype(float); Dp = dep[a:b].astype(float)
    # interpolace chybějících časů
    if np.isnan(Dp).any():
        idx = np.arange(len(Dp)); ok = ~np.isnan(Dp)
        if ok.sum() < 2:
            continue
        Dp = np.interp(idx, idx[ok], Dp[ok]); A = np.where(np.isnan(A), Dp, A); interp_fix += 1
    flags = tuple(int(p) * 4 + int(d) for p, d in zip(pu[a:b], do[a:b]))
    key = (info[0], seq, flags)
    p = patterns.get(key)
    if p is None:
        p = patterns[key] = len(pat_list)
        pat_list.append({'route': info[0], 'dir': info[4], 'stops': seq, 'flags': flags, 'n': 0})
    pat_list[p]['n'] += 1
    s0 = Dp[0]
    # minutové rozlišení, odjezdy i příjezdy
    deps = tuple(int(round((x - s0) / 60.0)) for x in Dp)
    arrs = tuple(int(round((x - s0) / 60.0)) for x in A)
    pk = (deps, arrs if arrs != deps else None)
    pr = prof_map.get(pk)
    if pr is None:
        pr = prof_map[pk] = len(prof_list); prof_list.append(pk)
    trip_list.append((p, int(round(s0 / 60.0)), pr, info[1], info[2], info[3], info[5], info[6], t))
log('patterns', len(pat_list), 'profiles', len(prof_list), 'trips', len(trip_list), 'interp', interp_fix)

# použité služby
used = sorted({t[3] for t in trip_list})
pickle.dump({'D0': D0.isoformat(), 'ND': ND, 'stations': stations, 'platforms': platforms, 'routes': routes,
             'patterns': pat_list, 'profiles': prof_list, 'trips': trip_list,
             'services': {s: svc_bits[s] for s in used}}, open(os.path.join(work, 'gtfs.pkl'), 'wb'), protocol=5)
log('saved')
