#!/usr/bin/env python3
"""
Arasul Platform - Long-Run Stability Monitor

Monitors system for 30 days (or specified duration):
- Memory leaks (<5% growth over 30 days)
- Disk usage stability
- Service availability (99.9% uptime)
- Error rate tracking
- Automated health reports

Usage:
    ./stability_monitor.py --duration 30  # 30 days
    ./stability_monitor.py --duration 1 --interval 60  # 1 day, check every 60s
"""

import asyncio
import aiohttp
import psutil
import docker
import json
import time
import sys
import argparse
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict, field
import statistics


@dataclass
class ServiceMetrics:
    """Metrics for a single service"""
    container_name: str
    cpu_percent: float
    memory_mb: float
    memory_percent: float
    status: str
    restarts: int
    timestamp: datetime


@dataclass
class SystemSnapshot:
    """Complete system snapshot"""
    timestamp: datetime
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    disk_used_gb: float
    disk_free_gb: float
    services: Dict[str, ServiceMetrics] = field(default_factory=dict)
    api_response_time_ms: Optional[float] = None
    errors: List[str] = field(default_factory=list)


@dataclass
class StabilityReport:
    """Stability analysis report"""
    start_time: datetime
    end_time: datetime
    duration_hours: float
    total_snapshots: int

    # Memory analysis
    initial_memory_percent: float
    final_memory_percent: float
    memory_growth_percent: float
    memory_leak_detected: bool

    # Disk analysis
    initial_disk_percent: float
    final_disk_percent: float
    disk_growth_gb: float

    # Service availability
    service_uptime_percent: Dict[str, float]
    total_service_restarts: Dict[str, int]

    # Performance
    avg_api_response_ms: float
    max_api_response_ms: float
    p95_api_response_ms: float

    # Errors
    total_errors: int
    error_rate_per_hour: float
    critical_errors: List[str]

    # Overall health
    passed: bool
    issues: List[str]


