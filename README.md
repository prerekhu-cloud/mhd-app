# mhdGO – veřejná doprava celé České republiky

Nástupce aplikace **OpavaGO** pro celou ČR: stejný vzhled i ovládání jako OpavaGO (liquid glass, měděný akcent, písmo Outfit,
síť jako jedna měděná čára, bublina vozidla nad vozidlem, odjezdy s odpočtem, na tabletu a počítači kulatá tlačítka v hlavičce
a panely vpravo vedle mapy) – jen pro všechna města, regionální a meziregionální autobusy a všechny vlaky.

Aplikace je **jeden HTML soubor** – [`mhdgo.html`](mhdgo.html) (totéž je v `index.html` pro GitHub Pages).
Jízdní řády si stahuje po okresech z adresáře [`data/`](data) tohoto repozitáře (přes `raw.githubusercontent.com`).

Verze **bez mapy** je [`mhdgo-lite.html`](mhdgo-lite.html) – lehčí a rychlejší, pro každodenní cestování (viz níže).

## mhdGO bez mapy (`mhdgo-lite.html`)

Stejné jízdní řády a živá data jako mapová verze, ale bez mapy – jen to, co je potřeba na cestu:

- **Odjezdy** – zastávky v okolí s nejbližšími odjezdy, našeptávač (zastávky celé ČR, adresy, Moje místa), odpočet m:ss,
  filtr linek a nástupišť, jiný den a čas, rozbalení spoje se zbývajícími zastávkami.
- **Živé zpoždění v odjezdech i ve spojeních** – vozidla na trase (SŽ, PID, IDS JMK, ODIS, celostátní GTFS-RT) se párují se spoji;
  kde zdroj zpoždění nehlásí, odhaduje se z polohy (označeno „~“). Ve spojení se upozorní na **ohrožený přestup**.
- **Spojení** – odkud/kam (Moje poloha, Moje místa, zastávky, adresy), dřívější/pozdější, detail s časovou osou, nástupišti,
  pěšími úseky a odkazem na ověření a nákup v IDOS.
- **Navigace na zastávku** – pěší trasa (Valhalla/OpenStreetMap) s pokyny česky, směrová šipka (s kompasem telefonu),
  zbývající vzdálenost a čas příchodu, náčrtek trasy bez mapových podkladů, přepočet při sejití z trasy, odkazy do Mapy.cz a Google Maps.
- **Počasí** (Open-Meteo) – teď, rada na cestu (deštník, náledí, vítr), 24 hodin a 7 dní; den se rozbalí na hodinový detail.
- **Jízdné** – integrovaný systém podle místa, jak a kde koupit jízdenku, odkazy na oficiální ceníky a e-shopy; konkrétní ceny
  jen tam, kde jsou ověřené z platného tarifu (PID od 1. 1. 2026, síťová jízdenka IDZK), jinak odkaz na oficiální ceník.
- **Moje místa** – Domů, Práce a další (sdílené s mapovou verzí): karty s nejbližšími odjezdy a tlačítkem „Spojení sem“.
- **Rádce (AI)** – ptáš se běžnou řečí („Jak se dostanu domů?“, „Stihnu přestup?“, „Budu potřebovat deštník?“). Rádce používá
  model Claude od Anthropicu přes oficiální SDK a odpovídá z nástrojů nad daty aplikace (spojení, odjezdy se zpožděním,
  zastávky v okolí, pěší trasa, počasí, jízdné, Moje místa); ceny umí dohledat na oficiálních webech dopravců.
  Zapnutí:
  - **přes worker mhdGO** (doporučeno): na workeru nastav tajemství `ANTHROPIC_API_KEY` (návod v kapitole o workeru) – rádce pak
    funguje všem rovnou, bez nastavování v aplikaci; s tajemstvím `AI_CODE` jen pro ty, kdo znají přístupový kód;
  - **vlastní API klíč** z console.anthropic.com (Rádce → Nastavení rádce) – uloží se jen v daném zařízení.

## Funkce

- **Celá republika najednou** – po startu se načtou jízdní řády celé ČR (bez výběru okresu), mapa se přiblíží na tvou polohu,
  bez polohy ukáže celou ČR. Skutečné trasy vozidel (po silnicích a kolejích) se dotahují podle výřezu mapy.
- **Vozidla** – všechny spoje jezdí na mapě podle jízdního řádu; kde jsou živá data, ukazuje se skutečná poloha a zpoždění
  (✓ včas, +N min) – bez šipky směru, jen zpoždění. Klepnutím na vozidlo se ukáže jeho trasa do cíle („proudící“ jako v OpavaGO),
  karta vozidla má příští zastávky s časy. Dopravní síť ani trasy všech linek se nekreslí.
