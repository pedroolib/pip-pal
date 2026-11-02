# Burbuja del triage

Borrador en revisión (2026-11-02). Es lo que aparece junto al cursor al seleccionar texto y pulsar `Control+Shift+Space`. Los datos salen de `Triage` (`src/shared/schemas.ts`); qué campo se muestra y por qué está en [DECISIONS.md §4](../DECISIONS.md). Este archivo dice cómo se ve.

## Ideas

**1. La fecha dice qué es.** `dates.ts` ya distingue una fecha de inicio ("starting Monday") de una fecha límite, y en el triage `deadline.explicit` solo es `false` por esa razón. La interfaz lo usa sin preguntarle nada nuevo a Jev:

- `explicit: true` → "Due Fri, Nov 6"
- `explicit: false` → "Before Mon, Nov 9" (el mensaje dice cuándo empieza algo, así que lo pedido va antes)

No se pregunta a Jev porque el código ya lo sabe con una regla. Jev elige cuál de las fechas es la límite, y eso no cambia.

**2. La duda apunta a "Ask, don't guess".** En vez de "not sure", el campo dudoso lleva el mismo ícono `?` del botón de preguntas y el texto "worth asking". A su vez, el botón dice qué va a preguntar ("About: when it's due"). Así se ve que la duda y la pregunta son la misma cosa. Solo pasa con lo que el botón de preguntas sabe preguntar: la fecha (`deadline`) y qué o con quién (`what_or_who`). Si Jev duda de otro campo (por ejemplo `needsReply`), la frase lo dice con palabras ("Probably just a confirmation") y no lleva el `?`. Si el triage no ofrece el botón de preguntas, no hay `?` en ningún campo.

**3. La cita va con lo que respalda.** La frase de `evidence.tone` va pegada a la etiqueta del tono, como la razón de ese tono: Friendly · "Hey Sam, heads up". Si el tono es neutral no hay cita (regla 5).

**4. La fecha completa y corta.** Día de la semana, día y mes abreviado, con `Intl.DateTimeFormat` en el idioma de la interfaz: "Mon, Nov 9". Así "Monday" no se lee como hoy. "Today" y "Tomorrow" se escriben con palabras. Si hay hora: "Fri, Nov 6, 3:00 PM".

**5. La etiqueta de cambio va dentro de su botón**, como encabezado, igual que "ASK, DON'T GUESS" en el suyo. Así ya no queda flotando fuera del botón.

## Estructura

```
 (Pip)  ┌─────────────────────────────────────────────┐
        │ 📅  Before Mon, Nov 9                    ×  │
        │     (?) worth asking                        │
        │ 💬  Probably just a confirmation            │
        │ 🙂  Friendly · "Hey Sam, heads up"          │
        │ ─────────────────────────────────────────── │
        │ ┌─────────────────────────────────────────┐ │
        │ │ ⇄  CHANGE: PROJECT                      │ │
        │ │    Plan for this change                 │ │
        │ └─────────────────────────────────────────┘ │
        │ ┌─────────────────────────────────────────┐ │
        │ │ ☰  Break it into steps                  │ │
        │ └─────────────────────────────────────────┘ │
        │ ┌─────────────────────────────────────────┐ │
        │ │ (?) ASK, DON'T GUESS                    │ │
        │ │     Help me ask what's unclear          │ │
        │ │     About: when it's due                │ │
        │ └─────────────────────────────────────────┘ │
        └─────────────────────────────────────────────┘
```

Arriba van los hechos (cuándo, si hay que contestar, con qué tono) y abajo las acciones, en el orden de `actions`. Un botón `maybe` va con menos peso visual que un `primary`, pero se ve igual de clickeable.

## Reglas de cada línea

| Línea | Cuándo aparece | Texto |
|---|---|---|
| Fecha | Si hay `deadline` | "Due {date}" o "Before {date}" |
| Urgencia | Solo si **no** hay `deadline` | "Today", "This week" o "No rush" |
| Respuesta | Siempre | "Needs a reply", "Just confirm" o "No reply needed"; si Jev duda: "Probably needs a reply", etc. |
| Tono | Siempre | La etiqueta del tono; la cita solo si no es neutral |
| A quién va | Solo si `addressee` es `group` ("This is for the whole team") o `nobody` ("Not addressed to anyone") | — |
| Remitente | Solo si `senderRole` no es null | "From: {role}", discreto |
| `?` worth asking | Fecha dudosa (`deadline` en `unsure` o `deadlineUnclear` alto) y el botón de preguntas existe | "worth asking" |

## Prompt para Claude Design

> Design the **triage bubble** for Pip, a desktop companion for autistic adults in their first year of work. Use my design system (Harbor).
>
> **Context.** The person selects a work message in any app (Slack, email) and presses a hotkey. A small Pip character appears next to the cursor with this bubble in under a second. The bubble says what the message means for them and offers 1–3 actions. Each action opens its own card later; this brief is only the bubble. The demo message is: *"Hey Sam, heads up, we're moving you to the Q1 forecasting project starting Monday. Can you wrap up the dashboard stuff and sync with Dana when you get a chance? Thx"*
>
> **Content, top to bottom.**
> 1. Facts, one per line, each with a small icon: when ("Before Mon, Nov 9"), whether to reply ("Probably just a confirmation"), tone ("Friendly", followed by the quote that shows why: "Hey Sam, heads up").
> 2. A divider.
> 3. Action buttons, full width, stacked: "Plan for this change" with the eyebrow "CHANGE: PROJECT"; "Break it into steps"; "Help me ask what's unclear" with the eyebrow "ASK, DON'T GUESS" and the line "About: when it's due".
> 4. A close (×) button.
>
> **The key idea.** Any fact Pip is unsure about carries the same small "?" mark as the "Ask, don't guess" button, with the words "worth asking". The doubt and the question must read as the same thing. Only the date can be marked this way. Other doubts are worded softly ("Probably…") with no mark.
>
> **Rules.** No red and no yellow: nothing may feel like an alarm. Navy text on cream, never black on white. Sky blue is only for the Pip character. Atkinson Hyperlegible. Calm, low density, generous spacing; the person should read the whole thing in 3 seconds. Every target is at least 44 px. There is a visible keyboard focus. Motion only if it respects `prefers-reduced-motion`. No percentages or confidence numbers anywhere.
>
> **States to show.**
> (a) The demo message above.
> (b) A message with no deadline, where urgency shows instead: "This week".
> (c) A clear message with neutral tone: no quote, no "?", no Ask button.
> (d) A message to the whole team: an extra line "This is for the whole team".
> (e) A narrow width (about 320 px) and a long Spanish line.
> (f) The keyboard-focus state on a button.
