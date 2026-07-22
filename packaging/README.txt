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
  data/               SQLite database (created automatically)
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
7. Start the service: nssm start SpicyHomePOS

The server will now start automatically on system boot.
