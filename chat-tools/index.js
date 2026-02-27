/**
 * 聊天工具模块 - 入口文件
 *
 * @description
 * 聊天工具模块的入口，整合折叠、导航和隐藏楼层管理功能
 */

// ========================================
// 导入子模块
// ========================================

import { initChatToolsFold, bindFoldSettings } from './chat-tools-fold.js';
import { initChatToolsNav, bindNavSettings } from './chat-tools-nav.js';
import { initChatToolsHide } from './chat-tools-hide.js';
import logger from '../logger.js';

// ========================================
// 样式导入
// ========================================

// 通过 main.js 统一导入 CSS，这里只导出初始化函数
// import './chat-tools-fold.css';

// ========================================
// 初始化
// ========================================

/**
 * 初始化聊天工具模块
 */
export function initChatTools() {
  logger.info('chatTools', '初始化聊天工具模块');

  // 初始化折叠功能
  initChatToolsFold();

  // 初始化导航功能
  initChatToolsNav();

  // 初始化隐藏楼层管理
  initChatToolsHide();

  logger.info('chatTools', '聊天工具模块初始化完成');
}

/**
 * 绑定聊天工具折叠设置（在 settings.html 加载后调用）
 */
export { bindFoldSettings } from './chat-tools-fold.js';

/**
 * 绑定聊天工具导航设置（在 settings.html 加载后调用）
 */
export { bindNavSettings } from './chat-tools-nav.js';

/**
 * 绑定聊天工具隐藏楼层管理设置（在 settings.html 加载后调用）
 */
export { bindHideSettings } from './chat-tools-hide.js';
