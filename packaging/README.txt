SpicyHome POS — Windows Setup
================================

This package contains the SpicyHome POS server, frontend, and
install/update engine.

Requirements
------------
- Windows 7 SP1 or newer (64-bit)
- Internet connection (for initial dependency install and updates)
- Administrator privileges (for service installation)

Quick Start (flat — unzip and run)
----------------------------------
1. Unzip this folder to any location.
2. Double-click start-server.bat
3. On first run, npm will download server dependencies (~50 MB).
   This requires an active internet connection.
4. Open http://localhost:3742 in Chrome.
   For a fullscreen POS terminal shortcut, see
   POS Desktop Shortcut (Chrome kiosk) below.
5. Log in with:
     Username: admin
     PIN: 1234
6. Change your PIN immediately (Admin > Users).

POS Desktop Shortcut (Chrome kiosk)
-----------------------------------
A Chrome kiosk shortcut locks the browser into fullscreen mode with
no address bar, toolbars, or window decorations -- ideal for a
dedicated POS terminal.

Requirement: Google Chrome 109 (the last version for Windows 7).
The server must already be running (Windows service or
start-server.bat).

Recommended Target (exact line, verified working):
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk --profile-directory=Default --no-first-run --disable-session-crashed-bubble --disable-infobars http://127.0.0.1:3742

Note: On some installs Chrome may be at
      "C:\Program Files\Google\Chrome\Application\chrome.exe"
      Verify the actual path on your machine.

How to create:
  1. Right-click Desktop -> New -> Shortcut
  2. Paste the Target line above in the "Type the location" field
  3. Click Next, name it e.g. "SpicyHome POS"
  4. Click Finish
  5. Optional: Right-click the shortcut -> Properties -> Change Icon
     to use a custom icon.

Why chrome.exe, not the Chrome "app" / PWA shortcut:
  Do NOT use chrome_proxy.exe with --app-id=... for kiosk mode.
  App-id shortcuts show a white title bar (origin + app name) even
  with --kiosk, breaking the true fullscreen experience.
  True kiosk requires chrome.exe --kiosk <url> with no --app-id.

Exit kiosk:
  Alt+F4 closes Chrome. If that fails: Ctrl+Shift+Esc to open Task
  Manager, find chrome.exe, and End Task. Esc and F11 usually do
  not exit true kiosk mode.

Custom port:
  If the server port was changed from 3742, update the URL in the
  shortcut Target to match (see Default Port section).

Profile isolation:
  --profile-directory=Default uses the standard Chrome profile.
  To keep POS isolated from personal browsing, use a dedicated
  profile name instead of Default:
    --profile-directory="POS Kiosk"
  Chrome will create a fresh profile directory on first launch.

Production Install (side-by-side + service)
-------------------------------------------
The recommended production setup uses the side-by-side install layout
with a Windows service for automatic startup on boot:

  install.bat -InstallDir D:\SpicyHomePOS

This will:
  1. Create D:\SpicyHomePOS with data\ + logs\ + releases\ + tools\
  2. Download the latest release from GitHub
  3. Extract to D:\SpicyHomePOS\releases\{version}\
  4. Run npm install for server dependencies
  5. Create a "current" directory junction pointing to the release
  6. Download NSSM and install a Windows service "SpicyHomePOS"
  7. Start the service and verify health

For air-gapped (no internet) deployment:

  install.bat -InstallDir D:\SpicyHomePOS -LocalZip E:\spicyhome-pos-win7-v202607.28.0.zip

File Structure (side-by-side)
-----------------------------
  spicyhome.config.json     Configuration file
  spicyhome.ps1             Install/update engine
  install.bat               Thin wrapper: engine -Install
  update.bat                Thin wrapper: engine -Update
  rollback.bat              Thin wrapper: engine -Rollback
  check.bat                 Thin wrapper: engine -Check (version status)
  tools\nssm.exe            NSSM service manager (downloaded on first use)
  data\spicyhome.db         SQLite database (persists across updates)
  logs\server\              Server stdout/stderr logs
  logs\updater\             Engine/update logs
  releases\{version}\       Side-by-side release directories
  current\                  Junction -> releases\{active-version}

