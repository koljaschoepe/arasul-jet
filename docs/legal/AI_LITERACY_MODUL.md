# KI-Kompetenz-Modul (AI Literacy) für Mitarbeitende

> ⚠️ **DRAFT** - Diese Vorlage erfordert anwaltliche Prüfung vor Produktiv-Einsatz.

**Letzte Aktualisierung:** 2026-05-03
**Rechtsgrundlage:** Art. 4 Verordnung (EU) 2024/1689 ("EU AI Act")
**Adressat:** Mitarbeiter des Auftraggebers, die mit der Arasul-Box arbeiten.
**Format:** Onboarding-Lesepflicht, Dauer ca. 20 Minuten.

---

## Lernziele

Nach der Bearbeitung dieses Moduls können Sie:

- die Grundzüge generativer KI in eigenen Worten erklären,
- die Arasul-Box sicher und produktiv im Arbeitsalltag einsetzen,
- typische Risiken erkennen (insbesondere Halluzinationen),
- Daten sachgerecht klassifizieren und schützen,
- Probleme an die zuständige Stelle melden.

---

## Abschnitt 1 - Was ist KI? Und insbesondere: Was ist ein LLM?

Künstliche Intelligenz ist ein Sammelbegriff für Verfahren, mit denen Computer Aufgaben übernehmen, die früher dem menschlichen Denken vorbehalten waren. Der heute wichtigste Vertreter sind sogenannte **Large Language Models** (LLM). Ein LLM ist - vereinfacht gesagt - ein sehr großes statistisches Modell, das gelernt hat, das nächste Wort in einem Text vorherzusagen. Wenn Sie also eine Frage stellen, "errät" das Modell Wort für Wort die wahrscheinlichste Antwort auf Basis seines Trainingsmaterials.

Wichtig: Ein LLM **versteht** den Inhalt nicht im menschlichen Sinne. Es hat keinen "Common Sense", keine Lebenserfahrung und keinen Begriff von Wahrheit. Es produziert Texte, die sprachlich richtig klingen - das ist nicht dasselbe wie inhaltlich korrekt. Diese Erkenntnis ist die wichtigste Lektion dieses Moduls.

Die Arasul-Box läuft **lokal in Ihrem Betrieb**. Im Gegensatz zu Cloud-Diensten wie ChatGPT verlassen Ihre Daten das Haus nicht. Das ist ein erheblicher Vorteil für die Wahrung von Mandanten-, Patienten- oder Steuergeheimnissen.

---

## Abschnitt 2 - Wie nutze ich die Arasul-Box?

Die Arasul-Box bietet im Wesentlichen drei Funktionsbereiche, die Sie über das Web-Dashboard erreichen.

### 2.1 Chat

Ein dialogorientierter Bereich, in dem Sie Fragen stellen oder Texte zur Bearbeitung übergeben können. Der Chat eignet sich für Recherche-Fragen, Formulierungs-Vorschläge, Vertrags-Erläuterungen oder Übersetzungen. Achten Sie darauf, präzise Fragen zu stellen ("Welche Klauseln in diesem Mietvertrag weichen von den gesetzlichen Standards ab?") statt allgemeiner ("Was kannst du mir zum Mietrecht sagen?").

### 2.2 Dokumenten-Suche (RAG)

Hier können Sie eigene Dokumente in sogenannte **Knowledge Spaces** hochladen. Die Box erstellt daraus durchsuchbare Indizes. Wenn Sie nun eine Frage stellen, durchsucht das System zunächst Ihre Dokumente und antwortet auf Basis der gefundenen Stellen. Die zugrundeliegenden Quellen werden in der Antwort angezeigt - **nutzen Sie diese Quellenangabe konsequent**, um die Antwort zu prüfen.

### 2.3 Workflows (n8n)

Über vorbereitete Workflows können wiederkehrende Aufgaben automatisiert werden, etwa "E-Mail eingehen → zusammenfassen → in Mandantenakte ablegen". Workflows werden in der Regel von Ihrem IT-Verantwortlichen eingerichtet. Sprechen Sie mit ihm, wenn Sie Automatisierungs-Ideen haben.

---

## Abschnitt 3 - Was darf NICHT in die KI-Box?

Auch wenn die Verarbeitung lokal stattfindet: Bestimmte Daten gehören nicht in eine KI-Eingabe, weil sie weder fachlich noch organisatorisch dort verarbeitet werden sollten.

- **Zugangsdaten und Passwörter** Ihrer Geschäftssysteme - die KI braucht sie nicht und sie haben keinen Verarbeitungsgrund.
- **Kreditkartendaten, vollständige Bankdaten, IBAN-Listen Dritter** in Klartext.
- **Personalakten anderer Mitarbeitender**, sofern dies nicht Teil eines berechtigten Mandats ist.
- **Daten, für die keine Rechtsgrundlage zur Verarbeitung vorliegt** (z. B. Daten, die ein Mandant Ihnen ausdrücklich nicht zur KI-Bearbeitung überlassen hat).
- **Inhalte aus offensichtlich rechtswidrigen Quellen** (z. B. gestohlene Datensätze).

Im Zweifel gilt: Wenn Sie die Information nicht auch an einen externen Berufskollegen schicken würden, gehört sie nicht in die Box.

---

## Abschnitt 4 - Was ist eine Halluzination?

Eine **Halluzination** ist eine Antwort der KI, die auf den ersten Blick richtig wirkt, aber inhaltlich falsch oder frei erfunden ist. Das LLM generiert Texte auf Basis statistischer Muster - wenn es das exakte Wissen nicht hat, "erfindet" es eine plausibel klingende Antwort, einschließlich erfundener Paragrafen, erfundener Urteile und erfundener Studien.

