//! Contrato de datos con la interfaz. Refleja `src/types/index.ts`:
//! mismos nombres de campo (camelCase) y mismos valores de texto.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Category {
    Documents,
    Images,
    Videos,
    Audio,
    Archives,
    Programs,
    Code,
    Other,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: String,
    pub name: String,
    pub ext: String,
    pub size: u64,
    pub modified: String,
    pub rel_dir: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locked: Option<bool>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Classification {
    pub file_id: String,
    pub category: Category,
    pub dest: Vec<String>,
    pub confidence: Confidence,
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SourceFolder {
    pub id: String,
    pub name: String,
    pub path: String,
    /// -1 cuando no se ha contado.
    pub file_count: i64,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanOptions {
    pub max_depth: usize,
    pub recursive: bool,
    pub apply_rules: bool,
    pub year_subfolders: bool,
    pub review_folder_name: String,
    #[serde(default = "yes")]
    pub skip_hidden: bool,
    #[serde(default)]
    pub exclusions: Vec<String>,
}

fn yes() -> bool {
    true
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: &'static str,
    pub processed: usize,
    pub total: usize,
    pub current: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub source: SourceFolder,
    pub files: Vec<FileEntry>,
    pub classifications: Vec<Classification>,
    pub existing: Vec<String>,
    pub skipped_managed: usize,
    pub duration_ms: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuleCondition {
    pub id: String,
    pub field: String,
    pub operator: String,
    pub value: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub conditions: Vec<RuleCondition>,
    pub action: String,
    pub destination: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlannedMove {
    pub file_id: String,
    pub name: String,
    pub from: String,
    pub to: String,
    pub final_name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkippedFile {
    pub file_id: String,
    pub name: String,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OrganizePlan {
    pub source_id: String,
    pub source_path: String,
    pub destination_label: String,
    pub moves: Vec<PlannedMove>,
    pub skipped: Vec<SkippedFile>,
    pub folders_to_create: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExecProgress {
    pub done: usize,
    pub total: usize,
    pub current: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MoveRecord {
    pub file_id: String,
    pub name: String,
    pub from: String,
    pub to: String,
    /// moved | skipped | failed | restored | not_restored
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: String,
    pub kind: String,
    pub created_at: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub destination: Option<String>,
    /// pending | in_progress | completed | partial | failed | rolled_back
    pub status: String,
    pub moves: Vec<MoveRecord>,
    pub folders_created: Vec<String>,
    pub errors: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub undone_at: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Libraries {
    pub documents: String,
    pub pictures: String,
    pub videos: String,
    pub music: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub home: String,
    pub libraries: Libraries,
    /// Proveedor de nube de cada biblioteca, si está sincronizada.
    pub library_cloud: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PickedFolder {
    pub name: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloud: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub problem: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirProbe {
    pub path: String,
    pub exists: bool,
    /// Nombres de los archivos que ya contiene (para detectar conflictos).
    pub files: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalDocuments {
    pub path: String,
    pub created: bool,
}

/// Carpeta existente del destino, para aprender la estructura del usuario.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IndexedFolder {
    /// Ruta relativa a la raíz indexada, con `/`.
    pub rel: String,
    /// Muestra de nombres de archivo que contiene.
    pub files: Vec<String>,
    pub file_count: usize,
    /// Carpeta de un proyecto de código (no es destino válido ni se recorre por dentro).
    pub project: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HistorySnapshot {
    pub operations: Vec<Operation>,
    pub managed: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateFile {
    pub id: String,
    pub name: String,
    /// Carpeta que lo contiene.
    pub path: String,
    pub size: u64,
    pub modified: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub id: String,
    pub hash: String,
    pub size: u64,
    pub files: Vec<DuplicateFile>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateProgress {
    pub phase: &'static str,
    pub processed: usize,
    pub total: usize,
}