File Structure (flat unzip)
---------------------------
  node\                     Portable Node.js v18.20.5 + npm
  server\                   NestJS server code
  packages\db\drizzle\      Drizzle SQL migrations
  pos\                      POS SPA (served by the server)
  data\spicyhome.db         SQLite database (created automatically)
  logs\server\              Server logs (created at runtime)
  VERSION                   Release version file
  start-server.bat          Launch script
  spicyhome.ps1             Install/update engine (use from install root)
  install.bat / update.bat  Engine wrappers

Production vs Debug
-------------------
- Production: NSSM Windows service "SpicyHomePOS" (installed via install.bat).
  The service starts the server automatically on system boot.
- Debug: start-server.bat (or start-server.ps1) runs the server in the
  foreground. Press Ctrl+C to stop. Use for troubleshooting only.

Updates
-------
Check for updates:

  check.bat

Apply the latest release:

  update.bat

Update flow:
  1. Download latest release zip from GitHub
  2. Extract to releases\{new-version}\
  3. Run npm install in the new release
  4. Stop the service
  5. Flip the "current" junction to the new release
  6. Prune old releases (keep latest 2 by default)
  7. Start the service
  8. Health check

Rollback
--------
If an update causes problems:

  rollback.bat

This flips the "current" junction to the previous release, restarts
the service, and verifies health.

Default Port
------------
The server listens on port 3742.
To change the port:
  - Edit spicyhome.config.json and set "port" to the desired value
  - Re-run: install.bat -InstallService to update the service config
  - Or for flat/debug: set PORT=xxxx in start-server.bat

Time Zone
---------
The server uses Asia/Riyadh (Saudi Arabia) time zone.
All timestamps and business dates are in +03:00.

Database
--------
Data is stored in data\spicyhome.db (SQLite).
Backup this file regularly. It contains all orders,
menu items, user accounts, and settings.

In side-by-side layout, data\ is outside the releases\ tree,
so it survives version updates and rollbacks.

Troubleshooting
---------------
Problem: "node.exe is not a valid Win32 application"
  -> Make sure you are on 64-bit Windows. This package
     requires Windows 7 x64 or newer.

Problem: Server fails to start
  -> Make sure port 3742 is not in use by another program.
     Try a different port in spicyhome.config.json.

Problem: Server crashes or behaves unexpectedly
  -> Check the log files in logs\server\server.out.log
     and logs\server\server.err.log for error messages.
  -> For support, zip logs\server\ and data\spicyhome.db
     and attach them to your support request.

Problem: npm install fails
  -> Check internet connection. Try running manually:
       cd server
       ..\node\npm.cmd install --production --ignore-scripts
       ..\node\npm.cmd rebuild better-sqlite3

Problem: Service won't start
  -> Check Windows Event Viewer for service errors
  -> Check logs\server\server.err.log
  -> Re-run: install.bat -InstallDir X:\path -InstallService
     to repair the service configuration

Error Monitoring (Sentry)
-------------------------
Optional Sentry error monitoring can be enabled by setting these
environment variables before starting the server:

  SENTRY_DSN=https://...
  SENTRY_ENVIRONMENT=production|development
  SENTRY_TRACES_SAMPLE_RATE=1.0
  SENTRY_PROFILES_SAMPLE_RATE=1.0

When SENTRY_DSN is not set, the server runs without error monitoring.
Sentry is never required — the system works offline without it.

In official release builds, the Sentry DSN may already be pre-configured
in two places:

  1. start-server.ps1 — for the debug path (foreground server)
  2. sentry.env — for the NSSM production service path (spicyhome.ps1
     reads this file and appends its keys to the service environment)

To disable a baked DSN for the debug path, comment out or remove the
$env:SENTRY_DSN assignment in start-server.ps1. For the production
service, remove or rename sentry.env in the current\ directory and
re-run: spicyhome.ps1 -InstallService

ZATCA E-Invoicing
-----------------
This release supports ZATCA Phase 2 e-invoicing with ECDSA signing,
UBL 2.1 XML generation, and TLV QR codes. See the ZATCA configuration
guide for setup instructions.
