#!/usr/bin/env python3
"""
ARASUL PLATFORM - GPU Recovery Module
Advanced GPU error handling and recovery for Self-Healing Engine
"""

import os
import logging
import subprocess
import time
import requests
from typing import Optional, Tuple, Dict
from enum import Enum

logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('gpu-recovery')


class GPURecoveryAction(Enum):
    """GPU Recovery Actions"""
    NONE = "none"
    CLEAR_CACHE = "clear_cache"
    RESET_SESSION = "reset_session"
    THROTTLE = "throttle"
    RESET_GPU = "reset_gpu"
    RESTART_LLM = "restart_llm"
    STOP_LLM = "stop_llm"


class GPURecovery:
    """
    GPU Recovery and Error Handling

    Provides advanced GPU error detection and recovery mechanisms
    including CUDA OOM handling, GPU hang detection, and thermal management.
    """

    def __init__(self, docker_client=None):
        self.docker_client = docker_client
        self.metrics_url = f"http://{os.getenv('METRICS_COLLECTOR_HOST', 'metrics-collector')}:9100"
        self.last_gpu_stats = None

        # Thresholds (matching GPU Monitor)
        self.TEMP_WARNING = 83.0
        self.TEMP_CRITICAL = 85.0
        self.TEMP_SHUTDOWN = 90.0
        self.MEMORY_WARNING_MB = 36 * 1024
        self.MEMORY_CRITICAL_MB = 38 * 1024
        self.MEMORY_MAX_MB = 40 * 1024

    def get_gpu_stats(self) -> Optional[Dict]:
        """Fetch current GPU stats from metrics collector"""
        try:
            response = requests.get(f"{self.metrics_url}/api/gpu", timeout=5)
            if response.status_code == 200:
                data = response.json()
                if data.get('available'):
                    self.last_gpu_stats = data.get('gpu')
                    return self.last_gpu_stats
            return None
        except Exception as e:
            logger.error(f"Failed to get GPU stats: {e}")
            return None

    def detect_gpu_error(self) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Detect GPU errors

        Returns:
            Tuple of (has_error, error_type, error_message)
        """
        stats = self.get_gpu_stats()

        if not stats:
            return False, None, "GPU stats unavailable"

        # Check error field from GPU Monitor
        if stats.get('error') and stats['error'] != 'none':
            return True, stats['error'], stats.get('error_message', 'Unknown GPU error')

        # Additional checks
        health = stats.get('health', 'unknown')
        if health in ['critical', 'error']:
            return True, 'critical_health', f"GPU health: {health}"

        return False, None, None

    def recommend_recovery_action(self, error_type: Optional[str]) -> GPURecoveryAction:
        """Recommend recovery action based on error type"""
        if not error_type:
            return GPURecoveryAction.NONE

        recommendations = {
            'out_of_memory': GPURecoveryAction.RESTART_LLM,
            'gpu_hang': GPURecoveryAction.RESET_GPU,
            'thermal_throttling': GPURecoveryAction.THROTTLE,
            'critical_health': GPURecoveryAction.RESTART_LLM,
            'unknown_error': GPURecoveryAction.RESTART_LLM
        }

        return recommendations.get(error_type, GPURecoveryAction.RESTART_LLM)

    def check_memory_limit(self) -> Tuple[bool, float]:
        """
        Check if GPU memory exceeds limits

        Returns:
            Tuple of (exceeded, memory_used_mb)
        """
        stats = self.get_gpu_stats()

        if not stats:
            return False, 0.0

        memory_used = stats.get('memory', {}).get('used_mb', 0)

        if memory_used >= self.MEMORY_MAX_MB:
            logger.critical(f"GPU memory exceeded absolute limit: {memory_used}MB >= {self.MEMORY_MAX_MB}MB")
            return True, memory_used
        elif memory_used >= self.MEMORY_CRITICAL_MB:
            logger.warning(f"GPU memory critical: {memory_used}MB >= {self.MEMORY_CRITICAL_MB}MB")
            return True, memory_used
        elif memory_used >= self.MEMORY_WARNING_MB:
            logger.info(f"GPU memory warning: {memory_used}MB >= {self.MEMORY_WARNING_MB}MB")

        return False, memory_used

    def check_temperature(self) -> Tuple[bool, float, str]:
        """
        Check GPU temperature

        Returns:
            Tuple of (needs_action, temperature, severity)
        """
        stats = self.get_gpu_stats()

        if not stats:
            return False, 0.0, "unknown"

        temp = stats.get('temperature', 0.0)

        if temp >= self.TEMP_SHUTDOWN:
            return True, temp, "shutdown"
        elif temp >= self.TEMP_CRITICAL:
            return True, temp, "critical"
        elif temp >= self.TEMP_WARNING:
            return True, temp, "warning"

        return False, temp, "normal"

    def clear_llm_cache(self) -> bool:
        """Clear LLM service cache"""
        try:
            # Call Ollama API to unload all models (frees VRAM)
            llm_host = os.getenv('LLM_SERVICE_HOST', 'llm-service')
            llm_port = os.getenv('LLM_SERVICE_PORT', '11434')

            logger.info("Clearing LLM cache by unloading models...")

            # Get loaded models
            response = requests.get(f"http://{llm_host}:{llm_port}/api/tags", timeout=5)
            if response.status_code != 200:
                logger.warning("Failed to get loaded models")
                return False

            models = response.json().get('models', [])

            # Unload each model
            for model in models:
                model_name = model.get('name')
                if model_name:
                    try:
                        requests.post(
                            f"http://{llm_host}:{llm_port}/api/generate",
                            json={"model": model_name, "keep_alive": 0},
                            timeout=10
                        )
                        logger.info(f"Unloaded model: {model_name}")
                    except Exception as e:
                        logger.warning(f"Failed to unload model {model_name}: {e}")

            # Wait for VRAM to be freed
            time.sleep(2)

            logger.info("LLM cache cleared successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to clear LLM cache: {e}")
            return False

    def reset_gpu_session(self) -> bool:
        """Reset GPU session (restart LLM service)"""
        if not self.docker_client:
            logger.error("Docker client not available for GPU session reset")
            return False

        try:
            container = self.docker_client.containers.get('llm-service')
            logger.info("Restarting LLM service to reset GPU session...")
            container.restart(timeout=10)
            logger.info("LLM service restarted successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to reset GPU session: {e}")
            return False

    def throttle_gpu(self) -> bool:
        """Throttle GPU clocks to reduce temperature"""
        try:
            logger.info("Throttling GPU to reduce temperature...")

            # Set power limit to 80% (Jetson-compatible)
            result = subprocess.run(
                ['nvidia-smi', '--power-limit=80'],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0:
                logger.info("GPU throttled successfully (power limit: 80%)")
                return True
            else:
                logger.warning(f"GPU throttling partially failed: {result.stderr}")
                # Try alternative method
                return self._throttle_gpu_jetson()

        except Exception as e:
            logger.error(f"Failed to throttle GPU: {e}")
            return self._throttle_gpu_jetson()

    def _throttle_gpu_jetson(self) -> bool:
        """Jetson-specific GPU throttling"""
        try:
            # Use jetson_clocks to reduce GPU frequency
            result = subprocess.run(
                ['jetson_clocks', '--fan'],
                capture_output=True,
                text=True,
                timeout=5
            )

            if result.returncode == 0:
                logger.info("Jetson GPU throttled via jetson_clocks")
                return True
            else:
                logger.warning("Jetson GPU throttling failed - this is expected on non-Jetson hardware")
                return False

        except FileNotFoundError:
            logger.info("jetson_clocks not available (not on Jetson hardware)")
            return False
        except Exception as e:
            logger.warning(f"Jetson GPU throttling failed: {e}")
            return False

    def reset_gpu(self) -> bool:
        """Perform GPU reset (nvidia-smi --gpu-reset)"""
        try:
            logger.warning("Performing GPU reset...")

            result = subprocess.run(
                ['nvidia-smi', '--gpu-reset', '-i', '0'],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                logger.info("GPU reset successful")
                # Wait for GPU to reinitialize
                time.sleep(5)
                return True
            else:
                logger.error(f"GPU reset failed: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            logger.error("GPU reset timed out")
            return False
        except Exception as e:
            logger.error(f"Failed to reset GPU: {e}")
            return False

    def restart_llm_service(self) -> bool:
        """Restart LLM service"""
        if not self.docker_client:
            logger.error("Docker client not available")
            return False

        try:
            container = self.docker_client.containers.get('llm-service')
            logger.info("Restarting LLM service...")
            container.restart(timeout=30)
            logger.info("LLM service restarted successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to restart LLM service: {e}")
            return False

    def stop_llm_service(self) -> bool:
        """Stop LLM service (emergency thermal shutdown)"""
        if not self.docker_client:
            logger.error("Docker client not available")
            return False

        try:
            container = self.docker_client.containers.get('llm-service')
            logger.critical("Stopping LLM service due to critical GPU temperature")
            container.stop(timeout=30)
            logger.info("LLM service stopped successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to stop LLM service: {e}")
            return False

    def execute_recovery(self, action: GPURecoveryAction) -> bool:
        """Execute recovery action"""
        logger.info(f"Executing GPU recovery action: {action.value}")

        action_map = {
            GPURecoveryAction.NONE: lambda: True,
            GPURecoveryAction.CLEAR_CACHE: self.clear_llm_cache,
            GPURecoveryAction.RESET_SESSION: self.reset_gpu_session,
            GPURecoveryAction.THROTTLE: self.throttle_gpu,
            GPURecoveryAction.RESET_GPU: self.reset_gpu,
            GPURecoveryAction.RESTART_LLM: self.restart_llm_service,
            GPURecoveryAction.STOP_LLM: self.stop_llm_service
        }

        func = action_map.get(action)
        if func:
            return func()
        else:
            logger.error(f"Unknown recovery action: {action}")
            return False

    def get_gpu_health_summary(self) -> Dict:
        """Get GPU health summary for monitoring"""
        stats = self.get_gpu_stats()

        if not stats:
            return {
                'available': False,
                'error': 'GPU stats unavailable'
            }

        return {
            'available': True,
            'name': stats.get('name', 'Unknown'),
            'temperature': stats.get('temperature', 0.0),
            'utilization': stats.get('utilization', 0.0),
            'memory_used_mb': stats.get('memory', {}).get('used_mb', 0),
            'memory_total_mb': stats.get('memory', {}).get('total_mb', 0),
            'memory_percent': stats.get('memory', {}).get('percent', 0.0),
            'health': stats.get('health', 'unknown'),
            'error': stats.get('error', 'none'),
            'error_message': stats.get('error_message')
        }


def main():
    """Test GPU recovery"""
    recovery = GPURecovery()

    print("=" * 70)
    print("GPU RECOVERY - Health Check")
    print("=" * 70)

    # Get health summary
    health = recovery.get_gpu_health_summary()
    print(f"\nGPU Health Summary:")
    for key, value in health.items():
        print(f"  {key}: {value}")

    # Check for errors
    has_error, error_type, error_msg = recovery.detect_gpu_error()
    if has_error:
        print(f"\n⚠️  GPU Error Detected:")
        print(f"  Type: {error_type}")
        print(f"  Message: {error_msg}")

        action = recovery.recommend_recovery_action(error_type)
        print(f"  Recommended Action: {action.value}")
    else:
        print("\n✅ GPU Health: OK")

    # Check memory
    exceeded, memory_mb = recovery.check_memory_limit()
    if exceeded:
        print(f"\n⚠️  Memory Limit Exceeded: {memory_mb}MB")
    else:
        print(f"\n✅ Memory Usage: {memory_mb}MB")

    # Check temperature
    needs_action, temp, severity = recovery.check_temperature()
    if needs_action:
        print(f"\n⚠️  Temperature {severity.upper()}: {temp}°C")
    else:
        print(f"\n✅ Temperature: {temp}°C")


if __name__ == '__main__':
    main()
