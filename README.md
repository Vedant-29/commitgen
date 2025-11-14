<div align="center">

# CommitGen

## AI-powered commit message generator using local Ollama or cloud OpenRouter models

Auto-generate meaningful commits in a second 🤯🔫

</div>

---

## Setup CommitGen as a CLI tool

You can use CommitGen by simply running it via the CLI like this `cgen`. 2 seconds and your staged changes are committed with a meaningful message.

1. Install CommitGen globally to use in any repository:

   ```bash
   npm install
   npm run build
   npm link
   ```

2. For Ollama: Install from https://ollama.ai and pull a model (e.g., `ollama pull qwen2.5-coder:7b`)

3. For OpenRouter: Get your API key from [OpenRouter](https://openrouter.ai/keys). Make sure that you add payment details to your account, so the API works.

4. Set up your configuration (see below).

## First Time Setup

**IMPORTANT:** After installation, run the setup wizard to create your configuration:

```bash
# Create global config (recommended - works in all repos)
cgen init --global

# Or create project-specific config
cgen init --local
```

The wizard will guide you through:
1. Choosing between Ollama (local) or OpenRouter (cloud)
2. Configuring your model
3. Setting up API keys (if using OpenRouter)

**Without running `cgen init`, you'll get a "Configuration file not found" error.**

### Setting up OpenRouter API Key

Set your API key using one of these methods (in order of preference):

1. **`.env` file in home directory (recommended for global use)**: Create a single `.env` file in your home directory that works across all repos:
   ```bash
   echo 'OPENROUTER_API_KEY=your-api-key-here' > ~/.env
   ```
   This single file will be automatically loaded whenever you use `cgen` in any repository. The `.env` file is automatically ignored by git (already in `.gitignore`), so your key stays secure.

2. **Project-specific `.env` file**: Create a `.env` file in a specific project root if you need different API keys per project (overrides home `.env`)

3. **Environment variable**: `export OPENROUTER_API_KEY="your-key"` (add to `~/.bashrc` or `~/.zshrc` to persist)

4. **Config file**: Set `apiKey` in your `.commitgenrc.json` (less secure, not recommended)

## Usage

You can call CommitGen with `cgen` command to generate a commit message for your staged changes:

```sh
git add <files...>
cgen
```

Running `git add` is optional, `cgen` will do it for you.

```bash
# First time setup
cgen init --global      # Create global config (recommended)
cgen init --local       # Create project-specific config

# Daily usage
cgen                    # Interactive commit wizard
cgen models             # List all configured models
cgen use <model-name>   # Switch to a different model
cgen add-model          # Add a new model interactively
cgen check              # Run pre-commit checks
cgen check build lint   # Run specific checks
cgen doctor             # Diagnose setup
```

## Configuration

The setup wizard creates a `.commitgenrc.json` file for you. You can also create it manually.

### Local per repo configuration

CommitGen looks for config in this order:
1. **Local** (project-specific): `./.commitgenrc.json` - overrides global config
2. **Global** (user-wide): `~/.commitgenrc.json` - works in all repos

**Recommended:** Use global config (`cgen init --global`) and only create local configs when you need project-specific settings.

If you prefer to create the config manually instead of using `cgen init`:

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

### Global config for all repos

Local config still has more priority than Global config, but you may set `activeModel` and `fallbackModel` globally and set local configs for project-specific settings which is more convenient.

Simply edit your `~/.commitgenrc.json` file to set global configuration.

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

### Switch to different models

By default, CommitGen uses the model specified in your config file.

You may switch to a different model by editing your `.commitgenrc.json`:

```json
{
  "activeModel": "cloud-gpt"
}
```

Or set `COMMITGEN_ACTIVE_MODEL=cloud-gpt` environment variable.

### Running locally with Ollama

You can run CommitGen with local model through Ollama:

- Install and start Ollama from https://ollama.ai

- Run `ollama pull qwen2.5-coder:7b` (do this only once, to pull model)

- Configure in your `.commitgenrc.json`:

```json
{
  "activeModel": "local-qwen",
  "models": {
    "local-qwen": {
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

If you have Ollama that is set up in docker/ on another machine with GPUs (not locally), you can change the default endpoint URL.

You can do so by setting the `baseUrl` in your model configuration:

```json
{
  "models": {
    "local-qwen": {
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "baseUrl": "http://192.168.1.10:11434"
    }
  }
}
```

where 192.168.1.10 is example of endpoint URL, where you have Ollama set up.

## License

MIT
