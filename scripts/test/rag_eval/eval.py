#!/usr/bin/env python3
"""
RAG Quality Evaluation Harness — Arasul Platform (Phase 6.1)

Runs a set of predefined Q/A test cases against the live RAG pipeline
(/api/rag/query) and computes quality metrics:

  - faithfulness      all expectedFacts found (case-insensitive substring)
  - source_match      any returned source's document_name contains expectedSource
  - retrieved         at least one source returned
  - latency_ms        wall time from request to 'done' SSE event

Usage:
  python3 eval.py \
    --base-url http://localhost:3001 \
    --cases cases.json \
    --report report.json

Environment:
  ARASUL_USER         admin username (required)
  ARASUL_PASSWORD     admin password (required)
  ARASUL_BASE_URL     API base URL (overrides --base-url)

Exit codes:
  0   all cases passed (faithfulness & source_match)
  1   at least one case failed
  2   setup / connectivity error
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

import requests


@dataclass
class Case:
    id: str
    query: str
    expected_facts: list[str]
    expected_source: str | None = None
    category: str = "general"
    top_k: int = 8
    timeout_s: int = 180

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Case":
        return cls(
            id=d["id"],
            query=d["query"],
            expected_facts=d.get("expected_facts") or d.get("expectedFacts") or [],
            expected_source=d.get("expected_source") or d.get("expectedSource"),
            category=d.get("category", "general"),
            top_k=int(d.get("top_k", 8)),
            timeout_s=int(d.get("timeout_s", 180)),
        )


@dataclass
class Result:
    id: str
    query: str
    category: str
    answer: str
    sources: list[dict]
    latency_ms: int
    faithfulness: bool
    source_match: bool
    retrieved: bool
    missing_facts: list[str] = field(default_factory=list)
    error: str | None = None


def login(base_url: str, user: str, password: str) -> str:
    """POST /api/auth/login — returns JWT token."""
    r = requests.post(
        f"{base_url.rstrip('/')}/api/auth/login",
        json={"username": user, "password": password},
        timeout=15,
    )
    if r.status_code != 200:
        raise SystemExit(f"[setup] Login failed ({r.status_code}): {r.text[:200]}")
    token = r.json().get("token") or r.json().get("accessToken")
    if not token:
        raise SystemExit(f"[setup] No token in login response: {r.text[:200]}")
    return token


def create_conversation(base_url: str, token: str) -> int:
    """POST /api/chats — creates a fresh conversation for the eval run."""
    r = requests.post(
        f"{base_url.rstrip('/')}/api/chats",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "rag-eval"},
        timeout=15,
    )
    if r.status_code >= 300:
        raise SystemExit(f"[setup] Chat create failed ({r.status_code}): {r.text[:200]}")
    chat_id = r.json().get("chat", {}).get("id")
    if chat_id is None:
        raise SystemExit(f"[setup] No chat id in response: {r.text[:200]}")
    return int(chat_id)


def run_query(base_url: str, token: str, conversation_id: int, case: Case) -> tuple[str, list[dict], int, str | None]:
    """POST /api/rag/query, consume SSE stream, return (answer, sources, latency_ms, error)."""
    url = f"{base_url.rstrip('/')}/api/rag/query"
    payload = {
        "query": case.query,
        "top_k": case.top_k,
        "conversation_id": conversation_id,
        "thinking": False,
    }
    headers = {"Authorization": f"Bearer {token}", "Accept": "text/event-stream"}

    answer_parts: list[str] = []
    sources: list[dict] = []
    t0 = time.monotonic()
    try:
        with requests.post(url, json=payload, headers=headers, stream=True, timeout=case.timeout_s) as r:
            if r.status_code >= 300:
                return "", [], int((time.monotonic() - t0) * 1000), f"HTTP {r.status_code}: {r.text[:200]}"

            for raw in r.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                if not raw.startswith("data:"):
                    continue
                data = raw[len("data:"):].strip()
                if not data:
                    continue
                try:
                    event = json.loads(data)
                except json.JSONDecodeError:
                    continue

                etype = event.get("type")
                if etype == "rag_metadata" and event.get("sources"):
                    sources = event["sources"]
                elif etype == "sources" and event.get("sources"):
                    sources = event["sources"]
                elif etype == "response" and event.get("token"):
                    answer_parts.append(event["token"])
                elif etype == "error":
                    return "".join(answer_parts), sources, int((time.monotonic() - t0) * 1000), str(event.get("error"))

                if event.get("done") or etype == "done":
                    break
    except requests.RequestException as e:
        return "".join(answer_parts), sources, int((time.monotonic() - t0) * 1000), f"request error: {e}"

    return "".join(answer_parts), sources, int((time.monotonic() - t0) * 1000), None


def score(case: Case, answer: str, sources: list[dict]) -> tuple[bool, bool, bool, list[str]]:
    """Return (faithfulness, source_match, retrieved, missing_facts)."""
    answer_lc = answer.lower()
    missing = [f for f in case.expected_facts if f.lower() not in answer_lc]
    faithfulness = len(missing) == 0 and len(case.expected_facts) > 0

    retrieved = len(sources) > 0
    source_match = True  # default when no expected_source given
    if case.expected_source:
        needle = case.expected_source.lower()
        source_match = any(needle in (s.get("document_name") or "").lower() for s in sources)

    return faithfulness, source_match, retrieved, missing


def summarize(results: list[Result]) -> dict[str, Any]:
    total = len(results)
    if total == 0:
        return {"total": 0}
    faithful = sum(1 for r in results if r.faithfulness)
    source_ok = sum(1 for r in results if r.source_match)
    retrieved = sum(1 for r in results if r.retrieved)
    no_doc = sum(1 for r in results if not r.retrieved)
    avg_latency = sum(r.latency_ms for r in results) / total
    avg_answer_len = sum(len(r.answer) for r in results) / total
    return {
        "total": total,
        "faithfulness_rate": round(faithful / total, 3),
        "source_match_rate": round(source_ok / total, 3),
        "retrieval_rate": round(retrieved / total, 3),
        "no_document_rate": round(no_doc / total, 3),
        "avg_latency_ms": int(avg_latency),
        "avg_answer_length_chars": int(avg_answer_len),
    }


def print_row(r: Result, width_id: int) -> None:
    icons = [
        "✓" if r.faithfulness else "✗",
        "✓" if r.source_match else "✗",
        "✓" if r.retrieved else "✗",
    ]
    fail_reason = ""
    if r.error:
        fail_reason = f"  ERROR: {r.error[:80]}"
    elif not r.retrieved:
        fail_reason = "  (no documents retrieved)"
    elif r.missing_facts:
        fail_reason = f"  missing: {', '.join(r.missing_facts[:2])}"
    print(f"  {r.id:<{width_id}}  fact={icons[0]}  src={icons[1]}  ret={icons[2]}  {r.latency_ms:>6}ms{fail_reason}")


def main() -> int:
    p = argparse.ArgumentParser(description="RAG quality evaluation runner")
    p.add_argument("--base-url", default=os.environ.get("ARASUL_BASE_URL", "http://localhost:3001"))
    p.add_argument("--cases", default=str(Path(__file__).parent / "cases.example.json"))
    p.add_argument("--report", default=None, help="Write JSON report to this path")
    p.add_argument("--filter", default=None, help="Only run cases whose id matches substring")
    args = p.parse_args()

    user = os.environ.get("ARASUL_USER")
    pw = os.environ.get("ARASUL_PASSWORD")
    if not user or not pw:
        print("ERROR: set ARASUL_USER and ARASUL_PASSWORD in env", file=sys.stderr)
        return 2

    cases_path = Path(args.cases)
    if not cases_path.is_file():
        print(f"ERROR: cases file not found: {cases_path}", file=sys.stderr)
        return 2

    with cases_path.open() as f:
        raw_cases = json.load(f)
    cases = [Case.from_dict(c) for c in raw_cases]
    if args.filter:
        cases = [c for c in cases if args.filter in c.id]
    if not cases:
        print("ERROR: no cases to run (after filter)", file=sys.stderr)
        return 2

    print(f"RAG eval: {len(cases)} cases against {args.base_url}")
    token = login(args.base_url, user, pw)
    conversation_id = create_conversation(args.base_url, token)
    print(f"  conversation_id={conversation_id}")
    print()

    results: list[Result] = []
    width_id = max(len(c.id) for c in cases)
    for c in cases:
        answer, sources, latency_ms, err = run_query(args.base_url, token, conversation_id, c)
        faith, src_ok, retrieved, missing = score(c, answer, sources)
        r = Result(
            id=c.id,
            query=c.query,
            category=c.category,
            answer=answer,
            sources=sources,
            latency_ms=latency_ms,
            faithfulness=faith,
            source_match=src_ok,
            retrieved=retrieved,
            missing_facts=missing,
            error=err,
        )
        results.append(r)
        print_row(r, width_id)

    summary = summarize(results)
    print()
    print("Summary:")
    for k, v in summary.items():
        print(f"  {k}: {v}")

    if args.report:
        out = {
            "base_url": args.base_url,
            "summary": summary,
            "results": [asdict(r) for r in results],
        }
        Path(args.report).write_text(json.dumps(out, indent=2, ensure_ascii=False))
        print(f"\nReport written to {args.report}")

    all_pass = all(r.faithfulness and r.source_match for r in results)
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
