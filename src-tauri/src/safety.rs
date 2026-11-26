//! Reglas de seguridad del sistema de archivos:
//! - detección de carpetas sincronizadas con la nube,
//! - rutas del sistema protegidas,
//! - carpetas autorizadas (solo se toca lo que el usuario eligió).

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

/// Normaliza para comparar: absoluta, sin `.`/`..`, en minúsculas en Windows.
pub fn norm(p: &Path) -> String {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    let s = out.to_string_lossy().trim_end_matches(['\\', '/']).to_string();
    if cfg!(windows) {
        s.replace('/', "\\").to_lowercase()
    } else {
        s
    }
}

/// Nombre de carpeta o archivo que Windows no admite tal cual o que saldría
/// de la carpeta: `.`, `..`, terminado en punto o espacio, o un nombre
/// reservado del sistema (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
pub fn unsafe_segment(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." || name.ends_with('.') || name.ends_with(' ') {
        return true;
    }
    let stem = name.split('.').next().unwrap_or("").trim_end().to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ((stem.starts_with("COM") || stem.starts_with("LPT")) && stem.len() == 4 && stem.as_bytes()[3].is_ascii_digit() && stem.as_bytes()[3] != b'0')
}

/// La ruta contiene `.`/`..` o algún nombre no válido (ver [`unsafe_segment`]).
pub fn has_unsafe_segment(p: &Path) -> bool {
    p.components().any(|c| match c {
        Component::CurDir | Component::ParentDir => true,
        Component::Normal(s) => unsafe_segment(&s.to_string_lossy()),
        _ => false,
    })
}

/// `child` está dentro de `parent` (o es la misma carpeta).
pub fn is_within(child: &Path, parent: &Path) -> bool {
    let c = norm(child);
    let p = norm(parent);
    let sep = if cfg!(windows) { '\\' } else { '/' };
    c == p || c.starts_with(&format!("{p}{sep}"))
}

const CLOUD_NAMES: &[(&str, &str)] = &[
    ("onedrive", "OneDrive"),
    ("google drive", "Google Drive"),
    ("googledrive", "Google Drive"),
    ("my drive", "Google Drive"),
    ("mi unidad", "Google Drive"),
    ("dropbox", "Dropbox"),
    ("icloud drive", "iCloud"),
    ("iclouddrive", "iCloud"),
    ("box", "Box"),
    ("mega", "MEGA"),
];

/// Proveedor de nube si la ruta está sincronizada. Combina:
/// 1. raíces de OneDrive declaradas por Windows (variables de entorno),
/// 2. nombres de carpeta de los clientes conocidos,
/// 3. atributos de archivos en la nube de Windows (pinned/unpinned/recall).
pub fn cloud_provider(path: &Path) -> Option<String> {
    for var in ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"] {
        if let Ok(root) = std::env::var(var) {
            if !root.is_empty() && is_within(path, Path::new(&root)) {
                return Some("OneDrive".into());
            }
        }
    }
    for comp in path.components() {
        if let Component::Normal(seg) = comp {
            let s = seg.to_string_lossy().to_lowercase();
            let base = s.split(" - ").next().unwrap_or(&s).trim().to_string();
            for (name, provider) in CLOUD_NAMES {
                if base == *name || (base.starts_with("dropbox (") && *name == "dropbox") {
                    return Some((*provider).into());
                }
            }
        }
    }
    if has_cloud_attributes(path) {
        return Some("la nube".into());
    }
    None
}

