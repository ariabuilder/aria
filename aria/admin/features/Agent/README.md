# Agent — Aria Engineer

Always-on AI Engineer for Studio. Import only from `@/features/Agent`.

## Layout

```
client/   Vue UI, composables, settings
lib/      Schemas, availability, inference, chat parsing
server/   Durable Object + routes (no Vue)
actions/  Astro Actions
```

## Docs

- [Capability control map](docs/capability-control-map.md) — commands, schemas, safety, design patches
- [MCP](docs/aria-mcp.md)
- Public guide: `aria-web` → `src/content/docs/creators/agent-and-mcp/`

## Composer modes

| Mode  | Behavior                          |
| ----- | --------------------------------- |
| Ask   | Q&A                               |
| Plan  | Plans only; no execution          |
| Agent | Goal-oriented; tools when enabled |

Mode and model overrides are session-local (`localStorage`), not site settings.

## Inference (BYOK order)

1. OpenCode
2. OpenAI
3. Anthropic
4. Google AI
5. OpenRouter
6. OpenAI-compatible (Ollama, LM Studio, custom)
