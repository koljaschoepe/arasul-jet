#!/usr/bin/env python3
"""Orin. Ersatz fuer einen Abgleich-Klienten, wenn nur der DIENST gemessen werden soll:
laedt einen Ordnerbaum per WebDAV hoch/herunter, mit N Verbindungen wie ein Klient, und
misst, wie lange ein Abgleich ohne Aenderung dauert (Ordner fuer Ordner PROPFIND Depth 1).
Grund: der Mac-Klient haengt an der WLAN-Strecke zum Orin (siehe MESSUNG.md), die Zeiten
dort messen das Netz, nicht den Dienst.
  webdav.py hoch|runter|abgleich <basis-url> <nutzer:passwort> <lokal> <fern> [threads]
"""
import base64, http.client, os, re, ssl, sys, time, urllib.parse
from concurrent.futures import ThreadPoolExecutor

modus, basis, auth, lokal, fern = sys.argv[1:6]
threads = int(sys.argv[6]) if len(sys.argv) > 6 else 4
u = urllib.parse.urlparse(basis)
kopf = {"Authorization": "Basic " + base64.b64encode(auth.encode()).decode()}
ctx = ssl._create_unverified_context()
import threading
tl = threading.local()

def verb():
    if not hasattr(tl, "c"):
        tl.c = (http.client.HTTPSConnection(u.hostname, u.port, context=ctx, timeout=120) if u.scheme == "https"
                else http.client.HTTPConnection(u.hostname, u.port, timeout=120))
    return tl.c

def anfrage(m, pfad, body=None, extra=None):
    h = dict(kopf); h.update(extra or {})
    url = u.path.rstrip("/") + "/" + urllib.parse.quote(pfad.strip("/"))
    for _ in range(3):
        try:
            c = verb(); c.request(m, url, body=body, headers=h); r = c.getresponse(); d = r.read(); return r.status, d
        except Exception:
            tl.__dict__.pop("c", None); time.sleep(1)
    return 0, b""

def dateien():
    for w, ds, fs in os.walk(lokal):
        for f in fs: yield os.path.relpath(os.path.join(w, f), lokal)

def ordner():
    for w, ds, fs in os.walk(lokal):
        yield os.path.relpath(w, lokal)

def liste(pfad):
    import xml.etree.ElementTree as ET
    s, d = anfrage("PROPFIND", pfad, extra={"Depth": "1"})
    hs = []
    try:
        for r in ET.fromstring(d).findall("{DAV:}response"):
            hs.append((urllib.parse.unquote(r.find("{DAV:}href").text), r.find(".//{DAV:}collection") is not None))
    except ET.ParseError:
        pass
    return s, hs, d

t0 = time.time(); n = 0; byte = 0; fehler = 0
if modus == "hoch":
    for o in sorted(ordner(), key=lambda x: x.count("/")):
        p = fern if o == "." else fern + "/" + o
        anfrage("MKCOL", p)
    def hoch(rel):
        with open(os.path.join(lokal, rel), "rb") as f: b = f.read()
        s, _ = anfrage("PUT", fern + "/" + rel, body=b)
        return s, len(b)
    with ThreadPoolExecutor(threads) as ex:
        for s, l in ex.map(hoch, list(dateien())):
            n += 1; byte += l; fehler += s not in (200, 201, 204)
elif modus == "runter":
    os.makedirs(lokal, exist_ok=True)
    def runter(rel):
        s, d = anfrage("GET", fern + "/" + rel)
        z = os.path.join(lokal, rel); os.makedirs(os.path.dirname(z), exist_ok=True)
        open(z, "wb").write(d); return s, len(d)
    quelle = os.environ["QUELLE"]  # Liste der Dateien (relativ), eine je Zeile
    with ThreadPoolExecutor(threads) as ex:
        for s, l in ex.map(runter, open(quelle).read().split("\n")[:-1] if False else [x for x in open(quelle).read().split("\n") if x]):
            n += 1; byte += l; fehler += s != 200
elif modus == "abgleich":
    todo = [fern]
    while todo:
        p = todo.pop(); s, hs, _ = liste(p); n += 1
        for h, ordner_ in hs[1:]:
            if ordner_: todo.append(h[len(urllib.parse.unquote(u.path.rstrip("/"))):].strip("/"))
print(f"{modus}: {n} Anfragen/Dateien, {byte/1048576:.1f} MB, {fehler} Fehler, {time.time()-t0:.1f} s, {threads} Verbindungen")
