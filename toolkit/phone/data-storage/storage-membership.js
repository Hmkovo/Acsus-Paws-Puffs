/**
 * 会员数据存储模块
 *
 * @description
 * 管理用户和角色的会员数据
 * 职责：
 * - 会员数据读取/更新
 * - 购买/续费/赠送会员
 * - 会员过期检查
 * - 触发事件通知（membership-data-changed）
 *
 * @module storage-membership
 */

import { saveData, loadData } from './storage-api.js';
import { loadContacts, saveContact } from '../contacts/contact-list-data.js';
import { stateManager } from '../utils/state-manager.js';
import logger from '../../../logger.js';

/**
 * 会员等级权重映射
 * @type {Object<string, number>}
 */
const MEMBERSHIP_LEVELS = {
    'none': 0,
    'vip': 1,
    'svip': 2,
    'annual-svip': 3
};

/**
 * 获取会员等级权重
 * @param {string} type - 会员类型
 * @returns {number} 等级权重（数字越大等级越高）
 */
function getMembershipLevel(type) {
    return MEMBERSHIP_LEVELS[type] || 0;
}

/**
 * 获取用户会员数据
 * @returns {Promise<Object>} 用户会员数据
 */
export async function getUserMembership() {
    // 🔥 修复：键名必须与 stateManager.set 保持一致（都用 'userMembership'）
    const data = await loadData('userMembership');

    // 返回默认值
    if (!data || typeof data !== 'object') {
        return {
            type: 'none',           // 'none' | 'vip' | 'svip' | 'annual-svip'
            expireTime: 0,          // 到期时间（秒级时间戳）
            queue: [],              // 待生效的会员队列 [{ type, duration }]
            purchaseHistory: []     // 购买历史
        };
    }

    // ✅ 兼容旧数据：如果没有queue字段，添加空数组
    if (!data.queue) {
        data.queue = [];
    }

    return data;
}

/**
 * 获取角色会员数据
 * @param {string} contactId - 角色ID
 * @returns {Promise<Object>} 角色会员数据
 */
export async function getCharacterMembership(contactId) {
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact || !contact.membership) {
        return {
            type: 'none',
            expireTime: 0,
            queue: [],
            purchaseHistory: []
        };
    }

    // ✅ 兼容旧数据：如果没有queue字段，添加空数组
    if (!contact.membership.queue) {
        contact.membership.queue = [];
    }

    return contact.membership;
}

/**
 * 为用户开通/续费会员（支持会员等级队列）
 *
 * @description
 * 会员等级队列逻辑：
 * 1. 高等级插队：收到SVIP时，如果当前是VIP，VIP剩余时间进队列，SVIP立即生效
 * 2. 低等级排队：收到VIP时，如果当前是SVIP，VIP进队列等待SVIP结束
 * 3. 同等级叠加：收到相同等级会员，直接延长到期时间
 *
 * @param {string} type - 会员类型 ('vip' | 'svip' | 'annual-svip')
 * @param {number} duration - 时长（天数）
 * @param {Object} [options] - 可选参数
 * @param {string} [options.from] - 来源（'self' 自己买 | contactId 角色送的）
 * @param {number} [options.price] - 价格
 * @param {string} [options.msgId] - 关联消息ID（用于回退）
 * @returns {Promise<Object>} 更新后的会员数据
 */
