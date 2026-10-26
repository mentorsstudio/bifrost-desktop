# Bifrost (versão do Paulo) — MCP no lugar de chaves de API

Esta versão do Bifrost para **Windows/Linux** (Tauri, pasta `windows/`) fala com agentes por
**MCP (Model Context Protocol)** em vez de chamar Anthropic/OpenAI/Google com chave de API.
Os provedores antigos continuam lá (Configurações → Chat), mas o padrão agora é **MCP**.

São duas peças:

1. **Cliente MCP** — o chat do Mochi manda a mensagem para um agente (Hermes, Alethe, Orca,
   Freya…) por uma ferramenta MCP. Configuração em `settings.json`, campo `mcpServers`.
2. **Servidor MCP do Bifrost** — o app expõe `http://127.0.0.1:47821/mcp` (só neste computador,
   com token Bearer) para que Grok Bot, Hermes etc. possam acionar o Mochi.

`settings.json` fica em `%APPDATA%\com.paulocodex.bifrost\` no Windows e em
`~/.config/com.paulocodex.bifrost/` no Linux. Dá para editar tudo pela tela
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
      "url": "https://mcp.srv2096709.hstgr.cloud/mcp",
      "disabled": true
    },
    "hermes-vps-tarefas": {
      "url": "https://mcp.srv2096709.hstgr.cloud/task/mcp",
      "disabled": true
    },
    "alethe": {
      "command": "C:\\Users\\paulo\\AppData\\Local\\Alethe\\alethe-orchestrator-mcp.exe"
    },
    "orca": {
      "command": "C:\\Users\\paulo\\AppData\\Local\\orca\\bin\\orca.exe",
      "args": ["mcp"],
      "disabled": true
    },
    "freya": {
      "command": "C:\\Users\\paulo\\Freya\\ponte-grokbot\\CONFIRME-O-COMANDO.exe",
      "disabled": true
    }
  }
}
```

Esses são os **padrões** que o app cria quando o `settings.json` ainda não tem `mcpServers`.
Ligados: **hermes** e **alethe**. Desligados até você confirmar: **hermes-vps**, **hermes-vps-tarefas**, **orca**, **freya**.

Observações:

- **Se o programa não existir**, o *Testar*/chat mostra "programa não encontrado: …" — confira o
  caminho ou marque *Desativado*. Nada trava.
- **Hermes (VPS)** — dois servidores no mesmo host, ambos atrás de Basic Auth do Traefik
  (sem login: HTTP 401; com login: HTTP 200), confirmados em 26/10/2026:
  - `hermes-vps` → `https://mcp.srv2096709.hstgr.cloud/mcp` (conversas, mensagens, canais,
    permissões, busca na web, visão, skills, voz);
  - `hermes-vps-tarefas` → `https://mcp.srv2096709.hstgr.cloud/task/mcp` (servidor
    `hermes-task`: `hermes_task_list`, `hermes_task_start`, `hermes_task_status`, `hermes_task_stop`).

  **Como preencher o login:** *Servidores MCP* → *Editar* no servidor → campos **Usuário** e
  **Senha** → *Salvar* (ou *Testar conexão*). O app monta `Authorization: Basic <base64>` e guarda
  só no cofre do sistema (`mcp-token:<nome>`), nunca no `settings.json`. Faça isso nos dois
  servidores e desmarque *Desativado*. *Apagar credencial* remove.
- **Chat com tarefas do VPS**: em *Chat via MCP*, escolha o servidor `hermes-vps-tarefas`
  (modo Tarefa, `hermes_task_start` / `hermes_task_status`). O `/mcp` do VPS não tem as
  ferramentas `hermes_task_*`.
- **Tokens nunca vão no JSON.** Em *Editar* → *Token Bearer*, o token é guardado no cofre do
  sistema (Gerenciador de Credenciais do Windows / Secret Service no Linux) como
  `mcp-token:<nome>` e enviado como `Authorization: Bearer …`. Cabeçalhos extras podem ir em
  `headers` (atenção: `headers` fica no `settings.json` em texto puro).
