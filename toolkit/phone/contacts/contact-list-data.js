/**
 * 联系人数据管理
 * @module phone/contacts/contact-list-data
 */

import logger from '../../../logger.js';
import { loadData, saveData } from '../data-storage/storage-api.js';

const CONTACTS_KEY = 'contacts';

/**
 * 加载所有联系人
 * 
 * @description
 * 从存储中加载联系人列表，如果不存在则返回空数组
 * 
 * @async
 * @returns {Promise<Array>} 联系人列表
 * @example
 * const contacts = await loadContacts();
 * // [{ id: 'tavern_alice', name: 'Alice', avatar: 'alice.png', ... }]
 */
async function loadContacts() {
  logger.debug('[ContactData] 加载联系人列表');

  try {
    const data = await loadData(CONTACTS_KEY);

    // 如果数据不存在，返回空数组
    if (!data || !Array.isArray(data)) {
      logger.debug('[ContactData] 联系人列表为空，返回空数组');
      return [];
    }

    logger.info('[ContactData] 成功加载联系人列表，共', data.length, '个联系人');
    return data;
  } catch (error) {
    logger.error('[ContactData] 加载联系人列表失败:', error);
    return [];
  }
}

/**
 * 保存联系人
 * 
 * @description
 * 保存单个联系人到存储，如果联系人已存在则更新，
 * 不存在则添加
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {string} contact.id - 联系人ID
 * @param {string} contact.name - 联系人名称
 * @param {string} contact.avatar - 头像文件名
 * @param {string} [contact.signature] - 个性签名
 * @param {string} [contact.source] - 来源（'tavern' 或 'manual'）
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveContact(contact) {
  logger.debug('[ContactData] 保存联系人:', contact.id);

  try {
    // 验证必需字段
    if (!contact.id || !contact.name) {
      logger.warn('[ContactData] 联系人缺少必需字段:', contact);
      return false;
    }

    // TODO: 后期扩展 - 自动补全通知设置（默认值）
    // 确保每个联系人都有 notificationSettings 字段（向后兼容）
    // if (!contact.notificationSettings) {
    //   contact.notificationSettings = {
    //     enabled: true,           // 是否显示通知
    //     showPreview: true,       // 是否显示内容预览
    //     playSound: true,         // 是否播放提示音
    //     vibrate: false           // 是否震动（移动端）
    //   };
    // }

    // 加载现有联系人列表
    const contacts = await loadContacts();

    // 查找是否已存在
    const existingIndex = contacts.findIndex(c => c.id === contact.id);

    if (existingIndex >= 0) {
      // 更新现有联系人
      contacts[existingIndex] = contact;
      logger.info('[ContactData] 更新联系人:', contact.name);
    } else {
      // 添加新联系人
      contacts.push(contact);
      logger.info('[ContactData] 添加联系人:', contact.name);
    }

    // 保存到存储
    await saveData(CONTACTS_KEY, contacts);

    // 触发联系人列表变化事件（通知酒馆宏刷新）
    triggerContactListChanged();

    return true;
  } catch (error) {
    logger.error('[ContactData] 保存联系人失败:', error);
    return false;
  }
}

/**
 * 删除联系人
 * 
 * @description
 * 从存储中删除指定ID的联系人
 * 
 * @async
 * @param {string} contactId - 联系人 ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteContact(contactId) {
  logger.info('[ContactData] 删除联系人:', contactId);

  try {
    // 加载现有联系人列表
    const contacts = await loadContacts();

    // 过滤掉要删除的联系人
    const filteredContacts = contacts.filter(c => c.id !== contactId);

    // 检查是否真的删除了
    if (filteredContacts.length === contacts.length) {
      logger.warn('[ContactData] 联系人不存在:', contactId);
      return false;
    }

    // 保存到存储
    await saveData(CONTACTS_KEY, filteredContacts);
    logger.info('[ContactData] 联系人已删除:', contactId);

    // 触发联系人列表变化事件（通知酒馆宏刷新）
    triggerContactListChanged();

    return true;
  } catch (error) {
    logger.error('[ContactData] 删除联系人失败:', error);
    return false;
  }
}

/**
 * 获取已同意的好友ID列表
 * 
 * @description
 * 从 extension_settings 中读取已同意的好友申请ID列表
 * 
 * @async
 * @returns {Promise<Array<string>>} 已同意的好友ID列表
 */
