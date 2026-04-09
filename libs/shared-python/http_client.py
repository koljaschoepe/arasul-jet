"""
HTTP Client with Retry and Timeout
Standardized HTTP client for service-to-service communication
"""

import os
import time
import logging
from typing import Any, Dict, Optional, Union
from dataclasses import dataclass

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class HttpResponse:
    """Standardized HTTP response wrapper"""
    success: bool
    status_code: Optional[int]
    data: Optional[Any]
    error: Optional[str]
    elapsed_ms: float


class HttpClient:
    """
    HTTP client with automatic retry, timeout, and error handling.

    Usage:
        client = HttpClient(timeout=30, retries=3)
        response = client.get("http://service:8080/api/data")
        if response.success:
            print(response.data)
    """

    def __init__(
        self,
        timeout: float = 30.0,
        retries: int = 3,
        backoff_factor: float = 0.5,
        status_forcelist: tuple = (500, 502, 503, 504),
        default_headers: Optional[Dict[str, str]] = None
    ):
        """
        Initialize HTTP client.

        Args:
            timeout: Request timeout in seconds
            retries: Number of retry attempts for failed requests
            backoff_factor: Exponential backoff factor
            status_forcelist: HTTP status codes to retry on
            default_headers: Headers to include in all requests
        """
        self.timeout = timeout
        self.default_headers = default_headers or {}

        # Configure session with retry logic
        self.session = requests.Session()

        retry_strategy = Retry(
            total=retries,
            backoff_factor=backoff_factor,
            status_forcelist=status_forcelist,
            allowed_methods=["HEAD", "GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def _make_request(
        self,
        method: str,
        url: str,
        **kwargs
    ) -> HttpResponse:
        """Make HTTP request with standardized error handling"""
        start_time = time.time()

        # Merge default headers
        headers = {**self.default_headers, **kwargs.pop('headers', {})}

        # Set default timeout
        kwargs.setdefault('timeout', self.timeout)

        try:
            response = self.session.request(
                method=method,
                url=url,
                headers=headers,
                **kwargs
            )

            elapsed_ms = (time.time() - start_time) * 1000

            # Try to parse JSON, fall back to text
            try:
                data = response.json()
            except ValueError:
                data = response.text

            return HttpResponse(
                success=response.ok,
                status_code=response.status_code,
                data=data,
                error=None if response.ok else f"HTTP {response.status_code}",
                elapsed_ms=elapsed_ms
            )

        except requests.exceptions.Timeout:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.warning(f"Request timeout after {elapsed_ms:.0f}ms: {method} {url}")
            return HttpResponse(
                success=False,
                status_code=None,
                data=None,
                error=f"Timeout after {self.timeout}s",
                elapsed_ms=elapsed_ms
            )

        except requests.exceptions.ConnectionError as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.warning(f"Connection error: {method} {url} - {e}")
            return HttpResponse(
                success=False,
                status_code=None,
                data=None,
                error=f"Connection error: {str(e)}",
                elapsed_ms=elapsed_ms
            )

        except Exception as e:
            elapsed_ms = (time.time() - start_time) * 1000
            logger.error(f"Request error: {method} {url} - {e}")
            return HttpResponse(
                success=False,
                status_code=None,
                data=None,
                error=str(e),
                elapsed_ms=elapsed_ms
            )

    def get(self, url: str, **kwargs) -> HttpResponse:
        """HTTP GET request"""
        return self._make_request('GET', url, **kwargs)

    def post(self, url: str, **kwargs) -> HttpResponse:
        """HTTP POST request"""
        return self._make_request('POST', url, **kwargs)

    def put(self, url: str, **kwargs) -> HttpResponse:
        """HTTP PUT request"""
        return self._make_request('PUT', url, **kwargs)

    def delete(self, url: str, **kwargs) -> HttpResponse:
        """HTTP DELETE request"""
        return self._make_request('DELETE', url, **kwargs)

    def patch(self, url: str, **kwargs) -> HttpResponse:
        """HTTP PATCH request"""
        return self._make_request('PATCH', url, **kwargs)

    def close(self):
        """Close the session"""
        self.session.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


class ServiceClient(HttpClient):
    """
    HTTP client for a specific service endpoint.

    Usage:
        llm_client = ServiceClient("http://llm-service:11434")
        response = llm_client.post("/api/chat", json={"model": "qwen3:14b-q8", ...})
    """

    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        retries: int = 3,
        **kwargs
    ):
        """
        Initialize service client.

        Args:
            base_url: Base URL of the service (e.g., "http://llm-service:11434")
            timeout: Request timeout in seconds
            retries: Number of retry attempts
        """
        super().__init__(timeout=timeout, retries=retries, **kwargs)
        self.base_url = base_url.rstrip('/')

    def _make_request(self, method: str, path: str, **kwargs) -> HttpResponse:
        """Make request to service endpoint"""
        url = f"{self.base_url}{path}" if path.startswith('/') else f"{self.base_url}/{path}"
        return super()._make_request(method, url, **kwargs)

    def health_check(self, path: str = "/health") -> bool:
        """
        Check if service is healthy.

        Args:
            path: Health check endpoint path

        Returns:
            True if service responds with 2xx status
        """
        response = self.get(path, timeout=5.0)
        return response.success


# Pre-configured clients for common services
def create_llm_client(timeout: float = 120.0) -> ServiceClient:
    """Create client for LLM service"""
    from .service_config import services
    return ServiceClient(services.llm.url, timeout=timeout)


def create_embedding_client(timeout: float = 60.0) -> ServiceClient:
    """Create client for embedding service"""
    from .service_config import services
    return ServiceClient(services.embedding.url, timeout=timeout)


def create_metrics_client(timeout: float = 5.0) -> ServiceClient:
    """Create client for metrics collector"""
    from .service_config import services
    return ServiceClient(services.metrics.url, timeout=timeout)


def create_qdrant_client(timeout: float = 30.0) -> ServiceClient:
    """Create client for Qdrant"""
    from .service_config import services
    return ServiceClient(services.qdrant.url, timeout=timeout)
