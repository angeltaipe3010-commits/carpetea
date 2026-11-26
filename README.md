# DeskFlow

**Organiza menos. Encuentra más.**

DeskFlow es un organizador inteligente de archivos para escritorio (Windows primero). Analiza una carpeta, propone una estructura de carpetas y subcarpetas según su contenido real y no mueve nada hasta que el usuario lo confirma. Todo funciona en local.

> **Estado: Fase 2 — app de escritorio con motor real.** Dentro de la app de escritorio (Tauri 2 + Rust), DeskFlow analiza, organiza y deshace operaciones sobre **carpetas reales**. En el navegador (`npm run dev`) sigue funcionando el prototipo con datos simulados. Duplicados y monitoreo todavía no están en la versión de escritorio y la interfaz lo indica.

## App de escritorio

Requisitos en Windows: Node.js 20+, [Rust](https://rustup.rs) (toolchain MSVC), Visual Studio Build Tools con C++ y WebView2 (incluido en Windows 11).

```bash
npm install
npm run tauri dev      # abre la ventana de DeskFlow con el motor real
npm run tauri build    # genera los instaladores (NSIS y MSI) en src-tauri/target/release/bundle
cd src-tauri && cargo test   # pruebas del motor en carpetas temporales
npm run test:e2e       # QA de la app de escritorio real (Playwright)
```

### QA de la app de escritorio (`e2e/desktop`)

Playwright se conecta a la ventana real de DeskFlow por CDP (WebView2 lo permite en Windows), así que las pruebas usan el motor de Rust y el disco de verdad:
- El fixture crea una carpeta aislada en `e2e/.sandbox/`, con un *Origen* de descargas falsas y un *Destino* con estructura propia.
- Arranca una **segunda instancia** de la compilación de depuración, con base de datos y perfil de WebView2 propios, y la borra al terminar (`DESKFLOW_E2E_KEEP=1` para conservarla).
- Nunca toca tus carpetas ni tu historial: con `DESKFLOW_E2E_ROOT` el motor queda **encerrado** en la carpeta de pruebas y rechaza cualquier otra ruta. Los ganchos `DESKFLOW_E2E_ROOT` y `DESKFLOW_DATA_DIR` solo existen en compilaciones de depuración.
- `regressions.spec.ts` fija los fallos que encontró el QA exploratorio (doble clic al confirmar, carpetas «..», foco de los diálogos, descartar cambios). Los specs exploratorios del agente tester viven en `e2e/.explore/` (fuera de git): `npx playwright test -c e2e/.explore/playwright.config.ts`.
- Requiere `src-tauri/target/debug/deskflow.exe` (lo genera `npm run tauri dev`).

Cubre, por orden de riesgo:
- No sobrescribir.
- Archivos en uso o modificados tras el análisis.
- Deshacer completo.
- Destinos sin permiso o en la nube.
- "Usar mi estructura" y cursos nuevos.

### Motor (`src-tauri/src`)

| Módulo | Qué hace |
|---|---|
| `lib.rs` | Comandos Tauri: `environment`, `list_suggested_folders`, `pick_folder`, `probe_dirs`, `local_documents`, `scan`, `cancel`, `execute`, `undo`, `history` |
| `scanner.rs` | Recorre el origen leyendo solo metadatos. Omite ocultos, exclusiones, carpetas del sistema, descargas en curso y carpetas ya organizadas. Progreso por canal y cancelación |
| `classifier.rs` | Port fiel de `src/services/classifier.ts`, con pruebas sobre los mismos casos |
| `fsops.rs` | Mover sin sobrescribir nunca (`MoveFileExW` sin `REPLACE_EXISTING`). Entre unidades: copia a temporal, verifica tamaño, renombra y solo entonces borra el original |
| `organizer.rs` | Ejecuta el plan confirmado y deshace. Solo mueve archivos del último análisis que no hayan cambiado; deshacer verifica tamaño y fecha antes de devolver cada archivo y retira las carpetas creadas que quedan vacías |
| `db.rs` | Diario en SQLite (`deskflow.db` en la carpeta de datos de la app). Cada movimiento se anota antes de hacerse; al arrancar repara operaciones interrumpidas |
| `safety.rs` | Detección de nube (raíces de OneDrive del sistema, nombres de clientes y atributos de archivos en la nube), rutas del sistema y carpetas autorizadas |

**Permisos:** la interfaz no tiene acceso al disco (ningún plugin de sistema de archivos). Rust solo opera en carpetas elegidas en el selector nativo o sugeridas por la app (Descargas, Escritorio, bibliotecas), y rechaza las del sistema y `AppData`.

---

## Ejecutar el prototipo

Requisitos: Node.js 20 o superior (probado con Node 26).

```bash
npm install
npm run dev        # http://localhost:1420
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo en el puerto 1420 (el que usará Tauri) |
| `npm run build` | Compila TypeScript y genera `dist/` |
| `npm run preview` | Sirve la compilación de producción |
| `npm run lint` | Revisión con oxlint |

Las preferencias, reglas e historial del prototipo se guardan en `localStorage`. Para empezar de cero, borra las claves `deskflow:*` en las herramientas del navegador.

---

## Qué incluye la Fase 1

| Pantalla | Estado | Notas |
|---|---|---|
| **Inicio** | ✅ | Saludo, acción principal, accesos a carpetas, resumen, actividad, automatizaciones |
| **Organizar** | ✅ | Origen → Análisis con progreso y cancelación → Vista previa editable → Confirmación → Resultado |
| **Duplicados** | ✅ | Búsqueda por fases (tamaño → hash parcial → hash completo), elegir qué copia conservar, apartar sin borrar |
| **Reglas** | ✅ | Crear, editar, eliminar, activar y reordenar por prioridad, con recuento de coincidencias en vivo |
| **Historial** | ✅ | Detalle de cada movimiento, errores, carpetas creadas y deshacer con verificación |
| **Configuración** | ✅ | Tema, animaciones, profundidad, subcarpetas por año, carpeta de revisión, exclusiones, privacidad |

**Vista previa de Organizar** (el núcleo):
- Árbol de carpetas propuesto, con carpetas marcadas como **Nueva**, expansión animada y navegación por teclado.
- Renombrar (doble clic o `F2`) y crear subcarpetas.
- Arrastrar uno o varios archivos sobre una carpeta del árbol.
- Filtros por confianza (alta, media, sin clasificar), conflictos y excluidos; búsqueda.
- Acciones en lote: mover a una carpeta o excluir.
- Conflictos de nombre detectados (mismo nombre en el destino, o archivo que ya existe) con política *Renombrar con (1)* o *No mover*.
- Lo que se confirma es exactamente el plan calculado por `buildPlan`, no una simulación aparte.

**Destino de lo organizado** (en Organizar y en Configuración; se recuerda la última elección):
- **Misma carpeta:** la estructura se crea dentro del origen.
- **Bibliotecas de Windows:** Documentos y Proyectos van a *Documentos*, Imágenes a *Imágenes*, Videos a *Vídeos* y Audio a *Música*. Programas, comprimidos y *Por revisar* se quedan en el origen.
- **Otra carpeta:** cualquier carpeta local, elegida con el selector, que también permite crear carpetas nuevas.
- **Nube solo con confirmación:** si el destino está sincronizado (OneDrive, Google Drive, Dropbox, iCloud, Box, MEGA), incluidas las bibliotecas de Windows redirigidas a OneDrive, aparece un aviso “¿Guardar en OneDrive?”.
  - **Sí:** se permite. Queda señalado en el destino, en la vista previa y en la confirmación.
  - **No:** DeskFlow busca una carpeta Documentos que esté solo en el equipo y la usa. Si no existe, la crea (`C:\Users\…\Documentos`). Se puede cambiar después.
  - Cerrar el aviso sin elegir no cambia nada. Las carpetas del sistema siguen bloqueadas.
- **Escenario simulado:** el prototipo imita un Windows 11 con la copia de seguridad de OneDrive activada (Documentos e Imágenes en OneDrive, sin carpeta Documentos local), para que se pueda probar el flujo completo.
- **No reorganiza lo ya ordenado:** DeskFlow recuerda las carpetas que creó y las omite al volver a analizar el origen. Si deshaces una operación, esas carpetas vuelven a analizarse.

**Usar mi estructura** (activado por defecto; se puede desactivar en Organizar o en Configuración). Antes de proponer, DeskFlow lee la estructura del destino (solo nombres) y decide en este orden:
1. **Reglas.** Tienen prioridad, pero su destino se encaja en tus carpetas equivalentes (por ejemplo, `Documentos/Finanzas/Facturas` pasa a tu `Finanzas/Recibos y facturas`).
2. **Tus carpetas.** Busca la carpeta existente que mejor coincide con el nombre del archivo:
   - Usa las palabras del nombre de la carpeta, ponderadas por rareza: "orientada" pesa más que "cibertec".
   - Reconoce siglas ("POO", "POOII" → *Programacion Orientada a Objetos*).
   - Tiene en cuenta las palabras que se repiten en los archivos que ya contiene. Las que aparecen en muchas carpetas, como tu nombre, apenas cuentan.
   - En la vista previa se marca con **Tu carpeta**.
3. **Cursos nuevos.** Si el nombre es de un trabajo académico (el curso va seguido de `T1`, una sección como `T5FO`, `PC1`, `EF`, `Semana`, `Unidad`…) y no existe carpeta para ese curso, se crea dentro de tu `Estudios` copiando tu formato (`Cibertec - Desarrollo de Aplicaciones Web I`). Todos los trabajos del mismo curso van a esa carpeta. Se marca con **Curso nuevo**.
4. **Categorías encajadas.** Si nada coincide, la categoría normal se coloca en tus carpetas equivalentes (`Estudios`, `Videos/Grabaciones de pantalla`) e incluso en subcarpetas por tipo (`Documentos/Word`, `/PDF`), en lugar de crear carpetas paralelas.

No se usan como destino las carpetas de proyectos de código (con `package.json`, `.git`…), las de programas (`IISExpress`, apps portables) ni *Por revisar*. Tampoco se mete un archivo en una rama de otro tipo (un `.csv` en `Videos/…`) salvo coincidencia clara. Lo que colocas a mano en la vista previa no se recalcula al cambiar el destino. La lógica está en `src/utils/structure.ts` y el índice de carpetas en `index_tree` (Rust).

**Simulado a propósito:** el análisis, los movimientos y el deshacer se ejecutan en memoria con tiempos ficticios (`src/services/api.ts`). La simulación incluye un archivo bloqueado (`DiscordSetup.exe`) y un archivo modificado al deshacer, para mostrar cómo se informan los errores.

**Señalado como no disponible:** elegir otra carpeta con el selector nativo de Windows, monitoreo de carpetas, IA opcional e idioma inglés.

---

## Arquitectura

```
src/
├── types/            Contrato de dominio (se reflejará en structs de Rust)
├── services/
│   ├── api.ts        Interfaz DeskFlowApi + implementación mock
│   └── classifier.ts Clasificador de referencia (niveles 1–3 + confianza)
├── utils/
│   ├── plan.ts       Árbol, conflictos y plan final (funciones puras)
│   └── rules.ts      Evaluación y descripción de reglas
├── stores/           Estado con Zustand (organizer, settings, rules, history, toasts)
├── components/
│   ├── ui/           Button, Dialog, Panel, Badge, Switch, Segmented, Progress, Skeleton…
│   ├── layout/       Sidebar, Page, PageHeader
│   ├── files/        FileIcon, ConfidenceBadge
│   ├── folders/      FolderTree (expandir, renombrar, soltar archivos)
│   └── history/      OperationBadge
├── pages/            Dashboard, Organizer/*, Duplicates, Rules, History, Settings
├── data/mock.ts      Carpetas, archivos, duplicados e historial de ejemplo
├── hooks/useTheme.ts Tema y preferencia de movimiento
└── lib/              motion (easing y variantes), format, cn, id
```

### Decisiones

1. **Una sola interfaz de servicios (`DeskFlowApi`).** Las pantallas solo hablan con `api`. En la Fase 2 se añade `tauriApi` (comandos `invoke` + eventos de progreso) y se cambia una línea, sin tocar las pantallas.
2. **El clasificador es la especificación del motor de Rust.** `classifier.ts` define entradas, salidas, motivos y niveles de confianza. Al portarlo, los mismos casos deben dar los mismos resultados.
3. **Plan derivado, no duplicado.** El árbol, los conflictos y el plan final salen de funciones puras sobre el mismo borrador (`utils/plan.ts`). La vista previa y la ejecución no pueden desincronizarse.
4. **Seguridad en el contrato.** Los estados `pending · in_progress · completed · partial · failed · rolled_back` y los registros por archivo (`moved · skipped · failed · restored · not_restored`) ya existen en los tipos, para que el motor real los rellene.
5. **HashRouter.** Funciona igual en el navegador y dentro del WebView de Tauri sin configurar el servidor.
6. **Sin dependencias remotas.** La fuente Inter va empaquetada (`@fontsource-variable/inter`); la app no necesita conexión.

### Sistema visual

- Paleta del blueprint como variables CSS en `src/index.css`, con modo claro y oscuro.
- `text-muted` (`#5F6679`) es más oscuro que el *Secondary* del blueprint (`#8991A3`) para cumplir contraste AA en texto pequeño; `#8991A3` se usa para iconos y metadatos.
- Tipografía Inter, iconos Lucide, radios moderados, sombras suaves.
- Movimiento basado en las reglas de la skill MotionSites y adaptado a una app: 150–300 ms, desplazamientos de 4–8 px y curvas `cubic-bezier(0.22,1,0.36,1)` para entradas y `(0.4,0,0.2,1)` para cambios de estado. No hay animaciones decorativas en bucle.
- **Movimiento reducido:** respeta `prefers-reduced-motion` y se puede forzar en Configuración (`MotionConfig` + clases en `<html>`).
- Accesibilidad: foco visible, trampa de foco en diálogos, roles ARIA en árbol, radios, switches y barras de progreso, y botón “Saltar al contenido”.

---

## Pendiente y riesgos

- **Pendiente de probar a mano en la app de escritorio:** el motor tiene 16 pruebas automáticas que pasan, pero el flujo completo dentro de la ventana nativa (selector de Windows, análisis de una carpeta real, deshacer) aún no se ha recorrido. Conviene probarlo primero con una carpeta de prueba.
- **Reglas y preferencias** siguen guardándose en el almacenamiento del WebView; el historial y las carpetas gestionadas ya están en SQLite. Falta migrar reglas y configuración.
- **Duplicados y monitoreo de carpetas** no están en la versión de escritorio (la interfaz lo indica, sin datos de ejemplo).
- **Arrastrar carpetas desde el Explorador** a la ventana no está implementado. `dragDropEnabled` está en `false` para que funcione el arrastre interno del árbol.
- **Icono propio:** los iconos de `src-tauri/icons` son los de Tauri. Hay que generarlos con `npx tauri icon` a partir del logo.
- **Listas grandes:** la vista previa renderiza todos los archivos. Con miles de archivos hará falta virtualizar la lista (por ejemplo, `@tanstack/react-virtual`).
- **Internacionalización:** los textos están en español dentro de los componentes. Antes de añadir inglés hay que extraerlos a un catálogo.
- **Clasificación por contenido (niveles 4–5):** todavía no está implementada; hoy solo se usan extensión, nombre, fecha y reglas.
- El bundle pesa unos 550 KB (175 KB comprimido). Para una app de escritorio es aceptable, pero se puede dividir por pantallas más adelante.

## Siguiente fase recomendada

**Cerrar la Fase 2 y pasar a la Fase 5.** Probar a mano el flujo en la app con una carpeta de prueba, mover reglas y preferencias a SQLite, poner el icono propio y generar el primer instalador (`npm run tauri build`). Después, detección de duplicados real (tamaño → hash parcial → hash completo) y clasificación por contenido de PDF y documentos.
