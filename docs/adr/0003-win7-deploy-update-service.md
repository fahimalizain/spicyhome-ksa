# ADR 0003 — Windows 7 Deploy, Update & Service Engine

Date: 2026-07-28
Status: Accepted

## Context

SpicyHome POS is delivered to Windows 7 machines in KSA restaurant environments.
The current deployment story is: unzip a flat folder, double-click
`start-server.bat`, and manually set up an NSSM Windows service. There is no
update mechanism — operators must manually download a new zip, stop the server,
overwrite files, and restart. This is error-prone and impractical for sustained
operations across multiple restaurant locations.

We need a production-grade deployment layout that supports **side-by-side
versioning**, a **Windows service** for automatic startup, and a **unified
install/update engine** that can fetch, extract, and activate new releases with
minimal operator intervention. The engine must run on PowerShell 2.0 (shipped
with Windows 7) and must not require any runtime dependencies beyond what ships
with Windows 7 + .NET Framework.

## Decision

### 1. Production = Windows service (NSSM)

The **NSSM** (Non-Sucking Service Manager) Windows service is the production
runtime. `start-server.bat` / `start-server.ps1` remain available for debugging
and manual troubleshooting only.

NSSM is downloaded on first `-InstallService` invocation and stored in
`{installDir}\tools\nssm.exe`. It is **not committed** to the repository.

### 2. Install directory is fully configurable

`-InstallDir` is a **required** parameter for installation. There is no default
path (no `C:\SpicyHome` fallback). The operator must explicitly choose the
install directory — e.g. `D:\SpicyHomePOS` on a dedicated data partition.

### 3. Side-by-side layout

```
{installDir}\
  spicyhome.config.json
  spicyhome.ps1              # sticky: refreshed from new release after switch
  install.bat                # sticky: wrapped by update engine
  update.bat                 # sticky: wrapped by update engine
  rollback.bat               # sticky: wrapped by update engine
  tools\nssm.exe             # downloaded on first -InstallService
  data\spicyhome.db          # persistent data outside releases
  logs\server\server.out.log # server stdout capture
  logs\server\server.err.log # server stderr capture
  logs\updater\updater.log   # engine log
  releases\{version}\        # full unzipped release contents + VERSION file
  current\                   # directory junction → releases\{active-version}
```

- `data\` is **outside** the `releases\` tree — it survives version switches.
- `logs\` is **outside** both `releases\` and `data\` — server and updater logs
  are at `{installDir}\logs\server\` and `{installDir}\logs\updater\`
  respectively.
- `current\` is a Windows directory junction (symlink-alike; `mklink /J`) pointing
  to the active release. This allows the NSSM service and `start-server` to
  resolve paths via `current\` without knowing the version directory.

### 4. Config file

`{installDir}\spicyhome.config.json` stores:

| Field        | Type   | Description                      | Default                    |
| ------------ | ------ | -------------------------------- | -------------------------- |
| installDir   | string | Install root path                | (from -InstallDir param)   |
| port         | int    | Server port                      | 3742                       |
| serviceName  | string | NSSM service name                | SpicyHomePOS               |
| repo         | string | GitHub owner/repo                | fahimalizain/spicyhome-ksa |
| assetPrefix  | string | Release asset name prefix        | spicyhome-pos-win7-v       |
| keepReleases | int    | Number of old releases to retain | 2                          |

All values except `installDir` can be overridden via script parameters.

### 5. Logs

- **Server logs**: `{installDir}\logs\server\server.out.log` and
  `server.err.log`. Written by NSSM (AppStdout/AppStderr redirection) and by
  `start-server.ps1` (embedded `SpicyHomeLoggedProcess` C# class).
- **Updater logs**: `{installDir}\logs\updater\updater.log`. Written by
  `spicyhome.ps1` via `Write-Log`.

Neither logs directory lives under `data\` — they are peers to `data\`.

### 6. Manual updates only

The update engine has no scheduler, cron, or background auto-update timer.
Operators run `update.bat` manually (or via a scheduled task they configure
themselves). This avoids surprise restarts during business hours and keeps the
engine simple.

### 7. Installer = updater

`spicyhome.ps1` serves as both installer (`-Install`) and updater (`-Update`).
The install mode accepts an optional `-LocalZip` for offline/air-gapped
deployment. The update mode always fetches the latest release from the public
GitHub Releases API.

### 8. Public GitHub API only

No GitHub token is used. The engine calls
`GET https://api.github.com/repos/{repo}/releases/latest` with a static
`User-Agent: SpicyHome-Updater` header. This is sufficient for public
repositories and avoids managing token secrets in on-premise scripts.

### 9. Release retention

`keepReleases` controls how many previous releases to keep after a successful
update. The default is **2** (current + one previous). Older release directories
are deleted. The directory `current` points to is never deleted.

### 10. Health check

