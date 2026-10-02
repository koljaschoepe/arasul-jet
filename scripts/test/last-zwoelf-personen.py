#!/usr/bin/env python3
"""
Lastmessung "Zwoelf Personen gleichzeitig" (J40, 02.10.2026)
=============================================================

Misst am Geraet, wie lange eine KI-Anfrage wartet, wenn zwoelf Konten sie
gleichzeitig stellen: Chat ueber die OpenAI-kompatible Schnittstelle (`/v1`,
mit Schluessel, wie eine App sie ruft) und Flow-Laeufe (`/api/flows/laeufe`,
als je eigenes Konto). Beides laeuft durch dieselbe GPU-Sperre
(`services/flows/gpuQueue.js`), deshalb steht beides in einer Tabelle.

Szenarien
  einzeln    eine Chat-Anfrage allein (Grundwert)
  welle      zwoelf Chat-Anfragen im selben Augenblick
  gemischt   zwoelf Konten mit Denkpausen, Chat und Flow im Wechsel
  rampe      Stoesse wachsender Groesse mit kurzen Antworten: ab wann ist die
             Warteschlange voll (`LLM_MAX_QUEUE_SIZE`)
  speicher   waehrend der Szenarien am Geraet: free, ollama ps, docker stats

WAS ES ANLEGT, RAEUMT ES WEG: zwoelf Konten `probe-j40-NN`, einen Schluessel,
einen Flow. Die Passwoerter sind zufaellig und gehen sofort ueber `geheim neu`
nach Bitwarden (Eintrag je Konto), nie in eine Datei.

Aufruf vom Arbeitsrechner, als probe-admin (NIE als admin):
  ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
  ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
    python3 scripts/test/last-zwoelf-personen.py --ergebnis /tmp/j40.json

Rueckgabe 0 nach vollstaendigem Lauf und Aufraeumen.
"""
import argparse
import http.client
import json
import os
import secrets
import ssl
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

STEMPEL = "probe-j40"
FLOW = "probe-j40-kurz"
ANZAHL = 12
FRAGEN = [
    "Erklaere in drei Saetzen, wie man eine Urlaubsanfrage im Betrieb sauber dokumentiert.",
    "Nenne vier Punkte, die in eine Uebergabe-Notiz fuer die Spaetschicht gehoeren.",
    "Fasse in drei Saetzen zusammen, warum ein Backup regelmaessig getestet werden muss.",
    "Schreibe einen freundlichen Zweizeiler an einen Kunden, dessen Lieferung sich um zwei Tage verspaetet.",
]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


