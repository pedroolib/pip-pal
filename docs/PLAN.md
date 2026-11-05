# Pip: plan de construcción

Decisiones cerradas el 1 de noviembre de 2026. Los porqués y las notas técnicas por módulo están en [DECISIONS.md](DECISIONS.md). Fuentes, en [research/](research/): [análisis de la entrevista](research/interview-analysis.md), [notas de la entrevista](research/interview-notes.md), [replanteamiento](research/plan-after-interview.md), [concepto de Pip](research/pip-concept.md) y [rúbrica del reto](research/challenge-rubric.md). Referencias visuales en [design/](design/README.md).

**En una frase:** Pip mantiene vivo el perfil profesional de la persona y lo usa en su día a día, para que el apoyo del coaching siga funcionando entre sesiones y después de que termine. El traductor de mensajes es la puerta de entrada; lo que nos diferencia es la memoria (el perfil) y el apoyo en los momentos de cambio.

**Fechas:** entrega el **jueves 5 de noviembre, 23:59**. Launchpad el sábado 7.

---

## 1. Decisiones

| Tema | Decisión |
|---|---|
| Meta | Un demo de un solo flujo (sección 5) que corre en vivo en ~2 min, con respaldo. Lo demás va por niveles (sección 2). |
| Plataforma | Electron + React + TypeScript (electron-vite). Overlay transparente siempre encima. |
| Ventanas | **Overlay**: transparente, siempre encima, deja pasar los clics salvo sobre Pip; crece de acoplado a tarjeta. **Casa de Pip**: ventana normal estilo cuarto (Pip en su cuarto arriba, menú abajo) con Home, My profile (Mi manual), Achievements, Summary, Connections y Settings. |
| UI | Tailwind v4 + shadcn, tematizado con Harbor mediante variables CSS. shadcn para lo interactivo (Button, Checkbox, Dialog, Tooltip); Tailwind puro para lo visual. Atkinson Hyperlegible incluida localmente. Las animaciones respetan `prefers-reduced-motion`. |
| Idioma | Todo en inglés; textos en `src/renderer/src/locales/en.json` con i18next. Se agrega `es.json` para las pruebas con usuarios. Pip responde en el idioma del mensaje. |
| Entrada | Lo que la persona selecciona, con `Control+Shift+Space` (explícito, no `CommandOrControl`). Sin selección, el mismo atajo abre el menú de Pip, desde donde se graba y se revisa; durante una grabación, la detiene (ver [DECISIONS.md §16](DECISIONS.md)). "Hey Pip" en el nivel 3. |
| Captura | **Mac:** simular ⌘C con osascript (requiere permiso de Accesibilidad), leer el portapapeles y restaurarlo; sin permiso no lee nada y el menú avisa que no pudo leer la selección. **Linux/Hyprland:** un bind de Hyprland ejecuta `pip-pal --capture`; la app lo recibe por `second-instance` y lee la selección primaria. **Windows:** simular Ctrl+C con PowerShell. |
| Modelos | **Claude Haiku 5.5** genera todo el texto (pasos, expectativas, porqués, plan de transición, preguntas, resumen) con salida estructurada validada con Zod. **Jev (TypeSafe)** clasifica: `is_change`, tipo de cambio, tono, urgencia, `is_ambiguous`, con probabilidades calibradas. Jev clasifica primero (triage); Claude escribe solo al pulsar un botón, sin reintentos. Si Jev falla, el triage da error (no cae a Claude). Sin voto de mayoría. Modelo de Claude por `PIP_MODEL=sonnet|haiku` (por defecto Haiku; Sonnet es la alternativa opcional). |
| Incertidumbre | Si `P(ambiguo)` supera el umbral, Pip no adivina: muestra "Ask, don't guess" con la pregunta ya redactada. |
| Datos personales | El perfil lista personas (jefe, buddy, equipo). Antes de enviar, sus nombres se cambian por roles (`[Manager]`) y se quitan correos, teléfonos y URLs con regex. Se restauran localmente al volver la respuesta. |
| Almacenamiento | Todo local (JSON en `userData`): perfil, check-ins, logros, ajustes. Sin cuentas ni base de datos. Las API keys viven en un proxy en Cloudflare (`src/proxy/`) que no guarda nada y solo atiende a quien tiene el token privado del equipo (`PIP_ACCESS_TOKEN` en `.env`). Quien clona el repo sin token ve los datos de demo. La Mac del demo usa el token, así no hay keys reales en ninguna laptop. Licencias y suscripción siguen en nivel 3. |
| Respaldo del demo | Siempre llamada real; si falla o tarda más de 8 s y el mensaje es del guion (por hash), usa la respuesta guardada. Tecla de repetición que reinicia el demo. |
| Mac | `.app` sin firmar; se abre con clic derecho → Abrir y el permiso de Accesibilidad se da un día antes. |
| Desarrollo | Se puede desarrollar en Linux o Windows; se prueba en la Mac a diario (transparencia, Accesibilidad, encima de pantalla completa). |