class StabilityMonitor:
    """Long-run stability monitoring"""

    def __init__(
        self,
        duration_days: int = 30,
        check_interval_seconds: int = 300,
        base_url: str = "http://localhost"
    ):
        self.duration = timedelta(days=duration_days)
        self.interval = check_interval_seconds
        self.base_url = base_url
        self.snapshots: List[SystemSnapshot] = []
        self.docker_client = docker.from_env()

        # Create output directory
        self.output_dir = Path(__file__).parent / "stability_reports"
        self.output_dir.mkdir(exist_ok=True)

        self.start_time = datetime.now()
        self.end_time = self.start_time + self.duration

    async def get_service_metrics(self) -> Dict[str, ServiceMetrics]:
        """Get metrics for all Docker containers"""
        metrics = {}

        try:
            for container in self.docker_client.containers.list():
                try:
                    stats = container.stats(stream=False)
                    name = container.name

                    # Calculate CPU percentage
                    cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                                stats['precpu_stats']['cpu_usage']['total_usage']
                    system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                                   stats['precpu_stats']['system_cpu_usage']
                    cpu_percent = (cpu_delta / system_delta) * 100.0 if system_delta > 0 else 0.0

                    # Memory usage
                    memory_usage = stats['memory_stats']['usage']
                    memory_limit = stats['memory_stats']['limit']
                    memory_mb = memory_usage / (1024 * 1024)
                    memory_percent = (memory_usage / memory_limit) * 100.0

                    # Container status
                    container.reload()
                    status = container.status
                    restart_count = container.attrs['RestartCount']

                    metrics[name] = ServiceMetrics(
                        container_name=name,
                        cpu_percent=round(cpu_percent, 2),
                        memory_mb=round(memory_mb, 2),
                        memory_percent=round(memory_percent, 2),
                        status=status,
                        restarts=restart_count,
                        timestamp=datetime.now()
                    )

                except Exception as e:
                    print(f"Error getting metrics for {container.name}: {e}")

        except Exception as e:
            print(f"Error accessing Docker: {e}")

        return metrics

    async def check_api_health(self) -> Optional[float]:
        """Check API health and measure response time"""
        try:
            start = time.time()
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/api/system/status",
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    await response.text()
                    if response.status == 200:
                        return (time.time() - start) * 1000
        except Exception as e:
            print(f"API health check failed: {e}")
            return None

    async def take_snapshot(self) -> SystemSnapshot:
        """Take a complete system snapshot"""
        # System metrics
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        # Service metrics
        services = await self.get_service_metrics()

        # API response time
        api_response = await self.check_api_health()

        # Collect any errors
        errors = []
        if api_response is None:
            errors.append("API not responding")

        for name, service in services.items():
            if service.status != 'running':
                errors.append(f"Service {name} is {service.status}")

        snapshot = SystemSnapshot(
            timestamp=datetime.now(),
            cpu_percent=cpu_percent,
            memory_percent=memory.percent,
            disk_percent=disk.percent,
            disk_used_gb=disk.used / (1024**3),
            disk_free_gb=disk.free / (1024**3),
            services=services,
            api_response_time_ms=api_response,
            errors=errors
        )

        return snapshot

    async def monitor_loop(self):
        """Main monitoring loop"""
        print(f"Starting stability monitoring...")
        print(f"Duration: {self.duration.days} days")
        print(f"Interval: {self.interval} seconds")
        print(f"End time: {self.end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print()

        snapshot_count = 0

        while datetime.now() < self.end_time:
            try:
                snapshot = await self.take_snapshot()
                self.snapshots.append(snapshot)
                snapshot_count += 1

                # Progress update
                elapsed = datetime.now() - self.start_time
                remaining = self.end_time - datetime.now()
                progress = (elapsed.total_seconds() / self.duration.total_seconds()) * 100

                print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] "
                      f"Snapshot {snapshot_count} | "
                      f"Progress: {progress:.1f}% | "
                      f"Remaining: {remaining.days}d {remaining.seconds//3600}h | "
                      f"CPU: {snapshot.cpu_percent:.1f}% | "
                      f"MEM: {snapshot.memory_percent:.1f}% | "
                      f"DISK: {snapshot.disk_percent:.1f}% | "
                      f"Errors: {len(snapshot.errors)}")

                # Save periodic checkpoint
                if snapshot_count % 100 == 0:
                    self.save_checkpoint()

                # Wait for next interval
                await asyncio.sleep(self.interval)

            except KeyboardInterrupt:
                print("\nMonitoring interrupted by user")
                break
            except Exception as e:
                print(f"Error during monitoring: {e}")
                await asyncio.sleep(self.interval)

        print("\nMonitoring completed!")
        return self.generate_report()

    def save_checkpoint(self):
        """Save current state to checkpoint file"""
        checkpoint_file = self.output_dir / "checkpoint.json"
        data = {
            'start_time': self.start_time.isoformat(),
            'snapshot_count': len(self.snapshots),
            'last_snapshot': asdict(self.snapshots[-1]) if self.snapshots else None
        }

        with open(checkpoint_file, 'w') as f:
            json.dump(data, f, indent=2, default=str)

    def generate_report(self) -> StabilityReport:
        """Generate stability analysis report"""
        if not self.snapshots:
            raise ValueError("No snapshots collected")

        first = self.snapshots[0]
        last = self.snapshots[-1]

        # Memory analysis
        memory_growth = last.memory_percent - first.memory_percent
        memory_leak = memory_growth > 5.0  # >5% growth indicates leak

        # Disk analysis
        disk_growth = last.disk_used_gb - first.disk_used_gb

        # Service uptime
        service_uptime = {}
        service_restarts = {}

        all_services = set()
        for snapshot in self.snapshots:
            all_services.update(snapshot.services.keys())

        for service_name in all_services:
            running_count = sum(
                1 for s in self.snapshots
                if service_name in s.services and s.services[service_name].status == 'running'
            )
            total_count = len(self.snapshots)
            service_uptime[service_name] = (running_count / total_count) * 100.0

            # Track restarts
            restart_counts = [
                s.services[service_name].restarts
                for s in self.snapshots
                if service_name in s.services
            ]
            service_restarts[service_name] = max(restart_counts) if restart_counts else 0

        # API performance
        api_times = [s.api_response_time_ms for s in self.snapshots if s.api_response_time_ms]
        avg_api = statistics.mean(api_times) if api_times else 0
        max_api = max(api_times) if api_times else 0
        p95_api = sorted(api_times)[int(len(api_times) * 0.95)] if api_times else 0

        # Error analysis
        all_errors = []
        for snapshot in self.snapshots:
            all_errors.extend(snapshot.errors)

        critical_errors = list(set(all_errors))[:10]  # Top 10 unique errors

        duration_hours = (last.timestamp - first.timestamp).total_seconds() / 3600
        error_rate = len(all_errors) / duration_hours if duration_hours > 0 else 0

        # Determine pass/fail
        issues = []
        if memory_leak:
            issues.append(f"Memory leak detected: {memory_growth:.1f}% growth")
        if disk_growth > 10:
            issues.append(f"Excessive disk growth: {disk_growth:.1f} GB")
        if any(uptime < 99.0 for uptime in service_uptime.values()):
            issues.append("Service uptime below 99%")
        if error_rate > 10:
            issues.append(f"High error rate: {error_rate:.1f} errors/hour")

        passed = len(issues) == 0

        report = StabilityReport(
            start_time=first.timestamp,
            end_time=last.timestamp,
            duration_hours=duration_hours,
            total_snapshots=len(self.snapshots),
            initial_memory_percent=first.memory_percent,
            final_memory_percent=last.memory_percent,
            memory_growth_percent=memory_growth,
            memory_leak_detected=memory_leak,
            initial_disk_percent=first.disk_percent,
            final_disk_percent=last.disk_percent,
            disk_growth_gb=disk_growth,
            service_uptime_percent=service_uptime,
            total_service_restarts=service_restarts,
            avg_api_response_ms=avg_api,
            max_api_response_ms=max_api,
            p95_api_response_ms=p95_api,
            total_errors=len(all_errors),
            error_rate_per_hour=error_rate,
            critical_errors=critical_errors,
            passed=passed,
            issues=issues
        )

        return report

    def print_report(self, report: StabilityReport):
        """Print formatted report"""
        print("\n" + "="*70)
        print("  STABILITY TEST REPORT")
        print("="*70)
        print(f"\nTest Period:")
        print(f"  Start:    {report.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"  End:      {report.end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"  Duration: {report.duration_hours:.1f} hours ({report.duration_hours/24:.1f} days)")
        print(f"  Snapshots: {report.total_snapshots}")

        print(f"\nMemory Analysis:")
        print(f"  Initial:  {report.initial_memory_percent:.1f}%")
        print(f"  Final:    {report.final_memory_percent:.1f}%")
        print(f"  Growth:   {report.memory_growth_percent:+.1f}%")
        if report.memory_leak_detected:
            print(f"  Status:   ❌ MEMORY LEAK DETECTED")
        else:
            print(f"  Status:   ✅ Stable")

        print(f"\nDisk Analysis:")
        print(f"  Initial:  {report.initial_disk_percent:.1f}%")
        print(f"  Final:    {report.final_disk_percent:.1f}%")
        print(f"  Growth:   {report.disk_growth_gb:+.2f} GB")

        print(f"\nService Availability:")
        for service, uptime in report.service_uptime_percent.items():
            restarts = report.total_service_restarts.get(service, 0)
            status = "✅" if uptime >= 99.0 else "❌"
            print(f"  {status} {service:25s} {uptime:6.2f}% (restarts: {restarts})")

        print(f"\nAPI Performance:")
        print(f"  Average:  {report.avg_api_response_ms:.1f} ms")
        print(f"  Maximum:  {report.max_api_response_ms:.1f} ms")
        print(f"  95th %ile: {report.p95_api_response_ms:.1f} ms")

        print(f"\nError Analysis:")
        print(f"  Total Errors: {report.total_errors}")
        print(f"  Error Rate:   {report.error_rate_per_hour:.2f} errors/hour")
        if report.critical_errors:
            print(f"  Top Errors:")
            for error in report.critical_errors[:5]:
                print(f"    - {error}")

        print(f"\nOverall Result:")
        if report.passed:
            print(f"  ✅ PASSED - System is stable")
        else:
            print(f"  ❌ FAILED - Issues detected:")
            for issue in report.issues:
                print(f"    - {issue}")

        print("="*70)

    def save_report(self, report: StabilityReport):
        """Save report to JSON file"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = self.output_dir / f"stability_report_{timestamp}.json"

        with open(filename, 'w') as f:
            json.dump(asdict(report), f, indent=2, default=str)

        print(f"\n📄 Report saved to: {filename}")

        # Also save all snapshots
        snapshots_file = self.output_dir / f"snapshots_{timestamp}.json"
        with open(snapshots_file, 'w') as f:
            json.dump(
                [asdict(s) for s in self.snapshots],
                f,
                indent=2,
                default=str
            )

        print(f"📄 Snapshots saved to: {snapshots_file}")


async def main():
    parser = argparse.ArgumentParser(description='Arasul Platform Stability Monitor')
    parser.add_argument('--duration', type=int, default=30, help='Duration in days (default: 30)')
    parser.add_argument('--interval', type=int, default=300, help='Check interval in seconds (default: 300)')
    parser.add_argument('--url', default='http://localhost', help='Base URL (default: http://localhost)')
    args = parser.parse_args()

    monitor = StabilityMonitor(
        duration_days=args.duration,
        check_interval_seconds=args.interval,
        base_url=args.url
    )

    try:
        report = await monitor.monitor_loop()
        monitor.print_report(report)
        monitor.save_report(report)

        sys.exit(0 if report.passed else 1)

    except KeyboardInterrupt:
        print("\n\nMonitoring interrupted. Generating partial report...")
        if monitor.snapshots:
            report = monitor.generate_report()
            monitor.print_report(report)
            monitor.save_report(report)
        sys.exit(1)


if __name__ == '__main__':
    asyncio.run(main())
