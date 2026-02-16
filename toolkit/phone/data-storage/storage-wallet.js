/**
 * 钱包数据存储模块
 * 
 * @description
 * 管理用户余额和转账记录
 * 职责：
 * - 余额读取/更新
 * - 转账记录增删查
 * - 按联系人筛选记录
 * - 触发事件通知（wallet-data-changed）
 * 
 * @module storage-wallet
 */

import { saveData, loadData } from './storage-api.js';
import logger from '../../../logger.js';
import { stateManager } from '../utils/state-manager.js';

/**
 * 获取钱包数据
 * @returns {Promise<Object>} 钱包数据对象
 */
export async function getWalletData() {
  const data = await loadData('wallet');

  // 确保数据结构正确
  if (!data || typeof data !== 'object') {
    logger.warn('phone','[WalletStorage] 钱包数据不存在或格式错误，初始化为默认值');
    return {
      balance: 0,
      transactions: []
    };
  }

  // 确保字段存在
  return {
    balance: typeof data.balance === 'number' ? data.balance : 0,
    transactions: Array.isArray(data.transactions) ? data.transactions : []
  };
}

/**
 * 保存钱包数据并通知订阅者
 * 
 * @param {Object} walletData - 钱包数据对象
 * @param {Object} [meta={}] - 元数据（传递给订阅者）
 * @returns {Promise<void>}
 * 
 * @description
 * 使用状态管理器保存数据，自动通知所有订阅者
 */
async function saveWalletData(walletData, meta = {}) {
  await stateManager.set('wallet', walletData, meta);
}

/**
 * 获取用户余额
 * @returns {Promise<number>} 当前余额
 */
export async function getBalance() {
  const wallet = await getWalletData();
  return wallet.balance;
}

/**
 * 更新用户余额
 * @param {number} newBalance - 新余额
 * @returns {Promise<void>}
 */
export async function updateBalance(newBalance) {
  if (typeof newBalance !== 'number' || newBalance < 0) {
    logger.error('phone','[WalletStorage] 余额必须是非负数:', newBalance);
    throw new Error('余额必须是非负数');
  }

  const wallet = await getWalletData();
  wallet.balance = newBalance;
  await saveWalletData(wallet);

  logger.info('phone','[WalletStorage] 余额已更新:', newBalance);
}

/**
 * 增加余额
 * @param {number} amount - 增加金额
 * @returns {Promise<number>} 更新后的余额
 */
export async function addBalance(amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    logger.error('phone','[WalletStorage] 增加金额必须是正数:', amount);
    throw new Error('增加金额必须是正数');
  }

  const wallet = await getWalletData();
  wallet.balance += amount;
  await saveWalletData(wallet);

  logger.info('phone','[WalletStorage] 余额增加:', amount, '新余额:', wallet.balance);
  return wallet.balance;
}

/**
 * 减少余额
 * @param {number} amount - 减少金额
 * @returns {Promise<number>} 更新后的余额
 * @throws {Error} 余额不足时抛出错误
 */
export async function subtractBalance(amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    logger.error('phone','[WalletStorage] 减少金额必须是正数:', amount);
    throw new Error('减少金额必须是正数');
  }

  const wallet = await getWalletData();

  // 检查余额是否足够
  if (wallet.balance < amount) {
    logger.warn('phone','[WalletStorage] 余额不足，当前余额:', wallet.balance, '尝试扣除:', amount);
    throw new Error('余额不足');
  }

  wallet.balance -= amount;
  await saveWalletData(wallet);

  logger.info('phone','[WalletStorage] 余额减少:', amount, '新余额:', wallet.balance);
  return wallet.balance;
}

/**
 * 生成转账记录ID
 * @returns {string} 唯一ID
 */
function generateTransactionId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `trans_${timestamp}_${random}`;
}

/**
 * 添加转账记录
 * @param {Object} transaction - 转账记录对象
 * @param {string} transaction.contactId - 联系人ID
 * @param {'transfer'|'gift'|'redpacket'} transaction.type - 转账类型
 * @param {'sent'|'received'} transaction.direction - 方向（sent=user转出，received=char转入）
 * @param {number} transaction.amount - 金额
 * @param {string} [transaction.message] - 转账留言
 * @param {string} [transaction.itemName] - 礼物名称（如"SVIP会员 1个月"）
 * @param {string} [transaction.messageId] - 关联的聊天消息ID（用于删除时同步删除）
 * @param {string} [transaction.relatedMsgId] - 兼容旧字段名
 * @param {number} [transaction.time] - 时间戳（可选，默认当前时间）
 * @returns {Promise<Object>} 添加后的转账记录（包含生成的ID）
 */
