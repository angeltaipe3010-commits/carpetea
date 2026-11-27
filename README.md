# Carpetea

**Organiza menos. Encuentra más.**

Carpetea es un organizador inteligente de archivos para escritorio (Windows primero). Analiza una carpeta, propone una estructura de carpetas y subcarpetas según su contenido real y no mueve nada hasta que el usuario lo confirma. Todo funciona en local.

> **Antes se llamaba DeskFlow.** Desde la versión 1.0.1 se llama Carpetea, para no confundirse con otros programas llamados Deskflow. Al abrir Carpetea por primera vez, copia el historial, las carpetas autorizadas, las preferencias y las reglas de DeskFlow 1.0.0 (si existen) sin modificar los originales. Después se puede desinstalar DeskFlow desde *Configuración → Aplicaciones* de Windows.

> **Estado: versión 1.0.** App de escritorio para Windows (Tauri 2 + Rust) que analiza, organiza, aparta duplicados y deshace operaciones sobre **carpetas reales**, con instalador propio. En el navegador (`npm run dev`) sigue funcionando el prototipo con datos simulados. El monitoreo de carpetas llega en una versión posterior.

## App de escritorio

Requisitos en Windows: Node.js 20+, [Rust](https://rustup.rs) (toolchain MSVC), Visual Studio Build Tools con C++ y WebView2 (incluido en Windows 11).

```bash
npm install
npm run tauri dev      # abre la ventana de Carpetea con el motor real
npm run tauri build    # genera el instalador (NSIS) en src-tauri/target/release/bundle/nsis
cd src-tauri && cargo test   # pruebas del motor en carpetas temporales
npm run test:e2e       # QA de la app de escritorio real (Playwright)
```

### QA de la app de escritorio (`e2e/desktop`)

Playwright se conecta a la ventana real de Carpetea por CDP (WebView2 lo permite en Windows), así que las pruebas usan el motor de Rust y el disco de verdad:
- El fixture crea una carpeta aislada en `e2e/.sandbox/`, con un *Origen* de descargas falsas y un *Destino* con estructura propia.
- Arranca una **segunda instancia** de la compilación de depuración, con base de datos y perfil de WebView2 propios, y la borra al terminar (`CARPETEA_E2E_KEEP=1` para conservarla).
- Nunca toca tus carpetas ni tu historial: con `CARPETEA_E2E_ROOT` el motor queda **encerrado** en la carpeta de pruebas y rechaza cualquier otra ruta. Los ganchos `CARPETEA_E2E_ROOT` y `CARPETEA_DATA_DIR` solo existen en compilaciones de depuración.
- `regressions.spec.ts` fija los fallos que encontró el QA exploratorio (doble clic al confirmar, carpetas «..», foco de los diálogos, descartar cambios). Los specs exploratorios del agente tester viven en `e2e/.explore/` (fuera de git): `npx playwright test -c e2e/.explore/playwright.config.ts`.
- Requiere `src-tauri/target/debug/carpetea.exe` (lo genera `npm run tauri dev`).

Cubre, por orden de riesgo:
- No sobrescribir.
- Archivos en uso o modificados tras el análisis.
- Deshacer completo (también de duplicados apartados).
- Destinos sin permiso o en la nube.
- "Usar mi estructura" y cursos nuevos.
- Duplicados por contenido.
- Ajustes y reglas que sobreviven a un borrado de los datos del WebView.

### Motor (`src-tauri/src`)

| Módulo | Qué hace |
|---|---|
| `lib.rs` | Comandos Tauri: `environment`, `list_suggested_folders`, `pick_folder`, `probe_dirs`, `local_documents`, `scan`, `index_structure`, `check_access`, `cancel`, `execute`, `undo`, `history`, `find_duplicates`, `quarantine_duplicates`, `pref_get`, `pref_set` |
| `scanner.rs` | Recorre el origen leyendo solo metadatos. Omite ocultos, exclusiones, carpetas del sistema, descargas en curso y carpetas ya organizadas. Progreso por canal y cancelación |
| `classifier.rs` | Port fiel de `src/services/classifier.ts`, con pruebas sobre los mismos casos |
| `fsops.rs` | Mover sin sobrescribir nunca (`MoveFileExW` sin `REPLACE_EXISTING`). Entre unidades: copia a temporal, verifica tamaño, renombra y solo entonces borra el original |
| `organizer.rs` | Ejecuta el plan confirmado y deshace. Solo mueve archivos del último análisis que no hayan cambiado; deshacer verifica tamaño y fecha antes de devolver cada archivo y retira las carpetas creadas que quedan vacías |
| `duplicates.rs` | Duplicados por contenido en tres pasadas: tamaño, hash de los primeros 64 KiB y hash completo (BLAKE3). No abre archivos que solo están en la nube (los descargaría), respeta las exclusiones y no entra en proyectos de código ni programas portables. Informa de lo que no pudo comparar. Las copias se apartan en `<carpeta>/Por revisar/Duplicados` con el motor del organizador (siempre queda una copia por grupo): nada se borra y se puede deshacer |
| `logging.rs` | Registro local de errores y pánicos |
| `db.rs` | Diario en SQLite (`carpetea.db` en la carpeta de datos de la app). Cada movimiento se anota antes de hacerse; al arrancar repara operaciones interrumpidas. También guarda carpetas autorizadas, carpetas gestionadas y una copia de las preferencias y reglas |
| `safety.rs` | Detección de nube (raíces de OneDrive del sistema, nombres de clientes y atributos de archivos en la nube), rutas del sistema, carpetas autorizadas y nombres no válidos (`..`, `CON`, terminados en punto) |

**Permisos:** la interfaz no tiene acceso al disco (ningún plugin de sistema de archivos). Rust solo opera en carpetas elegidas en el selector nativo o sugeridas por la app (Descargas, Escritorio, bibliotecas), y rechaza las del sistema y `AppData`.

**Preferencias y reglas:** se leen de `localStorage` (sin parpadeo al abrir) y cada cambio se copia en SQLite. Si se borran los datos del WebView o se reinstala la app, al arrancar se recuperan de SQLite (`src/services/prefs.ts`).

**Instalador:** `npm run tauri build` genera `Carpetea_<versión>_x64-setup.exe` en `src-tauri/target/release/bundle/nsis` (en español, se instala para el usuario actual sin pedir permisos de administrador y muestra la licencia). Instala también `LICENSE.txt` y `THIRD_PARTY_NOTICES.txt` junto al programa. El icono sale de `src-tauri/app-icon.svg` (`npx tauri icon src-tauri/app-icon.svg`).

**Antes de publicar una versión:**
1. `npm run notices` para regenerar `THIRD_PARTY_NOTICES.txt` (licencias de npm y de las crates de Rust que van en el ejecutable).
2. `npm run tauri build`.
3. Publica junto al instalador su SHA-256 (`certutil -hashfile Carpetea_<versión>_x64-setup.exe SHA256`). El instalador no está firmado: Windows SmartScreen mostrará «Editor desconocido» la primera vez («Más información» → «Ejecutar de todas formas»), y la huella permite comprobar que el archivo es el original.

**Registro de errores:** el motor y la interfaz escriben en `%LOCALAPPDATA%\app.carpetea.desktop\logs\carpetea.log` (incluidos los pánicos; se rota al superar 1 MB). Nunca se envía: en *Configuración → Acerca de* hay un botón para abrir la carpeta y adjuntarlo al pedir ayuda.

## Página web (`website/`)

Página de presentación con el botón de descarga. Es estática (HTML, CSS y JS en un solo `index.html`, fuente Inter y capturas de la app con datos de ejemplo), sin dependencias externas ni rastreadores.

```bash
npm run tauri build   # genera el instalador
npm run site          # actualiza versión, tamaño, SHA-256 y enlace de la Release en la página
gh release create v<versión> src-tauri/target/release/bundle/nsis/Carpetea_<versión>_x64-setup.exe website/downloads/SHA256SUMS.txt
```

Los botones de descarga apuntan al instalador de la [Release de GitHub](https://github.com/angeltaipe3010-commits/carpetea/releases) y el `.exe` no se guarda en git (`website/downloads/*.exe`). La web se despliega en Vercel: `vercel.json` copia `website/` a `dist/` y la sirve tal cual (sin instalar dependencias), así que basta con importar el repositorio en Vercel y cada push a `main` la publica. Las capturas se regeneran con `node scripts/site-shots.mjs` (requiere `npm run dev` y Microsoft Edge).

**Descarga:** [última versión](https://github.com/angeltaipe3010-commits/carpetea/releases/latest).

## Licencia

Carpetea se distribuye con licencia [MIT](LICENSE): se ofrece tal cual, sin garantía. Las licencias del software de terceros que incluye están en `THIRD_PARTY_NOTICES.txt`.

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

Las preferencias, reglas e historial del prototipo se guardan en `localStorage`. Para empezar de cero, borra las claves `carpetea:*` en las herramientas del navegador.

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
  - **No:** Carpetea busca una carpeta Documentos que esté solo en el equipo y la usa. Si no existe, la crea (`C:\Users\…\Documentos`). Se puede cambiar después.
  - Cerrar el aviso sin elegir no cambia nada. Las carpetas del sistema siguen bloqueadas.
- **Escenario simulado:** el prototipo imita un Windows 11 con la copia de seguridad de OneDrive activada (Documentos e Imágenes en OneDrive, sin carpeta Documentos local), para que se pueda probar el flujo completo.
- **No reorganiza lo ya ordenado:** Carpetea recuerda las carpetas que creó y las omite al volver a analizar el origen. Si deshaces una operación, esas carpetas vuelven a analizarse.

**Usar mi estructura** (activado por defecto; se puede desactivar en Organizar o en Configuración). Antes de proponer, Carpetea lee la estructura del destino (solo nombres) y decide en este orden:
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
│   ├── api.ts        Interfaz CarpeteaApi + implementación mock
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

1. **Una sola interfaz de servicios (`CarpeteaApi`).** Las pantallas solo hablan con `api`. En la Fase 2 se añade `tauriApi` (comandos `invoke` + eventos de progreso) y se cambia una línea, sin tocar las pantallas.
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

- **Monitoreo de carpetas** (organizar Descargas al llegar archivos nuevos) no está implementado; la interfaz lo marca como «Próximamente».
- **Firma digital:** el instalador no está firmado. Firmarlo (Azure Trusted Signing o un certificado OV) quita el aviso de SmartScreen y reduce falsos positivos de antivirus.
- **Actualizaciones:** no hay comprobación automática de versiones nuevas (`tauri-plugin-updater`).
- **Migraciones de la base de datos:** el esquema aún no lleva versión (`PRAGMA user_version`); hará falta antes de cambiarlo en la 1.1.
- **Dependencias:** `rusqlite` usa `libsqlite3-sys` 0.30 (aviso RUSTSEC-2026-0459, solo explotable con una base de datos manipulada en el propio equipo); actualizar en la próxima versión.
- **Arrastrar carpetas desde el Explorador** a la ventana no está implementado. `dragDropEnabled` está en `false` para que funcione el arrastre interno del árbol.
- **Rutas de más de 260 caracteres** se rechazan con un aviso claro en lugar de usarse.
- **Selector nativo de Windows («Examinar»):** el QA automático no puede manejarlo; se prueba a mano.
- **Internacionalización:** los textos están en español dentro de los componentes. Antes de añadir inglés hay que extraerlos a un catálogo.
- **Clasificación por contenido (niveles 4–5):** todavía no está implementada; hoy se usan extensión, nombre, fecha, reglas y tu estructura de carpetas.

## Siguiente fase recomendada

Firma del instalador y actualizaciones automáticas; después, monitoreo de carpetas con reglas de confianza alta y clasificación por contenido de PDF y documentos.
