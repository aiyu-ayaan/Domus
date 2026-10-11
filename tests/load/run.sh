#!/usr/bin/env bash
# Usage: tests/load/run.sh [base-url]  (needs k6 on PATH or K6=/path/to/k6)
set -e
cd "$(dirname "$0")"
stamp=$(date +%Y%m%d-%H%M%S)
${K6:-k6} run -e BASE="${1:-https://domus.aiyuayaan.uk}" --summary-export "results/$stamp.json" public.js 2>&1 | tee "results/$stamp.log"
