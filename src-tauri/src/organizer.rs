//! Ejecución de un plan confirmado y deshacer.
//!
//! Reglas: solo se mueven archivos del último análisis, solo si no han
//! cambiado desde entonces, nunca se sobrescribe y todo queda en el diario.

use std::path::{Path, PathBuf};

use crate::db::{now, Db};
use crate::fsops::{create_dirs, fingerprint, free_name, move_file, MoveError};
use crate::model::{ExecProgress, MoveRecord, Operation, OrganizePlan};
use crate::scanner::SnapshotMap;
use crate::safety::{has_unsafe_segment, AllowedRoots};

fn new_id() -> String {
    format!("op_{}", chrono::Local::now().format("%Y%m%d%H%M%S%3f"))
}

pub fn execute(
    db: &Db,
    plan: &OrganizePlan,
    snapshot: &SnapshotMap,
    roots: &AllowedRoots,
    progress: impl FnMut(ExecProgress),
) -> Result<Operation, String> {
    execute_kind("organize", db, plan, snapshot, roots, progress)
}

/// Igual que [`execute`], pero anotando otro tipo de operación (p. ej. `duplicates`).
pub fn execute_kind(
    kind: &str,
    db: &Db,
    plan: &OrganizePlan,
    snapshot: &SnapshotMap,
    roots: &AllowedRoots,
    mut progress: impl FnMut(ExecProgress),
) -> Result<Operation, String> {
    let mut op = Operation {
        id: new_id(),
        kind: kind.into(),
        created_at: now(),
        source: plan.source_path.clone(),
        destination: Some(plan.destination_label.clone()),
        status: "in_progress".into(),
        moves: vec![],
        folders_created: vec![],
        errors: vec![],
        undone_at: None,
    };
    db.begin(&op).map_err(|e| e.to_string())?;

    let total = plan.moves.len();
    let mut created: Vec<PathBuf> = Vec::new();
    for (seq, m) in plan.moves.iter().enumerate() {
        progress(ExecProgress { done: seq, total, current: m.name.clone() });
        let to = PathBuf::from(&m.to);
        let mut rec = MoveRecord { file_id: m.file_id.clone(), name: m.name.clone(), from: m.from.clone(), to: m.to.clone(), status: "pending".into(), note: None };
        db.add_move(&op.id, seq, &rec).map_err(|e| e.to_string())?;

        let outcome = (|| -> Result<(PathBuf, Option<String>), String> {
            let snap = snapshot.get(&m.file_id).ok_or("No forma parte del último análisis.")?;
            if snap.path != PathBuf::from(&m.from) {
                return Err("La ruta de origen no coincide con el análisis.".into());
            }
            match fingerprint(&snap.path) {
                None => return Err("El archivo ya no está en su ubicación original.".into()),
                Some((size, mtime)) if size != snap.size || mtime != snap.mtime => {
                    return Err("Cambió después del análisis; vuelve a analizar.".into())
                }
                _ => {}
            }
            // Nunca `..` ni nombres que Windows altera: el archivo saldría del destino elegido.
            if has_unsafe_segment(&to) {
                return Err("El destino tiene un nombre de carpeta no válido.".into());
            }
            // Windows no admite rutas de más de 260 caracteres sin configuración especial.
            if m.to.encode_utf16().count() >= 260 {
                return Err("La ruta de destino supera los 260 caracteres que admite Windows; acorta el nombre del archivo o de la carpeta.".into());
            }
            roots.check(&to)?;
            let dir = to.parent().ok_or("Destino no válido.")?;
            let made = create_dirs(dir).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
            created.extend(made);
            // El plan ya resolvió los conflictos conocidos; si apareció uno nuevo, se busca otro nombre libre.
            let (target, note) = if to.exists() {
                let free = free_name(dir, &m.final_name);
                (free, Some("Apareció un archivo con el mismo nombre; se guardó con otro.".to_string()))
            } else {
                (to.clone(), None)
            };
            move_file(&snap.path, &target).map_err(|e| e.to_string())?;
            Ok((target, note))
        })();

        match outcome {
            Ok((target, note)) => {
                rec.to = target.display().to_string();
                rec.status = "moved".into();
                rec.note = note;
                db.update_move(&op.id, seq, &rec, fingerprint(&target)).map_err(|e| e.to_string())?;
            }
            Err(msg) => {
                let locked = msg == MoveError::Locked.to_string();
                rec.status = if locked { "skipped" } else { "failed" }.into();
                op.errors.push(format!("{}: {}", m.name, msg));
                rec.note = Some(msg);
                db.update_move(&op.id, seq, &rec, None).map_err(|e| e.to_string())?;
            }
        }
        op.moves.push(rec);
    }

    for (i, s) in plan.skipped.iter().enumerate() {
        let rec = MoveRecord { file_id: s.file_id.clone(), name: s.name.clone(), from: s.name.clone(), to: String::new(), status: "skipped".into(), note: Some(s.reason.clone()) };
        db.add_move(&op.id, total + i, &rec).map_err(|e| e.to_string())?;
        op.moves.push(rec);
    }

    progress(ExecProgress { done: total, total, current: String::new() });
    op.folders_created = created.iter().map(|p| p.display().to_string()).collect();
    let moved = op.moves.iter().filter(|m| m.status == "moved").count();
    op.status = if op.errors.is_empty() { "completed" } else if moved > 0 { "partial" } else { "failed" }.into();
    db.finish(&op).map_err(|e| e.to_string())?;
    db.add_managed(&op.id, &op.folders_created).map_err(|e| e.to_string())?;
    Ok(op)
}

