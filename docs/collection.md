# Collection (physical games) and "played on"

Status: **plan** (2026-11-03). Nothing built yet.

Two separate things:

1. **Collection**: the physical games you own. A quiet, opt-in add-on
   that never touches the diary.
2. **"Played on"**: one optional extra answer on a diary entry for retro
   games: original hardware, FPGA or emulation.

---

## 1. Collection

### Principles

- **Separate from the diary.**
  - Owning a game doesn't log it, and logging a game doesn't add it to
    the collection.
  - Nothing in the log form changes.
  - The two only meet in read-only places, such as a game page saying
    "In your collection · PAL, boxed".
- **Opt-in, so it doesn't get in the way.**
  - Until you turn it on in Settings, or bring in an import, nothing
    shows: no nav item, no Library segment, no button on game pages.
  - Once it's on, the game page gets one small "I own this" action and
    no more.
- **Fast to fill.**
  - Most collectors already keep their list in another app, so importing
    matters more than adding games by hand.
  - On the iPhone, adding games by barcode comes second.
- **Private by default.**
  - Prices paid and notes are never public.
  - Showing the collection on your profile is a separate switch, off by
    default.

### What a collection item is

You can own several copies of a game (for example a PAL and an NTSC
copy), so one game can have more than one item.

| Field | Notes |
|---|---|
| game + platform | Platform is required, because a physical copy is always for one platform |
| region | PAL / NTSC-U / NTSC-J / Other (optional) |
| completeness | Loose / Boxed (CIB) / Sealed / Box only, with optional checkboxes for cart/disc, box, manual |
| edition | Free text, e.g. "Collector's Edition", "Player's Choice" |
| condition | Optional 1–10 for item / box / manual (GAMEYE uses this scale) |
| acquired | Date, with the same precision rules as diary dates (day / month / year) |
| price paid | Private, with a currency |
| notes | Private |
| for sale / trade | Flag (later) |

`CollectionItem { id, userId, gameId, platformId, region?, completeness?,
hasGame/hasBox/hasManual?, edition?, itemCond?, boxCond?, manualCond?,
acquiredAt?, acquiredPrecision?, pricePaid?, currency?, notes?, source
("MANUAL"|"GAMEYE"|"CLZ"|"CSV"|"BARCODE"), createdAt }`

Index on `[userId, platformId]`, with no unique constraint, because
duplicate copies are allowed.

### Screens

- **Web `/collection` and an iPhone Library segment** (only when the
  collection is on):
  - grouped by platform with counts, and the same search-to-add as the
    Pull List;
  - filters: region, completeness;
  - sorts: title, platform, recently added.
- **A small stats strip:** number of games, number of platforms, % boxed.
  - Optionally "owned but never logged", which is a backlog view worked
    out from the diary without linking the two.
- **Game page:** "In your collection" with the copies listed, plus an
  "I own this" sheet.
- **Profile:** a collection tab, only if the profile switch is on.
- **Export:** the collection is added to the existing data export.

### Imports

