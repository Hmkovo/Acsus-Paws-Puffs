/**
 * 变量模块 - API 管理器（完整复刻自手机模块）
 *
 * @module variables/variable-api-manager
 *
 * @description
 * 负责与 AI 交互的核心模块：
 * - 使用 sendOpenAIRequest 或自定义 API
 * - 支持流式生成
 * - 终止控制
 * - 通过事件拦截注入自定义配置
 *
 * @changelog
 * - 2026-01-13: 从手机模块 ai-send-controller.js 完整复刻
 */

import logger from '../logger.js';
import { extension_settings, getContext } from '../../../../extensions.js';
import { getRequestHeaders, extractMessageFromData, eventSource, event_types } from '../../../../../script.js';
import { chat_completion_sources, oai_settings, sendOpenAIRequest, getStreamingReply } from '../../../../openai.js';
import { getEventSourceStream } from '../../../../sse-stream.js';
import { getDefaultParams } from './variable-api-params-config.js';

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'acsusPawsPuffs';
const MODULE_NAME = 'variables_v2';

// ========================================
// [CORE] API管理类
// ========================================

/**
 * 变量模块 API 管理器
 *
 * @class VariableAPI
 */
export class VariableAPI {
    /**
     * 创建 API 管理器
     */
    constructor() {
        this.currentAbortController = null;
        this.isGenerating = false;
    }

    /**
     * 初始化
     */
    async init() {
        logger.info('[VariableAPI] 开始初始化');
        logger.info('[VariableAPI] 初始化完成');
    }

