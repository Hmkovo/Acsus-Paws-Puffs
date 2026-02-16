/**
 * 未读徽章管理器
 * @module phone/messages/unread-badge-manager
 * 
 * @description
 * 统一管理未读消息计数和红点徽章UI更新
 * 
 * **设计理念：**
 * - 职责单一：专门负责"未读徽章"功能，不混入其他模块
 * - 事件驱动：数据变化通过事件触发UI更新，解耦数据层和UI层
 * - 自动化：监听消息事件自动增加未读，监听数据变化自动更新DOM
 * - 低耦合：其他模块只需调用简单API，不关心内部实现
 * 
 * **核心流程：**
 * 1. 收到消息 → incrementUnread() → 数据+1 → 触发 'unread-count-changed' 事件
 * 2. 打开聊天 → clearUnread() → 数据清零 → 触发 'unread-count-changed' 事件
 * 3. message-list-ui 监听 'unread-count-changed' → 自动更新DOM上的红点数字
 * 
 * **使用 listener-manager 管理生命周期：**
 * - 监听器自动注册、清理
 * - 防止内存泄漏
 * - 错误隔离
 */

import logger from '../../../logger.js';
import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { registerListener } from '../utils/listener-manager.js';

/**
 * 确保手机数据结构存在
 * @private
 */
function ensurePhoneData() {
    if (!extension_settings.acsusPawsPuffs) {
        extension_settings.acsusPawsPuffs = {};
    }
    if (!extension_settings.acsusPawsPuffs.phone) {
        extension_settings.acsusPawsPuffs.phone = {};
    }
    if (!extension_settings.acsusPawsPuffs.phone.unreadCounts) {
        extension_settings.acsusPawsPuffs.phone.unreadCounts = {};
    }
}

/**
 * 增加未读计数
 * 
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 增加指定联系人的未读消息计数，并触发 'unread-count-changed' 事件通知UI更新。
 * 通常在收到消息且聊天页面不可见时调用。
 * 
 * @example
 * // 在聊天页收到消息时
 * if (!isCurrentChatVisible) {
 *   incrementUnread(contactId);
 * }
 */
export function incrementUnread(contactId) {
    ensurePhoneData();

    const unreadCounts = extension_settings.acsusPawsPuffs.phone.unreadCounts;
    const prevCount = unreadCounts[contactId] || 0;
    const newCount = prevCount + 1;

    unreadCounts[contactId] = newCount;
    saveSettingsDebounced();

    logger.info('phone','[UnreadBadge] 未读计数+1:', contactId, `${prevCount} → ${newCount}`);

    // 触发事件通知UI更新
    triggerUnreadChangedEvent(contactId, newCount);
}

/**
 * 清除未读计数
 * 
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 清除指定联系人的未读消息计数（设为0），并触发 'unread-count-changed' 事件通知UI移除红点。
 * 通常在打开聊天页面时调用。
 * 
 * @example
 * // 打开聊天页时
 * clearUnread(contactId);
 */
export function clearUnread(contactId) {
    ensurePhoneData();

    const unreadCounts = extension_settings.acsusPawsPuffs.phone.unreadCounts;
    const prevCount = unreadCounts[contactId] || 0;

    if (prevCount > 0) {
        unreadCounts[contactId] = 0;
        saveSettingsDebounced();

        logger.info('phone','[UnreadBadge] 已清除未读计数:', contactId, `${prevCount} → 0`);

        // 触发事件通知UI移除红点
        triggerUnreadChangedEvent(contactId, 0);
    } else {
        logger.debug('phone','[UnreadBadge] 未读计数已为0，无需清除:', contactId);
    }
}

/**
 * 获取单个联系人的未读计数
 * 
 * @param {string} contactId - 联系人ID
 * @returns {number} 未读消息数
 * 
 * @description
 * 获取指定联系人的未读消息数量。
 * 
 * @example
 * const unread = getUnread(contactId);
 * if (unread > 0) {
 *   console.log(`有 ${unread} 条未读消息`);
 * }
 */
export function getUnread(contactId) {
    ensurePhoneData();
    return extension_settings.acsusPawsPuffs.phone.unreadCounts[contactId] || 0;
}

/**
 * 获取所有联系人的未读总数
 * 
 * @returns {number} 未读消息总数
 * 
 * @description
 * 计算所有联系人的未读消息总数，可用于显示在底部导航Tab徽章上。
 * 
 * @example
 * const total = getTotalUnread();
 * // 显示在"消息"Tab的徽章上
 * if (total > 0) {
 *   badgeElement.textContent = total;
 * }
 */
