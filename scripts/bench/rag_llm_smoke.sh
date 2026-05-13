#!/usr/bin/env bash
# rag_llm_smoke.sh — Latency baseline for the RAG + LLM pipeline.
#
# Runs a small set of RAG queries and chat streams against the dashboard backend
# and prints a Markdown table with TTFT, tokens/s, RAG phase latencies. Intended
# as a before/after check around the llm-rag-store-routing-optimization plan
# (P10 acceptance gate).
#
# Usage:
#   BACKEND_URL=http://localhost:3001 \
#   AUTH_TOKEN=$(cat ~/.arasul-token) \
#   ./scripts/bench/rag_llm_smoke.sh
#
# Required env:
#   BACKEND_URL  — backend base URL (default http://localhost:3001)
#   AUTH_TOKEN   — Bearer JWT for the dashboard user
#
# Optional:
#   CHAT_MODEL   — model id to use for the chat run (default: server-recommended)
#   N_QUERIES    — number of queries per phase (default 5)
#   OUT          — output markdown file (default ./docs/plans/active/llm-rag-store-routing-optimization-bench.md)

set -euo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:3001}"
N_QUERIES="${N_QUERIES:-5}"
OUT="${OUT:-./docs/plans/active/llm-rag-store-routing-optimization-bench.md}"

if [[ -z "${AUTH_TOKEN:-}" ]]; then
  echo "ERROR: AUTH_TOKEN env var required (Bearer JWT)." >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required." >&2
  exit 2
fi

QUERIES=(
  "Wie funktioniert das Backup-System?"
  "Welche Telegram-Befehle sind ohne Einwilligung erlaubt?"
  "Was ist der Unterschied zwischen Knowledge Spaces und Projekten?"
  "Wann werden Audit-Logs gelöscht?"
  "Wie konfiguriere ich n8n?"
)

mkdir -p "$(dirname "$OUT")"

echo "# RAG + LLM Smoke-Bench" > "$OUT"
echo "" >> "$OUT"
echo "Generated: $(date -Iseconds)" >> "$OUT"
echo "Backend: $BACKEND_URL" >> "$OUT"
echo "" >> "$OUT"

echo "## RAG Query Latencies (sequential)" >> "$OUT"
echo "" >> "$OUT"
echo "| # | Query | HTTP-Status | Elapsed (ms) | Top-1 Score | Notes |" >> "$OUT"
echo "|---|---|---|---|---|---|" >> "$OUT"

for i in $(seq 1 "$N_QUERIES"); do
  q="${QUERIES[$((i-1))]}"
  start=$(date +%s%3N)
  response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -X POST "$BACKEND_URL/api/rag/query" \
    -d "$(jq -nc --arg q "$q" '{query:$q, conversation_id:"smoke-bench"}')" \
    --max-time 60 || echo "HTTP_STATUS:000")
  end=$(date +%s%3N)
  elapsed=$((end - start))
  http=$(echo "$response" | sed -n 's/.*HTTP_STATUS:\([0-9]*\).*/\1/p')
  body=$(echo "$response" | sed -e 's/HTTP_STATUS:.*$//')
  top_score=$(echo "$body" | jq -r '.sources[0].rerank_score // .sources[0].score // "—"' 2>/dev/null || echo "—")
  echo "| $i | $q | $http | $elapsed | $top_score |  |" >> "$OUT"
done

echo "" >> "$OUT"
echo "**Targets:** Total elapsed ≤ 700 ms for RAG-overhead (embed + search + rerank); end-to-end including LLM ≤ 1.5 s TTFT." >> "$OUT"
echo "" >> "$OUT"

echo "## Chat TTFT (sequential, no RAG)" >> "$OUT"
echo "" >> "$OUT"
echo "| # | Query | TTFT (ms) | Total (ms) | Tokens | Tokens/s |" >> "$OUT"
echo "|---|---|---|---|---|---|" >> "$OUT"

for i in $(seq 1 "$N_QUERIES"); do
  q="${QUERIES[$((i-1))]}"
  payload=$(jq -nc --arg q "$q" --arg model "${CHAT_MODEL:-}" \
    '{messages:[{role:"user", content:$q}], stream:true, model:($model | select(. != ""))}')
  start=$(date +%s%3N)
  first_token=0
  total_tokens=0
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    [[ "$line" == "data: [DONE]" ]] && break
    if [[ $first_token -eq 0 ]]; then
      first_token=$(date +%s%3N)
    fi
    total_tokens=$((total_tokens + 1))
  done < <(curl -sN \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -X POST "$BACKEND_URL/api/llm/chat" \
    -d "$payload" \
    --max-time 90 || true)
  end=$(date +%s%3N)
  ttft=$((first_token > 0 ? first_token - start : -1))
  total=$((end - start))
  rate="—"
  if [[ $total_tokens -gt 0 && $total -gt 0 ]]; then
    rate=$(awk "BEGIN {printf \"%.1f\", $total_tokens * 1000 / $total}")
  fi
  echo "| $i | $q | $ttft | $total | $total_tokens | $rate |" >> "$OUT"
done

echo "" >> "$OUT"
echo "**Targets:** TTFT ≤ 1500 ms; Tokens/s ≥ 18 on Orin/Thor with the Balanced-tier model (7B-12B Q4_K_M)." >> "$OUT"

echo ""
echo "Bench written to $OUT"
