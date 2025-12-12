/**
 * 多选模式管理器
 * @module phone/messages/message-multiselect-ui
 * 
 * @description
 * 负责聊天页面的多选模式管理：
 * - 进入/退出多选模式
 * - 显示/隐藏复选框
 * - 显示/隐藏底部工具栏
 * - 获取选中的消息
 * 
 * 不负责具体业务逻辑（转发、收藏、删除由调用方处理）
 */

import logger from '../../../logger.js';
import { addFavorite } from '../favorites/favorites-data.js';
import { loadChatHistory, saveChatHistory, saveChatMessage } from './message-chat-data.js';
import { showSuccessToast, showErrorToast } from '../ui-components/toast-notification.js';
import { showConfirmPopup } from '../utils/popup-helper.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { generateMessageId } from '../utils/message-actions-helper.js';
import { getContactDisplayName, getUserDisplayName } from '../utils/contact-display-helper.js';
import { showContactSelectorPopup } from '../utils/contact-selector-popup.js';

/**
 * 进入多选模式
 * 
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * 
 * @description
 * 1. 显示所有消息的复选框（左侧）
 * 2. 显示底部工具栏
 * 3. 隐藏输入区域
 * 4. 添加多选模式标记类
 */
export function enterMultiSelectMode(pageContainer) {
  logger.info('[MultiSelect] 进入多选模式');

  // 1. 添加多选模式类（用于CSS控制）
  pageContainer.classList.add('multiselect-mode');

  // 2. 显示所有消息的复选框
  const checkboxes = pageContainer.querySelectorAll('.chat-multiselect-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.style.display = 'block';
  });

  // 3. 显示底部工具栏
  const toolbar = pageContainer.querySelector('.chat-multiselect-toolbar');
  if (toolbar) {
    toolbar.style.display = 'flex';
  } else {
    logger.warn('[MultiSelect] 找不到工具栏元素');
  }

  // 4. 隐藏输入区域
  const inputArea = pageContainer.querySelector('.chat-input-area');
  if (inputArea) {
    inputArea.style.display = 'none';
  }

  logger.debug('[MultiSelect] 多选模式已激活');
}

/**
 * 退出多选模式
 * 
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * 
 * @description
 * 1. 隐藏所有复选框
 * 2. 清空所有选中状态
 * 3. 隐藏底部工具栏
 * 4. 显示输入区域
 * 5. 移除多选模式标记类
 */
export function exitMultiSelectMode(pageContainer) {
  logger.info('[MultiSelect] 退出多选模式');

  // 1. 移除多选模式类
  pageContainer.classList.remove('multiselect-mode');

  // 2. 隐藏并清空所有复选框
  const checkboxes = pageContainer.querySelectorAll('.chat-multiselect-checkbox');
  checkboxes.forEach(checkbox => {
    checkbox.style.display = 'none';
    checkbox.checked = false;
  });

  // 3. 隐藏底部工具栏
  const toolbar = pageContainer.querySelector('.chat-multiselect-toolbar');
  if (toolbar) {
    toolbar.style.display = 'none';
  }

  // 4. 显示输入区域
  const inputArea = pageContainer.querySelector('.chat-input-area');
  if (inputArea) {
    inputArea.style.display = 'flex';
  }

  logger.debug('[MultiSelect] 多选模式已退出');
}

/**
 * 获取选中的消息
 * 
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * @returns {Array<Object>} 选中的消息对象数组
 * 
 * @description
 * 遍历所有选中的复选框，提取消息数据
 * 返回格式：[{ time, sender, content, type, ... }]
 */
export function getSelectedMessages(pageContainer) {
  const selectedMessages = [];
  const checkboxes = pageContainer.querySelectorAll('.chat-multiselect-checkbox:checked');

  checkboxes.forEach(checkbox => {
    const messageContainer = checkbox.closest('.chat-msg');
    if (!messageContainer) return;

    // 从 data-* 属性提取消息数据
    const messageData = {
      messageId: messageContainer.dataset.messageId,
      contactId: messageContainer.dataset.contactId,
      time: parseInt(messageContainer.dataset.time),
      sender: messageContainer.dataset.sender,
      type: messageContainer.dataset.type || 'text',
      content: messageContainer.dataset.content || '',
    };

    // 处理特殊消息类型的额外数据
    if (messageData.type !== 'text') {
      try {
        const extraData = messageContainer.dataset.extraData;
        if (extraData) {
          Object.assign(messageData, JSON.parse(extraData));
        }
      } catch (error) {
        logger.warn('[MultiSelect] 解析消息额外数据失败:', error);
      }
    }

    selectedMessages.push(messageData);
  });

  logger.debug('[MultiSelect] 获取选中的消息:', selectedMessages.length, '条');
  return selectedMessages;
}

