//! Carpetea: motor nativo.
//!
//! La interfaz (React) nunca toca el sistema de archivos: todo pasa por estos
//! comandos, que validan rutas contra las carpetas autorizadas.

mod classifier;
mod db;
mod duplicates;
mod fsops;
mod logging;
mod model;
mod organizer;
mod safety;
mod scanner;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use model::*;
use safety::{cloud_provider, destination_problem, AllowedRoots};
use scanner::SnapshotMap;

struct AppState {
    db: Mutex<db::Db>,
    roots: AllowedRoots,
    snapshot: Mutex<SnapshotMap>,
    /// Archivos de la última búsqueda de duplicados (solo esos se pueden apartar).
    dup_found: Mutex<duplicates::Found>,
    /// Cancelación propia: no se mezcla con la del análisis.
    dup_cancel: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    /// Hay una organización o un deshacer en curso (evita ejecutarlos dos veces).
    busy: AtomicBool,
}

/// Marca el motor como ocupado mientras vive; se libera al salir, incluso con error.
struct BusyGuard<'a>(&'a AtomicBool);

impl<'a> BusyGuard<'a> {
    fn take(flag: &'a AtomicBool) -> Res<Self> {
        if flag.swap(true, Ordering::SeqCst) {
            return Err("Ya hay una operación en curso; espera a que termine.".into());
        }
        Ok(Self(flag))
    }
}

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

type Res<T> = Result<T, String>;

fn folder_name(p: &Path) -> String {
    p.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| p.display().to_string())
}

fn libraries() -> Libraries {
    let s = |p: Option<PathBuf>| p.map(|p| p.display().to_string()).unwrap_or_default();
    Libraries { documents: s(dirs::document_dir()), pictures: s(dirs::picture_dir()), videos: s(dirs::video_dir()), music: s(dirs::audio_dir()) }
}

#[tauri::command]
fn environment(state: State<AppState>) -> Environment {
    let libs = libraries();
    let mut cloud = HashMap::new();
    for (k, v) in [("documents", &libs.documents), ("pictures", &libs.pictures), ("videos", &libs.videos), ("music", &libs.music)] {
        if v.is_empty() {
            continue;
        }
        // Las bibliotecas son destinos sugeridos por la propia app.
        state.roots.allow(Path::new(v));
        if let Some(p) = cloud_provider(Path::new(v)) {
            cloud.insert(k.to_string(), p);
        }
    }
    let home = dirs::home_dir().map(|p| p.display().to_string()).unwrap_or_default();
    Environment { home, libraries: libs, library_cloud: cloud }
}

/// Solo en compilaciones de depuración: carpeta de pruebas E2E (ver `e2e/`).
/// La versión final ignora estas variables.
fn e2e_root() -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        std::env::var_os("CARPETEA_E2E_ROOT").map(PathBuf::from).filter(|p| p.is_dir())
    } else {
        None
    }
}

#[tauri::command]
fn list_suggested_folders(state: State<AppState>) -> Vec<SourceFolder> {
    // En modo de pruebas solo se ofrece la carpeta de pruebas.
    let list = match e2e_root() {
        Some(r) => vec![("e2e", "Pruebas E2E", Some(r.join("Origen")))],
        None => vec![("downloads", "Descargas", dirs::download_dir()), ("desktop", "Escritorio", dirs::desktop_dir())],
    };
    list.into_iter()
        .filter_map(|(id, name, p)| {
            let p = p?;
            state.roots.allow(&p);
            let (file_count, size) = scanner::quick_stats(&p);
            Some(SourceFolder { id: id.into(), name: name.into(), path: p.display().to_string(), file_count, size })
        })
        .collect()
}

/// Abre el selector nativo de carpetas. La carpeta elegida queda autorizada.
#[tauri::command]
async fn pick_folder(app: AppHandle, state: State<'_, AppState>, title: String, start: Option<String>) -> Res<Option<PickedFolder>> {
    let mut dialog = app.dialog().file().set_title(title);
    if let Some(s) = start.filter(|s| Path::new(s).is_dir()) {
        dialog = dialog.set_directory(s);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder()).await.map_err(|e| e.to_string())?;
    let Some(fp) = picked else { return Ok(None) };
    let path = fp.into_path().map_err(|e| e.to_string())?;
    let problem = destination_problem(&path);
    if problem.is_none() {
        state.roots.allow(&path);
        let _ = state.db.lock().unwrap().remember_allowed(&path.display().to_string());
    }
    Ok(Some(PickedFolder { name: folder_name(&path), path: path.display().to_string(), cloud: cloud_provider(&path), problem }))
}

