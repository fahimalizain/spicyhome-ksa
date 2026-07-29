# rawprint.exe — Windows Spooler Raw-Print Helper

Sends raw binary data (e.g. ESC/POS commands) to a named Windows printer queue
via the native spooler API. Used by SpicyHome POS to drive USB printers that
are installed as Windows printer queues.

## Build

```bash
# macOS cross-compile (requires Rust 1.77.2 + mingw-w64)
./build.sh
```

The prebuilt artifact is committed at `packaging/prebuilt/rawprint.exe`.

## CLI Contract

```
rawprint.exe <printerName> <path-to-bin-file>
rawprint.exe --list
rawprint.exe --help
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0    | Success |
| 1    | Bad usage / missing arguments |
| 2    | OpenPrinterW failed (printer not found, offline, or access denied) |
| 3    | StartDocPrinterW / StartPagePrinter / WritePrinter / EndPagePrinter failed |
| 4    | File I/O error (cannot read input file) |
| 5    | Unsupported platform (not Windows) |

### `--list`

Prints one printer queue name per line to stdout. Uses `EnumPrintersW` with
`PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS`.

## NestJS Integration

The server resolves the path via `RAWPRINT_PATH` env var or falls back to
`prebuilt/rawprint.exe` relative to the working directory. See
`apps/server/src/modules/printers/windows-spooler-transport.ts`.

## Packaging

The `build-package.sh` script copies `packaging/prebuilt/rawprint.exe` into
the Win7 bundle under `prebuilt/rawprint.exe`. The `start-server.ps1` script
sets `$env:RAWPRINT_PATH` accordingly.
