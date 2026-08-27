# Medicine Tracker

Local-first personal medicine reminder app. Runs in the browser and as an **Android** app via [Capacitor](https://capacitorjs.com/). Data stays on the device (Capacitor Preferences on native, `localStorage` on web). This is a **personal reminder tool**, not medical advice.

## Features

- Today checklist with mark taken / undo
- Custom dose times (morning / noon / night defaults, editable)
- Strength, unit, dose amount, Rx notes
- Inventory (pill count), low-stock refill alerts, expiry warnings
- Calendar adherence view
- 14-day adherence chart + weekly % and streak
- Search / sort
- Export / import JSON backups
- Local notifications (native Android: works when app is closed; web: while tab is open)
- Light PWA manifest for “Add to Home Screen” in supported browsers

## Quick start (web)

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build for Android

Requirements: [Android Studio](https://developer.android.com/studio), JDK 21+, Android SDK.

```bash
npm install
npm run cap:sync          # builds web assets into dist/ and syncs to android/
npx cap open android      # opens Android Studio
```

In Android Studio: run on an emulator or device. Use **Enable reminders** in the app to grant notification permission.

Useful scripts:

| Script | Purpose |
|--------|---------|
| `npm run dev` | Local web development |
| `npm run build` | Production web build → `dist/` |
| `npm run cap:sync` | Build + copy into native projects |
| `npm run cap:android` | Sync and open Android Studio |

## Project layout

| Path | Role |
|------|------|
| `src/` | App UI and logic (`index.html`, `script.js`, `style.css`) |
| `public/` | PWA manifest + icon |
| `dist/` | Vite build output (`webDir` for Capacitor) |
| `android/` | Native Android project |
| `capacitor.config.json` | Capacitor app id and plugins |

## Data storage

On **Android**, medicines are stored with `@capacitor/preferences` (on-device). On **web**, the same keys use `localStorage`. Legacy browser data is migrated automatically on first load.

### Medicine shape (export v2)

```json
{
  "id": 1,
  "name": "Aspirin",
  "dosage": "1 tablet",
  "strength": "500",
  "unit": "mg",
  "frequency": "twice",
  "times": ["08:00", "20:00"],
  "pillCount": 30,
  "refillAt": 7,
  "expiryDate": "2027-01-01",
  "rxInfo": "Take with food",
  "dateAdded": "2026-07-18T07:00:00.000Z",
  "taken": ["2026-07-18#0"]
}
```

`taken` entries are `"YYYY-MM-DD#slot"`.

### Backup file

```json
{
  "medicines": [],
  "exportDate": "2026-07-18T12:00:00.000Z",
  "version": "2.0"
}
```

Older `version: "1.0"` backups still import; missing fields get defaults.

## iOS

Not scaffolded yet. On a Mac:

```bash
npm install @capacitor/ios
npx cap add ios
npm run cap:sync
npx cap open ios
```

Requires Xcode and an Apple Developer account for device/TestFlight builds.

## Future: cloud sync (Phase C — deferred)

Not implemented. When you need multi-device or family sharing:

1. Keep local Preferences/SQLite as source of truth (local-first).
2. Add Supabase or Firebase Auth + database.
3. Sync `medicines` + `taken` when online; resolve conflicts by `updatedAt`.
4. Optional caregiver invites via shared profile IDs.

Do not add a custom Node backend unless you have a specific reason; hosted Auth+DB is faster for this app size.

## Privacy

All data stays on the device unless you export a backup file. No accounts, no analytics, no cloud in v1.