async function getAgreedFriends() {
  logger.debug('[ContactData] 获取已同意好友列表');

  try {
    const agreedList = await loadData('agreedFriends');

    if (!agreedList || !Array.isArray(agreedList)) {
      logger.debug('[ContactData] 已同意列表为空，返回空数组');
      return [];
    }

    return agreedList;
  } catch (error) {
    logger.error('[ContactData] 获取已同意列表失败:', error);
    return [];
  }
}

/**
 * 标记好友为已同意
 * 
 * @description
 * 将好友ID添加到已同意列表中，保存到 extension_settings
 * 
 * @async
 * @param {string} friendId - 好友ID
 * @returns {Promise<boolean>} 是否保存成功
 */
async function markFriendAsAgreed(friendId) {
  logger.info('[ContactData] 标记好友为已同意:', friendId);

  try {
    // 获取现有列表
    const agreedList = await getAgreedFriends();

    // 检查是否已存在
    if (agreedList.includes(friendId)) {
      logger.warn('[ContactData] 好友已在已同意列表中:', friendId);
      return true;
    }

    // 添加到列表
    agreedList.push(friendId);

    // 保存到存储
    await saveData('agreedFriends', agreedList);
    logger.info('[ContactData] 已同意好友已保存:', friendId);
    return true;
  } catch (error) {
    logger.error('[ContactData] 标记已同意失败:', error);
    return false;
  }
}

/**
 * 检查好友是否已同意
 * 
 * @description
 * 检查指定ID的好友是否已同意申请
 * 
 * @async
 * @param {string} friendId - 好友ID
 * @returns {Promise<boolean>} 是否已同意
 */
async function isFriendAgreed(friendId) {
  const agreedList = await getAgreedFriends();
  return agreedList.includes(friendId);
}

/**
 * 获取待处理的好友申请列表（快照）
 * 
 * @description
 * 从存储中读取上次同步时保存的角色快照
 * 只有点击"同步酒馆角色"后才会有数据
 * 
 * @async
 * @returns {Promise<Array>} 待处理的好友申请列表
 */
async function getPendingRequests() {
  logger.debug('[ContactData] 获取待处理好友申请');

  try {
    const pending = await loadData('pendingRequests');

    if (!pending || !Array.isArray(pending)) {
      logger.debug('[ContactData] 待处理列表为空，返回空数组');
      return [];
    }

    return pending;
  } catch (error) {
    logger.error('[ContactData] 获取待处理列表失败:', error);
    return [];
  }
}

/**
 * 保存待处理的好友申请列表
 * 
 * @description
 * 保存从酒馆同步的角色快照到存储
 * 点击"同步酒馆角色"时调用
 * 
 * @async
 * @param {Array} requests - 好友申请列表
 * @returns {Promise<boolean>} 是否保存成功
 */
async function savePendingRequests(requests) {
  logger.info('[ContactData] 保存待处理申请列表，共', requests.length, '个');

  try {
    await saveData('pendingRequests', requests);
    return true;
  } catch (error) {
    logger.error('[ContactData] 保存待处理列表失败:', error);
    return false;
  }
}

/**
 * 合并新角色到待处理列表（增量同步）
 * 
 * @description
 * 将新同步的角色合并到现有的待处理列表中
 * 只添加不存在的角色，不删除已有的（保持历史累积）
 * 
 * @async
 * @param {Array} newCharacters - 新同步的角色列表
 * @returns {Promise<Object>} 同步结果 { added: number, total: number }
 */
async function mergePendingRequests(newCharacters) {
  logger.debug('[ContactData] 合并新角色到待处理列表');

  try {
    // 获取现有的待处理列表
    const existingPending = await getPendingRequests();

    // 创建现有ID集合（快速查找）
    const existingIds = new Set(existingPending.map(c => c.id));

    // 过滤出新增的角色
    const toAdd = newCharacters.filter(c => !existingIds.has(c.id));

    // 合并列表
    const merged = [...existingPending, ...toAdd];

    // 保存合并后的列表
    await savePendingRequests(merged);

    logger.info('[ContactData] 合并完成，新增', toAdd.length, '个，总计', merged.length, '个');

    return {
      added: toAdd.length,
      total: merged.length
    };
  } catch (error) {
    logger.error('[ContactData] 合并失败:', error);
    return {
      added: 0,
      total: 0
    };
  }
}

