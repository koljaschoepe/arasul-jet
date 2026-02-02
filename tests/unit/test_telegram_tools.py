"""
Unit tests for Telegram Bot Tools.

These tests are designed to run without the actual telegram-bot dependencies
installed, using mocks and import guards.
"""

import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

# Add telegram-bot service to path for imports
TELEGRAM_BOT_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'services', 'telegram-bot')
sys.path.insert(0, TELEGRAM_BOT_PATH)


class TestBaseTool:
    """Tests for BaseTool."""

    def test_tool_result_to_string_success(self):
        """Test ToolResult.to_string() for success."""
        try:
            from tools.base import ToolResult
        except ImportError:
            pytest.skip('Tools dependencies not available')

        result = ToolResult(success=True, data='test data', message='OK')
        assert result.to_string() == 'test data'

    def test_tool_result_to_string_error(self):
        """Test ToolResult.to_string() for error."""
        try:
            from tools.base import ToolResult
        except ImportError:
            pytest.skip('Tools dependencies not available')

        result = ToolResult(success=False, data=None, error='Something failed')
        assert 'Something failed' in result.to_string()

    def test_tool_result_to_string_dict(self):
        """Test ToolResult.to_string() with dict data."""
        try:
            from tools.base import ToolResult
        except ImportError:
            pytest.skip('Tools dependencies not available')

        result = ToolResult(success=True, data={'key': 'value'}, message='OK')
        assert 'key' in result.to_string()

    def test_tool_parameter(self):
        """Test ToolParameter dataclass."""
        try:
            from tools.base import ToolParameter
        except ImportError:
            pytest.skip('Tools dependencies not available')

        param = ToolParameter(
            name='service',
            description='Service name',
            type='string',
            required=True,
        )

        assert param.name == 'service'
        assert param.required is True
        assert param.default is None

    def test_tool_error(self):
        """Test ToolError exception."""
        try:
            from tools.base import ToolError
        except ImportError:
            pytest.skip('Tools dependencies not available')

        error = ToolError('Test error')
        assert str(error) == 'Test error'


class TestToolRegistry:
    """Tests for ToolRegistry."""

    def test_list_tools_empty(self):
        """Test listing tools when empty."""
        try:
            from tools.registry import ToolRegistry
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        tools = ToolRegistry.list_tools()
        assert tools == []

    def test_register_and_get(self):
        """Test registering and getting a tool."""
        try:
            from tools.registry import ToolRegistry
            from tools.system import StatusTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        tool = StatusTool()
        ToolRegistry.register(tool)

        retrieved = ToolRegistry.get('status')
        assert retrieved is not None
        assert retrieved.name == 'status'

    def test_get_unknown_tool(self):
        """Test getting unknown tool returns None."""
        try:
            from tools.registry import ToolRegistry
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        result = ToolRegistry.get('unknown')
        assert result is None

    @pytest.mark.asyncio
    async def test_execute_unknown_tool(self):
        """Test executing unknown tool returns error."""
        try:
            from tools.registry import ToolRegistry
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        result = await ToolRegistry.execute('unknown')

        assert result.success is False
        assert 'Unknown tool' in result.error

    def test_get_tool_descriptions(self):
        """Test getting tool descriptions."""
        try:
            from tools.registry import ToolRegistry
            from tools.system import StatusTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        ToolRegistry.register(StatusTool())

        descriptions = ToolRegistry.get_tool_descriptions()
        assert 'status' in descriptions

    def test_get_schemas(self):
        """Test getting tool schemas."""
        try:
            from tools.registry import ToolRegistry
            from tools.system import StatusTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        ToolRegistry.register(StatusTool())

        schemas = ToolRegistry.get_schemas()
        assert len(schemas) == 1
        assert schemas[0]['name'] == 'status'

    def test_register_default_tools(self):
        """Test registering default tools."""
        try:
            from tools.registry import ToolRegistry, register_default_tools
        except ImportError:
            pytest.skip('Tools dependencies not available')

        ToolRegistry.reset()
        register_default_tools()

        tools = ToolRegistry.list_tools()
        assert 'status' in tools
        assert 'services' in tools
        assert 'logs' in tools
        assert 'disk' in tools
        assert 'workflows' in tools


