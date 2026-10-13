# Consola de vigilancia sismo-volcánica en tiempo real

Detección temprana con STA/LTA sobre nueve estaciones acelerográficas (27 canales a 200 Hz, 5.400 muestras por segundo), todo dentro del navegador, construida con **Angular 22** y desplegable en **Vercel** sin configuración adicional.

---

## 1. Una reflexión antes de empezar

Cuando leí el caso por primera vez pensé que el reto era dibujar 27 sismogramas rápido. Me equivoqué, y el propio enunciado lo dice: no es un problema de graficación, es un problema de **planificación de trabajo**. La consola vieja no fallaba porque dibujara mal; fallaba porque hacía todo en el mismo hilo, y justo cuando el volcán se agitaba, el detector, el reordenamiento y el dibujo peleaban por los mismos milisegundos. El operador arrastraba el sismograma y la página no respondía. Eso, en un observatorio, no es un detalle de experiencia de usuario: es una alerta que llega tarde a 450.000 personas.

Por eso tomé una decisión que guió todo lo demás: **el hilo principal solo dibuja y atiende al operador**. Todo lo que es cálculo de señal vive en Workers, y el historial de 10 minutos vive en memoria compartida que el hilo de interfaz lee sin pedir permiso a nadie y sin copiar nada.

Lo que más disfruté fue descubrir que cada requisito escondía un algoritmo clásico: un montículo para reordenar tramas, una cola monótona para el máximo deslizante, un barrido de eventos para la coincidencia, un seqlock para leer sin bloquear. Y lo que más me hizo pensar fue la "trampa numérica" de la LTA: me obligó a medir la deriva en lugar de suponer que no existía. Al final dejé una prueba unitaria que **demuestra** que la suma móvil ingenua en `float32` se corrompe, y la consola muestra en vivo cuánta deriva corrigió.

Construí todo para que se pueda verificar abriendo las herramientas de desarrollo: hay un panel con INP, tareas largas y FPS en vivo; un generador de señal que reproduce desorden, duplicados, pérdidas y ráfagas; y una tabla de mediciones de copia frente a transferencia que se calcula en el equipo donde se abra la consola.

---

## 2. Cómo correr el proyecto localmente (paso a paso)

Funciona igual desde la terminal de Windows (CMD o PowerShell), macOS o Linux, y desde la terminal integrada de editores como Sublime Text (con el paquete Terminus), VS Code o WebStorm.

### Requisitos

- **Node.js 22.22.3 o superior** (recomiendo **Node 24 LTS**). Angular 22 no arranca con versiones anteriores.
  Verifique su versión con:
  ```
  node -v
  ```
- npm (viene con Node).
- Un navegador reciente: Chrome, Edge, Firefox o Safari.

### Pasos

1. Descomprima el `.zip` y entre a la carpeta del proyecto:
   ```
   cd seismic-console
   ```
2. Instale las dependencias (solo la primera vez):
   ```
   npm install
   ```
3. Arranque la consola:
   ```
   npm start
   ```
   Se abre sola en `http://localhost:4200`. El servidor de desarrollo ya envía las cabeceras COOP y COEP, así que `crossOriginIsolated` queda en `true` desde el primer momento.
4. Espere unos 15 segundos: es el calentamiento de la LTA (necesita al menos la mitad de su ventana de 30 s con datos válidos antes de opinar).
5. En el panel **Generador de señal sintética**, pulse **Inyectar sismo** y mire cómo se confirma el evento.

### Otros comandos útiles

| Comando | Para qué sirve |
|---|---|
| `npm run build` | Compila para producción en `dist/seismic-console/browser`. |
| `npm run preview` | Sirve la compilación de producción en `http://localhost:4300` con COOP/COEP (ejecute antes `npm run build`). Es lo más parecido a Vercel en local. |
| `npm test` | Ejecuta las pruebas unitarias de los algoritmos (reordenamiento, sumas móviles, envolvente, coincidencia). |
| `npm run generator` | Levanta el **servidor WebSocket del generador sintético** en `ws://localhost:8090`. |

### Usar el generador por WebSocket (para la sustentación)

