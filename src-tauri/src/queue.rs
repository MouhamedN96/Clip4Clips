// Clip queue management — local rendering pipeline
// Coordinates yt-dlp download → AI highlight scoring → ffmpeg cut

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct QueueEntry {
    pub id: String,
    pub source_url: String,
    pub status: QueueStatus,
    pub progress: f32,
}

#[derive(Serialize, Deserialize, PartialEq)]
pub enum QueueStatus {
    Queued,
    Downloading,
    Scoring,
    Rendering,
    Complete,
    Failed,
}

pub struct RenderQueue {
    entries: Vec<QueueEntry>,
}

impl RenderQueue {
    pub fn new() -> Self {
        Self { entries: Vec::new() }
    }

    pub fn add(&mut self, id: &str, source_url: &str) {
        self.entries.push(QueueEntry {
            id: id.to_string(),
            source_url: source_url.to_string(),
            status: QueueStatus::Queued,
            progress: 0.0,
        });
    }

    pub fn update(&mut self, id: &str, status: QueueStatus, progress: f32) {
        if let Some(e) = self.entries.iter_mut().find(|e| e.id == id) {
            e.status = status;
            e.progress = progress;
        }
    }

    pub fn pending(&self) -> usize {
        self.entries.iter().filter(|e| e.status != QueueStatus::Complete && e.status != QueueStatus::Failed).count()
    }

    pub fn list(&self) -> &[QueueEntry] {
        &self.entries
    }
}