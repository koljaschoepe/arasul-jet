"""
Utility functions for command handlers
Docker, system metrics, and formatting helpers
"""

import asyncio
import logging
import re
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger('telegram-bot.commands')


async def run_command(cmd: str, timeout: float = 30.0) -> Tuple[str, str, int]:
    """
    Run a shell command asynchronously.
    Returns (stdout, stderr, returncode)
    """
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return (
            stdout.decode('utf-8', errors='replace'),
            stderr.decode('utf-8', errors='replace'),
            proc.returncode or 0
        )
    except asyncio.TimeoutError:
        return '', 'Command timed out', 1
    except Exception as e:
        return '', str(e), 1


async def get_docker_services() -> List[Dict[str, str]]:
    """
    Get status of all Docker services.
    Returns list of dicts with name, status, state, health.
    """
    cmd = 'docker ps --format "{{.Names}}|{{.Status}}|{{.State}}" --filter "label=com.docker.compose.project" 2>/dev/null'
    stdout, stderr, rc = await run_command(cmd)

    if rc != 0 or not stdout.strip():
        # Try alternative without filter
        cmd = 'docker ps --format "{{.Names}}|{{.Status}}|{{.State}}" 2>/dev/null'
        stdout, stderr, rc = await run_command(cmd)

    if not stdout.strip():
        return []

    services = []
    for line in stdout.strip().split('\n'):
        if not line.strip():
            continue
        parts = line.split('|')
        if len(parts) >= 3:
            name, status, state = parts[0], parts[1], parts[2]
            # Extract health from status
            health_match = re.search(r'\((healthy|unhealthy|health: starting)\)', status, re.I)
            health = health_match.group(1) if health_match else 'N/A'
            services.append({
                'name': name.strip(),
                'status': status.strip(),
                'state': state.strip(),
                'health': health
            })

    return services


async def get_service_logs(service_name: str, lines: int = 50) -> str:
    """
    Get last N log lines for a Docker service.
    """
    # Sanitize service name
    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '', service_name)
    if not safe_name:
        return 'Invalid service name'

    # Try direct container name first
    cmd = f'docker logs --tail {lines} {safe_name} 2>&1'
    stdout, stderr, rc = await run_command(cmd, timeout=15.0)

    if rc == 0 and stdout.strip():
        return stdout.strip()

    # Try with docker compose
    cmd = f'docker compose logs --tail {lines} {safe_name} 2>&1'
    stdout, stderr, rc = await run_command(cmd, timeout=15.0)

    if stdout.strip():
        return stdout.strip()

    return f'No logs found for service "{safe_name}"'


async def get_service_names() -> List[str]:
    """Get list of running Docker service names."""
    services = await get_docker_services()
    return [s['name'] for s in services]


async def get_disk_usage() -> List[Dict[str, str]]:
    """
    Get disk usage for all filesystems.
    """
    cmd = 'df -h --output=target,size,used,avail,pcent -x tmpfs -x devtmpfs -x squashfs 2>/dev/null | tail -n +2'
    stdout, stderr, rc = await run_command(cmd)

    if not stdout.strip():
        return []

    disks = []
    for line in stdout.strip().split('\n'):
        parts = line.split()
        if len(parts) >= 5:
            disks.append({
                'mount': parts[0],
                'size': parts[1],
                'used': parts[2],
                'avail': parts[3],
                'percent': int(parts[4].rstrip('%')) if parts[4].rstrip('%').isdigit() else 0
            })

    return disks


async def get_system_metrics() -> Dict:
    """
    Get CPU, RAM, and GPU metrics.
    """
    metrics = {'cpu': 0, 'ram_percent': 0, 'ram_used': '0', 'ram_total': '0', 'gpu_temp': None}

    # CPU usage
    cmd = "grep 'cpu ' /proc/stat"
    stdout, _, _ = await run_command(cmd)
    if stdout:
        # Simple CPU calculation (not real-time, but gives indication)
        parts = stdout.split()
        if len(parts) >= 5:
            idle = int(parts[4])
            total = sum(int(p) for p in parts[1:8] if p.isdigit())
            if total > 0:
                metrics['cpu'] = round(100 * (1 - idle / total))

    # RAM usage
    cmd = "cat /proc/meminfo"
    stdout, _, _ = await run_command(cmd)
    if stdout:
        meminfo = {}
        for line in stdout.split('\n'):
            if ':' in line:
                key, val = line.split(':')
                val_parts = val.strip().split()
                if val_parts:
                    meminfo[key.strip()] = int(val_parts[0])

        total = meminfo.get('MemTotal', 1)
        free = meminfo.get('MemFree', 0)
        buffers = meminfo.get('Buffers', 0)
        cached = meminfo.get('Cached', 0)
        used = total - free - buffers - cached

        metrics['ram_percent'] = round(100 * used / total)
        metrics['ram_used'] = f"{used // 1024}MB"
        metrics['ram_total'] = f"{total // 1024}MB"

        if total > 4 * 1024 * 1024:  # > 4GB
            metrics['ram_used'] = f"{used / 1024 / 1024:.1f}GB"
            metrics['ram_total'] = f"{total / 1024 / 1024:.1f}GB"

    # GPU temperature (try nvidia-smi, then Jetson thermal zone)
    cmd = "nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null"
    stdout, _, rc = await run_command(cmd, timeout=5.0)
    if rc == 0 and stdout.strip().isdigit():
        metrics['gpu_temp'] = int(stdout.strip())
    else:
        # Try Jetson thermal zone
        cmd = "cat /sys/devices/virtual/thermal/thermal_zone0/temp 2>/dev/null"
        stdout, _, rc = await run_command(cmd, timeout=2.0)
        if rc == 0 and stdout.strip().isdigit():
            metrics['gpu_temp'] = int(stdout.strip()) // 1000

    return metrics


def progress_bar(percent: int, length: int = 10) -> str:
    """Create ASCII progress bar."""
    filled = round((percent / 100) * length)
    empty = length - filled
    return '\u2588' * filled + '\u2591' * empty


def get_status_emoji(state: str, health: str) -> str:
    """Get emoji for service status."""
    if state == 'running' and health == 'healthy':
        return '\u2705'  # Green check
    if state == 'running' and health == 'unhealthy':
        return '\u26A0\uFE0F'  # Warning
    if state == 'running':
        return '\u25B6\uFE0F'  # Play
    if state == 'restarting':
        return '\u267B\uFE0F'  # Recycle
    if state == 'exited':
        return '\u274C'  # Red X
    return '\u2753'  # Question


def escape_markdown(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2."""
    if not text:
        return ''
    # Escape all MarkdownV2 special chars
    return re.sub(r'([_*\[\]()~`>#+\-=|{}.!\\])', r'\\\1', text)


def truncate_text(text: str, max_length: int = 4000) -> str:
    """Truncate text to max length, keeping from end."""
    if len(text) <= max_length:
        return text
    return '...\n' + text[-(max_length - 4):]
