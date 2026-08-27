# packaging/

Hier liegen die **systemd-Units** des Geräts, und sonst nichts.

```
arasul-platform/etc/systemd/system/
  arasul-platform.service    fährt den Stapel nach einem Neustart geordnet hoch
                             (scripts/system/ordered-startup.sh)
  docker-watchdog.service    + .timer
  deadman-switch.service     + .timer
```

Wer sie installiert:

- `install.sh` (der Einstiegspunkt des Auslieferungsartefakts) installiert
  `arasul-platform.service` und setzt dabei das echte Installationsverzeichnis
  und den echten Benutzer ein — die Datei im Repo trägt `/opt/arasul` als
  Platzhalter.
- `./arasul bootstrap` installiert die beiden Timer samt ihrer Services
  (`install_systemd_timers`).

## Was hier bis zum 27.08.2026 lag

`build_deb.sh` und `arasul-platform/DEBIAN/` — ein Debian-Paket der Plattform.
Niemand rief das Skript auf, keine Zeile Dokumentation beschrieb den Weg, und
die Auslieferung ist seit Phase C10 ein Tarball mit einem Einstiegspunkt
([`docs/ops/AUSLIEFERUNG.md`](../docs/ops/AUSLIEFERUNG.md)). Ein zweites
Paketformat daneben wäre ein zweiter Weg, auf dem ein Gerät anders aussieht.

Die Unit-Dateien haben den Umbau überlebt, weil sie gebraucht werden: ohne sie
kommt ein Gerät nach einem Stromausfall zwar hoch (die Container tragen
`restart: always`), aber alle dreizehn gleichzeitig auf einem gerade erst
gestarteten Orin.