pub fn undo(db: &Db, op_id: &str, mut progress: impl FnMut(ExecProgress)) -> Result<Operation, String> {
    let mut op = db.operation(op_id).map_err(|e| e.to_string())?.ok_or("Operación no encontrada.")?;
    if op.undone_at.is_some() {
        return Err("Esta operación ya se deshizo.".into());
    }
    let targets: Vec<usize> = op.moves.iter().enumerate().filter(|(_, m)| m.status == "moved").map(|(i, _)| i).collect();
    let total = targets.len();
    let mut not_restored = 0;

    // En orden inverso: lo último que se movió es lo primero que vuelve.
    for (n, &i) in targets.iter().rev().enumerate() {
        let m = op.moves[i].clone();
        progress(ExecProgress { done: n, total, current: m.name.clone() });
        let to = PathBuf::from(&m.to);
        let from = PathBuf::from(&m.from);
        let check = (|| -> Result<(), String> {
            let now_fp = fingerprint(&to).ok_or("Ya no está donde DeskFlow lo dejó.")?;
            if let Some(saved) = db.move_fingerprint(&op.id, &m.file_id).map_err(|e| e.to_string())? {
                if saved != now_fp {
                    return Err("Se modificó después de organizarlo. Se dejó en su ubicación actual.".into());
                }
            }
            if from.exists() {
                return Err("Su ubicación original está ocupada por otro archivo. No se sobrescribe.".into());
            }
            if let Some(parent) = from.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            move_file(&to, &from).map_err(|e| e.to_string())
        })();
        let rec = &mut op.moves[i];
        match check {
            Ok(()) => {
                rec.status = "restored".into();
                rec.note = None;
            }
            Err(msg) => {
                rec.status = "not_restored".into();
                rec.note = Some(msg);
                not_restored += 1;
            }
        }
        let rec = rec.clone();
        db.update_move(&op.id, i, &rec, None).map_err(|e| e.to_string())?;
    }

    // Se retiran las carpetas creadas que hayan quedado vacías (de la más profunda a la más alta).
    let mut dirs: Vec<&String> = op.folders_created.iter().collect();
    dirs.sort_by_key(|d| std::cmp::Reverse(Path::new(d).components().count()));
    for d in dirs {
        let _ = std::fs::remove_dir(d); // solo funciona si está vacía
    }

    progress(ExecProgress { done: total, total, current: String::new() });
    if not_restored > 0 {
        op.errors.push(format!("{not_restored} archivo(s) no se restauraron: cambiaron, se movieron o su ubicación original está ocupada. Revisa el detalle de cada archivo."));
    }
    op.status = "rolled_back".into();
    op.undone_at = Some(now());
    db.finish(&op).map_err(|e| e.to_string())?;
    db.remove_managed(&op.id).map_err(|e| e.to_string())?;
    Ok(op)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{PlannedMove, ScanOptions};
    use crate::scanner::scan;
    use std::fs;
    use std::sync::atomic::AtomicBool;

    fn setup() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let t = crate::test_dir();
        let src = t.path().join("Descargas");
        let dst = t.path().join("Organizado");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&dst).unwrap();
        fs::write(src.join("Factura_Luz_2026.pdf"), "factura").unwrap();
        fs::write(src.join("foto.jpg"), "foto").unwrap();
        (t, src, dst)
    }

    fn plan_for(src: &Path, dst: &Path, snap: &SnapshotMap) -> OrganizePlan {
        let mut moves: Vec<PlannedMove> = snap
            .iter()
            .map(|(id, s)| {
                let name = s.path.file_name().unwrap().to_string_lossy().to_string();
                PlannedMove { file_id: id.clone(), name: name.clone(), from: s.path.display().to_string(), to: dst.join("Docs").join(&name).display().to_string(), final_name: name }
            })
            .collect();
        moves.sort_by(|a, b| a.name.cmp(&b.name));
        OrganizePlan { source_id: "s".into(), source_path: src.display().to_string(), destination_label: dst.display().to_string(), moves, skipped: vec![], folders_to_create: vec![] }
    }

    fn opts() -> ScanOptions {
        ScanOptions { max_depth: 4, recursive: true, apply_rules: false, year_subfolders: false, review_folder_name: "Por revisar".into(), skip_hidden: true, exclusions: vec![] }
    }

    #[test]
    fn execute_then_undo_round_trip() {
        let (_t, src, dst) = setup();
        let db = Db::memory();
        let roots = AllowedRoots::default();
        roots.allow(&dst);
        let (_, snap) = scan(&src, &opts(), &[], &[], &AtomicBool::new(false), |_| {}).unwrap();
        let plan = plan_for(&src, &dst, &snap);

        let op = execute(&db, &plan, &snap, &roots, |_| {}).unwrap();
        assert_eq!(op.status, "completed");
        assert!(dst.join("Docs").join("foto.jpg").exists());
        assert!(!src.join("foto.jpg").exists());
        assert_eq!(op.folders_created, vec![dst.join("Docs").display().to_string()]);

        let undone = undo(&db, &op.id, |_| {}).unwrap();
        assert_eq!(undone.status, "rolled_back");
        assert!(src.join("foto.jpg").exists());
        assert!(!dst.join("Docs").exists(), "la carpeta creada y vacía se retira");
        assert!(db.snapshot(10).unwrap().managed.is_empty());
    }

    #[test]
    fn refuses_unscanned_changed_or_unauthorized_files() {
        let (_t, src, dst) = setup();
        let db = Db::memory();
        let roots = AllowedRoots::default();
        let (_, snap) = scan(&src, &opts(), &[], &[], &AtomicBool::new(false), |_| {}).unwrap();
        let plan = plan_for(&src, &dst, &snap);

        // Sin autorizar el destino: nada se mueve.
        let op = execute(&db, &plan, &snap, &roots, |_| {}).unwrap();
        assert_eq!(op.status, "failed");
        assert!(src.join("foto.jpg").exists());

        // Archivo modificado después del análisis.
        roots.allow(&dst);
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(src.join("foto.jpg"), "foto editada").unwrap();
        let op = execute(&db, &plan, &snap, &roots, |_| {}).unwrap();
        let foto = op.moves.iter().find(|m| m.name == "foto.jpg").unwrap();
        assert_eq!(foto.status, "failed");
        assert!(src.join("foto.jpg").exists());
    }

    #[test]
    fn never_overwrites_and_undo_respects_changes() {
        let (_t, src, dst) = setup();
        let db = Db::memory();
        let roots = AllowedRoots::default();
        roots.allow(&dst);
        fs::create_dir_all(dst.join("Docs")).unwrap();
        fs::write(dst.join("Docs").join("foto.jpg"), "otra foto que ya estaba").unwrap();
        let (_, snap) = scan(&src, &opts(), &[], &[], &AtomicBool::new(false), |_| {}).unwrap();
        let op = execute(&db, &plan_for(&src, &dst, &snap), &snap, &roots, |_| {}).unwrap();

        assert_eq!(fs::read_to_string(dst.join("Docs").join("foto.jpg")).unwrap(), "otra foto que ya estaba");
        assert_eq!(fs::read_to_string(dst.join("Docs").join("foto (1).jpg")).unwrap(), "foto");

        // El usuario edita un archivo organizado: deshacer no lo toca.
        std::thread::sleep(std::time::Duration::from_millis(20));
        fs::write(dst.join("Docs").join("Factura_Luz_2026.pdf"), "factura anotada").unwrap();
        let undone = undo(&db, &op.id, |_| {}).unwrap();
        let factura = undone.moves.iter().find(|m| m.name == "Factura_Luz_2026.pdf").unwrap();
        assert_eq!(factura.status, "not_restored");
        assert!(dst.join("Docs").join("Factura_Luz_2026.pdf").exists());
        assert!(src.join("foto.jpg").exists());
    }

    #[test]
    fn recovers_interrupted_operations() {
        let (_t, src, dst) = setup();
        let db = Db::memory();
        let op = Operation { id: "op_x".into(), kind: "organize".into(), created_at: now(), source: src.display().to_string(), destination: None, status: "in_progress".into(), moves: vec![], folders_created: vec![], errors: vec![], undone_at: None };
        db.begin(&op).unwrap();
        // Uno llegó a moverse en disco antes del cierre; otro no.
        fs::create_dir_all(dst.join("Docs")).unwrap();
        fs::rename(src.join("foto.jpg"), dst.join("Docs").join("foto.jpg")).unwrap();
        let rec = |name: &str| MoveRecord { file_id: name.into(), name: name.into(), from: src.join(name).display().to_string(), to: dst.join("Docs").join(name).display().to_string(), status: "pending".into(), note: None };
        db.add_move("op_x", 0, &rec("foto.jpg")).unwrap();
        db.add_move("op_x", 1, &rec("Factura_Luz_2026.pdf")).unwrap();

        db.recover().unwrap();
        let op = db.operation("op_x").unwrap().unwrap();
        assert_eq!(op.status, "partial");
        assert_eq!(op.moves[0].status, "moved");
        assert_eq!(op.moves[1].status, "failed");
    }
}
