<#
.SYNOPSIS
  SpicyHome POS - Unified Install, Update and Service Engine for Windows 7+
.DESCRIPTION
  Single PowerShell script that handles install, update, health check,
  rollback, and NSSM Windows service management. PowerShell 2.0 compatible.
.PARAMETER InstallDir
  Root install directory (required for -Install; auto-detected for others).
.PARAMETER Install
  Full install: download/extract latest release, set up service, start.
.PARAMETER Update
  Check for and apply latest release.
.PARAMETER Check
  Print installed vs latest version; exit 0=up-to-date, 10=update available.
.PARAMETER Rollback
  Flip current junction to previous release; restart service.
.PARAMETER InstallService
  Install and start the NSSM Windows service.
.PARAMETER UninstallService
  Stop and remove the NSSM Windows service.
.PARAMETER LocalZip
  Path to a local release zip (for air-gapped Install mode).
.PARAMETER Repo
  GitHub owner/repo (default: fahimalizain/spicyhome-ksa).
.PARAMETER AssetPrefix
  Release asset name prefix (default: spicyhome-pos-win7-v).
.PARAMETER ServiceName
  NSSM service name (default: SpicyHomePOS).
.PARAMETER Port
  Server port (default: 3742).
.PARAMETER KeepReleases
  Number of old releases to keep after update (default: 2).
.PARAMETER HealthTimeoutSec
  Seconds to wait for /health response after start (default: 60).
#>

param(
  [Parameter(Mandatory=$false)][string]$InstallDir,
  [switch]$Install,
  [switch]$Update,
  [switch]$Check,
  [switch]$Rollback,
  [switch]$InstallService,
  [switch]$UninstallService,
  [string]$LocalZip,
  [string]$Repo = "fahimalizain/spicyhome-ksa",
  [string]$AssetPrefix = "spicyhome-pos-win7-v",
  [string]$ServiceName = "SpicyHomePOS",
  [int]$Port = 3742,
  [int]$KeepReleases = 2,
  [int]$HealthTimeoutSec = 60
)

# ============================================================================
# Force TLS 1.2 for all HTTPS calls
# ============================================================================
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
  Write-Warning "Could not set TLS 1.2. HTTPS downloads may fail."
}

# Node 18 refuses to start on Windows 7 unless this is set (same as start-server.ps1).
# Must be set before any npm.cmd / node.exe child process.
$env:NODE_SKIP_PLATFORM_CHECK = "1"

# Capture engine script path at top level (before any function calls)
# Inside functions $MyInvocation refers to the function call, not the script.
$script:EngineScriptPath = $MyInvocation.MyCommand.Path
$script:EngineScriptDir = Split-Path -Parent $script:EngineScriptPath

# ============================================================================
# PS2-compatible helpers
# ============================================================================

$script:LogPath = $null

function Write-Log {
  param([string]$Message)
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "$ts  $Message"
  Write-Host $line
  if ($script:LogPath) {
    try {
      $dir = Split-Path $script:LogPath -Parent
      if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
      }
      [System.IO.File]::AppendAllText($script:LogPath, $line + "`r`n")
    } catch {}
  }
}

function Read-FileText {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  try {
    $content = [System.IO.File]::ReadAllText($Path)
    if ($content) { return $content.Trim() }
    return ""
  } catch {
    return ""
  }
}

function Read-Config {
  param([string]$ConfigPath)
  if (-not (Test-Path $ConfigPath)) { return $null }
  try {
    $raw = [System.IO.File]::ReadAllText($ConfigPath)
    if (-not $raw) { return $null }
    Add-Type -AssemblyName System.Web.Extensions -ErrorAction Stop
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $dict = $ser.DeserializeObject($raw)
    return @{
      installDir   = $dict['installDir']
      port         = $dict['port']
      serviceName  = $dict['serviceName']
      repo         = $dict['repo']
      assetPrefix  = $dict['assetPrefix']
      keepReleases = $dict['keepReleases']
    }
  } catch {
    Write-Log "WARN: Could not parse config; using defaults. Error: $($_.Exception.Message)"
    return $null
  }
}

