/**
 * @file contact-transactions-ui.js
 * @description 联系人往来记录页面（转账、礼物、红包）
 * 
 * @description
 * 往来记录页面UI（已更新使用真实数据，2025-10-29）
 * 职责：
 * - 显示与特定联系人的往来记录
 * - 计算收到/转出总额
 * - 支持筛选（全部/转账/礼物/红包）
 * - 监听钱包数据变化事件
 */

import { getTransactions, calculateTotals } from '../data-storage/storage-wallet.js';
import { formatTimestamp } from '../utils/time-helper.js';
import { stateManager } from '../utils/state-manager.js';
import logger from '../../../logger.js';

// 当前筛选状态
let currentFilter = 'all';  // 'all' | 'transfer' | 'gift' | 'redpacket'

/**
 * 渲染往来记录页面
 * @async
 * @param {Object} params - 页面参数
 * @param {string} params.contactId - 联系人ID
 * @param {HTMLElement} params.container - 页面容器
 * @returns {Promise<void>}
 */
export async function renderContactTransactions(params) {
  const { contactId, container } = params;

  logger.debug('[TransactionsUI] 开始渲染往来记录页面:', contactId);

  // 创建页面HTML
  container.innerHTML = createTransactionsHTML();

  // 绑定事件
  bindEvents(container, contactId);

  // 加载并渲染数据
  await loadAndRenderTransactionsData(container, contactId);

  // 监听钱包数据变化事件
  bindWalletChangeListener(container, contactId);
}

/**
 * 创建往来记录页面HTML
 * @returns {string} HTML字符串
 */
function createTransactionsHTML() {
  return `
        <div class="transactions-page">
            ${createTopBar()}
            ${createStatisticsSection()}
            ${createFilterTabs()}
            ${createRecordsList()}
        </div>
    `;
}

/**
 * 创建顶部栏
 * @returns {string} HTML字符串
 */
function createTopBar() {
  return `
        <div class="transactions-top-bar">
            <button class="transactions-btn-back">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="transactions-title">往来记录</div>
        </div>
    `;
}

/**
 * 创建统计卡片区域
 * @returns {string} HTML字符串
 */
function createStatisticsSection() {
  return `
        <div class="transactions-statistics">
            <div class="transactions-stat-card">
                <div class="transactions-stat-amount" data-received="0">¥ 0.00</div>
                <div class="transactions-stat-label">收到总额</div>
            </div>
            <div class="transactions-stat-card">
                <div class="transactions-stat-amount" data-sent="0">¥ 0.00</div>
                <div class="transactions-stat-label">转出总额</div>
            </div>
        </div>
    `;
}

/**
 * 创建筛选标签栏
 * @returns {string} HTML字符串
 */
function createFilterTabs() {
  return `
        <div class="transactions-filter-tabs">
            <button class="transactions-filter-tab active" data-filter="all">全部</button>
            <button class="transactions-filter-tab" data-filter="transfer">转账</button>
            <button class="transactions-filter-tab" data-filter="gift">礼物</button>
            <button class="transactions-filter-tab" data-filter="redpacket">红包</button>
        </div>
    `;
}

/**
 * 创建记录列表区域
 * @returns {string} HTML字符串
 */
function createRecordsList() {
  return `
        <div class="transactions-records-section">
            <div class="transactions-records-list">
                <div class="transactions-empty-state">暂无往来记录</div>
            </div>
        </div>
    `;
}

/**
 * 绑定事件
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 */
function bindEvents(container, contactId) {
  // 返回按钮
  const backBtn = container.querySelector('.transactions-btn-back');
  backBtn?.addEventListener('click', async () => {
    logger.debug('[TransactionsUI] 点击返回按钮');
    const { hidePage } = await import('../phone-main-ui.js');
    const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (overlayElement) {
      await hidePage(overlayElement, 'contact-transactions');
    }
  });

  // 筛选标签
  const filterTabs = container.querySelectorAll('.transactions-filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filterValue = /** @type {HTMLElement} */ (tab).dataset.filter;
      handleFilterChange(container, contactId, filterValue);
    });
  });

  // 绑定删除功能
  bindDeleteActions(container, contactId);
}

