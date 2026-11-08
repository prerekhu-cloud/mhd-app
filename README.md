# mhdGO – veřejná doprava celé České republiky

Nástupce aplikace **OpavaGO** pro celou ČR: stejný vzhled i ovládání jako OpavaGO (liquid glass, měděný akcent, písmo Outfit,
síť jako jedna měděná čára, bublina vozidla nad vozidlem, odjezdy s odpočtem, na tabletu a počítači kulatá tlačítka v hlavičce
a panely vpravo vedle mapy) – jen pro všechna města, regionální a meziregionální autobusy a všechny vlaky.

Aplikace je **jeden HTML soubor** – [`mhdgo.html`](mhdgo.html) (totéž je v `index.html` pro GitHub Pages).
Jízdní řády si stahuje po okresech z adresáře [`data/`](data) tohoto repozitáře (přes `raw.githubusercontent.com`).

## Funkce

- **Start v tvém okrese** – podle polohy; bez povolení polohy se vybere náhodný okres a po povolení se mapa přepne na tvůj okres.
- **Celá ČR / Vycentrovat** – pohled na celou republiku s hranicemi okresů (klepnutím okres otevřeš), návrat na tvůj okres
  (bez polohy na celou ČR). Ve 3D Vycentrovat vrací pohled na centrum tvé obce (bez polohy na centrum náhodného okresního města).
- **Dopravní síť okresu** – linky podle druhu (metro, tramvaje, trolejbusy, MHD, regionální, meziregionální, vlaky), rozbalení linky
  ukáže trasu po silnicích/kolejích se zastávkami, **Otočit směr**, varianty tras, přestupy a odkaz na oficiální jízdní řád.
- **Zastávky a nástupiště** – každá zastávka má svá skutečná nástupiště (zobrazí se po přiblížení, s označením a směrem); žádná se nevymýšlejí.
- **Vozidla** – všechny spoje jezdí na mapě podle jízdního řádu; kde jsou živá data, ukazuje se skutečná poloha a zpoždění
  (✓ včas, +N min). Karta vozidla: linka, směr, zpoždění, 4 příští zastávky s časy a trasa do cílové zastávky.
- **Odjezdy** z libovolné zastávky v ČR (i na jiný den a čas), filtr linek a nástupišť, živá zpoždění.
- **Hledání** jako v OpavaGO: našeptávač (Moje místa, linky, zastávky celé ČR s linkami, adresy), „Hledané místo“ a karty nejbližších zastávek;
  **vyhledání spojení** (RAPTOR) s přestupy, pěšími přesuny a vlaky mezi okresy – řádky spojů (odjezd–příjezd, linky, doba), dřívější/další spoje a detail s časovou osou.
- **Barvy linek** – MHD v každém městě má vlastní barvy (stejný princip jako OpavaGO – Opava má přesně původní barvy),
  regionální a meziregionální linky mají podobnou barvu s odstínem podle okresu, každý vlak má vlastní barvu.
- **3D mapa** (Mapbox Standard s 3D budovami) s procedurálními 3D modely vozidel v barvách dopravců
  (autobus 12 m, kloubový, midibus, trolejbusy, regionální a dálkové autobusy, tramvaje, metro, osobní vlaky, rychlíky, dálkové vlaky),
  denní doba, déšť a sníh a **Jízda vozidlem** jako v OpavaGO: vozidlo plynule jede po trase spoje (rychlost podle jízdního řádu, zastavuje na zastávkách),
  kamera je za ním, trasa je vyznačená pásem šíře vozovky, panel s příští zastávkou a časy, tlačítko 2× rychleji. Spustíš ji v záložce Jízda
  (výběr linky) nebo v bublině vozidla tlačítkem Jízda 3D.
- **Bedekr** – nejlepší památky a zajímavosti Česka; lišta krajů → to nejlepší v kraji → lišta okresů → místa v okrese
  (včetně méně známých). Fotografie z Wikimedia Commons, text z Wikipedie, galerie, „Jak se tam dostanu“.
- **Budík před výstupem** – v kartě vozidla (Budík → klepni na zastávku) nebo u každé jízdy ve vyhledaném spojení;
  upozorní zvukem, vibrací a oznámením na příští zastávku a při výstupu.
- **Pěší navigace k zastávce** (okno zastávky → chodec, karta nejbližší zastávky v Hledání, nebo „navigovat“ ve spojení) s pokyny v češtině.
- **Mimořádnosti a výluky** – IDS JMK přímo, PID přes worker; ⚠ u linek v Síti, v odjezdech, na mapě a v seznamu (Info → Mimořádnosti, na telefonu Více → Mimořádnosti).
- **Offline a instalace na plochu** – otevřené okresy se ukládají (až 8) a fungují i bez připojení; manifest a service worker
  (`manifest.webmanifest`, `sw.js`) pro instalaci, když je aplikace na webu (např. GitHub Pages).
- Měřítko, hodiny, kompas, legenda, počasí, tmavý režim, Moje místa; funguje na mobilu na výšku i na šířku i na počítači.

## Data

