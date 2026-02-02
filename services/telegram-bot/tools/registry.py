"""
ARASUL PLATFORM - Tool Registry
Factory pattern for tools
"""

import logging
from typing import Dict, List, Optional, Type

from .base import BaseTool, ToolResult, ToolError

logger = logging.getLogger('telegram-bot.tools.registry')


class ToolRegistry:
    """
    Registry for tools.

    Manages tool instances and provides lookup.
    """

    # Registered tool classes
    _tools: Dict[str, BaseTool] = {}

    @classmethod
    def register(cls, tool: BaseTool) -> None:
        """
        Register a tool instance.

        Args:
            tool: Tool instance to register
        """
        cls._tools[tool.name] = tool
        logger.debug(f"Registered tool: {tool.name}")

    @classmethod
    def get(cls, name: str) -> Optional[BaseTool]:
        """
        Get a tool by name.

        Args:
            name: Tool name

        Returns:
            Tool instance or None
        """
        return cls._tools.get(name)

    @classmethod
    def list_tools(cls) -> List[str]:
        """Get list of registered tool names."""
        return list(cls._tools.keys())

    @classmethod
    def get_all(cls) -> List[BaseTool]:
        """Get all registered tools."""
        return list(cls._tools.values())

    @classmethod
    def get_tool_descriptions(cls) -> str:
        """
        Get formatted description of all tools.

        Used for LLM system prompt.
        """
        lines = []
        for tool in cls._tools.values():
            params = ', '.join(p.name for p in tool.parameters) if tool.parameters else ''
            if params:
                lines.append(f"- {tool.name} ({params}): {tool.description}")
            else:
                lines.append(f"- {tool.name}: {tool.description}")
        return '\n'.join(lines)

    @classmethod
    def get_schemas(cls) -> List[Dict]:
        """Get JSON schemas for all tools."""
        return [tool.get_schema() for tool in cls._tools.values()]

    @classmethod
    async def execute(cls, name: str, **kwargs) -> ToolResult:
        """
        Execute a tool by name.

        Args:
            name: Tool name
            **kwargs: Tool parameters

        Returns:
            ToolResult
        """
        tool = cls.get(name)
        if not tool:
            return ToolResult(
                success=False,
                data=None,
                error=f"Unknown tool: {name}",
            )

        try:
            return await tool.execute(**kwargs)
        except Exception as e:
            logger.error(f"Tool {name} execution failed: {e}")
            return ToolResult(
                success=False,
                data=None,
                error=str(e),
            )

    @classmethod
    def reset(cls) -> None:
        """Clear all registered tools."""
        cls._tools.clear()


def get_tool(name: str) -> Optional[BaseTool]:
    """
    Convenience function to get a tool.

    Args:
        name: Tool name

    Returns:
        Tool instance or None
    """
    return ToolRegistry.get(name)


async def execute_tool(name: str, **kwargs) -> ToolResult:
    """
    Convenience function to execute a tool.

    Args:
        name: Tool name
        **kwargs: Tool parameters

    Returns:
        ToolResult
    """
    return await ToolRegistry.execute(name, **kwargs)


def register_default_tools() -> None:
    """Register all default tools."""
    from .system import StatusTool, ServicesTool, LogsTool, DiskTool
    from .n8n import WorkflowsTool

    ToolRegistry.register(StatusTool())
    ToolRegistry.register(ServicesTool())
    ToolRegistry.register(LogsTool())
    ToolRegistry.register(DiskTool())
    ToolRegistry.register(WorkflowsTool())

    logger.info(f"Registered {len(ToolRegistry.list_tools())} tools")
