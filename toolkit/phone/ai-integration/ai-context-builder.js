/**
 * AI上下文构建器
 * @module phone/ai-integration/ai-context-builder
 * 
 * @description
 * 构建完整的AI提示词，包括：
 * - 头部破限
 * - 角色卡（人设 + 线下剧情 + 世界书）
 * - 手机聊天记录
 * - 格式要求
 * - 尾部破限
 */

import logger from '../../../logger.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { loadChatHistory } from '../messages/message-chat-data.js';
import { characters, chat, this_chid, saveSettingsDebounced, getRequestHeaders } from '../../../../../../../script.js';
import { extension_settings } from '../../../../../../../scripts/extensions.js';

/**
 * 获取角色数据
 * @private
 * @param {Object} contact - 联系人对象
 * @returns {Object|null} 角色数据
 */
function getCharacterData(contact) {
  // 从contactId提取角色名（去掉'tavern_'前缀）
  const charName = contact.id.replace(/^tavern_/, '');

  // 在酒馆角色列表中查找
  const character = characters.find(c => {
    const avatar = c.avatar?.replace(/\.[^/.]+$/, ''); // 去掉扩展名
    return avatar === charName;
  });

  if (!character) {
    logger.warn('[ContextBuilder] 未找到对应的酒馆角色:', charName);
    return null;
  }

  logger.debug('[ContextBuilder] 找到酒馆角色:', character.name);
  return character;
}

/**
 * 获取酒馆最近的上下文（同步版本，使用全局chat变量）
 * @private
 * @param {number} count - 获取条数（默认5）
 * @returns {string} 线下剧情聊天记录
 */
function getRecentTavernContext(count = 5) {
  if (!chat || chat.length === 0) {
    return '（无线下剧情）\n';
  }

  const recentMessages = chat.slice(-count);
  let context = '';

  recentMessages.forEach(msg => {
    const senderName = msg.is_user ? '你' : msg.name;
    context += `${senderName}: ${msg.mes}\n`;
  });

  return context;
}

/**
 * 获取特定角色的线下剧情（酒馆聊天记录，异步版本）
 * 
 * @async
 * @private
 * @param {Object} character - 酒馆角色对象
 * @param {number} count - 获取条数（默认5）
 * @returns {Promise<string>} 线下剧情聊天记录
 */
async function getCharacterTavernContext(character, count = 5) {
  if (!character) {
    return '（该角色不存在）\n';
  }

  try {
    // 检查是否是当前在酒馆中打开的角色
    const isCurrentCharacter = this_chid !== undefined &&
      characters[this_chid] &&
      characters[this_chid].avatar === character.avatar;

    let chatMessages = [];

    if (isCurrentCharacter) {
      // 如果是当前角色，直接使用全局chat变量（快速）
      logger.debug('[ContextBuilder] 使用当前打开的聊天记录:', character.name);
      chatMessages = chat || [];
    } else {
      // 如果不是当前角色，需要调用API获取该角色的聊天记录
      logger.debug('[ContextBuilder] 从服务器获取角色聊天记录:', character.name);

      if (!character.chat) {
        // 该角色还没有聊天记录
        return '（该角色还没有聊天记录）\n';
      }

      // 调用SillyTavern的API获取聊天记录
      const response = await fetch('/api/chats/get', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
          ch_name: character.name,
          file_name: character.chat,
          avatar_url: character.avatar,
        }),
      });

      if (!response.ok) {
        logger.warn('[ContextBuilder] 获取聊天记录失败:', response.status);
        return '（无法获取聊天记录）\n';
      }

      chatMessages = await response.json();
    }

    // 如果没有聊天记录
    if (!chatMessages || chatMessages.length === 0) {
      return '（无线下剧情）\n';
    }

    // 获取最近N条消息
    const recentMessages = chatMessages.slice(-count);
    let context = '';

    recentMessages.forEach(msg => {
      const senderName = msg.is_user ? '你' : (msg.name || character.name);
      context += `${senderName}: ${msg.mes}\n`;
    });

    return context;

  } catch (error) {
    logger.error('[ContextBuilder] 获取线下剧情失败:', error);
    return '（获取线下剧情失败）\n';
  }
}

/**
 * 格式化时间戳
 * @private
 * @param {number} timestamp - 时间戳（秒）
 * @returns {string} 格式化后的时间字符串
 */