After starting the server (post-install, post-update, post-rollback), the engine
polls `GET http://127.0.0.1:{port}/health` until a 200 response is received or
`HealthTimeoutSec` (default 60) seconds elapse. **No auto-rollback** on health
check failure — the engine logs the failure, exits non-zero, and leaves the
service stopped so the operator can investigate.

### 11. npm install run by engine

After extracting a new release, the engine runs
`{releaseDir}\node\npm.cmd install --production --ignore-scripts` before flipping
the `current` junction or starting the service. This ensures dependencies are
ready before the server is asked to start. Output is captured to
`logs\updater\npm-{version}.log`.

The engine also copies the pre-bundled `better-sqlite3.node` from
`prebuilt\better_sqlite3.node` into
`server\node_modules\better-sqlite3\build\Release\` after npm install (npm
wipes `node_modules`).

### 12. One engine + thin bats

A single `spicyhome.ps1` powershell script is the entire engine. Three thin
`.bat` wrappers (`install.bat`, `update.bat`, `rollback.bat`) invoke it with the
appropriate mode flag and forward any additional arguments:

```bat
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0spicyhome.ps1" -Install %*
```

### 13. Sticky scripts at install root

`spicyhome.ps1`, `install.bat`, `update.bat`, and `rollback.bat` live at the
install root (not inside `releases\`). After a successful update, the engine
refreshes these from the new release (if the release package includes them).
This keeps the update scripts self-updating.

### 14. No Zod

The engine uses native PowerShell data structures and manual JSON
serialization/deserialization. No external schema validation library is needed.

### 15. Defaults

| Parameter    | Default                    |
| ------------ | -------------------------- |
| Port         | 3742                       |
| ServiceName  | SpicyHomePOS               |
| Repo         | fahimalizain/spicyhome-ksa |
| AssetPrefix  | spicyhome-pos-win7-v       |
| KeepReleases | 2                          |

### PowerShell 2.0 compatibility

The engine targets PowerShell 2.0 (shipped with Windows 7). Key constraints:

- **No `ConvertFrom-Json`** (added in PS3). Use
  `System.Web.Script.Serialization.JavaScriptSerializer` from
  `System.Web.Extensions.dll` for JSON reading.
- **No `Get-Content -Raw`** (PS3+). Use `[IO.File]::ReadAllText($path)`.
- **No null-conditional operators** (`??`, `?.`).
- **No `Expand-Archive`**. Use `Shell.Application` COM object for unzip.
- Config writing uses hand-built JSON strings (simple fields, controlled format).

### Version comparison

Version strings are in `YYYYMM.DD.N` format. They are parsed by splitting on
`.` and comparing as three integers: `(yyyyMM, dd, n)`. Greater version →
higher precedence.

### Service environment variables (NSSM)

```
TZ=Asia/Riyadh
SPA_DIST={installDir}\current\pos
SPICYHOME_DB={installDir}\data\spicyhome.db
MIGRATIONS_DIR={installDir}\current\packages\db\drizzle
NODE_PATH={installDir}\current\server\node_modules
PORT={port}
NODE_SKIP_PLATFORM_CHECK=1
APP_VERSION={version}
SENTRY_DSN={from current\server.env, optional}
SENTRY_ENVIRONMENT={from current\server.env, optional}
SENTRY_TRACES_SAMPLE_RATE={from current\server.env, optional}
SENTRY_PROFILES_SAMPLE_RATE={from current\server.env, optional}
```

The variables above are sourced from `current\server.env` — a dotenv-style
file baked into every release package at build time (see
`packaging/build-package.sh`). `server.env` always contains the base
variables (TZ, SPA_DIST, SPICYHOME_DB, etc.) with `{installDir}` and
`{port}` placeholders. `spicyhome.ps1` expands these placeholders at
install/update/rollback time via `Read-ServerEnvLines` and passes the
resulting `KEY=VALUE` array to NSSM `AppEnvironmentExtra`. When
`SENTRY_DSN` (or `SENTRY_SERVER_DSN`) is set at package time, Sentry keys
are appended to `server.env`; otherwise they are omitted entirely. If
`server.env` is absent or empty, `Install-NssmService` falls back to
hardcoded defaults for the base variables.

On update and rollback, `Install-NssmService` is re-invoked so the service
environment is refreshed from the active release's `server.env`. This ensures
all configuration (paths, port, version, and optional Sentry keys) stays in
sync with the running release without manual NSSM commands.

### Health check

```powershell
# loop until timeout:
#   try { WebClient DownloadString "http://127.0.0.1:{port}/health" }
#   success if status 200 and body contains "ok"
```

### Modes

| Mode             | Flag                | Behavior                               |
| ---------------- | ------------------- | -------------------------------------- |
| Install          | `-Install`          | Full install from GitHub or local zip  |
| Update           | `-Update`           | Fetch latest, extract, flip, restart   |
| Check            | `-Check`            | Print installed vs latest; exit 0/10/2 |
| Rollback         | `-Rollback`         | Flip to previous release, restart      |
| InstallService   | `-InstallService`   | Configure NSSM Windows service         |
| UninstallService | `-UninstallService` | Remove NSSM Windows service            |

### Exit codes

| Code | Meaning                       |
| ---- | ----------------------------- |
| 0    | Success / up-to-date (Check)  |
| 1    | Apply or health check failure |
| 2    | Config, network, or I/O error |
| 10   | Update available (Check only) |

## Consequences

### Positive

- Operators can update SpicyHome POS by running a single command (`update.bat`).
- Side-by-side releases enable fast rollback if a new version has issues.
- The NSSM service ensures the server starts automatically on system boot.
- `data\` and `logs\` survive version switches — no data loss on update.
- The engine is self-contained in a single PowerShell script with no external
  dependencies.
- Air-gapped deployments are supported via `-LocalZip`.
- The same engine handles install, update, rollback, and service management.

### Negative

- PowerShell 2.0 compatibility adds complexity to the engine (no
  `ConvertFrom-Json`, no `Expand-Archive`).
- NSSM is a third-party binary that must be downloaded at install time.
- Manual updates require operator discipline — no automatic notification of
  new releases.
- No auto-rollback on health check failure — a failed update leaves the
  service stopped and requires operator intervention.

### Neutral / Mitigations

- The flat unzip layout (for users who only unzip the package) continues to
  work — `start-server.ps1` detects whether it is running in a side-by-side
  install or a flat directory and adjusts paths accordingly.
- NSSM is cached in `tools\nssm.exe` after first download — subsequent
  installs on the same machine skip the download.
- The health check timeout can be tuned via `-HealthTimeoutSec` for slow
  machines.

## Rejected alternatives

### Scheduled auto-update

**Rejected.** An auto-update that triggers during business hours would restart
the server while orders are being taken. Manual updates give the operator full
control over timing. Operators can add their own Windows Scheduled Task if
desired.

### Chocolatey / winget / MSI installer

**Rejected.** These add deployment complexity (chocolatey requires its own
install; winget is not available on Windows 7; MSI requires tooling and signing).
A self-contained PowerShell script with thin `.bat` wrappers is simpler and
works on stock Windows 7.

### Node.js-based update engine

**Rejected.** The engine must be able to update Node.js itself (since Node is
bundled in the release package). A PowerShell engine can run before any
version-specific Node.js is loaded.

### In-place updates (no side-by-side)

**Rejected.** Overwriting the running server's files in-place is fragile and
makes rollback impossible without keeping backup copies manually. Side-by-side
releases with a directory junction provide atomic switches and easy rollback.

### SQLite/File-based config instead of JSON

**Rejected.** JSON is human-readable and editable in Notepad. PowerShell has
built-in JSON support from PS3+, and we provide a PS2-compatible fallback using
the .NET `JavaScriptSerializer`. Adding a different config format would
complicate the engine.

### Token-based GitHub API access

**Rejected.** The public GitHub API rate limit (60 req/hr per IP) is more than
sufficient for manual updates. Avoiding a token eliminates the need to manage
and rotate secrets on restaurant machines.

### Auto-rollback on health check failure

**Rejected.** Auto-rollback could mask underlying issues (e.g., database
migration failure) and silently revert to an older version, making it harder to
diagnose problems. Failing loudly and leaving the service stopped forces the
operator to investigate, which is the correct behavior for a POS system.

### Shipping nssm.exe in the repo

**Rejected.** NSSM is a third-party binary. Downloading it at install time from
nssm.cc keeps the repository free of binary blobs and ensures the operator gets
the latest compatible version. The download is cached in `tools\` after the
first install.

### Using `robocopy` for directory copy

**Rejected.** `robocopy` exit codes use bitmask semantics that are painful to
handle in batch files. `xcopy` and PowerShell-native commands are preferred for
reliable exit code handling.

### Hardcoded default install path (`C:\SpicyHome`)

**Rejected.** Restaurant operators may have dedicated data partitions
(`D:\`, `E:\`) where they want to install the system. Requiring an explicit
`-InstallDir` prevents accidental installs to `C:\` and gives the operator
full control.

## Open follow-ups

1. **Update notification** — Add a tray icon or Windows notification when a new
   release is available (without auto-updating).
2. **Database backup before update** — Automatically back up `data\spicyhome.db`
   before flipping to a new release.
3. **Signed updates** — Verify release asset signatures to prevent tampering
   in transit.
4. **Silent install** — Support a `-Silent` flag that suppresses console output
   for automated deployment via MDM/SCCM.
5. **Multi-instance** — Support running multiple instances of SpicyHome POS on
   the same machine (different ports, different data directories).
