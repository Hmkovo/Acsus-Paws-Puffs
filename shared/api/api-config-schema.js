/**
 * Shared API config schema and source capability map.
 *
 * @module shared/api/api-config-schema
 */

/**
 * Capability map per chat completion source.
 *
 * `supportsReverseProxy` means the backend can consume
 * `reverse_proxy + proxy_password` for requests.
 */
export const SOURCE_CAPABILITIES = {
    openai: { supportsReverseProxy: true, defaultUrl: 'https://api.openai.com/v1' },
    claude: { supportsReverseProxy: true, defaultUrl: 'https://api.anthropic.com/v1' },
    makersuite: {
        supportsReverseProxy: true,
        defaultUrl: 'https://generativelanguage.googleapis.com',
    },
    vertexai: {
        supportsReverseProxy: true,
        defaultUrl: 'https://us-central1-aiplatform.googleapis.com',
    },
    mistralai: { supportsReverseProxy: true, defaultUrl: 'https://api.mistral.ai/v1' },
    deepseek: { supportsReverseProxy: true, defaultUrl: 'https://api.deepseek.com/beta' },
    xai: { supportsReverseProxy: true, defaultUrl: 'https://api.x.ai/v1' },
    moonshot: { supportsReverseProxy: true, defaultUrl: 'https://api.moonshot.ai/v1' },
    zai: { supportsReverseProxy: true, defaultUrl: 'https://api.z.ai/api/paas/v4' },

    openrouter: { supportsReverseProxy: false, defaultUrl: 'https://openrouter.ai/api/v1' },
    groq: { supportsReverseProxy: false, defaultUrl: 'https://api.groq.com/openai/v1' },
    cohere: { supportsReverseProxy: false, defaultUrl: 'https://api.cohere.ai/v2' },
    ai21: { supportsReverseProxy: false, defaultUrl: 'https://api.ai21.com/studio/v1' },
    perplexity: { supportsReverseProxy: false, defaultUrl: 'https://api.perplexity.ai' },
    aimlapi: { supportsReverseProxy: false, defaultUrl: 'https://api.aimlapi.com/v1' },
    nanogpt: { supportsReverseProxy: false, defaultUrl: 'https://nano-gpt.com/api/v1' },
    electronhub: { supportsReverseProxy: false, defaultUrl: 'https://api.electronhub.ai/v1' },
    chutes: { supportsReverseProxy: false, defaultUrl: 'https://llm.chutes.ai/v1' },
    pollinations: { supportsReverseProxy: false, defaultUrl: 'https://gen.pollinations.ai/v1' },
    fireworks: { supportsReverseProxy: false, defaultUrl: 'https://api.fireworks.ai/inference/v1' },
    siliconflow: { supportsReverseProxy: false, defaultUrl: 'https://api.siliconflow.com/v1' },
    cometapi: { supportsReverseProxy: false, defaultUrl: 'https://api.cometapi.com/v1' },

    custom: { supportsReverseProxy: false, defaultUrl: '' },
    azure_openai: { supportsReverseProxy: false, defaultUrl: '' },
};

/**
 * UI format aliases to backend `chat_completion_source` values.
 */
export const FORMAT_TO_SOURCE = {
    openai: 'openai',
    claude: 'claude',
    google: 'makersuite',
    makersuite: 'makersuite',
    vertexai: 'vertexai',
    mistral: 'mistralai',
    mistralai: 'mistralai',
    openrouter: 'openrouter',
    ai21: 'ai21',
    deepseek: 'deepseek',
    xai: 'xai',
    moonshot: 'moonshot',
    zai: 'zai',
    groq: 'groq',
    custom: 'custom',
    cohere: 'cohere',
    perplexity: 'perplexity',
    chutes: 'chutes',
    siliconflow: 'siliconflow',
    electronhub: 'electronhub',
    nanogpt: 'nanogpt',
    aimlapi: 'aimlapi',
    pollinations: 'pollinations',
    fireworks: 'fireworks',
    azure_openai: 'azure_openai',
    cometapi: 'cometapi',
};

/**
 * Returns the default base URL for a source.
 *
 * @param {string} source - `chat_completion_source` value.
 * @returns {string}
 */
export function getDefaultUrl(source) {
    return SOURCE_CAPABILITIES[source]?.defaultUrl || '';
}

/**
 * Returns whether source supports reverse proxy style independent keys.
 *
 * @param {string} source - `chat_completion_source` value.
 * @returns {boolean}
 */
export function supportsIndependentKey(source) {
    return SOURCE_CAPABILITIES[source]?.supportsReverseProxy === true;
}

/**
 * Resolves UI format aliases to `chat_completion_source` values.
 *
 * @param {string} format - UI source/format value.
 * @returns {string}
 */
export function resolveSource(format) {
    return FORMAT_TO_SOURCE[format] || format || 'openai';
}

/**
 * Validates a shared API config object.
 *
 * @param {Object} config - API config.
 * @returns {{ valid: boolean, error: string }} Validation result.
 */
export function validateConfig(config) {
    if (!config) {
        return { valid: false, error: 'Config object is empty' };
    }
    if (!config.source) {
        return { valid: false, error: 'Missing API source (source)' };
    }
    if (!config.model) {
        return { valid: false, error: 'Missing model (model)' };
    }
    if (!SOURCE_CAPABILITIES[config.source]) {
        return { valid: false, error: `Unsupported API source: ${config.source}` };
    }
    return { valid: true, error: '' };
}
