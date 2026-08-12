use std::time::Duration;

use reqwest::{Client, StatusCode};

use crate::error::{AppError, AppResult};

/// SPEC §2.2: identify the app explicitly to servers we poll.
pub const USER_AGENT: &str = concat!(
    "Gyroscope/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/<user>/gyroscope)"
);

const TIMEOUT: Duration = Duration::from_secs(15);
const MAX_ATTEMPTS: u32 = 3;

pub fn build_client() -> AppResult<Client> {
    Client::builder()
        .user_agent(USER_AGENT)
        .timeout(TIMEOUT)
        .build()
        .map_err(AppError::Network)
}

pub enum FetchOutcome {
    NotModified,
    Fetched {
        body: Vec<u8>,
        etag: Option<String>,
        last_modified: Option<String>,
    },
}

/// GETs `url`, sending `If-None-Match`/`If-Modified-Since` when previous
/// cache validators are available (SPEC §2.2). Retries transient failures
/// (timeouts, connection errors, 5xx) with exponential backoff, up to
/// `MAX_ATTEMPTS` total tries. gzip/brotli decoding is handled transparently
/// by reqwest (feature-enabled in Cargo.toml), no code needed here.
pub async fn fetch_conditional(
    client: &Client,
    url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> AppResult<FetchOutcome> {
    let mut attempt = 0u32;
    loop {
        attempt += 1;

        let mut request = client.get(url);
        if let Some(etag) = etag {
            request = request.header(reqwest::header::IF_NONE_MATCH, etag);
        }
        if let Some(last_modified) = last_modified {
            request = request.header(reqwest::header::IF_MODIFIED_SINCE, last_modified);
        }

        match request.send().await {
            Ok(response) if response.status() == StatusCode::NOT_MODIFIED => {
                return Ok(FetchOutcome::NotModified);
            }
            Ok(response) if response.status().is_success() => {
                let etag = header_string(&response, reqwest::header::ETAG);
                let last_modified = header_string(&response, reqwest::header::LAST_MODIFIED);
                let body = response.bytes().await.map_err(AppError::Network)?.to_vec();
                return Ok(FetchOutcome::Fetched {
                    body,
                    etag,
                    last_modified,
                });
            }
            Ok(response) if response.status().is_server_error() && attempt < MAX_ATTEMPTS => {
                backoff(attempt).await;
            }
            Ok(response) => {
                return Err(AppError::Other(format!(
                    "HTTP {} while fetching {url}",
                    response.status()
                )));
            }
            Err(err) if attempt < MAX_ATTEMPTS && (err.is_timeout() || err.is_connect()) => {
                backoff(attempt).await;
            }
            Err(err) => return Err(AppError::Network(err)),
        }
    }
}

fn header_string(response: &reqwest::Response, name: reqwest::header::HeaderName) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
}

async fn backoff(attempt: u32) {
    let millis = 500u64 * 2u64.pow(attempt - 1);
    tokio::time::sleep(Duration::from_millis(millis)).await;
}
