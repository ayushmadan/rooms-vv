# Changelog

All notable changes to Vira Villas Rooms will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Admin PC mode (owner key loaded): issue, register and remove licence keys; export signed licenses.json.
- Licence revocation: keys checked every 15 minutes against licenses.json on GitHub and the admin PC;
  7-day offline grace; removed keys lock the computer.
- Two-way sync between front desks and the admin PC over the hotel network only (no internet):
  pairing codes, encrypted traffic, change log with latest-edit-wins, per-desk id and GST series,
  double-booking detection, every 15 minutes and on demand, with a top-of-window loader.
- Check for updates in the top bar, with an automatic check every 15 minutes.
- Data-migration framework so updates transform existing data once, in order.
- Admin PC: live desk status (online/offline, last sync, version), *Sync now* per desk and
  *Sync all now* (desks pick it up within 30 seconds), and a sync history on every computer.
- Admin PC: guest ID numbers, ID photos and the guest register open without the admin PIN
  (after the PIN has been entered once there). Front desks still need the PIN.

### Changed
- Activation keys now carry a label and issue date (older keys keep working).

### Removed
- Import from the MongoDB-based 1.x version (MongoDB Compass / mongoexport JSON). The app has no
  MongoDB code or references left; move data between computers with *Backup & transfer*.

## [2.0.0] - 2026-10-31

### Changed
- Data now lives in one local SQLite file inside the app. MongoDB, its Windows service and
  its installer are gone; nothing besides the app is installed and no admin rights are needed.
- Per-user Windows installer (~120 MB, previously ~500 MB) that installs without internet.
- Entirely new interface: Today board, reservation chart, booking folio, restaurant counter.
- Money is stored in paise; booking rates are frozen when the booking is made.
- Admin PIN is hashed, rate-limited and changeable in Settings (no longer read from `.env`).
- The local server listens on 127.0.0.1 only and rejects cross-site requests.

### Added
- Check-in declaration with accompanying guests, travel details and Form C fields for foreign nationals.
- Recorded check-in and check-out times, early departure, extend/move, no-show, undo (admin).
- Folio with extra charges, split GST by category (room, hall, food, services), sequential GST invoice numbers.
- Restaurant: menu, tables, dine-in, takeaway, room service, kitchen order tickets, split payments, post to room bill.
- Housekeeping status board, expenses book, daily report, guest register, accounts and CSV exports.
- Printable registration card, tax invoice, folio, KOT, thermal restaurant bill, day sheet and guest register, with Save as PDF.
- Backup & transfer: one-file export/import between computers, daily automatic backups with an optional mirror folder, restore.
- One-time import of data from version 1.x (MongoDB Compass / mongoexport JSON).

- Prices & catalogue: room/hall rates, special date rates, meal plans, food menu and a services
  catalogue (laundry, extras, transport) — all priced in one place and pickable instead of typed.
- Counter bills for walk-in customers mixing food, services and custom lines; per-line price changes.
- Rate and discount changes at check-in and check-out.
- Booking confirmation and payment receipt printouts; invoices with SAC codes, UPI/bank details and terms.
- Guest ID numbers and photos encrypted at rest, masked for staff, viewable with the admin PIN.
- ID capture from the PC camera at check-in, or from any phone on the hotel Wi-Fi by scanning a QR code
  (front and back sides, encrypted, one-time 10-minute links).
- Documents & printing: admin wording, section and colour options for every printout with live preview;
  unchanged fields follow the built-in designs, so updates reach every install automatically.
- Machine activation: copied installs stay locked until the owner issues a key.
- Check for updates: installs new versions published from the main branch.
- Email report: opens Gmail compose with the day report filled in.

### Removed
- Google Drive upload, git-based in-app updater, MongoDB scripts and the MSI/WiX pipeline.

## [Unreleased]

### Added
- Automated MSI installer pipeline with GitHub Actions
- Post-installation script for MongoDB setup and auto-start configuration
- Version-controlled release system with automatic update detection
- Golden/amber color scheme matching the Vira Villas brand
- Simplified Operations tab with booking detail panel
- Booking count display on room tiles
- Professional terminology throughout the application

### Changed
- Improved UI/UX with warm golden theme
- Enhanced booking management workflow
- Updated room tiles to show pricing prominently
- Admin Pricing labels now more professional

### Fixed
- Room availability now correctly shows after checkout
- Bidirectional date validation in booking forms

## [0.1.0] - 2024-02-11

### Added
- Initial release
- Offline-first room allocation system
- Customer management with ID verification
- Multi-room booking support
- Payment tracking (UPI, Cash, Credit/Debit cards)
- Bill and declaration PDF generation
- Automatic scheduled backups (11:00 and 23:00 IST)
- Google Drive integration for backups
- Admin PIN protection for sensitive operations
- IST-aligned booking windows (12:00 PM check-in, 11:00 AM check-out)
- Booking reference format: VV-YYMMDD-####
- Windows MSI packaging with electron-builder
- Local MongoDB integration

### Features
- 10 room inventory (4 big, 4 small, 1 party hall, 1 dining hall)
- Floor-based filtering
- Meal planner by date
- Move/reschedule bookings
- Payment history tracking
- Bill paid marker
- Customer detail copy/paste
- Admin ledger reports
- CSV backup export
- Manual Google Drive upload

[Unreleased]: https://github.com/ayushmadan/rooms-vv/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ayushmadan/rooms-vv/releases/tag/v0.1.0
