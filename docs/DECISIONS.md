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

**Híbrido Claude + Jev, en paralelo sobre el mismo mensaje (ya sin datos personales):**

| Modelo | Hace | Por qué |
|---|---|---|
| **Claude Sonnet 5.5** | Todo el texto: resumen, pasos, expectativas implícitas con su porqué, plan de transición, preguntas, Mi resumen. | Jev no genera texto. |
| **Jev (TypeSafe AI)** | Clasifica: `isChange`, tipo de cambio, tono, urgencia, `isAmbiguous`. | Probabilidades **calibradas** (un LLM tiende a sobreestimar su confianza) y respuesta en 70–500 ms: la cara de Pip y la etiqueta "Change: project" aparecen al instante mientras Claude escribe. En el pitch: "el modelo correcto para cada trabajo". |

Si Jev falla o no responde, esos campos los genera Claude (el contrato `Classification` tiene `source: 'jev' | 'claude'`).

**Lo que sabemos de Jev** (investigado el 1 de noviembre; reconfirmar en https://docs.typesafe.ai):
- Modelo "System One": recibe estado y preguntas tipadas (`choice`, `score`, `noul`) y devuelve respuestas con probabilidades. Nunca devuelve un tipo inválido.
- SDK: `npm install @typesafe-ai/sdk` (`TypeSafeClient`, `systemOne`, `choice`). Lee `TYPESAFE_API_KEY`.
- Precio: $0.042 por millón de tokens de entrada; la salida es gratis. Límites: 64k tokens por petición, hasta 255 opciones por pregunta, 80 peticiones/s.
- **Debilidades:** no genera texto; su versión 1.13 batalla con la **indirección**, las dobles negaciones y el razonamiento de varios pasos, y los mensajes vagos del jefe son justamente indirectos. Por eso hay que medirlo en el set de prueba.
- Servidores en EE. UU. No entrena con los datos de entrada; la retención cero (ZDR) es solo para clientes enterprise.
- **No verificamos qué idiomas soporta.** Probarlo con mensajes en español el lunes 2; si falla, en español esas clasificaciones las hace Claude.
- Está en early access; el equipo ya tiene acceso.

**"Ask, don't guess".** Si `isAmbiguous` pasa un umbral (a calibrar con el set de prueba), Pip no adivina: muestra la duda y la pregunta ya redactada. Esto también reemplaza al voto de mayoría.

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

## 6. Datos

**No hay base de datos.** Todo vive en archivos JSON en `app.getPath('userData')` (en Mac, `~/Library/Application Support/Pip/`): `profile.json`, `checkins.json`, `changes.json`, `achievements.json`. Son pocos datos, de una sola persona y en una máquina; leer y filtrar en JavaScript tarda milisegundos.

Reglas para el guardado real (A, al reemplazar `src/main/mock.ts`):
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

**Todo en inglés por ahora,** con los textos en `src/renderer/src/locales/en.json` (i18next). Agregar un idioma es poner `<lang>.json` y registrarlo en `src/renderer/src/i18n.ts`. **D prepara `es.json` para las pruebas con usuarios en México.** Pip responde en el idioma del mensaje.

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
- ¿Jev funciona en español?
- Pruebas con usuarios: ya hay una persona en contacto; falta agendar las sesiones (miércoles 4).
