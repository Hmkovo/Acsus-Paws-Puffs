/**
 * 同步酒馆角色列表
 * @module phone/contacts/contact-sync-tavern
 */

import logger from '../../../logger.js';
import { getContext } from '../../../../../../../scripts/st-context.js';
import { loadContacts, saveContact, deleteContact } from './contact-list-data.js';

/**
 * 获取酒馆角色列表
 * 
 * @description
 * 从 SillyTavern 的 getContext().characters 获取角色列表，
 * 并转换为联系人数据格式
 * 
 * @async
 * @returns {Promise<Array>} 转换后的联系人列表
 * @example
 * const contacts = await getTavernCharacters();
 * // [{ id: 'char_1', name: 'Alice', avatar: 'alice.png', signature: '...' }]
 */
async function getTavernCharacters() {
  logger.debug('phone','[Sync] 获取酒馆角色列表');

  try {
    // 获取 SillyTavern 角色列表
    const characters = getContext().characters;

    if (!characters || !Array.isArray(characters)) {
      logger.warn('phone','[Sync] 无法获取角色列表');
      return [];
    }

    // 转换为联系人格式
    const contacts = characters.map((character, index) => {
      return convertCharacterToContact(character, index);
    });

    logger.info('phone','[Sync] 成功获取角色列表，共', contacts.length, '个角色');
    return contacts;
  } catch (error) {
    logger.error('phone','[Sync] 获取角色列表失败:', error);
    return [];
  }
}

/**
 * 将角色对象转换为联系人对象
 * 
 * @param {Object} character - SillyTavern 角色对象
 * @param {number} index - 角色索引
 * @returns {Object} 联系人对象
 */
function convertCharacterToContact(character, index) {
  // 生成唯一ID（使用 avatar 作为标识）
  const id = `tavern_${character.avatar.replace(/\.[^/.]+$/, '')}`;

  return {
    id: id,
    name: character.name || '未命名角色',
    avatar: character.avatar || '',
    signature: character.data?.creator_notes || '', // 没有签名时为空字符串
    source: 'tavern', // 标记来源
    tavernIndex: index // 保存原始索引，方便后续操作
  };
}

/**
 * 同步联系人
 * 
 * @description
 * 对比酒馆角色和本地联系人，检测新增和删除的角色，
 * 并更新本地联系人列表
 * 
 * @async
 * @returns {Promise<Object>} 同步结果 { added: number, removed: number }
 */
async function syncContacts() {
  logger.info('phone','[Sync] 开始同步联系人');

  try {
    // 1. 获取酒馆角色列表
    const tavernContacts = await getTavernCharacters();

    // ✅ 修复同名角色ID冲突：检测重复的 ID 并添加后缀
    const usedIds = new Set();
    const idCounts = {};

    for (const contact of tavernContacts) {
      const baseId = contact.id;

      // 如果 ID 已存在，添加数字后缀
      if (usedIds.has(contact.id)) {
        // 统计这个 baseId 出现的次数
        if (!idCounts[baseId]) {
          idCounts[baseId] = 1;
        }
        idCounts[baseId]++;

        // 生成新的唯一 ID
        const newId = `${baseId}_${idCounts[baseId]}`;
        logger.warn('phone',`[Sync] 检测到同名角色，ID已调整: ${contact.id} → ${newId}`);
        contact.id = newId;
      }

      usedIds.add(contact.id);
    }

    // 2. 获取本地联系人列表
    const localContacts = await loadContacts();

    // 3. 检测新增的角色
    const tavernIds = new Set(tavernContacts.map(c => c.id));
    const localIds = new Set(localContacts.filter(c => c.source === 'tavern').map(c => c.id));

    const addedIds = tavernContacts.filter(c => !localIds.has(c.id));
    const removedIds = localContacts.filter(c => c.source === 'tavern' && !tavernIds.has(c.id));

    // 4. 添加新角色
    for (const contact of addedIds) {
      await saveContact(contact);
    }

    // 5. 删除不存在的角色
    for (const contact of removedIds) {
      await deleteContact(contact.id);
    }

    logger.info('phone',`[Sync] 同步完成: 新增 ${addedIds.length} 个，删除 ${removedIds.length} 个`);

    return {
      added: addedIds.length,
      removed: removedIds.length
    };
  } catch (error) {
    logger.error('phone','[Sync] 同步失败:', error);
    return {
      added: 0,
      removed: 0
    };
  }
}

export {
  getTavernCharacters,
  syncContacts
};

