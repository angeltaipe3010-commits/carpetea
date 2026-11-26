//! Registro de errores en un archivo local (`deskflow.log` en la carpeta de
//! registros de la app). Sirve para diagnosticar problemas de usuarios sin
//! enviar nada a ningún servidor. Incluye los pánicos del motor.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static LOG: OnceLock<Mutex<PathBuf>> = OnceLock::new();
/// Al superar este tamaño, el registro actual pasa a `deskflow.old.log`.
const MAX_BYTES: u64 = 1024 * 1024;

pub fn init(dir: &Path) {
    let _ = fs::create_dir_all(dir);
    let path = dir.join("deskflow.log");
    if fs::metadata(&path).map(|m| m.len() > MAX_BYTES).unwrap_or(false) {
        let _ = fs::rename(&path, dir.join("deskflow.old.log"));
    }
    let _ = LOG.set(Mutex::new(path));
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        write("PANIC", &info.to_string());
        previous(info);
    }));
    write("INFO", &format!("DeskFlow {} iniciado", env!("CARGO_PKG_VERSION")));
}

pub fn dir() -> Option<PathBuf> {
    LOG.get().and_then(|m| m.lock().ok()).and_then(|p| p.parent().map(Path::to_path_buf))
}

pub fn write(level: &str, message: &str) {
    let Some(lock) = LOG.get() else { return };
    let Ok(path) = lock.lock() else { return };
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&*path) {
        let ts = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(f, "{ts} [{level}] {}", message.replace('\n', "\n    "));
    }
}

pub fn error(context: &str, message: &str) {
    write("ERROR", &format!("{context}: {message}"));
}