    /**
     * 中止当前生成
     */
    abort() {
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
            this.isGenerating = false;
            logger.info('[VariableAPI.abort] 已中止生成');
        }
    }

    /**
     * 获取当前选中的自定义 API 配置
     *
     * @description
     * 从 extension_settings 读取当前的 API 配置：
     * - API类型（format）：从存储的 apiConfig.format 读取
     * - 端点和密钥：根据 API 类型决定
     *   - Custom API：使用 customApiConfig
     *   - OpenRouter：使用固定端点 + openRouterKey
     *   - 其他API：有反代用反代，无反代用默认端点+通用密钥
     * - 模型：从存储的 apiConfig.model 读取
     * - 参数：从存储的 apiConfig.params 读取
     *
     * @returns {Object|null} 配置对象，包含 baseUrl, apiKey, model, format, params 等
     */
    getCurrentCustomConfig() {
        const settings = this.getSettings();
        const apiConfig = settings.apiConfig || {};

        // 读取 API 类型（format）
        const format = apiConfig.format || 'openai';

        // 根据 API 类型获取端点和密钥
        let baseUrl = '';
        let apiKey = '';
        let model = '';

        if (format === 'custom') {
            // Custom API：从 customApiConfig 读取
            const customConfig = apiConfig.customApiConfig || {};
            baseUrl = customConfig.baseUrl || '';
            apiKey = customConfig.apiKey || '';
            model = customConfig.model || '';
        } else if (format === 'openrouter') {
            // OpenRouter：固定端点 + 专用密钥
            baseUrl = 'https://openrouter.ai/api';
            apiKey = apiConfig.openRouterKey || '';
            model = apiConfig.model || '';
        } else {
            // 其他 API：检查是否有反向代理
            const currentProxyPreset = apiConfig.currentProxyPreset || '';
            const proxyPresets = apiConfig.proxyPresets || [];

            if (currentProxyPreset) {
                // 有反向代理预设：使用预设的 URL 和密码
                const preset = proxyPresets.find(p => p.name === currentProxyPreset);
                if (preset && preset.url) {
                    baseUrl = preset.url;
                    apiKey = preset.password || '';
                    logger.debug('[VariableAPI.getCurrentCustomConfig] 使用反向代理预设:', currentProxyPreset);
                }
            }

            // 如果没有反代或反代无效，使用默认端点和通用密钥
            if (!baseUrl) {
                baseUrl = this.getDefaultBaseUrl(format);
                apiKey = apiConfig.apiKey || '';
            }

            model = apiConfig.model || '';
        }

        // 验证必填项
        if (!baseUrl) {
            logger.warn('[VariableAPI.getCurrentCustomConfig] 未配置 API 端点');
            return null;
        }

        // ✅ 获取默认参数值，然后用用户保存的值覆盖
        const defaultParams = getDefaultParams(format);
        const userParams = apiConfig.params || {};
        const mergedParams = { ...defaultParams, ...userParams };

        // 构造返回对象
        const config = {
            baseUrl: baseUrl,
            apiKey: apiKey,
            model: model,
            format: format,
            params: mergedParams
        };

        logger.debug('[VariableAPI.getCurrentCustomConfig] 返回配置:', {
            format: config.format,
            baseUrl: config.baseUrl ? config.baseUrl.substring(0, 30) + '...' : '',
            model: config.model,
            hasApiKey: !!config.apiKey,
            params: Object.keys(config.params)
        });

        return config;
    }

    /**
     * 获取 API 类型的默认端点 URL
     *
     * @param {string} format - API 类型
     * @returns {string} 默认端点 URL
     */
    getDefaultBaseUrl(format) {
        const defaultUrls = {
            'openai': 'https://api.openai.com',
            'claude': 'https://api.anthropic.com',
            'makersuite': 'https://generativelanguage.googleapis.com',
            'deepseek': 'https://api.deepseek.com',
            'mistralai': 'https://api.mistral.ai',
            'cohere': 'https://api.cohere.ai',
            'perplexity': 'https://api.perplexity.ai',
            'groq': 'https://api.groq.com/openai',
            'xai': 'https://api.x.ai',
            'ai21': 'https://api.ai21.com',
            'moonshot': 'https://api.moonshot.cn',
            'fireworks': 'https://api.fireworks.ai/inference',
            'electronhub': 'https://api.electronhub.top',
            'nanogpt': 'https://nano-gpt.com/api',
            'aimlapi': 'https://api.aimlapi.com',
            'pollinations': 'https://text.pollinations.ai',
            'siliconflow': 'https://api.siliconflow.cn',
            'openrouter': 'https://openrouter.ai/api'
        };
        return defaultUrls[format] || '';
    }


    /**
     * 发送消息到 AI 并获取回复（简化版，用于变量模块）
     *
     * @async
     * @param {Array<Object>} messages - 消息数组 [{ role: 'user'|'assistant'|'system', content: string }]
     * @param {Object} [options={}] - 可选配置
     * @param {Function} [options.onChunk] - 流式生成时的回调（接收文本块）
     * @param {AbortSignal} [options.signal] - 外部传入的终止信号
     * @returns {Promise<{text: string, metadata: Object}>} 响应对象
     *
     * @description
     * 核心方法：通过事件拦截注入自定义配置，然后调用官方 sendOpenAIRequest
     */
    async sendToAI(messages, options = {}) {
        logger.info('[VariableAPI.sendToAI] 开始发送到 AI');

        try {
            // 创建终止控制器
            this.currentAbortController = new AbortController();
            this.isGenerating = true;

            const signal = options.signal || this.currentAbortController.signal;

            // 获取 API 配置
            const settings = this.getSettings();
            const apiSettings = settings.apiConfig || { source: 'default', stream: false };

            // 构造 API 配置对象
            let apiConfig = {
                source: apiSettings.source,
                stream: apiSettings.stream
            };

            // ✅ 修复：使用 getCurrentCustomConfig() 读取新的配置结构
            if (apiSettings.source === 'custom') {
                const currentConfig = this.getCurrentCustomConfig();

                if (!currentConfig || !currentConfig.baseUrl) {
                    logger.error('[VariableAPI.sendToAI] 未找到 API 配置');
                    throw new Error('未找到 API 配置，请先在设置中保存一个配置');
                }

                apiConfig = {
                    ...apiConfig,
                    baseUrl: currentConfig.baseUrl,
                    apiKey: currentConfig.apiKey,
                    model: currentConfig.model,
                    format: currentConfig.format,
                    params: currentConfig.params || {}
                };

                logger.debug('[VariableAPI.sendToAI] 使用自定义 API 配置:', {
                    baseUrl: currentConfig.baseUrl ? currentConfig.baseUrl.substring(0, 30) + '...' : '',
                    model: currentConfig.model,
                    format: currentConfig.format || 'openai (默认)',
                    params: currentConfig.params ? Object.keys(currentConfig.params).length + '个参数' : '无参数'
                });
            }

            logger.debug('[VariableAPI] ========== 发送给 AI 的 messages ==========');
            logger.debug(JSON.stringify(messages, null, 2));
            logger.debug('[VariableAPI] ========== messages 结束 ==========');
            logger.debug('[VariableAPI] API 配置:', apiConfig.source, '流式:', apiConfig.stream);

            // ========================================
            // [核心] 使用事件拦截调用官方 sendOpenAIRequest
            // ========================================
            let response = null;
            let eventHandler = null;

            try {
                // 根据 API 源决定如何调用
                if (apiConfig.source === 'custom') {
                    // ========================================
                    // 自定义 API 模式：通过事件拦截注入自定义配置
                    // ========================================
                    const currentConfig = this.getCurrentCustomConfig();
                    if (!currentConfig || !currentConfig.baseUrl) {
                        throw new Error('请先在 API 设置中配置自定义 API');
                    }

                    logger.info('[VariableAPI] 使用自定义 API 模式，通过事件拦截注入配置');

                    // 设置一次性事件拦截器
                    eventHandler = (data) => {
                        data.reverse_proxy = currentConfig.baseUrl;
                        data.proxy_password = currentConfig.apiKey || '';
                        data.model = currentConfig.model || 'gpt-4o-mini';

                        // ✅ 关键：注入 chat_completion_source，决定消息格式转换方式
                        // currentConfig.format 对应官方的 chat_completion_sources（如 'openai', 'claude', 'makersuite' 等）
                        if (currentConfig.format && currentConfig.format !== 'custom') {
                            data.chat_completion_source = currentConfig.format;
                            logger.debug('[VariableAPI] 已注入 chat_completion_source:', currentConfig.format);
                        }

                        // 注入自定义参数（根据 API 类型支持的参数）
                        if (currentConfig.params) {
                            // 通用参数
                            if (currentConfig.params.temperature !== undefined) data.temperature = currentConfig.params.temperature;
                            if (currentConfig.params.max_tokens !== undefined) data.max_tokens = currentConfig.params.max_tokens;
                            if (currentConfig.params.top_p !== undefined) data.top_p = currentConfig.params.top_p;

                            // OpenAI 系列参数
                            if (currentConfig.params.frequency_penalty !== undefined) data.frequency_penalty = currentConfig.params.frequency_penalty;
                            if (currentConfig.params.presence_penalty !== undefined) data.presence_penalty = currentConfig.params.presence_penalty;

                            // Claude/Google 系列参数
                            if (currentConfig.params.top_k !== undefined) data.top_k = currentConfig.params.top_k;

                            // OpenRouter 专用参数
                            if (currentConfig.params.repetition_penalty !== undefined) data.repetition_penalty = currentConfig.params.repetition_penalty;
                            if (currentConfig.params.min_p !== undefined) data.min_p = currentConfig.params.min_p;
                            if (currentConfig.params.top_a !== undefined) data.top_a = currentConfig.params.top_a;
                        }
                        logger.debug('[VariableAPI] 事件拦截注入自定义配置完成:', {
                            reverse_proxy: data.reverse_proxy,
                            model: data.model,
                            chat_completion_source: data.chat_completion_source,
                            params: currentConfig.params ? Object.keys(currentConfig.params) : []
                        });
                    };
                    eventSource.once(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);

                    // 调用官方 API
                    response = await sendOpenAIRequest('quiet', messages, signal);

                } else if (apiConfig.source === 'default') {
                    // ========================================
                    // 跟随酒馆设置：直接调用，不拦截任何参数
                    // ========================================
                    logger.info('[VariableAPI] 使用跟随酒馆设置模式，直接调用官方 API');
                    response = await sendOpenAIRequest('quiet', messages, signal);

                } else {
                    // ========================================
                    // 未知来源：回退到默认模式
                    // ========================================
                    logger.warn('[VariableAPI] 未知的 API 来源:', apiConfig.source, '，回退到默认模式');
                    response = await sendOpenAIRequest('quiet', messages, signal);
                }

            } catch (error) {
                // 清理事件监听器
                if (eventHandler) {
                    eventSource.removeListener(event_types.CHAT_COMPLETION_SETTINGS_READY, eventHandler);
                }

                // 检查是否是终止异常
                if (error.name === 'AbortError' || this.currentAbortController?.signal?.aborted) {
                    logger.info('[VariableAPI] 生成已被终止');
                    throw new Error('生成已终止');
                }
                throw error; // 其他错误继续抛出
            }

            // 再次检查是否被终止
            if (this.currentAbortController.signal.aborted) {
                logger.info('[VariableAPI] 生成已被终止');
                throw new Error('生成已终止');
            }

            // ✅ 处理响应对象
            // sendOpenAIRequest 返回原始 JSON 对象，需要用 extractMessageFromData 提取文本
            let responseText;
            let responseMetadata = {};

            if (typeof response === 'string') {
                // 流式模式：直接是字符串
                responseText = response;
                logger.debug('[VariableAPI] AI 回复接收完成（流式），长度:', responseText.length);
            } else if (typeof response === 'object') {
                // 非流式模式：返回原始 JSON 对象，需要提取文本
                responseText = extractMessageFromData(response);
                logger.debug('[VariableAPI] AI 回复接收完成（非流式），长度:', responseText?.length || 0);

                // 尝试提取元数据（如果有）
                if (response.metadata) {
                    responseMetadata = response.metadata;
                    logger.info('[VariableAPI] 响应包含元数据:', Object.keys(responseMetadata));
                }
            } else {
                logger.error('[VariableAPI] 未知的响应类型:', typeof response);
                throw new Error('API 返回格式错误');
            }

            // 检查提取结果
            if (!responseText) {
                logger.error('[VariableAPI] 无法从响应中提取文本，原始响应:', response);
                throw new Error('API 返回空响应');
            }

            logger.info('[VariableAPI] 发送流程完成');

            return {
                text: responseText,
                metadata: responseMetadata
            };

        } catch (error) {
            logger.error('[VariableAPI] 发送失败:', error);
            throw error;
        } finally {
            // 清理终止控制器
            this.currentAbortController = null;
            this.isGenerating = false;
        }
    }


    /**
     * 调用 API（支持流式和自定义配置）- 完整版
     *
     * @async
     * @param {Array<Object>} messages - messages 数组（支持多种角色类型）
     * @param {Object} apiConfig - API 配置对象
     * @param {AbortSignal} signal - 终止信号
     * @returns {Promise<{text: string, metadata: Object}>} AI 回复对象
     *
     * @description
     * 直接调用 /api/backends/chat-completions/generate 端点
     * 支持自定义 API 配置和流式传输
     */
    async callAPIWithStreaming(messages, apiConfig, signal) {
        // 🔍 调试日志：记录传入的完整 apiConfig
        logger.debug('[VariableAPI.callAPIWithStreaming] === 自定义 API 调试开始 ===');
        logger.debug('[VariableAPI.callAPIWithStreaming] 传入的 apiConfig:', JSON.stringify(apiConfig, null, 2));
        logger.debug('[VariableAPI.callAPIWithStreaming] apiConfig.source:', apiConfig.source);
        logger.debug('[VariableAPI.callAPIWithStreaming] apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, '(类型:', typeof apiConfig.baseUrl, ', 长度:', apiConfig.baseUrl?.length || 0, ')');
        logger.debug('[VariableAPI.callAPIWithStreaming] apiConfig.model:', apiConfig.model);
        logger.debug('[VariableAPI.callAPIWithStreaming] apiConfig.apiKey:', apiConfig.apiKey ? '已设置(已隐藏)' : '未设置');
        logger.debug('[VariableAPI.callAPIWithStreaming] messages 数组长度:', messages.length);

        // 获取当前使用的 API 源
        let currentSource;
        if (apiConfig.source === 'custom') {
            // ✅ 修复：统一使用 OPENAI 源，通过 reverse_proxy 模式让后端使用我们的 proxy_password
            // 原因：CUSTOM 源会强制从本地密钥文件读取，忽略 proxy_password，导致 401 认证失败
            const formatMap = {
                'openai': chat_completion_sources.OPENAI,
                'claude': chat_completion_sources.CLAUDE,
                'google': chat_completion_sources.MAKERSUITE,
                'openrouter': chat_completion_sources.OPENROUTER,
                'scale': chat_completion_sources.OPENAI,
                'ai21': chat_completion_sources.AI21,
                'mistral': chat_completion_sources.MISTRALAI,
                'custom': 'auto'
            };

            const userFormat = apiConfig.format || 'openai';

            if (userFormat === 'custom') {
                currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
                logger.debug('[VariableAPI] 自定义 API - 自动检测模式，使用酒馆 API 源:', currentSource);
            } else {
                currentSource = formatMap[userFormat] || chat_completion_sources.OPENAI;
                logger.debug('[VariableAPI] 自定义 API - 用户选择格式:', userFormat, '→ 映射到:', currentSource);
            }
        } else {
            currentSource = oai_settings.chat_completion_source || chat_completion_sources.OPENAI;
            logger.debug('[VariableAPI] 使用酒馆 API 源:', currentSource);
        }

        let model = apiConfig.model;
        if (!model) {
            model = oai_settings.openai_model || 'gpt-4o-mini';
            logger.warn('[VariableAPI.callAPIWithStreaming] 未设置模型，使用官方默认:', model);
        }

        // ✅ 移除 models/ 前缀（避免 URL 重复：/models/models/xxx）
        if (model && model.startsWith('models/')) {
            const originalModel = model;
            model = model.replace('models/', '');
            logger.debug('[VariableAPI.callAPIWithStreaming] 移除 models/ 前缀:', originalModel, '→', model);
        }

        logger.debug('[VariableAPI.callAPIWithStreaming] 最终使用的 model:', model);

        // ✅ 核心修复：区分 default 模式和 custom 模式的参数读取
        let bodyParams = {};

        if (apiConfig.source === 'custom') {
            // ✅ custom 模式：使用保存的参数配置（完全独立）
            const savedParams = apiConfig.params || {};

            // 只添加用户保存的参数（避免发送不支持的参数）
            if (savedParams.temperature !== undefined) {
                bodyParams.temperature = savedParams.temperature;
            } else {
                bodyParams.temperature = 0.8; // 默认值
            }

            if (savedParams.max_tokens !== undefined) {
                bodyParams.max_tokens = savedParams.max_tokens;
            } else {
                bodyParams.max_tokens = 8000; // 默认值
            }

            // 可选参数：只在用户设置了才添加
            if (savedParams.frequency_penalty !== undefined) {
                bodyParams.frequency_penalty = savedParams.frequency_penalty;
            }
            if (savedParams.presence_penalty !== undefined) {
                bodyParams.presence_penalty = savedParams.presence_penalty;
            }
            if (savedParams.top_p !== undefined) {
                bodyParams.top_p = savedParams.top_p;
            }
            if (savedParams.top_k !== undefined) {
                bodyParams.top_k = savedParams.top_k;
            }
            if (savedParams.repetition_penalty !== undefined) {
                bodyParams.repetition_penalty = savedParams.repetition_penalty;
            }
            if (savedParams.min_p !== undefined) {
                bodyParams.min_p = savedParams.min_p;
            }
            if (savedParams.top_a !== undefined) {
                bodyParams.top_a = savedParams.top_a;
            }

            logger.info('[VariableAPI.callAPIWithStreaming] ✅ 使用自定义参数配置:', bodyParams);
        } else {
            // ✅ default 模式：使用酒馆配置
            bodyParams.temperature = Number(oai_settings.temp_openai) || 1.0;
            bodyParams.max_tokens = Number(oai_settings.openai_max_tokens) || 2000;
            bodyParams.frequency_penalty = Number(oai_settings.freq_pen_openai) || 0;
            bodyParams.presence_penalty = Number(oai_settings.pres_pen_openai) || 0;
            bodyParams.top_p = Number(oai_settings.top_p_openai) || 1.0;

            const topK = Number(oai_settings.top_k_openai);
            if (topK) bodyParams.top_k = topK;

            logger.info('[VariableAPI.callAPIWithStreaming] ✅ 使用酒馆参数配置:', bodyParams);
        }

        const body = {
            type: 'quiet',
            messages: messages,
            model: model,
            stream: apiConfig.stream || false,
            chat_completion_source: currentSource,
            ...bodyParams,
            use_makersuite_sysprompt: true,
            claude_use_sysprompt: true
        };

        if (apiConfig.source === 'custom') {
            logger.debug('[VariableAPI.callAPIWithStreaming] 🔍 进入自定义 API 分支');
            logger.debug('[VariableAPI.callAPIWithStreaming] 检查前 - apiConfig.baseUrl:', `"${apiConfig.baseUrl}"`, ', trim后:', `"${apiConfig.baseUrl?.trim()}"`);
            logger.debug('[VariableAPI.callAPIWithStreaming] 检查前 - apiConfig.model:', `"${apiConfig.model}"`, ', trim后:', `"${apiConfig.model?.trim()}"`);

            // ✅ 修复：检查必填字段，避免传递空值导致 Invalid URL
            if (!apiConfig.baseUrl || !apiConfig.baseUrl.trim()) {
                const error = new Error('自定义 API 配置错误：缺少 API 端点 (Base URL)');
                logger.error('[VariableAPI.callAPIWithStreaming]', error.message);
                logger.error('[VariableAPI.callAPIWithStreaming] baseUrl 值:', apiConfig.baseUrl, ', 类型:', typeof apiConfig.baseUrl);
                throw error;
            }
            if (!apiConfig.model || !apiConfig.model.trim()) {
                const error = new Error('自定义 API 配置错误：缺少模型名称');
                logger.error('[VariableAPI.callAPIWithStreaming]', error.message);
                logger.error('[VariableAPI.callAPIWithStreaming] model 值:', apiConfig.model, ', 类型:', typeof apiConfig.model);
                throw error;
            }

            logger.debug('[VariableAPI.callAPIWithStreaming] ✅ 验证通过，开始设置 API 端点');

            // ✅ 修复：使用 reverse_proxy 模式让后端使用我们的 proxy_password
            body.reverse_proxy = apiConfig.baseUrl.trim();
            logger.debug('[VariableAPI.callAPIWithStreaming] body.reverse_proxy 已设置为:', `"${body.reverse_proxy}"`);

            if (apiConfig.apiKey) {
                body.proxy_password = apiConfig.apiKey.trim();
                logger.debug('[VariableAPI.callAPIWithStreaming] body.proxy_password 已设置（后端将使用此密钥）');
            }
        } else {
            logger.debug('[VariableAPI.callAPIWithStreaming] 跳过自定义 API 分支 (source !== "custom")');
        }

        // 🔍 最终检查：记录 body 中的 reverse_proxy
        logger.debug('[VariableAPI.callAPIWithStreaming] 最终 body.reverse_proxy:', body.reverse_proxy);
        logger.debug('[VariableAPI.callAPIWithStreaming] 完整 body 对象:', JSON.stringify(body, null, 2));

        logger.info('[VariableAPI.callAPIWithStreaming] 最终请求配置:', {
            扩展API配置源: apiConfig.source,
            酒馆API源: currentSource,
            流式传输: body.stream,
            模型: body.model,
            反向代理: body.reverse_proxy || '使用酒馆默认',
            温度: body.temperature,
            最终max_tokens: body.max_tokens
        });

        const response = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
            signal: signal
        });

        if (!response.ok) {
            // ✅ 提取完整响应体（原封不动）
            const errorText = await response.text();

            // ✅ 尝试解析 JSON 格式的错误
            let errorJson = null;
            try {
                errorJson = JSON.parse(errorText);
            } catch (e) {
                // 不是 JSON，保持原样
            }

            // ✅ 记录到日志（格式化 JSON）
            logger.error('[VariableAPI] ========== API 错误详情 ==========');
            logger.error('[VariableAPI] 状态码:', response.status);
            logger.error('[VariableAPI] 状态文本:', response.statusText);
            if (errorJson) {
                logger.error('[VariableAPI] 错误内容（JSON）:', JSON.stringify(errorJson, null, 2));
            } else {
                logger.error('[VariableAPI] 错误内容（纯文本）:', errorText);
            }
            logger.error('[VariableAPI] ======================================');

            // ✅ 抛出简洁的错误（给 toast 显示）
            throw new Error(`API 调用失败 (${response.status})`);
        }

        if (apiConfig.stream) {
            return await this.handleStreamResponse(response, signal, currentSource);
        } else {
            const data = await response.json();
            // ✅ 修复：使用 extractMessageFromData 自动适配各种 API 格式（OpenAI/Claude/Google AI等）
            const message = extractMessageFromData(data);

            // ✅ 提取 API 元数据（如 Gemini 的 thoughtSignature）
            const metadata = this.extractAPIMetadata(data, currentSource);

            // ✅ 返回结构化对象（而不只是文本）
            return {
                text: message || '',
                metadata: metadata
            };
        }
    }


    /**
     * 处理流式响应
     *
     * @async
     * @param {Response} response - fetch 响应对象
     * @param {AbortSignal} signal - 中止信号
     * @param {string} currentSource - 当前使用的 API 源
     * @returns {Promise<{text: string, metadata: Object}>} 完整回复对象
     */
    async handleStreamResponse(response, signal, currentSource) {
        const eventStream = getEventSourceStream();
        response.body.pipeThrough(eventStream);
        const reader = eventStream.readable.getReader();

        let fullText = '';
        const state = { reasoning: '', image: '' };

        logger.debug('[VariableAPI.handleStreamResponse] 使用 API 源解析流式响应:', currentSource);

        try {
            while (true) {
                if (signal.aborted) {
                    logger.info('[VariableAPI] 流式生成被中止');
                    break;
                }

                const { done, value } = await reader.read();

                if (done || !value?.data || value.data === '[DONE]') {
                    logger.debug('[VariableAPI] 流式生成完成');
                    break;
                }

                let parsed;
                try {
                    parsed = JSON.parse(value.data);
                } catch (error) {
                    logger.warn('[VariableAPI] 解析 SSE 数据失败:', error);
                    continue;
                }

                const chunk = getStreamingReply(parsed, state, {
                    chatCompletionSource: currentSource
                });

                if (typeof chunk === 'string' && chunk) {
                    fullText += chunk;
                    logger.debug('[VariableAPI] 收到文本块，当前长度:', fullText.length);
                }
            }

            return {
                text: fullText,
                metadata: {}
            };

        } catch (error) {
            if (error.name === 'AbortError' || signal.aborted) {
                logger.info('[VariableAPI] 流式生成被中止，返回部分文本');
                return {
                    text: fullText,
                    metadata: {}
                };
            }

            throw error;

        } finally {
            try {
                reader.releaseLock?.();
            } catch (error) {
                logger.warn('[VariableAPI] 释放读取器失败:', error);
            }
        }
    }

    /**
     * 获取变量模块设置
     *
     * @returns {Object} 变量模块设置对象
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
                useToolCalling: false
            };
        }
        return extension_settings[EXT_ID][MODULE_NAME];
    }

    /**
     * 提取 API 元数据（如 Gemini 的 thoughtSignature）
     *
     * @param {Object} data - API 响应数据
     * @param {string} currentSource - API 源（makersuite / openai / claude 等）
     * @returns {Object} 元数据对象，按 API 源分类
     *
     * @description
     * 从 API 响应中提取特定于该 API 的元数据：
     * - Gemini (makersuite)：thoughtSignature、thinkingTokens
     * - OpenAI：（暂无）
     * - Claude：（暂无）
     *
     * @example
     * const metadata = this.extractAPIMetadata(geminiResponse, 'makersuite');
     * // 返回：{ gemini: { thoughtSignature: '...', thinkingTokens: 1078 } }
     */
    extractAPIMetadata(data, currentSource) {
        const metadata = {};

        // ✅ Gemini / MakerSuite
        if (currentSource === 'makersuite' || currentSource === chat_completion_sources.MAKERSUITE) {
            metadata.gemini = {};

            // 🔍 调试：打印接收到的 data 结构
            logger.debug('[VariableAPI.extractAPIMetadata] 🔍 接收到的 data 对象键:', Object.keys(data));
            logger.debug('[VariableAPI.extractAPIMetadata] 🔍 data.candidates:', data.candidates ? '存在' : '不存在');
            logger.debug('[VariableAPI.extractAPIMetadata] 🔍 data.usageMetadata:', data.usageMetadata ? JSON.stringify(data.usageMetadata) : '不存在');

            // 🔍 检查是否是 OpenAI 格式（SillyTavern 转换后）
            if (data.choices && data.responseContent) {
                logger.debug('[VariableAPI.extractAPIMetadata] 🔍 检测到 OpenAI 格式，尝试从 responseContent 提取');

                // SillyTavern 返回的 responseContent 直接是 content 对象：{ parts: [...], role: '...' }
                // 需要重构为 Gemini 原始格式：{ candidates: [{ content: {...} }] }
                if (data.responseContent.parts) {
                    logger.info('[VariableAPI.extractAPIMetadata] 🎯 从 responseContent.parts 重构 Gemini 响应');
                    data = {
                        candidates: [{
                            content: data.responseContent
                        }],
                        usageMetadata: data.usageMetadata  // 保留 token 统计
                    };
                }
            }

            if (data.candidates) {
                logger.debug('[VariableAPI.extractAPIMetadata] 🔍 candidates[0]:', data.candidates[0] ? '存在' : '不存在');
                if (data.candidates[0]) {
                    logger.debug('[VariableAPI.extractAPIMetadata] 🔍 candidates[0] 键:', Object.keys(data.candidates[0]));
                    logger.debug('[VariableAPI.extractAPIMetadata] 🔍 candidates[0].content:', data.candidates[0].content ? '存在' : '不存在');
                    if (data.candidates[0].content) {
                        logger.debug('[VariableAPI.extractAPIMetadata] 🔍 content 键:', Object.keys(data.candidates[0].content));
                        logger.debug('[VariableAPI.extractAPIMetadata] 🔍 content.parts:', data.candidates[0].content.parts ? `存在，长度: ${data.candidates[0].content.parts.length}` : '不存在');
                        if (data.candidates[0].content.parts?.[0]) {
                            logger.debug('[VariableAPI.extractAPIMetadata] 🔍 parts[0] 键:', Object.keys(data.candidates[0].content.parts[0]));
                            logger.debug('[VariableAPI.extractAPIMetadata] 🔍 parts[0].thoughtSignature:', data.candidates[0].content.parts[0].thoughtSignature ? '存在' : '不存在');
                        }
                    }
                }
            }

            try {
                // 从第一个 candidate 的第一个 part 提取 thoughtSignature
                const thoughtSignature = data.candidates?.[0]?.content?.parts?.[0]?.thoughtSignature;
                if (thoughtSignature) {
                    metadata.gemini.thoughtSignature = thoughtSignature;
                    logger.info('[VariableAPI.extractAPIMetadata] ✅ 提取到 Gemini thoughtSignature');
                    logger.debug('[VariableAPI.extractAPIMetadata] Signature 长度:', thoughtSignature.length);
                } else {
                    logger.warn('[VariableAPI.extractAPIMetadata] ❌ 未找到 thoughtSignature');
                }

                // 提取 thinking tokens 统计
                const thinkingTokens = data.usageMetadata?.thoughtsTokenCount;
                if (thinkingTokens) {
                    metadata.gemini.thinkingTokens = thinkingTokens;
                    logger.debug('[VariableAPI.extractAPIMetadata] Thinking tokens:', thinkingTokens);
                } else {
                    logger.debug('[VariableAPI.extractAPIMetadata] 未找到 thoughtsTokenCount');
                }
            } catch (error) {
                logger.warn('[VariableAPI.extractAPIMetadata] Gemini 元数据提取失败:', error.message);
            }
        }

        logger.debug('[VariableAPI.extractAPIMetadata] 元数据提取完成:', Object.keys(metadata));
        return metadata;
    }
}

// ========================================
// [SINGLETON] 单例实例
// ========================================

/** @type {VariableAPI|null} */
let apiInstance = null;

/**
 * 获取 API 管理器实例（单例）
 *
 * @returns {VariableAPI} API 管理器实例
 */
export function getVariableAPI() {
    if (!apiInstance) {
        apiInstance = new VariableAPI();
    }
    return apiInstance;
}
