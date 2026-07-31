# Claude Usage Deck — Stream Deck plugin

Fills your Stream Deck with live Claude usage from **Claude Usage Space**.

## Layout (one column = one account)

```
┌───────────┬───────────┬───────────┬───────────┬───────────┐
│  NAME     │  NAME     │           │           │           │
│  · plan   │  · plan   │   ✦ stars │   ✦ stars │   ✦ stars │  ← screensaver
├───────────┼───────────┤   (empty  │   (empty  │   (empty  │
│  5H  19%  │  5H  40%  │  columns) │  columns) │  columns) │
│  2h 3m    │  1h 12m   │           │           │           │
├───────────┼───────────┤           │           │           │
│  7D  62%  │  7D  55%  │           │           │           │
│  3d 4h    │  2d 8h    │           │           │           │
└───────────┴───────────┴───────────┴───────────┴───────────┘
```

- **Row 1** — account name + plan (Max 20x, …)
- **Row 2** — 5-hour session %, severity-colored (green → red), with reset countdown
- **Row 3** — weekly %, with reset countdown
- **Empty columns** — animated starfield screensaver (also shown if the app is offline)

Percentages are colored by severity exactly like the app.

## Install (Windows)

1. Make sure **Claude Usage Space** is running and logged in (it serves the data on `127.0.0.1:37587`).
2. Run the installer script (right-click → Run with PowerShell, or):
   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```
   This copies the plugin into `%APPDATA%\Elgato\StreamDeck\Plugins\` and restarts Stream Deck.
3. In the Stream Deck app, open the **Claude Usage** category in the actions list and drag **Usage Tile** onto **every key**.
   - Tip: configure one key, then **right-click → Copy**, and **Paste** onto the others — faster than dragging 15 times.

That's it — the tiles arrange themselves automatically based on their position. Add a second account in the app and its column fills in on the next refresh.

## Manual install

Copy the folder `com.claudeusage.deck.sdPlugin` into:
- **Windows:** `%APPDATA%\Elgato\StreamDeck\Plugins\`
- **macOS:** `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`

then quit and reopen the Stream Deck app.

## Notes

- The app must stay running (minimized is fine) — it's the data source. Nothing leaves your machine; the server is bound to localhost only.
- Data refreshes every ~5 s on the deck; the app fetches every ~15 s while the deck is active.
- Built for a 5×3 deck but works on any size (extra accounts wrap to whatever columns exist).
