#!/usr/bin/env python3
"""
Arasul Platform Load Testing Suite

Tests:
- LLM Service: 30 parallel requests
- Embedding Service: 50 parallel requests
- n8n Workflows: 20 requests/second
- Dashboard API: Various endpoints
"""

import asyncio
import aiohttp
import time
import statistics
import sys
import json
from typing import List, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime
import argparse


@dataclass
class TestResult:
    """Individual test result"""
    test_name: str
    success: bool
    duration_ms: float
    status_code: int = 0
    error: str = ""


@dataclass
class LoadTestSummary:
    """Summary of load test results"""
    test_name: str
    total_requests: int
    successful: int
    failed: int
    min_time_ms: float
    max_time_ms: float
    avg_time_ms: float
    median_time_ms: float
    p95_time_ms: float
    p99_time_ms: float
    requests_per_second: float
    errors: List[str]


class LoadTester:
    """Main load testing class"""

    def __init__(self, base_url: str = "http://localhost", token: str = None):
        self.base_url = base_url.rstrip('/')
        self.token = token
        self.results: List[TestResult] = []

    async def make_request(
        self,
        session: aiohttp.ClientSession,
        method: str,
        endpoint: str,
        **kwargs
    ) -> TestResult:
        """Make a single HTTP request and measure time"""
        url = f"{self.base_url}{endpoint}"
        headers = kwargs.pop('headers', {})

        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        start_time = time.time()
        test_name = f"{method} {endpoint}"

        try:
            async with session.request(method, url, headers=headers, **kwargs) as response:
                await response.text()  # Read response
                duration_ms = (time.time() - start_time) * 1000

                return TestResult(
                    test_name=test_name,
                    success=response.status < 400,
                    duration_ms=duration_ms,
                    status_code=response.status
                )

        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return TestResult(
                test_name=test_name,
                success=False,
                duration_ms=duration_ms,
                error=str(e)
            )

    async def test_llm_service(self, parallel_requests: int = 30) -> LoadTestSummary:
        """Test LLM service with parallel requests"""
        print(f"\n🧠 Testing LLM Service ({parallel_requests} parallel requests)...")

        test_prompt = "Hello, this is a test prompt. Please respond."

        async with aiohttp.ClientSession() as session:
            tasks = []
            for i in range(parallel_requests):
                task = self.make_request(
                    session,
                    'POST',
                    '/api/llm/chat',
                    json={
                        'prompt': f"{test_prompt} Request {i+1}",
                        'max_tokens': 50
                    },
                    timeout=aiohttp.ClientTimeout(total=60)
                )
                tasks.append(task)

            results = await asyncio.gather(*tasks)

        return self._create_summary("LLM Service", results)

    async def test_embedding_service(self, parallel_requests: int = 50) -> LoadTestSummary:
        """Test embedding service with parallel requests"""
        print(f"\n📊 Testing Embedding Service ({parallel_requests} parallel requests)...")

        test_texts = [
            "This is a test document for embedding.",
            "Machine learning and artificial intelligence.",
            "Natural language processing example.",
            "Vector embeddings for semantic search.",
        ]

        async with aiohttp.ClientSession() as session:
            tasks = []
            for i in range(parallel_requests):
                task = self.make_request(
                    session,
                    'POST',
                    '/api/embeddings',
                    json={'text': test_texts[i % len(test_texts)]},
                    timeout=aiohttp.ClientTimeout(total=30)
                )
                tasks.append(task)

            results = await asyncio.gather(*tasks)

        return self._create_summary("Embedding Service", results)

    async def test_n8n_webhooks(self, requests_per_second: int = 20, duration_seconds: int = 5) -> LoadTestSummary:
        """Test n8n webhook throughput"""
        print(f"\n🔗 Testing n8n Webhooks ({requests_per_second} req/s for {duration_seconds}s)...")

        interval = 1.0 / requests_per_second
        total_requests = requests_per_second * duration_seconds

        async with aiohttp.ClientSession() as session:
            results = []
            start_time = time.time()

            for i in range(total_requests):
                # Send request
                result = await self.make_request(
                    session,
                    'POST',
                    '/n8n/webhook/test',
                    json={'test_id': i, 'timestamp': time.time()},
                    timeout=aiohttp.ClientTimeout(total=10)
                )
                results.append(result)

                # Wait for next interval
                elapsed = time.time() - start_time
                expected_time = (i + 1) * interval
                sleep_time = max(0, expected_time - elapsed)
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)

        return self._create_summary("n8n Webhooks", results)

    async def test_dashboard_api(self, parallel_requests: int = 20) -> LoadTestSummary:
        """Test dashboard API endpoints"""
        print(f"\n📱 Testing Dashboard API ({parallel_requests} parallel requests)...")

        endpoints = [
            '/api/system/status',
            '/api/system/info',
            '/api/system/network',
            '/api/metrics/live',
            '/api/services',
            '/api/workflows/activity',
        ]

        async with aiohttp.ClientSession() as session:
            tasks = []
            for i in range(parallel_requests):
                endpoint = endpoints[i % len(endpoints)]
                task = self.make_request(
                    session,
                    'GET',
                    endpoint,
                    timeout=aiohttp.ClientTimeout(total=10)
                )
                tasks.append(task)

            results = await asyncio.gather(*tasks)

        return self._create_summary("Dashboard API", results)

    def _create_summary(self, test_name: str, results: List[TestResult]) -> LoadTestSummary:
        """Create summary from test results"""
        successful = [r for r in results if r.success]
        failed = [r for r in results if not r.success]

        durations = [r.duration_ms for r in results]
        durations_sorted = sorted(durations)

        if not durations:
            raise ValueError("No results to summarize")

        total_time = sum(durations)
        count = len(durations)

        return LoadTestSummary(
            test_name=test_name,
            total_requests=len(results),
            successful=len(successful),
            failed=len(failed),
            min_time_ms=min(durations),
            max_time_ms=max(durations),
            avg_time_ms=statistics.mean(durations),
            median_time_ms=statistics.median(durations),
            p95_time_ms=durations_sorted[int(count * 0.95)] if count > 0 else 0,
            p99_time_ms=durations_sorted[int(count * 0.99)] if count > 0 else 0,
            requests_per_second=count / (total_time / 1000) if total_time > 0 else 0,
            errors=[r.error for r in failed if r.error]
        )

    def print_summary(self, summary: LoadTestSummary):
        """Print formatted summary"""
        print(f"\n{'='*60}")
        print(f"  {summary.test_name} - Results")
        print(f"{'='*60}")
        print(f"Total Requests:    {summary.total_requests}")
        print(f"Successful:        {summary.successful} ({summary.successful/summary.total_requests*100:.1f}%)")
        print(f"Failed:            {summary.failed} ({summary.failed/summary.total_requests*100:.1f}%)")
        print(f"\nResponse Times:")
        print(f"  Min:             {summary.min_time_ms:.2f} ms")
        print(f"  Max:             {summary.max_time_ms:.2f} ms")
        print(f"  Average:         {summary.avg_time_ms:.2f} ms")
        print(f"  Median:          {summary.median_time_ms:.2f} ms")
        print(f"  95th percentile: {summary.p95_time_ms:.2f} ms")
        print(f"  99th percentile: {summary.p99_time_ms:.2f} ms")
        print(f"\nThroughput:        {summary.requests_per_second:.2f} req/s")

        if summary.errors:
            print(f"\nErrors ({len(summary.errors)}):")
            for error in summary.errors[:5]:  # Show first 5 errors
                print(f"  - {error}")
            if len(summary.errors) > 5:
                print(f"  ... and {len(summary.errors) - 5} more")

        # Pass/Fail criteria
        success_rate = summary.successful / summary.total_requests
        if success_rate >= 0.95 and summary.p95_time_ms < 5000:
            print(f"\n✅ PASSED")
        else:
            print(f"\n❌ FAILED (success rate: {success_rate*100:.1f}%, p95: {summary.p95_time_ms:.0f}ms)")

    def save_results(self, summaries: List[LoadTestSummary], filename: str):
        """Save results to JSON file"""
        output = {
            'timestamp': datetime.now().isoformat(),
            'base_url': self.base_url,
            'summaries': [asdict(s) for s in summaries]
        }

        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)

        print(f"\n📄 Results saved to: {filename}")


