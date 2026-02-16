/**
 * 聊天记录管理中心 - 主入口
 *
 * 职责：
 * - 初始化聊天记录系统
 * - 提供打开/关闭界面的接口
 * - 注册扩展菜单入口
 *
 * 依赖：
 * - chat-archive-ui.js
 * - chat-archive-data.js
 */

import logger from '../logger.js';
import { renderArchiveFrame, closeArchiveUI as closeUI } from './chat-archive-ui.js';
import { initMessageInject, stopMessageInject } from './chat-archive-inject.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';

// ========================================
// [CONST] 常量定义
// ========================================
const EXT_ID = 'acsusPawsPuffs';

/** @type {{ enabled: boolean }} */
let archiveSystem = {
    enabled: false
};

/**
 * 初始化聊天记录系统
 *
 * @async
 * @returns {Promise<Object>} 返回系统状态对象
 */
export async function initChatArchive() {
    logger.info('archive', '[ChatArchive] 开始初始化聊天记录系统');

    try {
        // 从设置中读取启用状态
        const settings = extension_settings[EXT_ID]?.chatArchive || {};
        archiveSystem.enabled = settings.enabled ?? false;

        // 如果功能启用，注册扩展菜单和消息按钮
        if (archiveSystem.enabled) {
            registerMenuEntry();
            // 在 APP_READY 后初始化消息按钮注入
            eventSource.on(event_types.APP_READY, () => {
                initMessageInject();
            });
        }

        logger.info('archive', '[ChatArchive] 聊天记录系统初始化完成');
        return archiveSystem;
    } catch (error) {
        logger.error('archive', '[ChatArchive] 聊天记录系统初始化失败:', error);
        throw error;
    }
}

/**
 * 获取聊天记录系统实例
 * @returns {{ enabled: boolean }}
 */
export function getChatArchiveSystem() {
    return archiveSystem;
}

/**
 * 注册扩展菜单入口
 *
 * @description
 * 在 extensionsMenu 中添加【聊天记录】选项
 * 点击后打开聊天记录管理界面
 */
function registerMenuEntry() {
    eventSource.on(event_types.APP_READY, () => {
        try {
            logger.debug('archive', '[ChatArchive] 注册扩展菜单入口');

            // 获取扩展菜单容器
            const extensionsMenu = document.querySelector('#extensionsMenu');
            if (!extensionsMenu) {
                logger.warn('archive', '[ChatArchive] 找不到扩展菜单容器');
                return;
            }

            // 检查是否已存在
            if (document.getElementById('chat-archive-menu-entry')) {
                logger.debug('archive', '[ChatArchive] 菜单入口已存在，跳过');
                return;
            }

            // 创建【聊天记录】菜单项
            const menuItem = document.createElement('div');
            menuItem.className = 'list-group-item flex-container flexGap5';
            menuItem.id = 'chat-archive-menu-entry';
            menuItem.innerHTML = `
                <div class="fa-solid fa-bookmark extensionsMenuExtensionButton"></div>
                <span>聊天记录</span>
            `;

            // 绑定点击事件
            menuItem.addEventListener('click', () => {
                logger.info('archive', '[ChatArchive] 用户从扩展菜单打开聊天记录');
                openArchiveUI();
            });

            // 添加到菜单
            extensionsMenu.appendChild(menuItem);

            logger.info('archive', '[ChatArchive] 扩展菜单入口已注册');
        } catch (error) {
            logger.error('archive', '[ChatArchive] 注册扩展菜单失败:', error);
        }
    });
}

/**
 * 打开聊天记录管理界面
 *
 * @returns {void}
 */
export function openArchiveUI() {
    logger.info('archive', '[ChatArchive] 打开聊天记录界面');

    // 检查是否已经打开
    const existingOverlay = document.querySelector('.chat-archive-overlay');
    if (existingOverlay) {
        logger.warn('archive', '[ChatArchive] 界面已经打开，忽略重复调用');
        return;
    }

    try {
        // 渲染框架
        const archiveOverlay = renderArchiveFrame();

        // 添加到页面
        document.body.appendChild(archiveOverlay);

        logger.info('archive', '[ChatArchive] 聊天记录界面已打开');
    } catch (error) {
        logger.error('archive', '[ChatArchive] 打开界面失败:', error);
        throw error;
    }
}

/**
 * 关闭聊天记录管理界面
 *
 * @returns {void}
 */
export function closeArchiveUI() {
    logger.info('archive', '[ChatArchive] 关闭聊天记录界面');
    closeUI();
}

/**
 * 启用聊天记录系统
 *
 * @async
 */
export async function enableChatArchive() {
    archiveSystem.enabled = true;

    // 确保设置对象存在
    if (!extension_settings[EXT_ID]) {
        extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID].chatArchive) {
        extension_settings[EXT_ID].chatArchive = {};
    }

    extension_settings[EXT_ID].chatArchive.enabled = true;
    saveSettingsDebounced();

    // 注册菜单入口（如果还没注册）
    showMenuEntry();

    // 启动消息按钮注入
    initMessageInject();

    logger.info('archive', '[ChatArchive] 聊天记录系统已启用');
}

/**
 * 禁用聊天记录系统
 */
export function disableChatArchive() {
    archiveSystem.enabled = false;

    // 确保设置对象存在
    if (!extension_settings[EXT_ID]) {
        extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID].chatArchive) {
        extension_settings[EXT_ID].chatArchive = {};
    }

    extension_settings[EXT_ID].chatArchive.enabled = false;
    saveSettingsDebounced();

    // 关闭界面（如果已打开）
    const existingOverlay = document.querySelector('.chat-archive-overlay');
    if (existingOverlay) {
        closeArchiveUI();
    }

    // 停止消息按钮注入
    stopMessageInject();

    hideMenuEntry();
    logger.info('archive', '[ChatArchive] 聊天记录系统已禁用');
}

/**
 * 显示扩展菜单中的聊天记录图标
 */
export function showMenuEntry() {
    try {
        let menuItem = document.getElementById('chat-archive-menu-entry');

        // 如果菜单项不存在，创建它
        if (!menuItem) {
            const extensionsMenu = document.querySelector('#extensionsMenu');
            if (extensionsMenu) {
                menuItem = document.createElement('div');
                menuItem.className = 'list-group-item flex-container flexGap5';
                menuItem.id = 'chat-archive-menu-entry';
                menuItem.innerHTML = `
                    <div class="fa-solid fa-bookmark extensionsMenuExtensionButton"></div>
                    <span>聊天记录</span>
                `;
                menuItem.addEventListener('click', () => {
                    openArchiveUI();
                });
                extensionsMenu.appendChild(menuItem);
            }
        }

        if (menuItem) {
            menuItem.style.display = '';
            logger.debug('archive', '[ChatArchive] 扩展菜单图标已显示');
        }
    } catch (error) {
        logger.error('archive', '[ChatArchive] 显示菜单图标失败:', error);
    }
}

/**
 * 隐藏扩展菜单中的聊天记录图标
 */
export function hideMenuEntry() {
    try {
        const menuItem = document.getElementById('chat-archive-menu-entry');
        if (menuItem) {
            menuItem.style.display = 'none';
            logger.debug('archive', '[ChatArchive] 扩展菜单图标已隐藏');
        }
    } catch (error) {
        logger.error('archive', '[ChatArchive] 隐藏菜单图标失败:', error);
    }
}
