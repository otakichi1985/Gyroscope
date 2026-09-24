use std::time::Duration;

use reqwest::{Client, StatusCode};

use crate::error::{AppError, AppResult};

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

pub async fn fetch_conditional(
    client: &Client,
    url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
) -> AppResult<FetchOutcome> {
    fetch_with_retry_policy(client, url, etag, last_modified, false).await
}

pub async fn fetch_youtube_feed(client: &Client, url: &str) -> AppResult<FetchOutcome> {
    // YouTubeのRSSは有効なチャンネルでも一時的に404を返すため、この経路だけ再試行する。
    fetch_with_retry_policy(client, url, None, None, true).await
}

async fn fetch_with_retry_policy(
    client: &Client,
    url: &str,
    etag: Option<&str>,
    last_modified: Option<&str>,
    retry_not_found: bool,
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
            Ok(response)
                if attempt < MAX_ATTEMPTS
                    && (response.status().is_server_error()
                        || (retry_not_found && response.status() == StatusCode::NOT_FOUND)) =>
            {
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

fn header_string(
    response: &reqwest::Response,
    name: reqwest::header::HeaderName,
) -> Option<String> {
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

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::TcpListener;

    use super::*;

    #[tokio::test]
    async fn youtube_feed_retries_a_temporary_not_found() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/feed", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            for status in ["404 Not Found", "200 OK"] {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0u8; 1024];
                stream.read(&mut request).unwrap();
                let body = if status == "200 OK" { "ok" } else { "" };
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
        });

        let result = fetch_youtube_feed(&Client::new(), &url).await.unwrap();
        server.join().unwrap();
        match result {
            FetchOutcome::Fetched { body, .. } => assert_eq!(body, b"ok"),
            FetchOutcome::NotModified => panic!("unexpected 304"),
        }
    }
}