async def run_all_tests(base_url: str, token: str = None):
    """Run all load tests"""
    tester = LoadTester(base_url, token)
    summaries = []

    try:
        # Test Dashboard API first (lightweight)
        summary = await tester.test_dashboard_api(parallel_requests=20)
        tester.print_summary(summary)
        summaries.append(summary)

        # Test Embedding Service
        summary = await tester.test_embedding_service(parallel_requests=50)
        tester.print_summary(summary)
        summaries.append(summary)

        # Test LLM Service (most intensive)
        summary = await tester.test_llm_service(parallel_requests=30)
        tester.print_summary(summary)
        summaries.append(summary)

        # Test n8n Webhooks
        summary = await tester.test_n8n_webhooks(requests_per_second=20, duration_seconds=5)
        tester.print_summary(summary)
        summaries.append(summary)

        # Save results
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        tester.save_results(summaries, f'load_test_results_{timestamp}.json')

        # Overall summary
        print(f"\n{'='*60}")
        print("  OVERALL SUMMARY")
        print(f"{'='*60}")

        total_requests = sum(s.total_requests for s in summaries)
        total_successful = sum(s.successful for s in summaries)
        total_failed = sum(s.failed for s in summaries)
        overall_success_rate = total_successful / total_requests if total_requests > 0 else 0

        print(f"Total Requests:    {total_requests}")
        print(f"Total Successful:  {total_successful} ({overall_success_rate*100:.1f}%)")
        print(f"Total Failed:      {total_failed}")

        if overall_success_rate >= 0.95:
            print(f"\n✅ ALL TESTS PASSED")
            return 0
        else:
            print(f"\n❌ SOME TESTS FAILED")
            return 1

    except Exception as e:
        print(f"\n❌ Test suite failed: {e}")
        return 1


def main():
    parser = argparse.ArgumentParser(description='Arasul Platform Load Testing')
    parser.add_argument('--url', default='http://localhost', help='Base URL (default: http://localhost)')
    parser.add_argument('--token', help='JWT token for authentication')
    args = parser.parse_args()

    print("="*60)
    print("  ARASUL PLATFORM - LOAD TESTING SUITE")
    print("="*60)
    print(f"Base URL: {args.url}")
    print(f"Started:  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    exit_code = asyncio.run(run_all_tests(args.url, args.token))
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
