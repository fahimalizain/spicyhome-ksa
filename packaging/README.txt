SpicyHome POS — Windows Setup
================================

This package contains the SpicyHome POS server and frontend.

Requirements
------------
- Windows 7 SP1 or newer (64-bit)
- Internet connection (first run only, for dependency install)

Quick Start
-----------
1. Unzip this folder to C:\SpicyHome or any location.
2. Double-click start-server.bat
3. On first run, npm will download server dependencies (~50 MB).
   This requires an active internet connection.
4. Open http://localhost:3000 in Chrome.
5. Log in with:
     Username: admin
     PIN: 1234
6. Change your PIN immediately (Admin > Users).

File Structure
--------------
  node/               Portable Node.js v18.20.5 + npm
  server/             NestJS server code
  server/main.js      Server entry point
  pos/                POS SPA (served by the server)
  prebuilt/           Native binaries (better-sqlite3, win_rawprint.exe)
  win_rawprint.exe    Windows USB printer spooler helper
  data/               SQLite database + server logs (created automatically)
  data/logs/          Server stdout/stderr logs (for troubleshooting)
  start-server.bat    Launch script

Default Port
------------
The server listens on port 3000.
To change the port, edit start-server.bat and set PORT=xxxx.

Time Zone
---------
The server uses Asia/Riyadh (Saudi Arabia) time zone.
All timestamps and business dates are in +03:00.

Database
--------
Data is stored in data/spicyhome.db (SQLite).
Backup this file regularly. It contains all orders,
menu items, user accounts, and settings.

Troubleshooting
---------------
Problem: "node.exe is not a valid Win32 application"
  → Make sure you are on 64-bit Windows. This package
    requires Windows 7 x64 or newer.

Problem: Server fails to start
  → Make sure port 3000 is not in use by another program.
    Try a different port in start-server.bat.

Problem: Server crashes or behaves unexpectedly
  → Check the log files in data/logs/server.out.log
    and data/logs/server.err.log for error messages.
  → For support, zip data/logs/ and data/spicyhome.db
    and attach them to your support request.

Problem: npm install fails
  → Check internet connection. Try running manually:
      cd server
      ..\node\npm.cmd install --production --ignore-scripts
      ..\node\npm.cmd rebuild better-sqlite3

Running as a Windows Service (optional)
---------------------------------------
To run the server automatically on boot, use NSSM
(the Non-Sucking Service Manager):

1. Download NSSM from https://nssm.cc/download
2. Run: nssm install SpicyHomePOS
3. Application path: C:\SpicyHome\node\node.exe
4. Arguments: C:\SpicyHome\server\main.js
5. Start directory: C:\SpicyHome\server
6. On the "Environment" tab, add:
     TZ=Asia/Riyadh
     SPA_DIST=C:\SpicyHome\pos
     SPICYHOME_DB=C:\SpicyHome\data\spicyhome.db
     PORT=3000
     SENTRY_DSN=https://...  (optional; may already be baked into start-server.ps1)
7. Start the service: nssm start SpicyHomePOS

The server will now start automatically on system boot.

When running via NSSM, set AppStdout and AppStderr on the
Process tab to capture logs:
  AppStdout:  C:\SpicyHome\data\logs\server.out.log
  AppStderr:  C:\SpicyHome\data\logs\server.err.log

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
in start-server.ps1. Check the file for a $env:SENTRY_DSN assignment.
To disable a baked DSN, comment out or remove that line.

Windows USB Printers
--------------------
USB printers are supported via the Windows print spooler using the
win_rawprint.exe helper. Configure printers with connection type "Windows
(USB/spooler)" in Admin > Printers and provide the exact printer queue
name (use "Refresh" to list available queues). The win_rawprint.exe binary
is included in the package at prebuilt/win_rawprint.exe.

The server environment variable WIN_RAWPRINT_PATH is automatically set by
start-server.ps1 to point to the bundled binary. No extra setup is
required for USB printer support.