- **Odjezdy** z libovolné zastávky v ČR (i na jiný den a čas), filtr linek, živá zpoždění i u spojů mimo výřez mapy.
  Nástupiště se nevypisují (data o nich nejsou všude spolehlivá).
- **Hledání** jako v OpavaGO: našeptávač (Moje místa, zastávky celé ČR s linkami, adresy), „Hledané místo“ a karty nejbližších zastávek;
  **vyhledání spojení** (RAPTOR) s přestupy, pěšími přesuny a vlaky – řádky spojů, dřívější/další spoje a detail s časovou osou.
  U každé jízdy šipky **« »** posunou jízdu na předchozí / další spoj mezi stejnými zastávkami (aplikace upozorní, když přestup nenavazuje).
  Trasa spojení na mapě „proudí“ ve směru jízdy, pěší úseky na zastávku a ze zastávky vedou po chodnících (Valhalla / OSM).
- **Rádce (AI)** – odpovídá na otázky o cestě („Jak se dostanu domů?“, „Stihnu přestup?“, „Budu potřebovat deštník?“) z jízdních řádů,
  živých dat, počasí a jízdného (viz kapitola o verzi bez mapy a o workeru).
- **Počasí** – v hlavičce teplota, panel s radou na cestu, 24 hodinami a 7 dny (den se rozbalí na průběh po 3 hodinách), počasí i jinde.
- **3D mapa** (Mapbox Standard s 3D budovami): vozidla s 3D modely z OpavaGO (trolejbusy Škoda 26Tr/32Tr/36Tr, autobusy SOR, Iveco,
  Irisbus, Z-Group, vlaky RegioNova, RegioShark, motorák 810) a modely Tatra T3 a ČD 810; ostatní druhy procedurálně.
  **Denní doba a počasí podle skutečnosti** (východ a západ slunce, déšť, sníh, mlha, oblačnost z Open-Meteo), ručně lze přepnout.
  Ve 3D není výběr mapových podkladů ani trasy sítě. Tlačítko **Jízda vozidlem** je přímo na 3D mapě: vozidlo jede po trase spoje,
  kamera je za ním, panel s příští zastávkou, 2× rychleji; ovládání denní doby a počasí zůstává vidět i při jízdě.
- **Tmavý režim** – podklad „Světlá“ se v tmavém režimu jmenuje „Tmavá“ a náhledy podkladů jsou tmavé.
- **Bedekr** – nejlepší památky a zajímavosti Česka po krajích a okresech (fotografie z Wikimedia Commons, text z Wikipedie).
- **Budík před výstupem**, **pěší navigace k zastávce**, **Moje místa**, **mimořádnosti a výluky** (IDS JMK, PID).
- **Živé polohy** – vlaky celé ČR (Správa železnic), Brno a Jihomoravský kraj (otevřený stream data.brno.cz), Praha a Středočeský kraj (PID),
  Liberecký, Jihočeský, Zlínský, Moravskoslezský a Ústecký kraj (celostátní GTFS-RT projektu Oběhy: IDOL, JIKORD, IDZK, ODIS, DÚK,
  DPMD Děčín, Arriva Express), **Královéhradecký a Pardubický kraj** (veřejná mapa IREDO – autobusy i vlaky) a **MHD Hradec Králové**
  (veřejná mapa DPmHK). Kde zdroj neudává zpoždění, mhdGO ho odhadne z polohy vozidla (s vlnovkou ~).
  Bez veřejného zdroje zatím: MHD Plzeň, Olomouc, Pardubice (jejich mapa je chráněná podpisem, ten aplikace neobchází), Liberec, Zlín,
  Jihlava, Karlovy Vary, autobusy v Plzeňském, Karlovarském a Olomouckém kraji a na Vysočině (kraj má mapu mapavdv.kr-vysocina.cz bez
  zveřejněného rozhraní).
- Měřítko, hodiny, kompas, legenda; funguje na mobilu na výšku i na šířku i na počítači; instalace na plochu (PWA).

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
- `cz.json` – **celá ČR najednou**: zastávky, nástupiště, linky, vzory tras a jízdní řády (bez geometrií; ~24 MB, zabalené ~5 MB)
- `shp/<dlaždice>.json` – geometrie tras po dlaždicích 0,25° × 0,4° (načítají se podle potřeby)
- `okres/<id>.json`, `dalkove.json` – původní balíčky okresů (vstup pro `pipeline/national.py`, aplikace je už nepoužívá)
- `bedekr.json` – památky a místa po okresech

## Mapbox token