class Gerat:
    def __init__(self, basis, ssh):
        self.basis = basis.rstrip("/")
        host, _, port = self.basis.split("//", 1)[1].partition(":")
        self.host, self.port = host, int(port or 443)
        self.ssh = ssh

    def req(self, methode, pfad, token=None, body=None, key=None, timeout=60):
        daten = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.basis + pfad, data=daten, method=methode)
        r.add_header("content-type", "application/json")
        if token:
            r.add_header("authorization", "Bearer " + token)
        if key:
            r.add_header("authorization", "Bearer " + key)
        try:
            with urllib.request.urlopen(r, context=CTX, timeout=timeout) as a:
                t = a.read().decode()
                return a.status, (json.loads(t) if t else {})
        except urllib.error.HTTPError as e:
            t = e.read().decode()
            try:
                return e.code, json.loads(t)
            except Exception:
                return e.code, {"roh": t[:200]}
        except Exception as e:  # Zeitueberschreitung, Verbindung
            return 0, {"fehler": str(e)}

    def login(self, name, pw):
        c, d = self.req("POST", "/api/auth/login", body={"username": name, "password": pw})
        if c != 200:
            raise SystemExit(f"Anmeldung {name}: {c} {d}")
        return d["token"]

    def chat(self, key, nutzer, frage, max_tokens, timeout=600):
        """Streamt eine Chat-Anfrage. Gibt (code, bis_erstes_token_s, gesamt_s, tokens)."""
        t0 = time.time()
        conn = http.client.HTTPSConnection(self.host, self.port, context=CTX, timeout=timeout)
        body = json.dumps({
            "stream": True, "max_tokens": max_tokens, "user": nutzer,
            "messages": [{"role": "user", "content": frage}],
        })
        try:
            conn.request("POST", "/v1/chat/completions", body,
                         {"content-type": "application/json", "authorization": "Bearer " + key})
            a = conn.getresponse()
            if a.status != 200:
                a.read()
                return a.status, None, time.time() - t0, 0
            erst, n = None, 0
            for zeile in a:
                z = zeile.decode().strip()
                if not z.startswith("data:") or z == "data: [DONE]":
                    continue
                try:
                    d = json.loads(z[5:])
                except Exception:
                    continue
                ch = (d.get("choices") or [{}])[0].get("delta", {}).get("content")
                if ch:
                    n += 1
                    if erst is None:
                        erst = time.time() - t0
            return 200, erst, time.time() - t0, n
        except Exception:
            return 0, None, time.time() - t0, 0
        finally:
            conn.close()

    def flow(self, token, thema, timeout=900):
        """Startet einen Lauf und wartet auf sein Ende. (code, gesamt_s, status)."""
        t0 = time.time()
        c, d = self.req("POST", "/api/flows/laeufe", token, {"flow": FLOW, "args": {"thema": thema}})
        if c != 202:
            return c, time.time() - t0, "abgewiesen"
        rid = d["data"]["runId"]
        while time.time() - t0 < timeout:
            time.sleep(2)
            c, d = self.req("GET", f"/api/flows/laeufe/{rid}", token)
            st = (d.get("data") or d.get("run") or d).get("status") if c == 200 else None
            if st and st not in ("laeuft", "wartend"):
                return 200, time.time() - t0, st
        return 200, time.time() - t0, "zeitlimit"

    def am_geraet(self, befehl):
        try:
            return subprocess.run(["ssh", "-o", "BatchMode=yes", self.ssh, befehl],
                                  capture_output=True, text=True, timeout=40).stdout
        except Exception:
            return ""


def perz(werte, p):
    if not werte:
        return None
    w = sorted(werte)
    i = min(len(w) - 1, max(0, int(round(p / 100 * len(w) + 0.5)) - 1))
    return round(w[i], 1)


def zusammen(werte):
    return {"n": len(werte), "p50": perz(werte, 50), "p95": perz(werte, 95),
            "max": round(max(werte), 1) if werte else None}