## 2. Niveles de funciones

**Nivel 0, entrega del 5 de noviembre**
1. Shell del overlay: Pip acoplado, atajo, captura de la selección.
2. Decodificar con el perfil: qué piden, para cuándo, qué se espera sin decirse (con porqué), pasos, tono, "Ask, don't guess". **Flujo actual** (ver [DECISIONS.md §4](DECISIONS.md)): el atajo dispara un triage rápido de Jev y una burbuja junto al cursor con botones; cada botón pide a Claude una sola cosa (pasos, preguntas o plan de transición) y abre su propia tarjeta. Backend, burbuja (PR #10) y tarjetas por botón hechos; falta "qué se espera sin decirse" (cambio de contrato).
3. Detector de cambios con mini plan de transición y preguntas sugeridas (es el botón "Plan for this change" del flujo anterior).
4. Check-in de cucharas (1–5, visual, se pospone y no insiste). Horarios editables en Settings: 9/13/17 h por defecto, hasta 6, cada uno se prende o apaga; con menos de 3 encendidos Pip sugiere 3 sin bloquear. Hecho (PR de la Casa de Pip). Con ≤2 cucharas: máximo 3 pasos, el resto "can wait".
5. Estrategia de calma del perfil (con ≤2 cucharas o al detectar un cambio), temporizador opcional y regreso al paso 1. Siempre se puede saltar.
6. Mi resumen: versión por destinatario, viñetas marcables, copiar solo las marcadas. Nunca se envía solo. Hecho (PR #19): periodos Today, 7, 14 y 30 días; generación real con Claude a partir del registro de uso; cada viñeta con su porqué. Pip detecta 4 patrones y los deja pendientes en My profile para aprobar. Las tarjetas ya registran preguntas, pasos y calma (ver [DECISIONS.md §6](DECISIONS.md)). Falta exportar PDF (botón "Coming soon").
7. Mi manual: ver y editar el perfil de Sam, ya cargado. Hecho; vive en la pestaña My profile.
8. Logros tranquilos: pasos terminados, cambios atravesados, "You asked instead of guessing". Sin rachas. Lista por día hecha; el flujo ya registra pasos, preguntas copiadas y planes de cambio.
9. Personaje Pip (`<Pip mood=… />`, 12 estados de ánimo).
10. Set de prueba de 30 mensajes con y sin perfil, con conteos reportados tal cual.
11. Blindaje del demo: respaldo en caché, tecla de repetición, video de respaldo.
12. Pruebas con usuarios (ya hay una persona en contacto); `es.json` para ellas.
13. **Onboarding** (subió del nivel 2 el 3 de noviembre; ver [DECISIONS.md §13](DECISIONS.md)): la primera vez sin `PIP_DEMO=1`, Pip hace preguntas, una llamada a Claude convierte las respuestas en sugerencias para el perfil, y la persona practica el atajo con un mensaje de ejemplo. Fuera del demo en vivo; en el pitch va un clip grabado.
14. **Captura de voz** (subió del nivel 3 el 3 de noviembre; ver [DECISIONS.md §14](DECISIONS.md)): "Let Pip listen", en el menú del atajo, graba el micrófono, el audio de la computadora o ambos (hasta 10 min), Pip transcribe en la máquina, la persona revisa y elige el texto, y sigue el triage de siempre. En el demo en vivo, solo micrófono. En `main` con las correcciones de la ronda 1; falta probarla en Electron real y empaquetada (sección 8).
15. **Un solo comando** (ver [DECISIONS.md §16](DECISIONS.md)): con texto seleccionado, el triage de siempre; sin selección, un menú en el cursor con Pip's Home, Let Pip listen, Check-In, Tell Pip y Remember Pip. Tell Pip contesta una vez, con su porqué, y guarda las palabras como nota. Los recordatorios se guardan en la máquina y se ven en "Coming up". En `main` (PR #32), con estos recordatorios en lugar de los de la PR #29; falta probarlo en la app real (sección 8).

**Nivel 1, si sobra antes de la entrega:** responder con el porqué; versión corta del manual para el jefe ("how I work best").

**Nivel 2, rumbo a Phoenix:** objetos para Pip, maqueta de "Clear message" para jefes, correcciones del coach guardadas como ejemplo, modo oscuro, tarjeta de tarea por pasos dentro de otra app.

**Nivel 3, después:** backend con suscripción (B2B por asientos o plan personal), "Hey Pip", notas de juntas largas (más de 10 min, a partir de la captura de voz), lectura de pantalla y resaltados en otras apps, wearable, ficha del rol con embeddings.

## 3. Perfil ("Mi manual")

Parte de las secciones del perfil profesional de Specialisterne: experiencia, idiomas, comunicación, trabajo en equipo, feedback, estrés, relaciones, sensorial, motivaciones, fortalezas, aprendizaje, ajustes y recomendaciones para el jefe. Le agregamos:

- **Visibilidad por campo:** `private`, `coach`, `therapist`, `manager`. Arma las versiones de Mi resumen, y **el filtro es código, no el prompt**: a Claude solo le llega lo visible para ese destinatario.
- **Origen:** `self` (lo escribió la persona), `onboarding` (Pip, con las respuestas del onboarding) y `learned` (Pip, con patrones de uso). Lo de Pip llega como sugerencia; nunca se usa ni se comparte hasta que la persona la acepta. Editar el texto de una entrada la vuelve `self`.
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
| 0:20–0:25 | Sam selecciona el texto y presiona ⌃⇧Space. En menos de 1 s, Jev muestra la burbuja: "Monday (inferred)", "Just confirm", "Friendly" y "Change: project" (la urgencia no sale porque ya hay fecha; ver [DECISIONS.md §4](DECISIONS.md)). |
| 0:25–0:50 | Tarjeta: qué piden; para cuándo ("before Monday, inferred"); qué se espera con porqué; 3 pasos por las 2 cucharas y "the rest can wait"; Sam abre "Used your manual" (empieza cerrado): "you prefer written instructions". |
| 0:50–1:05 | "Ask, don't guess" sobre "when you get a chance", con la pregunta redactada; Sam la copia y responde. |
| 1:05–1:15 | Estrategia de calma ("Your manual says calm music helps. 10 min, then step 1?"); Sam la salta. |
| 1:15–1:45 | Casa de Pip → Mi resumen: versiones Coach y Psychologist, desmarca una viñeta y la copia (exportar PDF todavía es "Coming soon"). |
| 1:45–2:15 | Voz (reemplaza a Logros): Sam presiona ⌃⇧Space sin selección, elige Let Pip listen y luego Microphone; un compañero dice *"Sam, can you send the weekly numbers to Dana before tomorrow's standup, and loop in Alex if anything looks off?"*; Sam detiene, revisa la transcripción y pulsa "Read this with Pip": burbuja y luego pasos. |

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

## 8. Pendientes

Revisado contra el código el 3 de noviembre. Las preguntas sin decidir siguen en [DECISIONS.md §12](DECISIONS.md).

**Antes de la entrega**

| Quién | Qué | Por qué |
|---|---|---|
| A | Voz en la Mac del demo: Let Pip listen abre, ⌃⇧Space detiene, aviso del micrófono, permiso "System Audio Recording", tarjeta "can't hear" | Solo se probó en un navegador con dispositivos falsos. |
| A | Mac: ⌃⇧Space con la tarjeta de revisión abierta lee la app de atrás, no la caja de Pip | En Mac, `blur()` podría no devolverle el foco a la otra app. Si falla, probar `app.hide()`. |
| A | App real después de unir la PR #32: el atajo con y sin selección, Tell Pip, un recordatorio que vence, abrir Pip al iniciar sesión (app instalada) | Hasta ahora solo con pruebas automáticas. |
| A | Windows, Electron real: audio de la computadora (loopback), Esc mientras escribe, ⌃⇧Space con la tarjeta de revisión abierta | El Esc de main y el foco no existen en la vista de navegador. |
| A | App empaquetada: `npm run fetch:whisper`, construir y transcribir de verdad | Solo se comprobó que los binarios y el modelo quedan en `app.asar.unpacked`; nunca se transcribió empaquetado. |
| B | Respaldo en caché y tecla de repetición del demo (nivel 0, punto 11) | No existen en el código; hoy una llamada lenta o fallida da un error simple. |
| B + D | Set de 30 mensajes con y sin perfil (nivel 0, punto 10) | La rúbrica pide evidencia; falta reportar los conteos finales. |
| B | Cifrar el perfil con `safeStorage` | DECISIONS §6 lo pide antes de que una persona real meta su perfil, y el onboarding y las pruebas con usuarios ya lo permiten. |
| C | Exportar PDF en Mi resumen | El botón sigue en "Coming soon". |
| C + D | Traducir a `es.json` las 174 llaves que faltan (onboarding, Casa, pendientes y "Let Pip rewrite this") | Las pruebas con usuarios en México verían esas partes en inglés. La captura de voz ya está traducida. |
| Tres devs | "Qué se espera sin decirse" en las tarjetas | Está en el guion, pero pide cambiar `src/shared/`. |

**Después de la entrega**

- `src/main/json-file.ts`: atrapar el error de `unlinkSync` si el antivirus de Windows bloquea un `.bak` (DECISIONS §6, límite 2).
- Pasar la clave de CUDA de `.npmrc` a otro mecanismo antes de la siguiente versión mayor de npm.
- Detectar el idioma al transcribir cuando transformers.js pueda; cambiar `ScriptProcessorNode` por `AudioWorklet` si Chromium lo quita.
