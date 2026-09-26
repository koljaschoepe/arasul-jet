"""Der Messteil von bildmodelle-messen.sh (J35). Aufruf nur ueber das Skript."""
import base64
import difflib
import json
import os
import re
import ssl
import sys
import time
import unicodedata
import urllib.request
import uuid
from pathlib import Path

BASIS = os.environ["ARASUL_URL"] + "/api/v1/external"
SCHLUESSEL = os.environ["SCHLUESSEL"]
BELEGE = Path(os.environ["BELEGE"])
WIEDERHOLUNGEN = int(os.environ.get("ARASUL_WIEDERHOLUNGEN", "1"))
OCR_MODELL = os.environ.get("ARASUL_OCR_MODELL", "qwen3.8:27b-q4_K_M")
TEMPERATUR = float(os.environ["ARASUL_TEMPERATUR"]) if os.environ.get("ARASUL_TEMPERATUR") else None
KEIN_TLS = ssl._create_unverified_context()

FELDER = ["haendler", "datum", "brutto", "netto", "mwst_satz", "mwst_betrag"]
FRAGE = (
    "Lies diesen Beleg. Antworte nur mit einem JSON-Objekt und genau diesen Feldern: "
    '"haendler" (Name des Geschaefts oder der Firma, die den Beleg ausgestellt hat), '
    '"datum" (Belegdatum als TT.MM.JJJJ), "brutto" (Gesamtbetrag in Euro als Zahl), '
    '"netto" (Nettobetrag als Zahl), "mwst_satz" (Steuersatz in Prozent als Zahl), '
    '"mwst_betrag" (Steuerbetrag als Zahl). Fehlt ein Wert, schreibe null.'
)
SCHEMA = {
    "type": "object",
    "properties": {
        "haendler": {"type": "string"}, "datum": {"type": "string"},
        "brutto": {"type": "number"}, "netto": {"type": "number"},
        "mwst_satz": {"type": "number"}, "mwst_betrag": {"type": "number"},
    },
}


def anfrage(pfad, leib=None, kopf=None, methode=None, zeit=620):
    kopf = {"x-api-key": SCHLUESSEL, **(kopf or {})}
    req = urllib.request.Request(BASIS + pfad, leib, kopf, method=methode)
    try:
        with urllib.request.urlopen(req, timeout=zeit, context=KEIN_TLS) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except Exception:
            return e.code, {}


def flach(text):
    text = str(text or "").lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        text = text.replace(a, b)
    text = unicodedata.normalize("NFKD", text)
    return re.sub(r"[^a-z0-9]", "", text)


def zahl(wert):
    if wert is None or isinstance(wert, bool):
        return None
    if isinstance(wert, (int, float)):
        return float(wert)
    s = re.sub(r"[^0-9,.\-]", "", str(wert))
    if not s:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def datum(wert):
    s = str(wert or "")
    m = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})", s)
    if m:
        t, mo, j = m.groups()
    else:
        m = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
        if not m:
            return None
        j, mo, t = m.groups()
    j = "20" + j if len(j) == 2 else j
    return f"{int(t):02d}.{int(mo):02d}.{j}"


def stimmt(feld, soll, ist):
    if feld == "haendler":
        a, b = flach(soll), flach(ist)
        if not b:
            return False
        return a in b or (len(b) >= 6 and b in a) or difflib.SequenceMatcher(None, a, b).ratio() >= 0.8
    if feld == "datum":
        return datum(ist) == soll
    wert = zahl(ist)
    if wert is None:
        return False
    if feld == "mwst_satz" and 0 < wert < 1:
        wert *= 100
    return abs(wert - float(soll)) <= 0.011


def json_aus(text):
    if isinstance(text, dict):
        return text
    text = re.sub(r"```(?:json)?", "", str(text or ""))
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return {}


def bewerten(soll, gelesen):
    return [f for f in FELDER if stimmt(f, soll[f], gelesen.get(f))]


def ueber_bild(modell, bild):
    anfrage_leib = {
        "prompt": FRAGE, "model": modell, "timeout_seconds": 600,
        "images": ["data:image/jpeg;base64," + base64.b64encode(bild).decode()],
    }
    if TEMPERATUR is not None:  # ohne Angabe die Vorgabe des Geraets, wie bei einer App
        anfrage_leib["temperature"] = TEMPERATUR
    leib = json.dumps(anfrage_leib).encode()
    code, antwort = anfrage("/llm/chat", leib, {"content-type": "application/json"})
    return code, antwort.get("response", ""), antwort


