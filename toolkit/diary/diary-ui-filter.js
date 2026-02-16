/**
 * 日记UI - 筛选和搜索模块
 *
 * @description
 * 负责日记的筛选和搜索功能：
 * - 按类型筛选（全部/用户/AI）
 * - 按时间筛选（周/月/日期）
 * - 关键词搜索
 * - 周期标签更新
 *
 * @module DiaryUIFilter
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import logger from '../../logger.js';

// ========================================
// [CORE] 筛选搜索类
// ========================================

/**
 * 日记筛选搜索管理器
 *
 * @class DiaryUIFilter
 */
export class DiaryUIFilter {
  /**
   * 创建筛选搜索管理器
   *
   * @param {Object} dataManager - 数据管理器
   * @param {HTMLElement} panelElement - 面板元素
   */
  constructor(dataManager, panelElement) {
    this.dataManager = dataManager;
    this.panelElement = panelElement;
  }

  /**
   * 获取过滤后的日记
   *
   * @param {Object} filter - 筛选条件
   * @param {string} filter.type - 筛选类型（'all'/'user'/'ai'/'week'/'month'/'date'/'dateRange'）
   * @param {string} [filter.searchText] - 搜索文本
   * @param {number} [filter.weekOffset] - 周偏移
   * @param {number} [filter.monthOffset] - 月偏移
   * @param {string} [filter.selectedDate] - 选中的日期
   * @param {string} [filter.dateRangeStart] - 日期范围开始
   * @param {string} [filter.dateRangeEnd] - 日期范围结束
   * @returns {Array<Object>} 过滤后的日记列表
   */
  getFilteredDiaries(filter) {
    let diaries = this.dataManager.diaries;

    // 按类型筛选
    if (filter.type === 'user') {
      diaries = diaries.filter(d => d.author === 'user');
    } else if (filter.type === 'ai') {
      diaries = diaries.filter(d => d.author === 'ai');
    } else if (filter.type === 'week') {
      // 按周筛选（支持偏移）
      const weekStart = this.getWeekStart(filter.weekOffset);
      const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;
      diaries = diaries.filter(d => {
        const created = d.metadata.createdAt;
        return created >= weekStart && created < weekEnd;
      });
    } else if (filter.type === 'month') {
      // 按月筛选（支持偏移）
      const monthStart = this.getMonthStart(filter.monthOffset || 0);
      const monthEnd = this.getMonthEnd(filter.monthOffset || 0);
      diaries = diaries.filter(d => {
        const created = d.metadata.createdAt;
        return created >= monthStart && created <= monthEnd;
      });
    } else if (filter.type === 'date') {
      // 按指定日期筛选
      if (filter.selectedDate) {
        const selectedDate = new Date(filter.selectedDate);
        selectedDate.setHours(0, 0, 0, 0);
        const dayStart = selectedDate.getTime();
        const dayEnd = dayStart + 24 * 60 * 60 * 1000;

        diaries = diaries.filter(d => {
          const created = d.metadata.createdAt;
          return created >= dayStart && created < dayEnd;
        });
      }
    } else if (filter.type === 'dateRange') {
      // 按日期范围筛选（适合古代角色卡翻找）
      const startDate = filter.dateRangeStart ? new Date(filter.dateRangeStart) : null;
      const endDate = filter.dateRangeEnd ? new Date(filter.dateRangeEnd) : null;

      if (startDate || endDate) {
        diaries = diaries.filter(d => {
          const created = d.metadata.createdAt;

          // 开始日期：当天00:00:00
          if (startDate) {
            startDate.setHours(0, 0, 0, 0);
            if (created < startDate.getTime()) return false;
          }

          // 结束日期：当天23:59:59
          if (endDate) {
            endDate.setHours(23, 59, 59, 999);
            if (created > endDate.getTime()) return false;
          }

          return true;
        });
      }
    }

    // 搜索过滤
    if (filter.searchText) {
      const searchLower = filter.searchText.toLowerCase();
      diaries = diaries.filter(d => {
        // 搜索标题
        if (d.title.toLowerCase().includes(searchLower)) return true;

        // 搜索内容
        const hasContent = d.contentBlocks.some(block =>
          block.content.toLowerCase().includes(searchLower)
        );
        if (hasContent) return true;

        // 搜索评论
        const hasComment = this.searchInComments(d.comments, searchLower);
        if (hasComment) return true;

        return false;
      });
    }

    return diaries;
  }

