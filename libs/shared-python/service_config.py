"""
Centralized Service Configuration
All internal service URLs and configurations
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class ServiceEndpoint:
    """Configuration for a single service endpoint"""
    host: str
    port: int

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def endpoint(self, path: str) -> str:
        """Get full URL for a specific endpoint path"""
        return f"{self.url}{path}"


class ServiceConfig:
    """Centralized configuration for all platform services"""

    def __init__(self):
        # LLM Service (Ollama)
        self.llm = ServiceEndpoint(
            host=os.getenv('LLM_SERVICE_HOST', 'llm-service'),
            port=int(os.getenv('LLM_SERVICE_PORT', '11434'))
        )
        self.llm_management_port = int(os.getenv('LLM_SERVICE_MANAGEMENT_PORT', '11436'))

        # Embedding Service
        self.embedding = ServiceEndpoint(
            host=os.getenv('EMBEDDING_SERVICE_HOST', 'embedding-service'),
            port=int(os.getenv('EMBEDDING_SERVICE_PORT', '11435'))
        )

        # Metrics Collector
        self.metrics = ServiceEndpoint(
            host=os.getenv('METRICS_COLLECTOR_HOST', 'metrics-collector'),
            port=9100
        )

        # PostgreSQL
        self.postgres = ServiceEndpoint(
            host=os.getenv('POSTGRES_HOST', 'postgres-db'),
            port=int(os.getenv('POSTGRES_PORT', '5432'))
        )

        # Document Indexer
        self.document_indexer = ServiceEndpoint(
            host=os.getenv('DOCUMENT_INDEXER_HOST', 'document-indexer'),
            port=int(os.getenv('DOCUMENT_INDEXER_API_PORT', '9102'))
        )

        # Dashboard Backend
        self.dashboard_backend = ServiceEndpoint(
            host=os.getenv('DASHBOARD_BACKEND_HOST', 'dashboard-backend'),
            port=int(os.getenv('DASHBOARD_BACKEND_PORT', '3001'))
        )

        # Self-Healing Agent
        self.self_healing = ServiceEndpoint(
            host=os.getenv('SELF_HEALING_HOST', 'self-healing-agent'),
            port=int(os.getenv('SELF_HEALING_PORT', '9200'))
        )

    @property
    def llm_management_url(self) -> str:
        """Get LLM management API URL"""
        return f"http://{self.llm.host}:{self.llm_management_port}"


# Global singleton instance
services = ServiceConfig()
