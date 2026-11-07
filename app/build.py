#!/usr/bin/env python3
"""Sestaví jediný soubor mhdgo.html (a index.html) z app/ – vše vložené jako u OpavaGO."""
import os, json, re, sys
H = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(H)
JS = ['util.js', 'krovak.js', 'data.js', 'map2d.js', 'live.js', 'vehicles.js', 'ui.js', 'net.js', 'dep.js', 'raptor.js', 'search.js',
      'models.js', 'map3d.js', 'garage.js', 'bedekr.js', 'app.js']
rd = lambda p: open(os.path.join(H, p), encoding='utf-8').read()
def decode(s):
    out = []; i = la = lo = 0
    while i < len(s):
        vals = []
        for _ in range(2):
            sh = r = 0
            while True:
                b = ord(s[i]) - 63; i += 1; r |= (b & 31) << sh; sh += 5
                if b < 32: break
            vals.append(~(r >> 1) if r & 1 else r >> 1)
        la += vals[0]; lo += vals[1]; out.append((la / 1e5, lo / 1e5))
    return out
geo = json.load(open(os.path.join(ROOT, 'data', 'geo.json')))
rings = [decode(r) for r in geo['cz']]
import math
k = math.cos(math.radians(49.8))
xs = [lo * k for r in rings for la, lo in r]; ys = [-la for r in rings for la, lo in r]
x0, y0 = min(xs), min(ys); W = max(xs) - x0; Hh = max(ys) - y0; S = 1000 / W
path = ''
for r in rings:
    pts = [((lo * k - x0) * S, (-la - y0) * S) for la, lo in r]
    path += 'M' + ' '.join('%.1f %.1f' % p for p in pts[::2]) + 'Z'
html = rd('index.html')
logo = rd('assets/logo.svg').strip()
html = html.replace('@ICON96@', rd('assets/icon96.b64').strip()).replace('@ICON512@', rd('assets/icon512.b64').strip())
html = html.replace('@LOGO@', logo).replace('@CZPATH@', path).replace('@CZVIEW@', '0 0 1000 %d' % round(Hh * S))
html = html.replace('/*@SPLASHCSS@*/', rd('css/splash.css')).replace('/*@CSS@*/', rd('css/base.css'))
js = '\n'.join('/* ---- %s ---- */\n' % f + rd('js/' + f) for f in JS if os.path.exists(os.path.join(H, 'js', f)))
html = html.replace('/*@JS@*/', js.replace('</script>', '<\\/script>'))
tok = os.environ.get('MAPBOX_TOKEN') or (open(os.path.join(H, '.mapbox-token')).read().strip() if os.path.exists(os.path.join(H, '.mapbox-token')) else '')
# do repozitáře jde verze BEZ tokenu (GitHub push protection); verze s tokenem jen lokálně (dist/)
for name in ('mhdgo.html', 'index.html'):
    open(os.path.join(ROOT, name), 'w', encoding='utf-8').write(html.replace('@MAPBOX@', ''))
if tok:
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    open(os.path.join(ROOT, 'dist', 'mhdgo.html'), 'w', encoding='utf-8').write(html.replace('@MAPBOX@', tok))
    print('dist/mhdgo.html s tokenem')
print('mhdgo.html', len(html), 'B')
