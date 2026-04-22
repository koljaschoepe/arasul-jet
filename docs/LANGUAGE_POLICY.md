# Language Policy

Arasul is a commercial product sold to German-speaking enterprises, but the
engineering team works in English. This policy defines which language to use
where, so that:

- Customers and admins always see German in the shipped product.
- Developers and AI assistants never need to translate domain concepts to
  reason about the code.

## The rule

| Audience                                        | Language    |
| ----------------------------------------------- | ----------- |
| End users / customers (UI, emails, PDF exports) | **Deutsch** |
| Platform admins (admin dashboards, handbook)    | **Deutsch** |
| Developers (code, code comments, PRs, commits)  | **English** |
| AI context files (`.claude/`, `CLAUDE.md`)      | Mixed OK¹   |
| Developer docs (`docs/DEVELOPMENT.md`, API ref) | **English** |
| Ops/Admin docs (`docs/ADMIN_HANDBUCH.md` …)     | **Deutsch** |

¹ AI context was historically written in German to match the product domain.
New content should be English; existing German text is kept until it is
naturally touched (don't rewrite just to translate).

## What this means in practice

**User-facing strings** — toasts, labels, validation messages, email templates,
PDF exports — **always German**. Example:

```tsx
// good
toast.error('Das Passwort muss mindestens 8 Zeichen haben.');
// bad
toast.error('Password must be at least 8 characters.');
```

**Log messages and errors thrown from backend code** — **English**. These are
developer-facing, even when they originate from a user action:

```javascript
// good — developer sees this in logs
logger.error('Failed to read document chunk', { documentId, err });
throw new ValidationError('name is required');
// bad — translated error in log makes grepping harder
logger.error('Fehler beim Lesen des Dokument-Chunks', { documentId, err });
```

**Note:** `ValidationError` messages are surfaced to the user. When throwing
one, write it in German so the toast the user sees reads naturally:

```javascript
if (!req.body.email) throw new ValidationError('E-Mail-Adresse ist erforderlich');
```

If that feels contradictory — it is. The heuristic: what will the user read?
If the string lands in a toast/modal/email, German. If it lands in a log file
or a developer's terminal, English.

**Commit messages, PR descriptions, code comments** — English. Uses the
`feat|fix|docs|refactor|test|chore:` convention from `CLAUDE.md`.

**Docs** — match the audience. `docs/DEVELOPMENT.md` is English. `docs/ADMIN_HANDBUCH.md`
is German. The `docs/INDEX.md` landing page is bilingual (EN headings, DE
summaries OK) because both audiences read it.

## When in doubt

Ask: _who is the primary reader, at the moment they read this string?_

- Customer / admin → German.
- Developer (you, future-you, a teammate, an AI assistant) → English.
- Both → write the dev-facing bit in English and the user-facing string (toast,
  label) in German.
