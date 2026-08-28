#!/usr/bin/env bash
# Prueft einen Release-Tag, bevor daraus ein Artefakt wird.
#
# WARUM ES DIESE DATEI GIBT (28.08.2026, Auftrag release-v040):
# Am Abend des 28.08. installierte das Kit v0.3.0 auf den Orin, und was dort
# ankam, war der Stand vom Vormittag -- D4 statt D7 plus G1. Kein Tag stand
# falsch: v0.1.0, v0.2.0 und v0.3.0 laufen sauber vorwaerts, jeder ist
# Vorfahre von main. Der Fehler war eine Unterlassung. Zwischen v0.3.0 (11:45)
# und main (22:25) lagen zehn Merges und 223 geaenderte Dateien, und getaggt
# hat sie niemand. Das Kit holte das Neueste, was es gab, und das war elf
# Stunden alt.
#
# Deshalb prueft der Release-Lauf drei Dinge, und die dritte ist die, die den
# Tag gekostet hat:
#
#   1. Der Tag-Commit ist Vorfahre von origin/main. Ein Tag auf einem Zweig,
#      der nie gemergt wurde, liefert Code aus, den niemand geprueft hat.
#   2. Der Tag-Commit ist Nachfahre des vorigen Tags. Sonst nimmt eine hoehere
#      Nummer Arbeit zurueck, die eine niedrigere schon hatte.
#   3. Der Tag-Commit ist die Spitze von origin/main. Sonst faehrt ein Kunde
#      mit einem Stand los, der im Repo laengst ueberholt ist.
#
# Die dritte Regel darf gebrochen werden -- ein Nachtrag auf einen aelteren
# Punkt ist ein legitimer Vorgang. Aber nicht aus Versehen: dafuer braucht es
# einen ANNOTIERTEN Tag, in dessen Nachricht eine Zeile `Nachtrag: <Grund>`
# steht. Der Grund haengt damit fuer immer am Tag-Objekt und nicht in einem
# Lauf-Protokoll, das in dreissig Tagen weg ist.
#
# Aufruf: scripts/deploy/tag-pruefen.sh <tagname> [<basis-ref>]

set -euo pipefail

TAG="${1:?Aufruf: tag-pruefen.sh <tagname> [<basis-ref>]}"
BASIS="${2:-origin/main}"

fehler() {
  echo "FEHLER: $*" >&2
  exit 1
}

git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null \
  || fehler "Tag \"${TAG}\" gibt es in diesem Checkout nicht."
git rev-parse -q --verify "${BASIS}^{commit}" >/dev/null \
  || fehler "\"${BASIS}\" gibt es in diesem Checkout nicht (fetch fehlt?)."

commit="$(git rev-parse "${TAG}^{commit}")"
spitze="$(git rev-parse "${BASIS}^{commit}")"

echo "Tag:   ${TAG} -> ${commit:0:8}  $(git log -1 --format=%s "$commit" | cut -c1-70)"
echo "Basis: ${BASIS} -> ${spitze:0:8}"
echo

# --- 1. Vorfahre von main ------------------------------------------------
if ! git merge-base --is-ancestor "$commit" "$spitze"; then
  fehler "$(cat <<TEXT
${TAG} zeigt auf ${commit:0:8}, und dieser Commit ist kein Vorfahre von
${BASIS}. Er liegt also auf einem Zweig, der nie gemergt wurde. Ein Release
liefert nur aus, was auf main steht.
TEXT
)"
fi
echo "  [ok] ${commit:0:8} ist Vorfahre von ${BASIS}."

