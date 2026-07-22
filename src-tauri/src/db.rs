// Local SQLite database — clip queue, client config, analytics
// Replaces the VPS Postgres for offline operation

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    sync::{Mutex, MutexGuard},
};

use crate::commands::Clip;

pub struct Database {
    conn: Mutex<Connection>,
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

    pub fn approve_clip(&self, clip_id: &str, platforms: &[String]) -> rusqlite::Result<()> {
        self.connection().execute(
            "UPDATE clips SET status = 'approved', platforms = ? WHERE id = ?",
            params![
                serde_json::to_string(platforms).unwrap_or_default(),
                clip_id
            ],
        )?;
        Ok(())
    }

    pub fn reject_clip(&self, clip_id: &str, _reason: &str) -> rusqlite::Result<()> {
        self.connection().execute(
            "UPDATE clips SET status = 'rejected' WHERE id = ?",
            params![clip_id],
        )?;
        Ok(())
    }

    pub fn queue_clip(&self, source_url: &str, title: &str) -> rusqlite::Result<String> {
        let id = format!("clip_{}", Utc::now().timestamp_millis());
        self.connection().execute(
            "INSERT INTO clips (id, title, source_url, status, platforms, created_at) VALUES (?, ?, ?, 'pending', '[]', ?)",
            params![id, title, source_url, Utc::now().to_rfc3339()],
        )?;
        Ok(id)
    }

    pub fn get_clip_status(&self, clip_id: &str) -> rusqlite::Result<Clip> {
        let conn = self.connection();
        let mut stmt = conn.prepare("SELECT * FROM clips WHERE id = ?")?;
        stmt.query_row(params![clip_id], |row| {
            Ok(Clip {
                id: row.get(0)?,
                title: row.get(1)?,
                source_url: row.get(2)?,
                status: row.get(3)?,
                thumbnail: row.get(4).ok(),
                duration: row.get(5).ok(),
                platforms: serde_json::from_str(
                    row.get::<_, String>(6).unwrap_or_default().as_str(),
                )
                .unwrap_or_default(),
                created_at: row.get(7)?,
            })
        })
    }

    pub fn sync_clips(&self, clips: Vec<Clip>) -> rusqlite::Result<usize> {
        let conn = self.connection();
        let mut count = 0;
        for clip in clips {
            conn.execute(
                "INSERT OR IGNORE INTO clips (id, title, source_url, status, platforms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                params![clip.id, clip.title, clip.source_url, clip.status,
                        serde_json::to_string(&clip.platforms).unwrap_or_default(), clip.created_at],
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
        let clips = stmt.query_map([], |row| {
            Ok(Clip {
                id: row.get(0)?,
                title: row.get(1)?,
                source_url: row.get(2)?,
                status: row.get(3)?,
                thumbnail: row.get(4).ok(),
                duration: row.get(5).ok(),
                platforms: serde_json::from_str(
                    row.get::<_, String>(6).unwrap_or_default().as_str(),
                )
                .unwrap_or_default(),
                created_at: row.get(7)?,
            })
        })?;
        clips.collect()
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
}
