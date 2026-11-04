# Vira Villas Rooms

Front desk, restaurant and billing for Vira Villas. Runs entirely on one Windows PC with no internet
connection and no database to install.

## Install (Windows 10/11, 64-bit)

1. Run `Vira-Villas-Rooms-Setup-<version>.exe`. No administrator rights are needed.
2. On first launch choose one of:
   - **Start fresh** — property details, GST rates, meal rates and an admin PIN.
   - **Move from another computer** — open a `.vvdata` file exported from *Backup & transfer*.
   - **Join the admin PC** — for a front desk that syncs with the admin PC (see below).

Installing a newer version over an older one keeps all data. Uninstalling keeps the data too.

## What it does

| Area | |
|---|---|
| Today | Arrivals, departures, in-house guests, collections and a board of every room's state |
| Reservations | Room × date chart; click an empty square to book; searchable booking list |
| Bookings | Multi-room bookings, meal plans by day, agreed rates, discounts, advance payments |
| Check-in | Identity confirmation, photo ID upload, declaration, accompanying guests, Form C fields |
| Folio | Room, meals, extras and restaurant charges; payments, refunds; GST split by category |
| Check-out | Collect balance, early departure, invoice with sequential GST number |
| Restaurant | Tables, takeaway, room service, KOT printing, split payment, post to room bill |
| Housekeeping | Rooms turn "needs cleaning" at check-out; out-of-order with reason |
| Expenses | Daily spends; cash expenses reduce cash-in-hand on the day sheet |
| Reports | Day sheet, guest register, accounts, invoices; CSV export for Excel |

Everything printable opens in a print window with **Print** and **Save as PDF**: registration card
and declaration, tax invoice, folio, KOT and restaurant bill (80 mm), day sheet, guest register.

Actions that change money or records after the fact (refunds, voids, rate and tax settings, reports,
data import) need the admin PIN. Every change is written to the activity log with the staff name.

## Data, backups and moving computers

- All data — bookings, guests, ID photos, bills, menu, settings — is one SQLite file:
  `%APPDATA%\Vira Villas Rooms\data\rooms.db`.
- A backup is saved daily in `data\backups` and kept for 30 days (configurable). Set
  *Also copy to folder* in **Backup & transfer** to mirror it to a pen drive, second disk or a
  OneDrive/Google Drive folder.
- **Export data file** writes one `.vvdata` file. On the other computer use **Import data file**
  (or *Move from another computer* in first-time setup). Importing saves a safety backup of the
  current data first, and the admin PIN travels with the file.

## Admin PC and front desks

Every computer runs the same installer. **The admin PC** is the one where you load your owner key
(*Network & licences → Make this the admin PC*, choose `license-private.pem` from your pen drive).
It issues and removes licence keys and is the hub the front desks sync with.

### Licence keys

1. A new computer shows its **machine code** on the activation screen.
2. On the admin PC: *Network & licences → Issue key*, enter the code and a label. Send the key to
   that computer; it is pasted on the activation screen (no internet needed).
3. Export **licenses.json** (same screen), put it in the root of this repository and push to `main`.

To **stop a copy working** (e.g. someone leaves): *Remove* its key on the admin PC, export
licenses.json again, commit and push. Desks on the hotel network lock at their next sync
(≤ 15 minutes); desks elsewhere when they next reach GitHub (checked every 15 minutes).

licenses.json holds only SHA-256 hashes of keys, signed with the owner key — it cannot be edited
or forged, and an older list never overrides a newer one. A desk that cannot confirm its key with
GitHub or the admin PC for **7 days** locks until it can check again. Keys issued after the last
published list are treated as pending, so new desks work before you commit.

Computers activated before version 3.1 have keys the admin PC has not seen: register each one
(*Register earlier key*, with its machine code) **before** publishing the first licenses.json.

The private key is `~/.vira-villas-rooms/license-private.pem`. **Back it up** offline. If it is lost:
`node scripts/license.js keygen` on a new machine, ship an update, re-activate every computer.
Never commit it.

### Sync between desks (hotel network only)

- On the admin PC: *Network & licences → Add a desk* shows a one-time pairing code.
- On the desk (first-time setup → *Join the admin PC*, or *Network & licences*): pick the admin PC
  (found automatically) or type its address, enter the code. The desk backs up its own data and
  takes a copy of the hotel's.
- Desks then exchange changes with the admin PC every **15 minutes** and on *Sync now* (top bar).
  A bar across the top of the window shows a sync in progress; the chip shows the last sync time.
- No internet is used. Traffic is encrypted per desk. The most recent edit of a record wins.
- Each desk numbers bookings and bills in its own series (`VV1-…`, invoices `VV-D1/26-27/0001`),
  a separate GST series per billing counter, so numbers never clash.
- Rooms booked for the same dates on two desks that could not sync are both kept and flagged on
  *Today* and *Network & licences* to be resolved.
- Windows Firewall on the admin PC must allow the app on **private networks** (TCP 47820, UDP 47821);
  it asks the first time. Guest Wi-Fi that isolates devices will block sync — use the staff network.
