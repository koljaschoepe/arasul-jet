"""
ARASUL PLATFORM - Base Tool
Abstract base class for all tools
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
import logging

logger = logging.getLogger('telegram-bot.tools')


class ToolError(Exception):
    """Base exception for tool errors."""
    pass


@dataclass
class ToolResult:
    """Result from tool execution."""
    success: bool
    data: Any
    message: str = ""
    error: Optional[str] = None

    def to_string(self) -> str:
        """Convert result to string for LLM context."""
        if not self.success:
            return f"Error: {self.error or self.message}"
        if isinstance(self.data, str):
            return self.data
        return str(self.data)


@dataclass
class ToolParameter:
    """Parameter definition for a tool."""
    name: str
    description: str
    type: str = "string"  # string, integer, boolean
    required: bool = False
    default: Any = None


class BaseTool(ABC):
    """
    Abstract base class for tools.

    Tools are callable operations that can be invoked by the LLM
    or directly by commands.
    """

    # Tool metadata
    name: str = "base_tool"
    description: str = "Base tool - override this"
    parameters: List[ToolParameter] = field(default_factory=list)

    def __init__(self):
        self.logger = logging.getLogger(f'telegram-bot.tools.{self.name}')

    @abstractmethod
    async def execute(self, **kwargs) -> ToolResult:
        """
        Execute the tool with given parameters.

        Args:
            **kwargs: Tool-specific parameters

        Returns:
            ToolResult with success status and data
        """
        pass

    def get_schema(self) -> Dict:
        """
        Get JSON schema for tool parameters.

        Used for LLM tool-calling.
        """
        properties = {}
        required = []

        for param in self.parameters:
            properties[param.name] = {
                "type": param.type,
                "description": param.description,
            }
            if param.default is not None:
                properties[param.name]["default"] = param.default
            if param.required:
                required.append(param.name)

        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            }
        }

    def __repr__(self) -> str:
        return f"<Tool: {self.name}>"
