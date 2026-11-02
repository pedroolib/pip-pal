# Decisiones y porqués

[PLAN.md](PLAN.md) dice **qué** se construye. Este documento dice **por qué**, qué alternativas se descartaron y las notas técnicas que necesita cada módulo. Todo se decidió el 1 de noviembre de 2026 a partir de la investigación en [research/](research/).

Si vas a cambiar una decisión, cámbiala aquí y en PLAN.md en el mismo PR.

---

## 1. Producto

**Un solo flujo para el demo.** La rúbrica premia un MVP que funcione en vivo (menos de 2 min) por encima de muchas funciones. Hay ~4 días de construcción, así que todo se ordena en niveles (PLAN §2) y lo que no sale en el guion espera.

**Por qué este flujo.** Junta los tres hallazgos más fuertes de la entrevista: las instrucciones vagas (el traductor), los cambios de proyecto o líder ("desestructura muchísimo", min. 56) y el perfil profesional como memoria. Ver [research/interview-analysis.md](research/interview-analysis.md).

**Mascota y logros (los docs se contradecían).** El replanteamiento los metía al demo; el análisis de Alejandro los sacaba por parecerse a una app genérica de productividad, que la rúbrica castiga. Decisión:
- **El personaje Pip entra:** es la interfaz misma, no un adorno.
- **Los logros entran,** pero sin rachas ni conteos de días fallados. El logro estrella es "You asked instead of guessing", que premia justo lo que la coach dijo que no hacen (quedarse 20 min sin avanzar por no decir que no entendieron).
- **Los objetos para personalizar a Pip** son nivel 2.

**Voto de mayoría (3 llamadas): descartado.** Triplica el costo, fusionar tres JSON no es trivial y el demo necesita velocidad. En su lugar, si Pip no está seguro, le recomienda a la persona preguntar (ver §4).

**Estrategias de calma en el perfil.** Idea del equipo: cada persona sabe qué la regula (música, colorear, caminar). Pip la sugiere antes de volver al paso 1 en tres momentos: check-in con ≤2 cucharas, cambio detectado o "I'm stuck". Siempre se puede saltar.

## 2. Plataforma

**Overlay de escritorio, no web app.** El concepto es "vive encima de las apps que ya usas"; una web app pierde eso.

**Por qué Electron:**

| Opción | Por qué no |
|---|---|
| Tauri | La parte nativa es Rust; las ventanas transparentes tienen detalles en macOS y Linux; en Linux usa WebKitGTK, que renderiza distinto. Sin margen en 4 días. |
| Python + PySide6 | El diseño cuidado (Harbor, animaciones) cuesta mucho más que con CSS; empaquetar duele. |
| Nativo (Swift / WinUI) | Un solo sistema operativo y curva fuerte. |
| Flutter desktop | Transparencia y "siempre encima" dependen de plugins frágiles. |

Electron tiene ventanas transparentes, `globalShortcut` y portapapeles maduros, SDK oficial de Claude y de Jev en TypeScript, y el diseño pasa casi 1 a 1 con CSS. Su contra (~150 MB de RAM) no importa para el demo.

**El demo corre en una Mac.** Se desarrolla en Linux o Windows y se prueba en la Mac a diario.

### Notas técnicas para A (Shell)

- **Atajo:** registrar `Control+Shift+Space` **explícitamente**. Con `CommandOrControl` se volvería ⌘ en Mac. No choca con atajos de macOS (Spotlight es ⌘Space y el cambio de teclado es ⌃Space), pero hay que confirmarlo en la Mac del demo y dejarlo configurable. "Hey Pip" es voz y queda para el nivel 3.
- **Encima de todo, incluso pantalla completa (Mac):** `win.setAlwaysOnTop(true, 'screen-saver')` y `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`.
- **Dejar pasar los clics fuera de Pip:** `win.setIgnoreMouseEvents(true, { forward: true })` y desactivarlo cuando el mouse entra a Pip o a la tarjeta.
- **Captura de la selección:**
  - **Mac:** simular ⌘C con `osascript -e 'tell application "System Events" to keystroke "c" using command down'`, leer el portapapeles y restaurar lo que había. Requiere permiso de **Accesibilidad** una vez. Sin permiso, se usa lo último que la persona copió.
  - **Linux (Hyprland/Wayland):** los atajos globales de Electron no funcionan bien en Wayland. Un bind de Hyprland lanza la app de nuevo con un argumento, y la instancia que ya corre lo recibe por `app.on('second-instance')`:
    ```
    bind = CTRL SHIFT, SPACE, exec, pip-pal --capture
    ```
    En Linux se lee la selección directo con `clipboard.readText('selection')`, sin simular copia.
  - **Windows:** simular Ctrl+C con PowerShell (`SendKeys`) y leer el portapapeles.
