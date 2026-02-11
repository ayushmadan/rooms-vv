# Vira Villas Rooms (Offline-First)

Desktop-ready room allocation system with Windows MSI packaging, local MongoDB, modern tile UI, structured billing PDFs, and scheduled/manual backups.

## Inventory layout

- First floor: `Room 101, 102` (BIG), `Room 103, 104` (SMALL)
- Second floor: `Room 201, 202` (BIG), `Room 203, 204` (SMALL)
- Facilities: `Party Hall` and `Complete Dining Hall`

## Pricing defaults

- SMALL room: `Rs 1800 / night`
- BIG room: `Rs 2200 / night`
- Party Hall: `Rs 5000 / night`
- Complete Dining Hall: `Rs 20000 / night`
- Meal add-ons: `Rs 250` each (breakfast/lunch/dinner) per day
- GST component: default `10%` (inclusive model; totals remain as configured amounts)

## Key features

1. Customer onboarding with photo ID upload.
2. Date-based availability with floor/hall radio filters and tile selection.
3. Multi-room booking in one action under a single customer profile.
4. Booked-tile click shows overlapping bookings in selected date range.
5. Copy/Paste customer details across bookings to speed repeated entries.
6. Check-in requires customer detail confirmation prompt.
7. After check-in, customer profile edits are admin-only.
8. Booking quote in IST with default rent prefill and booking-time rent override.
9. Move/reschedule bookings to different room/hall and date range.
10. Cancel booking and room lifecycle status updates (check-in, check-out, cleaned).
11. Payment tracking with mode (UPI/Cash/Credit Card/Debit Card), advance collection, settlement, and bill-paid marker.
12. Admin unlock via PIN for pricing config, GST config, ledger reports, and past-customer edits.
13. Bill and declaration PDFs with brand header, line-item table, GST-inclusive split, and legal declarations.
14. IST-aligned booking windows (12:00 PM check-in, 11:00 AM check-out).
15. Scheduled backup CSV at 11:00 and 23:00 IST.
16. Manual backup export for custom date range.
17. Manual Google Drive upload for selected local backup files.

## Booking reference format

- New bookings are generated as: `VV-YYMMDD-####`
- Example: `VV-260211-0007`
- All booking actions accept this readable code (and also old Mongo IDs for backward compatibility).

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

## Build MSI (on Windows)

```bash
npm run build:msi
```

MSI output is generated in `dist/`.