El caso dice que el observatorio entrega un flujo binario por WebSocket. Incluí un servidor que hace exactamente eso, trama por trama, con el formato de 216 bytes:

1. En una terminal: `npm start`
2. En **otra** terminal: `npm run generator`
   - Opciones: `npm run generator -- --rain` (activa pérdidas por lluvia), `--burst=120` (ráfaga 4× de 120 s), `--port=9000`, `--seed=42`, `--no-disorder`, `--no-duplicates`, `--no-drift`.
   - Cada 5 segundos imprime cuántas tramas desordenó, duplicó y perdió, para compararlo con lo que detecta la consola.
3. En la consola, en **Fuente de datos**, elija **Servidor WebSocket** y pulse **Conectar**.

Los botones de inyectar sismo, ráfaga y fallas siguen funcionando: viajan al servidor como mensajes de control JSON.

> Nota: el modo WebSocket es para uso local (`http://localhost`). El despliegue en Vercel usa el generador interno, que corre en su propio Worker y produce exactamente el mismo flujo binario.

### Forzar la cantidad de workers

Para demostrar la partición del trabajo puede abrir `http://localhost:4200/?workers=3` (o 1, 9…). Sin ese parámetro, la consola decide sola según `navigator.hardwareConcurrency`.

---

## 3. Despliegue en Vercel

No hay que configurar nada a mano:

1. Suba la carpeta a un repositorio de GitHub (o use `vercel` desde la terminal).
2. En Vercel: **Add New → Project → Import** el repositorio.
3. Pulse **Deploy**.

El archivo `vercel.json` ya declara el comando de compilación, la carpeta de salida (`dist/seismic-console/browser`) y, lo más importante, las cabeceras que exige RT-5 en todas las rutas:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Para verificarlo en la URL pública, abra la consola del navegador y escriba `crossOriginIsolated`: debe responder `true`. La propia interfaz lo muestra en el encabezado ("Aislamiento de origen activo").

---

## 4. Cómo repartí el trabajo entre hilos

```
                ┌──────────────────────────── SharedArrayBuffer (24,72 MB) ───────────────────────────┐
                │  27 buffers circulares de muestras + 27 de envolvente + cursores atómicos + estado │
                └───────▲────────────────────▲─────────────────────────▲────────────────▲───────────┘
                        │ escribe            │ escribe                 │ lee            │ lee
 ┌───────────────┐  lotes transferibles ┌────┴──────────────┐          │                │
 │ Worker de     │ ───────────────────► │ Workers de        │  disparos│ (postMessage)  │
 │ ingesta       │   (MessageChannel    │ detección (1/3/9) │ ─────────┼──► Worker de   │
 │ generador o   │    directo, sin      │ reorden, STA/LTA, │          │    coincidencia ──► hilo principal
 │ WebSocket     │    pasar por el UI)  │ envolvente        │          │                │    (eventos)
 └───────────────┘                      └───────────────────┘   ┌──────┴───────┐  ┌─────┴───────────┐
                                                                │ Worker de    │  │ Hilo principal  │
                                                                │ exportación  │  │ rAF + Canvas +  │
                                                                │ Atomics.wait │  │ interacción     │
                                                                └──────────────┘  └─────────────────┘
```

| Hilo | Responsabilidad | Lo que **no** hace |
|---|---|---|
| **Hilo principal** | Dibujar con `requestAnimationFrame`, atender al operador, pintar paneles. Lee el historial directamente de la memoria compartida. | No reordena, no calcula STA/LTA, no genera el CSV. |
| **Worker de ingesta** | Recibe tramas (generador interno o WebSocket), valida la cabecera y las enruta por estación hacia su worker de detección mediante lotes `ArrayBuffer` **transferidos**. | No procesa señal. |
| **Workers de detección** | Reordenan y deduplican por canal, filtran el offset DC, calculan STA/LTA, envolvente de 5 s y escriben el historial. | No dibujan ni deciden eventos. |
| **Worker de coincidencia** | Ordena los disparos por tiempo de evento, los fusiona por estación y confirma eventos con 4 estaciones en 6 s. | No toca muestras. |
| **Worker de exportación** | Genera el CSV de ±90 s leyendo la memoria compartida; si faltan datos posteriores al evento, espera con `Atomics.wait`. | No bloquea a nadie más. |

