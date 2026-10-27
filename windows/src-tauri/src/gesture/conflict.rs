// O Filee instalado no PC também tem gestos de mouse. Lemos (só leitura) o
// %APPDATA%\Filee\settings.json dele: se um gatilho ligado do Filee usa o mesmo
// botão e as mesmas teclas que o nosso, o Bifrost não liga o gancho (nada de
// abrir dois menus) e os Ajustes pedem outro gatilho. Nunca escrevemos lá.

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileeSettings {
    #[serde(default)]
    paused: bool,
    #[serde(default)]
    triggers: Vec<FileeTrigger>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileeTrigger {
    #[serde(default = "yes")]
    enabled: bool,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    modifiers: String,
    #[serde(default)]
    button: String,
}

fn yes() -> bool {
    true
}

/// As teclas de um gatilho nosso ("ctrl-hold" → Ctrl).
fn our_mods(trigger: &str) -> (bool, bool, bool) {
    match trigger {
        "ctrl-alt" => (true, true, false),
        "alt-hold" => (false, true, false),
        _ => (true, false, false),
    }
}

fn mods_of(s: &str) -> (bool, bool, bool) {
    let has = |k: &str| s.split(',').any(|m| m.trim().eq_ignore_ascii_case(k));
    (has("Ctrl") || has("Control"), has("Alt"), has("Shift"))
}

/// O texto do aviso, se o Filee (com estas configurações) disputa o nosso gatilho.
pub fn conflict(settings_json: &str, trigger: &str) -> Option<String> {
    let s: FileeSettings = serde_json::from_str(settings_json).ok()?;
    if s.paused {
        return None;
    }
    let ours = our_mods(trigger);
    let hit = s.triggers.iter().find(|t| {
        t.enabled && t.button.eq_ignore_ascii_case("Right") && matches!(t.kind.as_str(), "Hold" | "Drag") && mods_of(&t.modifiers) == ours
    })?;
    let gesto = if hit.kind == "Hold" { "segurar" } else { "arrastar com" };
    Some(format!(
        "O Filee já usa {} + {gesto} o botão direito. Para não abrir dois menus, o gesto do Bifrost fica desligado até você escolher outro gatilho.",
        hit.modifiers.replace(", ", " + ")
    ))
}

/// Os gatilhos do Filee em texto, para mostrar nos Ajustes ("Ctrl + arrastar (esquerdo)").
pub fn filee_triggers(settings_json: &str) -> Vec<String> {
    let Ok(s) = serde_json::from_str::<FileeSettings>(settings_json) else { return Vec::new() };
    s.triggers
        .iter()
        .filter(|t| t.enabled)
        .map(|t| {
            let m = t.modifiers.replace(", ", " + ");
            match t.kind.as_str() {
                "KeyChord" => format!("{m} + tecla"),
                "Hold" => format!("{m} + segurar ({})", if t.button == "Right" { "direito" } else { "esquerdo" }),
                _ => format!("{m} + arrastar ({})", if t.button == "Right" { "direito" } else { "esquerdo" }),
            }
        })
        .collect()
}

/// Lê o settings.json do Filee instalado (None se não houver Filee).
pub fn read_filee_settings() -> Option<String> {
    let appdata = std::env::var_os("APPDATA")?;
    std::fs::read_to_string(std::path::Path::new(&appdata).join("Filee").join("settings.json")).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAULO: &str = r#"{"paused":false,"triggers":[
        {"enabled":true,"kind":"Drag","modifiers":"Ctrl","button":"Left"},
        {"enabled":true,"kind":"KeyChord","modifiers":"Ctrl, Alt","button":"None","key":"Space"}]}"#;

    #[test]
    fn config_do_paulo_nao_disputa() {
        // Ctrl + arrastar com o ESQUERDO não briga com Ctrl + segurar o direito.
        assert_eq!(conflict(PAULO, "ctrl-hold"), None);
        assert_eq!(filee_triggers(PAULO), ["Ctrl + arrastar (esquerdo)", "Ctrl + Alt + tecla"]);
    }

    #[test]
    fn mesmo_botao_e_teclas_disputa() {
        let j = r#"{"triggers":[{"enabled":true,"kind":"Hold","modifiers":"Ctrl","button":"Right"}]}"#;
        assert!(conflict(j, "ctrl-hold").unwrap().contains("Ctrl + segurar"));
        assert!(conflict(j, "ctrl").is_some());
        assert_eq!(conflict(j, "ctrl-alt"), None);
        assert_eq!(conflict(j, "alt-hold"), None);
        // Filee pausado ou gatilho desligado: sem conflito.
        assert_eq!(conflict(&j.replace("{\"triggers\"", "{\"paused\":true,\"triggers\""), "ctrl-hold"), None);
        assert_eq!(conflict(&j.replace("\"enabled\":true", "\"enabled\":false"), "ctrl-hold"), None);
        assert_eq!(conflict("lixo", "ctrl-hold"), None);
    }
}