class TestSystemTools:
    """Tests for system tools."""

    def test_status_tool_schema(self):
        """Test StatusTool schema."""
        try:
            from tools.system import StatusTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = StatusTool()
        schema = tool.get_schema()

        assert schema['name'] == 'status'
        assert 'description' in schema
        assert 'parameters' in schema

    @pytest.mark.asyncio
    async def test_logs_tool_requires_service(self):
        """Test LogsTool requires service parameter."""
        try:
            from tools.system import LogsTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = LogsTool()
        result = await tool.execute()

        assert result.success is False
        assert 'erforderlich' in result.error.lower() or 'required' in result.error.lower()

    @pytest.mark.asyncio
    async def test_logs_tool_sanitizes_service_name(self):
        """Test LogsTool sanitizes service name."""
        try:
            from tools.system import LogsTool, run_command
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = LogsTool()

        # Mock run_command to capture the command
        with patch('tools.system.run_command') as mock:
            mock.return_value = ('logs output', '', 0)
            await tool.execute(service='test; rm -rf /')

            # Should have sanitized the service name - removed ; / and space
            call_args = mock.call_args[0][0]
            assert ';' not in call_args
            assert ' /' not in call_args  # Dangerous path characters removed
            # The sanitized name should be alphanumeric only
            assert 'testrm-rf' in call_args  # This is the sanitized result

    def test_disk_tool_schema(self):
        """Test DiskTool schema."""
        try:
            from tools.system import DiskTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = DiskTool()
        schema = tool.get_schema()

        assert schema['name'] == 'disk'
        assert 'description' in schema

    def test_services_tool_schema(self):
        """Test ServicesTool schema."""
        try:
            from tools.system import ServicesTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = ServicesTool()
        schema = tool.get_schema()

        assert schema['name'] == 'services'
        assert 'description' in schema


class TestN8nTools:
    """Tests for n8n tools."""

    def test_workflows_tool_schema(self):
        """Test WorkflowsTool schema."""
        try:
            from tools.n8n import WorkflowsTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = WorkflowsTool()
        schema = tool.get_schema()

        assert schema['name'] == 'workflows'
        assert 'action' in str(schema['parameters'])

    @pytest.mark.asyncio
    async def test_workflows_tool_unknown_action(self):
        """Test WorkflowsTool with unknown action."""
        try:
            from tools.n8n import WorkflowsTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = WorkflowsTool()
        result = await tool.execute(action='unknown')

        assert result.success is False
        assert 'Unbekannte Aktion' in result.error

    @pytest.mark.asyncio
    async def test_workflows_tool_activate_requires_id(self):
        """Test activate action requires workflow_id."""
        try:
            from tools.n8n import WorkflowsTool
        except ImportError:
            pytest.skip('Tools dependencies not available')

        tool = WorkflowsTool()
        result = await tool.execute(action='activate')  # No workflow_id

        assert result.success is False


class TestRunCommand:
    """Tests for run_command helper."""

    @pytest.mark.asyncio
    async def test_run_command_success(self):
        """Test successful command execution."""
        try:
            from tools.system import run_command
        except ImportError:
            pytest.skip('Tools dependencies not available')

        stdout, stderr, code = await run_command('echo hello')
        assert 'hello' in stdout
        assert code == 0

    @pytest.mark.asyncio
    async def test_run_command_failure(self):
        """Test failed command execution."""
        try:
            from tools.system import run_command
        except ImportError:
            pytest.skip('Tools dependencies not available')

        stdout, stderr, code = await run_command('exit 1')
        assert code == 1

    @pytest.mark.asyncio
    async def test_run_command_timeout(self):
        """Test command timeout."""
        try:
            from tools.system import run_command
        except ImportError:
            pytest.skip('Tools dependencies not available')

        stdout, stderr, code = await run_command('sleep 10', timeout=0.1)
        assert code == -1
        assert 'timed out' in stderr.lower()
