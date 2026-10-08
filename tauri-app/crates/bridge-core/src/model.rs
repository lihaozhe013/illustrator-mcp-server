use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::adobe_apps::AdobeApplication;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum BridgeId {
    Illustrator,
    Indesign,
}

impl BridgeId {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Illustrator => "illustrator",
            Self::Indesign => "indesign",
        }
    }

    #[must_use]
    pub const fn label(self) -> &'static str {
        match self {
            Self::Illustrator => "Adobe Illustrator",
            Self::Indesign => "Adobe InDesign",
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckState {
    NotInstalled,
    InstalledNotRunning,
    WaitingForPlugin,
    Connected,
    Degraded,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LayerStatus {
    pub state: CheckState,
    pub label: String,
    pub detail: String,
    pub last_verified: Option<DateTime<Utc>>,
}

impl LayerStatus {
    #[must_use]
    pub fn new(state: CheckState, detail: impl Into<String>) -> Self {
        Self {
            state,
            label: String::new(),
            detail: detail.into(),
            last_verified: Some(Utc::now()),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    pub id: BridgeId,
    pub name: String,
    pub application: LayerStatus,
    pub applications: Vec<AdobeApplication>,
    pub runtime: LayerStatus,
    pub service: LayerStatus,
    pub extension: LayerStatus,
    pub mcp: LayerStatus,
    pub version: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientStatus {
    pub id: String,
    pub name: String,
    pub state: CheckState,
    pub detail: String,
    pub config_path: Option<String>,
    pub schema: Option<String>,
    pub last_verified: Option<DateTime<Utc>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub app_version: String,
    pub architecture: String,
    pub installation: LayerStatus,
    pub bridges: Vec<BridgeStatus>,
    pub clients: Vec<ClientStatus>,
    pub last_checked: DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub ok: bool,
    pub code: String,
    pub message: String,
    pub recovery: String,
    pub last_verified_layer: String,
    pub timestamp: DateTime<Utc>,
}

impl ActionResult {
    #[must_use]
    pub fn success(code: &str, message: impl Into<String>, recovery: impl Into<String>) -> Self {
        Self::new(true, code, message, recovery)
    }

    #[must_use]
    pub fn failure(code: &str, message: impl Into<String>, recovery: impl Into<String>) -> Self {
        Self::new(false, code, message, recovery)
    }

    fn new(ok: bool, code: &str, message: impl Into<String>, recovery: impl Into<String>) -> Self {
        Self {
            ok,
            code: code.to_owned(),
            message: message.into(),
            recovery: recovery.into(),
            last_verified_layer: "manager".to_owned(),
            timestamp: Utc::now(),
        }
    }
}
