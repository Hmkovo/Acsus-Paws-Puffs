/**
 * 全局宏注册器 (Global Macro Registry)
 *
 * @description
 * 将动态变量系统的宏注册到 SillyTavern 全局宏系统，使其在酒馆任何地方都能使用：
 * - 预设提示词、世界书条目、角色卡描述、作者注释等
 *
 * 支持的宏格式：
 * - {{变量名}} - 获取变量全部内容
 * - {{变量名@N}} - 获取第 N 条
 * - {{变量名@N-M}} - 获取第 N 到 M 条
 * - {{变量名@N-end}} - 获取第 N 条到最后
 * - {{酒馆楼层@N-M}} - 获取聊天楼层内容
 */

import logger from '../logger.js';
import { getContext } from '../../../../extensions.js';
import { macros } from '../../../../macros/macro-system.js';
import { eventSource, event_types } from '../../../../../script.js';

// ============================================
// 常量和状态
// ============================================

const CHAT_FLOOR_MACRO_NAME = '酒馆楼层';
const registeredMacros = new Set();
let variableManagerRef = null;
let storageRef = null;
let preprocessorSetup = false;

// ============================================
// 核心注册函数
// ============================================

/**
 * 注册所有动态变量宏到 SillyTavern 全局系统
 * @async
 */
export async function registerAllGlobalMacros() {
  logger.info('variable', '[GlobalMacroRegistry] 开始注册全局宏...');

  try {
    // 延迟导入，避免循环依赖
    const { getVariableManagerV2 } = await import('./variable-manager-v2.js');
    const storage = await import('./variable-storage.js');
    variableManagerRef = getVariableManagerV2;
    storageRef = storage;

    // 调试：打印初始状态
    const ctx = getContext();
    logger.info('variable', '[GlobalMacroRegistry] chatId:', ctx?.chatId);

    registerChatFloorMacro();
    await registerAllVariableMacros();

    // 调试：打印已注册的变量宏
    const manager = variableManagerRef();
    const definitions = manager.getDefinitions();
    logger.info('variable', '[GlobalMacroRegistry] 发现变量定义:', definitions.length);
    logger.debug('variable', '[GlobalMacroRegistry] 变量列表:', definitions.map(d => d.name));

    setupMacroPreprocessor();

    // 预加载当前聊天的所有变量数据到内存
    await preloadAllVariableValues();

    logger.info('variable', '[GlobalMacroRegistry] 全局宏注册完成，已注册:', registeredMacros.size, '个');
  } catch (error) {
    logger.error('variable', '[GlobalMacroRegistry] 注册失败:', error.message);
  }
}

/**
 * 预加载所有变量值到内存缓存
 * 确保宏调用时数据已就绪
 * 优化：只加载缓存中没有的数据
 * @async
 */
export async function preloadAllVariableValues() {
  if (!variableManagerRef || !storageRef) {
    logger.warn('variable', '[GlobalMacroRegistry] 预加载失败：variableManagerRef 或 storageRef 未初始化');
    return;
  }

  try {
    const ctx = getContext();
    const chatId = ctx?.chatId;
    if (!chatId) {
      logger.warn('variable', '[GlobalMacroRegistry] 预加载失败：chatId 为空');
      return;
    }

    const variableManager = variableManagerRef();
    const variables = variableManager.getDefinitions();

    logger.debug('variable', '[GlobalMacroRegistry] 预加载：发现', variables.length, '个变量');

    // 只加载缓存中没有的变量
    const unloadedVariables = variables.filter(v => {
      const cached = storageRef.getCachedValueV2(v.id, chatId);
      return !cached;
    });

    if (unloadedVariables.length === 0) {
      logger.debug('variable', '[GlobalMacroRegistry] 缓存已存在，跳过预加载');
      return;
    }

    logger.debug('variable', '[GlobalMacroRegistry] 开始预加载', unloadedVariables.length, '个变量');

    // 并行加载未缓存的变量
    await Promise.all(
      unloadedVariables.map(v => storageRef.getValueV2(v.id, chatId))
    );

    logger.debug('variable', '[GlobalMacroRegistry] 已预加载', unloadedVariables.length, '个变量值');
  } catch (error) {
    logger.warn('variable', '[GlobalMacroRegistry] 预加载变量值失败:', error.message);
  }
}

/**
 * 注册酒馆楼层宏
 * 使用新引擎 API，支持参数 {{酒馆楼层@1-5}}
 */