def ueber_texterkennung(modell, pfad):
    grenze = uuid.uuid4().hex
    teile = []
    for name, wert in (("schema", json.dumps(SCHEMA)), ("model", modell), ("timeout_seconds", "600"),
                       ("instructions", "Belegdatum als TT.MM.JJJJ, Betraege in Euro, Steuersatz in Prozent.")):
        teile.append(f'--{grenze}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{wert}\r\n'.encode())
    teile.append((f'--{grenze}\r\nContent-Disposition: form-data; name="file"; filename="{pfad.name}"\r\n'
                  "Content-Type: image/jpeg\r\n\r\n").encode() + pfad.read_bytes() + b"\r\n")
    teile.append(f"--{grenze}--\r\n".encode())
    code, antwort = anfrage("/document/extract-structured", b"".join(teile),
                            {"content-type": f"multipart/form-data; boundary={grenze}"})
    return code, antwort.get("data") or {}, antwort


def main():
    wahrheit = json.loads((BELEGE / "wahrheit.json").read_text())
    code, modelle = anfrage("/models")
    bildmodelle = os.environ.get("ARASUL_BILDMODELLE", "").split() or [
        m["id"] for m in modelle.get("models", []) if m.get("supports_vision_input")]
    wege = [("bild", m) for m in bildmodelle]
    if OCR_MODELL != "aus":
        wege.append(("texterkennung", OCR_MODELL))
    print(f"Wege: {', '.join(f'{w}:{m}' for w, m in wege)}; {len(wahrheit)} Belege, "
          f"{WIEDERHOLUNGEN} Lauf/Laeufe je Beleg", flush=True)

    ergebnis = {}  # (weg, modell) -> beleg -> [(richtig, sekunden)]
    fehler = 0
    for weg, modell in wege:
        # Ein Aufwaermlauf, damit die Ladezeit nicht im ersten Beleg steckt.
        erster = BELEGE / f"{next(iter(wahrheit))}.jpg"
        beginn = time.time()
        (ueber_bild(modell, erster.read_bytes()) if weg == "bild" else ueber_texterkennung(modell, erster))
        print(f"-- {weg}:{modell} aufgewaermt in {time.time() - beginn:.0f} s", flush=True)
        for name, soll in wahrheit.items():
            pfad = BELEGE / f"{name}.jpg"
            for lauf in range(WIEDERHOLUNGEN):
                beginn = time.time()
                if weg == "bild":
                    code, text, roh = ueber_bild(modell, pfad.read_bytes())
                    gelesen = json_aus(text)
                else:
                    code, gelesen, roh = ueber_texterkennung(modell, pfad)
                    text = json.dumps(gelesen, ensure_ascii=False)
                dauer = time.time() - beginn
                je_beleg = ergebnis.setdefault((weg, modell), {}).setdefault(name, [])
                if code != 200:
                    # Ein Abbruch ist ein Beleg, von dem nichts gelesen wurde: er
                    # zaehlt mit null Feldern, nicht gar nicht.
                    fehler += 1
                    je_beleg.append((0, dauer, True))
                    print(f"ABBRUCH {weg}:{modell} {name} #{lauf + 1}: HTTP {code} nach {dauer:.0f} s "
                          f"{json.dumps(roh)[:160]}", flush=True)
                    continue
                richtig = bewerten(soll, gelesen)
                je_beleg.append((len(richtig), dauer, False))
                falsch = {f: gelesen.get(f) for f in FELDER if f not in richtig}
                print(f"{weg}:{modell} {name} #{lauf + 1}: {len(richtig)}/6 in {dauer:.0f} s"
                      f"{'  falsch: ' + json.dumps(falsch, ensure_ascii=False) if falsch else ''}", flush=True)

    namen = list(wahrheit)
    print("\n| Weg | Modell | " + " | ".join(wahrheit[n]["art"] for n in namen)
          + " | Felder gesamt | Abbrueche | Zeit je Beleg |")
    print("|---|---|" + "---|" * len(namen) + "---|---|---|")
    for (weg, modell), je in ergebnis.items():
        zellen, summe, zeit, anzahl, abbrueche = [], 0, 0.0, 0, 0
        for n in namen:
            laeufe = je.get(n, [])
            if not laeufe:
                zellen.append("–")
                continue
            r = sum(x for x, _, _ in laeufe) / len(laeufe)
            zellen.append(f"{r:.1f}/6" if WIEDERHOLUNGEN > 1 else f"{r:.0f}/6")
            summe += sum(x for x, _, _ in laeufe)
            zeit += sum(t for _, t, _ in laeufe)
            anzahl += len(laeufe)
            abbrueche += sum(1 for _, _, a in laeufe if a)
        gesamt = f"{summe}/{anzahl * 6} ({100 * summe / max(1, anzahl * 6):.0f} %)"
        print(f"| {'Bild direkt' if weg == 'bild' else 'Texterkennung + Textmodell'} | `{modell}` | "
              + " | ".join(zellen) + f" | {gesamt} | {abbrueche} von {anzahl} | {zeit / max(1, anzahl):.0f} s |")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