- **Mac sin firmar:** el `.app` se abre con clic derecho → Abrir. El permiso de Accesibilidad se da un día antes del demo. Firmar cuesta $99 (cuenta de Apple) y tiempo que no hay.
- **Quitar de `electron-builder.yml`** los textos de permisos de cámara, micrófono, Documentos y Descargas que trae la plantilla: Pip no los usa y una Mac podría mostrarlos.

## 3. Ventanas e interfaz

**Dos ventanas.** El overlay (transparente, siempre encima, crece de acoplado a tarjeta) y la Casa de Pip (ventana normal para Mi manual, Mi resumen y Logros, que son documentos y no caben en un overlay).

**shadcn + Tailwind.** shadcn copia los componentes al repo, así que se editan como código propio y se pueden dejar idénticos al diseño. Regla:
- **shadcn para lo interactivo** (Button, Checkbox, Dialog, Tooltip): trae teclado, foco y lector de pantalla resueltos, que suma en la rúbrica de inclusión.
- **Tailwind puro para lo visual y el layout:** la barra de 5 segmentos (el `Progress` de shadcn es continuo), las etiquetas, el `<kbd>`.
- El tema vive en las variables CSS de `src/renderer/src/assets/main.css`. El look por defecto de shadcn es genérico; con Harbor deja de serlo.

Detalles de diseño en [design/README.md](design/README.md).

## 4. IA

**Dos pasos: Jev clasifica al instante, Claude escribe solo cuando la persona pulsa un botón.** (Cambió el 1–2 de noviembre; antes era un solo "decode" pesado con Claude y Jev en paralelo. `decode` sigue en el código, marcado como obsoleto, hasta que la interfaz migre.)

1. **Atajo → triage (solo Jev).** Devuelve un `Triage`: tipo de mensaje, si pide respuesta, urgencia, fecha límite, tono, si es tarea nueva o cambio, qué es ambiguo (fecha o qué/quién), a quién va dirigido, rol del remitente, la frase exacta que respalda cada campo (`evidence`) y los botones que ofrece (`actions`, en orden). No hay llamada a Claude. Si Jev falla, el triage rechaza con un error claro: no cae a Claude.
2. **Botón → `expand` (una llamada estrecha a Claude por botón).** Tres tipos (`ActionKind`): `steps` ("Break it into steps"), `questions` ("Help me ask what's unclear") y `transition` ("Plan for this change"). Cada uno devuelve su `Expansion`. Los botones salen de banderas del triage, no del tipo de mensaje; el código los calcula.

| Modelo | Hace | Por qué |
|---|---|---|
| **Claude Haiku 5.5** (`PIP_MODEL=sonnet\|haiku`, por defecto Haiku) | Todo el texto: pasos, preguntas listas para enviar, plan de transición, con su `why`. | Jev no genera texto. |
| **Jev (TypeSafe AI)** | Clasifica: Noul/Choice/Score en una sola petición. | Probabilidades **calibradas** y respuesta en 70–500 ms: la burbuja aparece al instante. En el pitch: "el modelo correcto para cada trabajo". |

