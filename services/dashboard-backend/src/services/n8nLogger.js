/**
 * n8n Workflow Execution Logger
 *
 * Logs n8n workflow executions to PostgreSQL workflow_activity table.
 * Provides integration endpoint for n8n workflows to report execution status.
 */

// BUG-004 FIX: Use centralized database connection pool instead of creating a separate pool
const db = require('../database');

class N8nLogger {
  constructor() {
    // BUG-004 FIX: No longer creating a separate pool
    // Using centralized db.query() method instead
  }

  /**
   * Log workflow execution to database
   * @param {Object} execution - Workflow execution data
   * @param {string} execution.workflow_name - Name of the workflow
   * @param {string} execution.execution_id - n8n execution ID (optional)
   * @param {string} execution.status - Execution status (success/error/running)
   * @param {number} execution.duration_ms - Execution duration in milliseconds
   * @param {string} execution.error - Error message if failed (optional)
   * @returns {Promise<Object>} Inserted record
   */
  async logExecution(execution) {
    const { workflow_name, execution_id, status, duration_ms, error } = execution;

    if (!workflow_name) {
      throw new Error('workflow_name is required');
    }

    if (!status || !['success', 'error', 'running', 'waiting'].includes(status)) {
      throw new Error('status must be one of: success, error, running, waiting');
    }

    const query = `
      INSERT INTO workflow_activity (
        workflow_name,
        execution_id,
        status,
        duration_ms,
        error,
        timestamp
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;

    const values = [
      workflow_name,
      execution_id || null,
      status,
      duration_ms || null,
      error || null,
    ];

    try {
      // BUG-004 FIX: Use centralized db.query() instead of this.pool.query()
      const result = await db.query(query, values);
      return result.rows[0];
    } catch (err) {
      console.error('Failed to log workflow execution:', err);
      throw err;
    }
  }

  /**
   * Get workflow execution history
   * @param {Object} options - Query options
   * @param {string} options.workflow_name - Filter by workflow name (optional)
   * @param {string} options.status - Filter by status (optional)
   * @param {number} options.limit - Number of records to return (default: 100)
   * @param {number} options.offset - Offset for pagination (default: 0)
   * @returns {Promise<Array>} Workflow execution records
   */
  async getExecutionHistory(options = {}) {
    const { workflow_name, status, limit = 100, offset = 0 } = options;

    let query = `
      SELECT
        id,
        workflow_name,
        execution_id,
        status,
        duration_ms,
        error,
        timestamp
      FROM workflow_activity
      WHERE 1=1
    `;

    const values = [];
    let paramIndex = 1;

    if (workflow_name) {
      query += ` AND workflow_name = $${paramIndex}`;
      values.push(workflow_name);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    try {
      // BUG-004 FIX: Use centralized db.query()
      const result = await db.query(query, values);
      return result.rows;
    } catch (err) {
      console.error('Failed to get execution history:', err);
      throw err;
    }
  }

  /**
   * Get workflow statistics
   * @param {string} workflow_name - Workflow name (optional, if not provided returns stats for all workflows)
   * @param {string} timeRange - Time range (1h, 24h, 7d, 30d)
   * @returns {Promise<Object>} Workflow statistics
   */
  async getWorkflowStats(workflow_name = null, timeRange = '24h') {
    const timeRangeMap = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
      '30d': '30 days',
    };

    // SEC-001 FIX: Whitelist validation to prevent SQL injection
    const interval = timeRangeMap[timeRange];
    if (!interval) {
      throw new Error(`Invalid time range. Must be one of: ${Object.keys(timeRangeMap).join(', ')}`);
    }

    let query = `
      SELECT
        COUNT(*) as total_executions,
        COUNT(*) FILTER (WHERE status = 'success') as successful_executions,
        COUNT(*) FILTER (WHERE status = 'error') as failed_executions,
        AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration_ms,
        MIN(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as min_duration_ms,
        MAX(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as max_duration_ms
      FROM workflow_activity
      WHERE timestamp >= NOW() - INTERVAL '${interval}'
    `;

    const values = [];

    if (workflow_name) {
      query += ` AND workflow_name = $1`;
      values.push(workflow_name);
    }

    try {
      // BUG-004 FIX: Use centralized db.query()
      const result = await db.query(query, values);
      const stats = result.rows[0];

      return {
        workflow_name: workflow_name || 'all',
        time_range: timeRange,
        total_executions: parseInt(stats.total_executions || 0),
        successful_executions: parseInt(stats.successful_executions || 0),
        failed_executions: parseInt(stats.failed_executions || 0),
        success_rate: stats.total_executions > 0
          ? ((stats.successful_executions / stats.total_executions) * 100).toFixed(2)
          : 0,
        avg_duration_ms: stats.avg_duration_ms ? Math.round(stats.avg_duration_ms) : null,
        min_duration_ms: stats.min_duration_ms ? Math.round(stats.min_duration_ms) : null,
        max_duration_ms: stats.max_duration_ms ? Math.round(stats.max_duration_ms) : null,
      };
    } catch (err) {
      console.error('Failed to get workflow stats:', err);
      throw err;
    }
  }

  /**
   * Get active workflows (last execution within 24h)
   * @returns {Promise<Array>} List of active workflows with stats
   */
  async getActiveWorkflows() {
    const query = `
      SELECT
        workflow_name,
        COUNT(*) as execution_count,
        MAX(timestamp) as last_execution,
        COUNT(*) FILTER (WHERE status = 'success') as successful,
        COUNT(*) FILTER (WHERE status = 'error') as failed,
        AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) as avg_duration_ms
      FROM workflow_activity
      WHERE timestamp >= NOW() - INTERVAL '24 hours'
      GROUP BY workflow_name
      ORDER BY last_execution DESC
    `;

    try {
      // BUG-004 FIX: Use centralized db.query()
      const result = await db.query(query);
      return result.rows.map(row => ({
        workflow_name: row.workflow_name,
        execution_count: parseInt(row.execution_count),
        last_execution: row.last_execution,
        successful: parseInt(row.successful || 0),
        failed: parseInt(row.failed || 0),
        success_rate: row.execution_count > 0
          ? ((row.successful / row.execution_count) * 100).toFixed(2)
          : 0,
        avg_duration_ms: row.avg_duration_ms ? Math.round(row.avg_duration_ms) : null,
      }));
    } catch (err) {
      console.error('Failed to get active workflows:', err);
      throw err;
    }
  }

  /**
   * Delete old workflow execution records (retention policy)
   * @param {number} daysToKeep - Number of days to keep (default: 7)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOldRecords(daysToKeep = 7) {
    // SEC-001 FIX: Validate daysToKeep is a positive integer to prevent SQL injection
    const days = parseInt(daysToKeep, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      throw new Error('daysToKeep must be a positive integer between 1 and 365');
    }

    const query = `
      DELETE FROM workflow_activity
      WHERE timestamp < NOW() - INTERVAL '${days} days'
      RETURNING id
    `;

    try {
      // BUG-004 FIX: Use centralized db.query()
      const result = await db.query(query);
      const deletedCount = result.rowCount;
      console.log(`Cleaned up ${deletedCount} old workflow execution records (older than ${days} days)`);
      return deletedCount;
    } catch (err) {
      console.error('Failed to cleanup old records:', err);
      throw err;
    }
  }

  /**
   * BUG-004 FIX: No longer need close() method since we use centralized pool
   * Close method removed as pool is managed centrally by database.js
   */
}

module.exports = new N8nLogger();
