# Replanteamiento después de la entrevista

Qué cambia en el proyecto después de hablar con la coach de Specialisterne el 31 de octubre. Se apoya en el análisis de Alejandro ([interview-analysis.md](interview-analysis.md)). Original: [originals/plan-after-interview.pdf](originals/plan-after-interview.pdf)

> Este es el documento previo a las decisiones del 1 de noviembre. Lo que se decidió después, y en qué cambió, está en [../PLAN.md](../PLAN.md) y [../DECISIONS.md](../DECISIONS.md).

## Lo que aprendimos y que cambia el proyecto

- El riesgo no es conseguir el empleo sino sostenerlo. Las colocaciones se rompen el primer día, con las reglas no escritas y, sobre todo, con los cambios de líder, proyecto o prioridades, y otra vez en el año 2 o 3.
- El coaching es lo que funciona, pero suele cortarse a los 6 meses por presupuesto y se lleva en Excel, notas y WhatsApp. No hay indicadores.
- El líder directo es el factor número uno. Las instrucciones escritas funcionan "al 99%", pero los líderes no siempre las dan.
- El perfil profesional ya existe: una radiografía de cómo aprende la persona, qué le estresa y qué ajustes necesita. Hoy es un documento estático.
- Privacidad: nada llega directo al coach. Primero va un resumen para la propia persona, y ella decide qué compartir.
- Si la IA sugiere cómo escribir, tiene que explicar el porqué, para no fomentar el masking ni frenar sus competencias.
- La coach no comentó la mascota ni los logros. Los dejamos, cuidando que no se sientan como una app genérica de productividad.

## El proyecto replanteado

**En una frase:** Pip mantiene vivo el perfil profesional de la persona y lo usa en su día a día, para que el apoyo del coaching siga funcionando entre sesiones y después de que termine.

Antes éramos un traductor de mensajes. Ahora el traductor es la puerta de entrada, y lo que nos diferencia es la memoria (el perfil) y el apoyo en los momentos de cambio.

## Para quién

Personas autistas en su primer año de empleo y en los cambios dentro de él, sobre todo de nivel de apoyo 1, porque "pasan invisibilizadas" y tienen más problemas de salud mental.

Usuarios secundarios: quien acompañe a la persona, sea coach de Specialisterne, psicólogo, psiquiatra o terapeuta. En México casi no existe otra figura como el coach, así que no nos limitamos a Specialisterne. Quien paga es la empresa empleadora (también puede ser a través de Specialisterne).

## Cómo funciona

- **Mi manual de usuario:** arranca del perfil profesional de Specialisterne, o de unas preguntas si la persona no lo tiene. Ella lo ve, lo corrige y se lo lleva a otros empleos. Si quiere, Pip genera una versión corta para su jefe ("cómo trabajo mejor") solo con lo que ella elija: cómo prefiere recibir instrucciones, qué ajustes pide y cómo darle feedback.
- **Decodificar con el perfil:** pega un mensaje y recibe qué le piden, para cuándo, qué se espera aunque no se diga y los pasos. Si no está segura, "Pregunta, no adivines" le da la pregunta ya redactada.
- **Detector de cambios:** cuando un mensaje anuncia un cambio de proyecto, líder o prioridades, arma un mini plan de transición y sugiere qué preguntar. Es el momento en que hoy nadie ayuda.
- **Check-in inspirado en la teoría de las cucharas:** mañana, mediodía y tarde, con opciones cerradas y visuales. Ajusta cuántos pasos propone ese día y recolecta información para el resumen y el manual de usuario.
- **Mi resumen:** un documento que Pip genera para la persona y para nadie más. Junta su semana (cucharas, cambios, qué le costó, qué funcionó) y le recomienda compartirlo con quien la acompañe: coach, psicólogo, psiquiatra, terapeuta o su jefe. Ella elige a quién, y Pip arma una versión para cada uno con solo lo que le sirve (al psicólogo, energía y estrés; al jefe, solo los ajustes que pide). La persona revisa cada punto, lo descarga en PDF o lo copia, y lo comparte ella misma. Pip nunca manda nada solo. Si nota varios días con pocas cucharas, le sugiere llevar el resumen a su próxima sesión.
- **Responder con el porqué:** sugiere cambios a un correo, explica cada uno y la persona decide.

## Qué entra y qué queda fuera

