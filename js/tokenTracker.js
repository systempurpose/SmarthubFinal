// js/tokenTracker.js
const TOKEN_STORAGE_KEY = 'smartHubTokenUsage';

/**
 * Track token usage from an AI response.
 * @param {Object} usage - { prompt_tokens, completion_tokens, total_tokens }
 */
export function trackTokenUsage(usage) {
    if (!usage || typeof usage !== 'object') return;
    const total = usage.total_tokens || usage.total || 0;
    if (total === 0) return;

    const stored = getTokenData();
    stored.total += total;
    stored.history.push({
        timestamp: Date.now(),
        usage: usage,
        cumulative: stored.total
    });
    // Keep only last 100 entries to avoid large storage
    if (stored.history.length > 100) {
        stored.history = stored.history.slice(-100);
    }
    try {
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(stored));
    } catch (e) { /* ignore */ }
}

/**
 * Get current token usage data.
 * @returns {Object} { total: number, history: Array }
 */
export function getTokenData() {
    try {
        const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.total === 'number' && Array.isArray(parsed.history)) {
                return parsed;
            }
        }
    } catch (e) { /* ignore */ }
    return { total: 0, history: [] };
}

/**
 * Reset token usage (optional).
 */
export function resetTokenUsage() {
    try {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (e) { /* ignore */ }
}

/**
 * Format token count with commas.
 */
export function formatTokenCount(count) {
    return count.toLocaleString();
}