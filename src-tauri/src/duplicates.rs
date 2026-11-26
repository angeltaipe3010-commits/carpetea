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
use crate::model::{DuplicateFile, DuplicateGroup, DuplicateProgress, OrganizePlan, PlannedMove};
use crate::safety::{is_system_path, norm};
use crate::scanner::{is_hidden_entry, Snapshot, SnapshotMap, SKIP_DIRS};

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
fn regroup<K: std::hash::Hash + Eq>(groups: Vec<Vec<Candidate>>, mut key: impl FnMut(&Candidate) -> Option<K>) -> Vec<Vec<Candidate>> {
    let mut out = Vec::new();
    for g in groups {
        let mut by: HashMap<K, Vec<Candidate>> = HashMap::new();
        for c in g {
            if let Some(k) = key(&c) {
                by.entry(k).or_default().push(c);
            }
        }
        out.extend(by.into_values().filter(|v| v.len() > 1));
    }
    out
}

pub fn find(
    root: &Path,
    skip: &[PathBuf],
    cancel: &AtomicBool,
    mut progress: impl FnMut(DuplicateProgress),
) -> Result<(Vec<DuplicateGroup>, SnapshotMap), String> {
    let cancelled = || -> Result<(), String> {
        if cancel.load(Ordering::Relaxed) {
            Err("cancelado".into())
        } else {
            Ok(())
        }
    };

    // 1. Tamaños.
    let mut by_size: HashMap<u64, Vec<Candidate>> = HashMap::new();
    let mut seen = 0usize;
    let mut it = WalkDir::new(root).min_depth(1).into_iter();
    while let Some(entry) = it.next() {
        let Ok(entry) = entry else { continue };
        let p = entry.path();
        let name = entry.file_name().to_string_lossy();
        if entry.file_type().is_dir() {
            if name.starts_with('.')
                || SKIP_DIRS.contains(&name.as_ref())
                || is_system_path(p)
                || is_hidden_entry(&entry)
                || skip.iter().any(|s| norm(s) == norm(p))
            {
                it.skip_current_dir();
            }
            continue;
        }
        if !entry.file_type().is_file() || is_hidden_entry(&entry) {
            continue;
        }
        let Some((size, mtime)) = fingerprint(p) else { continue };
        if size == 0 {
            continue; // los vacíos son "iguales" pero no ocupan espacio
        }
        by_size.entry(size).or_default().push(Candidate { path: p.to_path_buf(), size, mtime });
        seen += 1;
        if seen % 200 == 0 {
            cancelled()?;
            progress(DuplicateProgress { phase: "sizes", processed: seen, total: seen });
        }
    }
    progress(DuplicateProgress { phase: "sizes", processed: seen, total: seen });
    let groups: Vec<Vec<Candidate>> = by_size.into_values().filter(|v| v.len() > 1).collect();

    // 2. Inicio del archivo.
    let total: usize = groups.iter().map(Vec::len).sum();
    let mut done = 0usize;
    let groups = regroup(groups, |c| {
        done += 1;
        if done % 50 == 0 {
            progress(DuplicateProgress { phase: "partial-hash", processed: done, total });
        }
        hash_file(&c.path, Some(PARTIAL), cancel).ok()
    });
    cancelled()?;

    // 3. Contenido completo (si el archivo cabe en el primer bloque, ya está comparado).
    let total: usize = groups.iter().map(Vec::len).sum();
    let mut done = 0usize;
    let groups = regroup(groups, |c| {
        done += 1;
        progress(DuplicateProgress { phase: "full-hash", processed: done, total });
        if c.size as usize <= PARTIAL {
            hash_file(&c.path, Some(PARTIAL), cancel).ok()
        } else {
            hash_file(&c.path, None, cancel).ok()
        }
    });
    cancelled()?;

    let mut snapshot = SnapshotMap::new();
    let mut out: Vec<DuplicateGroup> = groups
        .into_iter()
        .enumerate()
        .map(|(i, g)| {
            let size = g[0].size;
            let hash = hash_file(&g[0].path, None, cancel).map(|h| h.to_hex().to_string()).unwrap_or_default();
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
                    snapshot.insert(id, Snapshot { path: c.path, size: c.size, mtime: c.mtime });
                    f
                })
                .collect();
            files.sort_by(|a, b| a.modified.cmp(&b.modified));
            DuplicateGroup { id: format!("g{i}"), hash, size, files }
        })
        .collect();
    // Primero los que más espacio liberan.
    out.sort_by_key(|g| std::cmp::Reverse(g.size * (g.files.len() as u64 - 1)));
    progress(DuplicateProgress { phase: "done", processed: total, total });
    Ok((out, snapshot))
}

/// Plan para apartar copias en `dest` (sin pisar nada: nombres repetidos se numeran).
pub fn quarantine_plan(file_ids: &[String], snapshot: &SnapshotMap, root: &Path, dest: &Path) -> Result<OrganizePlan, String> {
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
        let (groups, snap) = find(r, &[], &cancel, |_| {}).unwrap();
        assert_eq!(groups.len(), 1);
        let names: Vec<_> = groups[0].files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"foto.jpg") && names.contains(&"copia de foto.jpg"));
        assert_eq!(snap.len(), 2);

        let dest = r.join("Por revisar").join("Duplicados");
        let ids: Vec<String> = groups[0].files.iter().map(|f| f.id.clone()).collect();
        let plan = quarantine_plan(&ids, &snap, r, &dest).unwrap();
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
        let (groups, _) = find(r, &[q], &cancel, |_| {}).unwrap();
        assert!(groups.is_empty());
    }
}