### Partición elegida y su justificación frente a `hardwareConcurrency`

Particioné **por estación** (cada worker se queda con estaciones completas, es decir, sus 3 canales):

- Las tres componentes de una estación comparten reloj, enlace de radio y patrón de pérdidas; mantenerlas en el mismo worker conserva la localidad de datos y evita sincronizar estados entre hilos.
- El trabajo por estación es idéntico (600 muestras/s), así que el balance depende solo de cuántas estaciones recibe cada worker. Por eso elijo una cantidad de workers que **divida exactamente a 9**: 9, 3 o 1. Así ningún worker carga más que otro.
- Reservo 2 núcleos lógicos (hilo principal e ingesta). La regla es: el mayor valor de {9, 3, 1} que no supere `hardwareConcurrency − 2`.

| `hardwareConcurrency` | Workers de detección | Estaciones por worker |
|---|---|---|
| 2 a 4 | 1 | 9 |
| 5 a 10 | 3 | 3 |
| 11 o más | 9 | 1 |

Con reparto *round-robin* (estación 1 → worker 1, estación 2 → worker 2…) cada worker mezcla estaciones del flanco y urbanas, de modo que un sismo cercano al cráter no recae entero sobre un solo hilo. Medido en el navegador, un solo worker procesa la ráfaga 4× (más de 23.000 muestras/s) con alrededor de 1 % de ocupación, gracias a que todo el procesamiento es O(1) por muestra.

---

## 5. Por qué elegí estos patrones

### Patrón de renderizado: CSR (y por qué no SSR, SSG ni ISR)

El caso no pide un patrón de renderizado concreto, así que no forcé ninguno. La consola es una **SPA renderizada en el cliente (CSR)**, y lo considero lo correcto aquí: el contenido es un lienzo que cambia 60 veces por segundo con datos que solo existen en el navegador del operador, y depende de `SharedArrayBuffer`, Workers y `crossOriginIsolated`. Pre-renderizar en el servidor no aporta nada (no hay SEO ni contenido estático que mostrar antes de los datos) y sí agregaría complejidad al despliegue. CSR además permite que Vercel sirva archivos estáticos con las cabeceras de aislamiento, sin funciones de servidor.

### Patrones de diseño

| Patrón | Dónde | Para qué sirve aquí |
|---|---|---|
| **Strategy** | `FrameSource` con `SyntheticFrameSource` y `WebSocketFrameSource` | El worker de ingesta cambia de fuente sin cambiar nada más. El servidor Node reutiliza el mismo generador. |
| **Mediator / Orquestador** | `SeismicPipelineService` | Crea la memoria compartida, los workers y los `MessageChannel` que los conectan directamente entre sí; los componentes no conocen la topología. |
| **Observer** | `ChannelTransitionListener`, `PerformanceObserver`, signals de Angular | Los canales notifican transiciones sin conocer al coordinador; la interfaz reacciona a signals sin sondear. |
| **Productor-consumidor con colas acotadas** | `TimeSlicedQueue` en workers e hilo principal | Absorbe ráfagas y procesa por porciones con presupuesto de tiempo, cediendo el control al Event Loop. |
| **Seqlock (lector optimista)** | `RingHistoryWriter` / `RingHistoryReader` | Lectura sin bloqueo del historial compartido con detección de sobrescritura (detalle en la sección 6.5). |
| **Composición (pipeline)** | `ChannelPipeline` = DC-blocker → STA/LTA → envolvente → historial | Cada pieza tiene una sola responsabilidad y se prueba aislada. |

En el código respeto SOLID: cada clase hace una sola cosa (`MinHeap`, `SequenceWindowSet`, `FrameReorderBuffer`, `CompensatedMovingEnergy`, `SlidingMaxEnvelope`, `CoincidenceEngine`…), los componentes de Angular solo presentan, y los servicios solo coordinan.

---

## 6. Análisis algorítmico exigido

### 6.1 Reordenamiento de tramas (RF-1)

