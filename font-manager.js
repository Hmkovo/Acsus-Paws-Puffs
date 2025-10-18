/**
 * 字体管理器 - 核心逻辑
 * 
 * @description
 * 负责字体的完整生命周期管理：
 * - 添加、删除、切换字体
 * - 标签分类管理
 * - 导入导出配置
 * - 应用字体到页面（通过动态插入 style 标签）
 * - 持久化存储到 extension_settings
 * 
 * 采用事件驱动架构，与 FontManagerUI 通过 eventSource 通信
 */

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource } from "../../../../script.js";
import { FontManagerUI } from './font-manager-ui.js';
import logger from './logger.js';

export class FontManager {
  /**
   * 构造函数
   * 
   * @description
   * 初始化字体管理器的内部状态
   * - fonts: Map 结构存储字体数据（键为字体名，值为字体对象）
   * - tags: Set 结构存储所有标签（自动去重）
   * - currentFont: 当前应用的字体名称
   * - fontEnabled: 字体功能总开关
   */
  constructor() {
    // 字体列表（Map结构：字体名 → 字体数据）
    this.fonts = new Map();

    // 当前选中的字体
    this.currentFont = null;

    // 标签系统
    this.tags = new Set();
    this.currentTag = 'all';

    // 字体功能开关
    this.fontEnabled = true;

    // UI实例
    this.ui = null;
  }

  /**
   * 初始化字体管理器
   * 
   * @description
   * 从 extension_settings 加载保存的字体数据和配置：
   * 1. 加载所有字体列表和标签
   * 2. 加载字体功能开关状态
   * 3. 加载当前选中的字体
   * 4. 如果功能已开启且有选中字体，自动应用到页面
   * 
   * @async
   */
  async init() {
    logger.debug('[FontManager.init] 开始初始化');

    // 确保设置对象存在
    extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
    extension_settings['Acsus-Paws-Puffs'].fontManager = extension_settings['Acsus-Paws-Puffs'].fontManager || {};

    // 加载保存的字体数据
    await this.loadFonts();

    // 加载字体功能开关状态
    const savedEnabled = extension_settings['Acsus-Paws-Puffs'].fontManager.enabled;
    if (savedEnabled !== undefined) {
      this.fontEnabled = savedEnabled;
    }
    logger.debug('[FontManager.init] 字体功能状态:', this.fontEnabled ? '启用' : '禁用');

    // 加载当前选中的字体
    const savedCurrent = extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont;
    if (savedCurrent && this.fonts.has(savedCurrent)) {
      this.currentFont = savedCurrent;
      logger.debug('[FontManager.init] 当前字体:', savedCurrent);
    } else if (savedCurrent) {
      logger.warn('[FontManager.init] 保存的字体不存在:', savedCurrent);
    }

    // 如果字体功能开启且有选中的字体，应用它
    if (this.currentFont && this.fontEnabled) {
      const fontData = this.fonts.get(this.currentFont);
      if (fontData) {
        this.applyFont(fontData);
      }
    }

    logger.info('[FontManager.init] 初始化完成: 字体', this.fonts.size, '个，标签', this.tags.size, '个');
  }

  /**
   * 设置字体功能开关
   * 
   * @description
   * 控制字体功能的总开关：
   * - 开启时：应用当前选中的字体
   * - 关闭时：清除页面上应用的字体，恢复默认
   * 
   * 会触发 pawsFontEnabledChanged 事件通知其他模块
   * 
   * @async
   * @param {boolean} enabled - 是否启用字体功能
   */
  async setEnabled(enabled) {
    this.fontEnabled = enabled;
    extension_settings['Acsus-Paws-Puffs'].fontManager.enabled = enabled;
    saveSettingsDebounced();

    // 如果关闭，清除应用的字体
    if (!enabled) {
      this.clearAppliedFont();
    } else if (this.currentFont) {
      // 如果开启，重新应用当前字体
      const font = this.fonts.get(this.currentFont);
      if (font) {
        this.applyFont(font);
      }
    }

    // 通知其他模组
    eventSource.emit('pawsFontEnabledChanged', enabled);

    logger.info('字体功能', enabled ? '已启用' : '已禁用');
  }

