pub mod client;
pub mod discovery;
pub mod favicon;

/// App-managed shared `reqwest::Client` (connection pooling, single place
/// the User-Agent/timeout config lives).
pub struct HttpClient(pub reqwest::Client);