function registerChatFloorMacro() {
  if (registeredMacros.has(CHAT_FLOOR_MACRO_NAME)) return;

  try {
    macros.registry.registerMacro(CHAT_FLOOR_MACRO_NAME, {
      handler: (context) => {
        // 如果有参数，返回楼层内容；否则返回提示
        if (context.raw) {
          return getChatFloorContentForMacro(context.raw);
        }
        return '[请指定楼层范围，如 {{酒馆楼层@1-5}}]';
      },
      description: '引用聊天楼层内容',
      category: 'custom',
      unnamedArgs: 0, // 参数可选
    });
    registeredMacros.add(CHAT_FLOOR_MACRO_NAME);
    logger.debug('variable', '[GlobalMacroRegistry] 已注册酒馆楼层宏');
  } catch (error) {
    logger.warn('variable', '[GlobalMacroRegistry] 酒馆楼层宏注册失败:', error.message);
  }
}


/**
 * 注册所有用户定义的变量宏
 * @async
 */
async function registerAllVariableMacros() {
  if (!variableManagerRef) return;

  const variableManager = variableManagerRef();
  if (!variableManager.initialized) {
    await variableManager.init();
  }

  const variables = variableManager.getDefinitions();
  for (const variable of variables) {
    registerVariableMacro(variable.name);
  }
}

/**
 * 生成英文别名（用于宏注册）
 * @param {string} name - 变量名
 * @returns {string}
 */
function generateMacroAlias(name) {
  // 中文变量名转换为英文别名
  // 例如：复分析 -> dv_fu_fen_xi
  if (/^[\u4e00-\u9fa5]/.test(name)) {
    // 取拼音首字母 + 下划线 + 原文（保留中文用于调试）
    return `dv_${name}`;
  }
  return name;
}

/**
 * 注册单个变量宏
 * 使用新引擎 API，支持参数 {{变量@1-5}}
 * 同时注册英文别名以支持宏引擎的 ASCII 限制
 * @param {string} variableName - 变量名
 */
export function registerVariableMacro(variableName) {
  if (!variableName || registeredMacros.has(variableName)) return;

  try {
    const alias = generateMacroAlias(variableName);

    // 如果别名和原名不同（中文变量），注册别名
    if (alias !== variableName) {
      macros.registry.registerMacro(alias, {
        handler: (context) => {
          const rangeStr = context.raw || '';
          return getVariableContentForMacro(variableName, rangeStr);
        },
        description: `动态变量别名：${variableName}`,
        category: 'custom',
        unnamedArgs: 0,
      });
      registeredMacros.add(alias);
      logger.debug('variable', '[GlobalMacroRegistry] 已注册变量宏别名:', alias, '→', variableName);
    }

    // 也注册原名（可能用于预处理替换后的识别）
    macros.registry.registerMacro(variableName, {
      handler: (context) => {
        const rangeStr = context.raw || '';
        return getVariableContentForMacro(variableName, rangeStr);
      },
      description: `动态变量：${variableName}`,
      category: 'custom',
      unnamedArgs: 0,
    });
    registeredMacros.add(variableName);
    logger.debug('variable', '[GlobalMacroRegistry] 已注册变量宏:', variableName);
  } catch (error) {
    logger.warn('variable', '[GlobalMacroRegistry] 变量宏注册失败:', variableName, error.message);
  }
}

/**
 * 注销单个变量宏
 * 使用新引擎 API
 * @param {string} variableName - 变量名
 */
export function unregisterVariableMacro(variableName) {
  if (!variableName) return;

  registeredMacros.delete(variableName);
  macros.registry.unregisterMacro(variableName);
  logger.debug('variable', '[GlobalMacroRegistry] 已注销变量宏:', variableName);
}

/**
 * 刷新所有变量宏
 * 每次都重新注册，确保别名正确
 * @async
 */
export async function refreshVariableMacros() {
  if (!variableManagerRef) return;

  const variableManager = variableManagerRef();
  const variables = variableManager.getDefinitions();
  const currentNames = new Set(variables.map(v => v.name));

  // 1. 注销所有变量宏（包括别名）
  for (const name of registeredMacros) {
    if (name !== CHAT_FLOOR_MACRO_NAME) {
      unregisterVariableMacro(name);
    }
  }

  // 2. 重新注册所有变量（会同时注册原名和别名）
  for (const name of currentNames) {
    registerVariableMacro(name);
  }
}

// ============================================
// 宏预处理器（处理带参数的宏）
// ============================================

/**
 * 设置宏预处理器
 * 监听 TEXT_COMPLETION_SETTINGS_READY 事件，在发送请求前处理宏
 */