/**
 * 加载并渲染往来记录数据
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 */
async function loadAndRenderTransactionsData(container, contactId) {
  try {
    // 计算该联系人的收支总额
    const { income, expense } = await calculateTotals({ contactId });

    // 更新统计卡片
    updateStatistics(container, income, expense);

    // 渲染记录列表
    await renderRecordsList(container, contactId, currentFilter);

    logger.info('[TransactionsUI] 往来记录已加载，收到:', income, '转出:', expense);
  } catch (error) {
    logger.error('[TransactionsUI] 加载往来记录失败:', error.message);
  }
}

/**
 * 更新统计卡片（局部更新）
 * @param {HTMLElement} container - 页面容器
 * @param {number} received - 收到总额
 * @param {number} sent - 转出总额
 */
function updateStatistics(container, received, sent) {
  const receivedElement = container.querySelector('[data-received]');
  if (receivedElement) {
    receivedElement.setAttribute('data-received', received.toString());
    receivedElement.textContent = `¥ ${received.toFixed(2)}`;
  }

  const sentElement = container.querySelector('[data-sent]');
  if (sentElement) {
    sentElement.setAttribute('data-sent', sent.toString());
    sentElement.textContent = `¥ ${sent.toFixed(2)}`;
  }
}

/**
 * 渲染记录列表
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * @param {string} filter - 筛选类型
 */
async function renderRecordsList(container, contactId, filter) {
  const listElement = container.querySelector('.transactions-records-list');
  if (!listElement) return;

  // 获取该联系人的转账记录
  const transactions = await getTransactions({
    contactId,
    sortBy: 'time',
    sortOrder: 'desc'
  });

  // 根据筛选类型过滤记录
  let filteredTransactions = transactions;
  if (filter !== 'all') {
    filteredTransactions = transactions.filter(t => t.type === filter);
  }

  // 如果没有记录，显示空状态
  if (filteredTransactions.length === 0) {
    listElement.innerHTML = '<div class="transactions-empty-state">暂无往来记录</div>';
    return;
  }

  // 渲染记录列表
  const itemsHTML = filteredTransactions.map(t => createRecordItem(t));
  listElement.innerHTML = itemsHTML.join('');

  logger.debug('[TransactionsUI] 已渲染', filteredTransactions.length, '条记录，筛选:', filter);
}

/**
 * 创建单个记录项
 * @param {Object} transaction - 转账记录对象
 * @returns {string} HTML字符串
 */
function createRecordItem(transaction) {
  const { id, direction, amount, message, time, type, itemName } = transaction;

  // 类型文字
  const typeText = getTypeText(type);

  // 方向文字
  const directionText = direction === 'received' ? '收到' : '转出';

  // 时间格式化
  const timeText = formatTimestamp(time);

  // ✅ 金额显示：礼物显示物品名称，转账/红包显示金额
  let amountDisplay;
  if (type === 'gift' && itemName) {
    // 礼物：显示物品名称（如"SVIP会员 30天"）
    amountDisplay = itemName;
  } else {
    // 转账/红包：显示金额
    amountDisplay = `${direction === 'received' ? '+' : '-'}¥ ${amount.toFixed(2)}`;
  }

  return `
        <div class="transactions-record-item" data-transaction-id="${id}">
            <div class="transactions-record-header">
                <div>
                    <div class="transactions-record-type">${typeText}</div>
                    <div class="transactions-record-direction">${directionText}</div>
                </div>
                <div class="transactions-record-amount ${type === 'gift' ? 'transactions-record-item-name' : ''}">
                    ${amountDisplay}
                </div>
            </div>
            ${message ? `<div class="transactions-record-note">${message}</div>` : ''}
            <div class="transactions-record-time">${timeText}</div>
            <div class="transactions-record-actions">
                <button class="transactions-record-delete-btn" data-transaction-id="${id}" title="删除">
                    <span class="fa-solid fa-trash"></span>
                </button>
            </div>
        </div>
    `;
}

