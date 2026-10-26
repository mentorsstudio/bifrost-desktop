# Bifrost — versão do Paulo (MCP)

**Bifrost** (repositório: `mentorsstudio/bifrost-desktop`) é um fork pessoal do
[Coucou](https://github.com/louis-cfm/coucou), de Louis Raillé (base: commit `47d1c2d`), para
**Windows/Linux** em que o chat do Mochi usa **MCP (Model Context Protocol)** em vez de chaves
de API, e o próprio app vira um **servidor MCP** para que Grok Bot, Hermes e outros agentes
mostrem avisos, peçam aprovação e abram sessões no Mochi.

- O que mudou: `windows/src-tauri/src/mcp/` (cliente, provedor de chat, servidor embutido),
  `windows/src/settings/mcp.ts` (tela "Servidores MCP"), MCP como provedor padrão. Os provedores
  antigos (Anthropic, OpenAI, Google, OpenRouter, Ollama, LM Studio) continuam funcionando.
- Mac (`NotchBuddy/`) e Android não foram alterados.
- Configuração, exemplos (Hermes PC/VPS, Alethe, Orca, Freya, Grok Bot) e como compilar:
  [`docs/mcp-pt-BR.md`](docs/mcp-pt-BR.md).

## Valores já preenchidos

- Hermes (PC): `C:\Users\paulo\AppData\Local\hermes\bin\hermes.exe mcp-serve --tools` — **ligado**
- Alethe: `C:\Users\paulo\AppData\Local\Alethe\alethe-orchestrator-mcp.exe` — **ligado**
- Hermes (VPS): `https://mcp.srv2096709.hstgr.cloud/mcp` — desligado.
- Hermes (VPS, tarefas): `https://mcp.srv2096709.hstgr.cloud/task/mcp` — desligado. É o que tem
  `hermes_task_*`; use-o em *Chat via MCP* para tarefas no VPS.
- Os dois pedem Basic Auth (Traefik): em *Editar*, preencha **Usuário** e **Senha** (vão para o
  cofre do Windows, não para o `settings.json`) e desmarque *Desativado*.
- Orca: `C:\Users\paulo\AppData\Local\orca\bin\orca.exe mcp` — desligado; confirme o caminho.
- Freya: `C:\Users\paulo\Freya\ponte-grokbot` — desligado; confirme o comando de entrada.
- Para o Grok Bot alcançar o Bifrost: `cloudflared tunnel --url http://127.0.0.1:47821`
  (detalhes em `docs/mcp-pt-BR.md`).

## Nome, identificador e pastas

- Nome do app: **Bifrost** (sem relação com o gateway de LLM "Bifrost" da Maxim AI). Executável
  `bifrost-desktop.exe`, relay `bifrost-hook.exe`, crate `bifrost-desktop` / `bifrost_desktop_lib`.
- Identificador Tauri: `com.paulocodex.bifrost` (também o serviço no cofre de credenciais).
- Pastas no Windows: `%APPDATA%\Bifrost` (configurações), `%LOCALAPPDATA%\Bifrost` (relay, log,
  inbox; também a pasta de instalação do .exe). No Linux: `~/.config/bifrost-desktop` e
  `~/.local/share/bifrost-desktop`.
- Migração: na primeira execução, se não houver `settings.json` do Bifrost, o de
  `%APPDATA%\Coucou` é **copiado** (o original fica). Tokens salvos no cofre pelo Coucou
  **não** migram: preencha de novo em *Servidores MCP*.
- Palavra de ativação por voz: "OK Bifrost" (o antigo "OK Coucou" continua funcionando).
- Atualização automática: continua olhando os releases do Coucou original, mas só aceita
  arquivos `Bifrost-Windows-*`, então na prática nunca troca o Bifrost pelo Coucou.

## Licença e créditos

Baseado no **Coucou**, de **Louis Raillé** — código sob a licença MIT original
(**Copyright (c) 2026 Louis Raillé**, veja [`LICENSE`](LICENSE)); as modificações desta versão
seguem a mesma licença.

O ícone do Bifrost (arco-íris sobre quadrado escuro, `windows/src-tauri/icons-src/bifrost.svg`)
é novo. **Ainda usados e de uso pessoal** ([`LICENSE-ASSETS.md`](LICENSE-ASSETS.md), de Louis
Raillé): o nome e o personagem **Mochi** (desenhado em código, com suas expressões/animações) e os
**sons** (`NotchBuddy/Resources/sounds/`, embutidos no app). Esta versão é para **uso pessoal**;
para distribuir, troque também o Mochi e os sons ou peça permissão escrita ao autor.