function setupMacroPreprocessor() {
  if (preprocessorSetup) return;

  // TEXT_COMPLETION_SETTINGS_READY 在准备生成参数时触发
  // params 对象包含 chat_completion_message_chunks 和 extension_prompts
  eventSource.on(event_types.TEXT_COMPLETION_SETTINGS_READY, (params) => {
    logger.debug('variable', '[GlobalMacroRegistry] TEXT_COMPLETION_SETTINGS_READY 事件触发');

    if (!params) {
      logger.debug('variable', '[GlobalMacroRegistry] params 为空，跳过预处理');
      return;
    }

    try {
      // 处理 extension_prompts（扩展提示词）
      if (Array.isArray(params.extension_prompts)) {
        preprocessMacrosInData(params.extension_prompts);
        logger.debug('variable', '[GlobalMacroRegistry] extension_prompts 预处理完成');
      }

      // 处理 chat_completion_message_chunks（消息块）
      if (Array.isArray(params.chat_completion_message_chunks)) {
        preprocessMacrosInData(params.chat_completion_message_chunks);
        logger.debug('variable', '[GlobalMacroRegistry] chat_completion_message_chunks 预处理完成');
      }

      logger.debug('variable', '[GlobalMacroRegistry] 宏预处理完成');
    } catch (error) {
      logger.error('variable', '[GlobalMacroRegistry] 预处理宏失败:', error.message);
    }
  });

  preprocessorSetup = true;
  logger.debug('variable', '[GlobalMacroRegistry] 宏预处理器已设置（使用 TEXT_COMPLETION_SETTINGS_READY）');
}

/**
 * 预处理数据中的带参数宏
 * @param {Object} data
 */
function preprocessMacrosInData(data) {
  if (!data) return;

  for (const key of Object.keys(data)) {
    if (typeof data[key] === 'string') {
      data[key] = preprocessMacros(data[key]);
    } else if (Array.isArray(data[key])) {
      data[key] = data[key].map(item => {
        if (typeof item === 'string') {
          return preprocessMacros(item);
        } else if (item && typeof item.content === 'string') {
          item.content = preprocessMacros(item.content);
        }
        return item;
      });
    }
  }
}

/**
 * 预处理文本中的宏
 * 将中文变量名转换为英文别名，让宏引擎能识别
 * @param {string} text
 * @returns {string}
 */
export function preprocessMacros(text) {
  if (!text || typeof text !== 'string') return text;

  // 匹配 {{变量名}} 或 {{变量名@参数}}
  const macroRegex = /\{\{([^{}@]+?)(?:@([^{}]+?))?\}\}/g;

  return text.replace(macroRegex, (match, macroName, params) => {
    const trimmedName = macroName.trim();
    const trimmedParams = (params || '').trim();

    // 酒馆楼层宏特殊处理（保留原样，宏引擎能识别）
    if (trimmedName === CHAT_FLOOR_MACRO_NAME) {
      return match; // 酒馆楼层宏直接保留原样
    }

    // 如果是中文变量名，转换为英文别名
    if (/^[\u4e00-\u9fa5]/.test(trimmedName)) {
      const alias = generateMacroAlias(trimmedName);
      if (trimmedParams) {
        return `{{${alias}@${trimmedParams}}}`;
      }
      return `{{${alias}}}`;
    }

    // 英文变量名保留原样
    return match;
  });
}


// ============================================
// 宏值获取函数
// ============================================

/**
 * 获取变量内容（用于宏替换）
 * 同步版本，确保数据已加载到缓存
 * @param {string} variableName
 * @param {string} rangeStr
 * @returns {string}
 */
function getVariableContentForMacro(variableName, rangeStr) {
  // [DEBUG] 添加调试日志，验证 handler 是否被调用
  console.log('[DEBUG] getVariableContentForMacro 被调用:', {
    variableName,
    rangeStr,
    chatId: getContext()?.chatId,
    registeredMacros: Array.from(registeredMacros)
  });

  try {
    const ctx = getContext();
    const chatId = ctx?.chatId;

    console.log('[DEBUG] chatId:', chatId, 'registeredMacros.has:', registeredMacros.has(variableName));

    if (!chatId || !registeredMacros.has(variableName)) {
      return '';
    }

    if (!variableManagerRef || !storageRef) {
      return '';
    }

    const variableManager = variableManagerRef();
    const variable = variableManager.getDefinitionByName(variableName);

    console.log('[DEBUG] 找到变量定义:', variable);

    if (!variable) {
      return '';
    }

    // 同步获取变量值（会先确保缓存加载）
    return getVariableValueSync(variable, chatId, rangeStr);
  } catch (error) {
    logger.error('variable', '[GlobalMacroRegistry] 获取变量内容失败:', variableName, error.message);
    return '';
  }
}

