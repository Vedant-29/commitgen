# commitgen

A command line tool that writes a one-line commit message for your git changes, runs your checks, and commits. It uses a local Ollama model or an OpenRouter cloud model, and can fall back from one to the other.

Messages follow a single format: `[feature|bugfix|refactor] description`. The prompt asks the model to keep the description to 72 characters.

## Features

- Runs locally with Ollama (`qwen2.5-coder:7b` by default). Nothing leaves your machine unless you add an OpenRouter model.
- Optional `fallbackModel`: if the primary model fails, the other one is tried.
- Build, lint, test, and typecheck commands from `.commitgenrc.json` can run before the commit. A failing check marked `blocking` stops the commit.
- A global config in `~/.commitgenrc.json`, or a per-project `./.commitgenrc.json`.

## Requirements

- Node 22.12+ or 20.19+. `chalk` and `ora` are ESM-only and the build output is CommonJS, so older Node versions (18 and below) fail on start with `ERR_REQUIRE_ESM`.
- Git
- One of:
  - [Ollama](https://ollama.com) with a model pulled: `ollama pull qwen2.5-coder:7b`
  - An OpenRouter API key

## Setup

```sh
git clone https://github.com/Vedant-29/commitgen.git
cd commitgen
npm install
npm run build
npm link
cgen init --global
```

`npm link` puts `cgen` (and `commitgen`) on your PATH. `cgen init` must run once, otherwise `cgen` stops with "Configuration file not found." It asks for a provider, a model, and either the Ollama URL or an OpenRouter key. Use `cgen init --local` for a project-only config.

For development without building, run `npm run dev` (uses `ts-node`).

## Services

Bring your own Ollama install or OpenRouter account. No keys ship with the repo.

| Service | Used for | Required | Config |
|---|---|---|---|
| Ollama | Local models | One of the two | `baseUrl` in the model config |
| OpenRouter | Cloud models | One of the two | `OPENROUTER_API_KEY` or `apiKey` in the model config |

### Ollama

Install Ollama, pull a model (`ollama pull qwen2.5-coder:7b`), and keep it running. commitgen calls `<baseUrl>/api/chat` to generate and `<baseUrl>/api/tags` to check it is up. `baseUrl` is required for Ollama models and is usually `http://localhost:11434`. To use Ollama on another machine, point it there, for example `http://192.168.1.10:11434`.

### OpenRouter

Create a key at https://openrouter.ai/keys and add credits at https://openrouter.ai/credits. commitgen calls `https://openrouter.ai/api/v1/chat/completions`. Use any OpenRouter model id, such as `openai/gpt-4o-mini` or `anthropic/claude-3-haiku`. Without a key, OpenRouter models fail config validation.

## Environment variables

| Variable | Required | What it is for | Where to get it |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Only for OpenRouter models | Authenticates OpenRouter requests | https://openrouter.ai/keys |
| `COMMITGEN_ACTIVE_MODEL` | No | Overrides `activeModel` for one run | A model name from your config |
| `DEBUG` | No | Prints debug logs | Set to any value |
| `NO_COLOR` | No | `NO_COLOR=1` stops commitgen from forcing colored output | Set in your shell |

The key can live in `~/.env` (works in every repo), `./.env` (per project), or your shell profile. A `.env` in the current directory overrides both of the others. `OPENROUTER_API_KEY` takes priority over an `apiKey` in the config for the active model. An `apiKey` field in `.commitgenrc.json` also works, but avoid committing it. `cgen init` lets you leave the key blank and use the env var instead.

## Usage

```sh
cgen
```

`cgen` opens a menu:

- Generate commit message: offers to stage all changes, asks whether to run checks, shows the message so you can commit, regenerate, edit, or cancel, then asks about pushing if `askPush` is on.
- Quick commit: stages everything, generates the message, commits, and pushes without asking.
- Show repository status.
- Configure settings (models, checks, prompts).

| Command | What it does |
|---|---|
| `cgen` | Open the menu above |
| `cgen models` | List configured models |
| `cgen use <name>` | Switch the active model |
| `cgen add-model` | Add a model interactively |
| `cgen check [names...]` | Run the configured checks only (`--all`, `--fix` to run `autofix`) |
| `cgen doctor` | Check the setup (git repo, provider reachable, active model, enabled checks) |

## Configuration

```json
{
  "activeModel": "local-qwen",
  "fallbackModel": "cloud-claude",
  "models": {
    "local-qwen": {
      "provider": "ollama",
      "model": "qwen2.5-coder:7b",
      "baseUrl": "http://localhost:11434"
    },
    "cloud-claude": {
      "provider": "openrouter",
      "model": "anthropic/claude-3-haiku"
    }
  },
  "temperature": 0.2,
  "maxTokens": 500,
  "checks": {
    "build": { "enabled": true, "command": "npm run build", "blocking": true, "timeout": 300000 },
    "lint": { "enabled": true, "command": "npm run lint", "blocking": false, "autofix": "npm run lint:fix" },
    "typecheck": { "enabled": false, "command": "tsc --noEmit", "blocking": false }
  },
  "prompts": {
    "askPush": false,
    "askStage": true,
    "showChecks": true
  }
}
```

`activeModel` and `models` are required. The `.commitgenrc.json` in this repo is a fuller example with every option and several Ollama and OpenRouter models.

## Notes

- A `./.commitgenrc.json` replaces the global one completely. The two are not merged.
- If your config leaves out `checks.build`, the built-in default turns on a blocking `npm run build` check. Configs made by `cgen init` have it off.
- A check with no `timeout` is stopped after 30 seconds.
- If the model reply cannot be parsed into a usable line, the message falls back to `chore: update code`.

## How it works

The staged diff, per-file stats, and recent commits (for style) are collected in `src/git/`. `src/prompts/promptEngine.ts` builds a few-shot prompt, `src/providers/` calls Ollama or OpenRouter, and `src/utils/validators.ts` cleans up the reply. `src/workflows/workflowRunner.ts` ties the steps together and handles fallback.

## License

MIT. See [LICENSE](LICENSE).
