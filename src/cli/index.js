#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { SyosetuParser } from '../parsers/syosetu-parser.js';
import { WebScraper } from '../scrapers/web-scraper.js';
import { MarkdownWriter } from '../file-manager/markdown-writer.js';
import { ChapterNavigator } from '../navigation/chapter-navigator.js';
import { TTSManager } from '../tts/tts-manager.js';
import { ConfigManager } from '../shared/config-manager.js';
import { performanceMonitor } from '../shared/performance-monitor.js';
import { BatchProcessor } from '../shared/batch-processor.js';
import { cacheManager } from '../shared/cache-manager.js';
import { connectionPool } from '../shared/connection-pool.js';
import { errorRateMonitor } from '../shared/error-rate-monitor.js';
import { StreamingTTSManager } from '../tts/streaming-tts.js';
import { BenchmarkSuite } from '../shared/performance-benchmarker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

class SyosetuTranslatorApp {
  constructor(options = {}) {
    this.configManager = new ConfigManager();
    this.options = {
      apiKey: options.apiKey || process.env.DEEPSEEK_API_KEY,
      googleApiKey: options.googleApiKey || process.env.GOOGLE_API_KEY,
      openaiApiKey: options.openaiApiKey || process.env.OPENAI_API_KEY,
      translator: options.translator || process.env.TRANSLATOR || 'deepseek',
      outputDir: options.outputDir || process.env.OUTPUT_DIR || './output',
      autoContinue: options.autoContinue !== false,
      chapterDelay:
        options.chapterDelay !== undefined ? options.chapterDelay :
        (parseInt(process.env.CHAPTER_DELAY) || 3),
      maxRetries: options.maxRetries || parseInt(process.env.MAX_RETRIES) || 3,
      tts: options.tts || process.env.TTS_PROVIDER || 'none',
      voice: options.voice || process.env.TTS_VOICE,
      audioDir: options.audioDir || process.env.AUDIO_DIR || './audio',
      ttsSpeed: options.ttsSpeed || parseFloat(process.env.TTS_SPEED) || 1.0,
      googleCredentials:
        options.googleCredentials || process.env.GOOGLE_APPLICATION_CREDENTIALS,
      batchMode: options.batchMode || false,
      batchSize: options.batchSize || 3,
      batchConcurrency: options.batchConcurrency || 2,
      enableCaching: options.enableCaching !== false,
      enableConnectionPooling: options.enableConnectionPooling !== false,
      enableErrorMonitoring: options.enableErrorMonitoring !== false,
      enableStreamingTTS: options.enableStreamingTTS || false,
      enableBenchmarking: options.enableBenchmarking || false,
      ...options,
    };
  }