/// Qué carpetas de destino existen y qué archivos contienen (para conflictos).
#[tauri::command]
fn probe_dirs(state: State<AppState>, paths: Vec<String>) -> Vec<DirProbe> {
    paths
        .into_iter()
        .map(|p| {
            let path = PathBuf::from(&p);
            if state.roots.check(&path).is_err() || !path.is_dir() {
                return DirProbe { path: p, exists: path.is_dir(), files: vec![] };
            }
            let files = std::fs::read_dir(&path)
                .map(|rd| rd.flatten().filter(|e| e.path().is_file()).map(|e| e.file_name().to_string_lossy().to_string()).collect())
                .unwrap_or_default();
            DirProbe { path: p, exists: true, files }
        })
        .collect()
}

/// Busca una carpeta Documentos que no esté en la nube; si no hay, la crea.
#[tauri::command]
fn local_documents(state: State<AppState>) -> Res<LocalDocuments> {
    // En modo de pruebas, la "carpeta de usuario" es la carpeta de pruebas.
    let e2e = e2e_root();
    let home = e2e.clone().or_else(dirs::home_dir).ok_or("No se encontró la carpeta de usuario.")?;
    let mut candidates: Vec<PathBuf> = if e2e.is_some() { vec![] } else { dirs::document_dir().into_iter().collect() };
    candidates.extend([home.join("Documents"), home.join("Documentos")]);
    if let Some(found) = candidates.iter().find(|p| p.is_dir() && cloud_provider(p).is_none()) {
        state.roots.allow(found);
        return Ok(LocalDocuments { path: found.display().to_string(), created: false });
    }
    let target = home.join("Documentos");
    if cloud_provider(&target).is_some() {
        return Err("No se encontró una ubicación local para Documentos.".into());
    }
    std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
    state.roots.allow(&target);
    let _ = state.db.lock().unwrap().remember_allowed(&target.display().to_string());
    Ok(LocalDocuments { path: target.display().to_string(), created: true })
}