export async function addTransaction(transaction) {
  // 验证必需字段
  if (!transaction.contactId || !transaction.type || !transaction.direction) {
    logger.error('phone','[WalletStorage] 转账记录缺少必需字段:', transaction);
    throw new Error('转账记录缺少必需字段');
  }

  if (transaction.direction !== 'sent' && transaction.direction !== 'received') {
    logger.error('phone','[WalletStorage] 转账方向必须是 sent 或 received:', transaction.direction);
    throw new Error('转账方向无效');
  }

  // ✅ 根据交易类型验证金额
  // 转账和红包必须有金额，礼物可以没有（如送会员、送表情）
  if (transaction.type === 'transfer' || transaction.type === 'redpacket') {
    if (typeof transaction.amount !== 'number' || transaction.amount <= 0) {
      logger.error('phone','[WalletStorage] 转账/红包金额必须是正数:', transaction.amount);
      throw new Error('金额无效');
    }
  } else if (transaction.type === 'gift') {
    // 礼物类型：金额可选，默认为 0
    transaction.amount = typeof transaction.amount === 'number' ? transaction.amount : 0;
  } else {
    logger.error('phone','[WalletStorage] 不支持的交易类型:', transaction.type);
    throw new Error('不支持的交易类型');
  }

  const wallet = await getWalletData();

  // 生成完整的转账记录
  const fullTransaction = {
    id: generateTransactionId(),
    contactId: transaction.contactId,
    type: transaction.type,
    direction: transaction.direction,
    amount: transaction.amount,
    message: transaction.message || '',
    itemName: transaction.itemName || '',  // ✅ 礼物名称（如“SVIP会员 1个月”）
    messageId: transaction.messageId || null,  // 保存关联的消息ID
    relatedMsgId: transaction.relatedMsgId || null,  // ✅ 兼容旧字段名
    time: transaction.time || Math.floor(Date.now() / 1000), // 秒级时间戳
    status: 'completed'  // 预留字段
  };

  // 添加到记录列表
  wallet.transactions.push(fullTransaction);
  await saveWalletData(wallet, {
    action: 'addTransaction',
    balance: wallet.balance,
    transaction: fullTransaction,
    contactId: transaction.contactId
  });

  logger.info('phone','[WalletStorage] 已添加转账记录:', fullTransaction.id, '方向:', fullTransaction.direction, '金额:', fullTransaction.amount);

  return fullTransaction;
}

/**
 * 获取所有转账记录
 * @param {Object} [options] - 筛选选项
 * @param {string} [options.contactId] - 按联系人筛选
 * @param {'sent'|'received'|'all'} [options.direction] - 按方向筛选（默认'all'）
 * @param {'time'} [options.sortBy] - 排序字段（默认'time'）
 * @param {'desc'|'asc'} [options.sortOrder] - 排序方向（默认'desc'）
 * @returns {Promise<Array>} 转账记录数组
 */
export async function getTransactions(options = {}) {
  const wallet = await getWalletData();
  let transactions = wallet.transactions;

  // 按联系人筛选
  if (options.contactId) {
    transactions = transactions.filter(t => t.contactId === options.contactId);
  }

  // 按方向筛选
  if (options.direction && options.direction !== 'all') {
    transactions = transactions.filter(t => t.direction === options.direction);
  }

  // 排序（默认时间倒序）
  const sortBy = options.sortBy || 'time';
  const sortOrder = options.sortOrder || 'desc';
  transactions.sort((a, b) => {
    const valueA = a[sortBy];
    const valueB = b[sortBy];
    return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
  });

  return transactions;
}

/**
 * 根据ID查找转账记录
 * @param {string} transactionId - 转账记录ID
 * @returns {Promise<Object|null>} 转账记录对象或null
 */
export async function findTransactionById(transactionId) {
  const wallet = await getWalletData();
  return wallet.transactions.find(t => t.id === transactionId) || null;
}

/**
 * 根据消息ID查找转账记录（用于防重复保存）
 * @param {string} messageId - 关联的聊天消息ID
 * @returns {Promise<Object|null>} 转账记录对象或null
 */
export async function findTransactionByMessageId(messageId) {
  if (!messageId) return null;
  const wallet = await getWalletData();
  return wallet.transactions.find(t => t.messageId === messageId) || null;
}

/**
 * 删除转账记录（同时恢复余额）
 * @param {string} transactionId - 转账记录ID
 * @returns {Promise<boolean>} 是否删除成功
 * @description
 * 删除转账记录时会自动恢复余额：
 * - 删除收入记录（received）：减少余额
 * - 删除支出记录（sent）：增加余额
 */
