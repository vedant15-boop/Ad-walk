# AdWalk Runner (Android / Android TV)

Native broadcast app for the **runner** persona. Logs in with the same
credentials as the web app, lists the runner's assigned screens, and plays the
scheduled ads fullscreen in a loop. Built with Expo (SDK 56).

It talks to the **same backend** as the website (`https://targettedpromotions.com`)
— no separate database. Anything changed on the PC (approve an ad, assign a
screen, book a slot) shows up here within ~30 seconds.

## What it does

- **Login** (runner accounts only) — credentials are saved, so after a power cut
  the TV resumes without anyone re-typing them.
- **Screen select** — pick which assigned screen this device is broadcasting.
- **Player** — 30 slots × 12s, cycling. Images and videos both render
  `contain` (fit-to-screen, never cropped or stretched) on any resolution
  (720p / 1080p / 4K). Black letterbox fills any aspect-ratio gap.
- **Live sync** — re-fetches slots every 30s, so newly approved ads start
  playing automatically.
- **Play logging** — every completed play is posted to `/api/play-logs`
  (same billing/commission pipeline as the web player).
- **Single-session** — heartbeats every 30s; if the same runner opens the screen
  on another device, this one shows "Session Ended".
- **GPS** — captures location while playing and shows it on the status strip.
  It also tries to POST to `/api/runner/location` every 30 min — that endpoint
  doesn't exist on the backend yet, so it's a harmless no-op until added
  (see "Next step" below).
- **Keep-awake** — the screen never sleeps while broadcasting.
- **TV-ready** — installs on Android TV, appears on the TV home (Leanback
  launcher), fully operable with a D-pad remote.

## Building the APK (Expo cloud — no Android SDK needed on your Mac)

1. Install the EAS CLI (one time):
   ```bash
   npm install -g eas-cli
   ```
2. Log in (free Expo account — create one at https://expo.dev if needed):
   ```bash
   eas login
   ```
3. From this folder, build the APK:
   ```bash
   cd adwalk-runner-tv
   eas build -p android --profile preview
   ```
   This compiles in Expo's cloud (~10–15 min) and prints a download link to a
   `.apk` file.

## Installing on the Android TV

1. Download the `.apk` from the EAS link (on a phone/PC).
2. Get it onto the TV — easiest options:
   - Upload to Google Drive, open **Drive** on the TV, download, open.
   - Or use the **Send Files to TV** app (on both phone and TV).
3. The TV will ask to allow "install from unknown sources" — allow it.
4. Open **AdWalk Runner** from the TV home screen.
5. Log in with the runner's username + password, pick the screen, done.

## Pointing at a different server

Edit `BASE_URL` in `src/config.ts` and rebuild.

## Next step (backend, ~15 lines)

To persist GPS, add `POST /api/runner/location` to the api-server
(`{ screenId, lat, lng, recordedAt }` → insert a row). The app already sends it;
nothing in the app needs to change once the endpoint exists.