/**
 * 清空所有选中状态
 * 
 * @param {HTMLElement} pageContainer - 聊天页面容器
 */
export function clearSelection(pageContainer) {
  const checkboxes = pageContainer.querySelectorAll('.chat-multiselect-checkbox:checked');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
  logger.debug('[MultiSelect] 已清空选中状态');
}

/**
 * 绑定工具栏按钮事件
 * 
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 绑定底部工具栏的按钮事件：
 * - 转发：占位符（显示Toast）
 * - 收藏：批量保存到收藏夹
 * - 删除：批量删除消息
 * - 取消：退出多选模式
 */
export function bindMultiSelectToolbar(pageContainer, contactId) {
  const toolbar = pageContainer.querySelector('.chat-multiselect-toolbar');
  if (!toolbar) {
    logger.error('[MultiSelect] 找不到工具栏元素，无法绑定事件');
    return;
  }

  // 转发按钮（占位符）
  const forwardBtn = toolbar.querySelector('.multiselect-forward-btn');
  if (forwardBtn) {
    forwardBtn.addEventListener('click', () => {
      handleForward(pageContainer, contactId);
    });
  }

  // 收藏按钮
  const favoriteBtn = toolbar.querySelector('.multiselect-favorite-btn');
  if (favoriteBtn) {
    favoriteBtn.addEventListener('click', () => {
      handleFavorite(pageContainer, contactId);
    });
  }

  // 删除按钮
  const deleteBtn = toolbar.querySelector('.multiselect-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      handleDelete(pageContainer, contactId);
    });
  }

  // 取消按钮
  const cancelBtn = toolbar.querySelector('.multiselect-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      exitMultiSelectMode(pageContainer);
    });
  }

  logger.debug('[MultiSelect] 工具栏事件已绑定');
}

/**
 * 创建转发消息对象
 * 
 * @private
 * @param {Array<Object>} messages - 选中的消息列表
 * @param {string} originalContactName - 原角色显示名称
 * @returns {Object} 转发消息对象
 * 
 * @description
 * 将选中的消息转换为转发格式：
 * - id: 唯一ID（用于临时编号映射）
 * - type: 'forwarded'
 * - sender: 'user' （转发消息始终是用户发送）
 * - originalContactName: 原角色名
 * - messages: 格式化后的消息列表（包含 senderName 和完整时间戳）
 */
function createForwardedMessage(messages, originalContactName) {
  const userName = getUserDisplayName();

  // 格式化消息列表（补充发送者名称）
  const formattedMessages = messages.map(msg => {
    // 确定发送者显示名称
    let senderName;
    if (msg.sender === 'user') {
      senderName = '{{user}}';  // 用占位符，渲染时替换
    } else {
      senderName = originalContactName;  // 角色名
    }

    // 返回完整消息对象（保留所有字段，用于完整渲染）
    return {
      ...msg,
      senderName: senderName
    };
  });

  // 格式化消息内容供后台使用
  const contentLines = formattedMessages.map(msg => {
    // 获取发送者名称
    const sender = msg.senderName === '{{user}}' ? '{{user}}' : originalContactName;
    
    // 获取消息内容文本
    let messageText = '';
    switch (msg.type) {
      case 'text':
        messageText = msg.content || '';
        break;
      case 'emoji':
        messageText = `[表情] ${msg.emojiName || ''}`;
        break;
      case 'image':
        messageText = `[图片] ${msg.description || ''}`;
        break;
      case 'quote':
        messageText = `[引用] ${msg.replyContent || ''}`;
        break;
      case 'transfer':
        messageText = `[转账] ¥${msg.amount || '0'}`;
        break;
      case 'gift-membership':
        const giftTypeText = msg.membershipType === 'vip' ? 'VIP' : 'SVIP';
        messageText = `[送会员] ${msg.months}个月${giftTypeText}`;
        break;
      case 'buy-membership':
        const buyTypeText = msg.membershipType === 'vip' ? 'VIP' : 'SVIP';
        messageText = `[开会员] ${msg.months}个月${buyTypeText}`;
        break;
      case 'redpacket':
        messageText = `[红包] ¥${msg.amount || '0'}`;
        break;
      case 'video':
        messageText = `[视频] ${msg.description || ''}`;
        break;
      case 'file':
        messageText = `[文件] ${msg.filename || ''}`;
        break;
      case 'recalled':
        messageText = '[撤回的消息]';
        break;
      default:
        messageText = msg.content || '[未知消息]';
    }
    
    return `${sender}: ${messageText}`;
  }).join('\n');

  // 构造完整的content字段
  const fullContent = `[转发消息]\n[{{user}}与${originalContactName}的聊天记录]\n${contentLines}\n[/{{user}}与${originalContactName}的聊天记录]\n[/转发消息]`;

  // 构造转发消息对象
  const forwardedMessage = {
    id: generateMessageId(),  // 生成唯一ID（用于临时编号映射）
    type: 'forwarded',
    sender: 'user',  // 转发消息始终是用户发送
    time: Math.floor(Date.now() / 1000),  // 转换为秒级时间戳
    content: fullContent,  // 完整的聊天记录内容
    originalContactName: originalContactName,
    messages: formattedMessages
  };

  logger.debug('[MultiSelect] 创建转发消息:', forwardedMessage);
  return forwardedMessage;
}

