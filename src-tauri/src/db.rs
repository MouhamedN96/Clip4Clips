// Local SQLite database — clip queue, client config, analytics
// Replaces the VPS Postgres for offline operation

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use chrono::Utc;

use crate::commands::Clip;

pub struct Database {
    conn: Connection,
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
    pub fn init(path: &Path) -> rusqlite::Result<Self> {
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
            "
        )?;
        Ok(Self { conn })
    }

    pub fn get_review_queue(&self) -> rusqlite::Result<crate::commands::ReviewQueue> {
        let pending = self.query_clips("SELECT * FROM clips WHERE status = 'pending_review' ORDER BY created_at DESC")?;
        let approved = self.query_clips("SELECT * FROM clips WHERE status = 'approved' ORDER BY created_at DESC")?;
        let posted = self.query_clips("SELECT * FROM clips WHERE status = 'posted' ORDER BY created_at DESC LIMIT 20")?;
        Ok(crate::commands::ReviewQueue { pending, approved, posted })
    }

    pub fn approve_clip(&self, clip_id: &str, platforms: &[String]) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE clips SET status = 'approved', platforms = ? WHERE id = ?",
            params![serde_json::to_string(platforms).unwrap_or_default(), clip_id],
        )?;
        Ok(())
    }

    pub fn reject_clip(&self, clip_id: &str, _reason: &str) -> rusqlite::Result<()> {
        self.conn.execute(
            "UPDATE clips SET status = 'rejected' WHERE id = ?",
            params![clip_id],
        )?;
        Ok(())
    }

    pub fn queue_clip(&self, source_url: &str, title: &str) -> rusqlite::Result<String> {
        let id = format!("clip_{}", Utc::now().timestamp_millis());
        self.conn.execute(
            "INSERT INTO clips (id, title, source_url, status, platforms, created_at) VALUES (?, ?, ?, 'pending', '[]', ?)",
            params![id, title, source_url, Utc::now().to_rfc3339()],
        )?;
        Ok(id)
    }

    pub fn get_clip_status(&self, clip_id: &str) -> rusqlite::Result<Clip> {
        let mut stmt = self.conn.prepare("SELECT * FROM clips WHERE id = ?")?;
        stmt.query_row(params![clip_id], |row| {
            Ok(Clip {
                id: row.get(0)?,
                title: row.get(1)?,
                source_url: row.get(2)?,
                status: row.get(3)?,
                thumbnail: row.get(4).ok(),
                duration: row.get(5).ok(),
                platforms: serde_json::from_str(row.get::<_, String>(6).unwrap_or_default().as_str()).unwrap_or_default(),
                created_at: row.get(7)?,
            })
        })
    }

    pub fn sync_clips(&self, clips: Vec<Clip>) -> rusqlite::Result<usize> {
        let mut count = 0;
        for clip in clips {
            self.conn.execute(
                "INSERT OR IGNORE INTO clips (id, title, source_url, status, platforms, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                params![clip.id, clip.title, clip.source_url, clip.status,
                        serde_json::to_string(&clip.platforms).unwrap_or_default(), clip.created_at],
            )?;
            count += 1;
        }
        Ok(count)
    }

    pub fn get_analytics(&self) -> rusqlite::Result<Analytics> {
        let total: usize = self.conn.query_row("SELECT COUNT(*) FROM clips", [], |r| r.get(0))?;
        let approved: usize = self.conn.query_row("SELECT COUNT(*) FROM clips WHERE status = 'approved'", [], |r| r.get(0))?;
        let posted: usize = self.conn.query_row("SELECT COUNT(*) FROM clips WHERE status = 'posted'", [], |r| r.get(0))?;
        let pending: usize = self.conn.query_row("SELECT COUNT(*) FROM clips WHERE status = 'pending_review'", [], |r| r.get(0))?;
        let today = Utc::now().format("%Y-%m-%d").to_string();
        let today_count: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM clips WHERE created_at LIKE ?", [&format!("{}%", today)], |r| r.get(0)
        )?;
        Ok(Analytics { total_clips: total, approved, posted, pending, today_count })
    }

    fn query_clips(&self, sql: &str) -> rusqlite::Result<Vec<Clip>> {
        let mut stmt = self.conn.prepare(sql)?;
        let clips = stmt.query_map([], |row| {
            Ok(Clip {
                id: row.get(0)?,
                title: row.get(1)?,
                source_url: row.get(2)?,
                status: row.get(3)?,
                thumbnail: row.get(4).ok(),
                duration: row.get(5).ok(),
                platforms: serde_json::from_str(row.get::<_, String>(6).unwrap_or_default().as_str()).unwrap_or_default(),
                created_at: row.get(7)?,
            })
        })?;
        clips.collect()
    }
}