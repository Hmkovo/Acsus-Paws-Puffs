/**
 * @file 专家模式
 * @description 按CSS面板分类，适合懂CSS的用户
 * 
 * 核心理念：
 * - 按10个CSS面板分类显示所有属性
 * - 不需要场景，直接选择想改的CSS面板
 * - 复用相同的小控件（和新手模式一样的控件）
 * 
 * 与新手模式的区别：
 * - 新手：根据场景聚合属性（只显示相关的）
 * - 专家：按CSS面板分类显示所有属性（完整的）
 * - 共同点：都使用同一套小控件！改1个控件，两边都更新！
 * 
 * 工作流程：
 * 1. 用户点击元素"气泡外框"
 * 2. 显示10个CSS面板（手风琴）
 * 3. 用户展开"背景与颜色"面板
 * 4. 显示该面板的所有属性（background-color、background-image等）
 * 5. 用户修改控件 → 生成中文CSS → 调用编译器
 * 
 * 参考：
 * - 【文件结构方案】第1364-1473行：expert-mode.js详细说明
 * - 【文件结构方案】第1665-1673行：新手模式vs专家模式对比
 */

import { getAllElements } from '../../st-element-map.js';
import {
  cssPanels,
  getPropertiesByPanel,
  getPropertyInfo,
  translateProperty,
  translatePropertyToChinese
} from '../../css-property-dict.js';
import * as Controls from '../../controls/property-controls.js';
import {
  parseChineseCSS,
  generateChineseCSS,
  extractChineseCSS,
  mergeChineseCSS
} from '../../compiler.js';
import logger from '../../../logger.js';

export class ExpertMode {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.container = null          // DOM容器
   * - this.currentElement = null     // 当前选中的元素名
   * - this.activePanels = ['背景与颜色']  // 默认展开的面板
   * - this.controlInstances = {}     // 控件实例缓存
   * - this.syncState = null          // 共享公告板
   * - this.compileCallback = null    // 编译回调函数
   */
  constructor() {
    // TODO实现
  }

