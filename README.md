# CommitGen

AI-powered commit message generator using local Ollama or cloud OpenRouter models.

## Install

```bash
npm install
npm run build
npm link
```

For Ollama: Install from https://ollama.ai and pull a model (e.g., `ollama pull qwen2.5-coder:7b`)

For OpenRouter:
- Get API key from https://openrouter.ai/keys
- Set in config or as environment variable: `export OPENROUTER_API_KEY="your-key"` (add to `~/.bashrc` or `~/.zshrc` to persist)

## Configuration

Create `.commitgenrc.json`:

```json
{
  "activeModel": "local-qwen",
  "fallbackModel": "local-qwen",
  "models": {
    "local-qwen": {
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "baseUrl": "http://localhost:11434"
    },
    "cloud-gpt": {
      "provider": "openrouter",
      "model": "openai/gpt-3.5-turbo",
      "apiKey": "your-api-key"
    },
    "cloud-claude": {
      "provider": "openrouter",
      "model": "anthropic/claude-3-haiku",
      "apiKey": "your-api-key"
    }
  }
}
```

**Switch models:** Change `"activeModel": "cloud-gpt"` or set `COMMITGEN_ACTIVE_MODEL=cloud-gpt`

**Fallback:** Set `"fallbackModel"` to automatically use a backup model if the active model fails (e.g., cloud API down)

### Config Options

**Per-model:**
- `provider`: "ollama" or "openrouter"
- `model`: Model name
- `baseUrl`: Server URL (required for Ollama)
- `apiKey`: API key (required for OpenRouter, or set `OPENROUTER_API_KEY`)
- `temperature`, `maxTokens`: Optional overrides

**Global:**
- `activeModel`: Currently active model (required)
- `fallbackModel`: Backup model if active fails (optional, recommended: set to a local model)
- `temperature`: 0.2 (default)
- `maxTokens`: 500 (default)
- `language`: "en"
- `emoji`: false
- `checks`: Pre-commit validation (build, lint, test, typecheck)
- `prompts`: Confirmation prompts (askPush, askStage, showChecks)

## Usage

```bash
cgen                    # Interactive commit wizard
cgen models             # List all configured models
cgen use <model-name>   # Switch to a different model
cgen add-model          # Add a new model interactively
cgen check              # Run pre-commit checks
cgen check build lint   # Run specific checks
cgen doctor             # Diagnose setup
```

## License

MIT
