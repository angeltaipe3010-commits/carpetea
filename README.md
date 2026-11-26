# DeskFlow

**Organiza menos. Encuentra más.**

DeskFlow es un organizador inteligente de archivos para escritorio (Windows primero). Analiza una carpeta, propone una estructura de carpetas y subcarpetas según su contenido real y no mueve nada hasta que el usuario lo confirma. Todo funciona en local.

> **Estado: Fase 1 — prototipo navegable.** La interfaz está completa y funciona con **datos simulados**. Ningún archivo real se lee ni se mueve. La integración con Tauri 2 y Rust empieza en la Fase 2.

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

- **Rust no está instalado en este equipo.** Es necesario para la Fase 2 (`rustup`, y Visual Studio Build Tools con C++ en Windows).
- **Arrastrar y soltar con Tauri en Windows:** con `dragDropEnabled: true` (valor por defecto), Tauri intercepta los eventos y el arrastre HTML5 interno deja de funcionar. Habrá que poner `dragDropEnabled: false` en la ventana y usar el evento de Tauri solo para soltar carpetas del sistema.
- **Listas grandes:** la vista previa renderiza todos los archivos. Con miles de archivos hará falta virtualizar la lista (por ejemplo, `@tanstack/react-virtual`).
- **Internacionalización:** los textos están en español dentro de los componentes. Antes de añadir inglés hay que extraerlos a un catálogo.
- **Clasificación por contenido (niveles 4–5):** todavía no está implementada; hoy solo se usan extensión, nombre, fecha y reglas.
- El bundle pesa unos 550 KB (175 KB comprimido). Para una app de escritorio es aceptable, pero se puede dividir por pantallas más adelante.

## Siguiente fase recomendada

**Fase 2: base de escritorio.** Instalar Rust y añadir Tauri 2 al proyecto (`src-tauri/`). Después conectar el selector nativo de carpetas, configurar SQLite con migraciones para historial, reglas y configuración, definir los comandos tipados `scan`, `execute` y `undo` con eventos de progreso, y limitar los permisos de acceso a archivos a las carpetas que autorice el usuario.