  /**
   * TODO: [P1] 初始化
   * 
   * @description
   * 初始化专家模式，渲染UI并绑定事件
   * 
   * @param {HTMLElement} container - DOM容器元素
   * @param {Function} compileCallback - 编译回调函数
   * @param {Object} syncState - 共享公告板
   * 
   * 逻辑：
   * 1. 保存参数到实例变量
   * 2. 调用 render() 渲染UI
   * 3. 调用 bindEvents() 绑定事件
   * 4. 记录初始化完成日志
   */
  async init(container, compileCallback, syncState) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染专家模式UI
   * 
   * @description
   * 渲染专家模式的主要UI结构
   * 
   * 输出：HTML注入到 this.container
   * 
   * 逻辑：
   * 1. 创建左右分栏布局（和新手模式类似）
   * 2. 左侧：调用 renderElementList() 渲染元素列表（复用新手模式的逻辑）
   * 3. 右侧：显示空状态（"请从左侧选择元素"）
   * 4. 注入到容器
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染元素列表
   * 
   * @description
   * 渲染左侧的元素列表（和新手模式相同）
   * 
   * 逻辑：
   * - 可以直接复用 BeginnerMode 的 renderElementList() 逻辑
   * - 或者提取为共享函数
   */
  renderElementList() {
    // TODO实现（可复用新手模式的逻辑）
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * @description
   * 绑定元素列表的点击事件
   * 
   * 逻辑：
   * 1. 为所有 .element-item 绑定点击事件
   * 2. 点击时调用 onElementClick(elementName)
   * 3. 为分类标题绑定折叠/展开事件
   */
  bindEvents() {
    // TODO实现
  }

  /**
   * TODO: [P1] 用户点击元素时
   * 
   * @description
   * 用户点击左侧元素列表时的处理逻辑
   * 
   * @param {string} elementName - 元素名称
   * 
   * 逻辑：
   * 1. 记录日志
   * 2. 保存当前元素到实例变量
   * 3. 调用 renderCSSPanels() 渲染10个CSS面板
   * 4. 高亮当前选中的元素项
   * 
   * 注意：专家模式不查询场景，直接显示所有CSS面板
   */
  onElementClick(elementName) {
    // TODO实现
    // logger.debug('[ExpertMode] 用户选中元素:', elementName);
    // this.currentElement = elementName;
    // this.renderCSSPanels();
  }

  /**
   * TODO: [P1] 渲染10个CSS面板
   * 
   * @description
   * 在右侧渲染10个CSS面板（手风琴布局）
   * 
   * 逻辑：
   * 1. 获取所有面板名称：Object.keys(cssPanels)
   * 2. 获取当前元素的样式：getCurrentStyles(this.currentElement)
   * 3. 遍历面板名称
   * 4. 为每个面板调用 renderPanel()
   * 5. 绑定面板展开/折叠事件
   * 6. 绑定控件事件
   * 
   * HTML结构：
   * <div class="expert-panels-container">
   *   <div class="css-panel">盒模型</div>
   *   <div class="css-panel active">背景与颜色</div>
   *   <div class="css-panel">边框与轮廓</div>
   *   ...
   * </div>
   * 
   * 参考：【文件结构方案】第1418-1439行
   */
  renderCSSPanels() {
    // TODO实现
    // const editorArea = this.container.querySelector('.css-panels-area');
    // const panelNames = Object.keys(cssPanels);
    // const currentValues = this.getCurrentStyles(this.currentElement);
    // 
    // const panelsHTML = panelNames.map(panelName => {
    //   const isActive = this.activePanels.includes(panelName);
    //   return this.renderPanel(panelName, currentValues, isActive);
    // }).join('');
    // 
    // editorArea.innerHTML = `
    //   <div class="expert-panels-container">
    //     ${panelsHTML}
    //   </div>
    // `;
    // 
    // this.bindPanelEvents();
    // this.bindControlEvents();
  }

  /**
   * TODO: [P1] 渲染单个CSS面板
   * 
   * @description
   * 渲染一个CSS面板（手风琴项）
   * 
   * @param {string} panelName - 面板名称
   * @param {Object} currentValues - 当前值对象
   * @param {boolean} isActive - 是否默认展开
   * @returns {string} HTML字符串
   * 
   * 逻辑：
   * 1. 获取面板的所有属性：getPropertiesByPanel(panelName)
   * 2. 渲染面板标题（名称 + 属性数量 + 展开/折叠图标）
   * 3. 渲染面板内容：
   *    - 遍历属性列表
   *    - 为每个属性调用 renderPropertyControl()
   * 4. 根据 isActive 设置初始状态
   * 5. 返回HTML字符串
   * 
   * HTML结构：
   * <div class="css-panel active" data-panel="背景与颜色">
   *   <div class="panel-header">
   *     <i class="fa fa-chevron-down"></i>
   *     <span>背景与颜色</span>
   *     <small>12个属性</small>
   *   </div>
   *   <div class="panel-body">
   *     <!-- 属性控件列表 -->
   *   </div>
   * </div>
   * 
   * 参考：【文件结构方案】第1418-1439行
   */
  renderPanel(panelName, currentValues, isActive) {
    // TODO实现
    // const properties = getPropertiesByPanel(panelName);
    // 
    // return `
    //   <div class="css-panel ${isActive ? 'active' : ''}" data-panel="${panelName}">
    //     <div class="panel-header">
    //       <i class="fa fa-chevron-${isActive ? 'down' : 'right'}"></i>
    //       <span>${panelName}</span>
    //       <small>${properties.length}个属性</small>
    //     </div>
    //     <div class="panel-body">
    //       ${properties.map(prop => this.renderPropertyControl(prop, currentValues[prop])).join('')}
    //     </div>
    //   </div>
    // `;
  }

  /**
   * TODO: [P1] 渲染单个属性控件
   * 
   * @description
   * 为单个CSS属性创建并渲染小控件
   * 
   * @param {string} cssProperty - CSS属性名
   * @param {*} currentValue - 当前值
   * @returns {string} HTML字符串
   * 
   * 逻辑：
   * - 和新手模式完全一样！
   * - 参考 BeginnerMode.renderPropertyControl()
   * 
   * 实现建议：
   * - 可以提取为共享工具函数
   * - 或者直接复制新手模式的代码（不带智能提示）
   */
  renderPropertyControl(cssProperty, currentValue) {
    // TODO实现（和新手模式一样的逻辑，但不显示智能提示）
    // const propInfo = getPropertyInfo(cssProperty);
    // const controlType = propInfo.控件类型;
    // 
    // const config = {
    //   defaultValue: currentValue,
    //   supportGradient: propInfo.支持渐变,
    //   supportMultiLayer: propInfo.支持多层,
    // };
    // 
    // const control = Controls.createControl(controlType, config);
    // this.controlInstances[cssProperty] = control;
    // 
    // return `
    //   <div class="property-item" data-property="${cssProperty}">
    //     <label class="property-label">
    //       ${propInfo.中文名}
    //       <span class="property-help" title="${propInfo.描述}">?</span>
    //     </label>
    //     ${control.render()}
    //   </div>
    // `;
  }

  /**
   * TODO: [P1] 获取当前元素的样式
   * 
   * @description
   * 从输入框提取当前元素的已有样式
   * 
   * @param {string} elementName - 元素名称
   * @returns {Object} 样式对象
   * 
   * 逻辑：
   * - 和新手模式完全一样！
   * - 参考 BeginnerMode.getCurrentStyles()
   * 
   * 实现建议：
   * - 可以提取为共享工具函数
   * - 或者直接复制新手模式的代码
   */
  getCurrentStyles(elementName) {
    // TODO实现（和新手模式一样的逻辑）
    // const input = document.querySelector('#customCSS');
    // const inputContent = input.value;
    // const chineseCSS = extractChineseCSS(inputContent);
    // const stylesMap = parseChineseCSS(chineseCSS);
    // 
    // const chineseStyles = stylesMap.get(elementName) || {};
    // const cssStyles = {};
    // 
    // for (const [中文属性, 值] of Object.entries(chineseStyles)) {
    //   const cssProperty = translateProperty(中文属性);
    //   if (cssProperty) {
    //     cssStyles[cssProperty] = 值;
    //   }
    // }
    // 
    // return cssStyles;
  }

  /**
   * TODO: [P1] 绑定面板展开/折叠事件
   * 
   * @description
   * 为所有面板标题绑定点击事件
   * 
   * 逻辑：
   * 1. 查找所有 .panel-header
   * 2. 绑定点击事件
   * 3. 点击时调用 togglePanel(panelName)
   */
  bindPanelEvents() {
    // TODO实现
    // const panelHeaders = this.container.querySelectorAll('.panel-header');
    // panelHeaders.forEach(header => {
    //   header.addEventListener('click', () => {
    //     const panelName = header.dataset.panel;
    //     this.togglePanel(panelName);
    //   });
    // });
  }

  /**
   * TODO: [P1] 绑定控件事件
   * 
   * @description
   * 为所有控件绑定change事件
   * 
   * 逻辑：
   * - 和新手模式完全一样！
   * - 参考 BeginnerMode.bindControlEvents()
   * 
   * 实现建议：
   * - 可以提取为共享工具函数
   * - 或者直接复制新手模式的代码
   */
  bindControlEvents() {
    // TODO实现（和新手模式一样的逻辑）
    // for (const [cssProperty, control] of Object.entries(this.controlInstances)) {
    //   const element = this.container.querySelector(`[data-property="${cssProperty}"]`);
    //   if (!element) continue;
    //   
    //   control.bindEvents(element);
    //   control.onChange = (value) => {
    //     this.onControlChange(cssProperty, value);
    //   };
    // }
  }

  /**
   * TODO: [P1] 控件变化时
   * 
   * @description
   * 控件值变化时的处理逻辑
   * 
   * @param {string} cssProperty - CSS属性名
   * @param {*} newValue - 新值
   * 
   * 逻辑：
   * - 和新手模式完全一样！
   * - 参考 BeginnerMode.onControlChange()
   * - 生成中文CSS → 写入输入框 → 调用编译器
   */
  onControlChange(cssProperty, newValue) {
    // TODO实现（和新手模式一样的逻辑）
  }

  /**
   * TODO: [P1] 展开/折叠面板
   * 
   * @description
   * 切换面板的展开/折叠状态
   * 
   * @param {string} panelName - 面板名称
   * 
   * 逻辑：
   * 1. 查找面板DOM元素：document.querySelector(`[data-panel="${panelName}"]`)
   * 2. 切换 .active 类
   * 3. 更新 this.activePanels 数组
   *    - 如果展开：添加到数组
   *    - 如果折叠：从数组移除
   * 4. 切换图标方向（fa-chevron-down/fa-chevron-right）
   * 5. 添加展开/折叠动画（max-height过渡）
   * 
   * 参考：【文件结构方案】第1423-1439行
   */
  togglePanel(panelName) {
    // TODO实现
    // const panel = this.container.querySelector(`[data-panel="${panelName}"]`);
    // if (!panel) return;
    // 
    // const isActive = panel.classList.contains('active');
    // 
    // if (isActive) {
    //   // 折叠
    //   panel.classList.remove('active');
    //   this.activePanels = this.activePanels.filter(p => p !== panelName);
    // } else {
    //   // 展开
    //   panel.classList.add('active');
    //   this.activePanels.push(panelName);
    // }
    // 
    // // 切换图标
    // const icon = panel.querySelector('.panel-header i');
    // icon.className = `fa fa-chevron-${isActive ? 'right' : 'down'}`;
  }

  /**
   * TODO: [P2] 展开所有面板
   * 
   * @description
   * 一键展开所有面板
   * 
   * 逻辑：
   * 1. 遍历所有面板
   * 2. 添加 .active 类
   * 3. 更新 this.activePanels = Object.keys(cssPanels)
   * 4. 切换所有图标为向下
   */
  expandAllPanels() {
    // TODO实现
    // const panels = this.container.querySelectorAll('.css-panel');
    // panels.forEach(panel => panel.classList.add('active'));
    // this.activePanels = Object.keys(cssPanels);
  }

  /**
   * TODO: [P2] 折叠所有面板
   * 
   * @description
   * 一键折叠所有面板
   * 
   * 逻辑：
   * 1. 遍历所有面板
   * 2. 移除 .active 类
   * 3. 清空 this.activePanels = []
   * 4. 切换所有图标为向右
   */
  collapseAllPanels() {
    // TODO实现
    // const panels = this.container.querySelectorAll('.css-panel');
    // panels.forEach(panel => panel.classList.remove('active'));
    // this.activePanels = [];
  }

  /**
   * TODO: [P2] 搜索属性
   * 
   * @description
   * 在所有面板中搜索CSS属性
   * 
   * @param {string} keyword - 搜索关键词
   * 
   * 逻辑：
   * 1. 遍历所有面板和属性
   * 2. 过滤属性列表（匹配中文名或CSS属性名）
   * 3. 自动展开包含匹配属性的面板
   * 4. 高亮匹配的属性项（添加 .highlighted 类）
   * 5. 隐藏不匹配的属性项（添加 .hidden 类）
   * 6. 如果搜索为空，显示所有属性
   * 
   * 实现建议：
   * - 防抖300ms（避免频繁搜索）
   * - 不区分大小写
   * - 支持中英文搜索
   */
  searchProperty(keyword) {
    // TODO实现
    // if (!keyword) {
    //   // 清空搜索，显示所有
    //   this.container.querySelectorAll('.property-item').forEach(item => {
    //     item.classList.remove('hidden', 'highlighted');
    //   });
    //   return;
    // }
    // 
    // const lowerKeyword = keyword.toLowerCase();
    // const matchedPanels = new Set();
    // 
    // // 遍历所有属性项
    // this.container.querySelectorAll('.property-item').forEach(item => {
    //   const property = item.dataset.property;
    //   const propInfo = getPropertyInfo(property);
    //   
    //   // 检查是否匹配
    //   const matchChinese = propInfo.中文名.includes(keyword);
    //   const matchEnglish = property.toLowerCase().includes(lowerKeyword);
    //   
    //   if (matchChinese || matchEnglish) {
    //     item.classList.remove('hidden');
    //     item.classList.add('highlighted');
    //     
    //     // 记录所属面板
    //     const panel = item.closest('.css-panel');
    //     matchedPanels.add(panel.dataset.panel);
    //   } else {
    //     item.classList.add('hidden');
    //     item.classList.remove('highlighted');
    //   }
    // });
    // 
    // // 展开包含匹配项的面板
    // matchedPanels.forEach(panelName => {
    //   if (!this.activePanels.includes(panelName)) {
    //     this.togglePanel(panelName);
    //   }
    // });
  }
}

