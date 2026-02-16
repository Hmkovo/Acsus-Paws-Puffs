/**
 * 装扮购买逻辑模块
 *
 * @description
 * 处理装扮购买流程：
 * - 权限检查（会员等级、余额、已购买）
 * - 扣费逻辑（普通用户扣费、VIP记录使用次数、SVIP免费）
 * - 保存购买记录到 owned 数组
 *
 * @module customization-purchase
 */

import logger from '../../../logger.js';
import { getUserMembership } from '../data-storage/storage-membership.js';
import { getBalance, subtractBalance } from '../data-storage/storage-wallet.js';
import { loadData, saveData } from '../data-storage/storage-api.js';
import { calculatePrice } from './customization-pricing.js';
import { stateManager } from '../utils/state-manager.js';

/**
 * 获取装扮数据
 * @returns {Promise<Object>} 装扮数据对象
 */
async function getCustomizationData() {
  const data = await loadData('userCustomization');

  if (!data) {
    return {
      owned: [],
      current: {
        bubble: 'default',
        avatar: 'default',
        theme: 'default'
      },
      vipDailyUse: {
        date: getTodayDate(),
        bubble: 0,
        avatar: 0,
        theme: 0
      },
      scopes: {}  // 装扮作用范围配置
    };
  }

  // 检查日期是否过期
  if (data.vipDailyUse && data.vipDailyUse.date !== getTodayDate()) {
    data.vipDailyUse = {
      date: getTodayDate(),
      bubble: 0,
      avatar: 0,
      theme: 0
    };
  }

  // 确保 scopes 字段存在
  if (!data.scopes) {
    data.scopes = {};
  }

  return data;
}

/**
 * 保存装扮数据并通知订阅者
 * @param {Object} customizationData - 装扮数据对象
 * @param {Object} [meta={}] - 元数据
 */
async function saveCustomizationData(customizationData, meta = {}) {
  await stateManager.set('userCustomization', customizationData, meta);
}

/**
 * 获取今天的日期字符串
 * @returns {string} YYYY-MM-DD
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * 检查是否可以购买装扮
 *
 * @param {Object} item - 装扮配置对象
 * @param {string} category - 装扮分类
 * @returns {Promise<Object>} 检查结果
 * @property {boolean} canPurchase - 是否可以购买
 * @property {string} reason - 原因（'already-owned' / 'insufficient-balance' / 'ok'）
 * @property {number} price - 需要支付的价格
 * @property {number} balance - 当前余额
 */
export async function checkPurchaseEligibility(item, category = 'bubble') {
  const customizationData = await getCustomizationData();

  // 1. 检查是否已购买
  if (customizationData.owned.includes(item.id)) {
    return {
      canPurchase: false,
      reason: 'already-owned',
      price: 0,
      balance: await getBalance()
    };
  }

  // 2. 计算价格
  const priceInfo = await calculatePrice(item, category);
  const finalPrice = priceInfo.finalPrice;

  // 3. 如果免费（SVIP或VIP今日免费），直接可以购买
  if (finalPrice === 0) {
    return {
      canPurchase: true,
      reason: 'ok',
      price: 0,
      balance: await getBalance(),
      isFree: true,
      freeReason: priceInfo.reason
    };
  }

  // 4. 需要付费，检查余额
  const balance = await getBalance();
  if (balance < finalPrice) {
    return {
      canPurchase: false,
      reason: 'insufficient-balance',
      price: finalPrice,
      balance
    };
  }

  return {
    canPurchase: true,
    reason: 'ok',
    price: finalPrice,
    balance
  };
}

/**
 * 执行购买装扮
 *
 * @description
 * 完整的购买流程：
 * 1. 检查权限
 * 2. 扣费（如果需要）
 * 3. 记录VIP使用次数（如果是VIP免费）
 * 4. 添加到owned数组
 * 5. 保存数据
 *
 * @param {Object} item - 装扮配置对象
 * @param {string} category - 装扮分类
 * @returns {Promise<Object>} 购买结果
 * @property {boolean} success - 是否成功
 * @property {string} message - 结果消息
 * @property {number} newBalance - 新余额
 */
export async function purchaseItem(item, category = 'bubble') {
  logger.info('phone','[Purchase] 开始购买流程:', item.name, '分类:', category);

  // 1. 检查购买资格
  const eligibility = await checkPurchaseEligibility(item, category);

  if (!eligibility.canPurchase) {
    if (eligibility.reason === 'already-owned') {
      return {
        success: false,
        message: '已拥有此装扮',
        newBalance: eligibility.balance
      };
    } else if (eligibility.reason === 'insufficient-balance') {
      return {
        success: false,
        message: `余额不足，当前余额¥${eligibility.balance}，需要¥${eligibility.price}`,
        newBalance: eligibility.balance
      };
    }
  }

  const customizationData = await getCustomizationData();
  const membership = await getUserMembership();
  let newBalance = eligibility.balance;

  // 2. 扣费逻辑
  if (eligibility.price > 0) {
    // 需要付费
    try {
      newBalance = await subtractBalance(eligibility.price);
      logger.info('phone','[Purchase] 扣费成功:', eligibility.price, '新余额:', newBalance);
    } catch (error) {
      logger.error('phone','[Purchase] 扣费失败:', error.message);
      return {
        success: false,
        message: '扣费失败：' + error.message,
        newBalance: eligibility.balance
      };
    }
  } else if (eligibility.isFree) {
    // 免费购买
    if (eligibility.freeReason === 'vip-daily') {
      // VIP今日免费，记录使用次数
      customizationData.vipDailyUse[category]++;
      logger.info('phone','[Purchase] VIP今日免费已使用，次数:', customizationData.vipDailyUse[category]);
    } else if (eligibility.freeReason === 'svip') {
      logger.info('phone','[Purchase] SVIP免费购买');
    }
  }

  // 3. 添加到owned数组
  if (!customizationData.owned.includes(item.id)) {
    customizationData.owned.push(item.id);
    logger.info('phone','[Purchase] 已添加到owned:', item.id);
  }

  // 4. 保存数据
  await saveCustomizationData(customizationData, {
    action: 'purchase',
    itemId: item.id,
    category,
    price: eligibility.price,
    balance: newBalance
  });

  logger.info('phone','[Purchase] 购买成功:', item.name);

  return {
    success: true,
    message: '购买成功！',
    newBalance,
    itemId: item.id
  };
}

/**
 * 检查是否已拥有装扮
 * @param {string} itemId - 装扮ID
 * @returns {Promise<boolean>} 是否已拥有
 */
export async function isItemOwned(itemId) {
  const customizationData = await getCustomizationData();
  return customizationData.owned.includes(itemId);
}
