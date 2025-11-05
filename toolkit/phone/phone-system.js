/**
 * 手机系统 - 主系统类
 * 
 * @description
 * 完全照搬日记的 DiarySystem 结构
 * 负责协调各个子模块，提供统一的API接口
 * 
 * @module PhoneSystem
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import logger from '../../logger.js';
import { PhoneAPI } from './ai-integration/ai-send-controller.js';

// ========================================
// [CONST] 常量定义
// ========================================
const EXT_ID = 'acsusPawsPuffs';
const MODULE_NAME = 'phone';

// ========================================
// [CORE] 手机系统主类
// ========================================

/**
 * 手机系统主类
 * 
 * @class PhoneSystem
 * @description
 * 负责协调各个子模块，提供统一的API接口
 */
export class PhoneSystem {
  /**
   * 创建手机系统实例
   */
  constructor() {
    /**
     * API管理器
     * @type {PhoneAPI}
     */
    this.api = null;

    /**
     * 是否已初始化
     * @type {boolean}
     */
    this.initialized = false;

    /**
     * 功能是否启用
     * @type {boolean}
     */
    this.enabled = false;
  }

  /**
   * 初始化手机系统
   * 
   * @async
   */
  async init() {
    if (this.initialized) {
      logger.warn('[PhoneSystem] 已经初始化过了');
      return;
    }

    logger.info('[PhoneSystem] 开始初始化...');

    try {
      // 加载设置
      this.loadSettings();

      // 如果功能未启用，跳过完整初始化
      if (!this.enabled) {
        logger.info('[PhoneSystem] 功能未启用，跳过完整初始化');
        this.initialized = true;
        return;
      }

      // 初始化子模块
      this.api = new PhoneAPI();

      await this.api.init();

      // 注册酒馆宏（使手机数据可在酒馆提示词中使用）
      const { registerPhoneMacros } = await import('./utils/tavern-macros.js');
      await registerPhoneMacros();
      logger.info('[PhoneSystem] 已注册酒馆宏');

      this.initialized = true;
      logger.info('[PhoneSystem] 初始化完成');
    } catch (error) {
      logger.error('[PhoneSystem] 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载设置
   */
  loadSettings() {
    if (!extension_settings[EXT_ID]) {
      extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME]) {
      extension_settings[EXT_ID][MODULE_NAME] = {
        enabled: true
      };
    }

    this.enabled = extension_settings[EXT_ID][MODULE_NAME].enabled !== false;

    logger.debug('[PhoneSystem] 设置已加载，启用状态:', this.enabled);
  }
}

// ========================================
// [EXPORT] 导出
// ========================================

/**
 * 全局手机系统实例
 * @type {PhoneSystem}
 */
let phoneSystemInstance = null;

/**
 * 初始化手机系统
 * 
 * @async
 * @returns {Promise<PhoneSystem>}
 */
export async function initPhoneSystem() {
  if (!phoneSystemInstance) {
    phoneSystemInstance = new PhoneSystem();
    await phoneSystemInstance.init();
  }
  return phoneSystemInstance;
}

/**
 * 获取手机系统实例
 * 
 * @returns {PhoneSystem|null}
 */
export function getPhoneSystem() {
  return phoneSystemInstance;
}

