# Vira Villas Rooms (Offline-First)

Desktop-ready room allocation system with Windows MSI packaging, local MongoDB, modern tile UI, structured billing PDFs, and scheduled/manual backups.

## 🚀 Quick Install (Windows)

**[📥 Download Latest Version (MSI Installer)](https://github.com/ayushmadan/rooms-vv/releases/latest)**

### Installation Steps

1. Download the `.msi` file from the link above
2. Run the installer (requires administrator privileges)
3. The installer will automatically:
   - ✅ Install MongoDB if not already present
   - ✅ Configure MongoDB to start on system startup
   - ✅ Set up the application to launch at startup
   - ✅ Create desktop and start menu shortcuts
   - ✅ Initialize with default configuration

### System Requirements

- Windows 10/11 (64-bit)
- 4GB RAM minimum
- 500MB free disk space
- Internet connection for updates and Google Drive sync

### First Launch

After installation, launch the application from the Start Menu or Desktop shortcut. On first run:
1. The application will verify MongoDB is running
2. Default admin PIN is `1234` (change this in Settings)
3. Click "Initialize Inventory" to set up the default room layout
4. You're ready to start managing bookings!

---

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

## Auto-Update System

The application includes built-in update checking and installation:

### In-App Updates

1. **Check for Updates**: Click "Check Update" in the header
   - Compares local version with latest GitHub release
   - Shows available version if update exists

2. **Install Updates**: Click "Update & Restart"
   - Automatically downloads and installs latest version
   - Restarts the application after update completes

### Creating New Releases

The repository has **automated release hooks** that make version bumping easy:

#### Using Git Hooks (Recommended)

1. **Make your changes** and stage them (`git add .`)
2. **Commit normally** (`git commit -m "message"`)
   - A dialog/prompt will ask if you want to create a release
   - Choose **No** for normal commits
   - Choose **Yes** for releases, then select version type (Patch/Minor/Major)
3. **Push** (`git push`)
   - The commit AND tag are pushed automatically
   - GitHub Actions builds the MSI and creates the release

See [Git Hooks Guide](scripts/GIT-HOOKS-GUIDE.md) for detailed workflow.

#### Manual Release (Alternative)

1. **Update Version**: Edit `package.json` version (e.g., `0.2.0`)
2. **Create Git Tag**:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. **GitHub Actions**: Automatically builds MSI and creates release
4. **Users Notified**: Installed apps will detect the new version

### Manual Build (Development)

```bash
# Build MSI locally
npm run build:msi

# Build with auto-fetch from GitHub
npm run build:msi:pipeline

# Manual update (without MSI)
npm run update:win

# Ensure MongoDB is running
npm run mongo:ensure:win
```

## Default Admin PIN

- If `.env` is missing, default `ADMIN_PIN=1234`.
- For production, set your own pin in `.env`.