export async function deleteTransaction(transactionId) {
  const wallet = await getWalletData();
  const index = wallet.transactions.findIndex(t => t.id === transactionId);

  if (index === -1) {
    logger.warn('phone','[WalletStorage] 转账记录不存在:', transactionId);
    return false;
  }

  const deleted = wallet.transactions.splice(index, 1)[0];

  // ✅ 恢复余额
  if (deleted.direction === 'received') {
    // 删除收入记录，减少余额
    wallet.balance = Math.max(0, wallet.balance - deleted.amount);
    logger.info('phone','[WalletStorage] 恢复余额（删除收入）：-', deleted.amount, '新余额:', wallet.balance);
  } else if (deleted.direction === 'sent') {
    // 删除支出记录，增加余额
    wallet.balance += deleted.amount;
    logger.info('phone','[WalletStorage] 恢复余额（删除支出）：+', deleted.amount, '新余额:', wallet.balance);
  }

  await saveWalletData(wallet, {
    action: 'deleteTransaction',
    balance: wallet.balance,
    transaction: null,
    contactId: deleted.contactId
  });

  logger.info('phone','[WalletStorage] 已删除转账记录:', transactionId);

  return true;
}

/**
 * 计算收入/支出总额
 * @param {Object} [options] - 筛选选项
 * @param {string} [options.contactId] - 按联系人筛选
 * @param {'sent'|'received'} [options.direction] - 按方向筛选
 * @returns {Promise<Object>} { income: 收入总额, expense: 支出总额 }
 */
export async function calculateTotals(options = {}) {
  const transactions = await getTransactions(options);

  let income = 0;  // 收入（char转给user）
  let expense = 0; // 支出（user转给char）

  transactions.forEach(t => {
    if (t.direction === 'received') {
      income += t.amount;
    } else if (t.direction === 'sent') {
      expense += t.amount;
    }
  });

  return { income, expense };
}

/**
 * @deprecated 已迁移到状态管理器，不再需要此函数
 * 保留此注释以便理解历史代码
 */
// function triggerWalletChangedEvent(detail) {
//   const event = new CustomEvent('wallet-data-changed', { detail });
//   document.dispatchEvent(event);
//   logger.debug('phone','[WalletStorage] 已触发钱包数据变化事件:', detail);
// }

/**
 * 执行转账操作（user转给char）
 * @async
 * @param {string} contactId - 联系人ID
 * @param {number} amount - 转账金额
 * @param {string} [message] - 转账留言
 * @returns {Promise<Object>} { success: boolean, balance: number, transaction: Object }
 * @throws {Error} 余额不足或参数无效时抛出错误
 */
export async function executeTransfer(contactId, amount, message = '') {
  try {
    // 减少余额（自动检查余额是否足够）
    const newBalance = await subtractBalance(amount);

    // 添加转账记录（会自动触发状态管理器通知）
    const transaction = await addTransaction({
      contactId,
      type: 'transfer',
      direction: 'sent',
      amount,
      message
    });

    return {
      success: true,
      balance: newBalance,
      transaction
    };
  } catch (error) {
    logger.error('phone','[WalletStorage] 转账失败:', error.message);
    throw error;
  }
}

/**
 * 接收转账（char转给user）
 * 
 * @description
 * 接收转账并保存记录，使用messageId防止重复保存
 * 如果messageId已存在，跳过保存并返回已有记录
 * 
 * @async
 * @param {string} contactId - 联系人ID
 * @param {number} amount - 转账金额
 * @param {string} [message] - 转账留言
 * @param {string} [messageId] - 关联的聊天消息ID（用于去重）
 * @returns {Promise<Object>} { success: boolean, balance: number, transaction: Object, skipped: boolean }
 */
export async function receiveTransfer(contactId, amount, message = '', messageId = null) {
  try {
    // ✅ 防重复：检查messageId是否已存在
    if (messageId) {
      const existing = await findTransactionByMessageId(messageId);
      if (existing) {
        logger.info('phone','[WalletStorage] ⏭️  转账记录已存在，跳过保存 msgId:', messageId);
        const currentBalance = await getBalance();
        return {
          success: true,
          balance: currentBalance,
          transaction: existing,
          skipped: true  // 标记为跳过
        };
      }
    }

    // 增加余额
    const newBalance = await addBalance(amount);

    // 添加转账记录（会自动触发状态管理器通知）
    const transaction = await addTransaction({
      contactId,
      type: 'transfer',
      direction: 'received',
      amount,
      message,
      messageId
    });

    return {
      success: true,
      balance: newBalance,
      transaction,
      skipped: false  // 标记为新保存
    };
  } catch (error) {
    logger.error('phone','[WalletStorage] 接收转账失败:', error.message);
    throw error;
  }
}
