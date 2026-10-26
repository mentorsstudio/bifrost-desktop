# Coucou — versão do Paulo (MCP)

Build pessoal do [Coucou](https://github.com/louis-cfm/coucou) (base: commit `47d1c2d`) para
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
- Para o Grok Bot alcançar o Coucou: `cloudflared tunnel --url http://127.0.0.1:47821`
  (detalhes em `docs/mcp-pt-BR.md`).

## Licença

O código continua sob a licença MIT original — **Copyright (c) 2026 Louis Raillé** — veja
[`LICENSE`](LICENSE); as modificações desta versão seguem a mesma licença.

O nome **Coucou**, o personagem **Mochi**, o ícone e os sons **não** são MIT: pertencem a Louis
Raillé ([`LICENSE-ASSETS.md`](LICENSE-ASSETS.md)). Esta versão é para **uso pessoal** (compilar e
rodar para si). Para distribuir/publicar este fork, é preciso trocar nome, ícone, personagem e
sons, ou ter permissão escrita do autor.
