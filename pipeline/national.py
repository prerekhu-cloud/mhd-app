#!/usr/bin/env python3
"""Celostátní data mhdGO z okresních balíčků: jeden soubor s jízdními řády celé ČR (bez geometrií)
a geometrie tras rozdělené do dlaždic (načítají se, až jsou potřeba – vybrané vozidlo, spojení, 3D).

  python3 pipeline/national.py <adresář s okres/ a dalkove.json> <výstupní adresář>

Výstup:  cz.json              stanice, nástupiště, linky a vzory tras se spoji (pole gt = dlaždice geometrie)
         shp/<dlaždice>.json   {"<id vzoru>": [polyline, indexy zastávek v geometrii]}
Dlaždice: 0,25° × 0,4° podle první zastávky vzoru (id = řádek*100 + sloupec od 48,5° s. š. a 12° v. d.)."""
import glob, json, os, sys, time

TLAT, TLON, LAT0, LON0 = 0.25, 0.4, 48.5, 12.0


def tile(lat, lon):
    return int((lat - LAT0) // TLAT) * 100 + int((lon - LON0) // TLON)


def main(src, out):
    st, pl, ln, pt, lok = {}, {}, {}, {}, {}
    files = sorted(glob.glob(os.path.join(src, 'okres', '*.json')), key=lambda f: int(os.path.basename(f)[:-5]))
    if os.path.exists(os.path.join(src, 'dalkove.json')):
        files.append(os.path.join(src, 'dalkove.json'))
    for f in files:
        pk = json.load(open(f, encoding='utf-8'))
        oi = pk.get('okres', -1)
        for s in pk['st']:
            st.setdefault(s[0], s)
        for p in pk['pl']:
            pl.setdefault(p[0], p)
        for l in pk['ln']:
            ln.setdefault(l['i'], l)
            if oi is not None and oi >= 0:
                lok.setdefault(l['i'], set()).add(oi)
        for p in pk['pt']:
            q = pt.get(p['i'])
            if q is None or (p.get('g') and not q.get('g')):
                pt[p['i']] = p
    shp = {}
    out_pt = []
    for i in sorted(pt):
        p = dict(pt[i])
        g, x = p.pop('g', None), p.pop('x', None)
        p['gt'] = -1
        if g and x is not None:
            first = pl.get(p['s'][0])
            if first:
                t = tile(first[2], first[3])
                p['gt'] = t
                shp.setdefault(t, {})[str(i)] = [g, x]
        out_pt.append(p)
    out_ln = []
    for i in sorted(ln):
        l = dict(ln[i])
        l['o'] = sorted(lok.get(i, []))
        out_ln.append(l)
    cz = {'v': 1, 'built': time.strftime('%Y-%m-%d'), 'tile': [TLAT, TLON, LAT0, LON0],
          'st': [st[k] for k in sorted(st)], 'pl': [pl[k] for k in sorted(pl)], 'ln': out_ln, 'pt': out_pt}
    os.makedirs(os.path.join(out, 'shp'), exist_ok=True)
    for f in glob.glob(os.path.join(out, 'shp', '*.json')):
        os.remove(f)
    with open(os.path.join(out, 'cz.json'), 'w', encoding='utf-8') as fh:
        json.dump(cz, fh, ensure_ascii=False, separators=(',', ':'))
    tot = 0
    for t, d in shp.items():
        with open(os.path.join(out, 'shp', '%d.json' % t), 'w', encoding='utf-8') as fh:
            json.dump(d, fh, separators=(',', ':'))
        tot += os.path.getsize(fh.name)
    print('cz.json %.1f MB, %d stanic, %d nástupišť, %d linek, %d vzorů; %d dlaždic tras %.1f MB' % (
        os.path.getsize(os.path.join(out, 'cz.json')) / 1e6, len(st), len(pl), len(ln), len(out_pt), len(shp), tot / 1e6))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
