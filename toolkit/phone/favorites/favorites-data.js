/**
 * 收藏数据管理
 * @module phone/favorites/favorites-data
 * 
 * @description
 * 管理收藏的消息数据（增删查），数据持久化到 extension_settings
 */

import logger from '../../../logger.js';
import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../../script.js';
import { generateMessageId } from '../utils/message-actions-helper.js';

/**
 * @typedef {Object} FavoriteItem
 * @property {string} id - 收藏ID
 * @property {string} messageId - 原消息ID
 * @property {string} contactId - 联系人ID
 * @property {string} contactName - 联系人名称
 * @property {string} contactAvatar - 联系人头像
 * @property {string} type - 消息类型（text/image/emoji/transfer/quote等）
 * @property {string} content - 消息内容（表情包ID、图片描述|URL等）
 * @property {number} timestamp - 收藏时间戳
 * @property {number} originalTimestamp - 原消息时间戳
 * @property {string} [emojiName] - 表情包名称（仅emoji类型）
 * @property {string} [description] - 图片描述（仅image类型）
 * @property {string} [imageUrl] - 图片链接（仅image类型）
 * @property {number} [amount] - 转账金额（仅transfer类型）
 * @property {string} [message] - 转账留言（仅transfer类型）
 * @property {Object} [quotedMessage] - 被引用消息（仅quote类型）
 * @property {string} [replyContent] - 回复内容（仅quote类型）
 */

/**
 * 初始化收藏数据结构
 * 
 * @description
 * 确保 extension_settings.phone.favorites 存在
 */
function initFavoritesData() {
  if (!extension_settings.phone) {
    extension_settings.phone = {};
  }

  if (!extension_settings.phone.favorites) {
    extension_settings.phone.favorites = {
      items: []
    };
    saveSettingsDebounced();
    logger.info('[FavoritesData] 初始化收藏数据结构');
  }
}

/**
 * 加载所有收藏
 * 
 * @returns {FavoriteItem[]} 收藏列表（按时间倒序）
 */
export function loadFavorites() {
  initFavoritesData();

  const items = extension_settings.phone.favorites.items || [];

  logger.debug('[FavoritesData] 加载收藏:', items.length, '条');
  return items;
}

/**
 * 添加收藏
 * 
 * @param {Object} favoriteData - 收藏数据（完整的消息对象）
 * @param {string} favoriteData.messageId - 原消息ID
 * @param {string} favoriteData.contactId - 联系人ID
 * @param {string} favoriteData.contactName - 联系人名称
 * @param {string} favoriteData.contactAvatar - 联系人头像
 * @param {string} favoriteData.type - 消息类型
 * @param {string} favoriteData.content - 消息内容
 * @param {number} [favoriteData.originalTimestamp] - 原消息时间戳
 * @param {string} [favoriteData.emojiName] - 表情包名称（emoji类型）
 * @param {string} [favoriteData.description] - 图片描述（image类型）
 * @param {string} [favoriteData.imageUrl] - 图片链接（image类型）
 * @param {number} [favoriteData.amount] - 转账金额（transfer类型）
 * @param {string} [favoriteData.message] - 转账留言（transfer类型）
 * @param {Object} [favoriteData.quotedMessage] - 被引用消息（quote类型）
 * @param {string} [favoriteData.replyContent] - 回复内容（quote类型）
 * @returns {FavoriteItem} 新收藏项
 */
