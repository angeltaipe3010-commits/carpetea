//! Escaneo de una carpeta de origen.
//! Solo lee metadatos (nombre, tamaño, fecha): no abre ni modifica archivos.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use walkdir::WalkDir;

use crate::classifier::classify;
use crate::model::{FileEntry, Rule, ScanOptions, ScanProgress, ScanResult, SourceFolder};
use crate::safety::{is_system_path, norm};

/// Lo que el motor recuerda del último análisis, para validar la ejecución:
/// solo se pueden mover archivos que salieron de él y que no han cambiado.
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub path: PathBuf,
    pub size: u64,
    pub mtime: i64,
}

pub type SnapshotMap = HashMap<String, Snapshot>;

#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("Análisis cancelado.")]
    Cancelled,
}

#[cfg(windows)]
fn is_hidden(m: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    m.file_attributes() & (0x2 | 0x4) != 0 // HIDDEN | SYSTEM
}

#[cfg(not(windows))]
fn is_hidden(_m: &std::fs::Metadata) -> bool {
    false
}

fn excluded(p: &Path, exclusions: &[String]) -> bool {
    let n = norm(p);
    let name = p.file_name().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    exclusions.iter().any(|e| {
        let e = e.trim();
        if e.contains('\\') || e.contains('/') || e.contains(':') {
            let en = norm(Path::new(&expand_env(e)));
            n == en || n.starts_with(&format!("{en}\\")) || n.starts_with(&format!("{en}/"))
        } else {
            name == e.to_lowercase()
        }
    })
}

fn expand_env(s: &str) -> String {
    let mut out = s.to_string();
    for var in ["APPDATA", "LOCALAPPDATA", "USERPROFILE"] {
        if let Ok(v) = std::env::var(var) {
            out = out.replace(&format!("%{var}%"), &v);
        }
    }
    out
}

