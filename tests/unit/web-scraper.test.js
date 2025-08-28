import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { WebScraper } from '../../src/scrapers/web-scraper.js';
import {
  ScrapingError,
  NetworkError,
  ProcessingError,
} from '../../src/shared/errors.js';

// Mock fetch for testing
const originalFetch = globalThis.fetch;

function createMockResponse(body, options = {}) {
  const {
    status = 200,
    statusText = 'OK',
    headers = { 'content-type': 'text/html' },
    ok = status >= 200 && status < 300,
  } = options;

  return Promise.resolve({
    ok,
    status,
    statusText,
    headers: {
      get: (name) => headers[name.toLowerCase()],
    },
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  });
}

describe('WebScraper', () => {
  let scraper;
  let originalConsoleLog;
  let originalConsoleWarn;
  let consoleLogs;
  let consoleWarns;

  beforeEach(() => {
    scraper = new WebScraper({
      maxRetries: 1, // Reduce retries for faster testing
      retryDelay: 10, // Reduce delay for faster testing
      timeout: 1000,
    });

    // Mock console to capture logs
    consoleLogs = [];
    consoleWarns = [];
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    console.log = (...args) => consoleLogs.push(args.join(' '));
    console.warn = (...args) => consoleWarns.push(args.join(' '));
  });

  afterEach(() => {
    // Restore original fetch and console
    globalThis.fetch = originalFetch;
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const defaultScraper = new WebScraper();
      
      assert.ok(defaultScraper.config.maxRetries);
      assert.ok(defaultScraper.config.retryDelay);
      assert.ok(defaultScraper.config.timeout);
      assert.ok(defaultScraper.config.userAgent);
      assert.ok(defaultScraper.cache instanceof Map);
    });

    it('should merge custom config with defaults', () => {
      const customScraper = new WebScraper({
        maxRetries: 5,
        timeout: 2000,
        customOption: 'test',
      });
      
      assert.equal(customScraper.config.maxRetries, 5);
      assert.equal(customScraper.config.timeout, 2000);
      assert.equal(customScraper.config.customOption, 'test');
      assert.ok(customScraper.config.userAgent); // Should still have default
    });
  });

  describe('scrapeChapter', () => {
    it('should throw ScrapingError for invalid URL', async () => {
      await assert.rejects(
        scraper.scrapeChapter(null),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.equal(error.message, 'Invalid URL provided');
          assert.equal(error.url, null);
          return true;
        }
      );

      await assert.rejects(
        scraper.scrapeChapter(''),
        ScrapingError
      );

      await assert.rejects(
        scraper.scrapeChapter(123),
        ScrapingError
      );
    });

    it('should return cached result when available', async () => {
      const testUrl = 'https://example.com/chapter/1';
      const cachedResult = {
        title: 'Test Chapter',
        content: 'Test content',
        nextChapterUrl: null,
        url: testUrl,
      };
      
      // Set cache
      scraper.cache.set(testUrl, cachedResult);
      
      const result = await scraper.scrapeChapter(testUrl);
      
      assert.deepEqual(result, cachedResult);
      assert.ok(consoleLogs.some(log => log.includes('Używam cache')));
    });

    it('should fetch and cache new result', async () => {
      const testUrl = 'https://example.com/chapter/1';
      const htmlContent = `
        <html>
          <head><title>Test Chapter</title></head>
          <body>
            <p class="p-novel__title">Test Chapter Title</p>
            <div class="js-novel-text p-novel__text">
              <p>This is test content.</p>
            </div>
          </body>
        </html>
      `;

      globalThis.fetch = () => createMockResponse(htmlContent);
      
      const result = await scraper.scrapeChapter(testUrl);
      
      assert.equal(result.title, 'Test Chapter Title');
      assert.ok(result.content.includes('This is test content'));
      assert.equal(result.url, testUrl);
      
      // Should be cached now
      assert.ok(scraper.cache.has(testUrl));
      assert.deepEqual(scraper.cache.get(testUrl), result);
    });

    it('should handle scraping errors and re-throw them', async () => {
      const testUrl = 'https://example.com/chapter/1';
      
      globalThis.fetch = () => createMockResponse('', { status: 404, statusText: 'Not Found', ok: false });
      
      await assert.rejects(
        scraper.scrapeChapter(testUrl),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.ok(error.message.includes('Chapter not found'));
          assert.equal(error.url, testUrl);
          return true;
        }
      );
    });
  });

  describe('fetchChapterData', () => {
    it('should fetch and parse valid HTML', async () => {
      const testUrl = 'https://example.com/chapter/1';
      const htmlContent = `
        <html>
          <body>
            <p class="p-novel__title">Chapter Title</p>
            <div class="js-novel-text p-novel__text">
              <p>Chapter content here.</p>
            </div>
          </body>
        </html>
      `;

      globalThis.fetch = () => createMockResponse(htmlContent);
      
      const result = await scraper.fetchChapterData(testUrl);
      
      assert.equal(result.title, 'Chapter Title');
      assert.ok(result.content.includes('Chapter content'));
      assert.equal(result.url, testUrl);
    });

    it('should throw ScrapingError for 404 responses', async () => {
      const testUrl = 'https://example.com/chapter/404';
      
      globalThis.fetch = () => createMockResponse('Not Found', { 
        status: 404, 
        statusText: 'Not Found', 
        ok: false 
      });
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.ok(error.message.includes('Chapter not found (404)'));
          return true;
        }
      );
    });

    it('should throw ScrapingError for 403 responses', async () => {
      const testUrl = 'https://example.com/chapter/forbidden';
      
      globalThis.fetch = () => createMockResponse('Forbidden', { 
        status: 403, 
        statusText: 'Forbidden', 
        ok: false 
      });
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.ok(error.message.includes('Access forbidden (403)'));
          return true;
        }
      );
    });

    it('should throw NetworkError for server errors', async () => {
      const testUrl = 'https://example.com/chapter/error';
      
      globalThis.fetch = () => createMockResponse('Internal Server Error', { 
        status: 500, 
        statusText: 'Internal Server Error', 
        ok: false 
      });
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof NetworkError);
          assert.ok(error.message.includes('Server error (500)'));
          assert.equal(error.statusCode, 500);
          return true;
        }
      );
    });

    it('should throw ScrapingError for empty response', async () => {
      const testUrl = 'https://example.com/chapter/empty';
      
      globalThis.fetch = () => createMockResponse('');
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.equal(error.message, 'Received empty response from server');
          return true;
        }
      );
    });

    it('should handle network errors correctly', async () => {
      const testUrl = 'https://example.com/chapter/network-error';
      
      globalThis.fetch = () => {
        const error = new Error('Network error');
        error.code = 'ENOTFOUND';
        return Promise.reject(error);
      };
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof NetworkError);
          assert.ok(error.message.includes('DNS lookup failed'));
          return true;
        }
      );
    });

    it('should handle connection reset errors', async () => {
      const testUrl = 'https://example.com/chapter/reset';
      
      globalThis.fetch = () => {
        const error = new Error('Connection reset');
        error.code = 'ECONNRESET';
        return Promise.reject(error);
      };
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof NetworkError);
          assert.ok(error.message.includes('Connection reset'));
          return true;
        }
      );
    });

    it('should handle timeout errors', async () => {
      const testUrl = 'https://example.com/chapter/timeout';
      
      globalThis.fetch = () => {
        const error = new Error('Request timeout');
        error.code = 'ETIMEDOUT';
        return Promise.reject(error);
      };
      
      await assert.rejects(
        scraper.fetchChapterData(testUrl),
        (error) => {
          assert.ok(error instanceof NetworkError);
          assert.ok(error.message.includes('Request timeout'));
          return true;
        }
      );
    });
  });

  describe('parseChapterContent', () => {
    it('should parse valid chapter HTML correctly', () => {
      const html = `
        <html>
          <body>
            <p class="p-novel__title">Test Chapter</p>
            <div class="js-novel-text p-novel__text">
              <p>First paragraph.</p>
              <p>Second paragraph.</p>
            </div>
            <div class="novel_bn">
              <a href="/chapter/2">次へ</a>
            </div>
          </body>
        </html>
      `;
      const url = 'https://example.com/chapter/1';
      
      const result = scraper.parseChapterContent(html, url);
      
      assert.equal(result.title, 'Test Chapter');
      assert.ok(result.content.includes('First paragraph'));
      assert.ok(result.content.includes('Second paragraph'));
      assert.equal(result.url, url);
      assert.equal(result.nextChapterUrl, 'https://example.com/chapter/2');
    });

    it('should handle missing title gracefully', () => {
      const html = `
        <html>
          <body>
            <div class="js-novel-text p-novel__text">
              <p>Content without title.</p>
            </div>
          </body>
        </html>
      `;
      const url = 'https://example.com/chapter/1';
      
      const result = scraper.parseChapterContent(html, url);
      
      assert.equal(result.title, 'Bez tytułu');
      assert.ok(result.content.includes('Content without title'));
    });

    it('should throw ScrapingError when content is missing', () => {
      const html = `
        <html>
          <body>
            <p class="p-novel__title">Test Chapter</p>
            <!-- No content div -->
          </body>
        </html>
      `;
      const url = 'https://example.com/chapter/1';
      
      assert.throws(
        () => scraper.parseChapterContent(html, url),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.ok(error.message.includes('Nie znaleziono treści rozdziału'));
          return true;
        }
      );
    });

    it('should throw ScrapingError when extracted content is empty', () => {
      const html = `
        <html>
          <body>
            <p class="p-novel__title">Test Chapter</p>
            <div class="js-novel-text p-novel__text">
              <!-- Empty content -->
            </div>
          </body>
        </html>
      `;
      const url = 'https://example.com/chapter/1';
      
      assert.throws(
        () => scraper.parseChapterContent(html, url),
        (error) => {
          assert.ok(error instanceof ScrapingError);
          assert.equal(error.message, 'Extracted content is empty');
          return true;
        }
      );
    });

    it('should handle next chapter link parsing errors gracefully', () => {
      const html = `
        <html>
          <body>
            <p class="p-novel__title">Test Chapter</p>
            <div class="js-novel-text p-novel__text">
              <p>Test content.</p>
            </div>
            <div class="novel_bn">
              <a href="">次へ</a> <!-- Invalid href -->
            </div>
          </body>
        </html>
      `;
      const url = 'https://example.com/chapter/1';
      
      const result = scraper.parseChapterContent(html, url);
      
      assert.equal(result.title, 'Test Chapter');
      assert.ok(result.content.includes('Test content'));
      assert.equal(result.nextChapterUrl, null); // Should handle gracefully
    });
  });

  describe('htmlToText', () => {
    it('should convert HTML to text with proper formatting', async () => {
      const html = '<p>First paragraph</p><br><p>Second paragraph</p>';
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      const element = $('body').append(html);
      
      const result = scraper.htmlToText(element);
      
      assert.ok(result.includes('First paragraph'));
      assert.ok(result.includes('Second paragraph'));
      // Should contain newlines for proper formatting
      assert.ok(result.includes('\n'));
    });

    it('should normalize whitespace correctly', async () => {
      const html = '<p>Text   with    multiple   spaces</p><br><br><br><p>After multiple breaks</p>';
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      const element = $('body').append(html);
      
      const result = scraper.htmlToText(element);
      
      // Should normalize multiple spaces to single space
      assert.ok(result.includes('Text with multiple spaces'));
      // Should normalize multiple newlines
      assert.equal((result.match(/\n\n\n/g) || []).length, 0);
    });
  });

  describe('findNextChapterLink', () => {
    it('should find next chapter link with "次へ" text', async () => {
      const html = `
        <div class="novel_bn">
          <a href="/chapter/2">次へ</a>
        </div>
      `;
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      const currentUrl = 'https://example.com/chapter/1';
      
      const result = scraper.findNextChapterLink($, currentUrl);
      
      assert.equal(result, 'https://example.com/chapter/2');
    });

    it('should return null when no next chapter link found', async () => {
      const html = `
        <div class="novel_bn">
          <a href="/chapter/previous">前へ</a>
        </div>
      `;
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      const currentUrl = 'https://example.com/chapter/1';
      
      const result = scraper.findNextChapterLink($, currentUrl);
      
      assert.equal(result, null);
    });

    it('should handle relative URLs correctly', async () => {
      const html = `
        <div class="novel_bn">
          <a href="../chapter/next">次へ</a>
        </div>
      `;
      const cheerio = await import('cheerio');
      const $ = cheerio.load(html);
      const currentUrl = 'https://example.com/story/chapter/1';
      
      const result = scraper.findNextChapterLink($, currentUrl);
      
      assert.equal(result, 'https://example.com/story/chapter/next');
    });
  });

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      const startTime = Date.now();
      await scraper.delay(50);
      const endTime = Date.now();
      
      const elapsed = endTime - startTime;
      assert.ok(elapsed >= 45); // Allow some timing tolerance
      assert.ok(elapsed < 100); // But not too much tolerance
    });
  });

  describe('Cache functionality', () => {
    it('should use cache when DISABLE_CACHE is not set', async () => {
      const testUrl = 'https://example.com/chapter/1';
      const cachedResult = {
        title: 'Cached Chapter',
        content: 'Cached content',
        nextChapterUrl: null,
        url: testUrl,
      };
      
      // Set cache
      scraper.cache.set(testUrl, cachedResult);
      
      // Should use cache without making network request
      const result = await scraper.scrapeChapter(testUrl);
      
      assert.deepEqual(result, cachedResult);
      assert.ok(consoleLogs.some(log => log.includes('Używam cache')));
    });

    it('should bypass cache when DISABLE_CACHE is set', async () => {
      const originalEnv = process.env.DISABLE_CACHE;
      process.env.DISABLE_CACHE = 'true';
      
      try {
        const testUrl = 'https://example.com/chapter/1';
        const htmlContent = `
          <html>
            <body>
              <p class="p-novel__title">Fresh Chapter</p>
              <div class="js-novel-text p-novel__text">
                <p>Fresh content</p>
              </div>
            </body>
          </html>
        `;

        // Set cache with different content
        scraper.cache.set(testUrl, {
          title: 'Cached Chapter',
          content: 'Cached content',
          nextChapterUrl: null,
          url: testUrl,
        });

        globalThis.fetch = () => createMockResponse(htmlContent);
        
        const result = await scraper.scrapeChapter(testUrl);
        
        // Should get fresh content, not cached
        assert.equal(result.title, 'Fresh Chapter');
        assert.ok(result.content.includes('Fresh content'));
        assert.ok(!consoleLogs.some(log => log.includes('Używam cache')));
      } finally {
        if (originalEnv === undefined) {
          delete process.env.DISABLE_CACHE;
        } else {
          process.env.DISABLE_CACHE = originalEnv;
        }
      }
    });
  });
});