- **Estructura:** un montículo mínimo por canal con clave `(t0, seq)` y un conjunto de secuencias vistas de tamaño fijo (512 posiciones, `Float64Array` direccionado por `seq & 511`).
- **Entrega:** se entrega la trama `seq == esperado`; si falta, se espera.
- **Cierre de ventana:** acoté la espera a **750 ms**, que son 3 tramas de 250 ms, justo el desorden máximo medido (3 posiciones). Además uso una regla más rápida: si llegó la trama `s`, toda trama menor que `s − 3` ya no puede llegar (rompería la cota de desorden), así que la doy por perdida de inmediato sin esperar los 750 ms. Esto reduce la latencia en días de lluvia.
- **Duplicados:** si la secuencia está en el conjunto, se descarta y se cuenta. Memoria constante: 4 KB por canal.
- **Trama tardía:** si llega con `seq < esperado` y no está en el conjunto (es decir, ya se había declarado perdida), se descarta y se cuenta; **nunca** se inserta a la fuerza.
- **Costo:** O(log k) por trama, con k ≤ 64 tramas retenidas (en la práctica k ≤ 4), O(1) para duplicados. **Memoria máxima por canal:** 64 tramas × 216 B ≈ 13,5 KB + 4 KB del conjunto.
- **Descarté:** ordenar un arreglo en cada llegada (O(k log k)) y un `Map` ilimitado de secuencias vistas (crece sin cota durante horas).

En la prueba en navegador, con las fallas activadas, la consola detectó **45 duplicados de 45 inyectados y 165 pérdidas de 165 inyectadas**.

### 6.2 Sumas móviles de STA y LTA (RF-2)

- **De O(k) a O(1):** cada ventana es un buffer circular de energías `x²`; al entrar una muestra se suma la nueva y se resta la que sale: 2 operaciones, sin importar si la ventana es de 200 o de 6.000 muestras. La versión ingenua hace 6.200 operaciones por muestra; esta, unas 6.
- **Huecos:** las muestras perdidas se guardan como `NaN`. No se suman ni se restan, y se lleva el conteo de muestras válidas, de modo que el promedio es `suma / válidas`. Si alguna ventana tiene menos del 50 % de datos válidos, el detector **mantiene su estado** en lugar de inventar una relación.
- **LTA congelada:** mientras el canal está en disparo no se empuja nada a la LTA; así el propio sismo no eleva el umbral. Agregué un límite de seguridad de 120 s en disparo para que un cambio permanente de ruido no deje la LTA congelada para siempre.
- **Offset DC:** antes del detector hay un filtro pasa-altos de un polo (`y = x − x₋₁ + 0,995·y₋₁`, O(1)); sin él, el offset del conversor domina `x²` y la relación STA/LTA queda pegada en 1.

**La trampa numérica.** Con `suma = suma + nuevo − viejo` en `float32`, la LTA puede volverse negativa o quedarse anclada. Usé tres defensas combinadas:

1. **Acumulación en `float64` con compensación de Neumaier** (variante de Kahan que también funciona cuando el sumando es mayor que la suma): unas 4 operaciones extra por muestra.
2. **Recálculo exacto periódico**: cada `ventana` muestras se recalcula la suma completa (6.000 operaciones cada 6.000 muestras). El costo amortizado es **1 operación extra por muestra**, así que sigue siendo O(1).
3. **Guarda de signo:** si la suma corrida da negativa, se recalcula en el acto.

En cada recálculo mido la deriva relativa `|corrida − exacta| / exacta` y la muestro en el panel. En las pruebas se mantuvo en el orden de **10⁻¹⁶**. La prueba `compensated-moving-energy.spec.ts` demuestra además que la suma ingenua en `float32` sí se corrompe (error relativo superior a 10⁻³).

### 6.3 Máximo en ventana deslizante (RF-3)

