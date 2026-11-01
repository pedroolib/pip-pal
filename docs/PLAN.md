# Pip: plan de construcción

Decisiones cerradas el 1 de noviembre de 2026. Fuentes: entrevista con Specialisterne (31 oct), "Replanteamiento después de la entrevista", concepto de Pip y rúbrica del reto.

**En una frase:** Pip mantiene vivo el perfil profesional de la persona y lo usa en su día a día, para que el apoyo del coaching siga funcionando entre sesiones y después de que termine. El traductor de mensajes es la puerta de entrada; lo que nos diferencia es la memoria (el perfil) y el apoyo en los momentos de cambio.

**Fechas:** entrega el **jueves 5 de noviembre, 23:59**. Launchpad el sábado 7.

---

## 1. Decisiones

| Tema | Decisión |
|---|---|
| Meta | Un demo de un solo flujo (sección 5) que corre en vivo en ~2 min, con respaldo. Lo demás va por niveles (sección 2). |
| Plataforma | Electron + React + TypeScript (electron-vite). Overlay transparente siempre encima. |
| Ventanas | **Overlay**: transparente, siempre encima, deja pasar los clics salvo sobre Pip; crece de acoplado a tarjeta. **Casa de Pip**: ventana normal con Mi manual, Mi resumen y Logros. |
| UI | Tailwind v4 + shadcn, tematizado con Harbor mediante variables CSS. shadcn para lo interactivo (Button, Checkbox, Dialog, Tooltip); Tailwind puro para lo visual. Atkinson Hyperlegible incluida localmente. Las animaciones respetan `prefers-reduced-motion`. |
| Idioma | Todo en inglés; textos en `src/renderer/src/locales/en.json` con i18next. Se agrega `es.json` para las pruebas con usuarios. Pip responde en el idioma del mensaje. |
| Entrada | Solo lo que la persona selecciona. Atajo `Control+Shift+Space` (explícito, no `CommandOrControl`), configurable. Voz y "Hey Pip" en el nivel 3. |
| Captura | **Mac:** simular ⌘C con osascript (requiere permiso de Accesibilidad), leer el portapapeles y restaurarlo; sin permiso, usa lo último que se copió. **Linux/Hyprland:** un bind de Hyprland ejecuta `pip-pal --capture`; la app lo recibe por `second-instance` y lee la selección primaria. **Windows:** simular Ctrl+C con PowerShell. |
| Modelos | **Claude Sonnet 5.5** genera todo el texto (pasos, expectativas, porqués, plan de transición, preguntas, resumen) con salida estructurada validada con Zod. **Jev (TypeSafe)** clasifica en paralelo: `is_change`, tipo de cambio, tono, urgencia, `is_ambiguous`, con probabilidades calibradas. Si Jev falla, esos campos salen de Claude. Sin voto de mayoría. |
| Incertidumbre | Si `P(ambiguo)` supera el umbral, Pip no adivina: muestra "Ask, don't guess" con la pregunta ya redactada. |
| Datos personales | El perfil lista personas (jefe, buddy, equipo). Antes de enviar, sus nombres se cambian por roles (`[Manager]`) y se quitan correos, teléfonos y URLs con regex. Se restauran localmente al volver la respuesta. |
| Almacenamiento | Todo local (JSON en `userData`): perfil, check-ins, logros. Sin cuentas ni servidor. Para el demo, las API keys van en variables de entorno de la Mac. El backend proxy con suscripción es nivel 3. |
| Respaldo del demo | Siempre llamada real; si falla o tarda más de 8 s y el mensaje es del guion (por hash), usa la respuesta guardada. Tecla de repetición que reinicia el demo. |
| Mac | `.app` sin firmar; se abre con clic derecho → Abrir y el permiso de Accesibilidad se da un día antes. |
| Desarrollo | Se puede desarrollar en Linux o Windows; se prueba en la Mac a diario (transparencia, Accesibilidad, encima de pantalla completa). |

## 2. Niveles de funciones

**Nivel 0, entrega del 5 de noviembre**
1. Shell del overlay: Pip acoplado, atajo, captura de la selección.
2. Decodificar con el perfil: qué piden, para cuándo, qué se espera sin decirse (con porqué), pasos, tono, "Ask, don't guess".
3. Detector de cambios con mini plan de transición y preguntas sugeridas.
4. Check-in de cucharas (1–5, visual, 9/13/17 h, se pospone y no insiste). Con ≤2 cucharas: máximo 3 pasos, el resto "can wait".
5. Estrategia de calma del perfil (con ≤2 cucharas, al detectar un cambio o con "I'm stuck"), temporizador opcional y regreso al paso 1. Siempre se puede saltar.
6. Mi resumen: versión por destinatario, viñetas marcables, exportar PDF o copiar. Nunca se envía solo.
7. Mi manual: ver y editar el perfil de Sam, ya cargado.
8. Logros tranquilos: pasos terminados, cambios atravesados, "You asked instead of guessing". Sin rachas.
9. Personaje Pip (`<Pip mood=… />`, 12 estados de ánimo).
10. Set de prueba de 30 mensajes con y sin perfil, con conteos reportados tal cual.
11. Blindaje del demo: respaldo en caché, tecla de repetición, video de respaldo.
12. Pruebas con usuarios (ya hay una persona en contacto); `es.json` para ellas.

**Nivel 1, si sobra antes de la entrega:** responder con el porqué; versión corta del manual para el jefe ("how I work best").

