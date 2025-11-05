/**
 * AI回复解析器
 * @module phone/ai-integration/ai-response-parser
 * 
 * @description
 * 解析AI返回的格式化文本，提取消息和操作
 * 
 * 支持格式（容错解析，不依赖闭合标签）：
 * [角色-XXX]
 * [消息]               ← 必须有（标记消息区开始）
 * 文字内容             ← 每行一个气泡（单个换行符分割）
 * [红包]100           ← 红包消息
 * [转账]100|留言      ← 转账消息
 * [图片]描述          ← 图片消息
 * [/消息]             ← 可选（遇到边界自动结束）
 * 
 * [空间动态]           ← 自动结束消息块（TODO 第三期）
 * [操作-建群]xxx      ← 独立操作（TODO 第二期）
 * 
 * 气泡分割规则：每行一个气泡，空行自动忽略
 * 边界检测：遇到 [空间动态]、[操作-、下一个[角色-、或文本结束时自动结束消息块
 */

import logger from '../../../logger.js';
import { generateMessageId } from '../utils/message-actions-helper.js';
import { findMessageById } from '../messages/message-chat-data.js';
import { getUserDisplayName } from '../utils/contact-display-helper.js';
import { findEmojiByName } from '../emojis/emoji-manager-data.js';

/**
 * 解析AI回复（容错解析，支持多种消息类型）
 * 
 * @async
 * @param {string} response - AI原始回复
 * @param {string} contactId - 联系人ID（用于查找被引用的消息）
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表（编号→消息ID）
 * @returns {Promise<Array<Object>>} 解析后的消息列表
 * @example
 * const messages = await parseAIResponse(response, contactId, messageNumberMap);
 * // 返回：[
 * //   { role: '张三', content: '你好啊', type: 'text' },
 * //   { role: '张三', amount: '100', type: 'redpacket' }
 * // ]
 */
export async function parseAIResponse(response, contactId, messageNumberMap) {
  logger.info('[ResponseParser] 开始解析AI回复，长度:', response.length, '编号映射表大小:', messageNumberMap?.size || 0);

  const messages = [];

  // 第一步：分割角色块（用边界检测，不依赖闭合标签）
  const roleBlocks = extractRoleBlocks(response);

  roleBlocks.forEach(block => {
    const { roleName, content } = block;
    logger.debug('[ResponseParser] 解析角色区块:', roleName);

    // 第二步：提取消息内容
    const messagesContent = extractMessagesContent(content);

    if (!messagesContent) {
      logger.warn('[ResponseParser] 未找到[消息]标签，跳过该角色');
      return;
    }

    // 第三步：解析消息内容（按单个换行符分隔气泡，忽略空行）
    const bubbles = messagesContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    bubbles.forEach(bubble => {
      const parsed = parseMessageBubble(bubble, roleName);
      if (parsed) {
        // 添加唯一ID和时间戳（AI消息也需要ID避免误删）
        parsed.id = generateMessageId();
        parsed.time = Math.floor(Date.now() / 1000);
        messages.push(parsed);
      }
    });

    logger.debug('[ResponseParser] 该角色提取到', bubbles.length, '条消息');
  });

  // 第四步：处理引用消息和计划响应占位符（使用编号映射表精确查找）
  await processQuotePlaceholders(messages, contactId, messageNumberMap);
  await processPlanResponsePlaceholders(messages, contactId, messageNumberMap);

  logger.info('[ResponseParser] 解析完成，共', messages.length, '条消息');
  return messages;
}

/**
 * 处理引用消息占位符
 * 
 * @private
 * @async
 * @param {Array<Object>} messages - 消息列表
 * @param {string} contactId - 联系人ID
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表（编号→消息ID）
 * 
 * @description
 * 使用编号映射表精确查找被引用的消息（零歧义）
 * AI回复格式：[引用]#3[回复]回复内容
 */
