import { SyosetuParser } from '../parsers/syosetu-parser.js';
import readline from 'readline';
import { APP_CONSTANTS } from '../shared/constants.js';
import {
  ProcessingError,
  ValidationError,
  withRetry,
  ErrorHandler,
} from '../shared/errors.js';

export class NavigationError extends Error {
  constructor(message, url = null, step = null) {
    super(message);
    this.name = 'NavigationError';
    this.url = url;
    this.step = step;
  }
}

export class ChapterNavigator {
  constructor(config = {}) {
    try {
      this.config = {
        baseDelay: APP_CONSTANTS.NAVIGATION_BASE_DELAY,
        adaptiveDelay: true, // Adaptacyjne opóźnienia
        maxDelay: APP_CONSTANTS.NAVIGATION_MAX_DELAY,
        minDelay: APP_CONSTANTS.NAVIGATION_MIN_DELAY,
        chapterDelay:
          config.chapterDelay || APP_CONSTANTS.NAVIGATION_DEFAULT_DELAY,
        autoContinue: true,
        maxChapters: APP_CONSTANTS.DEFAULT_MAX_CHAPTERS,
        ...config,
      };
      this.processedChapters = new Set();
      this.consecutiveErrors = 0;
      this.avgProcessingTime = 5000; // Średni czas przetwarzania
    } catch (error) {
      throw new ValidationError(`Failed to initialize ChapterNavigator: ${error.message}`);
    }
  }

  async processChapterSequence(startUrl, processor) {
    try {
      if (!startUrl || typeof startUrl !== 'string') {
        throw new ValidationError('Invalid start URL provided', 'startUrl');
      }
      
      if (!processor || typeof processor !== 'function') {
        throw new ValidationError('Processor function is required', 'processor');
      }

      let currentUrl = startUrl;
      let chapterCount = 0;
      const results = [];

      console.log(`Rozpoczynam przetwarzanie od: ${startUrl}`);
      console.log(`Auto-continue: ${this.config.autoContinue}`);
      console.log(
        `Opóźnienie między rozdziałami: ${this.config.chapterDelay}ms\n`,
      );

      while (currentUrl && chapterCount < this.config.maxChapters) {
        const startTime = Date.now();
        try {
          if (this.processedChapters.has(currentUrl)) {
            console.log(`Rozdział już przetworzony: ${currentUrl}`);
            break;
          }

          console.log(`\n=== Przetwarzanie rozdziału ${chapterCount + 1} ===`);
          console.log(`URL: ${currentUrl}`);

          const result = await withRetry(
            () => processor(currentUrl),
            3, // maxRetries
            1000, // baseDelay
            1.5, // backoffMultiplier
            { operation: 'processChapter', url: currentUrl }
          );
          
          if (!result || !result.title) {
            throw new ProcessingError('Invalid chapter data received from processor');
          }
          
          results.push(result);
          this.processedChapters.add(currentUrl);
          chapterCount++;

          console.log(
            `✓ Ukończono rozdział ${chapterCount}: ${result.title || 'Bez tytułu'}`,
          );

          const nextUrl = result.nextChapterUrl;

          if (!nextUrl) {
            console.log('\\n🎉 Brak kolejnego rozdziału - seria zakończona!');
            break;
          }

          if (!this.config.autoContinue) {
            const shouldContinue = await this.promptContinue(nextUrl);
            if (!shouldContinue) {
              console.log('Zatrzymano na żądanie użytkownika.');
              break;
            }
          }

          console.log(`Następny rozdział: ${nextUrl}`);

          // Calculate processing time for adaptive delay
          const processingTime = Date.now() - startTime;
          this.avgProcessingTime =
            (this.avgProcessingTime + processingTime) / 2;

          // Use adaptive delay or fallback to configured delay
          const delay = this.calculateAdaptiveDelay();
          console.log(`⏱️ Inteligentne opóźnienie: ${delay}ms`);
          await this.delay(delay);
          currentUrl = nextUrl;

          // Reset consecutive errors on success
          this.consecutiveErrors = 0;
        } catch (chapterError) {
          this.consecutiveErrors++;
          ErrorHandler.handleError(chapterError, { 
            operation: 'processChapter',
            url: currentUrl,
            chapterNumber: chapterCount + 1
          });

          if (
            chapterError.message.includes('404') ||
            chapterError.message.includes('Not Found')
          ) {
            console.log('Rozdział nie istnieje - prawdopodobnie koniec serii.');
            break;
          }

          // Exponential backoff for errors
          const errorDelay = this.calculateErrorDelay();
          console.log(`⏳ Błąd, czekam: ${errorDelay}ms`);
          await this.delay(errorDelay);

          // Skip to next chapter on recoverable errors
          if (this.consecutiveErrors < 3) {
            try {
              currentUrl = await this.processNextChapter(currentUrl);
              continue;
            } catch (nextError) {
              console.error('Nie można przejść do następnego rozdziału');
              throw new NavigationError(
                `Failed to navigate to next chapter after error: ${nextError.message}`,
                currentUrl,
                'nextChapter'
              );
            }
          }

          throw new NavigationError(
            `Chapter processing failed after ${this.consecutiveErrors} attempts: ${chapterError.message}`,
            currentUrl,
            'processChapter'
          );
        }
      }

      if (chapterCount >= this.config.maxChapters) {
        console.log(
          `\\n⚠️  Osiągnięto maksymalną liczbę rozdziałów (${this.config.maxChapters})`,
        );
      }

      console.log('\\n📊 Podsumowanie:');
      console.log(`- Przetworzonych rozdziałów: ${chapterCount}`);
      console.log(`- Rozpoczęto od: ${startUrl}`);
      console.log(
        `- Zakończono na: ${currentUrl || 'ostatnim dostępnym rozdziale'}`,
      );

      return {
        results,
        totalChapters: chapterCount,
        startUrl,
        lastUrl: currentUrl,
      };
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'processChapterSequence', startUrl });
      
