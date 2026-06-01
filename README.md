# commitgen

A local-first CLI that turns your staged git changes into a tight, bracketed
commit message in about a second. `git add` your work, run `cgen`, get a
sensible `[feature|bugfix|refactor] description` line and a clean commit.
Backs onto a local Ollama model by default and falls back to OpenRouter
when configured.

## Table of contents

1. [What this builds](#what-this-builds)
2. [Architecture](#architecture)
3. [Key design decisions](#key-design-decisions)
4. [Setup](#setup)
5. [Usage](#usage)
6. [Configuration](#configuration)
7. [Repository tour](#repository-tour)

---

## What this builds

A single command — `cgen` — that owns the path from "I'm done coding" to
"the commit is in." Four properties make it more than a wrapper around
`git commit -m`:

- **Local-first.** Default provider is a local Ollama model
  (`qwen2.5-coder:7b` out of the box). Nothing leaves your machine unless
  you opt into OpenRouter. A weak laptop with no network still produces
  a commit message.
- **Bracketed, single-tag taxonomy.** The prompt is constrained to one
  of three tags — `feature`, `bugfix`, `refactor` — with a few-shot
  block that shows the diff→commit mapping for each. No 27-flavor
  Conventional Commits soup; just the three a reader actually
  distinguishes.
- **Provider fallback.** Configure a `fallbackModel` and the workflow
  silently fails over from primary to backup on any provider error.
  Cloud API down? Local Ollama picks up. Ollama not running? Cloud
  picks up.
- **Pre-commit checks are part of the workflow.** Build / lint / test /
  typecheck commands defined in `.commitgenrc.json` run inside the
  same wizard before the commit is created, so a failing typecheck
  blocks the commit instead of being discovered on push.

## Architecture

Layered, single-process CLI. Five modules, one orchestrator.

```
                 git index
                     │
                     ▼
           ┌──────────────────┐
           │  DiffCollector   │  git diff --cached + per-file stats
           └─────────┬────────┘  + recent commit history for style cues
                     │
                     ▼
           ┌──────────────────┐
           │   PromptEngine   │  system prompt + few-shot examples
           └─────────┬────────┘  + chain-of-thought user prompt
                     │
                     ▼
           ┌──────────────────┐    primary fails
           │   LLMProvider    │────────────────► fallback provider
           │ (Ollama | OpenR.)│                    (Ollama | OpenR.)
           └─────────┬────────┘
                     │  candidate message
                     ▼
           ┌──────────────────┐
           │ResponseValidator │  enforces [tag] desc, ≤72 chars,
           └─────────┬────────┘  imperative mood, no trailing period
                     │
                     ▼
           ┌──────────────────┐
           │   CheckRunner    │  build / lint / test / typecheck
           └─────────┬────────┘  configured in .commitgenrc.json
                     │  all green
                     ▼
              git commit -m
```

**Module responsibilities:**

| Module | Responsibility |
|---|---|
| `src/git/diffCollector.ts` | Reads staged diff, per-file stats, code context, and the last N commits to give the LLM a feel for the repo's style. |
| `src/prompts/promptEngine.ts` | Builds the bracketed-commit system prompt with the 5 few-shot examples plus a chain-of-thought user prompt over the diff. |
| `src/providers/` | `ollama.ts` and `openrouter.ts` implement a common `LLMProvider` interface so the workflow doesn't know which backend it's hitting. |
| `src/workflows/workflowRunner.ts` | Drives the steps: diff → prompt → primary→fallback → validate → check → commit. Owns the fallback logic. |
| `src/checks/checkRunner.ts` | Runs the configured shell commands (build/lint/test/typecheck) and short-circuits the commit if any fails. |
| `src/config/configManager.ts` | Layered config: local `./.commitgenrc.json` overrides global `~/.commitgenrc.json`. Resolves the active model and its provider. |
| `src/cli/main.ts` | Commander entry. Owns the subcommands (`init`, `models`, `use`, `add-model`, `check`, `doctor`) and the interactive wizard. |

## Key design decisions

| Decision | Choice | Why |
|---|---|---|
| Default backend | Local Ollama, not cloud | Privacy + zero ongoing cost + works offline. Cloud is opt-in. |
| Tag set | `feature`, `bugfix`, `refactor` only | Three tags a reader actually distinguishes; richer Conventional Commits sets get ignored in practice. |
| Prompting | Few-shot diff→commit + chain-of-thought | A small open model needs concrete patterns to match against; few-shot moves it from generic to specific without fine-tuning. |
| Provider abstraction | Common interface + factory | Switching from local to cloud is a config edit, not a code change. Same fallback path works in both directions. |
| Pre-commit checks | First-class in the wizard | Catching a failed typecheck *before* the commit is written is cheaper than rebasing it away afterward. |
| Config layering | Global with local override | Most users want one config for every repo; a couple of repos need per-project overrides. Layered config gives both without ceremony. |
| Output format | Single line `[tag] description` | Easy to grep, easy to skim in `git log --oneline`, no body-vs-subject confusion. |

## Setup

### Prerequisites

- **Node.js 18+**
- **One of:**
  - **Ollama** (recommended for local): install from https://ollama.ai
    then `ollama pull qwen2.5-coder:7b`
  - **OpenRouter API key** from https://openrouter.ai/keys (cloud)

### 1. Install

```bash
git clone https://github.com/Vedant-29/commitgen.git
cd commitgen
npm install
npm run build
npm link        # makes `cgen` available globally
```

### 2. First-time config

```bash
cgen init --global    # recommended; works in every repo
# or
cgen init --local     # project-specific .commitgenrc.json
```

The wizard walks you through provider, model, and (for OpenRouter) API
key setup. Without running `init`, the next `cgen` invocation will fail
with "Configuration file not found."

### 3. Set the OpenRouter key (if using cloud)

Pick one — listed in priority order:

| Method | Where | Notes |
|---|---|---|
| Home `.env` | `~/.env` with `OPENROUTER_API_KEY=...` | Recommended. Works in every repo, auto-ignored by git. |
| Project `.env` | `./.env` in a specific repo | Overrides home `.env` per project. |
| Shell env | `export OPENROUTER_API_KEY=...` in `~/.zshrc` | Standard. |
| Config file | `apiKey` in `.commitgenrc.json` | Discouraged — checked-in keys leak. |

## Usage

```bash
git add <files>
cgen                       # interactive wizard
```

`git add` is optional — `cgen` will prompt to stage if nothing is
staged. Other subcommands:

| Command | What |
|---|---|
| `cgen` | Generate a message for staged changes, run checks, commit. |
| `cgen models` | List configured models. |
| `cgen use <name>` | Switch the active model. |
| `cgen add-model` | Add a new model interactively. |
| `cgen check` | Run the configured pre-commit checks only. |
| `cgen doctor` | Diagnose the setup (Ollama reachable? key present? config valid?). |

## Configuration

### Layering

1. **Local** `./.commitgenrc.json` (project-specific, overrides global)
2. **Global** `~/.commitgenrc.json` (used in every repo)

The recommended setup is a global config plus per-project overrides
only where needed.

### Example

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

Switching models without editing the file:

```bash
cgen use cloud-claude
# or, per-invocation
COMMITGEN_ACTIVE_MODEL=cloud-claude cgen
```

### Remote Ollama

If Ollama is running on another machine (e.g. a GPU box), point
`baseUrl` at it:

```json
"baseUrl": "http://192.168.1.10:11434"
```

## Repository tour

```
src/
├── cli/
│   ├── main.ts            # commander entry, subcommand dispatch
│   ├── wizard.ts          # interactive enquirer flow
│   └── statusDisplay.ts   # ora spinners + status lines
├── config/
│   └── configManager.ts   # layered config + active model resolution
├── git/
│   ├── diffCollector.ts           # staged diff + per-file stats
│   ├── codeContextExtractor.ts    # surrounding code for the LLM
│   └── commitHistoryRetriever.ts  # last N commits as style examples
├── prompts/
│   └── promptEngine.ts    # system prompt + few-shot + CoT user prompt
├── providers/
│   ├── base.ts            # LLMProvider interface
│   ├── ollama.ts          # local Ollama HTTP client
│   ├── openrouter.ts      # OpenRouter HTTP client
│   └── index.ts           # ProviderFactory
├── workflows/
│   └── workflowRunner.ts  # full diff→commit pipeline + fallback
├── checks/
│   └── checkRunner.ts     # run build/lint/test/typecheck shell cmds
└── utils/
    ├── validators.ts      # ResponseValidator (tag + length + mood)
    ├── logger.ts
    ├── ui.ts
    ├── theme.ts
    └── promptUtils.ts
```

## License

MIT
