/**
 * 个性签名数据管理
 * @module phone/profile/signature-data
 * 
 * @description
 * 管理用户和角色的个性签名数据（包括历史记录、点赞、评论）
 */

import logger from '../../../logger.js';
import { loadData, saveData } from '../data-storage/storage-api.js';
import { loadContacts, saveContact as saveContactData } from '../contacts/contact-list-data.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { extension_settings } from '../../../../../../extensions.js';

// 存储键
const USER_SIGNATURE_KEY = 'userSignature';

/**
 * 获取个签历史显示配置
 * @returns {Object} 配置对象
 */
function getSignatureHistoryConfig() {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.signatureHistory) {
    extension_settings.acsusPawsPuffs.phone.signatureHistory = {
      displayCount: 3  // 默认显示3条
    };
    saveSettingsDebounced();
  }
  return extension_settings.acsusPawsPuffs.phone.signatureHistory;
}

/**
 * 设置个签历史显示条数
 * @param {number} count - 显示条数
 */
export function setSignatureHistoryDisplayCount(count) {
  const config = getSignatureHistoryConfig();
  config.displayCount = Math.max(1, Math.min(20, count)); // 限制1-20条
  saveSettingsDebounced();
  logger.info('[SignatureData] 个签历史显示条数已设置为:', config.displayCount);
}

/**
 * 获取个签历史显示条数
 * @returns {number} 显示条数
 */
export function getSignatureHistoryDisplayCount() {
  return getSignatureHistoryConfig().displayCount;
}

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
  return `sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 生成评论ID
 * @returns {string} 评论ID
 */
function generateCommentId() {
  return `cmt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// 用户个签管理
// ============================================

/**
 * 加载用户个签数据
 * 
 * @async
 * @returns {Promise<Object>} 用户个签数据
 */
export async function loadUserSignature() {
  try {
    const data = await loadData(USER_SIGNATURE_KEY);
    if (!data) {
      return {
        current: '',
        history: []  // { id, content, timestamp, likes, comments: [] }
      };
    }
    return data;
  } catch (error) {
    logger.error('[SignatureData] 加载用户个签失败:', error);
    return {
      current: '',
      history: []
    };
  }
}

/**
 * 保存用户个签数据
 * 
 * @async
 * @param {Object} signatureData - 个签数据
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveUserSignature(signatureData) {
  try {
    await saveData(USER_SIGNATURE_KEY, signatureData);
    logger.info('[SignatureData] 用户个签已保存');
    return true;
  } catch (error) {
    logger.error('[SignatureData] 保存用户个签失败:', error);
    return false;
  }
}

/**
 * 更新用户个签（添加历史记录）
 * 
 * @description
 * 用户修改个签时调用，会自动创建历史记录
 * 
 * @async
 * @param {string} newSignature - 新个签内容
 * @returns {Promise<Object|null>} 新创建的历史记录对象，失败返回null
 */
export async function updateUserSignature(newSignature) {
  try {
    const data = await loadUserSignature();

    // 如果和当前个签相同，不创建新记录
    if (newSignature === data.current) {
      logger.debug('[SignatureData] 个签未改变，跳过更新');
      return null;
    }

    // 创建历史记录
    const historyItem = {
      id: generateId(),
      content: newSignature,
      timestamp: Math.floor(Date.now() / 1000),  // 秒级时间戳
      likes: 0,  // 点赞数（目前用户个签不支持点赞）
      comments: []  // 评论列表（目前用户个签不支持评论）
    };

    // 更新当前个签
    data.current = newSignature;

    // 添加到历史记录（最新的在最前面）
    data.history.unshift(historyItem);

    // 保存
    await saveUserSignature(data);

    // 触发事件通知其他页面刷新
    document.dispatchEvent(new CustomEvent('signature-data-changed', {
      detail: { targetType: 'user', signature: newSignature }
    }));

    logger.info('[SignatureData] 用户个签已更新:', newSignature.substring(0, 20));
    return historyItem;
  } catch (error) {
    logger.error('[SignatureData] 更新用户个签失败:', error);
    return null;
  }
}

