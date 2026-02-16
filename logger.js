/**
 * 
 *             别抄了别抄了
 *               白沉给你当？
 * 
 * 
 * Acsus-Paws-Puffs 日志模块
 *
 * @description
 * 简单的日志系统，用于调试和错误追踪。
 * 通过 DEBUG_MODE 开关控制是否显示调试信息。
 */

// ============================================
// 配置区域
// ============================================

/**
 * 模块日志配置
 * 控制各功能模块的日志开关
 * 键 = 模块标识符，值 = true(开)/false(关)
 */
const MODULE_CONFIG = {
  'preset': false,    // 预设管理
  'font': false,       // 字体管理
  'simlife': false,   // 模拟人生
  'beautify': false,  // 美化系统
  'variable': false,  // 动态变量
  'phone': false,     // 手机
  'diary': false,     // 日记
  'visual': false,    // 可视化
  'archive': false,    // 聊天记录管理
  'chatTools': false,  // 聊天工具
};

/**
 * 日志前缀（方便识别是哪个插件的日志）
 */
const LOG_PREFIX = '[Acsus-Paws-Puffs]';

// ============================================
// 日志工具函数
// ============================================

/**
 * 获取当前时间戳
 *
 * @description
 * 用于在日志前添加时间戳，方便追踪问题发生的时间
 *
 * @returns {string} HH:MM:SS 格式的时间
 */
function getTimestamp() {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
}

/**
 * 日志记录器对象
 *
 * @description
 * 统一的日志输出接口，提供四个日志级别：debug, info, warn, error
 * 通过 MODULE_CONFIG 控制各模块日志开关
 *
 * @example
 * import logger from './logger.js';
 * logger.debug('font', '[FontManager.loadFonts] 开始加载字体', data);
 * logger.info('font', '已添加字体:', fontName);
 * logger.warn('font', '字体已存在:', fontName);
 * logger.error('font', '加载失败:', error.message);
 */
const logger = {
  /**
   * 调试日志（用于定位问题）
   *
   * @description
   * 用于记录函数入口、分支决策、中间状态等调试信息
   *
   * @param {string} module - 模块标识符（如 'font', 'preset', 'phone'）
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如对象、数组等）
   */
  debug(module, message, ...args) {
    if (MODULE_CONFIG[module]) {
      console.log(`[${getTimestamp()}] ${LOG_PREFIX} [${module}]`, message, ...args);
    }
  },

  /**
   * 普通信息日志（记录重要操作）
   *
   * @description
   * 用于记录增删改、状态变更、初始化等重要操作
   *
   * @param {string} module - 模块标识符
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如对象、数组等）
   */
  info(module, message, ...args) {
    if (MODULE_CONFIG[module]) {
      console.log(`[${getTimestamp()}] ${LOG_PREFIX} [${module}]`, message, ...args);
    }
  },

  /**
   * 警告日志（记录失败原因）
   *
   * @description
   * 用于记录操作失败、验证失败、边界条件等警告信息
   *
   * @param {string} module - 模块标识符
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如对象、数组等）
   */
  warn(module, message, ...args) {
    if (MODULE_CONFIG[module]) {
      console.warn(`[${getTimestamp()}] ${LOG_PREFIX} [${module}]`, message, ...args);
    }
  },

  /**
   * 错误日志（记录异常）
   *
   * @description
   * 用于记录 try-catch 捕获的异常和关键失败
   *
   * @param {string} module - 模块标识符
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如 Error 对象）
   */
  error(module, message, ...args) {
    if (MODULE_CONFIG[module]) {
      console.error(`[${getTimestamp()}] ${LOG_PREFIX} [${module}]`, message, ...args);
    }
  }
};

// ============================================
// 导出
// ============================================

export default logger;

