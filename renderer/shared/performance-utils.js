/**
 * Performance Utility Functions
 * Provides debounce, throttle, and other performance optimization utilities
 */

(function () {
    'use strict';

    // Create namespace if it doesn't exist
    window.NexusModules = window.NexusModules || {};

    /**
     * Debounce function - delays execution until after wait time has elapsed since last call
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttle function - ensures function is called at most once per specified time period
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in milliseconds
     * @returns {Function} Throttled function
     */
    function throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Request Animation Frame throttle - ensures function is called at most once per frame
     * @param {Function} func - Function to throttle
     * @returns {Function} RAF-throttled function
     */
    function rafThrottle(func) {
        let rafId = null;
        return function executedFunction(...args) {
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    func(...args);
                    rafId = null;
                });
            }
        };
    }

    /**
     * Event delegation helper - attach single listener to parent instead of many to children
     * @param {HTMLElement} parent - Parent element to attach listener to
     * @param {string} eventType - Event type (e.g., 'click')
     * @param {string} selector - CSS selector for child elements
     * @param {Function} handler - Event handler function
     * @returns {Function} Cleanup function to remove listener
     */
    function delegateEvent(parent, eventType, selector, handler) {
        const listener = (event) => {
            const target = event.target.closest(selector);
            if (target && parent.contains(target)) {
                handler.call(target, event, target);
            }
        };
        parent.addEventListener(eventType, listener);

        // Return cleanup function
        return () => parent.removeEventListener(eventType, listener);
    }

    /**
     * Cleanup tracker - helps track and cleanup event listeners and resources
     */
    class CleanupTracker {
        constructor() {
            this.cleanupFunctions = [];
        }

        /**
         * Add a cleanup function
         * @param {Function} cleanupFn - Function to call on cleanup
         */
        add(cleanupFn) {
            this.cleanupFunctions.push(cleanupFn);
        }

        /**
         * Add an event listener and track it for cleanup
         * @param {HTMLElement} element - Element to attach listener to
         * @param {string} eventType - Event type
         * @param {Function} handler - Event handler
         * @param {Object} options - Event listener options
         */
        addEventListener(element, eventType, handler, options) {
            element.addEventListener(eventType, handler, options);
            this.add(() => element.removeEventListener(eventType, handler, options));
        }

        /**
         * Execute all cleanup functions and clear the list
         */
        cleanup() {
            this.cleanupFunctions.forEach(fn => {
                try {
                    fn();
                } catch (e) {
                    console.error('Cleanup error:', e);
                }
            });
            this.cleanupFunctions = [];
        }
    }

    /**
     * Simple cache with TTL (Time To Live)
     */
    class TTLCache {
        constructor(ttl = 30000) { // Default 30 seconds
            this.cache = new Map();
            this.ttl = ttl;
        }

        /**
         * Set a value in cache
         * @param {string} key - Cache key
         * @param {*} value - Value to cache
         */
        set(key, value) {
            const expiry = Date.now() + this.ttl;
            this.cache.set(key, { value, expiry });
        }

        /**
         * Get a value from cache
         * @param {string} key - Cache key
         * @returns {*} Cached value or undefined if expired/not found
         */
        get(key) {
            const item = this.cache.get(key);
            if (!item) return undefined;

            if (Date.now() > item.expiry) {
                this.cache.delete(key);
                return undefined;
            }

            return item.value;
        }

        /**
         * Check if key exists and is not expired
         * @param {string} key - Cache key
         * @returns {boolean}
         */
        has(key) {
            return this.get(key) !== undefined;
        }

        /**
         * Clear all cached items
         */
        clear() {
            this.cache.clear();
        }

        /**
         * Remove expired items
         */
        prune() {
            const now = Date.now();
            for (const [key, item] of this.cache.entries()) {
                if (now > item.expiry) {
                    this.cache.delete(key);
                }
            }
        }
    }

    /**
     * Batch DOM updates to minimize reflows
     * @param {Function} updateFn - Function that performs DOM updates
     */
    function batchDOMUpdate(updateFn) {
        requestAnimationFrame(() => {
            updateFn();
        });
    }

    /**
     * Measure performance of a function
     * @param {string} label - Label for the measurement
     * @param {Function} fn - Function to measure
     * @returns {*} Result of the function
     */
    function measurePerformance(label, fn) {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        console.log(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`);
        return result;
    }

    // Export to namespace
    window.NexusModules.performance = {
        debounce,
        throttle,
        rafThrottle,
        delegateEvent,
        CleanupTracker,
        TTLCache,
        batchDOMUpdate,
        measurePerformance
    };

    // Also export to window for backward compatibility
    window.debounce = debounce;
    window.throttle = throttle;
    window.rafThrottle = rafThrottle;

})();