**What exists out there:**
- [GAMEYE](https://gameye.app) exports a CSV spreadsheet, which covers
  owned items, wish list and for-sale items. There's no public API.
- CLZ Games exports CSV from the CLZ Cloud website, with fields you
  choose. The mobile app doesn't export, and there's no API.
- PriceCharting has a paid API (and a top-tier CSV), but that is a price
  guide. I found no documented way to export your own collection from it.
- None of these offer a sign-in link or sync. A **one-time import from a
  file** is therefore the realistic route for all of them.

**GAMEYE CSV columns** (taken from the sample exports in an unofficial
GAMEYE parser on GitHub, *not* from GAMEYE's own documentation):

```
Platform,Category,UserRecordType,Title,Country,ReleaseType,Publisher,
Developer,CreatedAt,Ownership,PriceLoose,PriceCIB,PriceNew,YourPrice,
PricePaid,ItemCondition,BoxCondition,ManualCondition,Beat,
PlayedCompletion,Notes,Tags
```

How the GAMEYE columns map onto collection fields:

| GAMEYE | Collection |
|---|---|
| Platform + Title | the game and platform (matched through IGDB) |
| Country | region (US → NTSC-U, Japan → NTSC-J, European countries → PAL) |
| Ownership | completeness (Loose / CIB / New, where New = Sealed) |
| Item / Box / ManualCondition | the condition fields |
| PricePaid | price paid |
| CreatedAt | acquired date (format is DD/MM/YYYY) |
| Notes | notes |

- Rows marked UserRecordType=**Owned** go into the collection.
- **Wish list** rows can optionally go to the **Pull List** instead.
- GAMEYE's **market prices** (Loose/CIB/New) are ignored. Their prices
  come from PriceCharting, so we shouldn't store them.
- **Beat** is shown as a hint only ("you marked 12 as beaten in GAMEYE,
  log them?"). It is never written to the diary automatically.

**How the import flow works:**
1. Upload a CSV.
2. Recognise GAMEYE or CLZ from the header row. For any other CSV, ask
   which column is the title and which is the platform.
3. Match each row against IGDB by title and platform:
   - platform names are matched through a table from GAMEYE/CLZ names to
     IGDB platform ids;
   - titles are matched by search with similarity scoring.
4. Show a **review screen** with three groups: *Matched* (ready),
   *Check these* (several possible matches, pick one) and *Not found*
   (search by hand or skip).
5. Nothing is saved until you confirm.

Other notes:
- Imports run on the server (web first). On the iPhone the file is
  picked in the app and sent to the same endpoint.
- Re-importing skips copies you already have (same game, platform,
  region and completeness), so running an import twice is harmless.

### Barcode scanning (iPhone, phase 3)

- **Scanning** uses Apple's built-in scanner (VisionKit). It's free and
  needs no extra library.
- **Looking up the barcode** is the hard part, because IGDB has no
  barcodes. The options:
  - **PriceCharting API:** looks up by barcode and is good for consoles,
    but it is paid.
  - **UPCitemdb:** has a free trial tier with tight daily limits, and its
    console coverage is patchy.
  - Either way, barcodes are weak for retro games: early cartridges often
    have no barcode at all.
- **Plan:**
  1. Scan.
  2. Look the barcode up in **our own table** first.
  3. Otherwise ask a lookup service for the title.
  4. Open search with that title filled in, and you confirm the match.
  5. Every confirmed match is saved to our own table, so over time we
    build our own barcode list and depend less on the paid lookup.
- The lookup goes through our server, so API keys stay off the phone and
  rate limits apply to us, not to each user.

### Phases

1. **Collection core (web + API + iPhone).**
   - The model, `/collection`, the game page section, the Settings
     switch, the export, and the iPhone segment and sheet.
2. **Imports.**
   - GAMEYE and CLZ presets, a generic CSV option, the review screen,
     and GAMEYE wish list → Pull List.
3. **Barcode scanning on the iPhone.**
   - Needs a decision on the lookup service and its cost.
4. **Later, maybe.**
   - Hardware (consoles, controllers) as a second kind of item.
   - A for-sale / trade list.
   - A collection value from a price source, which would need
     licensing. Probably skip it.

---

## 2. "Played on" in the diary

One optional field on a diary entry:

| Value | Label |
|---|---|
| `ORIGINAL` | Original hardware |
| `FPGA` | FPGA |
| `EMULATION` | Emulation |
| `RERELEASE` | Official re-release: Switch Online, Mini consoles, collections (optional; see the question below) |

An optional **device** detail can be added, chosen from a short list plus
free text:
- FPGA: MiSTer, Analogue Pocket / Duo / Super Nt / Mega Sg / 3D, MARS.
- Emulation: PC, Steam Deck, Retroid / Anbernic handheld, phone.

**Schema:** `PlayLog.playedVia String?` and `PlayLog.playedDevice String?`.

**When it shows:**
- Only when the entry's platform is retro: a console or handheld from
  IGDB generation 6 or earlier, arcade, or a legacy home computer.
- For modern platforms the field doesn't appear at all, so the log form
  stays the same for most games.
- It sits inside the existing platform row as a small "Played on" chip
  row. It is never required.

**Where it appears:**
- On the diary entry and review: "SNES · on MiSTer".
- A filter on the diary.
- A stats line in Year in review / Chronicles: "68% on original
  hardware".

**Imports:**
- RetroAchievements imports default to **Emulation**, since RA mostly
  runs through emulators. You can change it.
- Steam imports never set it.

**iPhone:** the same chips in the log sheet, shown under the same rule.

---

## Questions for Mike

1. **Re-release option:** should "Official re-release" be its own
   option, or count as Emulation (which is technically what it is)?
2. **Device detail:** should it be there from day one, or start with just
   the three or four main options?
3. **Barcode lookup:** are you willing to pay for PriceCharting's API for
   scanning, or should it start with the free lookup plus our own barcode
   table?
4. **Collection on profiles:** should it be private only for the first
   version, or have the public switch from the start?