/**
 * 处理转发操作
 * 
 * @private
 * @async
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * @param {string} contactId - 当前聊天的联系人ID
 * 
 * @description
 * 转发流程：
 * 1. 检查是否选择了消息
 * 2. 显示联系人选择弹窗（排除当前角色）
 * 3. 格式化为转发消息对象
 * 4. 保存到目标联系人的聊天记录
 * 5. 退出多选模式
 */
async function handleForward(pageContainer, contactId) {
  const selected = getSelectedMessages(pageContainer);
  
  if (selected.length === 0) {
    showErrorToast('请先选择消息');
    return;
  }

  logger.info('[MultiSelect] 开始转发:', selected.length, '条消息');

  try {
    // 1. 显示联系人选择弹窗（排除当前角色）
    const targetContactIds = await showContactSelectorPopup({
      multiple: true,
      exclude: [contactId],
      title: `转发给（已选${selected.length}条消息）`
    });

    if (!targetContactIds || targetContactIds.length === 0) {
      logger.debug('[MultiSelect] 用户取消转发');
      return;
    }

    logger.info('[MultiSelect] 选择转发目标:', targetContactIds);

    // 2. 加载联系人信息
    const contacts = await loadContacts();
    const currentContact = contacts.find(c => c.id === contactId);

    if (!currentContact) {
      showErrorToast('当前联系人信息获取失败');
      return;
    }

    const currentContactName = getContactDisplayName(currentContact);

    // 3. 格式化为转发消息对象
    const forwardedMessage = createForwardedMessage(selected, currentContactName);

    // 4. 批量发送到目标联系人
    let successCount = 0;
    for (const targetId of targetContactIds) {
      try {
        await saveChatMessage(targetId, forwardedMessage);
        successCount++;
        logger.debug('[MultiSelect] 转发成功:', targetId);
      } catch (error) {
        logger.error('[MultiSelect] 转发失败:', targetId, error);
      }
    }

    // 5. 显示结果并退出多选模式
    if (successCount === targetContactIds.length) {
      showSuccessToast(`已转发给 ${successCount} 个联系人`);
    } else {
      showErrorToast(`转发部分失败（成功${successCount}/${targetContactIds.length}）`);
    }

    // 清空选中状态并退出多选模式
    clearSelection(pageContainer);
    exitMultiSelectMode(pageContainer);

    // TODO: AI转发功能（第二期）
    // AI可以输出格式：[转发和xxx的消息]\n角色名:内容\n...\n[/转发和xxx的消息]
    // 前端解析后生成 forwarded 消息对象
    // 编造的角色标记 isFake: true，使用白色问号头像

  } catch (error) {
    logger.error('[MultiSelect] 转发失败:', error);
    showErrorToast('转发失败，请重试');
  }
}

/**
 * 处理收藏操作
 * 
 * @private
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * @param {string} contactId - 联系人ID
 */
