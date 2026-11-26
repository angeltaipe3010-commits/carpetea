//! Clasificador: port fiel de `src/services/classifier.ts`.
//! Niveles 1–3 (extensión, nombre/metadatos, reglas) + sistema de confianza.
//! Si se cambia uno, hay que cambiar el otro y sus pruebas.

use crate::model::{Category, Classification, Confidence, FileEntry, Rule, RuleCondition, ScanOptions};

pub fn category_of(ext: &str) -> Category {
    match ext {
        "pdf" | "doc" | "docx" | "odt" | "rtf" | "txt" | "md" | "xls" | "xlsx" | "csv" | "ods" | "ppt" | "pptx" | "odp" | "epub" => Category::Documents,
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "bmp" | "tiff" | "svg" | "psd" | "fig" | "ai" | "raw" => Category::Images,
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "wmv" | "m4v" => Category::Videos,
        "mp3" | "wav" | "flac" | "m4a" | "ogg" | "aac" => Category::Audio,
        "zip" | "rar" | "7z" | "tar" | "gz" => Category::Archives,
        "exe" | "msi" | "appx" | "msix" => Category::Programs,
        "js" | "ts" | "tsx" | "jsx" | "py" | "json" | "html" | "css" | "java" | "cs" | "rs" | "go" | "sql" => Category::Code,
        _ => Category::Other,
    }
}

/// Minúsculas, sin tildes y con `_ - . ( )` convertidos en espacios.
fn norm(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_space = false;
    for ch in s.to_lowercase().chars() {
        let c = match ch {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            '_' | '-' | '.' | '(' | ')' => ' ',
            other => other,
        };
        // El TS colapsa secuencias de separadores en un solo espacio.
        if c == ' ' && matches!(ch, '_' | '-' | '.' | '(' | ')') {
            if !last_space {
                out.push(' ');
            }
            last_space = true;
        } else {
            out.push(c);
            last_space = false;
        }
    }
    out
}

fn has(n: &str, words: &[&str]) -> bool {
    words.iter().any(|w| n.contains(w))
}

/// Año del nombre (20xx) o, si no aparece, de la fecha de modificación.
fn year_of(f: &FileEntry, n: &str) -> String {
    let b = n.as_bytes();
    for i in 0..b.len().saturating_sub(3) {
        let boundary = i == 0 || !b[i - 1].is_ascii_alphanumeric() && b[i - 1] != b'_';
        if boundary && b[i] == b'2' && b[i + 1] == b'0' && (b[i + 2] == b'1' || b[i + 2] == b'2') && b[i + 3].is_ascii_digit() {
            return n[i..i + 4].to_string();
        }
    }
    f.modified.chars().take(4).collect()
}

struct Guess {
    dest: Vec<String>,
    confidence: Confidence,
    reason: String,
}

fn g(dest: &[&str], confidence: Confidence, reason: impl Into<String>) -> Guess {
    Guess { dest: dest.iter().map(|s| s.to_string()).collect(), confidence, reason: reason.into() }
}

const SUBJECTS: &[(&[&str], &str)] = &[
    (&["programacion", "java", "python", "poo", "react", "javascript", "algoritmo"], "Programación"),
    (&["administracion", "contabilidad", "finanzas", "marketing", "economia"], "Administración"),
    (&["calculo", "matematica", "algebra", "estadistica", "fisica"], "Ciencias"),
];

const TECH: &[(&[&str], &str)] = &[
    (&["react", "next", "vite"], "React"),
    (&["express", "node", "api", "backend"], "Node.js"),
    (&["python", "django", "flask"], "Python"),
    (&["tailwind", "landing", "html"], "Web"),
];

