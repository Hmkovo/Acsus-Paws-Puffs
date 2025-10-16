/**
 * 世界书工具 - 完全独立的世界书管理
 * 
 * 功能：
 * - 独立的世界书条目管理（不干扰预设系统）
 * - 绕过"全局世界书"限制，单独激活条目
 * - 导入/导出功能
 * - 折叠栏式UI（参考字体管理）
 */

// ========================================
// ✅ SillyTavern 原生 API 导入
// ========================================
import {
  world_names,
  loadWorldInfo,
  updateWorldInfoList,
  world_info_position
} from '../../../world-info.js';

import {
  extension_settings,
  getContext
} from '../../../extensions.js';

import {
  saveSettingsDebounced,
  setExtensionPrompt,
  extension_prompt_types,
  extension_prompt_roles,
  eventSource,
  event_types
} from '../../../../script.js';

import {
  callGenericPopup,
  POPUP_TYPE
} from '../../../popup.js';

import logger from './logger.js';

export class WorldInfoIntegration {
  constructor(presetModule) {
    this.presetModule = presetModule;

    // 已选条目列表
    this.selectedItems = [];

    // 缓存的世界书数据
    this.worldInfoCache = new Map();

    // 折叠栏容器
    this.drawerContainer = null;

    // 当前页码
    this.availablePage = 1;
    this.activatedPage = 1;

    // 每页显示数量
    this.availablePerPage = 10;
    this.activatedPerPage = 5;
  }

  /**
   * 初始化
   */
  async init() {
    this.loadSelectedItems();
    // ✅ 加载后立即注入所有启用的条目
    this.injectAllItems();

    // ⭐ 阶段3：监听生成事件，在每次发送消息前重新检查关键词匹配
    eventSource.on(event_types.GENERATION_STARTED, () => {
      logger.debug('🔍 检测到消息生成，重新检查关键词匹配');
      this.injectAllItems();
    });

    logger.info('世界书工具初始化完成');
  }

  /**
   * 更新单个条目的提示词注入
   * @param {Object} item - 条目对象
   */
  updateItemPrompt(item) {
    const key = `paws_wi_${item.id}`;

    if (item.enabled) {
      // ⭐ 阶段3：检查是否应该激活（关键词匹配）
      const shouldActivate = this.shouldActivateItem(item);

      if (!shouldActivate) {
        // 不满足激活条件，清空注入
        logger.debug(` ⏭️ 跳过条目（关键词未匹配）: ${item.name}`);
        setExtensionPrompt(
          key,
          '',
          extension_prompt_types.IN_CHAT,
          0,
          false,
          extension_prompt_roles.SYSTEM
        );
        return;
      }

      // ✅ 启用状态 + 激活条件满足：注入内容
      const content = item.content || '';

      // ⭐ 只使用 @D 指定深度（IN_CHAT）
      const depth = item.depth !== null ? item.depth : 4;
      const role = item.role !== null && item.role !== undefined ? item.role : extension_prompt_roles.SYSTEM;

      const constantMark = item.constant ? '💡 常驻' : '🔑 关键词';
      logger.debug(` 💉 注入条目: ${item.name} [${constantMark}]`);
      logger.debug(`  - Depth: ${depth}, Role: ${role}, Order: ${item.order || 100}`);

      setExtensionPrompt(
        key,
        content,
        extension_prompt_types.IN_CHAT,  // 固定使用IN_CHAT
        depth,
        false,
        role
      );
    } else {
      // ❌ 禁用状态：清空注入
      logger.debug(` 🚫 清空条目: ${item.name}`);
      setExtensionPrompt(
        key,
        '',  // 空字符串 = 移除
        extension_prompt_types.IN_CHAT,
        0,
        false,
        extension_prompt_roles.SYSTEM
      );
    }
  }


  /**
   * 注入所有启用的条目
   */
  injectAllItems() {
    logger.debug(` 🔄 刷新所有条目注入，总数: ${this.selectedItems.length}`);

    this.selectedItems.forEach(item => {
      this.updateItemPrompt(item);
    });

    const enabledCount = this.selectedItems.filter(i => i.enabled).length;
    logger.debug(` ✅ 注入完成，启用: ${enabledCount}/${this.selectedItems.length}`);
  }

  /**
   * 判断条目是否应该激活（阶段3：关键词匹配）
   * 
   * @description
   * 激活逻辑顺序：
   * 1. 蓝灯条目（constant=true）→ 直接激活
   * 2. 被禁用（disable=true）→ 跳过
   * 3. 概率检查（probability<100）→ 随机判断
   * 4. 绿灯条目没有关键词 → 警告并不激活
   * 5. 关键词匹配 → 匹配成功才激活
   * 
   * @param {Object} item - 条目对象
   * @returns {boolean} 是否应该激活
   */
  shouldActivateItem(item) {
    // 1. ⭐ 常驻条目（蓝灯）直接激活
    if (item.constant) {
      return true;
    }

    // 2. 被禁用的条目跳过
    if (item.disable) {
      return false;
    }

    // 3. 概率检查（0-100）
    if (item.probability < 100) {
      const roll = Math.random() * 100;
      if (roll > item.probability) {
        logger.debug(` 🎲 概率检查失败: ${item.name} (${roll.toFixed(2)} > ${item.probability})`);
        return false;
      }
    }

    // 4. 没有关键词的绿灯条目，警告并不激活
    if ((!item.key || item.key.length === 0) &&
      (!item.keysecondary || item.keysecondary.length === 0)) {
      logger.warn(` ⚠️ 条目"${item.name}"是绿灯模式但没有关键词，将不会激活`);
      return false;
    }

    // 5. 关键词匹配
    const context = getContext();
    const chat = context.chat || [];
    const scanDepth = item.scan_depth || 10;  // 使用条目的扫描深度设置
    const recentMessages = chat.slice(-scanDepth);
    const searchText = recentMessages.map(m => m.mes || '').join(' ');

    // 6. 匹配主关键词或次要关键词
    const primaryMatch = this.matchKeys(
      searchText,
      item.key || [],
      item.case_sensitive,
      item.match_whole_words
    );

    const secondaryMatch = item.keysecondary && item.keysecondary.length > 0
      ? this.matchKeys(
        searchText,
        item.keysecondary,
        item.case_sensitive,
        item.match_whole_words
      )
      : false;

    return primaryMatch || secondaryMatch;
  }

