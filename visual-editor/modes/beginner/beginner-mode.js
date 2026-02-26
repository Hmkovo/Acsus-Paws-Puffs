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
 * 架构（2026-02-24 重构后）：
 * - 控件路线：控件 onChange → updateControlsCSS() → buildControlsCSS() → 注入DOM
 * - 插件输入框路线：由 visual-editor.js 独立管理，与控件完全无关
 * - 两条路互不干扰，各自注入独立的 <style> 标签
 * 
 * 工作流程：
 * 1. 用户点击元素 → 查询推荐场景
 * 2. 加载场景配置 → 渲染控件
 * 3. 用户修改控件 → onChange → updateControlsCSS()
 * 4. updateControlsCSS() 更新内存数据 → buildControlsCSS() 生成英文CSS
 * 5. 调用 injectCSSCallback 注入 <style id="paws-puffs-controls-style">
 */
// [REFACTOR] 2026-02-24: 控件与输入框分离架构
// - 旧架构：控件 → 中文CSS → #customCSS → 编译 → 注入
// - 新架构：控件 → 英文CSS → 直接注入 <style id="paws-puffs-controls-style">

// [IMPORT] 导入元素和场景
import { getAllElements, getSelector } from '../../st-element-map.js';
import { getRecommendedScene, getOptionalScenes } from '../../scenes/scene-element-mapping.js';
import { getSceneConfig } from '../../scenes/scene-presets.js';
import { getPropertyInfo } from '../../css-property-dict.js';

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

    // 控件数据内存缓存（新架构）
    // 结构：{ 元素名: { css属性: 控件返回值 } }
    // 控件返回值可以是字符串（如 '0 4px 8px rgba(0,0,0,0.5)'）或对象（如 { position: 'absolute', top: '10px' }）
    this.controlsData = {};
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

    // 渲染内容区域 - 三级下拉框模式
    this.container.innerHTML = `
      <div class="paws-puffs-ve-elements-layout">
        <!-- 顶部：三级下拉框横向排列 -->
        <div class="paws-puffs-ve-select-bar">
          <!-- 一级分类下拉框（9大分类） -->
          <select class="paws-puffs-ve-select paws-puffs-ve-category-select" id="paws-puffs-ve-category-select">
            <option value="">请选择分类</option>
          </select>
          
          <!-- 二级分类下拉框 -->
          <select class="paws-puffs-ve-select paws-puffs-ve-subcategory-select" 
                  id="paws-puffs-ve-subcategory-select"
                  disabled>
            <option value="">请先选择分类</option>
          </select>
          
          <!-- 三级元素下拉框 -->
          <select class="paws-puffs-ve-select paws-puffs-ve-element-select" 
                  id="paws-puffs-ve-element-select"
                  disabled>
            <option value="">请先选择子分类</option>
          </select>
        </div>
        
        <!-- 属性面板（全宽） -->
        <div class="paws-puffs-ve-properties-panel">
          <div class="paws-puffs-ve-properties-empty" style="padding: 20px; text-align: center; opacity: 0.7;">
            <i class="fa fa-hand-point-up" style="font-size: 2em; margin-bottom: 10px;"></i>
            <p>请从上方下拉框选择元素</p>
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
   * 初始化三级下拉框
   * 
   * @description
   * 填充一级分类到第一个下拉框
   */
  initFilterSelects() {
    const categorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-category-select'));
    if (!categorySelect) return;

    const elementMap = getAllElements();
    const categoryNames = Object.keys(elementMap);

    // 填充9大分类选项
    categoryNames.forEach(categoryName => {
      const option = document.createElement('option');
      option.value = categoryName;
      option.textContent = categoryName;
      categorySelect.appendChild(option);
    });

    logger.debug('[BeginnerMode.initFilterSelects] 三级下拉框已初始化');
  }

  /**
   * 绑定事件
   * 
   * @description
   * 绑定三个下拉框的联动事件
   */
  bindEvents() {
    if (!this.container) return;

    logger.debug('[BeginnerMode.bindEvents] 绑定三级下拉框事件');

    // 绑定一级分类下拉框
    this.bindCategorySelect();

    // 绑定二级分类下拉框
    this.bindSubCategorySelect();

    // 绑定三级元素下拉框
    this.bindElementSelect();

    logger.debug('[BeginnerMode.bindEvents] 事件绑定完成');
  }

  /**
   * 绑定一级分类下拉框事件
   */
  bindCategorySelect() {
    const categorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-category-select'));
    const subCategorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-subcategory-select'));
    const elementSelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-element-select'));
    
    if (!categorySelect || !subCategorySelect || !elementSelect) return;

    categorySelect.addEventListener('change', () => {
      const selectedCategory = categorySelect.value;
      logger.debug('[BeginnerMode] 选中一级分类:', selectedCategory);

      // 更新当前分类
      this.currentCategory = selectedCategory || null;
      this.currentSubCategory = null;
      this.currentElement = null;

      // 重置后续下拉框
      if (!selectedCategory) {
        subCategorySelect.disabled = true;
        subCategorySelect.innerHTML = '<option value="">请先选择分类</option>';
        elementSelect.disabled = true;
        elementSelect.innerHTML = '<option value="">请先选择子分类</option>';
        return;
      }

      // 填充二级分类
      const elementMap = getAllElements();
      const categoryContent = elementMap[selectedCategory];
      const subCategories = this.getSubCategories(categoryContent);

      if (subCategories.length > 0) {
        // 有二级分类
        subCategorySelect.disabled = false;
        subCategorySelect.innerHTML = '<option value="">请选择子分类</option>';
        subCategories.forEach(subCat => {
          const option = document.createElement('option');
          option.value = subCat;
          option.textContent = subCat;
          subCategorySelect.appendChild(option);
        });
        // 禁用三级下拉框，等待用户选择二级分类
        elementSelect.disabled = true;
        elementSelect.innerHTML = '<option value="">请先选择子分类</option>';
      } else {
        // 没有二级分类，直接填充元素到三级下拉框
        subCategorySelect.disabled = true;
        subCategorySelect.innerHTML = '<option value="">无子分类</option>';
        this.fillElementSelect(categoryContent);
      }
    });
  }


  /**
   * 绑定二级分类下拉框事件
   */
  bindSubCategorySelect() {
    const subCategorySelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-subcategory-select'));
    const elementSelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-element-select'));
    
    if (!subCategorySelect || !elementSelect) return;

    subCategorySelect.addEventListener('change', () => {
      const selectedSubCategory = subCategorySelect.value;
      logger.debug('[BeginnerMode] 选中二级分类:', selectedSubCategory);

      // 更新当前子分类
      this.currentSubCategory = selectedSubCategory || null;
      this.currentElement = null;

      if (!selectedSubCategory) {
        elementSelect.disabled = true;
        elementSelect.innerHTML = '<option value="">请先选择子分类</option>';
        return;
      }

      // 填充三级元素
      const elementMap = getAllElements();
      const categoryContent = elementMap[this.currentCategory];
      const subCategoryContent = categoryContent[selectedSubCategory];
      this.fillElementSelect(subCategoryContent);
    });
  }

  /**
   * 绑定三级元素下拉框事件
   */
  bindElementSelect() {
    const elementSelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-element-select'));
    if (!elementSelect) return;

    elementSelect.addEventListener('change', () => {
      const selectedElement = elementSelect.value;
      logger.debug('[BeginnerMode] 选中元素:', selectedElement);

      if (!selectedElement) {
        this.hidePropertiesPanel();
        return;
      }

      // 选中元素，加载属性面板
      this.loadElementScene(selectedElement);
    });
  }

  /**
   * 隐藏属性面板，显示空状态
   */
  hidePropertiesPanel() {
    const emptyState = /** @type {HTMLElement} */ (this.container.querySelector('.paws-puffs-ve-properties-empty'));
    const contentArea = /** @type {HTMLElement} */ (this.container.querySelector('.paws-puffs-ve-properties-content'));

    if (emptyState) emptyState.style.display = 'block';
    if (contentArea) contentArea.style.display = 'none';
  }

  /**
   * 加载元素场景并渲染属性面板
   * 
   * @param {string} elementName - 元素名称
   */
  loadElementScene(elementName) {
    // 保存当前选中的元素
    this.selectedElement = elementName;
    this.currentElement = elementName;

    // 1. 查询推荐场景
    const sceneName = getRecommendedScene(elementName);
    if (!sceneName) {
      logger.warn('[BeginnerMode.loadElementScene] 未找到推荐场景，元素:', elementName);
      toastr.warning(`元素"${elementName}"暂无可用场景`);
      this.showEmptyState('该元素暂无可用场景');
      return;
    }
    logger.debug('[BeginnerMode.loadElementScene] 推荐场景:', sceneName);

    // 2. 加载场景配置
    const sceneConfig = getSceneConfig(sceneName);
    if (!sceneConfig) {
      logger.error('[BeginnerMode.loadElementScene] 场景配置不存在:', sceneName);
      toastr.error('场景配置加载失败');
      this.showEmptyState('场景配置加载失败');
      return;
    }
    logger.debug('[BeginnerMode.loadElementScene] 场景配置加载成功:', sceneConfig.名称);

    // 3. 提取当前样式
    const currentValues = this.getCurrentStyles(elementName);
    logger.debug('[BeginnerMode.loadElementScene] 当前样式:', currentValues);

    // 4. 显示属性面板容器
    const emptyState = /** @type {HTMLElement} */ (this.container.querySelector('.paws-puffs-ve-properties-empty'));
    const contentArea = /** @type {HTMLElement} */ (this.container.querySelector('.paws-puffs-ve-properties-content'));
    if (emptyState) emptyState.style.display = 'none';
    if (contentArea) contentArea.style.display = 'block';

    // 5. 渲染场景编辑器
    this.renderSceneEditor(elementName, sceneConfig, currentValues);
  }

  /**
   * 填充三级元素下拉框
   * 
   * @param {Object} content - 分类或子分类的内容对象
   */
  fillElementSelect(content) {
    const elementSelect = /** @type {HTMLSelectElement} */ (this.container.querySelector('#paws-puffs-ve-element-select'));
    if (!elementSelect) return;

    const elementNames = [];

    // 提取所有元素名（跳过对象类型的子分类）
    for (const [key, value] of Object.entries(content)) {
      if (typeof value === 'string') {
        // 直接是CSS选择器
        elementNames.push(key);
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // 跳过子分类，不添加到元素列表
      }
    }

    if (elementNames.length === 0) {
      elementSelect.disabled = true;
      elementSelect.innerHTML = '<option value="">此分类无可编辑元素</option>';
      return;
    }

    // 填充元素选项
    elementSelect.disabled = false;
    elementSelect.innerHTML = '<option value="">请选择元素</option>';
    elementNames.forEach(elementName => {
      const option = document.createElement('option');
      option.value = elementName;
      option.textContent = elementName;
      elementSelect.appendChild(option);
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




  // ❌ renderPropertiesPanel() 已删除（2026-02-24）
  // 原因：硬编码了中文CSS，是旧架构残留代码，已被 renderSceneEditor() + 新架构完全取代
  // ❌ bindPropertyControls() 已删除（2025-10-11）
  // 原因：硬编码的控件事件绑定，已被 bindControlEvents() 取代

  /**
   * 更新控件CSS（新架构）
   * 
   * @description
   * 控件改变时的处理入口：
   * 1. 更新内存缓存 controlsData
   * 2. 调用 buildControlsCSS() 生成英文CSS字符串
   * 3. 通过 compileCallback 把 CSS字符串交给 visual-editor.js 注入DOM
   * 
   * @param {string} elementName - 元素名称（如"用户消息气泡"）
   * @param {string} cssProperty - 主属性名（如'box-shadow'）
   * @param {string|Object|null} controlValue - 控件返回值：
   *   - 字符串：'0 4px 8px rgba(0,0,0,0.5)'
   *   - 对象：{ position: 'absolute', top: '10px' }
   *   - null/空字符串：表示删除该属性
   */
  updateControlsCSS(elementName, cssProperty, controlValue) {
    logger.debug('[BeginnerMode.updateControlsCSS] 开始更新:', { elementName, cssProperty, controlValue });

    // 1. 确保元素的属性对象存在
    if (!this.controlsData[elementName]) {
      this.controlsData[elementName] = {};
    }

    // 2. 存入内存（空值则删除）
    if (controlValue === null || controlValue === '' || controlValue === undefined) {
      delete this.controlsData[elementName][cssProperty];
      logger.debug('[BeginnerMode.updateControlsCSS] 删除属性:', cssProperty);
    } else {
      this.controlsData[elementName][cssProperty] = controlValue;
      logger.debug('[BeginnerMode.updateControlsCSS] 存入属性:', cssProperty, '=', controlValue);
    }

    // 3. 生成完整的英文CSS字符串
    const cssString = this.buildControlsCSS();
    logger.debug('[BeginnerMode.updateControlsCSS] 生成CSS长度:', cssString.length);

    // 4. 通过回调注入DOM
    if (this.compileCallback) {
      this.compileCallback(cssString);
      logger.info('[BeginnerMode.updateControlsCSS] ✅ CSS已通过回调注入');
    } else {
      logger.warn('[BeginnerMode.updateControlsCSS] 回调未设置，无法注入CSS');
    }
  }

  /**
   * 从 controlsData 生成完整英文CSS字符串
   * 
   * @description
   * 遍历所有元素的控件数据，生成标准的CSS规则字符串。
   * 应对两种控件返回格式：
   * - 字符串：{ 'box-shadow': '0 4px 8px ...' } → box-shadow: 0 4px 8px ...;
   * - 对象：{ 'position': { position: 'absolute', top: '10px' } } → position: absolute; top: 10px;
   * 
   * @returns {string} 加容全元素的英文CSS字符串
   * 
   * @example
   * // 返回示例：
   * // #chat .mes[is_user="true"] {
   * //   box-shadow: 0 4px 8px rgba(0,0,0,0.5);
   * //   border-radius: 20px;
   * // }
   */
  buildControlsCSS() {
    let css = '';

    for (const [elementName, properties] of Object.entries(this.controlsData)) {
      // 获取元素对应的CSS选择器
      const selector = getSelector(elementName);
      if (!selector) {
        logger.warn('[BeginnerMode.buildControlsCSS] 元素无对应选择器:', elementName);
        continue;
      }

      // 收集这个元素的所有CSS声明
      let declarations = '';

      for (const [cssProperty, value] of Object.entries(properties)) {
        if (typeof value === 'string' && value) {
          // 字符串值：直接输出
          declarations += `  ${cssProperty}: ${value};