/**
 * 获取类型文字
 * @param {string} type - 类型
 * @returns {string} 类型文字
 */
function getTypeText(type) {
  const typeMap = {
    transfer: '转账',
    gift: '礼物',
    redpacket: '红包'
  };
  return typeMap[type] || '其他';
}

/**
 * 处理筛选切换
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * @param {string} filter - 筛选类型
 */
async function handleFilterChange(container, contactId, filter) {
  // 更新当前筛选状态
  currentFilter = filter;

  // 更新标签样式
  const tabs = container.querySelectorAll('.transactions-filter-tab');
  tabs.forEach(tab => {
    const tabElement = /** @type {HTMLElement} */ (tab);
    if (tabElement.dataset.filter === filter) {
      tabElement.classList.add('active');
    } else {
      tabElement.classList.remove('active');
    }
  });

  // 重新渲染列表
  await renderRecordsList(container, contactId, filter);

  logger.debug('[TransactionsUI] 筛选切换:', filter);
}

/**
 * 监听钱包数据变化
 * 
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * 
 * @description
 * 使用状态管理器订阅钱包数据变化，页面关闭时自动清理
 */
function bindWalletChangeListener(container, contactId) {
  const pageId = `contact-transactions-${contactId}`;
  
  // 订阅钱包数据变化
  stateManager.subscribe(pageId, 'wallet', async (meta) => {
    // 只处理与当前联系人相关的变化
    if (meta.contactId && meta.contactId !== contactId) {
      return;
    }
    
    logger.debug('[TransactionsUI] 收到钱包数据变化通知', meta);
    
    // 检查页面是否还存在
    if (!document.contains(container)) {
      logger.debug('[TransactionsUI] 页面已关闭，跳过刷新');
      return;
    }
    
    // 重新计算收支统计
    const { income, expense } = await calculateTotals({ contactId });
    updateStatistics(container, income, expense);
    
    // 重新渲染列表
    await renderRecordsList(container, contactId, currentFilter);
    
    logger.debug('[TransactionsUI] 往来记录已自动更新');
  });
  
  // 监听页面移除，自动清理订阅
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === container) {
          stateManager.unsubscribeAll(pageId);
          observer.disconnect();
          logger.debug('[TransactionsUI] 页面已关闭，已清理订阅');
          return;
        }
      }
    }
  });
  
  if (container.parentNode) {
    observer.observe(container.parentNode, { childList: true });
  }
  
  logger.debug('[TransactionsUI] 已订阅钱包数据变化');
}

/**
 * 绑定删除功能（参考日记评论的删除逻辑）
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 */
function bindDeleteActions(container, contactId) {
  let activeItem = null;  // 当前显示删除按钮的记录项
  let hideTimer = null;   // 自动隐藏定时器

  const recordsList = container.querySelector('.transactions-records-list');
  if (!recordsList) return;

  recordsList.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const recordItem = target.closest('.transactions-record-item');
    const deleteBtn = target.closest('.transactions-record-delete-btn');

    // 点击删除按钮
    if (deleteBtn) {
      e.stopPropagation();
      const transactionId = /** @type {HTMLElement} */ (deleteBtn).dataset.transactionId;
      if (!transactionId) return;

      logger.debug('[TransactionsUI] 点击删除按钮，转账ID:', transactionId);
      await handleDeleteTransaction(container, contactId, transactionId);
      return;
    }

    // 点击记录项显示删除按钮（不包括按钮区域）
    if (recordItem && !target.closest('.transactions-record-actions') && !target.closest('button')) {
      const transactionId = /** @type {HTMLElement} */ (recordItem).dataset.transactionId;
      logger.debug('[TransactionsUI] 点击记录项，显示删除按钮 ID:', transactionId);

      // 阻止事件冒泡
      e.stopPropagation();

      // 隐藏之前的按钮
      if (activeItem && activeItem !== recordItem) {
        activeItem.classList.remove('show-actions');
        logger.debug('[TransactionsUI] 隐藏之前的删除按钮');
      }

      // 显示当前记录的按钮
      recordItem.classList.add('show-actions');
      activeItem = recordItem;
      logger.debug('[TransactionsUI] 显示当前删除按钮 ID:', transactionId);

      // 手机端3秒后自动隐藏
      if (window.innerWidth <= 768) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          recordItem.classList.remove('show-actions');
          if (activeItem === recordItem) {
            activeItem = null;
          }
          logger.debug('[TransactionsUI] 手机端自动隐藏删除按钮 ID:', transactionId);
        }, 3000);
      }
    }
  });

  // 点击页面其他区域隐藏删除按钮
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.closest('.transactions-records-list')) {
      if (activeItem) {
        activeItem.classList.remove('show-actions');
        activeItem = null;
        clearTimeout(hideTimer);
        logger.debug('[TransactionsUI] 点击外部区域，隐藏删除按钮');
      }
    }
  });
}