**Nivel 2, rumbo a Phoenix:** objetos para Pip, onboarding por preguntas, maqueta de "Clear message" para jefes, correcciones del coach guardadas como ejemplo, modo oscuro, tarjeta de tarea por pasos dentro de otra app.

**Nivel 3, después:** backend con suscripción (B2B por asientos o plan personal), voz y "Hey Pip", lectura de pantalla y resaltados en otras apps, wearable, ficha del rol con embeddings.

## 3. Perfil ("Mi manual")

Parte de las secciones del perfil profesional de Specialisterne: experiencia, idiomas, comunicación, trabajo en equipo, feedback, estrés, relaciones, sensorial, motivaciones, fortalezas, aprendizaje, ajustes y recomendaciones para el jefe. Le agregamos:

- **Visibilidad por campo:** `private`, `coach`, `therapist`, `manager`. Arma las versiones de Mi resumen, y **el filtro es código, no el prompt**: a Claude solo le llega lo visible para ese destinatario.
- **Origen:** `coach`, `self`, `pip`. Pip nunca guarda algo aprendido sin aprobación.
- **Cambios:** cómo reacciona la persona, qué necesita saber primero, con cuánta anticipación.
- **Estrategias de calma** (`calming_strategies`), por ejemplo música tranquila 10 min o colorear 15 min.
- **Patrones de energía**, que se llenan solos con los check-ins.

El esquema exacto está en `src/shared/schemas.ts`.

## 4. Contratos compartidos

`src/shared/` es la frontera entre módulos y **solo cambia por PR revisado por los tres devs**.

- `schemas.ts`: Zod de `Profile`, `DecodeResult`, `Classification`, `CheckIn`, `Achievement`, `SummaryRequest`/`Summary`.
- `ipc.ts`: nombres de canales IPC y sus tipos.
- `fixtures/`: Sam, un `DecodeResult` del mensaje del demo y una semana de check-ins. La interfaz se construye contra estos datos sin esperar a la IA.

## 5. Guion del demo (~2:00)

| Tiempo | Qué pasa |
|---|---|
| 0:00–0:10 | Check-in de la mañana: Sam toca 2 cucharas; Pip "gentle". |
| 0:10–0:20 | Un compañero manda en Slack (también se manda antes, por si se cae el wifi): *"Hey Sam, heads up, we're moving you to the Q1 forecasting project starting Monday. Can you wrap up the dashboard stuff and sync with Dana when you get a chance? Thx"* |
| 0:20–0:25 | Sam selecciona el texto y presiona ⌃⇧Space. En menos de 1 s, Jev muestra "Change: project" y "Tone: friendly, not urgent". |
| 0:25–0:50 | Tarjeta: qué piden; para cuándo ("before Monday, inferred"); qué se espera con porqué; 3 pasos por las 2 cucharas y "the rest can wait"; "Used your manual: you prefer written instructions". |
| 0:50–1:05 | "Ask, don't guess" sobre "when you get a chance", con la pregunta redactada; Sam la copia y responde. |
| 1:05–1:15 | Estrategia de calma ("Your manual says calm music helps. 10 min, then step 1?"); Sam la salta. |
| 1:15–1:45 | Casa de Pip → Mi resumen: versiones Coach y Psychologist, desmarca una viñeta, exporta PDF. |
| 1:45–1:55 | Logros: "You asked instead of guessing". Si hay que recortar tiempo, esto es lo primero que se va. |

## 6. Equipo

| Quién | Módulo |
|---|---|
| Dev con Mac | **A, Shell:** overlay, atajo, captura, Accesibilidad, encima de pantalla completa, guardado local, IPC, horarios del check-in, empaquetar `.app`. |
| Pedro (Linux) | **B, IA:** prompts, Claude + Jev, esquemas, quitar datos personales, respaldo en caché, Mi resumen (generación), script del set de prueba. |
| Dev con Windows/Linux | **C, Interfaz:** tema de shadcn con Harbor, tarjetas, check-in, Casa de Pip (Mi manual, Mi resumen, Logros), componente Pip. |
| Integrante menos técnico | **D:** perfil de Sam, 30 mensajes con etiquetas, textos en `en.json`/`es.json`, workspace de Slack, dibujo de Pip, pruebas con usuarios, video de respaldo, pitch. |

## 7. Calendario

| Día | A (Mac) | B (Pedro) | C (Interfaz) | D |
|---|---|---|---|---|
| Dom 1 | — | Repo, estructura base, contratos y datos de ejemplo | — | Borrador del perfil de Sam, workspace de Slack |
| Lun 2 | Overlay, atajo, captura en Mac | Decodificar con Claude + perfil, quitar datos personales, Jev, probar Jev en español | Tema Harbor, tarjeta de pasos, check-in | 30 mensajes con etiquetas |
| Mar 3 | Guardado local, IPC, flujo de cambio + calma. **Hito: ciclo completo en la Mac** | Script del set con y sin perfil, generación de Mi resumen | Casa de Pip: Mi manual, Mi resumen, Logros | **Dibujo final de Pip** (en capas: cuerpo + ojos por estado de ánimo), semana precargada de Sam |
| Mié 4 | Empaquetar `.app`, horarios del check-in | Respaldo en caché, conteos finales del set | PDF, pulido visual, `es.json` conectado | Pruebas con usuarios, citas. **Se congelan funciones en la noche.** |
| Jue 5 | Solo bugs; ensayos del demo en la Mac; video de respaldo; prueba sin wifi. **Entrega a las 23:59.** | ← | ← | ← |
| Vie 6 | Pitch con cronómetro ×5 | | | |
| Sáb 7 | Launchpad | | | |
