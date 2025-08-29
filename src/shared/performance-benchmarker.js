/**
 * Advanced Performance Benchmarking System
 * Automated performance regression tests with comprehensive reporting
 */

import { performance } from 'perf_hooks';
import fs from 'fs/promises';
import path from 'path';

/**
 * Individual benchmark test
 */
class BenchmarkTest {
  constructor(name, testFunction, options = {}) {
    this.name = name;
    this.testFunction = testFunction;
    this.options = {
      iterations: options.iterations || 10,
      warmupIterations: options.warmupIterations || 2,
      timeout: options.timeout || 30000,
      memoryTracking: options.memoryTracking !== false,
      cpuProfiling: options.cpuProfiling || false,
      ...options
    };
    this.results = [];
    this.status = 'pending'; // pending, running, completed, failed
    this.error = null;
  }

  async run() {
    this.status = 'running';
    this.results = [];
    
    try {
      console.log(`🏃 Running benchmark: ${this.name}`);
      
      // Warmup iterations
      console.log(`🔥 Warmup: ${this.options.warmupIterations} iterations`);
      for (let i = 0; i < this.options.warmupIterations; i++) {
        await this._runSingleIteration(true);
      }

      // Force GC before actual test
      if (global.gc) {
        global.gc();
      }

      // Actual benchmark iterations
      console.log(`📊 Benchmark: ${this.options.iterations} iterations`);
      for (let i = 0; i < this.options.iterations; i++) {
        const result = await this._runSingleIteration(false);
        this.results.push(result);
        
        // Progress indicator
        if ((i + 1) % Math.max(1, Math.floor(this.options.iterations / 10)) === 0) {
          const progress = ((i + 1) / this.options.iterations * 100).toFixed(0);
          console.log(`  Progress: ${progress}% (${i + 1}/${this.options.iterations})`);
        }
      }

      this.status = 'completed';
      console.log(`✅ Completed benchmark: ${this.name}`);
      
    } catch (error) {
      this.status = 'failed';
      this.error = error.message;
      console.error(`❌ Benchmark failed: ${this.name}`, error.message);
      throw error;
    }
  }

