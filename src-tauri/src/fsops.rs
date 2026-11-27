//! Movimiento seguro de archivos.
//!
//! Garantías:
//! - **Nunca sobrescribe.** En Windows `std::fs::rename` usa
//!   `MOVEFILE_REPLACE_EXISTING`, así que se llama a `MoveFileExW` sin esa
//!   opción: si el destino existe, el sistema rechaza el movimiento.
//! - **Entre unidades** (C: → D:) copia a un temporal en el destino, verifica
//!   el tamaño, lo renombra al nombre final y solo entonces borra el original.
//!   Si algo falla, borra el temporal y el original queda intacto.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum MoveError {
    #[error("Ya existe un archivo con ese nombre en el destino.")]
    Exists,
    #[error("Archivo en uso por otro proceso.")]
    Locked,
    #[error("El archivo ya no está en su ubicación original.")]
    SourceMissing,
    #[error("La copia no coincide con el original; se canceló.")]
    VerifyFailed,
    #[error("{0}")]
    Io(String),
}

impl From<io::Error> for MoveError {
    fn from(e: io::Error) -> Self {
        classify_io(&e)
    }
}

fn classify_io(e: &io::Error) -> MoveError {
    if e.kind() == io::ErrorKind::AlreadyExists {
        return MoveError::Exists;
    }
    match e.raw_os_error() {
        // ERROR_FILE_EXISTS, ERROR_ALREADY_EXISTS
        Some(80) | Some(183) => MoveError::Exists,
        // ERROR_SHARING_VIOLATION, ERROR_LOCK_VIOLATION
        Some(32) | Some(33) => MoveError::Locked,
        _ => MoveError::Io(e.to_string()),
    }
}

/// Mueve `src` a `dst` sin sobrescribir jamás. `dst` es la ruta final del archivo.
pub fn move_file(src: &Path, dst: &Path) -> Result<(), MoveError> {
    if !src.exists() {
        return Err(MoveError::SourceMissing);
    }
    if dst.exists() {
        return Err(MoveError::Exists);
    }
    match rename_no_replace(src, dst) {
        Ok(()) => Ok(()),
        Err(e) if is_cross_device(&e) => copy_verify_delete(src, dst),
        Err(e) => Err(classify_io(&e)),
    }
}

#[cfg(windows)]
fn rename_no_replace(src: &Path, dst: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};
    let wide = |p: &Path| p.as_os_str().encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>();
    let (s, d) = (wide(src), wide(dst));
    // Sin MOVEFILE_REPLACE_EXISTING ni MOVEFILE_COPY_ALLOWED: falla si existe o si cambia de unidad.
    let ok = unsafe { MoveFileExW(s.as_ptr(), d.as_ptr(), MOVEFILE_WRITE_THROUGH) };
    if ok == 0 { Err(io::Error::last_os_error()) } else { Ok(()) }
}

#[cfg(not(windows))]
fn rename_no_replace(src: &Path, dst: &Path) -> io::Result<()> {
    // Fuera de Windows: enlace duro (falla si existe) + borrar el original.
    match fs::hard_link(src, dst) {
        Ok(()) => fs::remove_file(src),
        Err(e) => Err(e),
    }
}

fn is_cross_device(e: &io::Error) -> bool {
    // ERROR_NOT_SAME_DEVICE (17) en Windows; EXDEV (18) en Unix.
    matches!(e.raw_os_error(), Some(17) | Some(18))
}

/// Quita o pone el atributo de solo lectura (Windows no deja escribir ni borrar con él).
fn set_readonly(p: &Path, value: bool) -> io::Result<()> {
    let mut perms = fs::metadata(p)?.permissions();
    if perms.readonly() != value {
        #[allow(clippy::permissions_set_readonly_false)]
        perms.set_readonly(value);
        fs::set_permissions(p, perms)?;
    }
    Ok(())
}

