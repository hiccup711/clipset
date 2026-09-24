use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub type Result<T> = std::result::Result<T, String>;
const MAX_BYTES: i64 = 128 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub shortcut: String,
    pub enter_action: String,
    pub double_click_action: String,
    pub history_limit: usize,
    pub paused: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            shortcut: "CommandOrControl+Shift+V".into(),
            enter_action: "paste".into(),
            double_click_action: "paste".into(),
            history_limit: 500,
            paused: false,
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<()> {
        if ![100, 500, 1000, 5000].contains(&self.history_limit) {
            return Err("历史数量无效".into());
        }
        if !["copy", "paste"].contains(&self.enter_action.as_str())
            || !["copy", "paste"].contains(&self.double_click_action.as_str())
        {
            return Err("操作设置无效".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Payload {
    pub kind: String,
    pub content: String,
    pub preview: String,
    #[serde(default)]
    pub width: u32,
    #[serde(default)]
    pub height: u32,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: i64,
    pub kind: String,
    pub preview: String,
    pub source: String,
    pub created_at: i64,
    pub pinned: bool,
    pub char_count: usize,
    pub width: u32,
    pub height: u32,
}
pub struct Store {
    db: Connection,
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let db = Connection::open(path).map_err(|e| e.to_string())?;
        Self::init(db)
    }
    fn init(db: Connection) -> Result<Self> {
        db.execute_batch("PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON;
        CREATE TABLE IF NOT EXISTS entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, content TEXT NOT NULL,
            preview TEXT NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0, char_count INTEGER NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS entries_time ON entries(created_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);").map_err(|e|e.to_string())?;
        Ok(Self { db })
    }
    pub fn settings(&self) -> Result<Settings> {
        use rusqlite::OptionalExtension;
        let value: Option<String> = self
            .db
            .query_row("SELECT value FROM settings WHERE id=1", [], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        match value {
            Some(v) => serde_json::from_str(&v).map_err(|e| format!("设置文件无法读取：{e}")),
            None => Ok(Settings::default()),
        }
    }
    pub fn save_settings(&mut self, settings: &Settings) -> Result<()> {
        settings.validate()?;
        let tx = self.db.transaction().map_err(|e| e.to_string())?;
        let json = serde_json::to_string(settings).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO settings(id,value) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET value=excluded.value",[json]).map_err(|e|e.to_string())?;
        Self::prune(&tx, settings.history_limit)?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn insert(&mut self, payload: &Payload, source: &str, limit: usize) -> Result<()> {
        if !["text", "image", "files"].contains(&payload.kind.as_str()) {
            return Err("不支持的内容类型".into());
        }
        if payload.content.trim().is_empty() {
            return Ok(());
        }
        if payload.content.len() > 24 * 1024 * 1024 {
            return Err("内容超过 24 MB，未保存".into());
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as i64;
        let tx = self.db.transaction().map_err(|e| e.to_string())?;
        use rusqlite::OptionalExtension;
        let existing: Option<i64> = tx
            .query_row(
                "SELECT id FROM entries WHERE kind=?1 AND content=?2",
                params![payload.kind, payload.content],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(id) = existing {
            tx.execute(
                "UPDATE entries SET created_at=?1,source=?2 WHERE id=?3",
                params![now, source, id],
            )
            .map_err(|e| e.to_string())?;
        } else {
            let count = if payload.kind == "text" {
                payload.content.chars().count()
            } else {
                0
            };
            tx.execute("INSERT INTO entries(kind,content,preview,source,created_at,char_count,width,height) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",params![payload.kind,payload.content,payload.preview,source,now,count,payload.width,payload.height]).map_err(|e|e.to_string())?;
        }
        Self::prune(&tx, limit)?;
        tx.commit().map_err(|e| e.to_string())
    }
    fn prune(db: &Connection, limit: usize) -> Result<()> {
        // Favorites survive automatic pruning; explicit clear removes everything.
        db.execute("DELETE FROM entries WHERE pinned=0 AND id NOT IN (SELECT id FROM entries WHERE pinned=0 ORDER BY created_at DESC,id DESC LIMIT ?1)",[limit]).map_err(|e|e.to_string())?;
        let mut size: i64 = db.query_row("SELECT COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(preview AS BLOB))),0) FROM entries",[],|r|r.get(0)).map_err(|e|e.to_string())?;
        while size > MAX_BYTES {
            let changed = db.execute("DELETE FROM entries WHERE id=(SELECT id FROM entries WHERE pinned=0 ORDER BY created_at,id LIMIT 1)",[]).map_err(|e|e.to_string())?;
            if changed == 0 {
                break;
            }
            size = db.query_row("SELECT COALESCE(SUM(length(CAST(content AS BLOB))+length(CAST(preview AS BLOB))),0) FROM entries",[],|r|r.get(0)).map_err(|e|e.to_string())?;
        }
        Ok(())
    }
    pub fn list(&self, query: &str, filter: &str) -> Result<Vec<Entry>> {
        // instr gives literal search: '%' and '_' aren't wildcard operators.
        let mut stmt = self.db.prepare("SELECT id,kind,preview,source,created_at,pinned,char_count,width,height FROM entries
          WHERE (?1='all' OR kind=?1 OR (?1='pinned' AND pinned=1))
          AND (?2='' OR instr(lower(CASE WHEN kind='image' THEN source ELSE content || ' ' || preview || ' ' || source END),lower(?2))>0)
          ORDER BY created_at DESC,id DESC").map_err(|e|e.to_string())?;
        let rows = stmt
            .query_map(params![filter, query], |r| {
                Ok(Entry {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    preview: r.get(2)?,
                    source: r.get(3)?,
                    created_at: r.get(4)?,
                    pinned: r.get(5)?,
                    char_count: r.get(6)?,
                    width: r.get(7)?,
                    height: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<std::result::Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
    pub fn content(&self, id: i64) -> Result<Payload> {
        self.db
            .query_row(
                "SELECT kind,content,preview,width,height FROM entries WHERE id=?1",
                [id],
                |r| {
                    Ok(Payload {
                        kind: r.get(0)?,
                        content: r.get(1)?,
                        preview: r.get(2)?,
                        width: r.get(3)?,
                        height: r.get(4)?,
                    })
                },
            )
            .map_err(|_| "这条记录已被删除".into())
    }
    pub fn delete(&self, id: i64) -> Result<()> {
        self.db
            .execute("DELETE FROM entries WHERE id=?1", [id])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    pub fn clear(&self) -> Result<()> {
        self.db
            .execute("DELETE FROM entries", [])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    pub fn pin(&self, id: i64) -> Result<()> {
        let pinned_count: usize = self
            .db
            .query_row("SELECT COUNT(*) FROM entries WHERE pinned=1", [], |r| {
                r.get(0)
            })
            .map_err(|e| e.to_string())?;
        let pinned: bool = self
            .db
            .query_row("SELECT pinned FROM entries WHERE id=?1", [id], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if !pinned && pinned_count >= 100 {
            return Err("最多收藏 100 条，请先取消部分收藏".into());
        }
        self.db
            .execute("UPDATE entries SET pinned=1-pinned WHERE id=?1", [id])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    pub fn counts(&self) -> Result<(usize, usize)> {
        self.db
            .query_row(
                "SELECT COUNT(*),COALESCE(SUM(pinned),0) FROM entries",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn memory() -> Store {
        Store::init(Connection::open_in_memory().unwrap()).unwrap()
    }
    fn text(s: &str) -> Payload {
        Payload {
            kind: "text".into(),
            content: s.into(),
            preview: s.into(),
            width: 0,
            height: 0,
        }
    }
    #[test]
    fn dedup_preserves_favorite_and_updates_source() {
        let mut s = memory();
        s.insert(&text("你好"), "Notes", 100).unwrap();
        let id = s.list("", "all").unwrap()[0].id;
        s.pin(id).unwrap();
        s.insert(&text("你好"), "Safari", 100).unwrap();
        let rows = s.list("", "all").unwrap();
        assert_eq!(rows.len(), 1);
        assert!(rows[0].pinned);
        assert_eq!(rows[0].source, "Safari");
        assert_eq!(rows[0].char_count, 2);
    }
    #[test]
    fn pruning_keeps_favorites_and_clear_removes_them() {
        let mut s = memory();
        s.insert(&text("keep"), "Notes", 2).unwrap();
        s.pin(s.list("", "all").unwrap()[0].id).unwrap();
        for v in ["a", "b", "c"] {
            s.insert(&text(v), "Notes", 2).unwrap();
        }
        assert_eq!(s.counts().unwrap(), (3, 1));
        assert_eq!(s.list("keep", "pinned").unwrap().len(), 1);
        s.clear().unwrap();
        assert_eq!(s.counts().unwrap(), (0, 0));
    }
    #[test]
    fn search_is_literal_and_respects_type() {
        let mut s = memory();
        s.insert(&text("100%_done"), "Notes", 100).unwrap();
        s.insert(&text("another"), "Notes", 100).unwrap();
        assert_eq!(s.list("%_", "text").unwrap().len(), 1);
        assert!(s.list("%_", "image").unwrap().is_empty());
    }
    #[test]
    fn file_names_are_searchable_even_when_urls_are_encoded() {
        let mut s = memory();
        let p = Payload {
            kind: "files".into(),
            content: "[\"file:///tmp/%E4%BA%A7%E5%93%81.md\"]".into(),
            preview: "产品.md".into(),
            width: 0,
            height: 0,
        };
        s.insert(&p, "Finder", 100).unwrap();
        assert_eq!(s.list("产品", "files").unwrap().len(), 1);
    }
    #[test]
    fn settings_and_records_persist() {
        let path = std::env::temp_dir().join(format!("copyy-test-{}.db", std::process::id()));
        {
            let mut s = Store::open(&path).unwrap();
            let prefs = Settings {
                paused: true,
                shortcut: "DoubleTap:Option".into(),
                ..Settings::default()
            };
            s.save_settings(&prefs).unwrap();
            s.insert(&text("persist"), "Test", 100).unwrap();
        }
        {
            let s = Store::open(&path).unwrap();
            assert!(s.settings().unwrap().paused);
            assert_eq!(s.settings().unwrap().shortcut, "DoubleTap:Option");
            assert_eq!(s.counts().unwrap().0, 1);
        }
        std::fs::remove_file(path).unwrap();
    }
}
