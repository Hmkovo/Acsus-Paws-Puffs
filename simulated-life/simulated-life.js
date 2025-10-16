/**
 * 模拟人生模块 - 溯的提示词管理
 * 
 * 功能：
 * - 创建并管理【模拟人生】世界书
 * - 自动添加溯和白沉的提示词条目
 * - 一键添加到全局世界书
 * - 检测世界书状态
 */

// ========================================
// [IMPORT] SillyTavern 原生 API 导入
// ========================================
import {
  world_names,
  loadWorldInfo,
  createNewWorldInfo,
  createWorldInfoEntry,
  saveWorldInfo,
  updateWorldInfoList,
  selected_world_info,
  reloadEditor
} from '../../../../world-info.js';

import {
  extension_settings,
  getContext
} from '../../../../extensions.js';

import {
  saveSettingsDebounced,
  eventSource,
  event_types
} from '../../../../../script.js';

import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';

import logger from '../logger.js';

// ========================================
// [CORE] 模块类定义
// ========================================

export class SimulatedLifeModule {
  constructor() {
    // 世界书名称（固定）
    this.worldBookName = '【模拟人生】-溯';

    // UI 模块实例
    this.ui = null;
  }

  /**
   * 初始化模块（只初始化数据，不渲染 UI）
   * @async
   * @returns {Promise<void>}
   */
  async init() {
    logger.info('[SimulatedLifeModule] 模拟人生模块初始化');

    // 这里只初始化数据，不渲染 UI
    // UI 渲染由 index.js 在 settings.html 加载后调用 renderUI()

    logger.info('[SimulatedLifeModule] 模拟人生模块初始化完成');
  }

  /**
   * 渲染 UI（在 settings.html 加载后由 index.js 调用）
   * @async
   * @param {HTMLElement} container - UI 容器元素
   * @returns {Promise<void>}
   */
  async renderUI(container) {
    if (!container) {
      logger.error('[SimulatedLifeModule.renderUI] 容器元素不存在');
      return;
    }

    logger.debug('[SimulatedLifeModule.renderUI] 开始渲染 UI');

    // 延迟导入 UI 模块（避免循环依赖）
    // @ts-ignore - 动态导入路径
    const { SimulatedLifeUI } = await import('./simulated-life-ui.js');
    this.ui = new SimulatedLifeUI(this);

    // 渲染 UI
    this.ui.render();

    logger.debug('[SimulatedLifeModule.renderUI] UI 渲染完成');
  }

  /**
   * 检查世界书是否存在
   * @returns {boolean} 是否存在
   */
  isWorldBookExists() {
    return world_names.includes(this.worldBookName);
  }

  /**
   * 检查世界书是否在全局列表中
   * @returns {boolean} 是否在全局
   */
  isInGlobalList() {
    return selected_world_info.includes(this.worldBookName);
  }

