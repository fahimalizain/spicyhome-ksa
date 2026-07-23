#!/usr/bin/env bash
# ZATCA E-Invoice Validator
# Usage:
#   ./validate.sh                  — generate & validate all 3 simplified docs
#   ./validate.sh <invoice.xml>    — validate a single file
#   ./validate.sh --samples        — validate SDK's built-in samples
# Requires: Java 8+, Node.js

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SDK_DIR="$SCRIPT_DIR/zatca-sdk"

run_validation() {
  local invoice_file="$1"
  local label="$2"
  local tmp_config

  tmp_config=$(mktemp -t zatca-config.XXXXXX.json)
  sed -e "s|SDK_ROOT|$SDK_DIR|g" "$SDK_DIR/Configuration/config.json" > "$tmp_config"

  echo "────────────────────────────────────────"
  echo "Validating: $label"
  echo "────────────────────────────────────────"

  SDK_CONFIG="$tmp_config" java \
    -jar "$SDK_DIR/Apps/zatca-einvoicing-sdk-238-R3.4.8.jar" \
    --globalVersion 238-R3.4.8 \
    -validate \
    -invoice "$invoice_file" 2>&1 | while IFS= read -r line; do
      case "$line" in
        *"validation result : PASSED"*)
          label=$(echo "$line" | sed -n 's/.*\[\(.*\)\].*/\1/p')
          printf "  \033[32mPASS\033[0m [%s]\n" "$label"
          ;;
        *"validation result : FAILED"*)
          label=$(echo "$line" | sed -n 's/.*\[\(.*\)\].*/\1/p')
          printf "  \033[31mFAIL\033[0m [%s]\n" "$label"
          ;;
        *"GLOBAL VALIDATION RESULT"*)
          if echo "$line" | grep -q "PASSED"; then
            printf "\n  \033[32mGLOBAL: PASSED\033[0m\n"
          else
            printf "\n  \033[31mGLOBAL: FAILED\033[0m\n"
          fi
          ;;
        *"ERROR"*|*"WARN"*)
          printf "       %s\n" "${line:36}"
          ;;
      esac
    done

  rm -f "$tmp_config"
  echo ""
}

# ── Main ────────────────────────────────────────────────────────────────────────

if [ $# -eq 0 ]; then
  # Generate & validate our 3 document types
  echo "==> Generating invoices from XML builder..."
  npx tsx "$SCRIPT_DIR/generate-invoices.ts" 2>/dev/null

  echo ""
  echo "==> Running ZATCA SDK validation..."
  echo ""

  run_validation "$SDK_DIR/Data/Samples/Generated/simplified_invoice.xml"     "Simplified Tax Invoice (388)"
  run_validation "$SDK_DIR/Data/Samples/Generated/simplified_credit_note.xml" "Simplified Credit Note (381)"
  run_validation "$SDK_DIR/Data/Samples/Generated/simplified_debit_note.xml"  "Simplified Debit Note (383)"

elif [ "$1" = "--samples" ]; then
  echo "==> Validating SDK built-in samples..."
  echo ""

  run_validation "$SDK_DIR/Data/Samples/Simplified/Simplified_Invoice.xml"     "SDK Simplified Invoice"
  run_validation "$SDK_DIR/Data/Samples/Simplified/Simplified_Credit_Note.xml" "SDK Simplified Credit Note"
  run_validation "$SDK_DIR/Data/Samples/Simplified/Simplified_Debit_Note.xml"  "SDK Simplified Debit Note"

else
  # Single file validation
  INVOICE_FILE="$1"
  if [ ! -f "$INVOICE_FILE" ]; then
    echo "Error: file not found: $1"
    exit 1
  fi
  INVOICE_FILE="$(cd "$(dirname "$INVOICE_FILE")" && pwd)/$(basename "$INVOICE_FILE")"
  run_validation "$INVOICE_FILE" "$(basename "$INVOICE_FILE")"
fi