      if (error instanceof ValidationError || error instanceof NavigationError) {
        throw error;
      }
      
      throw new NavigationError(
        `Chapter sequence processing failed: ${error.message}`,
        startUrl,
        'processSequence'
      );
    }
  }

  async processNextChapter(currentUrl) {
    try {
      if (!currentUrl || typeof currentUrl !== 'string') {
        throw new ValidationError('Invalid current URL provided for next chapter navigation');
      }
      
      const parsedUrl = SyosetuParser.parseUrl(currentUrl);
      if (!parsedUrl || !parsedUrl.seriesId || typeof parsedUrl.chapterNumber !== 'number') {
        throw new ProcessingError('Failed to parse chapter URL for navigation');
      }
      
      const nextChapterNumber = parsedUrl.chapterNumber + 1;
      const nextUrl = SyosetuParser.buildChapterUrl(
        parsedUrl.seriesId,
        nextChapterNumber,
      );

      if (!nextUrl) {
        throw new NavigationError('Failed to build next chapter URL');
      }

      return nextUrl;
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'processNextChapter', currentUrl });
      
      if (error instanceof ValidationError || error instanceof ProcessingError || error instanceof NavigationError) {
        throw error;
      }
      
      throw new NavigationError(`Failed to generate next chapter URL: ${error.message}`, currentUrl, 'generateNext');
    }
  }

  async promptContinue(nextUrl) {
    try {
      if (!nextUrl || typeof nextUrl !== 'string') {
        throw new ValidationError('Invalid nextUrl provided for continuation prompt');
      }
      
      return new Promise((resolve, reject) => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const timeout = setTimeout(() => {
          rl.close();
          reject(new ProcessingError('User prompt timeout after 60 seconds'));
        }, 60000); // 60 second timeout

        rl.question(
          `Kontynuować z następnym rozdziałem (${nextUrl})? (t/n): `,
          (answer) => {
            clearTimeout(timeout);
            rl.close();
            
            if (typeof answer !== 'string') {
              reject(new ValidationError('Invalid user input received'));
              return;
            }
            
            resolve(answer.toLowerCase().startsWith('t'));
          },
        );
      });
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'promptContinue', nextUrl });
      throw new ProcessingError(`Failed to prompt user for continuation: ${error.message}`);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  setAutoContinue(autoContinue) {
    this.config.autoContinue = autoContinue;
  }

  setChapterDelay(delay) {
    this.config.chapterDelay = delay;
  }

  getProcessedChapters() {
    return Array.from(this.processedChapters);
  }

  resetProcessedChapters() {
    this.processedChapters.clear();
  }

  calculateAdaptiveDelay() {
    // Use legacy delay if adaptive is disabled
    if (!this.config.adaptiveDelay) {
      return this.config.chapterDelay;
    }

    // Krótsze opóźnienie dla szybkiego przetwarzania
    const adaptiveDelay = Math.max(
      this.config.minDelay,
      Math.min(
        this.config.maxDelay,
        this.avgProcessingTime * 0.2, // 20% średniego czasu
      ),
    );

    return adaptiveDelay;
  }

  calculateErrorDelay() {
    // Exponential backoff for errors
    return Math.min(
      this.config.maxDelay,
      this.config.baseDelay * Math.pow(2, this.consecutiveErrors),
    );
  }
}
