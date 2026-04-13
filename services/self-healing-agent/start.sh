#!/bin/bash
# Self-Healing Agent Startup Script
# Starts both healing engine and USB monitor
# If either process dies, the other is killed and the container exits

set -euo pipefail

echo "=================================="
echo "ARASUL Self-Healing Agent Starting"
echo "=================================="

# Wait for dependencies
echo "Waiting for dependencies..."
sleep 10

# Trap to clean up child processes on exit
cleanup() {
  echo "Shutting down child processes..."
  kill "$USB_MONITOR_PID" "$HEALING_ENGINE_PID" 2>/dev/null || true
  wait "$USB_MONITOR_PID" "$HEALING_ENGINE_PID" 2>/dev/null || true
  echo "Self-Healing Agent stopped."
}
trap cleanup EXIT

# Start USB Monitor in background
echo "Starting USB Update Monitor..."
python3 usb_monitor.py &
USB_MONITOR_PID=$!
echo "USB Monitor PID: $USB_MONITOR_PID"

# Start Healing Engine in background
echo "Starting Healing Engine..."
python3 healing_engine.py &
HEALING_ENGINE_PID=$!
echo "Healing Engine PID: $HEALING_ENGINE_PID"

# Wait for either process to exit — if one dies, kill the other and exit
# This ensures Docker sees the container as unhealthy and can restart it
while true; do
  if ! kill -0 "$USB_MONITOR_PID" 2>/dev/null; then
    echo "ERROR: USB Monitor (PID $USB_MONITOR_PID) died. Shutting down."
    exit 1
  fi
  if ! kill -0 "$HEALING_ENGINE_PID" 2>/dev/null; then
    echo "ERROR: Healing Engine (PID $HEALING_ENGINE_PID) died. Shutting down."
    exit 1
  fi
  sleep 5
done
