import { SyosetuParser } from '../parsers/syosetu-parser.js';
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
        adaptiveDelay: true, // Adaptacyjne op�znienia
        maxDelay: APP_CONSTANTS.NAVIGATION_MAX_DELAY,
        minDelay: APP_CONSTANTS.NAVIGATION_MIN_DELAY,
        chapterDelay:
          config.chapterDelay || APP_CONSTANTS.NAVIGATION_DEFAULT_DELAY,
        chapters: 0, // 0 = do końca książki
        ...config,
      };
      this.processedChapters = new Set();
      this.consecutiveErrors = 0;
      this.avgProcessingTime = 5000; // Zredni czas przetwarzania
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
      console.log(
        `Op�znienie midzy rozdziaBami: ${this.config.chapterDelay}ms\n`,
      );

      while (currentUrl && (this.config.chapters === 0 || chapterCount < this.config.chapters)) {
        const startTime = Date.now();
        try {
          if (this.processedChapters.has(currentUrl)) {
            console.log(`RozdziaB ju| przetworzony: ${currentUrl}`);
            break;
          }

          console.log(`\n=== Przetwarzanie rozdziaBu ${chapterCount + 1} ===`);
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
            ` UkoDczono rozdziaB ${chapterCount}: ${result.title || 'Bez tytuBu'}`,
          );

          const nextUrl = result.nextChapterUrl;

          if (!nextUrl) {
            console.log('\\n<� Brak kolejnego rozdziaBu - seria zakoDczona!');
            break;
          }


          console.log(`Nastpny rozdziaB: ${nextUrl}`);

          // Calculate processing time for adaptive delay
          const processingTime = Date.now() - startTime;
          this.avgProcessingTime =
            (this.avgProcessingTime + processingTime) / 2;

          // Use adaptive delay or fallback to configured delay
          const delay = this.calculateAdaptiveDelay();
          console.log(`� Inteligentne op�znienie: ${delay}ms`);
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
            console.log('RozdziaB nie istnieje - prawdopodobnie koniec serii.');
            break;
          }

          // Exponential backoff for errors
          const errorDelay = this.calculateErrorDelay();
          console.log(`� BBd, czekam: ${errorDelay}ms`);
          await this.delay(errorDelay);

          // Skip to next chapter on recoverable errors
          if (this.consecutiveErrors < 3) {
            try {
              currentUrl = await this.processNextChapter(currentUrl);
              continue;
            } catch (nextError) {
              console.error('Nie mo|na przej[ do nastpnego rozdziaBu');
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

      if (this.config.chapters > 0 && chapterCount >= this.config.chapters) {
        console.log(
          `\\n�  Osignito limit rozdziaB�w (${this.config.chapters})`,
        );
      }

      console.log('\\n=� Podsumowanie:');
      console.log(`- Przetworzonych rozdziaB�w: ${chapterCount}`);
      console.log(`- Rozpoczto od: ${startUrl}`);
      console.log(
        `- ZakoDczono na: ${currentUrl || 'ostatnim dostpnym rozdziale'}`,
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


  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // Kr�tsze op�znienie dla szybkiego przetwarzania
    const adaptiveDelay = Math.max(
      this.config.minDelay,
      Math.min(
        this.config.maxDelay,
        this.avgProcessingTime * 0.2, // 20% [redniego czasu
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