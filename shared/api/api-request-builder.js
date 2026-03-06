/**
 * Shared API layer request builder.
 *
 * @module shared/api/api-request-builder
 */

import { resolveSource, supportsIndependentKey } from './api-config-schema.js';
import logger from '../../logger.js';

const GPT_SOURCES = new Set(['openai', 'azure_openai', 'openrouter']);
const SEED_SUPPORTED_SOURCES = new Set([
    'openai',
    'azure_openai',
    'openrouter',
    'mistralai',
    'custom',
    'cohere',
    'groq',
    'electronhub',
    'nanogpt',
    'xai',
    'pollinations',
    'aimlapi',
    'vertexai',
    'makersuite',
    'chutes',
]);
const LOGPROBS_SUPPORTED_SOURCES = new Set([
    'openai',
    'azure_openai',
    'custom',
    'deepseek',
    'xai',
    'aimlapi',
    'chutes',
]);
const TOOLS_SUPPORTED_SOURCES = new Set([
    'openai',
    'azure_openai',
    'openrouter',
    'custom',
    'claude',
    'makersuite',
    'vertexai',
    'mistralai',
    'cohere',
    'deepseek',
    'xai',
    'aimlapi',
    'chutes',
    'electronhub',
]);

/**
 * Returns true when the source behaves as OpenAI-family models.
 *
 * @param {string} source - Chat completion source.
 * @returns {boolean}
 */
function isGptSource(source) {
    return GPT_SOURCES.has(source);
}

/**
 * Returns true when the model is O-series for a source.
 *
 * @param {string} source - Chat completion source.
 * @param {string} model - Model id.
 * @returns {boolean}
 */
function isOModel(source, model) {
    if (!isGptSource(source)) return false;
    return source === 'openrouter'
        ? /^openai\/(o1|o3|o4)/i.test(model)
        : /^(o1|o3|o4)/i.test(model);
}

/**
 * Returns true when the model is GPT-5 family for a source.
 *
 * @param {string} source - Chat completion source.
 * @param {string} model - Model id.
 * @returns {boolean}
 */
function isGpt5Model(source, model) {
    if (!isGptSource(source)) return false;
    return source === 'openrouter'
        ? /^openai\/gpt-5/i.test(model)
        : /gpt-5/i.test(model);
}

/**
 * Returns a model id normalized for shared calls.
 *
 * @param {string} model - Raw model id.
 * @returns {string}
 */
function normalizeModel(model) {
    if (!model) return '';
    return model.startsWith('models/') ? model.replace('models/', '') : model;
}

/**
 * Clamps a numeric value if it is finite.
 *
 * @param {*} value - Input value.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {*}
 */
function clampIfFinite(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return value;
    return Math.min(Math.max(number, min), max);
}

/**
 * Returns whether custom source should be bridged to openai proxy channel.
 *
 * @param {string} source - Resolved chat completion source.
 * @param {Object} config - Shared API config.
 * @returns {boolean}
 * @description
 * ST backend `custom` branch reads key from secrets. Extensions in this repo
 * intentionally keep independent keys in extension settings and pass them per request.
 * When `source=custom` has a non-empty `apiKey`, route request as
 * `openai + reverse_proxy/proxy_password` so the backend can authenticate correctly.
 */
function shouldBridgeCustomToOpenAI(source, config) {
    return source === 'custom' && typeof config?.apiKey === 'string' && config.apiKey.trim().length > 0;
}

/**
 * Normalizes request parameters to align with ST source+model filtering.
 *
 * @param {string} source - Chat completion source.
 * @param {string} model - Model id.
 * @param {Object} params - Request body candidate params.
 * @returns {Object} Normalized params object.
 */