/**
 * 处理删除转账记录
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string} contactId - 联系人ID
 * @param {string} transactionId - 转账记录ID
 */
async function handleDeleteTransaction(container, contactId, transactionId) {
  try {
    // 导入必需模块
    const { deleteTransaction, findTransactionById } = await import('../data-storage/storage-wallet.js');
    const { loadChatHistory, saveChatHistory } = await import('../messages/message-chat-data.js');
    const { showConfirmPopup } = await import('../utils/popup-helper.js');

    // 查找转账记录（获取关联的消息ID）
    const transaction = await findTransactionById(transactionId);
    if (!transaction) {
      logger.warn('[TransactionsUI] 转账记录不存在:', transactionId);
      return;
    }

    // 二次确认（使用手机弹窗）
    const confirmed = await showConfirmPopup(
      '删除转账记录',
      `确定要删除这条转账记录吗？\n\n金额：¥${transaction.amount.toFixed(2)}\n方向：${transaction.direction === 'received' ? '收入' : '支出'}`,
      {
        danger: true,
        okButton: '删除',
        cancelButton: '取消'
      }
    );

    if (!confirmed) {
      logger.debug('[TransactionsUI] 用户取消删除');
      return;
    }

    // 1. 删除聊天消息（如果有关联的消息ID）
    if (transaction.messageId && transaction.contactId) {
      // 1.1 从持久化数据中删除
      const chatHistory = await loadChatHistory(transaction.contactId);
      const beforeCount = chatHistory.length;
      const newHistory = chatHistory.filter(msg => msg.id !== transaction.messageId);
      await saveChatHistory(transaction.contactId, newHistory);
      logger.debug('[TransactionsUI] 持久化数据已更新:', beforeCount, '→', newHistory.length);

      // 1.2 从DOM中删除（如果聊天页面正在显示）
      const chatPage = document.querySelector(`#page-chat-${transaction.contactId.replace(/\s+/g, '_')}`);
      if (chatPage) {
        const messageElement = chatPage.querySelector(`[data-msg-id="${transaction.messageId}"]`);
        if (messageElement) {
          messageElement.remove();
          logger.debug('[TransactionsUI] 已从DOM删除转账消息:', transaction.messageId);
        } else {
          logger.debug('[TransactionsUI] DOM中未找到该消息（可能已滚动出视野）:', transaction.messageId);
        }
      } else {
        logger.debug('[TransactionsUI] 聊天页面未打开，无需更新DOM');
      }

      logger.info('[TransactionsUI] 已删除关联的聊天消息:', transaction.messageId);
    }

    // 2. 删除转账记录
    const success = await deleteTransaction(transactionId);
    if (success) {
      logger.info('[TransactionsUI] 转账记录已删除:', transactionId);
      const toastr = window.toastr;
      if (toastr) {
        toastr.success('转账记录已删除');
      }
    }

    // 3. 重新渲染列表（由事件监听器自动触发）
  } catch (error) {
    logger.error('[TransactionsUI] 删除转账记录失败:', error.message);
    const toastr = window.toastr;
    if (toastr) {
      toastr.error('删除失败: ' + error.message);
    }
  }
}

