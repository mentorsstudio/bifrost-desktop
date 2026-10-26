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

## Licença

O código continua sob a licença MIT original — **Copyright (c) 2026 Louis Raillé** — veja
[`LICENSE`](LICENSE); as modificações desta versão seguem a mesma licença.

O nome **Coucou**, o personagem **Mochi**, o ícone e os sons **não** são MIT: pertencem a Louis
Raillé ([`LICENSE-ASSETS.md`](LICENSE-ASSETS.md)). Esta versão é para **uso pessoal** (compilar e
rodar para si). Para distribuir/publicar este fork, é preciso trocar nome, ícone, personagem e
sons, ou ter permissão escrita do autor.
