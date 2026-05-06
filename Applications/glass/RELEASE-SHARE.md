# Glass Share Drop

## Purpose

This document is the operator handoff for the current Glass packaging phase. It is optimized for a light sharing cycle on Linux and WSL, not for a fully automated public release.

## What Exists Right Now

The current release artifacts live in `release/`:

- `Glass-0.1.0.AppImage`
- `glass_0.1.0_amd64.deb`
- `SHA256SUMS`

The build has already passed these gates locally:

- `npm run typecheck`
- `npm test`
- `npm run package:linux`

## Recommended Share Path

Use the AppImage for the fastest zero-install trial.

Use the `.deb` when the tester wants the application installed into the system menu and package database.

## Linux Install Paths

### Option A: AppImage

```bash
chmod +x release/Glass-0.1.0.AppImage
./release/Glass-0.1.0.AppImage
```

### Option B: Debian package

```bash
sudo apt install ./release/glass_0.1.0_amd64.deb
```

If dependencies are missing, `apt` will resolve them during install.

## WSL Guidance

This is only practical with WSLg or another working GUI bridge.

If the tester is in WSL without GUI support, the package can still be inspected and installed, but the Electron window will not display.

Preferred WSL path:

1. Use WSLg-enabled Ubuntu.
2. Run the AppImage first.
3. If the window opens correctly, move to the `.deb` install only if needed.

## Integrity Check

Verify artifacts before sharing or testing:

```bash
sha256sum -c release/SHA256SUMS
```

## Known Limits In This Phase

- The package currently uses the default Electron icon because `build/` does not yet contain release icons.
- This is a local packaging flow, not yet a CI-driven release flow.
- Linux is the proven path right now. macOS and Windows are configured in `electron-builder.yml` but not validated in this phase.

## Feedback Questions For Testers

Ask testers to answer these five questions:

1. Did the app launch successfully on first attempt?
2. Did the window render correctly, especially under WSL?
3. Was startup visually smooth or did anything stall/flicker?
4. Did installation or launch produce any OS trust, dependency, or permission warnings?
5. Would they prefer AppImage or `.deb` for future drops?

## Exit Condition For This Phase

This light sharing phase is complete when at least one Linux user and one WSL user confirm:

- successful launch
- visible usable UI
- no blocking install issue
- clear preference on delivery format
