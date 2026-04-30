# we.

> Egy közös tér kettőtöknek.

**Aktuális verzió:** v0.6 — Saját pool feltöltés (Beállításokban), kézzel állítható téma (világos / sötét / automatikus), kibővített Mit mondana pool (50 kérdés, mix játékos + komoly).

## ⚙️ V0.6 frissítés (ha most v0.5-ről jössz)

### 1. SQL migráció — egy új mező a pairs táblába

Supabase → SQL Editor → New query:

```sql
alter table pairs add column if not exists custom_pools jsonb default '{}'::jsonb;
```

Ez minden — a custom_pools tárolja mindkettőtök közös pool-jait, és a meglévő realtime feliratkozás miatt automatikusan szinkronizálódik.

### 2. Fájlok cseréje a repo-ban

Cserélendő:
- `app.js`
- `index.html`
- `style.css`
- `lib/sync.js`
- `data/mitmondana.js` (kibővítve 30 → 50 kérdés)
- `sw.js` (verzió bumpolva)
- `supabase-schema.sql`
- `README.md`

Új mappa: `pool-peldak/` — három példa-fájl, szabad mintaként.

A `config.js`, `data/feladatok.js`, `data/kerdesek.js` változatlan.

```bash
git add .
git commit -m "we. v0.6 — saját pool feltöltés + téma-választó"
git push
```

A localStorage kulcs verziót váltottam (`we-state-v5` → `we-state-v6`), tehát mindkét telefonon **újra kell párosítani** induláskor (vagy `__we.reset()`).

## Mi az új (v0.6)

### Téma-választó a Beállításokban
A telefon-rendszerbeállítás helyett most **kézzel** is állíthatjátok: automatikus / világos / sötét. A választás telefon-specifikus (mindkettőtöknél külön), és túléli az újratöltést.

### Mit mondana pool kibővítve 50-re
30 + 20 új kérdés, sokkal több játékos / képzeletbeli kérdéssel:
- *„Ha varázspálcád lenne 5 percig, mit csinálnál vele?"*
- *„Egy tárgy nálunk otthon, ami szerinted titokban él?"*
- *„Egy szín, amit a tehén után neveznél el?"*
- *„Egy hely a Földön, ahol szerinted ufót láthatsz?"*
- *„Egy varázsige, amit ráolvasnál rám reggel?"*

### 🎉 Saját pool feltöltés (a nagy újdonság)

A Beállításokban most három saját pool-szakasz van:
1. **Mit mondana pool**
2. **Mai feladat pool**
3. **Mai kérdés pool**

Mindhez tartozik:
- **Feltöltés** gomb → válassz ki egy `.txt` fájlt
- **Prompt másolása** gomb → másold ki a kész AI-promptot, és bárhol generáltathatod (ChatGPT / Gemini / Claude / Mistral / etc.)
- **Visszaállítás** gomb (csak ha van saját pool) → visszadob az eredetire

A feltöltött pool **mindkét telefonon ugyanaz** — a Supabase-en keresztül szinkronizálódik. Tehát ha te feltöltesz egy újat, a párodé is automatikusan átáll.

A pool azonnal hatályba lép — a következő napi feladat / kérdés / mit mondana már a sajátodból sorsolódik.

#### A workflow

1. Beállításokban → tap a „prompt másolása"-ra a kívánt típusnál
2. Megnyitsz egy AI-t (ChatGPT / Gemini / Claude / akármit), beillesztesz, küld
3. Megkapod a 30-100 elemes pool-t a megfelelő formátumban
4. Mented egy `.txt` fájlba (pl. „Mentés másként" → enter.txt)
5. Vissza a Beállításokba → „feltöltés" → válaszd ki a fájlt
6. Kész — a pool hatályba lép, és a párod telefonja is frissül

#### A formátumok

**Mit mondana** — legegyszerűbb. Egy kérdés / sor.
```
# we. mit mondana pool
# Egy kérdés / sor.

Mit kérnél most a hold-istennőtől?
Ha most teleportálhatnál egy hétre, hova mennél?
[stb.]
```

**Mai feladat** — három részre osztva | jellel.
```
# we. mai feladat pool
# Formátum: szöveg | időpont | költség
# időpont: reggel | este | hazaerkezes | barmikor
# költség: ingyenes | kicsi | kozepes

Vegyél egy szál virágot hazafelé jövet | hazaerkezes | kicsi
Mondj egy konkrét köszönöm-öt a párodnak | barmikor | ingyenes
[stb.]
```

**Mai kérdés** — három szint, [KONNYU] [KOZEPES] [MELY] szekciókkal.
```
# we. mai kérdés pool
# Szintek: [KONNYU] / [KOZEPES] / [MELY]

[KONNYU]
Mi volt ma a legjobb pillanatod?
[stb.]

[KOZEPES]
Mit szerettél bennem amikor először találkoztunk?
[stb.]

[MELY]
Mitől félsz leginkább velem kapcsolatban?
[stb.]
```

A `pool-peldak/` mappában mindháromnak ott van a példája.

#### Hibakezelés

Ha a fájl rossz formátumú, az app egy érthető hibát ír ki (pl. *„hibás időpont »reggelente« — érvényes: reggel, este, hazaerkezes, barmikor"*). A pool nem cserélődik le, az eredeti marad.

Ha a saját pool kifogy (pl. minden Mit mondana kérdést felfedtetek), az első kérdéssel kezdődik újra a sorsolás — ez azonos a default pool viselkedésével.

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
| **Saját pool feltöltés / visszaállítás** | UPDATE pairs.custom_pools |
| Téma-választás | csak helyileg (telefon-specifikus) |

## Mi jön (v0.7)

A halasztott „nagy csomag": **5 új csapat-funkció** a Mai választás keretbe:
- **Hála-üzenet** — egy köszönet, Csillám viszi át
- **Hangulat-megosztás** — gyors emoji, mindkettő látja a másikét
- **20 másodperces ölelés** — beépített számláló + „megcsináltuk"
- **„Rád gondolok"** — egy szív-jelzés a párodnak, bármikor küldhető
- **Híd-jelzés** — „valamit szeretnék megbeszélni — segítenél elindítani?"

Mai választás napi sorsol egyet a 6 funkcióból (Mit mondana + 5 új).

## Mi jön később

- v0.8: Esti rítusok + presence (közös meditáció, magányos pillanat, élő status-dotok)
- v0.9: Emlékek + idő-funkciók (Visszhang, Évforduló-szellem, Zenei időkapszula, Színes nap, Párhuzamos pillanat)
- v0.10: Polish + Auth + szigorúbb RLS
- v1.0+: Mélyvíz mód

---

Bármi kérdés / hiba: szólj.