- **Estructura:** cola doble **monótona decreciente** de pares (índice, |x|) sobre arreglos tipados de tamaño fijo (1.001 posiciones).
- **Algoritmo:** al entrar una muestra se expulsan por detrás los valores menores o iguales (nunca podrán ser máximo) y por delante los que salieron de la ventana. El frente es siempre el máximo.
- **Costo:** O(1) amortizado, porque cada muestra entra y sale de la cola una sola vez. Memoria O(w).
- **Por qué no un montículo:** un montículo cuesta O(log w) por muestra y, además, no sabe borrar el elemento que sale de la ventana sin borrado perezoso, que acumula basura y memoria. La cola monótona es más simple, más rápida y no asigna memoria en caliente.

### 6.4 Coincidencia multi-estación (RF-4)

- **Orden por tiempo de evento:** los workers procesan a ritmos distintos, así que el coordinador mete las transiciones en un montículo por tiempo y solo las libera cuando **todos** los workers garantizan haber pasado ese instante (marca de agua = mínimo del progreso de cada worker). Así el resultado es exacto aunque los mensajes lleguen desordenados entre hilos.
- **Fusión por estación:** una estación entra en disparo cuando su primer canal dispara y sale cuando se apaga el último. El tiempo de entrada es el del canal más temprano.
- **Conteo incremental (barrido):** mantengo cuántas estaciones distintas "pertenecen" a la ventana: las que están en disparo o se apagaron hace menos de 6 s. Las que se apagan entran a una cola ordenada por fin de intervalo; al avanzar el tiempo, se expulsan del frente las que quedaron fuera. En el instante en que el conteo llega a 4 se confirma el evento con **ese tiempo exacto**, sin esperar a que se cierren los intervalos.
- **Costo:** O(1) amortizado por transición más O(log m) del orden por tiempo, frente a O(n²) de comparar todos los pares de estaciones en cada cambio.
- **Deriva de reloj (hasta 40 ms):** es menor que el 1 % de la ventana de 6 s, así que no altera la confirmación. Cada canal guarda su propio tiempo base, por lo que la exportación y el dibujo ubican cada estación con su reloj.

### 6.5 Buffer circular compartido (RF-5)

**Cálculo exacto de bytes reservados** (lo calcula `SharedMemoryLayout`):

| Región | Tipo | Elementos | Bytes |
|---|---|---|---|
| Cursores (comprometido y pendiente por canal) | `BigInt64Array` | 27 × 2 | 432 |
| Tiempo base por canal | `Float64Array` | 27 | 216 |
| Bandera de base lista | `Int32Array` | 27 | 108 (+4 de alineación) |
| **Muestras** (10 min × 200 Hz) | `Float32Array` | 27 × 120.000 = **3.240.000** | **12.960.000** |
| Envolvente de 5 s | `Float32Array` | 27 × 120.000 | 12.960.000 |
| Estado por canal | `Float64Array` | 27 × 16 | 3.456 |
| Estado por worker | `Float64Array` | 9 × 8 | 576 |
| Estado global | `Float64Array` | 32 | 256 |
| **Total** | | | **25.925.048 bytes (24,72 MB)** |

Uso `Float32Array` porque un conversor de 24 bits cabe exacto en la mantisa de 24 bits, y porque permite marcar los huecos con `NaN`.

**Lectura sin bloqueo (seqlock):** cada canal tiene dos contadores atómicos de 64 bits: `pendiente` y `comprometido`.

- El escritor (worker de detección) hace `Atomics.store(pendiente, c + n)`, escribe las n muestras y luego `Atomics.store(comprometido, c + n)` y `Atomics.notify`.
- El lector (hilo principal) lee `comprometido`, recorre los datos **directamente** en la memoria compartida y al final vuelve a leer `pendiente`. Si el inicio de lo que leyó es menor que `pendiente − capacidad`, el escritor alcanzó esa región mientras la leía: **se descarta la lectura** (no se dibuja ni se guarda en caché) en lugar de devolver datos corruptos.
- El hilo principal **nunca** espera: solo hace `Atomics.load`. `Atomics.wait` aparece únicamente en el worker de exportación (RT-3).
- **Cuando el escritor alcanza al lector:** el escritor nunca se detiene (el flujo no se puede pausar). La política es "el lector cede": la lectura invalidada se descarta y se reintenta en el siguiente cuadro. Como el operador navega a lo sumo hasta 10 minutos atrás y el visor limita el desplazamiento al historial vigente, esto solo ocurre en el borde más antiguo.

