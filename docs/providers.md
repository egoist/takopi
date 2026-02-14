# Model Providers

Configure model providers in **Settings > Providers**.

This page covers model providers used for agent chat and embeddings.

## Quick rules

- Model refs use `providerId/modelId` (example: `provider-123/gpt-5.2`).
- A provider is usable only after at least one model is selected.
- Provider `id` is part of saved model refs, so changing `id` can break existing agent model assignments.
- Model catalog data is fetched from `https://models.dev/api.json` and cached for 2 hours.

## Built-in providers

Takopi ships with built-in provider types. Add one in **Settings > Providers > Add Provider**, set auth, then select models.

### OpenAI

- Type: `openai`
- Auth: API key
- Default base URL: `https://api.openai.com/v1`
- Example model ref: `<your-provider-id>/<openai-model-id>`

### Anthropic

- Type: `anthropic`
- Auth: API key
- Default base URL: `https://api.anthropic.com/v1`
- Example model ref: `<your-provider-id>/<anthropic-model-id>`

### Codex (ChatGPT OAuth)

- Type: `codex`
- Auth: OAuth only (Sign in with ChatGPT)
- Default base URL: `https://chatgpt.com/backend-api/codex`
- Example model ref: `<your-provider-id>/gpt-5.2`

Codex setup flow:

1. Click **Sign in with ChatGPT**.
2. Complete the device-code verification flow.
3. Return to Takopi and wait for connection to complete.

Codex tokens are refreshed automatically when near expiration.

### OpenRouter

- Type: `openrouter`
- Auth: API key
- Default base URL: `https://openrouter.ai/api/v1`
- Example model ref: `<your-provider-id>/<openrouter-model-id>`

### DeepSeek

- Type: `deepseek`
- Auth: API key
- Default base URL: `https://api.deepseek.com/v1`
- Example model ref: `<your-provider-id>/<deepseek-model-id>`

### OpenCode Zen

- Type: `opencode`
- Auth: API key
- Default base URL (UI placeholder): `https://api.opencode.ai/v1`
- Runtime fallback base URL (if empty): `https://opencode.ai/zen/v1`
- Example model ref: `<your-provider-id>/<opencode-model-id>`

### Z.ai

- Type: `zai`
- Auth: API key
- Default base URL: `https://api.z.ai/api/paas/v4`
- Example model ref: `<your-provider-id>/<zai-model-id>`

### Vercel AI Gateway

- Type: `vercel`
- Auth: API key
- Default base URL: `https://ai-gateway.vercel.sh/v3/ai`
- Example model ref: `<your-provider-id>/<gateway-model-id>`

## Providers via Base URL (custom/proxy)

Use **Base URL** to route a built-in provider through a compatible proxy or custom endpoint.

- Leave Base URL empty to use provider defaults.
- Set Base URL only when you intentionally need a proxy/self-hosted route.
- Takopi does not currently expose a separate "custom provider type"; use one of the built-ins plus Base URL override.

## Embedding support

Embedding model config also uses `providerId/modelId`.

- Supported for: `openai`, `openrouter`, `zai`, `opencode`, `anthropic`, `deepseek`, `vercel`
- Not supported for embeddings: `codex`

## Troubleshooting

- **No models in picker**: check network access to `models.dev`, then retry.
- **Provider exists but agent cannot use it**: ensure models were selected for that provider.
- **Agent shows "model not found"**: verify the provider `id` still matches the model ref saved on that agent.
- **Codex auth issues**: disconnect and reconnect OAuth in provider settings.
