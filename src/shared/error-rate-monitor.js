/**
 * Error Rate Monitoring System
 * Tracks success/failure rates per provider with advanced analytics
 */

/**
 * Provider performance metrics
 */
class ProviderMetrics {
  constructor(providerId) {
    this.providerId = providerId;
    this.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      timeout: 0,
      rateLimited: 0
    };
    this.responseTimes = [];
    this.errors = new Map(); // errorType -> count
    this.hourlyStats = new Map(); // hour -> stats
    this.dailyStats = new Map(); // date -> stats
    this.lastUpdated = Date.now();
    this.status = 'healthy'; // healthy, degraded, critical, offline
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 0;
    this.firstErrorTime = null;
    this.lastErrorTime = null;
    
    // Circuit breaker state
    this.circuitBreaker = {
      state: 'closed', // closed, open, half-open
      failures: 0,
      lastFailure: null,
      openedAt: null,
      nextRetryAt: null
    };
  }

  /**
   * Record successful request
   */
  recordSuccess(responseTime = 0, operation = 'default') {
    this.requests.total++;
    this.requests.successful++;
    this.consecutiveFailures = 0;
    
    if (responseTime > 0) {
      this.responseTimes.push(responseTime);
      // Keep only last 1000 response times
      if (this.responseTimes.length > 1000) {
        this.responseTimes.shift();
      }
    }

    this._updateHourlyStats('success', responseTime);
    this._updateStatus();
    this._updateCircuitBreaker('success');
    this.lastUpdated = Date.now();
  }

  /**
   * Record failed request
   */
  recordFailure(errorType = 'unknown', operation = 'default', isTimeout = false, isRateLimit = false) {
    this.requests.total++;
    this.requests.failed++;
    this.consecutiveFailures++;
    
    if (this.consecutiveFailures > this.maxConsecutiveFailures) {
      this.maxConsecutiveFailures = this.consecutiveFailures;
    }

    // Track error types
    const currentCount = this.errors.get(errorType) || 0;
    this.errors.set(errorType, currentCount + 1);

    // Special counters
    if (isTimeout) {
      this.requests.timeout++;
    }
    if (isRateLimit) {
      this.requests.rateLimited++;
    }

    // Track timing
    const now = Date.now();
    if (!this.firstErrorTime) {
      this.firstErrorTime = now;
    }
    this.lastErrorTime = now;

    this._updateHourlyStats('failure');
    this._updateStatus();
    this._updateCircuitBreaker('failure');
    this.lastUpdated = now;
  }

  /**
   * Record retry attempt
   */
  recordRetry(operation = 'default') {
    this.requests.retried++;
    this._updateHourlyStats('retry');
    this.lastUpdated = Date.now();
  }

  /**
   * Update hourly statistics
   */
  _updateHourlyStats(type, responseTime = 0) {
    const hour = Math.floor(Date.now() / (1000 * 60 * 60));
    let hourStats = this.hourlyStats.get(hour);
    
    if (!hourStats) {
      hourStats = {
        success: 0,
        failure: 0,
        retry: 0,
        totalResponseTime: 0,
        count: 0
      };
      this.hourlyStats.set(hour, hourStats);
    }

    hourStats[type]++;
    if (responseTime > 0) {
      hourStats.totalResponseTime += responseTime;
      hourStats.count++;
    }

    // Keep only last 168 hours (7 days)
    if (this.hourlyStats.size > 168) {
      const oldestHour = Math.min(...this.hourlyStats.keys());
      this.hourlyStats.delete(oldestHour);
    }
  }

  /**
   * Update provider status based on error rates
   */
  _updateStatus() {
    const errorRate = this.getErrorRate();
    const recentFailures = this.consecutiveFailures;

    if (recentFailures >= 10 || errorRate >= 50) {
      this.status = 'critical';
    } else if (recentFailures >= 5 || errorRate >= 25) {
      this.status = 'degraded';
    } else if (errorRate >= 10) {
      this.status = 'warning';
    } else {
      this.status = 'healthy';
    }
  }

  /**
   * Update circuit breaker state
   */
  _updateCircuitBreaker(result) {
    const now = Date.now();
    const { circuitBreaker } = this;

    switch (circuitBreaker.state) {
      case 'closed':
        if (result === 'failure') {
          circuitBreaker.failures++;
          circuitBreaker.lastFailure = now;
          
          // Open circuit if failure threshold reached
          if (circuitBreaker.failures >= 5) {
            circuitBreaker.state = 'open';
            circuitBreaker.openedAt = now;
            circuitBreaker.nextRetryAt = now + 60000; // 1 minute
            console.warn(`🔴 Circuit breaker OPEN for provider ${this.providerId}`);
          }
        } else {
          circuitBreaker.failures = 0;
        }
        break;

      case 'open':
        if (now >= circuitBreaker.nextRetryAt) {
          circuitBreaker.state = 'half-open';
          console.log(`🟡 Circuit breaker HALF-OPEN for provider ${this.providerId}`);
        }
        break;

      case 'half-open':
        if (result === 'success') {
          circuitBreaker.state = 'closed';
          circuitBreaker.failures = 0;
          circuitBreaker.openedAt = null;
          circuitBreaker.nextRetryAt = null;
          console.log(`🟢 Circuit breaker CLOSED for provider ${this.providerId}`);
        } else {
          circuitBreaker.state = 'open';
          circuitBreaker.failures++;
          circuitBreaker.openedAt = now;
          circuitBreaker.nextRetryAt = now + Math.min(300000, 60000 * Math.pow(2, circuitBreaker.failures)); // Exponential backoff, max 5 minutes
          console.warn(`🔴 Circuit breaker OPEN again for provider ${this.providerId}`);
        }
        break;
    }
  }

  /**
   * Get current error rate percentage
   */
  getErrorRate() {
    if (this.requests.total === 0) return 0;
    return (this.requests.failed / this.requests.total * 100).toFixed(2);
  }

  /**
   * Get average response time
   */
  getAverageResponseTime() {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.responseTimes.length);
  }

  /**
   * Get response time percentiles
   */
  getResponseTimePercentiles() {
    if (this.responseTimes.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const length = sorted.length;

    return {
      p50: sorted[Math.floor(length * 0.5)],
      p90: sorted[Math.floor(length * 0.9)],
      p95: sorted[Math.floor(length * 0.95)],
      p99: sorted[Math.floor(length * 0.99)]
    };
  }

  /**
   * Check if provider should be used (circuit breaker)
   */
  isAvailable() {
    return this.circuitBreaker.state !== 'open';
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics() {
    const now = Date.now();
    const errorsByType = Object.fromEntries(this.errors);
    const percentiles = this.getResponseTimePercentiles();

    return {
      providerId: this.providerId,
      status: this.status,
      requests: { ...this.requests },
      errorRate: parseFloat(this.getErrorRate()),
      successRate: this.requests.total > 0 
        ? ((this.requests.successful / this.requests.total) * 100).toFixed(2)
        : '100.00',
      averageResponseTime: this.getAverageResponseTime(),
      responseTimePercentiles: percentiles,
      errorsByType: errorsByType,
      consecutiveFailures: this.consecutiveFailures,
      maxConsecutiveFailures: this.maxConsecutiveFailures,
      uptime: this.firstErrorTime 
        ? ((now - this.firstErrorTime - (this.lastErrorTime - this.firstErrorTime)) / (now - this.firstErrorTime) * 100).toFixed(2)
        : '100.00',
      circuitBreaker: {
        state: this.circuitBreaker.state,
        failures: this.circuitBreaker.failures,
        isAvailable: this.isAvailable(),
        nextRetryIn: this.circuitBreaker.nextRetryAt 
          ? Math.max(0, this.circuitBreaker.nextRetryAt - now)
          : 0
      },
      lastUpdated: this.lastUpdated,
      age: now - this.lastUpdated
    };
  }

  /**
   * Get hourly trend data
   */
  getHourlyTrends(hours = 24) {
    const trends = [];
    const currentHour = Math.floor(Date.now() / (1000 * 60 * 60));
    
    for (let i = hours - 1; i >= 0; i--) {
      const hour = currentHour - i;
      const stats = this.hourlyStats.get(hour) || { success: 0, failure: 0, retry: 0 };
      const total = stats.success + stats.failure;
      
      trends.push({
        hour: new Date(hour * 1000 * 60 * 60).toISOString(),
        success: stats.success,
        failure: stats.failure,
        retry: stats.retry,
        total: total,
        errorRate: total > 0 ? (stats.failure / total * 100).toFixed(2) : '0.00',
        avgResponseTime: stats.count > 0 ? Math.round(stats.totalResponseTime / stats.count) : 0
      });
    }
    
    return trends;
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this.requests = {
      total: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      timeout: 0,
      rateLimited: 0
    };
    this.responseTimes = [];
    this.errors.clear();
    this.consecutiveFailures = 0;
    this.maxConsecutiveFailures = 0;
    this.firstErrorTime = null;
    this.lastErrorTime = null;
    this.status = 'healthy';
    this.circuitBreaker = {
      state: 'closed',
      failures: 0,
      lastFailure: null,
      openedAt: null,
      nextRetryAt: null
    };
    this.lastUpdated = Date.now();
  }
}

/**
 * Global error rate monitoring system
 */
class ErrorRateMonitor {
  constructor() {
    this.providers = new Map();
    this.globalStats = {
      startTime: Date.now(),
      totalRequests: 0,
      totalFailures: 0,
      totalRetries: 0
    };
    this.alertThresholds = {
      errorRate: 25, // Alert if error rate > 25%
      consecutiveFailures: 5, // Alert if 5+ consecutive failures
      responseTime: 10000 // Alert if avg response time > 10s
    };
    this.alerts = [];
  }

  /**
   * Get or create provider metrics
   */
  getProvider(providerId) {
    if (!this.providers.has(providerId)) {
      this.providers.set(providerId, new ProviderMetrics(providerId));
    }
    return this.providers.get(providerId);
  }

  /**
   * Record successful operation
   */
  recordSuccess(providerId, operation = 'default', responseTime = 0) {
    const provider = this.getProvider(providerId);
    provider.recordSuccess(responseTime, operation);
    this.globalStats.totalRequests++;
    this._checkAlerts(provider);
  }

  /**
   * Record failed operation
   */
  recordFailure(providerId, errorType = 'unknown', operation = 'default', isTimeout = false, isRateLimit = false) {
    const provider = this.getProvider(providerId);
    provider.recordFailure(errorType, operation, isTimeout, isRateLimit);
    this.globalStats.totalRequests++;
    this.globalStats.totalFailures++;
    this._checkAlerts(provider);
  }

  /**
   * Record retry attempt
   */
  recordRetry(providerId, operation = 'default') {
    const provider = this.getProvider(providerId);
    provider.recordRetry(operation);
    this.globalStats.totalRetries++;
  }

  /**
   * Check if provider should be used
   */
  isProviderAvailable(providerId) {
    const provider = this.providers.get(providerId);
    return provider ? provider.isAvailable() : true;
  }

  /**
   * Get provider health status
   */
  getProviderStatus(providerId) {
    const provider = this.providers.get(providerId);
    return provider ? provider.status : 'unknown';
  }

  /**
   * Check for alerts
   */
  _checkAlerts(provider) {
    const metrics = provider.getMetrics();
    const now = Date.now();

    // Error rate alert
    if (metrics.errorRate > this.alertThresholds.errorRate) {
      this._addAlert('high_error_rate', provider.providerId, {
        errorRate: metrics.errorRate,
        threshold: this.alertThresholds.errorRate
      });
    }

    // Consecutive failures alert
    if (metrics.consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
      this._addAlert('consecutive_failures', provider.providerId, {
        failures: metrics.consecutiveFailures,
        threshold: this.alertThresholds.consecutiveFailures
      });
    }

    // High response time alert
    if (metrics.averageResponseTime > this.alertThresholds.responseTime) {
      this._addAlert('high_response_time', provider.providerId, {
        responseTime: metrics.averageResponseTime,
        threshold: this.alertThresholds.responseTime
      });
    }

    // Circuit breaker alert
    if (metrics.circuitBreaker.state === 'open') {
      this._addAlert('circuit_breaker_open', provider.providerId, {
        failures: metrics.circuitBreaker.failures,
        nextRetryIn: metrics.circuitBreaker.nextRetryIn
      });
    }
  }

  /**
   * Add alert (with deduplication)
   */
  _addAlert(type, providerId, data) {
    const alertKey = `${type}:${providerId}`;
    const existingAlert = this.alerts.find(alert => alert.key === alertKey && !alert.resolved);
    
    if (!existingAlert) {
      const alert = {
        key: alertKey,
        type,
        providerId,
        data,
        timestamp: Date.now(),
        resolved: false,
        resolvedAt: null
      };
      
      this.alerts.push(alert);
      console.warn(`🚨 ALERT [${type}] for provider ${providerId}:`, data);
      
      // Keep only last 100 alerts
      if (this.alerts.length > 100) {
        this.alerts.shift();
      }
    }
  }

  /**
   * Resolve alert
   */
  resolveAlert(type, providerId) {
    const alertKey = `${type}:${providerId}`;
    const alert = this.alerts.find(alert => alert.key === alertKey && !alert.resolved);
    
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      console.log(`✅ RESOLVED [${type}] for provider ${providerId}`);
    }
  }

  /**
   * Get all provider metrics
   */
  getAllMetrics() {
    const providerMetrics = {};
    
    for (const [providerId, provider] of this.providers.entries()) {
      providerMetrics[providerId] = provider.getMetrics();
    }

    return {
      providers: providerMetrics,
      global: {
        ...this.globalStats,
        totalProviders: this.providers.size,
        healthyProviders: Array.from(this.providers.values())
          .filter(p => p.status === 'healthy').length,
        uptime: Date.now() - this.globalStats.startTime,
        globalErrorRate: this.globalStats.totalRequests > 0
          ? (this.globalStats.totalFailures / this.globalStats.totalRequests * 100).toFixed(2)
          : '0.00'
      },
      alerts: {
        active: this.alerts.filter(alert => !alert.resolved),
        resolved: this.alerts.filter(alert => alert.resolved),
        total: this.alerts.length
      }
    };
  }

  /**
   * Get provider rankings by reliability
   */
  getProviderRankings() {
    const providers = Array.from(this.providers.values())
      .map(provider => provider.getMetrics())
      .sort((a, b) => {
        // Sort by: 1) Success rate, 2) Avg response time, 3) Circuit breaker state
        if (a.successRate !== b.successRate) {
          return b.successRate - a.successRate; // Higher success rate first
        }
        if (a.averageResponseTime !== b.averageResponseTime) {
          return a.averageResponseTime - b.averageResponseTime; // Lower response time first
        }
        if (a.circuitBreaker.state !== b.circuitBreaker.state) {
          const states = { 'closed': 0, 'half-open': 1, 'open': 2 };
          return states[a.circuitBreaker.state] - states[b.circuitBreaker.state];
        }
        return 0;
      });

    return providers.map((provider, index) => ({
      rank: index + 1,
      ...provider
    }));
  }

  /**
   * Reset all metrics
   */
  reset() {
    for (const provider of this.providers.values()) {
      provider.reset();
    }
    this.globalStats = {
      startTime: Date.now(),
      totalRequests: 0,
      totalFailures: 0,
      totalRetries: 0
    };
    this.alerts = [];
  }
}

// Global error rate monitor instance
const errorRateMonitor = new ErrorRateMonitor();

export { ErrorRateMonitor, ProviderMetrics, errorRateMonitor };
export default errorRateMonitor;