function Write-ConfigFile {
  param(
    [string]$ConfigPath,
    [string]$InstallDirVal,
    [int]$PortVal,
    [string]$ServiceNameVal,
    [string]$RepoVal,
    [string]$AssetPrefixVal,
    [int]$KeepReleasesVal
  )
  $dir = Split-Path $ConfigPath -Parent
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  # Escape backslashes for JSON
  $escInstallDir = $InstallDirVal.Replace('\', '\\')
  $content = @"
{
  "installDir": "$escInstallDir",
  "port": $PortVal,
  "serviceName": "$ServiceNameVal",
  "repo": "$RepoVal",
  "assetPrefix": "$AssetPrefixVal",
  "keepReleases": $KeepReleasesVal
}
"@
  [System.IO.File]::WriteAllText($ConfigPath, $content)
}

function Parse-Version {
  param([string]$Version)
  if (-not $Version) { return $null }
  $parts = $Version.Split('.')
  if ($parts.Length -ne 3) { return $null }
  $n1 = 0; $n2 = 0; $n3 = 0
  if (-not [int]::TryParse($parts[0], [ref]$n1)) { return $null }
  if (-not [int]::TryParse($parts[1], [ref]$n2)) { return $null }
  if (-not [int]::TryParse($parts[2], [ref]$n3)) { return $null }
  return @($n1, $n2, $n3)
}

function Compare-Version {
  param([string]$A, [string]$B)
  # Returns: -1 if A < B, 0 if equal, 1 if A > B
  $va = Parse-Version $A
  $vb = Parse-Version $B
  if (-not $va -or -not $vb) { return $null }
  if ($va[0] -ne $vb[0]) { if ($va[0] -lt $vb[0]) { return -1 } else { return 1 } }
  if ($va[1] -ne $vb[1]) { if ($va[1] -lt $vb[1]) { return -1 } else { return 1 } }
  if ($va[2] -ne $vb[2]) { if ($va[2] -lt $vb[2]) { return -1 } else { return 1 } }
  return 0
}

function Get-InstalledVersion {
  param([string]$InstallRoot)
  $versionFile = Join-Path $InstallRoot "current\VERSION"
  $ver = Read-FileText $versionFile
  if ($ver) { return $ver }
  return $null
}

function Get-LatestRelease {
  param([string]$RepoSlug, [string]$Prefix)
  try {
    $url = "https://api.github.com/repos/$RepoSlug/releases/latest"
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "SpicyHome-Updater")
    $wc.Headers.Add("Accept", "application/vnd.github.v3+json")
    $json = $wc.DownloadString($url)
    Add-Type -AssemblyName System.Web.Extensions
    $ser = New-Object System.Web.Script.Serialization.JavaScriptSerializer
    $release = $ser.DeserializeObject($json)
    $tag = $release['tag_name']
    if (-not $tag) { return $null }
    # Strip leading 'v' if present
    $ver = $tag -replace '^v', ''
    # Find matching asset
    $assets = $release['assets']
    if (-not $assets) { return $null }
    $assetUrl = $null
    $expectedName = "$Prefix$ver.zip"
    foreach ($a in $assets) {
      $name = $a['name']
      if ($name -eq $expectedName -or ($name.StartsWith($Prefix) -and $name.EndsWith('.zip') -and $name.Contains($ver))) {
        $assetUrl = $a['browser_download_url']
        break
      }
    }
    if (-not $assetUrl) { return $null }
    return @{ version = $ver; url = $assetUrl }
  } catch {
    Write-Log "ERROR: GitHub API call failed: $($_.Exception.Message)"
    return $null
  }
}

function Download-File {
  param([string]$Url, [string]$OutPath)
  try {
    $dir = Split-Path $OutPath -Parent
    if (-not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $wc = New-Object System.Net.WebClient
    $wc.Headers.Add("User-Agent", "SpicyHome-Updater")
    $wc.DownloadFile($Url, $OutPath)
    return $true
  } catch {
    Write-Log "ERROR: Download failed: $($_.Exception.Message)"
    return $false
  }
}

function Unzip-Archive {
  param([string]$ZipPath, [string]$DestPath)
  try {
    if (-not (Test-Path $DestPath)) {
      New-Item -ItemType Directory -Path $DestPath -Force | Out-Null
    }
    $shell = New-Object -ComObject Shell.Application
    $zip = $shell.NameSpace($ZipPath)
    if (-not $zip) {
      Write-Log "ERROR: Could not open zip file: $ZipPath"
      return $false
    }
    $dest = $shell.NameSpace($DestPath)
    if (-not $dest) {
      Write-Log "ERROR: Could not open destination: $DestPath"
      return $false
    }
    # 0x14 = 16 (Yes to all) + 4 (No progress dialog)
    $dest.CopyHere($zip.Items(), 0x14)

    # Shell.Application CopyHere is async. Wait for it with a timeout loop.
    # We wait until the zip item count matches dest count or timeout.
    $timeout = 120
    $elapsed = 0
    $zipCount = $zip.Items().Count
    while ($elapsed -lt $timeout) {
      Start-Sleep -Seconds 2
      $elapsed += 2
      $destCount = (Get-ChildItem $DestPath -ErrorAction SilentlyContinue).Count
      if ($destCount -gt 0 -and $destCount -ge $zipCount) {
        break
      }
    }
    Write-Log "Unzip complete: $DestPath"
    return $true
  } catch {
    Write-Log "ERROR: Unzip failed: $($_.Exception.Message)"
    return $false
  }
}

function Strip-ZipTopFolder {
  param([string]$DestPath)
  # If the zip had a single top-level folder (e.g. spicyhome-pos-win7/),
  # move its contents up one level.
  $children = @(Get-ChildItem $DestPath -ErrorAction SilentlyContinue)
  if ($children.Count -eq 1 -and $children[0].PSIsContainer) {
    $top = $children[0].FullName
    $tempDest = "$DestPath._tmp"
    if (Test-Path $tempDest) { Remove-Item -Recurse -Force $tempDest }
    Move-Item $top $tempDest
    Get-ChildItem $tempDest | ForEach-Object { Move-Item $_.FullName $DestPath }
    Remove-Item -Recurse -Force $tempDest
    Write-Log "Stripped top-level folder from zip extraction"
  }
}

function Test-Junction {
  param([string]$Path)
  # cmd /c dir /al "path" will list it if it's a junction
  $result = cmd /c "dir /al `"$Path`" 2>nul"
  if ($result -and $result -match "<JUNCTION>") { return $true }
  return $false
}

function Remove-Junction {
  param([string]$Path)
  if (Test-Junction $Path) {
    # rmdir on a junction removes ONLY the link, not the target
    cmd /c "rmdir `"$Path`"" 2>$null
    Write-Log "Removed junction: $Path"
  } elseif (Test-Path $Path) {
    # It exists but is not a junction - just a regular dir. Remove it.
    # This can happen if someone created current as a real dir.
    Remove-Item -Recurse -Force $Path -ErrorAction SilentlyContinue
    Write-Log "Removed directory (was not a junction): $Path"
  }
}

