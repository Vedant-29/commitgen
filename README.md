# commitgen

A command line tool that writes a one-line commit message for your staged git changes, runs your checks, and commits. It uses a local Ollama model by default and can fall back to OpenRouter.

Messages follow a single format: `[feature|bugfix|refactor] description`, at most 72 characters.

## Features

- Runs locally with Ollama (`qwen2.5-coder:7b` by default). Nothing leaves your machine unless you add an OpenRouter model.
- Optional `fallbackModel`: if the primary provider fails, the other one is tried.
- Build, lint, test, and typecheck commands from `.commitgenrc.json` run before the commit, so a failing check blocks it.
- Global config in `~/.commitgenrc.json`, with per-repo overrides in `./.commitgenrc.json`.

## Requirements

- Node 18+
- One of:
  - [Ollama](https://ollama.ai) with a model pulled: `ollama pull qwen2.5-coder:7b`
  - An OpenRouter API key from https://openrouter.ai/keys

## Setup

```sh
git clone https://github.com/Vedant-29/commitgen.git
cd commitgen
npm install
npm run build
npm link
cgen init --global
```

`npm link` puts `cgen` (and `commitgen`) on your PATH. `cgen init` must run once, otherwise `cgen` stops with "Configuration file not found." Use `cgen init --local` for a project-only config.

## Environment variables

| Variable | Required | What it is for | Where to get it |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Only for OpenRouter models | Authenticates OpenRouter requests | https://openrouter.ai/keys |
| `COMMITGEN_ACTIVE_MODEL` | No | Overrides `activeModel` for one run | A model name from your config |
| `DEBUG` | No | Prints debug logs | Set to any value |

The key can live in `~/.env` (works in every repo), `./.env` (per project), or your shell profile. An `apiKey` field in `.commitgenrc.json` also works, but avoid committing it.

## Usage

```sh
git add <files>
cgen
```

If nothing is staged, `cgen` offers to stage files.

| Command | What it does |
|---|---|
| `cgen` | Generate a message, run checks, commit |
| `cgen models` | List configured models |
| `cgen use <name>` | Switch the active model |
| `cgen add-model` | Add a model interactively |
| `cgen check [names...]` | Run the configured checks only |
| `cgen doctor` | Check the setup (Ollama reachable, key present, config valid) |

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
    "build": "npm run build",
    "lint": "npm run lint",
    "typecheck": "tsc --noEmit"
  },
  "prompts": {
    "askPush": false,
    "askStage": true,
    "showChecks": true
  }
}
```

To use Ollama on another machine, point `baseUrl` at it, for example `http://192.168.1.10:11434`.

## How it works

The staged diff, per-file stats, and recent commits (for style) are collected in `src/git/`. `src/prompts/promptEngine.ts` builds a few-shot prompt, `src/providers/` calls Ollama or OpenRouter, and `src/utils/validators.ts` checks the format. `src/workflows/workflowRunner.ts` ties the steps together and handles fallback.

## License

MIT. See [LICENSE](LICENSE).