- **Mascota y zona de logros:** entran en el demo. La mascota se puede personalizar con objetos que se obtienen completando tareas, y la zona de logros muestra lo terminado con calma, sin rachas ni castigos.
- **Dashboard para el coach:** fuera. Lo reemplaza el resumen que la persona genera y comparte ella misma.
- **Wearable:** solo si sobra tiempo. Si no, los check-ins de cucharas durante el día cubren esa parte.
- **Leer la pantalla:** opcional, apagado por defecto y muy configurable (en qué apps, cuándo, y borrar la captura al leerla).
- **Contexto del rol con base de datos vectorial:** probablemente queda fuera del MVP. Para empezar basta una ficha del rol (puesto, equipo, herramientas, glosario y reglas de la empresa) separada en secciones con etiquetas; por cada mensaje solo entran al prompt las 2 o 3 secciones relevantes. Si la ficha crece mucho, esas secciones se buscan con embeddings en una base local (sqlite-vec o LanceDB), sin cambiar el resto.
- **"Mensaje claro" para jefes:** se queda como maqueta, pero gana peso porque el líder es el factor número uno. Se complementa con la versión corta del manual que la persona puede compartir con su jefe.

## El demo

Un mensaje vago del jefe anuncia un cambio de proyecto. Pip lo convierte en pasos usando el perfil y explica lo que se espera sin decirse. El check-in muestra que a la persona le quedan pocas cucharas, así que el plan se ajusta. Al final genera su resumen, le sugiere compartirlo con su coach o su psicóloga, y la persona elige qué puntos van en cada versión.

Para abrir el pitch, la historia del primer día: "llegaron desregulados" por el transporte y "a partir de ahí, minuto uno, ya están cansados".

## Negocio (por definir)

Todavía no definimos el modelo de negocio. Hoy vemos dos caminos que pueden convivir:

1. **A través de Specialisterne.** En México no está logrando vender proyectos de inclusión porque son caros y largos. Pip le ayudaría a extender el acompañamiento después de los 6 meses, a reducir el tiempo que sus coaches dedican a notas y a tener indicadores. Eso abarata su servicio y lo hace más fácil de vender.
2. **Las empresas lo contratan directamente como ajuste razonable.** Se justifica porque una persona autista a gusto en su trabajo aporta mayor retención (SAP lo midió), hiperfoco, apego a procesos y metodologías, y buen control de calidad.

Para quien no tiene apoyo de su empresa, quedaría un plan personal.

## Lo que seguía abierto

*(Las respuestas del 1 de noviembre están en [../DECISIONS.md](../DECISIONS.md).)*

- ¿La persona habla con Pip por voz, por chat o puede elegir? → Solo texto por ahora.
- ¿La IA lee los mensajes de trabajo o solo lo que la persona selecciona? → Solo lo que selecciona.
- ¿Pip guía con indicaciones visuales sobre la pantalla o solo con texto? → Solo texto en el MVP; los resaltados son nivel 3.
- ¿Quién paga, la empresa o Specialisterne? → Sigue abierto.
- Definir la estructura del perfil profesional → Ver `src/shared/schemas.ts`.

## Tareas por importancia y urgencia (versión original)

**Importante y urgente: hacer ya**
- Escribirle a la contacto de Specialisterne para pedir de 3 a 5 participantes, un perfil profesional anonimizado y la plática con el desarrollador de SAP. Todo lo que tiene que ver con usuarios depende de esto.
- Buscar testers por un segundo canal (inclusión del Tec, comunidades autistas) por si Specialisterne tarda.
- Elegir el nombre y el guion del demo (el cambio de proyecto), porque definen la interfaz y el pitch.
- Cerrar el esquema JSON y el prompt con perfil, con el campo de cambio y el porqué de cada sugerencia.
- Armar la plantilla del manual de usuario con los campos del perfil profesional: comunicación, feedback, estrés, sensorial, aprendizaje y ajustes.
- Escribir el set de prueba de 20 a 30 mensajes ambiguos, con varios que anuncien cambios.
- Construir la vuelta completa: atajo, quitar datos personales, 3 llamadas con voto de mayoría y la tarjeta con pasos. *(El voto de mayoría se quitó; ver DECISIONS.)*

**Importante, puede esperar unos días**
- Detector de cambios con mini plan de transición.
- Check-in de cucharas que ajusta los pasos, con la mascota y la zona de logros.
- Mi resumen: el documento para la persona, con una versión por destinatario (coach, psicólogo, jefe) y exportar a PDF o copiar.
- Pruebas con 3 a 5 personas: pregunta de claridad antes y después, citas y registro de qué cambiamos gracias a ellas.
- Correr el set de prueba contra el modelo sin perfil y reportar los conteos tal cual.
- Validar con la coach si pagarían por ahorrar tiempo de notas, qué indicadores quieren y cuáles aceptarían compartir los participantes.
- Responder con el porqué, y la versión corta del manual para el jefe ("cómo trabajo mejor").
- Pitch: primer día, demo del cambio, evidencia y negocio. Ensayarlo varias veces con cronómetro.
- Blindar el demo: tecla de repetición, video de respaldo y prueba sin wifi.

**Si sobra tiempo**
- Corrección del coach que se guarda como ejemplo en el perfil.
- Maqueta de "Mensaje claro" para jefes. Después, en este orden: wearable, toggle de leer la pantalla y ficha del rol.
- Preguntarle a uno o dos psicólogos o terapeutas qué les serviría ver en el resumen.
