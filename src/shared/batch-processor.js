/**
 * Batch Processor - Async batch processing with concurrency control
 */
import { performanceMonitor } from './performance-monitor.js';
import { ProcessingError } from './errors.js';

export class Semaphore {
  constructor(capacity) {
    this.capacity = capacity;
    this.running = 0;
    this.queue = [];
    this.stats = {
      totalAcquisitions: 0,
      totalReleases: 0,
      maxQueueLength: 0,
      totalWaitTime: 0,
      lastAcquireTime: 0
    };
  }

  async acquire() {
    this.stats.totalAcquisitions++;
    const startTime = Date.now();
    
    if (this.running < this.capacity) {
      this.running++;
      this.stats.lastAcquireTime = Date.now();
      return;
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, startTime });
      this.stats.maxQueueLength = Math.max(this.stats.maxQueueLength, this.queue.length);
    });
  }

  release() {
    this.stats.totalReleases++;
    this.running--;
    
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      const waitTime = Date.now() - next.startTime;
      this.stats.totalWaitTime += waitTime;
      this.running++;
      this.stats.lastAcquireTime = Date.now();
      next.resolve();
    }
  }

  async use(task) {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  getStats() {
    return {
      ...this.stats,
      currentQueueLength: this.queue.length,
      currentRunning: this.running,
      capacity: this.capacity,
      avgWaitTime: this.stats.totalAcquisitions > 0 
        ? this.stats.totalWaitTime / this.stats.totalAcquisitions 
        : 0,
      utilization: this.capacity > 0 ? this.running / this.capacity : 0
    };
  }

  resize(newCapacity) {
    if (newCapacity < 1) throw new Error('Capacity must be at least 1');
    
    const oldCapacity = this.capacity;
    this.capacity = newCapacity;
    
    // Release additional slots if capacity increased
    const additionalSlots = Math.max(0, newCapacity - oldCapacity);
    for (let i = 0; i < additionalSlots && this.queue.length > 0; i++) {
      const next = this.queue.shift();
      const waitTime = Date.now() - next.startTime;
      this.stats.totalWaitTime += waitTime;
      this.running++;
      this.stats.lastAcquireTime = Date.now();
      next.resolve();
    }
    
    return this.getStats();
  }
}