export function normalizeRequestParams(source, model, params) {
    const normalized = { ...params };
    const isO = isOModel(source, model);
    const isGpt5 = isGpt5Model(source, model);

    if (!LOGPROBS_SUPPORTED_SOURCES.has(source)) normalized.logprobs = undefined;
    if (!SEED_SUPPORTED_SOURCES.has(source)) normalized.seed = undefined;
    if (!TOOLS_SUPPORTED_SOURCES.has(source)) {
        normalized.tools = undefined;
        normalized.tool_choice = undefined;
    }

    if (isGptSource(source) && /gpt.*vision/i.test(model)) {
        normalized.stop = undefined;
        normalized.logit_bias = undefined;
        normalized.logprobs = undefined;
    }
    if (isGptSource(source) && /gpt-4.5/i.test(model)) normalized.logprobs = undefined;

    if (source === 'claude' && normalized.include_reasoning) {
        normalized.temperature = undefined;
    }
    if (source === 'perplexity') normalized.stop = undefined;
    if (source === 'groq') {
        normalized.logprobs = undefined;
        normalized.logit_bias = undefined;
    }
    if (source === 'cohere') {
        normalized.top_p = clampIfFinite(normalized.top_p, 0.01, 0.99);
        normalized.frequency_penalty = clampIfFinite(normalized.frequency_penalty, 0, 1);
        normalized.presence_penalty = clampIfFinite(normalized.presence_penalty, 0, 1);
    }

    if (source === 'deepseek') normalized.top_p = normalized.top_p || Number.EPSILON;
    if (source === 'zai') {
        normalized.top_p = normalized.top_p || 0.01;
        normalized.stop = Array.isArray(normalized.stop)
            ? normalized.stop.slice(0, 1)
            : normalized.stop;
        normalized.presence_penalty = undefined;
        normalized.frequency_penalty = undefined;
    }

    if (source === 'xai') {
        if (/grok-3-mini/i.test(model)) {
            normalized.presence_penalty = undefined;
            normalized.frequency_penalty = undefined;
            normalized.stop = undefined;
        }
        if (/grok-4|grok-code/i.test(model)) {
            normalized.presence_penalty = undefined;
            normalized.frequency_penalty = undefined;
            if (!/grok-4-fast-non-reasoning/i.test(model)) normalized.stop = undefined;
        }
    }

    if (source === 'moonshot' && /kimi-k2.5/i.test(model)) {
        normalized.top_p = undefined;
        normalized.frequency_penalty = undefined;
        normalized.presence_penalty = undefined;
    }

    if (isO) {
        normalized.max_completion_tokens = normalized.max_tokens;
        normalized.max_tokens = undefined;
        normalized.logprobs = undefined;
        normalized.stop = undefined;
        normalized.logit_bias = undefined;
        normalized.temperature = undefined;
        normalized.top_p = undefined;
        normalized.frequency_penalty = undefined;
        normalized.presence_penalty = undefined;
        normalized.tools = undefined;
        normalized.tool_choice = undefined;
        if (/^(openai\/)?o1/i.test(model) && Array.isArray(normalized.messages)) {
            normalized.n = undefined;
            normalized.messages = normalized.messages.map((msg) => {
                if (msg?.role === 'system') return { ...msg, role: 'user' };
                return msg;
            });
        }
    }

    if (isGpt5) {
        normalized.max_completion_tokens = normalized.max_tokens;
        normalized.max_tokens = undefined;
        normalized.logprobs = undefined;

        if (/gpt-5-chat-latest/i.test(model)) {
            normalized.tools = undefined;
            normalized.tool_choice = undefined;
        } else if (/gpt-5\.(1|2)/i.test(model) && !/chat-latest/i.test(model)) {
            normalized.frequency_penalty = undefined;
            normalized.presence_penalty = undefined;
            normalized.logit_bias = undefined;
            normalized.stop = undefined;
        } else {
            normalized.temperature = undefined;
            normalized.top_p = undefined;
            normalized.frequency_penalty = undefined;
            normalized.presence_penalty = undefined;
            normalized.logit_bias = undefined;
            normalized.stop = undefined;
        }
    }

    return normalized;
}

/**
 * Builds generate_data for ST `/api/backends/chat-completions/generate`.
 *
 * @param {Object} config - API config for the request.
 * @param {Array<Object>} messages - OpenAI style messages.
 * @returns {Object} Request body for ST backend.
 */
export function buildGenerateData(config, messages) {
    const source = resolveSource(config.source);
    const bridgeCustomToOpenAI = shouldBridgeCustomToOpenAI(source, config);
    const effectiveSource = bridgeCustomToOpenAI ? 'openai' : source;
    const model = normalizeModel(config.model || '');

    const data = {
        type: 'quiet',
        messages: messages,
        model: model,
        chat_completion_source: effectiveSource,
        stream: Boolean(config.stream),
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        top_p: config.topP,
        top_k: config.topK,
        frequency_penalty: config.frequencyPenalty,
        presence_penalty: config.presencePenalty,
        repetition_penalty: config.repetitionPenalty,
        min_p: config.minP,
        top_a: config.topA,
        stop: config.stop,
        logit_bias: config.logitBias,
        n: config.n,
        seed: config.seed,
        logprobs: config.logprobs,
        tools: config.tools,
        tool_choice: config.toolChoice,
        include_reasoning: Boolean(config.includeReasoning),
        reasoning_effort: config.reasoningEffort,
    };

    const normalized = normalizeRequestParams(effectiveSource, model, data);

    if (bridgeCustomToOpenAI) {
        const proxyUrl = (config.baseUrl || config.customUrl || '').trim();
        if (proxyUrl) {
            normalized.reverse_proxy = proxyUrl;
        }
        normalized.proxy_password = config.apiKey.trim();
        normalized.custom_url = undefined;
    } else {
        if (config.baseUrl && supportsIndependentKey(effectiveSource)) {
            normalized.reverse_proxy = config.baseUrl.trim();
            if (config.apiKey) normalized.proxy_password = config.apiKey.trim();
        }

        if (source === 'custom' && config.customUrl) {
            normalized.custom_url = config.customUrl.trim();
        }
    }

    if (effectiveSource === 'azure_openai' && config.azureConfig) {
        normalized.azure_base_url = config.azureConfig.baseUrl;
        normalized.azure_deployment_name = config.azureConfig.deploymentName;
        normalized.azure_api_version = config.azureConfig.apiVersion;
    }

    logger.debug('api', '[buildGenerateData] request built', {
        source: normalized.chat_completion_source,
        model: normalized.model,
        stream: normalized.stream,
        hasReverseProxy: Boolean(normalized.reverse_proxy),
        paramCount: Object.keys(normalized).length,
    });

    return normalized;
}
