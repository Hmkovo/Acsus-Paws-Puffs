/**
 * 正则配置数据管理模块
 * @module phone/data-storage/storage-regex
 * 
 * @description
 * 管理每个角色的正则脚本配置（从酒馆同步）
 * 数据存储在 extension_settings.acsusPawsPuffs.phone.contactRegex[contactId]
 * 
 * 数据结构：
 * {
 *   syncTime: 1732618440000,  // 同步时间戳
 *   selectedPreset: {          // 用户选择的预设
 *     apiId: 'openai',
 *     presetName: 'Default'
 *   },
 *   scripts: {
 *     global: [...],           // 全局正则脚本
 *     scoped: [...],           // 角色专属正则脚本
 *     preset: [...]            // 预设正则脚本
 *   }
 * }
 */

import logger from '../../../logger.js';
import { saveSettingsDebounced, characters, this_chid } from '../../../../../../../script.js';
import { extension_settings } from '../../../../../../../scripts/extensions.js';
import { regexFromString } from '../../../../../../../scripts/utils.js';

/**
 * 获取角色的正则配置
 * 
 * @param {string} contactId - 联系人ID（如 'tavern_Wade'）
 * @returns {Object|null} 正则配置对象，如果不存在返回 null
 */
export function getContactRegexConfig(contactId) {
  if (!extension_settings.acsusPawsPuffs?.phone?.contactRegex) {
    return null;
  }
  
  return extension_settings.acsusPawsPuffs.phone.contactRegex[contactId] || null;
}

/**
 * 保存角色的正则配置
 * 
 * @param {string} contactId - 联系人ID
 * @param {Object} config - 正则配置对象
 */
export function saveContactRegexConfig(contactId, config) {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.contactRegex) {
    extension_settings.acsusPawsPuffs.phone.contactRegex = {};
  }
  
  extension_settings.acsusPawsPuffs.phone.contactRegex[contactId] = config;
  saveSettingsDebounced();
  
  logger.debug('[RegexStorage] 正则配置已保存:', contactId);
}

/**
 * 删除角色的正则配置
 * 
 * @param {string} contactId - 联系人ID
 */
export function deleteContactRegexConfig(contactId) {
  if (!extension_settings.acsusPawsPuffs?.phone?.contactRegex) {
    return;
  }
  
  delete extension_settings.acsusPawsPuffs.phone.contactRegex[contactId];
  saveSettingsDebounced();
  
  logger.debug('[RegexStorage] 正则配置已删除:', contactId);
}

/**
 * 同步角色的正则配置（从酒馆读取）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} [selectedApiId] - 用户选择的API ID（用于读取预设正则）
 * @param {string} [selectedPresetName] - 用户选择的预设名称
 * @returns {Promise<Object>} 同步后的配置对象
 * @throws {Error} 如果同步失败
 * 
 * @description
 * 1. 读取全局正则（extension_settings.regex）
 * 2. 读取角色正则（character.data.extensions.regex_scripts）
 * 3. 读取预设正则（通过 PresetManager）
 */
export async function syncContactRegex(contactId, selectedApiId = null, selectedPresetName = null) {
  logger.info('[RegexStorage] 开始同步正则配置:', contactId);
  
  try {
    // 动态导入酒馆正则引擎
    const { getScriptsByType, SCRIPT_TYPES } = await import('../../../../../../../scripts/extensions/regex/engine.js');
    const { getPresetManager } = await import('../../../../../../../scripts/preset-manager.js');
    
    // 1. 读取全局正则
    const globalScripts = getScriptsByType(SCRIPT_TYPES.GLOBAL);
    logger.debug('[RegexStorage] 全局正则脚本数量:', globalScripts.length);
    
    // 2. 读取角色正则（不需要切换角色，直接从 characters 数组读取）
    const scopedScripts = await getCharacterScopedScripts(contactId);
    logger.debug('[RegexStorage] 角色正则脚本数量:', scopedScripts.length);
    
    // 3. 读取预设正则（如果用户指定了预设）
    let presetScripts = [];
    let presetInfo = null;
    
    if (selectedApiId && selectedPresetName) {
      const presetManager = getPresetManager(selectedApiId);
      if (presetManager) {
        presetScripts = presetManager.readPresetExtensionField({ path: 'regex_scripts' }) || [];
        presetInfo = {
          apiId: selectedApiId,
          presetName: selectedPresetName
        };
        logger.debug('[RegexStorage] 预设正则脚本数量:', presetScripts.length);
      } else {
        logger.warn('[RegexStorage] 找不到预设管理器:', selectedApiId);
      }
    }
    
    // 构建配置对象
    const config = {
      syncTime: Date.now(),
      selectedPreset: presetInfo,
      scripts: {
        global: JSON.parse(JSON.stringify(globalScripts)),      // 深拷贝避免引用
        scoped: JSON.parse(JSON.stringify(scopedScripts)),
        preset: JSON.parse(JSON.stringify(presetScripts))
      }
    };
    
    // 保存配置
    saveContactRegexConfig(contactId, config);
    
    logger.info('[RegexStorage] 同步完成，共', 
      globalScripts.length + scopedScripts.length + presetScripts.length, '个脚本');
    
    return config;
    
  } catch (error) {
    logger.error('[RegexStorage] 同步失败:', error);
    throw new Error('同步正则配置失败：' + error.message);
  }
}

