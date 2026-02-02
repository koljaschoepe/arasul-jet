"""
ARASUL PLATFORM - n8n Tools
Tools for n8n workflow management
"""

import logging
import os
from typing import List, Dict, Any

import httpx

from .base import BaseTool, ToolResult, ToolParameter

logger = logging.getLogger('telegram-bot.tools.n8n')

N8N_API_URL = os.getenv('N8N_API_URL', 'http://n8n:5678')
N8N_API_KEY = os.getenv('N8N_API_KEY', '')


class WorkflowsTool(BaseTool):
    """Tool for listing and managing n8n workflows."""

    name = "workflows"
    description = "Listet n8n Workflows und deren Status"
    parameters = [
        ToolParameter(
            name="action",
            description="Aktion: list, activate, deactivate",
            type="string",
            required=False,
            default="list",
        ),
        ToolParameter(
            name="workflow_id",
            description="Workflow-ID (für activate/deactivate)",
            type="string",
            required=False,
        ),
    ]

    async def execute(
        self,
        action: str = "list",
        workflow_id: str = None,
        **kwargs
    ) -> ToolResult:
        """Execute workflow action."""
        if action == "list":
            return await self._list_workflows()
        elif action == "activate" and workflow_id:
            return await self._toggle_workflow(workflow_id, active=True)
        elif action == "deactivate" and workflow_id:
            return await self._toggle_workflow(workflow_id, active=False)
        else:
            return ToolResult(
                success=False,
                data=None,
                error="Unbekannte Aktion. Verfügbar: list, activate, deactivate",
            )

    async def _list_workflows(self) -> ToolResult:
        """List all workflows."""
        try:
            headers = {}
            if N8N_API_KEY:
                headers['X-N8N-API-KEY'] = N8N_API_KEY

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{N8N_API_URL}/api/v1/workflows",
                    headers=headers,
                )

                if response.status_code == 200:
                    data = response.json()
                    workflows = data.get('data', [])

                    result = []
                    for wf in workflows:
                        result.append({
                            'id': wf.get('id'),
                            'name': wf.get('name'),
                            'active': wf.get('active', False),
                        })

                    return ToolResult(
                        success=True,
                        data=result,
                        message=self._format_workflows(result),
                    )

                elif response.status_code == 401:
                    return ToolResult(
                        success=False,
                        data=None,
                        error="n8n API-Authentifizierung fehlgeschlagen",
                    )
                else:
                    return ToolResult(
                        success=False,
                        data=None,
                        error=f"n8n API returned {response.status_code}",
                    )

        except httpx.ConnectError:
            return ToolResult(
                success=False,
                data=None,
                error="Kann n8n nicht erreichen",
            )
        except Exception as e:
            logger.error(f"Workflows tool failed: {e}")
            return ToolResult(success=False, data=None, error=str(e))

    async def _toggle_workflow(self, workflow_id: str, active: bool) -> ToolResult:
        """Activate or deactivate a workflow."""
        try:
            headers = {'Content-Type': 'application/json'}
            if N8N_API_KEY:
                headers['X-N8N-API-KEY'] = N8N_API_KEY

            action = "activate" if active else "deactivate"

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{N8N_API_URL}/api/v1/workflows/{workflow_id}/{action}",
                    headers=headers,
                )

                if response.status_code in (200, 201):
                    status = "aktiviert" if active else "deaktiviert"
                    return ToolResult(
                        success=True,
                        data={'workflow_id': workflow_id, 'active': active},
                        message=f"Workflow {workflow_id} wurde {status}",
                    )
                elif response.status_code == 404:
                    return ToolResult(
                        success=False,
                        data=None,
                        error=f"Workflow {workflow_id} nicht gefunden",
                    )
                else:
                    return ToolResult(
                        success=False,
                        data=None,
                        error=f"Fehler: {response.status_code}",
                    )

        except Exception as e:
            logger.error(f"Workflow toggle failed: {e}")
            return ToolResult(success=False, data=None, error=str(e))

    def _format_workflows(self, workflows: List[Dict]) -> str:
        """Format workflows list as string."""
        if not workflows:
            return "Keine Workflows gefunden"

        lines = [f"{len(workflows)} Workflows:"]
        for wf in workflows[:10]:
            status = "🟢" if wf['active'] else "⚪"
            lines.append(f"{status} {wf['name']} (ID: {wf['id']})")

        if len(workflows) > 10:
            lines.append(f"... und {len(workflows) - 10} weitere")

        return '\n'.join(lines)