export function addFavorite(favoriteData) {
  initFavoritesData();

  // 检查是否已收藏（根据messageId）
  const existing = extension_settings.phone.favorites.items.find(
    item => item.messageId === favoriteData.messageId
  );

  if (existing) {
    logger.warn('[FavoritesData] 消息已收藏:', favoriteData.messageId);
    return existing;
  }

  // 创建收藏项（保存完整的消息字段）
  const favoriteItem = {
    id: generateMessageId(),
    messageId: favoriteData.messageId,
    contactId: favoriteData.contactId,
    contactName: favoriteData.contactName,
    contactAvatar: favoriteData.contactAvatar,
    type: favoriteData.type,
    content: favoriteData.content,
    timestamp: Date.now(),
    originalTimestamp: favoriteData.originalTimestamp || Date.now()
  };

  // 根据类型添加额外字段
  if (favoriteData.type === 'emoji' && favoriteData.emojiName) {
    favoriteItem.emojiName = favoriteData.emojiName;
  }

  if (favoriteData.type === 'image') {
    if (favoriteData.description) {
      favoriteItem.description = favoriteData.description;
    }
    if (favoriteData.imageUrl) {
      favoriteItem.imageUrl = favoriteData.imageUrl;
    }
  }

  if (favoriteData.type === 'transfer') {
    if (favoriteData.amount !== undefined) {
      favoriteItem.amount = favoriteData.amount;
    }
    if (favoriteData.message) {
      favoriteItem.message = favoriteData.message;
    }
  }

  if (favoriteData.type === 'quote') {
    if (favoriteData.quotedMessage) {
      favoriteItem.quotedMessage = favoriteData.quotedMessage;
    }
    if (favoriteData.replyContent) {
      favoriteItem.replyContent = favoriteData.replyContent;
    }
  }

  // 添加到列表开头（最新的在前）
  extension_settings.phone.favorites.items.unshift(favoriteItem);

  saveSettingsDebounced();

  logger.info('[FavoritesData] 添加收藏:', {
    id: favoriteItem.id,
    type: favoriteItem.type,
    contactName: favoriteItem.contactName,
    emojiName: favoriteItem.emojiName,
    description: favoriteItem.description,
    amount: favoriteItem.amount
  });

  return favoriteItem;
}

/**
 * 删除收藏
 * 
 * @param {string} favoriteId - 收藏ID
 * @returns {boolean} 是否删除成功
 */
export function deleteFavorite(favoriteId) {
  initFavoritesData();

  const index = extension_settings.phone.favorites.items.findIndex(
    item => item.id === favoriteId
  );

  if (index === -1) {
    logger.warn('[FavoritesData] 收藏不存在:', favoriteId);
    return false;
  }

  const deleted = extension_settings.phone.favorites.items.splice(index, 1);
  saveSettingsDebounced();

  logger.info('[FavoritesData] 删除收藏:', favoriteId);
  return true;
}

/**
 * 检查消息是否已收藏
 * 
 * @param {string} messageId - 消息ID
 * @returns {boolean} 是否已收藏
 */
export function isFavorited(messageId) {
  initFavoritesData();

  const exists = extension_settings.phone.favorites.items.some(
    item => item.messageId === messageId
  );

  return exists;
}

/**
 * 通过messageId删除收藏
 * 
 * @param {string} messageId - 原消息ID
 * @returns {boolean} 是否删除成功
 */
export function deleteFavoriteByMessageId(messageId) {
  initFavoritesData();

  const index = extension_settings.phone.favorites.items.findIndex(
    item => item.messageId === messageId
  );

  if (index === -1) {
    logger.warn('[FavoritesData] 收藏不存在:', messageId);
    return false;
  }

  const deleted = extension_settings.phone.favorites.items.splice(index, 1);
  saveSettingsDebounced();

  logger.info('[FavoritesData] 取消收藏:', messageId);
  return true;
}

/**
 * 搜索收藏
 * 
 * @param {string} keyword - 搜索关键词
 * @returns {FavoriteItem[]} 匹配的收藏列表
 */
export function searchFavorites(keyword) {
  initFavoritesData();

  if (!keyword || !keyword.trim()) {
    return loadFavorites();
  }

  const lowerKeyword = keyword.toLowerCase().trim();

  const results = extension_settings.phone.favorites.items.filter(item => {
    // 搜索内容、联系人名称
    return item.content.toLowerCase().includes(lowerKeyword) ||
      item.contactName.toLowerCase().includes(lowerKeyword);
  });

  logger.debug('[FavoritesData] 搜索收藏:', keyword, '，找到', results.length, '条');
  return results;
}

/**
 * 获取收藏数量
 * 
 * @returns {number} 收藏总数
 */
export function getFavoritesCount() {
  initFavoritesData();
  return extension_settings.phone.favorites.items.length;
}

/**
 * 清空所有收藏
 * 
 * @returns {boolean} 是否成功
 */
export function clearAllFavorites() {
  initFavoritesData();

  const count = extension_settings.phone.favorites.items.length;
  extension_settings.phone.favorites.items = [];

  saveSettingsDebounced();

  logger.info('[FavoritesData] 清空所有收藏，共', count, '条');
  return true;
}