async function handleFavorite(pageContainer, contactId) {
  const selected = getSelectedMessages(pageContainer);
  
  if (selected.length === 0) {
    showErrorToast('请先选择消息');
    return;
  }

  try {
    logger.info('[MultiSelect] 批量收藏消息:', selected.length, '条');
    
    // 加载联系人信息
    const contacts = await loadContacts();
    const contact = contacts.find(c => c.id === contactId);
    
    if (!contact) {
      logger.error('[MultiSelect] 联系人不存在:', contactId);
      showErrorToast('联系人信息获取失败');
      return;
    }
    
    // 获取联系人显示名称和头像
    const contactName = getContactDisplayName(contact);
    const contactAvatar = contact.avatar || '';
    
    // 循环调用收藏功能（因为收藏模块没有批量接口）
    for (const msg of selected) {
      // 补全联系人信息
      const favoriteData = {
        ...msg,
        contactId: contactId,
        contactName: contactName,
        contactAvatar: contactAvatar,
        originalTimestamp: msg.time
      };
      
      addFavorite(favoriteData);
    }
    
    showSuccessToast(`已收藏 ${selected.length} 条消息`);
    
    // 清空选中状态并退出多选模式
    clearSelection(pageContainer);
    exitMultiSelectMode(pageContainer);
    
  } catch (error) {
    logger.error('[MultiSelect] 批量收藏失败:', error);
    showErrorToast('收藏失败，请重试');
  }
}

/**
 * 处理删除操作
 * 
 * @private
 * @param {HTMLElement} pageContainer - 聊天页面容器
 * @param {string} contactId - 联系人ID
 */
async function handleDelete(pageContainer, contactId) {
  const selected = getSelectedMessages(pageContainer);
  
  if (selected.length === 0) {
    showErrorToast('请先选择消息');
    return;
  }

  // 二次确认
  const confirmed = await showConfirmPopup(
    '确认删除',
    `确定删除 ${selected.length} 条消息吗？`
  );

  if (!confirmed) return;

  try {
    logger.info('[MultiSelect] 批量删除消息:', selected.length, '条');
    
    // 加载聊天记录（返回的是数组，不是对象）
    const history = await loadChatHistory(contactId);
    if (!history || !Array.isArray(history)) {
      showErrorToast('读取聊天记录失败');
      return;
    }

    // 提取要删除的消息ID（使用唯一ID而非time，避免误删同一秒的多条消息）
    const deleteIds = new Set(selected.map(msg => msg.messageId));
    
    // 过滤掉要删除的消息（匹配 id 字段）
    const originalCount = history.length;
    const updatedHistory = history.filter(msg => !deleteIds.has(msg.id));
    
    // 保存更新后的聊天记录
    await saveChatHistory(contactId, updatedHistory);
    
    // 🎯 同步删除计划数据（如果选中的消息包含计划消息）
    try {
      const { getPlanByMessageId, deletePlan } = await import('../plans/plan-data.js');
      let deletedPlanCount = 0;
      
      for (const msg of selected) {
        // 识别计划消息
        if (msg.content?.startsWith('[约定计划')) {
          const plan = getPlanByMessageId(contactId, msg.messageId);
          if (plan) {
            deletePlan(contactId, plan.id);
            deletedPlanCount++;
            logger.debug('[MultiSelect] 已删除计划:', plan.title);
          }
        }
      }
      
      if (deletedPlanCount > 0) {
        logger.info('[MultiSelect] 共删除', deletedPlanCount, '个关联计划');
      }
    } catch (error) {
      logger.warn('[MultiSelect] 删除计划数据失败（不影响消息删除）:', error);
    }
    
    const deletedCount = originalCount - updatedHistory.length;
    showSuccessToast(`已删除 ${deletedCount} 条消息`);
    
    // 从DOM中移除消息元素
    const checkboxes = pageContainer.querySelectorAll('.chat-multiselect-checkbox:checked');
    checkboxes.forEach(checkbox => {
      const messageContainer = checkbox.closest('.chat-msg');
      if (messageContainer) {
        messageContainer.remove();
      }
    });
    
    // 退出多选模式
    exitMultiSelectMode(pageContainer);
    
  } catch (error) {
    logger.error('[MultiSelect] 批量删除失败:', error);
    showErrorToast('删除失败，请重试');
  }
}
