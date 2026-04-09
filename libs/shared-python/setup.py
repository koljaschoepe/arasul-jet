"""
Arasul Platform - Shared Python Library
Installation script for pip-based installation
"""

from setuptools import setup, find_packages

setup(
    name='arasul-shared',
    version='1.0.0',
    description='Shared utilities for Arasul Platform Python services',
    author='Arasul Platform',
    packages=find_packages(where='.'),
    package_dir={'': '.'},
    py_modules=[
        'db_pool',
        'http_client',
        'logging_config',
        'health_check',
        'service_config'
    ],
    install_requires=[
        'psycopg2-binary>=2.9.9',
        'requests>=2.31.0',
        'urllib3>=2.0.0',
        'flask>=3.0.0',
    ],
    extras_require={
        'async': ['aiohttp>=3.9.0'],
    },
    python_requires='>=3.10',
)
