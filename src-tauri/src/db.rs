// Local SQLite database — clip queue, client config, analytics
// Replaces the VPS Postgres for offline operation

use chrono::Utc;
use rusqlite::{params, types::Type, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use std::{
    fmt,
    path::Path,
    sync::{Mutex, MutexGuard},
};
use uuid::Uuid;

use crate::commands::Clip;

pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug)]
pub enum TransitionError {
    Database(rusqlite::Error),
    ClipNotFound {
        clip_id: String,
    },
    InvalidState {
        clip_id: String,
        current_status: String,
        target_status: &'static str,
    },
}

impl fmt::Display for TransitionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Database(error) => write!(formatter, "database error: {error}"),
            Self::ClipNotFound { clip_id } => write!(formatter, "clip '{clip_id}' was not found"),
            Self::InvalidState {
                clip_id,
                current_status,
                target_status,
            } => write!(
                formatter,
                "clip '{clip_id}' cannot transition from '{current_status}' to '{target_status}'; expected 'pending_review'"
            ),
        }
    }
}

impl std::error::Error for TransitionError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Database(error) => Some(error),
            Self::ClipNotFound { .. } | Self::InvalidState { .. } => None,
        }
    }
}

impl From<rusqlite::Error> for TransitionError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

#[derive(Serialize, Deserialize)]
pub struct Analytics {
    pub total_clips: usize,
    pub approved: usize,
    pub posted: usize,
    pub pending: usize,
    pub today_count: usize,
}

impl Database {
    pub fn init(path: &Path) -> Result<Self, Box<dyn std::error::Error>> {
        if path != Path::new(":memory:") {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
        }

        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS clips (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                source_url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                thumbnail TEXT,
                duration REAL,
                platforms TEXT DEFAULT '[]',
                created_at TEXT NOT NULL,
                rendered_at TEXT,
                posted_at TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_clips_status ON clips(status);
            ",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn get_review_queue(&self) -> rusqlite::Result<crate::commands::ReviewQueue> {
        let pending = self.query_clips(
            "SELECT * FROM clips WHERE status = 'pending_review' ORDER BY created_at DESC",
        )?;
        let approved = self.query_clips(
            "SELECT * FROM clips WHERE status = 'approved' ORDER BY created_at DESC",
        )?;
        let posted = self.query_clips(
            "SELECT * FROM clips WHERE status = 'posted' ORDER BY created_at DESC LIMIT 20",
        )?;
        Ok(crate::commands::ReviewQueue {
            pending,
            approved,
            posted,
        })
    }

    pub fn approve_clip(&self, clip_id: &str, platforms: &[String]) -> Result<(), TransitionError> {
        let platforms = serialize_platforms(platforms)?;
        let conn = self.connection();
        let changed = conn.execute(
            "UPDATE clips SET status = 'approved', platforms = ? WHERE id = ? AND status = 'pending_review'",
            params![platforms, clip_id],
        )?;
        Self::validate_transition(&conn, changed, clip_id, "approved")
    }

    pub fn reject_clip(&self, clip_id: &str, _reason: &str) -> Result<(), TransitionError> {
        let conn = self.connection();
        let changed = conn.execute(
            "UPDATE clips SET status = 'rejected' WHERE id = ? AND status = 'pending_review'",
            params![clip_id],
        )?;
        Self::validate_transition(&conn, changed, clip_id, "rejected")
    }

    pub fn queue_clip(&self, source_url: &str, title: &str) -> rusqlite::Result<String> {
        let id = format!("clip_{}", Uuid::new_v4());
        self.connection().execute(
            "INSERT INTO clips (id, title, source_url, status, platforms, created_at) VALUES (?, ?, ?, 'pending', '[]', ?)",
            params![id, title, source_url, Utc::now().to_rfc3339()],
        )?;
        Ok(id)
    }

    pub fn get_clip_status(&self, clip_id: &str) -> rusqlite::Result<Clip> {
        let conn = self.connection();
        let mut stmt = conn.prepare("SELECT * FROM clips WHERE id = ?")?;
        stmt.query_row(params![clip_id], clip_from_row)
    }

    pub fn sync_clips(&self, clips: Vec<Clip>) -> rusqlite::Result<usize> {
        let conn = self.connection();
        let mut count = 0;
        for clip in clips {
            let platforms = serialize_platforms(&clip.platforms)?;
            conn.execute(
                "INSERT OR IGNORE INTO clips (id, title, source_url, status, platforms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                params![clip.id, clip.title, clip.source_url, clip.status,
                        platforms, clip.created_at],
            )?;
            count += 1;
        }
        Ok(count)
    }

