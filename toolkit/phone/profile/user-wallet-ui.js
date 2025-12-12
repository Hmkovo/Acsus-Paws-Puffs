/**
 * @file user-wallet-ui.js
 * @description 用户钱包页面（余额显示、收支统计、账单明细）
 * 
 * @description
 * 钱包页面UI（已更新使用真实数据，2025-10-29）
 * 职责：
 * - 显示用户余额
 * - 显示收支统计
 * - 渲染转账记录列表
 * - 监听钱包数据变化事件
 * - 筛选功能（全部/收入/支出）
 */

import { getWalletData, getTransactions, calculateTotals } from '../data-storage/storage-wallet.js';
import { loadContacts } from '../contacts/contact-list-data.js';
import { getContactDisplayName } from '../utils/contact-display-helper.js';
import { formatTimestamp } from '../utils/time-helper.js';
import { stateManager } from '../utils/state-manager.js';
import logger from '../../../logger.js';

// 当前筛选状态
/** @type {'all' | 'received' | 'sent'} */
let currentFilter = 'all';

/**
 * 渲染用户钱包页面
 * @async
 * @param {Object} params - 页面参数
 * @param {HTMLElement} params.container - 页面容器
 * @returns {Promise<void>}
 */
export async function renderUserWallet(params) {
  const { container } = params;

  logger.debug('[WalletUI] 开始渲染钱包页面');

  // 创建页面HTML
  container.innerHTML = createWalletHTML();

  // 绑定事件
  bindEvents(container);

  // 加载钱包数据
  await loadAndRenderWalletData(container);

  // 监听钱包数据变化事件
  bindWalletChangeListener(container);
}

/**
 * 创建钱包页面HTML
 * @returns {string} HTML字符串
 */
function createWalletHTML() {
  return `
        <div class="wallet-page">
            ${createTopBar()}
            ${createBalanceSection()}
            ${createStatisticsSection()}
            ${createFilterTabs()}
            ${createBillSection()}
        </div>
    `;
}

/**
 * 创建顶部栏
 * @returns {string} HTML字符串
 */
function createTopBar() {
  return `
        <div class="wallet-top-bar">
            <button class="wallet-btn-back">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <div class="wallet-title">钱包</div>
        </div>
    `;
}

/**
 * 创建余额区域
 * @returns {string} HTML字符串
 */
function createBalanceSection() {
  return `
        <div class="wallet-balance-section">
            <div class="wallet-balance-amount" data-balance="0">¥ 0.00</div>
            <div class="wallet-balance-label">当前余额</div>
        </div>
    `;
}

/**
 * 创建统计卡片区域
 * @returns {string} HTML字符串
 */
function createStatisticsSection() {
  return `
        <div class="wallet-statistics">
            <div class="wallet-stat-card">
                <div class="wallet-stat-label">收入</div>
                <div class="wallet-stat-amount" data-income="0">¥ 0.00</div>
            </div>
            <div class="wallet-stat-card">
                <div class="wallet-stat-label">支出</div>
                <div class="wallet-stat-amount" data-expense="0">¥ 0.00</div>
            </div>
        </div>
    `;
}

/**
 * 创建筛选标签栏（复用往来记录的样式）
 * @returns {string} HTML字符串
 */
function createFilterTabs() {
  return `
        <div class="transactions-filter-tabs">
            <button class="transactions-filter-tab active" data-filter="all">
                全部
            </button>
            <button class="transactions-filter-tab" data-filter="received">
                收入
            </button>
            <button class="transactions-filter-tab" data-filter="sent">
                支出
            </button>
        </div>
    `;
}

/**
 * 创建账单明细区域
 * @returns {string} HTML字符串
 */
function createBillSection() {
  return `
        <div class="wallet-bill-section">
            <div class="wallet-bill-list">
                <div class="wallet-empty-state">暂无账单记录</div>
            </div>
        </div>
    `;
}

/**
 * 绑定事件
 * @param {HTMLElement} container - 页面容器
 */