  async _runSingleIteration() {
    const startTime = performance.now();
    let memoryBefore, memoryAfter;
    
    if (this.options.memoryTracking) {
      memoryBefore = process.memoryUsage();
    }

    let result;
    try {
      // Run with timeout
      result = await Promise.race([
        this.testFunction(),
        this._createTimeoutPromise(this.options.timeout)
      ]);
    } catch (error) {
      throw new Error(`Test execution failed: ${error.message}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    if (this.options.memoryTracking) {
      memoryAfter = process.memoryUsage();
    }

    const iterationResult = {
      duration,
      result,
      timestamp: Date.now(),
      memory: this.options.memoryTracking ? {
        before: memoryBefore,
        after: memoryAfter,
        delta: {
          rss: memoryAfter.rss - memoryBefore.rss,
          heapUsed: memoryAfter.heapUsed - memoryBefore.heapUsed,
          heapTotal: memoryAfter.heapTotal - memoryBefore.heapTotal,
          external: memoryAfter.external - memoryBefore.external
        }
      } : null
    };

    return iterationResult;
  }

  _createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Benchmark timeout after ${timeout}ms`)), timeout);
    });
  }

  getStats() {
    if (this.results.length === 0) {
      return {
        name: this.name,
        status: this.status,
        error: this.error,
        iterations: 0,
        statistics: null
      };
    }

    const durations = this.results.map(r => r.duration);
    const memoryDeltas = this.results
      .filter(r => r.memory)
      .map(r => r.memory.delta);

    durations.sort((a, b) => a - b);

    const stats = {
      name: this.name,
      status: this.status,
      error: this.error,
      iterations: this.results.length,
      statistics: {
        duration: {
          min: Math.min(...durations),
          max: Math.max(...durations),
          mean: durations.reduce((a, b) => a + b, 0) / durations.length,
          median: durations[Math.floor(durations.length / 2)],
          p95: durations[Math.floor(durations.length * 0.95)],
          p99: durations[Math.floor(durations.length * 0.99)],
          stddev: this._calculateStdDev(durations)
        },
        memory: memoryDeltas.length > 0 ? {
          avgHeapDelta: memoryDeltas.reduce((sum, m) => sum + m.heapUsed, 0) / memoryDeltas.length,
          maxHeapDelta: Math.max(...memoryDeltas.map(m => m.heapUsed)),
          avgRssDelta: memoryDeltas.reduce((sum, m) => sum + m.rss, 0) / memoryDeltas.length,
          maxRssDelta: Math.max(...memoryDeltas.map(m => m.rss))
        } : null,
        throughput: {
          operationsPerSecond: 1000 / (durations.reduce((a, b) => a + b, 0) / durations.length),
          totalOperations: durations.length,
          totalTime: durations.reduce((a, b) => a + b, 0)
        }
      }
    };

    return stats;
  }

  _calculateStdDev(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Benchmark suite runner
 */
class BenchmarkSuite {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      parallel: options.parallel || false,
      maxConcurrency: options.maxConcurrency || 3,
      outputDir: options.outputDir || './benchmarks',
      ...options
    };
    this.tests = [];
    this.results = null;
    this.startTime = null;
    this.endTime = null;
  }

  addTest(name, testFunction, options = {}) {
    const test = new BenchmarkTest(name, testFunction, options);
    this.tests.push(test);
    return test;
  }

  async run() {
    console.log(`🚀 Starting benchmark suite: ${this.name}`);
    this.startTime = Date.now();

    try {
      if (this.options.parallel) {
        await this._runParallel();
      } else {
        await this._runSequential();
      }

      this.endTime = Date.now();
      this.results = this._compileResults();
      
      await this._saveResults();
      this._printSummary();
      
      console.log(`🎉 Benchmark suite completed: ${this.name}`);
      return this.results;

    } catch (error) {
      console.error(`❌ Benchmark suite failed: ${this.name}`, error.message);
      throw error;
    }
  }

  async _runSequential() {
    for (const test of this.tests) {
      await test.run();
    }
  }

  async _runParallel() {
    const chunks = [];
    const chunkSize = this.options.maxConcurrency;
    
    for (let i = 0; i < this.tests.length; i += chunkSize) {
      chunks.push(this.tests.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(test => test.run()));
    }
  }

  _compileResults() {
    const testResults = this.tests.map(test => test.getStats());
    
    const totalDuration = this.endTime - this.startTime;
    const successfulTests = testResults.filter(r => r.status === 'completed').length;
    const failedTests = testResults.filter(r => r.status === 'failed').length;

    // Calculate suite-wide statistics
    const allDurations = testResults
      .filter(r => r.statistics)
      .flatMap(r => r.statistics ? [r.statistics.duration.mean] : []);

    const suiteStats = allDurations.length > 0 ? {
      avgTestDuration: allDurations.reduce((a, b) => a + b, 0) / allDurations.length,
      totalTestDuration: allDurations.reduce((a, b) => a + b, 0),
      fastestTest: Math.min(...allDurations),
      slowestTest: Math.max(...allDurations)
    } : null;

    return {
      suiteName: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      totalDuration,
      testCount: this.tests.length,
      successfulTests,
      failedTests,
      suiteStats,
      tests: testResults,
      systemInfo: this._getSystemInfo(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };
  }

  _getSystemInfo() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      return {
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          external: Math.round(memUsage.external / 1024 / 1024)
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system
        },
        uptime: Math.round(process.uptime()),
        loadavg: process.platform !== 'win32' ? require('os').loadavg() : null
      };
    } catch (error) {
      return { error: error.message };
    }
  }

  async _saveResults() {
    try {
      await fs.mkdir(this.options.outputDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${this.name}_${timestamp}.json`;
      const filepath = path.join(this.options.outputDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
      console.log(`💾 Results saved to: ${filepath}`);
      
      // Also save as latest
      const latestPath = path.join(this.options.outputDir, `${this.name}_latest.json`);
      await fs.writeFile(latestPath, JSON.stringify(this.results, null, 2));
      
    } catch (error) {
      console.warn(`⚠️ Failed to save results: ${error.message}`);
    }
  }

  _printSummary() {
    const { results } = this;
    
    console.log('\n📊 BENCHMARK SUMMARY');
    console.log('='.repeat(50));
    console.log(`Suite: ${results.suiteName}`);
    console.log(`Duration: ${results.totalDuration}ms`);
    console.log(`Tests: ${results.testCount} (✅ ${results.successfulTests} / ❌ ${results.failedTests})`);
    
    if (results.suiteStats) {
      console.log(`Avg Test Time: ${results.suiteStats.avgTestDuration.toFixed(2)}ms`);
      console.log(`Fastest Test: ${results.suiteStats.fastestTest.toFixed(2)}ms`);
      console.log(`Slowest Test: ${results.suiteStats.slowestTest.toFixed(2)}ms`);
    }
    
    console.log('\n📋 TEST DETAILS');
    results.tests.forEach(test => {
      const status = test.status === 'completed' ? '✅' : '❌';
      const duration = test.statistics ? `${test.statistics.duration.mean.toFixed(2)}ms` : 'N/A';
      console.log(`${status} ${test.name}: ${duration}`);
      
      if (test.statistics && test.statistics.throughput) {
        console.log(`   Throughput: ${test.statistics.throughput.operationsPerSecond.toFixed(2)} ops/sec`);
      }
    });
    
    console.log('='.repeat(50));
  }
}

/**
 * Performance regression detector
 */
class PerformanceRegressor {
  constructor(baselineFile) {
    this.baselineFile = baselineFile;
    this.baseline = null;
    this.thresholds = {
      durationIncrease: 20, // Alert if >20% slower
      memoryIncrease: 30,   // Alert if >30% more memory
      throughputDecrease: 15 // Alert if >15% less throughput
    };
  }

  async loadBaseline() {
    try {
      const data = await fs.readFile(this.baselineFile, 'utf8');
      this.baseline = JSON.parse(data);
      console.log(`📈 Loaded baseline from: ${this.baselineFile}`);
    } catch (error) {
      console.warn(`⚠️ Could not load baseline: ${error.message}`);
    }
  }

  async detectRegressions(currentResults) {
    if (!this.baseline) {
      console.log('📊 No baseline available, saving current results as baseline');
      return { regressions: [], improvements: [], newTests: currentResults.tests };
    }

    const regressions = [];
    const improvements = [];
    const newTests = [];

    for (const currentTest of currentResults.tests) {
      const baselineTest = this.baseline.tests.find(t => t.name === currentTest.name);
      
      if (!baselineTest) {
        newTests.push(currentTest);
        continue;
      }

      if (!currentTest.statistics || !baselineTest.statistics) {
        continue;
      }

      const comparison = this._compareTests(baselineTest, currentTest);
      
      if (comparison.hasRegression) {
        regressions.push({
          testName: currentTest.name,
          ...comparison
        });
      }

      if (comparison.hasImprovement) {
        improvements.push({
          testName: currentTest.name,
          ...comparison
        });
      }
    }

    return {
      regressions,
      improvements,
      newTests,
      summary: {
        totalRegressions: regressions.length,
        totalImprovements: improvements.length,
        newTestCount: newTests.length,
        hasSignificantRegressions: regressions.some(r => r.severity === 'high')
      }
    };
  }

  _compareTests(baseline, current) {
    const baselineStats = baseline.statistics;
    const currentStats = current.statistics;
    
    // Duration comparison
    const durationChange = ((currentStats.duration.mean - baselineStats.duration.mean) / baselineStats.duration.mean) * 100;
    const durationRegression = durationChange > this.thresholds.durationIncrease;
    
    // Memory comparison
    let memoryChange = 0;
    let memoryRegression = false;
    if (baselineStats.memory && currentStats.memory) {
      memoryChange = ((currentStats.memory.avgHeapDelta - baselineStats.memory.avgHeapDelta) / Math.abs(baselineStats.memory.avgHeapDelta)) * 100;
      memoryRegression = memoryChange > this.thresholds.memoryIncrease;
    }
    
    // Throughput comparison
    const throughputChange = ((currentStats.throughput.operationsPerSecond - baselineStats.throughput.operationsPerSecond) / baselineStats.throughput.operationsPerSecond) * 100;
    const throughputRegression = throughputChange < -this.thresholds.throughputDecrease;

    const hasRegression = durationRegression || memoryRegression || throughputRegression;
    const hasImprovement = durationChange < -10 || throughputChange > 10; // >10% improvement
    
    const severity = (durationChange > 50 || memoryChange > 50 || throughputChange < -50) ? 'high' : 'medium';

    return {
      hasRegression,
      hasImprovement,
      severity,
      changes: {
        duration: {
          baseline: baselineStats.duration.mean,
          current: currentStats.duration.mean,
          changePercent: durationChange,
          isRegression: durationRegression
        },
        memory: baselineStats.memory && currentStats.memory ? {
          baseline: baselineStats.memory.avgHeapDelta,
          current: currentStats.memory.avgHeapDelta,
          changePercent: memoryChange,
          isRegression: memoryRegression
        } : null,
        throughput: {
          baseline: baselineStats.throughput.operationsPerSecond,
          current: currentStats.throughput.operationsPerSecond,
          changePercent: throughputChange,
          isRegression: throughputRegression
        }
      }
    };
  }

  printRegressionReport(analysis) {
    console.log('\n🔍 PERFORMANCE REGRESSION ANALYSIS');
    console.log('='.repeat(50));
    
    if (analysis.summary.hasSignificantRegressions) {
      console.log('🚨 SIGNIFICANT PERFORMANCE REGRESSIONS DETECTED!');
    } else if (analysis.regressions.length > 0) {
      console.log('⚠️ Minor performance regressions detected');
    } else {
      console.log('✅ No performance regressions detected');
    }
    
    if (analysis.regressions.length > 0) {
      console.log('\n📉 REGRESSIONS:');
      analysis.regressions.forEach(reg => {
        console.log(`  ❌ ${reg.testName} (${reg.severity} severity)`);
        if (reg.changes.duration.isRegression) {
          console.log(`     Duration: ${reg.changes.duration.changePercent.toFixed(1)}% slower`);
        }
        if (reg.changes.memory && reg.changes.memory.isRegression) {
          console.log(`     Memory: ${reg.changes.memory.changePercent.toFixed(1)}% more`);
        }
        if (reg.changes.throughput.isRegression) {
          console.log(`     Throughput: ${Math.abs(reg.changes.throughput.changePercent).toFixed(1)}% lower`);
        }
      });
    }
    
    if (analysis.improvements.length > 0) {
      console.log('\n📈 IMPROVEMENTS:');
      analysis.improvements.forEach(imp => {
        console.log(`  ✅ ${imp.testName}`);
        if (imp.changes.duration.changePercent < -10) {
          console.log(`     Duration: ${Math.abs(imp.changes.duration.changePercent).toFixed(1)}% faster`);
        }
        if (imp.changes.throughput.changePercent > 10) {
          console.log(`     Throughput: ${imp.changes.throughput.changePercent.toFixed(1)}% higher`);
        }
      });
    }
    
    if (analysis.newTests.length > 0) {
      console.log(`\n🆕 NEW TESTS: ${analysis.newTests.length}`);
    }
    
    console.log('='.repeat(50));
  }
}

export { BenchmarkTest, BenchmarkSuite, PerformanceRegressor };
export default BenchmarkSuite;