class Speicher(threading.Thread):
    def __init__(self, geraet):
        super().__init__(daemon=True)
        self.g, self.stop, self.proben = geraet, threading.Event(), []

    def run(self):
        while not self.stop.is_set():
            f = self.g.am_geraet(
                "free -m | awk '/Mem:/{print $3\" \"$7}'; "
                "docker exec llm-service ollama ps 2>/dev/null | tail -n +2 | head -3; "
                "docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' llm-service dashboard-backend postgres-db 2>/dev/null")
            zeilen = f.strip().splitlines()
            if zeilen:
                self.proben.append({"t": time.strftime("%H:%M:%S"), "roh": zeilen})
            self.stop.wait(15)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--basis", default="https://localhost:8443")
    ap.add_argument("--geraet", default="arasul@192.168.0.197")
    ap.add_argument("--ergebnis", default="/tmp/j40.json")
    ap.add_argument("--max-tokens", type=int, default=150)
    ap.add_argument("--gemischt-minuten", type=float, default=6)
    ap.add_argument("--rampe", default="8,12,16,20,22,24")
    ap.add_argument("--szenarien", default="einzeln,welle,gemischt,rampe")
    ap.add_argument("--pause", default="20,60", help="Denkpause je Person in Sekunden, von,bis")
    ap.add_argument("--nur-aufraeumen", action="store_true")
    a = ap.parse_args()

    g = Gerat(a.basis, a.geraet)
    admin = g.login("probe-admin", os.environ["ARASUL_PASSWORT"])
    erg = {"gestartet": time.strftime("%Y-%m-%d %H:%M:%S"), "max_tokens": a.max_tokens}
    konten, schluessel_id = {}, None

    def aufraeumen():
        c, d = g.req("GET", "/api/benutzer", admin)
        for u in d.get("data", []):
            if u["username"].startswith(STEMPEL + "-"):
                g.req("DELETE", f"/api/benutzer/{u['id']}", admin)
        c, d = g.req("GET", "/api/v1/external/api-keys", admin)
        for k in (d.get("api_keys") or []):
            if str(k.get("name", "")).startswith(STEMPEL):
                g.req("DELETE", f"/api/v1/external/api-keys/{k.get('id') or k.get('key_id')}", admin)
        g.req("DELETE", f"/api/flows/{FLOW}", admin)
        log("aufgeraeumt: Konten, Schluessel, Flow")

    if a.nur_aufraeumen:
        aufraeumen()
        return 0

    try:
        # --- Aufbau ---------------------------------------------------------
        c, d = g.req("POST", "/api/flows", admin, {
            "name": FLOW, "beschreibung": "Messung J40, wird danach entfernt",
            "argumente": [{"name": "thema", "typ": "freitext", "pflicht": True, "beschreibung": "Thema"}],
            "werkzeuge": [], "grenzen": {"zeitlimit_s": 600},
            "prompt": "Schreibe drei kurze Saetze zum Thema {{thema}}. Keine Anrede, keine Aufzaehlung."})
        log("Flow angelegt", c)
        c, d = g.req("POST", "/api/v1/external/api-keys", admin, {
            "name": STEMPEL + "-schluessel", "description": "Messung J40",
            "rate_limit_per_minute": 6000, "allowed_endpoints": ["llm:chat", "llm:status"]})
        if c != 200:
            raise SystemExit(f"Schluessel: {c} {d}")
        key, schluessel_id = d["api_key"], d["key_id"]
        stempel = time.strftime("%Y%m%d")
        tokens = {}
        for i in range(1, ANZAHL + 1):
            name = f"{STEMPEL}-{i:02d}"
            pw = secrets.token_urlsafe(18)
            c, d = g.req("POST", "/api/benutzer", admin,
                         {"username": name, "password": pw, "rolle": "mitarbeiter"})
            if c != 201:
                raise SystemExit(f"Konto {name}: {c} {d}")
            subprocess.run(["geheim", "neu", f"Arasul Orin Probe-Konto {name}-{stempel}", name],
                           input=pw, text=True, capture_output=True)
            tokens[name] = g.login(name, pw)
        konten = tokens
        log("zwoelf Konten angelegt und angemeldet")

        sp = Speicher(g)
        erg["speicher_vorher"] = g.am_geraet("free -m | awk '/Mem:/{print $3\" \"$7}'; docker exec llm-service ollama ps")
        sp.start()

        # --- Aufwaermen: Modell laden, nicht mitgezaehlt -----------------------
        log("Aufwaermen")
        c, t1, t, n = g.chat(key, STEMPEL + "-01", "Sag Hallo.", 8)
        erg["aufwaermen_s"] = round(t, 1)

        # --- einzeln ----------------------------------------------------------
        sz = a.szenarien.split(",")
        if "einzeln" in sz:
            einzeln = [g.chat(key, STEMPEL + "-01", FRAGEN[0], a.max_tokens) for _ in range(3)]
            erg["einzeln"] = {"erstes_token_s": [round(x[1], 1) for x in einzeln if x[1]],
                              "gesamt_s": [round(x[2], 1) for x in einzeln],
                              "tokens": [x[3] for x in einzeln]}
            log("einzeln", erg["einzeln"])

        # --- Welle: zwoelf gleichzeitig ---------------------------------------
        def welle(n_anfragen, max_tokens, ziel):
            erg_l = [None] * n_anfragen
            def lauf(i):
                erg_l[i] = g.chat(key, f"{STEMPEL}-{(i % ANZAHL) + 1:02d}", FRAGEN[i % len(FRAGEN)], max_tokens)
            th = [threading.Thread(target=lauf, args=(i,)) for i in range(n_anfragen)]
            for x in th: x.start()
            for x in th: x.join()
            ok = [x for x in erg_l if x[0] == 200]
            ziel.update({
                "anfragen": n_anfragen, "ok": len(ok),
                "abgewiesen": sum(1 for x in erg_l if x[0] == 503),
                "andere_fehler": sum(1 for x in erg_l if x[0] not in (200, 503)),
                "erstes_token_s": zusammen([x[1] for x in ok if x[1]]),
                "gesamt_s": zusammen([x[2] for x in ok])})
            return ziel
        if "welle" in sz:
            erg["welle"] = welle(ANZAHL, a.max_tokens, {})
            log("welle", erg["welle"])

        # --- gemischt: zwoelf Konten mit Denkpausen -----------------------------
        p_von, p_bis = [float(x) for x in a.pause.split(",")]
        ende = time.time() + (a.gemischt_minuten * 60 if "gemischt" in sz else 0)
        chat_t, chat_g, flow_g, fehler = [], [], [], []
        sperre = threading.Lock()
        def person(i):
            name = f"{STEMPEL}-{i:02d}"
            zufall = secrets.SystemRandom()
            time.sleep(zufall.uniform(0, p_bis if p_bis > 60 else 20))
            while time.time() < ende:
                if zufall.random() < 0.7:
                    c, t1, tg, n = g.chat(key, name, zufall.choice(FRAGEN), a.max_tokens)
                    with sperre:
                        if c == 200:
                            chat_t.append(t1 or tg); chat_g.append(tg)
                        else:
                            fehler.append(("chat", c))
                else:
                    c, tg, st = g.flow(konten[name], zufall.choice(["Backup", "Urlaub", "Lieferung"]))
                    with sperre:
                        if c == 200 and st == "fertig":
                            flow_g.append(tg)
                        else:
                            fehler.append(("flow", c, st))
                time.sleep(zufall.uniform(p_von, p_bis))
        th = [threading.Thread(target=person, args=(i,)) for i in range(1, ANZAHL + 1)]
        for x in th: x.start()
        for x in th: x.join()
        erg["gemischt"] = {"minuten": a.gemischt_minuten, "pause_s": [p_von, p_bis], "chat_erstes_token_s": zusammen(chat_t),
                           "chat_gesamt_s": zusammen(chat_g), "flow_gesamt_s": zusammen(flow_g),
                           "fehler": fehler}
        log("gemischt", erg["gemischt"])

        # --- Rampe: Warteschlange voll ----------------------------------------
        erg["rampe"] = {}
        for n in ([int(x) for x in a.rampe.split(",")] if "rampe" in sz else []):
            erg["rampe"][n] = welle(n, 8, {})
            log("rampe", n, erg["rampe"][n])
            time.sleep(5)

        sp.stop.set()
        erg["speicher"] = sp.proben
        erg["speicher_nachher"] = g.am_geraet("free -m | awk '/Mem:/{print $3\" \"$7}'; docker exec llm-service ollama ps")
        erg["queue_einstellung"] = g.am_geraet("docker exec llm-service printenv OLLAMA_NUM_PARALLEL; docker exec dashboard-backend printenv LLM_MAX_QUEUE_SIZE").strip()
    finally:
        erg["beendet"] = time.strftime("%Y-%m-%d %H:%M:%S")
        with open(a.ergebnis, "w") as f:
            json.dump(erg, f, indent=1, ensure_ascii=False)
        aufraeumen()
    return 0


if __name__ == "__main__":
    sys.exit(main())
