# Coucou (versão do Paulo) — MCP no lugar de chaves de API

Esta versão do Coucou para **Windows/Linux** (Tauri, pasta `windows/`) fala com agentes por
**MCP (Model Context Protocol)** em vez de chamar Anthropic/OpenAI/Google com chave de API.
Os provedores antigos continuam lá (Configurações → Chat), mas o padrão agora é **MCP**.

São duas peças:

1. **Cliente MCP** — o chat do Mochi manda a mensagem para um agente (Hermes, Alethe, Orca,
   Freya…) por uma ferramenta MCP. Configuração em `settings.json`, campo `mcpServers`.
2. **Servidor MCP do Coucou** — o app expõe `http://127.0.0.1:47821/mcp` (só neste computador,
   com token Bearer) para que Grok Bot, Hermes etc. possam acionar o Mochi.

`settings.json` fica em `%APPDATA%\fr.louisraille.coucou\` no Windows e em
`~/.config/fr.louisraille.coucou/` no Linux. Dá para editar tudo pela tela
**Configurações → Chat → Servidores MCP** (adicionar, editar, remover, **Testar** = `tools/list`,
**Importar JSON**).

## 1. Servidores (`mcpServers`)

Formato padrão (o mesmo do Claude Desktop/Cursor/Grok Bot): `command`/`args`/`env` para
processos locais (stdio) ou `url`/`headers` para remotos (Streamable HTTP). `"disabled": true`
desliga uma entrada sem apagá-la.

```json
{
  "mcpServers": {
    "hermes": {
      "command": "C:\\Users\\paulo\\AppData\\Local\\hermes\\bin\\hermes.exe",
      "args": ["mcp-serve", "--tools"]
    },
    "hermes-vps": {
      "url": "https://mcp.srv2096709.hstgr.cloud/TROQUE-PELO-CAMINHO/mcp"
    },
    "alethe": {
      "command": "C:\\CAMINHO\\PARA\\alethe-orchestrator-mcp.exe",
      "args": []
    },
    "orca": {
      "command": "C:\\CAMINHO\\PARA\\orca.exe",
      "args": ["mcp"],
      "disabled": true
    },
    "freya": {
      "url": "https://TROQUE/mcp",
      "disabled": true
    }
  }
}
```

Observações:

- **Hermes (VPS)**: o caminho exato do endpoint não estava em nenhum lugar acessível durante a
  construção — troque `TROQUE-PELO-CAMINHO` pelo caminho real (o mesmo que o Grok Bot usa).
- **Tokens nunca vão no JSON.** Em *Editar* → *Token Bearer*, o token é guardado no cofre do
  sistema (Gerenciador de Credenciais do Windows / Secret Service no Linux) como
  `mcp-token:<nome>` e enviado como `Authorization: Bearer …`. Cabeçalhos extras não secretos
  podem ir em `headers`.
- `http://` só é aceito para `localhost`/`127.0.0.1`; remoto exige `https://`.
- **Alethe, Orca, Freya**: as ferramentas deles não eram conhecidas. Cadastre, clique em
  **Testar** para ver o `tools/list` e então escolha a ferramenta em *Chat via MCP*.
  Orca e Freya vêm como `disabled` até se confirmar que falam MCP.

## 2. Chat via MCP (`mcpChat`)

Dois modos:

- **`task`** (padrão, feito para o Hermes): chama `tool` com a mensagem em `argument`, pega o
  `job_id` da resposta e consulta `statusTool` a cada 2 s até `status` = done/completed (a
  resposta vem de `output`/`result`) ou failed/error, com limite de `timeoutSecs`.
- **`tool`**: uma chamada só; o texto devolvido é a resposta.

```json
"chatProvider": "mcp",
"mcpChat": {
  "server": "hermes",
  "mode": "task",
  "tool": "hermes_task_start",
  "argument": "prompt",
  "extraArgs": { "max_minutes": 10 },
  "statusTool": "hermes_task_status",
  "idArgument": "job_id",
  "timeoutSecs": 600,
  "includeHistory": true
}
```

