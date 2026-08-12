//! Thin key/value helpers over the `settings` table (created but unused
//! since the v1 migration). First real consumer: the read-history retention
//! setting (see `commands::settings::get_read_history_retention`).

use rusqlite::{Connection, OptionalExtension};

pub fn get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| row.get(0))
        .optional()
}

pub fn set(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn missing_key_is_none() {
        let conn = setup();
        assert_eq!(get(&conn, "nope").unwrap(), None);
    }

    #[test]
    fn set_then_get_round_trips() {
        let conn = setup();
        set(&conn, "read_history_retention_days", "30").unwrap();
        assert_eq!(get(&conn, "read_history_retention_days").unwrap(), Some("30".to_string()));
    }

    #[test]
    fn set_overwrites_existing_value() {
        let conn = setup();
        set(&conn, "k", "first").unwrap();
        set(&conn, "k", "second").unwrap();
        assert_eq!(get(&conn, "k").unwrap(), Some("second".to_string()));
    }
}
