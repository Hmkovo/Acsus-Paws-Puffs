/**
 * 变量模块 - API 管理器
 *
 * @module variables/variable-api-manager
 * @description
 * 负责变量模块与共享 API 层的交互：
 * - 统一通过 shared/api/api-client.js 发起请求
 * - 支持流式生成
 * - 支持终止控制
 */

import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';
import { chat_completion_sources } from '../../../../openai.js';
import { getDefaultParams } from '../shared/api/api-params-config.js';
import { generate, generateStream, generateWithDefault } from '../shared/api/api-client.js';

const EXT_ID = 'acsusPawsPuffs';
const MODULE_NAME = 'variables_v2';
const LOG_MODULE = 'variable';

/**
 * 将旧参数命名转换为共享 API 层所需命名。
 *
 * @param {Object} [params={}] - 旧参数对象。
 * @returns {Object} 新参数对象。
 */
function normalizeParams(params = {}) {
    return {
        temperature: params.temperature,
        maxTokens: params.max_tokens,
        topP: params.top_p,
        topK: params.top_k,
        frequencyPenalty: params.frequency_penalty,
        presencePenalty: params.presence_penalty,
        repetitionPenalty: params.repetition_penalty,
        minP: params.min_p,
        topA: params.top_a,
        stop: params.stop,
        logitBias: params.logit_bias,
        n: params.n,
        seed: params.seed,
        logprobs: params.logprobs,
        includeReasoning: params.include_reasoning,
        reasoningEffort: params.reasoning_effort,
    };
}

/**
 * 合并外部 signal 与内部 abort controller。
 *
 * @param {AbortController} internalController - 内部控制器。
 * @param {AbortSignal} [externalSignal] - 外部 signal。
 * @returns {AbortSignal} 合并后的 signal。
 */
function linkAbortSignal(internalController, externalSignal) {
    if (!externalSignal) {
        return internalController.signal;
    }

    if (externalSignal.aborted) {
        internalController.abort();
        return internalController.signal;
    }

    const forwardAbort = () => internalController.abort();
    externalSignal.addEventListener('abort', forwardAbort, { once: true });

    return internalController.signal;
}

/**
 * 变量模块 API 管理器。
 */
export class VariableAPI {
    /**
     * 创建 API 管理器。
     */
    constructor() {
        this.currentAbortController = null;
        this.isGenerating = false;
    }

    /**
     * 初始化。
     *
     * @returns {Promise<void>}
     */
    async init() {
        logger.info(LOG_MODULE, '[VariableAPI] 开始初始化');
        logger.info(LOG_MODULE, '[VariableAPI] 初始化完成');
    }

    /**
     * 中止当前生成。
     */
    abort() {
        if (!this.currentAbortController) {
            return;
        }

        this.currentAbortController.abort();
        this.currentAbortController = null;
        this.isGenerating = false;
        logger.info(LOG_MODULE, '[VariableAPI.abort] 已中止生成');
    }

    /**
     * 获取当前选中的自定义 API 配置。
     *
     * @returns {Object|null} 配置对象。
     */
    getCurrentCustomConfig() {
        const settings = this.getSettings();
        const apiConfig = settings.apiConfig || {};
        const format = apiConfig.format || 'openai';

        let baseUrl = '';
        let apiKey = '';
        let model = '';

        if (format === 'custom') {
            const customConfig = apiConfig.customApiConfig || {};
            baseUrl = customConfig.baseUrl || '';
            apiKey = customConfig.apiKey || '';
            model = customConfig.model || '';
        } else if (format === 'openrouter') {
            baseUrl = 'https://openrouter.ai/api';
            apiKey = apiConfig.openRouterKey || '';
            model = apiConfig.model || '';
        } else {
            const currentProxyPreset = apiConfig.currentProxyPreset || '';
            const proxyPresets = apiConfig.proxyPresets || [];

            if (currentProxyPreset) {
                const preset = proxyPresets.find((p) => p.name === currentProxyPreset);
                if (preset?.url) {
                    baseUrl = preset.url;
                    apiKey = preset.password || '';
                    logger.debug(
                        LOG_MODULE,
                        '[VariableAPI.getCurrentCustomConfig] 使用反向代理预设:',
                        currentProxyPreset,
                    );
                }
            }

            if (!baseUrl) {
                baseUrl = this.getDefaultBaseUrl(format);
                apiKey = apiConfig.apiKey || '';
            }

            model = apiConfig.model || '';
        }

        if (!baseUrl) {
            logger.warn(LOG_MODULE, '[VariableAPI.getCurrentCustomConfig] 未配置 API 端点');
            return null;
        }

        const defaultParams = getDefaultParams(format, 'variable');
        const userParams = apiConfig.params || {};
        const mergedParams = { ...defaultParams, ...userParams };

        const config = {
            baseUrl,
            apiKey,
            model,
            format,
            params: mergedParams,
        };

        logger.debug(LOG_MODULE, '[VariableAPI.getCurrentCustomConfig] 返回配置:', {
            format: config.format,
            baseUrl: config.baseUrl ? `${config.baseUrl.substring(0, 30)}...` : '',
            model: config.model,
            hasApiKey: Boolean(config.apiKey),
            params: Object.keys(config.params),
        });

        return config;
    }