### 6.6 Diezmado para dibujar (RF-6)

- **Min/máx por píxel:** cada columna de píxel abarca `ceil(12.000 / 900) = 14` muestras, de las que guardo el mínimo y el máximo y dibujo una línea vertical entre ambos. Un pico de una sola muestra **siempre** aparece.
- **Por qué no el submuestreo simple:** tomar 1 de cada 14 muestras descarta 13 de cada 14. Un evento impulsivo de 30 ms (6 muestras) tiene más de un 50 % de probabilidad de caer entre dos muestras elegidas y desaparecer del sismograma, justo lo que el operador necesita ver.
- **Caché de columnas:** las columnas se alinean al índice absoluto de muestra, de modo que en vivo solo se calculan las columnas nuevas (1 o 2 por cuadro); las demás salen de una caché por canal. El costo por cuadro es O(ancho + muestras nuevas) en lugar de O(27 × 12.000).
- El dibujo ocurre **solo** dentro de `requestAnimationFrame` (RT-6); no hay `setInterval` para dibujar en ningún lugar del código.

---

## 7. Mediciones

### Copia estructurada frente a objetos transferibles (RT-4)

Medido con el panel **Copia estructurada vs. objetos transferibles** (mediana de 15 envíos entre dos workers, tiempo por envío) en Chromium headless con 2 núcleos lógicos:

| Tamaño | Copia | Transferencia | Mejora |
|---|---|---|---|
| 216 B (1 trama) | 0,020 ms | 0,015 ms | 1,3× |
| 11,4 KB (lote típico) | 0,025 ms | 0,015 ms | 1,7× |
| 1,00 MB | 1,473 ms | 0,013 ms | 118× |
| 12,36 MB (historial de muestras completo) | 15,640 ms | 0,013 ms | 1.251× |

La conclusión es la que esperaba: la transferencia cuesta lo mismo sin importar el tamaño (solo se mueve la propiedad del buffer), mientras que la copia crece linealmente. Copiar el historial en cada cuadro costaría casi un cuadro entero (16,7 ms). Por eso el historial **nunca** viaja con `postMessage`: se lee de la memoria compartida. Los lotes de tramas y el CSV generado sí se envían como transferibles. Los números de su equipo aparecen al pulsar **Medir** en la consola.

### Hilo principal (RT-7)

En la misma prueba, con ráfaga 4× activa y pérdidas por lluvia:

- **INP: 64 ms** (meta ≤ 200 ms), desglosado en retardo de entrada, procesamiento (alrededor de 1 ms, porque los manejadores solo actualizan el estado del visor) y retardo de presentación.
- Dibujo de las 27 trazas: alrededor de 5 ms por cuadro.
- Las únicas tareas largas fueron las del arranque de Angular; ninguna durante la ráfaga.

El panel **Hilo principal e interacción** muestra todo esto en vivo con `PerformanceObserver` (`event` para INP con su desglose y `longtask` para tareas largas). En Safari, que no implementa esas entradas, el panel lo indica en lugar de mostrar datos falsos.

### Rezago tras una ráfaga (RT-8)

Las notificaciones que llegan al hilo principal (disparos y eventos) entran a una cola que se procesa por **porciones de 4 ms**. Entre porción y porción el control vuelve al Event Loop con una **macrotarea explícita** (`scheduler.postTask`, o `MessageChannel` donde no existe). Nunca encadeno ese trabajo con promesas ni con `queueMicrotask`, porque las microtareas se ejecutan todas antes de que el navegador pueda pintar o atender un clic, y eso es exactamente lo que congelaba la consola vieja. Los workers de detección usan el mismo mecanismo con porciones de 8 ms para seguir atendiendo mensajes de control (por ejemplo, cambios de umbral) durante una ráfaga.

---

## 8. Mapa de requisitos

