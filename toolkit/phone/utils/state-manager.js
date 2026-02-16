/**
 * 轻量级状态管理器（零内存占用版）
 * 
 * @description
 * 统一管理数据变化通知，不存储数据本身
 * 数据永远从 SillyTavern 持久化存储读取
 * 
 * @features
 * - ✅ 统一的订阅API（subscribe/unsubscribe）
 * - ✅ 自动通知所有订阅者（set时自动触发）
 * - ✅ 零内存占用（不缓存数据，只存订阅关系）
 * - ✅ 支持快照（用于重roll）
 * - ✅ 自动清理（页面关闭时清理订阅）
 * - ✅ 完美兼容现有持久化（内部使用saveData/loadData）
 * 
 * @example
 * // 数据层使用
 * await stateManager.set('wallet', walletData, { action: 'addTransaction' });
 * 
 * // UI层使用
 * stateManager.subscribe('user-wallet', 'wallet', async (meta) => {
 *   const data = await stateManager.get('wallet');
 *   updateUI(data);
 * });
 * 
 * // 页面关闭时清理
 * stateManager.unsubscribeAll('user-wallet');
 */

import logger from '../../../logger.js';
import { saveData, loadData } from '../data-storage/storage-api.js';

class StateManager {
  constructor() {
    /**
     * 订阅者管理
     * 格式：Map<pageId, Map<dataKey, Set<callback>>>
     * 
     * @type {Map<string, Map<string, Set<Function>>>}
     * 
     * @example
     * subscribers = Map {
     *   'user-wallet' => Map {
     *     'wallet' => Set { callback1, callback2 },
     *     'membership' => Set { callback3 }
     *   },
     *   'user-profile' => Map {
     *     'membership' => Set { callback4 }
     *   }
     * }
     */
    this.subscribers = new Map();
    
    /**
     * 快照存储（用于重roll）
     * 格式：Map<snapshotId, Object>
     * 
     * @type {Map<string, Object>}
     * 
     * @example
     * snapshots = Map {
     *   'snapshot_contact1' => {
     *     wallet: { balance: 100, transactions: [...] },
     *     membership: { level: 'vip', expireTime: ... }
     *   }
     * }
     */
    this.snapshots = new Map();
  }
  
  /**
   * 获取数据（直接从持久化存储读取）
   * 
   * @param {string} key - 数据键（如 'wallet', 'membership'）
   * @returns {Promise<any>} 数据（从持久化读取，可能为null）
   * 
   * @description
   * 不缓存数据，每次都从持久化读取
   * 确保数据始终是最新的
   */
  async get(key) {
    return await loadData(key);
  }
  
  /**
   * 更新数据（保存到持久化，并通知订阅者）
   * 
   * @param {string} key - 数据键
   * @param {any} value - 新值（完整数据对象）
   * @param {Object} [meta={}] - 元数据（传递给订阅者，可包含任意字段如action、transaction等）
   * 
   * @description
   * 执行流程：
   * 1. 保存数据到 SillyTavern 持久化
   * 2. 通知所有订阅了该数据键的回调
   * 
   * 常用元数据字段：
   * - action：操作类型（如 'addTransaction', 'updateBalance', 'restore'）
   * - fromSnapshot：是否来自快照恢复
   * - 其他业务相关字段（如 transaction、contactId 等）
   * 
   * @example
   * await stateManager.set('wallet', walletData, {
   *   action: 'addTransaction',
   *   transaction: { id: '123', amount: 50 }
   * });
   */
  async set(key, value, meta = {}) {
    // 1. 保存到 SillyTavern 持久化
    await saveData(key, value);
    
    logger.debug('phone',`[StateManager] 数据已保存: ${key}`, meta);
    
    // 2. 通知所有订阅者
    await this.notify(key, meta);
  }
  
  /**
   * 订阅数据变化
   * 
   * @param {string} pageId - 页面ID（用于自动清理）
   * @param {string} key - 数据键
   * @param {Function} callback - 回调函数 async (meta) => void
   * @returns {Function} 取消订阅的函数
   * 
   * @description
   * 回调函数参数：
   * - meta：元数据（来自set的第三个参数）
   * 
   * 回调函数内部需要：
   * - 检查页面是否还存在：if (!document.contains(container)) return;
   * - 需要完整数据时：const data = await stateManager.get(key);
   * 
   * @example
   * const unsubscribe = stateManager.subscribe('user-wallet', 'wallet', async (meta) => {
   *   if (!document.contains(container)) return;
   *   const data = await stateManager.get('wallet');
   *   updateUI(data, meta);
   * });
   * 
   * // 取消订阅
   * unsubscribe();
   */
  subscribe(pageId, key, callback) {
    // 确保页面组存在
    if (!this.subscribers.has(pageId)) {
      this.subscribers.set(pageId, new Map());
    }
    
    const pageSubscribers = this.subscribers.get(pageId);
    
    // 确保数据键组存在
    if (!pageSubscribers.has(key)) {
      pageSubscribers.set(key, new Set());
    }
    
    const keySubscribers = pageSubscribers.get(key);
    keySubscribers.add(callback);
    
    logger.debug('phone',`[StateManager] 订阅: ${pageId} → ${key} (共${keySubscribers.size}个)`);
    
    // 返回取消订阅函数
    return () => {
      keySubscribers.delete(callback);
      logger.debug('phone',`[StateManager] 取消订阅: ${pageId} → ${key}`);
    };
  }
  
