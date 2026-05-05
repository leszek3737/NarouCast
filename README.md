# NarouCast

Fetch, translate, and voice Syosetu web novel chapters to polished Polish.
Node.js CLI that scrapes chapters, translates them via DeepSeek, OpenAI, Google Translate, or any OpenAI-compatible API, saves Markdown, and optionally generates MP3 audio via OpenAI or Google TTS.

---

## Features

- Pulls title and body from a given Syosetu chapter URL
- Translates to Polish with providers: DeepSeek, OpenAI, Google Translate, OpenAI-compatible
- OpenAI-compatible provider: works with any endpoint supporting OpenAI chat completions format (DeepSeek, Mistral, Ollama, LM Studio, vLLM, LocalAI, etc.)
- Preserves tone (configurable style hints and glossary)
- Saves each chapter as Markdown with front matter
- Follows "Next" to process subsequent chapters automatically
- Text-to-Speech: produces MP3 per chapter with provider: OpenAI, Google TTS, or disabled

---

## Requirements

- Node.js >= 18.0.0
- API key for at least one translation provider

---

## Installation

```bash
git clone <repo-url>
cd NarouCast
npm install
cp .env.example .env
# Edit .env with your API keys
```

---

## Quick Start

```bash
# Single chapter
node src/cli/index.js https://ncode.syosetu.com/novel/123456789/

# With specific translator
node src/cli/index.js <url> --translator deepseek
node src/cli/index.js <url> --translator openai
node src/cli/index.js <url> --translator google
node src/cli/index.js <url> --translator openai-compatible

# Multiple chapters
node src/cli/index.js <url> --chapters 5 --delay 5

# With TTS
node src/cli/index.js <url> --tts openai --voice nova

# Config TUI
npm run config
```

---

## Translation Providers

### DeepSeek (default)

```bash
node src/cli/index.js <url> --translator deepseek --api-key sk-xxx
```

| Env var | CLI flag | Default |
|---------|----------|---------|
| `DEEPSEEK_API_KEY` | `--api-key` | — |

Model: `deepseek-chat`. Endpoint: `https://api.deepseek.com/v1/chat/completions`.

### OpenAI

```bash
node src/cli/index.js <url> --translator openai --openai-api-key sk-xxx
```

| Env var | CLI flag | Default |
|---------|----------|---------|
| `OPENAI_API_KEY` | `--openai-api-key` | — |

Model: `gpt-4o-mini`. Endpoint: `https://api.openai.com/v1/chat/completions`.

### Google Translate

```bash
node src/cli/index.js <url> --translator google --google-api-key xxx
```

| Env var | CLI flag | Default |
|---------|----------|---------|
| `GOOGLE_API_KEY` | `--google-api-key` | — |

Uses Google Cloud Translate API v2. Not LLM-based — direct translation, no prompts.

### OpenAI-compatible (any provider)

Works with any API implementing OpenAI chat completions format (`/v1/chat/completions`).

```bash
node src/cli/index.js <url> \
  --translator openai-compatible \
  --generic-api-key sk-xxx \
  --generic-api-url https://api.deepseek.com/v1/chat/completions \
  --generic-model deepseek-chat
```

| Env var | CLI flag | Default |
|---------|----------|---------|
| `GENERIC_OPENAI_API_KEY` | `--generic-api-key` | — |
| `GENERIC_OPENAI_API_URL` | `--generic-api-url` | `https://api.openai.com/v1/chat/completions` |
| `GENERIC_OPENAI_MODEL` | `--generic-model` | `gpt-4o-mini` |

#### Examples

**DeepSeek via generic provider:**
```bash
node src/cli/index.js <url> --translator openai-compatible \
  --generic-api-key sk-xxx \
  --generic-api-url https://api.deepseek.com/v1/chat/completions \
  --generic-model deepseek-chat
```

**Local Ollama:**
```bash
node src/cli/index.js <url> --translator openai-compatible \
  --generic-api-key ollama \
  --generic-api-url http://localhost:11434/v1/chat/completions \
  --generic-model llama3
```

**LM Studio:**
```bash
node src/cli/index.js <url> --translator openai-compatible \
  --generic-api-key lm-studio \
  --generic-api-url http://localhost:1234/v1/chat/completions \
  --generic-model local-model
```

**Mistral API:**
```bash
node src/cli/index.js <url> --translator openai-compatible \
  --generic-api-key sk-xxx \
  --generic-api-url https://api.mistral.ai/v1/chat/completions \
  --generic-model mistral-small-latest
```

#### Config override via config.json

The generic provider also reads from saved config (`~/.syosetu-translator/config.json`):

```json
{
  "translator": {
    "provider": "openai-compatible",
    "apiKey": "sk-xxx",
    "apiUrl": "https://api.deepseek.com/v1/chat/completions",
    "model": "deepseek-chat"
  }
}
```