**Reglas que se decidieron en el camino:**
- **Seleccionar, no generar.** El código arma los candidatos (por ejemplo las fechas posibles del texto, en `dates.ts`) y Jev elige. El código decide los umbrales (Noul "no seguro" entre 0.3 y 0.7; Choice no seguro si el primero < 0.6 o la ventaja < 0.2). Nunca se usa la `confidence` de Jev.
- **Claude con salida estructurada** (`output_config.format` con JSON schema), sin herramientas y sin `tool_choice` (Sonnet 5.5 lo rechaza con HTTP 400, un dato de Sonnet, no el modelo por defecto). Tiempo límite 30 s.
- **Sin reintentos, en ninguna parte.** La primera respuesta inválida rechaza con un mensaje que solo trae códigos y rutas, nunca la salida del modelo. Se probó: 54/54 válidas con Haiku y Sonnet en la corrida real.
- **Sin límites de cantidad** de pasos o preguntas: lo decide el perfil (Sam prefiere pasos pequeños y concretos). Con ≤2 cucharas la interfaz recorta a 3 pasos; el modelo no.
- **Una llamada a la vez por clave** (`triage`, o cada tipo de `expand`). El mismo texto con las mismas cucharas y pistas se une a la llamada en curso; otro texto rechaza con "Pip is still working on another text. Try again in a moment."
- **Reglas de prompt (anti-masking y autismo):** no adivinar al remitente (es "the sender" salvo que el mensaje lo nombre); no coachear el tono ("sé más amable") salvo que se pida; **no apelar al "sentido común" ni a lo "obvio"** (las normas no dichas son justo lo que la persona puede no saber); no preguntar lo que se resuelve con la fecha de hoy; cada paso lleva su razón. Tras cada cambio de prompt hay que repetir `npm run ai:lite`.
- **Haiku es el modelo por defecto** (decidido el 2026-11-02 tras las corridas locales de `ai:lite` y `ai:compare`): gustó más que Sonnet en `ai:lite` (≈5 s contra 6.5–8 s). Sonnet queda como alternativa con `PIP_MODEL=sonnet`.

**La interfaz que se construye sobre esto** (aún no implementada; el contrato y los fixtures ya existen):
- Con el atajo aparece un Pip junto al cursor con una burbuja: el triage y los botones.
- Cada botón abre su **propia tarjeta acoplada**: los Pips quedan en columna abajo a la derecha, con una tarjeta abierta a la vez ("mitosis": Pip se divide por acción). La tarjeta muestra "thinking" hasta que llega la expansión (Claude puede tardar 10–15 s), así que `expand` se llama por tipo, en paralelo.
- Pip aparece al llamarlo y se queda donde está.
- **Reglas para quien construya la interfaz:** (1) todo texto del modelo se muestra como **texto plano** (nada de HTML, Markdown ni enlaces automáticos; `suggestedQuestion` es texto listo para enviar); (2) manejar el rechazo "still working"; (3) pasar a `expand('questions', …, unclear)` las pistas del triage (`deadline`, `what_or_who`); (4) recortar a 3 pasos con pocas cucharas; (5) mostrar la `evidence` del tono solo si no es neutral (el tono es una elección forzada y siempre trae cita).
- Contrato: `PipApi.triage(text)` y `PipApi.expand(text, kind, spoons, unclear?)`, con fixtures en `src/shared/fixtures/demo.triage.json` y `demo.expansion.*.json`; `mock-api.ts` los sirve en el navegador.

