use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("failed to parse feed: {0}")]
    FeedParse(String),
    #[error("invalid URL: {0}")]
    InvalidUrl(String),
    #[error("no feed could be found at this address")]
    FeedNotFound,
    #[error("{0}")]
    Scrape(String),
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
