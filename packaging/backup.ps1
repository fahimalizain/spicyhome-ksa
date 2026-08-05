<#
.SYNOPSIS
  SpicyHome POS - Data backup for Windows 7+
.DESCRIPTION
  Zips the entire data directory (spicyhome.db, any WAL/SHM sidecars,
  and other files under data\) into spicyhomepos_YYYYMMDDThhmm+AST.zip.
  The timestamp is Arabia
  Standard Time (UTC+3, fixed - no DST) computed from UTC, so machine
  local timezone / TZ env do not matter.

  PowerShell 2.0 / Windows 7 constraints: no Compress-Archive (PS 5+);
  preferred System.IO.Compression.ZipFile (.NET 4.5+), with empty-zip +
  Shell.Application CopyHere fallback (async; waits until the zip size
  stabilizes, timeout 120s).

  Hot backup: the service is NOT stopped. A cold backup (service stopped)
  is safer but not required.
.PARAMETER InstallDir
  Root install directory. Optional; auto-detected: -InstallDir value,
  script dir or parent holding spicyhome.config.json / releases\
  (side-by-side), script dir holding data\ (flat unzip). Fails otherwise.
.PARAMETER OutDir
  Backup zip directory. Optional; default {installRoot}\backups. Must not
  be inside the data directory.
#>

param(
  [string]$InstallDir,
  [string]$OutDir
)

# Script dir at top level: inside functions $MyInvocation refers to the
# function call, not the script (same pattern as spicyhome.ps1).
$script:ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-InstallRoot {
  $scriptDir = $script:ScriptDir
  if ((Test-Path (Join-Path $scriptDir "spicyhome.config.json")) -or
      (Test-Path (Join-Path $scriptDir "releases"))) {
    return $scriptDir
  }
  $parent = Split-Path $scriptDir -Parent
  if ((Test-Path (Join-Path $parent "spicyhome.config.json")) -or
      (Test-Path (Join-Path $parent "releases"))) {
    return $parent
  }
  if (Test-Path (Join-Path $scriptDir "data")) {
    return $scriptDir
  }
  return $null
}

# Arabia Standard Time (UTC+3, fixed - no DST); quoted 'T' is the literal
# separator: yyyyMMddTHHmm
function Get-AstTimestamp {
  return [DateTime]::UtcNow.AddHours(3).ToString("yyyyMMdd'T'HHmm")
}

function Copy-Stream {
  param($Source, $Destination)
  $buffer = New-Object 'byte[]' 65536
  while ($true) {
    $read = $Source.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) { break }
    $Destination.Write($buffer, 0, $read)
  }
}

