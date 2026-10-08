pub mod adobe_apps;
pub mod clients;
pub mod diagnostics;
pub mod install;
pub mod model;
pub mod service;

pub use clients::{apply_client_config, read_client_config, ClientConfigDocument};
pub use diagnostics::get_dashboard;
pub use install::install_all_bridges;
pub use model::{ActionResult, BridgeId, Dashboard};
pub use service::{copy_indesign_plugin_token, start_indesign_proxy, stop_indesign_proxy};
