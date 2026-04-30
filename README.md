# we.

> Egy közös tér kettőtöknek.

Egy minimalista PWA pároknak: napi mikro-feladatok, suttogások, közös rituálék — egy „we." márkanév alatt. A telefonra installálva, mintha sajátos app lenne.

**Aktuális verzió:** v0.1 — alap-keret + üdvözlet + párosítás + érkezés + Mindennapok + Naplónk feladat-napló.
**Még nincs benne (v0.2+):** Supabase real-time szinkron, Suttogások archív, Vágyak, Kérdések, „Mit mondana a másik?", többi 12 csapat-funkció.

## Stack

- **Vanilla HTML/CSS/JS** (semmi build step, semmi framework)
- **PWA** (service worker, manifest — telefonra installálható)
- **localStorage** v0.1-ben (helyi tárolás), **Supabase** v0.2-től
- **GitHub Pages** hosting (statikus)

## Helyi futtatás

Csak nyisd meg az `index.html`-t böngészőben. Vagy ha service worker is kell:

```bash
# bármi statikus szerverrel
python3 -m http.server 8000
# nyisd: http://localhost:8000
```

## Deploy GitHub Pages-re

1. Készíts egy új repo-t a GitHub-on (pl. `we-app`, lehet privát is)
2. Push:
   ```bash
   cd we
   git init
   git add .
   git commit -m "we. v0.1"
   git branch -M main
   git remote add origin git@github.com:USERNAME/we-app.git
   git push -u origin main
   ```
3. GitHub Pages bekapcsolása:
   - Repo → Settings → Pages
   - Source: `Deploy from a branch`
   - Branch: `main`, mappa: `/ (root)`
   - Save
4. Pár perc múlva elérhető lesz: `https://USERNAME.github.io/we-app/`

## Telepítés telefonra

A deployolt URL-t megnyitod a telefonon, aztán:

- **iPhone (Safari):** Megosztás → Hozzáadás a kezdőképernyőhöz
- **Android (Chrome):** Menü → Telepítés / Hozzáadás a kezdőképernyőhöz

Onnantól mintha appként futna, app-ikonnal a kezdőképernyőn.

## Fájl-struktúra

```
we/
├── index.html              # belépő, az összes képernyő mint <template>
├── style.css               # design system (light + dark auto)
├── app.js                  # router, state, képernyő-handlerek
├── data/
│   └── feladatok.js        # 133 mikro-feladat
├── assets/
│   ├── icon-192.png        # PWA ikonok
│   └── icon-512.png
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # service worker (offline cache)
├── supabase-schema.sql     # adatbázis-séma (v0.2-höz)
├── .gitignore
└── README.md
```

## Hogyan működik most (v0.1)

- **Üdvözlet:** két gomb — új páros vagy csatlakozás
- **Párosítás:** generál egy 6-jegyű kódot, vagy beírható egy kódot. **v0.1-ben helyileg tárolódik, nincs valódi szinkron** — szóval mindkettőtök külön „párosul" a saját készülékén
- **Elnevezés:** közösen Csillámnak (vagy bárminek) elnevezitek
- **Érkezés-animáció:** lefut minden belépéskor, tappal kihagyható (0.4s után)
- **Mindennapok:** Suttogó (helyi) + Mai feladat (133-ból sorsolva, ↻ gombbal cserélhető) + Csillám figura
- **Naplónk:** a Feladatok-fülön gyűlnek a teljesített feladatok időrendben

**Reset:** ha vissza akarod állítani az állapotot, a böngésző konzolban: `__we.reset()`.

## Mi jön (v0.2)

1. **Supabase integráció** — két telefon közötti valódi szinkron
2. **Suttogás real-time** — ha Virág küld egyet, a te telefonod azonnal mutatja
3. **Naplónk Suttogások-fül** — időrendi archív
4. **Mai kérdés** — napi páros kérdés (3 szinten)
5. **Naplónk Vágyak-fül** — közös bakancslista

## Mi jön (v0.3+)

- A 13 csapat-funkció (Mit mondana a másik?, Híd-jelzés, stb.)
- Mélyvíz mód (etikai dilemmák)
- Pici evolúciós szakaszok (baby → gyerek → tini → felnőtt)
- Évforduló-szellem, közös meditáció, stb.

## Licenc

Saját projekt, magán-használatra. Ha publikussá tesszük: MIT vagy hasonló.

---

Bármilyen kérdés, csak szólj.