- `http://` só é aceito para `localhost`/`127.0.0.1`; remoto exige `https://`.
- **Alethe**: `alethe-orchestrator-mcp.exe` (stdio). Clique em **Testar** para ver o
  `tools/list` e escolha a ferramenta em *Chat via MCP*.
- **Orca**: pela documentação pública do Orca, o CLI fica em `%LOCALAPPDATA%\orca\bin` e vira
  servidor MCP com `orca mcp` (stdio, sem token). Em *Settings → AI & agents → Another MCP
  client?* o Orca mostra o caminho exato — confira (a instalação está em
  `C:\Users\paulo\AppData\Local\Orca`, hooks em `C:\Users\paulo\.orca\agent-hooks`) e então ligue.
- **Freya**: a ponte está em `C:\Users\paulo\Freya\ponte-grokbot`, mas o comando de entrada
  não é conhecido. Troque `CONFIRME-O-COMANDO.exe` pelo comando real (ex.: `node` com
  `args: ["index.js"]`, ou um `.exe`) e ligue.

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

## 3. Servidor MCP do Bifrost (para Grok Bot, Hermes…)

Ligado por padrão em `http://127.0.0.1:47821/mcp` (`mcpServerEnabled`, `mcpServerPort`;
mudanças valem no próximo início). Só aceita conexões deste computador e exige
`Authorization: Bearer <token>`; o token é gerado na primeira execução e fica no cofre do sistema.
Em **Configurações → Chat → Servidor MCP do Bifrost → Copiar config para clientes**, o app copia:

```json
{
  "mcpServers": {
    "bifrost-desktop": {
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
{ "mcpServers": { "bifrost-desktop": { "command": "npx", "args": ["-y", "mcp-remote", "http://127.0.0.1:47821/mcp", "--header", "Authorization:Bearer SEU_TOKEN"] } } }
```

## 4. Compilar

### Windows (gera o instalador)

Pré-requisitos: [Rust](https://rustup.rs) **1.88+** (stable, toolchain MSVC), Node.js **22+**,
**Visual Studio Build Tools** com "Desenvolvimento para desktop com C++" (MSVC + Windows SDK),
**WebView2 Runtime** (já vem no Windows 11), e opcionalmente CMake/LLVM se o `sherpa-onnx` pedir.

```powershell
git clone <seu-fork> bifrost-desktop
cd bifrost-desktop\windows
git checkout paulo-mcp
npm ci
npm run pack        # = cargo build do bifrost-hook + tauri build + cópia para release\
# instaladores em windows\release\  (…-setup.exe e .msi)
```

Para desenvolver: `npm run tauri dev`. Testes: `cargo test -p bifrost-desktop --lib` e `npm test`
(Node 24, por causa do suporte a TypeScript nos testes).

### GitHub Actions

`.github/workflows/windows-build.yml` compila em `windows-latest` a cada push na branch
`paulo-mcp` (ou manualmente) e publica o instalador como **artefato** do workflow (não cria
release pública).

### Linux

`sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
libdbus-1-dev libssl-dev libxdo-dev libasound2-dev libpulse-dev libgtk-layer-shell-dev clang cmake`
e depois `cd windows && npm ci && npm run tauri build`.


## Expor o servidor local (127.0.0.1:47821) com Cloudflare Tunnel

O servidor MCP do Bifrost só escuta em `127.0.0.1:47821`. Para o Grok Bot (que roda na nuvem)
alcançá-lo:

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://127.0.0.1:47821
```

O `cloudflared` imprime um endereço `https://<algo>.trycloudflare.com`. No Grok Bot, cadastre
`https://<algo>.trycloudflare.com/mcp` com o token Bearer do Bifrost (botão *Copiar JSON* na seção
*Servidor MCP do Bifrost*). O endereço rápido muda a cada execução; para um fixo, crie um túnel
nomeado (`cloudflared tunnel login`, `cloudflared tunnel create bifrost-desktop`, rota DNS no seu domínio).
Nunca exponha o servidor sem o token.
