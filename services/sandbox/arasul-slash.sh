# ============================================================================
# arasul-slash.sh — /etc/profile.d-Snippet für Arasul-Sandbox-Shells.
#
# (1) npm-Prefix auf ~/.npm-global: globale npm-Installs funktionieren ohne
#     sudo (Container laufen mit no-new-privileges + CapDrop ALL).
# (2) Slash-Funktionen /claude, /codex, /gemini, /open-ara — damit die im
#     Dashboard kommunizierten Slash-Eingaben direkt im Terminal starten.
#     Funktionsnamen mit '/' sind eine Bash-Erweiterung; die Definitionen
#     laufen über eval hinter einem BASH_VERSION-Guard, damit ein
#     POSIX-Shell-Login (dash parst sonst schon beim Sourcen) nicht bricht.
#
# Wird zusätzlich aus /etc/bash.bashrc gesourct (siehe Dockerfile), damit
# auch interaktive Non-Login-Shells (tmux-Fallback) die Funktionen haben.
# ============================================================================

export NPM_CONFIG_PREFIX="${NPM_CONFIG_PREFIX:-$HOME/.npm-global}"

case ":$PATH:" in
    *":$NPM_CONFIG_PREFIX/bin:"*) ;;
    *) export PATH="$NPM_CONFIG_PREFIX/bin:$HOME/.local/bin:$PATH" ;;
esac

# Nur in echtem Bash und NICHT im POSIX-Modus: '/name'-Funktionsnamen sind
# eine Bash-Erweiterung, die POSIX-Bash als Syntaxfehler ablehnt (und im
# nicht-interaktiven Fall die Shell beenden würde). Im Zielcontainer ist
# /bin/sh = dash (BASH_VERSION leer → übersprungen); die Login-Shell ist
# normales Bash. Der SHELLOPTS-Guard schützt zusätzlich vor Bash-als-sh.
case ":${SHELLOPTS:-}:" in
    *:posix:*) ;;  # POSIX-Bash — Slash-Funktionen überspringen
    *)
        if [ -n "${BASH_VERSION:-}" ]; then
            eval '/claude()   { claude "$@"; }'
            eval '/codex()    { codex "$@"; }'
            eval '/gemini()   { gemini "$@"; }'
            eval '/open-ara() { open-ara "$@"; }'
        fi
        ;;
esac
