/**
 * Performance Monitor - Monitorowanie wydajności i pamięci aplikacji
 */
import { performance } from 'perf_hooks';

export class PerformanceMonitor {
  constructor(options = {}) {
    this.logInterval = options.logInterval || 10000; // 10s
    this.memoryThreshold = options.memoryThreshold || 200 * 1024 * 1024; // 200MB
    this.isMonitoring = false;
    this.intervalId = null;
    this.metrics = {
      startTime: performance.now(),
      measurements: [],
      memoryLeaks: [],
      slowOperations: []
    };
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.logInitialMemory();
    
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.logInterval);
    
    console.log('🔍 Performance monitoring started');
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('🔍 Performance monitoring stopped');
    this.generateReport();
  }

  logInitialMemory() {
    const memUsage = process.memoryUsage();
    console.log('📊 Initial memory usage:');
    console.log(`   RSS: ${this.formatBytes(memUsage.rss)}`);
    console.log(`   Heap Used: ${this.formatBytes(memUsage.heapUsed)}`);
    console.log(`   Heap Total: ${this.formatBytes(memUsage.heapTotal)}`);
    console.log(`   External: ${this.formatBytes(memUsage.external)}`);
  }

  collectMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = performance.now() - this.metrics.startTime;

    const measurement = {
      timestamp: Date.now(),
      uptime,
      memory: memUsage,
      cpu: cpuUsage
    };

    this.metrics.measurements.push(measurement);

    // Sprawdź czy nie ma przecieku pamięci
    if (memUsage.heapUsed > this.memoryThreshold) {
      this.metrics.memoryLeaks.push({
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss
      });
      
      console.warn(`⚠️  High memory usage detected: ${this.formatBytes(memUsage.heapUsed)}`);
    }

    // Log co 30 sekund
    if (this.metrics.measurements.length % 3 === 0) {
      this.logCurrentStats(measurement);
    }

    // Zachowaj tylko ostatnie 100 pomiarów
    if (this.metrics.measurements.length > 100) {
      this.metrics.measurements = this.metrics.measurements.slice(-100);
    }
  }

  logCurrentStats(measurement) {
    const { memory, uptime } = measurement;
    console.log(`📊 [${this.formatUptime(uptime)}] Memory: Heap ${this.formatBytes(memory.heapUsed)}/${this.formatBytes(memory.heapTotal)}, RSS: ${this.formatBytes(memory.rss)}`);
  }

  async measureOperation(name, operation) {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = await operation();
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;
      
      const duration = endTime - startTime;
      const memoryDelta = endMemory - startMemory;
      
      const operationMetrics = {
        name,
        duration,
        memoryDelta,
        timestamp: Date.now()
      };

      // Zapisz wolne operacje (>5s)
      if (duration > 5000) {
        this.metrics.slowOperations.push(operationMetrics);
        console.warn(`⏱️  Slow operation detected: "${name}" took ${duration.toFixed(2)}ms`);
      }

      if (duration > 1000) {
        console.log(`⏱️  Operation "${name}": ${duration.toFixed(2)}ms, Memory: ${this.formatBytes(memoryDelta, true)}`);
      }

      return result;
    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.error(`❌ Operation "${name}" failed after ${duration.toFixed(2)}ms: ${error.message}`);
      throw error;
    }
  }

  generateReport() {
    console.log('\n📈 PERFORMANCE REPORT');
    console.log('='.repeat(50));
    
    if (this.metrics.measurements.length === 0) {
      console.log('No measurements collected');
      return;
    }

    const measurements = this.metrics.measurements;
    const first = measurements[0];
    const last = measurements[measurements.length - 1];
    
    // Memory usage trend
    const memoryGrowth = last.memory.heapUsed - first.memory.heapUsed;
    console.log(`Memory growth: ${this.formatBytes(memoryGrowth, true)} over ${this.formatUptime(last.uptime - first.uptime)}`);
    
    // Peak memory usage
    const peakMemory = Math.max(...measurements.map(m => m.memory.heapUsed));
    console.log(`Peak memory usage: ${this.formatBytes(peakMemory)}`);
    
    // Average memory usage
    const avgMemory = measurements.reduce((sum, m) => sum + m.memory.heapUsed, 0) / measurements.length;
    console.log(`Average memory usage: ${this.formatBytes(avgMemory)}`);

    // Memory leaks
    if (this.metrics.memoryLeaks.length > 0) {
      console.log(`\n⚠️  Memory warnings: ${this.metrics.memoryLeaks.length}`);
      this.metrics.memoryLeaks.forEach(leak => {
        console.log(`   ${new Date(leak.timestamp).toISOString()}: ${this.formatBytes(leak.heapUsed)}`);
      });
    }

    // Slow operations
    if (this.metrics.slowOperations.length > 0) {
      console.log(`\n⏱️  Slow operations: ${this.metrics.slowOperations.length}`);
      this.metrics.slowOperations.forEach(op => {
        console.log(`   ${op.name}: ${op.duration.toFixed(2)}ms`);
      });
    }

    console.log('='.repeat(50));
  }

  getMetrics() {
    return {
      ...this.metrics,
      currentMemory: process.memoryUsage(),
      uptime: performance.now() - this.metrics.startTime
    };
  }

  formatBytes(bytes, signed = false) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    const prefix = signed && bytes > 0 ? '+' : '';
    
    return `${prefix}${value.toFixed(1)} ${sizes[i]}`;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  logMemoryUsage(context = '') {
    const memUsage = process.memoryUsage();
    const contextStr = context ? `[${context}] ` : '';
    console.log(`📊 ${contextStr}Memory: Heap ${this.formatBytes(memUsage.heapUsed)}/${this.formatBytes(memUsage.heapTotal)}, RSS: ${this.formatBytes(memUsage.rss)}`);
    return memUsage;
  }

  triggerGC(forceLog = false) {
    if (global.gc) {
      const beforeMem = process.memoryUsage();
      global.gc();
      const afterMem = process.memoryUsage();
      const freed = beforeMem.heapUsed - afterMem.heapUsed;
      
      if (forceLog || freed > 5 * 1024 * 1024) { // Log if freed >5MB
        console.log(`🧹 GC freed ${this.formatBytes(freed)}: ${this.formatBytes(beforeMem.heapUsed)} → ${this.formatBytes(afterMem.heapUsed)}`);
      }
      return freed;
    }
    return 0;
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Graceful shutdown handler
process.on('SIGINT', () => {
  performanceMonitor.stopMonitoring();
  process.exit(0);
});

process.on('SIGTERM', () => {
  performanceMonitor.stopMonitoring();
  process.exit(0);
});