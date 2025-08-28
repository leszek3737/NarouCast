#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { SyosetuParser } from "../parsers/syosetu-parser.js";
import { WebScraper } from "../scrapers/web-scraper.js";
import { DeepSeekTranslator } from "../translators/deepseek-translator.js";
import { GoogleTranslator } from "../translators/google-translator.js";
import { OpenAI4oMiniTranslator } from "../translators/openai-4o-mini-translator.js";
import { MarkdownWriter } from "../file-manager/markdown-writer.js";
import { ChapterNavigator } from "../navigation/chapter-navigator.js";
import { TTSManager } from "../tts/tts-manager.js";
import { ConfigManager } from "../shared/config-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../../.env") });

class SyosetuTranslatorApp {
  constructor(options = {}) {
    this.configManager = new ConfigManager();
    this.options = {
      apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY,
      googleApiKey: options.googleApiKey || process.env.GOOGLE_API_KEY,
      openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
      translator: options.translator || process.env.TRANSLATOR || "deepseek",
      outputDir: options.outputDir || process.env.OUTPUT_DIR || "./output",
      autoContinue: options.autoContinue !== false,
      chapterDelay:
        options.chapterDelay || parseInt(process.env.CHAPTER_DELAY) || 3,
      maxRetries: options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3,
      tts: options.tts || process.env.TTS_PROVIDER || "none",
      voice: options.voice || process.env.TTS_VOICE,
      audioDir: options.audioDir || process.env.AUDIO_DIR || "./audio",
      ttsSpeed: options.ttsSpeed || parseFloat(process.env.TTS_SPEED) || 1.0,
      googleCredentials:
        options.googleCredentials || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      ...options,
    };
  }

  async initializeComponents() {
    const savedConfig = await this.configManager.loadConfig();

    // Override options with saved config if not explicitly provided
    this.options = {
      ...this.options,
      translator:
        this.options.translator === "deepseek" &&
        savedConfig.translator?.provider
          ? savedConfig.translator.provider
          : this.options.translator,
      apiKey:
        !this.options.apiKey && savedConfig.translator?.apiKey
          ? savedConfig.translator.apiKey
          : this.options.apiKey,
      googleApiKey:
        !this.options.googleApiKey &&
        savedConfig.translator?.apiKey &&
        savedConfig.translator?.provider === "google"
          ? savedConfig.translator.apiKey
          : this.options.googleApiKey,
      openaiApiKey:
        !this.options.openaiApiKey &&
        savedConfig.translator?.apiKey &&
        savedConfig.translator?.provider === "openai"
          ? savedConfig.translator.apiKey
          : this.options.openaiApiKey,
      outputDir:
        this.options.outputDir === "./output" && savedConfig.output?.directory
          ? savedConfig.output.directory
          : this.options.outputDir,
      autoContinue:
        this.options.autoContinue &&
        savedConfig.general?.autoContinue !== undefined
          ? savedConfig.general.autoContinue
          : this.options.autoContinue,
      chapterDelay:
        this.options.chapterDelay === 3 && savedConfig.general?.chapterDelay
          ? savedConfig.general.chapterDelay
          : this.options.chapterDelay,
      tts:
        this.options.tts === "none" && savedConfig.tts?.provider
          ? savedConfig.tts.provider
          : this.options.tts,
      voice:
        !this.options.voice && savedConfig.tts?.voice
          ? savedConfig.tts.voice
          : this.options.voice,
      audioDir:
        this.options.audioDir === "./audio" &&
        savedConfig.output?.audioDirectory
          ? savedConfig.output.audioDirectory
          : this.options.audioDir,
      ttsSpeed:
        this.options.ttsSpeed === 1.0 && savedConfig.tts?.speed
          ? savedConfig.tts.speed
          : this.options.ttsSpeed,
      googleCredentials:
        !this.options.googleCredentials && savedConfig.google?.credentialsPath
          ? savedConfig.google.credentialsPath
          : this.options.googleCredentials,
    };

    // Set Google credentials environment variable if provided
    if (this.options.googleCredentials) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS =
        this.options.googleCredentials;
    }