| Requisito | Dónde se cumple |
|---|---|
| RF-1 Ingesta ordenada | `core/dsp/frame-reorder-buffer.ts`, `sequence-window-set.ts`, `min-heap.ts` |
| RF-2 STA/LTA O(1) | `core/dsp/compensated-moving-energy.ts`, `sta-lta-detector.ts`, `dc-blocker.ts` |
| RF-3 Envolvente | `core/dsp/sliding-max-envelope.ts` |
| RF-4 Coincidencia | `core/coincidence/*` |
| RF-5 Historial 10 min | `core/memory/shared-memory-layout.ts`, `ring-history.ts` |
| RF-6 60 fps | `core/render/*`, `components/seismogram-panel` |
| RF-7 Alerta y exportación | `components/alert-banner`, `components/event-panel`, `core/export/*`, `workers/export.worker.ts` |
| RT-1 Workers dedicados | `workers/*.worker.ts`, `core/topology/worker-topology-planner.ts` |
| RT-2 SharedArrayBuffer circular | `core/memory/*` |
| RT-3 Atomics | `ring-history.ts` (store/load/notify), `export-job-runner.ts` (`Atomics.wait`, solo en worker) |
| RT-4 Transferibles y medición | `core/ingest/frame-batch-router.ts`, `core/metrics/transfer-benchmark.ts` |
| RT-5 COOP/COEP | `vercel.json`, `angular.json` (servidor de desarrollo), `tools/preview-server.mjs` |
| RT-6 rAF + min/máx | `services/animation-loop.service.ts`, `core/render/min-max-decimator.ts` |
| RT-7 INP y long tasks | `core/metrics/interaction-monitor.ts`, `long-task-monitor.ts` |
| RT-8 Ceder al Event Loop | `core/scheduling/macrotask-scheduler.ts`, `time-sliced-queue.ts` |
| RT-9 Despliegue | `vercel.json` |
| Generador sintético | `core/generator/*` (navegador) y `tools/stream-server.ts` (WebSocket) |

---

## 9. Estructura del proyecto

```
seismic-console/
├── public/
│   ├── i18n/es.json               Todos los textos de la interfaz en español
│   └── favicon.svg
├── src/
│   ├── styles.scss                Sistema visual en modo claro (variables CSS)
│   └── app/
│       ├── core/                  Lógica pura, sin Angular (se comparte con los workers)
│       │   ├── config/            Constantes del caso y red de estaciones
│       │   ├── protocol/          Formato binario de 216 bytes y mensajes de control
│       │   ├── memory/            Layout del SharedArrayBuffer y seqlock
│       │   ├── dsp/               Reordenamiento, STA/LTA, envolvente, pipeline por canal
│       │   ├── coincidence/       Orden por tiempo de evento y confirmación
│       │   ├── generator/         Señal sintética, sismos, ruido local y fallas del enlace
│       │   ├── ingest/            Fuentes de tramas y enrutamiento por estación
│       │   ├── processing/        Procesador de estaciones (vive en un worker)
│       │   ├── export/            CSV de ventana y trabajo de exportación
│       │   ├── render/            Visor, diezmado min/máx y dibujo en Canvas
│       │   ├── metrics/           INP, tareas largas, FPS y benchmark
│       │   ├── scheduling/        Macrotareas y colas por porciones de tiempo
│       │   └── topology/          Partición de estaciones entre workers
│       ├── workers/               Puntos de entrada de cada Worker
│       ├── services/              Orquestación y estado (signals) para la interfaz
│       └── components/            Paneles de la consola
├── tools/
│   ├── stream-server.ts           Servidor WebSocket del generador (npm run generator)
│   └── preview-server.mjs         Vista previa de producción con COOP/COEP
├── vercel.json
└── angular.json
```

Todo el código está en inglés y sin comentarios, como pedía la consigna; las explicaciones viven aquí.

---

## 10. Lo que haría después

Si este proyecto siguiera creciendo, movería el dibujo a un `OffscreenCanvas` en su propio worker cuando todos los navegadores del observatorio lo soporten con `requestAnimationFrame`, agregaría una corrección activa de deriva de reloj por correlación cruzada entre estaciones vecinas y persistiría los eventos confirmados en IndexedDB para que un cambio de turno no los pierda. Pero para la pregunta que planteaba el caso, si la interfaz puede seguir respondiendo mientras el volcán habla más fuerte que nunca, creo que la respuesta ya está medida: sí.
