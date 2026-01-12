#!/usr/bin/env python3
"""
MCP Remote Bash Server
Allows Claude Code CLI to execute bash commands on the Jetson remotely.

Protocol: Server-Sent Events (SSE) based MCP server
Port: 3100
"""

import subprocess
import json
import os
import sys
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, origins=['*'])  # Allow all origins for LAN access

# Server info
SERVER_NAME = "jetson-remote-bash"
SERVER_VERSION = "1.0.0"

# Working directory
WORKSPACE = os.environ.get('WORKSPACE', '/workspace/arasul')


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'server': SERVER_NAME,
        'version': SERVER_VERSION,
        'workspace': WORKSPACE
    })


@app.route('/mcp/info', methods=['GET'])
def mcp_info():
    """MCP server info"""
    return jsonify({
        'name': SERVER_NAME,
        'version': SERVER_VERSION,
        'protocol_version': '0.1.0',
        'capabilities': {
            'tools': True,
            'resources': False,
            'prompts': False
        }
    })


@app.route('/mcp/tools', methods=['GET'])
def list_tools():
    """List available tools"""
    return jsonify({
        'tools': [
            {
                'name': 'bash',
                'description': 'Execute bash commands on the Jetson host',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'command': {
                            'type': 'string',
                            'description': 'The bash command to execute'
                        },
                        'workdir': {
                            'type': 'string',
                            'description': 'Working directory (default: /workspace/arasul)'
                        },
                        'timeout': {
                            'type': 'integer',
                            'description': 'Timeout in seconds (default: 120)'
                        }
                    },
                    'required': ['command']
                }
            },
            {
                'name': 'docker',
                'description': 'Execute docker commands on the Jetson host',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'args': {
                            'type': 'string',
                            'description': 'Docker command arguments (e.g., "ps", "logs container-name")'
                        }
                    },
                    'required': ['args']
                }
            },
            {
                'name': 'read_file',
                'description': 'Read a file from the Jetson filesystem',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'path': {
                            'type': 'string',
                            'description': 'Path to the file to read'
                        }
                    },
                    'required': ['path']
                }
            },
            {
                'name': 'write_file',
                'description': 'Write content to a file on the Jetson filesystem',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'path': {
                            'type': 'string',
                            'description': 'Path to the file to write'
                        },
                        'content': {
                            'type': 'string',
                            'description': 'Content to write to the file'
                        }
                    },
                    'required': ['path', 'content']
                }
            },
            {
                'name': 'list_files',
                'description': 'List files in a directory on the Jetson',
                'inputSchema': {
                    'type': 'object',
                    'properties': {
                        'path': {
                            'type': 'string',
                            'description': 'Directory path to list'
                        }
                    },
                    'required': ['path']
                }
            }
        ]
    })


@app.route('/mcp/tools/call', methods=['POST'])
def call_tool():
    """Execute a tool"""
    data = request.json
    tool_name = data.get('name')
    arguments = data.get('arguments', {})

    logger.info(f"Tool call: {tool_name} with args: {arguments}")

    try:
        if tool_name == 'bash':
            result = execute_bash(
                arguments.get('command', ''),
                arguments.get('workdir', WORKSPACE),
                arguments.get('timeout', 120)
            )
        elif tool_name == 'docker':
            result = execute_docker(arguments.get('args', ''))
        elif tool_name == 'read_file':
            result = read_file(arguments.get('path', ''))
        elif tool_name == 'write_file':
            result = write_file(arguments.get('path', ''), arguments.get('content', ''))
        elif tool_name == 'list_files':
            result = list_files(arguments.get('path', '.'))
        else:
            result = {'error': f'Unknown tool: {tool_name}'}

        return jsonify({
            'content': [
                {
                    'type': 'text',
                    'text': json.dumps(result, indent=2) if isinstance(result, dict) else str(result)
                }
            ]
        })

    except Exception as e:
        logger.error(f"Tool error: {e}")
        return jsonify({
            'content': [
                {
                    'type': 'text',
                    'text': f'Error: {str(e)}'
                }
            ],
            'isError': True
        }), 500


def execute_bash(command, workdir=None, timeout=120):
    """Execute a bash command"""
    if not command:
        return {'error': 'No command provided'}

    workdir = workdir or WORKSPACE

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=timeout
        )

        return {
            'stdout': result.stdout,
            'stderr': result.stderr,
            'exit_code': result.returncode,
            'workdir': workdir
        }
    except subprocess.TimeoutExpired:
        return {'error': f'Command timed out after {timeout}s'}
    except Exception as e:
        return {'error': str(e)}


def execute_docker(args):
    """Execute a docker command"""
    if not args:
        return {'error': 'No docker arguments provided'}

    return execute_bash(f'docker {args}', workdir='/workspace')


def read_file(path):
    """Read a file"""
    if not path:
        return {'error': 'No path provided'}

    # Security: Only allow reading from workspace or home
    if not (path.startswith('/workspace') or path.startswith('/home')):
        if not path.startswith('/'):
            path = os.path.join(WORKSPACE, path)

    try:
        with open(path, 'r') as f:
            content = f.read()
        return {
            'path': path,
            'content': content,
            'size': len(content)
        }
    except Exception as e:
        return {'error': str(e), 'path': path}


def write_file(path, content):
    """Write to a file"""
    if not path:
        return {'error': 'No path provided'}

    # Security: Only allow writing to workspace or home
    if not (path.startswith('/workspace') or path.startswith('/home')):
        if not path.startswith('/'):
            path = os.path.join(WORKSPACE, path)
        else:
            return {'error': 'Writing outside workspace is not allowed'}

    try:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(path), exist_ok=True)

        with open(path, 'w') as f:
            f.write(content)
        return {
            'path': path,
            'written': len(content),
            'success': True
        }
    except Exception as e:
        return {'error': str(e), 'path': path}


def list_files(path):
    """List files in a directory"""
    if not path:
        path = WORKSPACE

    if not path.startswith('/'):
        path = os.path.join(WORKSPACE, path)

    try:
        entries = []
        for entry in os.listdir(path):
            full_path = os.path.join(path, entry)
            stat = os.stat(full_path)
            entries.append({
                'name': entry,
                'type': 'directory' if os.path.isdir(full_path) else 'file',
                'size': stat.st_size,
                'modified': stat.st_mtime
            })

        return {
            'path': path,
            'entries': sorted(entries, key=lambda x: (x['type'] != 'directory', x['name']))
        }
    except Exception as e:
        return {'error': str(e), 'path': path}


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3100))
    logger.info(f"Starting MCP Remote Bash Server on port {port}")
    logger.info(f"Workspace: {WORKSPACE}")
    app.run(host='0.0.0.0', port=port, debug=False)