/**
 * 删除用户个签历史记录
 * 
 * @async
 * @param {string} signatureId - 个签ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteUserSignatureHistory(signatureId) {
  try {
    const data = await loadUserSignature();

    // 过滤掉要删除的记录
    const originalLength = data.history.length;
    data.history = data.history.filter(item => item.id !== signatureId);

    if (data.history.length === originalLength) {
      logger.warn('[SignatureData] 个签历史记录不存在:', signatureId);
      return false;
    }

    // 如果删除的是当前个签对应的记录，清空当前个签
    const deletedItem = data.history.find(item => item.id === signatureId);
    if (deletedItem && deletedItem.content === data.current) {
      data.current = '';
    }

    await saveUserSignature(data);
    logger.info('[SignatureData] 用户个签历史记录已删除');
    return true;
  } catch (error) {
    logger.error('[SignatureData] 删除用户个签历史记录失败:', error);
    return false;
  }
}

/**
 * 获取用户个签前N条历史（用于AI上下文）
 * 
 * @async
 * @param {number} [count] - 获取条数（不传则使用配置）
 * @returns {Promise<Array>} 前N条历史记录
 */
export async function getUserSignatureTop3(count) {
  const data = await loadUserSignature();
  const displayCount = count !== undefined ? count : getSignatureHistoryDisplayCount();
  return data.history.slice(0, displayCount);
}

// ============================================
// 角色个签管理
// ============================================

/**
 * 加载角色个签数据
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @returns {Promise<Object>} 角色个签数据
 */
export async function loadContactSignature(contactId) {
  try {
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('[SignatureData] 角色不存在:', contactId);
      return {
        current: '',
        history: []
      };
    }

    // 如果没有signature字段，初始化
    if (!contact.signature) {
      return {
        current: '',
        history: []
      };
    }

    // ✅ 防御性编程：确保数据结构完整
    // 兼容初始格式：新同步的角色 signature 是字符串，需转换为对象格式
    if (typeof contact.signature === 'string') {
      logger.debug('[SignatureData] 检测到字符串格式个签，转换为对象格式');
      return {
        current: contact.signature,
        history: []
      };
    }

    // 确保 history 字段存在
    if (!contact.signature.history) {
      logger.debug('[SignatureData] 个签数据缺少 history 字段，自动补全');
      contact.signature.history = [];
    }

    // 确保 current 字段存在
    if (contact.signature.current === undefined) {
      contact.signature.current = '';
    }

    return contact.signature;
  } catch (error) {
    logger.error('[SignatureData] 加载角色个签失败:', error);
    return {
      current: '',
      history: []
    };
  }
}

/**
 * 保存角色个签数据
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {Object} signatureData - 个签数据
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveContactSignature(contactId, signatureData) {
  try {
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);

    if (!contact) {
      logger.warn('[SignatureData] 角色不存在:', contactId);
      return false;
    }

    // 更新个签数据
    contact.signature = signatureData;

    // 保存联系人
    await saveContactData(contact);

    logger.info('[SignatureData] 角色个签已保存:', contactId);
    return true;
  } catch (error) {
    logger.error('[SignatureData] 保存角色个签失败:', error);
    return false;
  }
}

/**
 * 更新角色个签（AI发送[改个签]时调用）
 * 
 * @description
 * 角色修改个签时调用，会自动创建历史记录
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {string} newSignature - 新个签内容
 * @param {string} [msgId] - 关联的消息ID（可选）
 * @returns {Promise<Object|null>} 新创建的历史记录对象，失败返回null
 */
