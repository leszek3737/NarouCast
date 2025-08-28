import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import {
  APP_CONSTANTS,
  SCRAPER_SELECTORS,
  FILE_PATTERNS,
} from '../shared/constants.js';
import {
  ScrapingError,
  NetworkError,
  ProcessingError,
  withRetry,
  ErrorHandler,
} from '../shared/errors.js';

export class WebScraper {
  constructor(config = {}) {
    this.config = {
      maxRetries: APP_CONSTANTS.DEFAULT_MAX_RETRIES,
      retryDelay: APP_CONSTANTS.HTTP_RETRY_DELAY,
      retryBackoffMultiplier: APP_CONSTANTS.HTTP_RETRY_BACKOFF_MULTIPLIER,
      timeout: APP_CONSTANTS.HTTP_TIMEOUT,
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      ...config,
    };

    // Simple cache for development/debugging
    this.cache = new Map();
  }

  async scrapeChapter(url) {
    try {
      // Validate URL first
      if (!url || typeof url !== 'string') {
        throw new ScrapingError('Invalid URL provided', url);
      }

      // Check cache first (useful for development/debugging)
      const cachedResult = this.cache.get(url);
      if (cachedResult && !process.env.DISABLE_CACHE) {
        console.log(`📄 Używam cache dla: ${url}`);
        return cachedResult;
      }

      console.log(`🌐 Rozpoczynam pobieranie: ${url}`);

      // Use retry wrapper for better error handling
      const result = await withRetry(
        () => this.fetchChapterData(url),
        this.config.maxRetries,
        this.config.retryDelay,
        this.config.retryBackoffMultiplier,
        { operation: 'scrapeChapter', url }
      );

      // Store successful result in cache
      this.cache.set(url, result);
      console.log(`✓ Pomyślnie pobrano rozdział: "${result.title}"`);

      return result;
    } catch (error) {
      ErrorHandler.handleError(error, { operation: 'scrapeChapter', url });
      
      if (error instanceof ScrapingError || error instanceof NetworkError) {
        throw error; // Re-throw operational errors
      }
      
      throw new ScrapingError(`Failed to scrape chapter: ${error.message}`, url);
    }
  }

