/**
 * Workflows Tool
 * Manages n8n workflows - list, status, activate/deactivate
 */

const BaseTool = require('./baseTool');
const axios = require('axios');

const N8N_URL = process.env.N8N_URL || 'http://n8n:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;

class WorkflowsTool extends BaseTool {
  get name() {
    return 'workflows';
  }

  get description() {
    return 'Zeigt n8n Workflows und deren Status';
  }

  get parameters() {
    return {
      action: {
        description: 'list (Standard), status, oder executions',
        required: false,
      },
      workflow: {
        description: 'Workflow-Name oder ID fuer Details',
        required: false,
      },
    };
  }

  async execute(params = {}) {
    const action = (params.action || 'list').toLowerCase();
    const workflowId = params.workflow;

    try {
      switch (action) {
        case 'list':
          return await this.listWorkflows();
        case 'status':
          return workflowId
            ? await this.getWorkflowStatus(workflowId)
            : await this.listWorkflows();
        case 'executions':
        case 'runs':
          return await this.getRecentExecutions(workflowId);
        default:
          return await this.listWorkflows();
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        return '❌ n8n ist nicht erreichbar';
      }
      return `Fehler bei Workflows: ${error.message}`;
    }
  }

  async listWorkflows() {
    const headers = this.getHeaders();
    const response = await axios.get(`${N8N_URL}/api/v1/workflows`, {
      headers,
      timeout: 10000,
    });

    const workflows = response.data.data || response.data || [];

    if (workflows.length === 0) {
      return '📋 Keine Workflows gefunden';
    }

    const lines = ['⚡ **n8n Workflows**', ''];

    for (const wf of workflows.slice(0, 15)) {
      const icon = wf.active ? '✅' : '⏸️';
      const name = wf.name || `Workflow ${wf.id}`;
      lines.push(`${icon} ${name}`);
    }

    if (workflows.length > 15) {
      lines.push(`\n... und ${workflows.length - 15} weitere`);
    }

    const active = workflows.filter((w) => w.active).length;
    lines.push('', `Aktiv: ${active}/${workflows.length}`);

    return lines.join('\n');
  }

  async getWorkflowStatus(workflowId) {
    const headers = this.getHeaders();

    // Try to find by ID or name
    const response = await axios.get(`${N8N_URL}/api/v1/workflows`, {
      headers,
      timeout: 10000,
    });

    const workflows = response.data.data || response.data || [];
    const workflow = workflows.find(
      (w) =>
        w.id === workflowId ||
        w.id === parseInt(workflowId) ||
        w.name?.toLowerCase().includes(workflowId.toLowerCase())
    );

    if (!workflow) {
      return `❌ Workflow "${workflowId}" nicht gefunden`;
    }

    const icon = workflow.active ? '✅' : '⏸️';
    const lines = [
      `${icon} **${workflow.name}**`,
      '',
      `ID: ${workflow.id}`,
      `Status: ${workflow.active ? 'Aktiv' : 'Inaktiv'}`,
      `Erstellt: ${new Date(workflow.createdAt).toLocaleDateString('de-DE')}`,
      `Aktualisiert: ${new Date(workflow.updatedAt).toLocaleDateString('de-DE')}`,
    ];

    if (workflow.tags && workflow.tags.length > 0) {
      lines.push(`Tags: ${workflow.tags.map((t) => t.name).join(', ')}`);
    }

    return lines.join('\n');
  }

  async getRecentExecutions(workflowId) {
    const headers = this.getHeaders();

    let url = `${N8N_URL}/api/v1/executions?limit=10`;
    if (workflowId) {
      url += `&workflowId=${workflowId}`;
    }

    const response = await axios.get(url, {
      headers,
      timeout: 10000,
    });

    const executions = response.data.data || response.data || [];

    if (executions.length === 0) {
      return '📋 Keine kuerzlichen Ausfuehrungen gefunden';
    }

    const lines = ['⚡ **Letzte Ausfuehrungen**', ''];

    for (const exec of executions.slice(0, 10)) {
      const icon = exec.finished
        ? exec.status === 'success' || !exec.stoppedAt
          ? '✅'
          : '❌'
        : '⏳';
      const date = new Date(exec.startedAt).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      const wfName = exec.workflowData?.name || `WF ${exec.workflowId}`;
      lines.push(`${icon} ${date} - ${wfName}`);
    }

    return lines.join('\n');
  }

  getHeaders() {
    const headers = {
      Accept: 'application/json',
    };

    if (N8N_API_KEY) {
      headers['X-N8N-API-KEY'] = N8N_API_KEY;
    }

    return headers;
  }

  async isAvailable() {
    try {
      await axios.get(`${N8N_URL}/healthz`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new WorkflowsTool();