  /**
   * 应用字体到页面
   * 
   * @description
   * 通过动态创建 <style> 标签将字体应用到页面所有元素：
   * 1. 先清除旧的字体样式（删除已存在的 style 标签）
   * 2. 创建新的 style 标签，ID 为 'paws-puffs-font-style'
   * 3. 生成 CSS 代码：@import 字体链接 + 通配符选择器 + !important
   * 4. 排除 Font Awesome 图标（避免图标变成方块）
   * 
   * 使用 `*:not(...)` 通配符选择器 + `!important` 确保能覆盖任何主题的字体设置
   * 
   * 只有在 fontEnabled 为 true 时才会应用
   * 
   * @param {Object} font - 字体数据对象
   * @param {string} font.name - 字体名称
   * @param {string} font.url - 字体链接（Google Fonts、zeoseven 等）
   * @param {string} font.fontFamily - CSS font-family 值
   */
  applyFont(font) {
    // 只有开启时才应用
    if (!this.fontEnabled) {
      logger.debug('字体功能已禁用，跳过应用');
      return;
    }

    // 先清除旧的字体样式
    this.clearAppliedFont();

    // 创建新的样式标签
    const styleId = 'paws-puffs-font-style';
    const style = document.createElement('style');
    style.id = styleId;

    // 生成CSS代码
    let css = '';

    // 1. 添加字体导入链接
    if (font.url) {
      css += `@import url("${font.url}");\n\n`;
    }

    // 2. 应用到所有元素（终极简洁版：覆盖所有元素，不遗漏任何弹窗和UI）
    if (font.fontFamily) {
      css += `
      /* 应用到所有元素，但排除Font Awesome图标 */
      *:not([class*="fa-"]):not(.fa):not(.fas):not(.far):not(.fab):not(.fal):not(.fad) {
        font-family: '${font.fontFamily}', sans-serif !important;
      }`;
    }

    style.textContent = css;
    document.head.appendChild(style);
    logger.info('已应用字体:', font.name);
  }

  /**
   * 清除应用的字体
   * 
   * @description
   * 移除页面上由本扩展创建的字体样式标签
   * 恢复为系统默认字体
   */
  clearAppliedFont() {
    const existingStyle = document.getElementById('paws-puffs-font-style');
    if (existingStyle) {
      existingStyle.remove();
      logger.info('已清除应用的字体');
    }
  }

