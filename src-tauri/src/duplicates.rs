//! Búsqueda de duplicados por contenido.
//!
//! Tres pasadas, de la más barata a la más cara, y cada una solo sobre los
//! candidatos que quedan de la anterior:
//! 1. agrupar por tamaño (sin abrir archivos),
//! 2. hash de los primeros 64 KiB,
//! 3. hash del contenido completo (BLAKE3).
//!
//! Nunca se borra nada: las copias se apartan con un movimiento normal del
//! organizador, que queda en el historial y se puede deshacer.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use walkdir::WalkDir;

use crate::fsops::fingerprint;
use crate::model::{DuplicateFile, DuplicateGroup, DuplicateProgress, DuplicateSearch, OrganizePlan, PlannedMove};
use crate::safety::{is_cloud_only, is_system_path, norm};
use crate::scanner::{excluded, is_hidden_entry, is_project_dir, Snapshot, SnapshotMap, SKIP_DIRS};

const PARTIAL: usize = 64 * 1024;

struct Candidate {
    path: PathBuf,
    size: u64,
    mtime: i64,
}

fn hash_file(p: &Path, limit: Option<usize>, cancel: &AtomicBool) -> io::Result<blake3::Hash> {
    let mut f = File::open(p)?;
    let mut h = blake3::Hasher::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut left = limit.unwrap_or(usize::MAX);
    while left > 0 {
        if cancel.load(Ordering::Relaxed) {
            return Err(io::Error::new(io::ErrorKind::Interrupted, "cancelado"));
        }
        let chunk = buf.len().min(left);
        let n = f.read(&mut buf[..chunk])?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
        left -= n;
    }
    Ok(h.finalize())
}

/// Agrupa candidatos por una clave y descarta los grupos de un solo archivo.
/// Los archivos que no se pueden leer (clave `None`) se cuentan en `unreadable`.
fn regroup<K: std::hash::Hash + Eq>(
    groups: Vec<Vec<Candidate>>,
    unreadable: &mut usize,
    mut key: impl FnMut(&Candidate) -> Option<K>,
) -> Vec<(K, Vec<Candidate>)> {
    let mut out = Vec::new();
    for g in groups {
        let mut by: HashMap<K, Vec<Candidate>> = HashMap::new();
        for c in g {
            match key(&c) {
                Some(k) => by.entry(k).or_default().push(c),
                None => *unreadable += 1,
            }
        }
        out.extend(by.into_iter().filter(|(_, v)| v.len() > 1));
    }
    out
}

/// Qué archivos se pueden apartar después de la búsqueda, y de qué grupo es cada uno.
#[derive(Default, Clone)]
pub struct Found {
    pub snapshot: SnapshotMap,
    pub group_of: HashMap<String, String>,
}

