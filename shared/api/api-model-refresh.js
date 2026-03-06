/**
 * Shared model refresh helper for chat completion sources.
 *
 * @module shared/api/api-model-refresh
 */

import { getRequestHeaders } from '../../../../../../script.js';
import { resolveSource, supportsIndependentKey } from './api-config-schema.js';
import logger from '../../logger.js';

const STATUS_URL = '/api/backends/chat-completions/status';
const NO_VALIDATE_SOURCES = new Set(['claude', 'ai21', 'vertexai', 'perplexity', 'zai']);
const STATUS_PROXY_SOURCES = new Set([
    'openai',
    'mistralai',
    'makersuite',
    'vertexai',
    'deepseek',
    'xai',
    'moonshot',
]);

/**
 * Builds request body for ST `/status` endpoint.
 *
 * @param {Object} config - Source config.
 * @returns {Object} Request body.
 */
export function buildStatusRequestBody(config) {
    const source = resolveSource(config?.source);
    const body = { chat_completion_source: source };

    if (
        supportsIndependentKey(source)
        && STATUS_PROXY_SOURCES.has(source)
        && config?.baseUrl
    ) {
        body.reverse_proxy = config.baseUrl.trim();
        if (config.apiKey) body.proxy_password = config.apiKey.trim();
    }

    if (source === 'custom' && config?.customUrl) {
        body.custom_url = config.customUrl.trim();
        if (config.customIncludeHeaders) {
            body.custom_include_headers = config.customIncludeHeaders;
        }
    }

    if (source === 'azure_openai' && config?.azureConfig) {
        body.azure_base_url = config.azureConfig.baseUrl;
        body.azure_deployment_name = config.azureConfig.deploymentName;
        body.azure_api_version = config.azureConfig.apiVersion;
    }

    return body;
}

/**
 * Refreshes model list via ST backend `/status` endpoint.
 *
 * @async
 * @param {Object} config - Source config.
 * @returns {Promise<{success: boolean, models: Array<Object>, error?: string}>}
 * @description
 * Uses the same backend path as ST UI to avoid direct `/v1/models` failures.
 * Models are sorted by `id` (case-insensitive) before returning.
 *
 * `/status` reverse proxy support is source-specific in backend:
 * openai/mistralai/makersuite/vertexai/deepseek/xai/moonshot support it.
 * custom source does not use reverse_proxy and reads key from secrets.
 * claude/ai21/vertexai/perplexity/zai use ST no-validate behavior.
 *
 * @example
 * const result = await refreshModelList({ source: 'openai', baseUrl, apiKey });
 * if (result.success) console.log(result.models);
 *
 * @throws {Error} Throws only for unexpected local runtime errors.
 */
export async function refreshModelList(config) {
    const source = resolveSource(config?.source);

    if (NO_VALIDATE_SOURCES.has(source)) {
        logger.info('api', '[refreshModelList] source uses no-validate flow', source);
        return { success: true, models: [] };
    }

    const body = buildStatusRequestBody(config);

    try {
        logger.debug('api', '[refreshModelList] request start', {
            source: source,
            hasReverseProxy: Boolean(body.reverse_proxy),
            hasCustomUrl: Boolean(body.custom_url),
        });

        const response = await fetch(STATUS_URL, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
            cache: 'no-cache',
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = payload?.error?.message || payload?.message || response.statusText;
            logger.warn('api', '[refreshModelList] http failed', source, response.status, message);
            return { success: false, models: [], error: message || 'Status request failed' };
        }

        const rawModels = Array.isArray(payload?.data)
            ? payload.data
            : (Array.isArray(payload?.models) ? payload.models : []);

        const models = rawModels
            .filter((item) => item && typeof item.id === 'string' && item.id.length > 0)
            .sort((a, b) => a.id.localeCompare(b.id, 'en', { sensitivity: 'base' }));

        if (payload?.error) {
            const message = payload?.error?.message || payload?.message || 'Status check failed';
            logger.warn('api', '[refreshModelList] backend flagged error', source, message);
            return { success: false, models: models, error: message };
        }

        logger.info('api', '[refreshModelList] request success', source, models.length);
        return { success: true, models: models };
    } catch (error) {
        const message = error?.message || 'Unknown refresh failure';
        logger.error('api', '[refreshModelList] exception', source, message);
        return { success: false, models: [], error: message };
    }
}