  /**
   * 删除标签
   * 
   * @description
   * 从标签系统中删除指定标签，并从所有字体中移除该标签：
   * 1. 遍历所有字体，移除包含此标签的引用
   * 2. 从标签集合中删除
   * 3. 如果当前筛选的是这个标签，重置为"全部"
   * 
   * 会触发 pawsFontTagsChanged 事件通知 UI 刷新
   * 
   * @async
   * @param {string} tagToDelete - 要删除的标签名
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteTag(tagToDelete) {
    if (!this.tags.has(tagToDelete)) {
      logger.warn('标签不存在:', tagToDelete);
      return false;
    }

    // 从所有字体中移除这个标签
    this.fonts.forEach((font) => {
      if (font.tags && font.tags.includes(tagToDelete)) {
        font.tags = font.tags.filter(tag => tag !== tagToDelete);
      }
    });

    // 从标签集合中删除
    this.tags.delete(tagToDelete);

    // 如果当前筛选的就是这个标签，重置为"全部"
    if (this.currentTag === tagToDelete) {
      this.currentTag = 'all';
    }

    await this.saveFonts();
    eventSource.emit('pawsFontTagsChanged', { action: 'deleted', tag: tagToDelete });

    logger.info('已删除标签:', tagToDelete);
    return true;
  }

  /**
   * 解析字体代码
   * 
   * @description
   * 从用户粘贴的 CSS 代码中提取字体信息：
   * 1. 使用正则匹配 import url(...) 提取字体链接
   * 2. 使用正则匹配 font-family 提取字体名称
   * 3. 尝试从 URL 中提取 zeoseven.com 的字体 ID
   * 4. 生成完整的字体数据对象
   * 
   * 支持多种输入格式：
   * - 完整 CSS（包含 import 和 font-family）
   * - 仅 import（需要提供 customName）
   * 
   * @param {string} input - 用户输入的 CSS 代码
   * @param {string} [customName=null] - 自定义字体名称（可选）
   * @returns {Object|null} 字体数据对象，解析失败返回 null
   */
  parseFont(input, customName = null) {
    logger.debug('[FontManager.parseFont] 开始解析字体代码');

    // 匹配 @import url(...) 格式
    const importMatch = input.match(/@import\s+url\(["']([^"']+)["']\)/);
    if (!importMatch) {
      const preview = input.substring(0, 100) + (input.length > 100 ? '...' : '');
      logger.warn('[FontManager.parseFont] 无法解析字体链接，输入:', preview);
      return null;
    }

    const url = importMatch[1];

    // 匹配 font-family: "字体名"
    const familyMatch = input.match(/font-family:\s*["']?([^"';]+)["']?/);
    const fontFamily = familyMatch ? familyMatch[1].trim() : (customName || 'Unknown Font');

    // 从URL中提取字体ID（zeoseven专用）
    let fontId = null;
    const idMatch = url.match(/fontsapi\.zeoseven\.com\/(\d+)\//);
    if (idMatch) {
      fontId = idMatch[1];
    }

    // 生成字体名称
    const defaultName = customName || fontFamily || `Font-${Date.now()}`;

    logger.debug('[FontManager.parseFont] 解析成功:', defaultName);

    return {
      name: defaultName,              // 唯一标识
      displayName: defaultName,       // 显示名称（可编辑）
      url: url,                       // 字体链接
      fontFamily: fontFamily,         // 字体族名
      fontId: fontId,                 // zeoseven ID
      css: input,                     // 原始CSS代码
      tags: [],                       // 标签列表
      order: Date.now(),              // 排序
      addedAt: new Date().toISOString(), // 添加时间
      custom: {}                      // 自定义数据
    };
  }

  /**
   * 添加字体到管理器
   * 
   * @description
   * 将字体添加到管理器并持久化存储：
   * 1. 如果传入字符串，先调用 parseFont() 解析
   * 2. 检查是否已存在同名字体（防止重复）
   * 3. 添加到 fonts Map 并更新标签集合
   * 4. 保存到 extension_settings
   * 5. 触发 pawsFontAdded 事件通知 UI 刷新
   * 
   * @async
   * @param {Object|string} fontData - 字体数据对象或 CSS 字符串
   * @returns {Promise<boolean>} 是否添加成功（false表示字体已存在）
   * 
   * @example
   * await fontManager.addFont({
   *   name: 'MyFont',
   *   url: 'https://...',
   *   fontFamily: 'MyFont',
   *   tags: ['serif']
   * });
   */
  async addFont(fontData) {
    // 如果传入的是字符串，先解析
    if (typeof fontData === 'string') {
      fontData = this.parseFont(fontData);
      if (!fontData) return false;
    }

    // 检查是否重复
    if (this.fonts.has(fontData.name)) {
      logger.warn('字体已存在:', fontData.name);
      return false;
    }

    // 添加到列表
    this.fonts.set(fontData.name, fontData);

    // 更新标签集合
    if (fontData.tags && fontData.tags.length > 0) {
      fontData.tags.forEach(tag => this.tags.add(tag));
    }

    await this.saveFonts();
    eventSource.emit('pawsFontAdded', fontData);

    logger.info('添加字体:', fontData.name);
    return true;
  }

  /**
   * 更新字体信息
   * 
   * @description
   * 更新已存在字体的属性（如名称、标签等）：
   * 1. 如果修改了字体名称，需要更新 Map 的键
   * 2. 如果是当前应用的字体，同步更新 currentFont 引用
   * 3. 如果修改了标签，刷新标签列表并触发 pawsFontTagsChanged
   * 4. 触发 pawsFontUpdated 事件通知 UI 刷新
   * 
   * @async
   * @param {string} fontName - 要更新的字体名称
   * @param {Object} updates - 更新的属性对象
   * @param {string} [updates.name] - 新的字体名称
   * @param {string} [updates.displayName] - 新的显示名称
   * @param {string[]} [updates.tags] - 新的标签数组
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateFont(fontName, updates) {
    logger.debug('[FontManager.updateFont] 更新字体:', fontName);

    const font = this.fonts.get(fontName);
    if (!font) {
      logger.warn('[FontManager.updateFont] 字体不存在:', fontName);
      return false;
    }

    // 如果改了名字，需要更新Map的key
    if (updates.name && updates.name !== fontName) {
      this.fonts.delete(fontName);
      this.fonts.set(updates.name, { ...font, ...updates });

      // 如果是当前字体，更新引用
      if (this.currentFont === fontName) {
        this.currentFont = updates.name;
        extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont = this.currentFont;
      }

      logger.info('[FontManager.updateFont] 已重命名:', fontName, '→', updates.name);
    } else {
      this.fonts.set(fontName, { ...font, ...updates });
      logger.info('[FontManager.updateFont] 已更新字体:', fontName);
    }

    // 如果更新了标签，刷新标签列表
    if (updates.tags) {
      this.updateTagsList();
      eventSource.emit('pawsFontTagsChanged', { action: 'updated', font: fontName });
    }

    await this.saveFonts();
    eventSource.emit('pawsFontUpdated', { oldName: fontName, font: this.fonts.get(updates.name || fontName) });

    return true;
  }

  /**
   * 删除字体
   * 
   * @description
   * 从管理器中删除指定字体：
   * 1. 从 fonts Map 中删除
   * 2. 如果删除的是当前应用的字体，清空选择并清除页面样式
   * 3. 刷新标签列表（移除不再使用的标签）
   * 4. 触发 pawsFontRemoved 和可能的 pawsFontChanged 事件
   * 
   * @async
   * @param {string} fontName - 要删除的字体名称
   * @returns {Promise<boolean>} 是否删除成功
   */
  async removeFont(fontName) {
    if (!this.fonts.has(fontName)) {
      logger.warn('[FontManager.removeFont] 字体不存在:', fontName);
      return false;
    }

    const font = this.fonts.get(fontName);
    this.fonts.delete(fontName);

    // 如果删除的是当前字体，清空选择
    if (this.currentFont === fontName) {
      this.currentFont = null;
      extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont = null;
      this.clearAppliedFont();
      eventSource.emit('pawsFontChanged', null);
      logger.info('[FontManager.removeFont] 已删除当前字体:', fontName);
    } else {
      logger.info('[FontManager.removeFont] 已删除字体:', fontName);
    }

    this.updateTagsList();
    await this.saveFonts();
    eventSource.emit('pawsFontRemoved', font);

    return true;
  }

  /**
   * 设置当前字体
   * 
   * @description
   * 切换当前应用的字体：
   * 1. 保存选择到 currentFont 和 extension_settings
   * 2. 如果字体功能已开启，调用 applyFont() 应用到页面
   * 3. 如果功能已关闭，仅保存选择不应用
   * 4. 触发 pawsFontChanged 事件通知 UI 更新
   * 
   * @async
   * @param {string} fontName - 要设置的字体名称
   * @returns {Promise<boolean>} 是否设置成功
   */
  async setCurrentFont(fontName) {
    logger.debug('[FontManager.setCurrentFont] 设置字体:', fontName);

    if (!this.fonts.has(fontName)) {
      logger.warn('[FontManager.setCurrentFont] 字体不存在:', fontName);
      return false;
    }

    // 保存选择
    this.currentFont = fontName;
    extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont = fontName;
    await this.saveFonts();

    // 如果功能开启，应用字体
    if (this.fontEnabled) {
      const font = this.fonts.get(fontName);
      if (font) {
        this.applyFont(font);
      }
      logger.info('[FontManager.setCurrentFont] 已切换字体:', fontName);
    } else {
      logger.debug('[FontManager.setCurrentFont] 字体功能已禁用，已保存选择但不应用');
    }

    eventSource.emit('pawsFontChanged', fontName);
    return true;
  }

  /**
   * 获取当前字体对象
   * @returns {Object|null} 当前字体的完整数据对象，未选中时返回 null
   */
  getCurrentFont() {
    return this.currentFont ? this.fonts.get(this.currentFont) : null;
  }

  /**
   * 获取指定字体对象
   * @param {string} fontName - 字体名称
   * @returns {Object|undefined} 字体数据对象，不存在时返回 undefined
   */
  getFont(fontName) {
    return this.fonts.get(fontName);
  }

  /**
   * 获取所有字体（支持标签筛选）
   * 
   * @description
   * 返回字体数组，可选按标签筛选：
   * - tag = null 或 'all'：返回所有字体
   * - tag = 'untagged'：返回未分类的字体
   * - tag = 具体标签名：返回包含该标签的字体
   * 
   * @param {string|null} [tag=null] - 筛选标签（可选）
   * @returns {Object[]} 字体数组
   */
  getAllFonts(tag = null) {
    const fontsArray = Array.from(this.fonts.values());

    // 标签筛选
    if (tag && tag !== 'all') {
      if (tag === 'untagged') {
        // 未分类
        return fontsArray.filter(font => !font.tags || font.tags.length === 0);
      }
      // 指定标签
      return fontsArray.filter(font => font.tags && font.tags.includes(tag));
    }

    return fontsArray;
  }

  /**
   * 按标签分组获取字体
   * 
   * @description
   * 返回一个对象，键为标签名，值为字体数组：
   * - all: 所有字体
   * - untagged: 未分类的字体
   * - [标签名]: 包含该标签的字体数组
   * 
   * @returns {Object.<string, Object[]>} 分组后的字体对象
   * 
   * @example
   * const grouped = fontManager.getFontsByTags();
   * // { all: [...], untagged: [...], serif: [...], ... }
   */
  getFontsByTags() {
    const grouped = {
      all: this.getAllFonts(),
      untagged: []
    };

    // 初始化标签组
    this.tags.forEach(tag => {
      grouped[tag] = [];
    });

    // 分组
    this.fonts.forEach(font => {
      if (!font.tags || font.tags.length === 0) {
        grouped.untagged.push(font);
      } else {
        font.tags.forEach(tag => {
          if (grouped[tag]) {
            grouped[tag].push(font);
          }
        });
      }
    });

    return grouped;
  }

  /**
   * 更新字体排序
   * 
   * @description
   * 根据用户拖拽排序的结果，更新每个字体的 order 属性
   * 并触发 pawsFontOrderChanged 事件
   * 
   * @async
   * @param {string[]} sortedNames - 排序后的字体名称数组
   */
  async updateOrder(sortedNames) {
    sortedNames.forEach((name, index) => {
      const font = this.fonts.get(name);
      if (font) {
        font.order = index;
      }
    });

    await this.saveFonts();
    eventSource.emit('pawsFontOrderChanged', sortedNames);
  }

  /**
   * 导出字体配置为 JSON
   * 
   * @description
   * 将所有字体、标签、当前字体、功能开关状态导出为 JSON 字符串
   * 用于备份或分享字体配置
   * 
   * @returns {string} JSON 格式的字体配置字符串
   * 
   * @example
   * const jsonData = fontManager.exportFonts();
   * // 保存到文件或分享给其他用户
   */
  exportFonts() {
    const exportData = {
      version: '2.0.0',
      exportDate: new Date().toISOString(),
      fonts: Array.from(this.fonts.values()),
      currentFont: this.currentFont,
      fontEnabled: this.fontEnabled,
      tags: Array.from(this.tags)
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导入字体配置
   * 
   * @description
   * 从 JSON 数据导入字体配置，支持两种模式：
   * - 合并模式（merge=true）：保留现有字体，只添加新的
   * - 替换模式（merge=false）：清空现有字体，完全替换
   * 
   * 导入内容包括：
   * 1. 字体列表和标签
   * 2. 当前字体选择
   * 3. 功能开关状态
   * 
   * @async
   * @param {string} jsonData - JSON 格式的字体配置字符串
   * @param {boolean} [merge=true] - 导入模式（true=合并，false=替换）
   * @returns {Promise<number>} 成功导入的字体数量
   * @throws {Error} JSON 格式错误或数据无效时
   * 
   * @example
   * const count = await fontManager.importFonts(jsonData, true);
   * console.log(`导入了 ${count} 个字体`);
   */
  async importFonts(jsonData, merge = true) {
    logger.info('[FontManager.importFonts] 开始导入，模式:', merge ? '合并' : '替换');

    try {
      const data = JSON.parse(jsonData);

      if (!data.fonts || !Array.isArray(data.fonts)) {
        throw new Error('无效的导入数据格式');
      }

      logger.debug('[FontManager.importFonts] 解析成功，共', data.fonts.length, '个字体');

      // 如果是替换模式，先清空
      if (!merge) {
        const oldCount = this.fonts.size;
        this.fonts.clear();
        this.tags.clear();
        logger.debug('[FontManager.importFonts] 已清空现有', oldCount, '个字体（替换模式）');
      }

      // 导入字体
      let imported = 0;
      let skipped = 0;
      data.fonts.forEach(font => {
        // 合并模式下，跳过已存在的字体
        if (merge && this.fonts.has(font.name)) {
          logger.debug('[FontManager.importFonts] 跳过已存在的字体:', font.name);
          skipped++;
          return;
        }

        this.fonts.set(font.name, font);

        // 更新标签
        if (font.tags && font.tags.length > 0) {
          font.tags.forEach(tag => this.tags.add(tag));
        }

        imported++;
      });

      // 导入当前字体
      if (data.currentFont && this.fonts.has(data.currentFont)) {
        this.currentFont = data.currentFont;
        extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont = this.currentFont;
        logger.debug('[FontManager.importFonts] 已设置当前字体:', data.currentFont);
      }

      // 导入开关状态
      if (data.fontEnabled !== undefined) {
        this.fontEnabled = data.fontEnabled;
        extension_settings['Acsus-Paws-Puffs'].fontManager.enabled = this.fontEnabled;
      }

      await this.saveFonts();
      eventSource.emit('pawsFontImported', { count: imported, total: data.fonts.length });
      eventSource.emit('pawsFontTagsChanged', { action: 'imported' });

      logger.info(`[FontManager.importFonts] 导入完成: ${imported} 成功, ${skipped} 跳过, ${data.fonts.length - imported - skipped} 失败`);
      return imported;
    } catch (error) {
      logger.error('[FontManager.importFonts] 导入失败:', error.message || error);
      throw error;
    }
  }

  /**
   * 批量添加字体
   * 
   * @description
   * 循环调用 addFont() 添加多个字体
   * 统计成功和失败的数量
   * 
   * @async
   * @param {Object[]} fontsData - 字体数据对象数组
   * @returns {Promise<number>} 成功添加的字体数量
   */
  async addFontsBatch(fontsData) {
    logger.info('[FontManager.addFontsBatch] 开始批量添加，共', fontsData.length, '个字体');

    let added = 0;
    let failed = 0;

    for (const fontData of fontsData) {
      if (await this.addFont(fontData)) {
        added++;
      } else {
        failed++;
      }
    }

    logger.info(`[FontManager.addFontsBatch] 批量添加完成: ${added} 成功, ${failed} 失败`);
    return added;
  }

  /**
   * 刷新标签列表
   * 
   * @description
   * 从所有字体中重新收集标签，更新 this.tags 集合
   * 当标签被修改或字体被删除后调用，确保标签列表准确
   * 会触发 pawsFontTagsChanged 事件
   */
  updateTagsList() {
    this.tags.clear();
    this.fonts.forEach(font => {
      if (font.tags && font.tags.length > 0) {
        font.tags.forEach(tag => this.tags.add(tag));
      }
    });

    eventSource.emit('pawsFontTagsChanged', { action: 'refresh' });
  }

  /**
   * 保存字体到 extension_settings
   * 
   * @description
   * 将字体数据、标签、当前字体、功能开关持久化保存
   * 调用 saveSettingsDebounced() 防抖保存到磁盘
   * 
   * @async
   */
  async saveFonts() {
    const data = {
      fonts: Array.from(this.fonts.entries()),
      tags: Array.from(this.tags),
      currentFont: this.currentFont
    };

    extension_settings['Acsus-Paws-Puffs'].fontManager.fonts = data;
    extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont = this.currentFont;
    extension_settings['Acsus-Paws-Puffs'].fontManager.enabled = this.fontEnabled;
    saveSettingsDebounced();
  }

  /**
   * 从 extension_settings 加载字体
   * 
   * @description
   * 从持久化存储中恢复字体数据：
   * 1. 恢复 fonts Map（字体列表）
   * 2. 恢复 tags Set（标签集合）
   * 3. 恢复 currentFont（当前字体）
   * 
   * 兼容旧版本的数据结构
   * 
   * @async
   */
  async loadFonts() {
    try {
      const data = extension_settings['Acsus-Paws-Puffs'].fontManager.fonts;

      if (!data) {
        logger.debug('[FontManager.loadFonts] 首次使用，无历史数据');
        return;
      }

      // 恢复字体Map
      if (data.fonts && Array.isArray(data.fonts)) {
        this.fonts = new Map(data.fonts);
      }

      // 恢复标签Set
      if (data.tags && Array.isArray(data.tags)) {
        this.tags = new Set(data.tags);
      }

      // 恢复当前字体
      if (data.currentFont) {
        this.currentFont = data.currentFont;
      }

      // 兼容旧版本：尝试从单独的字段读取
      const separateCurrentFont = extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont;
      if (separateCurrentFont && this.fonts.has(separateCurrentFont)) {
        this.currentFont = separateCurrentFont;
      }

      logger.debug('[FontManager.loadFonts] 加载成功，字体', this.fonts.size, '个，标签', this.tags.size, '个');
    } catch (error) {
      logger.error('[FontManager.loadFonts] 加载失败:', error.message || error);
      // 不抛出异常，允许初始化继续
    }
  }

  /**
   * 清理字体样式
   * 
   * @description
   * 清除页面上应用的字体，但保留字体数据
   * 通常在禁用扩展时调用
   */
  cleanup() {
    this.clearAppliedFont();
  }

  /**
   * 销毁字体管理器
   * 
   * @description
   * 清理资源并销毁 UI 实例
   * 通常在卸载扩展时调用
   */
  destroy() {
    this.cleanup();

    if (this.ui) {
      this.ui.destroy();
    }
  }

  /**
   * 获取统计信息
   * 
   * @returns {Object} 统计信息对象包含 fontCount, tagCount, currentFont, enabled
   */
  getStats() {
    return {
      fontCount: this.fonts.size,
      tagCount: this.tags.size,
      currentFont: this.currentFont,
      enabled: this.fontEnabled
    };
  }

  /**
   * 清空所有字体数据
   * 
   * @description
   * 危险操作！删除所有字体和标签：
   * 1. 清空 fonts Map 和 tags Set
   * 2. 重置 currentFont 为 null
   * 3. 清除页面应用的字体样式
   * 4. 删除 extension_settings 中的数据
   * 5. 触发 pawsFontAllCleared 事件
   * 
   * 云端酒馆用户在卸载扩展前应该调用此方法
   * 
   * @async
   */
  async clearAllFonts() {
    const fontCount = this.fonts.size;
    const tagCount = this.tags.size;

    logger.info('[FontManager.clearAllFonts] 清空所有数据:', fontCount, '个字体,', tagCount, '个标签');

    this.fonts.clear();
    this.tags.clear();
    this.currentFont = null;

    this.clearAppliedFont();

    extension_settings['Acsus-Paws-Puffs'].fontManager.fonts = null;
    extension_settings['Acsus-Paws-Puffs'].fontManager.currentFont = null;
    saveSettingsDebounced();

    eventSource.emit('pawsFontAllCleared');

    logger.info('[FontManager.clearAllFonts] 清空完成');
  }

  /**
   * 渲染 UI 界面
   * 
   * @description
   * 创建 FontManagerUI 实例并初始化到指定容器
   * 由 index.js 调用，传入 #paws-puffs-font-panel 容器
   * 
   * @async
   * @param {HTMLElement} container - UI 容器元素
   */
  async renderUI(container) {
    this.ui = new FontManagerUI(this);
    await this.ui.init(container);
  }
}

