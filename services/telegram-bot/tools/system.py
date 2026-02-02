"""
ARASUL PLATFORM - System Tools
Tools for system monitoring and management
"""

import logging
import asyncio
import re
from typing import List, Dict, Any

from .base import BaseTool, ToolResult, ToolParameter

logger = logging.getLogger('telegram-bot.tools.system')


async def run_command(cmd: str, timeout: float = 30.0) -> tuple:
    """
    Run a shell command asynchronously.

    Args:
        cmd: Command to run
        timeout: Timeout in seconds

    Returns:
        Tuple of (stdout, stderr, return_code)
    """
    try:
        proc = await asyncio.create_subprocess_shell(
            cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout
        )
        return (
            stdout.decode('utf-8', errors='replace'),
            stderr.decode('utf-8', errors='replace'),
            proc.returncode
        )
    except asyncio.TimeoutError:
        logger.error(f"Command timed out: {cmd}")
        return ('', f'Command timed out after {timeout}s', -1)
    except Exception as e:
        logger.error(f"Command failed: {e}")
        return ('', str(e), -1)


class StatusTool(BaseTool):
    """Tool for getting system status (CPU, RAM, GPU, Disk)."""

    name = "status"
    description = "Zeigt System-Metriken (CPU, RAM, GPU, Disk, Temperatur)"
    parameters = []

    async def execute(self, **kwargs) -> ToolResult:
        """Get system status."""
        try:
            import httpx
            from config import Config

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{Config.DASHBOARD_BACKEND_URL}/api/metrics/live"
                )

                if response.status_code == 200:
                    data = response.json()
                    return ToolResult(
                        success=True,
                        data={
                            'cpu_percent': data.get('cpu_percent', 0),
                            'ram_percent': data.get('ram_percent', 0),
                            'gpu_percent': data.get('gpu_percent', 0),
                            'disk_percent': data.get('disk_percent', 0),
                            'temperature': data.get('temperature', 0),
                        },
                        message=self._format_status(data),
                    )
                else:
                    return ToolResult(
                        success=False,
                        data=None,
                        error=f"Backend returned {response.status_code}",
                    )

        except Exception as e:
            logger.error(f"Status tool failed: {e}")
            return ToolResult(success=False, data=None, error=str(e))

    def _format_status(self, data: Dict) -> str:
        """Format status data as string."""
        return (
            f"CPU: {data.get('cpu_percent', 0):.1f}%, "
            f"RAM: {data.get('ram_percent', 0):.1f}%, "
            f"GPU: {data.get('gpu_percent', 0):.1f}%, "
            f"Disk: {data.get('disk_percent', 0):.1f}%, "
            f"Temp: {data.get('temperature', 0):.1f}°C"
        )


class ServicesTool(BaseTool):
    """Tool for listing Docker services."""

    name = "services"
    description = "Listet Docker-Container und deren Status"
    parameters = []

    async def execute(self, **kwargs) -> ToolResult:
        """Get Docker services status."""
        try:
            stdout, stderr, code = await run_command(
                "docker ps --format '{{.Names}}|{{.Status}}|{{.State}}'"
            )

            if code != 0:
                return ToolResult(
                    success=False,
                    data=None,
                    error=stderr or "Docker command failed",
                )

            services = []
            for line in stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('|')
                if len(parts) >= 3:
                    services.append({
                        'name': parts[0],
                        'status': parts[1],
                        'state': parts[2],
                    })

            return ToolResult(
                success=True,
                data=services,
                message=self._format_services(services),
            )

        except Exception as e:
            logger.error(f"Services tool failed: {e}")
            return ToolResult(success=False, data=None, error=str(e))

    def _format_services(self, services: List[Dict]) -> str:
        """Format services list as string."""
        if not services:
            return "Keine Container gefunden"

        lines = [f"{len(services)} Container:"]
        for svc in services[:10]:  # Limit output
            state_emoji = "🟢" if svc['state'] == 'running' else "🔴"
            lines.append(f"{state_emoji} {svc['name']}: {svc['status']}")

        if len(services) > 10:
            lines.append(f"... und {len(services) - 10} weitere")

        return '\n'.join(lines)


class LogsTool(BaseTool):
    """Tool for viewing service logs."""

    name = "logs"
    description = "Zeigt Logs eines Services"
    parameters = [
        ToolParameter(
            name="service",
            description="Name des Services",
            type="string",
            required=True,
        ),
        ToolParameter(
            name="lines",
            description="Anzahl der Zeilen (Standard: 20)",
            type="integer",
            required=False,
            default=20,
        ),
    ]

    async def execute(self, service: str = None, lines: int = 20, **kwargs) -> ToolResult:
        """Get service logs."""
        if not service:
            return ToolResult(
                success=False,
                data=None,
                error="Service-Name erforderlich",
            )

        # Sanitize service name
        service = re.sub(r'[^a-zA-Z0-9_-]', '', service)

        try:
            stdout, stderr, code = await run_command(
                f"docker logs --tail {min(lines, 100)} {service} 2>&1"
            )

            if code != 0 and "No such container" in (stdout + stderr):
                return ToolResult(
                    success=False,
                    data=None,
                    error=f"Container '{service}' nicht gefunden",
                )

            logs = stdout or stderr
            if len(logs) > 4000:
                logs = logs[-4000:]  # Last 4000 chars

            return ToolResult(
                success=True,
                data={'service': service, 'logs': logs},
                message=f"Logs für {service}:\n{logs}",
            )

        except Exception as e:
            logger.error(f"Logs tool failed: {e}")
            return ToolResult(success=False, data=None, error=str(e))


class DiskTool(BaseTool):
    """Tool for disk usage information."""

    name = "disk"
    description = "Zeigt Festplatten-Nutzung für alle Volumes"
    parameters = []

    async def execute(self, **kwargs) -> ToolResult:
        """Get disk usage."""
        try:
            stdout, stderr, code = await run_command("df -h --output=target,size,used,avail,pcent")

            if code != 0:
                return ToolResult(
                    success=False,
                    data=None,
                    error=stderr or "df command failed",
                )

            disks = []
            lines = stdout.strip().split('\n')[1:]  # Skip header

            for line in lines:
                parts = line.split()
                if len(parts) >= 5:
                    # Filter to relevant mounts
                    mount = parts[0]
                    if mount.startswith('/dev') or mount == '/' or '/data' in mount:
                        disks.append({
                            'mount': mount,
                            'size': parts[1],
                            'used': parts[2],
                            'available': parts[3],
                            'percent': parts[4],
                        })

            return ToolResult(
                success=True,
                data=disks,
                message=self._format_disks(disks),
            )

        except Exception as e:
            logger.error(f"Disk tool failed: {e}")
            return ToolResult(success=False, data=None, error=str(e))

    def _format_disks(self, disks: List[Dict]) -> str:
        """Format disk info as string."""
        if not disks:
            return "Keine Disk-Informationen"

        lines = []
        for disk in disks[:5]:  # Limit
            lines.append(
                f"{disk['mount']}: {disk['used']}/{disk['size']} ({disk['percent']})"
            )
        return '\n'.join(lines)
