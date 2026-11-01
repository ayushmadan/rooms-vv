# Vira Villas Rooms

Front desk, restaurant and billing for Vira Villas. Runs entirely on one Windows PC with no internet
connection and no database to install.

## Install (Windows 10/11, 64-bit)

1. Run `Vira-Villas-Rooms-Setup-<version>.exe`. No administrator rights are needed.
2. On first launch choose one of:
   - **Start fresh** — property details, GST rates, meal rates and an admin PIN.
   - **Move from another computer** — open a `.vvdata` file exported from *Backup & transfer*.
   - **Bring data from the old version (1.x)** — see [Moving from version 1.x](#moving-from-version-1x).

Installing a newer version over an older 2.x version keeps all data. Uninstalling keeps the data too.

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

## Activating a computer (copy protection)

The installer can be copied, but a copied install stays locked. On first launch each computer
shows a **machine code** (e.g. `7KQM-3XWD-P9HT-2RVA`). Only the owner can turn it into an
activation key, with the private key on the owner's own computer:

```bash
node scripts/license.js issue 7KQM-3XWD-P9HT-2RVA
```

Send the printed key to the front desk; they paste it into the activation screen (no internet
needed). A key only works on the computer whose code it was made for.

The private key is in `~/.vira-villas-rooms/license-private.pem`. **Back it up** (e.g. on a pen drive
kept with you). If it is lost, run `node scripts/license.js keygen` on a new machine, ship an
update, and re-activate every computer. Never commit it to git.

## Guest ID privacy

- Front-desk staff record ID numbers and photos but only ever see them masked (`XXXX XXXX 1123`).
- Viewing a full ID number or photo, printing the guest register, and exporting guest data need
  the admin PIN.
- ID numbers and photos are **encrypted inside the data file** with a key protected by the admin PIN,
  so a copied database or backup reveals nothing without the PIN. The PIN cannot be recovered —
  keep it safe.

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

**Check for updates** in the sidebar compares the app with the version in `package.json` on the
`main` branch (GitHub redirects the old `master` name there). To ship a fix:

1. Bump `version` in `package.json` and push to `main`.
2. GitHub Actions tests, builds and publishes release `vX.Y.Z` with the installer (about 10 minutes).
3. On the hotel PC, *Check for updates* → *Install update* (admin PIN). It backs up, downloads,
   verifies the checksum, installs silently and reopens.

## Emailing the day report

Set the address under **Settings → Daily report email**. *Email report* on Today or Reports opens
Gmail in the browser (where you are signed in) with the recipient, subject and report filled in —
press Send.

## Moving from version 1.x

On the old computer open MongoDB Compass, connect to `localhost:27017`, open the `roomsvv`
database and export each collection as JSON: `rooms`, `customers`, `bookings`, `settings`,
`rateconfigs`, `mealrateconfigs`. In the new version choose all the JSON files under
*Bring data from the old version*. The import runs only on an empty system.

Guest ID photos are picked up from the old app's upload folder, so install 2.0 and run the import
**on the same computer** the old version used. After that, use *Export data file* to move
everything — photos included — to another computer.

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

## Releasing

Push a tag `vX.Y.Z`. GitHub Actions runs the tests, builds the installer and attaches it to a
release. See [scripts/GIT-HOOKS-GUIDE.md](scripts/GIT-HOOKS-GUIDE.md).
