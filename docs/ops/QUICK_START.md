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
2. Geben Sie den Geraetenamen ein: `https://arasul.local`
   (bzw. `https://<hostname>.local`, falls Sie beim Setup einen eigenen
   Hostnamen vergeben haben). Nur falls der Name nicht aufloest, ersatzweise
   `https://<IP-Adresse>`. Beim ersten Aufruf zeigt der Browser eine
   Zertifikatswarnung (normal bei selbstsigniertem LAN-Zertifikat) — bestaetigen.
3. Der **Setup-Assistent** fuehrt Sie durch die Ersteinrichtung:
   - Admin-Passwort festlegen
   - Netzwerk pruefen
   - KI-Modell auswaehlen

## 4. Anmelden

- **Benutzername und Passwort:** die, die Sie im Setup-Assistenten selbst
  vergeben haben.

Das Geraet wird **ohne Konto** ausgeliefert. Wer als Erster im Netz die
Oberflaeche oeffnet, legt es an; danach ist dieser Weg zu, damit kein spaeterer
Besucher ein eingerichtetes Geraet uebernehmen kann. Es gibt also kein
Werkspasswort, das Ihnen jemand mitteilen muesste.

## 5. Erste Schritte

Nach der Ersteinrichtung koennen Sie sofort:

| Funktion          | Beschreibung                                             |
| ----------------- | -------------------------------------------------------- |
| **Modelle**       | KI-Modelle aus dem Katalog laden und als Standard setzen |
| **Einstellungen** | System konfigurieren, Fernzugriff, Updates, Sicherung    |

---

## Hilfe & Support

Bei Problemen siehe: [Troubleshooting-Guide](TROUBLESHOOTING.md)
