pub mod client;
pub mod discovery;

/// App-managed shared `reqwest::Client` (connection pooling, single place
/// the User-Agent/timeout config lives).
pub struct HttpClient(pub reqwest::Client);