function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 构建messages数组（新版，使用预设系统）
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {Object} allPendingMessages - 所有待发送消息（按联系人ID分组）格式：{ contactId: [messages] }
 * @returns {Promise<Object>} { messages: messages数组, messageNumberMap: 编号映射表 }
 * 
 * @description
 * 根据预设列表构建messages数组，每个预设项对应一条消息。
 * 支持三种角色类型（system/user/assistant）。
 * 自动替换特殊占位符（如__AUTO_CHARACTERS__、__AUTO_CHAT_HISTORY__、user待操作）。
 * 
 * ⚠️ 变量替换由 SillyTavern 的 MacrosParser 自动处理（不需要手动替换）：
 * - {{最新消息}}、{{历史消息}}、{{当前时间}} 等手机宏
 * - {{user}}、{{char}} 等官方宏
 * - 在 AI 调用前自动替换
 * 
 * ✅ 消息编号机制（2025-10-29新增）：
 * - 每次构建时临时生成编号（#1, #2, #3...）
 * - 编号→消息ID映射表随messages一起返回
 * - 用于AI引用消息时精确查找原消息
 * - 编号每次重新构建，不累积
 */
export async function buildMessagesArray(contactId, allPendingMessages) {
  logger.info('[ContextBuilder.buildMessagesArray] 开始构建messages数组:', contactId);

  // ✅ 创建消息编号映射表（编号 → 消息ID）
  const messageNumberMap = new Map();
  let currentNumber = 1;

  // 获取预设数据
  const presets = getPresetData();

  // 获取联系人信息
  const contacts = await loadContacts();
  const contact = contacts.find(c => c.id === contactId);

  if (!contact) {
    throw new Error(`联系人不存在: ${contactId}`);
  }

  // 获取酒馆角色数据
  const character = getCharacterData(contact);

  // 构建messages数组
  const messages = [];

  // 按order排序
  const sortedItems = presets.items.filter(item => item.enabled).sort((a, b) => a.order - b.order);

  for (const item of sortedItems) {
    let content = item.content;

    // ✅ 通过 item.id 判断，而不是检测占位符
    if (item.id === 'char-info') {
      // 构建角色总条目（传递映射表）
      const charResult = await buildCharacterInfo(contact, character, messageNumberMap, currentNumber);
      content = charResult.content;
      currentNumber = charResult.nextNumber;
    } else if (item.id === 'chat-history') {
      // 构建聊天记录（传递映射表和当前编号）
      const chatResult = await buildChatHistoryInfo(contactId, contact, messageNumberMap, currentNumber);
      content = chatResult.content;
      currentNumber = chatResult.nextNumber;
    } else if (item.id === 'user-pending-ops') {
      // 构建用户待操作（传递映射表和当前编号）
      const pendingResult = await buildUserPendingOps(allPendingMessages, messageNumberMap, currentNumber);
      content = pendingResult.content;
      currentNumber = pendingResult.nextNumber;
    } else if (item.id === 'emoji-library') {
      // 表情包库：动态生成表情包列表 + 用户提示词
      content = await buildEmojiLibrary(item.content);
    }

    // ✅ 变量替换由 SillyTavern 的 MacrosParser 自动处理
    // 手机宏（{{最新消息}}、{{历史消息}}、{{当前时间}}等）会在 API 调用前自动替换

    // 添加到messages（只有内容非空时才添加）
    // ✅ 修复：过滤空字符串，避免API报错
    if (content && content.trim()) {
      messages.push({
        role: item.role || 'system',
        content: content
      });
    } else if (content === '') {
      logger.debug('[ContextBuilder.buildMessagesArray] 跳过空内容条目:', item.label);
    }
  }

  logger.debug('[ContextBuilder.buildMessagesArray] 构建完成，共', messages.length, '条消息');
  logger.debug('[ContextBuilder.buildMessagesArray] 消息编号映射表大小:', messageNumberMap.size);
  logger.debug('[ContextBuilder.buildMessagesArray] messages内容:', JSON.stringify(messages, null, 2));

  return {
    messages,
    messageNumberMap
  };
}

