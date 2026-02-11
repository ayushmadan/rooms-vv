# Changelog

All notable changes to Vira Villas Rooms will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