async function processQuotePlaceholders(messages, contactId, messageNumberMap) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === 'quote-placeholder') {
      // ✅ 从映射表查找原消息ID（精确匹配）
      const quotedMsgId = messageNumberMap.get(msg.refNumber);

      if (!quotedMsgId) {
        // 编号不存在，降级为普通文字消息
        messages[i] = {
          id: msg.id,
          time: msg.time,
          role: msg.role,
          sender: 'contact',
          type: 'text',
          content: `[引用]#${msg.refNumber}[回复]${msg.replyContent}`
        };

        logger.warn('[ResponseParser] 引用编号不存在:', msg.refNumber, '降级为文字消息');
        continue;
      }

      // ✅ 根据ID精确查找原消息
      const quotedMsg = await findMessageById(contactId, quotedMsgId);

      if (quotedMsg) {
        // 转换为真正的引用消息
        messages[i] = {
          id: msg.id,
          time: msg.time,
          role: msg.role,
          sender: 'contact',
          type: 'quote',
          quotedMessage: {
            id: quotedMsg.id,
            sender: quotedMsg.sender,
            senderName: quotedMsg.sender === 'user'
              ? getUserDisplayName()
              : msg.role,
            time: quotedMsg.time,
            type: quotedMsg.type,
            content: quotedMsg.content,
            emojiName: quotedMsg.emojiName,
            imageUrl: quotedMsg.imageUrl,
            description: quotedMsg.description,
            replyContent: quotedMsg.replyContent  // ✅ 复制replyContent（引用的引用需要）
          },
          replyContent: msg.replyContent
        };

        logger.info('[ResponseParser] 引用消息已转换，编号#', msg.refNumber, '→ ID:', quotedMsgId.substring(0, 20));
      } else {
        // 原消息ID存在但找不到数据（可能被删除），降级为文字消息
        messages[i] = {
          id: msg.id,
          time: msg.time,
          role: msg.role,
          sender: 'contact',
          type: 'text',
          content: `[引用]#${msg.refNumber}[回复]${msg.replyContent}`
        };

        logger.warn('[ResponseParser] 引用消息的原消息已被删除，编号#', msg.refNumber, '降级为文字消息');
      }
    }
  }
}

/**
 * 处理约定计划响应占位符
 * 
 * @private
 * @async
 * @param {Array<Object>} messages - 消息列表
 * @param {string} contactId - 联系人ID
 * @param {Map<number, string>} messageNumberMap - 消息编号映射表
 * 
 * @description
 * 处理 AI 对约定计划的响应（接受/拒绝）
 * AI回复格式：[回复]#3 [约定计划]{{char}}接受了约定计划
 * 如果接受，自动掷骰子并更新计划状态
 */
async function processPlanResponsePlaceholders(messages, contactId, messageNumberMap) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.type === 'plan-response-placeholder') {
      // ✅ 从映射表查找原计划消息ID
      const planMsgId = messageNumberMap.get(msg.refNumber);

      if (!planMsgId) {
        // 编号不存在，降级为普通文字消息
        messages[i] = {
          id: msg.id,
          time: msg.time,
          role: msg.role,
          sender: 'contact',
          type: 'text',
          content: `[回复]#${msg.refNumber} ${msg.content}`
        };

        logger.warn('[ResponseParser] 计划响应编号不存在:', msg.refNumber, '降级为文字消息');
        continue;
      }

      // ✅ 查找原计划消息
      const planMsg = await findMessageById(contactId, planMsgId);

      if (!planMsg || !planMsg.content?.startsWith('[约定计划]')) {
        // 原消息不是计划消息，降级为文字消息
        messages[i] = {
          id: msg.id,
          time: msg.time,
          role: msg.role,
          sender: 'contact',
          type: 'text',
          content: msg.content
        };

        logger.warn('[ResponseParser] 引用的不是计划消息，降级为文字消息');
        continue;
      }

      // ✅ 解析响应内容（接受/拒绝）
      const isAccepted = msg.content.includes('接受');
      const isRejected = msg.content.includes('拒绝');

      if (isAccepted) {
        // 角色接受计划：自动掷骰子
        const { updatePlanStatus, getPlanByMessageId } = await import('../plans/plan-data.js');
        
        let plan = getPlanByMessageId(contactId, planMsgId);
        
        if (plan) {
          // 更新状态为已接受
          updatePlanStatus(contactId, plan.id, 'accepted');
          
          // 自动掷骰子（角色接受时立即执行）
          const diceResult = Math.floor(Math.random() * 100) + 1;
          const outcome = diceResult <= 40 ? '顺利' : diceResult <= 80 ? '麻烦' : '好事';
          const storyTemplates = {
            '顺利': ['一切都很顺利，没有发生意外', '过程很愉快，双方都很满意', '按照计划完成，气氛融洽'],
            '麻烦': ['遇到了一些小波折，但最终还是完成了', '过程中出现了小意外，增添了一些趣味', '发生了点小麻烦，不过也不是什么大事'],
            '好事': ['意外收获了惊喜！', '发生了意想不到的好事', '运气真好，遇到了特别开心的事']
          };
          const story = storyTemplates[outcome][Math.floor(Math.random() * storyTemplates[outcome].length)];
          
          const { updatePlanResult } = await import('../plans/plan-data.js');
          updatePlanResult(contactId, plan.id, {
            diceResult,
            outcome,
            story,
            options: {}
          });
          
          // 更新原计划消息为已完成
          const { updateMessage } = await import('../messages/message-chat-data.js');
          await updateMessage(contactId, planMsgId, {
            content: `[约定计划已完成]${plan.title}`
          });
          
          logger.info('[ResponseParser] 角色接受计划，自动掷骰子:', diceResult, outcome);
        }
      } else if (isRejected) {
        // 角色拒绝计划：更新状态
        const { updatePlanStatus, getPlanByMessageId } = await import('../plans/plan-data.js');
        const plan = getPlanByMessageId(contactId, planMsgId);
        
        if (plan) {
          updatePlanStatus(contactId, plan.id, 'rejected');
          logger.info('[ResponseParser] 角色拒绝计划:', plan.title);
        }
      }

      // 转换为文本消息
      messages[i] = {
        id: msg.id,
        time: msg.time,
        role: msg.role,
        sender: 'contact',
        type: 'text',
        content: msg.content
      };

      logger.info('[ResponseParser] 计划响应已处理，编号#', msg.refNumber, '→', isAccepted ? '接受' : '拒绝');
    }
  }
}