fn iso(t: std::time::SystemTime) -> String {
    chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub fn scan(
    source: &Path,
    opts: &ScanOptions,
    rules: &[Rule],
    skip_dirs: &[String],
    cancel: &AtomicBool,
    mut progress: impl FnMut(ScanProgress),
) -> Result<(ScanResult, SnapshotMap), ScanError> {
    let t0 = Instant::now();
    let source_name = source.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_else(|| source.display().to_string());
    let skip: Vec<PathBuf> = skip_dirs.iter().map(|d| source.join(d.replace('/', std::path::MAIN_SEPARATOR_STR))).collect();
    let mut skipped_managed = 0usize;

    // Fase 1: recorrer.
    let mut found: Vec<(PathBuf, std::fs::Metadata)> = Vec::new();
    let walker = WalkDir::new(source).min_depth(1).max_depth(if opts.recursive { usize::MAX } else { 1 }).into_iter();
    let mut it = walker.filter_entry(|e| {
        let p = e.path();
        if e.file_type().is_dir() {
            if is_system_path(p) || excluded(p, &opts.exclusions) {
                return false;
            }
            if opts.skip_hidden {
                if let Ok(m) = e.metadata() {
                    if is_hidden(&m) {
                        return false;
                    }
                }
            }
        }
        true
    });
    let mut last = Instant::now();
    while let Some(entry) = it.next() {
        if cancel.load(Ordering::Relaxed) {
            return Err(ScanError::Cancelled);
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // sin permiso de lectura: se omite
        };
        if entry.file_type().is_dir() {
            if skip.iter().any(|s| norm(s) == norm(entry.path())) {
                skipped_managed += WalkDir::new(entry.path()).into_iter().filter_map(Result::ok).filter(|e| e.file_type().is_file()).count();
                it.skip_current_dir();
            }
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if opts.skip_hidden && is_hidden(&meta) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        // Temporales de descargas en curso: no se tocan.
        let lower = name.to_lowercase();
        if lower.ends_with(".crdownload") || lower.ends_with(".part") || lower.ends_with(".partial") || lower.ends_with(".tmp") && lower.starts_with('~') {
            continue;
        }
        found.push((entry.path().to_path_buf(), meta));
        if last.elapsed().as_millis() > 60 {
            progress(ScanProgress { phase: "walking", processed: found.len(), total: found.len(), current: entry.path().display().to_string() });
            last = Instant::now();
        }
    }
    let total = found.len();
    progress(ScanProgress { phase: "walking", processed: total, total, current: String::new() });

    // Fase 2: metadatos.
    let mut files = Vec::with_capacity(total);
    let mut snapshot = SnapshotMap::new();
    for (i, (path, meta)) in found.into_iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(ScanError::Cancelled);
        }
        let name = path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let ext = match name.rfind('.') {
            Some(i) if i > 0 => name[i + 1..].to_lowercase(),
            _ => String::new(),
        };
        let rel_dir = path
            .parent()
            .and_then(|p| p.strip_prefix(source).ok())
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_default();
        let modified = meta.modified().map(iso).unwrap_or_default();
        let mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        let id = format!("f{i}");
        snapshot.insert(id.clone(), Snapshot { path: path.clone(), size: meta.len(), mtime });
        files.push(FileEntry { id, name, ext, size: meta.len(), modified, rel_dir, locked: None });
        if i % 200 == 0 {
            progress(ScanProgress { phase: "metadata", processed: i + 1, total, current: files[i].name.clone() });
        }
    }

    // Fases 3 y 4: reglas y clasificación.
    progress(ScanProgress { phase: "rules", processed: total, total, current: format!("{} reglas activas", rules.iter().filter(|r| r.enabled).count()) });
    let mut classifications = Vec::with_capacity(total);
    for (i, f) in files.iter().enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err(ScanError::Cancelled);
        }
        classifications.push(classify(f, rules, opts));
        if i % 200 == 0 {
            progress(ScanProgress { phase: "classifying", processed: i + 1, total, current: f.name.clone() });
        }
    }
    progress(ScanProgress { phase: "done", processed: total, total, current: String::new() });

    let size = files.iter().map(|f| f.size).sum();
    let result = ScanResult {
        source: SourceFolder { id: source.display().to_string(), name: source_name, path: source.display().to_string(), file_count: total as i64, size },
        files,
        classifications,
        existing: Vec::new(),
        skipped_managed,
        duration_ms: t0.elapsed().as_secs_f64() * 1000.0,
    };
    Ok((result, snapshot))
}

const PROJECT_MARKERS: &[&str] = &["package.json", ".git", "cargo.toml", "pom.xml", "build.gradle", "pyproject.toml", "go.mod", "composer.json", ".sln", ".csproj"];
const SKIP_DIRS: &[&str] = &["node_modules", ".git", "target", "dist", "build", "bin", "obj", ".venv", "venv", "__pycache__", ".idea", ".vscode", ".next", ".claude"];

/// Lee la estructura de carpetas existente bajo `root` (solo nombres, sin abrir archivos).
/// Las carpetas de proyectos de código se marcan y no se recorren por dentro.
pub fn index_tree(root: &Path, max_depth: usize, skip: &[PathBuf]) -> Vec<crate::model::IndexedFolder> {
    let mut out = Vec::new();
    let mut it = WalkDir::new(root).min_depth(1).max_depth(max_depth).into_iter();
    while let Some(entry) = it.next() {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_dir() {
            continue;
        }
        let p = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();
        let hidden = entry.metadata().map(|m| is_hidden(&m)).unwrap_or(false);
        if hidden || name.starts_with('.') || SKIP_DIRS.contains(&name.as_str()) || is_system_path(p) || skip.iter().any(|s| norm(s) == norm(p)) {
            it.skip_current_dir();
            continue;
        }
        let mut files = Vec::new();
        let mut file_count = 0;
        let mut project = false;
        if let Ok(rd) = std::fs::read_dir(p) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                let lower = n.to_lowercase();
                if PROJECT_MARKERS.iter().any(|m| lower == *m || (m.starts_with('.') && lower.ends_with(m))) {
                    project = true;
                }
                if e.file_type().map(|t| t.is_file()).unwrap_or(false) {
                    file_count += 1;
                    if files.len() < 30 {
                        files.push(n);
                    }
                }
            }
        }
        let rel = p.strip_prefix(root).map(|r| r.to_string_lossy().replace('\\', "/")).unwrap_or_default();
        out.push(crate::model::IndexedFolder { rel, files, file_count, project });
        if project {
            it.skip_current_dir();
        }
    }
    out
}

