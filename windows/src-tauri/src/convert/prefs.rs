// Preferências do Conversor e do gesto, num arquivo próprio (filee.json, ao
// lado do settings.json), para não mexer no Settings da ilha.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct FileePrefs {
    /// Ctrl + botão direito sobre um arquivo abre o Huginn com o menu.
    pub gesture: bool,
    /// "ctrl-hold" (Ctrl + segurar o botão direito), "ctrl" (Ctrl + botão
    /// direito, na hora) ou "ctrl-alt" (Ctrl + Alt + botão direito).
    pub trigger: String,
    /// Quanto segurar, em ms, no modo "ctrl-hold".
    pub hold_ms: u32,
    /// Entrada "Bifrost ›" no menu clássico do Explorador (HKCU).
    pub context_menu: bool,
    /// Pasta de saída; vazia = ao lado do original.
    pub out_dir: String,
}

impl Default for FileePrefs {
    fn default() -> Self {
        Self { gesture: true, trigger: "ctrl-hold".into(), hold_ms: 280, context_menu: false, out_dir: String::new() }
    }
}

fn file() -> std::path::PathBuf {
    crate::platform::config_dir().join("filee.json")
}

pub fn load() -> FileePrefs {
    std::fs::read(file()).ok().and_then(|b| serde_json::from_slice(&b).ok()).map(sanitize).unwrap_or_default()
}

pub fn sanitize(mut p: FileePrefs) -> FileePrefs {
    if !matches!(p.trigger.as_str(), "ctrl-hold" | "ctrl" | "ctrl-alt") {
        p.trigger = "ctrl-hold".into();
    }
    p.hold_ms = p.hold_ms.clamp(150, 1200);
    p
}

pub fn save(p: FileePrefs) -> Result<FileePrefs, String> {
    let p = sanitize(p);
    let path = file();
    if let Some(d) = path.parent() {
        let _ = std::fs::create_dir_all(d);
    }
    std::fs::write(&path, serde_json::to_vec_pretty(&p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sanitizes() {
        let p = sanitize(FileePrefs { trigger: "x".into(), hold_ms: 5, ..Default::default() });
        assert_eq!(p.trigger, "ctrl-hold");
        assert_eq!(p.hold_ms, 150);
        let d: FileePrefs = serde_json::from_str("{}").unwrap();
        assert!(d.gesture && !d.context_menu);
    }
}