`;
        } else if (typeof value === 'object' && value !== null) {
          // 对象值：展开每个键值对
          for (const [prop, val] of Object.entries(value)) {
            if (val !== null && val !== undefined && val !== '') {
              declarations += `  ${prop}: ${val};
`;
            }
          }
        }
      }

      // 只有有声明才输出该选择器
      if (declarations) {
        css += `${selector} {
${declarations}}

`;
      }
    }

    logger.debug('[BeginnerMode.buildControlsCSS] 生成完成，共', Object.keys(this.controlsData).length, '个元素');
    return css;
  }

  /**
   * 重新应用当前控件数据（同步按钮功能）
   *
   * @description
   * 新架构下的同步按钮：将内存 controlsData 重新注入到DOM。
   * 常用于状态丢失后的恢复注入。
   */
  syncFromInput() {
    logger.debug('[BeginnerMode.syncFromInput] 重新应用控件数据');

    if (Object.keys(this.controlsData).length === 0) {
      toastr.info('当前还没有任何控件调整数据');
      return;
    }

    const cssString = this.buildControlsCSS();
    if (this.compileCallback) {
      this.compileCallback(cssString);
      toastr.success('已重新应用控件设计');
      logger.info('[BeginnerMode.syncFromInput] ✅ 重新应用完成');
    } else {
      toastr.warning('回调未设置，无法应用');
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
   * 获取当前元素的样式（新架构）
   * 
   * @description
   * 直接从内存缓存 controlsData 读取，并展开对象格式的控件值。
   * 新手模式初始化一个元素时，用返回值为控件设置初始值。
   * 
   * @param {string} elementName - 元素名称
   * @returns {Object} 样式对象（平展的 CSS属性名 → CSS值）
   * 
   * @example
   * // controlsData = { '用户消息气泡': { 'box-shadow': '0 4px 8px rgba(0,0,0,0.5)', 'position': { position: 'absolute', top: '10px' } } }
   * getCurrentStyles('用户消息气泡')
   * // 返回：{ 'box-shadow': '0 4px 8px rgba(0,0,0,0.5)', position: 'absolute', top: '10px' }
   */
  getCurrentStyles(elementName) {
    logger.debug('[BeginnerMode.getCurrentStyles] 从内存读取样式，元素:', elementName);

    const elementData = this.controlsData[elementName];
    if (!elementData || Object.keys(elementData).length === 0) {
      logger.debug('[BeginnerMode.getCurrentStyles] 元素无内存数据');
      return {};
    }

    // 展开对象格式的控件值（如 PositionControl 返回的 { position, top, left... }）
    const styles = {};
    for (const [cssProperty, value] of Object.entries(elementData)) {
      if (typeof value === 'string') {
        styles[cssProperty] = value;
      } else if (typeof value === 'object' && value !== null) {
        Object.assign(styles, value);
      }
    }

    logger.debug('[BeginnerMode.getCurrentStyles] 返回样式:', styles);
    return styles;
  }

  // ❌ translateChineseToProperty() 已删除（2026-02-24）
  // 原因：新架构下控件直接输出英文CSS，不需要中英文翻译

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
   * 5. 绑定控件onChange回调（直接输出英文CSS→注入DOM）
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
   * 遍历控件实例，绑定onChange回调，实现控件变化→直接输出英文CSS→注入DOM的流程
   */
  bindControlEvents() {
    logger.debug('[BeginnerMode.bindControlEvents] 开始绑定onChange回调');

    let boundCount = 0;

    for (const [cssProperty, controlInstance] of Object.entries(this.controlInstances)) {
      // 绑定onChange回调
      controlInstance.onChange = (value) => {
        logger.debug('[BeginnerMode.bindControlEvents] 控件触发onChange:', { cssProperty, value });
        this.updateControlsCSS(this.selectedElement, cssProperty, value);
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

