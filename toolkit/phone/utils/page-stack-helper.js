/**
 * 页面栈管理器
 * 
 * 职责：
 * - 记录页面跳转历史（栈结构）
 * - 管理层级式返回逻辑
 * - 支持从任意主页面进入子页面
 * 
 * 设计理念：
 * - 栈底始终是主页面（messages/contacts/moments）
 * - 栈中是层级页面（new-friends/contact-profile/contact-settings等）
 * - 关闭手机时清空栈（不持久化）
 */

import logger from '../../../logger.js';

/**
 * @typedef {Object} PageStackItem
 * @property {string} pageName - 页面名称（如 'contact-profile', 'chat'）
 * @property {string} pageId - 实际DOM ID（如 'page-contact-profile', 'page-chat-tavern_xxx'）
 * @property {Object} params - 页面参数（如 {contactId: 'xxx'}）
 * @property {string} fromMainTab - 来自哪个主页面（messages/contacts/moments）
 */

/**
 * 页面栈管理器类
 */
class PageStackManager {
  constructor() {
    /** @type {PageStackItem[]} 页面栈 */
    this.stack = [];

    /** @type {string} 当前主页面 */
    this.currentMainTab = 'messages';

    logger.debug('[PageStack] 页面栈管理器已初始化');
  }

  /**
   * 压栈：进入新页面
   * 
   * @param {string} pageName - 页面名称（如 'chat', 'contact-profile'）
   * @param {string} pageId - 实际DOM ID（如 'page-chat-tavern_xxx'）
   * @param {Object} params - 页面参数
   * @param {string} fromMainTab - 来自哪个主页面
   */
  pushPage(pageName, pageId, params = {}, fromMainTab = 'messages') {
    const item = {
      pageName,
      pageId,
      params,
      fromMainTab
    };

    this.stack.push(item);
    logger.debug('[PageStack.push] 进入页面:', pageName, 'ID:', pageId, '来自:', fromMainTab, '栈深度:', this.stack.length);
  }

  /**
   * 出栈：返回上一页
   * 
   * @returns {PageStackItem|null} 当前页面项（已从栈中移除）
   */
  popPage() {
    if (this.stack.length === 0) {
      logger.warn('[PageStack.pop] 栈已空，无法出栈');
      return null;
    }

    const item = this.stack.pop();
    logger.debug('[PageStack.pop] 离开页面:', item.pageName, '剩余栈深度:', this.stack.length);
    return item;
  }

  /**
   * 获取当前页面（栈顶）
   * 
   * @returns {PageStackItem|null} 当前页面项（不移除）
   */
  getCurrentPage() {
    if (this.stack.length === 0) {
      return null;
    }
    return this.stack[this.stack.length - 1];
  }

  /**
   * 获取上一页面（倒数第二层）
   * 
   * @returns {PageStackItem|null} 上一页面项（不移除）
   */
  getPreviousPage() {
    if (this.stack.length < 2) {
      return null;
    }
    return this.stack[this.stack.length - 2];
  }

  /**
   * 检查是否在主页面
   * 
   * @returns {boolean} 是否在主页面（栈为空）
   */
  isOnMainPage() {
    return this.stack.length === 0;
  }

  /**
   * 检查是否可以返回
   * 
   * @returns {boolean} 是否可以返回（栈不为空）
   */
  canGoBack() {
    return this.stack.length > 0;
  }

  /**
   * 清空栈（切换主页面时）
   * 
   * @param {string} newMainTab - 新的主页面名称
   */
  resetStack(newMainTab) {
    logger.info('[PageStack.reset] 清空栈，切换到主页面:', newMainTab);
    this.stack = [];
    this.currentMainTab = newMainTab;
  }

  /**
   * 获取栈底的主页面
   * 
   * @returns {string} 主页面名称
   */
  getBaseMainTab() {
    if (this.stack.length === 0) {
      return this.currentMainTab;
    }
    return this.stack[0].fromMainTab;
  }

  /**
   * 获取栈深度
   * 
   * @returns {number} 栈中页面数量
   */
  getDepth() {
    return this.stack.length;
  }

  /**
   * 查找页面在栈中的位置
   * 
   * @param {string} pageId - 实际DOM ID（如 'page-chat-tavern_xxx', 'page-contact-profile'）
   * @returns {number} 页面在栈中的索引（-1表示不存在）
   */
  findPageIndex(pageId) {
    for (let i = 0; i < this.stack.length; i++) {
      if (this.stack[i].pageId === pageId) {
        return i;
      }
    }

    return -1;
  }

  /**
   * 出栈到指定位置（移除该位置之后的所有页面）
   * 
   * @param {number} targetIndex - 目标索引
   * @returns {PageStackItem[]} 被移除的页面列表
   */
  popToIndex(targetIndex) {
    if (targetIndex < 0 || targetIndex >= this.stack.length) {
      logger.warn('[PageStack.popToIndex] 索引无效:', targetIndex);
      return [];
    }

    // 移除目标索引之后的所有页面
    const removed = this.stack.splice(targetIndex + 1);

    logger.info('[PageStack.popToIndex] 出栈到索引', targetIndex, '，移除了', removed.length, '个页面');
    removed.forEach(item => {
      logger.debug('  移除:', item.pageName);
    });

    return removed;
  }

  /**
   * 从栈中移除指定页面（不影响其他页面）
   * 
   * @description
   * 用于删除聊天记录等场景，需要彻底移除某个页面的栈记录
   * 
   * @param {string} pageId - 实际DOM ID（如 'page-chat-tavern_xxx'）
   * @returns {boolean} 是否成功移除
   */
  removePageById(pageId) {
    const index = this.findPageIndex(pageId);

    if (index === -1) {
      logger.debug('[PageStack.removePageById] 页面不在栈中:', pageId);
      return false;
    }

    // 从栈中移除该页面
    const removed = this.stack.splice(index, 1)[0];
    logger.info('[PageStack.removePageById] 已从栈中移除页面:', removed.pageName, '剩余栈深度:', this.stack.length);

    return true;
  }

  /**
   * 调试：打印栈内容
   */
  debugPrintStack() {
    logger.debug('[PageStack] 当前栈状态:');
    logger.debug('  主页面:', this.currentMainTab);
    logger.debug('  栈深度:', this.stack.length);
    this.stack.forEach((item, index) => {
      logger.debug(`  [${index}] ${item.pageName} (from ${item.fromMainTab})`);
    });
  }
}

// 导出单例
const pageStack = new PageStackManager();

export default pageStack;

