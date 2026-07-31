# Arabic Thermal Receipt Printing

How SpicyHome POS prints Arabic on ESC/POS thermal printers, and the 01–06
hardware probe procedure used to validate a printer + encoding combination
before enabling it in production.

## 1. Scope

- Arabic output is limited to **customer-facing documents**: receipts and
  refund (credit-note) prints.
- **Kitchen tickets stay English/ASCII** — Arabic is deliberately not rendered
  on kitchen stations. This is by design (glanceable tickets, printer speed).
- Two transports are supported:
  - **TCP raw :9100** — direct socket to a network printer
    (`apps/server/src/modules/printers/printer-transport.ts`).
  - **Windows raw** — `win_rawprint.exe` sends a `.bin` job to a named Windows
    printer queue (`win-rawprint-transport.ts`). This is the path for USB
    printers installed as Windows queues, and the path the hardware probes use.

## 2. Why this is hard

Thermal heads are **LTR**: they consume and print bytes left-to-right. Arabic
is logically RTL, so three problems stack up:

1. **LTR heads** — sending logical-order Arabic produces garbage; bytes must
   arrive in _visual_ order (reading right-to-left on paper).
2. **ESC/POS code pages have one glyph per letter** — W1256 (code page 50) and
   PC864 (code page 22) map each base letter to a single isolated glyph.
   Charset mode therefore **cannot join** letters into connected cursive words
   the way a desktop OS does.
3. **Naive whole-string reversal breaks mixed content** — reversing the whole
   string flips digits and Latin too: `1234` → `4321`, `5x` → `x5`. The old
   "blind RTL" behavior had exactly this bug (see probe 01).

The fix is a small pipeline (shaping → segment-aware bidi → charset bytes or
raster bitmap) implemented in pure server-side JS with zero runtime native
dependencies (Node 18 / Windows 7 safe).

## 3. Pipeline

```
logical Unicode
  → shapeArabic()           // contextual forms + lam-alef
  → visualOrderForThermal() // segment bidi; neutrals between Arabic merge
  → charset: ESC t + W1256/PC864/UTF-8 bytes
  → OR raster: glyph atlas → GS v 0 MonoBitmap
```

Modules:

| Module                                                | Responsibility                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/modules/printers/arabic-shape.ts`    | Pure-JS contextual shaping: isolated/initial/medial/final forms and lam-alef ligatures into Arabic Presentation Forms-B (U+FE70–U+FEFF).                                                                                                                         |
| `apps/server/src/modules/printers/arabic-bidi.ts`     | Segment-aware visual ordering: splits the shaped text into Arabic / non-Arabic runs and reverses only the Arabic runs, so `5x` and digits stay in place. Neutrals between Arabic characters merge into the run, keeping multi-word phrases as one reversal unit. |
| `apps/server/src/modules/printers/arabic-encode.ts`   | Encodes ordered text to printer bytes (W1256 / PC864 / UTF-8) via `ESC t` code pages; presentation forms decompose to base letters for the charset maps.                                                                                                         |
| `apps/server/src/modules/printers/arabic-raster.ts`   | Renders shaped + ordered text into a 1-bit monochrome bitmap and emits it as `GS v 0` (raster bit image) — true joined letterforms.                                                                                                                              |
| `apps/server/src/modules/printers/receipt-builder.ts` | Production receipt / credit-note builder; picks charset vs raster per printer config.                                                                                                                                                                            |
| `apps/server/assets/arabic-glyph-atlas.json`          | Committed glyph atlas (Tajawal, OFL) that the raster renderer blits from.                                                                                                                                                                                        |

## 4. Printer config (`PrinterArabicConfig`)

Stored per printer, editable in Admin → Printers.

| Field        | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `encoding`   | `none` / `utf8` / `pc864` / `w1256` — byte encoding for Arabic text |
| `codePage`   | `ESC t n` code-page index (50 = W1256, 22 = PC864)                  |
| `visualRtl`  | Segment-aware visual order for LTR heads                            |
| `renderMode` | `charset` (ESC t bytes) or `raster` (GS v 0 bitmaps)                |

**Recommended for the validated Epson (Windows raw):**

```json
{
  "encoding": "w1256",
  "codePage": 50,
  "visualRtl": true,
  "renderMode": "raster"
}
```

Set in Admin → Printers. `charset` is the fallback if the glyph atlas is
missing from server assets.

## 5. Hardware probe procedure (01–06)

Every new printer model should be validated with the probe set before enabling
Arabic in production. The probe binaries are produced by the server's **own**
modules (`arabic-probe-bins.ts`), so the probes always match production
shaping / bidi / raster code.

Generate the bins:

```sh
node scripts/arabic-print-probes.mjs
# → tmp/arabic-probes/*.bin (+ README)
# equivalent:
bazel run //apps/server:arabic_probes -- tmp/arabic-probes
```

`tmp/` is gitignored. Copy the `.bin` files to the Windows box next to
`win_rawprint.exe` (or use full paths), then print each with the **exact**
Windows queue name:

```
win_rawprint.exe "Exact Queue Name" 01-baseline-w1256-blind-rtl.bin
win_rawprint.exe "Exact Queue Name" 02-charset-w1256-cp50-shaped-bidi.bin
win_rawprint.exe "Exact Queue Name" 03-raster-shaped-bidi.bin
win_rawprint.exe "Exact Queue Name" 04-mixed-item-line.bin
win_rawprint.exe "Exact Queue Name" 05-mixed-item-line-raster.bin
win_rawprint.exe "Exact Queue Name" 06-lam-alef.bin
```

`win_rawprint.exe --list` prints the exact queue names if you are unsure.

### What each probe tells you

| #   | File                                    | What it tests                                           | What good looks like                                           | What bad looks like                   |
| --- | --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------- |
| 01  | `01-baseline-w1256-blind-rtl.bin`       | The old whole-string reverse bug (regression baseline)  | (intentional bad) `5x` on the right, `4321`                    | n/a — this is the baseline            |
| 02  | `02-charset-w1256-cp50-shaped-bidi.bin` | Charset order + `5x`/digits with shaping + segment bidi | `5x` left, `1234` intact, Arabic readable RTL but disconnected | flipped qty/digits, garbage code page |
| 03  | `03-raster-shaped-bidi.bin`             | Joined letters via `GS v 0`                             | Proper joined Arabic phrases                                   | blank, boxes, or still disconnected   |
| 04  | `04-mixed-item-line.bin`                | Item lines (qty + Arabic name) in charset               | `2x`/`1x`/`3x` left of the Arabic                              | `x2` on the wrong side                |
| 05  | `05-mixed-item-line-raster.bin`         | Item lines in raster                                    | Production-quality menu Arabic                                 | fuzzy / cut off if width wrong        |
| 06  | `06-lam-alef.bin`                       | لا / لله / بالله — charset vs raster side by side       | Raster shows true ligatures                                    | charset may show ل + ا split          |

Notes:

- A printed line `[raster atlas missing — charset only]` on probes 03/05/06
  means the atlas did not load — see Troubleshooting.
- Raster probes render at up to **384 dots** wide (the server's default max
  width). On a different paper width, sanity-check probe 05 before enabling
  raster in production.

## 6. Validation log

Hardware validation on the Epson unit over **Windows raw** (`win_rawprint`),
**2026-08-01**:

- **Winner: raster** (probes 03, 05, and the raster half of 06). W1256 +
  code page 50 + `visualRtl` + `renderMode: raster` is the production-quality
  path on this hardware.
- **Charset (probes 02, 04):** correct bidi and ordering — `5x`/digits in the
  right place — but letters print as isolated glyphs (W1256 cannot join).
  Acceptable fallback, not the production path.
- **Baseline (probe 01):** confirmed the old bugs — flipped quantities and
  reversed digits.

Follow this same procedure for any new printer model or encoding combination
before enabling Arabic in production.

## 7. Regenerating the glyph atlas

```sh
node scripts/make-arabic-glyph-atlas.mjs
```

- **Output:** `apps/server/assets/arabic-glyph-atlas.json` (committed).
- **Font:** Tajawal Regular (SIL Open Font License 1.1, OFL). The font and
  `opentype.js` are installed into a throwaway cache under the OS temp dir —
  the repository `package.json` / lockfile are never touched.
- **Network:** needed once for the font download; the font is cached in the
  temp dir afterwards (`ATLAS_SKIP_DOWNLOAD=1` forces use of the cache).
- **When to commit:** whenever glyphs, coverage, or the font change. The atlas
  ships in the Windows 7 package, so a stale atlas means stale Arabic.

## 8. Troubleshooting

| Symptom                                    | Likely cause / fix                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Garbage Arabic (wrong letters / mojibake)  | Wrong `encoding` / `codePage` for the printer. Re-run the probes (§5) and/or the Admin test ticket (§9) to find a working combo.                               |
| Correct letters but reversed reading order | `visualRtl` is off. Enable it in Admin → Printers.                                                                                                             |
| `5x` or digits flipped                     | You are on the old blind whole-string reverse. Ensure you are on the new segment bidi (`visualRtl` + current code) — probe 02 should show `5x` left of Arabic. |
| Joined letters required                    | Set `renderMode: raster`; confirm `arabic-glyph-atlas.json` is present in server assets (probe 03 prints a marker line when it is missing).                    |
| Raster blank / missing Arabic              | Atlas path or packaging problem — check server logs for atlas load failures, verify the asset is in the Win7 bundle, or fall back to `charset` until fixed.    |
| Fuzzy / cut-off raster text                | Bitmap wider than the paper — check `maxWidthDots` against the printer's dot width (probe 05).                                                                 |
| Kitchen tickets have no Arabic             | By design — Arabic is receipts/credit notes only (§1).                                                                                                         |

## 9. Related

- The Admin **test print** still carries §6 encoding probes and §7 configured
  samples, handy for a quick on-printer check without the probe bins
  (`apps/server/src/modules/printers/test-ticket-builder.ts`).
- The probe bins prefer production modules via
  `apps/server/src/modules/printers/arabic-probe-bins.ts`, so offline `.bin`
  probes and live printing can never drift apart.
- Transport details: `native/win_rawprint/README.md` (CLI contract, exit
  codes), `apps/server/src/modules/printers/win-rawprint-transport.ts`.