export class BatchProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 3;
    this.maxConcurrency = options.maxConcurrency || 2;
    this.delayBetweenBatches = options.delayBetweenBatches || 1000;
    this.adaptiveConcurrency = options.adaptiveConcurrency !== false;
    this.concurrencyCheckInterval = options.concurrencyCheckInterval || 5000;
    this.semaphore = new Semaphore(this.maxConcurrency);
    this.metrics = {
      totalProcessed: 0,
      totalFailed: 0,
      batchCount: 0,
      startTime: null,
      concurrencyChanges: [],
      lastConcurrencyCheck: 0
    };
    
    if (this.adaptiveConcurrency) {
      this._setupAdaptiveConcurrency();
    }
  }

  async processBatch(items, processor, context = '') {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return [];
    }

    if (!processor || typeof processor !== 'function') {
      throw new ProcessingError('Processor function is required');
    }

    this.metrics.startTime = Date.now();
    console.log(`🚀 Starting batch processing: ${items.length} items, batch size: ${this.batchSize}, concurrency: ${this.maxConcurrency}`);

    const results = [];
    const batches = this.createBatches(items);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\n📦 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} items)`);

      const batchResults = await this.processSingleBatch(batch, processor, context);
      results.push(...batchResults);

      this.metrics.batchCount++;

      // Adaptive concurrency adjustment
      if (this.adaptiveConcurrency) {
        await this._checkAndAdjustConcurrency();
      }

      // Memory cleanup between batches
      if (batchIndex < batches.length - 1) {
        performanceMonitor.logMemoryUsage(`Post-batch ${batchIndex + 1}`);
        performanceMonitor.triggerGC();
        
        if (this.delayBetweenBatches > 0) {
          console.log(`⏱️  Waiting ${this.delayBetweenBatches}ms before next batch...`);
          await this.delay(this.delayBetweenBatches);
        }
      }
    }

    this.logFinalStats(results);
    return results;
  }

  async processSingleBatch(batch, processor, context) {
    const batchPromises = batch.map(async (item, index) => {
      return await this.semaphore.use(async () => {
        try {
          const itemContext = `${context} Batch Item ${index + 1}`;
          return await performanceMonitor.measureOperation(itemContext, () => processor(item));
        } catch (error) {
          this.metrics.totalFailed++;
          console.error(`❌ Batch item ${index + 1} failed: ${error.message}`);
          return {
            error: true,
            item,
            message: error.message,
            timestamp: Date.now()
          };
        }
      });
    });

    const results = await Promise.allSettled(batchPromises);
    const processedResults = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        this.metrics.totalProcessed++;
        return result.value;
      } else {
        this.metrics.totalFailed++;
        console.error(`❌ Batch item ${index + 1} rejected: ${result.reason?.message || result.reason}`);
        return {
          error: true,
          item: batch[index],
          message: result.reason?.message || result.reason,
          timestamp: Date.now()
        };
      }
    });

    const successCount = processedResults.filter(r => !r.error).length;
    const failCount = processedResults.filter(r => r.error).length;
    console.log(`✅ Batch completed: ${successCount} success, ${failCount} failed`);

    return processedResults;
  }

  createBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.batchSize) {
      batches.push(items.slice(i, i + this.batchSize));
    }
    return batches;
  }

  async processSequentialBatches(items, processor, context = '') {
    // Alternative: sequential batch processing (one batch at a time, items concurrent within batch)
    if (!items || !Array.isArray(items)) {
      return [];
    }

    console.log(`🔄 Starting sequential batch processing: ${items.length} items`);
    const results = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const batchNum = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(items.length / this.batchSize);
      
      console.log(`\n📦 Sequential batch ${batchNum}/${totalBatches}`);
      
      const batchResults = await this.processSingleBatch(batch, processor, context);
      results.push(...batchResults);
      
      // Cleanup between batches
      if (i + this.batchSize < items.length) {
        performanceMonitor.triggerGC();
        await this.delay(this.delayBetweenBatches);
      }
    }

    return results;
  }

  async processWithRetry(items, processor, maxRetries = 2) {
    let attempts = 0;
    let lastError = null;

    while (attempts <= maxRetries) {
      try {
        const results = await this.processBatch(items, processor, `Attempt ${attempts + 1}`);
        const errors = results.filter(r => r.error);
        
        if (errors.length === 0) {
          return results;
        }

        if (attempts === maxRetries) {
          console.warn(`⚠️  Final attempt completed with ${errors.length} errors`);
          return results;
        }

        // Retry only failed items
        console.log(`🔄 Retrying ${errors.length} failed items (attempt ${attempts + 2}/${maxRetries + 1})`);
        items = errors.map(e => e.item);
        attempts++;
        
        // Exponential backoff
        await this.delay(1000 * Math.pow(2, attempts));
        
      } catch (error) {
        lastError = error;
        attempts++;
        
        if (attempts <= maxRetries) {
          console.error(`❌ Batch attempt ${attempts} failed: ${error.message}. Retrying...`);
          await this.delay(1000 * Math.pow(2, attempts));
        }
      }
    }

    throw new ProcessingError(`Batch processing failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
  }

  logFinalStats(results) {
    const duration = Date.now() - this.metrics.startTime;
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    const throughput = results.length / (duration / 1000);
    const semaphoreStats = this.semaphore.getStats();

    console.log('\n📊 BATCH PROCESSING STATS');
    console.log('='.repeat(50));
    console.log(`Total items: ${results.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Batches: ${this.metrics.batchCount}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Throughput: ${throughput.toFixed(2)} items/sec`);
    console.log(`Success rate: ${((successCount / results.length) * 100).toFixed(1)}%`);
    console.log('\n🎯 CONCURRENCY STATS');
    console.log(`Final concurrency: ${this.maxConcurrency}`);
    console.log(`Max queue length: ${semaphoreStats.maxQueueLength}`);
    console.log(`Avg wait time: ${semaphoreStats.avgWaitTime.toFixed(2)}ms`);
    console.log(`Utilization: ${(semaphoreStats.utilization * 100).toFixed(1)}%`);
    
    if (this.metrics.concurrencyChanges.length > 0) {
      console.log(`Concurrency changes: ${this.metrics.concurrencyChanges.length}`);
      this.metrics.concurrencyChanges.forEach(change => {
        console.log(`  ${change.timestamp}: ${change.old} → ${change.new} (${change.reason})`);
      });
    }
    console.log('='.repeat(50));
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _setupAdaptiveConcurrency() {
    this.metrics.lastConcurrencyCheck = Date.now();
  }

  async _checkAndAdjustConcurrency() {
    const now = Date.now();
    if (now - this.metrics.lastConcurrencyCheck < this.concurrencyCheckInterval) {
      return;
    }

    this.metrics.lastConcurrencyCheck = now;
    const stats = this.semaphore.getStats();
    
    // High queue length and low utilization - increase concurrency
    if (stats.currentQueueLength > 5 && stats.utilization < 0.7) {
      const newConcurrency = Math.min(this.maxConcurrency * 2, 20); // Cap at 20
      if (newConcurrency > this.maxConcurrency) {
        this._adjustConcurrency(newConcurrency, 'High queue, low utilization');
      }
    }
    
    // Low queue length and high utilization - decrease concurrency
    if (stats.currentQueueLength === 0 && stats.utilization > 0.9 && this.maxConcurrency > 2) {
      const newConcurrency = Math.max(2, Math.floor(this.maxConcurrency * 0.8));
      if (newConcurrency < this.maxConcurrency) {
        this._adjustConcurrency(newConcurrency, 'Low queue, high utilization');
      }
    }

    // Very high wait times - increase concurrency
    if (stats.avgWaitTime > 1000 && this.maxConcurrency < 10) {
      const newConcurrency = Math.min(this.maxConcurrency + 2, 10);
      this._adjustConcurrency(newConcurrency, 'High wait times');
    }
  }

  _adjustConcurrency(newConcurrency, reason) {
    const oldConcurrency = this.maxConcurrency;
    
    if (newConcurrency === oldConcurrency) {
      return;
    }

    console.log(`🔄 Adjusting concurrency: ${oldConcurrency} → ${newConcurrency} (${reason})`);
    
    // Resize the semaphore
    this.semaphore.resize(newConcurrency);
    this.maxConcurrency = newConcurrency;
    
    // Record the change
    this.metrics.concurrencyChanges.push({
      timestamp: new Date().toISOString(),
      old: oldConcurrency,
      new: newConcurrency,
      reason: reason
    });
  }

  getConcurrencyStats() {
    return {
      current: this.maxConcurrency,
      changes: this.metrics.concurrencyChanges,
      semaphore: this.semaphore.getStats()
    };
  }

  // Utility method for processing chapters with URL chain discovery
  async processChapterChain(startUrl, processor, options = {}) {
    const {
      maxChapters = 10,
      discoverNext = true,
      batchChainDiscovery = false
    } = options;

    const chapters = [];
    let currentUrl = startUrl;
    let chapterCount = 0;

    // Phase 1: Discover chapter URLs (if needed)
    if (batchChainDiscovery && discoverNext) {
      console.log('🔍 Discovering chapter chain...');
      
      while (currentUrl && chapterCount < maxChapters) {
        chapters.push({
          url: currentUrl,
          index: chapterCount
        });
        
        // Simple discovery - would need actual implementation
        // For now, just add current URL and stop
        break;
      }
    } else {
      // Add just the start URL for single chapter or simple processing
      chapters.push({ url: startUrl, index: 0 });
    }

    // Phase 2: Batch process discovered chapters
    const results = await this.processBatch(
      chapters,
      async (chapter) => {
        console.log(`📖 Processing chapter ${chapter.index + 1}: ${chapter.url}`);
        return await processor(chapter.url);
      },
      'Chapter Processing'
    );

    return results;
  }
}

// Export singleton for convenience
export const batchProcessor = new BatchProcessor();