/**
 * 构建角色总条目内容
 * 
 * @description
 * 优先使用角色专属配置（characterPrompts），如果不存在则使用默认逻辑（兼容旧版本）
 * 
 * @private
 * @param {Object} contact - 联系人对象
 * @param {Object|null} character - 酒馆角色数据
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表
 * @param {number} startNumber - 起始编号
 * @returns {Promise<Object>} { content: 角色总条目内容, nextNumber: 下一个可用编号 }
 */
async function buildCharacterInfo(contact, character, messageNumberMap, startNumber) {
  // 检查是否有角色专属配置
  const charPromptConfig = extension_settings.acsusPawsPuffs?.phone?.characterPrompts?.[contact.id];

  if (charPromptConfig && charPromptConfig.items) {
    // 使用角色专属配置构建（传递映射表和编号）
    logger.debug('[ContextBuilder] 使用角色专属配置构建角色总条目:', contact.name);
    return await buildCharacterInfoFromConfig(contact, character, charPromptConfig, messageNumberMap);
  }

  // 兼容旧版本：使用默认逻辑（无编号）
  logger.debug('[ContextBuilder] 使用默认逻辑构建角色总条目:', contact.name);
  let content = `[角色卡-${contact.name}]\n`;

  if (character) {
    content += '[人设]\n';
    content += `${character.description || '（无人设）'}\n`;
    content += '[/人设]\n\n';

    content += '[线下剧情]\n';
    content += await getCharacterTavernContext(character, 5);
    content += '[/线下剧情]\n\n';
  }

  content += `[/角色卡-${contact.name}]`;

  return {
    content,
    nextNumber: startNumber  // 旧版本不加编号，返回原编号
  };
}

/**
 * 根据角色专属配置构建角色总条目
 * @private
 * @param {Object} contact - 联系人对象
 * @param {Object|null} character - 酒馆角色数据
 * @param {Object} config - 角色配置对象
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表（编号→消息ID）
 * @returns {Promise<Object>} { content: 角色总条目内容, nextNumber: 下一个可用编号 }
 */
async function buildCharacterInfoFromConfig(contact, character, config, messageNumberMap) {
  let content = `[角色卡-${contact.name}]\n`;
  let currentNumber = 1;

  // 按order排序，只处理启用的条目
  const enabledItems = config.items.filter(item => item.enabled).sort((a, b) => a.order - b.order);

  for (const item of enabledItems) {
    let itemContent = '';
    let itemNextNumber = currentNumber;

    // 根据类型获取内容
    switch (item.type) {
      case 'auto':
        // 自动获取角色数据
        if (item.content === '__AUTO_CHAR_DESC__' && character) {
          itemContent = character.description || '';
        } else if (item.content === '__AUTO_CHAR_PERSONALITY__' && character) {
          itemContent = character.personality || '';
        } else if (item.content === '__AUTO_CHAR_SCENARIO__' && character) {
          itemContent = character.scenario || '';
        }
        break;

      case 'tavern-context':
        // 线下剧情（异步获取特定角色的聊天记录）
        const count = item.contextCount || 5;
        itemContent = await getCharacterTavernContext(character, count);
        break;

      case 'history-chat':
        // 历史聊天记录（从message-chat-data获取，返回编号映射）
        const historyResult = await buildHistoryChatInfo(contact.id, contact, messageNumberMap);
        itemContent = historyResult.content;
        itemNextNumber = historyResult.nextNumber;
        currentNumber = itemNextNumber;  // 更新当前编号
        break;

      case 'worldbook':
      case 'custom':
        // 世界书条目或自定义条目，直接使用content
        itemContent = item.content || '';
        break;
    }

    // 只添加非空内容
    if (itemContent && itemContent.trim()) {
      // 添加标签（去掉方括号）
      const label = item.label.replace(/^\[|\]$/g, '');
      content += `[${label}]\n${itemContent}\n[/${label}]\n\n`;
    }
  }

  content += `[/角色卡-${contact.name}]`;

  logger.debug('[ContextBuilder] 角色总条目构建完成，使用了', enabledItems.length, '个条目');

  return {
    content,
    nextNumber: currentNumber
  };
}