  /**
   * 创建世界书并添加条目（两个都默认开启）
   * @async
   * @returns {Promise<boolean>} 是否成功
   */
  async createWorldBookWithEntries() {
    try {
      logger.info('[SimulatedLifeModule] 开始创建世界书和条目');

      // 1. 检查世界书是否已存在
      let worldExists = this.isWorldBookExists();

      if (!worldExists) {
        // 创建新世界书
        logger.info('[SimulatedLifeModule] 创建新世界书:', this.worldBookName);
        const created = await createNewWorldInfo(this.worldBookName);

        if (!created) {
          throw new Error('世界书创建失败');
        }

        // 等待世界书列表更新
        await updateWorldInfoList();
        worldExists = true;
      } else {
        logger.info('[SimulatedLifeModule] 世界书已存在，将添加条目');
      }

      // 2. 加载世界书数据
      const worldData = await loadWorldInfo(this.worldBookName);
      if (!worldData) {
        throw new Error('无法加载世界书数据');
      }

      // 3. 检查是否已有条目（避免重复添加）
      const existingEntries = Object.values(worldData.entries || {});
      const hasDesktopEntry = existingEntries.some(e =>
        e.comment && (
          e.comment.includes('内联代码模拟多模态') ||
          e.comment.includes('Simulated Multimodality')
        )
      );
      const hasMobileEntry = existingEntries.some(e =>
        e.comment && (
          e.comment.includes('叙事增强式内联HTML') ||
          e.comment.includes('Narrative Enhancement')
        )
      );

      // 如果两个条目都已存在，提前提示用户
      if (hasDesktopEntry && hasMobileEntry) {
        logger.info('[SimulatedLifeModule] 所有条目已存在，无需重复创建');
        toastr.info('世界书和条目已存在，无需重复创建', '模拟人生');

        // 确保已添加到全局（防止之前手动移除了）
        if (!this.isInGlobalList()) {
          await this.addToGlobal();
        }

        return true;
      }

      let addedCount = 0;

      // 4. 添加条目1：溯的版本（默认开启）
      if (!hasDesktopEntry) {
        const entry1 = createWorldInfoEntry(this.worldBookName, worldData);
        entry1.comment = '内联代码模拟多模态 - 通用';
        entry1.content = this.getDesktopPrompt();
        entry1.constant = true;  // 蓝灯常驻
        entry1.selective = true;
        entry1.position = 4;     // @D 在深度
        entry1.depth = 0;        // 深度0
        entry1.role = 0;         // ⚙ 系统
        entry1.order = 101;
        entry1.probability = 100;
        entry1.useProbability = true;
        entry1.disable = false;  // 默认开启
        entry1.preventRecursion = true;  // 不可递归
        addedCount++;
        logger.info('[SimulatedLifeModule] 已添加条目：溯版本（开启）');
      } else {
        logger.info('[SimulatedLifeModule] 溯版本条目已存在，跳过');
      }

      // 5. 添加条目2：白沉的手机端版本（默认开启）
      if (!hasMobileEntry) {
        const entry2 = createWorldInfoEntry(this.worldBookName, worldData);
        entry2.comment = '叙事增强式内联HTML - 手机端';
        entry2.content = this.getMobilePrompt();
        entry2.constant = true;  // 蓝灯常驻
        entry2.selective = true;
        entry2.position = 4;     // @D 在深度
        entry2.depth = 0;        // 深度0
        entry2.role = 0;         // ⚙ 系统
        entry2.order = 101;
        entry2.probability = 100;
        entry2.useProbability = true;
        entry2.disable = false;  // 默认开启
        entry2.preventRecursion = true;  // 不可递归
        addedCount++;
        logger.info('[SimulatedLifeModule] 已添加条目：白沉版本（开启）');
      } else {
        logger.info('[SimulatedLifeModule] 白沉版本条目已存在，跳过');
      }

      // 6. 保存世界书
      if (addedCount > 0) {
        await saveWorldInfo(this.worldBookName, worldData, true);
        logger.info('[SimulatedLifeModule] 世界书已保存');

        // 刷新官方世界书编辑器UI（重要！让条目显示出来）
        reloadEditor(this.worldBookName);
        logger.info('[SimulatedLifeModule] 已刷新世界书编辑器UI');
      }

      // 7. 添加到全局世界书（一次性操作）
      if (!this.isInGlobalList()) {
        await this.addToGlobal();
      }

      // 8. 显示成功提示
      if (addedCount > 0) {
        toastr.success(
          `已添加 ${addedCount} 条提示词，已自动开启全局`,
          '模拟人生 - 创建成功'
        );
      } else {
        toastr.info('世界书已存在，条目无需重复添加', '模拟人生');
      }

      return true;

    } catch (error) {
      logger.error('[SimulatedLifeModule] 创建世界书失败:', error);
      toastr.error('创建失败：' + (error.message || error), '模拟人生');
      return false;
    }
  }

  /**
   * 获取世界书的所有条目
   * @async
   * @returns {Promise<Array>} 条目数组
   */
  async getEntries() {
    try {
      if (!this.isWorldBookExists()) {
        return [];
      }

      const worldData = await loadWorldInfo(this.worldBookName);
      if (!worldData || !worldData.entries) {
        return [];
      }

      // 转换为数组格式
      return Object.values(worldData.entries);
    } catch (error) {
      logger.error('[SimulatedLifeModule] 获取条目失败:', error);
      return [];
    }
  }

