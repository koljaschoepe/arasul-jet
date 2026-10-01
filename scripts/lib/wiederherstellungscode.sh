#!/bin/bash
# =============================================================================
# Der Wiederherstellungscode (J37, 02.10.2026)
# =============================================================================
# Aufruf: source "${SCRIPT_DIR}/scripts/lib/wiederherstellungscode.sh"
#
# DER CODE IST DER SICHERUNGSSCHLUESSEL SELBST, in Gruppen zu vier Zeichen
# (`ABCD-EFGH-JKLM-...`). Kein zweiter Schluessel, keine Ableitung, nichts, was
# auseinanderlaufen koennte: wer den Code hat, hat den Schluessel, und ein
# Geraet, das ihn wieder schreibt (`./install.sh --wiederherstellungscode ...`),
# kann jede frueher gemachte Sicherung wieder oeffnen.
#
# Warum das noetig ist: am 26.09.2026 legte eine Neuinstallation einen NEUEN
# Schluessel an (`config/secrets/` wird beim Werksreset geloescht), und jede
# Sicherung auf dem Stick war damit Papier. Der Code steht bei der Einrichtung
# EINMAL auf dem Bildschirm; er gehoert aufgeschrieben und AUSSERHALB des
# Geraets aufbewahrt, sonst ist er so verloren wie der Schluessel.
#
# NEUE Schluessel sind 32 Zeichen aus A-Z und 2-7 (RFC 4648 Base32, 160 Bit;
# keine 0/1/8/9, die sich mit O/I/B/g verwechseln). AELTERE Geraete haben einen
# Schluessel aus 64 kleinen Hex-Zeichen (`openssl rand -hex 32`); auch der geht
# als Code, nur laenger. Das Geraet nimmt beides.
# =============================================================================

# Ein neuer Schluessel: 20 Zufallsbytes als Base32, ohne Fuellzeichen.
neuer_sicherungsschluessel() {
    local roh
    if command -v base32 >/dev/null 2>&1; then
        roh=$(head -c 20 /dev/urandom | base32 | tr -d '=\n')
    else
        roh=$(python3 -c 'import base64,os,sys; sys.stdout.write(base64.b32encode(os.urandom(20)).decode().rstrip("="))')
    fi
    printf '%s' "$roh"
}

# Der Code zu einem Schluessel: Gruppen zu vier, mit Strichen.
code_aus_schluessel() {
    printf '%s' "$1" | tr -d ' \t\r\n' | sed -E 's/(.{4})/\1-/g; s/-$//'
}

# Der Schluessel zu einem getippten Code: Striche, Leerzeichen und Zeilenumbrueche
# weg. Ein Code ohne Grossbuchstaben und ohne Ziffern ausser 2-7 ist ein neuer
# (Base32, immer gross) und wird gross geschrieben; sonst bleibt die Schreibweise,
# wie getippt. Ob sie stimmt, entscheidet beim Zurueckholen der Versuch gegen die
# Sicherung (services/backup-service/wiederherstellen.sh probiert alle drei).
schluessel_aus_code() {
    local roh
    roh=$(printf '%s' "$1" | tr -d ' \t\r\n-')
    if [[ "$roh" =~ ^[a-z2-7]{32}$ ]]; then
        roh=$(printf '%s' "$roh" | tr '[:lower:]' '[:upper:]')
    fi
    printf '%s' "$roh"
}

# Sieht der Text nach einem Code aus? (32 Base32-Zeichen oder 64 Hex-Zeichen.)
ist_wiederherstellungscode() {
    local k
    k=$(schluessel_aus_code "$1")
    [[ "$k" =~ ^[A-Z2-7]{32}$ ]] || [[ "$k" =~ ^[A-Fa-f0-9]{64}$ ]]
}