export async function updateContactSignature(contactId, newSignature, msgId = null) {
  try {
    const data = await loadContactSignature(contactId);

    // ✅ 新增：如果提供了msgId，检查这个消息ID是否已经保存过
    if (msgId) {
      const existingItem = data.history.find(item => item.msgId === msgId);
      if (existingItem) {
        logger.debug('[SignatureData] 该消息已保存过个签，跳过（msgId:', msgId, ')');
        // 更新当前个签为这条历史记录的内容（用于版本切换）
        data.current = existingItem.content;
        await saveContactSignature(contactId, data);
        return existingItem;
      }
    }

    // 如果和当前个签相同，不创建新记录
    if (newSignature === data.current) {
      logger.debug('[SignatureData] 角色个签未改变，跳过更新');
      return null;
    }

    // 创建历史记录
    const historyItem = {
      id: generateId(),
      content: newSignature,
      timestamp: Math.floor(Date.now() / 1000),
      likes: 0,
      liked: false,  // 用户是否点赞
      comments: [],
      msgId: msgId  // 关联的消息ID
    };

    // 更新当前个签
    data.current = newSignature;

    // 添加到历史记录（最新的在最前面）
    data.history.unshift(historyItem);

    // 保存
    await saveContactSignature(contactId, data);

    // 触发事件通知其他页面刷新
    document.dispatchEvent(new CustomEvent('signature-data-changed', {
      detail: { targetType: 'contact', contactId, signature: newSignature }
    }));

    logger.info('[SignatureData] 角色个签已更新:', newSignature.substring(0, 20));
    return historyItem;
  } catch (error) {
    logger.error('[SignatureData] 更新角色个签失败:', error);
    return null;
  }
}

/**
 * 删除角色个签历史记录
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {string} signatureId - 个签ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteContactSignatureHistory(contactId, signatureId) {
  try {
    const data = await loadContactSignature(contactId);

    // 过滤掉要删除的记录
    const originalLength = data.history.length;
    data.history = data.history.filter(item => item.id !== signatureId);

    if (data.history.length === originalLength) {
      logger.warn('[SignatureData] 角色个签历史记录不存在:', signatureId);
      return false;
    }

    // 如果删除的是当前个签对应的记录，清空当前个签
    const deletedItem = data.history.find(item => item.id === signatureId);
    if (deletedItem && deletedItem.content === data.current) {
      data.current = '';
    }

    await saveContactSignature(contactId, data);
    logger.info('[SignatureData] 角色个签历史记录已删除');
    return true;
  } catch (error) {
    logger.error('[SignatureData] 删除角色个签历史记录失败:', error);
    return false;
  }
}

/**
 * 点赞/取消点赞角色个签
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {string} signatureId - 个签ID
 * @returns {Promise<boolean|null>} true=已点赞, false=已取消, null=失败
 */
export async function toggleContactSignatureLike(contactId, signatureId) {
  try {
    const data = await loadContactSignature(contactId);

    // 查找个签记录
    const signature = data.history.find(item => item.id === signatureId);
    if (!signature) {
      logger.warn('[SignatureData] 个签记录不存在:', signatureId);
      return null;
    }

    // 切换点赞状态
    if (signature.liked) {
      // 取消点赞
      signature.liked = false;
      signature.likes = Math.max(0, signature.likes - 1);
      logger.info('[SignatureData] 取消点赞');
    } else {
      // 点赞
      signature.liked = true;
      signature.likes += 1;
      logger.info('[SignatureData] 已点赞');
    }

    await saveContactSignature(contactId, data);
    return signature.liked;
  } catch (error) {
    logger.error('[SignatureData] 点赞/取消点赞失败:', error);
    return null;
  }
}

/**
 * 添加评论到角色个签
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {string} signatureId - 个签ID
 * @param {string} commentContent - 评论内容
 * @returns {Promise<Object|null>} 新创建的评论对象，失败返回null
 */