#[cfg(windows)]
fn has_cloud_attributes(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    const PINNED: u32 = 0x0008_0000;
    const UNPINNED: u32 = 0x0010_0000;
    const RECALL_ON_OPEN: u32 = 0x0004_0000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
    // Se comprueba la carpeta y sus antecesores existentes.
    let mut cur = Some(path);
    while let Some(p) = cur {
        if let Ok(m) = std::fs::metadata(p) {
            if m.file_attributes() & (PINNED | UNPINNED | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0 {
                return true;
            }
        }
        cur = p.parent();
    }
    false
}

#[cfg(not(windows))]
fn has_cloud_attributes(_path: &Path) -> bool {
    false
}

/// Archivo que solo está en la nube (marcador de OneDrive y similares):
/// leerlo lo descargaría, así que no se abre.
#[cfg(windows)]
pub fn is_cloud_only(m: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const OFFLINE: u32 = 0x0000_1000;
    const RECALL_ON_OPEN: u32 = 0x0004_0000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x0040_0000;
    m.file_attributes() & (OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0
}

#[cfg(not(windows))]
pub fn is_cloud_only(_m: &std::fs::Metadata) -> bool {
    false
}

/// Carpetas que nunca se analizan ni se usan como destino.
pub fn is_system_path(path: &Path) -> bool {
    let n = norm(path);
    if cfg!(windows) {
        let rest = n.get(2..).unwrap_or("");
        let protected = ["\\windows", "\\program files", "\\program files (x86)", "\\programdata", "\\$recycle.bin", "\\system volume information"];
        if protected.iter().any(|p| rest == *p || rest.starts_with(&format!("{p}\\"))) {
            return true;
        }
        n.contains("\\appdata\\") || n.ends_with("\\appdata")
    } else {
        ["/bin", "/boot", "/dev", "/etc", "/lib", "/proc", "/sbin", "/sys", "/usr", "/var", "/system", "/library"]
            .iter()
            .any(|p| n == *p || n.starts_with(&format!("{p}/")))
    }
}

/// Motivo por el que una ruta nunca puede ser destino ni origen.
pub fn destination_problem(path: &Path) -> Option<String> {
    if is_system_path(path) {
        return Some("Carpeta del sistema protegida.".into());
    }
    if path.parent().is_none() || path.components().count() <= 1 + usize::from(cfg!(windows)) {
        return Some("Elige una carpeta, no la raíz de la unidad.".into());
    }
    None
}

/// Carpetas autorizadas en esta sesión: elegidas por el usuario o sugeridas
/// por la propia app. Cualquier otra ruta se rechaza en los comandos.
#[derive(Default)]
pub struct AllowedRoots {
    list: Mutex<Vec<PathBuf>>,
    /// Si está definida, nada fuera de esta carpeta se puede autorizar ni usar
    /// (modo de pruebas: el motor no puede tocar carpetas reales del usuario).
    jail: Option<PathBuf>,
}

impl AllowedRoots {
    pub fn jailed(root: &Path) -> Self {
        let r = Self { list: Mutex::default(), jail: Some(root.to_path_buf()) };
        r.allow(root);
        r
    }

    pub fn allow(&self, p: &Path) {
        if self.jail.as_ref().is_some_and(|j| !is_within(p, j)) {
            return;
        }
        let mut v = self.list.lock().unwrap();
        if !v.iter().any(|x| norm(x) == norm(p)) {
            v.push(p.to_path_buf());
        }
    }

    pub fn check(&self, p: &Path) -> Result<(), String> {
        if is_system_path(p) {
            return Err(format!("Ruta protegida: {}", p.display()));
        }
        if self.jail.as_ref().is_some_and(|j| !is_within(p, j)) {
            return Err(format!("Modo de pruebas: {} está fuera de la carpeta de pruebas.", p.display()));
        }
        if self.list.lock().unwrap().iter().any(|r| is_within(p, r)) {
            Ok(())
        } else {
            Err(format!("DeskFlow no tiene permiso para usar {}. Elígela primero.", p.display()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_cloud_by_name() {
        assert_eq!(cloud_provider(Path::new(r"C:\Users\x\OneDrive\Documentos")).as_deref(), Some("OneDrive"));
        assert_eq!(cloud_provider(Path::new(r"C:\Users\x\OneDrive - Empresa\Docs")).as_deref(), Some("OneDrive"));
        assert_eq!(cloud_provider(Path::new(r"G:\Mi unidad\Fotos")).as_deref(), Some("Google Drive"));
        assert_eq!(cloud_provider(Path::new(r"C:\Users\x\Dropbox (Personal)\a")).as_deref(), Some("Dropbox"));
    }

    #[cfg(windows)]
    #[test]
    fn system_paths_are_protected() {
        assert!(is_system_path(Path::new(r"C:\Windows\System32")));
        assert!(is_system_path(Path::new(r"C:\Program Files (x86)\App")));
        assert!(is_system_path(Path::new(r"C:\Users\x\AppData\Local")));
        assert!(!is_system_path(Path::new(r"C:\Users\x\Downloads")));
        assert!(destination_problem(Path::new(r"D:\")).is_some());
    }

    #[test]
    fn allowed_roots_limit_access() {
        let roots = AllowedRoots::default();
        let t = crate::test_dir();
        let base = t.path().join("permitida");
        roots.allow(&base);
        assert!(roots.check(&base.join("a").join("b")).is_ok());
        assert!(roots.check(&t.path().join("otra")).is_err());
        // AppData sigue protegida aunque alguien la autorice.
        if cfg!(windows) {
            roots.allow(Path::new(r"C:\Users\x\AppData\Local"));
            assert!(roots.check(Path::new(r"C:\Users\x\AppData\Local\Temp")).is_err());
        }
    }

    #[test]
    fn rejects_dot_segments_and_reserved_names() {
        for bad in ["..", ".", "CON", "con.txt", "Docs.", "Docs ", "LPT1", "com9.log"] {
            assert!(unsafe_segment(bad), "{bad}");
        }
        for ok in ["Docs", "Console", "COM0", "notas.txt", ".gitignore", "Cibertec - POO"] {
            assert!(!unsafe_segment(ok), "{ok}");
        }
        assert!(has_unsafe_segment(Path::new(r"C:\Destino\..\Instaladores\a.exe")));
        assert!(!has_unsafe_segment(Path::new(r"C:\Destino\Instaladores\a.exe")));
    }

    #[test]
    fn jail_blocks_everything_outside_the_test_folder() {
        let t = crate::test_dir();
        let jail = t.path().join("sandbox");
        let roots = AllowedRoots::jailed(&jail);
        assert!(roots.check(&jail.join("Origen")).is_ok());
        let real = t.path().join("Descargas");
        roots.allow(&real);
        assert!(roots.check(&real).is_err());
    }
}
