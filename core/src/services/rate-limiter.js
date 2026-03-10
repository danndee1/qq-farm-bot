/**
 * 请求队列与并发控制模块
 * 解决批量操作无并发限制的问题，防止触发服务端限流
 */

const { createModuleLogger } = require('./logger');

const logger = createModuleLogger('rate-limiter');

// 默认配置
const DEFAULT_CONFIG = {
    maxConcurrent: 3,        // 最大并发数
    minInterval: 100,       // 最小请求间隔(ms)
    maxRetries: 2,          // 最大重试次数
    retryDelay: 500,        // 重试延迟(ms)
    enableBurst: false,     // 是否允许突发
    burstSize: 5,           // 突发大小
};

// 简单的令牌桶实现
class TokenBucket {
    constructor(options = {}) {
        this.capacity = options.capacity || DEFAULT_CONFIG.maxConcurrent;
        this.tokens = this.capacity;
        this.refillRate = options.refillRate || 1000; // 每秒填充令牌数
        this.lastRefill = Date.now();
        this.maxWait = options.maxWait || 5000; // 最大等待时间
    }

    refill() {
        const now = Date.now();
        const elapsed = now - this.lastRefill;
        const tokensToAdd = (elapsed / this.refillRate) * this.capacity;
        this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
        this.lastRefill = now;
    }

    async acquire(tokens = 1) {
        const startWait = Date.now();
        
        while (this.tokens < tokens) {
            if (Date.now() - startWait > this.maxWait) {
                throw new Error('请求等待超时');
            }
            this.refill();
            await sleep(50);
        }
        
        this.tokens -= tokens;
        return true;
    }

    release(tokens = 1) {
        this.tokens = Math.min(this.capacity, this.tokens + tokens);
    }
}

// 优先级队列
class PriorityQueue {
    constructor() {
        this.queue = [];
    }

    enqueue(item, priority = 0