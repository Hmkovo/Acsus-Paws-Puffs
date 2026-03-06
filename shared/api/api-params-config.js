/**
 * Shared API parameter definitions and format maps.
 *
 * @module shared/api/api-params-config
 */

import logger from '../../logger.js';

/**
 * Supported module identifiers for parameter defaults.
 *
 * @type {ReadonlyArray<string>}
 */
const SUPPORTED_MODULES = Object.freeze(['variable', 'phone', 'diary']);

/**
 * Base parameter definitions aligned to variable module defaults.
 *
 * @type {Object.<string, {min:number,max:number,step:number,default:number,label:string,hint:string}>}
 */
const BASE_PARAM_DEFINITIONS = {
    temperature: {
        min: 0,
        max: 2,
        step: 0.01,
        default: 1.0,
        label: '温度',
        hint: '控制输出随机性，值越大越随机。',
    },
    frequency_penalty: {
        min: -2,
        max: 2,
        step: 0.01,
        default: 0,
        label: '频率惩罚',
        hint: '降低重复内容出现频率。',
    },
    presence_penalty: {
        min: -2,
        max: 2,
        step: 0.01,
        default: 0,
        label: '存在惩罚',
        hint: '鼓励讨论新话题。',
    },
    top_k: {
        min: 0,
        max: 500,
        step: 1,
        default: 40,
        label: 'Top K',
        hint: '采样时仅考虑概率最高的 K 个 token。',
    },
    top_p: {
        min: 0,
        max: 1,
        step: 0.01,
        default: 1.0,
        label: 'Top P',
        hint: '核采样，累计概率达到 P 时停止。',
    },
    repetition_penalty: {
        min: 1,
        max: 2,
        step: 0.01,
        default: 1,
        label: '重复惩罚',
        hint: '惩罚重复 token。',
    },
    min_p: {
        min: 0,
        max: 1,
        step: 0.001,
        default: 0,
        label: 'Min P',
        hint: '最小概率阈值。',
    },
    top_a: {
        min: 0,
        max: 1,
        step: 0.001,
        default: 0,
        label: 'Top A',
        hint: '自适应采样。',
    },
    max_tokens: {
        min: 100,
        max: 100000,
        step: 100,
        default: 300,
        label: '最大 Token 数',
        hint: '生成回复的最大长度。',
    },
};

/**
 * Module-level default overrides.
 *
 * @type {Object.<string, Object.<string, number>>}
 */
const MODULE_DEFAULT_OVERRIDES = {
    variable: {},
    phone: {
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 8000,
    },
    diary: {
        temperature: 0.8,
        top_p: 0.95,
        max_tokens: 8000,
    },
};

/**
 * Base format -> supported params map.
 *
 * @type {Object.<string, string[]>}
 */
const BASE_FORMAT_PARAMS_MAP = {
    openai: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    claude: ['temperature', 'top_k', 'top_p', 'max_tokens'],
    makersuite: ['temperature', 'top_k', 'top_p', 'max_tokens'],
    openrouter: [
        'temperature',
        'frequency_penalty',
        'presence_penalty',
        'top_k',
        'top_p',
        'repetition_penalty',
        'min_p',
        'top_a',
        'max_tokens',
    ],
    deepseek: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    mistralai: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    cohere: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_k', 'top_p', 'max_tokens'],
    perplexity: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_k', 'top_p', 'max_tokens'],
    groq: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    xai: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    ai21: ['temperature', 'top_p', 'max_tokens'],
    moonshot: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    fireworks: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    electronhub: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_k', 'top_p', 'max_tokens'],
    chutes: [
        'temperature',
        'frequency_penalty',
        'presence_penalty',
        'top_k',
        'top_p',
        'repetition_penalty',
        'min_p',
        'max_tokens',
    ],
    nanogpt: [
        'temperature',
        'frequency_penalty',
        'presence_penalty',
        'top_k',
        'top_p',
        'repetition_penalty',
        'min_p',
        'top_a',
        'max_tokens',
    ],
    aimlapi: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_k', 'top_p', 'max_tokens'],
    pollinations: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    cometapi: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    siliconflow: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    vertexai: ['temperature', 'top_k', 'top_p', 'max_tokens'],
    azure_openai: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    zai: ['temperature', 'top_p', 'max_tokens'],
    custom: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
    google: ['temperature', 'top_k', 'top_p', 'max_tokens'],
    mistral: ['temperature', 'frequency_penalty', 'presence_penalty', 'top_p', 'max_tokens'],
};