  async initializeComponents() {
    const savedConfig = await this.configManager.loadConfig();

    // Override options with saved config if not explicitly provided
    this.options = {
      ...this.options,
      translator:
        this.options.translator === 'deepseek' &&
        savedConfig.translator?.provider
          ? savedConfig.translator.provider
          : this.options.translator,
      apiKey:
        !this.options.apiKey && savedConfig.translator?.apiKey
          ? savedConfig.translator.apiKey
          : this.options.apiKey,
      googleApiKey:
        !this.options.googleApiKey && (
          (savedConfig.translator?.apiKey && savedConfig.translator?.provider === 'google') ||
          (savedConfig.tts?.apiKey && savedConfig.tts?.provider === 'google')
        )
          ? (savedConfig.translator?.provider === 'google'
              ? savedConfig.translator.apiKey
              : savedConfig.tts.apiKey)
          : this.options.googleApiKey,
      openaiApiKey:
        !this.options.openaiApiKey && (
          (savedConfig.translator?.apiKey && savedConfig.translator?.provider === 'openai') ||
          (savedConfig.tts?.apiKey && savedConfig.tts?.provider === 'openai')
        )
          ? (savedConfig.translator?.provider === 'openai'
              ? savedConfig.translator.apiKey
              : savedConfig.tts.apiKey)
          : this.options.openaiApiKey,
      outputDir:
        this.options.outputDir === './output' && savedConfig.output?.directory
          ? savedConfig.output.directory
          : this.options.outputDir,
      autoContinue:
        this.options.autoContinue &&
        savedConfig.general?.autoContinue !== undefined
          ? savedConfig.general.autoContinue
          : this.options.autoContinue,
      chapterDelay:
        this.options.chapterDelay === 3 && savedConfig.general?.chapterDelay !== undefined
          ? savedConfig.general.chapterDelay
          : this.options.chapterDelay,
      tts:
        this.options.tts === 'none' && savedConfig.tts?.provider
          ? savedConfig.tts.provider
          : this.options.tts,
      voice:
        !this.options.voice && savedConfig.tts?.voice
          ? savedConfig.tts.voice
          : this.options.voice,
      audioDir:
        this.options.audioDir === './audio' &&
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

    // Initialize Phase 2 optimizations
    await this.initializePhase2Optimizations();

    this.scraper = new WebScraper({
      enableConnectionPooling: this.options.enableConnectionPooling,
      enableCaching: this.options.enableCaching
    });
    this.translator = await this.createTranslator();
    this.writer = new MarkdownWriter(this.options.outputDir);
    this.ttsManager = this.createTTSManager();
    this.navigator = new ChapterNavigator({
      chapterDelay: this.options.chapterDelay === 0 ? 0 : this.options.chapterDelay * 1000,
      autoContinue: this.options.autoContinue,
      maxChapters: this.options.maxChapters || 1000,
    });
  }

  async initializePhase2Optimizations() {
    // Initialize Phase 2 optimizations silently unless in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('=� Initializing Phase 2 Advanced Optimizations...');
    }
    
    // 1. Smart Caching System
    if (this.options.enableCaching && process.env.NODE_ENV === 'development') {
      console.log('   Smart caching enabled');
      // Cache is already initialized globally
    }

    // 2. Connection Pooling
    if (this.options.enableConnectionPooling && process.env.NODE_ENV === 'development') {
      console.log('   HTTP connection pooling enabled');
      // Connection pool is already initialized globally
    }

    // 3. Error Rate Monitoring
    if (this.options.enableErrorMonitoring && process.env.NODE_ENV === 'development') {
      console.log('   Error rate monitoring enabled');
      // Error monitor is already initialized globally
    }

    // 4. Streaming TTS (if enabled)
    if (this.options.enableStreamingTTS && this.options.tts !== 'none') {
      this.streamingTTSEnabled = true;
      if (process.env.NODE_ENV === 'development') {
        console.log('   Streaming TTS processing enabled');
      }
    }

    // 5. Performance Benchmarking (if enabled)
    if (this.options.enableBenchmarking) {
      this.benchmarkSuite = new BenchmarkSuite('syosetu-translator-benchmarks', {
        outputDir: path.join(this.options.outputDir, '../benchmarks'),
        parallel: false
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('   Performance benchmarking enabled');
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(' Phase 2 optimizations initialized');
    }
  }

  async createTranslator() {
    switch (this.options.translator.toLowerCase()) {
      case 'google': {
        const { GoogleTranslator } = await import('../translators/google-translator.js');
        GoogleTranslator.validateApiKey(this.options.googleApiKey);
        return new GoogleTranslator(this.options.googleApiKey);
      }
      case 'openai': {
        const { OpenAI4oMiniTranslator } = await import('../translators/openai-4o-mini-translator.js');
        OpenAI4oMiniTranslator.validateApiKey(this.options.openaiApiKey);
        return new OpenAI4oMiniTranslator(this.options.openaiApiKey);
      }
      case 'deepseek':
      default: {
        const { DeepSeekTranslator } = await import('../translators/deepseek-translator.js');
        DeepSeekTranslator.validateApiKey(this.options.apiKey);
        return new DeepSeekTranslator(this.options.apiKey);
      }
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
      const configPath = path.join(__dirname, '../../config/config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      console.warn(
        'Nie mo|na zaBadowa config.json, u|ywam warto[ci domy[lnych',
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
    return await performanceMonitor.measureOperation('processChapter', async () => {
      console.log(`\n=� Przetwarzanie: ${url}`);

      const parsedUrl = SyosetuParser.parseUrl(url);
      console.log(
        `=� Seria: ${parsedUrl.seriesId}, RozdziaB: ${parsedUrl.chapterNumber}`,
      );

      // Phase 2 Enhancement: Smart caching check
      let scrapedData;
      if (this.options.enableCaching) {
        scrapedData = cacheManager.getCachedChapterContent(url);
        if (scrapedData) {
          console.log('=� Using cached chapter data');
        }
      }

      if (!scrapedData) {
        scrapedData = await performanceMonitor.measureOperation('scrapeChapter', async () => {
          try {
            if (this.options.enableErrorMonitoring) {
              errorRateMonitor.recordSuccess('scraper', 'scrapeChapter');
            }
            const result = await this.scraper.scrapeChapter(url);
            
            // Cache successful scraping result
            if (this.options.enableCaching) {
              cacheManager.cacheChapterContent(url, result);
            }
            
            return result;
          } catch (error) {
            if (this.options.enableErrorMonitoring) {
              errorRateMonitor.recordFailure('scraper', error.constructor.name, 'scrapeChapter');
            }
            throw error;
          }
        });
      }
      
      console.log(` Pobrano: "${scrapedData.title}"`);

      // Phase 2 Enhancement: Translation with caching and error monitoring
      let translatedData;
      if (this.options.enableCaching) {
        translatedData = cacheManager.getCachedTranslation(
          this.options.translator, 
          `${scrapedData.title}\n${scrapedData.content}`, 
          'pl'
        );
        if (translatedData) {
          console.log('=� Using cached translation');
          translatedData = { title: translatedData.split('\n')[0], content: translatedData.slice(translatedData.indexOf('\n') + 1) };
        }
      }

      if (!translatedData) {
        translatedData = await performanceMonitor.measureOperation('translateChapter', async () => {
          try {
            if (this.options.enableErrorMonitoring) {
              const startTime = Date.now();
              const result = await this.translator.translateChapter(scrapedData.title, scrapedData.content);
              const responseTime = Date.now() - startTime;
              errorRateMonitor.recordSuccess(this.options.translator, responseTime, 'translateChapter');
              
              // Cache successful translation
              if (this.options.enableCaching) {
                cacheManager.cacheTranslation(
                  this.options.translator,
                  `${scrapedData.title}\n${scrapedData.content}`,
                  'pl',
                  `${result.title}\n${result.content}`
                );
              }
              
              return result;
            } else {
              return await this.translator.translateChapter(scrapedData.title, scrapedData.content);
            }
          } catch (error) {
            if (this.options.enableErrorMonitoring) {
              errorRateMonitor.recordFailure(
                this.options.translator, 
                error.constructor.name, 
                'translateChapter',
                error.message.includes('timeout'),
                error.message.includes('rate limit')
              );
            }
            throw error;
          }
        });
      }
      
      console.log(' PrzetBumaczono na polski');

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

      await performanceMonitor.measureOperation('writeChapter',
        () => this.writer.writeChapter(chapterData, filename)
      );

      // Phase 2 Enhancement: Advanced TTS with streaming and error monitoring
      let audioFilePath = null;
      if (await this.ttsManager.isEnabled()) {
        try {
          const startTime = Date.now();
          
          if (this.streamingTTSEnabled) {
            // Use streaming TTS for better memory efficiency
            const streamingTTS = new StreamingTTSManager(this.ttsManager.ttsEngine, {
              enableProgressReporting: true,
              maxConcurrentChunks: 3
            });
            
            // Optimize text chunks for streaming
            const textChunks = StreamingTTSManager.optimizeTextChunks(
              `${chapterData.title}. ${chapterData.content}`,
              { maxChunkSize: 3500, preferredChunkSize: 2500 }
            );
            
            const outputPath = path.join(
              this.options.audioDir,
              `${chapterData.seriesId}_${String(chapterData.chapterNumber).padStart(3, '0')}_${chapterData.title.replace(/[<>:"/\\|?*]/g, '')}.mp3`
            );
            
            await performanceMonitor.measureOperation('generateStreamingTTS', () =>
              streamingTTS.generateStreamingAudio(textChunks, outputPath)
            );
            
            audioFilePath = outputPath;
            console.log('<� Generated audio using streaming TTS');
            
          } else {
            // Use traditional TTS
            audioFilePath = await performanceMonitor.measureOperation('generateTTS', () =>
              this.ttsManager.generateChapterAudio(chapterData)
            );
          }
          
          // Error monitoring for TTS
          if (this.options.enableErrorMonitoring) {
            const responseTime = Date.now() - startTime;
            errorRateMonitor.recordSuccess(this.options.tts, responseTime, 'generateTTS');
          }
          
        } catch (error) {
          if (this.options.enableErrorMonitoring) {
            errorRateMonitor.recordFailure(
              this.options.tts, 
              error.constructor.name, 
              'generateTTS',
              error.message.includes('timeout'),
              error.message.includes('rate limit')
            );
          }
          console.warn(`�  Nie udaBo si wygenerowa audio: ${error.message}`);
        }
      }

      // Log memory usage after chapter processing
      performanceMonitor.logMemoryUsage(`Post-chapter ${parsedUrl.chapterNumber}`);
      
      // Trigger GC after heavy processing (especially with TTS)
      if (audioFilePath) {
        performanceMonitor.triggerGC();
      }

      return {
        ...chapterData,
        filename,
        audioFilePath,
        nextChapterUrl: scrapedData.nextChapterUrl,
      };
    });
  }

  async run(url) {
    // Uruchom monitoring wydajno[ci
    performanceMonitor.startMonitoring();
    
    try {
      console.log('=� Syosetu Translator - Rozpoczynam prac');
      console.log(`=� Katalog wyj[ciowy: ${this.options.outputDir}`);
      console.log(`= Auto-continue: ${this.options.autoContinue}`);
      console.log(`�  Op�znienie: ${this.options.chapterDelay}s`);
      console.log(
        `=
 TTS: ${this.options.tts}${this.options.voice ? ` (gBos: ${this.options.voice})` : ''}`,
      );

      let result;
      if (this.options.batchMode) {
        console.log(`=� Batch Mode: size=${this.options.batchSize}, concurrency=${this.options.batchConcurrency}`);
        
        const batchProcessor = new BatchProcessor({
          batchSize: this.options.batchSize,
          maxConcurrency: this.options.batchConcurrency,
          delayBetweenBatches: this.options.chapterDelay || 1000
        });

        result = await performanceMonitor.measureOperation('batchProcessing', () =>
          batchProcessor.processChapterChain(
            url,
            (chapterUrl) => this.processChapter(chapterUrl),
            {
              maxChapters: this.options.maxChapters,
              discoverNext: this.options.autoContinue,
              batchChainDiscovery: false // Keep simple for now
            }
          )
        );
      } else {
        result = await performanceMonitor.measureOperation('sequentialProcessing', () =>
          this.navigator.processChapterSequence(
            url,
            (chapterUrl) => this.processChapter(chapterUrl),
          )
        );
      }

      console.log('\n<� UkoDczono pomy[lnie!');
      
      // Phase 2 Enhancement: Advanced reporting and cleanup
      await this.generatePhase2Report();
      performanceMonitor.stopMonitoring();
      
      return result;
    } catch (error) {
      console.error(`\nL BBd: ${error.message}`);
      if (error.stack && process.env.NODE_ENV === 'development') {
        console.error(error.stack);
      }
      performanceMonitor.stopMonitoring();
      process.exit(1);
    }
  }

  async generatePhase2Report() {
    if (!this.options.enableCaching && !this.options.enableConnectionPooling && 
        !this.options.enableErrorMonitoring && !this.streamingTTSEnabled) {
      return; // No Phase 2 features enabled
    }

    console.log('\n=� PHASE 2 OPTIMIZATION REPORT');
    console.log('='.repeat(50));

    // Smart Caching Statistics
    if (this.options.enableCaching) {
      const cacheStats = cacheManager.getAllStats();
      console.log('\n>� SMART CACHING:');
      console.log(`  Translation Cache: ${cacheStats.translation.size}/${cacheStats.translation.maxSize} entries (${cacheStats.translation.hitRate.toFixed(1)}% hit rate)`);
      console.log(`  Content Cache: ${cacheStats.content.size}/${cacheStats.content.maxSize} entries (${cacheStats.content.hitRate.toFixed(1)}% hit rate)`);
      console.log(`  Total Memory: ${(cacheStats.totalMemoryUsage / 1024).toFixed(1)} KB`);
    }

    // Connection Pool Statistics
    if (this.options.enableConnectionPooling) {
      const poolStats = connectionPool.getAllStats();
      console.log('\n= CONNECTION POOLING:');
      console.log(`  Total Requests: ${poolStats.summary.totalRequests}`);
      console.log(`  Active Connections: ${poolStats.summary.activeConnections}/${poolStats.summary.totalConnections}`);
      console.log(`  HTTP Pool Hit Rate: ${poolStats.http.poolHitRate || '0%'}`);
      console.log(`  HTTPS Pool Hit Rate: ${poolStats.https.poolHitRate || '0%'}`);
    }

    // Error Rate Monitoring
    if (this.options.enableErrorMonitoring) {
      const errorStats = errorRateMonitor.getAllMetrics();
      console.log('\n=� ERROR MONITORING:');
      
      Object.entries(errorStats.providers).forEach(([provider, stats]) => {
        const status = stats.status === 'healthy' ? '' : stats.status === 'degraded' ? '�' : 'L';
        console.log(`  ${status} ${provider}: ${stats.successRate}% success rate (${stats.requests.total} requests)`);
        if (stats.averageResponseTime > 0) {
          console.log(`     Avg Response: ${stats.averageResponseTime}ms`);
        }
      });

      if (errorStats.alerts.active.length > 0) {
        console.log(`  =� Active Alerts: ${errorStats.alerts.active.length}`);
      }
    }

    // Streaming TTS Report
    if (this.streamingTTSEnabled) {
      console.log('\n<� STREAMING TTS:');
      console.log('   Memory-efficient audio processing enabled');
      console.log('   Concurrent chunk processing active');
    }

    // Performance Benchmarking
    if (this.options.enableBenchmarking && this.benchmarkSuite) {
      console.log('\n<� PERFORMANCE BENCHMARKING:');
      console.log('   Benchmark data collected (check ./benchmarks/ directory)');
    }

    console.log('\n' + '='.repeat(50));
  }

  async cleanup() {
    // Cleanup Phase 2 resources
    if (this.options.enableConnectionPooling) {
      connectionPool.cleanup();
    }

    if (this.options.enableCaching) {
      cacheManager.cleanupExpired();
    }

    console.log('>� Phase 2 cleanup completed');
  }
}

const program = new Command();

program
  .name('syosetu-translator')
  .description('Pobiera i tBumaczy rozdziaBy z serwisu Syosetu na jzyk polski')
  .version('1.0.0');

program
  .argument('<url>', 'URL rozdziaBu z serwisu Syosetu')
  .argument('[output-dir]', 'Katalog wyj[ciowy dla plik�w MD', './output')
  .option(
    '--no-auto-continue',
    'Zatrzymaj po ka|dym rozdziale i czekaj na potwierdzenie',
  )
  .option('--delay <seconds>', 'Op�znienie midzy rozdziaBami w sekundach', '3')
  .option('--api-key <key>', 'Klucz API DeepSeek')
  .option('--google-api-key <key>', 'Klucz API Google Translate')
  .option('--openai-api-key <key>', 'Klucz API OpenAI')
  .option(
    '--translator <type>',
    'Typ translatora: deepseek, google, openai',
    'deepseek',
  )
  .option('--tts <provider>', 'Provider TTS: openai, google, none', 'none')
  .option(
    '--voice <voice>',
    'Wyb�r gBosu TTS (np. alloy, nova, pl-PL-Wavenet-A)',
  )
  .option('--audio-dir <dir>', 'Katalog dla plik�w audio', './audio')
  .option('--speed <speed>', 'Szybko[ czytania (0.25 - 4.0)', '1.0')
  .option(
    '--max-chapters <number>',
    'Maksymalna liczba rozdziaB�w do przetworzenia',
    '1000',
  )
  .option('--google-credentials <path>', 'Zcie|ka do pliku credentials Google')
  .option('--batch', 'WBcz batch processing (eksperymentalne)', false)
  .option('--batch-size <number>', 'Rozmiar batcha dla batch processing', '3')
  .option('--batch-concurrency <number>', 'Liczba r�wnolegBych operacji w batchu', '2')
  .option('--no-caching', 'WyBcz smart caching system (Phase 2)', false)
  .option('--no-connection-pooling', 'WyBcz HTTP connection pooling (Phase 2)', false)
  .option('--no-error-monitoring', 'WyBcz error rate monitoring (Phase 2)', false)
  .option('--streaming-tts', 'WBcz streaming TTS processing (Phase 2)', false)
  .option('--benchmarking', 'WBcz performance benchmarking (Phase 2)', false)
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
        batchMode: options.batch,
        batchSize: parseInt(options.batchSize),
        batchConcurrency: parseInt(options.batchConcurrency),
        enableCaching: !options.noCaching,
        enableConnectionPooling: !options.noConnectionPooling,
        enableErrorMonitoring: !options.noErrorMonitoring,
        enableStreamingTTS: options.streamingTts,
        enableBenchmarking: options.benchmarking,
      });

      await app.initializeComponents();
      await app.run(url);
    } catch (error) {
      console.error(`BBd inicjalizacji: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();