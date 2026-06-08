#!/usr/bin/env bash
# Verify careersUrl for every company in data/companies/all-companies.json.
# Runs curl HEAD requests in parallel and writes a report to /tmp/company-url-report.tsv.
# Usage: bash scripts/verify-company-urls.sh

set -uo pipefail

DATA_FILE="data/companies/all-companies.json"
REPORT="/tmp/company-url-report.tsv"
CONCURRENCY=20
TIMEOUT=12
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

if [[ ! -f "$DATA_FILE" ]]; then
  echo "ERROR: $DATA_FILE not found (run from project root)" >&2
  exit 1
fi

TOTAL=$(jq -r 'length' "$DATA_FILE")
EMPTY_COUNT=$(jq -r '[.[] | select(.careersUrl == "" or .careersUrl == null)] | length' "$DATA_FILE")

echo "Companies total:       $TOTAL"
echo "Missing careersUrl:    $EMPTY_COUNT"
echo "Concurrency:           $CONCURRENCY"
echo "Per-request timeout:   ${TIMEOUT}s"
echo ""
echo "Verifying... (writing report to $REPORT)"
echo ""

: > "$REPORT"

check_one() {
  # Single arg: "rank<TAB>company<TAB>url"
  local line="$1"
  local rank company url
  IFS=$'\t' read -r rank company url <<< "$line"

  local result
  result=$(curl -ILsS \
    --max-time "$TIMEOUT" \
    --connect-timeout 6 \
    -A "$UA" \
    -o /dev/null \
    -w '%{http_code}\t%{url_effective}' \
    "$url" 2>/dev/null) || true

  local code final
  code="${result%%$'\t'*}"
  final="${result#*$'\t'}"

  local status
  if [[ "$code" =~ ^2[0-9]{2}$ ]]; then
    status="OK"
  elif [[ "$code" =~ ^3[0-9]{2}$ ]]; then
    status="REDIRECT"
  elif [[ "$code" =~ ^4[0-9]{2}$ ]]; then
    status="CLIENT_ERR"
  elif [[ "$code" =~ ^5[0-9]{2}$ ]]; then
    status="SERVER_ERR"
  elif [[ -z "$code" || "$code" == "000" ]]; then
    status="UNREACHABLE"
    code="000"
    final="$url"
  else
    status="UNKNOWN"
  fi

  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$rank" "$status" "$code" "$company" "$url" "$final" >> "$REPORT"
}
export -f check_one
export TIMEOUT UA REPORT

# One TSV record per line; convert newline -> NUL so xargs -0 treats each record as a single
# argument (BSD xargs on macOS doesn't support -d).
jq -r '.[] | select(.careersUrl != "" and .careersUrl != null) | [.rank, .company, .careersUrl] | @tsv' "$DATA_FILE" \
  | tr '\n' '\0' \
  | xargs -0 -P "$CONCURRENCY" -I {} bash -c 'check_one "$@"' _ {}

echo "===== SUMMARY ====="
echo ""
sort -t$'\t' -k1,1n "$REPORT" -o "$REPORT"
awk -F'\t' '{print $2}' "$REPORT" | sort | uniq -c | sort -rn
echo ""

echo "===== BROKEN (4xx / 5xx / UNREACHABLE / UNKNOWN) ====="
awk -F'\t' '$2 != "OK" && $2 != "REDIRECT" {printf "  #%-3s [%-11s %s]  %-45s  =>  %s\n", $1, $2, $3, $4, $5}' "$REPORT"
echo ""
echo "Full report: $REPORT"