    this.scraper = new WebScraper({});
    this.translator = this.createTranslator();
    this.writer = new MarkdownWriter(this.options.outputDir);
    this.ttsManager = this.createTTSManager();
    this.navigator = new ChapterNavigator({
      chapterDelay: this.options.chapterDelay * 1000,
      autoContinue: this.options.autoContinue,
      maxChapters: this.options.maxChapters || 1000,
    });
  }

  createTranslator() {
    switch (this.options.translator.toLowerCase()) {
      case "google":
        GoogleTranslator.validateApiKey(this.options.googleApiKey);
        return new GoogleTranslator(this.options.googleApiKey);
      case "openai":
        OpenAI4oMiniTranslator.validateApiKey(this.options.openaiApiKey);
        return new OpenAI4oMiniTranslator(this.options.openaiApiKey);
      case "deepseek":
      default:
        DeepSeekTranslator.validateApiKey(this.options.apiKey);
        return new DeepSeekTranslator(this.options.apiKey);
    }
  }

  createTTSManager() {
    return new TTSManager({
      provider: this.options.tts,
      voice: this.options.voice,
      audioDir: this.options.audioDir,
      speed: this.options.ttsSpeed,
      openaiApiKey: this.options.openaiApiKey,
      googleCredentials: this.options.googleCredentials,
    });
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, "../../config/config.json");
      const configData = fs.readFileSync(configPath, "utf8");
      return JSON.parse(configData);
    } catch (error) {
      console.warn(
        "Nie można załadować config.json, używam wartości domyślnych",
      );
      return {
        deepseek: {},
        scraping: {},
        navigation: {},
        output: {},
      };
    }
  }

  async processChapter(url) {
    console.log(`\\n📖 Przetwarzanie: ${url}`);

    const parsedUrl = SyosetuParser.parseUrl(url);
    console.log(
      `📝 Seria: ${parsedUrl.seriesId}, Rozdział: ${parsedUrl.chapterNumber}`,
    );

    const scrapedData = await this.scraper.scrapeChapter(url);
    console.log(`✓ Pobrano: "${scrapedData.title}"`);

    const translatedData = await this.translator.translateChapter(
      scrapedData.title,
      scrapedData.content,
    );
    console.log("✓ Przetłumaczono na polski");

    const filename = SyosetuParser.buildFilename(
      parsedUrl.seriesId,
      parsedUrl.chapterNumber,
      translatedData.title,
    );

    const chapterData = {
      title: translatedData.title,
      content: translatedData.content,
      originalUrl: url,
      chapterNumber: parsedUrl.chapterNumber,
      seriesId: parsedUrl.seriesId,
    };

    await this.writer.writeChapter(chapterData, filename);

    // Generowanie audio jeśli TTS jest włączone
    let audioFilePath = null;
    if (this.ttsManager.isEnabled()) {
      try {
        audioFilePath = await this.ttsManager.generateChapterAudio(chapterData);
      } catch (error) {
        console.warn(`⚠️  Nie udało się wygenerować audio: ${error.message}`);
      }
    }

    return {
      ...chapterData,
      filename,
      audioFilePath,
      nextChapterUrl: scrapedData.nextChapterUrl,
    };
  }

  async run(url) {
    try {
      console.log("🚀 Syosetu Translator - Rozpoczynam pracę");
      console.log(`📁 Katalog wyjściowy: ${this.options.outputDir}`);
      console.log(`🔄 Auto-continue: ${this.options.autoContinue}`);
      console.log(`⏱️  Opóźnienie: ${this.options.chapterDelay}s`);
      console.log(
        `🔊 TTS: ${this.options.tts}${this.options.voice ? ` (głos: ${this.options.voice})` : ""}`,
      );

      const result = await this.navigator.processChapterSequence(
        url,
        (chapterUrl) => this.processChapter(chapterUrl),
      );

      console.log("\\n🎉 Ukończono pomyślnie!");
      return result;
    } catch (error) {
      console.error(`\\n❌ Błąd: ${error.message}`);
      if (error.stack && process.env.NODE_ENV === "development") {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }
}

const program = new Command();

program
  .name("syosetu-translator")
  .description("Pobiera i tłumaczy rozdziały z serwisu Syosetu na język polski")
  .version("1.0.0");

program
  .argument("<url>", "URL rozdziału z serwisu Syosetu")
  .argument("[output-dir]", "Katalog wyjściowy dla plików MD", "./output")
  .option(
    "--no-auto-continue",
    "Zatrzymaj po każdym rozdziale i czekaj na potwierdzenie",
  )
  .option("--delay <seconds>", "Opóźnienie między rozdziałami w sekundach", "3")
  .option("--api-key <key>", "Klucz API DeepSeek")
  .option("--google-api-key <key>", "Klucz API Google Translate")
  .option("--openai-api-key <key>", "Klucz API OpenAI")
  .option(
    "--translator <type>",
    "Typ translatora: deepseek, google, openai",
    "deepseek",
  )
  .option("--tts <provider>", "Provider TTS: openai, google, none", "none")
  .option(
    "--voice <voice>",
    "Wybór głosu TTS (np. alloy, nova, pl-PL-Wavenet-A)",
  )
  .option("--audio-dir <dir>", "Katalog dla plików audio", "./audio")
  .option("--speed <speed>", "Szybkość czytania (0.25 - 4.0)", "1.0")
  .option(
    "--max-chapters <number>",
    "Maksymalna liczba rozdziałów do przetworzenia",
    "1000",
  )
  .option("--google-credentials <path>", "Ścieżka do pliku credentials Google")
  .action(async (url, outputDir, options) => {
    try {
      const app = new SyosetuTranslatorApp({
        apiKey: options.apiKey,
        googleApiKey: options.googleApiKey,
        openaiApiKey: options.openaiApiKey,
        translator: options.translator,
        outputDir,
        autoContinue: options.autoContinue,
        chapterDelay: parseInt(options.delay),
        maxChapters: parseInt(options.maxChapters),
        tts: options.tts,
        voice: options.voice,
        audioDir: options.audioDir,
        ttsSpeed: parseFloat(options.speed),
        googleCredentials: options.googleCredentials,
      });

      await app.initializeComponents();
      await app.run(url);
    } catch (error) {
      console.error(`Błąd inicjalizacji: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();
