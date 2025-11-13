/**
 * 时间处理工具
 * @module phone/utils/time-helper
 * 
 * @description
 * 提供时间格式化功能：
 * - 智能时间显示（页面UI用）
 * - AI提示词时间格式化（构建上下文用）
 */

/**
 * 格式化时间（智能显示，页面UI用）
 * @param {string|Date} timestamp - 时间戳
 * @returns {string} 格式化后的时间（"刚刚" | "5分钟前" | "今天 10:23" | "昨天" | "10月18日"）
 */
function formatTime(timestamp) {
  // TODO: 实现智能时间格式化
  // 参考【视觉设计】文档中的智能时间显示规则

  return ''; // TODO
}

/**
 * 格式化时间戳为AI可读格式（带智能分组）
 * 
 * @description
 * 规则：
 * - 跨天消息：返回 [2025-10-26]（作为分组标题）
 * - 当天最近消息：返回 [21:43]（每条都显示）
 * - 第一条消息：始终显示完整日期
 * 
 * @param {number} timestamp - Unix时间戳（秒）
 * @param {number|null} prevTimestamp - 上一条消息的时间戳（用于判断是否跨天）
 * @param {boolean} isFirst - 是否是第一条消息
 * @returns {string} 格式化的时间字符串
 * 
 * @example
 * // 第一条消息
 * formatTimeForAI(1729756800, null, true);
 * // 返回：'[2025-10-24]\n'
 * 
 * // 同一天内的消息
 * formatTimeForAI(1729756860, 1729756800, false);
 * // 返回：'[21:01] '
 * 
 * // 跨天消息
 * formatTimeForAI(1729843200, 1729756800, false);
 * // 返回：'[2025-10-25]\n'
 */
export function formatTimeForAI(timestamp, prevTimestamp = null, isFirst = false) {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  // 第一条消息：显示完整日期（作为分组标题）
  if (isFirst) {
    return `[${year}-${month}-${day}]\n`;
  }

  // 如果有上一条消息，检查是否跨天
  if (prevTimestamp !== null) {
    const prevDate = new Date(prevTimestamp * 1000);
    const isSameDay = date.getFullYear() === prevDate.getFullYear() &&
      date.getMonth() === prevDate.getMonth() &&
      date.getDate() === prevDate.getDate();

    // 跨天了：显示新的日期分组
    if (!isSameDay) {
      return `[${year}-${month}-${day}]\n`;
    }
  }

  // 同一天内：只显示时间（行内）
  return `[${hour}:${minute}] `;
}

/**
 * 格式化时间戳为标准格式（用于显示或存储）
 * 
 * @param {number} timestamp - Unix时间戳（秒）
 * @returns {string} 格式化的时间字符串 [2025-10-26 21:43]
 */
export function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 格式化时间为消息列表显示（智能显示，无括号）
 * 
 * @description
 * 规则：
 * - 今天：只显示时间（如 21:43）
 * - 其他天：显示月-日 时间（如 10-25 21:43）
 * 
 * @param {number} timestamp - Unix时间戳（秒）
 * @returns {string} 格式化的时间字符串（无括号）
 * 
 * @example
 * // 今天的消息
 * formatTimeForMessageList(1729756860);
 * // 返回：'21:43'
 * 
 * // 其他天的消息
 * formatTimeForMessageList(1729670460);
 * // 返回：'10-25 21:43'
 */
export function formatTimeForMessageList(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  // 判断是否是今天
  const isToday = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    // 今天：只显示时间
    return `${hour}:${minute}`;
  } else {
    // 其他天：显示月-日 时间
    return `${month}-${day} ${hour}:${minute}`;
  }
}

/**
 * 获取当前Unix时间戳（秒）
 * 
 * @returns {number} 当前时间的Unix时间戳（秒）
 */
export function getCurrentTimestamp() {
  return Math.floor(Date.now() / 1000);
}

export { formatTime };

