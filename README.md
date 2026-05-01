# we.

> Egy közös tér kettőtöknek.

**Aktuális verzió:** v0.11 — Csillám-buborék mostantól egy **kinyitható chat-folyam**. Pislogás, hangjelzés, robosztus presence, éjféli rotáció.

## ⚙️ V0.11 frissítés (ha v0.10.2-ről jössz)

### 1. SQL — nincs új migráció

A `csillam_messages` és `vagyak` táblák már megvannak v0.9 / v0.10 óta. A v0.11 csak ezeket bővebben használja.

### 2. Fájlok cseréje

- `app.js`, `index.html`, `style.css`, `lib/sync.js`, `sw.js`, `README.md`

A `config.js`, `data/`, `pool-peldak/` változatlan.

```bash
git add .
git commit -m "we. v0.11 — buborék-folyam, pislogás, hangjelzés, presence-fix, éjféli rotáció"
git push
```

A localStorage v9 → érintetlenül marad (a `state-v9` kulcs még működik). **Nem kell újra párosítani**, csak hard refresh.

## Mi az új (v0.11)

### 🫧 Csillám-buborék mint kinyitható chat-folyam

Eddig a buborék **egy** üzenetet mutatott. Mostantól:
- **Kompakt mód** (alapból): a legfrissebb üzenet, fölötte halvány felirat hogy ki küldte (TE / Virág / Csillám). Jobb felül egy pici korall jelvény *„N új"* ha érkezett valami amit nem láttál.
- **Tap a buborékra** → **kinyílik** egy chat-szerű panel (max 360px magas, scrollozható). Ide tagolva minden üzenet — szülő-cimkével és időbélyeggel:
  - Saját üzeneteid: jobb oldalt, halvány korall háttér
  - Virág üzenetei: bal oldalt, semleges háttér
  - Csillám üzenetei (meditáció-javaslat, jegyzet-emlékeztető): középen, szaggatott vonalas keret
- **× gomb** felül jobbra → bezár
- A meditáció-javaslat és jegyzet-emlékeztető üzenetek továbbra is **kattinthatók a folyamban**

A folyam tartalma:
- ❤ rád gondolok
- 😊 hangulat-emojik
- ✉ suttogások (a régi külön szekció **megszűnt** — minden a buborékba kerül)
- 🌸 hála-üzenetek (késleltetett kézbesítés)
- 🧘 meditáció-javaslatok (este 21h)
- 💭 jegyzet-emlékeztetők (Csillám)

### 🔔 Hangjelzés (egységes, kikapcsolható)

Lágy két-hangú „ping" + halk vibráció (ha támogatja a böngésző) az alábbi pillanatokban:
- ❤/😊/💬 küldéskor (saját)
- Ha Virág bármit küld
- Mit mondana **felfedéskor** (mindkét válasz beérkezett, automatikusan kinyílik)

**Be/ki kapcsolható a Beállításokban** (Téma alatt új sor: „Hangjelzés"). A pingek soha nem szólalnak meg meditáció közben.

### 👁 Pislogás

A Csillám figura mind a 4 fejlődési stádiumban (baby/gyerek/tini/felnőtt) **5,5 másodpercenként** finoman pislog egyet. Élőbbé teszi a figurát.

### 🟢 Presence-fix

A korábbi verzióban a két pötty néha üresen maradt akkor is, ha mindketten fent voltatok. Most:
- A presence csatorna **join + leave** eseményeit is figyeli (nem csak a sync-et)
- 30 másodpercenként **újra-track** (heartbeat) — Supabase realtime presence néha „elfelejti" a klienseket
- Csatlakozás után 200ms-mel azonnali sync-et trigger-el

### ⏰ Éjféli rotáció

Az app **automatikusan** új feladatot, kérdést és Mit mondana sessiont sorsol éjfél után 5 másodperccel:
- A meg nem csinált feladat csendben eltűnik (B opció — a megcsinált egyébként a naplóba kerül a doneAt log-pal)
- A függőben lévő hála-üzenetek (delivery_at jövőben) **megőrződnek** és a kézbesítési időben megjelennek a buborékban (akkor is ha az adott napi feladat már lejárt)
- Ha az app nyitva van éjfél előtt, automatikusan átáll. Ha bezárva volt és reggel nyitod meg, akkor első home-betöltéskor.

## Mit szinkronizálunk

| Funkció | Hová |
|---|---|
| ❤/😊 buborékok, hála, suttogás, meditáció-javaslat | `csillam_messages` |
| Suttogás (régi archív is) | `whispers` (megőrizve a kompatibilitásért) |
| Mai feladat teljesítve | `feladat_log` |
| Mai kérdés megbeszélve | `kerdesek` |
| Strukturált jegyzet | `vagyak` |
| Mit mondana válasz | `mit_mondana_responses` |
| Presence (épp most) | Supabase Realtime presence |
| Presence (ma volt itt) | `pairs.last_seen` |
| Hangjelzés-preferencia | csak helyileg |

## Mi NINCS v0.11-ben

- A buborék-folyamban a Csillám soha nem ír önmagától „beszélgetésbe" (csak meditáció-javaslat és jegyzet-emlékeztető)
- A folyamból nem lehet törölni egyedi üzeneteket (a `expires_at` alapján maguktól lejárnak)
- Nem küldhet olvasási visszajelzést (a Suttogásnál direkt — eredeti alapelv)
- Híd-jelzés még mindig kihagyva

## Mi jön

A v0.12 valószínűleg a polish, Auth bevezetés, és szigorúbb RLS-policy-k.

---

Bármi kérdés / hiba: szólj.
