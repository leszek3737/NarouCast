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
  }

  async acquire() {
    return new Promise((resolve, reject) => {
      if (this.running < this.capacity) {
        this.running++;
        resolve();
      } else {
        this.queue.push({ resolve, reject });
      }
    });
  }

  release() {
    this.running--;
    if (this.queue.length > 0) {
      const { resolve } = this.queue.shift();
      this.running++;
      resolve();
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
}

export class BatchProcessor {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 3;
    this.maxConcurrency = options.maxConcurrency || 2;
    this.delayBetweenBatches = options.delayBetweenBatches || 1000;
    this.semaphore = new Semaphore(this.maxConcurrency);
    this.metrics = {
      totalProcessed: 0,
      totalFailed: 0,
      batchCount: 0,
      startTime: null
    };
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

    console.log('\n📊 BATCH PROCESSING STATS');
    console.log('='.repeat(40));
    console.log(`Total items: ${results.length}`);
    console.log(`Success: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Batches: ${this.metrics.batchCount}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Throughput: ${throughput.toFixed(2)} items/sec`);
    console.log(`Success rate: ${((successCount / results.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(40));
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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