/**
 * 获取角色的局部正则脚本（Scoped）
 * 
 * @private
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<Array>} 角色正则脚本数组
 * 
 * @description
 * 从 characters 数组中读取，不需要切换角色
 */
async function getCharacterScopedScripts(contactId) {
  try {
    // 从 contactId 提取角色名
    const charName = contactId.replace(/^tavern_/, '');
    
    // 在酒馆角色列表中查找
    const character = characters.find(c => {
      const avatar = c.avatar?.replace(/\.[^/.]+$/, ''); // 去掉扩展名
      return avatar === charName;
    });
    
    if (!character) {
      logger.warn('[RegexStorage] 未找到对应的角色:', charName);
      return [];
    }
    
    // 读取角色的正则脚本
    const scopedScripts = character.data?.extensions?.regex_scripts;
    
    if (!Array.isArray(scopedScripts)) {
      logger.debug('[RegexStorage] 角色没有局部正则');
      return [];
    }
    
    return scopedScripts;
    
  } catch (error) {
    logger.error('[RegexStorage] 获取角色正则失败:', error);
    return [];
  }
}

/**
 * 应用正则脚本处理文本
 * 
 * @param {string} text - 原始文本
 * @param {string} contactId - 联系人ID
 * @returns {string} 处理后的文本
 * 
 * @description
 * 只应用 only_format_prompt 为 true 的正则（发送给AI的处理）
 * 按优先级应用：Global → Scoped → Preset
 */
export function applyContactRegex(text, contactId) {
  const config = getContactRegexConfig(contactId);
  
  if (!config || !config.scripts) {
    logger.debug('[RegexStorage] 该角色没有正则配置，跳过处理:', contactId);
    return text;
  }
  
  let result = text;
  
  // 合并所有脚本（按优先级：Custom → Global → Preset → Character）
  // 自定义正则最先执行，因为用户自定义的通常是针对性最强的
  const allScripts = [
    ...(config.scripts.custom || []),
    ...(config.scripts.global || []),
    ...(config.scripts.preset || []),
    ...(config.scripts.character || [])
  ];
  
  // 只应用"仅格式提示词"的脚本（发送给AI时处理）
  const promptScripts = allScripts.filter(s => 
    !s.disabled && s.only_format_prompt
  );
  
  if (promptScripts.length === 0) {
    logger.debug('[RegexStorage] 没有需要应用的正则脚本');
    return result;
  }
  
  logger.debug('[RegexStorage] 应用', promptScripts.length, '个正则脚本');
  logger.debug('[RegexStorage] 待应用脚本:', promptScripts.map(s => s.scriptName).join(', '));
  
  // 应用每个脚本
  for (const script of promptScripts) {
    try {
      result = runSingleRegexScript(script, result);
    } catch (error) {
      logger.error('[RegexStorage] 正则脚本执行失败:', script.scriptName, error);
    }
  }
  
  return result;
}

/**
 * 执行单个正则脚本
 * 
 * @private
 * @param {Object} script - 正则脚本对象
 * @param {string} text - 输入文本
 * @returns {string} 处理后的文本
 * 
 * @description
 * 使用酒馆的 regexFromString 函数解析正则表达式
 * 支持 /pattern/flags 格式（如 /abc/gi）和纯字符串格式
 */
function runSingleRegexScript(script, text) {
  if (!script.findRegex) return text;
  
  try {
    // 使用酒馆的正则解析函数（支持 /pattern/flags 格式）
    const regex = regexFromString(script.findRegex);
    
    if (!regex) {
      logger.warn('[RegexStorage] 无效的正则表达式:', script.scriptName, script.findRegex);
      return text;
    }
    
    // 先计算匹配次数（用于日志）
    const matches = text.match(regex);
    const matchCount = matches ? matches.length : 0;
    
    // 执行替换
    let result = text.replace(regex, script.replaceString || '');
    
    logger.debug(`[RegexStorage] 应用正则: ${script.scriptName}, 模式: ${script.findRegex.substring(0, 50)}..., 匹配次数: ${matchCount}`);
    
    // 处理 trimStrings（移除多余空行）
    if (script.trimStrings && Array.isArray(script.trimStrings)) {
      script.trimStrings.forEach(trimStr => {
        result = result.replaceAll(trimStr, '');
      });
    }
    
    return result;
    
  } catch (error) {
    logger.error('[RegexStorage] 正则表达式无效:', script.findRegex, error);
    return text;
  }
}