Exemplo de modo `tool` (servidor com uma ferramenta de chat genérica):

```json
"mcpChat": { "server": "alethe", "mode": "tool", "tool": "chat", "argument": "message" }
```

`includeHistory` manda as falas anteriores como texto junto com a nova mensagem. No seletor de
modelo do chat, o chip **MCP** lista os servidores configurados: escolher um troca o servidor
usado pelo chat.

## 3. Servidor MCP do Coucou (para Grok Bot, Hermes…)

Ligado por padrão em `http://127.0.0.1:47821/mcp` (`mcpServerEnabled`, `mcpServerPort`;
mudanças valem no próximo início). Só aceita conexões deste computador e exige
`Authorization: Bearer <token>`; o token é gerado na primeira execução e fica no cofre do sistema.
Em **Configurações → Chat → Servidor MCP do Coucou → Copiar config para clientes**, o app copia:

```json
{
  "mcpServers": {
    "coucou": {
      "url": "http://127.0.0.1:47821/mcp",
      "headers": { "Authorization": "Bearer SEU_TOKEN" }
    }
  }
}
```

Ferramentas expostas:

| Ferramenta | O que faz | Retorno |
|---|---|---|
| `notify` `{message, title?, agent?}` | Mostra um aviso na pílula do agente | `ok` |
| `ask_approval` `{action, tool?, agent?, session_id?}` | Cartão Permitir/Negar no Mochi | `allow`, `deny` ou `no_decision` (~108 s) |
| `show_session` `{session_id, agent?, cwd?, prompt?}` | Abre uma sessão (pílula) | `ok` |
| `update_session` `{session_id, status: working\|question\|done, step?, message?}` | Atualiza a sessão | `ok` |
| `end_session` `{session_id, agent?}` | Encerra a sessão | `ok` |
| `chat` `{message}` | Pergunta ao chat do Mochi (recusa se o provedor for MCP, para evitar laço) | texto |

**Registrar no Grok Bot**: o Grok Bot roda na nuvem e **não alcança** `127.0.0.1` do seu PC.
Opções: (a) usar o servidor só a partir de agentes locais (Hermes no PC, Claude Code, Cursor);
(b) expor por um túnel com HTTPS (Cloudflare Tunnel, Tailscale Funnel) e registrar a URL https
pública no Grok Bot com o mesmo cabeçalho `Authorization`. Ao expor, o servidor checa o
cabeçalho `Host` (por padrão aceita só localhost); um túnel que reescreve o Host para
`localhost:47821` funciona sem mudanças. Para clientes que só falam stdio:

```json
{ "mcpServers": { "coucou": { "command": "npx", "args": ["-y", "mcp-remote", "http://127.0.0.1:47821/mcp", "--header", "Authorization:Bearer SEU_TOKEN"] } } }
```

## 4. Compilar

### Windows (gera o instalador)

Pré-requisitos: [Rust](https://rustup.rs) **1.88+** (stable, toolchain MSVC), Node.js **22+**,
**Visual Studio Build Tools** com "Desenvolvimento para desktop com C++" (MSVC + Windows SDK),
**WebView2 Runtime** (já vem no Windows 11), e opcionalmente CMake/LLVM se o `sherpa-onnx` pedir.

```powershell
git clone <seu-fork> coucou
cd coucou\windows
git checkout paulo-mcp
npm ci
npm run pack        # = cargo build do coucou-hook + tauri build + cópia para release\
# instaladores em windows\release\  (…-setup.exe e .msi)
```

Para desenvolver: `npm run tauri dev`. Testes: `cargo test -p coucou --lib` e `npm test`
(Node 24, por causa do suporte a TypeScript nos testes).

### GitHub Actions

`.github/workflows/windows-build.yml` compila em `windows-latest` a cada push na branch
`paulo-mcp` (ou manualmente) e publica o instalador como **artefato** do workflow (não cria
release pública).

### Linux

`sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
libdbus-1-dev libssl-dev libxdo-dev libasound2-dev libpulse-dev libgtk-layer-shell-dev clang cmake`
e depois `cd windows && npm ci && npm run tauri build`.