/**
 * 构建聊天记录内容（最新消息，用于[QQ聊天记录]）
 * 
 * @private
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表（编号→消息ID）
 * @param {number} startNumber - 起始编号（继承历史消息的编号）
 * @returns {Promise<Object>} { content: 聊天记录内容, nextNumber: 下一个可用编号 }
 * 
 * @description
 * 只包含最新的recentCount条消息（不包括excluded的）
 * 优化规则：
 * 1. 临时编号：每条消息加 [#N] 前缀（用于AI引用）
 * 2. 时间智能分组（跨天显示日期，同天只显示时间）
 * 3. 表情消息添加 [表情] 前缀
 * 4. 用户名使用真实姓名（不用"你"）
 * 
 * ⚠️ 注意：此函数只返回历史记录，不包含待发送消息（待发送消息由 buildUserPendingOps 处理）
 */
export async function buildChatHistoryInfo(contactId, contact, messageNumberMap, startNumber = 1) {
  // 动态导入工具函数
  const { formatTimeForAI } = await import('../utils/time-helper.js');
  const { getUserDisplayName } = await import('../utils/contact-display-helper.js');
  const { findEmojiById } = await import('../emojis/emoji-manager-data.js');
  const { getChatSendSettings } = await import('../messages/message-chat-data.js');

  const userName = getUserDisplayName();
  const sendSettings = getChatSendSettings(contactId);

  // ✅ 改用 [角色-XXX] 格式，与AI输出格式保持一致
  let content = `[角色-${contact.name}]\n`;
  content += `[消息]\n`;

  // 加载历史记录
  const allHistory = await loadChatHistory(contactId);

  // 过滤出非排除的消息，取最新的recentCount条
  const validHistory = allHistory.filter(msg => !msg.excluded);
  const recentHistory = validHistory.slice(Math.max(0, validHistory.length - sendSettings.recentCount));

  let currentNumber = startNumber;

  if (recentHistory.length > 0) {
    // 遍历历史消息，带智能时间分组
    recentHistory.forEach((msg, index) => {
      const senderName = msg.sender === 'user' ? userName : contact.name;
      const prevTime = index > 0 ? recentHistory[index - 1].time : null;
      const isFirst = index === 0;

      // 智能时间显示（跨天显示日期，同天显示时间）
      const timeStr = formatTimeForAI(msg.time, prevTime, isFirst);

      // 根据消息类型添加前缀
      let messageContent = msg.content;
      let messagePrefix = '';

      if (msg.type === 'poke') {
        // 戳一戳消息
        messageContent = '[戳一戳]';
      } else if (msg.type === 'emoji') {
        // ✅ 通过ID查找表情包名称（支持改名）
        const emoji = findEmojiById(msg.content);
        if (emoji) {
          messageContent = `[表情]${emoji.name}`;
        } else {
          // 表情包被删除，使用冗余存储的名字
          messageContent = msg.emojiName ? `[表情]${msg.emojiName}` : `[表情包已删除]`;
        }
      } else if (msg.type === 'image') {
        // 图片消息：格式化为 [图片]描述 或 [图片]描述|链接
        messageContent = msg.imageUrl
          ? `[图片]${msg.description}|${msg.imageUrl}`
          : `[图片]${msg.description}`;
      } else if (msg.type === 'quote') {
        // 引用消息：格式化为 [引用]原内容[回复]回复内容
        const quotedText = formatQuotedMessageForAI(msg.quotedMessage);
        messageContent = `[引用]${quotedText}[回复]${msg.replyContent}`;
      } else if (msg.type === 'transfer') {
        // 转账消息：格式化为 [转账]金额元 留言内容
        messageContent = msg.message
          ? `[转账]${msg.amount}元 ${msg.message}`
          : `[转账]${msg.amount}元`;
      } else if (msg.type === 'recalled') {
        // 撤回消息：根据发送者显示不同内容
        if (msg.sender === 'user') {
          // 用户撤回：AI只看到"撤回了一条消息"，看不到原内容
          messageContent = `【${userName}撤回了一条消息】`;
        } else {
          // 角色撤回：AI可以看到撤回了什么（格式：[撤回]原内容）
          messageContent = `[撤回]${msg.originalContent || '(无内容)'}`;
        }
      }

      // 如果消息来自收藏，添加[收藏夹]前缀和原消息信息（同一行）
      if (msg.fromFavorite) {
        const originalTime = msg.favoriteOriginalTime || msg.time;
        const originalTimeStr = formatTimeForAI(originalTime, null, true);
        const originalSender = msg.favoriteOriginalSender || senderName;
        // 去掉 originalTimeStr 末尾的换行符，保持在同一行
        const cleanTimeStr = originalTimeStr.replace(/\n$/, '');
        messagePrefix = `[收藏夹] ${cleanTimeStr}${originalSender}: `;
      }

      // ✅ 添加临时编号 + 保存映射
      if (msg.id) {
        messageNumberMap.set(currentNumber, msg.id);
        content += `[#${currentNumber}] ${timeStr}${senderName}: ${messagePrefix}${messageContent}\n`;
        currentNumber++;
      } else {
        // 旧数据兼容：没有ID的消息不加编号
        content += `${timeStr}${senderName}: ${messagePrefix}${messageContent}\n`;
      }
    });

    // 添加已读标记
    content += '----上方对话user已读-----\n';
  }

  // ✅ 改用 [/消息] [/角色-XXX] 格式
  content += `[/消息]\n`;
  content += `[/角色-${contact.name}]`;

  return {
    content,
    nextNumber: currentNumber
  };
}

