#!/usr/bin/env python3
"""Der Text aller JavaScript-Dateien, die das Geraet unter ARASUL_URL ausliefert.

Gebraucht von `einstellungen-abnahme.sh`: sie prueft, welche Woerter die
Oberflaeche nennt. Folgt den Verweisen von der Startseite aus, hoechstens 400
Dateien. Aufruf: einstellungen_buendel.py <Adresse>
"""
import re
import ssl
import sys
import urllib.request

basis = sys.argv[1].rstrip("/")
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def holen(pfad):
    try:
        return urllib.request.urlopen(basis + pfad, context=ctx, timeout=30).read().decode("utf-8", "replace")
    except Exception:
        return ""


todo = re.findall(r'(/assets/[^"\']+\.js)', holen("/"))
gesehen, text = set(), []
while todo and len(gesehen) < 400:
    pfad = todo.pop()
    if pfad in gesehen:
        continue
    gesehen.add(pfad)
    js = holen(pfad)
    text.append(js)
    for name in re.findall(r'["\'`]\.?/?([A-Za-z0-9_.-]+\.js)["\'`]', js):
        todo.append("/assets/" + name)
print("\n".join(text))
