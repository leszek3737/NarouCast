/**
 * Phase 2 Integration Tests
 * Tests for advanced optimizations functionality
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { cacheManager } from '../src/shared/cache-manager.js';
import { connectionPool } from '../src/shared/connection-pool.js';
import { errorRateMonitor } from '../src/shared/error-rate-monitor.js';
import { StreamingTTSManager } from '../src/tts/streaming-tts.js';
import { BenchmarkSuite } from '../src/shared/performance-benchmarker.js';

describe('Phase 2 Advanced Optimizations', () => {
  
  describe('Smart Caching System', () => {
    
    it('should cache and retrieve translation results', () => {
      const provider = 'deepseek';
      const sourceText = 'Hello world';
      const targetLang = 'pl';
      const translatedText = 'Witaj świecie';

      // Cache translation
      cacheManager.cacheTranslation(provider, sourceText, targetLang, translatedText);

      // Retrieve from cache
      const cached = cacheManager.getCachedTranslation(provider, sourceText, targetLang);
      assert.strictEqual(cached, translatedText);
    });

    it('should cache and retrieve chapter content', () => {
      const url = 'https://ncode.syosetu.com/n1234ab/1/';
      const content = { title: 'Test Chapter', content: 'Test content' };

      // Cache content
      cacheManager.cacheChapterContent(url, content);

      // Retrieve from cache
      const cached = cacheManager.getCachedChapterContent(url);
      assert.deepStrictEqual(cached, content);
    });

    it('should provide cache statistics', () => {
      const stats = cacheManager.getAllStats();
      
      assert(typeof stats.translation === 'object');
      assert(typeof stats.content === 'object');
      assert(typeof stats.totalMemoryUsage === 'number');
      assert(stats.totalMemoryUsage >= 0);
    });

  });

  describe('Error Rate Monitoring', () => {

    it('should record successful operations', () => {
      const providerId = 'test-provider';
      
      errorRateMonitor.recordSuccess(providerId, 'test-operation', 100);
      
      const metrics = errorRateMonitor.getAllMetrics();
      assert(metrics.providers[providerId]);
      assert.strictEqual(metrics.providers[providerId].requests.successful, 1);
      assert.strictEqual(metrics.providers[providerId].status, 'healthy');
    });

    it('should record failed operations', () => {
      const providerId = 'test-provider-2';
      
      errorRateMonitor.recordFailure(providerId, 'network_error', 'test-operation');
      
      const metrics = errorRateMonitor.getAllMetrics();
      assert(metrics.providers[providerId]);
      assert.strictEqual(metrics.providers[providerId].requests.failed, 1);
    });

    it('should check provider availability', () => {
      const providerId = 'healthy-provider';
      
      // Record some successes
      for (let i = 0; i < 10; i++) {
        errorRateMonitor.recordSuccess(providerId, 'test', 50);
      }
      
      assert.strictEqual(errorRateMonitor.isProviderAvailable(providerId), true);
    });

    it('should provide comprehensive metrics', () => {
      const metrics = errorRateMonitor.getAllMetrics();
      
      assert(typeof metrics.providers === 'object');
      assert(typeof metrics.global === 'object');
      assert(typeof metrics.alerts === 'object');
      assert(Array.isArray(metrics.alerts.active));
      assert(Array.isArray(metrics.alerts.resolved));
    });

  });

  describe('Connection Pooling', () => {

    it('should provide pool statistics', () => {
      const stats = connectionPool.getAllStats();
      
      assert(typeof stats.http === 'object');
      assert(typeof stats.https === 'object');
      assert(typeof stats.summary === 'object');
      assert(typeof stats.summary.totalRequests === 'number');
    });

    it('should handle cleanup', () => {
      // This should not throw
      connectionPool.cleanup();
      assert(true);
    });

  });

  describe('Streaming TTS', () => {

    it('should optimize text chunks', () => {
      const text = 'This is a test. This is another sentence. And another one.';
      const chunks = StreamingTTSManager.optimizeTextChunks(text, {
        maxChunkSize: 30,
        preferredChunkSize: 20
      });
      
      assert(Array.isArray(chunks));
      assert(chunks.length > 0);
      
      // Each chunk should be within size limits
      chunks.forEach(chunk => {
        assert(chunk.length <= 30);
      });
    });

    it('should create streaming TTS manager', () => {
      const mockEngine = {
        synthesizeSpeech: async () => Buffer.from('mock audio data')
      };
      
      const streamingTTS = new StreamingTTSManager(mockEngine);
      assert(streamingTTS instanceof StreamingTTSManager);
    });

    it('should provide memory statistics', () => {
      const mockEngine = {};
      const streamingTTS = new StreamingTTSManager(mockEngine);
      const memStats = streamingTTS.getMemoryStats();
      
      assert(typeof memStats === 'object');
      assert(typeof memStats.heapUsed === 'string');
      assert(typeof memStats.heapTotal === 'string');
      assert(typeof memStats.activeProcesses === 'number');
    });

  });

  describe('Performance Benchmarking', () => {

    it('should create benchmark suite', () => {
      const suite = new BenchmarkSuite('test-suite');
      assert(suite instanceof BenchmarkSuite);
      assert.strictEqual(suite.name, 'test-suite');
    });

    it('should add benchmark test', () => {
      const suite = new BenchmarkSuite('test-suite');
      const testFn = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'test result';
      };
      
      const test = suite.addTest('test-benchmark', testFn, { iterations: 3 });
      assert.strictEqual(test.name, 'test-benchmark');
      assert.strictEqual(test.options.iterations, 3);
    });

  });

  describe('Integration', () => {

    it('should integrate all Phase 2 components without conflicts', () => {
      // Test that all components can coexist
      const cacheStats = cacheManager.getAllStats();
      const poolStats = connectionPool.getAllStats();
      const errorStats = errorRateMonitor.getAllMetrics();
      
      assert(typeof cacheStats === 'object');
      assert(typeof poolStats === 'object');
      assert(typeof errorStats === 'object');
    });

    it('should handle cleanup gracefully', () => {
      // Cleanup operations should not throw
      cacheManager.cleanupExpired();
      connectionPool.cleanup();
      
      // Reset error monitor for clean state
      errorRateMonitor.reset();
      
      assert(true);
    });

  });

  // Cleanup after tests
  after(() => {
    // Clear all caches
    cacheManager.clearAll();
    
    // Reset monitoring
    errorRateMonitor.reset();
    
    console.log('✅ Phase 2 integration tests completed');
  });

});