/**
 * 格式化引用消息（用于AI上下文）
 * 
 * @private
 * @param {Object} quotedMessage - 被引用的消息
 * @returns {string} 格式化后的文本
 */
function formatQuotedMessageForAI(quotedMessage) {
  if (!quotedMessage) return '未知消息';

  switch (quotedMessage.type) {
    case 'text':
      return quotedMessage.content || '[空文本]';
    case 'emoji':
      return `[表情]${quotedMessage.content || quotedMessage.emojiName || '未知'}`;
    case 'image':
      return `[图片]${quotedMessage.description || '无描述'}`;
    case 'quote':
      // 引用的引用：只引用回复部分，不嵌套
      return quotedMessage.replyContent || '[空回复]';
    default:
      return '[不支持的类型]';
  }
}

/**
 * 构建用户待操作内容（用于[{{user}}本轮操作]）
 * 
 * @private
 * @param {Object} pendingMessages - 所有待发送消息（按联系人分组）
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表
 * @param {number} startNumber - 起始编号
 * @returns {Promise<Object>} { content: 用户待操作内容, nextNumber: 下一个可用编号 }
 * 
 * @description
 * 格式：
 * #提醒：需关注{{user}}本轮操作
 * [{{user}}本轮操作]
 * [给Jerry Hickfang发送消息]
 * [#3] [21:43] 白沉: [表情]企鹅震惊
 * [#4] [21:44] 白沉: 你好
 * [#5] [21:45] 白沉: [约定计划]一起去吃卷饼
 * 
 * [给李四发送消息]
 * [#6] [21:45] 白沉: 在吗
 * 
 * [/{{user}}本轮操作]
 */
