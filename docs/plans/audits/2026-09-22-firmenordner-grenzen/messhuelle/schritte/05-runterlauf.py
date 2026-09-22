#!/usr/bin/env python3
"""Ein Runterlauf wie der eines Klienten, und was er den Dienst an RAM kostet.

    ./05-runterlauf.py <kennung> <anzahl> <groesse-in-mb> [parallel]

DIE FRAGE IST NICHT DER GIPFEL, SONDERN SEINE STEIGUNG. Ein einzelner Wert
sagt nur, dass es an diesem Tag gereicht hat; zwei Laeufe verschiedener Groesse
sagen, ob die Grenze mitwaechst -- und genau das entscheidet, ob 2 GiB eine
Grenze ist oder eine Zeitbombe.
"""
import base64, json, os, subprocess, sys, threading, time, urllib.request, ssl

BASIS = os.environ.get("J33_BASIS", "https://127.0.0.1:18083")
ADMIN = os.environ.get("J33_ADMIN", "admin")
PASS = os.environ.get("J33_ADMIN_PASSWORT", "j33grenze-Admin-2026")
WURZEL = os.environ.get("J33_WURZEL", os.path.expanduser("~/j33grenze"))
KOPF = {"Authorization": "Basic " + base64.b64encode(f"{ADMIN}:{PASS}".encode()).decode()}
CTX = ssl._create_unverified_context()


def ruf(methode, weg, kopf=None, daten=None):
    r = urllib.request.Request(BASIS + weg, method=methode, data=daten,
                               headers={**KOPF, **(kopf or {})})
    with urllib.request.urlopen(r, context=CTX, timeout=900) as a:
        return a.status, a.read()


class Stats(threading.Thread):
    """RSS und CPU des Containers, jede halbe Sekunde."""
    def __init__(self):
        super().__init__(daemon=True)
        self.proben, self.laeuft = [], True

    def run(self):
        while self.laeuft:
            try:
                aus = subprocess.run(
                    ["docker", "stats", "--no-stream", "--format", "{{.MemUsage}}|{{.CPUPerc}}",
                     "j33grenze-firmenordner"], capture_output=True, text=True, timeout=10).stdout.strip()
                mib = aus.split("|")[0].split("/")[0].strip()
                zahl = float(mib.rstrip("GMiKB"))
                if mib.endswith("GiB"):
                    zahl *= 1024
                self.proben.append((zahl, aus.split("|")[1].strip()))
            except Exception:
                pass
            time.sleep(0.5)


def main():
    kennung, anzahl, mb = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    parallel = int(sys.argv[4]) if len(sys.argv) > 4 else 8

    status, roh = ruf("POST", "/graph/v1.0/drives",
                      {"Content-Type": "application/json"},
                      json.dumps({"name": kennung, "description": "Messung J33"}).encode())
    raum = json.loads(roh)["id"]
    ziel = os.path.join(WURZEL, "ablage/posix/projects", kennung)
    for _ in range(120):
        if os.path.isdir(ziel):
            break
        time.sleep(1)
    block = os.urandom(1024 * 1024)
    for n in range(anzahl):
        with open(os.path.join(ziel, f"{kennung}-{n:04d}.bin"), "wb") as f:
            for _ in range(mb):
                f.write(block)
    gesamt = anzahl * mb
    print(f"Raum {kennung} = {raum}\n{anzahl} Dateien x {mb} MB = {gesamt} MB auf der Platte")
    time.sleep(30)

    namen = [f"{kennung}-{n:04d}.bin" for n in range(anzahl)]
    sperre, naechste = threading.Lock(), [0]
    fehler = []

    def arbeiter():
        while True:
            with sperre:
                if naechste[0] >= len(namen):
                    return
                i = naechste[0]
                naechste[0] += 1
            try:
                st, b = ruf("GET", f"/dav/spaces/{urllib.parse.quote(raum, safe='')}/{namen[i]}")
                if st != 200:
                    fehler.append((namen[i], st))
            except Exception as e:  # noqa: BLE001
                fehler.append((namen[i], repr(e)[:80]))

    s = Stats(); s.start()
    anfang = time.time()
    faeden = [threading.Thread(target=arbeiter) for _ in range(parallel)]
    for f in faeden: f.start()
    for f in faeden: f.join()
    dauer = time.time() - anfang
    time.sleep(3)
    s.laeuft = False; s.join(timeout=5)

    gipfel = max((p[0] for p in s.proben), default=0)
    cpu = max((float(p[1].rstrip("%")) for p in s.proben), default=0)
    print(f"Runterlauf {gesamt} MB, {parallel} parallel: {dauer:.1f}s, "
          f"{gesamt/dauer:.1f} MB/s, RAM-Gipfel {gipfel:.0f} MiB, CPU-Gipfel {cpu:.0f}%")
    print(f"Fehler: {len(fehler)}" + (f" -- {fehler[:3]}" if fehler else ""))
    laeuft = subprocess.run(["docker", "inspect", "-f", "{{.State.Status}} OOMKilled={{.State.OOMKilled}} "
                             "Neustarts={{.RestartCount}}", "j33grenze-firmenordner"],
                            capture_output=True, text=True).stdout.strip()
    print("Container:", laeuft)
    print("RAUM_ID", raum)


if __name__ == "__main__":
    import urllib.parse
    main()