/**
 * 提取角色块（边界检测，不依赖闭合标签）
 * 
 * @param {string} text - AI原始回复
 * @returns {Array<Object>} 角色块数组 [{ roleName, content }]
 */
function extractRoleBlocks(text) {
  const blocks = [];
  const lines = text.split('\n');
  let currentRole = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const roleMatch = line.match(/^\[角色-(.+?)\]/);

    if (roleMatch) {
      // 遇到新角色块，保存上一个
      if (currentRole) {
        blocks.push({
          roleName: currentRole,
          content: currentContent.join('\n')
        });
      }

      // 开始新角色块
      currentRole = roleMatch[1];
      currentContent = [];
    } else if (currentRole) {
      // 收集当前角色的内容
      currentContent.push(line);
    }
  }

  // 保存最后一个角色块
  if (currentRole) {
    blocks.push({
      roleName: currentRole,
      content: currentContent.join('\n')
    });
  }

  return blocks;
}

/**
 * 提取消息内容（边界检测）
 * 
 * @param {string} content - 角色块内容
 * @returns {string|null} 消息内容（不含标签）
 */
function extractMessagesContent(content) {
  // 查找 [消息] 标签位置
  const startMatch = content.match(/\[消息\]/);
  if (!startMatch) {
    return null;
  }

  const startIndex = startMatch.index + '[消息]'.length;

  // 查找边界（按优先级）
  const boundaries = [
    { tag: '[/消息]', index: content.indexOf('[/消息]', startIndex) },
    { tag: '[空间动态]', index: content.indexOf('[空间动态]', startIndex) },
    { tag: '[操作-', index: content.indexOf('[操作-', startIndex) },
  ].filter(b => b.index !== -1);

  // 找到最近的边界
  if (boundaries.length > 0) {
    const nearestBoundary = boundaries.sort((a, b) => a.index - b.index)[0];
    return content.substring(startIndex, nearestBoundary.index);
  }

  // 没有边界，取到内容结束
  return content.substring(startIndex);
}

/**
 * 解析单个消息气泡（识别消息类型）
 * 
 * @param {string} bubble - 单个气泡内容
 * @param {string} roleName - 角色名称
 * @returns {Object|null} 解析后的消息对象
 */
