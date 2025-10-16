/**
 * @file 新手模式
 * @description 在 .beginner-mode-container 容器内渲染新手模式的内容
 * 
 * 核心理念：
 * - 只负责容器内的内容（不管工具栏）
 * - 根据场景聚合属性（只显示相关的）
 * - 智能提示帮助新手（提示显示在控件旁边）
 * - 通过回调与主控通信（不直接访问extension_settings）
 * 
 * 工作流程：
 * 1. 用户点击元素"气泡外框"
 * 2. 查询推荐场景（getRecommendedScene）→ "消息气泡"
 * 3. 加载场景配置（getSceneConfig）
 * 4. 遍历属性分组，创建小控件
 * 5. 显示智能提示
 * 6. 用户修改控件 → 生成中文CSS → 调用编译回调
 * 
 * 参考：
 * - 【文件结构方案】第1136-1345行：beginner-mode.js详细说明
 * - 【文件结构方案】第1682-1731行：场景模式工作流程
 */

// [IMPORT] 导入编译器（生成中文CSS）
import {
  parseChineseCSS,
  generateChineseCSS,
  extractChineseCSS,
  mergeChineseCSS
} from '../../compiler.js';

// [IMPORT] 导入官方API（保存设置）
import { saveSettingsDebounced } from "../../../../../../../script.js";
import { power_user } from "../../../../../../power-user.js";

// [IMPORT] 导入元素和场景
import { getAllElements, getSelector } from '../../st-element-map.js';
import { getRecommendedScene, getOptionalScenes } from '../../scenes/scene-element-mapping.js';
import { getSceneConfig } from '../../scenes/scene-presets.js';
import { getPropertyInfo, translatePropertyToChinese, getPropertyInfoByChinese } from '../../css-property-dict.js';

// [IMPORT] 导入小控件
import {
  PositionControl,
  TransformControl,
  SizeControl,
  ShadowControl,
  BorderControl,
  BorderRadiusControl,
  MessageElementPositionControl
} from '../../controls/property-controls.js';

// [IMPORT] 导入日志
import logger from '../../../logger.js';

// ========================================
// [MAP] CSS属性到控件的映射表
// ========================================

/**
 * CSS属性到控件的映射表
 * 
 * @description
 * 定义哪些CSS属性由哪个控件管理，避免重复创建控件。
 * 
 * 核心解决的问题：
 * - 场景配置列表：['position', 'top', 'left', 'bottom', 'right', 'z-index', 'transform']
 * - 实际只需2个控件：PositionControl（管理前6个）+ TransformControl（管理最后1个）
 * 
 * 映射规则：
 * - managedProperties 不为空 → 主属性，需要创建控件
 * - managedProperties 为空数组 → 从属属性，跳过创建
 * 
 * 使用示例：
 * ```javascript
 * const info = PROPERTY_TO_CONTROL_MAP['position'];
 * // → { controlType: 'PositionControl', managedProperties: ['position', 'top', ...] }
 * 
 * const info2 = PROPERTY_TO_CONTROL_MAP['top'];
 * // → { controlType: 'PositionControl', managedProperties: [] }  // 跳过
 * ```
 */
