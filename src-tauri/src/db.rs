//! Diario de operaciones en SQLite.
//!
//! Cada movimiento se anota como `pending` ANTES de hacerse y se actualiza
//! justo después. Si la app se cierra a mitad, al arrancar `recover` mira el
//! disco para saber qué movimientos llegaron a completarse.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

use crate::model::{HistorySnapshot, MoveRecord, Operation};

pub struct Db(pub Connection);

const SCHEMA: &str = r#"
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  destination TEXT,
  status TEXT NOT NULL,
  errors TEXT NOT NULL DEFAULT '[]',
  folders_created TEXT NOT NULL DEFAULT '[]',
  undone_at TEXT
);
CREATE TABLE IF NOT EXISTS moves (
  op_id TEXT NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  file_id TEXT NOT NULL,
  name TEXT NOT NULL,
  from_path TEXT NOT NULL,
  to_path TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  size INTEGER,
  mtime INTEGER,
  PRIMARY KEY (op_id, seq)
);
CREATE TABLE IF NOT EXISTS managed (
  path TEXT PRIMARY KEY,
  op_id TEXT NOT NULL
);
-- Carpetas que el usuario eligió en el selector nativo: siguen autorizadas tras reiniciar.
CREATE TABLE IF NOT EXISTS allowed (
  path TEXT PRIMARY KEY
);
"#;