# Zip via System.IO.Compression.ZipFile (.NET 4.5+ when present). Any
# failure aborts with $false, so a partial zip is never accepted.
function New-ZipDotNet {
  param([string]$ZipPath, [string]$DataDir, [object[]]$Files)
  try {
    # Throws when .NET 4.5+ is missing or cannot load (e.g. PS 2.0 on
    # CLR 2.0) -> caller falls back to Shell.Application.
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $zip = [System.IO.Compression.ZipFile]::Open(
      $ZipPath,
      [System.IO.Compression.ZipArchiveMode]::Create)
    try {
      foreach ($file in $Files) {
        # Entry relative to data dir, forward slashes: contents at zip
        # root, no nested top-level data folder.
        $rel = $file.FullName.Substring($DataDir.Length)
        $rel = $rel.TrimStart("\").TrimStart("/").Replace("\", "/")
        $entry = $zip.CreateEntry($rel)
        $out = $entry.Open()
        try {
          # ReadWrite share keeps a running SQLite service (WAL mode)
          # readable - hot backup without stopping the service.
          $in = [System.IO.File]::Open(
            $file.FullName,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite)
          try {
            Copy-Stream $in $out
          } finally {
            $in.Close()
          }
        } finally {
          $out.Close()
        }
      }
    } finally {
      $zip.Dispose()
    }
    return $true
  } catch {
    return $false
  }
}

# Zip via empty-zip + Shell.Application CopyHere (PS 2.0 fallback).
function New-ZipShell {
  param([string]$ZipPath, [string]$DataDir, [int]$SourceCount)
  try {
    # Minimal empty zip: EOCD record PK\x05\x06 + 18 zero bytes (22 bytes).
    $bytes = New-Object 'byte[]' 22
    $bytes[0] = 0x50; $bytes[1] = 0x4B; $bytes[2] = 0x05; $bytes[3] = 0x06
    [System.IO.File]::WriteAllBytes($ZipPath, $bytes)

    $shell = New-Object -ComObject Shell.Application
    $zipNs = $shell.NameSpace($ZipPath)
    $srcNs = $shell.NameSpace($DataDir)
    if (-not $zipNs -or -not $srcNs) {
      Write-Host "ERROR: Could not open zip or data folder via Shell.Application."
      return $false
    }
    # Copy the contents (not the folder itself) into the zip root.
    # 0x14 = 16 (Yes to all) + 4 (No progress dialog)
    $zipNs.CopyHere($srcNs.Items(), 0x14)

    # CopyHere is async; wait until all items appear and the zip size
    # stabilizes across two polls (same strategy as Unzip-Archive, 120s).
    $timeout = 120
    $elapsed = 0
    $prevSize = 0
    $stablePolls = 0
    while ($elapsed -lt $timeout) {
      Start-Sleep -Seconds 2
      $elapsed += 2
      $itemCount = 0
      try {
        $curNs = $shell.NameSpace($ZipPath)
        if ($curNs) { $itemCount = $curNs.Items().Count }
      } catch {}
      $curSize = (Get-Item $ZipPath -ErrorAction SilentlyContinue).Length
      if (-not $curSize) { $curSize = 0 }
      if ($itemCount -ge $SourceCount -and $curSize -gt 22 -and
          $curSize -eq $prevSize) {
        $stablePolls += 1
        if ($stablePolls -ge 2) { break }
      } else {
        $stablePolls = 0
      }
      $prevSize = $curSize
    }
    $curNs = $null
    if ($elapsed -ge $timeout) {
      Write-Host "ERROR: Zip creation timed out after 120 seconds."
      return $false
    }

    # Release namespace references so the shell finalizes the zip
    # (central directory write), then re-check with a fresh view.
    $zipNs = $null
    $srcNs = $null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
    Start-Sleep -Seconds 1

    $final = $shell.NameSpace($ZipPath)
    if (-not $final -or $final.Items().Count -lt $SourceCount) {
      Write-Host "ERROR: Zip is incomplete (expected at least $SourceCount entries)."
      return $false
    }
    return $true
  } catch {
    Write-Host "ERROR: Shell zip failed: $($_.Exception.Message)"
    return $false
  }
}

# Main
Write-Host "=========================================="
Write-Host "  SpicyHome POS - Data Backup"
Write-Host "=========================================="

try {
  $installRoot = $null
  if ($InstallDir) {
    $installRoot = $InstallDir.TrimEnd("\")
  } else {
    $installRoot = Resolve-InstallRoot
  }
  if (-not $installRoot) {
    Write-Host "ERROR: Could not determine install root."
    Write-Host "Place backup.bat next to spicyhome.config.json / releases\ / data\,"
    Write-Host "or pass -InstallDir."
    exit 1
  }
  if (-not (Test-Path $installRoot)) {
    Write-Host "ERROR: Install directory not found: $installRoot"
    exit 1
  }

  $dataDir = Join-Path $installRoot "data"
  if (-not (Test-Path $dataDir)) {
    Write-Host "ERROR: Data directory not found: $dataDir"
    exit 1
  }
  $dataFiles = @(Get-ChildItem $dataDir -Recurse -Force | Where-Object { -not $_.PSIsContainer })
  if ($dataFiles.Count -eq 0) {
    Write-Host "ERROR: Data directory is empty: $dataDir"
    exit 1
  }

  if (-not $OutDir) { $OutDir = Join-Path $installRoot "backups" }
  # Never write backups inside data\ (would zip previous backups next run).
  $outRoot = $OutDir.TrimEnd("\")
  $dataRoot = $dataDir.TrimEnd("\")
  if ($outRoot -eq $dataRoot -or ($outRoot + "\") -like ($dataRoot + "\*")) {
    Write-Host "ERROR: OutDir must not be inside the data directory: $OutDir"
    exit 1
  }
  if (-not (Test-Path $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
  }

  $stamp = Get-AstTimestamp
  $fileName = "spicyhomepos_" + $stamp + "+AST.zip"
  $zipPath = Join-Path $OutDir $fileName
  if (Test-Path $zipPath) { Remove-Item -Force $zipPath }

  Write-Host "Install:  $installRoot"
  Write-Host "Data:     $dataDir"
  Write-Host "Output:   $zipPath"
  Write-Host "Files:    $($dataFiles.Count)"
  Write-Host ""

  $ok = New-ZipDotNet $zipPath $dataDir $dataFiles
  if (-not $ok) {
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    Write-Host "NOTE: .NET zip path failed; falling back to Shell.Application."
    # CopyHere copies top-level items (files + folders); the recursive
    # file count would under-count when data\ contains subdirectories.
    $topLevelCount = @(Get-ChildItem $dataDir -Force).Count
    $ok = New-ZipShell $zipPath $dataDir $topLevelCount
  }
  if (-not $ok) {
    if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
    Write-Host "ERROR: Backup failed. No archive was written."
    exit 1
  }

  $sizeBytes = (Get-Item $zipPath -ErrorAction SilentlyContinue).Length
  if (-not $sizeBytes) { $sizeBytes = 0 }
  if ($sizeBytes -ge 1048576) {
    $sizeStr = "{0:N1} MB" -f ($sizeBytes / 1048576.0)
  } else {
    $sizeStr = "{0:N1} KB" -f ($sizeBytes / 1024.0)
  }
  Write-Host "SUCCESS: Backup written to $zipPath"
  Write-Host "Size:    $sizeStr"
  # Last line is the full absolute path so scripts can parse it.
  Write-Host $zipPath
  exit 0
} catch {
  Write-Host "ERROR: Backup failed: $($_.Exception.Message)"
  exit 1
}