/**
 * 同步获取变量值（确保缓存已加载）
 * @param {Object} variable
 * @param {string} chatId
 * @param {string} rangeStr
 * @returns {string}
 */

function getVariableValueSync(variable, chatId, rangeStr) {
  if (!storageRef) {
    logger.warn('variable', '[GlobalMacroRegistry] storageRef 未初始化');
    return '';
  }

  if (!chatId) {
    logger.warn('variable', '[GlobalMacroRegistry] chatId 为空');
    return '';
  }

  const cachedData = storageRef.getCachedValueV2(variable.id, chatId);

  if (!cachedData) {
    logger.debug('variable', '[GlobalMacroRegistry] 缓存为空:', variable.name, 'id:', variable.id, 'chatId:', chatId);
    return '';
  }

  if (variable.mode === 'stack') {
    const entries = cachedData.entries || [];
    const visibleEntries = entries.filter(e => !e.hidden);

    if (rangeStr) {
      const ranges = parseRanges(rangeStr);
      return extractEntriesByRanges(visibleEntries, ranges);
    }

    return visibleEntries.map(e => e.content).join('\n\n');
  } else {
    return cachedData.currentValue || '';
  }
}

/**
 * 获取酒馆楼层内容
 * @param {string} rangeStr
 * @returns {string}
 */
function getChatFloorContentForMacro(rangeStr) {
  try {
    const ctx = getContext();
    const chat = ctx?.chat || [];

    if (chat.length === 0 || !rangeStr) return '';

    const ranges = parseRanges(rangeStr);
    const contents = [];

    for (const range of ranges) {
      let start = Number(range.start) || 1;
      let end = Number(range.end) || chat.length;
      start = Math.max(1, Math.min(start, chat.length));
      end = Math.max(1, Math.min(end, chat.length));
      if (start > end) [start, end] = [end, start];

      for (let i = start - 1; i < end; i++) {
        const msg = chat[i];
        if (msg) {
          const sender = msg.role === 'user' ? 'User' : (msg.name || 'Assistant');
          contents.push(`[${i + 1}楼] ${sender}: ${msg.message}`);
        }
      }
    }

    return contents.join('\n\n');
  } catch (error) {
    logger.error('variable', '[GlobalMacroRegistry] 获取酒馆楼层失败:', error.message);
    return '';
  }
}

// ============================================
// 范围解析工具函数
// ============================================

/**
 * 解析范围字符串
 * @param {string} rangeStr - 如 "1-5" 或 "1-3, 10-end"
 * @returns {Array<{start: number|string, end: number|string}>}
 */
function parseRanges(rangeStr) {
  if (!rangeStr) return [];

  const ranges = [];
  const parts = rangeStr.split(/,\s*/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = startStr === 'end' ? 'end' : parseInt(startStr, 10);
      const end = endStr === 'end' ? 'end' : parseInt(endStr, 10);

      if ((typeof start === 'number' && !isNaN(start)) || start === 'end') {
        ranges.push({ start, end: end || start });
      }
    } else {
      const num = parseInt(trimmed, 10);
      if (!isNaN(num)) {
        ranges.push({ start: num, end: num });
      }
    }
  }

  return ranges;
}

/**
 * 根据范围提取条目内容
 * @param {Array<{content: string}>} entries
 * @param {Array<{start: number|string, end: number|string}>} ranges
 * @returns {string}
 */
function extractEntriesByRanges(entries, ranges) {
  if (ranges.length === 0) {
    return entries.map(e => e.content).join('\n\n');
  }

  const result = [];

  for (const range of ranges) {
    let start = Number(range.start) || 1;
    let end = Number(range.end) || entries.length;

    start = Math.max(1, start);
    end = Math.min(entries.length, end);

    for (let i = start - 1; i < end; i++) {
      if (entries[i]) {
        result.push(entries[i].content);
      }
    }
  }

  return result.join('\n\n');
}

// ============================================
// 导出
// ============================================

// ============================================
// 导出
// ============================================

export { registeredMacros };

export default {
  registerAllGlobalMacros,
  registerVariableMacro,
  unregisterVariableMacro,
  refreshVariableMacros,
  preloadAllVariableValues,
  preprocessMacros
};