const PROPERTY_TO_CONTROL_MAP = {
  // PositionControl 管理6个属性
  'position': {
    controlType: 'PositionControl',
    managedProperties: ['position', 'top', 'left', 'bottom', 'right', 'z-index']
  },
  'top': { controlType: 'PositionControl', managedProperties: [] },
  'left': { controlType: 'PositionControl', managedProperties: [] },
  'bottom': { controlType: 'PositionControl', managedProperties: [] },
  'right': { controlType: 'PositionControl', managedProperties: [] },
  'z-index': { controlType: 'PositionControl', managedProperties: [] },

  // TransformControl 管理1个属性
  'transform': {
    controlType: 'TransformControl',
    managedProperties: ['transform']
  },

  // SizeControl 管理7个属性
  'width': {
    controlType: 'SizeControl',
    managedProperties: ['width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'aspect-ratio']
  },
  'height': { controlType: 'SizeControl', managedProperties: [] },
  'min-width': { controlType: 'SizeControl', managedProperties: [] },
  'max-width': { controlType: 'SizeControl', managedProperties: [] },
  'min-height': { controlType: 'SizeControl', managedProperties: [] },
  'max-height': { controlType: 'SizeControl', managedProperties: [] },
  'aspect-ratio': { controlType: 'SizeControl', managedProperties: [] },

  // 其他单属性控件
  'box-shadow': { controlType: 'ShadowControl', managedProperties: ['box-shadow'] },
  'border': { controlType: 'BorderControl', managedProperties: ['border'] },
  'border-radius': { controlType: 'BorderRadiusControl', managedProperties: ['border-radius'] }
};

export class BeginnerMode {
  /**
   * 构造函数
   * 
   * @description
   * 初始化新手模式的状态变量
   */
  constructor() {
    this.container = null;          // DOM容器（.beginner-mode-container）
    this.currentElement = null;     // 当前选中的元素名
    this.currentScene = null;       // 当前场景名
    this.controlInstances = {};     // 控件实例缓存（键：CSS属性名，值：控件实例）
    this.processedProperties = new Set(); // 已处理的属性缓存（避免重复创建控件）
    this.syncState = null;          // 共享公告板（防循环触发）
    this.compileCallback = null;    // 编译回调函数
    this.selectedElement = null;    // 当前选中的元素（用于同步）

    // 筛选状态
    this.currentCategory = null;    // 当前选中的一级分类（9大分类）
    this.currentSubCategory = null; // 当前选中的二级分类（如"上方导航栏"）
  }

  /**
   * 初始化新手模式
   * 
   * @description
   * 在给定的容器内渲染新手模式的内容
   * 
   * @param {HTMLElement} container - DOM容器元素（.beginner-mode-container）
   * @param {Function} compileCallback - 编译回调函数
   * @param {Object} syncState - 共享公告板
   * @async
   */
  async init(container, compileCallback, syncState) {
    if (!container) {
      logger.warn('[BeginnerMode.init] 容器不存在');
      return;
    }

    logger.debug('[BeginnerMode.init] 初始化新手模式');
    this.container = container;
    this.compileCallback = compileCallback;
    this.syncState = syncState;

    this.render();
    this.initFilterSelects();  // 初始化筛选下拉框
    this.bindEvents();
    logger.info('[BeginnerMode.init] 新手模式初始化完成');
  }

  /**
   * 渲染新手模式UI
   * 
   * @description
   * 在容器内渲染新手模式的内容：元素列表 + 属性面板
   * 
   * 注意：只渲染内容区域，不渲染工具栏（工具栏在embedded-panel.html）
   */
  render() {
    if (!this.container) return;

    logger.debug('[BeginnerMode.render] 渲染新手模式UI');

    // 渲染内容区域（从 embedded-panel-ui.js 第530-584行提取）
    this.container.innerHTML = `
      <div class="paws-puffs-ve-elements-layout">
        <!-- 左侧：元素列表 -->
        <div class="paws-puffs-ve-elements-sidebar">
          <div class="paws-puffs-ve-search-bar">
            <input type="text" 
                   class="paws-puffs-ve-search-input" 
                   placeholder="搜索元素..." 
                   disabled>
            <small class="hint" style="display: block; margin-top: 5px; opacity: 0.7;">
              搜索功能待实现
            </small>
          </div>
          <div class="paws-puffs-ve-filter-bar">
            <!-- 一级分类下拉框（9大分类） -->
            <select class="paws-puffs-ve-select paws-puffs-ve-category-select" id="paws-puffs-ve-category-select">
              <!-- 默认选中"功能开关"，由 initFilterSelects 填充选项 -->
            </select>
            
            <!-- 二级分类下拉框（如果有的话） -->
            <select class="paws-puffs-ve-select paws-puffs-ve-subcategory-select" 
                    id="paws-puffs-ve-subcategory-select"
                    style="display: none; margin-top: 8px;">
              <option value="">全部子分类</option>
            </select>
          </div>
          <div class="paws-puffs-ve-element-list">
            ${this.renderElementList()}
          </div>
        </div>
        
        <!-- 右侧：属性面板 -->
        <div class="paws-puffs-ve-properties-panel">
          <div class="paws-puffs-ve-properties-empty" style="padding: 20px; text-align: center; opacity: 0.7;">
            <i class="fa fa-hand-point-left" style="font-size: 2em; margin-bottom: 10px;"></i>
            <p>请从左侧选择元素</p>
            <small class="hint">选择元素后在此编辑属性</small>
          </div>
          <div class="paws-puffs-ve-properties-content" style="display: none;">
            <!-- 动态渲染属性控件 -->
          </div>
        </div>
      </div>
    `;

    logger.debug('[BeginnerMode.render] UI渲染完成');
  }


  /**
   * 初始化筛选下拉框
   * 
   * @description
   * 填充9大分类到一级下拉框，默认选中"功能开关"
   */
  initFilterSelects() {
    const categorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-category-select'));
    if (!categorySelect) return;

    const elementMap = getAllElements();
    const categoryNames = Object.keys(elementMap);

    // 填充9大分类选项（不包括"全部分类"）
    categoryNames.forEach(categoryName => {
      const option = document.createElement('option');
      option.value = categoryName;
      option.textContent = categoryName;
      categorySelect.appendChild(option);
    });

    // 默认选中"功能开关"（如果存在）
    const defaultCategory = '功能开关';
    if (categoryNames.includes(defaultCategory)) {
      categorySelect.value = defaultCategory;
      this.currentCategory = defaultCategory;
      logger.debug('[BeginnerMode.initFilterSelects] 默认选中"功能开关"');
    } else {
      // 如果"功能开关"不存在，选择第一个分类
      categorySelect.value = categoryNames[0] || '';
      this.currentCategory = categoryNames[0] || null;
      logger.debug('[BeginnerMode.initFilterSelects] 默认选中第一个分类:', categoryNames[0]);
    }

    // 触发一次筛选（检查是否有二级分类）
    this.handleCategoryChange();

    logger.debug('[BeginnerMode.initFilterSelects] 筛选下拉框已初始化');
  }

  /**
   * 绑定事件
   * 
   * @description
   * 绑定元素列表的点击事件和筛选下拉框事件
   */
  bindEvents() {
    if (!this.container) return;

    logger.debug('[BeginnerMode.bindEvents] 绑定元素选择事件');

    // 绑定一级分类下拉框
    this.bindCategorySelect();

    // 绑定二级分类下拉框
    this.bindSubCategorySelect();

    // 绑定元素点击事件
    this.bindElementItemEvents();

    logger.debug('[BeginnerMode.bindEvents] 事件绑定完成');
  }

  /**
   * 绑定一级分类下拉框事件
   */
  bindCategorySelect() {
    const categorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-category-select'));
    if (!categorySelect) return;

    categorySelect.addEventListener('change', () => {
      const selectedCategory = categorySelect.value;
      logger.debug('[BeginnerMode] 选中分类:', selectedCategory);

      // 更新当前分类
      this.currentCategory = selectedCategory || null;
      this.currentSubCategory = null;

      // 处理分类切换
      this.handleCategoryChange();
    });
  }

  /**
   * 处理分类切换（提取共用逻辑）
   */
  handleCategoryChange() {
    const subCategorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-subcategory-select'));
    if (!subCategorySelect) return;

    // 检查是否有二级分类
    if (this.currentCategory) {
      const elementMap = getAllElements();
      const categoryContent = elementMap[this.currentCategory];
      const subCategories = this.getSubCategories(categoryContent);

      if (subCategories.length > 0) {
        // 有二级分类，显示第二个下拉框
        this.updateSubCategorySelect(subCategories);
        subCategorySelect.style.display = 'block';
        // 不刷新列表，等用户选择二级分类
      } else {
        // 没有二级分类，隐藏第二个下拉框
        subCategorySelect.style.display = 'none';
        // 直接刷新元素列表
        this.refreshElementList();
      }
    } else {
      // 没有选中分类，隐藏第二个下拉框
      subCategorySelect.style.display = 'none';
      this.refreshElementList();
    }
  }

  /**
   * 绑定二级分类下拉框事件
   */
  bindSubCategorySelect() {
    const subCategorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-subcategory-select'));
    if (!subCategorySelect) return;

    subCategorySelect.addEventListener('change', () => {
      const selectedSubCategory = subCategorySelect.value;
      logger.debug('[BeginnerMode] 选中子分类:', selectedSubCategory);

      // 更新当前子分类
      this.currentSubCategory = selectedSubCategory || null;

      // 刷新元素列表
      this.refreshElementList();
    });
  }

  /**
   * 获取分类下的二级分类列表
   * 
   * @param {Object} categoryContent - 分类内容
   * @returns {Array<string>} 二级分类名称数组
   */
  getSubCategories(categoryContent) {
    const subCategories = [];

    for (const [key, value] of Object.entries(categoryContent)) {
      // 如果值是对象且不是数组，说明这是二级分类
      if (typeof value === 'object' && !Array.isArray(value)) {
        subCategories.push(key);
      }
    }

    return subCategories;
  }

  /**
   * 更新二级分类下拉框选项
   * 
   * @param {Array<string>} subCategories - 二级分类名称数组
   */
  updateSubCategorySelect(subCategories) {
    const subCategorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-subcategory-select'));
    if (!subCategorySelect) return;

    // 清空旧选项（保留默认选项）
    subCategorySelect.innerHTML = '<option value="">全部子分类</option>';

    // 添加新选项
    subCategories.forEach(subCategoryName => {
      const option = document.createElement('option');
      option.value = subCategoryName;
      option.textContent = subCategoryName;
      subCategorySelect.appendChild(option);
    });

    // 重置选择
    subCategorySelect.value = '';
  }

  /**
   * 刷新元素列表（根据当前筛选条件）
   */
  refreshElementList() {
    const elementListContainer = this.container.querySelector('.paws-puffs-ve-element-list');
    if (!elementListContainer) return;

    // 重新渲染元素列表
    elementListContainer.innerHTML = this.renderElementList();

    // 重新绑定元素点击事件
    this.bindElementItemEvents();

    logger.debug('[BeginnerMode.refreshElementList] 元素列表已刷新', {
      category: this.currentCategory,
      subCategory: this.currentSubCategory
    });
  }

  /**
   * 绑定元素项点击事件（单独提取）
   */
  bindElementItemEvents() {
    const elementItems = this.container.querySelectorAll('.paws-puffs-ve-element-item');
    const propertiesPanel = this.container.querySelector('.paws-puffs-ve-properties-panel');
    const emptyState = propertiesPanel?.querySelector('.paws-puffs-ve-properties-empty');
    const contentArea = propertiesPanel?.querySelector('.paws-puffs-ve-properties-content');

    elementItems.forEach(item => {
      item.addEventListener('click', () => {
        // 从 data-element 属性获取元素名
        const htmlItem = /** @type {HTMLElement} */ (item);
        const elementName = htmlItem.dataset.element || htmlItem.querySelector('.paws-puffs-ve-element-name')?.textContent.trim();
        logger.debug('[BeginnerMode] 选中元素:', elementName);

        // 保存当前选中的元素
        this.selectedElement = elementName;

        // 高亮当前元素
        elementItems.forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        // ========================================
        // [SCENE] 场景系统集成（Task-7 重构）
        // ========================================

        // 【旧代码】硬编码只支持"气泡外框"（已注释保留）
        // if (elementName === '气泡外框') {
        //   const htmlEmptyState = /** @type {HTMLElement} */ (emptyState);
        //   const htmlContentArea = /** @type {HTMLElement} */ (contentArea);
        //   this.renderPropertiesPanel(htmlContentArea, elementName);
        //   if (htmlEmptyState) htmlEmptyState.style.display = 'none';
        //   if (htmlContentArea) htmlContentArea.style.display = 'block';
        // }

        // 【新代码】查询场景系统，动态创建控件
        // 1. 查询推荐场景
        const sceneName = getRecommendedScene(elementName);
        if (!sceneName) {
          logger.warn('[BeginnerMode.onElementClick] 未找到推荐场景，元素:', elementName);
          toastr.warning(`元素"${elementName}"暂无可用场景`);
          this.showEmptyState('该元素暂无可用场景');
          return;
        }
        logger.debug('[BeginnerMode.onElementClick] 推荐场景:', sceneName);

        // 2. 加载场景配置
        const sceneConfig = getSceneConfig(sceneName);
        if (!sceneConfig) {
          logger.error('[BeginnerMode.onElementClick] 场景配置不存在:', sceneName);
          toastr.error('场景配置加载失败');
          this.showEmptyState('场景配置加载失败');
          return;
        }
        logger.debug('[BeginnerMode.onElementClick] 场景配置加载成功:', sceneConfig.名称);

        // 3. 提取当前样式
        const currentValues = this.getCurrentStyles(elementName);
        logger.debug('[BeginnerMode.onElementClick] 当前样式:', currentValues);

        // 4. 显示属性面板容器
        const htmlEmptyState = /** @type {HTMLElement} */ (emptyState);
        const htmlContentArea = /** @type {HTMLElement} */ (contentArea);
        if (htmlEmptyState) htmlEmptyState.style.display = 'none';
        if (htmlContentArea) htmlContentArea.style.display = 'block';

        // 5. 渲染场景编辑器
        this.renderSceneEditor(elementName, sceneConfig, currentValues);
      });
    });
  }

  /**
   * 渲染元素列表（支持筛选）
   * 
   * @description
   * 从 st-element-map.js 动态生成元素列表HTML，根据筛选条件显示：
   * - 无筛选：显示所有9大分类
   * - 一级筛选：只显示选中的分类
   * - 二级筛选：只显示选中的子分类
   * 
   * @returns {string} 元素列表HTML
   */
  renderElementList() {
    const elementMap = getAllElements();
    let html = '';

    // 情况1：选择了一级分类
    if (this.currentCategory) {
      const categoryContent = elementMap[this.currentCategory];

      if (!categoryContent) {
        return '<small class="hint">分类不存在</small>';
      }

      // 情况1.1：选择了二级分类
      if (this.currentSubCategory) {
        const subCategoryContent = categoryContent[this.currentSubCategory];

        if (!subCategoryContent) {
          return '<small class="hint">子分类不存在</small>';
        }

        // 只显示选中的二级分类下的元素（不显示标题，避免重复）
        html = this.renderCategoryElements(subCategoryContent);
      }
      // 情况1.2：只选择了一级分类
      else {
        // 显示该分类下的所有内容
        html = this.renderCategoryElements(categoryContent);
      }
    }
    // 情况2：没有筛选，显示所有分类
    else {
      // 遍历9大分类
      for (const [categoryName, categoryContent] of Object.entries(elementMap)) {
        // 跳过空分类
        if (!categoryContent || Object.keys(categoryContent).length === 0) {
          continue;
        }

        html += `
          <div class="paws-puffs-ve-element-group">
            <div class="paws-puffs-ve-element-parent">
              <span>${categoryName}</span>
            </div>
            <div class="paws-puffs-ve-element-children" style="padding-left: 20px;">
              ${this.renderCategoryElements(categoryContent)}
            </div>
          </div>
        `;
      }
    }

    // 如果没有内容，显示提示
    if (html === '' || html.trim() === '') {
      html = `
        <small class="hint" style="display: block; margin-top: 10px; padding: 0 10px; opacity: 0.7;">
          ${this.currentCategory ? '该分类暂无元素' : '暂无元素，请在 st-element-map.js 中定义'}
        </small>
      `;
    }

    return html;
  }

  /**
   * 渲染分类下的元素
   * 
   * @description
   * 递归渲染分类中的所有元素：
   * - 字符串值 = 可编辑元素（渲染为可点击项）
   * - 对象值 = 二级分类（递归渲染子元素）
   * - 数组值 = 多选择器元素（渲染为可点击项）
   * 
   * @param {Object} categoryContent - 分类内容
   * @returns {string} 元素HTML
   */
  renderCategoryElements(categoryContent) {
    let html = '';

    for (const [elementName, elementValue] of Object.entries(categoryContent)) {
      // 情况1：字符串值 = CSS选择器，这是可编辑元素
      if (typeof elementValue === 'string') {
        html += `
          <div class="paws-puffs-ve-element-item" data-element="${elementName}">
            <span class="paws-puffs-ve-element-name">${elementName}</span>
          </div>
        `;
      }
      // 情况2：数组值 = 多个CSS选择器，也是可编辑元素
      else if (Array.isArray(elementValue)) {
        html += `
          <div class="paws-puffs-ve-element-item" data-element="${elementName}">
            <span class="paws-puffs-ve-element-name">${elementName}</span>
          </div>
        `;
      }
      // 情况3：对象值 = 二级分类，递归渲染子元素
      else if (typeof elementValue === 'object') {
        html += `
          <div style="margin-bottom: 8px;">
            <div class="paws-puffs-ve-element-parent" style="font-size: 0.9em; opacity: 0.8;">
              <span>${elementName}</span>
            </div>
            <div style="padding-left: 15px;">
              ${this.renderCategoryElements(elementValue)}
            </div>
          </div>
        `;
      }
    }

    return html;
  }




  /**
   * 渲染属性编辑面板
   * 
   * @param {HTMLElement} container - 属性面板容器
   * @param {string} elementName - 元素名称
   */
  renderPropertiesPanel(container, elementName) {
    if (!container) return;

    logger.debug('[BeginnerMode.renderPropertiesPanel] 渲染属性面板:', elementName);

    // 从输入框提取中文CSS
    const customCSSInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
    const inputContent = customCSSInput ? customCSSInput.value : '';
    const chineseCSS = extractChineseCSS(inputContent);

    // 解析获取当前元素的样式
    const stylesMap = parseChineseCSS(chineseCSS);
    const currentStyles = stylesMap.get(elementName) || {};
    logger.debug('[BeginnerMode.renderPropertiesPanel] 当前样式:', currentStyles);

    // 渲染控件
    container.innerHTML = `
      <div style="padding: 0px;">
        <h4 style="margin: 0 0 15px 0; display: flex; align-items: center; gap: 8px;">
          <i class="fa fa-palette"></i>
          <span>${elementName}</span>
        </h4>
        
        <!-- 属性控件列表 -->
        <div class="paws-puffs-ve-property-group">
          <!-- 背景颜色 -->
          <div class="paws-puffs-ve-property-item">
            <label>
              <span class="paws-puffs-ve-property-label">背景颜色</span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="color" 
                       class="paws-puffs-ve-control-color" 
                       data-property="背景颜色"
                       value="${currentStyles['背景颜色'] || '#ffffff'}">
                <input type="text" 
                       class="text_pole paws-puffs-ve-text-input" 
                       data-property="背景颜色"
                       value="${currentStyles['背景颜色'] || '#ffffff'}"
                       placeholder="#ffffff"
                       style="flex: 1;">
              </div>
            </label>
          </div>
          
          <!-- 圆角 -->
          <div class="paws-puffs-ve-property-item">
            <label>
              <span class="paws-puffs-ve-property-label">圆角</span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="number" 
                       class="text_pole paws-puffs-ve-number-input" 
                       data-property="圆角"
                       value="${parseFloat(currentStyles['圆角']) || 10}"
                       min="0"
                       step="1"
                       style="width: 80px;">
                <span style="opacity: 0.7;">px</span>
              </div>
            </label>
          </div>
        </div>
        
        <small class="hint" style="display: block; margin-top: 15px; opacity: 0.7;">
          <i class="fa fa-info-circle"></i> 修改后会自动保存到中文CSS
        </small>
      </div>
    `;

    // ⚠️ 控件事件由 bindControlEvents() 统一绑定（在 renderSceneEditor() 中调用）
    // 不再需要在这里单独绑定

    logger.debug('[BeginnerMode.renderPropertiesPanel] 属性面板渲染完成');
  }

  // ❌ 旧版 bindPropertyControls() 已删除（2025-10-11）
  // 原因：硬编码的控件事件绑定，只支持颜色和数字输入框
  // 已被 bindControlEvents() 取代（支持场景系统的动态控件）

  /**
   * 更新中文CSS
   * 
   * @description
   * 处理控件返回值（支持字符串和对象），更新中文CSS并触发编译
   * 
   * @param {string} elementName - 元素名称
   * @param {string} cssProperty - CSS属性名（主属性，如'position'）
   * @param {string|Object} controlValue - 控件返回值（字符串或对象）
   */
  updateChineseCSS(elementName, cssProperty, controlValue) {
    logger.debug('[BeginnerMode.updateChineseCSS] 开始更新:', { elementName, cssProperty, controlValue });

    // 1. 读取输入框
    const customCSSInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
    if (!customCSSInput) {
      logger.error('[BeginnerMode.updateChineseCSS] 输入框未找到');
      return;
    }

    const inputContent = customCSSInput.value;
    const chineseCSS = extractChineseCSS(inputContent) || '';
    logger.debug('[BeginnerMode.updateChineseCSS] 提取到的中文CSS长度:', chineseCSS.length);

    // 2. 解析中文CSS
    const stylesMap = parseChineseCSS(chineseCSS);
    logger.debug('[BeginnerMode.updateChineseCSS] 解析到的元素数量:', stylesMap.size);

    // 3. 确保当前元素存在
    if (!stylesMap.has(elementName)) {
      stylesMap.set(elementName, {});
      logger.debug('[BeginnerMode.updateChineseCSS] 创建新元素:', elementName);
    }
    const elementStyles = stylesMap.get(elementName);

    // 4. 处理控件返回值（⚠️ 难点1：3种格式）
    if (typeof controlValue === 'object' && controlValue !== null && !Array.isArray(controlValue)) {
      // 格式2和3：对象返回值（单属性或多属性）
      logger.debug('[BeginnerMode.updateChineseCSS] 处理对象返回值，属性数量:', Object.keys(controlValue).length);

      let processedCount = 0;
      for (const [cssProp, cssVal] of Object.entries(controlValue)) {
        const 中文属性 = translatePropertyToChinese(cssProp);

        if (!中文属性) {
          logger.warn('[BeginnerMode.updateChineseCSS] 无法翻译属性:', cssProp);
          continue;
        }

        // ⚠️ 难点2：检测transform冲突
        if (cssProp === 'transform') {
          const existingTransform = elementStyles['变换'] || '';
          const mergedTransform = this.mergeTransforms(existingTransform, cssVal);
          elementStyles['变换'] = mergedTransform;
          logger.debug('[BeginnerMode.updateChineseCSS] 合并transform:', {
            existing: existingTransform,
            new: cssVal,
            merged: mergedTransform
          });
        } else {
          // 空值处理：删除属性
          if (cssVal === '' || cssVal === null || cssVal === undefined) {
            delete elementStyles[中文属性];
            logger.debug('[BeginnerMode.updateChineseCSS] 删除空属性:', 中文属性);
          } else {
            elementStyles[中文属性] = cssVal;
            logger.debug('[BeginnerMode.updateChineseCSS] 设置属性:', 中文属性, '=', cssVal);
          }
        }
        processedCount++;
      }

      logger.info('[BeginnerMode.updateChineseCSS] 对象处理完成，成功处理:', processedCount, '个属性');

    } else {
      // 格式1：字符串返回值
      logger.debug('[BeginnerMode.updateChineseCSS] 处理字符串返回值');

      const 中文属性 = translatePropertyToChinese(cssProperty);

      if (!中文属性) {
        logger.warn('[BeginnerMode.updateChineseCSS] 无法翻译属性:', cssProperty);
        return;
      }

      // 空值处理：删除属性
      if (controlValue === '' || controlValue === null || controlValue === undefined) {
        delete elementStyles[中文属性];
        logger.debug('[BeginnerMode.updateChineseCSS] 删除空属性:', 中文属性);
      } else {
        elementStyles[中文属性] = String(controlValue);
        logger.debug('[BeginnerMode.updateChineseCSS] 设置属性:', 中文属性, '=', controlValue);
      }
    }

    // 5. 生成新的中文CSS
    const updatedChineseCSS = generateChineseCSS(stylesMap);
    logger.debug('[BeginnerMode.updateChineseCSS] 生成的中文CSS长度:', updatedChineseCSS.length);

    // 6. 写回输入框（⚠️ 防循环关键）
    if (this.syncState) {
      this.syncState.isUpdating = true;
      logger.debug('[BeginnerMode.updateChineseCSS] 设置同步标记 isUpdating=true');
    }

    const newContent = mergeChineseCSS(inputContent, updatedChineseCSS);
    customCSSInput.value = newContent;

    // 同步到power_user（保存设置）
    power_user.custom_css = String(newContent);
    saveSettingsDebounced();
    logger.debug('[BeginnerMode.updateChineseCSS] 已同步到 power_user.custom_css 并保存');

    // 延迟50ms解除标记
    setTimeout(() => {
      if (this.syncState) {
        this.syncState.isUpdating = false;
        logger.debug('[BeginnerMode.updateChineseCSS] 已解除同步标记 isUpdating=false');
      }
    }, 50);

    logger.info('[BeginnerMode.updateChineseCSS] ✅ 中文CSS更新完成');

    // 7. 触发编译
    if (this.compileCallback) {
      logger.debug('[BeginnerMode.updateChineseCSS] 触发编译回调');
      this.compileCallback();
    } else {
      logger.warn('[BeginnerMode.updateChineseCSS] 编译回调未设置');
    }
  }

  /**
   * 合并transform值
   * 
   * @description
   * 当多个控件操作transform属性时，智能合并而不是覆盖
   * 
   * @param {string} existing - 已存在的transform值
   * @param {string} newValue - 新的transform值
   * @returns {string} 合并后的transform值
   * 
   * @example
   * mergeTransforms('translate(-50%, -50%)', 'rotate(-8deg)')
   * // 返回：'translate(-50%, -50%) rotate(-8deg)'
   */
  mergeTransforms(existing, newValue) {
    logger.debug('[BeginnerMode.mergeTransforms] 开始合并:', { existing, newValue });

    // 空值处理
    if (!existing || existing.trim() === '') {
      logger.debug('[BeginnerMode.mergeTransforms] existing为空，直接返回newValue');
      return newValue;
    }
    if (!newValue || newValue.trim() === '') {
      logger.debug('[BeginnerMode.mergeTransforms] newValue为空，直接返回existing');
      return existing;
    }

    // 提取变换类型（translate、rotate、scale等）
    const getTransformType = (transformStr) => {
      const match = transformStr.match(/^(\w+)\(/);
      return match ? match[1] : null;
    };

    const newType = getTransformType(newValue);
    if (!newType) {
      logger.warn('[BeginnerMode.mergeTransforms] 无法解析变换类型:', newValue);
      return existing;
    }
    logger.debug('[BeginnerMode.mergeTransforms] 检测到变换类型:', newType);

    // 检查是否已包含该类型的变换
    const regex = new RegExp(`${newType}\\([^)]+\\)`, 'g');
    if (existing.includes(newType + '(')) {
      // 替换已有的同类变换
      const merged = existing.replace(regex, newValue);
      logger.info('[BeginnerMode.mergeTransforms] ✅ 替换已有变换:', merged);
      return merged;
    } else {
      // 追加新变换
      const merged = `${existing} ${newValue}`.trim();
      logger.info('[BeginnerMode.mergeTransforms] ✅ 追加新变换:', merged);
      return merged;
    }
  }

  /**
   * 从输入框同步到控件（同步按钮功能）
   */
  syncFromInput() {
    logger.debug('[BeginnerMode.syncFromInput] 从输入框同步');

    const customCSSInput = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
    if (!customCSSInput) {
      toastr.error('错误：未找到CSS输入框');
      return;
    }

    const inputContent = customCSSInput.value;
    const chineseCSS = extractChineseCSS(inputContent);

    if (chineseCSS && chineseCSS.trim()) {
      // 有分隔符：自动选中第一个元素
      const firstElement = this.container.querySelector('.paws-puffs-ve-element-item[data-element]');
      if (firstElement) {
        /** @type {HTMLElement} */ (firstElement).click();
        toastr.success('已从输入框加载设计');
      } else {
        toastr.warning('未找到可编辑的元素');
      }
    } else {
      toastr.info('当前主题未使用可视化编辑器');
    }
  }

  /**
   * 重置面板（重置按钮功能）
   */
  resetPanel() {
    logger.debug('[BeginnerMode.resetPanel] 重置操作面板');

    // 清空当前选中的元素
    this.selectedElement = null;

    // 清空属性面板
    const propertiesContent = /** @type {HTMLElement} */ (this.container.querySelector('.paws-puffs-ve-properties-content'));
    const propertiesEmpty = /** @type {HTMLElement} */ (this.container.querySelector('.paws-puffs-ve-properties-empty'));

    if (propertiesContent) {
      propertiesContent.style.display = 'none';
      propertiesContent.innerHTML = '';
    }
    if (propertiesEmpty) {
      propertiesEmpty.style.display = 'block';
    }

    // 移除所有元素的选中状态
    const elementItems = this.container.querySelectorAll('.paws-puffs-ve-element-item');
    elementItems.forEach(item => {
      item.classList.remove('active');
    });

    toastr.success('操作面板已重置');
    logger.info('[BeginnerMode.resetPanel] 操作面板已重置');
  }

  // ========================================
  // [SCENE] 场景系统相关方法（Task-7新增）
  // ========================================

  /**
   * 从输入框提取当前元素的样式
   * 
   * @description
   * 读取#customCSS输入框，解析中文CSS，提取当前元素的所有样式
   * 
   * @param {string} elementName - 元素名称
   * @returns {Object} 样式对象（CSS属性名→值）
   * 
   * @example
   * // 输入框内容：
   * // 角色头像容器 { 定位: 脱离文档流; 上偏移: -15像素 }
   * getCurrentStyles('角色头像容器')
   * // 返回：{ position: 'absolute', top: '-15px' }
   */
  getCurrentStyles(elementName) {
    logger.debug('[BeginnerMode.getCurrentStyles] 提取样式，元素:', elementName);

    // 1. 读取输入框
    const input = /** @type {HTMLTextAreaElement} */ (document.querySelector('#customCSS'));
    if (!input) {
      logger.error('[BeginnerMode.getCurrentStyles] 输入框未找到');
      return {};
    }

    const inputContent = input.value;

    // 2. 提取中文CSS（使用compiler.js的工具函数）
    const chineseCSS = extractChineseCSS(inputContent);
    if (!chineseCSS || chineseCSS.trim() === '') {
      logger.debug('[BeginnerMode.getCurrentStyles] 输入框无中文CSS');
      return {};
    }

    // 3. 解析中文CSS为Map
    const stylesMap = parseChineseCSS(chineseCSS);
    if (!stylesMap.has(elementName)) {
      logger.debug('[BeginnerMode.getCurrentStyles] 元素无样式');
      return {};
    }

    const 中文样式 = stylesMap.get(elementName);

    // 4. 翻译中文属性名为英文
    const englishStyles = {};
    for (const [中文属性, 值] of Object.entries(中文样式)) {
      // 反向查询css-property-dict.js
      const englishProperty = this.translateChineseToProperty(中文属性);
      if (englishProperty) {
        englishStyles[englishProperty] = 值;
      }
    }

    logger.debug('[BeginnerMode.getCurrentStyles] 提取的样式:', englishStyles);
    return englishStyles;
  }

  /**
   * 翻译中文属性名为英文CSS属性
   * 
   * @description
   * 查询css-property-dict.js，将中文属性名转换为CSS属性名
   * 
   * @param {string} 中文属性 - 中文属性名（如"背景颜色"）
   * @returns {string|null} 英文CSS属性名（如"background-color"），未找到返回null
   * 
   * @example
   * translateChineseToProperty('背景颜色') // → 'background-color'
   * translateChineseToProperty('上偏移') // → 'top'
   */
  translateChineseToProperty(中文属性) {
    const propInfo = getPropertyInfoByChinese(中文属性);
    if (!propInfo) {
      logger.warn('[BeginnerMode.translateChineseToProperty] 未知中文属性:', 中文属性);
      return null;
    }
    return propInfo.CSS属性;
  }

  /**
   * 渲染场景编辑器
   * 
   * @description
   * 根据场景配置动态创建控件并渲染到右侧编辑区
   * 
   * @param {string} elementName - 元素名称
   * @param {Object} sceneConfig - 场景配置对象
   * @param {Object} currentValues - 当前样式值（英文CSS属性名→值）
   * 
   * 逻辑：
   * 1. 获取容器
   * 2. 清空控件缓存
   * 3. 渲染HTML（场景标题 + 属性分组）
   * 4. 绑定控件DOM事件（拉条交互）
   * 5. 绑定控件onChange回调（生成中文CSS）
   * 6. 绑定分组折叠事件（展开/收起分组）
   */
  renderSceneEditor(elementName, sceneConfig, currentValues) {
    logger.info('[BeginnerMode.renderSceneEditor] 开始渲染场景:', sceneConfig.名称);

    // 1. 获取容器
    const container = this.container.querySelector('.paws-puffs-ve-properties-content');
    if (!container) {
      logger.error('[BeginnerMode.renderSceneEditor] 容器未找到');
      return;
    }

    // 2. 清空控件缓存和已处理属性
    this.controlInstances = {};
    this.processedProperties = new Set();
    logger.debug('[BeginnerMode.renderSceneEditor] 已清空控件缓存');

    // 3. 渲染HTML
    const groupsHTML = sceneConfig.属性分组.map(group =>
      this.renderPropertyGroup(group, currentValues)
    ).join('');

    container.innerHTML = `
      <div class="paws-puffs-ve-scene-editor">
        <div class="paws-puffs-ve-scene-header">
          <h4 class="paws-puffs-ve-scene-title">
            <i class="${sceneConfig.图标}"></i>
            ${sceneConfig.名称}
          </h4>
          <p class="paws-puffs-ve-scene-description">${sceneConfig.描述}</p>
        </div>
        
        <div class="paws-puffs-ve-scene-groups">
          ${groupsHTML}
        </div>
      </div>
    `;

    logger.debug('[BeginnerMode.renderSceneEditor] HTML已渲染，分组数:', sceneConfig.属性分组.length);

    // 4. 绑定所有控件的DOM事件
    this.bindControlsDOM();

    // 5. 绑定所有控件的onChange回调（Task-8新增）
    this.bindControlEvents();

    // 6. 绑定属性分组的折叠事件
    this.bindGroupCollapseEvents();

    logger.info('[BeginnerMode.renderSceneEditor] ✅ 渲染完成');
  }

  /**
   * 渲染属性分组
   * 
   * @description
   * 渲染单个属性分组，包含可折叠标题和控件列表
   * 
   * @param {Object} groupConfig - 分组配置
   * @param {Object} currentValues - 当前样式值
   * @returns {string} HTML字符串
   * 
   * 逻辑：
   * 1. 检查场景配置的"默认展开"标记（默认false，即默认折叠）
   * 2. 根据状态设置CSS类（.expanded 或 .collapsed）
   * 3. 根据状态设置图标（▼ 或 ▶）
   * 4. 根据状态设置body显示（block 或 none）
   */
  renderPropertyGroup(groupConfig, currentValues) {
    logger.debug('[BeginnerMode.renderPropertyGroup] 渲染分组:', groupConfig.组名);

    // 默认折叠（除非场景配置明确要求展开）
    const isExpanded = groupConfig.默认展开 === true;
    const expandedClass = isExpanded ? 'expanded' : 'collapsed';
    const chevronIcon = isExpanded ? 'fa-chevron-down' : 'fa-chevron-right';
    const bodyDisplay = isExpanded ? 'block' : 'none';

    // 渲染控件列表
    const controlsHTML = groupConfig.属性列表.map(cssProperty =>
      this.renderPropertyControl(cssProperty, currentValues)
    ).join('');

    return `
      <div class="paws-puffs-ve-property-group ${expandedClass}">
        <div class="paws-puffs-ve-group-header">
          <i class="${groupConfig.图标}"></i>
          <span class="paws-puffs-ve-group-name">${groupConfig.组名}</span>
          <i class="fa-solid ${chevronIcon} paws-puffs-ve-group-toggle"></i>
        </div>
        <div class="paws-puffs-ve-group-body" style="display: ${bodyDisplay};">
          ${controlsHTML}
        </div>
      </div>
    `;
  }

  /**
   * 从元素中文名称获取elementType
   * 
   * @param {string} elementName - 元素中文名称（如"角色头像包装器"）
   * @returns {string} elementType（如"mesAvatarWrapper"）
   * 
   * @description
   * MessageElementPositionControl需要elementType参数（DOM类名）
   * 
   * 工作流程：
   * 1. 从st-element-map.js查询CSS选择器（如"#chat .mes .mesAvatarWrapper"）
   * 2. 提取最后一个类名或ID（".mesAvatarWrapper" → "mesAvatarWrapper"）
   * 3. 返回elementType
   */
  getElementTypeFromName(elementName) {
    // 从st-element-map.js查询选择器
    const selector = getSelector(elementName);
    if (!selector) {
      logger.warn('[BeginnerMode.getElementTypeFromName] 找不到选择器:', elementName);
      return 'mesAvatarWrapper'; // 默认
    }

    // 提取最后一个类名或ID（简单正则）
    // 例如：'#chat .mes:not([is_user="true"]) .mesAvatarWrapper' → 'mesAvatarWrapper'
    const matches = selector.match(/[\.\#]([a-zA-Z_-]+)(?![^\[]*\])/g);
    if (matches && matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      return lastMatch.replace(/^[\.\#]/, ''); // 去掉.或#前缀
    }

    return 'mesAvatarWrapper'; // 默认
  }

  /**
   * 渲染单个属性控件
   * 
   * @description
   * 根据CSS属性创建对应的控件实例，处理多属性控件的去重逻辑
   * 
   * 支持两种输入格式：
   * 1. 字符串格式：'position' → 从映射表查找控件类型
   * 2. 对象格式：{ css属性: 'position', 控件类型: 'MessageElementPositionControl', 控件配置: {...} }
   * 
   * @param {string|Object} cssProperty - CSS属性名或属性配置对象
   * @param {Object} currentValues - 当前样式值
   * @returns {string} HTML字符串
   */
  renderPropertyControl(cssProperty, currentValues) {
    // ===== 新增：支持对象格式 =====
    let actualCssProperty;
    let explicitControlType = null;
    let explicitControlConfig = null;

    if (typeof cssProperty === 'object') {
      // 对象格式（场景直接指定控件类型）
      actualCssProperty = cssProperty.css属性;
      explicitControlType = cssProperty.控件类型;
      explicitControlConfig = cssProperty.控件配置 || {};
      logger.debug('[BeginnerMode.renderPropertyControl] 使用对象格式:', actualCssProperty, explicitControlType);
    } else {
      // 字符串格式（从映射表查找）
      actualCssProperty = cssProperty;
    }

    // 1. 检查是否已处理（跳过重复）
    if (this.processedProperties.has(actualCssProperty)) {
      logger.debug('[BeginnerMode.renderPropertyControl] 属性已处理，跳过:', actualCssProperty);
      return '';
    }

    // 2. 确定控件类型和管理的属性
    let controlType;
    let managedProperties;

    if (explicitControlType) {
      // 对象格式：直接使用指定的控件类型
      controlType = explicitControlType;
      managedProperties = [actualCssProperty]; // 只管理当前属性
    } else {
      // 字符串格式：查询映射表
      const mappingInfo = PROPERTY_TO_CONTROL_MAP[actualCssProperty];
      if (!mappingInfo) {
        logger.warn('[BeginnerMode.renderPropertyControl] 未知属性:', actualCssProperty);
        return this.renderNotImplementedControl(actualCssProperty);
      }

      controlType = mappingInfo.controlType;
      managedProperties = mappingInfo.managedProperties;

      // 3. 跳过从属属性
      if (managedProperties.length === 0) {
        logger.debug('[BeginnerMode.renderPropertyControl] 从属属性，跳过:', actualCssProperty);
        return '';
      }
    }

    // 4. 标记已处理
    managedProperties.forEach(prop => this.processedProperties.add(prop));
    logger.debug('[BeginnerMode.renderPropertyControl] 创建控件:', controlType, '管理属性:', managedProperties);

    // 5. 准备初始值
    const controlValues = {};
    managedProperties.forEach(prop => {
      if (currentValues[prop] !== undefined) {
        controlValues[prop] = currentValues[prop];
      }
    });

    // 6. 创建控件实例
    let control;
    try {
      switch (controlType) {
        case 'PositionControl':
          control = new PositionControl({
            positionType: controlValues['position'] || 'absolute',
            offsets: {
              top: controlValues['top'] || null,
              left: controlValues['left'] || null,
              bottom: controlValues['bottom'] || null,
              right: controlValues['right'] || null
            },
            zIndex: controlValues['z-index'] !== undefined ? parseInt(controlValues['z-index']) : 9
          });
          break;

        case 'TransformControl':
          control = new TransformControl({
            rotate: 0,
            scaleX: 1,
            scaleY: 1,
            skewX: 0,
            skewY: 0,
            translateX: 0,
            translateY: 0
            // TODO: 解析 controlValues['transform'] 并设置对应值（P2优先级）
          });
          break;

        case 'SizeControl':
          control = new SizeControl({
            width: controlValues['width'],
            height: controlValues['height'],
            minWidth: controlValues['min-width'],
            maxWidth: controlValues['max-width'],
            minHeight: controlValues['min-height'],
            maxHeight: controlValues['max-height'],
            aspectRatio: controlValues['aspect-ratio']
          });
          break;

        case 'ShadowControl':
          control = new ShadowControl({
            defaultValue: controlValues['box-shadow'] || 'none'
          });
          break;

        case 'BorderControl':
          control = new BorderControl({
            defaultValue: controlValues['border'] || ''
          });
          break;

        case 'BorderRadiusControl':
          control = new BorderRadiusControl({
            defaultValue: controlValues['border-radius'] || ''
          });
          break;

        case 'MessageElementPositionControl':
          // 气泡元素定位控件（传入elementType从当前元素获取）
          control = new MessageElementPositionControl({
            elementType: explicitControlConfig?.elementType || this.getElementTypeFromName(this.currentElement),
            defaultMode: explicitControlConfig?.defaultMode || 'absolute',
            defaultPosition: explicitControlConfig?.defaultPosition || 'top-left',
            defaultOffsets: explicitControlConfig?.defaultOffsets || {}
          });
          break;

        default:
          logger.warn('[BeginnerMode.renderPropertyControl] 控件未实现:', controlType);
          return this.renderNotImplementedControl(actualCssProperty);
      }
    } catch (error) {
      logger.error('[BeginnerMode.renderPropertyControl] 控件创建失败:', error);
      return `<div class="paws-puffs-ve-control-error">控件加载失败: ${actualCssProperty}</div>`;
    }

    // 7. 缓存控件实例（Task-8需要）
    this.controlInstances[actualCssProperty] = control;
    logger.debug('[BeginnerMode.renderPropertyControl] 控件实例已缓存:', actualCssProperty);

    // 8. 渲染HTML
    return `
      <div class="paws-puffs-ve-property-item" data-property="${actualCssProperty}">
        ${control.render()}
      </div>
    `;
  }

  /**
   * 绑定所有控件的DOM事件
   * 
   * @description
   * 遍历控件实例缓存，调用bindEvents()绑定拉条交互
   */
  bindControlsDOM() {
    logger.debug('[BeginnerMode.bindControlsDOM] 开始绑定控件事件');

    let boundCount = 0;

    for (const [cssProperty, controlInstance] of Object.entries(this.controlInstances)) {
      const controlContainer = this.container.querySelector(
        `.paws-puffs-ve-property-item[data-property="${cssProperty}"]`
      );

      if (!controlContainer) {
        logger.warn('[BeginnerMode.bindControlsDOM] 控件容器未找到:', cssProperty);
        continue;
      }

      try {
        controlInstance.bindEvents(controlContainer);
        boundCount++;
        logger.debug('[BeginnerMode.bindControlsDOM] 已绑定:', cssProperty);
      } catch (error) {
        logger.error('[BeginnerMode.bindControlsDOM] 绑定失败:', cssProperty, error);
      }
    }

    logger.info('[BeginnerMode.bindControlsDOM] 绑定完成，成功数:', boundCount);
  }

  /**
   * 绑定所有控件的onChange回调
   * 
   * @description
   * 遍历控件实例，绑定onChange回调，实现控件变化→生成中文CSS的流程
   */
  bindControlEvents() {
    logger.debug('[BeginnerMode.bindControlEvents] 开始绑定onChange回调');

    let boundCount = 0;

    for (const [cssProperty, controlInstance] of Object.entries(this.controlInstances)) {
      // 绑定onChange回调
      controlInstance.onChange = (value) => {
        logger.debug('[BeginnerMode.bindControlEvents] 控件触发onChange:', { cssProperty, value });
        this.updateChineseCSS(this.selectedElement, cssProperty, value);
      };

      boundCount++;
      logger.debug('[BeginnerMode.bindControlEvents] 已绑定onChange:', cssProperty);
    }

    logger.info('[BeginnerMode.bindControlEvents] ✅ onChange绑定完成，数量:', boundCount);
  }

  /**
   * 显示空状态
   * 
   * @param {string} message - 提示消息
   */
  showEmptyState(message) {
    const container = this.container.querySelector('.paws-puffs-ve-properties-content');
    if (container) {
      container.innerHTML = `
        <div class="paws-puffs-ve-empty-state">
          <i class="fa-solid fa-circle-info"></i>
          <p>${message}</p>
        </div>
      `;
    }
  }

  /**
   * 渲染未实现控件的占位符
   * 
   * @param {string} cssProperty - CSS属性名
   * @returns {string} HTML字符串
   */
  renderNotImplementedControl(cssProperty) {
    const propInfo = getPropertyInfo(cssProperty);
    const 中文名 = propInfo ? propInfo.中文名 : cssProperty;

    return `
      <div class="paws-puffs-ve-property-item paws-puffs-ve-not-implemented" data-property="${cssProperty}">
        <label class="paws-puffs-ve-property-label">${中文名}</label>
        <div class="paws-puffs-ve-control-placeholder">
          <i class="fa-solid fa-wrench"></i>
          <span>控件开发中...</span>
        </div>
      </div>
    `;
  }

  /**
   * 绑定属性分组折叠事件
   * 
   * @description
   * 为所有属性分组的标题栏绑定点击折叠功能
   * 
   * 逻辑：
   * 1. 查找所有 .paws-puffs-ve-group-header 元素
   * 2. 为每个标题栏绑定点击事件
   * 3. 点击时切换分组的展开/折叠状态
   * 4. 切换图标方向（▼ ↔ ▶）
   */
  bindGroupCollapseEvents() {
    logger.debug('[BeginnerMode.bindGroupCollapseEvents] 开始绑定分组折叠事件');

    const groupHeaders = this.container.querySelectorAll('.paws-puffs-ve-group-header');

    groupHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const group = header.closest('.paws-puffs-ve-property-group');
        if (!group) return;

        const body = group.querySelector('.paws-puffs-ve-group-body');
        const toggleIcon = header.querySelector('.paws-puffs-ve-group-toggle');
        const groupName = header.querySelector('.paws-puffs-ve-group-name')?.textContent || '未知';

        // 切换展开/折叠
        const isExpanded = group.classList.contains('expanded');

        if (isExpanded) {
          // 折叠
          group.classList.remove('expanded');
          group.classList.add('collapsed');
          if (body) /** @type {HTMLElement} */ (body).style.display = 'none';
          if (toggleIcon) {
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-right');
          }
          logger.debug('[BeginnerMode.bindGroupCollapseEvents] 折叠分组:', groupName);
        } else {
          // 展开
          group.classList.remove('collapsed');
          group.classList.add('expanded');
          if (body) /** @type {HTMLElement} */ (body).style.display = 'block';
          if (toggleIcon) {
            toggleIcon.classList.remove('fa-chevron-right');
            toggleIcon.classList.add('fa-chevron-down');
          }
          logger.debug('[BeginnerMode.bindGroupCollapseEvents] 展开分组:', groupName);
        }
      });

      // 添加鼠标悬停效果
      const htmlHeader = /** @type {HTMLElement} */ (header);
      htmlHeader.addEventListener('mouseenter', () => {
        htmlHeader.style.background = 'color-mix(in srgb, var(--SmartThemeQuoteColor) 5%, transparent)';
      });
      htmlHeader.addEventListener('mouseleave', () => {
        htmlHeader.style.background = '';
      });
    });

    logger.info('[BeginnerMode.bindGroupCollapseEvents] ✅ 分组折叠绑定完成，数量:', groupHeaders.length);
  }
}