/// Recuento rápido (sin entrar en subcarpetas) para las carpetas sugeridas.
pub fn quick_stats(dir: &Path) -> (i64, u64) {
    let Ok(rd) = std::fs::read_dir(dir) else { return (-1, 0) };
    let mut n = 0;
    let mut size = 0;
    for e in rd.flatten() {
        if let Ok(m) = e.metadata() {
            if m.is_file() && !is_hidden(&m) {
                n += 1;
                size += m.len();
            }
        }
    }
    (n, size)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn opts() -> ScanOptions {
        ScanOptions { max_depth: 4, recursive: true, apply_rules: false, year_subfolders: true, review_folder_name: "Por revisar".into(), skip_hidden: true, exclusions: vec!["node_modules".into()] }
    }

    #[test]
    fn scans_skips_managed_and_excluded() {
        let t = crate::test_dir();
        let root = t.path();
        for p in ["Factura_Luz_2026.pdf", "IMG_20250101_101010.jpg", "sub/notas.txt", "Imágenes/Capturas/ya.png", "node_modules/x.js", "video.mp4.crdownload"] {
            let full = root.join(p);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, "x").unwrap();
        }
        let cancel = AtomicBool::new(false);
        let (res, snap) = scan(root, &opts(), &[], &["Imágenes/Capturas".into()], &cancel, |_| {}).unwrap();
        let mut names: Vec<_> = res.files.iter().map(|f| f.name.as_str()).collect();
        names.sort();
        assert_eq!(names, vec!["Factura_Luz_2026.pdf", "IMG_20250101_101010.jpg", "notas.txt"]);
        assert_eq!(res.skipped_managed, 1);
        assert_eq!(snap.len(), 3);
        let notas = res.files.iter().find(|f| f.name == "notas.txt").unwrap();
        assert_eq!(notas.rel_dir, "sub");
    }

    #[test]
    fn indexes_structure_and_stops_at_projects() {
        let t = crate::test_dir();
        let root = t.path();
        for p in [
            "Estudios/Cibertec - Programacion Orientada a Objetos/T1_POO.docx",
            "Estudios/Cibertec - Programacion Orientada a Objetos/T2_POO.docx",
            "Proyectos/mi-app/package.json",
            "Proyectos/mi-app/src/main.ts",
            "Proyectos/mi-app/node_modules/x/index.js",
            "Descargas/a.pdf",
        ] {
            let full = root.join(p);
            fs::create_dir_all(full.parent().unwrap()).unwrap();
            fs::write(full, "x").unwrap();
        }
        let idx = index_tree(root, 4, &[root.join("Descargas")]);
        let rels: Vec<_> = idx.iter().map(|f| f.rel.as_str()).collect();
        assert!(rels.contains(&"Estudios/Cibertec - Programacion Orientada a Objetos"));
        assert!(!rels.iter().any(|r| r.starts_with("Proyectos/mi-app/")), "no entra en proyectos");
        assert!(!rels.contains(&"Descargas"), "omite el origen");
        let poo = idx.iter().find(|f| f.rel.ends_with("Objetos")).unwrap();
        assert_eq!(poo.file_count, 2);
        assert!(idx.iter().find(|f| f.rel == "Proyectos/mi-app").unwrap().project);
    }

    #[test]
    fn can_be_cancelled() {
        let t = crate::test_dir();
        fs::write(t.path().join("a.txt"), "x").unwrap();
        let cancel = AtomicBool::new(true);
        assert!(matches!(scan(t.path(), &opts(), &[], &[], &cancel, |_| {}), Err(ScanError::Cancelled)));
    }
}