export async function addContactSignatureComment(contactId, signatureId, commentContent) {
  try {
    const data = await loadContactSignature(contactId);

    // 查找个签记录
    const signature = data.history.find(item => item.id === signatureId);
    if (!signature) {
      logger.warn('[SignatureData] 个签记录不存在:', signatureId);
      return null;
    }

    // 创建评论对象
    const comment = {
      id: generateCommentId(),
      content: commentContent,
      timestamp: Math.floor(Date.now() / 1000),
      from: 'user'  // 用户发的评论
    };

    // 添加评论
    signature.comments.push(comment);

    await saveContactSignature(contactId, data);
    logger.info('[SignatureData] 已添加评论');
    return comment;
  } catch (error) {
    logger.error('[SignatureData] 添加评论失败:', error);
    return null;
  }
}

/**
 * 删除角色个签的评论
 * 
 * @async
 * @param {string} contactId - 角色ID
 * @param {string} signatureId - 个签ID
 * @param {string} commentId - 评论ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteContactSignatureComment(contactId, signatureId, commentId) {
  try {
    const data = await loadContactSignature(contactId);

    // 查找个签记录
    const signature = data.history.find(item => item.id === signatureId);
    if (!signature) {
      logger.warn('[SignatureData] 个签记录不存在:', signatureId);
      return false;
    }

    // 过滤掉要删除的评论
    const originalLength = signature.comments.length;
    signature.comments = signature.comments.filter(c => c.id !== commentId);

    if (signature.comments.length === originalLength) {
      logger.warn('[SignatureData] 评论不存在:', commentId);
      return false;
    }

    await saveContactSignature(contactId, data);
    logger.info('[SignatureData] 已删除评论');
    return true;
  } catch (error) {
    logger.error('[SignatureData] 删除评论失败:', error);
    return false;
  }
}

/**
 * 回退个签历史（删除指定消息ID关联的个签记录）
 * 
 * @description
 * 用于重roll时回退个签历史，删除被回退的AI消息中包含的个签更新
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Array<string>} deletedMessageIds - 被删除的消息ID列表
 * @returns {Promise<Object>} 回退结果 { count: 删除数量, deleted: 删除的个签数组 }
 */
export async function rollbackSignatureHistory(contactId, deletedMessageIds) {
  try {
    logger.debug('[SignatureData.rollback] 开始回退个签历史，消息数:', deletedMessageIds.length);

    const data = await loadContactSignature(contactId);
    if (!data || !data.history || data.history.length === 0) {
      logger.debug('[SignatureData.rollback] 没有个签历史，跳过回退');
      return { count: 0, deleted: [] };
    }

    const originalLength = data.history.length;
    const deletedSet = new Set(deletedMessageIds);
    const deletedSignatures = [];

    // 过滤掉关联到被删除消息的个签记录
    data.history = data.history.filter(item => {
      if (item.msgId && deletedSet.has(item.msgId)) {
        deletedSignatures.push(item);
        return false; // 删除这条记录
      }
      return true; // 保留这条记录
    });

    const deletedCount = originalLength - data.history.length;

    if (deletedCount > 0) {
      // 更新当前个签（如果被删除的是最新的个签）
      if (data.history.length > 0) {
        // 使用剩余历史中最新的个签作为当前个签
        data.currentSignature = data.history[0].signature;
        logger.debug('[SignatureData.rollback] 当前个签已更新为:', data.currentSignature);
      } else {
        // 如果历史为空，清空当前个签
        data.currentSignature = '';
        logger.debug('[SignatureData.rollback] 个签历史已清空，当前个签重置');
      }

      await saveContactSignature(contactId, data);
      logger.info('[SignatureData.rollback] 已回退', deletedCount, '条个签记录');
    } else {
      logger.debug('[SignatureData.rollback] 没有需要回退的个签');
    }

    return {
      count: deletedCount,
      deleted: deletedSignatures
    };
  } catch (error) {
    logger.error('[SignatureData.rollback] 回退失败:', error);
    throw error;
  }
}

