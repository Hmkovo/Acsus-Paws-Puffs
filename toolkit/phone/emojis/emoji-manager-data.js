/**
 * 表情包数据管理模块
 * @module phone/emojis/emoji-manager-data
 */

import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced, getRequestHeaders } from '../../../../../../../script.js';
import logger from '../../../logger.js';

/**
 * 获取表情包列表
 * @returns {Array<Object>} 表情包数组
 */
export function getEmojis() {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone.emojis) {
    extension_settings.acsusPawsPuffs.phone.emojis = { items: [] };
  }
  return extension_settings.acsusPawsPuffs.phone.emojis.items;
}

/**
 * 保存表情包
 * 
 * @async
 * @param {Object} emoji - 表情包对象
 * @param {string} emoji.id - 表情包ID
 * @param {string} emoji.name - 表情包名称
 * @param {string} emoji.imagePath - 图片路径
 * @param {number} emoji.addedTime - 添加时间
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveEmoji(emoji) {
  const emojis = getEmojis();

  // 检查是否重名
  const exists = emojis.find(e => e.name === emoji.name && e.id !== emoji.id);
  if (exists) {
    logger.warn('phone','[EmojiData] 表情包名称已存在:', emoji.name);
    return false;
  }

  // 查找是否已存在（更新）
  const index = emojis.findIndex(e => e.id === emoji.id);
  if (index !== -1) {
    emojis[index] = emoji;
    logger.info('phone','[EmojiData] 已更新表情包:', emoji.name);
  } else {
    emojis.push(emoji);
    logger.info('phone','[EmojiData] 已添加表情包:', emoji.name);
  }

  await saveSettingsDebounced();

  // 触发数据变化事件，通知其他页面刷新
  const event = new CustomEvent('emoji-data-changed', {
    detail: { action: index !== -1 ? 'update' : 'add', emoji: emoji }
  });
  document.dispatchEvent(event);

  return true;
}

/**
 * 删除表情包（批量）
 * 
 * @async
 * @param {Array<string>} emojiIds - 要删除的表情包ID列表
 * @returns {Promise<number>} 删除的数量
 * 
 * @description
 * 删除表情包数据并删除服务器上的图片文件
 * 使用 /api/files/delete 端点删除实际文件
 */
export async function deleteEmojis(emojiIds) {
  const emojis = getEmojis();
  const beforeCount = emojis.length;

  // 找出要删除的表情包（用于删除文件）
  const emojisToDelete = emojis.filter(e => emojiIds.includes(e.id));

  // 删除服务器上的图片文件
  for (const emoji of emojisToDelete) {
    try {
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ path: emoji.imagePath })
      });

      if (response.ok) {
        logger.info('phone','[EmojiData] 已删除文件:', emoji.imagePath);
      } else {
        logger.warn('phone','[EmojiData] 删除文件失败:', emoji.imagePath, '状态码:', response.status);
      }
    } catch (error) {
      logger.error('phone','[EmojiData] 删除文件时出错:', emoji.imagePath, error);
    }
  }

  // 过滤掉要删除的表情包（从数据中移除）
  extension_settings.acsusPawsPuffs.phone.emojis.items =
    emojis.filter(e => !emojiIds.includes(e.id));

  const deletedCount = beforeCount - extension_settings.acsusPawsPuffs.phone.emojis.items.length;
  logger.info('phone',`[EmojiData] 已删除 ${deletedCount} 个表情包`);

  await saveSettingsDebounced();

  // 触发数据变化事件，通知其他页面刷新
  if (deletedCount > 0) {
    const event = new CustomEvent('emoji-data-changed', {
      detail: { action: 'delete', count: deletedCount }
    });
    document.dispatchEvent(event);
  }

  return deletedCount;
}

/**
 * 根据ID查找表情包（推荐使用，支持改名）
 * 
 * @param {string} id - 表情包ID
 * @returns {Object|null} 表情包对象
 * 
 * @description
 * 使用ID查找，不受表情包改名影响
 */
export function findEmojiById(id) {
  const emojis = getEmojis();
  return emojis.find(e => e.id === id) || null;
}

/**
 * 根据名称查找表情包（兼容旧逻辑）
 * 
 * @deprecated 建议使用 findEmojiById()，避免改名后找不到
 * @param {string} name - 表情包名称
 * @returns {Object|null} 表情包对象
 */
export function findEmojiByName(name) {
  const emojis = getEmojis();
  return emojis.find(e => e.name === name) || null;
}

/**
 * 获取所有表情包名称（用于预设库）
 * @returns {Array<string>} 表情包名称列表
 */
export function getEmojiNames() {
  const emojis = getEmojis();
  return emojis.map(e => e.name);
}

