/**
 * 装扮定价模块
 * 
 * @description
 * 根据会员等级计算装扮价格，支持：
 * - 普通用户：原价购买
 * - VIP用户：每日免费1次或原价购买
 * - SVIP用户：预设装扮免费，自定义装扮需付费
 * 
 * @module customization-pricing
 */

import logger from '../../../logger.js';
import { getUserMembership } from '../data-storage/storage-membership.js';
import { loadData, saveData } from '../data-storage/storage-api.js';

/**
 * 获取装扮数据（已购买、当前使用、VIP每日使用）
 * 
 * @returns {Promise<Object>} 装扮数据对象
 */
async function getCustomizationData() {
  const data = await loadData('userCustomization');
  
  // 默认结构
  if (!data) {
    return {
      owned: [],           // 已购买的装扮ID列表
      current: {           // 当前使用的装扮
        bubble: 'default',
        avatar: 'default',
        theme: 'default'
      },
      vipDailyUse: {       // VIP每日免费次数
        date: getTodayDate(),
        bubble: 0,
        avatar: 0,
        theme: 0
      }
    };
  }
  
  // 检查日期是否过期，过期则重置
  if (data.vipDailyUse && data.vipDailyUse.date !== getTodayDate()) {
    data.vipDailyUse = {
      date: getTodayDate(),
      bubble: 0,
      avatar: 0,
      theme: 0
    };
  }
  
  return data;
}

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 * @returns {string} 日期字符串
 */
function getTodayDate() {
  const now = new Date();
  return now.toISOString().split('T')[0];
}

/**
 * 计算装扮价格
 * 
 * @description
 * 根据会员等级和装扮类型计算最终价格
 * 
 * @param {Object} item - 装扮配置对象
 * @param {string} item.id - 装扮ID
 * @param {number} item.price - 原价
 * @param {string} item.type - 装扮类型（pure/image）
 * @param {string} category - 装扮分类（'bubble'/'avatar'/'theme'）
 * 
 * @returns {Promise<Object>} 价格信息对象
 * @property {number} finalPrice - 最终价格（0表示免费）
 * @property {number} originalPrice - 原价
 * @property {string} priceLabel - 价格标签文字
 * @property {boolean} isFree - 是否免费
 * @property {string} reason - 免费原因（'owned'/'svip'/'vip-daily'）
 */
export async function calculatePrice(item, category = 'bubble') {
  const membership = await getUserMembership();
  const customizationData = await getCustomizationData();
  
  const originalPrice = item.price;
  let finalPrice = originalPrice;
  let isFree = false;
  let reason = '';
  let priceLabel = `¥${originalPrice}`;
  
  // 1. 检查是否已购买
  if (customizationData.owned.includes(item.id)) {
    finalPrice = 0;
    isFree = true;
    reason = 'owned';
    priceLabel = '已拥有';
    
    logger.debug('phone',`[Pricing] ${item.id} 已购买`);
    return { finalPrice, originalPrice, priceLabel, isFree, reason };
  }
  
  // 2. SVIP用户：预设装扮免费（自定义分类除外）
  if (membership.type === 'svip' || membership.type === 'annual-svip') {
    // 注意：自定义分类的装扮需要付费（方案B）
    // 自定义分类的气泡ID通常以 'custom-' 开头
    const isCustomBubble = item.id.startsWith('custom-');
    
    if (!isCustomBubble) {
      finalPrice = 0;
      isFree = true;
      reason = 'svip';
      priceLabel = '免费';
      
      logger.debug('phone',`[Pricing] ${item.id} SVIP免费`);
      return { finalPrice, originalPrice, priceLabel, isFree, reason };
    }
  }
  
  // 3. VIP用户：每日免费1次
  if (membership.type === 'vip') {
    const dailyUsed = customizationData.vipDailyUse[category] || 0;
    
    if (dailyUsed === 0) {
      finalPrice = 0;
      isFree = true;
      reason = 'vip-daily';
      priceLabel = '免费（今日1次）';
      
      logger.debug('phone',`[Pricing] ${item.id} VIP今日免费`);
      return { finalPrice, originalPrice, priceLabel, isFree, reason };
    } else {
      // 已使用今日免费，显示原价
      priceLabel = `¥${originalPrice}`;
    }
  }
  
  // 4. 普通用户或VIP已用完免费次数：显示原价
  logger.debug('phone',`[Pricing] ${item.id} 需付费 ¥${originalPrice}`);
  return { finalPrice, originalPrice, priceLabel, isFree, reason };
}

/**
 * 生成价格HTML
 * 
 * @description
 * 根据价格信息生成对应的HTML标签
 * 
 * @param {Object} priceInfo - calculatePrice返回的价格信息
 * @returns {string} HTML字符串
 */
export function generatePriceHTML(priceInfo) {
  const { originalPrice, priceLabel, isFree } = priceInfo;
  
  // 免费情况：显示划线原价 + 免费标签
  if (isFree) {
    return `
      <div class="customization-bubble-price">
        <span class="price-original">¥${originalPrice}</span>
        <span class="price-free">${priceLabel}</span>
      </div>
    `;
  }
  
  // 需要付费：只显示价格
  return `
    <div class="customization-bubble-price">
      <span class="price-current">${priceLabel}</span>
    </div>
  `;
}

/**
 * 检查是否可以使用装扮
 * 
 * @description
 * 判断用户是否有权限使用该装扮
 * 
 * @param {string} itemId - 装扮ID
 * @param {string} category - 装扮分类
 * @returns {Promise<boolean>} 是否可用
 */
export async function canUseItem(itemId, category = 'bubble') {
  const priceInfo = await calculatePrice({ id: itemId, price: 0 }, category);
  
  // 免费或已购买即可使用
  return priceInfo.isFree || priceInfo.reason === 'owned';
}