    /**
     * 获取 API 类型默认端点。
     *
     * @param {string} format - API 类型。
     * @returns {string} 默认端点 URL。
     */
    getDefaultBaseUrl(format) {
        const defaultUrls = {
            openai: 'https://api.openai.com',
            claude: 'https://api.anthropic.com',
            makersuite: 'https://generativelanguage.googleapis.com',
            deepseek: 'https://api.deepseek.com',
            mistralai: 'https://api.mistral.ai',
            cohere: 'https://api.cohere.ai',
            perplexity: 'https://api.perplexity.ai',
            groq: 'https://api.groq.com/openai',
            xai: 'https://api.x.ai',
            ai21: 'https://api.ai21.com',
            moonshot: 'https://api.moonshot.cn',
            fireworks: 'https://api.fireworks.ai/inference',
            electronhub: 'https://api.electronhub.top',
            nanogpt: 'https://nano-gpt.com/api',
            aimlapi: 'https://api.aimlapi.com',
            pollinations: 'https://text.pollinations.ai',
            siliconflow: 'https://api.siliconflow.cn',
            openrouter: 'https://openrouter.ai/api',
        };

        return defaultUrls[format] || '';
    }

    /**
     * 发送消息到 AI 并获取回复。
     *
     * @async
     * @param {Array<Object>} messages - OpenAI 风格消息数组。
     * @param {Object} [options={}] - 可选项。
     * @param {Function} [options.onChunk] - 流式块回调。
     * @param {AbortSignal} [options.signal] - 外部终止信号。
     * @returns {Promise<{text: string, metadata: Object}>} 响应对象。
     */
    async sendToAI(messages, options = {}) {
        logger.info(LOG_MODULE, '[VariableAPI.sendToAI] 开始发送到 AI');

        this.currentAbortController = new AbortController();
        this.isGenerating = true;

        const signal = linkAbortSignal(this.currentAbortController, options.signal);

        try {
            const settings = this.getSettings();
            const apiSettings = settings.apiConfig || { source: 'default', stream: false };

            if (apiSettings.source === 'default') {
                const result = await generateWithDefault(messages, {
                    signal,
                    module: 'variables',
                });

                if (result.text && typeof options.onChunk === 'function') {
                    options.onChunk(result.text);
                }

                logger.info(LOG_MODULE, '[VariableAPI.sendToAI] 默认设置调用完成');
                return { text: result.text || '', metadata: {} };
            }

            const currentConfig = this.getCurrentCustomConfig();
            if (!currentConfig || !currentConfig.baseUrl) {
                throw new Error('未找到 API 配置，请先在设置中保存一个配置');
            }

            const requestConfig = {
                source: currentConfig.format || 'openai',
                model: currentConfig.model,
                baseUrl: currentConfig.baseUrl,
                apiKey: currentConfig.apiKey,
                useDefault: false,
                stream: Boolean(apiSettings.stream),
                ...normalizeParams(currentConfig.params || {}),
            };

            if (!requestConfig.model) {
                throw new Error('未配置模型名称，请先在设置中选择模型');
            }

            const response = requestConfig.stream
                ? await generateStream(requestConfig, messages, {
                    signal,
                    onChunk: options.onChunk,
                    module: 'variables',
                })
                : await generate(requestConfig, messages, {
                    signal,
                    module: 'variables',
                });

            const metadata = response.raw
                ? this.extractAPIMetadata(response.raw, requestConfig.source)
                : {};

            logger.info(LOG_MODULE, '[VariableAPI.sendToAI] 发送流程完成');
            return {
                text: response.text || '',
                metadata,
            };

        } catch (error) {
            if (error?.name === 'AbortError' || this.currentAbortController?.signal?.aborted) {
                logger.info(LOG_MODULE, '[VariableAPI.sendToAI] 生成已被终止');
                throw new Error('生成已终止');
            }

            logger.error(LOG_MODULE, '[VariableAPI.sendToAI] 发送失败:', error);
            throw error;

        } finally {
            this.currentAbortController = null;
            this.isGenerating = false;
        }
    }

