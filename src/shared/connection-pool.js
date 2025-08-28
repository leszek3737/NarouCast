/**
 * Advanced HTTP Connection Pooling System
 * Manages persistent connections for improved performance and resource utilization
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

/**
 * Connection pool configuration
 */
const DEFAULT_CONFIG = {
  maxTotalConnections: 50,
  maxConnectionsPerHost: 10,
  connectionTimeout: 30000,
  requestTimeout: 60000,
  keepAliveTimeout: 30000,
  maxIdleTime: 120000,
  enableKeepAlive: true,
  enableNodelay: true,
  enableTcpNoDelay: true,
  retryDelay: 1000,
  maxRetries: 3
};

/**
 * Connection wrapper with metadata
 */
class PooledConnection {
  constructor(agent, host, port, isHttps) {
    this.agent = agent;
    this.host = host;
    this.port = port;
    this.isHttps = isHttps;
    this.createdAt = Date.now();
    this.lastUsed = Date.now();
    this.requestCount = 0;
    this.isActive = false;
    this.errors = 0;
    this.id = `${host}:${port}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  updateUsage() {
    this.lastUsed = Date.now();
    this.requestCount++;
  }

  isExpired(maxIdleTime) {
    return Date.now() - this.lastUsed > maxIdleTime;
  }

  getStats() {
    return {
      id: this.id,
      host: this.host,
      port: this.port,
      isHttps: this.isHttps,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed,
      requestCount: this.requestCount,
      isActive: this.isActive,
      errors: this.errors,
      age: Date.now() - this.createdAt,
      idle: Date.now() - this.lastUsed
    };
  }
}

/**
 * Advanced HTTP Agent with connection pooling and monitoring
 */
class AdvancedHttpAgent {
  constructor(options = {}, isHttps = false) {
    this.config = { ...DEFAULT_CONFIG, ...options };
    this.isHttps = isHttps;
    this.connections = new Map();
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      poolHits: 0,
      poolMisses: 0,
      connectionsCreated: 0,
      connectionsDestroyed: 0,
      averageResponseTime: 0,
      lastCleanup: Date.now()
    };

    // Create the underlying agent
    const AgentClass = isHttps ? https.Agent : http.Agent;
    this.agent = new AgentClass({
      keepAlive: this.config.enableKeepAlive,
      keepAliveMsecs: this.config.keepAliveTimeout,
      maxSockets: this.config.maxConnectionsPerHost,
      maxTotalSockets: this.config.maxTotalConnections,
      timeout: this.config.connectionTimeout,
      freeSocketTimeout: this.config.maxIdleTime,
      scheduling: 'fifo'
    });

    // Setup cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredConnections();
    }, 60000); // Cleanup every minute

    this.setupAgentEvents();
  }

  setupAgentEvents() {
    this.agent.on('free', (socket, options) => {
      const key = this.getConnectionKey(options);
      const connection = this.connections.get(key);
      if (connection) {
        connection.isActive = false;
      }
    });

    this.agent.on('connect', (socket, options) => {
      const key = this.getConnectionKey(options);
      if (!this.connections.has(key)) {
        const connection = new PooledConnection(
          this.agent,
          options.host,
          options.port,
          this.isHttps
        );
        this.connections.set(key, connection);
        this.stats.connectionsCreated++;
      }
      
      const connection = this.connections.get(key);
      connection.isActive = true;
      connection.updateUsage();
    });

    this.agent.on('error', (error, socket, options) => {
      const key = this.getConnectionKey(options);
      const connection = this.connections.get(key);
      if (connection) {
        connection.errors++;
      }
      this.stats.failedRequests++;
      console.error(`🔴 Connection pool error for ${key}:`, error.message);
    });
  }

  getConnectionKey(options) {
    return `${options.host}:${options.port || (this.isHttps ? 443 : 80)}`;
  }

  async makeRequest(url, options = {}) {
    const startTime = Date.now();
    this.stats.totalRequests++;

    try {
      const parsedUrl = new URL(url);
      const key = this.getConnectionKey({
        host: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80)
      });

      // Check if we have a connection for this host
      const connection = this.connections.get(key);
      if (connection) {
        this.stats.poolHits++;
        connection.updateUsage();
      } else {
        this.stats.poolMisses++;
      }

      // Make the actual request
      const requestModule = parsedUrl.protocol === 'https:' ? https : http;
      const requestOptions = {
        ...options,
        agent: this.agent,
        timeout: this.config.requestTimeout,
        headers: {
          'Connection': 'keep-alive',
          ...options.headers
        }
      };

      const response = await this.executeRequest(requestModule, url, requestOptions);
      
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeStats(responseTime);
      this.stats.successfulRequests++;

      return response;

    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  executeRequest(requestModule, url, options) {
    return new Promise((resolve, reject) => {
      const req = requestModule.request(url, options, (res) => {
        // Collect response data
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          res.body = Buffer.concat(chunks);
          resolve(res);
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.requestTimeout}ms`));
      });

      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  updateResponseTimeStats(responseTime) {
    if (this.stats.successfulRequests === 1) {
      this.stats.averageResponseTime = responseTime;
    } else {
      // Exponential moving average
      const alpha = 0.1;
      this.stats.averageResponseTime = 
        alpha * responseTime + (1 - alpha) * this.stats.averageResponseTime;
    }
  }

  cleanupExpiredConnections() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, connection] of this.connections.entries()) {
      if (connection.isExpired(this.config.maxIdleTime) && !connection.isActive) {
        this.connections.delete(key);
        this.stats.connectionsDestroyed++;
        expiredCount++;
      }
    }

    this.stats.lastCleanup = now;
    
    if (expiredCount > 0) {
      console.log(`🧹 Cleaned up ${expiredCount} expired connections`);
    }
  }

  getPoolStats() {
    const activeConnections = Array.from(this.connections.values())
      .filter(conn => conn.isActive).length;
    
    const totalConnections = this.connections.size;
    
    const connectionsByHost = {};
    for (const [key, connection] of this.connections.entries()) {
      const host = connection.host;
      connectionsByHost[host] = (connectionsByHost[host] || 0) + 1;
    }

    return {
      ...this.stats,
      activeConnections,
      totalConnections,
      connectionsByHost,
      poolHitRate: this.stats.totalRequests > 0 
        ? (this.stats.poolHits / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      successRate: this.stats.totalRequests > 0
        ? (this.stats.successfulRequests / this.stats.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      averageResponseTime: Math.round(this.stats.averageResponseTime) + 'ms'
    };
  }

  getDetailedConnectionStats() {
    return Array.from(this.connections.values()).map(conn => conn.getStats());
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.agent.destroy();
    this.connections.clear();
    
    console.log('🔌 Connection pool destroyed');
  }
}

/**
 * Global connection pool manager
 */
class ConnectionPoolManager {
  constructor() {
    this.httpAgent = new AdvancedHttpAgent({}, false);
    this.httpsAgent = new AdvancedHttpAgent({}, true);
    this.customAgents = new Map();
  }

  /**
   * Get appropriate agent for URL
   */
  getAgent(url) {
    const isHttps = url.startsWith('https://');
    return isHttps ? this.httpsAgent : this.httpAgent;
  }

  /**
   * Create custom agent with specific configuration
   */
  createCustomAgent(name, config = {}, isHttps = false) {
    const agent = new AdvancedHttpAgent(config, isHttps);
    this.customAgents.set(name, agent);
    return agent;
  }

  /**
   * Get custom agent by name
   */
  getCustomAgent(name) {
    return this.customAgents.get(name);
  }

  /**
   * Make HTTP request with connection pooling
   */
  async request(url, options = {}) {
    const agent = this.getAgent(url);
    return agent.makeRequest(url, options);
  }

  /**
   * Get comprehensive statistics
   */
  getAllStats() {
    const httpStats = this.httpAgent.getPoolStats();
    const httpsStats = this.httpsAgent.getPoolStats();
    const customStats = {};

    for (const [name, agent] of this.customAgents.entries()) {
      customStats[name] = agent.getPoolStats();
    }

    return {
      http: httpStats,
      https: httpsStats,
      custom: customStats,
      summary: {
        totalRequests: httpStats.totalRequests + httpsStats.totalRequests,
        totalConnections: httpStats.totalConnections + httpsStats.totalConnections,
        activeConnections: httpStats.activeConnections + httpsStats.activeConnections
      }
    };
  }

  /**
   * Force cleanup of all pools
   */
  cleanup() {
    this.httpAgent.cleanupExpiredConnections();
    this.httpsAgent.cleanupExpiredConnections();
    
    for (const agent of this.customAgents.values()) {
      agent.cleanupExpiredConnections();
    }
  }

  /**
   * Destroy all connection pools
   */
  destroy() {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
    
    for (const agent of this.customAgents.values()) {
      agent.destroy();
    }
    
    this.customAgents.clear();
  }
}

// Global connection pool instance
const connectionPool = new ConnectionPoolManager();

// Fetch wrapper with connection pooling
export async function pooledFetch(url, options = {}) {
  try {
    // Convert fetch options to node http options
    const httpOptions = {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body
    };

    // Handle timeout
    if (options.timeout) {
      httpOptions.timeout = options.timeout;
    }

    const response = await connectionPool.request(url, httpOptions);
    
    // Create fetch-like response object
    return {
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      statusText: response.statusMessage,
      headers: response.headers,
      url: url,
      text: () => Promise.resolve(response.body.toString()),
      json: () => Promise.resolve(JSON.parse(response.body.toString())),
      buffer: () => Promise.resolve(response.body),
      arrayBuffer: () => Promise.resolve(response.body.buffer)
    };

  } catch (error) {
    throw new Error(`Pooled fetch failed: ${error.message}`);
  }
}

// Export the connection pool and utilities
export { 
  ConnectionPoolManager, 
  AdvancedHttpAgent, 
  connectionPool,
  DEFAULT_CONFIG as CONNECTION_POOL_CONFIG
};

export default connectionPool;