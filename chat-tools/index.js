/**
 * 聊天工具模块 - 入口文件
 *
 * @description
 * 聊天工具模块的入口，整合折叠、导航和隐藏楼层管理功能
 */

// ========================================
// 导入子模块
// ========================================

import { initChatToolsFold, bindFoldSettings, disableChatToolsFold } from './chat-tools-fold.js';
import { initChatToolsNav, bindNavSettings, disableChatToolsNav } from './chat-tools-nav.js';
import { initChatToolsHide, disableChatToolsHide } from './chat-tools-hide.js';
import logger from '../logger.js';
import { extension_settings } from '../../../../extensions.js';

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
 *
 * @description
 * 按子功能开关做独立初始化守卫，避免未启用模块注册全局监听器。
 * 这样在功能关闭时不会驻留无效监听，减少副作用和性能损耗。
 *
 * @returns {void}
 * @throws {Error} 当子模块初始化内部抛错时，异常会向上冒泡
 * @example
 * initChatTools();
 */
export function initChatTools() {
    logger.info('chatTools', '初始化聊天工具模块');

    const chatToolsSettings = extension_settings?.['Acsus-Paws-Puffs']?.chatTools || {};
    const foldEnabled = chatToolsSettings?.fold?.enabled === true;
    const navEnabled = chatToolsSettings?.['chat-tools-nav-enabled'] === true;
    const hideEnabled = chatToolsSettings?.hideEnabled === true;

    if (foldEnabled) {
        initChatToolsFold();
    } else {
        logger.debug('chatTools', '[Index.initChatTools] Fold 未启用，跳过初始化');
    }

    if (navEnabled) {
        initChatToolsNav();
    } else {
        logger.debug('chatTools', '[Index.initChatTools] Nav 未启用，跳过初始化');
    }

    if (hideEnabled) {
        initChatToolsHide();
    } else {
        logger.debug('chatTools', '[Index.initChatTools] Hide 未启用，跳过初始化');
    }

    logger.info('chatTools', '聊天工具模块初始化完成');
}

/**
 * 统一禁用聊天工具子模块
 *
 * @description
 * 由总入口调用，确保 Fold/Nav/Hide 的全局监听和 DOM 一次性清理干净。
 *
 * @returns {void}
 * @throws {Error} 当子模块 disable 抛错时，异常会向上冒泡
 * @example
 * disableChatTools();
 */
export function disableChatTools() {
    disableChatToolsFold();
    disableChatToolsNav();
    disableChatToolsHide();
    logger.info('chatTools', '[Index.disableChatTools] 聊天工具子模块已全部禁用');
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