/**
 * Module-level format map adjustments.
 *
 * @type {Object.<string, {removeFormats?: string[]}>}
 */
const MODULE_FORMAT_OVERRIDES = {
    variable: {},
    phone: {},
    diary: {
        removeFormats: ['cometapi'],
    },
};

/**
 * Compatibility export for existing callers that need variable defaults.
 *
 * @type {Object.<string, {min:number,max:number,step:number,default:number,label:string,hint:string}>}
 */
export const PARAMS_DEFINITIONS = getParamDefinitions('variable');

/**
 * Resolves a module key to one of `variable|phone|diary`.
 *
 * @param {string} moduleKey - Requested module id.
 * @returns {string} Resolved module id.
 */
function resolveModuleKey(moduleKey) {
    if (SUPPORTED_MODULES.includes(moduleKey)) {
        return moduleKey;
    }
    logger.warn('api', `[api-params-config] Unknown module "${moduleKey}", fallback to "variable"`);
    return 'variable';
}

/**
 * Returns parameter definitions for a specific module.
 *
 * @param {string} [moduleKey='variable'] - Module id.
 * @returns {Object.<string, {min:number,max:number,step:number,default:number,label:string,hint:string}>}
 */
export function getParamDefinitions(moduleKey = 'variable') {
    const resolvedModule = resolveModuleKey(moduleKey);
    const overrides = MODULE_DEFAULT_OVERRIDES[resolvedModule] || {};

    return Object.fromEntries(
        Object.entries(BASE_PARAM_DEFINITIONS).map(([paramName, definition]) => {
            const defaultValue = Object.prototype.hasOwnProperty.call(overrides, paramName)
                ? overrides[paramName]
                : definition.default;
            return [paramName, { ...definition, default: defaultValue }];
        }),
    );
}

/**
 * Returns format->params map for a specific module.
 *
 * @param {string} [moduleKey='variable'] - Module id.
 * @returns {Object.<string, string[]>}
 */
export function getFormatParamsMap(moduleKey = 'variable') {
    const resolvedModule = resolveModuleKey(moduleKey);
    const overrides = MODULE_FORMAT_OVERRIDES[resolvedModule] || {};
    const map = { ...BASE_FORMAT_PARAMS_MAP };

    for (const format of overrides.removeFormats || []) {
        delete map[format];
    }

    return map;
}

/**
 * Returns supported params by format.
 *
 * @param {string} format - API format/source.
 * @param {string} [moduleKey='variable'] - Module id.
 * @returns {string[]} Supported param names.
 */
export function getSupportedParams(format, moduleKey = 'variable') {
    const map = getFormatParamsMap(moduleKey);
    const params = map[format] || map.custom;
    logger.debug('api', `[api-params-config] ${moduleKey} format=${format}, params=${params.join(',')}`);
    return params;
}

/**
 * Returns default parameter values by format.
 *
 * @param {string} format - API format/source.
 * @param {string} [moduleKey='variable'] - Module id.
 * @returns {Object.<string, number>} Default parameter values.
 */
export function getDefaultParams(format, moduleKey = 'variable') {
    const definitions = getParamDefinitions(moduleKey);
    const supportedParams = getSupportedParams(format, moduleKey);
    const defaults = {};

    for (const paramName of supportedParams) {
        if (definitions[paramName]) {
            defaults[paramName] = definitions[paramName].default;
        }
    }

    return defaults;
}
