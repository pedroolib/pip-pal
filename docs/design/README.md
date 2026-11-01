# Diseño

Referencias visuales del concepto (de Canva: https://canva.link/dv2bgf5xclz1mch). Paleta, tipografía y porqués en [../research/pip-concept.md](../research/pip-concept.md).

| Archivo | Qué es |
|---|---|
| [task-card-reference.png](task-card-reference.png) | La tarjeta de tarea objetivo: Pip asomándose, título y paso, barra de 5 segmentos, "NOW", instrucción, Done / I'm stuck / reloj, "Then…". |
| [harbor-components.png](harbor-components.png) | Paleta Harbor y componentes: tarjeta de tarea, tarjeta de pasos ("Here's what Laura needs"), Pip acoplado con anillo de progreso y la píldora "Step 3 done". |
| [pip-moods.png](pip-moods.png) | Los 12 estados de ánimo de Pip **actuales**. Se va a redibujar (abajo). |

## Cómo se construye la tarjeta

| Pieza | Con qué |
|---|---|
| Fondo crema, borde fino, sombra suave | `Card` de shadcn con las variables de Harbor (`--card`, `--border`, `--radius`) y una sombra propia |
| "Done" | `Button` variante `default` (`--primary: #3368A0`) |
| "I'm stuck" y botón del reloj | `Button` variantes `outline` y `size="icon"` |
| Barra de 5 segmentos | Tailwind puro: 5 `div`s |
| "NOW", título, texto | Tailwind puro, Atkinson Hyperlegible, colores de texto de Harbor |
| Teclas | `<kbd>` con Tailwind. **Según el sistema:** `⌘` en Mac, `Ctrl` en Windows y Linux. |
| Pip asomándose | SVG con posición absoluta |

**Ajuste para el demo:** la referencia es la tarjeta de tarea *dentro de Excel* con la celda C2 resaltada; los resaltados en otras apps son nivel 3. En el demo, esta misma tarjeta muestra los pasos del mensaje del jefe, sin resaltado.

## Reglas

- Sin rojo ni amarillo: nada debe sentirse como una alarma. La urgencia va con un ícono pequeño y palabras.
- Sky blue `#66A3BF` es **solo para Pip**.
- Todo movimiento respeta `prefers-reduced-motion` (ya está en `main.css`).
- Texto navy sobre crema, nunca negro sobre blanco.

## Redibujo de Pip

El equipo va a redibujar a Pip. Mientras tanto la interfaz usa un dibujo provisional detrás de `<Pip mood="…" />`, así que el arte nuevo se cambia sin tocar código.

**Entrega:** a más tardar el **martes 3 de noviembre**.
**Formato:** SVG en capas: un SVG del **cuerpo** y un SVG de **ojos por cada estado de ánimo** (para animar el parpadeo por separado).

**Ojo con "Gentle":** en el dibujo actual las cejas inclinadas se leen como enojo, y "Gentle" es el estado del check-in, que nunca debe sentirse como regaño. Vale la pena revisarlo en el redibujo.

**Qué estado usa la app en cada momento:**

| Estado | Cuándo en Pip |
|---|---|
| calm | Acoplado, sin nada pasando |
| reading | Acaba de recibir la selección |
| thinking | Esperando a Claude |
| gentle | Check-in; pocas cucharas; sugerencia de calma |
| happy | Paso terminado |
| celebrate | Todos los pasos terminados |
| thanks | Después de "Ask, don't guess" o de dar feedback |
| sleepy | Check-in de la tarde / cierre del día |
| quiet | Pausado |
| hello | Primera vez que se abre |
| showing | Resaltado dentro de otra app (nivel 3) |
| listening | Voz (nivel 3) |