- Keep computer clocks correct (Windows does this automatically); the screen warns if a desk's
  clock differs from the admin PC's.
- Desks check in with the admin PC every 30 seconds. On the admin PC, *Network & licences* shows
  each desk as **Online** or **Offline since …**, its last sync, address and version, and
  **Sync now** (one desk) or **Sync all now**: the desk syncs at its next check-in, within 30 s.
- *Sync history* lists every sync with who started it (schedule, *Sync now*, the admin PC, first
  connection), changes sent and received, double bookings found, and errors. On the admin PC it
  covers all desks; on a desk, its own syncs.

### Upgrades

Updates never lose data. The data file records its version; each update runs only the schema and
data migrations it is missing, in order, once (`app/backend/src/db/schema.js`,
`db/data-migrations.js`). Desks and the admin PC must run the same version to sync — a desk on a
different version is told to update and keeps working on its own until then.

## Guest ID privacy

- Front-desk staff record ID numbers and photos but only ever see them masked (`XXXX XXXX 1123`).
- Viewing a full ID number or photo, printing the guest register, and exporting guest data need
  the admin PIN.
- ID numbers and photos are **encrypted inside the data file** with a key protected by the admin PIN,
  so a copied database or backup reveals nothing without the PIN. The PIN cannot be recovered —
  keep it safe.
- **On the admin PC no PIN is needed to view them**: full ID numbers, ID photos, declarations with
  photos and the guest register open directly. Enter the admin PIN once on the admin PC after
  loading the owner key (or after updating to this version); from then on the key is kept on that
  computer, protected by the owner key (`vault-owner.json` beside the owner key, never in exports
  or synced data). Removing the owner key removes it. Front desks still need the PIN.

## Printed documents

**Back office → Documents & printing** lets the admin adjust every printout — registration card and
declaration, tax invoice, folio, booking confirmation, receipt, restaurant receipt, KOT, day sheet
and guest register: titles, opening lines, notes, signature labels, which sections appear, accent
colour, heading style, logo and 58/80 mm receipt paper, with a live preview from real data.

Only the fields you change are saved. Everything else follows the built-in design, so when an
update improves a document it applies automatically while your own wording stays. *Reset to
default* returns a document to the built-in version. Declaration clauses, invoice terms, bank/UPI
details and booking terms are under **Settings**.

## Photographing IDs with a phone

At check-in (or on a guest's page) press **Use phone**. A QR code appears; scan it with any phone
on the same Wi-Fi as the front-desk PC, photograph the front and the back of the ID, and both
photos appear on that guest — encrypted, like every ID photo. No internet or app install is needed.

- The link works for 10 minutes and only for that guest; it stops working when the dialog closes.
- While a link is open the PC listens on port 47810 for the phone. That listener serves only the
  capture page, never guest data; the rest of the app stays private to the PC.
- The first time, Windows Firewall asks whether to allow network access: tick **Private networks**
  and allow (an administrator password may be needed once). Hotel guest Wi-Fi that isolates devices
  from each other will block this — use the staff network.

## Updates

**Check for updates** in the top bar compares the app with the version in `package.json` on the
`main` branch (GitHub redirects the old `master` name there). The app also checks by itself every
15 minutes and the button turns into *Update to x.y.z*. To ship a fix:

1. Bump `version` in `package.json` and push to `main`.
2. GitHub Actions tests, builds and publishes release `vX.Y.Z` with the installer (about 10 minutes).
3. On the hotel PC, *Check for updates* → *Install update* (admin PIN). It backs up, downloads,
   verifies the checksum, installs silently and reopens.

## Emailing the day report

Set the address under **Settings → Daily report email**. *Email report* on Today or Reports opens
Gmail in the browser (where you are signed in) with the recipient, subject and report filled in —
press Send.

## Development

Requires Node.js 24+.

```bash
npm install
npm start            # desktop app (Electron)
npm run serve        # same app in a browser at http://127.0.0.1:4000, data in ./.data
npm test             # unit + API tests
npm run dist:win     # Windows installer in dist/ (builds on macOS, Linux or Windows)
```

Layout:

```
electron/            desktop shell (window, print-to-PDF, preload bridge)
app/backend/src/
  db/                schema migrations and the SQLite store
  services/          bookings, folio, invoices, restaurant, reports, backup, print documents
  routes/            thin HTTP handlers
  lib/               money (paise), dates, validation, HTML escaping
app/frontend/        no-build ES modules; css/app.css holds the design tokens
test/                node:test suites
```

Schema changes go in `app/backend/src/db/schema.js` as a new migration; never edit a shipped one.
One-off data changes go in `app/backend/src/db/data-migrations.js` (append only). New tables that
should sync between desks are added to `app/backend/src/db/sync-tables.js` in the same migration.

## Releasing

Push a tag `vX.Y.Z`. GitHub Actions runs the tests, builds the installer and attaches it to a
release. See [scripts/GIT-HOOKS-GUIDE.md](scripts/GIT-HOOKS-GUIDE.md).
