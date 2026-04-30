# we.

> Egy közös tér kettőtöknek.

**Aktuális verzió:** v0.9 — Csillám-buborék rendszer. A csapat-funkciók eltűntek (modal megszűnt), helyette a kis figura mellett megjelenő képregény-buborék mutatja az üzeneteket. Hála-üzenet és 20 mp ölelés sorsolható feladatként, esti meditáció-javaslat 21h körül a buborékban.

## ⚙️ V0.9 frissítés (ha most v0.8.1-ről jössz)

### 1. SQL migráció — egy új tábla a csillám-buborékoknak

Supabase → SQL Editor → New query:

```sql
create table if not exists csillam_messages (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid references pairs(id) on delete cascade,
  author_id text not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz default now(),
  delivery_at timestamptz not null,
  expires_at timestamptz
);

create index if not exists csillam_messages_pair_delivery on csillam_messages (pair_id, delivery_at desc);

alter publication supabase_realtime add table csillam_messages;
alter table csillam_messages enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'csillam_messages' and policyname = 'open_csillam_messages') then
    create policy "open_csillam_messages" on csillam_messages for all using (true) with check (true);
  end if;
end $$;
```

### 2. Fájlok cseréje

- `app.js`, `index.html`, `style.css`, `lib/sync.js`, `sw.js`, `supabase-schema.sql`, `README.md`
- `data/feladatok.js` (új: hala/oles típusok)

A `config.js`, `data/meditations.js`, `data/kerdesek.js`, `data/mitmondana.js` változatlan.

```bash
git add .
git commit -m "we. v0.9 — Csillám-buborék rendszer"
git push
```

A localStorage kulcs verziót váltottam (`we-state-v8-1` → `we-state-v9`) — mindkét telefonon **újra kell párosítani**.

## Mi az új (v0.9)

### A csapat-funkciók modal MEG**SZŰNT**
A v0.8-as „+ csapat-funkciók" gomb és modal eltűnt. A 6 funkció szétoszlott:
- **Hála-üzenet** → sorsolható mai feladatként
- **20 mp ölelés** → sorsolható mai feladatként
- **Hangulat-megosztás** → 😊 ikon a Csillám alatt → buborék
- **Rád gondolok** → ❤ ikon a Csillám alatt → buborék
- **Híd-jelzés** → kihagyva (egyelőre)
- **Meditáció-javaslat** → esti buborékban (21h körül)

### Új a Csillám szekció
A Csillám figura mellett-felett egy kép-regény stílusú **beszéd-buborék** jelenik meg amikor van aktív üzenet. Alatta két diszkrét akció-ikon:
- **❤** → tap → instant „rád gondolok" → mindkét telefonon a Csillám buborékjában megjelenik a ❤ (3 órán át látszik)
- **😊** → tap → kis emoji-választó (😊 😐 😔 😴 🌟) → instant hangulat → mindkét telefonon a buborékban (12 órán át)

A buborék mindkét fél telefonján ugyanazt mutatja — a Csillám közöttük lakik, ő mondja.

### Hála-üzenet — időkapszula-szerű kézbesítés
Amikor a Mai feladat sorsolt egy `hala` típusút (pl. „Írj egy hála-üzenetet — egy konkrét dolog amit ma a párodnál értékelsz."):
1. Tap a feladat-kártyán „írok →"
2. Egy modalban beírod a köszönetet
3. „Csillámra bízom ❤" — a feladatot teljesítettnek jelöli
4. Csillám őrzi és **random pillanatban (1–12 óra múlva, 8–22 közötti ablakban)** átadja
5. Mindkét telefonon hirtelen megjelenik a buborékban — egy meglepetés

Ha az írás éjszaka történne vagy késő este, a delivery automatikusan átcsúszik a következő napra (8–22h közötti random ablakba).

10 különböző hála-feladat-szöveg sorsolódik a poolból.

### 20 mp ölelés — sorsolható feladat
Amikor a Mai feladat sorsolt egy `oles` típusút (pl. „20 másodperces ölelés ma — amikor mindketten otthon vagytok."):
1. Tap a feladat-kártyán „indítom →"
2. 20 másodperc countdown — ölelés közben fut
3. Bell hang amikor lejárt
4. „megcsináltuk ❤" gomb → feladat lezárva

5 különböző ölelés-feladat-szöveg.

### Esti meditáció-javaslat — buborékban
Este 21:00–22:00 között a Csillám automatikusan megjelenít egy meditáció-javaslatot a buborékban, pl. „ma a szinkron-légzést javaslom".

Tap a buborékon → meditáció-javaslat képernyő (a régi Pici app stílusában):
- Csillám meditáló-pózban (lótusz, behunyt szem, mosoly) megjelenik
- Cím + forrás + bevezető szöveg
- **✓ Kipróbáltuk** → meditáció elindul (futás-képernyő, fázis-csengetésekkel)
- **↻ Mást javasolj** → újra sorsol egy másikat
- **Bezárás** → vissza a home-ra

Meditáció közben a Csillám figura **meditáló-pózba vált** (a home-on és a futás-képernyőn is). Vége után visszavált a normál pózba.

### Híd-jelzés — kihagyva
A Híd-jelzés (📞 „beszélnünk kéne") egyelőre nem szerepel a v0.9-ben. Visszahozható később.

## Adatfolyam

| Funkció | Hová ír |
|---|---|
| ❤ rád gondolok / 😊 hangulat / hála | **csillam_messages** tábla (azonnal vagy késleltetett delivery_at-tel) |
| Mai feladat hala/oles teljesítve | **feladat_log** + (hala esetén) **csillam_messages** |
| Meditáció (helyi) | csak helyileg, nem mentődik |
| Pici név, suttogás, kérdés, vágy, mit-mondana | mint v0.8.1 |

A buborék-üzenetek 1–12 órán át láthatók (típusonként eltérő `expires_at`). A legfrissebb aktív üzenet jelenik meg.

## Mi NINCS v0.9-ben

- Híd-jelzés
- Meditáció szerver-oldali logging (nincs partner-jelzés „ő is meditál")
- Hála-üzenet „úton ❤" indikátor a saját telefonon (rejtett meglepetés mindkettőtöknek)

## Mi jön (v0.10)

- Polish + Auth + szigorúbb RLS
- Esetleg Híd-jelzés visszahozás
- Visszhang, Évforduló-szellem, Zenei időkapszula, Színes nap (a tervezetből)

---

Bármi kérdés / hiba: szólj.
