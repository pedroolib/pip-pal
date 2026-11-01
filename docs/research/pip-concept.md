# Pip: concepto

Original con imágenes: [originals/pip-concept.pdf](originals/pip-concept.pdf) · Diseño en Canva: https://canva.link/dv2bgf5xclz1mch

> Es el concepto anterior a la entrevista. Varias partes pasaron a niveles posteriores (la tarjeta de tarea con resaltado dentro de otra app, la lectura de pantalla y la voz); ver [../PLAN.md](../PLAN.md).

## Concepto

Pip es un compañero de escritorio que vive encima del software que la persona ya usa, como hojas de cálculo, correo o chat. En lugar de ser otra app que abrir, aparece como pequeños overlays en los bordes de la pantalla. Da solo la ayuda necesaria para el siguiente paso y luego se quita del camino.

La meta es apoyar la función ejecutiva durante el primer empleo: planear, empezar tareas y entender instrucciones poco claras, sin adueñarse de la pantalla.

## Cómo funciona

Pip tiene cuatro tamaños y solo crece cuando la persona necesita más.

- **Acoplado (docked):** un Pip pequeño en el borde de la pantalla. Un anillo alrededor muestra el progreso de la tarea actual.
- **Peek:** una píldora de una línea que dice qué sigue, por ejemplo "Next, paste totals into column C".
- **Tarjeta de tarea:** una tarjeta compacta con una instrucción a la vez. Explica exactamente dónde hacer clic y qué teclas presionar, y un resaltado dentro de la app real muestra el lugar exacto.
- **Ventana de pasos:** aparece cuando la persona selecciona un texto confuso, como un correo vago de su manager. Lo convierte en una tarea corta con tres pasos sencillos y una fecha límite. Un enlace opcional, "How did Pip read this?", explica frases como "circle back" para quien quiera aprender las reglas no escritas.

## Apoyo sin presión

- Un botón **"I'm stuck"** pregunta qué está estorbando y ofrece volver a señalar el lugar, dividir el paso o explicarlo de otra forma.
- Si un paso está tardando mucho, Pip ofrece con suavidad hacerlo más pequeño o sugiere una pausa corta. Nunca regaña.
- La urgencia se muestra con un ícono pequeño y palabras sencillas, nunca con alertas rojas o amarillas.

## Privacidad y control

Un panel de privacidad sencillo deja decidir cuándo puede Pip ver la pantalla (nunca, solo cuando se le pide, o durante una tarea) y qué apps puede ver. Las capturas se borran después de leerlas. Compartir cualquier cosa con un job coach está apagado por defecto y siempre necesita aprobación de la persona. Un botón "Pause all" detiene todo de una vez.

## El personaje

Pip es una sola forma redondeada cuyos ojos hacen toda la expresión. Tiene 12 estados de ánimo:

| Estado | Cuándo |
|---|---|
| Calm | Por defecto, tarea en curso |
| Thinking | La IA está trabajando |
| Happy | Paso terminado |
| Gentle | Check-in, nunca regañando |
| Showing | Señala el resaltado |
| Quiet | Modo foco, en pausa |
| Hello | Primera vez, onboarding |
| Celebrate | Tarea completa terminada |
| Sleepy | Cierre del día |
| Reading | Leyendo tu selección |
| Listening | Entrada de voz activa |
| Thanks | Después de que das feedback |

Parpadea cada pocos segundos, se mece suavemente y se asoma sobre el borde de las tarjetas. Todo el movimiento se apaga si la persona tiene activado "reducir movimiento" en su sistema.

El personaje hace que la herramienta se sienta amigable y humana en vez de clínica, y eso importa para personas que ya pueden sentirse ansiosas en un empleo nuevo.

Referencia visual: [../design/pip-moods.png](../design/pip-moods.png). Pip se va a redibujar; ver [../design/README.md](../design/README.md).

## Paleta "Harbor"

| Color | Hex | Uso |
|---|---|---|
| Deep blue | `#3368A0` | Botones principales, resaltados, progreso y enlaces |
| Sky blue | `#66A3BF` | Solo Pip, para que el personaje siempre se reconozca |
| Soft mint | `#C8DFDB` | Rellenos suaves, como los números de los pasos |
| Warm cream | `#F8F6F1` | Fondo de cada tarjeta overlay, un poco más claro que el original `#F2EFE7` |

Tonos de apoyo: texto navy (`#1E2A36`), texto de cuerpo más suave (`#3A4652`), etiquetas atenuadas (`#55626E`) y borde claro (`#DCD7CB`). La paleta base viene de Color Hunt.

**Por qué esta paleta**
- **Calmada, no ruidosa.** Los azules fríos y la menta suave mantienen baja la estimulación visual, lo que ayuda a personas con sensibilidad sensorial. No hay rojo ni amarillo, así que nada se siente como una alarma.
- **Legible.** La investigación sobre lectura muestra que el texto oscuro sobre fondo claro se lee mejor, sobre todo en tamaños pequeños como el de un overlay (Piepenbrock et al.). La British Dyslexia Association recomienda texto oscuro (no negro) sobre fondo blanco hueso (no blanco puro) para reducir el deslumbramiento. Por eso las tarjetas usan crema cálida y navy en vez de blanco y negro.
- **Se distingue de otras apps.** La tarjeta crema, la sombra suave y el borde fino separan a Pip de apps de trabajo blancas como Excel u Outlook, sin ser estridente.
- **Accesible.** Todo el texto cumple los estándares de contraste de WCAG. Los colores que hay que distinguir también difieren en luminosidad, no solo en tono.

## Tipografía

Atkinson Hyperlegible, una tipografía diseñada para que las letras se distingan fácilmente, lo que ayuda con la dislexia y la baja visión.

## Claro y oscuro

El modo claro es el predeterminado. Hay planeada una versión oscura porque algunas personas neurodivergentes encuentran menos sobreestimulantes las pantallas oscuras, y Pip seguirá la configuración clara u oscura de la computadora. Se podría ofrecer como opción un tema de baja estimulación basado en la paleta más suave "Mist".