fn guess(f: &FileEntry, cat: Category, opts: &ScanOptions) -> Guess {
    let n = norm(&f.name);
    let year = year_of(f, &n);
    let with_year = |mut d: Guess| {
        if opts.year_subfolders && !year.is_empty() {
            d.dest.push(year.clone());
        }
        d
    };
    let ext = f.ext.as_str();
    match cat {
        Category::Documents => {
            if has(&n, &["factura", "boleta", "recibo"]) {
                let servicio = has(&n, &["electricidad", "luz", "agua", "internet", "gas", "telefono"]);
                return with_year(g(
                    &["Documentos", "Finanzas", if servicio { "Servicios" } else { "Compras" }],
                    Confidence::High,
                    if servicio { "Nombre indica factura de servicio" } else { "Nombre indica comprobante de compra" },
                ));
            }
            if has(&n, &["presupuesto", "gastos", "ingresos"]) {
                return g(&["Documentos", "Finanzas", "Presupuestos"], Confidence::High, "Nombre indica documento financiero");
            }
            if has(&n, &["contrato", "acuerdo", "convenio"]) {
                return g(&["Documentos", "Contratos"], Confidence::High, "Nombre indica contrato");
            }
            if has(&n, &["cv ", "curriculum"]) || n.starts_with("cv") {
                return g(&["Documentos", "Personal"], Confidence::High, "Nombre indica currículum");
            }
            if has(&n, &["apuntes", "tarea", "examen", "practica", "clase", "silabo", "trabajo final", "semana", "curso"]) {
                let subject = SUBJECTS.iter().find(|(kw, _)| has(&n, kw)).map(|(_, s)| *s);
                let mut d = vec!["Documentos", "Estudios"];
                if let Some(s) = subject {
                    d.push(s);
                }
                return with_year(match subject {
                    Some(s) => g(&d, Confidence::High, format!("Material de estudio · {s}")),
                    None => g(&d, Confidence::Medium, "Material de estudio sin asignatura clara"),
                });
            }
            if has(&n, &["scan"]) {
                return g(&["Documentos", "Escaneos"], Confidence::Medium, "Nombre genérico de escáner");
            }
            g(&["Documentos"], Confidence::Medium, "Solo se reconoce el tipo de archivo")
        }
        Category::Images => {
            if has(&n, &["screenshot", "captura"]) {
                return g(&["Imágenes", "Capturas"], Confidence::High, "Patrón de captura de pantalla");
            }
            if is_camera_name(&n) {
                return with_year(g(&["Imágenes", "Fotografías"], Confidence::High, "Patrón de nombre de cámara"));
            }
            if ["psd", "fig", "ai", "svg"].contains(&ext) || has(&n, &["logo", "mockup", "banner", "icono"]) {
                return g(&["Imágenes", "Diseños"], Confidence::High, "Archivo o nombre de diseño");
            }
            g(&["Imágenes"], Confidence::Medium, "Solo se reconoce el tipo de archivo")
        }
        Category::Videos => {
            if has(&n, &["tutorial", "curso", "clase"]) {
                return g(&["Videos", "Tutoriales"], Confidence::High, "Nombre indica contenido formativo");
            }
            if has(&n, &["grabacion", "obs", "recording", "reunion", "zoom"]) {
                return g(&["Videos", "Grabaciones"], Confidence::High, "Patrón de grabación de pantalla o reunión");
            }
            g(&["Videos"], Confidence::Medium, "Solo se reconoce el tipo de archivo")
        }
        Category::Audio => {
            if has(&n, &["podcast", "episodio"]) {
                return g(&["Audio", "Podcasts"], Confidence::High, "Nombre indica podcast");
            }
            if has(&n, &["nota de voz", "voz", "audio"]) {
                return g(&["Audio", "Notas de voz"], Confidence::Medium, "Nombre indica nota de voz");
            }
            g(&["Audio"], Confidence::Medium, "Solo se reconoce el tipo de archivo")
        }
        Category::Programs => {
            if has(&n, &["portable"]) {
                return g(&["Programas", "Portables"], Confidence::High, "Nombre indica versión portable");
            }
            let conf = if has(&n, &["setup", "install"]) || ext == "msi" { Confidence::High } else { Confidence::Medium };
            g(&["Programas", "Instaladores"], conf, "Ejecutable de instalación")
        }
        Category::Archives => {
            let tech = TECH.iter().find(|(kw, _)| has(&n, kw)).map(|(_, t)| *t);
            if tech.is_some() || has(&n, &["proyecto", "project", "main", "src"]) {
                let mut d = vec!["Proyectos", "Desarrollo"];
                if let Some(t) = tech {
                    d.push(t);
                }
                return match tech {
                    Some(t) => g(&d, Confidence::High, format!("Proyecto de código · {t}")),
                    None => g(&d, Confidence::Medium, "Parece un proyecto de código"),
                };
            }
            if has(&n, &["curso", "clase"]) {
                return g(&["Documentos", "Estudios"], Confidence::Medium, "Comprimido de material de estudio");
            }
            g(&["Comprimidos"], Confidence::Medium, "Contenido del comprimido sin analizar")
        }
        Category::Code => g(&["Proyectos", "Fragmentos"], Confidence::Medium, "Archivo de código suelto"),
        Category::Other => {
            let reason = if f.ext.is_empty() { "Archivo sin extensión".to_string() } else { format!("Extensión .{} desconocida", f.ext) };
            Guess { dest: vec![opts.review_folder_name.clone()], confidence: Confidence::Low, reason }
        }
    }
}

