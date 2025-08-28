/**
 * Streaming TTS Processing - Eliminate audio buffering
 * Process and stream audio chunks directly to filesystem without memory buffering
 */

import { Writable, Readable, Transform } from 'stream';
import { createWriteStream } from 'fs';
import path from 'path';

/**
 * Streaming audio writer - writes chunks as they arrive
 */
export class StreamingAudioWriter extends Writable {
  constructor(outputPath, options = {}) {
    super(options);
    this.outputPath = outputPath;
    this.fileStream = null;
    this.totalBytes = 0;
    this.chunkCount = 0;
  }

  async _construct(callback) {
    try {
      this.fileStream = createWriteStream(this.outputPath);
      this.fileStream.on('error', callback);
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _write(chunk, encoding, callback) {
    this.totalBytes += chunk.length;
    this.chunkCount++;
    
    // Write directly to file, no buffering
    this.fileStream.write(chunk, callback);
  }

  _final(callback) {
    if (this.fileStream) {
      this.fileStream.end(callback);
    } else {
      callback();
    }
  }

  getStats() {
    return {
      totalBytes: this.totalBytes,
      chunkCount: this.chunkCount,
      sizeMB: (this.totalBytes / (1024 * 1024)).toFixed(2)
    };
  }
}

/**
 * Audio chunk processor - handles concurrent chunk processing
 */
export class AudioChunkProcessor {
  constructor(options = {}) {
    this.maxConcurrentChunks = options.maxConcurrentChunks || 3;
    this.chunkTimeout = options.chunkTimeout || 30000;
    this.activeProcesses = new Set();
  }

  async processChunk(ttsEngine, textChunk, chunkIndex, options = {}) {
    const processId = `${chunkIndex}-${Date.now()}`;
    this.activeProcesses.add(processId);

    try {
      console.log(`🎵 Processing audio chunk ${chunkIndex + 1}...`);
      
      const startTime = Date.now();
      const audioBuffer = await Promise.race([
        ttsEngine.synthesizeSpeech(textChunk, options),
        this._createTimeoutPromise(this.chunkTimeout)
      ]);

      const processingTime = Date.now() - startTime;
      console.log(`✓ Chunk ${chunkIndex + 1} processed in ${processingTime}ms`);

      return {
        index: chunkIndex,
        buffer: audioBuffer,
        processingTime,
        size: audioBuffer.length
      };

    } catch (error) {
      console.error(`❌ Chunk ${chunkIndex + 1} processing failed:`, error.message);
      throw error;
    } finally {
      this.activeProcesses.delete(processId);
    }
  }

  _createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Chunk processing timeout (${timeout}ms)`)), timeout);
    });
  }

  async processChunksConcurrently(ttsEngine, textChunks, options = {}) {
    const results = [];
    const processingPromises = [];

    // Process chunks in batches to control concurrency
    for (let i = 0; i < textChunks.length; i += this.maxConcurrentChunks) {
      const batch = textChunks.slice(i, i + this.maxConcurrentChunks);
      
      const batchPromises = batch.map((chunk, batchIndex) => 
        this.processChunk(ttsEngine, chunk, i + batchIndex, options)
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('Chunk processing failed:', result.reason);
          throw result.reason;
        }
      }

      // Brief pause between batches to prevent API rate limiting
      if (i + this.maxConcurrentChunks < textChunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Sort results by index to maintain order
    return results.sort((a, b) => a.index - b.index);
  }

  getActiveProcessCount() {
    return this.activeProcesses.size;
  }
}

/**
 * Streaming TTS Manager - main orchestrator
 */
export class StreamingTTSManager {
  constructor(ttsEngine, options = {}) {
    this.ttsEngine = ttsEngine;
    this.chunkProcessor = new AudioChunkProcessor({
      maxConcurrentChunks: options.maxConcurrentChunks || 3,
      chunkTimeout: options.chunkTimeout || 30000
    });
    this.enableProgressReporting = options.enableProgressReporting || true;
    this.stats = {
      startTime: null,
      totalChunks: 0,
      processedChunks: 0,
      totalBytes: 0,
      errors: 0
    };
  }

  async generateStreamingAudio(textChunks, outputPath, options = {}) {
    this.stats.startTime = Date.now();
    this.stats.totalChunks = textChunks.length;
    this.stats.processedChunks = 0;
    this.stats.totalBytes = 0;
    this.stats.errors = 0;

    console.log(`🚀 Starting streaming TTS generation for ${textChunks.length} chunks`);

    try {
      // Create streaming writer
      const streamingWriter = new StreamingAudioWriter(outputPath);
      
      // Process chunks concurrently and stream results
      const chunkResults = await this.chunkProcessor.processChunksConcurrently(
        this.ttsEngine, 
        textChunks, 
        options
      );

      // Stream each result directly to file
      for (const chunkResult of chunkResults) {
        await this._streamChunkToWriter(chunkResult, streamingWriter);
        this.stats.processedChunks++;
        this.stats.totalBytes += chunkResult.size;

        if (this.enableProgressReporting) {
          this._reportProgress();
        }

        // Clear buffer immediately after streaming
        chunkResult.buffer = null;
        
        // Force GC on large chunks
        if (chunkResult.size > 5 * 1024 * 1024 && global.gc) { // 5MB threshold
          global.gc();
        }
      }

      // Finalize stream
      await this._finalizeStream(streamingWriter);

      const finalStats = this._getFinalStats(streamingWriter);
      console.log(`✅ Streaming TTS completed: ${finalStats.sizeMB} MB in ${finalStats.totalTimeMs}ms`);
      
      return finalStats;

    } catch (error) {
      this.stats.errors++;
      console.error('❌ Streaming TTS failed:', error.message);
      throw error;
    }
  }

  async _streamChunkToWriter(chunkResult, writer) {
    return new Promise((resolve, reject) => {
      writer.write(chunkResult.buffer, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async _finalizeStream(writer) {
    return new Promise((resolve, reject) => {
      writer.end((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  _reportProgress() {
    const progress = (this.stats.processedChunks / this.stats.totalChunks * 100).toFixed(1);
    const elapsedTime = Date.now() - this.stats.startTime;
    const avgChunkTime = elapsedTime / this.stats.processedChunks;
    const estimatedTotal = avgChunkTime * this.stats.totalChunks;
    const remaining = Math.max(0, estimatedTotal - elapsedTime);

    console.log(`📊 Progress: ${progress}% (${this.stats.processedChunks}/${this.stats.totalChunks}) - ETA: ${Math.round(remaining/1000)}s`);
  }

  _getFinalStats(writer) {
    const totalTime = Date.now() - this.stats.startTime;
    const writerStats = writer.getStats();
    
    return {
      path: writer.outputPath,
      totalTimeMs: totalTime,
      totalChunks: this.stats.totalChunks,
      processedChunks: this.stats.processedChunks,
      totalBytes: this.stats.totalBytes,
      sizeMB: writerStats.sizeMB,
      avgChunkTimeMs: totalTime / this.stats.processedChunks,
      throughputMBps: (this.stats.totalBytes / (1024 * 1024)) / (totalTime / 1000),
      errors: this.stats.errors
    };
  }

  /**
   * Enhanced text splitting with better chunk size optimization
   */
  static optimizeTextChunks(text, options = {}) {
    const maxChunkSize = options.maxChunkSize || 3500; // Conservative size for API limits
    const preferredChunkSize = options.preferredChunkSize || 2500; // Target size
    const sentenceEndMarkers = /[.!?]+\s/g;
    
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    const sentences = text.split(sentenceEndMarkers);
    let currentChunk = '';

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue;

      const sentenceWithPunctuation = sentence + (i < sentences.length - 1 ? '. ' : '');
      const potentialChunk = currentChunk + sentenceWithPunctuation;

      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
        
        // If we've reached preferred size and this is a good stopping point
        if (currentChunk.length >= preferredChunkSize) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      } else {
        // Current chunk is full, push it and start new one
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentenceWithPunctuation;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text.substring(0, maxChunkSize)];
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
      external: (memUsage.external / 1024 / 1024).toFixed(2) + ' MB',
      rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
      activeProcesses: this.chunkProcessor.getActiveProcessCount()
    };
  }
}

/**
 * Streaming TTS factory function
 */
export function createStreamingTTS(ttsEngine, options = {}) {
  return new StreamingTTSManager(ttsEngine, options);
}

export default StreamingTTSManager;