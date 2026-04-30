# we.

> Egy közös tér kettőtöknek.

Egy minimalista PWA pároknak: napi mikro-feladatok, suttogások, közös rituálék — egy „we." márkanév alatt. Telefonra installálva, mintha sajátos app lenne.

**Aktuális verzió:** v0.2 — Supabase szinkron a két telefon között.
**Még nincs benne (v0.3+):** Suttogások archív, Vágyak, Mai kérdés, csapat-funkciók.

## Stack

- Vanilla HTML/CSS/JS PWA (semmi build step, semmi framework)
- Supabase (postgres + realtime) — két telefon közötti szinkron
- localStorage gyors-cache + offline mód
- GitHub Pages hosting

## ⚙️ V0.2 telepítési lépések (ha most frissítesz v0.1-ről)

### 1. Töltsd ki a `config.js`-t a saját Supabase kulcsokkal

A `config.js` fájl így néz ki:

```js
export const config = {
  SUPABASE_URL: 'YOUR_SUPABASE_URL_HERE',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY_HERE',
};
```

Cseréld ki a két placeholder-t a sajátjaidra. A Supabase Dashboard → **Settings** → **API** menüben találod:
- **Project URL** → ide az `SUPABASE_URL` helyére
- **Project API keys** → `anon public` → ide az `SUPABASE_ANON_KEY` helyére

⚠️ Az anon kulcs a Supabase szerint biztonságos kliens-oldalra. A v0.2 séma viszont nyitott — **ne adj hozzá érzékeny adatot, és ne tedd publikus URL-en hashtag-elve**.

### 2. Frissítsd a Supabase sémát egy ALTER paranccsal

A v0.1 sémából hiányzott a `pairs` tábla a realtime publikációból. Pótold:

```sql
alter publication supabase_realtime add table pairs;
```

(A többi tábla már benne van.) Ha az ALTER hibát ír „already member of publication", azzal nincs gond — csak ezt jelenti, hogy már be van állítva.

### 3. Push GitHub-ra

```bash
git add .
git commit -m "we. v0.2 — Supabase sync"
git push
```

GitHub Pages automatikusan újra-deployolja, pár perc.

### 4. A telefonokon

- A korábban telepített PWA frissül magától (de ha makacskodik, töröld a böngészőcache-t)
- Lépjetek vissza az üdvözlő képernyőre (a böngésző DevTools konzolban: `__we.reset()`) — vagy törölje mindkettőtök a localStorage-ot
- **Először az egyik csinál „új párost"** (kapja a kódot)
- **A másik beírja a kódot** — automatikusan átugrotok a naming képernyőre együtt
- Az egyik elnevezi Csillámot, a másik telefonján is megjelenik
- Innentől a Suttogó és a Mai feladat-jelzések valós időben szinkronizálódnak

## Mi működik valós időben (v0.2)

| Ami | Hogy szinkron |
|---|---|
| **Párosítás** | Initiátor INSERT → joiner UPDATE → realtime ping → mindkét telefon naming-be ugrik |
| **Csillám neve** | Update a `pairs.pici_name`-en → mindkettő látja |
| **Suttogás** | Csak egy aktív lehet — INSERT új, DELETE régi, mindkét telefon frissül |
| **Mai feladat teljesítése** | INSERT a `feladat_log`-ba, mindkét napló frissül |

## Mi NEM szinkron (még)

- A `Mai feladat` sorsolás — mindkettőtök a saját 133-as poolból kap napi feladatot. Ez szándékos: **mindenkinek a saját mikro-feladata van**.
- A skip gomb — a saját készülékeden cseréli, párodét nem
- A Naplónk → Vágyak / Suttogások / Kérdések fülek — még csak placeholder

## Ha nincs `config.js` kitöltve

Az app lokális módban fut, fent egy korall/arany sávban kiírja: **„helyileg fut · Supabase nem konfigurálva"**.

## Fájl-struktúra

```
we/
├── index.html              # belépő, az összes képernyő mint <template>
├── style.css               # design system (light + dark auto)
├── app.js                  # router, state, képernyő-handlerek
├── config.js               # ⚠️ Supabase kulcsok IDE
├── lib/
│   └── sync.js             # Supabase kliens + sync logika
├── data/
│   └── feladatok.js        # 133 mikro-feladat
├── assets/
│   ├── icon-192.png
│   └── icon-512.png
├── manifest.webmanifest    # PWA manifest
├── sw.js                   # service worker
├── supabase-schema.sql     # adatbázis-séma
├── .gitignore
└── README.md
```

## Reset

Ha vissza akarod állítani az állapotot a saját készülékeden:

```js
// böngésző DevTools konzolban:
__we.reset()
```

Ha az adatbázist is törölni akarod (új teszt-pár):

```sql
-- Supabase SQL Editor-ben:
truncate pairs cascade;
truncate whispers;
truncate feladat_log;
```

## Mi jön (v0.3)

1. **Mai kérdés** napi páros kérdés (3 szinten)
2. **Naplónk Vágyak-fül** — közös bakancslista
3. **Naplónk Suttogások-fül** — időrendi archív (a `whispers_archive` táblát kell hozzá létrehozni)
4. **Naplónk Kérdések-fül** — megbeszélt válaszok
5. **A 13 csapat-funkció** apránként (Mit mondana a másik?, Híd-jelzés, stb.)
6. **Mélyvíz mód** — etikai dilemmák A/B/C/D válaszokkal
7. **Pici evolúciós szakaszok** (baby → gyerek → tini → felnőtt)
8. **Auth + szigorúbb RLS** — ha publikussá tesszük az appot

---

Bármi kérdés / hiba: szólj.