  /**
   * 切换条目的开关状态
   * @async
   * @param {number} uid - 条目的uid
   * @param {boolean} enable - 是否启用
   * @returns {Promise<boolean>} 是否成功
   */
  async toggleEntry(uid, enable) {
    try {
      if (!this.isWorldBookExists()) {
        toastr.warning('世界书不存在', '模拟人生');
        return false;
      }

      const worldData = await loadWorldInfo(this.worldBookName);
      if (!worldData || !worldData.entries[uid]) {
        logger.error('[SimulatedLifeModule] 条目不存在:', uid);
        return false;
      }

      // 切换状态
      worldData.entries[uid].disable = !enable;

      // 保存
      await saveWorldInfo(this.worldBookName, worldData, true);

      // 刷新UI
      reloadEditor(this.worldBookName);

      logger.info('[SimulatedLifeModule] 条目状态已更新:', worldData.entries[uid].comment, enable ? '开启' : '禁用');

      return true;
    } catch (error) {
      logger.error('[SimulatedLifeModule] 切换条目状态失败:', error);
      toastr.error('操作失败：' + (error.message || error), '模拟人生');
      return false;
    }
  }

  /**
   * 添加到全局世界书
   * @async
   * @returns {Promise<boolean>} 是否成功
   */
  async addToGlobal() {
    try {
      if (!this.isWorldBookExists()) {
        toastr.warning('请先创建世界书', '模拟人生');
        return false;
      }

      if (this.isInGlobalList()) {
        toastr.info('已在全局世界书中', '模拟人生');
        return true;
      }

      logger.info('[SimulatedLifeModule] 添加到全局世界书');

      // 添加到 selected_world_info 数组
      selected_world_info.push(this.worldBookName);

      // 更新 UI
      const worldIndex = world_names.indexOf(this.worldBookName);
      if (worldIndex !== -1) {
        $(`#world_info option[value="${worldIndex}"]`).prop('selected', true);
      }
      $('#world_info').trigger('change');

      // 保存设置
      saveSettingsDebounced();

      logger.info('[SimulatedLifeModule] 已添加到全局世界书');
      toastr.success('已添加到全局世界书', '模拟人生');

      return true;

    } catch (error) {
      logger.error('[SimulatedLifeModule] 添加到全局失败:', error);
      toastr.error('添加到全局失败：' + (error.message || error), '模拟人生');
      return false;
    }
  }

  /**
   * 从全局世界书移除
   * @async
   * @returns {Promise<boolean>} 是否成功
   */
  async removeFromGlobal() {
    try {
      if (!this.isWorldBookExists()) {
        toastr.warning('世界书不存在', '模拟人生');
        return false;
      }

      if (!this.isInGlobalList()) {
        toastr.info('未在全局世界书中', '模拟人生');
        return true;
      }

      logger.info('[SimulatedLifeModule] 从全局世界书移除');

      // 从 selected_world_info 数组移除
      const index = selected_world_info.indexOf(this.worldBookName);
      if (index !== -1) {
        selected_world_info.splice(index, 1);
      }

      // 更新 UI
      const worldIndex = world_names.indexOf(this.worldBookName);
      if (worldIndex !== -1) {
        $(`#world_info option[value="${worldIndex}"]`).prop('selected', false);
      }
      $('#world_info').trigger('change');

      // 保存设置
      saveSettingsDebounced();

      logger.info('[SimulatedLifeModule] 已从全局世界书移除');
      toastr.info('已从全局世界书移除', '模拟人生');

      return true;

    } catch (error) {
      logger.error('[SimulatedLifeModule] 从全局移除失败:', error);
      toastr.error('从全局移除失败：' + (error.message || error), '模拟人生');
      return false;
    }
  }