| Co | Zdroj |
|----|-------|
| Jízdní řády všech linek a vlaků | CIS JŘ – GTFS projektu Spojenka (MFF UK), `spojenka.d3s.mff.cuni.cz` |
| Nástupiště | CIS JŘ (PID, IDS JMK, IDOL, ODIS, PMDP); kde CIS JŘ udává jedno místo pro oba směry, rozdělí se jen podle skutečných zastávkových sloupků v OpenStreetMap |
| Trasy linek | PID GTFS (shapes), ostatní dopočítány po silnicích (Valhalla nad OSM – celá trasa najednou, zastávky přichycené k hlavní silnici, bez odboček a kliček) a po kolejích (vlastní graf z OSM) |
| Hranice krajů, okresů a obcí, středy obcí | OpenStreetMap |
| Bedekr | Wikidata, Wikipedie, Wikimedia Commons |
| Živé polohy | Správa železnic (vlaky celé ČR, přímo z prohlížeče), ODIS (přes worker), volitelně vlastní worker |

Struktura `data/`:

- `core.json` – kraje, okresy, kalendáře (bitové masky dní), metadata
- `geo.json` – zjednodušené hranice okresů, krajů a ČR
- `stops.json` – index všech ~40 tis. zastávek pro hledání
- `okres/<id>.json` – balíček okresu: zastávky, nástupiště, linky, vzory tras s geometrií, jízdní řády, obce
- `dalkove.json` – všechny vlaky a meziregionální linky (pro hledání spojení mezi okresy)
- `bedekr.json` – památky a místa po okresech

## Mapbox token

GitHub (push protection) nedovolí uložit Mapbox token do repozitáře, proto v `mhdgo.html` v repozitáři není.
Bez tokenu aplikace použije podklady CARTO/OpenStreetMap a Esri (letecké) a 3D mapa nejde spustit.
Token se dá zadat:

- v aplikaci: **Více → Nastavení → Mapbox token** (uloží se v prohlížeči), nebo
- jednorázově v adrese: `mhdgo.html#mapbox=pk.…`, nebo
- při sestavení: `MAPBOX_TOKEN=pk.… python3 app/build.py` vytvoří `dist/mhdgo.html` s vloženým tokenem (není v gitu).

## Živé polohy pro další systémy (worker)

[`worker/mhdgo-worker.js`](worker/mhdgo-worker.js) je Cloudflare Worker, který sjednocuje polohy:
ODIS (celý Moravskoslezský kraj, záloha přes stávající proxy OpavaGO), **PID** z veřejné mapy mapa.pid.cz
(přesné párování podle čísla spoje; volitelně Golemio přes `GOLEMIO_TOKEN`), **mimořádnosti a výluky PID** (RSS pid.cz),
IDS JMK (`IDSJMK_URL` – jen s oficiálním přístupem, veřejná mapa IDS JMK je chráněná klíčem), vlaky SŽ a další portály CHAPS (`MPVNET_PORTALS`).

```bash
cd worker
npx wrangler deploy
npx wrangler secret put GOLEMIO_TOKEN   # volitelně, token zdarma na api.golemio.cz
```

Adresu workeru pak vlož v aplikaci: **Více → Nastavení → Živé polohy a worker**.

## Aktualizace jízdních řádů

Data platí od data sestavení zhruba 5–6 týdnů (CIS JŘ publikuje dopředu; 13. 12. 2026 je celostátní změna jízdních řádů).
Workflow [`.github/workflows/update-data.yml`](.github/workflows/update-data.yml) data každé pondělí přepočítá a uloží
(ručně: Actions → „Aktualizace dat mhdGO“ → Run workflow). Lokálně: `pipeline/build_all.sh` (potřebuje ~6 GB RAM).

Pipeline (Python 3.12+, `pip install osmium shapely numpy scipy pandas pyvalhalla`):

1. `osm_extract.py`, `osm_admin.py` – hranice, středy obcí, zastávkové sloupky, koleje z OSM
2. `gtfs_load.py` – načtení CIS JŘ, vzory tras, jízdní profily, kalendáře
3. `regions.py` – kraje, okresy, obce, přiřazení zastávek
4. `platforms.py` – rozdělení zastávek na nástupiště podle směru jen tam, kde jsou skutečné sloupky v OSM
5. `shapes.py` – geometrie tras (PID, koleje, Valhalla: celá trasa vzoru, přichycení zastávek na hlavní silnici, odstranění háčků; ladění na výřezu: `SHAPES_TEST=s,w,n,e`)
6. `packs.py` – výstupní balíčky (barvy linek, klasifikace MHD/regio/meziregio/vlak)
   a `netmerge.py` – sloučení souběžných tras do jedné čáry (síť jako v OpavaGO)
7. `bedekr.py` – památky z Wikidat
8. `app/build.py` – sestavení `mhdgo.html` z `app/` (CSS, JS, ikona a logo)

## Vývoj aplikace

Zdrojové soubory jsou v `app/` (`index.html`, `css/`, `js/`), `python3 app/build.py` z nich vytvoří jediný soubor.
Lokálně: `python3 -m http.server` v kořeni repozitáře a otevřít `http://localhost:8000/mhdgo.html`.

Licence dat: CIS JŘ (veřejná data), PID (CC BY 4.0), OpenStreetMap (ODbL), Wikidata (CC0), Wikipedie/Commons (CC BY-SA, autoři u fotografií).
