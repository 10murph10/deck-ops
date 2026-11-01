# Deck Ops

Cyberdeck build tracker: the route, 33 lessons across Linux, Electronics, CAD & fab and Radio, the parts list, a field log with photos, and a codex. Green phosphor, amber or blueprint.

- **Android app:** works with no signal, takes photos, reminds you about deck night, parts due and monthly updates.
- **Web app:** the same thing in a browser at https://10murph10.github.io/deck-ops/ (install it from Chrome or Edge's address bar).
- **Sync:** both sides sync through the private `deck-ops-data` repository whenever there's signal.

## Install on the phone

1. On the phone, open https://github.com/10murph10/deck-ops/releases/latest/download/DeckOps.apk
2. Open the download. Android asks to allow installs from your browser the first time; allow it, then tap Install.
3. Open Deck Ops, tap **sys**, paste your access key under Sync, and allow notifications.

Updates: when a new version is out, the app shows a banner. Tap Download, open the file, tap Update. Your data stays.

## One-time setup

**Signing secrets** (so every update installs over the last one): repository Settings > Secrets and variables > Actions > New repository secret.

| Name | Value |
| --- | --- |
| `KEYSTORE_B64` | contents of `keystore-b64.txt` |
| `KEYSTORE_PASSWORD` | contents of `password.txt` |

Keep a copy of both somewhere safe. Without the same key, a new build can't update the installed app.

**Web app:** Settings > Pages > Build and deployment > Source: **GitHub Actions**.

**Sync key:** github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens > Generate new token. Repository access: only `deck-ops-data`. Permissions: Contents, read and write. Paste it into **sys** on each device.

## How it's built

`www/` is the whole app: plain HTML, CSS and JS. Every push to `main` runs `.github/workflows/build.yml`, which:

- bundles the Capacitor plugins into `www/cap.js` and copies the fonts in,
- publishes `www/` to GitHub Pages,
- wraps `www/` in a Capacitor Android project, builds a signed APK, and attaches it to the release named after `package.json`'s version.

Bump `version` in `package.json` (and `APP_VERSION` in `www/app.js`, `CACHE` in `www/sw.js`) for each release.

Data layout in `deck-ops-data`: `deck/progress.json`, `deck/log.json`, `deck/photos/<id>.jpg`. Each change carries a timestamp, so edits made on two devices merge item by item.