export async function grantUserMembership(type, duration, options = {}) {
    logger.debug('[MembershipStorage] 为用户开通会员:', type, duration, '天', options.msgId ? `msgId: ${options.msgId}` : '');

    const membership = await getUserMembership();

    // ✅ 持久化去重：检查是否已处理过该消息
    if (options.msgId && membership.purchaseHistory.some(h => h.msgId === options.msgId)) {
        logger.warn('[MembershipStorage] 该消息已处理过，跳过重复开通 msgId:', options.msgId);
        return membership;
    }

    const now = Math.floor(Date.now() / 1000);
    const currentLevel = getMembershipLevel(membership.type);
    const newLevel = getMembershipLevel(type);

    logger.debug('[MembershipStorage] 会员等级比较:', {
        当前会员: membership.type,
        当前等级: currentLevel,
        新会员: type,
        新等级: newLevel,
        当前到期时间: membership.expireTime,
        队列长度: membership.queue.length
    });

    // ✅ 情况1：当前无会员或已过期
    if (membership.type === 'none' || membership.expireTime < now) {
        logger.info('[MembershipStorage] 首次开通会员或已过期，直接开通');
        membership.type = type;
        membership.expireTime = now + duration * 24 * 3600;
        membership.queue = [];  // 清空队列
    }
    // ✅ 情况2：新会员等级 > 当前会员（高等级插队）
    else if (newLevel > currentLevel) {
        logger.info('[MembershipStorage] 高等级插队：新会员等级更高，立即生效');

        // 计算当前会员剩余天数
        const remainingSeconds = membership.expireTime - now;
        const remainingDays = Math.ceil(remainingSeconds / 86400);

        // 将当前会员加入队列（保留剩余时间）
        if (remainingDays > 0) {
            membership.queue.push({
                type: membership.type,
                duration: remainingDays,
                msgId: membership.grantedByMsgId  // 🔥 保存msgId用于撤销
            });
            logger.debug('[MembershipStorage] 当前会员加入队列:', membership.type, remainingDays, '天', 'msgId:', membership.grantedByMsgId);
        }

        // 新会员立即生效
        membership.type = type;
        membership.expireTime = now + duration * 24 * 3600;
    }
    // ✅ 情况3：新会员等级 < 当前会员（低等级排队）
    else if (newLevel < currentLevel) {
        logger.info('[MembershipStorage] 低等级排队：新会员等级较低，加入队列等待');

        // 🔥 不合并，直接加入队列（每个会员独立保存，UI显示时自动合并）
        membership.queue.push({
            type: type,
            duration: duration,
            msgId: options.msgId  // 🔥 保存msgId用于撤销
        });
        logger.debug('[MembershipStorage] 新会员已加入队列，队列长度:', membership.queue.length, 'msgId:', options.msgId);
    }
    // ✅ 情况4：同等级叠加（直接延长时间）
    else {
        logger.info('[MembershipStorage] 同等级叠加：直接延长到期时间');
        membership.expireTime += duration * 24 * 3600;
    }

    // ✅ 保存关联消息ID（用于回退时匹配）
    if (options.msgId) {
        membership.grantedByMsgId = options.msgId;
    }

    // 记录购买历史
    membership.purchaseHistory.push({
        id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        type,
        duration,
        price: options.price || 0,
        time: now,
        from: options.from || 'self',
        msgId: options.msgId || null
    });

    logger.info('[MembershipStorage] 用户会员已更新:', {
        当前会员: membership.type,
        到期时间: new Date(membership.expireTime * 1000).toLocaleString(),
        队列长度: membership.queue.length
    });

    // 保存数据并通知所有订阅者（自动保存到持久化 + 自动通知）
    // 🔥 修复：键名必须与 loadData/subscribe 保持一致（都用 'userMembership'）
    await stateManager.set('userMembership', membership, {
        action: options.from || 'grant',
        membershipType: type,
        duration: duration
    });

    return membership;
}

/**
 * 为角色开通/续费会员（支持会员等级队列）
 *
 * @description
 * 逻辑与grantUserMembership完全一致
 *
 * @param {string} contactId - 角色ID
 * @param {string} type - 会员类型 ('vip' | 'svip')
 * @param {number} duration - 时长（天数）
 * @param {Object} [options] - 可选参数
 * @param {string} [options.from] - 来源（'self' 角色自己买 | 'user' 用户送的）
 * @param {number} [options.price] - 价格
 * @param {string} [options.msgId] - 关联消息ID（用于回退）
 * @returns {Promise<Object>} 更新后的会员数据
 */