/// `img 20250304…`, `pxl 2026…`, `dsc…`: prefijo de cámara + 8 dígitos.
fn is_camera_name(n: &str) -> bool {
    for p in ["img", "pxl", "dsc", "dcim"] {
        if let Some(rest) = n.strip_prefix(p) {
            let rest = rest.strip_prefix(' ').unwrap_or(rest);
            if rest.len() >= 8 && rest.as_bytes()[..8].iter().all(u8::is_ascii_digit) {
                return true;
            }
        }
    }
    false
}

fn list(v: &str) -> Vec<String> {
    v.split(',').map(|s| s.trim().to_lowercase().trim_start_matches('.').to_string()).filter(|s| !s.is_empty()).collect()
}

fn plain(s: &str) -> String {
    norm_accents(&s.to_lowercase())
}

fn norm_accents(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            'ñ' => 'n',
            o => o,
        })
        .collect()
}

fn category_key(c: Category) -> &'static str {
    match c {
        Category::Documents => "documents",
        Category::Images => "images",
        Category::Videos => "videos",
        Category::Audio => "audio",
        Category::Archives => "archives",
        Category::Programs => "programs",
        Category::Code => "code",
        Category::Other => "other",
    }
}

fn condition_matches(c: &RuleCondition, f: &FileEntry, cat: Category) -> bool {
    let v = c.value.trim();
    if v.is_empty() {
        return false;
    }
    match c.field.as_str() {
        "extension" => list(v).contains(&f.ext),
        "name" => {
            let name = plain(&f.name);
            let base = match name.rfind('.') {
                Some(i) if i > 0 => name[..i].to_string(),
                _ => name.clone(),
            };
            if c.operator == "is" {
                list(v).iter().any(|x| plain(x) == base || plain(x) == name)
            } else {
                list(v).iter().any(|x| name.contains(&plain(x)))
            }
        }
        "size" => match v.replace(',', ".").parse::<f64>() {
            Ok(mb) => {
                let size = f.size as f64 / 1024.0 / 1024.0;
                if c.operator == "gt" { size > mb } else { size < mb }
            }
            Err(_) => false,
        },
        "modified" => {
            // Fechas ISO (YYYY-MM-DD…): el orden lexicográfico coincide con el cronológico.
            let m = &f.modified[..f.modified.len().min(10)];
            let t = &v[..v.len().min(10)];
            if t.len() < 10 {
                return false;
            }
            if c.operator == "gt" { m > t } else { m < t }
        }
        "category" => list(v).iter().any(|x| x == category_key(cat)),
        _ => false,
    }
}

pub fn rule_matches(rule: &Rule, f: &FileEntry, cat: Category) -> bool {
    !rule.conditions.is_empty() && rule.conditions.iter().all(|c| condition_matches(c, f, cat))
}

fn clamp(mut dest: Vec<String>, max: usize) -> Vec<String> {
    dest.truncate(max.max(1));
    dest
}

