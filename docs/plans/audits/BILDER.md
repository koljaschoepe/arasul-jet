# Bildbelege der Abnahmen

Die Bildschirmfotos der Abnahmen bis zum 06.10.2026 (457 Bilder unter
`audits/`, dazu `frontend-review.html`, zusammen rund 42 MB) liegen nicht mehr
im Arbeitsbaum, sondern nur noch in der Git-Historie. Kein Code las sie, und
sie machten 42 von 43 MB unter `docs/` aus (Totcode-Prüfung vom 06.10.2026,
Befund 62). Die Berichte daneben bleiben; ein Verweis auf ein Bild darin zeigt
auf diese Historie.

Ein Bild zurückholen, etwa für einen Vergleich:

```bash
git log --diff-filter=D --name-only -- docs/plans/audits/ | grep '\.png$'
git checkout <commit>^ -- docs/plans/audits/<ordner>/<bild>.png
```

`<commit>` ist der Commit, der sie entfernt hat (`git log -1 --diff-filter=D -- docs/plans/audits/`).
Die `*-bilder.mjs`-Skripte legen neue Bilder weiter unter `audits/<datum>-…/` ab.
