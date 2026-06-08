#!/usr/bin/env bash
# Re-test 404/405 entries from /tmp/company-url-report.tsv using GET (some sites block HEAD).
# Usage: bash scripts/recheck-broken-urls.sh

set -uo pipefail

REPORT="/tmp/company-url-report.tsv"
TIMEOUT=20
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

if [[ ! -f "$REPORT" ]]; then
  echo "ERROR: $REPORT not found. Run verify-company-urls.sh first." >&2
  exit 1
fi

echo "Re-checking 404/405 entries with GET..."
echo ""

# Header
printf '%-4s  %-12s  %-45s  %-50s  %s\n' "#" "NEW STATUS" "Company" "URL" "Final URL"
printf '%-4s  %-12s  %-45s  %-50s  %s\n' "----" "------------" "---------------------------------------------" "--------------------------------------------------" "---------"

# Filter rows where code is 404 or 405
awk -F'\t' '$3 == "404" || $3 == "405" {print}' "$REPORT" | while IFS=$'\t' read -r rank status code company url _final; do
  # GET, follow redirects, accept html, browser-y headers
  result=$(curl -LsS \
    --max-time "$TIMEOUT" \
    --connect-timeout 6 \
    -A "$UA" \
    -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
    -H 'Accept-Language: en-US,en;q=0.5' \
    -o /dev/null \
    -w '%{http_code}\t%{url_effective}' \
    "$url" 2>/dev/null) || true

  new_code="${result%%$'\t'*}"
  final="${result#*$'\t'}"

  if [[ "$new_code" =~ ^2[0-9]{2}$ ]]; then
    label="OK (was $code)"
  elif [[ "$new_code" =~ ^3[0-9]{2}$ ]]; then
    label="REDIR $new_code"
  elif [[ "$new_code" =~ ^4[0-9]{2}$ ]]; then
    label="FAIL $new_code"
  elif [[ "$new_code" =~ ^5[0-9]{2}$ ]]; then
    label="FAIL $new_code"
  else
    label="UNREACH"
    new_code="000"
    final="$url"
  fi

  # Truncate long fields
  short_company="${company:0:45}"
  short_url="${url:0:50}"
  printf '%-4s  %-12s  %-45s  %-50s  %s\n' "$rank" "$label" "$short_company" "$short_url" "$final"
done