pub fn now() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        let db = Db(conn);
        db.recover()?;
        Ok(db)
    }

    #[cfg(test)]
    pub fn memory() -> Self {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        Db(conn)
    }

    pub fn begin(&self, op: &Operation) -> rusqlite::Result<()> {
        self.0.execute(
            "INSERT INTO operations (id, kind, created_at, source, destination, status) VALUES (?1, ?2, ?3, ?4, ?5, 'in_progress')",
            params![op.id, op.kind, op.created_at, op.source, op.destination],
        )?;
        Ok(())
    }

    pub fn add_move(&self, op_id: &str, seq: usize, m: &MoveRecord) -> rusqlite::Result<()> {
        self.0.execute(
            "INSERT INTO moves (op_id, seq, file_id, name, from_path, to_path, status, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![op_id, seq as i64, m.file_id, m.name, m.from, m.to, m.status, m.note],
        )?;
        Ok(())
    }

    pub fn update_move(&self, op_id: &str, seq: usize, m: &MoveRecord, fp: Option<(u64, i64)>) -> rusqlite::Result<()> {
        self.0.execute(
            "UPDATE moves SET status = ?3, note = ?4, to_path = ?5, size = COALESCE(?6, size), mtime = COALESCE(?7, mtime) WHERE op_id = ?1 AND seq = ?2",
            params![op_id, seq as i64, m.status, m.note, m.to, fp.map(|f| f.0 as i64), fp.map(|f| f.1)],
        )?;
        Ok(())
    }

    pub fn finish(&self, op: &Operation) -> rusqlite::Result<()> {
        self.0.execute(
            "UPDATE operations SET status = ?2, errors = ?3, folders_created = ?4, undone_at = ?5 WHERE id = ?1",
            params![op.id, op.status, serde_json::to_string(&op.errors).unwrap(), serde_json::to_string(&op.folders_created).unwrap(), op.undone_at],
        )?;
        Ok(())
    }

    pub fn add_managed(&self, op_id: &str, paths: &[String]) -> rusqlite::Result<()> {
        for p in paths {
            self.0.execute("INSERT OR IGNORE INTO managed (path, op_id) VALUES (?1, ?2)", params![p, op_id])?;
        }
        Ok(())
    }

    pub fn remove_managed(&self, op_id: &str) -> rusqlite::Result<()> {
        self.0.execute("DELETE FROM managed WHERE op_id = ?1", params![op_id])?;
        Ok(())
    }

    pub fn remember_allowed(&self, path: &str) -> rusqlite::Result<()> {
        self.0.execute("INSERT OR IGNORE INTO allowed (path) VALUES (?1)", params![path])?;
        Ok(())
    }

    pub fn allowed(&self) -> rusqlite::Result<Vec<String>> {
        let mut st = self.0.prepare("SELECT path FROM allowed")?;
        let v = st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        Ok(v)
    }

    /// Huella guardada de un movimiento (tamaño, mtime) tras completarse.
    pub fn move_fingerprint(&self, op_id: &str, file_id: &str) -> rusqlite::Result<Option<(u64, i64)>> {
        self.0
            .query_row(
                "SELECT size, mtime FROM moves WHERE op_id = ?1 AND file_id = ?2 AND size IS NOT NULL",
                params![op_id, file_id],
                |r| Ok((r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)?)),
            )
            .optional()
    }

    pub fn operation(&self, id: &str) -> rusqlite::Result<Option<Operation>> {
        let row = self
            .0
            .query_row(
                "SELECT id, kind, created_at, source, destination, status, errors, folders_created, undone_at FROM operations WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Operation {
                        id: r.get(0)?,
                        kind: r.get(1)?,
                        created_at: r.get(2)?,
                        source: r.get(3)?,
                        destination: r.get(4)?,
                        status: r.get(5)?,
                        errors: serde_json::from_str(&r.get::<_, String>(6)?).unwrap_or_default(),
                        folders_created: serde_json::from_str(&r.get::<_, String>(7)?).unwrap_or_default(),
                        undone_at: r.get(8)?,
                        moves: vec![],
                    })
                },
            )
            .optional()?;
        let Some(mut op) = row else { return Ok(None) };
        let mut st = self.0.prepare("SELECT file_id, name, from_path, to_path, status, note FROM moves WHERE op_id = ?1 ORDER BY seq")?;
        op.moves = st
            .query_map(params![id], |r| {
                Ok(MoveRecord { file_id: r.get(0)?, name: r.get(1)?, from: r.get(2)?, to: r.get(3)?, status: r.get(4)?, note: r.get(5)? })
            })?
            .collect::<Result<_, _>>()?;
        Ok(Some(op))
    }

    pub fn snapshot(&self, limit: usize) -> rusqlite::Result<HistorySnapshot> {
        let ids: Vec<String> = {
            let mut st = self.0.prepare("SELECT id FROM operations ORDER BY created_at DESC LIMIT ?1")?;
            let v = st.query_map(params![limit as i64], |r| r.get(0))?.collect::<Result<_, _>>()?;
            v
        };
        let mut operations = Vec::new();
        for id in ids {
            if let Some(op) = self.operation(&id)? {
                operations.push(op);
            }
        }
        let mut st = self.0.prepare("SELECT path FROM managed")?;
        let managed = st.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
        Ok(HistorySnapshot { operations, managed })
    }

    /// Repara operaciones que quedaron a medias por un cierre inesperado.
    pub fn recover(&self) -> rusqlite::Result<()> {
        let pending: Vec<(String, i64, String, String)> = {
            let mut st = self.0.prepare(
                "SELECT m.op_id, m.seq, m.from_path, m.to_path FROM moves m JOIN operations o ON o.id = m.op_id WHERE o.status = 'in_progress' AND m.status = 'pending'",
            )?;
            let v = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?.collect::<Result<_, _>>()?;
            v
        };
        for (op, seq, from, to) in pending {
            let done = Path::new(&to).exists() && !Path::new(&from).exists();
            let (status, note) = if done { ("moved", "Completado antes de un cierre inesperado") } else { ("failed", "Interrumpido por un cierre inesperado; el archivo no se movió") };
            self.0.execute("UPDATE moves SET status = ?3, note = ?4 WHERE op_id = ?1 AND seq = ?2", params![op, seq, status, note])?;
        }
        self.0.execute(
            "UPDATE operations SET status = 'partial', errors = json_insert(errors, '$[#]', 'La operación se interrumpió. Revisa los movimientos; puedes deshacer los completados.') WHERE status = 'in_progress'",
            [],
        )?;
        Ok(())
    }
}