    pub fn get_analytics(&self) -> rusqlite::Result<Analytics> {
        let conn = self.connection();
        let total: usize = conn.query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0))?;
        let approved: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE status = 'approved'",
            [],
            |r| r.get(0),
        )?;
        let posted: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE status = 'posted'",
            [],
            |r| r.get(0),
        )?;
        let pending: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE status = 'pending_review'",
            [],
            |r| r.get(0),
        )?;
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let today_count: usize = conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE created_at LIKE ?",
            [&format!("{}%", today)],
            |r| r.get(0),
        )?;
        Ok(Analytics {
            total_clips: total,
            approved,
            posted,
            pending,
            today_count,
        })
    }

    fn query_clips(&self, sql: &str) -> rusqlite::Result<Vec<Clip>> {
        let conn = self.connection();
        let mut stmt = conn.prepare(sql)?;
        let clips = stmt.query_map([], clip_from_row)?;
        clips.collect()
    }

    fn validate_transition(
        conn: &Connection,
        changed: usize,
        clip_id: &str,
        target_status: &'static str,
    ) -> Result<(), TransitionError> {
        if changed == 1 {
            return Ok(());
        }

        let current_status = conn
            .query_row(
                "SELECT status FROM clips WHERE id = ?",
                params![clip_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        match current_status {
            Some(current_status) => Err(TransitionError::InvalidState {
                clip_id: clip_id.to_string(),
                current_status,
                target_status,
            }),
            None => Err(TransitionError::ClipNotFound {
                clip_id: clip_id.to_string(),
            }),
        }
    }

    fn connection(&self) -> MutexGuard<'_, Connection> {
        self.conn
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    #[cfg(test)]
    fn set_clip_status(&self, clip_id: &str, status: &str) -> rusqlite::Result<()> {
        self.connection().execute(
            "UPDATE clips SET status = ? WHERE id = ?",
            params![status, clip_id],
        )?;
        Ok(())
    }
}

fn serialize_platforms(platforms: &[String]) -> rusqlite::Result<String> {
    serde_json::to_string(platforms)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn clip_from_row(row: &Row<'_>) -> rusqlite::Result<Clip> {
    let platforms_json: Option<String> = row.get(6)?;
    let platforms = match platforms_json {
        Some(json) => serde_json::from_str(&json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(6, Type::Text, Box::new(error))
        })?,
        None => Vec::new(),
    };

    Ok(Clip {
        id: row.get(0)?,
        title: row.get(1)?,
        source_url: row.get(2)?,
        status: row.get(3)?,
        thumbnail: row.get(4)?,
        duration: row.get(5)?,
        platforms,
        created_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::Database;
    use std::{fs, path::PathBuf};

    fn test_database_path(name: &str) -> PathBuf {
        std::env::temp_dir()
            .join(format!("clip4clicks-{name}-{}", std::process::id()))
            .join("state")
            .join("clip4clicks.db")
    }

    #[test]
    fn initializes_missing_parent_directory_and_persists_clip_state() {
        let path = test_database_path("persistence");

        let database = Database::init(&path).expect("database initializes");
        let clip_id = database
            .queue_clip("https://example.com/video", "Launch clip")
            .expect("clip queues");
        drop(database);

        let reopened = Database::init(&path).expect("database reopens");
        let clip = reopened.get_clip_status(&clip_id).expect("clip persists");
        assert_eq!(clip.title, "Launch clip");
        assert_eq!(clip.status, "pending");
        drop(reopened);

        fs::remove_dir_all(path.parent().unwrap().parent().unwrap())
            .expect("test directory is removed");
    }

    #[test]
    fn approval_moves_only_a_reviewed_clip_to_approved() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");
        let clip_id = database
            .queue_clip("https://example.com/video", "Review me")
            .expect("clip queues");
        database
            .set_clip_status(&clip_id, "pending_review")
            .expect("clip enters review");

        database
            .approve_clip(&clip_id, &["youtube".to_string()])
            .expect("clip approval succeeds");

        let queue = database.get_review_queue().expect("review queue loads");
        assert!(queue.pending.is_empty());
        assert_eq!(queue.approved.len(), 1);
        assert_eq!(queue.approved[0].platforms, vec!["youtube"]);
    }

    #[test]
    fn approval_rejects_queued_rejected_posted_and_missing_clips() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");

        for status in ["pending", "approved", "rejected", "posted"] {
            let clip_id = database
                .queue_clip("https://example.com/video", status)
                .expect("clip queues");
            database
                .set_clip_status(&clip_id, status)
                .expect("test status is set");

            assert!(database
                .approve_clip(&clip_id, &["youtube".to_string()])
                .is_err());
            assert_eq!(
                database
                    .get_clip_status(&clip_id)
                    .expect("clip remains readable")
                    .status,
                status
            );
        }

        assert!(database
            .approve_clip("missing", &["youtube".to_string()])
            .is_err());
    }

    #[test]
    fn rejection_rejects_queued_rejected_posted_and_missing_clips() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");

        for status in ["pending", "approved", "rejected", "posted"] {
            let clip_id = database
                .queue_clip("https://example.com/video", status)
                .expect("clip queues");
            database
                .set_clip_status(&clip_id, status)
                .expect("test status is set");

            assert!(database.reject_clip(&clip_id, "not suitable").is_err());
            assert_eq!(
                database
                    .get_clip_status(&clip_id)
                    .expect("clip remains readable")
                    .status,
                status
            );
        }

        assert!(database.reject_clip("missing", "not found").is_err());
    }

    #[test]
    fn rejection_moves_only_a_reviewed_clip_to_rejected() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");
        let clip_id = database
            .queue_clip("https://example.com/video", "Reject me")
            .expect("clip queues");
        database
            .set_clip_status(&clip_id, "pending_review")
            .expect("clip enters review");

        database
            .reject_clip(&clip_id, "not suitable")
            .expect("clip rejection succeeds");

        assert_eq!(
            database
                .get_clip_status(&clip_id)
                .expect("clip remains readable")
                .status,
            "rejected"
        );
    }

    #[test]
    fn malformed_platforms_json_is_not_silently_replaced() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");
        let clip_id = database
            .queue_clip("https://example.com/video", "Malformed platforms")
            .expect("clip queues");
        database
            .connection()
            .execute(
                "UPDATE clips SET platforms = ? WHERE id = ?",
                rusqlite::params!["{not-json", clip_id],
            )
            .expect("malformed test fixture is stored");

        assert!(database.get_clip_status(&clip_id).is_err());
    }

    #[test]
    fn sqlite_type_errors_are_not_silently_replaced_with_null() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");
        let clip_id = database
            .queue_clip("https://example.com/video", "Bad thumbnail")
            .expect("clip queues");
        database
            .connection()
            .execute(
                "UPDATE clips SET thumbnail = ? WHERE id = ?",
                rusqlite::params![vec![0_u8, 1_u8], clip_id],
            )
            .expect("invalid test fixture is stored");

        assert!(database.get_clip_status(&clip_id).is_err());
    }

    #[test]
    fn queued_clip_ids_are_unique_uuid_v4_values() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");
        let first = database
            .queue_clip("https://example.com/one", "One")
            .expect("first clip queues");
        let second = database
            .queue_clip("https://example.com/two", "Two")
            .expect("second clip queues");

        assert_ne!(first, second);
        for clip_id in [first, second] {
            let uuid = uuid::Uuid::parse_str(
                clip_id
                    .strip_prefix("clip_")
                    .expect("clip ID has the expected prefix"),
            )
            .expect("clip ID contains a UUID");
            assert_eq!(uuid.get_version(), Some(uuid::Version::Random));
        }
    }

    #[test]
    fn null_optional_columns_are_preserved_without_hiding_type_errors() {
        let database = Database::init(std::path::Path::new(":memory:"))
            .expect("in-memory database initializes");
        let clip_id = database
            .queue_clip("https://example.com/video", "Nullable fields")
            .expect("clip queues");
        database
            .connection()
            .execute(
                "UPDATE clips SET platforms = NULL WHERE id = ?",
                rusqlite::params![clip_id],
            )
            .expect("null fixture is stored");

        let clip = database
            .get_clip_status(&clip_id)
            .expect("null optional columns decode");
        assert_eq!(clip.thumbnail, None);
        assert_eq!(clip.duration, None);
        assert!(clip.platforms.is_empty());
    }
}
