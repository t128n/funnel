---
"funnel": patch
---

Manage the public comment lifecycle on an issue. Authors can edit and delete their own GitHub comments (admins can delete any comment), with GitHub remaining authoritative for permissions and clear errors on refusal. Comments gain reaction chips and a picker for the standard GitHub reactions, backed by an additive mirror summary and durable per-user viewer state. The composer autocompletes `@logins` from the repository's assignable users and inserts the mention at the caret. Comment writes stay separate from internal work notes, and every change is applied optimistically and reconciled by the normal single-issue refresh.
