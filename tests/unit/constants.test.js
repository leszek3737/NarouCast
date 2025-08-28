import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_CONSTANTS,
  API_ENDPOINTS,
  SCRAPER_SELECTORS,
  FILE_PATTERNS,
} from '../../src/shared/constants.js';

describe('Constants', () => {
  describe('APP_CONSTANTS', () => {
    it('should have all required default configuration values', () => {
      assert.equal(typeof APP_CONSTANTS.DEFAULT_MAX_CHAPTERS, 'number');
      assert.equal(typeof APP_CONSTANTS.DEFAULT_CHAPTER_DELAY, 'number');
      assert.equal(typeof APP_CONSTANTS.DEFAULT_MAX_RETRIES, 'number');
      assert.equal(typeof APP_CONSTANTS.DEFAULT_OUTPUT_DIR, 'string');
      assert.equal(typeof APP_CONSTANTS.DEFAULT_AUDIO_DIR, 'string');
      assert.equal(typeof APP_CONSTANTS.DEFAULT_TTS_SPEED, 'number');

      assert.ok(APP_CONSTANTS.DEFAULT_MAX_CHAPTERS > 0);
      assert.ok(APP_CONSTANTS.DEFAULT_CHAPTER_DELAY >= 0);
      assert.ok(APP_CONSTANTS.DEFAULT_MAX_RETRIES > 0);
      assert.ok(APP_CONSTANTS.DEFAULT_OUTPUT_DIR.length > 0);
      assert.ok(APP_CONSTANTS.DEFAULT_AUDIO_DIR.length > 0);
      assert.ok(APP_CONSTANTS.DEFAULT_TTS_SPEED > 0);
    });

    it('should have valid HTTP configuration values', () => {
      assert.equal(typeof APP_CONSTANTS.HTTP_TIMEOUT, 'number');
      assert.equal(typeof APP_CONSTANTS.HTTP_RETRY_DELAY, 'number');
      assert.equal(typeof APP_CONSTANTS.HTTP_RETRY_BACKOFF_MULTIPLIER, 'number');

      assert.ok(APP_CONSTANTS.HTTP_TIMEOUT > 0);
      assert.ok(APP_CONSTANTS.HTTP_RETRY_DELAY > 0);
      assert.ok(APP_CONSTANTS.HTTP_RETRY_BACKOFF_MULTIPLIER > 1);
    });

    it('should have valid navigation timing values', () => {
      assert.equal(typeof APP_CONSTANTS.NAVIGATION_BASE_DELAY, 'number');
      assert.equal(typeof APP_CONSTANTS.NAVIGATION_MIN_DELAY, 'number');
      assert.equal(typeof APP_CONSTANTS.NAVIGATION_MAX_DELAY, 'number');
      assert.equal(typeof APP_CONSTANTS.NAVIGATION_DEFAULT_DELAY, 'number');

      assert.ok(APP_CONSTANTS.NAVIGATION_BASE_DELAY > 0);
      assert.ok(APP_CONSTANTS.NAVIGATION_MIN_DELAY > 0);
      assert.ok(APP_CONSTANTS.NAVIGATION_MAX_DELAY > APP_CONSTANTS.NAVIGATION_MIN_DELAY);
      assert.ok(APP_CONSTANTS.NAVIGATION_DEFAULT_DELAY >= APP_CONSTANTS.NAVIGATION_MIN_DELAY);
      assert.ok(APP_CONSTANTS.NAVIGATION_DEFAULT_DELAY <= APP_CONSTANTS.NAVIGATION_MAX_DELAY);
    });

    it('should have valid translation API configuration', () => {
      assert.equal(typeof APP_CONSTANTS.TRANSLATION_MAX_TOKENS, 'number');
      assert.equal(typeof APP_CONSTANTS.TRANSLATION_TEMPERATURE, 'number');

      assert.ok(APP_CONSTANTS.TRANSLATION_MAX_TOKENS > 0);
      assert.ok(APP_CONSTANTS.TRANSLATION_TEMPERATURE >= 0);
      assert.ok(APP_CONSTANTS.TRANSLATION_TEMPERATURE <= 2); // Typical range for temperature
    });

    it('should have valid TTS configuration', () => {
      assert.equal(typeof APP_CONSTANTS.TTS_MAX_CHUNK_SIZE, 'number');
      assert.equal(typeof APP_CONSTANTS.TTS_PROCESSING_DELAY, 'number');

      assert.ok(APP_CONSTANTS.TTS_MAX_CHUNK_SIZE > 0);
      assert.ok(APP_CONSTANTS.TTS_PROCESSING_DELAY >= 0);
    });

    it('should have valid file processing configuration', () => {
      assert.equal(typeof APP_CONSTANTS.FILENAME_MAX_TITLE_LENGTH, 'number');
      assert.equal(typeof APP_CONSTANTS.CHAPTER_NUMBER_PADDING, 'number');

      assert.ok(APP_CONSTANTS.FILENAME_MAX_TITLE_LENGTH > 0);
      assert.ok(APP_CONSTANTS.CHAPTER_NUMBER_PADDING > 0);
    });

    it('should have reasonable default values', () => {
      // Test that default values are reasonable for typical usage
      assert.equal(APP_CONSTANTS.DEFAULT_MAX_CHAPTERS, 1000);
      assert.equal(APP_CONSTANTS.DEFAULT_CHAPTER_DELAY, 3);
      assert.equal(APP_CONSTANTS.DEFAULT_MAX_RETRIES, 3);
      assert.equal(APP_CONSTANTS.DEFAULT_OUTPUT_DIR, './output');
      assert.equal(APP_CONSTANTS.DEFAULT_AUDIO_DIR, './audio');
      assert.equal(APP_CONSTANTS.DEFAULT_TTS_SPEED, 1.0);
    });

    it('should have reasonable timing values', () => {
      assert.equal(APP_CONSTANTS.HTTP_TIMEOUT, 30000); // 30 seconds
      assert.equal(APP_CONSTANTS.HTTP_RETRY_DELAY, 1000); // 1 second
      assert.equal(APP_CONSTANTS.NAVIGATION_BASE_DELAY, 1000); // 1 second
      assert.equal(APP_CONSTANTS.NAVIGATION_DEFAULT_DELAY, 3000); // 3 seconds
    });
  });

  describe('API_ENDPOINTS', () => {
    it('should have valid API endpoint URLs', () => {
      assert.equal(typeof API_ENDPOINTS.DEEPSEEK, 'string');
      assert.equal(typeof API_ENDPOINTS.SYOSETU_BASE, 'string');

      // Test that URLs are valid format
      assert.ok(API_ENDPOINTS.DEEPSEEK.startsWith('https://'));
      assert.ok(API_ENDPOINTS.SYOSETU_BASE.startsWith('https://'));

      // Test specific expected values
      assert.equal(API_ENDPOINTS.DEEPSEEK, 'https://api.deepseek.com/v1/chat/completions');
      assert.equal(API_ENDPOINTS.SYOSETU_BASE, 'https://ncode.syosetu.com');
    });

    it('should have parseable URLs', () => {
      // Test that URLs can be parsed by URL constructor
      assert.doesNotThrow(() => new URL(API_ENDPOINTS.DEEPSEEK));
      assert.doesNotThrow(() => new URL(API_ENDPOINTS.SYOSETU_BASE));
    });
  });

  describe('SCRAPER_SELECTORS', () => {
    it('should have all required CSS selectors', () => {
      const requiredSelectors = [
        'TITLE_PRIMARY',
        'TITLE_FALLBACK',
        'CONTENT_PRIMARY',
        'CONTENT_EXCLUDE',
        'CONTENT_FALLBACKS',
        'NEXT_CHAPTER_KEYWORDS',
        'ELEMENTS_TO_REMOVE',
      ];

      requiredSelectors.forEach(selector => {
        assert.ok(SCRAPER_SELECTORS.hasOwnProperty(selector), `Missing selector: ${selector}`);
      });
    });

    it('should have valid CSS selector strings', () => {
      assert.equal(typeof SCRAPER_SELECTORS.TITLE_PRIMARY, 'string');
      assert.equal(typeof SCRAPER_SELECTORS.TITLE_FALLBACK, 'string');
      assert.equal(typeof SCRAPER_SELECTORS.CONTENT_PRIMARY, 'string');
      assert.equal(typeof SCRAPER_SELECTORS.CONTENT_EXCLUDE, 'string');

      // Test that selectors are not empty
      assert.ok(SCRAPER_SELECTORS.TITLE_PRIMARY.length > 0);
      assert.ok(SCRAPER_SELECTORS.TITLE_FALLBACK.length > 0);
      assert.ok(SCRAPER_SELECTORS.CONTENT_PRIMARY.length > 0);
      assert.ok(SCRAPER_SELECTORS.CONTENT_EXCLUDE.length > 0);
    });

    it('should have valid regex pattern for title removal', () => {
      assert.ok(SCRAPER_SELECTORS.TITLE_REMOVE_PATTERN instanceof RegExp);
      
      // Test the regex works as expected
      const testTitle = 'Test Title - 小説家になろう';
      const cleaned = testTitle.replace(SCRAPER_SELECTORS.TITLE_REMOVE_PATTERN, '').trim();
      assert.equal(cleaned, 'Test Title');
    });

    it('should have array of fallback selectors', () => {
      assert.ok(Array.isArray(SCRAPER_SELECTORS.CONTENT_FALLBACKS));
      assert.ok(SCRAPER_SELECTORS.CONTENT_FALLBACKS.length > 0);
      
      // All fallbacks should be strings
      SCRAPER_SELECTORS.CONTENT_FALLBACKS.forEach(selector => {
        assert.equal(typeof selector, 'string');
        assert.ok(selector.length > 0);
      });
    });

    it('should have array of next chapter keywords', () => {
      assert.ok(Array.isArray(SCRAPER_SELECTORS.NEXT_CHAPTER_KEYWORDS));
      assert.ok(SCRAPER_SELECTORS.NEXT_CHAPTER_KEYWORDS.length > 0);
      
      // All keywords should be strings
      SCRAPER_SELECTORS.NEXT_CHAPTER_KEYWORDS.forEach(keyword => {
        assert.equal(typeof keyword, 'string');
        assert.ok(keyword.length > 0);
      });

      // Should contain expected Japanese keywords
      assert.ok(SCRAPER_SELECTORS.NEXT_CHAPTER_KEYWORDS.includes('次へ'));
    });

    it('should have array of elements to remove', () => {
      assert.ok(Array.isArray(SCRAPER_SELECTORS.ELEMENTS_TO_REMOVE));
      assert.ok(SCRAPER_SELECTORS.ELEMENTS_TO_REMOVE.length > 0);
      
      // All selectors should be strings
      SCRAPER_SELECTORS.ELEMENTS_TO_REMOVE.forEach(selector => {
        assert.equal(typeof selector, 'string');
        assert.ok(selector.length > 0);
      });
    });

    it('should have selectors appropriate for Syosetu website', () => {
      // Test that selectors seem appropriate for the target website
      assert.ok(SCRAPER_SELECTORS.TITLE_PRIMARY.includes('p-novel'));
      assert.ok(SCRAPER_SELECTORS.CONTENT_PRIMARY.includes('p-novel'));
      assert.ok(SCRAPER_SELECTORS.CONTENT_EXCLUDE.includes('preface'));
      assert.ok(SCRAPER_SELECTORS.CONTENT_EXCLUDE.includes('afterword'));
    });
  });

  describe('FILE_PATTERNS', () => {
    it('should have all required file patterns', () => {
      const requiredPatterns = [
        'INVALID_FILENAME_CHARS',
        'WHITESPACE_REPLACE',
        'NEWLINE_NORMALIZE',
      ];

      requiredPatterns.forEach(pattern => {
        assert.ok(FILE_PATTERNS.hasOwnProperty(pattern), `Missing pattern: ${pattern}`);
      });
    });

    it('should have valid regex patterns', () => {
      assert.ok(FILE_PATTERNS.INVALID_FILENAME_CHARS instanceof RegExp);
      assert.ok(FILE_PATTERNS.WHITESPACE_REPLACE instanceof RegExp);
      
      assert.equal(typeof FILE_PATTERNS.NEWLINE_NORMALIZE, 'object');
      assert.ok(FILE_PATTERNS.NEWLINE_NORMALIZE.CRLF_TO_LF instanceof RegExp);
      assert.ok(FILE_PATTERNS.NEWLINE_NORMALIZE.CR_TO_LF instanceof RegExp);
      assert.ok(FILE_PATTERNS.NEWLINE_NORMALIZE.MULTIPLE_NEWLINES instanceof RegExp);
      assert.ok(FILE_PATTERNS.NEWLINE_NORMALIZE.MULTIPLE_SPACES instanceof RegExp);
    });

    it('should correctly match invalid filename characters', () => {
      const invalidChars = '<>:"/\\|?*';
      const testString = 'Valid<Name>:Test"/File\\Name|With?Invalid*Chars';
      
      const matches = testString.match(FILE_PATTERNS.INVALID_FILENAME_CHARS);
      assert.ok(matches);
      assert.ok(matches.length > 0);
      
      // Should match all invalid characters
      invalidChars.split('').forEach(char => {
        assert.ok(matches.includes(char), `Should match invalid char: ${char}`);
      });
    });

    it('should correctly handle whitespace replacement', () => {
      const testString = 'Multiple   spaces    here';
      const result = testString.replace(FILE_PATTERNS.WHITESPACE_REPLACE, ' ');
      assert.equal(result, 'Multiple spaces here');
    });

    it('should normalize different newline patterns', () => {
      // Test CRLF to LF conversion
      const crlfText = 'Line1\r\nLine2\r\nLine3';
      const lfText = crlfText.replace(FILE_PATTERNS.NEWLINE_NORMALIZE.CRLF_TO_LF, '\n');
      assert.equal(lfText, 'Line1\nLine2\nLine3');

      // Test CR to LF conversion
      const crText = 'Line1\rLine2\rLine3';
      const crToLfText = crText.replace(FILE_PATTERNS.NEWLINE_NORMALIZE.CR_TO_LF, '\n');
      assert.equal(crToLfText, 'Line1\nLine2\nLine3');

      // Test multiple newlines normalization
      const multiNewlineText = 'Line1\n\n\n\nLine2';
      const normalizedText = multiNewlineText.replace(FILE_PATTERNS.NEWLINE_NORMALIZE.MULTIPLE_NEWLINES, '\n\n');
      assert.equal(normalizedText, 'Line1\n\nLine2');

      // Test multiple spaces normalization
      const multiSpaceText = 'Word1    \t   Word2';
      const normalizedSpaceText = multiSpaceText.replace(FILE_PATTERNS.NEWLINE_NORMALIZE.MULTIPLE_SPACES, ' ');
      assert.equal(normalizedSpaceText, 'Word1 Word2');
    });

    it('should have comprehensive filename character exclusions', () => {
      // Test that all common problematic filename characters are covered
      const problematicChars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
      
      problematicChars.forEach(char => {
        const testString = `test${char}file`;
        // Create new regex instance to avoid global state issues
        const regex = new RegExp(FILE_PATTERNS.INVALID_FILENAME_CHARS.source, 'g');
        const hasMatch = regex.test(testString);
        assert.ok(hasMatch, `Should match problematic char: ${char}`);
      });
    });
  });

  describe('Constants Integrity', () => {
    it('should not have undefined or null values', () => {
      const checkObject = (obj, path = '') => {
        Object.entries(obj).forEach(([key, value]) => {
          const currentPath = path ? `${path}.${key}` : key;
          
          if (value === null || value === undefined) {
            assert.fail(`Constant ${currentPath} is null or undefined`);
          }
          
          if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof RegExp)) {
            checkObject(value, currentPath);
          }
        });
      };

      checkObject(APP_CONSTANTS, 'APP_CONSTANTS');
      checkObject(API_ENDPOINTS, 'API_ENDPOINTS');
      checkObject(SCRAPER_SELECTORS, 'SCRAPER_SELECTORS');
      checkObject(FILE_PATTERNS, 'FILE_PATTERNS');
    });

    it('should have consistent naming conventions', () => {
      // All APP_CONSTANTS keys should be UPPER_CASE
      Object.keys(APP_CONSTANTS).forEach(key => {
        assert.ok(/^[A-Z_]+$/.test(key), `APP_CONSTANTS.${key} should be UPPER_CASE`);
      });

      // All API_ENDPOINTS keys should be UPPER_CASE
      Object.keys(API_ENDPOINTS).forEach(key => {
        assert.ok(/^[A-Z_]+$/.test(key), `API_ENDPOINTS.${key} should be UPPER_CASE`);
      });

      // All SCRAPER_SELECTORS keys should be UPPER_CASE
      Object.keys(SCRAPER_SELECTORS).forEach(key => {
        assert.ok(/^[A-Z_]+$/.test(key), `SCRAPER_SELECTORS.${key} should be UPPER_CASE`);
      });

      // All FILE_PATTERNS keys should be UPPER_CASE
      Object.keys(FILE_PATTERNS).forEach(key => {
        assert.ok(/^[A-Z_]+$/.test(key), `FILE_PATTERNS.${key} should be UPPER_CASE`);
      });
    });

    it('should be properly exported and importable', () => {
      // Test that all main exports exist and are objects
      assert.equal(typeof APP_CONSTANTS, 'object');
      assert.equal(typeof API_ENDPOINTS, 'object');
      assert.equal(typeof SCRAPER_SELECTORS, 'object');
      assert.equal(typeof FILE_PATTERNS, 'object');

      // Test that they are not empty
      assert.ok(Object.keys(APP_CONSTANTS).length > 0);
      assert.ok(Object.keys(API_ENDPOINTS).length > 0);
      assert.ok(Object.keys(SCRAPER_SELECTORS).length > 0);
      assert.ok(Object.keys(FILE_PATTERNS).length > 0);
    });
  });
});