function Set-CurrentJunction {
  param([string]$InstallRoot, [string]$Version)
  $currentPath = Join-Path $InstallRoot "current"
  $targetPath = Join-Path $InstallRoot "releases\$Version"
  if (-not (Test-Path $targetPath)) {
    Write-Log "ERROR: Target release dir not found: $targetPath"
    return $false
  }
  Remove-Junction $currentPath
  $result = cmd /c "mklink /J `"$currentPath`" `"$targetPath`" 2>&1"
  if ($LASTEXITCODE -ne 0) {
    Write-Log "ERROR: mklink failed: $result"
    return $false
  }
  Write-Log "Junction created: current -> releases\$Version"
  return $true
}

function Prune-Releases {
  param([string]$InstallRoot, [int]$Keep, [string]$CurrentVersion)
  $releasesDir = Join-Path $InstallRoot "releases"
  if (-not (Test-Path $releasesDir)) { return }
  $dirs = @(Get-ChildItem $releasesDir | Where-Object { $_.PSIsContainer -and $_.Name -ne $CurrentVersion } | Sort-Object { $v = Parse-Version $_.Name; if ($v) { [long]$v[0] * 1000000 + [long]$v[1] * 1000 + [long]$v[2] } else { 0 } })
  $excess = $dirs.Count - ($Keep - 1)
  if ($excess -le 0) { return }
  for ($i = 0; $i -lt $excess; $i++) {
    $toRemove = $dirs[$i].FullName
    Write-Log "Pruning old release: $($dirs[$i].Name)"
    Remove-Item -Recurse -Force $toRemove -ErrorAction SilentlyContinue
  }
}

