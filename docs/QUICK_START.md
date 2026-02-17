# Arasul Platform - Schnellstart-Anleitung

> Ihr Arasul Jetson AGX Orin ist vorkonfiguriert und einsatzbereit.
> Folgen Sie diesen Schritten, um das System in Betrieb zu nehmen.

---

## 1. Geraet anschliessen

1. **Ethernet-Kabel** in den LAN-Port des Jetson stecken
2. **Netzteil** anschliessen - das Geraet startet automatisch
3. **Warten Sie ca. 2-3 Minuten**, bis alle Dienste gestartet sind

## 2. IP-Adresse finden

Das Geraet erhaelt automatisch eine IP-Adresse von Ihrem Router (DHCP).

**Option A: Direkt am Geraet (wenn Monitor angeschlossen)**

```
ip addr show eth0
```

**Option B: Im Router nachschauen**

- Oeffnen Sie die Verwaltungsoberflaeche Ihres Routers
- Suchen Sie nach einem Geraet namens `arasul-*`

**Option C: Netzwerk-Scan**

```
# Linux/Mac:
ping arasul.local

# Oder mit nmap:
nmap -sn 192.168.1.0/24
```

## 3. Im Browser oeffnen

1. Oeffnen Sie einen Webbrowser (Chrome, Firefox, Edge)
2. Geben Sie die IP-Adresse ein: `http://<IP-Adresse>`
3. Der **Setup-Assistent** fuehrt Sie durch die Ersteinrichtung:
   - Admin-Passwort festlegen
   - Netzwerk pruefen
   - KI-Modell auswaehlen

## 4. Anmelden

- **Benutzername:** `admin`
- **Passwort:** Wurde Ihnen bei der Uebergabe mitgeteilt

## 5. Erste Schritte

Nach der Ersteinrichtung koennen Sie sofort:

| Funktion          | Beschreibung                                   |
| ----------------- | ---------------------------------------------- |
| **Chat**          | KI-Assistent fuer Fragen und Analysen          |
| **Dokumente**     | Dateien hochladen und mit KI durchsuchen (RAG) |
| **Datentabellen** | Strukturierte Daten verwalten                  |
| **Telegram-Bot**  | Eigenen Telegram-Bot erstellen und verbinden   |
| **Einstellungen** | System konfigurieren und anpassen              |

---

## Hilfe & Support

Bei Problemen siehe: [Troubleshooting-Guide](TROUBLESHOOTING.md)