function bindEvents(container) {
  // 返回按钮
  const backBtn = container.querySelector('.wallet-btn-back');
  backBtn?.addEventListener('click', async () => {
    logger.debug('[WalletUI] 点击返回按钮');
    const { hidePage } = await import('../phone-main-ui.js');
    const overlayElement = /** @type {HTMLElement} */ (document.querySelector('.phone-overlay'));
    if (overlayElement) {
      await hidePage(overlayElement, 'user-wallet');
    }
  });

  // 筛选标签
  const filterTabs = container.querySelectorAll('.transactions-filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filterValue = /** @type {HTMLElement} */ (tab).dataset.filter;
      handleFilterChange(container, filterValue);
    });
  });

  // 绑定删除功能
  bindDeleteActions(container);
}

/**
 * 加载并渲染钱包数据
 * @async
 * @param {HTMLElement} container - 页面容器
 */
async function loadAndRenderWalletData(container) {
  try {
    // 获取钱包数据
    const walletData = await getWalletData();
    const { balance } = walletData;

    // 计算收支统计（全部记录）
    const { income, expense } = await calculateTotals();

    // 更新余额
    updateBalance(container, balance);

    // 更新统计
    updateStatistics(container, income, expense);

    // 渲染账单列表
    await renderTransactionsList(container, currentFilter);

    logger.info('[WalletUI] 钱包数据已加载，余额:', balance, '收入:', income, '支出:', expense);
  } catch (error) {
    logger.error('[WalletUI] 加载钱包数据失败:', error.message);
  }
}

/**
 * 更新余额显示（局部更新）
 * @param {HTMLElement} container - 页面容器
 * @param {number} balance - 余额
 */
function updateBalance(container, balance) {
  const balanceElement = container.querySelector('.wallet-balance-amount');
  if (balanceElement) {
    balanceElement.setAttribute('data-balance', String(balance));
    balanceElement.textContent = `¥ ${balance.toFixed(2)}`;
  }
}

/**
 * 更新收支统计（局部更新）
 * @param {HTMLElement} container - 页面容器
 * @param {number} income - 收入总额
 * @param {number} expense - 支出总额
 */
function updateStatistics(container, income, expense) {
  const incomeElement = container.querySelector('[data-income]');
  if (incomeElement) {
    incomeElement.setAttribute('data-income', String(income));
    incomeElement.textContent = `¥ ${income.toFixed(2)}`;
  }

  const expenseElement = container.querySelector('[data-expense]');
  if (expenseElement) {
    expenseElement.setAttribute('data-expense', String(expense));
    expenseElement.textContent = `¥ ${expense.toFixed(2)}`;
  }
}

/**
 * 渲染转账记录列表
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {'all' | 'received' | 'sent'} filter - 筛选类型
 */
async function renderTransactionsList(container, filter) {
  const listElement = container.querySelector('.wallet-bill-list');
  if (!listElement) return;

  // 获取转账记录（按筛选条件）
  const transactions = await getTransactions({
    direction: filter === 'all' ? 'all' : filter,
    sortBy: 'time',
    sortOrder: 'desc'
  });

  // 如果没有记录，显示空状态
  if (transactions.length === 0) {
    listElement.innerHTML = '<div class="wallet-empty-state">暂无账单记录</div>';
    return;
  }

  // 加载联系人列表（一次性加载）
  const contacts = await loadContacts();

  // 渲染记录列表
  const itemsHTML = transactions.map(t => createTransactionItem(t, contacts));
  listElement.innerHTML = itemsHTML.join('');

  logger.debug('[WalletUI] 已渲染', transactions.length, '条记录，筛选:', filter);
}

/**
 * 创建单个转账记录项
 * @async
 * @param {Object} transaction - 转账记录对象
 * @param {Array} contacts - 联系人列表
 * @returns {string} HTML字符串
 */