pub fn classify(f: &FileEntry, rules: &[Rule], opts: &ScanOptions) -> Classification {
    let category = category_of(&f.ext);

    if opts.apply_rules {
        for rule in rules.iter().filter(|r| r.enabled) {
            if !rule_matches(rule, f, category) {
                continue;
            }
            let review = rule.action == "review";
            let dest = if review {
                vec![opts.review_folder_name.clone()]
            } else {
                rule.destination
                    .split(['/', '\\'])
                    .map(str::trim)
                    .filter(|s| !s.is_empty() && !crate::safety::unsafe_segment(s))
                    .map(String::from)
                    .collect()
            };
            return Classification {
                file_id: f.id.clone(),
                category,
                dest: clamp(dest, opts.max_depth),
                confidence: if review { Confidence::Low } else { Confidence::High },
                reason: format!("Regla: {}", rule.name),
                rule_id: Some(rule.id.clone()),
            };
        }
    }

    let gs = guess(f, category, opts);
    let dest = if gs.confidence == Confidence::Low { vec![opts.review_folder_name.clone()] } else { gs.dest };
    Classification { file_id: f.id.clone(), category, dest: clamp(dest, opts.max_depth), confidence: gs.confidence, reason: gs.reason, rule_id: None }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(name: &str, size_kb: u64, modified: &str) -> FileEntry {
        let ext = name.rfind('.').filter(|&i| i > 0).map(|i| name[i + 1..].to_lowercase()).unwrap_or_default();
        FileEntry { id: name.into(), name: name.into(), ext, size: size_kb * 1024, modified: format!("{modified}T10:00:00"), rel_dir: String::new(), locked: None }
    }

    fn opts() -> ScanOptions {
        ScanOptions { max_depth: 4, recursive: true, apply_rules: true, year_subfolders: true, review_folder_name: "Por revisar".into(), skip_hidden: true, exclusions: vec![] }
    }

    fn dest(name: &str) -> (String, Confidence) {
        let c = classify(&file(name, 100, "2026-11-20"), &[], &opts());
        (c.dest.join("/"), c.confidence)
    }

    #[test]
    fn matches_typescript_reference_cases() {
        assert_eq!(dest("Factura_Electricidad_Noviembre_2026.pdf"), ("Documentos/Finanzas/Servicios/2026".into(), Confidence::High));
        assert_eq!(dest("Boleta_Compra_Laptop_2026.pdf"), ("Documentos/Finanzas/Compras/2026".into(), Confidence::High));
        assert_eq!(dest("Contrato_Alquiler_Departamento.pdf"), ("Documentos/Contratos".into(), Confidence::High));
        assert_eq!(dest("CV_Desarrollador_2026.pdf"), ("Documentos/Personal".into(), Confidence::High));
        assert_eq!(dest("Apuntes_Programacion_Semana_12.pdf"), ("Documentos/Estudios/Programación/2026".into(), Confidence::High));
        assert_eq!(dest("documento.pdf"), ("Documentos".into(), Confidence::Medium));
        assert_eq!(dest("Screenshot 2026-11-03 091512.png"), ("Imágenes/Capturas".into(), Confidence::High));
        assert_eq!(dest("IMG_20250304_101010.jpg"), ("Imágenes/Fotografías/2025".into(), Confidence::High));
        assert_eq!(dest("VSCodeUserSetup-x64-1.106.0.exe"), ("Programas/Instaladores".into(), Confidence::High));
        assert_eq!(dest("Rufus_portable_4.6.exe"), ("Programas/Portables".into(), Confidence::High));
        assert_eq!(dest("React_Proyecto_Final.zip"), ("Proyectos/Desarrollo/React".into(), Confidence::High));
        assert_eq!(dest("nuevo.dat"), ("Por revisar".into(), Confidence::Low));
        assert_eq!(dest("descarga"), ("Por revisar".into(), Confidence::Low));
    }

    #[test]
    fn rules_take_priority_and_respect_depth() {
        let rule = Rule {
            id: "r".into(),
            name: "Facturas".into(),
            enabled: true,
            action: "move".into(),
            destination: "Documentos/Finanzas/Facturas/Luz/Extra".into(),
            conditions: vec![
                RuleCondition { id: "a".into(), field: "extension".into(), operator: "is".into(), value: "pdf".into() },
                RuleCondition { id: "b".into(), field: "name".into(), operator: "contains".into(), value: "factura".into() },
            ],
        };
        let c = classify(&file("Factura_Luz.pdf", 10, "2026-01-01"), &[rule], &opts());
        assert_eq!(c.dest.join("/"), "Documentos/Finanzas/Facturas/Luz");
        assert_eq!(c.reason, "Regla: Facturas");
    }

    #[test]
    fn size_rule_sends_big_files_to_review() {
        let rule = Rule {
            id: "big".into(),
            name: "Grandes".into(),
            enabled: true,
            action: "review".into(),
            destination: String::new(),
            conditions: vec![RuleCondition { id: "s".into(), field: "size".into(), operator: "gt".into(), value: "500".into() }],
        };
        let c = classify(&file("pelicula.mkv", 600 * 1024, "2026-01-01"), &[rule], &opts());
        assert_eq!(c.dest, vec!["Por revisar".to_string()]);
        assert_eq!(c.confidence, Confidence::Low);
    }
}