fn copy_verify_delete(src: &Path, dst: &Path) -> Result<(), MoveError> {
    let tmp = temp_name(dst);
    let expected = fs::metadata(src)?.len();
    // `fs::copy` conserva el atributo de solo lectura; se quita mientras se verifica
    // la copia y se vuelve a poner al final.
    let readonly = fs::metadata(src)?.permissions().readonly();
    let result = (|| -> Result<(), MoveError> {
        fs::copy(src, &tmp)?;
        set_readonly(&tmp, false)?;
        // FlushFileBuffers exige permiso de escritura en Windows.
        fs::OpenOptions::new().write(true).open(&tmp)?.sync_all()?;
        if fs::metadata(&tmp)?.len() != expected {
            return Err(MoveError::VerifyFailed);
        }
        rename_no_replace(&tmp, dst).map_err(|e| classify_io(&e))?;
        Ok(())
    })();
    if let Err(e) = result {
        let _ = set_readonly(&tmp, false);
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    // El destino ya está completo y verificado: ahora sí se retira el original.
    let removed = set_readonly(src, false).and_then(|_| fs::remove_file(src));
    if let Err(e) = removed {
        // No se pudo borrar el original (p. ej. en uso): se deshace la copia
        // para no duplicar el archivo, y el original queda como estaba.
        let _ = fs::remove_file(dst);
        if readonly {
            let _ = set_readonly(src, true);
        }
        return Err(classify_io(&e));
    }
    if readonly {
        let _ = set_readonly(dst, true);
    }
    Ok(())
}

fn temp_name(dst: &Path) -> PathBuf {
    let name = dst.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    let mut i = 0u32;
    loop {
        let candidate = dst.with_file_name(format!(".{name}.carpetea-{i}.part"));
        if !candidate.exists() {
            return candidate;
        }
        i += 1;
    }
}

/// Primer nombre libre en `dir`: `nombre.ext`, `nombre (1).ext`, `nombre (2).ext`…
pub fn free_name(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let (base, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (1..)
        .map(|i| dir.join(format!("{base} ({i}){ext}")))
        .find(|p| !p.exists())
        .expect("siempre hay un nombre libre")
}

/// Crea `dir` y sus padres; devuelve las carpetas que no existían (de la más alta a la más profunda).
pub fn create_dirs(dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut missing = Vec::new();
    let mut cur = Some(dir);
    while let Some(p) = cur {
        if p.exists() {
            break;
        }
        missing.push(p.to_path_buf());
        cur = p.parent();
    }
    missing.reverse();
    fs::create_dir_all(dir)?;
    Ok(missing)
}

/// Tamaño y fecha de modificación (ms) para detectar cambios.
pub fn fingerprint(p: &Path) -> Option<(u64, i64)> {
    let m = fs::metadata(p).ok()?;
    let mtime = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as i64;
    Some((m.len(), mtime))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(p: &Path, s: &str) {
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, s).unwrap();
    }

    #[test]
    fn moves_without_overwriting() {
        let t = crate::test_dir();
        let a = t.path().join("a.txt");
        let b = t.path().join("dest").join("a.txt");
        write(&a, "original");
        write(&b, "ya estaba");
        assert!(matches!(move_file(&a, &b), Err(MoveError::Exists)));
        assert_eq!(fs::read_to_string(&b).unwrap(), "ya estaba");
        assert!(a.exists(), "el original no se toca si hay conflicto");

        let free = free_name(b.parent().unwrap(), "a.txt");
        assert_eq!(free.file_name().unwrap(), "a (1).txt");
        move_file(&a, &free).unwrap();
        assert!(!a.exists());
        assert_eq!(fs::read_to_string(&free).unwrap(), "original");
    }

    #[test]
    fn copy_path_verifies_and_cleans_up() {
        let t = crate::test_dir();
        let a = t.path().join("x.bin");
        let b = t.path().join("y").join("x.bin");
        write(&a, "contenido");
        fs::create_dir_all(b.parent().unwrap()).unwrap();
        copy_verify_delete(&a, &b).unwrap();
        assert!(!a.exists());
        assert_eq!(fs::read_to_string(&b).unwrap(), "contenido");
        let leftovers: Vec<_> = fs::read_dir(b.parent().unwrap()).unwrap().filter_map(|e| e.ok()).filter(|e| e.file_name().to_string_lossy().ends_with(".part")).collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn copy_path_handles_read_only_files() {
        let t = crate::test_dir();
        let a = t.path().join("solo-lectura.txt");
        fs::write(&a, "contenido").unwrap();
        set_readonly(&a, true).unwrap();
        let b = t.path().join("destino").join("solo-lectura.txt");
        fs::create_dir_all(b.parent().unwrap()).unwrap();
        copy_verify_delete(&a, &b).unwrap();
        assert!(!a.exists());
        assert_eq!(fs::read_to_string(&b).unwrap(), "contenido");
        assert!(fs::metadata(&b).unwrap().permissions().readonly(), "conserva el atributo");
        set_readonly(&b, false).unwrap();
    }

    #[test]
    fn missing_source_is_reported() {
        let t = crate::test_dir();
        let r = move_file(&t.path().join("no.txt"), &t.path().join("b.txt"));
        assert!(matches!(r, Err(MoveError::SourceMissing)));
    }

    #[test]
    fn create_dirs_reports_only_new_ones() {
        let t = crate::test_dir();
        let deep = t.path().join("A").join("B").join("C");
        fs::create_dir_all(t.path().join("A")).unwrap();
        let made = create_dirs(&deep).unwrap();
        assert_eq!(made, vec![t.path().join("A").join("B"), deep]);
    }
}