async function buildUserPendingOps(pendingMessages, messageNumberMap, startNumber = 1) {
  // 动态导入工具函数
  const { formatTimeForAI } = await import('../utils/time-helper.js');
  const { getUserDisplayName } = await import('../utils/contact-display-helper.js');
  const { findEmojiById } = await import('../emojis/emoji-manager-data.js');
  const { loadContacts } = await import('../contacts/contact-list-data.js');

  const userName = getUserDisplayName();

  // 如果没有待操作，返回空对象
  if (!pendingMessages || Object.keys(pendingMessages).length === 0) {
    return {
      content: '',
      nextNumber: startNumber
    };
  }

  // 开始构建
  let content = `#提醒：需关注{{user}}本轮操作\n`;
  content += `[{{user}}本轮操作]\n`;

  // 加载所有联系人（用于获取角色名）
  const contacts = await loadContacts();

  let currentNumber = startNumber;

  // 遍历所有联系人的待发送消息
  for (const [contactId, messages] of Object.entries(pendingMessages)) {
    if (messages.length === 0) continue;

    // 查找联系人信息
    const contact = contacts.find(c => c.id === contactId);
    const contactName = contact ? contact.name : contactId;

    // 添加联系人分组标题
    content += `[给${contactName}发送消息]\n`;

    // 遍历该联系人的所有待发送消息
    messages.forEach((msg, index) => {
      // 判断是否需要显示日期分组
      const prevTime = index > 0 ? messages[index - 1].time : null;
      const isFirst = index === 0;
      const timeStr = formatTimeForAI(msg.time, prevTime, isFirst);

      // 根据消息类型添加前缀
      let messageContent = msg.content;
      if (msg.type === 'poke') {
        // 戳一戳消息
        messageContent = '[戳一戳]';
      } else if (msg.type === 'emoji') {
        // ✅ 通过ID查找表情包名称（支持改名）
        const emoji = findEmojiById(msg.content);
        if (emoji) {
          messageContent = `[表情]${emoji.name}`;
        } else {
          // 表情包被删除，使用冗余存储的名字
          messageContent = msg.emojiName ? `[表情]${msg.emojiName}` : `[表情包已删除]`;
        }
      } else if (msg.type === 'image') {
        // 图片消息：格式化为 [图片]描述 或 [图片]描述|链接
        messageContent = msg.imageUrl
          ? `[图片]${msg.description}|${msg.imageUrl}`
          : `[图片]${msg.description}`;
      } else if (msg.type === 'recalled') {
        // 撤回消息：用户撤回只显示"撤回了一条消息"（AI看不到原内容）
        messageContent = `【${userName}撤回了一条消息】`;
      } else if (msg.type === 'text' && msg.content?.startsWith('[约定计划')) {
        // 约定计划消息：保持原格式，AI会识别
        messageContent = msg.content;
      }

      // ✅ 处理日期分组和消息编号
      if (msg.id) {
        messageNumberMap.set(currentNumber, msg.id);

        // 检查时间格式是否包含换行（跨天分组）
        if (timeStr.endsWith('\n')) {
          // 跨天：先输出日期分组（不带编号），再输出消息（带编号和时间）
          const date = new Date(msg.time * 1000);
          const hour = String(date.getHours()).padStart(2, '0');
          const minute = String(date.getMinutes()).padStart(2, '0');
          content += timeStr; // 日期分组：[2025-11-05]\n
          content += `[#${currentNumber}] [${hour}:${minute}] ${userName}: ${messageContent}\n`;
        } else {
          // 同一天：正常格式
          content += `[#${currentNumber}] ${timeStr}${userName}: ${messageContent}\n`;
        }
        currentNumber++;
      } else {
        content += `${timeStr}${userName}: ${messageContent}\n`;
      }
    });

    // 添加空行分隔不同联系人
    content += '\n';
  }

  // 检查当前联系人是否有已完成但未输出剧情的计划
  // 注意：这里检查的是所有联系人的计划，不局限于 pendingMessages
  const { getCompletedPlans, updatePlanStatus } = await import('../plans/plan-data.js');

  // 只检查当前正在发送消息的联系人
  for (const [contactId, messages] of Object.entries(pendingMessages)) {
    const completedPlans = getCompletedPlans(contactId);

    // 查找已完成但未输出剧情的计划（通过 status 判断）
    const pendingStoryPlans = completedPlans.filter(p =>
      p.diceResult && p.status === 'completed' && !p.storyGenerated
    );

    if (pendingStoryPlans.length > 0) {
      // 只处理最新的一个计划（避免一次输出太多）
      const plan = pendingStoryPlans[pendingStoryPlans.length - 1];

      content += `\n[临时任务]\n`;
      content += `任务类型：约定计划执行\n`;
      content += `计划内容：${plan.title}\n`;
      content += `骰子结果：${plan.diceResult}/100 - ${plan.outcome}\n`;
      content += `剧情提示：${plan.story}\n\n`;

      content += `请按以下格式输出：\n\n`;
      content += `[约定计划过程]请根据计划内容，结合骰子结果和剧情提示，用50-200字左右描述过程，禁止换行。\n\n`;

      if (plan.options?.includeInnerThought) {
        content += `[约定计划内心印象]请描述角色对这次经历的内心感受（50-100字），禁止换行。\n\n`;
      }

      if (plan.options?.includeRecord) {
        content += `[约定计划过程记录]请简要记录这次经历的关键事件（30-50字），禁止换行。\n\n`;
      }

      content += `必须在角色的[消息]标签之后输出这些格式,输出后再正常发送对话消息\n`;
      content += `注意：是[消息]的标签之后，而不是发完对话消息后再输出，先在[消息]之后输出这些内容\n`;
      content += `[/临时任务]\n`;

      // 标记该计划已生成剧情提示（避免重复生成）
      const { updatePlanStoryGenerated } = await import('../plans/plan-data.js');
      updatePlanStoryGenerated(contactId, plan.id, true);
    }
  }

  content += `[/{{user}}本轮操作]`;

  return {
    content,
    nextNumber: currentNumber
  };
}

