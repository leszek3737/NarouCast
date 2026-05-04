# AGENTS.md

## Project

Node.js CLI app that scrapes Japanese web novel chapters from Syosetu, translates them to Polish (DeepSeek/OpenAI/Google Translate), saves Markdown with front matter, and optionally generates MP3 audio (OpenAI/Google TTS). ESM (`"type": "module"` in package.json).

## Commands

```bash
npm run lint          # ESLint on src/
npm run test:unit     # Node built-in test runner on tests/unit/
npm run test:integration  # tests/integration/
npm run test          # All tests
npm start             # Run CLI
npm run dev           # CLI with --inspect (for debugging)
npm run build-tui     # Babel-builds src/tui/ -> dist/
npm run tui           # Run built TUI
npm run config        # Run simple config TUI
npm run format        # Prettier on src/
```

## Key Architecture

- **Entry point**: `src/cli/index.js` — Commander CLI, orchestrates scraping → translation → writing → TTS
- **TUI**: `src/tui/` — Ink (React) based TUI with JSX, requires Babel build (`npm run build-tui`) before running
- **Modules**: `src/parsers/`, `src/scrapers/`, `src/translators/`, `src/tts/`, `src/navigation/`, `src/file-manager/`, `src/shared/`
- **Config**: `.env` file (API keys, output dirs) + `ConfigManager` in `src/shared/config-manager.js` persists to `config/config.json`
- **Type definitions**: `src/types/config.ts` — exists but TypeScript is not used for compilation
- **Tests**: Node built-in test runner (`node:test` + `node:assert/strict`), NOT Jest/Mocha

## Conventions

- ESM imports throughout (`import/export`), not CommonJS
- ESLint: semicolons required, single quotes, `no-console: off`
- Babel with `@babel/preset-react` for JSX in TUI files
- `.env` loaded from project root via `dotenv.config()` — paths relative to `src/cli/` with `../../.env`
- Translation providers are dynamically imported via `await import(...)` in `createTranslator()`
- User-facing messages in Polish (console output, CLI descriptions)
- `.env.example` lists minimal vars; actual `.env` may have more (e.g., `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `TTS_PROVIDER`, `TTS_VOICE`, `GOOGLE_APPLICATION_CREDENTIALS`)