function Install-NpmDeps {
  param([string]$ReleaseDir, [string]$LogDir)
  $npm = Join-Path $ReleaseDir "node\npm.cmd"
  $serverDir = Join-Path $ReleaseDir "server"
  if (-not (Test-Path $npm)) {
    Write-Log "ERROR: npm.cmd not found at $npm"
    return $false
  }
  if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
  }
  $logOut = Join-Path $LogDir "npm-install-out.log"
  $logErr = Join-Path $LogDir "npm-install-err.log"
  Write-Log "Running npm install in $serverDir ..."
  Write-Log "npm: $npm"
  try {
    # Ensure Win7 platform check is skipped for this child (and any nested node).
    $env:NODE_SKIP_PLATFORM_CHECK = "1"
    # Invoke npm.cmd directly. Avoid cmd /c with nested quotes - on Windows
    # that often yields "The filename, directory name, or volume label syntax
    # is incorrect." Start-Process -RedirectStandard* works on PS 2.0+.
    $proc = Start-Process -FilePath $npm `
      -ArgumentList @("install", "--production", "--ignore-scripts") `
      -WorkingDirectory $serverDir `
      -Wait -NoNewWindow -PassThru `
      -RedirectStandardOutput $logOut `
      -RedirectStandardError $logErr
    if ($proc.ExitCode -ne 0) {
      Write-Log "ERROR: npm install failed with exit code $($proc.ExitCode)"
      foreach ($lf in @($logOut, $logErr)) {
        if (Test-Path $lf) {
          Write-Log ("--- " + (Split-Path $lf -Leaf) + " (last 30 lines) ---")
          Get-Content $lf | Select-Object -Last 30 | ForEach-Object { Write-Log $_ }
        }
      }
      return $false
    }
    Write-Log "npm install complete"
  } catch {
    Write-Log "ERROR: npm install failed: $($_.Exception.Message)"
    return $false
  }
  # Copy better-sqlite3 prebuilt binary
  $prebuilt = Join-Path $ReleaseDir "prebuilt\better_sqlite3.node"
  $target = Join-Path $serverDir "node_modules\better-sqlite3\build\Release\better_sqlite3.node"
  if (Test-Path $prebuilt) {
    New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
    Copy-Item $prebuilt $target -Force
    Write-Log "Copied better-sqlite3 prebuilt binary"
  } else {
    Write-Log "WARN: better-sqlite3 prebuilt binary not found at $prebuilt"
  }
  # Verify win_rawprint.exe is present (not copied into node_modules — path is env-only)
  $wrp = Join-Path $ReleaseDir "prebuilt\win_rawprint.exe"
  if (Test-Path $wrp) {
    Write-Log "win_rawprint.exe present in release prebuilt\"
  } else {
    Write-Log "WARN: win_rawprint.exe not found at $wrp (Windows USB printers will not work)"
  }
  return $true
}

function Wait-ForHealth {
  param([int]$PortNumber, [int]$TimeoutSec)
  Write-Log "Waiting for server health check on port $PortNumber (timeout: ${TimeoutSec}s)..."
  $url = "http://127.0.0.1:$PortNumber/health"
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $wc = New-Object System.Net.WebClient
  while ((Get-Date) -lt $deadline) {
    try {
      $body = $wc.DownloadString($url)
      if ($body -match '"ok"' -or $body -match 'ok') {
        Write-Log "Server healthy."
        return $true
      }
    } catch {
      # Server not ready yet
    }
    Start-Sleep -Seconds 2
  }
  Write-Log "ERROR: Server health check timed out after ${TimeoutSec}s"
  return $false
}

function Download-Nssm {
  param([string]$ToolsDir)
  $nssmExe = Join-Path $ToolsDir "nssm.exe"
  if (Test-Path $nssmExe) {
    Write-Log "NSSM already present: $nssmExe"
    return $nssmExe
  }
  Write-Log "Downloading NSSM 2.24..."
  $url = "https://nssm.cc/release/nssm-2.24.zip"
  $zip = Join-Path $ToolsDir "nssm.zip"
  if (-not (Download-File $url $zip)) {
    Write-Log "ERROR: Failed to download NSSM"
    return $null
  }
  # Extract to temp
  $tempExtract = Join-Path $ToolsDir "_nssm_extract"
  if (-not (Unzip-Archive $zip $tempExtract)) {
    Remove-Item $zip -ErrorAction SilentlyContinue
    return $null
  }
  # Find nssm.exe in appropriate architecture subfolder
  $nssmFound = $null
  $archDirs = @("win64", "win32")
  foreach ($arch in $archDirs) {
    $candidate = Join-Path $tempExtract "nssm-2.24\$arch\nssm.exe"
    if (Test-Path $candidate) {
      $nssmFound = $candidate
      break
    }
  }
  if (-not $nssmFound) {
    Write-Log "ERROR: nssm.exe not found in extracted zip"
    Remove-Item $zip -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    return $null
  }
  Copy-Item $nssmFound $nssmExe -Force
  Remove-Item $zip -ErrorAction SilentlyContinue
  Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
  Write-Log "NSSM installed: $nssmExe"
  return $nssmExe
}

function Invoke-Nssm {
  # NOTE: Do NOT name a parameter $Args - it collides with PowerShell's
  # automatic $args variable and silently drops caller arguments (NSSM then
  # opens an empty GUI / prints usage). Prefer the call operator over
  # Start-Process -ArgumentList (array binding is unreliable on PS 2.0).
  param(
    [string]$NssmExe,
    [string]$Action,
    [array]$NssmArguments = @()
  )
  if (-not (Test-Path $NssmExe)) {
    Write-Log "ERROR: nssm.exe not found at $NssmExe"
    return 1
  }
  $allArgs = @($Action) + @($NssmArguments)
  Write-Log ("nssm " + ($allArgs -join " "))
  # Call operator: each array element is one argv; paths may contain spaces.
  & $NssmExe @allArgs | Out-Host
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 0 }
  return $code
}

function Stop-ServiceIfNeeded {
  param([string]$NssmExe, [string]$SvcName)
  Write-Log "Stopping service '$SvcName'..."
  Invoke-Nssm $NssmExe "stop" @($SvcName) | Out-Null
  # Give it a moment to stop
  Start-Sleep -Seconds 3
  Write-Log "Service stop requested."
}

function Start-NssmService {
  param([string]$NssmExe, [string]$SvcName)
  Write-Log "Starting service '$SvcName'..."
  $code = Invoke-Nssm $NssmExe "start" @($SvcName)
  if ($code -ne 0) {
    Write-Log "WARN: nssm start returned exit code $code"
  }
}

function Copy-StickyScripts {
  param([string]$ReleaseDir, [string]$InstallRoot, [string]$EngineScriptDir)
  # Try to copy from release package first (if the package includes them)
  $releaseScripts = @("spicyhome.ps1", "install.bat", "update.bat", "rollback.bat", "check.bat")
  $copied = $false
  foreach ($s in $releaseScripts) {
    $src = Join-Path $ReleaseDir $s
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $InstallRoot $s) -Force
      $copied = $true
    }
  }
  if (-not $copied -and $EngineScriptDir) {
    # Fall back to copying from the engine's own dir (bootstrap scenario)
    foreach ($s in $releaseScripts) {
      $src = Join-Path $EngineScriptDir $s
      if (Test-Path $src) {
        Copy-Item $src (Join-Path $InstallRoot $s) -Force
      }
    }
  }
  Write-Log "Sticky scripts refreshed at $InstallRoot"
}

# ============================================================================
# Resolve InstallDir
# ============================================================================

function Resolve-InstallDir {
  # 1. If -InstallDir param is passed, use it
  if ($InstallDir) { return $InstallDir }
  # 2. Look for config next to this script (sticky scripts at install root)
  $scriptDir = $script:EngineScriptDir
  $configHere = Join-Path $scriptDir "spicyhome.config.json"
  if (Test-Path $configHere) {
    $cfg = Read-Config $configHere
    if ($cfg -and $cfg.installDir) { return $cfg.installDir }
    return $scriptDir
  }
  # 3. If this script is at an install root (has releases/), use script dir
  if (Test-Path (Join-Path $scriptDir "releases")) {
    return $scriptDir
  }
  # 4. Look up a level (we might be inside a release dir or current)
  $parent = Split-Path $scriptDir -Parent
  $configUp = Join-Path $parent "spicyhome.config.json"
  if (Test-Path $configUp) {
    $cfg = Read-Config $configUp
    if ($cfg -and $cfg.installDir) { return $cfg.installDir }
    return $parent
  }
  if (Test-Path (Join-Path $parent "releases")) {
    return $parent
  }
  return $null
}

# ============================================================================
# Install mode
# ============================================================================

function Invoke-Install {
  if (-not $InstallDir) {
    Write-Host "ERROR: -InstallDir is required for -Install."
    Write-Host "Usage: install.bat -InstallDir D:\SpicyHomePOS [-LocalZip path\to\release.zip]"
    exit 2
  }

  $root = $InstallDir
  $script:LogPath = Join-Path $root "logs\updater\updater.log"
  Write-Log "INFO: Installing SpicyHome POS to $root"

  # Ensure directory structure
  $dirs = @(
    $root,
    (Join-Path $root "data"),
    (Join-Path $root "logs\server"),
    (Join-Path $root "logs\updater"),
    (Join-Path $root "releases"),
    (Join-Path $root "tools")
  )
  foreach ($d in $dirs) {
    if (-not (Test-Path $d)) {
      New-Item -ItemType Directory -Path $d -Force | Out-Null
    }
  }

  # Write config
  $configPath = Join-Path $root "spicyhome.config.json"
  Write-Log "Writing config: $configPath"
  Write-ConfigFile $configPath $root $Port $ServiceName $Repo $AssetPrefix $KeepReleases

  # Get zip
  $zipPath = $null
  $version = $null
  if ($LocalZip) {
    if (Test-Path $LocalZip) {
      $zipPath = $LocalZip
      # Try to guess version from filename
      $zipName = Split-Path $LocalZip -Leaf
      if ($zipName -match 'v(\d{6}\.\d{2}\.\d+)') {
        $version = $Matches[1]
      }
      Write-Log "Using local zip: $zipPath"
    } else {
      Write-Log "ERROR: Local zip not found: $LocalZip"
      exit 2
    }
  } else {
    Write-Log "Fetching latest release from GitHub ($Repo)..."
    $release = Get-LatestRelease $Repo $AssetPrefix
    if (-not $release) {
      Write-Log "ERROR: Could not fetch latest release from GitHub."
      exit 2
    }
    $version = $release.version
    Write-Log "Latest version: $version"
    $zipPath = Join-Path $root "_download\release.zip"
    Write-Log "Downloading $($release.url) ..."
    if (-not (Download-File $release.url $zipPath)) {
      Write-Log "ERROR: Download failed."
      exit 2
    }
  }

  # Determine extraction strategy based on whether version is known
  $releaseDir = $null
  if ($version) {
    # Version known: extract directly to releases\{version}
    $releaseDir = Join-Path $root "releases\$version"
    Write-Log "Extracting to $releaseDir ..."
    if (-not (Unzip-Archive $zipPath $releaseDir)) {
      Write-Log "ERROR: Extraction failed."
      exit 2
    }
    Strip-ZipTopFolder $releaseDir
  } else {
    # Version unknown (e.g. LocalZip with odd name): extract to staging,
    # read VERSION file, then move to proper directory
    $stagingDir = Join-Path $root "releases\_staging"
    if (Test-Path $stagingDir) {
      Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
    }
    Write-Log "Extracting to staging to determine version..."
    if (-not (Unzip-Archive $zipPath $stagingDir)) {
      Write-Log "ERROR: Extraction failed."
      exit 2
    }
    Strip-ZipTopFolder $stagingDir
    $versionFile = Join-Path $stagingDir "VERSION"
    if (Test-Path $versionFile) {
      $version = Read-FileText $versionFile
    }
    if (-not $version) {
      Write-Log "ERROR: Could not determine version from zip filename or VERSION file."
      Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
      exit 2
    }
    Write-Log "Detected version from VERSION file: $version"
    $releaseDir = Join-Path $root "releases\$version"
    if (Test-Path $releaseDir) {
      Write-Log "Removing existing release directory: $releaseDir"
      Remove-Item -Recurse -Force $releaseDir -ErrorAction SilentlyContinue
    }
    Move-Item $stagingDir $releaseDir
    Write-Log "Moved staging to $releaseDir"
  }

  # Ensure VERSION file
  $versionFile = Join-Path $releaseDir "VERSION"
  if (-not (Test-Path $versionFile)) {
    [System.IO.File]::WriteAllText($versionFile, $version)
  }

  # npm install
  $npmLogDir = Join-Path $root "logs\updater"
  if (-not (Test-Path $npmLogDir)) {
    New-Item -ItemType Directory -Path $npmLogDir -Force | Out-Null
  }
  if (-not (Install-NpmDeps $releaseDir $npmLogDir)) {
    Write-Log "ERROR: npm install failed."
    exit 1
  }

  # Flip current junction
  if (-not (Set-CurrentJunction $root $version)) {
    Write-Log "ERROR: Could not create current junction."
    exit 1
  }

  # Copy sticky scripts
  $engineScriptDir = $script:EngineScriptDir
  Copy-StickyScripts $releaseDir $root $engineScriptDir

  # Install service
  Write-Log "Installing Windows service..."
  $nssmExe = Download-Nssm (Join-Path $root "tools")
  if (-not $nssmExe) {
    Write-Log "ERROR: NSSM download failed."
    exit 2
  }
  Install-NssmService $nssmExe $root $version

  # Start service
  Start-NssmService $nssmExe $ServiceName

  # Health check
  if (-not (Wait-ForHealth $Port $HealthTimeoutSec)) {
    Write-Log "ERROR: Health check failed."
    Write-Log "Check logs at $root\logs\server\"
    exit 1
  }

  Write-Log "SUCCESS: SpicyHome POS v$version installed and running."
  Write-Log "Data: $root\data\"
  Write-Log "Logs: $root\logs\server\"
  Write-Log "URL:  http://127.0.0.1:$Port"
}

# ============================================================================
# Update mode
# ============================================================================

function Invoke-Update {
  $root = Resolve-InstallDir
  if (-not $root) {
    Write-Log "ERROR: Could not resolve install directory. Run from install root or pass -InstallDir."
    exit 2
  }
  Write-Log "Updating SpicyHome POS at $root"

  # Read config (overlay defaults with config values)
  $cfg = Read-Config (Join-Path $root "spicyhome.config.json")
  if ($cfg) {
    if (-not $PSBoundParameters.ContainsKey('Port')) { $script:Port = [int]$cfg.port }
    if (-not $PSBoundParameters.ContainsKey('ServiceName')) { $script:ServiceName = $cfg.serviceName }
    if (-not $PSBoundParameters.ContainsKey('Repo')) { $script:Repo = $cfg.repo }
    if (-not $PSBoundParameters.ContainsKey('AssetPrefix')) { $script:AssetPrefix = $cfg.assetPrefix }
    if (-not $PSBoundParameters.ContainsKey('KeepReleases')) { $script:KeepReleases = [int]$cfg.keepReleases }
  }

  # Check current version
  $currentVer = Get-InstalledVersion $root
  Write-Log "Current version: $currentVer"

  # Fetch latest
  $release = Get-LatestRelease $Repo $AssetPrefix
  if (-not $release) {
    Write-Log "ERROR: Could not fetch latest release."
    exit 2
  }
  $latestVer = $release.version
  Write-Log "Latest version: $latestVer"

  $cmp = Compare-Version $latestVer $currentVer
  if ($cmp -le 0) {
    Write-Log "Already up-to-date (current: $currentVer, latest: $latestVer)."
    exit 0
  }
  Write-Log "Update available: $currentVer -> $latestVer"

  # Download
  $zipPath = Join-Path $root "_download\update-$latestVer.zip"
  if (-not (Download-File $release.url $zipPath)) {
    Write-Log "ERROR: Download failed."
    exit 2
  }

  # Extract new release
  $newReleaseDir = Join-Path $root "releases\$latestVer"
  if (Test-Path $newReleaseDir) {
    Remove-Item -Recurse -Force $newReleaseDir -ErrorAction SilentlyContinue
  }
  if (-not (Unzip-Archive $zipPath $newReleaseDir)) {
    Write-Log "ERROR: Extraction failed."
    exit 2
  }
  Strip-ZipTopFolder $newReleaseDir

  # Ensure VERSION file
  $versionFile = Join-Path $newReleaseDir "VERSION"
  if (-not (Test-Path $versionFile)) {
    [System.IO.File]::WriteAllText($versionFile, $latestVer)
  }

  # npm install in new release
  $npmLogDir = Join-Path $root "logs\updater"
  if (-not (Install-NpmDeps $newReleaseDir $npmLogDir)) {
    Write-Log "ERROR: npm install failed in new release."
    exit 1
  }

  # Stop service
  $nssmExe = Join-Path $root "tools\nssm.exe"
  if (Test-Path $nssmExe) {
    Stop-ServiceIfNeeded $nssmExe $ServiceName
  }

  # Flip current junction
  if (-not (Set-CurrentJunction $root $latestVer)) {
    Write-Log "ERROR: Could not update current junction."
    exit 1
  }

  # Prune old releases
  Prune-Releases $root $KeepReleases $latestVer

  # Refresh sticky scripts from new release
  $engineScriptDir = $script:EngineScriptDir
  Copy-StickyScripts $newReleaseDir $root $engineScriptDir

  # Start service
  if (Test-Path $nssmExe) {
    Start-NssmService $nssmExe $ServiceName
  } else {
    Write-Log "INFO: NSSM not found. Skipping service start."
    Write-Log "Run install.bat -InstallService to set up the service."
  }

  # Health check
  if (-not (Wait-ForHealth $Port $HealthTimeoutSec)) {
    Write-Log "ERROR: Health check failed for new version."
    Write-Log "Service may be stopped. Check logs at $root\logs\server\"
    Write-Log "To rollback: run rollback.bat"
    exit 1
  }

  Write-Log "SUCCESS: Updated to v$latestVer."
}

# ============================================================================
# Check mode
# ============================================================================

function Invoke-Check {
  $root = Resolve-InstallDir
  if (-not $root) {
    Write-Log "ERROR: Could not resolve install directory."
    exit 2
  }

  $cfg = Read-Config (Join-Path $root "spicyhome.config.json")
  if ($cfg) {
    if (-not $PSBoundParameters.ContainsKey('Repo')) { $script:Repo = $cfg.repo }
    if (-not $PSBoundParameters.ContainsKey('AssetPrefix')) { $script:AssetPrefix = $cfg.assetPrefix }
  }

  $currentVer = Get-InstalledVersion $root
  Write-Log "Installed:  $currentVer"

  $release = Get-LatestRelease $Repo $AssetPrefix
  if (-not $release) {
    Write-Log "ERROR: Could not fetch latest release."
    exit 2
  }
  Write-Log "Latest:     $($release.version)"

  $cmp = Compare-Version $release.version $currentVer
  if ($cmp -gt 0) {
    Write-Log "Update available."
    exit 10
  }
  Write-Log "Up-to-date."
  exit 0
}

# ============================================================================
# Rollback mode
# ============================================================================

function Invoke-Rollback {
  $root = Resolve-InstallDir
  if (-not $root) {
    Write-Log "ERROR: Could not resolve install directory."
    exit 2
  }

  $cfg = Read-Config (Join-Path $root "spicyhome.config.json")
  if ($cfg) {
    if (-not $PSBoundParameters.ContainsKey('Port')) { $script:Port = [int]$cfg.port }
    if (-not $PSBoundParameters.ContainsKey('ServiceName')) { $script:ServiceName = $cfg.serviceName }
    if (-not $PSBoundParameters.ContainsKey('KeepReleases')) { $script:KeepReleases = [int]$cfg.keepReleases }
  }

  $currentVer = Get-InstalledVersion $root
  Write-Log "Current version: $currentVer"

  # Find previous release (highest non-current version)
  $releasesDir = Join-Path $root "releases"
  $previousDir = Get-ChildItem $releasesDir |
    Where-Object { $_.PSIsContainer -and $_.Name -ne $currentVer } |
    Sort-Object { $v = Parse-Version $_.Name; if ($v) { [long]$v[0] * 1000000 + [long]$v[1] * 1000 + [long]$v[2] } else { 0 } } -Descending |
    Select-Object -First 1

  if (-not $previousDir) {
    Write-Log "ERROR: No previous release found to roll back to."
    exit 2
  }

  $prevVer = $previousDir.Name
  Write-Log "Rolling back to: $prevVer"

  # Stop service
  $nssmExe = Join-Path $root "tools\nssm.exe"
  if (Test-Path $nssmExe) {
    Stop-ServiceIfNeeded $nssmExe $ServiceName
  }

  # Flip junction
  if (-not (Set-CurrentJunction $root $prevVer)) {
    Write-Log "ERROR: Could not flip current junction."
    exit 1
  }

  # Start service
  if (Test-Path $nssmExe) {
    Start-NssmService $nssmExe $ServiceName
  }

  # Health check
  if (-not (Wait-ForHealth $Port $HealthTimeoutSec)) {
    Write-Log "ERROR: Health check failed after rollback to v$prevVer."
    Write-Log "Check logs at $root\logs\server\"
    exit 1
  }

  Write-Log "SUCCESS: Rolled back to v$prevVer."
}

# ============================================================================
# NSSM service helpers
# ============================================================================

function Install-NssmService {
  param([string]$NssmExe, [string]$Root, [string]$Version)

  # Remove existing if present (ignore failures - service may not exist yet)
  Invoke-Nssm $NssmExe "stop" @($ServiceName) | Out-Null
  Invoke-Nssm $NssmExe "remove" @($ServiceName, "confirm") | Out-Null

  $nodeExe = Join-Path $Root "current\node\node.exe"
  $mainJs  = Join-Path $Root "current\server\main.js"
  $appDir  = Join-Path $Root "current"

  if (-not (Test-Path $nodeExe)) {
    Write-Log "ERROR: node.exe not found at $nodeExe"
    exit 1
  }
  if (-not (Test-Path $mainJs)) {
    Write-Log "ERROR: main.js not found at $mainJs"
    exit 1
  }

  # Ensure logs directory
  $logsDir = Join-Path $Root "logs\server"
  if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
  }

  $spaDist = Join-Path $Root "current\pos"
  $spicyDb = Join-Path $Root "data\spicyhome.db"
  $migrations = Join-Path $Root "current\packages\db\drizzle"
  $nodePath = Join-Path $Root "current\server\node_modules"
  $winRawprint = Join-Path $Root "current\prebuilt\win_rawprint.exe"
  $stdoutLog = Join-Path $Root "logs\server\server.out.log"
  $stderrLog = Join-Path $Root "logs\server\server.err.log"

  Write-Log "Installing NSSM service '$ServiceName'..."
  Write-Log "  App: $nodeExe"
  Write-Log "  Params: $mainJs"
  Write-Log "  Directory: $appDir"

  # Do NOT wrap paths in extra quotes - call operator passes each element as one argv.
  $code = Invoke-Nssm $NssmExe "install" @($ServiceName, $nodeExe)
  if ($code -ne 0) {
    Write-Log "ERROR: nssm install failed with exit code $code"
    exit 1
  }

  $sets = @(
    @("AppParameters", $mainJs),
    @("AppDirectory", $appDir),
    @("AppStdout", $stdoutLog),
    @("AppStderr", $stderrLog),
    @("AppRotateFiles", "1"),
    @("AppRotateBytes", "10485760"),
    @("DisplayName", "SpicyHome POS"),
    @("Description", "SpicyHome POS server"),
    @("Start", "SERVICE_AUTO_START")
  )
  foreach ($pair in $sets) {
    $code = Invoke-Nssm $NssmExe "set" @($ServiceName, $pair[0], $pair[1])
    if ($code -ne 0) {
      Write-Log ("ERROR: nssm set " + $pair[0] + " failed with exit code " + $code)
      exit 1
    }
  }

  # AppEnvironmentExtra: one KEY=VALUE per argument (NSSM joins them).
  $envExtra = @(
    "TZ=Asia/Riyadh",
    "SPA_DIST=$spaDist",
    "SPICYHOME_DB=$spicyDb",
    "PORT=$Port",
    "NODE_SKIP_PLATFORM_CHECK=1",
    "MIGRATIONS_DIR=$migrations",
    "NODE_PATH=$nodePath",
    "APP_VERSION=$Version",
    "WIN_RAWPRINT_PATH=$winRawprint"
  )
  $code = Invoke-Nssm $NssmExe "set" (@($ServiceName, "AppEnvironmentExtra") + $envExtra)
  if ($code -ne 0) {
    Write-Log "ERROR: nssm set AppEnvironmentExtra failed with exit code $code"
    exit 1
  }

  Write-Log "NSSM service '$ServiceName' installed."
}

function Invoke-InstallServiceCmd {
  $root = Resolve-InstallDir
  if (-not $root) {
    Write-Log "ERROR: Could not resolve install directory."
    exit 2
  }

  $cfg = Read-Config (Join-Path $root "spicyhome.config.json")
  if ($cfg) {
    if (-not $PSBoundParameters.ContainsKey('ServiceName')) { $script:ServiceName = $cfg.serviceName }
    if (-not $PSBoundParameters.ContainsKey('Port')) { $script:Port = [int]$cfg.port }
  }

  $nssmExe = Download-Nssm (Join-Path $root "tools")
  if (-not $nssmExe) {
    Write-Log "ERROR: NSSM download failed."
    exit 2
  }

  $currentVer = Get-InstalledVersion $root
  if (-not $currentVer) {
    Write-Log "ERROR: No installed version found. Run install.bat first."
    exit 2
  }

  Write-Log "Installing service for v$currentVer..."
  Install-NssmService $nssmExe $root $currentVer

  Write-Log "Starting service..."
  Start-NssmService $nssmExe $ServiceName

  if (-not (Wait-ForHealth $Port $HealthTimeoutSec)) {
    Write-Log "ERROR: Health check failed after service start."
    exit 1
  }

  Write-Log "Service '$ServiceName' is running."
}

function Invoke-UninstallServiceCmd {
  $root = Resolve-InstallDir
  if (-not $root) {
    Write-Log "ERROR: Could not resolve install directory."
    exit 2
  }

  $cfg = Read-Config (Join-Path $root "spicyhome.config.json")
  if ($cfg) {
    if (-not $PSBoundParameters.ContainsKey('ServiceName')) { $script:ServiceName = $cfg.serviceName }
  }

  $nssmExe = Join-Path $root "tools\nssm.exe"
  if (-not (Test-Path $nssmExe)) {
    Write-Log "ERROR: nssm.exe not found at $nssmExe"
    exit 2
  }

  Write-Log "Stopping service '$ServiceName'..."
  Invoke-Nssm $nssmExe "stop" @($ServiceName) | Out-Null
  Start-Sleep -Seconds 3

  Write-Log "Removing service '$ServiceName'..."
  Invoke-Nssm $nssmExe "remove" @($ServiceName, "confirm") | Out-Null

  Write-Log "Service '$ServiceName' removed."
}

# ============================================================================
# Script entry point
# ============================================================================

# Determine and set log path
$resolvedRoot = Resolve-InstallDir
if ($resolvedRoot) {
  $script:LogPath = Join-Path $resolvedRoot "logs\updater\updater.log"
}

# Dispatch to the selected mode
$modeCount = 0
if ($Install)             { $modeCount++ }
if ($Update)              { $modeCount++ }
if ($Check)               { $modeCount++ }
if ($Rollback)            { $modeCount++ }
if ($InstallService)      { $modeCount++ }
if ($UninstallService)    { $modeCount++ }

if ($modeCount -eq 0) {
  Write-Host "SpicyHome POS - Install, Update and Service Engine"
  Write-Host ""
  Write-Host "Usage:"
  Write-Host "  install.bat   -InstallDir X:\path [-LocalZip release.zip]  Full install"
  Write-Host "  update.bat    [-InstallDir X:\path]                        Update to latest"
  Write-Host "  check.bat     [-InstallDir X:\path]                        Show installed vs latest"
  Write-Host "  rollback.bat  [-InstallDir X:\path]                        Rollback to previous"
  Write-Host ""
  Write-Host "  spicyhome.ps1 -InstallService  [-InstallDir X:\path]        Install/repair NSSM service"
  Write-Host "  spicyhome.ps1 -UninstallService [-InstallDir X:\path]       Remove NSSM service"
  Write-Host ""
  exit 0
}

if ($modeCount -gt 1) {
  Write-Host "ERROR: Only one mode flag may be specified at a time."
  exit 2
}

if ($Install)          { Invoke-Install }
elseif ($Update)       { Invoke-Update }
elseif ($Check)        { Invoke-Check }
elseif ($Rollback)     { Invoke-Rollback }
elseif ($InstallService)    { Invoke-InstallServiceCmd }
elseif ($UninstallService)  { Invoke-UninstallServiceCmd }