function createTransactionItem(transaction, contacts) {
  const { id, contactId, direction, amount, message, time } = transaction;

  // 查找联系人
  const contact = contacts.find(c => c.id === contactId);
  const contactName = contact ? getContactDisplayName(contact) : '未知联系人';

  // 方向文字
  const directionText = direction === 'received' ? '收到转账' : '转账给对方';

  // 金额样式
  const amountClass = direction === 'received' ? 'income' : 'expense';
  const amountPrefix = direction === 'received' ? '+' : '-';

  // 时间格式化
  const timeText = formatTimestamp(time);

  return `
        <div class="wallet-bill-item" data-transaction-id="${id}">
            <div class="wallet-bill-item-header">
                <div class="wallet-bill-item-left">
                    <div class="wallet-bill-item-info">
                        <div class="wallet-bill-item-name">${contactName}</div>
                        <div class="wallet-bill-item-type">${directionText}</div>
                    </div>
                </div>
                <div class="wallet-bill-item-amount ${amountClass}">
                    ${amountPrefix}¥ ${amount.toFixed(2)}
                </div>
            </div>
            ${message ? `<div class="wallet-bill-item-note">${message}</div>` : ''}
            <div class="wallet-bill-item-time">${timeText}</div>
            <div class="wallet-bill-actions">
                <button class="wallet-bill-delete-btn" data-transaction-id="${id}" title="删除">
                    <span class="fa-solid fa-trash"></span>
                </button>
            </div>
        </div>
    `;
}

/**
 * 处理筛选切换
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string|undefined} filter - 筛选类型
 */
async function handleFilterChange(container, filter) {
  if (!filter) return;
  if (filter !== 'all' && filter !== 'received' && filter !== 'sent') return;

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
  await renderTransactionsList(container, filter);

  logger.debug('[WalletUI] 筛选切换:', filter);
}

/**
 * 监听钱包数据变化事件
 * 当钱包数据变化时，自动刷新余额、统计和列表
 * 
 * @description
 * 使用状态管理器订阅钱包数据变化，页面关闭时自动清理
 */
function bindWalletChangeListener(container) {
  const pageId = 'user-wallet';
  
  // 订阅钱包数据变化
  stateManager.subscribe(pageId, 'wallet', async (meta) => {
    logger.debug('[WalletUI] 收到钱包数据变化通知', meta);
    
    // 检查页面是否还存在
    if (!document.contains(container)) {
      logger.debug('[WalletUI] 页面已关闭，跳过刷新');
      return;
    }
    
    // 读取最新数据
    const walletData = await stateManager.get('wallet');
    if (!walletData) {
      logger.warn('[WalletUI] 钱包数据为空，跳过刷新');
      return;
    }
    
    // 局部更新余额
    updateBalance(container, walletData.balance);
    
    // 重新计算收支统计
    const { income, expense } = await calculateTotals();
    updateStatistics(container, income, expense);
    
    // 重新渲染列表
    await renderTransactionsList(container, currentFilter);
    
    logger.debug('[WalletUI] 钱包数据已自动更新');
  });
  
  // 监听页面移除，自动清理订阅
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.removedNodes) {
        if (node === container) {
          stateManager.unsubscribeAll(pageId);
          observer.disconnect();
          logger.debug('[WalletUI] 页面已关闭，已清理订阅');
          return;
        }
      }
    }
  });
  
  if (container.parentNode) {
    observer.observe(container.parentNode, { childList: true });
  }
  
  logger.debug('[WalletUI] 已订阅钱包数据变化');
}

/**
 * 绑定删除功能（参考日记评论的删除逻辑）
 * @param {HTMLElement} container - 页面容器
 */
