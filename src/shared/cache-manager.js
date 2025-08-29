/**
 * Smart Caching System - LRU Cache for translations and API calls
 * Optimizes repeated API requests and translation operations
 */

class LRUCache {
  constructor(maxSize = 1000, ttlMs = 3600000) { // 1 hour TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.accessTime = new Map();
  }

  /**
   * Generate cache key from multiple parameters
   */
  _generateKey(provider, operation, ...params) {
    return `${provider}:${operation}:${JSON.stringify(params)}`;
  }

  /**
   * Check if cache entry is expired
   */
  _isExpired(timestamp) {
    return Date.now() - timestamp > this.ttlMs;
  }

  /**
   * Evict oldest entries when cache is full
   */
  _evictOldest() {
    if (this.cache.size < this.maxSize) return;

    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessTime.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessTime.delete(oldestKey);
    }
  }

  /**
   * Get cached value
   */
  get(provider, operation, ...params) {
    const key = this._generateKey(provider, operation, ...params);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check TTL
    if (this._isExpired(entry.timestamp)) {
      this.cache.delete(key);
      this.accessTime.delete(key);
      return null;
    }

    // Update access time for LRU
    this.accessTime.set(key, Date.now());
    return entry.data;
  }

  /**
   * Set cached value
   */
  set(provider, operation, data, ...params) {
    const key = this._generateKey(provider, operation, ...params);
    
    this._evictOldest();

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    this.accessTime.set(key, Date.now());
  }

  /**
   * Clear cache for specific provider
   */
  clearProvider(provider) {
    const keysToDelete = [];
    
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${provider}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      this.cache.delete(key);
      this.accessTime.delete(key);
    });
  }

  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
    this.accessTime.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    let expiredCount = 0;
    
    for (const entry of this.cache.values()) {
      if (this._isExpired(entry.timestamp)) {
        expiredCount++;
      }
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      expiredEntries: expiredCount,
      hitRate: this._calculateHitRate(),
      memoryUsage: this._estimateMemoryUsage()
    };
  }

  _calculateHitRate() {
    return this._hits && this._misses 
      ? (this._hits / (this._hits + this._misses)) * 100 
      : 0;
  }

  _estimateMemoryUsage() {
    let totalSize = 0;
    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length + JSON.stringify(entry).length;
    }
    return totalSize;
  }

  /**
   * Track cache hits/misses for statistics
   */
  _recordHit() {
    this._hits = (this._hits || 0) + 1;
  }

  _recordMiss() {
    this._misses = (this._misses || 0) + 1;
  }

  /**
   * Enhanced get with statistics tracking
   */
  getWithStats(provider, operation, ...params) {
    const result = this.get(provider, operation, ...params);
    if (result !== null) {
      this._recordHit();
    } else {
      this._recordMiss();
    }
    return result;
  }
}

/**
 * Global cache instances for different types of data
 */
class CacheManager {
  constructor() {
    // Translation cache - larger size, longer TTL
    this.translationCache = new LRUCache(2000, 7200000); // 2 hours

    // API response cache - medium size, shorter TTL  
    this.apiCache = new LRUCache(1000, 3600000); // 1 hour

    // Chapter content cache - smaller size, very long TTL
    this.contentCache = new LRUCache(500, 86400000); // 24 hours

    // Scraping cache - medium size, medium TTL
    this.scrapingCache = new LRUCache(1000, 1800000); // 30 minutes
  }

  /**
   * Cache translation results
   */
  cacheTranslation(provider, sourceText, targetLang, translatedText) {
    this.translationCache.set(provider, 'translate', translatedText, sourceText, targetLang);
  }

  getCachedTranslation(provider, sourceText, targetLang) {
    return this.translationCache.getWithStats(provider, 'translate', sourceText, targetLang);
  }

  /**
   * Cache API responses
   */
  cacheApiResponse(provider, endpoint, params, response) {
    this.apiCache.set(provider, endpoint, response, params);
  }

  getCachedApiResponse(provider, endpoint, params) {
    return this.apiCache.getWithStats(provider, endpoint, params);
  }

  /**
   * Cache chapter content
   */
  cacheChapterContent(url, content) {
    this.contentCache.set('syosetu', 'chapter', content, url);
  }

  getCachedChapterContent(url) {
    return this.contentCache.getWithStats('syosetu', 'chapter', url);
  }

  /**
   * Cache scraping results
   */
  cacheScrapingResult(url, selector, result) {
    this.scrapingCache.set('scraper', 'extract', result, url, selector);
  }

  getCachedScrapingResult(url, selector) {
    return this.scrapingCache.getWithStats('scraper', 'extract', url, selector);
  }

  /**
   * Get comprehensive cache statistics
   */
  getAllStats() {
    return {
      translation: this.translationCache.getStats(),
      api: this.apiCache.getStats(),
      content: this.contentCache.getStats(),
      scraping: this.scrapingCache.getStats(),
      totalMemoryUsage: this._getTotalMemoryUsage()
    };
  }

  _getTotalMemoryUsage() {
    const stats = {
      translation: this.translationCache.getStats(),
      api: this.apiCache.getStats(),
      content: this.contentCache.getStats(),
      scraping: this.scrapingCache.getStats()
    };

    return Object.values(stats).reduce((total, stat) => total + stat.memoryUsage, 0);
  }

  /**
   * Clear all caches
   */
  clearAll() {
    this.translationCache.clear();
    this.apiCache.clear();
    this.contentCache.clear();
    this.scrapingCache.clear();
  }

  /**
   * Clear expired entries from all caches
   */
  cleanupExpired() {
    [this.translationCache, this.apiCache, this.contentCache, this.scrapingCache]
      .forEach(cache => {
        const expiredKeys = [];
        for (const [key, entry] of cache.cache.entries()) {
          if (cache._isExpired(entry.timestamp)) {
            expiredKeys.push(key);
          }
        }
        expiredKeys.forEach(key => {
          cache.cache.delete(key);
          cache.accessTime.delete(key);
        });
      });
  }
}

// Global cache manager instance
export const cacheManager = new CacheManager();

// Cleanup expired entries every 15 minutes
setInterval(() => {
  cacheManager.cleanupExpired();
}, 900000);

export { CacheManager, LRUCache };