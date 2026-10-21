#!/bin/bash
# Gesund heisst: ttyd nimmt Verbindungen an. Ohne Kopfzeile antwortet er 401,
# deshalb wird nur der Port geprueft, keine Seite.
exec 3<>/dev/tcp/127.0.0.1/7681
