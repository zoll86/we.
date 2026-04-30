# we.

> Egy közös tér kettőtöknek.

**Aktuális verzió:** v0.8 — Architektúra-átalakítás. Mit mondana napi fix kártya, csapat-funkciók modal-ban (nem napi sorsolt), 12 vezetett páros-meditáció esti rituáléként, élő presence (ki mikor van fent).

## ⚙️ V0.8 frissítés (ha most v0.7-ről jössz)

### 1. SQL migráció — egy új mező a pairs táblába

Supabase → SQL Editor → New query:

```sql
alter table pairs add column if not exists last_seen jsonb default '{}'::jsonb;
```

Ez minden — egyetlen mező a presence-hez.

### 2. Fájlok cseréje a repo-ban

Cserélendő:
- `app.js`, `index.html`, `style.css`, `lib/sync.js`, `sw.js`, `supabase-schema.sql`, `README.md`

⭐ Új fájl: `data/meditations.js` (12 strukturált páros-meditáció)

A `config.js`, többi `data/`, `pool-peldak/` változatlan.

```bash
git add .
git commit -m "we. v0.8 — architektúra átalakítás + meditációk + presence"
git push
```

A localStorage kulcs verziót váltottam (`we-state-v7` → `we-state-v8`), mindkét telefonon **újra kell párosítani**.

## Mi az új (v0.8) — és mi MENT EL

### MENT EL: Mai választás napi sorsolás
A v0.7-es Mai választás random sorsolás (napi 1 funkció a 6-ból) elment. Helyette:
- **Mit mondana visszakerült napi rituálénak** (saját kártya a home-on, mint v0.5-ben). Mindennap egy.
- A 4 másik csapat-funkció (Hála / Hangulat / Ölelés / Rád gondolok / Híd) áthelyezve a **csapat-funkciók modal-ba** — bármikor választható, nem napi sorsolt.

### Új a Csillám alatt
A Csillám figura alá két új elem került:
- **„+ csapat-funkciók"** gomb — mindig elérhető. Tap → modal 5 pirulával.
- **„elcsendesedünk?" buborék** — csak este 19–22 óra között jelenik meg halványan. Tap → meditáció-választó.

### Csapat-funkciók modal
Tap a „+ csapat-funkciók"-ra → 5 pirula:
- 🌸 **Hála-üzenet** — egy konkrét köszönet
- 😊 **Hangulat-megosztás** — egy emoji egymásnak
- 🤗 **20 másodperces ölelés** — együtt csendben
- ❤ **Rád gondolok** — egy szív-jelzés
- 🌉 **Híd-jelzés** — „beszélnünk kéne"

Bármikor tappolhatod bármelyiket. Az állapotok ugyanúgy szinkronizálódnak a két telefon között, mint v0.7-ben. A különbség: nem napi sorsolt, és bármikor új-rakezdhető (van „új …" gomb minden funkcióban a kész állapot után).

### 🧘 Esti meditáció — a flagship új gameplay

A „elcsendesedünk?" buborék 19–22 óra között jelenik meg a Csillám alatt. Tap → meditáció-választó (12 darab).

**A 12 meditáció**:
1. Szinkron-légzés (5 perc, 3 fázis)
2. Szemkontaktus (5 perc)
3. Tonglen — ajándékozó légzés (8 perc)
4. Szív-érintés (6 perc, 3 fázis)
5. Loving-kindness — egymásra (8 perc, 2 fázis)
6. Test-pásztázás közösen (10 perc)
7. Háttal háttnak (7 perc, 3 fázis)
8. Sétáló meditáció (10 perc, 2 fázis)
9. Tartózkodó ölelés (5 perc)
10. Hála-meditáció a párnak (5 perc, 5 fázis)
11. Csendes együtt-ülés (10 perc)
12. Hullám-légzés (8 perc)

**Hogy működik:**
1. Választasz egyet → bevezető-képernyő (forrás, időtartam, intro szöveg)
2. „Indítom" → futás-képernyő nagy időzítővel
3. Minden fázisnál átírja a szöveget („Egyikőtök vezet…" / „Cseréljetek…" / „Az utolsó perc együtt…")
4. Fázis-átmenetnél **csenget** egy lágy bowl-szerű hang (Web Audio API-val generált, nem zavaró)
5. A végén egy záró csengetés + outro szöveg + „Bezárom" gomb

**Pl. Szinkron-légzés**: 2 perc egyikőtök vezet → CSENG → 2 perc másik vezet → CSENG → 1 perc együtt → CSENG (vége).

A 12-es pool a régi Pici alkalmazásból. Később tetszőleges méretre bővíthetjük (későbbi verziókban a többi pool-hoz hasonlóan feltölthetővé lehet tenni).

### 🟢 Élő presence
A Csillám alatt látható két korall pötty most **élve** mutatja, ki van fent:
- **Halvány pötty (0.5)** — ma volt itt (legalább egyszer megnyitotta ma)
- **Élénk + pulzáló pötty** — épp most online (Supabase Realtime presence-en keresztül)
- **Nincs megjelenítve** — sem ma nem volt, sem épp most

Plusz a státusz-szöveg is dinamikusan változik: „épp itt vagytok mindketten" / „ma mindketten itt" / „csak te vagy itt ma".

A presence-t Supabase Realtime presence csatorna kezeli (nem polling) — minimális overhead, valós idejű.

## Mi szinkron a két telefon között

| Funkció | Mit csinál |
|---|---|
| Párosítás, Csillám neve, szint-választás | UPDATE pairs |
| Suttogás (gyűjtődik) | INSERT whispers |
| Mai feladat teljesítése | INSERT feladat_log |
| Mai kérdés megbeszélése | INSERT kerdesek |
| Vágy hozzáadása / beteljesítése | INSERT/UPDATE vagyak |
| Mit mondana session + válaszok | INSERT mit_mondana_sessions + responses |
| Mit mondana felfedés | UPDATE mit_mondana_sessions |
| Saját pool feltöltés | UPDATE pairs.custom_pools |
| 5 csapat-funkció állapota | UPSERT team_activities |
| **Presence (épp most)** | Supabase Realtime presence csatorna |
| **Presence (ma volt itt)** | UPDATE pairs.last_seen |
| Téma-választás, meditáció (helyi) | csak helyileg |

## Mi NINCS v0.8-ban

- A meditációknak nincs archív vagy számláló (nem mentődik el a szerverre, hogy melyik volt)
- Nincs partner-jelzés meditáció közben („ő is meditál épp"). Esetleg v0.9-ben.
- Magányos pillanat alt-Mindennapok: kihagyva (nem volt szükség)

## Mi jön (v0.9)

Emlékek + idő-funkciók:
- **Visszhang** — egy gondolatot Pici „őrzi" és valamikor random átadja
- **Évforduló-szellem** — ha egy év múlva ugyanaznap volt valami emlékezetes
- **Zenei időkapszula** — egy dal egy emlékkel
- **Színes nap** — közös szín a napra
- **Párhuzamos pillanat** — random kérdés napjában egyszer mindkettőtöknél

## Mi jön később

- v0.10: Polish + Auth + szigorúbb RLS
- v1.0+: Mélyvíz mód

---

Bármi kérdés / hiba: szólj.