/**
 * 从待处理列表中移除指定角色
 * 
 * @description
 * 当用户同意某个角色后，从待处理列表中移除
 * （可选功能，也可以保留，通过 agreedFriends 过滤）
 * 
 * @async
 * @param {string} friendId - 好友ID
 * @returns {Promise<boolean>} 是否移除成功
 */
async function removeFromPendingRequests(friendId) {
  logger.debug('[ContactData] 从待处理列表移除:', friendId);

  try {
    const pending = await getPendingRequests();
    const filtered = pending.filter(r => r.id !== friendId);

    await savePendingRequests(filtered);
    return true;
  } catch (error) {
    logger.error('[ContactData] 移除失败:', error);
    return false;
  }
}

/**
 * 获取未同意的好友申请数量
 * 
 * @description
 * 计算待处理列表中，未同意的角色数量
 * 用于显示"新朋友"右侧的数字徽章
 * 
 * @async
 * @returns {Promise<number>} 未同意的角色数量
 */
async function getUnreadFriendRequestsCount() {
  logger.debug('[ContactData] 计算未同意好友数量');

  try {
    // 获取待处理列表（快照）
    const pending = await getPendingRequests();

    // 获取已同意列表
    const agreedList = await getAgreedFriends();

    // 计算未同意的数量
    const unreadCount = pending.filter(c => !agreedList.includes(c.id)).length;

    logger.debug('[ContactData] 未同意好友数量:', unreadCount);
    return unreadCount;
  } catch (error) {
    logger.error('[ContactData] 计算未同意数量失败:', error);
    return 0;
  }
}

// ==================== 分组管理相关函数 ====================

const GROUPS_KEY = 'contactGroups';

/**
 * 加载所有联系人分组
 * 
 * @description
 * 从存储中加载分组列表，如果不存在则返回默认分组
 * 
 * @async
 * @returns {Promise<Array>} 分组列表
 * @example
 * const groups = await loadContactGroups();
 * // [{ id: 'group_1', name: '特别关心', order: 0, isDefault: true }, ...]
 */
async function loadContactGroups() {
  logger.debug('[ContactData] 加载分组列表');

  try {
    const data = await loadData(GROUPS_KEY);

    // 如果数据不存在，返回默认分组
    if (!data || !Array.isArray(data)) {
      logger.debug('[ContactData] 分组列表为空，返回默认分组');
      const defaultGroups = getDefaultGroups();
      await saveData(GROUPS_KEY, defaultGroups);
      return defaultGroups;
    }

    logger.info('[ContactData] 成功加载分组列表，共', data.length, '个分组');
    return data;
  } catch (error) {
    logger.error('[ContactData] 加载分组列表失败:', error);
    return getDefaultGroups();
  }
}

/**
 * 获取默认分组列表
 * 
 * @description
 * 返回系统预设的默认分组（酒馆角色）
 * 这个默认分组可以改名，但不能删除
 * 
 * @returns {Array} 默认分组列表
 */
function getDefaultGroups() {
  return [
    {
      id: 'group_default_tavern',
      name: '酒馆角色',
      order: 0,
      isDefault: true
    }
  ];
}

/**
 * 保存联系人分组
 * 
 * @description
 * 保存单个分组到存储，如果分组已存在则更新，不存在则添加
 * 
 * @async
 * @param {Object} group - 分组对象
 * @param {string} group.id - 分组ID
 * @param {string} group.name - 分组名称
 * @param {number} group.order - 排序顺序
 * @param {boolean} [group.isDefault=false] - 是否为默认分组
 * @returns {Promise<boolean>} 是否保存成功
 */
async function saveContactGroup(group) {
  logger.debug('[ContactData] 保存分组:', group.id);

  try {
    // 验证必需字段（name 可以为空字符串）
    if (!group.id) {
      logger.warn('[ContactData] 分组缺少必需字段:', group);
      return false;
    }

    // 加载现有分组列表
    const groups = await loadContactGroups();

    // 查找是否已存在
    const existingIndex = groups.findIndex(g => g.id === group.id);

    if (existingIndex >= 0) {
      // 更新现有分组
      groups[existingIndex] = group;
      logger.info('[ContactData] 更新分组:', group.name);
    } else {
      // 添加新分组
      groups.push(group);
      logger.info('[ContactData] 添加分组:', group.name);
    }

    // 保存到存储
    await saveData(GROUPS_KEY, groups);
    return true;
  } catch (error) {
    logger.error('[ContactData] 保存分组失败:', error);
    return false;
  }
}

