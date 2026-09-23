use url::Url;

use crate::error::{AppError, AppResult};

pub fn validate_url(input: &str) -> AppResult<Url> {
    let url = Url::parse(input.trim()).map_err(|_| AppError::InvalidUrl(input.to_string()))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err(AppError::InvalidUrl(input.to_string())),
    }
}

pub fn is_booth_shop_host(url: &Url) -> bool {
    const NON_SHOP_SUBDOMAINS: &[&str] = &[
        "www", "s", "assets", "manage", "accounts", "admin", "api", "img",
    ];

    let Some(host) = url.host_str() else {
        return false;
    };
    match host.strip_suffix(".booth.pm") {
        Some(sub) => !sub.is_empty() && !NON_SHOP_SUBDOMAINS.contains(&sub),
        None => false,
    }
}