/**
 * 构建历史聊天记录内容（用于[历史聊天记录]）
 * 
 * @private
 * @param {string} contactId - 联系人ID
 * @param {Object} contact - 联系人对象
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表（编号→消息ID）
 * @returns {Promise<Object>} { content: 历史聊天记录内容, nextNumber: 下一个可用编号 }
 * 
 * @description
 * 包含最新recentCount之前的historyCount条消息（不包括excluded的）
 * 每条消息加临时编号 [#N]，保存到映射表
 */
export async function buildHistoryChatInfo(contactId, contact, messageNumberMap) {
  // 动态导入工具函数
  const { formatTimeForAI } = await import('../utils/time-helper.js');
  const { getUserDisplayName } = await import('../utils/contact-display-helper.js');
  const { findEmojiById } = await import('../emojis/emoji-manager-data.js');
  const { getChatSendSettings } = await import('../messages/message-chat-data.js');

  const userName = getUserDisplayName();
  const sendSettings = getChatSendSettings(contactId);

  // 加载历史记录
  const allHistory = await loadChatHistory(contactId);

  // 过滤出非排除的消息
  const validHistory = allHistory.filter(msg => !msg.excluded);

  // 计算历史消息范围
  const totalValid = validHistory.length;
  const historyStart = Math.max(0, totalValid - sendSettings.recentCount - sendSettings.historyCount);
  const historyEnd = Math.max(0, totalValid - sendSettings.recentCount);
  const historyMessages = validHistory.slice(historyStart, historyEnd);

  if (historyMessages.length === 0) {
    return { content: '', nextNumber: 1 };  // 没有历史消息
  }

  let content = '';
  let currentNumber = 1;

  // 遍历历史消息
  historyMessages.forEach((msg, index) => {
    const senderName = msg.sender === 'user' ? userName : contact.name;
    const prevTime = index > 0 ? historyMessages[index - 1].time : null;
    const isFirst = index === 0;

    // 智能时间显示
    const timeStr = formatTimeForAI(msg.time, prevTime, isFirst);

    // 根据消息类型添加前缀
    let messageContent = msg.content;
    if (msg.type === 'poke') {
      // 戳一戳消息
      messageContent = '[戳一戳]';
    } else if (msg.type === 'emoji') {
      const emoji = findEmojiById(msg.content);
      if (emoji) {
        messageContent = `[表情]${emoji.name}`;
      } else {
        messageContent = msg.emojiName ? `[表情]${msg.emojiName}` : `[表情包已删除]`;
      }
    } else if (msg.type === 'image') {
      // 图片消息：格式化为 [图片]描述 或 [图片]描述|链接
      messageContent = msg.imageUrl
        ? `[图片]${msg.description}|${msg.imageUrl}`
        : `[图片]${msg.description}`;
    } else if (msg.type === 'quote') {
      // 引用消息：格式化为 [引用]原内容[回复]回复内容
      const quotedText = formatQuotedMessageForAI(msg.quotedMessage);
      messageContent = `[引用]${quotedText}[回复]${msg.replyContent}`;
    }

    // ✅ 添加临时编号 + 保存映射
    if (msg.id) {
      messageNumberMap.set(currentNumber, msg.id);
      content += `[#${currentNumber}] ${timeStr}${senderName}: ${messageContent}\n`;
      currentNumber++;
    } else {
      // 旧数据兼容：没有ID的消息不加编号
      content += `${timeStr}${senderName}: ${messageContent}\n`;
    }
  });

  logger.debug('[ContextBuilder] 历史聊天记录构建完成，共', historyMessages.length, '条');

  return {
    content,
    nextNumber: currentNumber
  };
}

/**
 * 获取预设数据
 * 
 * @description
 * 从extension_settings中读取预设数据
 * 自动修复旧数据（补充缺失的role字段）
 * 
 * @private
 * @returns {Object} 预设数据 { items: [] }
 */
