#!/bin/bash
# Self-Healing Agent Startup Script
# Startet die Healing Engine. Bis zum 06.10.2026 lief daneben ein USB-Monitor
# fuer `.araupdate`-Pakete; der Weg lief am Geraet nie und ist gefallen.

set -euo pipefail

echo "=================================="
echo "ARASUL Self-Healing Agent Starting"
echo "=================================="

# Wait for dependencies
echo "Waiting for dependencies..."
sleep 10

echo "Starting Healing Engine..."
exec python3 healing_engine.py