  /**
   * 关键词匹配（参考官方逻辑）
   * @param {string} text - 要搜索的文本
   * @param {string[]} keys - 关键词数组
   * @param {boolean} caseSensitive - 是否大小写敏感
   * @param {boolean} wholeWords - 是否全词匹配
   * @returns {boolean} 是否匹配
   */
  matchKeys(text, keys, caseSensitive, wholeWords) {
    if (!keys || keys.length === 0) return false;

    // 处理大小写
    const searchText = caseSensitive ? text : text.toLowerCase();
    const searchKeys = caseSensitive ? keys : keys.map(k => k.toLowerCase());

    // 全词匹配
    if (wholeWords) {
      // 转义特殊字符并构建正则
      const escapedKeys = searchKeys.map(k =>
        k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      const pattern = `\\b(${escapedKeys.join('|')})\\b`;
      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      return regex.test(searchText);
    }
    // 部分匹配
    else {
      return searchKeys.some(key => searchText.includes(key));
    }
  }

  /**
   * 创建世界书工具折叠栏
   */
  createWorldBookDrawer() {
    // 检查是否已存在
    const existingDrawer = document.getElementById('paws-worldbook-drawer');
    if (existingDrawer) {
      existingDrawer.remove();
    }

    // 找到预设列表容器
    const promptList = document.querySelector('#completion_prompt_manager_list');
    if (!promptList || !promptList.parentElement) {
      logger.warn(' 未找到预设列表容器');
      return;
    }

    // 创建折叠栏容器
    const drawer = document.createElement('div');
    drawer.id = 'paws-worldbook-drawer';
    drawer.className = 'inline-drawer wide100p';
    drawer.style.cssText = 'margin-bottom: 10px;';

    drawer.innerHTML = `
      <!-- 主折叠栏标题 -->
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>世界书工具</b>
        <div class="fa-solid inline-drawer-icon down fa-circle-chevron-down"></div>
      </div>

      <!-- 主折叠栏内容 -->
      <div class="inline-drawer-content" style="display: none; padding: 15px; max-height: 600px; overflow-y: auto;">
        <!-- 选择区域 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
            <div>
            <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 0.9em;">选择世界书</label>
            <div style="display: flex; gap: 5px;">
              <select id="paws-wb-select" class="text_pole" style="flex: 1; padding: 6px; font-size: 0.95em;">
                <option value="">-- 请选择 --</option>
              </select>
              <button id="paws-wb-refresh-btn" class="menu_button" title="刷新世界书列表" style="padding: 6px 10px; font-size: 0.95em;">
                <i class="fa-solid fa-refresh"></i>
              </button>
              <button id="paws-wb-help-btn" class="menu_button" title="使用帮助" style="padding: 6px 10px; font-size: 0.95em;">
                <i class="fa-solid fa-circle-question"></i>
              </button>
            </div>
            </div>
            <div>
            <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 0.9em;">搜索条目</label>
            <input type="text" id="paws-wb-search" class="text_pole" placeholder="输入关键词..." style="width: 100%; padding: 6px; font-size: 0.95em;">
          </div>
        </div>

        <!-- 可选条目列表 -->
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; font-size: 0.9em;">
            <span id="paws-wb-available-count">可选条目</span>
          </label>
          <div id="paws-wb-available-list" style="
            max-height: 200px;
            overflow-y: auto;
            border: 1px solid var(--SmartThemeBorderColor);
            border-radius: 5px;
            padding: 5px;
            background: color-mix(in srgb, var(--SmartThemeBodyColor) 2%, var(--SmartThemeBlurTintColor) 98%);
          ">
            <div style="text-align: center; padding: 15px; opacity: 0.6; font-size: 0.9em;">
              请先选择一个世界书
            </div>
          </div>
          <!-- 分页 -->
          <div id="paws-wb-available-pagination" style="display: none; margin-top: 8px;">
            <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
              <button class="menu_button paws-wb-page-btn" data-page="prev" style="padding: 6px 10px; font-size: 1em;">
                <i class="fa-solid fa-chevron-left"></i>
              </button>
              <span id="paws-wb-available-page-info" style="font-size: 0.85em;">1 / 1</span>
              <button class="menu_button paws-wb-page-btn" data-page="next" style="padding: 6px 10px; font-size: 1em;">
                <i class="fa-solid fa-chevron-right"></i>
              </button>
            </div>
          </div>
          </div>
            
        <!-- 分隔线 -->
        <hr style="border: none; border-top: 1px solid var(--SmartThemeBorderColor); margin: 15px 0;">

        <!-- 已激活条目（子折叠栏） -->
        <div class="inline-drawer" style="margin-bottom: 10px;">
          <div class="inline-drawer-toggle inline-drawer-header" style="cursor: pointer;">
            <b id="paws-wb-activated-title">已激活的世界书条目 (0)</b>
            <div class="fa-solid inline-drawer-icon down fa-circle-chevron-down"></div>
          </div>
          <div class="inline-drawer-content" style="display: none; padding: 10px 0;">
            <div id="paws-wb-activated-list" style="
              max-height: 250px;
              overflow-y: auto;
              min-height: 50px;
            ">
              <div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 0.9em;">
                暂无激活的条目
              </div>
            </div>
            <!-- 分页 -->
            <div id="paws-wb-activated-pagination" style="display: none; margin-top: 8px;">
              <div style="display: flex; justify-content: center; align-items: center; gap: 10px;">
                <button class="menu_button paws-wb-activated-page-btn" data-page="prev" style="padding: 6px 10px; font-size: 1em;">
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <span id="paws-wb-activated-page-info" style="font-size: 0.85em;">1 / 1</span>
                <button class="menu_button paws-wb-activated-page-btn" data-page="next" style="padding: 6px 10px; font-size: 1em;">
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div style="display: flex; gap: 8px;">
          <button id="paws-wb-import-btn" class="menu_button" style="flex: 1; padding: 6px; font-size: 0.9em;">
            <i class="fa-solid fa-file-import"></i> 导入
          </button>
          <button id="paws-wb-export-btn" class="menu_button" style="flex: 1; padding: 6px; font-size: 0.9em;">
            <i class="fa-solid fa-file-export"></i> 导出
          </button>
          <button id="paws-wb-clear-btn" class="menu_button caution" style="flex: 1; padding: 6px; font-size: 0.9em;">
            <i class="fa-solid fa-trash"></i> 清空全部
          </button>
        </div>
      </div>
    `;

    // 插入到列表之前
    promptList.parentElement.insertBefore(drawer, promptList);
    this.drawerContainer = drawer;

    // 延迟绑定事件
    setTimeout(async () => {
      this.bindDrawerEvents();
      await this.loadWorldBookList();
      this.renderActivatedItems();
      logger.debug(' 折叠栏已创建');
    }, 100);
  }

  /**
   * 绑定折叠栏事件
   */
  bindDrawerEvents() {
    if (!this.drawerContainer) return;

    // 主折叠栏展开/折叠
    const mainToggle = this.drawerContainer.querySelector('.inline-drawer-toggle');
    const mainContent = this.drawerContainer.querySelector('.inline-drawer-content');
    const mainIcon = mainToggle.querySelector('.inline-drawer-icon');

    mainToggle.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = mainContent.style.display !== 'none';
      mainContent.style.display = isOpen ? 'none' : 'block';

      // ✅ 正确切换箭头图标
      if (isOpen) {
        // 关闭：显示向下箭头
        mainIcon.classList.remove('up', 'fa-circle-chevron-up');
        mainIcon.classList.add('down', 'fa-circle-chevron-down');
      } else {
        // 打开：显示向上箭头
        mainIcon.classList.remove('down', 'fa-circle-chevron-down');
        mainIcon.classList.add('up', 'fa-circle-chevron-up');

        // ⭐ 展开时自动刷新世界书列表
        logger.debug(' 展开面板，自动刷新世界书列表');
        await this.loadWorldBookList();
      }
    });