/**
 * 删除联系人分组
 * 
 * @description
 * 从存储中删除指定ID的分组，同时将该分组的联系人移至默认分组
 * 
 * @async
 * @param {string} groupId - 分组ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteContactGroup(groupId) {
  logger.info('[ContactData] 删除分组:', groupId);

  try {
    // 加载现有分组列表
    const groups = await loadContactGroups();

    // 检查是否为默认分组
    const group = groups.find(g => g.id === groupId);
    if (group && group.isDefault) {
      logger.warn('[ContactData] 不能删除默认分组:', groupId);
      return false;
    }

    // 过滤掉要删除的分组
    const filteredGroups = groups.filter(g => g.id !== groupId);

    // 检查是否真的删除了
    if (filteredGroups.length === groups.length) {
      logger.warn('[ContactData] 分组不存在:', groupId);
      return false;
    }

    // 保存到存储
    await saveData(GROUPS_KEY, filteredGroups);

    // TODO: 将该分组的联系人移至默认分组
    // 这个功能在后续实现联系人与分组关联时添加
    await moveContactsToDefaultGroup(groupId);

    logger.info('[ContactData] 分组已删除:', groupId);
    return true;
  } catch (error) {
    logger.error('[ContactData] 删除分组失败:', error);
    return false;
  }
}

/**
 * 更新分组排序
 * 
 * @description
 * 批量更新分组的排序顺序
 * 
 * @async
 * @param {Array} newOrder - 新的排序数组 [{id, order}, ...]
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateGroupsOrder(newOrder) {
  logger.debug('[ContactData] 更新分组排序');

  try {
    // 加载现有分组列表
    const groups = await loadContactGroups();

    // 更新每个分组的 order 属性
    newOrder.forEach(item => {
      const group = groups.find(g => g.id === item.id);
      if (group) {
        group.order = item.order;
      }
    });

    // 保存到存储
    await saveData(GROUPS_KEY, groups);
    logger.info('[ContactData] 分组排序已更新');
    return true;
  } catch (error) {
    logger.error('[ContactData] 更新分组排序失败:', error);
    return false;
  }
}

/**
 * 将指定分组的联系人移至默认分组
 * 
 * @description
 * 删除分组时调用，将该分组的所有联系人移至默认分组
 * 
 * @async
 * @param {string} groupId - 要删除的分组ID
 * @returns {Promise<void>}
 */
async function moveContactsToDefaultGroup(groupId) {
  logger.debug('[ContactData] 将分组联系人移至默认分组:', groupId);

  try {
    // 加载所有联系人
    const contacts = await loadContacts();

    // 获取默认分组ID（酒馆角色分组）
    const defaultGroupId = 'group_default_tavern';

    // 更新该分组的联系人
    let movedCount = 0;
    contacts.forEach(contact => {
      if (contact.groupId === groupId) {
        contact.groupId = defaultGroupId;
        movedCount++;
      }
    });

    // 保存联系人列表
    if (movedCount > 0) {
      await saveData(CONTACTS_KEY, contacts);
      logger.info('[ContactData] 已将', movedCount, '个联系人移至默认分组');
    }
  } catch (error) {
    logger.error('[ContactData] 移动联系人失败:', error);
  }
}

/**
 * 触发联系人列表变化事件
 * 
 * @description
 * 通知其他模块联系人列表已变化（用于刷新酒馆宏）
 * 
 * @private
 */
function triggerContactListChanged() {
  const event = new CustomEvent('phone-contact-list-changed', {
    detail: { timestamp: Date.now() }
  });
  document.dispatchEvent(event);
  logger.debug('[ContactData] 已触发联系人列表变化事件');
}

// ==================== AI感知删除相关函数 ====================

const AI_AWARE_DELETED_KEY = 'aiAwareDeletedFriends';