  /**
   * 在评论中搜索（递归）
   *
   * @param {Array<Object>} comments - 评论列表
   * @param {string} searchText - 搜索文本（小写）
   * @returns {boolean} 是否找到匹配
   */
  searchInComments(comments, searchText) {
    for (const comment of comments) {
      if (comment.content.toLowerCase().includes(searchText)) {
        return true;
      }
      if (comment.replies && this.searchInComments(comment.replies, searchText)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取指定周的开始时间戳
   *
   * @param {number} offset - 周偏移（0=本周，-1=上周，1=下周）
   * @returns {number} 时间戳（毫秒）
   */
  getWeekStart(offset = 0) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 距离周一的天数

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysFromMonday + (offset * 7));
    monday.setHours(0, 0, 0, 0);

    return monday.getTime();
  }

  /**
   * 获取月开始时间（1日00:00）
   *
   * @param {number} offset - 月偏移（0=本月，-1=上月，1=下月）
   * @returns {number} 时间戳（毫秒）
   */
  getMonthStart(offset = 0) {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    targetMonth.setHours(0, 0, 0, 0);
    return targetMonth.getTime();
  }

  /**
   * 获取月结束时间（最后一天23:59:59）
   *
   * @param {number} offset - 月偏移（0=本月，-1=上月，1=下月）
   * @returns {number} 时间戳（毫秒）
   */
  getMonthEnd(offset = 0) {
    const now = new Date();
    const targetMonth = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    targetMonth.setHours(23, 59, 59, 999);
    return targetMonth.getTime();
  }

  /**
   * 处理筛选类型切换
   *
   * @param {string} filterType - 筛选类型
   * @param {Object} filter - 筛选状态对象（会被修改）
   * @param {Function} refreshCallback - 刷新日记的回调函数
   */
  handleFilterChange(filterType, filter, refreshCallback) {
    // 关闭所有展开面板
    this.closeAllFilterPanels();

    // 更新筛选类型
    filter.type = filterType;

    // 根据筛选类型展开对应面板
    if (filterType === 'week') {
      const weekPanel = this.panelElement.querySelector('#diaryWeekPanel');
      if (weekPanel) weekPanel.classList.add('active');
      filter.weekOffset = 0;
      this.updatePeriodLabel(filter);
    } else if (filterType === 'month') {
      const monthPanel = this.panelElement.querySelector('#diaryMonthPanel');
      if (monthPanel) monthPanel.classList.add('active');
      filter.monthOffset = 0;
      this.updatePeriodLabel(filter);
    } else if (filterType === 'date') {
      const datePanel = this.panelElement.querySelector('#diaryDatePickerPanel');
      if (datePanel) datePanel.classList.add('active');
    } else if (filterType === 'dateRange') {
      const dateRangePanel = this.panelElement.querySelector('#diaryDateRangePanel');
      if (dateRangePanel) dateRangePanel.classList.add('active');
    }

    // 刷新日记列表
    refreshCallback();

    logger.debug('diary', '[DiaryUIFilter.handleFilterChange] 筛选类型已切换:', filterType);
  }

  /**
   * 关闭所有筛选面板
   *
   * @description
   * 移除周/月/日期/日期范围筛选面板的active类，隐藏所有筛选面板
   */
  closeAllFilterPanels() {
    const weekPanel = this.panelElement.querySelector('#diaryWeekPanel');
    const monthPanel = this.panelElement.querySelector('#diaryMonthPanel');
    const datePanel = this.panelElement.querySelector('#diaryDatePickerPanel');
    const dateRangePanel = this.panelElement.querySelector('#diaryDateRangePanel');

    if (weekPanel) weekPanel.classList.remove('active');
    if (monthPanel) monthPanel.classList.remove('active');
    if (datePanel) datePanel.classList.remove('active');
    if (dateRangePanel) dateRangePanel.classList.remove('active');
  }

  /**
   * 更新周期标签显示（周/月）
   *
   * @param {Object} filter - 筛选状态对象
   */
  updatePeriodLabel(filter) {
    // 更新周标签
    const weekLabel = this.panelElement?.querySelector('#diaryWeekLabel');
    if (weekLabel) {
      const offset = filter.weekOffset || 0;
      if (offset === 0) {
        weekLabel.textContent = '本周';
      } else if (offset === -1) {
        weekLabel.textContent = '上周';
      } else if (offset === 1) {
        weekLabel.textContent = '下周';
      } else if (offset < -1) {
        weekLabel.textContent = `${Math.abs(offset)}周前`;
      } else {
        weekLabel.textContent = `${offset}周后`;
      }
    }

    // 更新月标签
    const monthLabel = this.panelElement?.querySelector('#diaryMonthLabel');
    if (monthLabel) {
      const offset = filter.monthOffset || 0;
      if (offset === 0) {
        monthLabel.textContent = '本月';
      } else if (offset === -1) {
        monthLabel.textContent = '上月';
      } else if (offset === 1) {
        monthLabel.textContent = '下月';
      } else if (offset < -1) {
        monthLabel.textContent = `${Math.abs(offset)}个月前`;
      } else {
        monthLabel.textContent = `${offset}个月后`;
      }
    }
  }
}