Edit via TUI: `npm run config`, select "OpenAI-compatible", enter API key.

---

## Text-to-Speech

### OpenAI TTS

```bash
node src/cli/index.js <url> --tts openai --voice nova --openai-api-key sk-xxx
```

Voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`.

### Google Cloud TTS

```bash
node src/cli/index.js <url> --tts google --voice pl-PL-Wavenet-A --google-credentials /path/to/credentials.json
```

### Streaming TTS (experimental)

```bash
node src/cli/index.js <url> --tts openai --voice nova --streaming-tts
```

---

## Configuration

### Environment variables (.env)

```env
# Translation
TRANSLATOR=deepseek              # deepseek | openai | google | openai-compatible
DEEPSEEK_API_KEY=sk-xxx
OPENAI_API_KEY=sk-xxx
GOOGLE_API_KEY=xxx
GENERIC_OPENAI_API_KEY=sk-xxx
GENERIC_OPENAI_API_URL=https://api.openai.com/v1/chat/completions
GENERIC_OPENAI_MODEL=gpt-4o-mini

# TTS
TTS_PROVIDER=none                # openai | google | none
TTS_VOICE=nova
TTS_SPEED=1.0
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Output
OUTPUT_DIR=./output
AUDIO_DIR=./audio
CHAPTER_DELAY=3
MAX_RETRIES=3
```

### Config file (~/.syosetu-translator/config.json)

```json
{
  "translator": {
    "provider": "openai-compatible",
    "apiKey": "sk-xxx",
    "apiUrl": "https://api.deepseek.com/v1/chat/completions",
    "model": "deepseek-chat"
  },
  "tts": {
    "provider": "openai",
    "voice": "nova",
    "speed": 1.0
  },
  "output": {
    "directory": "./output",
    "audioDirectory": "./audio"
  },
  "general": {
    "chapterDelay": 3,
    "chapters": 0
  }
}
```

API keys are encrypted at rest (AES-256-GCM).

### Interactive TUI

```bash
npm run config
```

Select provider, enter API key, choose TTS options. Saves to `~/.syosetu-translator/config.json`.

---

## All CLI Options

```
node src/cli/index.js <url> [output-dir] [options]

Options:
  --translator <type>          Translator: deepseek, google, openai, openai-compatible (default: deepseek)
  --api-key <key>              DeepSeek API key
  --openai-api-key <key>       OpenAI API key
  --google-api-key <key>       Google Translate API key
  --generic-api-key <key>      OpenAI-compatible API key
  --generic-api-url <url>      OpenAI-compatible API URL
  --generic-model <model>      OpenAI-compatible model name
  --delay <seconds>            Delay between chapters (default: 3)
  --chapters <number>          Number of chapters to process (0 = all)
  --tts <provider>             TTS provider: openai, google, none (default: none)
  --voice <voice>              TTS voice name
  --speed <speed>              TTS speed 0.25-4.0 (default: 1.0)
  --audio-dir <dir>            Audio output directory (default: ./audio)
  --google-credentials <path>  Google credentials JSON path
  --batch                      Enable batch processing (experimental)
  --batch-size <number>        Batch size (default: 3)
  --batch-concurrency <number> Concurrency in batch (default: 2)
  --no-caching                 Disable smart caching
  --no-connection-pooling      Disable HTTP connection pooling
  --no-error-monitoring        Disable error rate monitoring
  --streaming-tts              Enable streaming TTS (experimental)
  --benchmarking               Enable performance benchmarking
```

---

## Development

```bash
npm run lint          # ESLint
npm run format        # Prettier
npm test              # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests
npm run dev           # CLI with --inspect (debugging)
npm run build-tui     # Build TUI (Babel)
npm run tui           # Run built TUI
npm run config        # Simple config TUI
```

---

## Output

Each chapter saved as Markdown with YAML front matter:

```markdown
---
title: "Przetłumaczony tytuł"
source: https://ncode.syosetu.com/novel/123456789/chapter/1
chapter: 1
series: "123456789"
---

Przetłumaczony tekst rozdziału...
```

---

## Legal & Ethics

- Use responsibly. Scraping and automated translation may be restricted by the source site's Terms of Service and local law.
- This tool is intended for personal, non-commercial use. Respect original authors and rights holders.
- Do not distribute or publicly share translated texts or audio files produced by this application. Outputs are intended for private, personal use only.
- This project is an independent tool and is not affiliated with or endorsed by the original site or its authors.

---

## Acknowledgements

- Parts of this project, including translation workflow design and initial prototyping, were created with the assistance of Claude Code, leveraging DeepSeek 3.1 for translation experiments and integration design.
- Translation engines used at runtime may include DeepSeek, OpenAI, Google Translate, or any OpenAI-compatible endpoint per configuration.