**Lo que sabemos de Jev** (investigado el 1 de noviembre; reconfirmar en https://docs.typesafe.ai):
- Modelo "System One": recibe estado y preguntas tipadas (`choice`, `score`, `noul`) y devuelve respuestas con probabilidades. Nunca devuelve un tipo inválido.
- SDK: `npm install @typesafe-ai/sdk` (`TypeSafeClient`, `systemOne`, `choice`). Lee `TYPESAFE_API_KEY`.
- Precio: $0.042 por millón de tokens de entrada; la salida es gratis. Límites: 64k tokens por petición, hasta 255 opciones por pregunta, 80 peticiones/s.
- **Debilidades:** no genera texto; su versión 1.13 batalla con la **indirección**, las dobles negaciones y el razonamiento de varios pasos, y los mensajes vagos del jefe son justamente indirectos. Por eso hay que medirlo en el set de prueba.
- Servidores en EE. UU. No entrena con los datos de entrada; la retención cero (ZDR) es solo para clientes enterprise.
- **No verificamos qué idiomas soporta.** Probarlo con mensajes en español el lunes 2; si falla, en español esas clasificaciones las hace Claude.
- Está en early access; el equipo ya tiene acceso.

**"Ask, don't guess".** Si el triage marca `deadlineUnclear` o `whatOrWhoUnclear` (umbrales en código), Pip ofrece el botón de preguntas y no adivina; el triage lista en `unsure` los campos donde Jev dudó. Esto también reemplaza al voto de mayoría.

**El porqué en todo.** Cada expectativa implícita y cada paso traen su `why`. Lo pidió la coach: que la persona no deje de desarrollar sus competencias ni sienta que "se expresa mal" (evitar el masking).

**`profileUsed` hace visible la memoria.** La tarjeta dice qué parte del manual usó Pip ("Used your manual: you prefer written instructions"). Es lo que diferencia a Pip de un traductor genérico y lo que tienen que ver los jueces.

**Cucharas en el plan.** Con ≤2 cucharas (`LOW_SPOONS`), la interfaz muestra máximo 3 pasos y marca el resto "can wait". Lo hace el código, no el modelo.

**Las API keys solo viven en el proceso main,** nunca en el renderer ni en el repo. Para el demo van en variables de entorno de la Mac (`ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY`); `.env` está en `.gitignore`.

## 5. Privacidad

Es el centro del pitch de IA responsable.

1. **Pip solo lee lo que la persona selecciona** y manda con el atajo. Nunca lee correo ni chat por su cuenta. (Resuelve la pregunta abierta de la entrevista.)
2. **Se quitan los datos personales antes de enviar.** El perfil tiene una lista `people` (jefe, buddy, equipo): sus nombres se cambian por su rol (`[Manager]`) y los correos, teléfonos y URLs se quitan con regex. Al volver la respuesta, se restauran localmente. No usamos detección automática de nombres porque en 4 días no sería confiable.
3. **El resumen se filtra con código, no con el prompt.** A Claude solo le llegan los campos del perfil visibles para ese destinatario, así que la versión del jefe no puede filtrar lo del psicólogo aunque el modelo se equivoque.
4. **Pip nunca envía nada solo.** La persona revisa cada viñeta y exporta a PDF o copia.
5. **Origen y aprobación.** Cada dato del perfil dice quién lo escribió (`coach`, `self`, `pip`). Lo aprendido por Pip solo se guarda si la persona lo aprueba.

**Cómo se quitan los datos** (`src/shared/profile.ts`: `scrubForModel`, `restoreDecoded`, `buildProfileContext`):
- Correos, teléfonos, URLs y @handles se quitan. Cada nombre del perfil (el de la persona y la lista `people`) se cambia por un rol (`[Manager]`, `[Me]`; si dos personas comparten rol llevan número), en una sola pasada, el más largo primero. Los **alias** (`aliases`, opcionales en cada persona y en el perfil) entran en la misma pasada: un alias se busca entero, con o sin "@" ("@srivera" y "srivera" dan `[Manager]`), antes de quitar los @handles; los del perfil dan `[Me]`. Al restaurar siempre sale el nombre completo. Se ignoran los alias con menos de 2 letras o dígitos, el nombre completo de otra persona gana y una clave que comparten dos personas es `[someone]`. Se cubren mayúsculas, acentos, guiones, apóstrofes, formas de usuario (`sam_rivera`), caracteres invisibles y varios alfabetos (latino, griego, cirílico, árabe, hebreo, indios, CJK, tailandés y otros).
- **Al volver la respuesta solo se restaura el token exacto** (`[Manager]` → el nombre). Se probó una restauración tolerante de tokens acortados y se quitó: abría la puerta a mostrar a la persona equivocada. El prompt exige copiar los tokens tal cual.
- El texto entre `<message>` es no confiable; la etiqueta se quita hasta que no quede nada reconstruible. Lo que llega de Claude se valida con Zod.
- La cacería de alfabetos se cortó en la ronda 6 a propósito; lo que sigue son límites aceptados.

**Límites conocidos** (del más probable al menos), para el texto de ayuda de la interfaz y la revisión del equipo:
1. **Lo que no está en el perfil sale tal cual:** posesivos sin apóstrofe y cualquier nombre, apodo o usuario que no se haya agregado. Para eso existen los **alias** en People (también los de la persona misma, que dan `[Me]`): apodos y formas cortas ("Sammy", "JP"), @handles ("@srivera"), usuarios ("srivera") y formas con gramática ("Anny") se agregan como alias de esa persona.
2. **Nombres que cambian con la gramática** (caso en ruso, polaco, finés: "od Anny") no se detectan solos. La salida es agregar cada forma como alias ("Anny").
3. **Nombres chinos, japoneses o coreanos guardados sin espacio** dejan salir una parte ("田中さん"). Guardar "田中 太郎" lo arregla; hay que decirlo en la ayuda.
4. Prefijos pegados en árabe y hebreo ("ومحمد") se escapan.
5. Nombres disfrazados a propósito (letras parecidas de otro alfabeto) pasan; los mensajes normales no los traen.
6. Handles que empiezan con dígito (`@4lex`) y direcciones internas raras (`intranet.acme.local/...`) pasan.
7. `Ł`, `Ø`, `ı`, `ß`, `æ` no se pliegan ("Łukasz" ≠ "Lukasz").
8. **Sobre-limpieza:** un nombre de un solo carácter chino ("明") también tapa "明天"; nombres que son palabras ("Will", "Mark") tapan la palabra. Como se restaura el nombre completo, la respuesta puede nombrar a alguien que no estaba en el mensaje.
9. Un nombre compartido por dos personas se muestra como `[someone]`; un token completo escrito a mano en el mensaje se restaura al nombre de esa persona.
10. Claude ve el texto cambiado: @mención que no es alias → `[handle]` (no se restaura), "½" → "1⁄2", rachas de dígitos → `[phone]`. Una @mención de alias que el cambio de nombre no alcanza (por ejemplo, seguida de una marca combinante rara) también sale como `[handle]`. Un alias escrito con "@" que lleva espacio, apóstrofo o guion Unicode ("@Big Al", "@D'Lo", "@Jean‑Pi") deja un pedazo después de `[handle]` ("[handle] Al"), igual que antes de los alias. Un alias con 7+ dígitos seguidos ("srivera8675309") se reconoce en su forma `[phone]`, así que no sale ninguna parte. Se ignoran los alias de menos de 2 letras o dígitos y los de más de 100 caracteres (ya plegados, sin "@"); la app usa la misma regla (`aliasKey` en `src/shared/profile.ts`), así que un apodo que se acepta en pantalla nunca se salta en silencio. Los nombres y alias ya no son una sola regex gigante: se buscan con un árbol de prefijos (trie) que lee una vez el prefijo común, así que el tiempo crece casi en línea con el texto. Con un perfil hostil (20×10 alias de 100 caracteres con forma 'a-a-…' / 'a a …') y textos hostiles de 8000 caracteres, el peor caso baja de unos 6 s a unos 0.2 s (y ese 0.2 s es la limpieza de contactos, no el cambio de nombres). Una prueba compara la salida con la regex anterior, byte por byte. Excepción: una persona cuyo nombre no tiene letras ni dígitos ("🦊", "??") no se busca por nombre, pero sus alias sí se cambian por su rol y se restauran a su nombre tal cual; la regex anterior se los saltaba, así que ahí se esconde más, no menos. El recorrido del árbol usa una pila propia, así que un nombre de 10 000 caracteres ya no desborda la pila. Límite conocido: en una racha de marcas combinantes el costo es cuadrático y crece con cuántos caracteres seguidos que aceptan marcas lleva la clave (unas k·n²; era cúbico, unos 35 s, hasta que se recordaron entre posiciones de inicio los recorridos que no encuentran nada). Por eso `aliasKey` ignora un alias con 3+ de esos caracteres seguidos (ya plegado): 98 marcas + "さa" bloqueaba el proceso principal unos 70 s en 8000 marcas, y ningún nombre real tiene eso; la app lo rechaza con la misma regla. Lo peor que se sigue aceptando, en 8000 caracteres: "1̲̲x" unos 0.37 s, "̲̲さa" unos 0.73 s, los cuatro "ιιさa"/"ιͅさa"/"ͅιさa"/"ͅͅさa" juntos en una racha de U+0345 unos 1.5 s, y 900 alias de dos marcas distintas en una racha mezclada unos 1.1 s. Los nombres (no los alias) no tienen ese tope: un nombre "̲̲̲̲さa" tarda unos 1.7 s y uno de 98 marcas unos 72 s; nadie se llama así, pero si pasa hay que colapsar marcas repetidas en claves y texto.
11. Un texto de 8000 caracteres hostil bloquea main ~0.8 s antes de rechazarse; las pruebas de rendimiento tienen un límite de 500 ms y podrían fallar en CI lento.

## 6. Datos

**No hay base de datos.** Todo vive en archivos JSON en `app.getPath('userData')` (en Mac, `~/Library/Application Support/Pip/`): `profile.json`, `checkins.json`, `changes.json`, `achievements.json`. Son pocos datos, de una sola persona y en una máquina; leer y filtrar en JavaScript tarda milisegundos.

Reglas para el guardado real (A, al reemplazar los handlers de `src/main/mock.ts`; la versión con datos de ejemplo vive en `src/shared/mock-api.ts` y se queda para el navegador):
- **Escritura segura:** escribir a un archivo temporal y renombrarlo, para no corromper datos si la app se cierra a la mitad.
- **Validar al leer** con los esquemas Zod. Si un archivo está corrupto, Pip avisa y guarda una copia; no se cae.

**Cuándo cambiar:**
- **Cifrado con `safeStorage`** (llavero del sistema) **antes de que una persona real meta su propio perfil.** Sam es ficticio, así que no hace falta para el demo.
- **SQLite local** si el historial crece a meses o llega la ficha del rol con embeddings (`sqlite-vec`, nivel 3).
- **Base en servidor** solo para el backend de suscripciones del nivel 3, y solo para licencias. **Nunca** perfiles ni mensajes.

## 7. Negocio

**Que todo sea local no impide la suscripción.** De todas formas hace falta un backend pequeño, porque la API key de Claude no se puede meter en la app (cualquiera la extraería). Ese servidor intermedio guarda la licencia o los asientos y reenvía las llamadas a los modelos sin guardar contenido. Sirve para:
- **B2B:** asientos que paga la empresa empleadora como ajuste razonable, o Specialisterne como parte de su servicio (alarga el acompañamiento después de 6 meses y le da indicadores).
- **Plan personal** para quien no tiene apoyo de su empresa.

Es nivel 3. Para el Launchpad basta con las keys en la Mac del demo. **Sigue abierto:** quién paga primero, la empresa o Specialisterne.

## 8. Idioma

**Todo en inglés por ahora,** con los textos en `src/renderer/src/locales/en.json` (i18next). Agregar un idioma es poner `<lang>.json` y registrarlo en `src/renderer/src/i18n.ts`. **D prepara `es.json` para las pruebas con usuarios en México.** Pip responde en el idioma del mensaje. El equipo verificó que Jev funciona en español.

## 9. Demo

**El mensaje llega por Slack** (workspace de prueba gratis). Un compañero manda el mensaje en vivo desde su teléfono para que se vea real; también se manda antes de empezar, por si se cae el wifi.
- Por qué no WhatsApp: en la app de escritorio de Mac seleccionar parte de un mensaje es incómodo (clic derecho → Copiar) y necesita un teléfono vinculado. En el pitch se menciona: "funciona donde sea que puedas seleccionar texto".

**Respaldo.** Pip siempre intenta la llamada real. Si falla o tarda más de 8 s y el mensaje es del guion (se reconoce por su hash), usa la respuesta guardada. Hay una tecla de repetición que reinicia el demo. Lo que suele fallar en un evento es el wifi del lugar, no la API.

**Sam** es la persona ficticia del demo: 24 años, analista de datos, 4 meses en su primer empleo, nivel de apoyo 1. Su perfil está en `src/shared/fixtures/sam.profile.json` y D lo puede editar sin código. Aún no tenemos un perfil anonimizado real de Specialisterne.

## 10. Evaluación (set de prueba)

30 mensajes en inglés basados en los dolores de la entrevista (primer día, juntas, normas implícitas, correos que suenan agresivos y al menos 10 que anuncian cambios). Cada uno lleva sus etiquetas correctas (`isChange`, tipo, `isAmbiguous`). D los revisa y etiqueta; idealmente la coach también.

Un script corre cada mensaje **con y sin perfil** y reporta, tal cual salgan:
- (a) % de mensajes ambiguos en los que Pip pidió preguntar;
- (b) precisión de la detección de cambios, **Jev contra Claude** (justifica Jev en el pitch);
- (c) comparación a ciegas del equipo: ¿cuál versión es más clara para esta persona?

Es nivel 0 porque la rúbrica pide evidencia.

## 11. Proceso

- `src/shared/` es el contrato entre módulos y solo cambia por PR que vean los tres devs.
- Una rama por funcionalidad, PR a `main`.
- La configuración de Pedro's Factory (`.factory/stack.md`) escala a revisión humana: `src/main/`, `src/preload/`, `src/shared/`, `electron-builder.yml`, cambios de dependencias y todo lo que mande datos fuera de la máquina.

## 12. Preguntas abiertas

- ¿Quién paga primero, la empresa empleadora o Specialisterne?
- ¿El pitch será en inglés o en español?
- ¿Podemos citar a nuestra contacto de Specialisterne con su nombre?
- Confirmar las citas del pitch contra el audio de la entrevista (vienen de una transcripción automática).
- Respaldo en caché (plan 11): hoy una llamada lenta o fallida es un error simple; el triage no cae a Claude.
- Interfaz del triage y los botones (arriba): migrar `DecodeCard` y `TaskCard`.
- Pruebas con usuarios: ya hay una persona en contacto; falta agendar las sesiones (miércoles 4).