**Erkennungs-Hinweise:**

- Konkrete Aktenzeichen, Fundstellen oder Studien-Titel ohne weitere Belegmöglichkeit sind verdächtig.
- Allzu glatte, aalglatte Antworten ohne Einschränkungen ("Selbstverständlich gilt hier eindeutig...") sind verdächtig.
- Wenn die KI Ihnen einen Paragrafen zitiert, lesen Sie ihn im Originaltext nach.
- Im RAG-Modus: Vertrauen Sie nur der Antwort, deren Quellen Sie selbst gegengelesen haben.

**Faustregel:** Behandeln Sie KI-Antworten wie den Vorschlag eines noch ungeprüften Praktikanten - hilfreich als Ausgangspunkt, nie als Endergebnis. Die Verantwortung für jede Aussage gegenüber Mandanten, Patienten oder Behörden liegt **bei Ihnen als Berufsträger**.

---

## Abschnitt 5 - Datenschutz und Schweigepflicht

Sie sind als Mitarbeiter eines Berufsgeheimnisträgers in besonderer Weise zur Verschwiegenheit verpflichtet (§ 203 StGB). Die Arasul-Box wurde so konzipiert, dass die Daten lokal verbleiben - das ist die **technische Voraussetzung**, nicht der Ersatz für Ihre persönliche Sorgfalt.

- Schließen Sie Ihren Arbeitsplatz ab, wenn Sie ihn verlassen.
- Wählen Sie ein starkes Passwort und wechseln Sie es regelmäßig.
- Geben Sie Ihre Zugangsdaten an niemanden weiter - auch nicht an Kollegen oder vermeintliche Support-Mitarbeiter.
- Klicken Sie nicht auf verdächtige Links in E-Mails, die angeblich von "Arasul" stammen. Echter Support fragt Sie nicht per E-Mail nach Ihrem Passwort.
- Nutzen Sie unterschiedliche Knowledge Spaces für unterschiedliche Mandate - so verhindern Sie, dass Inhalte versehentlich in fremden Mandaten auftauchen.

---

## Abschnitt 6 - Probleme melden

Wenn Sie ein Verhalten der Box bemerken, das Ihnen ungewöhnlich vorkommt - z. B. unsinnige Antworten, eine Antwort mit falscher Mandanten-Zuordnung, fehlende Inhalte oder ein Sicherheits-Hinweis - melden Sie dies umgehend.

- Erste Anlaufstelle: **Ihr IT-Verantwortlicher** im Haus.
- Bei datenschutzrelevanten Vorfällen: **Datenschutzbeauftragter Ihres Hauses**.
- Bei Verdacht auf eine Datenschutzverletzung muss diese ggfs. innerhalb von 72 Stunden an die Aufsichtsbehörde gemeldet werden - daher: **Lieber einmal zu viel melden als zu wenig.**

---

## Abschnitt 7 - Selbst-Quiz (5 Fragen)

> Hinweis: Dieses Quiz dient der Selbstkontrolle und dem internen Schulungsnachweis. Es ist **kein zertifiziertes Prüfungsverfahren**. Die Antworten finden Sie am Ende.

**Frage 1:** Versteht ein LLM den Inhalt einer Frage so wie ein Mensch?

a) Ja, es denkt wie ein Mensch.
b) Nein, es sagt das wahrscheinlichste nächste Wort statistisch voraus.
c) Es versteht nur Deutsch und Englisch, sonst nicht.

**Frage 2:** Sie erhalten von der KI eine Antwort mit einem Aktenzeichen ("BGH, Urt. v. 12.03.2021 - VIII ZR 99/20"). Was tun Sie?

a) Übernehmen Sie es ungeprüft in Ihren Schriftsatz.
b) Verifizieren Sie das Urteil in einer Rechtsdatenbank.
c) Fragen Sie die KI noch einmal, ob das stimmt.

**Frage 3:** Welche der folgenden Daten gehören NICHT in die KI-Box?

a) Ein Mandantenschriftsatz aus einem laufenden Verfahren.
b) Das Passwort Ihres Praxis-Verwaltungssystems.
c) Eine Befund-Zusammenfassung zur Prüfung.

**Frage 4:** Was ist eine "Halluzination" im KI-Kontext?

a) Ein Hardware-Defekt.
b) Eine inhaltlich falsche, aber plausibel klingende Antwort.
c) Eine Antwort, die sehr lange dauert.

**Frage 5:** Wo melden Sie eine vermeintliche Datenschutzverletzung zuerst?

a) Direkt bei der Aufsichtsbehörde.
b) Beim Datenschutzbeauftragten Ihres Hauses bzw. Ihrem IT-Verantwortlichen.
c) Bei Arasul.

---

## Auflösung

1: b - 2: b - 3: b - 4: b - 5: b

---

## Schulungsnachweis

| Position               | Name | Datum | Unterschrift |
| ---------------------- | ---- | ----- | ------------ |
| Mitarbeiter/in         |      |       |              |
| Vorgesetzte/r oder DSB |      |       |              |

Der Auftraggeber bewahrt diesen Nachweis im Personal- bzw. Datenschutz-Ordner auf. Empfehlung: Wiederholung mindestens **alle 24 Monate** und bei wesentlichen Funktionsänderungen der Box.

---

**Weiterführende Hinweise:**

- [DATENSCHUTZERKLAERUNG.md](./DATENSCHUTZERKLAERUNG.md) - Datenschutzerklärung des Auftraggebers
- [AI_ACT_SELF_DECLARATION.md](./AI_ACT_SELF_DECLARATION.md) - EU-AI-Act-Selbsterklärung des Anbieters
- [AVV_TEMPLATE.md](./AVV_TEMPLATE.md) - Auftragsverarbeitungs-Vertrag