GitHub (push protection) nedovolí uložit Mapbox token do repozitáře, proto v `mhdgo.html` v repozitáři není.
Bez tokenu aplikace použije podklady OpenStreetMap (základní, světlá a tmavá varianta) a Esri (letecké) a 3D mapa nejde spustit.
Token se dá zadat:

- v aplikaci: **Více → Nastavení → Mapbox token** (uloží se v prohlížeči), nebo
- jednorázově v adrese: `mhdgo.html#mapbox=pk.…`, nebo
- při sestavení: `MAPBOX_TOKEN=pk.… python3 app/build.py` vytvoří `dist/mhdgo.html` s vloženým tokenem (není v gitu).

## Živé polohy a AI rádce (worker)

[`worker/mhdgo-worker.js`](worker/mhdgo-worker.js) je Cloudflare Worker, který sjednocuje živé polohy (PID, celostátní GTFS-RT Oběhy,
ODIS, IREDO, MHD Hradec Králové, vlaky SŽ, mimořádnosti PID) a slouží jako bezpečná proxy pro AI rádce – klíč Anthropic zůstává
jen ve workeru, do aplikace (veřejného HTML) se nikdy nedostane.

**Nasazení přes web Cloudflare (bez instalace):**

1. dash.cloudflare.com → **Workers & Pages** → worker **mhdgo-live** (nebo *Create → Worker*, název `mhdgo-live`) → **Edit code**.
2. Smaž obsah editoru a vlož celý soubor `worker/mhdgo-worker.js` → **Deploy**.
3. **Settings → Variables and Secrets → Add**: typ **Secret**, název `ANTHROPIC_API_KEY`, hodnota = klíč z console.anthropic.com → **Deploy**.
   Tím je rádce zapnutý pro všechny uživatele aplikace (bez dalšího nastavení v aplikaci).
4. Volitelně: Secret `AI_CODE` (heslo) – pak rádce funguje jen s tímto kódem (zadá se v aplikaci → Rádce → Nastavení rádce);
   proměnná `AI_MODEL` (např. `claude-sonnet-5-5` pro nižší náklady), `AI_IP_LIMIT` (dotazů za 10 min na IP, výchozí 40),
   `AI_HOUR_LIMIT` (dotazů za hodinu, výchozí 600).
5. **Doporučeno:** v console.anthropic.com → *Limits* nastav měsíční limit útraty – v otevřeném režimu může rádce použít každý,
   kdo má aplikaci.

Ověření: `https://mhdgo-live.<účet>.workers.dev/ai/status` vrátí `{"enabled":true,"open":true,...}`.

Přes příkazovou řádku: `cd worker && npx wrangler deploy && npx wrangler secret put ANTHROPIC_API_KEY`
(volitelně `npx wrangler secret put GOLEMIO_TOKEN` pro PID přes Golemio a `npx wrangler secret put AI_CODE`).

Proxy rádce propustí jen streamované dotazy s výzvou a nástroji rádce mhdGO, s povolenými modely a omezeným počtem tokenů.

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
6. `packs.py` – výstupní balíčky (barvy linek, klasifikace MHD/regio/meziregio/vlak), `netmerge.py` – sloučení souběžných tras
   a `national.py` – celostátní `cz.json` a dlaždice tras `shp/`
7. `bedekr.py` – památky z Wikidat
8. `app/build.py` – sestavení `mhdgo.html` a `mhdgo-lite.html` z `app/` (CSS, JS, ikona a logo)

## Vývoj aplikace

Zdrojové soubory jsou v `app/` (`index.html`, `css/`, `js/`; verze bez mapy `lite.html`, `css/lite.css`, `js/lite.js`,
`js/lite-ai.js`, `js/tickets.js`), `python3 app/build.py` z nich vytvoří jednosouborové `mhdgo.html` a `mhdgo-lite.html`.
Lokálně: `python3 -m http.server` v kořeni repozitáře a otevřít `http://localhost:8000/mhdgo.html`.

Licence dat: CIS JŘ (veřejná data), PID (CC BY 4.0), OpenStreetMap (ODbL), Wikidata (CC0), Wikipedie/Commons (CC BY-SA, autoři u fotografií).
Počasí: Open-Meteo (CC BY 4.0). Pěší trasy: Valhalla nad OpenStreetMap. Hledání adres: Photon (komoot).

## 3D modely

Ilustrační modely ze Sketchfab (v `data/models/`): **Tatra T3** – conflig, CC BY-NC 4.0
(https://sketchfab.com/3d-models/tatra-t3-76aa08d7c06340fc89229551c45e3c3a), **CD810 motor train** – voxellation, CC BY 4.0
(https://sketchfab.com/3d-models/cd810-motor-train-121922992c4c44c9a121a40c82c79382). Ostatní vozidla jsou zjednodušené modely mhdGO.
