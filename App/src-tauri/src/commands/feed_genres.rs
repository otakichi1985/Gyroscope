use rusqlite::{params, Connection};
use tauri::State;

use crate::db::Db;
use crate::error::{AppError, AppResult};

const KNOWN_GENRES_KEY: &str = "known_genres";

fn read_known_genres(conn: &Connection) -> AppResult<Vec<String>> {
    Ok(crate::db::settings::get(conn, KNOWN_GENRES_KEY)?
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default())
}

fn write_known_genres(conn: &Connection, names: &[String]) -> AppResult<()> {
    let json = serde_json::to_string(names).expect("Vec<String> always serializes");
    crate::db::settings::set(conn, KNOWN_GENRES_KEY, &json)?;
    Ok(())
}

#[tauri::command]
pub fn list_genres(db: State<'_, Db>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    let mut set: std::collections::BTreeSet<String> = read_known_genres(&conn)?.into_iter().collect();
    let mut stmt = conn.prepare("SELECT DISTINCT folder FROM feeds WHERE folder IS NOT NULL")?;
    let used: Vec<String> = stmt.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
    set.extend(used);
    Ok(set.into_iter().collect())
}

#[tauri::command]
pub fn create_genre(db: State<'_, Db>, name: String) -> AppResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Other("ジャンル名を入力してください".to_string()));
    }
    let conn = db.0.lock().unwrap();
    let mut names = read_known_genres(&conn)?;
    if !names.iter().any(|n| n == &name) {
        names.push(name);
        names.sort();
        write_known_genres(&conn, &names)?;
    }
    Ok(())
}

#[tauri::command]
pub fn delete_genre(db: State<'_, Db>, name: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE feeds SET folder = NULL WHERE folder = ?1", params![name])?;
    let mut names = read_known_genres(&conn)?;
    names.retain(|n| n != &name);
    write_known_genres(&conn, &names)?;
    Ok(())
}
