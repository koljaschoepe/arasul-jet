"""
Telegram Bot Command Handlers
All predefined bot commands for Arasul Platform
"""

from .status import cmd_status
from .services import cmd_services
from .logs import cmd_logs
from .workflows import cmd_workflows
from .disk import cmd_disk
from .help import cmd_help
from .llm import cmd_new, cmd_model, cmd_context
from .apikey import cmd_apikey

__all__ = [
    # System commands
    'cmd_status',
    'cmd_services',
    'cmd_logs',
    'cmd_workflows',
    'cmd_disk',
    'cmd_help',
    # LLM commands
    'cmd_new',
    'cmd_model',
    'cmd_context',
    # Security commands
    'cmd_apikey',
]