  /**
   * 通知订阅者（只传元数据，不传完整数据）
   * 
   * @private
   * @param {string} key - 数据键
   * @param {Object} meta - 元数据
   * 
   * @description
   * 遍历所有页面，找到订阅了该数据键的回调
   * 执行回调，传递元数据
   * 如果回调出错，捕获错误并继续执行其他回调
   */
  async notify(key, meta) {
    let notifiedCount = 0;
    
    // 遍历所有页面
    for (const [pageId, pageSubscribers] of this.subscribers.entries()) {
      // 检查该页面是否订阅了这个key
      if (pageSubscribers.has(key)) {
        const keySubscribers = pageSubscribers.get(key);
        
        // 通知所有回调
        for (const callback of keySubscribers) {
          try {
            await callback(meta);
            notifiedCount++;
          } catch (error) {
            logger.error('phone',`[StateManager] 订阅者回调出错 (${pageId} → ${key}):`, error);
          }
        }
      }
    }
    
    logger.debug('phone',`[StateManager] 已通知 ${notifiedCount} 个订阅者: ${key}`);
  }
  
  /**
   * 清理页面的所有订阅（页面关闭时调用）
   * 
   * @param {string} pageId - 页面ID
   * 
   * @description
   * 删除该页面的所有订阅关系
   * 防止内存泄漏
   * 
   * @example
   * // 页面关闭时
   * stateManager.unsubscribeAll('user-wallet');
   */
  unsubscribeAll(pageId) {
    if (this.subscribers.has(pageId)) {
      const pageSubscribers = this.subscribers.get(pageId);
      let totalCount = 0;
      
      for (const keySubscribers of pageSubscribers.values()) {
        totalCount += keySubscribers.size;
      }
      
      this.subscribers.delete(pageId);
      logger.info('phone',`[StateManager] 清理页面订阅: ${pageId} (共${totalCount}个)`);
    }
  }
  
  /**
   * 保存快照（用于重roll）
   * 
   * @param {string} snapshotId - 快照ID（建议格式：'snapshot_' + contactId）
   * @param {string[]} keys - 要保存的数据键列表
   * 
   * @description
   * 从持久化存储读取当前数据，保存到内存快照
   * 
   * @example
   * stateManager.saveSnapshot('snapshot_contact1', [
   *   'wallet',
   *   'membership',
   *   'messages_contact1'
   * ]);
   */
  async saveSnapshot(snapshotId, keys) {
    const snapshot = {};
    
    // 从持久化存储读取当前数据
    for (const key of keys) {
      snapshot[key] = await loadData(key);
    }
    
    this.snapshots.set(snapshotId, snapshot);
    logger.debug('phone',`[StateManager] 保存快照: ${snapshotId}`, keys);
  }
  
  /**
   * 恢复快照（用于重roll）
   * 
   * @param {string} snapshotId - 快照ID
   * 
   * @description
   * 从内存快照读取数据，恢复到持久化存储
   * 并通知所有订阅者
   * 
   * @example
   * await stateManager.restoreSnapshot('snapshot_contact1');
   */
  async restoreSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    
    if (!snapshot) {
      logger.warn('phone',`[StateManager] 快照不存在: ${snapshotId}`);
      return;
    }
    
    // 恢复数据并通知所有订阅者
    for (const [key, value] of Object.entries(snapshot)) {
      await this.set(key, value, { action: 'restore', fromSnapshot: true });
    }
    
    logger.info('phone',`[StateManager] 恢复快照: ${snapshotId}`);
  }
  
  /**
   * 获取统计信息（用于调试）
   * 
   * @returns {Object} 统计信息
   * @property {number} totalPages - 订阅的页面总数
   * @property {number} totalSubscribers - 订阅者总数
   * @property {number} totalSnapshots - 快照总数
   * @property {Array<{pageId: string, count: number}>} pages - 每个页面的订阅数量
   * 
   * @example
   * const stats = stateManager.getStats();
   * console.log(stats);
   * // {
   * //   totalPages: 3,
   * //   totalSubscribers: 8,
   * //   totalSnapshots: 2,
   * //   pages: [
   * //     { pageId: 'user-wallet', count: 3 },
   * //     { pageId: 'user-profile', count: 2 },
   * //     { pageId: 'membership-center', count: 3 }
   * //   ]
   * // }
   */
  getStats() {
    let totalSubscribers = 0;
    const pageStats = [];
    
    for (const [pageId, pageSubscribers] of this.subscribers.entries()) {
      let pageTotal = 0;
      for (const keySubscribers of pageSubscribers.values()) {
        pageTotal += keySubscribers.size;
      }
      totalSubscribers += pageTotal;
      pageStats.push({ pageId, count: pageTotal });
    }
    
    return {
      totalPages: this.subscribers.size,
      totalSubscribers,
      totalSnapshots: this.snapshots.size,
      pages: pageStats
    };
  }
}

// 导出单例
export const stateManager = new StateManager();