export function getTotalUnread() {
    ensurePhoneData();

    const unreadCounts = extension_settings.acsusPawsPuffs.phone.unreadCounts;
    let total = 0;

    for (const contactId in unreadCounts) {
        total += unreadCounts[contactId] || 0;
    }

    return total;
}

/**
 * 获取所有未读计数（用于调试或批量操作）
 * 
 * @returns {Object<string, number>} 所有联系人的未读计数对象 {contactId: count}
 * 
 * @description
 * 返回完整的未读计数映射表，主要用于调试或批量处理。
 * 
 * @example
 * const allUnread = getAllUnreadCounts();
 * console.log('未读列表:', allUnread);
 * // { "角色A": 5, "角色B": 2 }
 */
export function getAllUnreadCounts() {
    ensurePhoneData();
    return { ...extension_settings.acsusPawsPuffs.phone.unreadCounts };
}

/**
 * 触发未读计数变化事件
 * 
 * @private
 * @param {string} contactId - 联系人ID
 * @param {number} newCount - 新的未读计数
 * 
 * @description
 * 触发自定义事件 'unread-count-changed'，通知其他模块（如 message-list-ui）更新UI。
 * 
 * **事件格式：**
 * ```javascript
 * {
 *   detail: {
 *     contactId: 'xxx',  // 联系人ID
 *     count: 5           // 新的未读数
 *   }
 * }
 * ```
 */
function triggerUnreadChangedEvent(contactId, newCount) {
    logger.debug('phone','[UnreadBadge] 触发未读变化事件:', contactId, '计数:', newCount);

    document.dispatchEvent(new CustomEvent('unread-count-changed', {
        detail: { contactId, count: newCount }
    }));
}

// 注意：不再需要 initUnreadBadgeManager() 和全局监听器
// 未读计数的增加现在由 message-chat-data.js 的 saveChatMessage() 直接调用

/**
 * 绑定未读徽章UI更新监听器（在消息列表页渲染时调用）
 * 
 * @param {HTMLElement} listContainer - 消息列表容器
 * 
 * @description
 * 监听 'unread-count-changed' 事件，自动更新消息列表DOM上的红点徽章。
 * 使用 listener-manager 管理监听器生命周期，页面销毁时自动清理。
 * 
 * **调用时机：**
 * 在 message-list-ui.js 的 renderMessageList() 函数中调用
 * 
 * @example
 * // 在 message-list-ui.js 中
 * export async function renderMessageList() {
 *   const container = createContainer();
 *   // ...
 *   bindUnreadBadgeListener(listContainer);
 *   return container;
 * }
 */
export function bindUnreadBadgeListener(listContainer) {
    logger.debug('phone','[UnreadBadge] 绑定未读徽章UI更新监听器');

    const handleUnreadChanged = (e) => {
        const { contactId, count } = e.detail;
        logger.debug('phone','[UnreadBadge] 收到未读变化事件，更新UI:', contactId, '计数:', count);
        updateBadgeUI(contactId, count);
    };

    registerListener('unread-badge-ui', 'unread-count-changed', handleUnreadChanged, {
        element: document,
        description: '未读计数变化后自动更新UI徽章',
        once: false
    });
}

/**
 * 更新单个联系人的徽章UI
 * 
 * @private
 * @param {string} contactId - 联系人ID
 * @param {number} count - 未读数
 * 
 * @description
 * 根据未读数更新DOM上的红点徽章：
 * - count > 0: 创建或更新徽章，显示数字
 * - count = 0: 移除徽章
 */
function updateBadgeUI(contactId, count) {
    // 查找消息列表中的对应项
    const item = document.querySelector(`.msg-item[data-contact-id="${contactId}"]`);
    if (!item) {
        logger.debug('phone','[UnreadBadge] 未找到消息项DOM，跳过UI更新:', contactId);
        return;
    }

    const badgeEl = item.querySelector('.msg-item-badge');

    if (count > 0) {
        if (!badgeEl) {
            // 创建徽章
            const wrapper = item.querySelector('.msg-item-avatar-wrapper');
            if (wrapper) {
                const badge = document.createElement('div');
                badge.className = 'msg-item-badge';
                badge.textContent = String(count);
                wrapper.appendChild(badge);
                logger.debug('phone','[UnreadBadge] 已创建徽章:', contactId, '计数:', count);
            }
        } else {
            // 更新徽章数字
            badgeEl.textContent = String(count);
            logger.debug('phone','[UnreadBadge] 已更新徽章数字:', contactId, '计数:', count);
        }
    } else {
        // 移除徽章
        if (badgeEl) {
            badgeEl.remove();
            logger.debug('phone','[UnreadBadge] 已移除徽章:', contactId);
        }
    }
}
