/**
 * 字体管理器 - 核心逻辑
 * 
 * 功能：
 * - 添加、删除、切换字体
 * - 标签分类管理
 * - 导入导出配置
 * - 应用字体到页面
 */

import { extension_settings } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource } from "../../../../script.js";
import { FontManagerUI } from './font-manager-ui.js';

export class FontManager {
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
   */
  async init() {
    // 确保设置对象存在
    extension_settings.paws_puffs = extension_settings.paws_puffs || {};
    extension_settings.paws_puffs.fontManager = extension_settings.paws_puffs.fontManager || {};

    // 加载保存的字体数据
    await this.loadFonts();

    // 加载字体功能开关状态
    const savedEnabled = extension_settings.paws_puffs.fontManager.enabled;
    if (savedEnabled !== undefined) {
      this.fontEnabled = savedEnabled;
    }

    // 加载当前选中的字体
    const savedCurrent = extension_settings.paws_puffs.fontManager.currentFont;
    if (savedCurrent && this.fonts.has(savedCurrent)) {
      this.currentFont = savedCurrent;
    }

    // 如果字体功能开启且有选中的字体，应用它
    if (this.currentFont && this.fontEnabled) {
      const fontData = this.fonts.get(this.currentFont);
      if (fontData) {
        this.applyFont(fontData);
      }
    }

    console.log('[Paws-Puffs] 字体管理器初始化完成，已加载', this.fonts.size, '个字体');
  }

  /**
   * 设置字体功能开关
   */
  async setEnabled(enabled) {
    this.fontEnabled = enabled;
    extension_settings.paws_puffs.fontManager.enabled = enabled;
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

    console.log('[Paws-Puffs] 字体功能', enabled ? '已启用' : '已禁用');
  }

