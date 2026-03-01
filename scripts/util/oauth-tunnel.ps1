#
# OAuth Tunnel für Windows - Ermöglicht Google OAuth von jedem Gerät im LAN
#
# Verwendung:
#   .\oauth-tunnel.ps1 -JetsonIP 192.168.0.112
#   .\oauth-tunnel.ps1 -JetsonIP arasul.local -User admin
#

param(
    [Parameter(Mandatory=$false)]
    [string]$JetsonIP,

    [Parameter(Mandatory=$false)]
    [string]$User = "arasul",

    [Parameter(Mandatory=$false)]
    [int]$LocalPort = 5678
)

$ErrorActionPreference = "Stop"

function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

# Header
Clear-Host
Write-Host ""
Write-Host "  =================================================================" -ForegroundColor Cyan
Write-Host "    Arasul OAuth Tunnel (Windows)" -ForegroundColor White
Write-Host "    Ermoeglicht Google OAuth von diesem Geraet" -ForegroundColor Gray
Write-Host "  =================================================================" -ForegroundColor Cyan
Write-Host ""

# Jetson-IP abfragen falls nicht angegeben
if (-not $JetsonIP) {
    Write-Host "Jetson IP-Adresse eingeben (z.B. 192.168.0.112):" -ForegroundColor Yellow
    $JetsonIP = Read-Host "  Jetson"
    Write-Host ""
}

if (-not $JetsonIP) {
    Write-Host "Fehler: Keine Jetson-IP angegeben" -ForegroundColor Red
    exit 1
}

# Prüfe ob SSH verfügbar ist
Write-Host "[1/4] Pruefe SSH-Verfuegbarkeit..." -ForegroundColor Blue

$sshPath = Get-Command ssh -ErrorAction SilentlyContinue
if (-not $sshPath) {
    Write-Host "  Fehler: SSH nicht gefunden" -ForegroundColor Red
    Write-Host ""
    Write-Host "  OpenSSH installieren:" -ForegroundColor Yellow
    Write-Host "    1. Einstellungen -> Apps -> Optionale Features"
    Write-Host "    2. 'OpenSSH Client' hinzufuegen"
    Write-Host ""
    exit 1
}
Write-Host "  OK - SSH gefunden" -ForegroundColor Green

# Prüfe Erreichbarkeit
Write-Host ""
Write-Host "[2/4] Pruefe Verbindung zu $JetsonIP..." -ForegroundColor Blue

$pingResult = Test-Connection -ComputerName $JetsonIP -Count 1 -Quiet -ErrorAction SilentlyContinue
if (-not $pingResult) {
    Write-Host "  Warnung: Ping fehlgeschlagen (Firewall?)" -ForegroundColor Yellow
    Write-Host "  Versuche trotzdem SSH-Verbindung..." -ForegroundColor Gray
} else {
    Write-Host "  OK - Jetson erreichbar" -ForegroundColor Green
}

# Prüfe ob Port belegt ist
$portInUse = Get-NetTCPConnection -LocalPort $LocalPort -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "  Port $LocalPort belegt - verwende 15678..." -ForegroundColor Yellow
    $LocalPort = 15678

    $portInUse = Get-NetTCPConnection -LocalPort $LocalPort -ErrorAction SilentlyContinue
    if ($portInUse) {
        Write-Host "  Fehler: Beide Ports (5678, 15678) belegt" -ForegroundColor Red
        exit 1
    }
}

# SSH-Tunnel starten
Write-Host ""
Write-Host "[3/4] Starte SSH-Tunnel..." -ForegroundColor Blue
Write-Host "  localhost:$LocalPort -> ${JetsonIP}:5678 (n8n)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  SSH-Passwort fuer ${User}@${JetsonIP} eingeben:" -ForegroundColor Yellow
Write-Host ""

# Starte SSH-Tunnel als Hintergrundprozess
$sshArgs = "-N -L ${LocalPort}:localhost:5678 ${User}@${JetsonIP}"
$sshProcess = Start-Process -FilePath "ssh" -ArgumentList $sshArgs -PassThru -WindowStyle Hidden

# Warte kurz
Start-Sleep -Seconds 3

# Prüfe ob Prozess läuft
if ($sshProcess.HasExited) {
    Write-Host ""
    Write-Host "  Fehler: SSH-Verbindung fehlgeschlagen" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Moegliche Ursachen:" -ForegroundColor Yellow
    Write-Host "    - Falsches Passwort"
    Write-Host "    - SSH nicht aktiviert auf Jetson"
    Write-Host "    - Firewall blockiert Port 22"
    Write-Host ""
    exit 1
}

Write-Host "  OK - Tunnel aktiv (PID: $($sshProcess.Id))" -ForegroundColor Green

# Prüfe n8n-Verbindung
Write-Host ""
Write-Host "[4/4] Pruefe n8n-Verbindung..." -ForegroundColor Blue

try {
    $response = Invoke-WebRequest -Uri "http://localhost:$LocalPort/healthz" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        Write-Host "  OK - n8n erreichbar" -ForegroundColor Green
    }
} catch {
    Write-Host "  Hinweis: n8n antwortet nicht auf /healthz" -ForegroundColor Yellow
    Write-Host "  (n8n laeuft moeglicherweise unter /n8n Pfad)" -ForegroundColor Gray
}

# Erfolg!
Write-Host ""
Write-Host "  =================================================================" -ForegroundColor Green
Write-Host "    TUNNEL BEREIT!" -ForegroundColor White
Write-Host "  =================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  n8n ist jetzt erreichbar unter:" -ForegroundColor White
Write-Host ""
Write-Host "    http://localhost:$LocalPort/n8n" -ForegroundColor Cyan
Write-Host ""
Write-Host "  =================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  So fuegst du Google OAuth hinzu:" -ForegroundColor White
Write-Host ""
Write-Host "    1. Oeffne im Browser: http://localhost:$LocalPort/n8n" -ForegroundColor Gray
Write-Host "    2. Gehe zu: Credentials -> Add Credential -> Google OAuth2 API" -ForegroundColor Gray
Write-Host "    3. Klicke 'Connect my account'" -ForegroundColor Gray
Write-Host "    4. Google-Login durchfuehren" -ForegroundColor Gray
Write-Host "    5. Fertig! Token wird auf dem Jetson gespeichert." -ForegroundColor Gray
Write-Host ""
Write-Host "  Hinweis: Der Tunnel laeuft im Hintergrund." -ForegroundColor Yellow
Write-Host "           Zum Beenden: Stop-Process -Id $($sshProcess.Id)" -ForegroundColor Gray
Write-Host ""

# Browser öffnen?
$openBrowser = Read-Host "Browser jetzt oeffnen? [J/n]"
if ($openBrowser -eq "" -or $openBrowser -match "^[Jj]") {
    Start-Process "http://localhost:$LocalPort/n8n"
}

Write-Host ""
Write-Host "Viel Erfolg!" -ForegroundColor Green
Write-Host ""

# Halte Fenster offen
Write-Host "Druecke eine Taste zum Beenden des Tunnels..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

# Tunnel beenden
Stop-Process -Id $sshProcess.Id -Force -ErrorAction SilentlyContinue
Write-Host "Tunnel beendet." -ForegroundColor Yellow