    // 子折叠栏（已激活条目）
    const subDrawer = mainContent.querySelector('.inline-drawer');
    if (!subDrawer) {
      logger.error(' 未找到已激活条目子折叠栏');
      return;
    }
    const subToggle = subDrawer.querySelector('.inline-drawer-toggle');
    const subContent = subDrawer.querySelector('.inline-drawer-content');
    const subIcon = subToggle.querySelector('.inline-drawer-icon');

    subToggle.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = subContent.style.display !== 'none';
      subContent.style.display = isOpen ? 'none' : 'block';

      // ✅ 正确切换箭头图标
      if (isOpen) {
        // 关闭：显示向下箭头
        subIcon.classList.remove('up', 'fa-circle-chevron-up');
        subIcon.classList.add('down', 'fa-circle-chevron-down');
      } else {
        // 打开：显示向上箭头
        subIcon.classList.remove('down', 'fa-circle-chevron-down');
        subIcon.classList.add('up', 'fa-circle-chevron-up');
      }
    });

    // 世界书选择
    const selectEl = this.drawerContainer.querySelector('#paws-wb-select');
    selectEl.addEventListener('change', (e) => {
      this.loadWorldBookEntries(e.target.value);
    });

    // ⭐ 刷新按钮
    const refreshBtn = this.drawerContainer.querySelector('#paws-wb-refresh-btn');
    refreshBtn.addEventListener('click', async () => {
      logger.debug(' 手动刷新世界书列表');

      // 显示加载动画
      const originalHTML = refreshBtn.innerHTML;
      refreshBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      refreshBtn.disabled = true;

      try {
        await this.loadWorldBookList();

        // 显示成功提示
        if (typeof toastr !== 'undefined') {
          toastr.success('世界书列表已刷新');
        }
      } catch (error) {
        logger.error(' 刷新失败:', error);
        if (typeof toastr !== 'undefined') {
          toastr.error('刷新失败');
        }
      } finally {
        // 恢复按钮状态
        refreshBtn.innerHTML = originalHTML;
        refreshBtn.disabled = false;
      }
    });

    // ⭐ 帮助按钮
    const helpBtn = this.drawerContainer.querySelector('#paws-wb-help-btn');
    helpBtn.addEventListener('click', async () => {
      const helpContent = `
        <div style="text-align: left; line-height: 1.8; font-size: 0.95em;">
          <h3 style="margin-top: 0; color: var(--SmartThemeQuoteColor);">世界书工具使用说明</h3>
          
          <div style="margin-bottom: 15px;">
            <strong style="color: var(--SmartThemeQuoteColor);">■ 重要：定期备份数据</strong>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">
              您激活的世界书条目保存在扩展设置中。强烈建议定期使用下方的<strong>「导出」</strong>按钮备份，避免意外丢失数据。卸载扩展前也请记得备份！
            </p>
          </div>
          
          <div style="margin-bottom: 15px;">
            <strong style="color: var(--SmartThemeQuoteColor);">■ 列表不同步？点刷新</strong>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">
              如果您在官方世界书界面添加了新世界书或修改了条目，但这里的列表没有更新，请点击「选择世界书」旁边的<strong>刷新按钮</strong>即可同步最新数据。
            </p>
          </div>
          
          <div style="margin-bottom: 0;">
            <strong style="color: var(--SmartThemeQuoteColor);">■ 卸载前请清空</strong>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">
              如果您打算卸载Acsus-Paws-Puffs扩展，请先使用下方的<strong>「清空全部」</strong>按钮移除所有已激活条目，否则这些条目的提示词注入可能会残留在系统中。
            </p>
          </div>
        </div>
      `;

      await callGenericPopup(helpContent, POPUP_TYPE.TEXT, '', { okButton: '知道了', wide: false, large: false });
    });

    // 搜索
    const searchEl = this.drawerContainer.querySelector('#paws-wb-search');
    let searchTimeout;
    searchEl.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.filterAvailableEntries(e.target.value);
      }, 300);
    });

    // 导入导出
    const importBtn = this.drawerContainer.querySelector('#paws-wb-import-btn');
    importBtn.addEventListener('click', () => this.importItems());

    const exportBtn = this.drawerContainer.querySelector('#paws-wb-export-btn');
    exportBtn.addEventListener('click', () => this.exportItems());

    const clearBtn = this.drawerContainer.querySelector('#paws-wb-clear-btn');
    clearBtn.addEventListener('click', () => this.clearAllItems());

    logger.debug(' 事件绑定完成');
  }

  /**
   * 加载世界书列表
   */
  async loadWorldBookList() {
    const select = this.drawerContainer.querySelector('#paws-wb-select');
    if (!select) {
      logger.warn('[WorldInfoTool.loadWorldBookList] 选择框不存在');
      return;
    }

    logger.debug('[WorldInfoTool.loadWorldBookList] 开始加载世界书列表');

    // 保存当前选中的世界书
    const currentValue = select.value;

    // 显示加载中
    select.innerHTML = '<option value="">加载中...</option>';
    select.disabled = true;

    try {
      // ✅ 调用官方API更新世界书列表
      await updateWorldInfoList();

      const worldList = world_names || [];

      if (worldList.length === 0) {
        select.innerHTML = '<option value="">-- 没有世界书 --</option>';
        select.disabled = false;
        return;
      }

      select.innerHTML = '<option value="">-- 请选择 --</option>';
      worldList.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
      });

      // ⭐ 如果之前选中的世界书还存在，恢复选中状态
      if (currentValue && worldList.includes(currentValue)) {
        select.value = currentValue;

        // ⭐ 清除该世界书的缓存，重新加载条目（以获取最新数据）
        if (this.worldInfoCache.has(currentValue)) {
          logger.debug(' 清除缓存并重新加载:', currentValue);
          this.worldInfoCache.delete(currentValue);
          await this.loadWorldBookEntries(currentValue);
        }
      }

      select.disabled = false;

      logger.info('[WorldInfoTool.loadWorldBookList] 已加载世界书列表:', worldList.length, '个');
    } catch (error) {
      logger.error('[WorldInfoTool.loadWorldBookList] 加载世界书列表失败:', error.message || error);
      select.innerHTML = '<option value="">加载失败</option>';
      select.disabled = false;
    }
  }

  /**
   * 加载世界书条目
   */
  async loadWorldBookEntries(worldName) {
    const listEl = this.drawerContainer.querySelector('#paws-wb-available-list');
    const countEl = this.drawerContainer.querySelector('#paws-wb-available-count');

    if (!worldName) {
      logger.debug('[WorldInfoTool.loadWorldBookEntries] 未指定世界书');
      listEl.innerHTML = '<div style="text-align: center; padding: 15px; opacity: 0.6; font-size: 0.9em;">请先选择一个世界书</div>';
      countEl.textContent = '可选条目';
      this.hideAvailablePagination();
      return;
    }

    logger.debug('[WorldInfoTool.loadWorldBookEntries] 加载世界书:', worldName);

    // 显示加载中
    listEl.innerHTML = '<div style="text-align: center; padding: 15px; opacity: 0.6; font-size: 0.9em;"><i class="fa-solid fa-spinner fa-spin"></i> 加载中...</div>';

    try {
      // 检查缓存
      if (this.worldInfoCache.has(worldName)) {
        logger.debug('[WorldInfoTool.loadWorldBookEntries] 使用缓存:', worldName);
        this.displayAvailableEntries(this.worldInfoCache.get(worldName), worldName);
        return;
      }

      // 加载世界书
      const data = await loadWorldInfo(worldName);
      const entries = data?.entries || {};

      if (Object.keys(entries).length === 0) {
        listEl.innerHTML = '<div style="text-align: center; padding: 15px; opacity: 0.6; font-size: 0.9em;">该世界书没有条目</div>';
        countEl.textContent = '可选条目 (0)';
        this.hideAvailablePagination();
        return;
      }

      // 缓存
      this.worldInfoCache.set(worldName, entries);
      this.displayAvailableEntries(entries, worldName);

      logger.info('[WorldInfoTool.loadWorldBookEntries] 加载成功:', worldName, '条目数:', Object.keys(entries).length);

    } catch (error) {
      logger.error('[WorldInfoTool.loadWorldBookEntries] 加载失败:', worldName, error.message || error);
      listEl.innerHTML = '<div style="text-align: center; padding: 15px; color: #ff6b6b; font-size: 0.9em;"><i class="fa-solid fa-triangle-exclamation"></i> 加载失败</div>';
    }
  }

  /**
   * 显示可选条目（带分页）
   */
  displayAvailableEntries(entries, worldName) {
    const listEl = this.drawerContainer.querySelector('#paws-wb-available-list');
    const countEl = this.drawerContainer.querySelector('#paws-wb-available-count');

    const entryArray = Object.entries(entries);
    const totalPages = Math.ceil(entryArray.length / this.availablePerPage);
    this.availablePage = Math.min(this.availablePage, totalPages);

    const start = (this.availablePage - 1) * this.availablePerPage;
    const end = start + this.availablePerPage;
    const pageEntries = entryArray.slice(start, end);

    countEl.textContent = `可选条目 (${entryArray.length})`;

    listEl.innerHTML = '';

    pageEntries.forEach(([uid, entry]) => {
      const item = document.createElement('div');
      item.className = 'paws-wb-available-item';
      item.dataset.uid = uid;
      item.dataset.world = worldName;
      item.dataset.searchText = (entry.comment || '').toLowerCase();

      item.style.cssText = `
        display: flex;
        align-items: center;
        padding: 4px 6px;
        margin-bottom: 3px;
        background: var(--SmartThemeBlurTintColor);
        border: 1px solid var(--SmartThemeBorderColor);
        border-radius: 4px;
        transition: all 0.2s;
        gap: 6px;
        font-size: 0.85em;
      `;

      item.addEventListener('mouseenter', () => {
        item.style.background = 'var(--SmartThemeQuoteColor)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'var(--SmartThemeBlurTintColor)';
      });

      const name = document.createElement('span');
      name.style.cssText = 'flex: 1; min-width: 0; max-width: calc(100% - 50px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default;';
      name.textContent = entry.comment || '未命名条目';

      // ✅ 添加+号按钮
      const addBtn = document.createElement('button');
      addBtn.className = 'menu_button';
      addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
      addBtn.style.cssText = 'padding: 4px 8px; font-size: 0.85em; flex-shrink: 0;';
      addBtn.title = '添加此条目';

      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 直接添加这个条目
        this.addSingleEntry(worldName, uid, entry);
      });

      item.appendChild(name);
      item.appendChild(addBtn);
      listEl.appendChild(item);
    });

    // 显示分页
    if (totalPages > 1) {
      this.showAvailablePagination(this.availablePage, totalPages);
    } else {
      this.hideAvailablePagination();
    }
  }

  /**
   * 显示可选条目分页
   */
  showAvailablePagination(currentPage, totalPages) {
    const pagination = this.drawerContainer.querySelector('#paws-wb-available-pagination');
    const pageInfo = this.drawerContainer.querySelector('#paws-wb-available-page-info');

    pagination.style.display = 'block';
    pageInfo.textContent = `${currentPage} / ${totalPages}`;

    // 移除旧的监听器
    const btns = pagination.querySelectorAll('.paws-wb-page-btn');
    btns.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });

    // 添加新的监听器
    const newBtns = pagination.querySelectorAll('.paws-wb-page-btn');
    newBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.page;
        if (action === 'prev' && currentPage > 1) {
          this.availablePage--;
        } else if (action === 'next' && currentPage < totalPages) {
          this.availablePage++;
        }
        const worldName = this.drawerContainer.querySelector('#paws-wb-select').value;
        const entries = this.worldInfoCache.get(worldName);
        if (entries) {
          this.displayAvailableEntries(entries, worldName);
        }
      });
    });
  }

  /**
   * 隐藏可选条目分页
   */
  hideAvailablePagination() {
    const pagination = this.drawerContainer.querySelector('#paws-wb-available-pagination');
    if (pagination) {
      pagination.style.display = 'none';
    }
  }

  /**
   * 过滤可选条目
   */
  filterAvailableEntries(searchText) {
    const items = this.drawerContainer.querySelectorAll('.paws-wb-available-item');
    const search = searchText.toLowerCase().trim();

    let visibleCount = 0;
    items.forEach(item => {
      if (!search || item.dataset.searchText.includes(search)) {
        item.style.display = 'flex';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });
  }

  /**
   * ✅ 添加单个条目
   */
  addSingleEntry(worldName, uid, entryData) {
    if (!entryData) {
      logger.warn('[WorldInfoTool.addSingleEntry] 条目数据为空');
      return;
    }

    logger.debug('[WorldInfoTool.addSingleEntry] 添加条目:', entryData.comment || '未命名', '来自世界书:', worldName);

    // 检查是否已存在
    const exists = this.selectedItems.some(item =>
      item.worldName === worldName && item.uid === uid
    );

    if (exists) {
      logger.warn('[WorldInfoTool.addSingleEntry] 条目已存在:', entryData.comment || uid);
      if (typeof toastr !== 'undefined') {
        toastr.info('该条目已存在');
      }
      return;
    }

    // 添加条目
    this.selectedItems.push({
      // === 我们的字段 ===
      id: `${worldName}_${uid}_${Date.now()}`,
      enabled: true,
      worldName: worldName,
      uid: uid,

      // === ⭐ 完整保存官方字段 ===
      name: entryData.comment || '未命名条目',
      content: entryData.content || '',

      // 核心匹配字段
      key: entryData.key || [],
      keysecondary: entryData.keysecondary || [],
      constant: entryData.constant || false,

      // 注入控制字段（固定使用atDepth）
      order: entryData.insertion_order || 100,
      depth: entryData.extensions?.depth || 4,
      position: world_info_position.atDepth,
      role: entryData.extensions?.role || 0,

      // 高级匹配选项
      probability: entryData.extensions?.probability || 100,
      scan_depth: entryData.extensions?.scan_depth || null,
      case_sensitive: entryData.extensions?.case_sensitive || false,
      match_whole_words: entryData.extensions?.match_whole_words || false,

      // 定时效果
      sticky: entryData.sticky || 0,
      cooldown: entryData.cooldown || 0,
      delay: entryData.delay || 0,

      // 其他字段
      selectiveLogic: entryData.selectiveLogic || 0,
      disable: entryData.disable || false
    });

    this.saveSelectedItems();
    this.renderActivatedItems();
    this.injectAllItems();

    logger.info('[WorldInfoTool.addSingleEntry] 已添加条目:', entryData.comment || '未命名条目');

    if (typeof toastr !== 'undefined') {
      toastr.success(`已添加条目：${entryData.comment || '未命名条目'}`);
    }
  }

  /**
   * 添加选中的条目（已废弃，保留用于兼容）
   */
  addSelectedEntries() {
    const checkboxes = this.drawerContainer.querySelectorAll('.paws-wb-checkbox:checked');
    if (checkboxes.length === 0) return;

    checkboxes.forEach(checkbox => {
      const uid = checkbox.dataset.uid;
      const worldName = checkbox.dataset.world;
      const entries = this.worldInfoCache.get(worldName);
      const entryData = entries?.[uid];

      if (entryData) {
        // 检查是否已存在
        const exists = this.selectedItems.some(item =>
          item.worldName === worldName && item.uid === uid
        );

        if (!exists) {
          // ⭐ 固定使用 @D 指定深度（atDepth）
          this.selectedItems.push({
            // === 我们的字段 ===
            id: `${worldName}_${uid}_${Date.now()}`,
            enabled: true,  // 我们的总开关
            worldName: worldName,
            uid: uid,

            // === ⭐ 完整保存官方字段 ===
            name: entryData.comment || '未命名条目',
            content: entryData.content || '',

            // 核心匹配字段
            key: entryData.key || [],                              // 主关键词
            keysecondary: entryData.keysecondary || [],           // 次要关键词
            constant: entryData.constant || false,                 // ⭐ 常驻（蓝灯）

            // 注入控制字段（固定使用atDepth）
            order: entryData.insertion_order || 100,               // 排序
            depth: entryData.extensions?.depth || 4,               // 深度
            position: world_info_position.atDepth,                 // 固定为atDepth
            role: entryData.extensions?.role || 0,                 // 角色

            // 高级匹配选项
            probability: entryData.extensions?.probability || 100, // 概率
            scan_depth: entryData.extensions?.scan_depth || null,  // 扫描深度
            case_sensitive: entryData.extensions?.case_sensitive || false,     // 大小写敏感
            match_whole_words: entryData.extensions?.match_whole_words || false, // 全词匹配

            // 定时效果（暂不实现，但保存数据）
            sticky: entryData.sticky || 0,
            cooldown: entryData.cooldown || 0,
            delay: entryData.delay || 0,

            // 其他字段
            selectiveLogic: entryData.selectiveLogic || 0,
            disable: entryData.disable || false
          });
        }

        // 取消勾选
        checkbox.checked = false;
      }
    });

    this.updateAddButtonState();
    this.saveSelectedItems();
    this.renderActivatedItems();

    // ✅ 立即注入新添加的条目
    this.injectAllItems();

    if (typeof toastr !== 'undefined') {
      toastr.success(`已添加 ${checkboxes.length} 个条目`);
    }
  }

  /**
   * 渲染已激活条目列表
   */
  renderActivatedItems() {
    const listEl = this.drawerContainer.querySelector('#paws-wb-activated-list');
    const titleEl = this.drawerContainer.querySelector('#paws-wb-activated-title');

    titleEl.textContent = `已激活的世界书条目 (${this.selectedItems.length})`;

    if (this.selectedItems.length === 0) {
      listEl.innerHTML = '<div style="text-align: center; padding: 20px; opacity: 0.6; font-size: 0.9em;">暂无激活的条目</div>';
      this.hideActivatedPagination();
      return;
    }

    // 分页
    const totalPages = Math.ceil(this.selectedItems.length / this.activatedPerPage);
    this.activatedPage = Math.min(this.activatedPage, Math.max(1, totalPages));

    const start = (this.activatedPage - 1) * this.activatedPerPage;
    const end = start + this.activatedPerPage;
    const pageItems = this.selectedItems.slice(start, end);

    listEl.innerHTML = '';

    pageItems.forEach((item, index) => {
      const itemEl = this.createActivatedItemElement(item, start + index);
      listEl.appendChild(itemEl);
    });

    // 显示分页
    if (totalPages > 1) {
      this.showActivatedPagination(this.activatedPage, totalPages);
    } else {
      this.hideActivatedPagination();
    }
  }

  /**
   * 创建已激活条目元素
   */
  createActivatedItemElement(item, index) {
    const li = document.createElement('li');
    li.className = 'paws-wb-activated-item';
    li.dataset.id = item.id;
    li.style.cssText = `
      display: flex;
      align-items: center;
      padding: 8px 10px;
      margin-bottom: 6px;
      background: var(--SmartThemeBlurTintColor);
      border: 1px solid var(--SmartThemeBorderColor);
      border-radius: 5px;
      gap: 10px;
      opacity: ${item.enabled ? '1' : '0.5'};
    `;

    // 拖拽手柄
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.textContent = '☰';
    dragHandle.style.cssText = 'cursor: move; opacity: 0.6; font-size: 1.1em; flex-shrink: 0;';

    // 图标和名称
    const nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.95em;';

    // ⭐ 常驻条目显示蓝灯图标
    const icon = item.constant
      ? '<span class="fa-fw fa-solid fa-lightbulb" style="color: #3b82f6;" title="常驻条目"></span>'
      : '<span class="fa-fw fa-solid fa-globe" style="color: var(--SmartThemeQuoteColor);" title="关键词激活"></span>';

    nameSpan.innerHTML = `${icon} ${item.name}`;

    // 按钮组
    const controls = document.createElement('span');
    controls.style.cssText = 'display: flex; gap: 8px; flex-shrink: 0;';

    // 编辑按钮
    const editBtn = document.createElement('span');
    editBtn.className = 'fa-solid fa-pencil fa-xs';
    editBtn.title = '编辑';
    editBtn.style.cssText = 'cursor: pointer; padding: 4px; opacity: 0.8;';
    editBtn.addEventListener('click', () => this.editItem(item.id));

    // 删除按钮
    const deleteBtn = document.createElement('span');
    deleteBtn.className = 'fa-solid fa-trash fa-xs caution';
    deleteBtn.title = '删除';
    deleteBtn.style.cssText = 'cursor: pointer; padding: 4px; opacity: 0.8;';
    deleteBtn.addEventListener('click', () => this.deleteItem(item.id));

    // Toggle按钮
    const toggleBtn = document.createElement('span');
    toggleBtn.className = `fa-solid ${item.enabled ? 'fa-toggle-on' : 'fa-toggle-off'} fa-sm`;
    toggleBtn.title = item.enabled ? '禁用' : '启用';
    toggleBtn.style.cssText = 'cursor: pointer; padding: 4px;';
    toggleBtn.addEventListener('click', () => this.toggleItem(item.id));

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);
    controls.appendChild(toggleBtn);

    li.appendChild(dragHandle);
    li.appendChild(nameSpan);
    li.appendChild(controls);

    return li;
  }

  /**
   * 显示已激活条目分页
   */
  showActivatedPagination(currentPage, totalPages) {
    const pagination = this.drawerContainer.querySelector('#paws-wb-activated-pagination');
    const pageInfo = this.drawerContainer.querySelector('#paws-wb-activated-page-info');

    pagination.style.display = 'block';
    pageInfo.textContent = `${currentPage} / ${totalPages}`;

    // 移除旧的监听器
    const btns = pagination.querySelectorAll('.paws-wb-activated-page-btn');
    btns.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
    });

    // 添加新的监听器
    const newBtns = pagination.querySelectorAll('.paws-wb-activated-page-btn');
    newBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.page;
        if (action === 'prev' && currentPage > 1) {
          this.activatedPage--;
          this.renderActivatedItems();
        } else if (action === 'next' && currentPage < totalPages) {
          this.activatedPage++;
          this.renderActivatedItems();
        }
      });
    });
  }

  /**
   * 隐藏已激活条目分页
   */
  hideActivatedPagination() {
    const pagination = this.drawerContainer.querySelector('#paws-wb-activated-pagination');
    if (pagination) {
      pagination.style.display = 'none';
    }
  }

  /**
   * 编辑条目
   */
  async editItem(itemId) {
    const item = this.selectedItems.find(i => i.id === itemId);
    if (!item) {
      logger.warn('[WorldInfoTool.editItem] 条目不存在:', itemId);
      return;
    }

    logger.debug('[WorldInfoTool.editItem] 编辑条目:', item.name);

    // ✅ 创建jQuery对象（不是字符串！）
    const $html = $(this.createEditPopupHTML(item));

    // 显示弹窗
    const result = await callGenericPopup($html, POPUP_TYPE.CONFIRM, '', {
      okButton: '保存',
      cancelButton: '取消',
      wide: true,
      large: true
    });

    if (result) {
      // ✅ 从 $html 获取值（不是从DOM！）
      item.content = String($html.find('#paws-edit-content').val() || '');

      // ⭐ constant现在是select，不是checkbox
      const constantValue = $html.find('#paws-edit-constant').val();
      item.constant = constantValue === 'true';

      // 关键词（逗号分隔转数组）
      const keyInput = String($html.find('#paws-edit-key').val() || '');
      item.key = keyInput.split(',').map(k => k.trim()).filter(k => k);

      const keysecondaryInput = String($html.find('#paws-edit-keysecondary').val() || '');
      item.keysecondary = keysecondaryInput.split(',').map(k => k.trim()).filter(k => k);

      // 高级匹配选项
      item.case_sensitive = $html.find('#paws-edit-case-sensitive').prop('checked');
      item.scan_depth = parseInt(String($html.find('#paws-edit-scan-depth').val())) || 10;
      item.probability = parseInt(String($html.find('#paws-edit-probability').val())) || 100;

      // 注入控制（只用@D，固定position为atDepth）
      item.position = world_info_position.atDepth;
      item.depth = parseInt(String($html.find('#paws-edit-depth').val())) || 4;
      item.role = item.role !== undefined ? item.role : 0;
      item.order = parseInt(String($html.find('#paws-edit-order').val())) || 100;

      // 保存并更新UI
      this.saveSelectedItems();
      this.renderActivatedItems();

      // 重新注入
      this.updateItemPrompt(item);

      if (typeof toastr !== 'undefined') {
        toastr.success(`已保存"${item.name}"的修改`);
      }

      logger.info('[WorldInfoTool.editItem] 条目已更新:', item.name);
    }
  }

  /**
   * 创建编辑弹窗HTML（简洁布局）
   */
  createEditPopupHTML(item) {
    const keyStr = (item.key || []).join(', ');
    const keysecondaryStr = (item.keysecondary || []).join(', ');

    return `
      <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
        <h3 class="flex-container justifyCenter alignItemsBaseline">
          <strong>编辑世界书条目：${item.name}</strong>
        </h3>
        <hr />
        
        <!-- 第一行：激活方式 + 深度 + 顺序 + 触发率 -->
        <div class="flex-container" style="margin-top: 10px; gap: 10px; align-items: flex-end;">
          <div style="flex: 0 0 50px;">
            <label for="paws-edit-constant" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              激活方式
            </label>
            <select id="paws-edit-constant" class="text_pole">
              <option value="false" ${!item.constant ? 'selected' : ''}>🟢</option>
              <option value="true" ${item.constant ? 'selected' : ''}>🔵</option>
            </select>
          </div>

          <div class="flex1">
            <label for="paws-edit-depth" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              深度
            </label>
            <input 
              type="number" 
              id="paws-edit-depth" 
              class="text_pole"
              value="${item.depth || 4}"
              min="0"
              max="999"
              style="width: 100%;"
            />
          </div>

          <div class="flex1">
            <label for="paws-edit-order" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              顺序
            </label>
            <input 
              type="number" 
              id="paws-edit-order" 
              class="text_pole"
              value="${item.order || 100}"
              min="0"
              max="1000"
              style="width: 100%;"
            />
          </div>

          <div style="flex: 0 0 80px;">
            <label for="paws-edit-probability" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              触发率%
            </label>
            <input 
              type="number" 
              id="paws-edit-probability" 
              class="text_pole"
              value="${item.probability || 100}"
              min="0"
              max="100"
              style="width: 100%;"
            />
          </div>
        </div>

        <!-- 深度提示 -->
        <small style="color: var(--SmartThemeQuoteColor); display: block; margin-top: 3px; line-height: 1.3;">
          深度：2=靠近最新消息（临时剧情） | 4=默认 | 6-8=稍远（背景设定） | 10+=很远（固定世界观）
        </small>

        <!-- 第二行：主关键词 + 次要关键词 -->
        <div class="flex-container" style="margin-top: 10px; gap: 10px; align-items: flex-start;">
          <div class="flex1">
            <label for="paws-edit-key" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              主关键词（逗号分隔）
            </label>
            <textarea 
              id="paws-edit-key" 
              class="text_pole textarea_compact"
              rows="2"
              placeholder="关键词1, 关键词2"
            >${keyStr}</textarea>
          </div>

          <div class="flex1">
            <label for="paws-edit-keysecondary" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              次要关键词（逗号分隔）
            </label>
            <textarea 
              id="paws-edit-keysecondary" 
              class="text_pole textarea_compact"
              rows="2"
              placeholder="次要1, 次要2"
            >${keysecondaryStr}</textarea>
          </div>
        </div>

        <!-- 次要关键词教学说明 -->
        <small style="color: var(--SmartThemeQuoteColor); display: block; margin-top: 3px; line-height: 1.3;">
          匹配逻辑：主关键词<strong>或</strong>次要关键词匹配就激活 ｜ 主关键词<strong>和所有</strong>次要关键词都匹配才激活
        </small>

        <!-- 第三行：扫描深度 + 区分大小写 -->
        <div class="flex-container" style="margin-top: 10px; gap: 15px; align-items: center;">
          <div style="flex: 0 0 100px;">
            <label for="paws-edit-scan-depth" style="display: block; margin-bottom: 5px; font-size: 0.9em;">
              扫描深度
            </label>
            <input 
              type="number" 
              id="paws-edit-scan-depth" 
              class="text_pole"
              value="${item.scan_depth || 10}"
              min="1"
              max="100"
              style="width: 100%;"
            />
          </div>

          <label class="checkbox_label" style="margin: 0;">
            <input type="checkbox" id="paws-edit-case-sensitive" ${item.case_sensitive ? 'checked' : ''} />
            <span>区分大小写</span>
          </label>
        </div>

        <hr />

        <!-- 内容编辑（放到最下方） -->
        <div class="flex-container flexFlowColumn">
          <label for="paws-edit-content" class="title_restorable">
            <small>内容</small>
          </label>
          <textarea 
            id="paws-edit-content" 
            class="text_pole textarea_compact"
            rows="6"
            style="min-height: 15vh;"
          >${item.content || ''}</textarea>
        </div>
      </div>
    `;
  }

  /**
   * 删除条目（已激活条目直接删除，不需要确认）
   */
  deleteItem(id) {
    const item = this.selectedItems.find(i => i.id === id);
    if (!item) {
      logger.warn('[WorldInfoTool.deleteItem] 条目不存在:', id);
      return;
    }

    logger.debug('[WorldInfoTool.deleteItem] 删除条目:', item.name);

    // ✅ 先清空提示词注入
    const key = `paws_wi_${item.id}`;
    setExtensionPrompt(
      key,
      '',
      extension_prompt_types.IN_CHAT,
      0,
      false,
      extension_prompt_roles.SYSTEM
    );
    logger.debug(` 🗑️ 删除并清空注入: ${item.name}`);

    // 从列表中移除
    this.selectedItems = this.selectedItems.filter(i => i.id !== id);
    this.saveSelectedItems();
    this.renderActivatedItems();

    logger.info('[WorldInfoTool.deleteItem] 已删除条目:', item.name);

    if (typeof toastr !== 'undefined') {
      toastr.success('已删除');
    }
  }

  /**
   * 切换启用/禁用
   */
  toggleItem(id) {
    const item = this.selectedItems.find(i => i.id === id);
    if (!item) {
      logger.warn('[WorldInfoTool.toggleItem] 条目不存在:', id);
      return;
    }

    item.enabled = !item.enabled;
    this.saveSelectedItems();
    this.renderActivatedItems();

    // ✅ 立即更新提示词注入（启用=注入，禁用=清空）
    this.updateItemPrompt(item);

    logger.info('[WorldInfoTool.toggleItem] 条目', item.name, item.enabled ? '已启用' : '已禁用');
  }

  /**
   * 导入条目
   */
  importItems() {
    logger.debug('[WorldInfoTool.importItems] 开始导入');

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) {
        logger.debug('[WorldInfoTool.importItems] 用户取消选择文件');
        return;
      }

      try {
        logger.debug('[WorldInfoTool.importItems] 读取文件:', file.name, '大小:', file.size, '字节');

        const text = await file.text();
        const data = JSON.parse(text);

        if (data.worldInfoItems && Array.isArray(data.worldInfoItems)) {
          const oldCount = this.selectedItems.length;
          this.selectedItems = data.worldInfoItems;
          this.saveSelectedItems();
          this.renderActivatedItems();

          logger.info(`[WorldInfoTool.importItems] 导入成功: ${data.worldInfoItems.length} 个条目（替换了 ${oldCount} 个旧条目）`);

          if (typeof toastr !== 'undefined') {
            toastr.success(`已导入 ${data.worldInfoItems.length} 个条目`);
          }
        } else {
          throw new Error('无效的文件格式：缺少 worldInfoItems 字段');
        }
      } catch (error) {
        logger.error('[WorldInfoTool.importItems] 导入失败:', error.message || error);
        if (typeof toastr !== 'undefined') {
          toastr.error('导入失败：' + error.message);
        }
      }
    };

    input.click();
  }

  /**
   * 导出条目
   */
  exportItems() {
    if (this.selectedItems.length === 0) {
      logger.warn('[WorldInfoTool.exportItems] 没有可导出的条目');
      if (typeof toastr !== 'undefined') {
        toastr.warning('没有可导出的条目');
      }
      return;
    }

    logger.debug('[WorldInfoTool.exportItems] 导出', this.selectedItems.length, '个条目');

    const data = {
      worldInfoItems: this.selectedItems
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = `worldinfo_${Date.now()}.json`;
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    logger.info('[WorldInfoTool.exportItems] 已导出', this.selectedItems.length, '个条目，文件名:', filename);

    if (typeof toastr !== 'undefined') {
      toastr.success('已导出');
    }
  }

  /**
   * 清空全部条目
   */
  clearAllItems() {
    if (this.selectedItems.length === 0) {
      logger.debug('[WorldInfoTool.clearAllItems] 没有条目需要清空');
      return;
    }

    const count = this.selectedItems.length;
    logger.debug('[WorldInfoTool.clearAllItems] 准备清空', count, '个条目');

    if (confirm(`确定要清空全部 ${count} 个条目吗？`)) {
      // ✅ 先清空所有条目的提示词注入
      this.selectedItems.forEach(item => {
        const key = `paws_wi_${item.id}`;
        setExtensionPrompt(
          key,
          '',
          extension_prompt_types.IN_CHAT,
          0,
          false,
          extension_prompt_roles.SYSTEM
        );
      });
      logger.debug(` 🗑️ 清空全部 ${count} 个条目的注入`);

      this.selectedItems = [];
      this.saveSelectedItems();
      this.renderActivatedItems();

      logger.info('[WorldInfoTool.clearAllItems] 已清空', count, '个条目');

      if (typeof toastr !== 'undefined') {
        toastr.success('已清空');
      }
    } else {
      logger.debug('[WorldInfoTool.clearAllItems] 用户取消清空操作');
    }
  }

  /**
   * 保存已选条目
   */
  saveSelectedItems() {
    extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
    extension_settings['Acsus-Paws-Puffs'].worldBookTool = {
      items: this.selectedItems
    };
    saveSettingsDebounced();
  }

  /**
   * 加载已选条目
   */
  loadSelectedItems() {
    const saved = extension_settings['Acsus-Paws-Puffs']?.worldBookTool?.items;
    if (saved && Array.isArray(saved)) {
      this.selectedItems = saved;
      logger.debug('[WorldInfoTool.loadSelectedItems] 已加载', saved.length, '个条目');
    } else {
      logger.debug('[WorldInfoTool.loadSelectedItems] 首次使用，无历史数据');
    }
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.drawerContainer) {
      this.drawerContainer.remove();
      this.drawerContainer = null;
    }
  }
}