pub fn find(
    root: &Path,
    skip: &[PathBuf],
    exclusions: &[String],
    cancel: &AtomicBool,
    mut progress: impl FnMut(DuplicateProgress),
) -> Result<(DuplicateSearch, Found), String> {
    let cancelled = || -> Result<(), String> {
        if cancel.load(Ordering::Relaxed) {
            Err("Búsqueda cancelada.".into())
        } else {
            Ok(())
        }
    };
    let mut search = DuplicateSearch::default();

    // 1. Tamaños (solo metadatos; los archivos que solo están en la nube no se abren nunca).
    let mut by_size: HashMap<u64, Vec<Candidate>> = HashMap::new();
    let mut seen = 0usize;
    let mut it = WalkDir::new(root).min_depth(1).into_iter();
    while let Some(entry) = it.next() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => {
                search.skipped_denied += 1;
                continue;
            }
        };
        let p = entry.path();
        let name = entry.file_name().to_string_lossy();
        if entry.file_type().is_dir() {
            if name.starts_with('.')
                || SKIP_DIRS.contains(&name.as_ref())
                || is_system_path(p)
                || is_hidden_entry(&entry)
                || excluded(p, exclusions)
                || skip.iter().any(|s| norm(s) == norm(p))
                || is_project_dir(p)
            {
                // Proyectos y programas portables: sus archivos idénticos son necesarios.
                it.skip_current_dir();
            }
            continue;
        }
        if !entry.file_type().is_file() || is_hidden_entry(&entry) || excluded(p, exclusions) {
            continue;
        }
        let Ok(meta) = entry.metadata() else {
            search.skipped_unreadable += 1;
            continue;
        };
        if is_cloud_only(&meta) {
            search.skipped_cloud += 1;
            continue;
        }
        let Some((size, mtime)) = fingerprint(p) else {
            search.skipped_unreadable += 1;
            continue;
        };
        if size == 0 {
            continue; // los vacíos son "iguales" pero no ocupan espacio
        }
        by_size.entry(size).or_default().push(Candidate { path: p.to_path_buf(), size, mtime });
        seen += 1;
        if seen % 200 == 0 {
            cancelled()?;
            progress(DuplicateProgress { phase: "sizes", processed: seen, total: 0 });
        }
    }
    search.scanned = seen;
    let groups: Vec<Vec<Candidate>> = by_size.into_values().filter(|v| v.len() > 1).collect();
    let total: usize = groups.iter().map(Vec::len).sum();
    progress(DuplicateProgress { phase: "sizes", processed: seen, total: seen });

    // 2. Inicio del archivo.
    let mut done = 0usize;
    let mut unreadable = 0usize;
    let partial = regroup(groups, &mut unreadable, |c| {
        done += 1;
        if done % 50 == 0 {
            progress(DuplicateProgress { phase: "partial-hash", processed: done, total });
        }
        hash_file(&c.path, Some(PARTIAL), cancel).ok()
    });
    cancelled()?;

    // 3. Contenido completo. Si el archivo cabe en el primer bloque, ya está comparado entero.
    let total: usize = partial.iter().map(|(_, g)| g.len()).sum();
    let mut done = 0usize;
    let mut full: Vec<(blake3::Hash, Vec<Candidate>)> = Vec::new();
    for (key, group) in partial {
        if group[0].size as usize <= PARTIAL {
            done += group.len();
            progress(DuplicateProgress { phase: "full-hash", processed: done, total });
            full.push((key, group));
            continue;
        }
        full.extend(regroup(vec![group], &mut unreadable, |c| {
            done += 1;
            progress(DuplicateProgress { phase: "full-hash", processed: done, total });
            hash_file(&c.path, None, cancel).ok()
        }));
        cancelled()?;
    }
    cancelled()?;
    // Un fallo de lectura por cancelación no es un archivo ilegible.
    search.skipped_unreadable += unreadable;

    let mut found = Found::default();
    search.groups = full
        .into_iter()
        .enumerate()
        .map(|(i, (hash, g))| {
            let size = g[0].size;
            let gid = format!("g{i}");
            let mut files: Vec<DuplicateFile> = g
                .into_iter()
                .map(|c| {
                    let id = c.path.display().to_string();
                    let modified = chrono::DateTime::from_timestamp_millis(c.mtime)
                        .map(|d| d.with_timezone(&chrono::Local).to_rfc3339())
                        .unwrap_or_default();
                    let f = DuplicateFile {
                        id: id.clone(),
                        name: c.path.file_name().map(|s| s.to_string_lossy().to_string()).unwrap_or_default(),
                        path: c.path.parent().map(|p| p.display().to_string()).unwrap_or_default(),
                        size: c.size,
                        modified,
                    };
                    found.group_of.insert(id.clone(), gid.clone());
                    found.snapshot.insert(id, Snapshot { path: c.path, size: c.size, mtime: c.mtime });
                    f
                })
                .collect();
            files.sort_by(|a, b| a.modified.cmp(&b.modified));
            DuplicateGroup { id: gid, hash: hash.to_hex().to_string(), size, files }
        })
        .collect();
    // Primero los que más espacio liberan.
    search.groups.sort_by_key(|g| std::cmp::Reverse(g.size * (g.files.len() as u64 - 1)));
    progress(DuplicateProgress { phase: "done", processed: total, total });
    Ok((search, found))
}