/**
 * 添加AI感知删除的好友申请
 * 
 * @async
 * @param {Object} contact - 联系人对象
 * @param {string} contact.id - 联系人ID
 * @param {string} contact.name - 联系人名称
 * @param {number} deleteTime - 删除时间戳（秒）
 * @returns {Promise<boolean>} 是否添加成功
 */
async function addAIAwareDeletedRequest(contact, deleteTime) {
  logger.debug('[ContactData] 添加AI感知删除申请:', contact.name);

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];

    // 检查是否已存在（避免重复）
    const exists = requests.find(r => r.contactId === contact.id);
    if (exists) {
      logger.warn('[ContactData] 该角色已在AI感知删除列表中:', contact.name);
      return false;
    }

    // 添加新记录
    requests.push({
      contactId: contact.id,
      contactName: contact.name,
      avatar: contact.avatar,
      status: 'ai_aware_deleted',
      deleteTime: deleteTime,
      reapplyMessages: [],  // 附加消息历史
      reapplyConfig: {
        allowReapply: false,  // 默认禁止继续申请
        probability: 0,       // 默认概率0%
        lastApplyTime: null
      }
    });

    await saveData(AI_AWARE_DELETED_KEY, requests);
    logger.info('[ContactData] 已添加AI感知删除申请:', contact.name);
    return true;
  } catch (error) {
    logger.error('[ContactData] 添加AI感知删除申请失败:', error);
    return false;
  }
}

/**
 * 获取所有AI感知删除的申请
 * 
 * @async
 * @returns {Promise<Array>} AI感知删除申请列表
 */
async function getAIAwareDeletedRequests() {
  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    logger.debug('[ContactData] 获取AI感知删除申请，共', requests.length, '个');
    return requests;
  } catch (error) {
    logger.error('[ContactData] 获取AI感知删除申请失败:', error);
    return [];
  }
}

/**
 * 移除AI感知删除申请（用户同意后）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<boolean>} 是否移除成功
 */
async function removeAIAwareDeletedRequest(contactId) {
  logger.debug('[ContactData] 移除AI感知删除申请:', contactId);

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const filtered = requests.filter(r => r.contactId !== contactId);

    if (filtered.length === requests.length) {
      logger.warn('[ContactData] 未找到该申请:', contactId);
      return false;
    }

    await saveData(AI_AWARE_DELETED_KEY, filtered);
    logger.info('[ContactData] 已移除AI感知删除申请:', contactId);
    return true;
  } catch (error) {
    logger.error('[ContactData] 移除AI感知删除申请失败:', error);
    return false;
  }
}

/**
 * 添加好友重新申请消息
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} message - 附加消息
 * @param {number} time - 时间戳（秒）
 * @param {string} [msgId] - 消息ID（用于回退处理）
 * @returns {Promise<boolean>} 是否添加成功
 */
async function addReapplyMessage(contactId, message, time, msgId) {
  logger.debug('[ContactData] 添加重新申请消息:', contactId, message.substring(0, 20));

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      logger.warn('[ContactData] 未找到AI感知删除申请:', contactId);
      return false;
    }

    // 添加新消息（含msgId用于回退）
    request.reapplyMessages.push({
      message: message,
      time: time,
      msgId: msgId,  // ✅ 保存消息ID（用于回退处理）
      isRead: false  // 是否已读（用于标记"新消息"）
    });

    // 更新最后申请时间
    request.reapplyConfig.lastApplyTime = time;

    await saveData(AI_AWARE_DELETED_KEY, requests);
    logger.info('[ContactData] 已添加重新申请消息:', contactId, msgId ? `(msgId: ${msgId})` : '');
    return true;
  } catch (error) {
    logger.error('[ContactData] 添加重新申请消息失败:', error);
    return false;
  }
}

/**
 * 删除指定的重新申请消息
 * @async
 * @param {string} contactId - 联系人ID
 * @param {number} messageIndex - 消息索引
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteReapplyMessage(contactId, messageIndex) {
  logger.debug('[ContactData] 删除重新申请消息:', contactId, messageIndex);

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      logger.warn('[ContactData] 未找到AI感知删除申请:', contactId);
      return false;
    }

    if (messageIndex < 0 || messageIndex >= request.reapplyMessages.length) {
      logger.warn('[ContactData] 消息索引超出范围:', messageIndex);
      return false;
    }

    // 删除指定消息
    request.reapplyMessages.splice(messageIndex, 1);

    await saveData(AI_AWARE_DELETED_KEY, requests);
    logger.info('[ContactData] 已删除重新申请消息:', contactId, messageIndex);
    return true;
  } catch (error) {
    logger.error('[ContactData] 删除重新申请消息失败:', error);
    return false;
  }
}

/**
 * 根据消息ID删除重新申请消息（用于回退处理）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {string} msgId - 消息ID
 * @returns {Promise<boolean>} 是否删除成功
 */