  async fetchChapterData(url) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.userAgent,
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          Cookie: 'over18=yes', // dla stron 18+
          Referer: 'https://ncode.syosetu.com/',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
        },
        timeout: this.config.timeout,
      });

      if (!response.ok) {
        const statusCode = response.status;
        const statusText = response.statusText;
        
        // Different handling for different HTTP errors
        if (statusCode === 404) {
          throw new ScrapingError(`Chapter not found (404): ${url}`, url);
        } else if (statusCode === 403) {
          throw new ScrapingError(`Access forbidden (403): ${url}`, url);
        } else if (statusCode >= 500) {
          throw new NetworkError(`Server error (${statusCode}): ${statusText}`, url, statusCode);
        } else {
          throw new NetworkError(`HTTP ${statusCode}: ${statusText}`, url, statusCode);
        }
      }

      const html = await response.text();
      
      if (!html || html.length === 0) {
        throw new ScrapingError('Received empty response from server', url);
      }

      const result = this.parseChapterContent(html, url);

      // Debug: zapisz HTML do pliku
      if (process.env.DEBUG_HTML) {
        try {
          const fs = await import('fs/promises');
          await fs.writeFile('/tmp/debug.html', html);
          console.log('💾 Zapisano HTML do /tmp/debug.html');
        } catch (debugError) {
          console.warn('⚠️ Nie udało się zapisać debug HTML:', debugError.message);
        }
      }

      return result;
    } catch (error) {
      // Handle fetch-specific errors
      if (error.code === 'ENOTFOUND') {
        throw new NetworkError(`DNS lookup failed for: ${url}`, url);
      } else if (error.code === 'ECONNRESET') {
        throw new NetworkError(`Connection reset for: ${url}`, url);
      } else if (error.code === 'ETIMEDOUT') {
        throw new NetworkError(`Request timeout for: ${url}`, url);
      }
      
      // Re-throw already handled errors
      if (error instanceof ScrapingError || error instanceof NetworkError) {
        throw error;
      }
      
      throw new NetworkError(`Network error: ${error.message}`, url);
    }
  }

  parseChapterContent(html, url) {
    try {
      const $ = cheerio.load(html);

      // Tytuł rozdziału - różne możliwe selektory
      let title = '';
      try {
        title =
          $(SCRAPER_SELECTORS.TITLE_PRIMARY).text().trim() ||
          $(SCRAPER_SELECTORS.TITLE_FALLBACK)
            .text()
            .replace(SCRAPER_SELECTORS.TITLE_REMOVE_PATTERN, '')
            .trim() ||
          'Bez tytułu';
      } catch (titleError) {
        console.warn('⚠️ Problem z parsowaniem tytułu, używam domyślnego');
        title = 'Bez tytułu';
      }

      // Treść rozdziału - nowe selektory dla Syosetu (tylko główna treść, bez przedmów/posłowi)
      let contentElement;
      try {
        contentElement = $(SCRAPER_SELECTORS.CONTENT_PRIMARY).not(
          SCRAPER_SELECTORS.CONTENT_EXCLUDE,
        );

        if (contentElement.length === 0) {
          // Fallback do podstawowego selektora
          contentElement = $(SCRAPER_SELECTORS.CONTENT_PRIMARY);
        }

        if (contentElement.length === 0) {
          // Fallback do starych selektorów
          for (const selector of SCRAPER_SELECTORS.CONTENT_FALLBACKS) {
            contentElement = $(selector);
            if (contentElement.length > 0) break;
          }
        }

        if (contentElement.length === 0) {
          throw new ScrapingError('Nie znaleziono treści rozdziału na stronie', url);
        }
      } catch (contentError) {
        if (contentError instanceof ScrapingError) {
          throw contentError;
        }
        throw new ScrapingError(`Error parsing content: ${contentError.message}`, url);
      }

      try {
        // Usuwanie niepotrzebnych elementów
        SCRAPER_SELECTORS.ELEMENTS_TO_REMOVE.forEach((selector) => {
          contentElement.find(selector).remove();
        });
      } catch (cleanupError) {
        console.warn('⚠️ Problem z czyszczeniem elementów HTML:', cleanupError.message);
      }

      // Konwersja HTML na tekst z zachowaniem formatowania
      let content;
      try {
        content = this.htmlToText(contentElement);
        
        if (!content || content.trim().length === 0) {
          throw new ScrapingError('Extracted content is empty', url);
        }
      } catch (textError) {
        throw new ScrapingError(`Failed to convert HTML to text: ${textError.message}`, url);
      }

      // Sprawdzenie czy istnieje link do następnego rozdziału
      let nextChapterLink = null;
      try {
        nextChapterLink = this.findNextChapterLink($, url);
      } catch (linkError) {
        console.warn('⚠️ Problem z znajdywaniem linku do następnego rozdziału:', linkError.message);
        // Don't throw error for next chapter link - it's not critical
      }

      const result = {
        title: title,
        content: content.trim(),
        nextChapterUrl: nextChapterLink,
        url: url,
      };

      console.log(`📝 Sparsowano rozdział: "${title}" (${content.length} znaków)`);
      
      return result;
    } catch (error) {
      if (error instanceof ScrapingError) {
        throw error;
      }
      throw new ProcessingError(`Failed to parse chapter content: ${error.message}`, 'parseChapter');
    }
  }

  htmlToText(element) {
    const $ = cheerio.load(element.html());

    // Zamiana <br> na nowe linie
    $('br').replaceWith('\n');

    // Zamiana <p> na akapity z dodatkowymi liniami
    $('p').each((i, el) => {
      const $el = $(el);
      const text = $el.text();
      if (text.trim()) {
        $el.replaceWith(text + '\n\n');
      }
    });

    // Usuwanie HTML tagów i dekodowanie encji
    let text = $.text();

    // Normalizacja białych znaków
    text = text
      .replace(FILE_PATTERNS.NEWLINE_NORMALIZE.CRLF_TO_LF, '\n')
      .replace(FILE_PATTERNS.NEWLINE_NORMALIZE.CR_TO_LF, '\n')
      .replace(FILE_PATTERNS.NEWLINE_NORMALIZE.MULTIPLE_NEWLINES, '\n\n')
      .replace(FILE_PATTERNS.NEWLINE_NORMALIZE.MULTIPLE_SPACES, ' ');

    return text;
  }

  findNextChapterLink($, currentUrl) {
    // Szukanie linku "次へ" (następny)
    const nextLink = $('a')
      .filter((i, el) => {
        const text = $(el).text().trim();
        return SCRAPER_SELECTORS.NEXT_CHAPTER_KEYWORDS.some((keyword) =>
          text.includes(keyword),
        );
      })
      .first();

    if (nextLink.length > 0) {
      const href = nextLink.attr('href');
      if (href) {
        // Konwersja relatywnego URL na absolutny
        return new URL(href, currentUrl).href;
      }
    }

    return null;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