/// Plan para apartar copias en `dest` (sin pisar nada: nombres repetidos se numeran).
pub fn quarantine_plan(file_ids: &[String], found: &Found, root: &Path, dest: &Path) -> Result<OrganizePlan, String> {
    let snapshot = &found.snapshot;
    // Nunca se apartan todas las copias de un grupo: siempre queda una en su sitio.
    let mut size_of: HashMap<&str, usize> = HashMap::new();
    for g in found.group_of.values() {
        *size_of.entry(g.as_str()).or_default() += 1;
    }
    let mut picked: HashMap<&str, usize> = HashMap::new();
    for id in file_ids {
        if let Some(g) = found.group_of.get(id) {
            *picked.entry(g.as_str()).or_default() += 1;
        }
    }
    if picked.iter().any(|(g, n)| *n >= size_of.get(g).copied().unwrap_or(0)) {
        return Err("Hay que conservar al menos una copia de cada grupo.".into());
    }
    let mut used: HashSet<String> = HashSet::new();
    let mut moves = Vec::new();
    for id in file_ids {
        let snap = snapshot.get(id).ok_or("Un archivo no forma parte de la última búsqueda; vuelve a buscar.")?;
        let name = snap.path.file_name().map(|s| s.to_string_lossy().to_string()).ok_or("Nombre no válido.")?;
        let (base, ext) = match name.rfind('.') {
            Some(i) if i > 0 => (name[..i].to_string(), name[i..].to_string()),
            _ => (name.clone(), String::new()),
        };
        let mut candidate = name.clone();
        let mut n = 1;
        while used.contains(&candidate.to_lowercase()) || dest.join(&candidate).exists() {
            candidate = format!("{base} ({n}){ext}");
            n += 1;
        }
        used.insert(candidate.to_lowercase());
        moves.push(PlannedMove {
            file_id: id.clone(),
            name: name.clone(),
            from: snap.path.display().to_string(),
            to: dest.join(&candidate).display().to_string(),
            final_name: candidate,
        });
    }
    Ok(OrganizePlan {
        source_id: "duplicates".into(),
        source_path: root.display().to_string(),
        destination_label: dest.display().to_string(),
        moves,
        skipped: vec![],
        folders_to_create: vec![],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_identical_content_with_different_names() {
        let t = crate::test_dir();
        let r = t.path();
        std::fs::create_dir_all(r.join("a")).unwrap();
        std::fs::write(r.join("foto.jpg"), b"mismo contenido").unwrap();
        std::fs::write(r.join("a").join("copia de foto.jpg"), b"mismo contenido").unwrap();
        std::fs::write(r.join("otra.jpg"), b"mismo tamanio!!").unwrap(); // mismo tamaño, otro contenido
        std::fs::write(r.join("vacio.txt"), b"").unwrap();
        std::fs::write(r.join("vacio2.txt"), b"").unwrap();
        let cancel = AtomicBool::new(false);
        std::fs::write(r.join("a").join("foto (2).jpg"), b"mismo contenido").unwrap();
        let (search, found) = find(r, &[], &[], &cancel, |_| {}).unwrap();
        let groups = &search.groups;
        assert_eq!(groups.len(), 1);
        let names: Vec<_> = groups[0].files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"foto.jpg") && names.contains(&"copia de foto.jpg"));
        assert_eq!(found.snapshot.len(), 3);

        let dest = r.join("Por revisar").join("Duplicados");
        let ids: Vec<String> = groups[0].files.iter().map(|f| f.id.clone()).collect();
        assert!(quarantine_plan(&ids, &found, r, &dest).is_err(), "nunca todas las copias");
        let plan = quarantine_plan(&ids[1..], &found, r, &dest).unwrap();
        let finals: HashSet<_> = plan.moves.iter().map(|m| m.final_name.to_lowercase()).collect();
        assert_eq!(finals.len(), 2, "nombres únicos en la cuarentena");
    }

    #[test]
    fn skips_the_quarantine_folder() {
        let t = crate::test_dir();
        let r = t.path();
        let q = r.join("Por revisar").join("Duplicados");
        std::fs::create_dir_all(&q).unwrap();
        std::fs::write(r.join("a.txt"), b"igual").unwrap();
        std::fs::write(q.join("a.txt"), b"igual").unwrap();
        let cancel = AtomicBool::new(false);
        let (search, _) = find(r, &[q], &[], &cancel, |_| {}).unwrap();
        assert!(search.groups.is_empty());
    }

    #[test]
    fn skips_projects_and_exclusions_and_honours_cancel() {
        let t = crate::test_dir();
        let r = t.path();
        let app = r.join("MiApp");
        std::fs::create_dir_all(&app).unwrap();
        std::fs::write(app.join("package.json"), b"{}").unwrap();
        std::fs::write(app.join("index.js"), b"codigo").unwrap();
        std::fs::write(r.join("index.js"), b"codigo").unwrap();
        std::fs::create_dir_all(r.join("Privado")).unwrap();
        std::fs::write(r.join("Privado").join("b.txt"), b"igual").unwrap();
        std::fs::write(r.join("b.txt"), b"igual").unwrap();
        let cancel = AtomicBool::new(false);
        let (search, _) = find(r, &[], &["Privado".into()], &cancel, |_| {}).unwrap();
        assert!(search.groups.is_empty(), "ni proyectos ni carpetas excluidas");

        cancel.store(true, Ordering::Relaxed);
        std::fs::write(r.join("c.txt"), b"igual").unwrap();
        assert!(find(r, &[], &[], &cancel, |_| {}).is_err(), "cancelar devuelve error, no resultados");
    }
}
