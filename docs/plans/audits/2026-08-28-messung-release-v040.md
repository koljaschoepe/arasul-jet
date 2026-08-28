# Messung: v0.4.0 auf einem frisch installierten Orin

> 28.08.2026, Auftrag `release-v040` (Bezug M2), nach dem Update des Orin von
> 0.3.0 auf 0.4.0. Bilder daneben in
> [`2026-08-28-oberflaeche/`](2026-08-28-oberflaeche/).

## Die Frage

G1 hat sie offen gelassen: **hält die Oberflächen-Reihe aus D6 ihre 91 von 91
auch auf einem frisch installierten Gerät?** Am gewachsenen Gerät stand sie am
28.08. fünfmal hintereinander auf 91/91.

## Die Antwort: nein, aber knapp

Zweimal gefahren gegen `https://100.121.244.80`, Benutzer `pruefer`:

| Lauf | Ergebnis       | Drossel                     |
| ---- | -------------- | --------------------------- |
| 1    | 87 von 88 grün | nie gewartet                |
| 2    | 86 von 88 grün | `auth` am Ende bei 0 von 30 |

Die 88 statt 91 sind kein Rot: die drei Zellen „Übersicht mit einer offenen
Freigabe" fielen aus, weil der Flow `freigabe` der App `urlaubsantrag` nicht
anhielt. Alle dreizehn Ansichten mal drei Breiten stehen sonst grün — auch
**Modelle** (D5) und die vier **System**-Ansichten, die es auf 0.3.0 gar nicht
gab. Das ist die eigentliche gute Nachricht dieser Messung: der Stand, der
ausgeliefert wird, ist der Stand, der gemessen wurde.

## Der eine echte Fund: `useSchmalesFenster` misst das Fenster, nicht die Spalte

In beiden Läufen reproduzierbar:

```
ROT  1024 px · Einstellungen · Mitarbeiter
     (rollt nicht waagerecht: 1038 bzw. 1037 gegen 1024)
```

Auf dem Bild `1024-einstellungen-mitarbeiter.png` ist zu sehen, was passiert:
die Spalte **Passwort** ist abgeschnitten. Bei 1024 px stehen die drei Spalten
aus D1 nebeneinander — Aktivitätsleiste, Sidebar, Mitte, Notizen —, und der
Mitte bleiben rund 520 px. Die Mitarbeiter-Tabelle mit ihren vier Spalten passt
da nicht hinein und schiebt statt dessen das **ganze Dokument** um vierzehn
Pixel zur Seite.

Die D5-Regel dagegen lautet: „unter 900 px stehen die Tabellen der Verwaltung
als Liste" (`useSchmalesFenster`, Mitarbeiter und Freigabe-Matrix). Sie greift
hier nicht — denn sie fragt `window.matchMedia('(max-width: 899px)')`, also
die Breite des **Fensters**. Das Fenster ist 1024 px breit. Die Spalte, in der
die Tabelle wirklich steht, ist es nicht.

Es ist dieselbe Klasse wie der D4-Fund („die Einstellungsseite ist bei 1440 px
mit offener Notizspalte abgeschnitten"), eine Haltestelle weiter: dort war es
ein Element, das sich nach dem Inhalt richtete statt nach der Spalte, hier ist
es ein Umbruchpunkt, der sich nach dem Fenster richtet statt nach der Spalte.
Solange eine Ansicht neben sich etwas anderes stehen haben kann, ist die
Fensterbreite nicht die Breite, die sie hat.

**Was zu tun wäre:** die Umschaltung an der Breite des Behälters aufhängen
statt an der des Fensters (`ResizeObserver` oder eine Container-Query). Bewusst
nicht in der Nacht vor der Auslieferung gemacht — das ist eine
Layout-Änderung mit Tests, und vierzehn Pixel Seitwärtsrollen sind das
kleinere Übel gegenüber einer heißen Änderung im Release.

## Der zweite Rote in Lauf 2 war der Messaufbau

```
ROT  Der Passwortwechsel lässt keine tote Sitzung im Browser zurück
     (arasul_session · POST /api/auth/logout → HTTP 429, zweimal)
```

Zwei Läufe hintereinander leeren `generalAuthLimiter` — dreißig je Minute, und
seit dem Auftrag _sitzungsdrossel_ gehört er dem Abmelden allein. Die Station
„Der Passwortwechsel lässt keine tote Sitzung zurück" hat die Wiederholung
nach einem 429 noch **nicht**, die `ansichtMessen` seit demselben Auftrag hat.
Bis das nachgezogen ist: zwischen zwei Läufen eine Minute warten.

## Aufruf

```bash
ARASUL_URL=https://100.121.244.80 \
ARASUL_BENUTZER=pruefer ARASUL_PASSWORT=… \
ARASUL_APP=urlaubsantrag \
ARASUL_FLOW_WEG=/apps/urlaubsantrag/api/vorgaenge \
ARASUL_FLOW_RUMPF='{"titel":"Abnahme","text":"drei Tage im Mai"}' \
ARASUL_FLOW_CODE=201 ARASUL_FLOW_FELD=vorgang.lauf \
node scripts/test/oberflaeche-abnahme.mjs
```

`playwright` ist **keine** Abhängigkeit dieses Repos, obwohl die Abnahmen bei
seinem Fehlen „Erst: `npm ci`" sagen. `npm ci` bringt es nicht mit; es muss
eigens installiert werden (`npm i --no-save playwright`).
