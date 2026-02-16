/**
 * AI API参数配置（基于酒馆的data-source规则）
 * @module phone/ai-integration/phone-api-params-config
 *
 * @description
 * 定义每种API格式支持的参数及其范围、默认值
 * 用于动态生成参数配置UI和保存/读取配置
 */

import logger from '../../../logger.js';

/**
 * 参数定义表（参数名 -> 配置）
 *
 * @const {Object.<string, Object>}
 */
export const PARAMS_DEFINITIONS = {
  temperature: {
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.8,
    label: '温度',
    hint: '控制输出的随机性，值越大越随机。(Gemini 3 官方推荐使用默认值 1.0)'
  },
  frequency_penalty: {
    min: -2,
    max: 2,
    step: 0.01,
    default: 0,
    label: '频率惩罚',
    hint: '降低重复内容的频率，正值惩罚重复'
  },
  presence_penalty: {
    min: -2,
    max: 2,
    step: 0.01,
    default: 0,
    label: '存在惩罚',
    hint: '鼓励谈论新话题，正值促进多样性'
  },
  top_k: {
    min: 0,
    max: 500,
    step: 1,
    default: 40,
    label: 'Top K',
    hint: '采样时只考虑概率最高的K个token'
  },
  top_p: {
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.95,
    label: 'Top P',
    hint: '核采样，累积概率达到P时停止'
  },
  repetition_penalty: {
    min: 1,
    max: 2,
    step: 0.01,
    default: 1,
    label: '重复惩罚',
    hint: 'OpenRouter专用，惩罚重复token'
  },
  min_p: {
    min: 0,
    max: 1,
    step: 0.001,
    default: 0,
    label: 'Min P',
    hint: 'OpenRouter专用，最小概率阈值'
  },
  top_a: {
    min: 0,
    max: 1,
    step: 0.001,
    default: 0,
    label: 'Top A',
    hint: 'OpenRouter专用，自适应采样'
  },
  max_tokens: {
    min: 100,
    max: 100000,
    step: 100,
    default: 8000,
    label: '最大Token数',
    hint: '生成回复的最大长度'
  }
};

/**
 * API格式参数映射表（格式 -> 支持的参数列表）
 *
 * @description
 * 基于酒馆的data-source规则，定义每种API格式支持哪些参数
 * 完整支持所有22个官方API源
 * ✅ 2025-12-29 已与官方 index.html 同步
 *
 * @const {Object.<string, string[]>}
 */
export const FORMAT_PARAMS_MAP = {
  // ========== 常用API ==========
  openai: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  claude: [
    'temperature',
    'top_k',
    'top_p',
    'max_tokens'
  ],
  makersuite: [  // Google AI (Gemini)
    'temperature',
    'top_k',
    'top_p',
    'max_tokens'
  ],
  openrouter: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_k',  // ✅ 官方支持
    'top_p',
    'repetition_penalty',
    'min_p',
    'top_a',
    'max_tokens'
  ],
  deepseek: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],

  // ========== 其他官方API ==========
  mistralai: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  cohere: [
    'temperature',
    'frequency_penalty',  // ✅ 官方支持
    'presence_penalty',   // ✅ 官方支持
    'top_k',
    'top_p',
    'max_tokens'
  ],
  perplexity: [
    'temperature',
    'frequency_penalty',  // ✅ 官方支持
    'presence_penalty',   // ✅ 官方支持
    'top_k',              // ✅ 官方支持
    'top_p',
    'max_tokens'
  ],
  groq: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  xai: [  // xAI (Grok)
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  ai21: [
    'temperature',
    'top_p',
    'max_tokens'
  ],
  moonshot: [  // Moonshot (Kimi)
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  fireworks: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  electronhub: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_k',              // ✅ 官方支持
    'top_p',
    'max_tokens'
  ],
  chutes: [  // ✅ 1.15.0 新增
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_k',
    'top_p',
    'repetition_penalty',
    'min_p',
    'max_tokens'
  ],
  nanogpt: [  // ✅ 1.15.0 更新：新增 top_k, repetition_penalty, min_p, top_a
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_k',
    'top_p',
    'repetition_penalty',
    'min_p',
    'top_a',
    'max_tokens'
  ],
  aimlapi: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_k',              // ✅ 官方支持
    'top_p',
    'max_tokens'
  ],
  pollinations: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  cometapi: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  siliconflow: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  vertexai: [  // Vertex AI
    'temperature',
    'top_k',
    'top_p',
    'max_tokens'
  ],
  azure_openai: [
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],
  zai: [
    'temperature',
    'top_p',
    'max_tokens'
  ],

  // ========== 通用/兼容格式 ==========
  custom: [  // OpenAI兼容格式（通用）
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ],

  // ========== 兼容旧配置（别名） ==========
  google: [  // 旧名称，映射到makersuite
    'temperature',
    'top_k',
    'top_p',
    'max_tokens'
  ],
  mistral: [  // 旧名称，映射到mistralai
    'temperature',
    'frequency_penalty',
    'presence_penalty',
    'top_p',
    'max_tokens'
  ]
};

/**
 * 获取指定格式支持的参数列表
 *
 * @param {string} format - API格式（openai/claude/google等）
 * @returns {string[]} 参数名列表
 */
export function getSupportedParams(format) {
  const params = FORMAT_PARAMS_MAP[format] || FORMAT_PARAMS_MAP.custom;
  logger.debug('phone','[PhoneAPIParams.getSupportedParams] 格式:', format, '→ 支持参数:', params);
  return params;
}

/**
 * 获取参数的默认值配置对象
 *
 * @param {string} format - API格式
 * @returns {Object.<string, number>} 参数名 -> 默认值的映射
 */
export function getDefaultParams(format) {
  const supportedParams = getSupportedParams(format);
  const defaults = {};

  for (const paramName of supportedParams) {
    const definition = PARAMS_DEFINITIONS[paramName];
    if (definition) {
      defaults[paramName] = definition.default;
    }
  }

  logger.debug('phone','[PhoneAPIParams.getDefaultParams] 格式:', format, '→ 默认值:', defaults);
  return defaults;
}

/**
 * 验证参数值是否在有效范围内
 *
 * @param {string} paramName - 参数名
 * @param {number} value - 参数值
 * @returns {boolean} 是否有效
 */
export function validateParamValue(paramName, value) {
  const definition = PARAMS_DEFINITIONS[paramName];
  if (!definition) {
    logger.warn('phone','[PhoneAPIParams.validateParamValue] 未知参数:', paramName);
    return false;
  }

  if (typeof value !== 'number' || isNaN(value)) {
    return false;
  }

  return value >= definition.min && value <= definition.max;
}
