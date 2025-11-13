/**
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
 * 日志总开关
 * true = 显示所有日志（开发/调试时使用）
 * false = 关闭所有日志（上传 Git 前设为 false）
 */
const ENABLE_LOGGING = false;

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
 * 通过 ENABLE_LOGGING 开关控制所有日志的显示/隐藏
 * 
 * @example
 * import logger from './logger.js';
 * logger.debug('[ClassName.method] 开始处理', data);
 * logger.info('已添加字体:', fontName);
 * logger.warn('字体已存在:', fontName);
 * logger.error('操作失败:', error.message);
 */
const logger = {
  /**
   * 调试日志（用于定位问题）
   * 
   * @description
   * 用于记录函数入口、分支决策、中间状态等调试信息
   * 
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如对象、数组等）
   */
  debug(message, ...args) {
    if (ENABLE_LOGGING) {
      console.log(`[${getTimestamp()}] ${LOG_PREFIX} [DEBUG]`, message, ...args);
    }
  },

  /**
   * 普通信息日志（记录重要操作）
   * 
   * @description
   * 用于记录增删改、状态变更、初始化等重要操作
   * 
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如对象、数组等）
   */
  info(message, ...args) {
    if (ENABLE_LOGGING) {
      console.log(`[${getTimestamp()}] ${LOG_PREFIX} [INFO]`, message, ...args);
    }
  },

  /**
   * 警告日志（记录失败原因）
   * 
   * @description
   * 用于记录操作失败、验证失败、边界条件等警告信息
   * 
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如对象、数组等）
   */
  warn(message, ...args) {
    if (ENABLE_LOGGING) {
      console.warn(`[${getTimestamp()}] ${LOG_PREFIX} [WARN]`, message, ...args);
    }
  },

  /**
   * 错误日志（记录异常）
   * 
   * @description
   * 用于记录 try-catch 捕获的异常和关键失败
   * 
   * @param {string} message - 日志消息
   * @param {...any} args - 额外参数（如 Error 对象）
   */
  error(message, ...args) {
    if (ENABLE_LOGGING) {
      console.error(`[${getTimestamp()}] ${LOG_PREFIX} [ERROR]`, message, ...args);
    }
  }
};

// ============================================
// 导出
// ============================================

export default logger;

