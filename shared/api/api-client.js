/**
 * 共享API层 - 统一发送入口
 *
 * @module shared/api/api-client
 * @description
 * 所有模块(日记/手机/变量)调用AI的唯一入口。
 * - 自定义API: 直接POST到ST后端 /api/backends/chat-completions/generate
 * - 默认模式: 调用ST原生的 sendOpenAIRequest (不修改全局状态)
 *
 * ST后端会根据 chat_completion_source 自动路由到对应provider，
 * 自动做消息格式转换，前端只管发OpenAI风格的messages。
 */

import {
    getRequestHeaders,
    extractMessageFromData,
} from '../../../../../../script.js';
import {
    sendOpenAIRequest,
    getStreamingReply,
} from '../../../../../openai.js';
import { getEventSourceStream } from '../../../../../sse-stream.js';
import logger from '../../logger.js';
import { buildGenerateData } from './api-request-builder.js';
import { ApiError, API_ERROR_TYPES, classifyError } from './api-errors.js';
import { validateConfig } from './api-config-schema.js';

const GENERATE_URL = '/api/backends/chat-completions/generate';

/**
 * 非流式调用AI (自定义API模式)
 *
 * @async
 * @param {Object} config - API配置(见 api-request-builder.js 的 config 说明)
 * @param {Array<Object>} messages - OpenAI风格消息数组
 * @param {Object} [options={}] - 可选参数
 * @param {AbortSignal} [options.signal] - 中止信号
 * @param {string} [options.module='api'] - 调用方模块名(用于日志)
 * @returns {Promise<{text: string, raw: Object}>} AI回复
 * @throws {ApiError} 各类API错误
 */
export async function generate(config, messages, options = {}) {
    const mod = options.module || 'api';
    const validation = validateConfig(config);
    if (!validation.valid) {
        throw new ApiError(API_ERROR_TYPES.CONFIG, validation.error);
    }

    logger.info('api', `[generate] ${mod} 发起非流式请求:`,
        config.source, config.model);

    const generateData = buildGenerateData(config, messages);
    const response = await fetchGenerate(generateData, options.signal);
    const data = await response.json();

    if (data.error) {
        const msg = data.error.message || '未知错误';
        throw new ApiError(API_ERROR_TYPES.SERVER, msg, 0, data);
    }

    const text = extractMessageFromData(data);
    if (!text) {
        throw new ApiError(
            API_ERROR_TYPES.SERVER, 'API返回空响应', 0, data
        );
    }

    logger.info('api', `[generate] ${mod} 完成, 长度:`, text.length);
    return { text, raw: data };
}

/**
 * 流式调用AI (自定义API模式)
 *
 * @async
 * @param {Object} config - API配置(stream字段会被强制设为true)
 * @param {Array<Object>} messages - OpenAI风格消息数组
 * @param {Object} [options={}] - 可选参数
 * @param {AbortSignal} [options.signal] - 中止信号
 * @param {Function} [options.onChunk] - 每收到一块文本的回调 (text: string) => void
 * @param {string} [options.module='api'] - 调用方模块名
 * @returns {Promise<{text: string, raw: null}>} 完整AI回复
 * @throws {ApiError}
 */
export async function generateStream(config, messages, options = {}) {
    const mod = options.module || 'api';
    const validation = validateConfig(config);
    if (!validation.valid) {
        throw new ApiError(API_ERROR_TYPES.CONFIG, validation.error);
    }

    const streamConfig = { ...config, stream: true };
    logger.info('api', `[generateStream] ${mod} 发起流式请求:`,
        config.source, config.model);

    const generateData = buildGenerateData(streamConfig, messages);
    const response = await fetchGenerate(generateData, options.signal);

    const eventStream = getEventSourceStream();
    response.body.pipeThrough(eventStream);
    const reader = eventStream.readable.getReader();

    let fullText = '';
    const state = { reasoning: '', image: '' };

    try {
        while (true) {
            if (options.signal?.aborted) break;

            const { done, value } = await reader.read();
            if (done || !value?.data || value.data === '[DONE]') break;

            let parsed;
            try {
                parsed = JSON.parse(value.data);
            } catch {
                continue;
            }

            const chunk = getStreamingReply(parsed, state, {
                chatCompletionSource: streamConfig.chat_completion_source
                    || config.source,
            });

            if (typeof chunk === 'string' && chunk) {
                fullText += chunk;
                options.onChunk?.(chunk);
            }
        }
    } finally {
        try { reader.releaseLock?.(); } catch { /* 静默 */ }
    }

    logger.info('api', `[generateStream] ${mod} 完成, 长度:`, fullText.length);
    return { text: fullText, raw: null };
}

/**
 * 使用ST默认设置调用AI (不修改全局状态，无并发风险)
 *
 * @async
 * @param {Array<Object>} messages - OpenAI风格消息数组
 * @param {Object} [options={}] - 可选参数
 * @param {AbortSignal} [options.signal] - 中止信号
 * @param {string} [options.module='api'] - 调用方模块名
 * @returns {Promise<{text: string, raw: Object}>} AI回复
 * @throws {ApiError}
 *
 * @description
 * 直接调用ST原生 sendOpenAIRequest('quiet', ...)，
 * 使用当前ST全局设置(API来源/模型/参数)。
 * type='quiet'不会修改全局状态，无并发风险。
 */
export async function generateWithDefault(messages, options = {}) {
    const mod = options.module || 'api';
    logger.info('api', `[generateWithDefault] ${mod} 使用ST默认设置`);

    try {
        const signal = options.signal || new AbortController().signal;
        const response = await sendOpenAIRequest(
            'quiet', messages, signal
        );

        let text;
        if (typeof response === 'string') {
            text = response;
        } else if (typeof response === 'object') {
            text = extractMessageFromData(response);
        }

        if (!text) {
            throw new ApiError(
                API_ERROR_TYPES.SERVER, 'API返回空响应', 0, response
            );
        }

        logger.info('api',
            `[generateWithDefault] ${mod} 完成, 长度:`, text.length);
        return { text, raw: response };

    } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error.name === 'AbortError') {
            throw new ApiError(API_ERROR_TYPES.ABORT, '生成已终止');
        }
        throw new ApiError(
            API_ERROR_TYPES.SERVER, error.message || '未知错误', 0, error
        );
    }
}

// ========================================
// 内部函数
// ========================================

/**
 * 发送POST请求到ST后端
 * @param {Object} generateData - 请求体
 * @param {AbortSignal} [signal] - 中止信号
 * @returns {Promise<Response>} fetch响应
 * @throws {ApiError} HTTP错误
 */
async function fetchGenerate(generateData, signal) {
    let response;
    try {
        response = await fetch(GENERATE_URL, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(generateData),
            signal: signal,
        });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new ApiError(API_ERROR_TYPES.ABORT, '生成已终止');
        }
        throw new ApiError(
            API_ERROR_TYPES.NETWORK,
            `网络请求失败: ${error.message}`, 0, error
        );
    }

    if (!response.ok) {
        const bodyText = await response.text();
        throw classifyError(response.status, bodyText);
    }

    return response;
}