  /**
   * 应用字体到页面（完整元素列表）
   */
  applyFont(font) {
    // 只有开启时才应用
    if (!this.fontEnabled) {
      console.log('[Paws-Puffs] 字体功能已禁用，跳过应用');
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

    // 3. 如果有完整CSS，也加上
    if (font.css && !font.css.includes('font-family')) {
      css = font.css + '\n' + css;
    } else if (font.css) {
      css = font.css;
    }

    style.textContent = css;
    document.head.appendChild(style);
    console.log('[Paws-Puffs] 已应用字体:', font.name);
  }

  /**
   * 清除应用的字体
   */
  clearAppliedFont() {
    const existingStyle = document.getElementById('paws-puffs-font-style');
    if (existingStyle) {
      existingStyle.remove();
      console.log('[Paws-Puffs] 已清除应用的字体');
    }
  }

  /**
   * 删除标签（会从所有字体中移除）
   */
  async deleteTag(tagToDelete) {
    if (!this.tags.has(tagToDelete)) {
      console.warn('[Paws-Puffs] 标签不存在:', tagToDelete);
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

    console.log('[Paws-Puffs] 已删除标签:', tagToDelete);
    return true;
  }

  /**
   * 解析字体代码（支持zeoseven.com格式）
   */
  parseFont(input, customName = null) {
    // 匹配 @import url(...) 格式
    const importMatch = input.match(/@import\s+url\(["']([^"']+)["']\)/);
    if (!importMatch) {
      console.warn('[Paws-Puffs] 无法解析字体链接');
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
   * 添加字体
   */
  async addFont(fontData) {
    // 如果传入的是字符串，先解析
    if (typeof fontData === 'string') {
      fontData = this.parseFont(fontData);
      if (!fontData) return false;
    }

    // 检查是否重复
    if (this.fonts.has(fontData.name)) {
      console.warn('[Paws-Puffs] 字体已存在:', fontData.name);
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

    console.log('[Paws-Puffs] 添加字体:', fontData.name);
    return true;
  }

  /**
   * 更新字体信息
   */
  async updateFont(fontName, updates) {
    const font = this.fonts.get(fontName);
    if (!font) return false;

    // 如果改了名字，需要更新Map的key
    if (updates.name && updates.name !== fontName) {
      this.fonts.delete(fontName);
      this.fonts.set(updates.name, { ...font, ...updates });

      // 如果是当前字体，更新引用
      if (this.currentFont === fontName) {
        this.currentFont = updates.name;
        extension_settings.paws_puffs.fontManager.currentFont = this.currentFont;
      }
    } else {
      this.fonts.set(fontName, { ...font, ...updates });
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
   */
  async removeFont(fontName) {
    if (!this.fonts.has(fontName)) return false;

    const font = this.fonts.get(fontName);
    this.fonts.delete(fontName);

    // 如果删除的是当前字体，清空选择
    if (this.currentFont === fontName) {
      this.currentFont = null;
      extension_settings.paws_puffs.fontManager.currentFont = null;
      this.clearAppliedFont();
      eventSource.emit('pawsFontChanged', null);
    }

    this.updateTagsList();
    await this.saveFonts();
    eventSource.emit('pawsFontRemoved', font);

    return true;
  }

  /**
   * 设置当前字体
   */
  async setCurrentFont(fontName) {
    if (!this.fonts.has(fontName)) {
      console.warn('[Paws-Puffs] 字体不存在:', fontName);
      return false;
    }

    // 保存选择
    this.currentFont = fontName;
    extension_settings.paws_puffs.fontManager.currentFont = fontName;
    await this.saveFonts();

    // 如果功能开启，应用字体
    if (this.fontEnabled) {
      const font = this.fonts.get(fontName);
      if (font) {
        this.applyFont(font);
      }
    } else {
      console.log('[Paws-Puffs] 字体功能已禁用，已保存选择但不应用');
    }

    eventSource.emit('pawsFontChanged', fontName);
    return true;
  }

  /**
   * 获取当前字体
   */
  getCurrentFont() {
    return this.currentFont ? this.fonts.get(this.currentFont) : null;
  }

  /**
   * 获取指定字体
   */
  getFont(fontName) {
    return this.fonts.get(fontName);
  }

  /**
   * 获取所有字体（可按标签筛选）
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
   * 导出字体配置（JSON格式）
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
   * @param {boolean} merge - true=合并 false=替换
   */
  async importFonts(jsonData, merge = true) {
    try {
      const data = JSON.parse(jsonData);

      if (!data.fonts || !Array.isArray(data.fonts)) {
        throw new Error('无效的导入数据格式');
      }

      // 如果是替换模式，先清空
      if (!merge) {
        this.fonts.clear();
        this.tags.clear();
      }

      // 导入字体
      let imported = 0;
      data.fonts.forEach(font => {
        // 合并模式下，跳过已存在的字体
        if (merge && this.fonts.has(font.name)) {
          console.log('[Paws-Puffs] 跳过已存在的字体:', font.name);
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
        extension_settings.paws_puffs.fontManager.currentFont = this.currentFont;
      }

      // 导入开关状态
      if (data.fontEnabled !== undefined) {
        this.fontEnabled = data.fontEnabled;
        extension_settings.paws_puffs.fontManager.enabled = this.fontEnabled;
      }

      await this.saveFonts();
      eventSource.emit('pawsFontImported', { count: imported, total: data.fonts.length });
      eventSource.emit('pawsFontTagsChanged', { action: 'imported' });

      console.log(`[Paws-Puffs] 导入完成，成功导入 ${imported}/${data.fonts.length} 个字体`);
      return imported;
    } catch (error) {
      console.error('[Paws-Puffs] 导入失败:', error);
      throw error;
    }
  }

  /**
   * 批量添加字体
   */
  async addFontsBatch(fontsData) {
    let added = 0;

    for (const fontData of fontsData) {
      if (await this.addFont(fontData)) {
        added++;
      }
    }

    return added;
  }

  /**
   * 刷新标签列表（从所有字体中收集）
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
   * 保存字体到存储
   */
  async saveFonts() {
    const data = {
      fonts: Array.from(this.fonts.entries()),
      tags: Array.from(this.tags),
      currentFont: this.currentFont
    };

    extension_settings.paws_puffs.fontManager.fonts = data;
    extension_settings.paws_puffs.fontManager.currentFont = this.currentFont;
    extension_settings.paws_puffs.fontManager.enabled = this.fontEnabled;
    saveSettingsDebounced();
  }

  /**
   * 从存储加载字体
   */
  async loadFonts() {
    const data = extension_settings.paws_puffs.fontManager.fonts;

    if (data) {
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
    }

    // 兼容旧版本：尝试从单独的字段读取
    const separateCurrentFont = extension_settings.paws_puffs.fontManager.currentFont;
    if (separateCurrentFont && this.fonts.has(separateCurrentFont)) {
      this.currentFont = separateCurrentFont;
    }
  }

  /**
   * 清理（清除应用的字体样式）
   */
  cleanup() {
    this.clearAppliedFont();
  }

  /**
   * 销毁（清理+销毁UI）
   */
  destroy() {
    this.cleanup();

    if (this.ui) {
      this.ui.destroy();
    }
  }

  /**
   * 获取统计信息
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
   * 清空所有字体
   */
  async clearAllFonts() {
    this.fonts.clear();
    this.tags.clear();
    this.currentFont = null;

    this.clearAppliedFont();

    extension_settings.paws_puffs.fontManager.fonts = null;
    extension_settings.paws_puffs.fontManager.currentFont = null;
    saveSettingsDebounced();

    eventSource.emit('pawsFontAllCleared');

    console.log('[Paws-Puffs] 已清空所有字体');
  }

  /**
   * 渲染UI（调用UI模块）
   */
  async renderUI(container) {
    this.ui = new FontManagerUI(this);
    await this.ui.init(container);
  }
}

