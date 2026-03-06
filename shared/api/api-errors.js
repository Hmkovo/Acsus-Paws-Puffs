/**
 * 共享API层 - 错误标准化
 *
 * @module shared/api/api-errors
 * @description
 * 统一的API错误分类和处理，让调用方能根据错误类型做不同反应：
 * - auth: 认证失败(密钥错误/过期) → 提示用户检查密钥
 * - rateLimit: 限流 → 提示用户稍后重试
 * - network: 网络错误 → 提示检查网络
 * - server: 服务器错误 → 提示服务不可用
 * - config: 配置错误 → 提示检查设置
 * - abort: 用户主动中止 → 静默处理
 */

/** API错误类型枚举 */
export const API_ERROR_TYPES = {
    AUTH: 'auth',
    RATE_LIMIT: 'rateLimit',
    NETWORK: 'network',
    SERVER: 'server',
    CONFIG: 'config',
    ABORT: 'abort',
};

/**
 * 统一的API错误类
 * @extends Error
 */
export class ApiError extends Error {
    /**
     * @param {string} type - 错误类型(API_ERROR_TYPES中的值)
     * @param {string} message - 人话错误描述
     * @param {number} [status=0] - HTTP状态码
     * @param {*} [raw=null] - 原始错误数据(用于调试)
     */
    constructor(type, message, status = 0, raw = null) {
        super(message);
        this.name = 'ApiError';
        this.type = type;
        this.status = status;
        this.raw = raw;
    }
}

/**
 * 根据HTTP响应分类错误
 *
 * @param {number} status - HTTP状态码
 * @param {string} [bodyText=''] - 响应体文本
 * @returns {ApiError} 分类后的错误对象
 */
export function classifyError(status, bodyText = '') {
    let detail = '';
    try {
        const json = JSON.parse(bodyText);
        detail = json?.error?.message || json?.message || '';
    } catch {
        detail = bodyText.substring(0, 200);
    }

    if (status === 401 || status === 403) {
        return new ApiError(
            API_ERROR_TYPES.AUTH,
            `认证失败 (${status})${detail ? ': ' + detail : ''}`,
            status, bodyText
        );
    }
    if (status === 429) {
        return new ApiError(
            API_ERROR_TYPES.RATE_LIMIT,
            `请求过于频繁，请稍后重试${detail ? ': ' + detail : ''}`,
            status, bodyText
        );
    }
    if (status >= 500) {
        return new ApiError(
            API_ERROR_TYPES.SERVER,
            `API服务器错误 (${status})${detail ? ': ' + detail : ''}`,
            status, bodyText
        );
    }
    return new ApiError(
        API_ERROR_TYPES.NETWORK,
        `API调用失败 (${status})${detail ? ': ' + detail : ''}`,
        status, bodyText
    );
}