function parseMessageBubble(bubble, roleName) {
  // 1. 撤回消息：[撤回]原消息内容
  const recallMatch = bubble.match(/^\[撤回\](.+)$/);
  if (recallMatch) {
    const originalContent = recallMatch[1].trim();

    logger.debug('[ResponseParser] 撤回消息:', originalContent.substring(0, 20));

    // 返回撤回消息占位符（需要先显示原消息，再变成撤回提示）
    return {
      role: roleName,
      sender: 'contact',
      type: 'recalled-pending',  // 待撤回状态（会触发动画）
      originalContent: originalContent,
      originalType: 'text',  // 默认为文字类型
      canPeek: true  // 用户可以偷看
    };
  }

  // 2. 引用消息：[引用]#N[回复]回复内容（编号格式，精确匹配）
  const quoteNumberMatch = bubble.match(/^\[引用\]#(\d+)\[回复\](.+)$/);
  if (quoteNumberMatch) {
    const refNumber = parseInt(quoteNumberMatch[1]);
    const replyContent = quoteNumberMatch[2].trim();

    logger.debug('[ResponseParser] 引用消息（编号格式）:', { refNumber, replyContent });

    // 返回引用消息占位符（需要在processQuotePlaceholders中查找原消息）
    return {
      role: roleName,
      type: 'quote-placeholder',
      refNumber,
      replyContent
    };
  }

  // 兼容：引用消息旧格式（文本匹配，已废弃，仅用于降级）
  const quoteTextMatch = bubble.match(/^\[引用\](.+?)\[回复\](.+)$/);
  if (quoteTextMatch) {
    const quotedContent = quoteTextMatch[1].trim();
    const replyContent = quoteTextMatch[2].trim();

    logger.warn('[ResponseParser] 检测到旧格式引用消息（无编号），降级为文字消息');

    // 直接降级为文字消息（不支持旧格式）
    return {
      role: roleName,
      type: 'text',
      content: `[引用]${quotedContent}[回复]${replyContent}`
    };
  }

  // 2.5 约定计划响应：[回复]#N [约定计划]接受/拒绝了约定计划
  const planResponseMatch = bubble.match(/^\[回复\]#(\d+)\s*\[约定计划\](.+)$/);
  if (planResponseMatch) {
    const refNumber = parseInt(planResponseMatch[1]);
    const responseContent = planResponseMatch[2].trim();

    logger.debug('[ResponseParser] 约定计划响应（编号格式）:', { refNumber, responseContent });

    // 返回计划响应占位符（需要在后续处理中关联计划）
    return {
      role: roleName,
      type: 'plan-response-placeholder',
      refNumber,
      content: `[约定计划]${responseContent}`,
      sender: 'contact'
    };
  }

  // 3. 表情消息：[表情]名称 → 转换为ID存储
  const emojiMatch = bubble.match(/^\[表情\](.+)$/);
  if (emojiMatch) {
    const emojiName = emojiMatch[1].trim();
    const emoji = findEmojiByName(emojiName);
    
    if (emoji) {
      // 找到表情包：存储ID（与用户发送格式一致）
      logger.debug('[ResponseParser] 表情消息（已转换）:', emojiName, '→ ID:', emoji.id.substring(0, 20));
      return {
        role: roleName,
        content: emoji.id,  // 存储ID
        emojiName: emoji.name,  // 冗余存储名称（表情包删除后保留语境）
        type: 'emoji'
      };
    } else {
      // 表情包不存在：只存储名称，渲染时会显示"(已删除)"
      logger.warn('[ResponseParser] 表情包不存在:', emojiName);
      return {
        role: roleName,
        content: emojiName,  // 存储名称（降级）
        emojiName: emojiName,
        type: 'emoji'
      };
    }
  }

  // 4. 红包消息：[红包]金额（支持多种格式）
  // 支持格式：[红包]100 / [红包]¥100 / [红包]88.88
  const redpacketMatch = bubble.match(/^\[红包\]\s*(.+)$/);
  if (redpacketMatch) {
    const rest = redpacketMatch[1].trim();

    // 提取金额（支持可选的 ¥ 符号和小数）
    const amountMatch = rest.match(/^¥?\s*(\d+(?:\.\d+)?)/);
    if (!amountMatch) {
      // 格式错误，降级为普通文本
      logger.warn('[ResponseParser] 红包格式错误，降级为文本:', bubble);
      return { role: roleName, content: bubble, type: 'text' };
    }

    const amount = parseFloat(amountMatch[1]);
    logger.debug('[ResponseParser] 红包消息:', amount);
    return {
      role: roleName,
      amount,
      type: 'redpacket'
    };
  }

  // 3. 转账消息：[转账]金额|留言（支持多种格式）
  // 支持格式：
  // - [转账]500
  // - [转账]¥500
  // - [转账]500|留言
  // - [转账]¥500|留言
  // - [转账]500-留言
  // - [转账]¥500-留言
  // - [转账]500 留言
  // - [转账]¥500 留言
  const transferMatch = bubble.match(/^\[转账\]\s*(.+)$/);
  if (transferMatch) {
    const rest = transferMatch[1].trim();

    // 提取金额（支持可选的 ¥ 符号和小数）
    const amountMatch = rest.match(/^¥?\s*(\d+(?:\.\d+)?)/);
    if (!amountMatch) {
      // 格式错误（[转账]后面不是数字），降级为普通文本
      logger.warn('[ResponseParser] 转账格式错误，降级为文本:', bubble);
      return { role: roleName, content: bubble, type: 'text' };
    }

    const amount = parseFloat(amountMatch[1]);

    // 提取留言（去掉金额部分，去掉前面的分隔符）
    let message = rest.substring(amountMatch[0].length).trim();
    // 如果开头是 | 或 - 或空格，去掉
    message = message.replace(/^[|\-\s]+/, '');

    logger.debug('[ResponseParser] 转账消息:', amount, message || '(无留言)');
    return {
      role: roleName,
      amount,
      message,
      type: 'transfer'
    };
  }

  // 4. 图片消息：[图片]描述 或 [图片]描述|链接
  const imageMatch = bubble.match(/^\[图片\](.+)$/);
  if (imageMatch) {
    const parts = imageMatch[1].split('|');
    const description = parts[0].trim();
    const imageUrl = parts[1] ? parts[1].trim() : undefined;

    logger.debug('[ResponseParser] 图片消息:', { description, imageUrl });

    const result = {
      role: roleName,
      description,
      type: 'image'
    };

    // 如果有URL，添加到结果中
    if (imageUrl) {
      result.imageUrl = imageUrl;
    }

    return result;
  }

  // 5. 视频消息：[视频]描述
  const videoMatch = bubble.match(/^\[视频\](.+)$/);
  if (videoMatch) {
    logger.debug('[ResponseParser] 视频消息:', videoMatch[1]);
    return {
      role: roleName,
      description: videoMatch[1].trim(),
      type: 'video'
    };
  }

  // 6. 文件消息：[文件]文件名|大小
  const fileMatch = bubble.match(/^\[文件\](.+?)\|(.+)$/);
  if (fileMatch) {
    logger.debug('[ResponseParser] 文件消息:', fileMatch[1], fileMatch[2]);
    return {
      role: roleName,
      filename: fileMatch[1].trim(),
      size: fileMatch[2].trim(),
      type: 'file'
    };
  }

  // 7. 普通文字消息
  logger.debug('[ResponseParser] 文字消息:', bubble.substring(0, 20) + '...');
  return {
    role: roleName,
    content: bubble,
    type: 'text'
  };
}

/**
 * 验证AI回复格式是否正确
 * 
 * @param {string} response - AI原始回复
 * @returns {boolean} 是否格式正确
 */
export function validateAIResponse(response) {
  // 检查是否包含角色标签
  const hasRoleTag = /\[角色-.+?\]/.test(response);

  if (!hasRoleTag) {
    logger.warn('[ResponseParser] 格式错误：缺少[角色-XXX]标签');
    return false;
  }

  // 检查是否包含消息标签
  const hasMessageTag = /\[消息\]/.test(response);

  if (!hasMessageTag) {
    logger.warn('[ResponseParser] 格式错误：缺少[消息]标签');
    return false;
  }

  return true;
}

/**
 * 从角色名称匹配联系人ID
 * 
 * @param {string} roleName - 角色名称
 * @param {Array<Object>} contacts - 联系人列表
 * @returns {string|null} 联系人ID
 */
export function matchContactId(roleName, contacts) {
  // 精确匹配
  let contact = contacts.find(c => c.name === roleName);

  if (contact) {
    return contact.id;
  }

  // 模糊匹配（去掉空格）
  contact = contacts.find(c => c.name.replace(/\s/g, '') === roleName.replace(/\s/g, ''));

  if (contact) {
    logger.debug('[ResponseParser] 模糊匹配成功:', roleName, '→', contact.name);
    return contact.id;
  }

  logger.warn('[ResponseParser] 未找到对应的联系人:', roleName);
  return null;
}