# --- 2. Nachfahre des vorigen Tags ---------------------------------------
# Vorgaenger ist der hoechste Tag, dessen Nummer KLEINER ist als diese --
# nicht der hoechste ueberhaupt. Sonst faellt jede Nachpruefung eines alten
# Tags gegen einen neueren, der voellig zu Recht nicht in seiner
# Vorgeschichte liegt.
# `|| true` ist nicht Bequemlichkeit: bei genau einem Tag im Repo findet
# `grep -vxF` nichts, gibt 1 zurueck, und `set -o pipefail` plus `set -e`
# beenden das Skript hier lautlos MIT Rueckgabe 0 -- die Sperre haette dann
# gewunken, ohne Regel 2 und 3 ueberhaupt zu stellen. Genau so ist sie im
# Selbsttest am 28.08.2026 aufgefallen.
vorher="$(git tag --list 'v*' \
          | { grep -vxF "$TAG" || true; } \
          | { cat; echo "$TAG"; } | sort -V \
          | sed -n "/^$(printf '%s' "$TAG" | sed 's/[.[\*^$\/]/\\&/g')\$/q;p" \
          | tail -n1)"

if [ -z "$vorher" ]; then
  echo "  [ok] Kein frueherer Tag -- das ist der erste."
elif git merge-base --is-ancestor "${vorher}^{commit}" "$commit"; then
  echo "  [ok] Vorgaenger ${vorher} -> $(git rev-parse --short "${vorher}^{commit}") liegt im Baum."
else
  fehler "$(cat <<TEXT
${TAG} zeigt auf ${commit:0:8}, aber der Vorgaenger ${vorher}
($(git rev-parse --short "${vorher}^{commit}")) liegt nicht in dessen
Vorgeschichte. Die hoehere Nummer wuerde Arbeit zuruecknehmen, die die
niedrigere schon ausgeliefert hat.
TEXT
)"
fi

# --- 3. Spitze von main --------------------------------------------------
rueckstand="$(git rev-list --count "${commit}..${spitze}")"
if [ "$rueckstand" -eq 0 ]; then
  echo "  [ok] ${commit:0:8} ist die Spitze von ${BASIS}."
  exit 0
fi

merges="$(git log --first-parent --format='    %h %ci %s' "${commit}..${spitze}" | cut -c1-100)"

# Ein annotierter Tag mit `Nachtrag:` in der Nachricht darf hinter main sitzen.
# `grep -q <<<` und nicht `... | grep -q`: unter `pipefail` steigt grep beim
# ersten Treffer aus, der Erzeuger schreibt in ein totes Rohr und endet mit
# 141, und die Bedingung wird falsch, GERADE weil der Text da ist
# (scripts/test/rohrbruch.py).
nachricht="$(git tag -l --format='%(contents)' "$TAG")"
if [ "$(git cat-file -t "refs/tags/${TAG}")" = "tag" ] \
   && grep -qiE '^[[:space:]]*Nachtrag:[[:space:]]*\S' <<<"$nachricht"; then
  grund="$(grep -iE '^[[:space:]]*Nachtrag:' <<<"$nachricht" | head -n1 || true)"
  echo "  [ok] ${rueckstand} Commit(s) hinter ${BASIS}, aber als Nachtrag erklaert:"
  echo "       ${grund}"
  exit 0
fi

fehler "$(cat <<TEXT
${TAG} liegt ${rueckstand} Commit(s) hinter ${BASIS}. Wer das installiert,
bekommt nicht den Stand des Produkts. Fehlende Merges:

${merges}

Das ist genau der Fall vom 28.08.2026: v0.3.0 war beim Ausliefern elf Stunden
und zehn Merges alt, und niemand hat es gemerkt, bis am Geraet die halbe
Oberflaeche fehlte.

Gemeint? Dann den Tag als NACHTRAG setzen, mit Grund:

    git tag -d ${TAG} && git push origin :refs/tags/${TAG}
    git tag -a ${TAG} ${commit:0:8} -m "Nachtrag: <warum dieser aeltere Punkt>"
    git push origin ${TAG}

Sonst den Tag auf die Spitze von ${BASIS} setzen (${spitze:0:8}).
TEXT
)"
