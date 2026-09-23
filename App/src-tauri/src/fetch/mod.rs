pub mod article;
pub mod booth;
pub mod client;
pub mod discovery;
pub mod favicon;
pub mod youtube;

pub struct HttpClient(pub reqwest::Client);