  /**
   * 获取桌面端提示词（溯的原版）
   * @returns {string} 提示词内容
   */
  getDesktopPrompt() {
    return `<Simulated Multimodality via Inline Code >
During daily interactions or travels, use inline, self-contained CSS-styled HTML snippets (complete) to enhance the atmosphere—depicting things like:

Paper-Based Materials:
Handwritten notes (e.g., for better understanding)
Travel planner entries
Simulated couple photobooth strips
Tickets
Commemorative stamps
Postcard designs, etc.
Electronic Screen Displays:
Text message conversations (on a phone screen)
Social media posts (on a phone/tablet screen)
GPS navigation instructions (on a car/phone display)
Digital boarding passes
Smartwatch notifications
Information kiosks or digital signage
Rules for Inline HTML Insertions:

Embed directly into the narrative (no code blocks or \`\`\` separators).
All HTML must be strictly inline and self-contained, with no external assets used.
This means no externally sourced or linked materials (e.g., external CSS files, JavaScript files).
This also means no linked images (e.g., <img> tags pointing to URLs).
Specifically, no avatars are to be used, as these typically rely on external images or complex generation that violates the self-contained, inline principle.
Instead, text descriptions serve as placeholders for any visual elements that cannot be rendered simply and inline.
Keep them brief (not exceeding a few lines of rendered output).
Treat them as in-universe objects (e.g., "a polaroid photo," "a handwritten note")—never reference CSS or markup.
Ignore word/paragraph limits for these additions.
In the <!-- consider: (analysis of the function of code) --> format, consider what HTML you would analyze and insert to support the narrative.
请注意文字量和包裹物的尺寸。

For potential mobile user !important(context might include wrong example, ignore wrong and fixed ones)
You shall Ensure full mobile text visibility, no clipping.
Use @media to reduce spacing/font on small screens. 
Integrate Chinese translations as script content to enhance readability for Chinese users; thus, it might look like English content (Chinese translations).
你只会在需要的时候输出本内容，但更注重剧情和物品出现的合理性。
</Simulated Multimodality via Inline Code >`;
  }

  /**
   * 获取手机端提示词（白沉的优化版）
   * @returns {string} 提示词内容
   */
  getMobilePrompt() {
    return `<Narrative Enhancement via Inline HTML>
## Core Principles
Create romantic, poetic visualizations of tangible objects. If there's written/textual content in the story, display the text. If it's decorative/atmospheric, use visual elements. Never force characters to produce new objects.

** Mandatory Per-Response Requirement:**
Every response must contain at least one HTML visualization. Use \`<!-- consider: [analyze current scene] -->\` format to identify content to visualize, following these priorities:

## Generation Priorities
1. **Text Items**: signatures, diaries, love letters, notes, receipts, menus, tickets, messages
2. **Environmental Decorations**: weather elements, natural phenomena, atmospheric decorations
3. **Emotional Expressions**: when no clear elements exist, can generate floating hearts or animated text snippets

## HTML Specifications
**Basic Rules:**
- Embed directly in narrative (no code blocks)
- Only inline snippets, \`<style>\` allowed for animations
- **Absolutely Forbidden**: external image URLs, font-family, script, event handlers
- Replace image locations with text descriptions: \`[description content]\`
- Mobile device dimensions (typically 5 lines before expansion)

**Style Requirements:**
- Font: 8-15px (default 12px)
- Containers: always use \`box-sizing: border-box\` + \`overflow: hidden\` on fixed dimensions
- Scrollbar: \`-webkit-scrollbar { display: none; }\`
- Environmental effects: \`pointer-events: none\` (floating element overlays)
- Collapse: use \`<details>\` for >5 lines (except vertical text)

## Content Guidelines
**Text Type:**
- Display actual content (signatures show names, receipts show details)
- Chinese context uses Chinese; foreign language characters use original language + (Chinese translation)

**Decorative Type:**
- Environmental elements (falling leaves, snowflakes, petals) float directly, avoid background boxes
- SVG only for simple shapes, forbidden for text
- Use @keyframes to create natural animations

**Emotional Type (when lacking clear elements):**
- Floating small hearts (with opacity changes)
- Select dialogue snippets for special effects
- Improvise based on atmosphere, maintain romantic poetry

## Visual Tools
- **Text**: styled div to display actual content
- **Decorations**: transparent floating elements, relative container 100px height
- **Animations**: fall/float/pulse and other natural effects
- **Textures**: transparenttextures.com backgrounds (optional)
- **Polish**: gradients, shadows enhance visual effects

## Strictly Avoid
- System interfaces, technical displays, progress bars, data panels
- External image references (replace with \`[text descriptions]\`)
- SVG text, narrative HTML
- Abstract interfaces, conceptual visualizations
- Forcing character actions

**Remember: Create cinematic romantic props, not technical interfaces**
</Narrative Enhancement via Inline HTML>`;
  }
}