export async function grantCharacterMembership(contactId, type, duration, options = {}) {
    logger.debug('[MembershipStorage] 为角色开通会员:', contactId, type, duration, '天', options.msgId ? `msgId: ${options.msgId}` : '');

    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
        logger.error('[MembershipStorage] 角色不存在:', contactId);
        throw new Error('角色不存在');
    }

    // 获取或初始化会员数据
    if (!contact.membership) {
        contact.membership = {
            type: 'none',
            expireTime: 0,
            queue: [],
            purchaseHistory: []
        };
    }

    // ✅ 兼容旧数据
    if (!contact.membership.queue) {
        contact.membership.queue = [];
    }

    // ✅ 持久化去重：检查是否已处理过该消息
    if (options.msgId && contact.membership.purchaseHistory.some(h => h.msgId === options.msgId)) {
        logger.warn('[MembershipStorage] 该消息已处理过，跳过重复开通 msgId:', options.msgId);
        return contact.membership;
    }

    const now = Math.floor(Date.now() / 1000);
    const currentLevel = getMembershipLevel(contact.membership.type);
    const newLevel = getMembershipLevel(type);

    logger.debug('[MembershipStorage] 角色会员等级比较:', {
        角色: contact.name,
        当前会员: contact.membership.type,
        当前等级: currentLevel,
        新会员: type,
        新等级: newLevel
    });

    // ✅ 情况1：当前无会员或已过期
    if (contact.membership.type === 'none' || contact.membership.expireTime < now) {
        logger.info('[MembershipStorage] 角色首次开通会员或已过期，直接开通');
        contact.membership.type = type;
        contact.membership.expireTime = now + duration * 24 * 3600;
        contact.membership.queue = [];
    }
    // ✅ 情况2：高等级插队
    else if (newLevel > currentLevel) {
        logger.info('[MembershipStorage] 角色高等级插队');
        const remainingSeconds = contact.membership.expireTime - now;
        const remainingDays = Math.ceil(remainingSeconds / 86400);

        if (remainingDays > 0) {
            contact.membership.queue.push({
                type: contact.membership.type,
                duration: remainingDays,
                msgId: contact.membership.grantedByMsgId  // 🔥 保存msgId用于撤销
            });
        }

        contact.membership.type = type;
        contact.membership.expireTime = now + duration * 24 * 3600;
    }
    // ✅ 情况3：低等级排队
    else if (newLevel < currentLevel) {
        logger.info('[MembershipStorage] 角色低等级排队');

        // 🔥 不合并，直接加入队列（每个会员独立保存，UI显示时自动合并）
        contact.membership.queue.push({
            type: type,
            duration: duration,
            msgId: options.msgId  // 🔥 保存msgId用于撤销
        });
        logger.debug('[MembershipStorage] 角色新会员已加入队列，队列长度:', contact.membership.queue.length, 'msgId:', options.msgId);
    }
    // ✅ 情况4：同等级叠加
    else {
        logger.info('[MembershipStorage] 角色同等级叠加');
        contact.membership.expireTime += duration * 24 * 3600;
    }

    // ✅ 保存关联消息ID（用于回退时匹配）
    if (options.msgId) {
        contact.membership.grantedByMsgId = options.msgId;
    }

    // 记录购买历史
    contact.membership.purchaseHistory.push({
        id: `member_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
        type,
        duration,
        price: options.price || 0,
        time: now,
        from: options.from || 'self',
        msgId: options.msgId || null
    });

    logger.info('[MembershipStorage] 角色会员已更新:', {
        角色: contact.name,
        当前会员: contact.membership.type,
        到期时间: new Date(contact.membership.expireTime * 1000).toLocaleString(),
        队列长度: contact.membership.queue.length
    });

    // 保存联系人数据
    await saveContact(contact);

    // 触发通知（存储最近变化的角色会员信息）
    await stateManager.set('character-membership', {
        contactId,
        membership: contact.membership
    }, {
        action: options.from || 'grant',
        contactId,
        membershipType: type,
        duration: duration
    });

    return contact.membership;
}

/**
 * 检查会员是否过期（支持队列自动激活）
 *
 * @description
 * 如果当前会员过期，自动激活队列中的下一个会员
 * 如果队列为空，则重置为none
 *
 * @param {string} targetType - 目标类型 ('user' | 'character')
 * @param {string} [contactId] - 如果是角色，需要提供角色ID
 * @returns {Promise<boolean>} 是否有效（未过期）
 */
export async function checkMembershipExpiry(targetType, contactId = null) {
    const now = Math.floor(Date.now() / 1000);

    if (targetType === 'user') {
        const membership = await getUserMembership();

        if (membership.type !== 'none' && membership.expireTime < now) {
            logger.info('[MembershipStorage] 用户会员已过期，检查队列');

            // ✅ 检查队列中是否有待激活的会员
            if (membership.queue && membership.queue.length > 0) {
                const nextMembership = membership.queue.shift();  // 取出队列第一个
                logger.info('[MembershipStorage] 激活队列中的下一个会员:', nextMembership);

                membership.type = nextMembership.type;
                membership.expireTime = now + nextMembership.duration * 24 * 3600;
            } else {
                // 队列为空，重置为none
                logger.info('[MembershipStorage] 队列为空，重置为none');
                membership.type = 'none';
                membership.expireTime = 0;
            }

            // 保存数据并通知（会员过期，队列激活）
            // 🔥 修复：键名必须与 loadData/subscribe 保持一致（都用 'userMembership'）
            await stateManager.set('userMembership', membership, {
                action: 'expiry-check',
                activated: membership.type !== 'none'
            });
            return membership.type !== 'none';
        }

        return membership.type !== 'none';
    } else {
        if (!contactId) {
            logger.error('[MembershipStorage] 检查角色会员时未提供contactId');
            return false;
        }

        const contacts = await loadContacts();
        const contact = contacts.find(c => c.id === contactId);

        if (!contact || !contact.membership) {
            return false;
        }

        if (contact.membership.type !== 'none' && contact.membership.expireTime < now) {
            logger.info('[MembershipStorage] 角色会员已过期:', contact.name, '检查队列');

            // ✅ 检查队列中是否有待激活的会员
            if (contact.membership.queue && contact.membership.queue.length > 0) {
                const nextMembership = contact.membership.queue.shift();
                logger.info('[MembershipStorage] 激活队列中的下一个会员:', nextMembership);

                contact.membership.type = nextMembership.type;
                contact.membership.expireTime = now + nextMembership.duration * 24 * 3600;
            } else {
                // 队列为空，重置为none
                logger.info('[MembershipStorage] 队列为空，重置为none');
                contact.membership.type = 'none';
                contact.membership.expireTime = 0;
            }

            await saveContact(contact);

            // 触发通知（角色会员过期，队列激活）
            await stateManager.set('character-membership', {
                contactId,
                membership: contact.membership
            }, {
                action: 'expiry-check',
                contactId,
                activated: contact.membership.type !== 'none'
            });
            return contact.membership.type !== 'none';
        }

        return contact.membership.type !== 'none';
    }
}

/**
 * 检查所有会员是否过期（用于初始化时统一检查）
 * @returns {Promise<void>}
 */
export async function checkAllMembershipsExpiry() {
    logger.debug('[MembershipStorage] 检查所有会员是否过期');

    // 检查用户会员
    await checkMembershipExpiry('user');

    // 检查所有角色会员
    const contacts = await loadContacts();
    for (const contact of contacts) {
        if (contact.membership && contact.membership.type !== 'none') {
            await checkMembershipExpiry('character', contact.id);
        }
    }

    logger.info('[MembershipStorage] 会员过期检查完成');
}

/**
 * 撤销用户会员（回退专用）
 *
 * @description
 * 根据消息ID撤销用户会员，用于重roll时回退送会员操作
 * 逻辑：
 * 1. 检查当前会员和队列中是否有该msgId
 * 2. 优先删除队列中的会员（不影响当前）
 * 3. 删除当前会员时，激活队列中的下一个
 * 4. 同时删除purchaseHistory中的记录（重要：支持重新应用）
 *
 * @param {string} msgId - 关联消息ID
 * @returns {Promise<boolean>} 是否成功撤销
 */
export async function revokeUserMembership(msgId) {
    logger.debug('[MembershipStorage] 撤销用户会员，msgId:', msgId);

    const membership = await getUserMembership();

    // 检查会员是否由该消息开通
    if (!membership || membership.type === 'none') {
        logger.debug('[MembershipStorage] 用户无会员记录，跳过撤销');
        return false;
    }

    // 🔥 检查当前会员是否由该消息开通
    const isCurrentMembership = membership.grantedByMsgId === msgId;

    // 🔥 检查队列中是否有该消息的会员
    const queueIndex = membership.queue.findIndex(item => item.msgId === msgId);

    if (!isCurrentMembership && queueIndex === -1) {
        logger.debug('[MembershipStorage] 该消息ID既不是当前会员，也不在队列中，跳过撤销', msgId);
        return false;
    }

    // 🔥 情况1：如果是队列中的会员，直接从队列删除
    if (queueIndex !== -1) {
        const removedItem = membership.queue.splice(queueIndex, 1)[0];
        logger.info('[MembershipStorage] 从队列中删除会员:', removedItem.type, removedItem.duration, '天', 'msgId:', msgId);

        // 🔥 同时删除购买历史中的记录（重要：支持重新应用）
        const historyIndex = membership.purchaseHistory.findIndex(h => h.msgId === msgId);
        if (historyIndex !== -1) {
            membership.purchaseHistory.splice(historyIndex, 1);
            logger.debug('[MembershipStorage] 已删除购买历史记录');
        }

        // 保存数据并通知（从队列删除）
        // 🔥 修复：键名必须与 loadData/subscribe 保持一致（都用 'userMembership'）
        await stateManager.set('userMembership', membership, {
            action: 'revoke-queue',
            msgId: msgId
        });
        return true;
    }

    // 🔥 情况2：如果是当前会员，检查队列中是否有待激活的会员
    if (membership.queue && membership.queue.length > 0) {
        const nextMembership = membership.queue.shift();  // 取出队列第一个
        logger.info('[MembershipStorage] 撤销后激活队列中的下一个会员:', nextMembership);

        const now = Math.floor(Date.now() / 1000);
        membership.type = nextMembership.type;
        membership.expireTime = now + nextMembership.duration * 24 * 3600;
        membership.grantedByMsgId = nextMembership.msgId || null;  // 🔥 使用队列中的msgId
    } else {
        // 队列为空，重置为无会员
        logger.info('[MembershipStorage] 队列为空，重置为无会员');
        membership.type = 'none';
        membership.expireTime = 0;
        membership.grantedByMsgId = null;
    }

    // 🔥 删除购买历史中的记录（重要：支持重新应用）
    const historyIndex = membership.purchaseHistory.findIndex(h => h.msgId === msgId);
    if (historyIndex !== -1) {
        membership.purchaseHistory.splice(historyIndex, 1);
        logger.debug('[MembershipStorage] 已删除购买历史记录');
    }

    logger.info('[MembershipStorage] ✅ 已撤销用户会员，msgId:', msgId);

    // 保存数据并通知（撤销当前会员）
    // 🔥 修复：键名必须与 loadData/subscribe 保持一致（都用 'userMembership'）
    await stateManager.set('userMembership', membership, {
        action: 'revoke',
        msgId: msgId
    });

    return true;
}

/**
 * 撤销角色会员（回退专用）
 *
 * @description
 * 根据消息ID撤销角色会员，用于重roll时回退送会员操作
 * 逻辑：
 * 1. 检查当前会员和队列中是否有该msgId
 * 2. 优先删除队列中的会员（不影响当前）
 * 3. 删除当前会员时，激活队列中的下一个
 * 4. 同时删除purchaseHistory中的记录（重要：支持重新应用）
 *
 * @param {string} contactId - 角色ID
 * @param {string} msgId - 关联消息ID
 * @returns {Promise<boolean>} 是否成功撤销
 */
export async function revokeCharacterMembership(contactId, msgId) {
    logger.debug('[MembershipStorage] 撤销角色会员，contactId:', contactId, 'msgId:', msgId);

    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact || !contact.membership) {
        logger.debug('[MembershipStorage] 角色无会员记录，跳过撤销');
        return false;
    }

    // 🔥 检查当前会员是否由该消息开通
    const isCurrentMembership = contact.membership.grantedByMsgId === msgId;

    // 🔥 检查队列中是否有该消息的会员
    const queueIndex = contact.membership.queue.findIndex(item => item.msgId === msgId);

    if (!isCurrentMembership && queueIndex === -1) {
        logger.debug('[MembershipStorage] 该消息ID既不是角色当前会员，也不在队列中，跳过撤销', msgId);
        return false;
    }

    // 🔥 情况1：如果是队列中的会员，直接从队列删除
    if (queueIndex !== -1) {
        const removedItem = contact.membership.queue.splice(queueIndex, 1)[0];
        logger.info('[MembershipStorage] 从角色队列中删除会员:', removedItem.type, removedItem.duration, '天', 'msgId:', msgId);

        // 🔥 同时删除购买历史中的记录（重要：支持重新应用）
        const historyIndex = contact.membership.purchaseHistory.findIndex(h => h.msgId === msgId);
        if (historyIndex !== -1) {
            contact.membership.purchaseHistory.splice(historyIndex, 1);
            logger.debug('[MembershipStorage] 已删除角色购买历史记录');
        }

        await saveContact(contact);

        // 触发通知（从队列删除）
        await stateManager.set('character-membership', {
            contactId,
            membership: contact.membership
        }, {
            action: 'revoke-queue',
            contactId,
            msgId
        });
        return true;
    }

    // 🔥 情况2：如果是当前会员，检查队列中是否有待激活的会员
    if (contact.membership.queue && contact.membership.queue.length > 0) {
        const nextMembership = contact.membership.queue.shift();
        logger.info('[MembershipStorage] 撤销后激活队列中的下一个会员:', nextMembership);

        const now = Math.floor(Date.now() / 1000);
        contact.membership.type = nextMembership.type;
        contact.membership.expireTime = now + nextMembership.duration * 24 * 3600;
        contact.membership.grantedByMsgId = nextMembership.msgId || null;  // 🔥 使用队列中的msgId
    } else {
        // 队列为空，重置为无会员（保留购买历史和队列结构）
        logger.info('[MembershipStorage] 队列为空，重置角色为无会员');
        contact.membership.type = 'none';
        contact.membership.expireTime = 0;
        contact.membership.grantedByMsgId = null;
    }

    // 🔥 删除购买历史中的记录（重要：支持重新应用）
    const historyIndex = contact.membership.purchaseHistory.findIndex(h => h.msgId === msgId);
    if (historyIndex !== -1) {
        contact.membership.purchaseHistory.splice(historyIndex, 1);
        logger.debug('[MembershipStorage] 已删除角色购买历史记录');
    }

    await saveContact(contact);

    logger.info('[MembershipStorage] ✅ 已撤销角色会员，contactId:', contactId, 'msgId:', msgId);

    // 触发通知（撤销当前会员）
    await stateManager.set('character-membership', {
        contactId,
        membership: contact.membership
    }, {
        action: 'revoke',
        contactId,
        msgId
    });

    return true;
}

/**
 * 清空所有会员数据（测试用）
 *
 * @description
 * 同时清空：
 * 1. 用户和角色的会员状态数据
 * 2. 钱包交易记录中的会员相关礼物记录
 *
 * @returns {Promise<void>}
 */
export async function clearAllMemberships() {
    logger.warn('[MembershipStorage] 清空所有会员数据');

    // 1. 清空用户会员状态
    const userMembership = {
        type: 'none',
        expireTime: 0,
        queue: [],
        purchaseHistory: [],
        grantedByMsgId: null
    };
    // 注：不直接 saveData，而是通过 stateManager.set 统一保存和通知

    // 2. 清空所有角色会员状态
    const contacts = await loadContacts();
    for (const contact of contacts) {
        if (contact.membership) {
            contact.membership = {
                type: 'none',
                expireTime: 0,
                queue: [],
                purchaseHistory: []
            };
            await saveContact(contact);
        }
    }

    // 3. 清空钱包交易记录中的会员礼物记录
    try {
        const { getWalletData } = await import('./storage-wallet.js');
        const wallet = await getWalletData();

        // 过滤出所有会员相关的礼物记录（类型为gift且itemName包含"会员"）
        const beforeCount = wallet.transactions.length;
        wallet.transactions = wallet.transactions.filter(t => {
            // 保留非礼物类型的交易
            if (t.type !== 'gift') return true;
            // 保留不包含"会员"的礼物
            if (!t.itemName || !t.itemName.includes('会员')) return true;
            // 删除会员礼物记录
            return false;
        });
        const afterCount = wallet.transactions.length;
        const deletedCount = beforeCount - afterCount;

        // 保存清理后的钱包数据
        await saveData('wallet', wallet);
        logger.info(`[MembershipStorage] 已清空 ${deletedCount} 条会员交易记录`);
    } catch (error) {
        logger.error('[MembershipStorage] 清空会员交易记录失败:', error);
    }

    logger.info('[MembershipStorage] 所有会员数据已清空（包括交易记录）');

    // 触发用户会员变化通知（刷新会员中心、用户主页）
    // 🔥 修复：键名必须与 loadData/subscribe 保持一致（都用 'userMembership'）
    await stateManager.set('userMembership', userMembership, {
        action: 'clear-all'
    });

    // 触发角色会员变化通知（刷新所有联系人卡片）
    await stateManager.set('character-membership', {
        contactId: null,  // null 表示影响所有角色
        membership: null
    }, {
        action: 'clear-all',
        contactId: null
    });

    // 注：钱包交易记录已通过 saveData('wallet') 保存，不需要重复触发 wallet 事件
}