function getPresetData() {
  if (!extension_settings.acsusPawsPuffs) {
    extension_settings.acsusPawsPuffs = {};
  }
  if (!extension_settings.acsusPawsPuffs.phone) {
    extension_settings.acsusPawsPuffs.phone = {};
  }

  // ✅ 如果不存在promptPreset，初始化默认值
  if (!extension_settings.acsusPawsPuffs.phone.promptPreset) {
    logger.warn('[ContextBuilder] 预设数据不存在，初始化默认预设');
    extension_settings.acsusPawsPuffs.phone.promptPreset = {
      items: [
        { id: 'header-jb', type: 'fixed', label: '[头部 破限]', role: 'system', content: '你是一个专业的角色扮演AI，请严格按照角色设定回复。', enabled: true, editable: true, deletable: false, order: 0 },
        { id: 'char-info', type: 'fixed', label: '[角色总条目]', role: 'system', content: '__AUTO_CHARACTERS__', enabled: true, editable: false, deletable: false, hasSubSettings: true, order: 1 },
        { id: 'phone-records', type: 'fixed', label: '[手机相关记录]', role: 'system', content: '空间动态、转账记录等', enabled: true, editable: true, deletable: false, order: 2 },
        { id: 'chat-history', type: 'fixed', label: '[QQ聊天记录]', role: 'system', content: '__AUTO_CHAT_HISTORY__', enabled: true, editable: false, deletable: false, order: 3 },
        { id: 'format-req', type: 'fixed', label: '[格式要求]', role: 'system', content: '请使用以下格式回复：\n[角色-XXX]\n[消息]\n消息内容（空行分隔不同气泡，连续文本在同一个气泡）\n[/消息]\n[/角色-XXX]', enabled: true, editable: true, deletable: false, order: 4 },
        { id: 'footer-jb', type: 'fixed', label: '[尾部 破限]', role: 'user', content: '请立即开始角色扮演，不要说"我明白了"等废话。', enabled: true, editable: true, deletable: false, order: 5 }
      ]
    };
    saveSettingsDebounced();
  }

  const presetData = extension_settings.acsusPawsPuffs.phone.promptPreset;

  // ✅ 数据迁移：补充缺失的role字段（兼容旧版本数据）
  let needsSave = false;
  if (presetData.items) {
    presetData.items.forEach(item => {
      if (!item.role) {
        item.role = 'system';  // 默认system角色
        needsSave = true;
        logger.debug('[ContextBuilder] 为条目补充role字段:', item.id, item.label);
      }

      // ✅ 修复 Google AI 兼容性：footer-jb 必须是 user 角色
      if (item.id === 'footer-jb' && item.role === 'system') {
        item.role = 'user';
        needsSave = true;
        logger.info('[ContextBuilder] 迁移旧数据：将 footer-jb 改为 user 角色（修复 Google AI 兼容性）');
      }
    });

    if (needsSave) {
      logger.info('[ContextBuilder] 旧数据已升级');
      saveSettingsDebounced();
    }
  }

  return presetData;
}

/**
 * 构建表情包库内容
 * 
 * @async
 * @private
 * @param {string} userPrompt - 用户自定义的提示词（在[/表情包库]后面）
 * @returns {Promise<string>} 完整的表情包库内容
 * 
 * @description
 * 动态生成表情包库标签 + 表情包列表 + 用户提示词
 */
async function buildEmojiLibrary(userPrompt) {
  logger.debug('[ContextBuilder.buildEmojiLibrary] 开始构建表情包库');

  // 动态导入表情包数据
  const { getEmojiNames } = await import('../emojis/emoji-manager-data.js');
  const emojiNames = getEmojiNames();

  if (emojiNames.length === 0) {
    logger.debug('[ContextBuilder.buildEmojiLibrary] 没有表情包，跳过');
    return '';  // 没有表情包时返回空字符串（会被过滤掉）
  }

  // 构建完整内容
  let content = '[表情包库]\n';
  content += emojiNames.join('\n');  // 每行一个表情包名称
  content += '\n[/表情包库]\n';

  // 追加用户的提示词
  if (userPrompt && userPrompt.trim()) {
    content += userPrompt.trim();
  }

  logger.debug('[ContextBuilder.buildEmojiLibrary] 构建完成，表情包数量:', emojiNames.length);
  return content;
}

