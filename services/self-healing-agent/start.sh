#!/bin/bash
# Self-Healing Agent Startup Script
# Starts both healing engine and USB monitor

set -e

echo "=================================="
echo "ARASUL Self-Healing Agent Starting"
echo "=================================="

# Wait for dependencies
echo "Waiting for dependencies..."
sleep 10

# Start USB Monitor in background
echo "Starting USB Update Monitor..."
python3 usb_monitor.py &
USB_MONITOR_PID=$!
echo "USB Monitor PID: $USB_MONITOR_PID"

# Start Healing Engine (foreground)
echo "Starting Healing Engine..."
python3 healing_engine.py &
HEALING_ENGINE_PID=$!
echo "Healing Engine PID: $HEALING_ENGINE_PID"

# Wait for both processes
wait $HEALING_ENGINE_PID $USB_MONITOR_PID