async function deleteReapplyMessageByMsgId(contactId, msgId) {
  logger.debug('[ContactData] 根据msgId删除重新申请消息:', contactId, msgId);

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      logger.warn('[ContactData] 未找到AI感知删除申请:', contactId);
      return false;
    }

    // 查找匹配的消息索引
    const messageIndex = request.reapplyMessages.findIndex(msg => msg.msgId === msgId);
    
    if (messageIndex === -1) {
      logger.warn('[ContactData] 未找到msgId对应的消息:', msgId);
      return false;
    }

    // 删除找到的消息
    request.reapplyMessages.splice(messageIndex, 1);

    await saveData(AI_AWARE_DELETED_KEY, requests);
    logger.info('[ContactData] 已根据msgId删除重新申请消息:', contactId, msgId);
    return true;
  } catch (error) {
    logger.error('[ContactData] 根据msgId删除重新申请消息失败:', error);
    return false;
  }
}

/**
 * 更新好友申请配置（概率、是否允许继续申请）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} config - 配置对象
 * @param {boolean} [config.allowReapply] - 是否允许继续申请
 * @param {number} [config.probability] - 概率（0-100）
 * @returns {Promise<boolean>} 是否更新成功
 */
async function updateReapplyConfig(contactId, config) {
  logger.debug('[ContactData] 更新申请配置:', contactId, config);

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      logger.warn('[ContactData] 未找到AI感知删除申请:', contactId);
      return false;
    }

    // 更新配置
    Object.assign(request.reapplyConfig, config);

    await saveData(AI_AWARE_DELETED_KEY, requests);
    logger.info('[ContactData] 已更新申请配置:', contactId);
    return true;
  } catch (error) {
    logger.error('[ContactData] 更新申请配置失败:', error);
    return false;
  }
}

/**
 * 标记所有申请消息为已读
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<boolean>} 是否更新成功
 */
async function markReapplyMessagesAsRead(contactId) {
  logger.debug('[ContactData] 标记申请消息为已读:', contactId);

  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      return false;
    }

    // 标记所有消息为已读
    request.reapplyMessages.forEach(msg => {
      msg.isRead = true;
    });

    await saveData(AI_AWARE_DELETED_KEY, requests);
    logger.info('[ContactData] 已标记申请消息为已读:', contactId);
    return true;
  } catch (error) {
    logger.error('[ContactData] 标记申请消息为已读失败:', error);
    return false;
  }
}

/**
 * 获取未读申请消息数量
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @returns {Promise<number>} 未读消息数量
 */
async function getUnreadReapplyCount(contactId) {
  try {
    const requests = await loadData(AI_AWARE_DELETED_KEY) || [];
    const request = requests.find(r => r.contactId === contactId);

    if (!request) {
      return 0;
    }

    const unreadCount = request.reapplyMessages.filter(msg => !msg.isRead).length;
    return unreadCount;
  } catch (error) {
    logger.error('[ContactData] 获取未读申请消息数量失败:', error);
    return 0;
  }
}

export {
  loadContacts,
  saveContact,
  deleteContact,
  getAgreedFriends,
  markFriendAsAgreed,
  isFriendAgreed,
  getPendingRequests,
  savePendingRequests,
  mergePendingRequests,
  removeFromPendingRequests,
  getUnreadFriendRequestsCount,
  // 分组管理
  loadContactGroups,
  saveContactGroup,
  deleteContactGroup,
  updateGroupsOrder,
  // AI感知删除
  addAIAwareDeletedRequest,
  getAIAwareDeletedRequests,
  removeAIAwareDeletedRequest,
  addReapplyMessage,
  deleteReapplyMessage,
  deleteReapplyMessageByMsgId,
  updateReapplyConfig,
  markReapplyMessagesAsRead,
  getUnreadReapplyCount
};