    /**
     * 兼容旧调用入口。
     *
     * @async
     * @param {Array<Object>} messages - 消息数组。
     * @param {Object} apiConfig - 旧格式 API 配置。
     * @param {AbortSignal} signal - 终止信号。
     * @returns {Promise<{text: string, metadata: Object}>} 响应对象。
     */
    async callAPIWithStreaming(messages, apiConfig, signal) {
        if (!apiConfig || typeof apiConfig !== 'object') {
            throw new Error('API 配置无效');
        }

        if (apiConfig.source === 'default') {
            const result = await generateWithDefault(messages, {
                signal,
                module: 'variables',
            });
            return { text: result.text || '', metadata: {} };
        }

        const source = apiConfig.source === 'custom'
            ? (apiConfig.format || 'openai')
            : apiConfig.source;

        const requestConfig = {
            source,
            model: apiConfig.model,
            baseUrl: apiConfig.baseUrl,
            apiKey: apiConfig.apiKey,
            useDefault: false,
            stream: Boolean(apiConfig.stream),
            ...normalizeParams(apiConfig.params || {}),
            azureConfig: apiConfig.azureConfig,
            customUrl: apiConfig.customUrl,
        };

        if (!requestConfig.model) {
            throw new Error('API 配置错误：缺少模型名称');
        }

        const response = requestConfig.stream
            ? await generateStream(requestConfig, messages, {
                signal,
                module: 'variables',
            })
            : await generate(requestConfig, messages, {
                signal,
                module: 'variables',
            });

        return {
            text: response.text || '',
            metadata: response.raw
                ? this.extractAPIMetadata(response.raw, requestConfig.source)
                : {},
        };
    }

    /**
     * 获取变量模块设置。
     *
     * @returns {Object} 设置对象。
     */
    getSettings() {
        if (!extension_settings[EXT_ID]) {
            extension_settings[EXT_ID] = {};
        }

        if (!extension_settings[EXT_ID][MODULE_NAME]) {
            extension_settings[EXT_ID][MODULE_NAME] = {};
        }

        if (!extension_settings[EXT_ID][MODULE_NAME].apiConfig) {
            extension_settings[EXT_ID][MODULE_NAME].apiConfig = {
                source: 'default',
                stream: false,
                useToolCalling: false,
            };
        }

        return extension_settings[EXT_ID][MODULE_NAME];
    }

    /**
     * 提取 API 元数据（如 Gemini thoughtSignature）。
     *
     * @param {Object} data - API 响应数据。
     * @param {string} currentSource - API 源。
     * @returns {Object} 元数据对象。
     */
    extractAPIMetadata(data, currentSource) {
        const metadata = {};
        const isMakerSuite = currentSource === 'makersuite'
            || currentSource === chat_completion_sources.MAKERSUITE;

        if (!isMakerSuite) {
            return metadata;
        }

        metadata.gemini = {};

        try {
            let sourceData = data;

            if (sourceData?.choices && sourceData?.responseContent?.parts) {
                sourceData = {
                    candidates: [{ content: sourceData.responseContent }],
                    usageMetadata: sourceData.usageMetadata,
                };
            }

            const thoughtSignature = sourceData
                ?.candidates?.[0]?.content?.parts?.[0]?.thoughtSignature;
            if (thoughtSignature) {
                metadata.gemini.thoughtSignature = thoughtSignature;
            }

            const thinkingTokens = sourceData?.usageMetadata?.thoughtsTokenCount;
            if (thinkingTokens) {
                metadata.gemini.thinkingTokens = thinkingTokens;
            }

        } catch (error) {
            logger.warn(LOG_MODULE, '[VariableAPI.extractAPIMetadata] 提取失败:', error.message);
        }

        return metadata;
    }
}

/** @type {VariableAPI|null} */
let apiInstance = null;

/**
 * 获取 API 管理器单例。
 *
 * @returns {VariableAPI} API 管理器实例。
 */
export function getVariableAPI() {
    if (!apiInstance) {
        apiInstance = new VariableAPI();
    }
    return apiInstance;
}