#[tauri::command]
async fn scan(
    state: State<'_, AppState>,
    source_path: String,
    opts: ScanOptions,
    rules: Vec<Rule>,
    skip_dirs: Vec<String>,
    on_progress: Channel<ScanProgress>,
) -> Res<ScanResult> {
    let source = PathBuf::from(&source_path);
    state.roots.check(&source)?;
    if !source.is_dir() {
        return Err("La carpeta ya no existe.".into());
    }
    state.cancel.store(false, Ordering::Relaxed);
    let cancel = state.cancel.clone();
    let (result, snap) = tauri::async_runtime::spawn_blocking(move || {
        scanner::scan(&source, &opts, &rules, &skip_dirs, &cancel, |p| {
            let _ = on_progress.send(p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    *state.snapshot.lock().unwrap() = snap;
    Ok(result)
}

/// Estructura de carpetas existente en un destino (solo lectura).
/// `skip`: rutas absolutas a omitir (p. ej. el origen si está dentro del destino).
#[tauri::command]
async fn index_structure(state: State<'_, AppState>, root: String, max_depth: usize, skip: Vec<String>) -> Res<Vec<IndexedFolder>> {
    let root = PathBuf::from(root);
    if let Err(e) = state.roots.check(&root) {
        eprintln!("[carpetea] index_structure rechazado: {e}");
        return Err(e);
    }
    if !root.is_dir() {
        return Ok(vec![]);
    }
    let skip: Vec<PathBuf> = skip.into_iter().map(PathBuf::from).collect();
    tauri::async_runtime::spawn_blocking(move || scanner::index_tree(&root, max_depth.clamp(1, 6), &skip)).await.map_err(|e| e.to_string())
}

/// Qué rutas puede usar el motor ahora mismo (sin cambiar nada).
#[tauri::command]
fn check_access(state: State<AppState>, paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| state.roots.check(Path::new(p)).is_ok()).collect()
}

#[tauri::command]
fn cancel(state: State<AppState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

#[tauri::command]
async fn execute(state: State<'_, AppState>, plan: OrganizePlan, on_progress: Channel<ExecProgress>) -> Res<Operation> {
    let _busy = BusyGuard::take(&state.busy)?;
    let snapshot = state.snapshot.lock().unwrap().clone();
    let db = state.db.lock().unwrap();
    let op = organizer::execute(&db, &plan, &snapshot, &state.roots, |p| {
        let _ = on_progress.send(p);
    });
    logged("organizar", op)
}

#[tauri::command]
async fn undo(state: State<'_, AppState>, op_id: String, on_progress: Channel<ExecProgress>) -> Res<Operation> {
    let _busy = BusyGuard::take(&state.busy)?;
    let db = state.db.lock().unwrap();
    let op = organizer::undo(&db, &op_id, |p| {
        let _ = on_progress.send(p);
    });
    logged("deshacer", op)
}

/// Anota en el registro los errores y los avisos de una operación.
fn logged(context: &str, r: Res<Operation>) -> Res<Operation> {
    match &r {
        Ok(op) if !op.errors.is_empty() => logging::write("WARN", &format!("{context} {}: {}", op.id, op.errors.join(" | "))),
        Err(e) => logging::error(context, e),
        _ => {}
    }
    r
}

/// Errores de la interfaz, para el mismo registro.
#[tauri::command]
fn log_event(level: String, message: String) {
    let level = match level.as_str() {
        "error" => "UI-ERROR",
        "warn" => "UI-WARN",
        _ => "UI-INFO",
    };
    logging::write(level, &message.chars().take(8000).collect::<String>());
}

/// Abre la licencia o los avisos de terceros (instalados junto al programa).
#[tauri::command]
fn open_document(app: AppHandle, name: String) -> Res<()> {
    if !["LICENSE.txt", "THIRD_PARTY_NOTICES.txt"].contains(&name.as_str()) {
        return Err("Documento no disponible.".into());
    }
    let path = app.path().resource_dir().map_err(|e| e.to_string())?.join(&name);
    if !path.is_file() {
        return Err(format!("No se encontró {name}."));
    }
    std::process::Command::new("explorer").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Abre la carpeta de registros en el Explorador (para enviarlos al pedir ayuda).
#[tauri::command]
fn open_log_dir() -> Res<()> {
    let dir = logging::dir().ok_or("No hay carpeta de registros.")?;
    std::process::Command::new("explorer").arg(&dir).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Busca archivos con el mismo contenido dentro de `root` (solo lectura).
/// Los archivos que solo están en la nube no se abren (se descargarían).
#[tauri::command]
async fn find_duplicates(
    state: State<'_, AppState>,
    root: String,
    skip: Vec<String>,
    exclusions: Vec<String>,
    on_progress: Channel<DuplicateProgress>,
) -> Res<DuplicateSearch> {
    let root = PathBuf::from(root);
    state.roots.check(&root)?;
    if !root.is_dir() {
        return Err("La carpeta ya no existe.".into());
    }
    state.dup_cancel.store(false, Ordering::Relaxed);
    let cancel = state.dup_cancel.clone();
    let skip: Vec<PathBuf> = skip.into_iter().map(PathBuf::from).collect();
    let cloud = cloud_provider(&root);
    let (mut search, found) = tauri::async_runtime::spawn_blocking(move || {
        duplicates::find(&root, &skip, &exclusions, &cancel, |p| {
            let _ = on_progress.send(p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
    .inspect_err(|e| {
        if !e.contains("cancelad") {
            logging::error("buscar duplicados", e)
        }
    })?;
    search.cloud = cloud;
    *state.dup_found.lock().unwrap() = found;
    Ok(search)
}

#[tauri::command]
fn cancel_duplicates(state: State<AppState>) {
    state.dup_cancel.store(true, Ordering::Relaxed);
}

/// Aparta las copias elegidas en `<root>/<carpeta para revisar>/Duplicados`.
/// Es un movimiento normal: queda en el historial y se puede deshacer.
#[tauri::command]
async fn quarantine_duplicates(
    state: State<'_, AppState>,
    file_ids: Vec<String>,
    root: String,
    review_folder: String,
    on_progress: Channel<ExecProgress>,
) -> Res<Operation> {
    let _busy = BusyGuard::take(&state.busy)?;
    if safety::unsafe_segment(review_folder.trim()) {
        return Err("El nombre de la carpeta para revisar no es válido.".into());
    }
    let root = PathBuf::from(root);
    state.roots.check(&root)?;
    let dest = root.join(review_folder.trim()).join("Duplicados");
    let found = state.dup_found.lock().unwrap().clone();
    let plan = duplicates::quarantine_plan(&file_ids, &found, &root, &dest)?;
    let snapshot = found.snapshot;
    let db = state.db.lock().unwrap();
    let op = logged(
        "apartar duplicados",
        organizer::execute_kind("duplicates", &db, &plan, &snapshot, &state.roots, |p| {
            let _ = on_progress.send(p);
        }),
    )?;
    // Lo apartado ya no cuenta para la próxima búsqueda.
    let mut found = state.dup_found.lock().unwrap();
    for m in op.moves.iter().filter(|m| m.status == "moved") {
        found.snapshot.remove(&m.file_id);
        found.group_of.remove(&m.file_id);
    }
    Ok(op)
}

/// Claves de preferencias que la interfaz puede guardar (nada más).
const PREF_KEYS: &[&str] = &["carpetea:settings", "carpetea:rules"];

#[tauri::command]
fn pref_get(state: State<AppState>, key: String) -> Res<Option<String>> {
    if !PREF_KEYS.contains(&key.as_str()) {
        return Err("Clave no permitida.".into());
    }
    state.db.lock().unwrap().pref(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn pref_set(state: State<AppState>, key: String, value: String) -> Res<()> {
    if !PREF_KEYS.contains(&key.as_str()) || value.len() > 1_000_000 {
        return Err("Clave o valor no permitido.".into());
    }
    state.db.lock().unwrap().set_pref(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
fn history(state: State<AppState>) -> Res<HistorySnapshot> {
    state.db.lock().unwrap().snapshot(200).map_err(|e| e.to_string())
}

/// Carpeta temporal para pruebas fuera de AppData (que el motor protege).
#[cfg(test)]
pub(crate) fn test_dir() -> tempfile::TempDir {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("target").join("test-tmp");
    std::fs::create_dir_all(&base).unwrap();
    tempfile::Builder::new().prefix("t").tempdir_in(base).unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // En depuración, las pruebas E2E usan su propia base de datos.
            let dir = match std::env::var_os("CARPETEA_DATA_DIR").filter(|_| cfg!(debug_assertions)) {
                Some(d) => PathBuf::from(d),
                None => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            let log_dir = if cfg!(debug_assertions) && std::env::var_os("CARPETEA_DATA_DIR").is_some() {
                dir.join("logs")
            } else {
                app.path().app_log_dir()?
            };
            logging::init(&log_dir);
            let db_path = dir.join("carpetea.db");
            // Primera vez tras el cambio de nombre: copia los datos de DeskFlow 1.0.0.
            if std::env::var_os("CARPETEA_DATA_DIR").is_none() {
                match db::import_legacy(&db_path) {
                    Ok(true) => logging::write("INFO", "datos de DeskFlow 1.0.0 importados"),
                    Ok(false) => {}
                    Err(e) => logging::error("importar los datos de DeskFlow", &e.to_string()),
                }
            }
            let db = db::Db::open(&db_path).inspect_err(|e| logging::error("abrir la base de datos", &e.to_string()))?;
            // Modo de pruebas: el motor queda encerrado en la carpeta de pruebas.
            let roots = match e2e_root() {
                Some(root) => AllowedRoots::jailed(&root),
                None => AllowedRoots::default(),
            };
            for p in db.allowed().unwrap_or_default() {
                // Se vuelve a validar: una ruta protegida nunca se reautoriza.
                if destination_problem(Path::new(&p)).is_none() {
                    roots.allow(Path::new(&p));
                }
            }
            app.manage(AppState { db: Mutex::new(db), roots, snapshot: Mutex::new(SnapshotMap::new()), dup_found: Mutex::new(duplicates::Found::default()), dup_cancel: Arc::new(AtomicBool::new(false)), cancel: Arc::new(AtomicBool::new(false)), busy: AtomicBool::new(false) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            environment,
            list_suggested_folders,
            pick_folder,
            probe_dirs,
            local_documents,
            scan,
            index_structure,
            check_access,
            cancel,
            execute,
            undo,
            history,
            pref_get,
            pref_set,
            find_duplicates,
            cancel_duplicates,
            log_event,
            open_log_dir,
            open_document,
            quarantine_duplicates
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Carpetea");
}