function bindDeleteActions(container) {
  let activeItem = null;  // 当前显示删除按钮的记录项
  let hideTimer = null;   // 自动隐藏定时器

  const billList = container.querySelector('.wallet-bill-list');
  if (!billList) return;

  billList.addEventListener('click', async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const billItem = target.closest('.wallet-bill-item');
    const deleteBtn = target.closest('.wallet-bill-delete-btn');

    // 点击删除按钮
    if (deleteBtn) {
      e.stopPropagation();
      const transactionId = /** @type {HTMLElement} */ (deleteBtn).dataset.transactionId;
      if (!transactionId) return;

      logger.debug('[WalletUI] 点击删除按钮，转账ID:', transactionId);
      await handleDeleteTransaction(container, transactionId);
      return;
    }

    // 点击记录项显示删除按钮（不包括按钮区域）
    if (billItem && !target.closest('.wallet-bill-actions') && !target.closest('button')) {
      const transactionId = /** @type {HTMLElement} */ (billItem).dataset.transactionId;
      logger.debug('[WalletUI] 点击记录项，显示删除按钮 ID:', transactionId);

      // 阻止事件冒泡
      e.stopPropagation();

      // 隐藏之前的按钮
      if (activeItem && activeItem !== billItem) {
        activeItem.classList.remove('show-actions');
        logger.debug('[WalletUI] 隐藏之前的删除按钮');
      }

      // 显示当前记录的按钮
      billItem.classList.add('show-actions');
      activeItem = billItem;
      logger.debug('[WalletUI] 显示当前删除按钮 ID:', transactionId);

      // 手机端3秒后自动隐藏
      if (window.innerWidth <= 768) {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
          billItem.classList.remove('show-actions');
          if (activeItem === billItem) {
            activeItem = null;
          }
          logger.debug('[WalletUI] 手机端自动隐藏删除按钮 ID:', transactionId);
        }, 3000);
      }
    }
  });

  // 点击页面其他区域隐藏删除按钮
  document.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!target.closest('.wallet-bill-list')) {
      if (activeItem) {
        activeItem.classList.remove('show-actions');
        activeItem = null;
        clearTimeout(hideTimer);
        logger.debug('[WalletUI] 点击外部区域，隐藏删除按钮');
      }
    }
  });
}

/**
 * 处理删除转账记录
 * @async
 * @param {HTMLElement} container - 页面容器
 * @param {string} transactionId - 转账记录ID
 */
async function handleDeleteTransaction(container, transactionId) {
  try {
    // 导入必需模块
    const { deleteTransaction, findTransactionById } = await import('../data-storage/storage-wallet.js');
    const { loadChatHistory, saveChatHistory } = await import('../messages/message-chat-data.js');
    const { showConfirmPopup } = await import('../utils/popup-helper.js');

    // 查找转账记录（获取关联的消息ID和联系人ID）
    const transaction = await findTransactionById(transactionId);
    if (!transaction) {
      logger.warn('[WalletUI] 转账记录不存在:', transactionId);
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
      logger.debug('[WalletUI] 用户取消删除');
      return;
    }

    // 1. 删除聊天消息（如果有关联的消息ID）
    if (transaction.messageId && transaction.contactId) {
      // 1.1 从持久化数据中删除
      const chatHistory = await loadChatHistory(transaction.contactId);
      const beforeCount = chatHistory.length;
      const newHistory = chatHistory.filter(msg => msg.id !== transaction.messageId);
      await saveChatHistory(transaction.contactId, newHistory);
      logger.debug('[WalletUI] 持久化数据已更新:', beforeCount, '→', newHistory.length);

      // 1.2 从DOM中删除（如果聊天页面正在显示）
      const chatPage = document.querySelector(`#page-chat-${transaction.contactId.replace(/\s+/g, '_')}`);
      if (chatPage) {
        const messageElement = chatPage.querySelector(`[data-msg-id="${transaction.messageId}"]`);
        if (messageElement) {
          messageElement.remove();
          logger.debug('[WalletUI] 已从DOM删除转账消息:', transaction.messageId);
        } else {
          logger.debug('[WalletUI] DOM中未找到该消息（可能已滚动出视野）:', transaction.messageId);
        }
      } else {
        logger.debug('[WalletUI] 聊天页面未打开，无需更新DOM');
      }

      logger.info('[WalletUI] 已删除关联的聊天消息:', transaction.messageId);
    }

    // 2. 删除转账记录
    const success = await deleteTransaction(transactionId);
    if (success) {
      logger.info('[WalletUI] 转账记录已删除:', transactionId);
      const toastr = window.toastr;
      if (toastr) {
        toastr.success('转账记录已删除');
      }
    }

    // 3. 重新渲染列表（由事件监听器自动触发）
  } catch (error) {
    logger.error('[WalletUI] 删除转账记录失败:', error.message);
    const toastr = window.toastr;
    if (toastr) {
      toastr.error('删除失败: ' + error.message);
    }
  }
}
