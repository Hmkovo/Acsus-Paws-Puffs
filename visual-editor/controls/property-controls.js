/**
 * @file 属性控件 - 22个小控件定义
 * @description 完整的、可复用的属性编辑控件（乐高积木）
 * 
 * 设计理念：
 * - 每个控件都是独立、完整、可复用的
 * - 新手模式和专家模式都使用这些控件
 * - 控件负责渲染UI、绑定事件、生成CSS值
 * 
 * 参考：
 * - 【文件结构方案】第702-900行：小控件设计标准
 * - 【控件表格】第13-818行：22个控件的详细定义
 */

import { getPropertyInfo } from '../css-property-dict.js';
import logger from '../../logger.js';

// ========================================
// 通用工具函数：折叠功能绑定
// ========================================

/**
 * 绑定折叠功能的通用函数
 * 
 * @param {HTMLElement} header - 标题元素（可点击的区域）
 * @param {string} targetId - 目标内容区域的ID
 * @param {HTMLElement} containerElement - 包含data-collapsed属性的父元素
 * @param {string} controlName - 控件名称（用于日志）
 * @param {Function} [onToggle] - 🆕 可选回调，折叠状态改变时触发，参数为isCollapsed（true=已折叠，false=已展开）
 * 
 * @description
 * 通用的折叠逻辑，可复用于所有控件
 * - 点击标题展开/折叠内容区域
 * - 自动切换图标（▼/▶）
 * - 阻止按钮点击触发折叠
 * - 🆕 支持状态回调（用于同步状态到数据层）
 * 
 * @example
 * ```javascript
 * const header = layerElement.querySelector('.layer-header.clickable');
 * bindCollapse(header, 'layer-controls-0', layerElement, 'ShadowControl', (isCollapsed) => {
 *   if (isCollapsed) {
 *     this.collapsedLayers.add(0);
 *   } else {
 *     this.collapsedLayers.delete(0);
 *   }
 * });
 * ```
 */
function bindCollapse(header, targetId, containerElement, controlName = '控件', onToggle) {
  if (!header) return;

  header.addEventListener('click', (e) => {
    // 阻止点击按钮时触发折叠
    const target = /** @type {HTMLElement} */ (e.target);
    if (target.closest('button')) return;

    const content = document.getElementById(targetId);
    if (!content) {
      logger.warn(`[${controlName}] 找不到目标内容区域:`, targetId);
      return;
    }

    const icon = header.querySelector('.toggle-icon');
    const isCollapsed = containerElement.dataset.collapsed === 'true';

    if (isCollapsed) {
      // 展开
      content.classList.remove('collapsed');
      content.classList.add('expanded');
      icon?.classList.remove('fa-chevron-right');
      icon?.classList.add('fa-chevron-down');
      containerElement.dataset.collapsed = 'false';
      logger.debug(`[${controlName}] 展开`);

      // 🆕 通知外部：已展开
      if (onToggle) onToggle(false);
    } else {
      // 折叠
      content.classList.remove('expanded');
      content.classList.add('collapsed');
      icon?.classList.remove('fa-chevron-down');
      icon?.classList.add('fa-chevron-right');
      containerElement.dataset.collapsed = 'true';
      logger.debug(`[${controlName}] 折叠`);

      // 🆕 通知外部：已折叠
      if (onToggle) onToggle(true);
    }
  });
}

// ========================================
// 通用零件：拉条组件（SliderWithInput）
// ========================================

/**
 * 通用拉条组件（内部零件，被其他控件调用）
 * 
 * @class SliderWithInput
 * @description
 * 拉条+输入框组合控件，支持单列和双列布局
 * 
 * 设计决策（用户2025-10-09确定）：
 * - 左右两列布局（节省空间）
 * - 拉条快速调整，输入框精确输入
 * - 输入框可以输入超范围值
 * - 复用官方.neo-range-slider样式
 * 
 * 参考：【讨论记录】第1296-1405行
 * 
 * @param {Object} config - 配置对象
 * @param {string} config.label - 标签文字（如"上偏移"）
 * @param {number} config.min - 最小值
 * @param {number} config.max - 最大值
 * @param {number|string} config.value - 当前值
 * @param {string} config.unit - 单位（如"px"、"°"、"%"）
 * @param {number} [config.step=1] - 步进值
 * @param {boolean} [config.showRangeLabels=true] - 是否显示范围标签
 */
class SliderWithInput {
  constructor(config = {}) {
    this.label = config.label || '';
    this.min = config.min !== undefined ? config.min : 0;
    this.max = config.max !== undefined ? config.max : 100;
    this.value = config.value !== undefined ? config.value : this.min;
    this.unit = config.unit || '';
    this.step = config.step || 1;
    this.showRangeLabels = config.showRangeLabels !== false;
    this.id = `slider-${Math.random().toString(36).substr(2, 9)}`;
    this.onChange = null; // 外部会设置这个回调
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   * 
   * 逻辑：
   * 1. 生成唯一ID（防止重复）
   * 2. 渲染label标签
   * 3. 渲染拉条（复用官方.neo-range-slider类名）
   * 4. 渲染输入框（显示值+单位）
   * 5. 可选：渲染范围标签（min、center、max）
   */
  render() {
    const numericValue = parseFloat(this.value) || 0;
    const centerValue = (this.min + this.max) / 2;

    return `
            <div class="ppc-slider-with-input" data-slider-id="${this.id}">
                <label for="${this.id}" class="slider-label">${this.label}</label>
                <div class="slider-input-group">
                    <input 
                        type="range" 
                        id="${this.id}"
                        class="neo-range-slider slider-range"
                        min="${this.min}" 
                        max="${this.max}" 
                        value="${numericValue}"
                        step="${this.step}"
                    >
                    <input 
                        type="text" 
                        class="value-input"
                        value="${numericValue}${this.unit}"
                        data-unit="${this.unit}"
                    >
                </div>
                ${this.showRangeLabels ? `
                <div class="range-labels">
                    <span class="min-label">${this.min}</span>
                    <span class="center-label">${centerValue}</span>
                    <span class="max-label">${this.max}</span>
                </div>
                ` : ''}
            </div>
        `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * 逻辑：
   * 1. 找到拉条和输入框元素
   * 2. 拉条input → 更新输入框，触发onChange
   * 3. 输入框input → 解析值，更新拉条（如果在范围内），触发onChange
   * 4. 输入框支持超范围值（拉条移到边界）
   */
  bindEvents(element) {
    const container = element.querySelector(`[data-slider-id="${this.id}"]`);
    if (!container) {
      logger.warn('[SliderWithInput.bindEvents] 容器未找到');
      return;
    }

    const slider = /** @type {HTMLInputElement} */ (
      container.querySelector('.slider-range')
    );
    const input = /** @type {HTMLInputElement} */ (
      container.querySelector('.value-input')
    );
    const unit = input.dataset.unit || '';

    // 拉条变化 → 更新输入框
    slider.addEventListener('input', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      const newValue = parseFloat(target.value);
      this.value = newValue;
      input.value = `${newValue}${unit}`;

      // 触发外部onChange回调
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    });

    // 输入框变化 → 更新拉条（如果在范围内）
    input.addEventListener('input', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      const rawValue = target.value;
      const numericValue = parseFloat(rawValue);

      // 解析成功才更新
      if (!isNaN(numericValue)) {
        this.value = numericValue;

        // 如果在范围内，更新拉条
        if (numericValue >= this.min && numericValue <= this.max) {
          slider.value = String(numericValue);
        } else {
          // 超范围时，拉条移到边界
          slider.value = String(
            numericValue < this.min ? this.min : this.max
          );
        }

        // 触发外部onChange回调
        if (this.onChange) {
          this.onChange(this.getValue());
        }
      }
    });

    // 输入框失焦时，确保格式正确（添加单位）
    input.addEventListener('blur', (e) => {
      const target = /** @type {HTMLInputElement} */ (e.target);
      const rawValue = target.value;
      const numericValue = parseFloat(rawValue);
      if (!isNaN(numericValue)) {
        target.value = `${numericValue}${unit}`;
      }
    });
  }

  /**
   * 获取当前值
   * 
   * @returns {number} 数字值（不带单位）
   * 
   * 注：其他控件会负责添加单位（如"20px"）
   */
  getValue() {
    return parseFloat(this.value) || 0;
  }

  /**
   * 设置新值
   * 
   * @param {number|string} newValue - 新值（可以带单位或不带单位）
   * 
   * 逻辑：
   * 1. 解析数字值
   * 2. 更新内部状态
   * 3. 更新DOM（如果已渲染）
   */
  setValue(newValue) {
    const numericValue = parseFloat(String(newValue));
    if (!isNaN(numericValue)) {
      this.value = numericValue;

      // 更新DOM（如果已渲染）
      const slider = /** @type {HTMLInputElement|null} */ (
        document.querySelector(`[data-slider-id="${this.id}"] .slider-range`)
      );
      const input = /** @type {HTMLInputElement|null} */ (
        document.querySelector(`[data-slider-id="${this.id}"] .value-input`)
      );

      if (slider) {
        slider.value = String(numericValue);
      }
      if (input) {
        input.value = `${numericValue}${this.unit}`;
      }
    }
  }
}

// ========================================
// 第1部分：基础控件（15个，第1-1200行）
// ========================================

/**
 * 控件1：颜色控件
 * 
 * @class ColorControl
 * @description
 * 完整的颜色编辑器，支持6种模式：
 * - 纯色模式：颜色选择器 + 透明度滑块
 * - 线性渐变：方向选择 + 多色点 + 每个色点的透明度
 * - 径向渐变：形状 + 中心位置 + 色点
 * - 锥形渐变：起始角度 + 色点
 * - 重复渐变：重复图案
 * - 多层背景：多个背景层叠加
 * 
 * 用户原话：
 * "调整颜色可以是一个小控件设计，不是单一的一个颜色，而是可以自己添加
 * 可以几种颜色混合在一起做成渐变色、或者上下左右颜色不一样"
 * 
 * 参考：【控件表格】第20-78行
 */
export class ColorControl {
  /**
   * TODO: [P0] 构造函数
   * 
   * 输入：config = { defaultValue, supportGradient }
   * 初始化：
   * - this.value = config.defaultValue || '#ffffff'
   * - this.mode = 'solid'  // solid | linear | radial | conic | repeating | multi
   * - this.supportGradient = config.supportGradient !== false
   * - this.gradientStops = []  // 渐变色点数组
   * - this.opacity = 100  // 透明度（0-100）
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染HTML
   * 
   * 输出：HTML字符串
   * 逻辑：
   * 1. 如果支持渐变，渲染模式选择下拉框
   * 2. 根据当前模式渲染对应UI
   *    - 纯色模式：renderSolidMode()
   *    - 线性渐变：renderLinearGradientMode()
   *    - 径向渐变：renderRadialGradientMode()
   *    - 等等
   * 3. 返回完整HTML
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染纯色模式UI
   * 
   * 输出：HTML字符串
   * 内容：
   * - 颜色选择器 <input type="color">
   * - 文本输入框（显示hex值）
   * - 透明度滑块 <input type="range">
   * - 透明度数值显示
   */
  renderSolidMode() {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染线性渐变模式UI
   * 
   * 输出：HTML字符串
   * 内容：
   * - 方向选择下拉框（从上到下、从左到右、45度角等）
   * - 色点列表（可添加、删除、拖动排序）
   * - 每个色点：颜色选择器 + 位置滑块 + 透明度
   * - 添加色点按钮
   */
  renderLinearGradientMode() {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染径向渐变模式UI
   * 
   * 输出：HTML字符串
   * 内容：
   * - 形状选择（圆形、椭圆）
   * - 中心位置（x、y坐标）
   * - 色点列表
   */
  renderRadialGradientMode() {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染锥形渐变模式UI
   * TODO: [P2] 渲染重复渐变模式UI
   * TODO: [P2] 渲染多层背景模式UI
   */

  /**
   * TODO: [P0] 绑定事件
   * 
   * 输入：element（DOM元素）
   * 逻辑：
   * 1. 绑定模式切换事件（下拉框change）
   * 2. 纯色模式事件：
   *    - 颜色选择器input → 更新文本框和预览
   *    - 透明度滑块input → 更新数值显示
   * 3. 渐变模式事件：
   *    - 添加色点按钮click → 添加新色点
   *    - 删除色点按钮click → 删除对应色点
   *    - 色点拖动 → 调整位置
   * 4. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   * 在 beginner-mode.js 中：
   * control.onChange = (value) => this.onControlChange(cssProperty, value)
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P0] 获取CSS值
   * 
   * 输出：CSS字符串
   * 逻辑：
   * - 纯色模式：返回 '#ff0000' 或 'rgba(255,0,0,0.5)'
   * - 线性渐变：返回 'linear-gradient(to bottom, #ff0000 0%, #0000ff 100%)'
   * - 径向渐变：返回 'radial-gradient(circle, #ff0000 0%, #0000ff 100%)'
   * - 锥形渐变：返回 'conic-gradient(from 0deg, #ff0000 0%, #0000ff 100%)'
   * - 多层背景：返回 'url(...), linear-gradient(...), #fff'
   * 
   * ⚠️ TODO: [MERGE-CONFLICT] background冲突处理
   * 注意：如果场景中同时使用ColorControl和BackgroundImageControl：
   * - ColorControl生成：background: linear-gradient(...)
   * - BackgroundImageControl生成：background-image: url(...)
   * - CSS规则：简写background会覆盖background-image
   * 解决方案：在beginner-mode.js合并时，background改为background-image
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P1] 从CSS值设置控件
   * 
   * 输入：cssValue（CSS字符串）
   * 逻辑：
   * 1. 检测值类型（hex、rgb、rgba、gradient等）
   * 2. 切换到对应模式
   * 3. 解析值并填充控件
   *    - hex值：设置颜色选择器
   *    - rgba值：提取RGB和透明度
   *    - gradient值：解析方向、色点、位置
   * 4. 重新渲染UI
   */
  setValue(cssValue) {
    // TODO实现
  }

  /**
   * TODO: [P1] 辅助方法：添加渐变色点
   */
  addGradientStop(color = '#ffffff', position = 50) {
    // TODO实现
  }

  /**
   * TODO: [P1] 辅助方法：删除渐变色点
   */
  removeGradientStop(index) {
    // TODO实现
  }

  /**
   * TODO: [P1] 辅助方法：hex转rgba
   */
  hexToRgba(hex, alpha) {
    // TODO实现
  }
}

/**
 * 控件2：阴影控件
 * 
 * @class ShadowControl
 * @description
 * 完整的阴影编辑器，支持：
 * - 外阴影/内阴影切换
 * - 多层阴影（可添加、删除）
 * - 每层独立调整：X偏移、Y偏移、模糊、扩散、颜色、透明度
 * 
 * 用户原话：
 * "调整阴影的话，就是内阴影、外阴影、阴影要几层可以自己点加号
 * 自主添加几层阴影、每层阴影都是扩散还是实心的，透明度多少"
 * 
 * 参考：【控件表格】第132-178行
 */
export class ShadowControl {
  /**
   * 构造函数
   * 
   * @param {Object} config - 配置对象
   * @param {string} [config.defaultValue='none'] - 默认CSS值
   * @param {number} [config.maxLayers=5] - 最大阴影层数
   */
  constructor(config = {}) {
    this.layers = []; // 阴影层数组，每层：{ x, y, blur, spread, color, opacity }
    this.shadowType = 'outer'; // outer | inner
    this.maxLayers = config.maxLayers || 5;
    this.onChange = null; // 外部设置的回调函数
    this.id = `shadow-control-${Math.random().toString(36).substr(2, 9)}`;
    this.collapsedLayers = new Set(); // 🆕 记录哪些层被折叠了（存储层索引）

    // 如果提供了默认值，解析它
    if (config.defaultValue && config.defaultValue !== 'none') {
      this.setValue(config.defaultValue);
    }
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   */
  render() {
    return `
            <div class="ppc-shadow-control" data-control-id="${this.id}">
                <!-- 外阴影/内阴影切换 -->
                <div class="shadow-type-toggle">
                    <label>阴影类型：</label>
                    <label class="shadow-type-option">
                        <input type="radio" name="shadow-type-${this.id}" value="outer" ${this.shadowType === 'outer' ? 'checked' : ''}>
                        <span>外阴影</span>
                    </label>
                    <label class="shadow-type-option">
                        <input type="radio" name="shadow-type-${this.id}" value="inner" ${this.shadowType === 'inner' ? 'checked' : ''}>
                        <span>内阴影</span>
                    </label>
                </div>

                <!-- 阴影层列表 -->
                <div class="shadow-layers">
                    ${this.layers.length === 0 ? '<div class="empty-state">暂无阴影层，点击下方"添加阴影层"按钮</div>' : ''}
                    ${this.layers.map((layer, index) => this.renderLayer(layer, index)).join('')}
                </div>

                <!-- 添加阴影层按钮 -->
                <button class="menu_button add-shadow-layer" ${this.layers.length >= this.maxLayers ? 'disabled' : ''}>
                    <i class="fa-solid fa-plus"></i> 添加阴影层 (${this.layers.length}/${this.maxLayers})
                </button>
            </div>
        `;
  }

  /**
   * 渲染单个阴影层
   * 
   * @param {Object} layer - 阴影层数据
   * @param {number} index - 层索引
   * @returns {string} HTML字符串
   * 
   * @description
   * 渲染可折叠的阴影层，包含：
   * - 可点击的标题行（点击展开/折叠）
   * - 折叠图标（▼/▶）
   * - 控件区域（可折叠，包含4个滑块和颜色选择器）
   * - 删除按钮（不触发折叠）
   * - 🆕 记忆折叠状态（添加/删除层时保持用户的折叠选择）
   */
  renderLayer(layer, index) {
    // 创建SliderWithInput实例
    const xOffsetSlider = new SliderWithInput({
      label: 'X偏移',
      min: -100,
      max: 100,
      value: layer.x,
      unit: 'px',
      step: 1
    });

    const yOffsetSlider = new SliderWithInput({
      label: 'Y偏移',
      min: -100,
      max: 100,
      value: layer.y,
      unit: 'px',
      step: 1
    });

    const blurSlider = new SliderWithInput({
      label: '模糊',
      min: 0,
      max: 50,
      value: layer.blur,
      unit: 'px',
      step: 1
    });

    const spreadSlider = new SliderWithInput({
      label: '扩散',
      min: -20,
      max: 20,
      value: layer.spread,
      unit: 'px',
      step: 1
    });

    // 🆕 读取这一层的折叠状态
    const isCollapsed = this.collapsedLayers.has(index);
    const collapsedAttr = isCollapsed ? 'true' : 'false';
    const contentClass = isCollapsed ? 'collapsed' : 'expanded';
    const iconClass = isCollapsed ? 'fa-chevron-right' : 'fa-chevron-down';

    return `
            <div class="shadow-layer" data-layer-index="${index}" data-collapsed="${collapsedAttr}">
                <div class="layer-header clickable" data-toggle-target="shadow-layer-controls-${this.id}-${index}">
                    <div class="header-left">
                        <i class="fa-solid ${iconClass} toggle-icon"></i>
                        <h4>阴影层 ${index + 1}</h4>
                    </div>
                    <button class="delete-layer" title="删除此层">
                        <i class="fa-solid fa-times"></i>
                    </button>
                </div>

                <!-- 可折叠内容 -->
                <div class="layer-controls collapsible-content ${contentClass}" id="shadow-layer-controls-${this.id}-${index}">
                    <!-- 左右两列：X偏移 + Y偏移 -->
                    <div class="two-column-slider-layout">
                        <div class="column">${xOffsetSlider.render()}</div>
                        <div class="column">${yOffsetSlider.render()}</div>
                    </div>

                    <!-- 左右两列：模糊 + 扩散 -->
                    <div class="two-column-slider-layout">
                        <div class="column">${blurSlider.render()}</div>
                        <div class="column">${spreadSlider.render()}</div>
                    </div>

                    <!-- 颜色与透明度 -->
                    <div class="color-opacity-row">
                        <div class="color-picker-group">
                            <label>颜色：</label>
                            <input type="color" class="shadow-color" value="${layer.color}">
                            <input type="text" class="shadow-color-text" value="${layer.color}">
                        </div>
                        <div class="opacity-group">
                            <label>透明度：</label>
                            <input type="range" class="shadow-opacity neo-range-slider" min="0" max="100" value="${layer.opacity}">
                            <span class="opacity-value">${layer.opacity}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * @description
   * 绑定所有交互事件，包括：
   * - 阴影层折叠/展开（使用通用bindCollapse函数）
   * - 外阴影/内阴影切换
   * - 添加/删除阴影层
   * - 滑块和颜色选择器
   */
  bindEvents(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (!container) {
      logger.warn('[ShadowControl.bindEvents] 容器未找到');
      return;
    }

    // 绑定外阴影/内阴影切换
    const typeRadios = container.querySelectorAll('[name^="shadow-type-"]');
    typeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        this.shadowType = target.value;
        this.triggerChange();
      });
    });

    // 绑定添加阴影层按钮
    const addButton = container.querySelector('.add-shadow-layer');
    if (addButton) {
      addButton.addEventListener('click', () => {
        this.addLayer();
        this.rerender(element);
      });
    }

    // 为每层绑定事件
    this.layers.forEach((layer, index) => {
      const layerElement = container.querySelector(`.shadow-layer[data-layer-index="${index}"]`);
      if (!layerElement) return;

      // 绑定折叠功能
      const header = /** @type {HTMLElement} */ (layerElement.querySelector('.layer-header.clickable'));
      if (header) {
        const targetId = `shadow-layer-controls-${this.id}-${index}`;
        // 🆕 传入onToggle回调，同步折叠状态到数据层
        bindCollapse(header, targetId, /** @type {HTMLElement} */(layerElement), 'ShadowControl', (isCollapsed) => {
          if (isCollapsed) {
            this.collapsedLayers.add(index);  // 记住这层被折叠了
            logger.debug(`[ShadowControl] 层${index}已折叠，当前折叠层:`, Array.from(this.collapsedLayers));
          } else {
            this.collapsedLayers.delete(index);  // 记住这层被展开了
            logger.debug(`[ShadowControl] 层${index}已展开，当前折叠层:`, Array.from(this.collapsedLayers));
          }
        });
      }

      // 绑定删除按钮
      const deleteButton = layerElement.querySelector('.delete-layer');
      if (deleteButton) {
        deleteButton.addEventListener('click', () => {
          this.removeLayer(index);
          this.rerender(element);
        });
      }

      // 绑定SliderWithInput的事件
      const sliders = layerElement.querySelectorAll('.ppc-slider-with-input');
      sliders.forEach((sliderElement, sliderIndex) => {
        const sliderRange = /** @type {HTMLInputElement} */ (
          sliderElement.querySelector('.slider-range')
        );
        const valueInput = /** @type {HTMLInputElement} */ (
          sliderElement.querySelector('.value-input')
        );

        const updateValue = () => {
          const value = parseFloat(sliderRange.value);
          // 根据sliderIndex更新对应属性：0=x, 1=y, 2=blur, 3=spread
          if (sliderIndex === 0) layer.x = value;
          else if (sliderIndex === 1) layer.y = value;
          else if (sliderIndex === 2) layer.blur = value;
          else if (sliderIndex === 3) layer.spread = value;
          this.triggerChange();
        };

        sliderRange.addEventListener('input', updateValue);
        valueInput.addEventListener('input', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          const numValue = parseFloat(target.value);
          if (!isNaN(numValue)) {
            sliderRange.value = String(Math.max(parseFloat(sliderRange.min), Math.min(parseFloat(sliderRange.max), numValue)));
            updateValue();
          }
        });
      });

      // 绑定颜色选择器
      const colorPicker = /** @type {HTMLInputElement} */ (
        layerElement.querySelector('.shadow-color')
      );
      const colorText = /** @type {HTMLInputElement} */ (
        layerElement.querySelector('.shadow-color-text')
      );
      if (colorPicker && colorText) {
        colorPicker.addEventListener('input', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          layer.color = target.value;
          colorText.value = target.value;
          this.triggerChange();
        });
        colorText.addEventListener('input', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          const value = target.value;
          if (/^#[0-9A-F]{6}$/i.test(value)) {
            layer.color = value;
            colorPicker.value = value;
            this.triggerChange();
          }
        });
      }

      // 绑定透明度滑块
      const opacitySlider = layerElement.querySelector('.shadow-opacity');
      const opacityValue = layerElement.querySelector('.opacity-value');
      if (opacitySlider && opacityValue) {
        opacitySlider.addEventListener('input', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          layer.opacity = parseFloat(target.value);
          opacityValue.textContent = `${layer.opacity}%`;
          this.triggerChange();
        });
      }
    });
  }

  /**
   * 获取CSS值
   * 
   * @returns {string} CSS box-shadow/text-shadow 值
   * 
   * 返回示例：
   * - 无阴影：'none'
   * - 单层外阴影：'0 4px 8px 0 rgba(0,0,0,0.50)'
   * - 单层内阴影：'inset 0 2px 4px 0 rgba(255,255,255,0.30)'
   * - 多层阴影：'0 4px 8px 0 rgba(0,0,0,0.50), inset 0 2px 4px 0 rgba(255,255,255,0.30)'
   */
  getValue() {
    if (this.layers.length === 0) return 'none';

    return this.layers.map((layer) => {
      const prefix = this.shadowType === 'inner' ? 'inset ' : '';
      const r = parseInt(layer.color.substring(1, 3), 16);
      const g = parseInt(layer.color.substring(3, 5), 16);
      const b = parseInt(layer.color.substring(5, 7), 16);
      const a = (layer.opacity / 100).toFixed(2);
      return `${prefix}${layer.x}px ${layer.y}px ${layer.blur}px ${layer.spread}px rgba(${r},${g},${b},${a})`;
    }).join(', ');
  }

  /**
   * 从CSS值设置控件
   * 
   * @param {string} cssValue - CSS字符串
   */
  setValue(cssValue) {
    if (!cssValue || cssValue === 'none') {
      this.layers = [];
      return;
    }

    // 简单解析（仅支持基本格式）
    // 完整解析需要更复杂的逻辑，P1阶段实现
    this.layers = [];
    logger.debug('[ShadowControl.setValue] 解析CSS值（P1功能）:', cssValue);
  }

  /**
   * 添加阴影层
   */
  addLayer() {
    if (this.layers.length >= this.maxLayers) {
      logger.warn('[ShadowControl.addLayer] 已达到最大层数');
      return;
    }

    this.layers.push({
      x: 0,
      y: 4,
      blur: 8,
      spread: 0,
      color: '#000000',
      opacity: 50
    });

    logger.debug('[ShadowControl.addLayer] 已添加阴影层，当前层数:', this.layers.length);
    this.triggerChange();
  }

  /**
   * 删除阴影层
   * 
   * @param {number} index - 层索引
   * 
   * @description
   * 删除指定索引的阴影层，并更新折叠状态的索引
   * 例如：删除第1层后，原来的第2层变成第1层，折叠状态的索引也要-1
   */
  removeLayer(index) {
    if (index >= 0 && index < this.layers.length) {
      this.layers.splice(index, 1);

      // 🆕 更新折叠状态的索引
      const newCollapsed = new Set();
      for (const i of this.collapsedLayers) {
        if (i < index) {
          // 前面的层索引不变
          newCollapsed.add(i);
        } else if (i > index) {
          // 后面的层索引-1（因为删除了一层）
          newCollapsed.add(i - 1);
        }
        // i === index 的层被删除，不加入新Set
      }
      this.collapsedLayers = newCollapsed;

      logger.debug('[ShadowControl.removeLayer] 已删除阴影层，当前层数:', this.layers.length, '，折叠层:', Array.from(this.collapsedLayers));
      this.triggerChange();
    }
  }

  /**
   * 触发onChange回调
   */
  triggerChange() {
    if (this.onChange) {
      this.onChange(this.getValue());
    }
  }

  /**
   * 重新渲染控件
   * 
   * @param {HTMLElement} element - 父容器元素
   */
  rerender(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents(element);
    }
  }
}

/**
 * 控件3：边框控件
 * 
 * @class BorderControl
 * @description
 * 完整的边框编辑器，支持：
 * - 边框样式（10种CSS标准样式）
 * - 边框宽度（统一或四边分别设置）
 * - 边框颜色（纯色）
 * 
 * 参考：【控件表格】第181-215行
 */
export class BorderControl {
  /**
   * 构造函数
   * 
   * @param {Object} config - 配置对象
   * @param {string} [config.defaultValue=''] - 默认CSS值
   */
  constructor(config = {}) {
    this.unified = true; // 是否统一设置四边
    this.style = 'solid'; // 边框样式
    this.width = 1; // 统一宽度
    this.color = '#000000'; // 边框颜色

    // 四边独立宽度
    this.widths = {
      top: 1,
      right: 1,
      bottom: 1,
      left: 1
    };

    this.onChange = null;
    this.id = `border-control-${Math.random().toString(36).substr(2, 9)}`;

    if (config.defaultValue) {
      this.setValue(config.defaultValue);
    }
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   */
  render() {
    const styles = [
      { value: 'solid', label: '实线 (solid)' },
      { value: 'dashed', label: '虚线 (dashed)' },
      { value: 'dotted', label: '点状 (dotted)' },
      { value: 'double', label: '双线 (double)' },
      { value: 'groove', label: '3D沟槽 (groove)' },
      { value: 'ridge', label: '3D脊状 (ridge)' },
      { value: 'inset', label: '3D嵌入 (inset)' },
      { value: 'outset', label: '3D突出 (outset)' },
      { value: 'none', label: '无边框 (none)' },
      { value: 'hidden', label: '隐藏 (hidden)' }
    ];

    return `
            <div class="ppc-border-control" data-control-id="${this.id}">
                <!-- 边框样式选择 -->
                <div class="border-style-select">
                    <label>边框样式：</label>
                    <select class="border-style">
                        ${styles.map(s => `<option value="${s.value}" ${this.style === s.value ? 'selected' : ''}>${s.label}</option>`).join('')}
                    </select>
                </div>

                <!-- 统一/分别设置切换 -->
                <div class="unified-toggle">
                    <label>
                        <input type="checkbox" class="unified-checkbox" ${this.unified ? 'checked' : ''}>
                        <span>统一设置四边宽度</span>
                    </label>
                </div>

                <!-- 边框宽度 -->
                <div class="border-width-section">
                    ${this.unified ? this.renderUnifiedWidth() : this.renderSeparateWidths()}
                </div>

                <!-- 边框颜色 -->
                <div class="border-color-section">
                    <label>边框颜色：</label>
                    <input type="color" class="border-color" value="${this.color}">
                    <input type="text" class="border-color-text" value="${this.color}">
                </div>
            </div>
        `;
  }

  /**
   * 渲染统一宽度模式
   * 
   * @returns {string} HTML字符串
   */
  renderUnifiedWidth() {
    const widthSlider = new SliderWithInput({
      label: '边框宽度',
      min: 0,
      max: 20,
      value: this.width,
      unit: 'px',
      step: 0.5,
      showRangeLabels: true
    });

    return `
            <div class="unified-width">
                ${widthSlider.render()}
            </div>
        `;
  }

  /**
   * 渲染四边分别设置模式
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 渲染可折叠的四边分别设置区域，包含：
   * - 可点击的标题行（点击展开/折叠）
   * - 折叠图标（▼/▶）
   * - 控件区域（可折叠，包含4个滑块）
   */
  renderSeparateWidths() {
    const topSlider = new SliderWithInput({
      label: '上边框',
      min: 0,
      max: 20,
      value: this.widths.top,
      unit: 'px',
      step: 0.5
    });

    const bottomSlider = new SliderWithInput({
      label: '下边框',
      min: 0,
      max: 20,
      value: this.widths.bottom,
      unit: 'px',
      step: 0.5
    });

    const leftSlider = new SliderWithInput({
      label: '左边框',
      min: 0,
      max: 20,
      value: this.widths.left,
      unit: 'px',
      step: 0.5
    });

    const rightSlider = new SliderWithInput({
      label: '右边框',
      min: 0,
      max: 20,
      value: this.widths.right,
      unit: 'px',
      step: 0.5
    });

    return `
            <div class="separate-widths" data-collapsed="false">
                <!-- 可点击的标题行 -->
                <div class="section-header clickable" data-toggle-target="border-separate-controls-${this.id}">
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                    <span>四边分别设置</span>
                </div>
                
                <!-- 可折叠内容 -->
                <div class="separate-width-controls collapsible-content expanded" id="border-separate-controls-${this.id}">
                    <!-- 左右两列：上 + 下 -->
                    <div class="two-column-slider-layout">
                        <div class="column">${topSlider.render()}</div>
                        <div class="column">${bottomSlider.render()}</div>
                    </div>
                    
                    <!-- 左右两列：左 + 右 -->
                    <div class="two-column-slider-layout">
                        <div class="column">${leftSlider.render()}</div>
                        <div class="column">${rightSlider.render()}</div>
                    </div>
                </div>
            </div>
        `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * @description
   * 绑定所有交互事件，包括：
   * - 四边设置区折叠/展开（使用通用bindCollapse函数）
   * - 边框样式选择
   * - 统一/分别设置切换
   * - 宽度滑块和颜色选择器
   */
  bindEvents(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (!container) {
      logger.warn('[BorderControl.bindEvents] 容器未找到');
      return;
    }

    // 绑定样式选择
    const styleSelect = container.querySelector('.border-style');
    if (styleSelect) {
      styleSelect.addEventListener('change', (e) => {
        const target = /** @type {HTMLSelectElement} */ (e.target);
        this.style = target.value;
        this.triggerChange();
      });
    }

    // 绑定统一/分别切换
    const unifiedCheckbox = container.querySelector('.unified-checkbox');
    if (unifiedCheckbox) {
      unifiedCheckbox.addEventListener('change', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        this.unified = target.checked;
        this.rerender(element);
      });
    }

    // 绑定宽度拉条
    if (this.unified) {
      // 统一模式：绑定一个拉条
      const slider = container.querySelector('.ppc-slider-with-input');
      if (slider) {
        const sliderRange = /** @type {HTMLInputElement} */ (
          slider.querySelector('.slider-range')
        );
        const valueInput = /** @type {HTMLInputElement} */ (
          slider.querySelector('.value-input')
        );

        const updateValue = () => {
          this.width = parseFloat(sliderRange.value);
          this.triggerChange();
        };

        sliderRange.addEventListener('input', updateValue);
        valueInput.addEventListener('input', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          const numValue = parseFloat(target.value);
          if (!isNaN(numValue)) {
            sliderRange.value = String(Math.max(0, Math.min(20, numValue)));
            updateValue();
          }
        });
      }
    } else {
      // 四边分别设置：绑定折叠功能和4个拉条
      const separateWidths = container.querySelector('.separate-widths');
      if (separateWidths) {
        // 绑定折叠功能
        const header = /** @type {HTMLElement} */ (separateWidths.querySelector('.section-header.clickable'));
        if (header) {
          const targetId = `border-separate-controls-${this.id}`;
          bindCollapse(header, targetId, /** @type {HTMLElement} */(separateWidths), 'BorderControl');
        }
      }

      const sliders = container.querySelectorAll('.ppc-slider-with-input');
      const sides = ['top', 'bottom', 'left', 'right'];

      sliders.forEach((slider, index) => {
        const sliderRange = /** @type {HTMLInputElement} */ (
          slider.querySelector('.slider-range')
        );
        const valueInput = /** @type {HTMLInputElement} */ (
          slider.querySelector('.value-input')
        );
        const sideKey = sides[index];

        const updateValue = () => {
          this.widths[sideKey] = parseFloat(sliderRange.value);
          this.triggerChange();
        };

        sliderRange.addEventListener('input', updateValue);
        valueInput.addEventListener('input', (e) => {
          const target = /** @type {HTMLInputElement} */ (e.target);
          const numValue = parseFloat(target.value);
          if (!isNaN(numValue)) {
            sliderRange.value = String(Math.max(0, Math.min(20, numValue)));
            updateValue();
          }
        });
      });
    }

    // 绑定颜色选择器
    const colorPicker = /** @type {HTMLInputElement} */ (
      container.querySelector('.border-color')
    );
    const colorText = /** @type {HTMLInputElement} */ (
      container.querySelector('.border-color-text')
    );
    if (colorPicker && colorText) {
      colorPicker.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        this.color = target.value;
        colorText.value = target.value;
        this.triggerChange();
      });
      colorText.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const value = target.value;
        if (/^#[0-9A-F]{6}$/i.test(value)) {
          this.color = value;
          colorPicker.value = value;
          this.triggerChange();
        }
      });
    }
  }

  /**
   * 获取CSS值
   * 
   * @returns {string|Object} CSS border 值
   * 
   * 返回类型：
   * - 统一模式：返回字符串 '1px solid #000'
   * - 分别模式：返回对象 { 'border-top': '1px solid #000', ... }
   * - 无边框：返回 'none' 或 'hidden'
   */
  getValue() {
    if (this.style === 'none' || this.style === 'hidden') {
      return this.style;
    }

    if (this.unified) {
      return `${this.width}px ${this.style} ${this.color}`;
    } else {
      // 四边分别设置，返回对象（外部需要处理为多个CSS属性）
      return {
        'border-top': `${this.widths.top}px ${this.style} ${this.color}`,
        'border-right': `${this.widths.right}px ${this.style} ${this.color}`,
        'border-bottom': `${this.widths.bottom}px ${this.style} ${this.color}`,
        'border-left': `${this.widths.left}px ${this.style} ${this.color}`
      };
    }
  }

  /**
   * 从CSS值设置控件
   * 
   * @param {string} cssValue - CSS字符串
   */
  setValue(cssValue) {
    if (!cssValue) return;

    // 简单解析（P1功能）
    logger.debug('[BorderControl.setValue] 解析CSS值（P1功能）:', cssValue);
  }

  /**
   * 触发onChange回调
   */
  triggerChange() {
    if (this.onChange) {
      this.onChange(this.getValue());
    }
  }

  /**
   * 重新渲染控件
   * 
   * @param {HTMLElement} element - 父容器元素
   */
  rerender(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents(element);
    }
  }
}

/**
 * 控件4：圆角控件
 * 
 * @class BorderRadiusControl
 * @description
 * 完整的圆角编辑器，支持：
 * - 统一圆角（1个值）
 * - 四角单独（4个值：左上、右上、右下、左下）
 * - 椭圆角（2个值：水平半径 / 垂直半径）
 * 
 * 参考：【控件表格】第218-274行
 */
export class BorderRadiusControl {
  /**
   * 构造函数
   * 
   * @param {Object} config - 配置对象
   * @param {string} [config.defaultValue=''] - 默认CSS值
   */
  constructor(config = {}) {
    this.mode = 'unified'; // unified | separate | ellipse
    this.unified = 0; // 统一圆角值

    // 四角独立值
    this.corners = {
      topLeft: 0,
      topRight: 0,
      bottomRight: 0,
      bottomLeft: 0
    };

    // 椭圆角值
    this.ellipse = {
      horizontal: 0,
      vertical: 0
    };

    this.onChange = null;
    this.id = `border-radius-control-${Math.random().toString(36).substr(2, 9)}`;

    if (config.defaultValue) {
      this.setValue(config.defaultValue);
    }
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   */
  render() {
    return `
            <div class="ppc-border-radius-control" data-control-id="${this.id}">
                <!-- 模式选择 -->
                <div class="mode-select">
                    <label>圆角模式：</label>
                    <select class="radius-mode">
                        <option value="unified" ${this.mode === 'unified' ? 'selected' : ''}>统一圆角</option>
                        <option value="separate" ${this.mode === 'separate' ? 'selected' : ''}>四角单独</option>
                        <option value="ellipse" ${this.mode === 'ellipse' ? 'selected' : ''}>椭圆角</option>
                    </select>
                </div>

                <!-- 根据模式渲染不同控件 -->
                <div class="radius-controls">
                    ${this.renderModeControls()}
                </div>
            </div>
        `;
  }

  /**
   * 根据模式渲染控件
   * 
   * @returns {string} HTML字符串
   */
  renderModeControls() {
    if (this.mode === 'unified') {
      return this.renderUnifiedMode();
    } else if (this.mode === 'separate') {
      return this.renderSeparateMode();
    } else if (this.mode === 'ellipse') {
      return this.renderEllipseMode();
    }
    return '';
  }

  /**
   * 渲染统一圆角模式
   * 
   * @returns {string} HTML字符串
   */
  renderUnifiedMode() {
    const slider = new SliderWithInput({
      label: '圆角大小',
      min: 0,
      max: 100,
      value: this.unified,
      unit: 'px',
      step: 1
    });

    return `<div class="unified-mode">${slider.render()}</div>`;
  }

  /**
   * 渲染四角单独模式
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 渲染可折叠的四角单独设置区域，包含：
   * - 可点击的标题行（点击展开/折叠）
   * - 折叠图标（▼/▶）
   * - 控件区域（可折叠，包含4个滑块）
   */
  renderSeparateMode() {
    const topLeftSlider = new SliderWithInput({
      label: '左上圆角',
      min: 0,
      max: 100,
      value: this.corners.topLeft,
      unit: 'px',
      step: 1
    });

    const topRightSlider = new SliderWithInput({
      label: '右上圆角',
      min: 0,
      max: 100,
      value: this.corners.topRight,
      unit: 'px',
      step: 1
    });

    const bottomLeftSlider = new SliderWithInput({
      label: '左下圆角',
      min: 0,
      max: 100,
      value: this.corners.bottomLeft,
      unit: 'px',
      step: 1
    });

    const bottomRightSlider = new SliderWithInput({
      label: '右下圆角',
      min: 0,
      max: 100,
      value: this.corners.bottomRight,
      unit: 'px',
      step: 1
    });

    return `
            <div class="separate-mode" data-collapsed="false">
                <!-- 可点击的标题行 -->
                <div class="section-header clickable" data-toggle-target="radius-separate-controls-${this.id}">
                    <i class="fa-solid fa-chevron-down toggle-icon"></i>
                    <span>四角分别设置</span>
                </div>
                
                <!-- 可折叠内容 -->
                <div class="separate-corner-controls collapsible-content expanded" id="radius-separate-controls-${this.id}">
                    <!-- 左右两列：左上 + 右上 -->
                    <div class="two-column-slider-layout">
                        <div class="column">${topLeftSlider.render()}</div>
                        <div class="column">${topRightSlider.render()}</div>
                    </div>
                    
                    <!-- 左右两列：左下 + 右下 -->
                    <div class="two-column-slider-layout">
                        <div class="column">${bottomLeftSlider.render()}</div>
                        <div class="column">${bottomRightSlider.render()}</div>
                    </div>
                </div>
            </div>
        `;
  }

  /**
   * 渲染椭圆角模式
   * 
   * @returns {string} HTML字符串
   */
  renderEllipseMode() {
    const horizontalSlider = new SliderWithInput({
      label: '水平半径',
      min: 0,
      max: 100,
      value: this.ellipse.horizontal,
      unit: 'px',
      step: 1
    });

    const verticalSlider = new SliderWithInput({
      label: '垂直半径',
      min: 0,
      max: 100,
      value: this.ellipse.vertical,
      unit: 'px',
      step: 1
    });

    return `
            <div class="ellipse-mode">
                <!-- 左右两列：水平 + 垂直 -->
                <div class="two-column-slider-layout">
                    <div class="column">${horizontalSlider.render()}</div>
                    <div class="column">${verticalSlider.render()}</div>
                </div>
            </div>
        `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * @description
   * 绑定所有交互事件，包括：
   * - 四角单独模式的折叠/展开（使用通用bindCollapse函数）
   * - 圆角模式选择
   * - 各模式下的滑块事件
   */
  bindEvents(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (!container) {
      logger.warn('[BorderRadiusControl.bindEvents] 容器未找到');
      return;
    }

    // 绑定模式选择
    const modeSelect = container.querySelector('.radius-mode');
    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => {
        const target = /** @type {HTMLSelectElement} */ (e.target);
        this.mode = target.value;
        this.rerender(element);
      });
    }

    // 根据当前模式绑定对应的控件事件
    if (this.mode === 'unified') {
      this.bindUnifiedModeEvents(/** @type {HTMLElement} */(container));
    } else if (this.mode === 'separate') {
      this.bindSeparateModeEvents(/** @type {HTMLElement} */(container));
    } else if (this.mode === 'ellipse') {
      this.bindEllipseModeEvents(/** @type {HTMLElement} */(container));
    }
  }

  /**
   * 绑定统一模式事件
   * 
   * @param {HTMLElement} container - 容器元素
   */
  bindUnifiedModeEvents(container) {
    const slider = container.querySelector('.ppc-slider-with-input');
    if (slider) {
      const sliderRange = /** @type {HTMLInputElement} */ (
        slider.querySelector('.slider-range')
      );
      const valueInput = /** @type {HTMLInputElement} */ (
        slider.querySelector('.value-input')
      );

      const updateValue = () => {
        this.unified = parseFloat(sliderRange.value);
        this.triggerChange();
      };

      sliderRange.addEventListener('input', updateValue);
      valueInput.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const numValue = parseFloat(target.value);
        if (!isNaN(numValue)) {
          sliderRange.value = String(Math.max(0, Math.min(100, numValue)));
          updateValue();
        }
      });
    }
  }

  /**
   * 绑定四角单独模式事件
   * 
   * @param {HTMLElement} container - 容器元素
   * 
   * @description
   * 绑定四角单独模式的所有事件，包括：
   * - 折叠/展开功能（使用通用bindCollapse函数）
   * - 4个滑块的输入事件
   */
  bindSeparateModeEvents(container) {
    // 绑定折叠功能
    const separateMode = container.querySelector('.separate-mode');
    if (separateMode) {
      const header = /** @type {HTMLElement} */ (separateMode.querySelector('.section-header.clickable'));
      if (header) {
        const targetId = `radius-separate-controls-${this.id}`;
        bindCollapse(header, targetId, /** @type {HTMLElement} */(separateMode), 'BorderRadiusControl');
      }
    }

    const sliders = container.querySelectorAll('.ppc-slider-with-input');
    const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'];

    sliders.forEach((slider, index) => {
      const sliderRange = /** @type {HTMLInputElement} */ (
        slider.querySelector('.slider-range')
      );
      const valueInput = /** @type {HTMLInputElement} */ (
        slider.querySelector('.value-input')
      );
      const cornerKey = corners[index];

      const updateValue = () => {
        this.corners[cornerKey] = parseFloat(sliderRange.value);
        this.triggerChange();
      };

      sliderRange.addEventListener('input', updateValue);
      valueInput.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const numValue = parseFloat(target.value);
        if (!isNaN(numValue)) {
          sliderRange.value = String(Math.max(0, Math.min(100, numValue)));
          updateValue();
        }
      });
    });
  }

  /**
   * 绑定椭圆角模式事件
   * 
   * @param {HTMLElement} container - 容器元素
   */
  bindEllipseModeEvents(container) {
    const sliders = container.querySelectorAll('.ppc-slider-with-input');
    const axes = ['horizontal', 'vertical'];

    sliders.forEach((slider, index) => {
      const sliderRange = /** @type {HTMLInputElement} */ (
        slider.querySelector('.slider-range')
      );
      const valueInput = /** @type {HTMLInputElement} */ (
        slider.querySelector('.value-input')
      );
      const axisKey = axes[index];

      const updateValue = () => {
        this.ellipse[axisKey] = parseFloat(sliderRange.value);
        this.triggerChange();
      };

      sliderRange.addEventListener('input', updateValue);
      valueInput.addEventListener('input', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        const numValue = parseFloat(target.value);
        if (!isNaN(numValue)) {
          sliderRange.value = String(Math.max(0, Math.min(100, numValue)));
          updateValue();
        }
      });
    });
  }

  /**
   * 获取CSS值
   * 
   * @returns {string} CSS border-radius 值
   * 
   * 返回示例：
   * - 统一模式：'20px'
   * - 四角模式：'10px 20px 10px 20px'（左上 右上 右下 左下）
   * - 椭圆角：'35px / 25px'（水平半径 / 垂直半径）
   */
  getValue() {
    if (this.mode === 'unified') {
      return `${this.unified}px`;
    } else if (this.mode === 'separate') {
      // CSS border-radius 顺序：左上 右上 右下 左下
      return `${this.corners.topLeft}px ${this.corners.topRight}px ${this.corners.bottomRight}px ${this.corners.bottomLeft}px`;
    } else if (this.mode === 'ellipse') {
      // 椭圆角：水平半径 / 垂直半径
      return `${this.ellipse.horizontal}px / ${this.ellipse.vertical}px`;
    }
    return '0';
  }

  /**
   * 从CSS值设置控件
   * 
   * @param {string} cssValue - CSS字符串
   */
  setValue(cssValue) {
    if (!cssValue) return;

    // 简单解析（P1功能）
    logger.debug('[BorderRadiusControl.setValue] 解析CSS值（P1功能）:', cssValue);
  }

  /**
   * 触发onChange回调
   */
  triggerChange() {
    if (this.onChange) {
      this.onChange(this.getValue());
    }
  }

  /**
   * 重新渲染控件
   * 
   * @param {HTMLElement} element - 父容器元素
   */
  rerender(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (container) {
      container.outerHTML = this.render();
      this.bindEvents(element);
    }
  }
}

/**
 * 控件5：间距控件（padding/margin）
 * 
 * @class SpacingControl
 * @description
 * 间距编辑器，支持：
 * - 四边独立设置（上、右、下、左）
 * - 或者统一设置
 * - 用于 padding 和 margin
 * 
 * 参考：【控件表格】第177-206行
 */
export class SpacingControl {
  /**
   * TODO: [P0] 构造函数
   * 
   * 初始化：
   * - this.unified = true  // 是否统一设置四边
   * - this.spacing = { top: 0, right: 0, bottom: 0, left: 0 }
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染"统一设置/分别设置"切换开关
   * 2. 渲染盒模型可视化图示（可选）
   * 3. 渲染四边输入框（上、右、下、左）
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P0] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定统一/分别设置切换
   * 2. 绑定所有输入框的input事件
   * 3. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P0] 获取CSS值
   * 
   * 返回：'20px' 或 '10px 20px 10px 20px'（上右下左）
   * 
   * ⚠️ TODO: [MERGE-CONFLICT] padding/margin冲突处理
   * 注意：如果场景中同时使用SpacingControl和详细间距属性：
   * - SpacingControl生成：padding: 10px（简写，重置所有边）
   * - 用户可能想设置：padding-top: 20px（详细属性）
   * - CSS规则：简写会覆盖详细属性
   * 解决方案：在beginner-mode.js检测冲突，优先使用详细属性
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P1] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件6：尺寸控件（width/height）
 * 
 * @class SizeControl
 * @description
 * 完整的尺寸编辑器，支持：
 * - 基础尺寸（宽度、高度）左右两列拉条布局
 * - 限制尺寸（min/max）可选展开
 * - 单位选择（px、%、em、vw/vh、auto）
 * - 宽高比选项（aspect-ratio）
 * 
 * 设计决策：
 * - 复用 SliderWithInput 组件（左右两列布局）
 * - 基础尺寸范围：0px ~ 1000px
 * - auto 值不显示拉条（直接文本显示）
 * 
 * 参考：【控件表格】第309-358行
 * 
 * @param {Object} config - 配置对象
 * @param {string|number} config.width - 宽度值
 * @param {string|number} config.height - 高度值
 * @param {string} config.unit - 单位（px/%/em/vw/vh/auto）
 * 
 * @example
 * const sizeControl = new SizeControl({ width: 200, height: 150, unit: 'px' });
 * const html = sizeControl.render();
 * sizeControl.bindEvents(container);
 * sizeControl.onChange = (value) => console.log(value);
 */
export class SizeControl {
  constructor(config = {}) {
    // 基础尺寸
    this.width = config.width !== undefined ? config.width : 200;
    this.height = config.height !== undefined ? config.height : 150;
    this.unit = config.unit || 'px';

    // 限制尺寸
    this.showLimits = false;
    this.minWidth = config.minWidth || 'auto';
    this.maxWidth = config.maxWidth || 'auto';
    this.minHeight = config.minHeight || 'auto';
    this.maxHeight = config.maxHeight || 'auto';

    // 宽高比
    this.aspectRatio = config.aspectRatio || 'auto';

    this.id = `size-control-${Math.random().toString(36).substr(2, 9)}`;
    this.onChange = null;

    // 创建拉条组件实例（延迟到render时根据unit决定是否创建）
    this.widthSlider = null;
    this.heightSlider = null;
    this.minWidthSlider = null;
    this.maxWidthSlider = null;
    this.minHeightSlider = null;
    this.maxHeightSlider = null;
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   * 
   * 逻辑：
   * 1. 渲染基础尺寸（左右两列拉条）
   * 2. 渲染单位选择器
   * 3. 渲染限制尺寸展开按钮
   * 4. 如果展开，渲染限制尺寸
   * 5. 渲染宽高比选择器
   */
  render() {
    const isAutoUnit = this.unit === 'auto';

    // 创建基础尺寸拉条（如果不是auto）
    if (!isAutoUnit) {
      this.widthSlider = new SliderWithInput({
        label: '宽度',
        min: 0,
        max: 1000,
        value: parseFloat(this.width) || 0,
        unit: this.unit,
        step: 1,
      });

      this.heightSlider = new SliderWithInput({
        label: '高度',
        min: 0,
        max: 1000,
        value: parseFloat(this.height) || 0,
        unit: this.unit,
        step: 1,
      });
    }

    return `
      <div class="ppc-size-control" data-control-id="${this.id}">
        <!-- 基础尺寸 -->
        <div class="size-basic-section">
          <div class="size-two-columns">
            ${isAutoUnit ? this.renderAutoValue() : `
              <div class="size-column">${this.widthSlider.render()}</div>
              <div class="size-column">${this.heightSlider.render()}</div>
            `}
          </div>
          
          <!-- 单位选择 -->
          <div class="size-unit-selector">
            <label>单位：</label>
            <select class="unit-select">
              <option value="px" ${this.unit === 'px' ? 'selected' : ''}>px</option>
              <option value="%" ${this.unit === '%' ? 'selected' : ''}>%</option>
              <option value="em" ${this.unit === 'em' ? 'selected' : ''}>em</option>
              <option value="vw" ${this.unit === 'vw' ? 'selected' : ''}>vw</option>
              <option value="vh" ${this.unit === 'vh' ? 'selected' : ''}>vh</option>
              <option value="auto" ${this.unit === 'auto' ? 'selected' : ''}>auto</option>
            </select>
          </div>
        </div>
        
        <!-- 限制尺寸（可折叠） -->
        ${this.renderLimits()}
        
        <!-- 宽高比选择 -->
        <div class="size-aspect-ratio">
          <label>宽高比：</label>
          <select class="aspect-ratio-select">
            <option value="auto" ${this.aspectRatio === 'auto' ? 'selected' : ''}>auto</option>
            <option value="1/1" ${this.aspectRatio === '1/1' ? 'selected' : ''}>1:1（正方形）</option>
            <option value="16/9" ${this.aspectRatio === '16/9' ? 'selected' : ''}>16:9（宽屏）</option>
            <option value="4/3" ${this.aspectRatio === '4/3' ? 'selected' : ''}>4:3（经典）</option>
            <option value="3/2" ${this.aspectRatio === '3/2' ? 'selected' : ''}>3:2（照片）</option>
            <option value="custom">自定义</option>
          </select>
        </div>
      </div>
    `;
  }

  /**
   * 渲染auto值显示
   * 
   * @returns {string} HTML字符串
   */
  renderAutoValue() {
    return `
      <div class="size-auto-display">
        <div class="auto-value-item">
          <label>宽度：</label>
          <span class="auto-value">auto</span>
        </div>
        <div class="auto-value-item">
          <label>高度：</label>
          <span class="auto-value">auto</span>
        </div>
      </div>
    `;
  }

  /**
   * 渲染限制尺寸部分
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 渲染可折叠的限制尺寸区域，包含：
   * - 可点击的标题行（点击展开/折叠）
   * - 折叠图标（▼/▶）
   * - 控件区域（可折叠，包含4个滑块：最小/最大宽度/高度）
   * - 默认折叠状态，用户需要时才展开
   */
  renderLimits() {
    // 创建限制尺寸拉条
    this.minWidthSlider = new SliderWithInput({
      label: '最小宽度',
      min: 0,
      max: 500,
      value: this.minWidth === 'auto' ? 0 : parseFloat(this.minWidth),
      unit: this.unit === 'auto' ? 'px' : this.unit,
      step: 1,
    });

    this.maxWidthSlider = new SliderWithInput({
      label: '最大宽度',
      min: 100,
      max: 2000,
      value: this.maxWidth === 'auto' ? 1000 : parseFloat(this.maxWidth),
      unit: this.unit === 'auto' ? 'px' : this.unit,
      step: 1,
    });

    this.minHeightSlider = new SliderWithInput({
      label: '最小高度',
      min: 0,
      max: 500,
      value: this.minHeight === 'auto' ? 0 : parseFloat(this.minHeight),
      unit: this.unit === 'auto' ? 'px' : this.unit,
      step: 1,
    });

    this.maxHeightSlider = new SliderWithInput({
      label: '最大高度',
      min: 100,
      max: 2000,
      value: this.maxHeight === 'auto' ? 1000 : parseFloat(this.maxHeight),
      unit: this.unit === 'auto' ? 'px' : this.unit,
      step: 1,
    });

    return `
      <div class="size-limits-wrapper" data-collapsed="true">
        <!-- 可点击的标题行 -->
        <div class="section-header clickable" data-toggle-target="size-limits-controls-${this.id}">
          <i class="fa-solid fa-chevron-right toggle-icon"></i>
          <span>限制尺寸</span>
        </div>
        
        <!-- 可折叠内容（默认折叠） -->
        <div class="size-limits-controls collapsible-content collapsed" id="size-limits-controls-${this.id}">
          <div class="size-two-columns">
            <div class="size-column">${this.minWidthSlider.render()}</div>
            <div class="size-column">${this.minHeightSlider.render()}</div>
          </div>
          <div class="size-two-columns">
            <div class="size-column">${this.maxWidthSlider.render()}</div>
            <div class="size-column">${this.maxHeightSlider.render()}</div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * @description
   * 绑定所有交互事件，包括：
   * - 限制尺寸区折叠/展开（使用通用bindCollapse函数）
   * - 基础尺寸拉条的onChange（回调接收数字值，不是对象）
   * - 单位选择器的change事件
   * - 限制尺寸拉条（回调接收数字值，不是对象）
   * - 宽高比选择器
   */
  bindEvents(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (!container) {
      logger.warn('[SizeControl.bindEvents] 容器未找到');
      return;
    }

    // 绑定基础尺寸拉条
    if (this.widthSlider && this.heightSlider) {
      this.widthSlider.bindEvents(/** @type {HTMLElement} */(container));
      this.heightSlider.bindEvents(/** @type {HTMLElement} */(container));

      this.widthSlider.onChange = (value) => {
        this.width = value;  // SliderWithInput.getValue()返回数字，不是对象
        this.notifyChange();
      };

      this.heightSlider.onChange = (value) => {
        this.height = value;  // SliderWithInput.getValue()返回数字，不是对象
        this.notifyChange();
      };
    }

    // 单位选择器（智能切换，避免不合理数值）
    const unitSelect = container.querySelector('.unit-select');
    unitSelect?.addEventListener('change', (e) => {
      const target = /** @type {HTMLSelectElement} */ (e.target);
      const oldUnit = this.unit;
      const newUnit = target.value;
      this.unit = newUnit;

      logger.debug('[SizeControl] 单位切换:', oldUnit, '→', newUnit);

      // 智能重置值（避免不合理数值）
      if (newUnit === '%' && oldUnit === 'px') {
        // px → %：重置为100%（占满容器）
        if (this.width !== 'auto' && parseFloat(this.width) > 100) {
          this.width = 100;
          this.height = 100;
          logger.debug('[SizeControl] px→%，值已重置为100%');
        }
      } else if (newUnit === 'px' && oldUnit === '%') {
        // % → px：重置为合理px值
        this.width = 200;
        this.height = 150;
        logger.debug('[SizeControl] %→px，值已重置为200px');
      } else if (newUnit === 'auto') {
        // 切换到auto，值无意义
        this.width = 'auto';
        this.height = 'auto';
        logger.debug('[SizeControl] 切换到auto，宽高已设为auto');
      } else if (oldUnit === 'auto' && newUnit !== 'auto') {
        // auto → 其他单位：重置为默认值
        this.width = 200;
        this.height = 150;
        logger.debug('[SizeControl] auto→', newUnit, '，值已重置为默认');
      }

      // 重新渲染（因为 auto 和其他单位的 UI 不同）
      this.rerender(element);
      this.notifyChange();
    });

    // 绑定限制尺寸折叠功能
    const limitsWrapper = container.querySelector('.size-limits-wrapper');
    if (limitsWrapper) {
      const header = /** @type {HTMLElement} */ (limitsWrapper.querySelector('.section-header.clickable'));
      if (header) {
        const targetId = `size-limits-controls-${this.id}`;
        bindCollapse(header, targetId, /** @type {HTMLElement} */(limitsWrapper), 'SizeControl');
      }
    }

    // 绑定限制尺寸拉条事件
    this.bindLimitsEvents(/** @type {HTMLElement} */(container));

    // 宽高比选择器
    const aspectRatioSelect = container.querySelector('.aspect-ratio-select');
    aspectRatioSelect?.addEventListener('change', (e) => {
      const target = /** @type {HTMLSelectElement} */ (e.target);
      this.aspectRatio = target.value;
      logger.debug('[SizeControl] 宽高比已设置:', this.aspectRatio);
      this.notifyChange();
    });
  }

  /**
   * 绑定限制尺寸拉条事件
   * 
   * @param {HTMLElement} container - 容器DOM元素
   */
  bindLimitsEvents(container) {
    if (!this.minWidthSlider || !this.maxWidthSlider ||
      !this.minHeightSlider || !this.maxHeightSlider) {
      return;
    }

    this.minWidthSlider.bindEvents(container);
    this.maxWidthSlider.bindEvents(container);
    this.minHeightSlider.bindEvents(container);
    this.maxHeightSlider.bindEvents(container);

    this.minWidthSlider.onChange = (value) => {
      this.minWidth = value;  // SliderWithInput.getValue()返回数字，不是对象
      this.notifyChange();
    };

    this.maxWidthSlider.onChange = (value) => {
      this.maxWidth = value;  // SliderWithInput.getValue()返回数字，不是对象
      this.notifyChange();
    };

    this.minHeightSlider.onChange = (value) => {
      this.minHeight = value;  // SliderWithInput.getValue()返回数字，不是对象
      this.notifyChange();
    };

    this.maxHeightSlider.onChange = (value) => {
      this.maxHeight = value;  // SliderWithInput.getValue()返回数字，不是对象
      this.notifyChange();
    };
  }

  /**
   * 重新渲染控件
   * 
   * @param {HTMLElement} element - 父容器
   */
  rerender(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (!container) return;

    container.outerHTML = this.render();
    this.bindEvents(element);
  }

  /**
   * 触发 onChange 回调
   */
  notifyChange() {
    if (this.onChange) {
      this.onChange(this.getValue());
    }
  }

  /**
   * 获取CSS值
   * 
   * @returns {Object} CSS样式对象
   * 
   * 返回示例：
   * {
   *   'width': '200px',
   *   'height': '150px',
   *   'min-width': '100px',  // 仅当 showLimits = true
   *   'max-width': '500px',
   *   'aspect-ratio': '16/9'  // 仅当设置了宽高比
   * }
   * 
   * 重要：使用CSS标准属性名（带连字符），而不是JavaScript驼峰命名
   * 原因：返回值会传给编译器（compiler.js），需要识别CSS属性名
   */
  getValue() {
    const result = {};

    // 基础尺寸
    if (this.unit === 'auto') {
      result['width'] = 'auto';
      result['height'] = 'auto';
    } else {
      result['width'] = `${this.width}${this.unit}`;
      result['height'] = `${this.height}${this.unit}`;
    }

    // 限制尺寸（使用CSS标准属性名：带连字符）
    if (this.showLimits) {
      const limitUnit = this.unit === 'auto' ? 'px' : this.unit;
      result['min-width'] = this.minWidth === 'auto' ? 'auto' : `${this.minWidth}${limitUnit}`;
      result['max-width'] = this.maxWidth === 'auto' ? 'auto' : `${this.maxWidth}${limitUnit}`;
      result['min-height'] = this.minHeight === 'auto' ? 'auto' : `${this.minHeight}${limitUnit}`;
      result['max-height'] = this.maxHeight === 'auto' ? 'auto' : `${this.maxHeight}${limitUnit}`;
    }

    // 宽高比（CSS标准属性名：带连字符）
    if (this.aspectRatio !== 'auto') {
      result['aspect-ratio'] = this.aspectRatio;
    }

    return result;
  }

  /**
   * 从CSS值设置控件
   * 
   * @param {Object} cssValue - CSS样式对象
   * 
   * 示例输入：
   * {
   *   width: '200px',
   *   height: '150px',
   *   minWidth: '100px',
   *   aspectRatio: '16/9'
   * }
   */
  setValue(cssValue) {
    if (!cssValue) return;

    // 解析基础尺寸
    if (cssValue.width) {
      const { value, unit } = this.parseCSSValue(cssValue.width);
      this.width = value;
      this.unit = unit;
    }

    if (cssValue.height) {
      const { value } = this.parseCSSValue(cssValue.height);
      this.height = value;
    }

    // 解析限制尺寸
    if (cssValue.minWidth || cssValue.maxWidth ||
      cssValue.minHeight || cssValue.maxHeight) {
      this.showLimits = true;

      if (cssValue.minWidth) {
        this.minWidth = this.parseCSSValue(cssValue.minWidth).value;
      }
      if (cssValue.maxWidth) {
        this.maxWidth = this.parseCSSValue(cssValue.maxWidth).value;
      }
      if (cssValue.minHeight) {
        this.minHeight = this.parseCSSValue(cssValue.minHeight).value;
      }
      if (cssValue.maxHeight) {
        this.maxHeight = this.parseCSSValue(cssValue.maxHeight).value;
      }
    }

    // 解析宽高比
    if (cssValue.aspectRatio) {
      this.aspectRatio = cssValue.aspectRatio;
    }
  }

  /**
   * 解析CSS值为数值和单位
   * 
   * @param {string} cssValue - CSS值（如 '200px'）
   * @returns {Object} { value, unit }
   */
  parseCSSValue(cssValue) {
    if (cssValue === 'auto') {
      return { value: 'auto', unit: 'auto' };
    }

    const match = String(cssValue).match(/^([\d.]+)([a-z%]*)$/i);
    if (match) {
      return {
        value: parseFloat(match[1]),
        unit: match[2] || 'px',
      };
    }

    return { value: 0, unit: 'px' };
  }
}

/**
 * 控件7：定位控件（头像位置控制）
 * 
 * @class PositionControl
 * @description
 * 头像位置编辑器，支持：
 * - 定位方式选择（脱离文档流 vs 占用空间）
 * - 九宫格快速定位（9个按钮，智能组合偏移）
 * - 精细偏移调整（左右两列拉条布局）
 * - 层级控制（z-index滑块）
 * - 智能提示
 * 
 * 设计决策：
 * - 九宫格智能组合：右侧用right，下方用bottom（不是left: 100%）
 * - 左右两列拉条布局（节省空间）
 * - 复用SliderWithInput组件
 * 
 * 参考：【控件表格】第316-361行、【讨论记录】第1296-1405行
 */
export class PositionControl {
  /**
   * 构造函数
   * 
   * @param {Object} [config={}] - 配置对象
   * @param {string} [config.positionType='absolute'] - 定位类型
   * @param {string} [config.gridPosition='bottom-left'] - 九宫格位置
   * @param {Object} [config.offsets] - 偏移量对象
   * @param {number} [config.zIndex=9] - 层级
   */
  constructor(config = {}) {
    this.positionType = config.positionType || 'absolute';
    this.gridPosition = config.gridPosition || 'bottom-left';
    this.offsets = config.offsets || {
      top: null,
      right: null,
      bottom: '-15px',
      left: '10px'
    };
    this.zIndex = config.zIndex !== undefined ? config.zIndex : 9;
    this.isFloating = this.positionType === 'absolute';
    this.onChange = null; // 外部会设置这个回调

    // 为每个滑块创建实例
    this.sliders = {};
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   * 
   * 逻辑：
   * 1. 定位方式单选按钮组
   * 2. 九宫格快速定位
   * 3. 精细偏移（左右两列拉条）
   * 4. 层级控制
   * 5. 智能提示
   */
  render() {
    return `
      <div class="ppc-position-control">
        <!-- 1. 定位方式选择 -->
        ${this.renderPositionType()}
        
        <!-- 2. 九宫格快速定位 -->
        ${this.renderNineGrid()}
        
        <!-- 3. 精细偏移（左右两列拉条）-->
        ${this.renderOffsetSliders()}
        
        <!-- 4. 层级控制 -->
        ${this.renderZIndex()}
        
        <!-- 5. 智能提示 -->
        ${this.renderSmartTip()}
      </div>
    `;
  }

  /**
   * 渲染定位方式选择
   * 
   * @returns {string} HTML字符串
   * 
   * 单选按钮组：
   * - 脱离文档流（absolute）- 不挤压文字
   * - 占用空间（relative）- 会挤压文字
   */
  renderPositionType() {
    return `
      <div class="position-type-selector">
        <label class="section-label">定位方式</label>
        <div class="radio-group">
          <label class="radio-option">
            <input 
              type="radio" 
              name="position-type" 
              value="absolute" 
              ${this.isFloating ? 'checked' : ''}
            >
            <span>● 脱离文档流（不挤压文字）</span>
          </label>
          <label class="radio-option">
            <input 
              type="radio" 
              name="position-type" 
              value="relative" 
              ${!this.isFloating ? 'checked' : ''}
            >
            <span>○ 占用空间（会挤压文字）</span>
          </label>
        </div>
      </div>
    `;
  }

  /**
   * 渲染九宫格快速定位
   * 
   * @returns {string} HTML字符串
   * 
   * 3x3按钮网格，点击后自动设置智能偏移组合
   * 例如：点击"右下" → bottom: 0, right: 0
   */
  renderNineGrid() {
    const positions = [
      { id: 'top-left', label: '左上', icon: '↖' },
      { id: 'top-center', label: '正上', icon: '↑' },
      { id: 'top-right', label: '右上', icon: '↗' },
      { id: 'middle-left', label: '左中', icon: '←' },
      { id: 'middle-center', label: '居中', icon: '·' },
      { id: 'middle-right', label: '右中', icon: '→' },
      { id: 'bottom-left', label: '左下', icon: '↙' },
      { id: 'bottom-center', label: '正下', icon: '↓' },
      { id: 'bottom-right', label: '右下', icon: '↘' }
    ];

    const gridButtons = positions.map((pos) => {
      const isActive = this.gridPosition === pos.id;
      return `
        <button 
          class="grid-btn ${isActive ? 'active' : ''}" 
          data-position="${pos.id}"
          title="${pos.label}"
        >
          ${pos.icon}
        </button>
      `;
    }).join('');

    return `
      <div class="nine-grid-selector">
        <label class="section-label">快速定位</label>
        <div class="grid-container">
          ${gridButtons}
        </div>
      </div>
    `;
  }

  /**
   * 渲染精细偏移滑块（左右两列布局）
   * 
   * @returns {string} HTML字符串
   * 
   * 调用4个SliderWithInput：
   * - 上偏移 | 下偏移
   * - 左偏移 | 右偏移
   */
  renderOffsetSliders() {
    // 创建4个滑块实例
    this.sliders.top = new SliderWithInput({
      label: '上偏移',
      min: -100,
      max: 100,
      value: parseFloat(this.offsets.top) || 0,
      unit: 'px',
      step: 1
    });

    this.sliders.bottom = new SliderWithInput({
      label: '下偏移',
      min: -100,
      max: 100,
      value: parseFloat(this.offsets.bottom) || 0,
      unit: 'px',
      step: 1
    });

    this.sliders.left = new SliderWithInput({
      label: '左偏移',
      min: -100,
      max: 100,
      value: parseFloat(this.offsets.left) || 0,
      unit: 'px',
      step: 1
    });

    this.sliders.right = new SliderWithInput({
      label: '右偏移',
      min: -100,
      max: 100,
      value: parseFloat(this.offsets.right) || 0,
      unit: 'px',
      step: 1
    });

    return `
      <div class="offset-sliders">
        <label class="section-label">精细偏移</label>
        <div class="two-column-slider-layout">
          <div class="column-left">
            ${this.sliders.top.render()}
            ${this.sliders.left.render()}
          </div>
          <div class="column-right">
            ${this.sliders.bottom.render()}
            ${this.sliders.right.render()}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染层级控制
   * 
   * @returns {string} HTML字符串
   * 
   * 单个z-index滑块（范围：-10 ~ 100）
   */
  renderZIndex() {
    this.sliders.zIndex = new SliderWithInput({
      label: '层级 (z-index)',
      min: -10,
      max: 100,
      value: this.zIndex,
      unit: '',
      step: 1
    });

    return `
      <div class="zindex-control">
        <div class="single-column-layout">
          ${this.sliders.zIndex.render()}
        </div>
      </div>
    `;
  }

  /**
   * 渲染智能提示
   * 
   * @returns {string} HTML字符串
   * 
   * 根据当前定位方式显示提示：
   * - 绝对定位 → "💡 会脱离文档流，不占空间"
   * - 相对定位 → "💡 会占用空间，可能挤压文字"
   */
  renderSmartTip() {
    const tip = this.isFloating
      ? '💡 会脱离文档流，不占空间（推荐）'
      : '💡 会占用空间，可能挤压文字';

    return `
      <div class="smart-tip">
        <span class="tip-text">${tip}</span>
      </div>
    `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * 逻辑：
   * 1. 定位方式切换
   * 2. 九宫格按钮点击 → 自动设置偏移
   * 3. 拉条变化 → 触发onChange
   * 4. 九宫格保持高亮（用户修改值后不取消）
   */
  bindEvents(element) {
    // 1. 绑定定位方式切换
    const radioButtons = element.querySelectorAll('input[name="position-type"]');
    radioButtons.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = /** @type {HTMLInputElement} */ (e.target);
        this.isFloating = target.value === 'absolute';
        this.positionType = target.value;

        // 更新智能提示
        this.updateSmartTip(element);

        // 触发变化回调
        if (this.onChange) {
          this.onChange(this.getValue());
        }
      });
    });

    // 2. 绑定九宫格按钮
    const gridButtons = element.querySelectorAll('.grid-btn');
    gridButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = /** @type {HTMLElement} */ (e.currentTarget);
        const position = target.dataset.position;

        // 更新九宫格高亮
        gridButtons.forEach((b) => b.classList.remove('active'));
        target.classList.add('active');

        // 应用智能偏移组合
        this.applyGridPosition(position, element);

        // 触发变化回调
        if (this.onChange) {
          this.onChange(this.getValue());
        }
      });
    });

    // 3. 绑定所有滑块的onChange
    Object.keys(this.sliders).forEach((key) => {
      const slider = this.sliders[key];
      slider.onChange = (value) => {
        // 更新内部状态
        if (key === 'zIndex') {
          this.zIndex = parseInt(value);
        } else {
          this.offsets[key] = `${value}px`;
        }

        // 触发外部onChange
        if (this.onChange) {
          this.onChange(this.getValue());
        }
      };

      // 绑定滑块事件
      slider.bindEvents(element);
    });
  }

  /**
   * 应用九宫格智能定位
   * 
   * @param {string} position - 九宫格位置ID
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * 九宫格智能组合规则：
   * - 左上：top: 0, left: 0
   * - 正上：top: 0, left: 50%, transform: translateX(-50%)
   * - 右上：top: 0, right: 0
   * - 左中：top: 50%, left: 0, transform: translateY(-50%)
   * - 居中：top: 50%, left: 50%, transform: translate(-50%, -50%)
   * - 右中：top: 50%, right: 0, transform: translateY(-50%)
   * - 左下：bottom: 0, left: 0
   * - 正下：bottom: 0, left: 50%, transform: translateX(-50%)
   * - 右下：bottom: 0, right: 0
   */
  applyGridPosition(position, element) {
    this.gridPosition = position;

    // 重置所有偏移
    const gridOffsets = {
      'top-left': { top: 0, left: 0, right: null, bottom: null },
      'top-center': { top: 0, left: 50, right: null, bottom: null },
      'top-right': { top: 0, right: 0, left: null, bottom: null },
      'middle-left': { top: 50, left: 0, right: null, bottom: null },
      'middle-center': { top: 50, left: 50, right: null, bottom: null },
      'middle-right': { top: 50, right: 0, left: null, bottom: null },
      'bottom-left': { bottom: 0, left: 0, top: null, right: null },
      'bottom-center': { bottom: 0, left: 50, top: null, right: null },
      'bottom-right': { bottom: 0, right: 0, top: null, left: null }
    };

    const targetOffsets = gridOffsets[position];
    if (!targetOffsets) return;

    // 更新内部状态
    this.offsets.top = targetOffsets.top !== null ? `${targetOffsets.top}px` : null;
    this.offsets.right = targetOffsets.right !== null ? `${targetOffsets.right}px` : null;
    this.offsets.bottom = targetOffsets.bottom !== null ? `${targetOffsets.bottom}px` : null;
    this.offsets.left = targetOffsets.left !== null ? `${targetOffsets.left}px` : null;

    // 更新滑块显示
    this.updateSliderValues(element);
  }

  /**
   * 更新滑块显示值
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * 在九宫格点击后，更新所有滑块的显示值
   */
  updateSliderValues(element) {
    const updateSlider = (slider, value) => {
      const numericValue = parseFloat(value) || 0;
      slider.value = numericValue;

      const container = element.querySelector(`[data-slider-id="${slider.id}"]`);
      if (!container) return;

      const rangeInput = /** @type {HTMLInputElement} */ (
        container.querySelector('.slider-range')
      );
      const textInput = /** @type {HTMLInputElement} */ (
        container.querySelector('.value-input')
      );

      if (rangeInput) rangeInput.value = String(numericValue);
      if (textInput) textInput.value = `${numericValue}${slider.unit}`;
    };

    updateSlider(this.sliders.top, this.offsets.top || 0);
    updateSlider(this.sliders.right, this.offsets.right || 0);
    updateSlider(this.sliders.bottom, this.offsets.bottom || 0);
    updateSlider(this.sliders.left, this.offsets.left || 0);
  }

  /**
   * 更新智能提示
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * 在定位方式切换后，更新提示文本
   */
  updateSmartTip(element) {
    const tipElement = element.querySelector('.tip-text');
    if (!tipElement) return;

    const tip = this.isFloating
      ? '💡 会脱离文档流，不占空间（推荐）'
      : '💡 会占用空间，可能挤压文字';

    tipElement.textContent = tip;
  }

  /**
   * 获取CSS值
   * 
   * @returns {Object} CSS属性对象
   * 
   * @description
   * 智能过滤偏移，根据九宫格位置只返回对应的方向，避免left/right和top/bottom冲突
   * 
   * 核心规则：
   * - bottom-* 位置 → 只返回bottom（不返回top）
   * - top-* 位置 → 只返回top（不返回bottom）
   * - *-right 位置 → 只返回right（不返回left）
   * - *-left 位置 → 只返回left（不返回right）
   * - middle/center 位置 → 使用top/left的px值（拖滑块后变为绝对定位）
   * 
   * 返回示例：
   * - 九宫格"右下" → { position: 'absolute', bottom: '0px', right: '0px', 'z-index': 9 }
   * - 九宫格"左上" → { position: 'absolute', top: '0px', left: '0px', 'z-index': 9 }
   * - 用户拖动滑块后 → 对应方向的值更新，其他方向不返回
   */
  getValue() {
    const result = {
      'position': this.isFloating ? 'absolute' : 'relative'
    };

    const position = this.gridPosition;  // 当前九宫格位置（如'bottom-right'）

    // === 垂直方向智能过滤 ===
    if (position.includes('bottom')) {
      // bottom-* 位置 → 只返回bottom
      if (this.offsets.bottom !== null) {
        result['bottom'] = this.offsets.bottom;
      }
    } else if (position.includes('top')) {
      // top-* 位置 → 只返回top
      if (this.offsets.top !== null) {
        result['top'] = this.offsets.top;
      }
    } else if (position.includes('middle')) {
      // middle-* 位置 → 返回top（用户拖滑块后的px值）
      if (this.offsets.top !== null) {
        result['top'] = this.offsets.top;
      }
    }

    // === 水平方向智能过滤 ===
    if (position.includes('right')) {
      // *-right 位置 → 只返回right
      if (this.offsets.right !== null) {
        result['right'] = this.offsets.right;
      }
    } else if (position.includes('left')) {
      // *-left 位置 → 只返回left
      if (this.offsets.left !== null) {
        result['left'] = this.offsets.left;
      }
    } else if (position.endsWith('center')) {
      // *-center 位置 → 返回left（用户拖滑块后的px值）
      if (this.offsets.left !== null) {
        result['left'] = this.offsets.left;
      }
    }

    // z-index始终返回
    result['z-index'] = this.zIndex;

    return result;
  }

  /**
   * 从CSS值设置控件
   * 
   * @param {Object} cssValue - CSS值对象
   * 
   * 用于从现有CSS加载值到控件中
   */
  setValue(cssValue) {
    if (!cssValue) return;

    if (cssValue.position) {
      this.positionType = cssValue.position;
      this.isFloating = cssValue.position === 'absolute';
    }

    if (cssValue.top !== undefined) this.offsets.top = cssValue.top;
    if (cssValue.right !== undefined) this.offsets.right = cssValue.right;
    if (cssValue.bottom !== undefined) this.offsets.bottom = cssValue.bottom;
    if (cssValue.left !== undefined) this.offsets.left = cssValue.left;
    if (cssValue['z-index'] !== undefined) this.zIndex = parseInt(cssValue['z-index']);
  }
}

/**
 * 控件8：Flex布局控件
 * 
 * @class FlexControl
 * @description
 * Flex布局编辑器，支持：
 * - flex-direction（行、列）
 * - justify-content（主轴对齐）
 * - align-items（交叉轴对齐）
 * - gap（间距）
 * - 可视化预览
 * 
 * 参考：【控件表格】第273-302行
 */
export class FlexControl {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.direction = 'row'  // row/column
   * - this.justifyContent = 'flex-start'
   * - this.alignItems = 'flex-start'
   * - this.gap = '0'
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染flex-direction选择
   * 2. 渲染justify-content选择（主轴对齐）
   * 3. 渲染align-items选择（交叉轴对齐）
   * 4. 渲染gap输入框
   * 5. 可选：可视化预览
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有选择器和输入框的change/input事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P1] 获取CSS值
   * 
   * 返回：{ display: 'flex', 'flex-direction': 'row', ... }
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件9：变换控件（transform）
 * 
 * @class TransformControl
 * @description
 * 变换编辑器，支持：
 * - 旋转（rotate）
 * - 缩放（scale）
 * - 倾斜（skew）
 * - 位移（translate）
 * - 多个变换组合
 * 
 * 参考：【控件表格】第305-334行
 */
export class TransformControl {
  /**
   * 构造函数
   * 
   * @param {Object} config - 配置对象
   * @param {number} [config.rotate=0] - 旋转角度（度）
   * @param {number} [config.scaleX=1] - X轴缩放
   * @param {number} [config.scaleY=1] - Y轴缩放
   * @param {number} [config.skewX=0] - X轴倾斜（度）
   * @param {number} [config.skewY=0] - Y轴倾斜（度）
   * @param {number} [config.translateX=0] - X轴位移（px）
   * @param {number} [config.translateY=0] - Y轴位移（px）
   * 
   * @description
   * Transform在用户CSS中使用了10+个地方（头像、装饰、按钮等），必须是独立的通用控件
   * 
   * 范围设计（基于用户CSS分析）：
   * - 旋转：-180° ~ +180°（用户用了-15°到15°）
   * - 缩放：0.5 ~ 2.0（用户用了0.95到1.15）
   * - 倾斜：-45° ~ +45°（用户很少用）
   * - 位移：-200px ~ +200px（用户用了-90px到+60px）
   * 
   * 参考：【控件表格】第459-512行
   */
  constructor(config = {}) {
    this.rotate = config.rotate !== undefined ? config.rotate : 0;
    this.scaleX = config.scaleX !== undefined ? config.scaleX : 1;
    this.scaleY = config.scaleY !== undefined ? config.scaleY : 1;
    this.skewX = config.skewX !== undefined ? config.skewX : 0;
    this.skewY = config.skewY !== undefined ? config.skewY : 0;
    this.translateX = config.translateX !== undefined ? config.translateX : 0;
    this.translateY = config.translateY !== undefined ? config.translateY : 0;
    this.onChange = null; // 外部会设置这个回调
  }

  /**
   * 渲染HTML
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 左右两列拉条布局（节省空间，用户2025-10-09确定）：
   * - 第1行：旋转 + 缩放
   * - 第2行：倾斜X + 倾斜Y
   * - 第3行：位移X + 位移Y
   * 
   * 参考：【讨论记录】第1296-1405行
   */
  render() {
    // 创建6个滑块（左右两列，共3行）
    this.rotateSlider = new SliderWithInput({
      label: '旋转',
      min: -180,
      max: 180,
      value: this.rotate,
      unit: '°',
      step: 1,
      showRangeLabels: true,
    });

    this.scaleSlider = new SliderWithInput({
      label: '缩放',
      min: 0.5,
      max: 2.0,
      value: this.scaleX, // 默认使用scaleX（通常scaleX和scaleY相同）
      unit: '',
      step: 0.05,
      showRangeLabels: true,
    });

    this.skewXSlider = new SliderWithInput({
      label: 'X轴倾斜',
      min: -45,
      max: 45,
      value: this.skewX,
      unit: '°',
      step: 1,
      showRangeLabels: true,
    });

    this.skewYSlider = new SliderWithInput({
      label: 'Y轴倾斜',
      min: -45,
      max: 45,
      value: this.skewY,
      unit: '°',
      step: 1,
      showRangeLabels: true,
    });

    this.translateXSlider = new SliderWithInput({
      label: 'X轴位移',
      min: -200,
      max: 200,
      value: this.translateX,
      unit: 'px',
      step: 1,
      showRangeLabels: true,
    });

    this.translateYSlider = new SliderWithInput({
      label: 'Y轴位移',
      min: -200,
      max: 200,
      value: this.translateY,
      unit: 'px',
      step: 1,
      showRangeLabels: true,
    });

    return `
            <div class="ppc-transform-control">
                <!-- 第1行：旋转 + 缩放 -->
                <div class="two-column-slider-layout">
                    <div class="left-column">${this.rotateSlider.render()}</div>
                    <div class="right-column">${this.scaleSlider.render()}</div>
                </div>
                
                <!-- 第2行：倾斜X + Y -->
                <div class="two-column-slider-layout">
                    <div class="left-column">${this.skewXSlider.render()}</div>
                    <div class="right-column">${this.skewYSlider.render()}</div>
                </div>
                
                <!-- 第3行：位移X + Y -->
                <div class="two-column-slider-layout">
                    <div class="left-column">${this.translateXSlider.render()}</div>
                    <div class="right-column">${this.translateYSlider.render()}</div>
                </div>
            </div>
        `;
  }

  /**
   * 绑定事件
   * 
   * @param {HTMLElement} element - 容器DOM元素
   * 
   * @description
   * 绑定所有滑块的onChange事件，任何变化都触发外部回调
   * 
   * 逻辑：
   * 1. 绑定6个滑块的事件
   * 2. 每个滑块变化时更新对应的内部状态
   * 3. 触发外部onChange回调（传递完整的CSS值）
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // 旋转滑块
    this.rotateSlider.bindEvents(element);
    this.rotateSlider.onChange = (value) => {
      this.rotate = parseFloat(value) || 0;
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    };

    // 缩放滑块（同时设置scaleX和scaleY）
    this.scaleSlider.bindEvents(element);
    this.scaleSlider.onChange = (value) => {
      const scale = parseFloat(value) || 1;
      this.scaleX = scale;
      this.scaleY = scale; // 默认X和Y同步缩放
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    };

    // 倾斜X滑块
    this.skewXSlider.bindEvents(element);
    this.skewXSlider.onChange = (value) => {
      this.skewX = parseFloat(value) || 0;
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    };

    // 倾斜Y滑块
    this.skewYSlider.bindEvents(element);
    this.skewYSlider.onChange = (value) => {
      this.skewY = parseFloat(value) || 0;
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    };

    // 位移X滑块
    this.translateXSlider.bindEvents(element);
    this.translateXSlider.onChange = (value) => {
      this.translateX = parseFloat(value) || 0;
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    };

    // 位移Y滑块
    this.translateYSlider.bindEvents(element);
    this.translateYSlider.onChange = (value) => {
      this.translateY = parseFloat(value) || 0;
      if (this.onChange) {
        this.onChange(this.getValue());
      }
    };
  }

  /**
   * 获取CSS值
   * 
   * @returns {Object} CSS属性对象，格式：{ transform: '...' }
   * 
   * @description
   * 智能合并transform值，只包含非默认值
   * 
   * 合并顺序（CSS标准）：translate → scale → rotate → skew
   * 
   * @example
   * // 旋转-8°，缩放1.03，Y位移-3px
   * getValue() 
   * // => { transform: 'translateY(-3px) scale(1.03) rotate(-8deg)' }
   * 
   * // 全部默认值
   * getValue()
   * // => { transform: 'none' }
   */
  getValue() {
    const transforms = [];

    // 1. translate（位移优先，因为它不受其他变换影响）
    if (this.translateX !== 0 || this.translateY !== 0) {
      transforms.push(`translate(${this.translateX}px, ${this.translateY}px)`);
    }

    // 2. scale（缩放）
    if (this.scaleX !== 1 || this.scaleY !== 1) {
      transforms.push(`scale(${this.scaleX}, ${this.scaleY})`);
    }

    // 3. rotate（旋转）
    if (this.rotate !== 0) {
      transforms.push(`rotate(${this.rotate}deg)`);
    }

    // 4. skew（倾斜）
    if (this.skewX !== 0 || this.skewY !== 0) {
      transforms.push(`skew(${this.skewX}deg, ${this.skewY}deg)`);
    }

    return {
      transform: transforms.length > 0 ? transforms.join(' ') : 'none',
    };
  }

  /**
   * 从CSS值设置控件
   * 
   * @param {string} cssValue - CSS transform值
   * 
   * @description
   * 解析transform字符串并设置控件状态（TODO: 未来实现）
   * 
   * @example
   * setValue('rotate(-8deg) scale(1.03)')
   * // => this.rotate = -8, this.scaleX = 1.03
   */
  setValue(cssValue) {
    // TODO: 解析transform字符串（P2优先级，未来实现）
    logger.warn('[TransformControl.setValue] 暂未实现transform解析');
  }
}

/**
 * 控件10：滤镜控件（filter）
 * 
 * @class FilterControl
 * @description
 * 滤镜编辑器，支持：
 * - 模糊（blur）
 * - 亮度（brightness）
 * - 对比度（contrast）
 * - 灰度（grayscale）
 * - 色相旋转（hue-rotate）
 * - 反转（invert）
 * - 饱和度（saturate）
 * - 多个滤镜组合
 * 
 * 参考：【控件表格】第337-366行
 */
export class FilterControl {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.filters = {
   *     blur: 0,
   *     brightness: 100,
   *     contrast: 100,
   *     grayscale: 0,
   *     hueRotate: 0,
   *     invert: 0,
   *     saturate: 100,
   *     sepia: 0
   *   }
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染HTML
   * 
   * 逻辑：
   * 1. 为每个滤镜渲染一个滑块
   * 2. 显示当前数值
   * 3. 可选：实时预览效果
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有滑块的input事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P1] 获取CSS值
   * 
   * 返回：'blur(5px) brightness(1.2) contrast(1.1)'
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件11：数字控件（通用）
 * 
 * @class NumberControl
 * @description
 * 通用数字输入控件，支持：
 * - 数字输入框
 * - 单位选择
 * - 最小值、最大值限制
 * - 步进值
 * 
 * 参考：【控件表格】第369-398行
 */
export class NumberControl {
  /**
   * TODO: [P0] 构造函数
   * 
   * 初始化：
   * - this.value = config.defaultValue || 0
   * - this.unit = config.unit || 'px'
   * - this.min = config.min
   * - this.max = config.max
   * - this.step = config.step || 1
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染数字输入框（type="number"）
   * 2. 渲染单位选择器（如果有多个单位选项）
   * 3. 设置min、max、step属性
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P0] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定数字输入框input事件
   * 2. 绑定单位选择器change事件
   * 3. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P0] 获取CSS值
   * 
   * 返回：'20px' 或 '1.5em'
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P1] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件12：文本控件（通用）
 * 
 * @class TextControl
 * @description
 * 通用文本输入控件，用于：
 * - 字体名称
 * - 文本内容
 * - URL
 * - 等等
 * 
 * 参考：【控件表格】第401-430行
 */
export class TextControl {
  /**
   * TODO: [P0] 构造函数
   * 
   * 初始化：
   * - this.value = config.defaultValue || ''
   * - this.placeholder = config.placeholder || ''
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染文本输入框（type="text"）
   * 2. 设置placeholder
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P0] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定输入框input事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P0] 获取CSS值
   * 
   * 返回：字符串
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P1] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件13：选择控件（通用）
 * 
 * @class SelectControl
 * @description
 * 通用下拉选择控件，用于：
 * - 枚举值选择（display、position等）
 * - 预设值选择
 * 
 * 参考：【控件表格】第433-462行
 */
export class SelectControl {
  /**
   * TODO: [P0] 构造函数
   * 
   * 输入：config = { options, defaultValue }
   * options = [
   *   { value: 'flex', label: '弹性布局' },
   *   { value: 'block', label: '块级' },
   *   ...
   * ]
   * 
   * 初始化：
   * - this.options = config.options || []
   * - this.value = config.defaultValue || options[0].value
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染<select>元素
   * 2. 遍历options，渲染<option>
   * 3. 设置选中项
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P0] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定select的change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P0] 获取CSS值
   * 
   * 返回：选中的value
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P1] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件14：复选框控件（通用）
 * 
 * @class CheckboxControl
 * @description
 * 复选框控件，用于：
 * - 布尔值选项
 * - 启用/禁用功能
 * 
 * 参考：【控件表格】第465-494行
 */
export class CheckboxControl {
  /**
   * TODO: [P0] 构造函数
   * 
   * 初始化：
   * - this.checked = config.defaultValue || false
   * - this.label = config.label || ''
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P0] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染<input type="checkbox">
   * 2. 渲染标签文本
   * 3. 设置选中状态
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P0] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定复选框change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P0] 获取CSS值
   * 
   * 返回：true/false
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P1] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 控件15：文字样式控件
 * 
 * @class FontControl
 * @description
 * 文字样式编辑器，支持：
 * - 字体族（font-family）
 * - 字体大小（font-size）
 * - 字体粗细（font-weight）
 * - 字体样式（italic等）
 * - 行高（line-height）
 * - 字间距（letter-spacing）
 * 
 * 参考：【控件表格】第497-526行
 */
export class FontControl {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.fontFamily = ''
   * - this.fontSize = { value: 16, unit: 'px' }
   * - this.fontWeight = 'normal'
   * - this.fontStyle = 'normal'
   * - this.lineHeight = 'normal'
   * - this.letterSpacing = 'normal'
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染字体族输入框或选择器
   * 2. 渲染字体大小输入 + 单位选择
   * 3. 渲染字体粗细选择
   * 4. 渲染字体样式选择（正常/斜体）
   * 5. 渲染行高输入
   * 6. 渲染字间距输入
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有输入框和选择器的input/change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P1] 获取CSS值
   * 
   * 返回：{
   *   'font-family': 'Arial',
   *   'font-size': '16px',
   *   'font-weight': 'bold',
   *   ...
   * }
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

// ========================================
// 第2部分：特殊控件（7个，第1201-2300行）
// ========================================

/**
 * 特殊控件1：贴纸装饰控件
 * 
 * @class DecorationStickerControl
 * @description
 * 贴纸装饰编辑器，支持：
 * - 伪元素模式（::before, ::after）
 * - 装饰语法模式（@元素: 装饰名 {}，支持无限个）
 * - 图片URL上传/输入
 * - 尺寸、位置、重复设置
 * - 关联 advanced/decoration-syntax.js
 * 
 * 用户澄清（2025-10-06）：
 * "贴纸装饰这里应该是一个控件设计。就是一个积木，每个场景里面都有可能使用这个积木。
 * 然后可能是要关联装饰语法的文件的，正常是只能贴两个图的，before和after，
 * 然后这个装饰贴图的积木可以从装饰语法这里继续增加贴图。"
 * 
 * 参考：【控件表格】第529-588行
 * 参考：【文件结构方案】第1491-1518行（decoration-syntax.js说明）
 */
export class DecorationStickerControl {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.mode = 'pseudo'  // pseudo | decoration-syntax
   * - this.pseudoElement = 'before'  // before | after
   * - this.decorations = []  // 装饰语法模式的装饰列表
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染模式选择（伪元素模式 vs 装饰语法模式）
   * 2. 伪元素模式UI：
   *    - 选择 ::before 或 ::after
   *    - 图片URL输入/上传
   *    - 复用 PositionControl、SizeControl、TransformControl
   * 3. 装饰语法模式UI：
   *    - 装饰列表（可添加、删除）
   *    - 每个装饰：名称 + 图片 + 位置 + 尺寸
   *    - 调用 decoration-syntax.js 的函数
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定模式切换（伪元素 vs 装饰语法）
   * 2. 绑定图片上传/输入
   * 3. 绑定所有控件的onChange（复用PositionControl等）
   * 4. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P1] 获取CSS值
   * 
   * 返回：
   * - 伪元素模式：返回伪元素CSS对象
   * - 装饰语法模式：返回@语法字符串
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 特殊控件2：图标替换控件
 * 
 * @class IconReplacerControl
 * @description
 * 图标替换编辑器，支持：
 * - 图标分组选择（导航栏、预设、按钮等）
 * - 图片URL上传/输入
 * - 尺寸、样式设置
 * - 关联 advanced/icon-replacer.js
 * 
 * 用户澄清（2025-10-06）：
 * "导航栏图标 - 替换9个图标的图片和样式，这里也要记录一下，
 * 替换图标需要设计一个替换图片的积木。"
 * 
 * 参考：【控件表格】第591-650行
 * 参考：【文件结构方案】第1520-1553行（icon-replacer.js说明）
 */
export class IconReplacerControl {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.iconGroup = ''  // 图标分组（导航栏、预设等）
   * - this.iconUrl = ''
   * - this.iconSize = { width: 'auto', height: 'auto' }
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染图标分组选择
   * 2. 渲染图片URL输入/上传
   * 3. 渲染尺寸设置
   * 4. 调用 icon-replacer.js 应用到页面
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有输入框和选择器的input/change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P1] 获取CSS值
   * 
   * 返回：图标配置对象
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 特殊控件3：背景图片控件
 * 
 * @class BackgroundImageControl
 * @description
 * 背景图片编辑器，支持：
 * - 图片URL上传/输入
 * - background-size（cover、contain、自定义）
 * - background-position（9宫格选择）
 * - background-repeat（平铺、不平铺等）
 * - 多层背景
 * 
 * 参考：【控件表格】第653-712行
 */
export class BackgroundImageControl {
  /**
   * TODO: [P1] 构造函数
   * 
   * 初始化：
   * - this.imageUrl = ''
   * - this.backgroundSize = 'cover'  // cover/contain/auto
   * - this.backgroundPosition = 'center'
   * - this.backgroundRepeat = 'no-repeat'
   * - this.layers = []  // 多层背景
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P1] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染图片URL输入/上传
   * 2. 渲染background-size选择（cover/contain/自定义）
   * 3. 渲染background-position九宫格选择器
   * 4. 渲染background-repeat选择
   * 5. 可选：多层背景支持
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P1] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有输入框和选择器的input/change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P1] 获取CSS值
   * 
   * 返回：{
   *   'background-image': 'url(...)',
   *   'background-size': 'cover',
   *   'background-position': 'center',
   *   'background-repeat': 'no-repeat'
   * }
   * 
   * ⚠️ TODO: [MERGE-CONFLICT] background冲突处理
   * 注意：如果场景中同时使用ColorControl和BackgroundImageControl：
   * - ColorControl可能生成：background: linear-gradient(...)（简写）
   * - BackgroundImageControl生成：background-image: url(...)（详细属性）
   * - CSS规则：简写background会覆盖所有background-*属性
   * 解决方案：在beginner-mode.js合并时，确保ColorControl使用background-image而非background
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 特殊控件4：渐变编辑器（独立）
 * 
 * @class GradientEditorControl
 * @description
 * 独立的渐变编辑器（比ColorControl更高级），支持：
 * - 可视化渐变预览
 * - 色点拖动调整位置
 * - 角度/方向可视化调整
 * - 预设渐变模板
 * 
 * 参考：【控件表格】第715-744行
 */
export class GradientEditorControl {
  /**
   * TODO: [P2] 构造函数
   * 
   * 初始化：
   * - this.gradientType = 'linear'
   * - this.colorStops = []
   * - this.angle = 0
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P2] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染可视化渐变预览
   * 2. 渲染色点拖动条
   * 3. 渲染角度/方向可视化调整
   * 4. 渲染预设渐变模板
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P2] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定色点拖动事件
   * 2. 绑定角度调整事件
   * 3. 绑定预设模板点击
   * 4. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P2] 获取CSS值
   * 
   * 返回：'linear-gradient(45deg, #ff0000 0%, #0000ff 100%)'
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 特殊控件5：过渡动画控件
 * 
 * @class TransitionControl
 * @description
 * 过渡动画编辑器，支持：
 * - transition-property（哪些属性过渡）
 * - transition-duration（持续时间）
 * - transition-timing-function（缓动函数）
 * - transition-delay（延迟）
 * - 可视化预览
 * 
 * 参考：【控件表格】第747-776行
 */
export class TransitionControl {
  /**
   * TODO: [P2] 构造函数
   * 
   * 初始化：
   * - this.property = 'all'
   * - this.duration = '0.3s'
   * - this.timingFunction = 'ease'
   * - this.delay = '0s'
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P2] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染过渡属性选择
   * 2. 渲染持续时间输入
   * 3. 渲染缓动函数选择
   * 4. 渲染延迟输入
   * 5. 可选：可视化预览
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P2] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有输入框和选择器的input/change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P2] 获取CSS值
   * 
   * 返回：'all 0.3s ease 0s'
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 特殊控件6：关键帧动画控件
 * 
 * @class AnimationControl
 * @description
 * 关键帧动画编辑器，支持：
 * - 关键帧时间轴
 * - 每个关键帧的属性设置
 * - animation-duration、iteration-count等
 * - 可视化预览
 * 
 * 参考：【控件表格】第779-808行
 */
export class AnimationControl {
  /**
   * TODO: [P2] 构造函数
   * 
   * 初始化：
   * - this.name = ''
   * - this.duration = '1s'
   * - this.timingFunction = 'ease'
   * - this.delay = '0s'
   * - this.iterationCount = '1'
   * - this.direction = 'normal'
   * - this.keyframes = []
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P2] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染动画名称输入
   * 2. 渲染持续时间、缓动函数、延迟、循环次数等
   * 3. 渲染关键帧时间轴（可视化）
   * 4. 渲染每个关键帧的属性设置
   * 5. 可选：可视化预览
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P2] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有输入框和选择器的input/change事件
   * 2. 绑定关键帧添加/删除
   * 3. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P2] 获取CSS值
   * 
   * 返回：{
   *   animation: '...',
   *   '@keyframes': '...'
   * }
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

/**
 * 特殊控件7：切片边框控件
 * 
 * @class BorderImageControl
 * @description
 * 切片边框编辑器，支持：
 * - border-image-source（图片URL）
 * - border-image-slice（切片）
 * - border-image-repeat（重复方式）
 * - 可视化切片预览
 * 
 * 参考：【控件表格】第811-818行
 */
export class BorderImageControl {
  /**
   * TODO: [P2] 构造函数
   * 
   * 初始化：
   * - this.imageSource = ''
   * - this.slice = { top: 0, right: 0, bottom: 0, left: 0 }
   * - this.repeat = 'stretch'
   */
  constructor(config = {}) {
    // TODO实现
  }

  /**
   * TODO: [P2] 渲染HTML
   * 
   * 逻辑：
   * 1. 渲染图片URL输入/上传
   * 2. 渲染切片设置（四边切片值）
   * 3. 渲染重复方式选择
   * 4. 可选：可视化切片预览
   */
  render() {
    // TODO实现
  }

  /**
   * TODO: [P2] 绑定事件
   * 
   * 逻辑：
   * 1. 绑定所有输入框和选择器的input/change事件
   * 2. 任何变化都调用 this.onChange && this.onChange(this.getValue())
   * 
   * 重要：外部会设置 this.onChange 回调！
   */
  bindEvents(element) {
    // TODO实现
  }

  /**
   * TODO: [P2] 获取CSS值
   * 
   * 返回：{
   *   'border-image-source': 'url(...)',
   *   'border-image-slice': '10 20 10 20',
   *   'border-image-repeat': 'stretch'
   * }
   */
  getValue() {
    // TODO实现
  }

  /**
   * TODO: [P2] 从CSS值设置控件
   */
  setValue(cssValue) {
    // TODO实现
  }
}

// ========================================
// [MEPC] 气泡元素定位控件
// ========================================

/**
 * 控件23：气泡元素定位控件（MessageElementPositionControl）
 * 
 * @class MessageElementPositionControl
 * @description
 * 专门用于定位气泡内的小元素（头像、时间戳、计时器、箭头等）
 * 
 * 特点：
 * 1. 支持10个气泡内元素（5个A类全支持，5个B类仅absolute）
 * 2. 9宫格定位（无居中选项，气泡内元素不适合居中）
 * 3. 智能偏移方向（根据位置只显示对应的2个方向）
 * 4. 两种定位模式：
 *    - 脱离文档流（absolute）：所有元素都支持
 *    - 占用空间（flex布局）：仅A类前3个元素支持
 * 5. 自动添加父元素CSS（气泡外框 position: relative）
 * 6. 注释标记管理（覆盖式修改，不叠加）
 * 
 * 支持的元素：
 * - A类（全支持）：头像包装器、左箭头、文本块
 * - A类（暂不支持flex）：右箭头、分页计数器（需要消息元素分离器）
 * - B类（仅absolute）：消息ID、AI计时器、字符数、角色名、时间戳
 * 
 * 参考文档：
 * - 【开发任务】实现消息元素分离器.md（第513-1076行）
 * - 【设计方案】头像9个位置完整CSS.md（第1-665行）
 * - 【测试CSS】气泡内元素定位-英文版.md（第1-493行）
 * 
 * Grep标记：[MEPC] [CORE] [UI] [CSS] [UTIL]
 */
export class MessageElementPositionControl {
  /**
   * [CORE] 构造函数
   * 
   * @param {Object} [config] - 配置选项
   * @param {string} [config.elementType='mesAvatarWrapper'] - 元素类型
   * @param {string} [config.defaultMode='absolute'] - 默认模式
   * @param {string} [config.defaultPosition='top-left'] - 默认位置
   * @param {Object} [config.defaultOffsets] - 默认偏移值
   */
  constructor(config = {}) {
    // 控件ID（用于DOM查找）
    this.id = `mepc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 元素类型
    this.elementType = config.elementType || 'mesAvatarWrapper';

    // 获取元素配置
    this.elementConfig = this.getElementConfig(this.elementType);

    // 当前模式（absolute / flex）
    this.currentMode = config.defaultMode || 'absolute';

    // 当前位置（9个位置之一）
    this.currentPosition = config.defaultPosition || 'top-left';

    // 当前偏移值（{ top, bottom, left, right }）
    this.currentOffsets = config.defaultOffsets || {};

    // onChange 回调（外部设置）
    this.onChange = null;

    // 偏移滑块实例缓存（用于事件绑定）
    this.offsetSliders = {};

    logger.debug('[MessageElementPositionControl] 初始化完成', {
      elementType: this.elementType,
      elementName: this.elementConfig.name,
      supportsFlexMode: this.elementConfig.supportsFlexMode
    });
  }

  /**
   * [CORE] 获取元素配置
   * 
   * @param {string} elementType - 元素类型
   * @returns {Object} 配置对象
   * 
   * @description
   * 元素配置表：定义每个元素的特性
   * - name: 中文名称
   * - supportsFlexMode: 是否支持flex布局模式
   * - needsOverride: 是否需要覆盖官方CSS（用!important）
   * - requiresSeparator: 是否需要消息元素分离器（将来实现）
   */
  getElementConfig(elementType) {
    const ELEMENT_CONFIGS = {
      // ===== A类：全支持（absolute + flex）=====
      'mesAvatarWrapper': {
        name: '角色头像包装器',
        supportsFlexMode: true,
        isDirectChild: true
      },
      'swipe_left': {
        name: '角色左箭头',
        supportsFlexMode: true,
        isDirectChild: true,
        needsOverride: true // 官方默认有absolute定位
      },
      'mes_block': {
        name: '角色文本块',
        supportsFlexMode: true,
        isDirectChild: true
      },

      // ===== A类：暂不支持flex（等待消息元素分离器）=====
      'swipe_right': {
        name: '角色右箭头',
        supportsFlexMode: false, // 需要分离器才能支持
        isDirectChild: false, // 目前在 swipeRightBlock 容器内
        requiresSeparator: true,
        note: '需要消息元素分离器才能启用flex模式'
      },
      'swipes-counter': {
        name: '角色分页计数器',
        supportsFlexMode: false,
        isDirectChild: false,
        requiresSeparator: true,
        note: '需要消息元素分离器才能启用flex模式'
      },

      // ===== B类：仅支持absolute =====
      'mesIDDisplay': {
        name: '角色消息ID',
        supportsFlexMode: false,
        isDirectChild: false,
        parentElement: 'mesAvatarWrapper'
      },
      'mes_timer': {
        name: '角色AI计时器',
        supportsFlexMode: false,
        isDirectChild: false,
        parentElement: 'mesAvatarWrapper'
      },
      'tokenCounterDisplay': {
        name: '角色字符数',
        supportsFlexMode: false,
        isDirectChild: false,
        parentElement: 'mesAvatarWrapper'
      },
      'name_text': {
        name: '角色名',
        supportsFlexMode: false,
        isDirectChild: false,
        parentElement: 'ch_name'
      },
      'timestamp': {
        name: '角色时间戳',
        supportsFlexMode: false,
        isDirectChild: false,
        parentElement: 'ch_name'
      }
    };

    const config = ELEMENT_CONFIGS[elementType];

    if (!config) {
      logger.warn('[MessageElementPositionControl] 未知元素类型:', elementType);
      return { name: elementType, supportsFlexMode: false };
    }

    return config;
  }

  /**
   * [UI] 渲染控件HTML
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 渲染完整控件UI：
   * 1. 模式选择按钮（1个或2个，根据元素配置）
   * 2. 9宫格位置选择器
   * 3. 智能偏移输入框（根据位置动态显示）
   */
  render() {
    return `
      <div class="ppc-message-element-position-control" data-control-id="${this.id}">
        ${this.renderModeButtons()}
        ${this.renderGridUI()}
        ${this.renderOffsetInputs()}
        ${this.renderNote()}
      </div>
    `;
  }

  /**
   * [UI] 渲染模式选择按钮
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 根据元素配置显示1个或2个模式按钮：
   * - 支持flex：显示2个按钮（脱离文档流、占用空间）
   * - 不支持flex：只显示1个按钮（脱离文档流）
   */
  renderModeButtons() {
    const supportsFlexMode = this.elementConfig.supportsFlexMode;

    return `
      <div class="mode-selector">
        <div class="section-label">定位模式</div>
        <div class="mode-buttons">
          <button 
            class="mode-btn ${this.currentMode === 'absolute' ? 'active' : ''}" 
            data-mode="absolute"
            title="元素浮在气泡上，不挤压文字"
          >
            <i class="fa-solid fa-layer-group"></i>
            <span>脱离文档流</span>
          </button>
          ${supportsFlexMode ? `
            <button 
              class="mode-btn ${this.currentMode === 'flex' ? 'active' : ''}" 
              data-mode="flex"
              title="元素占用空间，会挤压文字"
            >
              <i class="fa-solid fa-table-cells"></i>
              <span>占用空间</span>
            </button>
          ` : ''}
        </div>
        ${!supportsFlexMode && this.elementConfig.note ? `
          <div class="mode-note">
            <i class="fa-solid fa-info-circle"></i>
            <span>${this.elementConfig.note}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  /**
   * [UI] 渲染9宫格位置选择器
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 9宫格布局（无居中选项）：
   * ┌───────┬───────┬───────┐
   * │ 左上  │ 上中  │ 右上  │
   * ├───────┼───────┼───────┤
   * │ 左中  │  ❌   │ 右中  │
   * ├───────┼───────┼───────┤
   * │ 左下  │ 下中  │ 右下  │
   * └───────┴───────┴───────┘
   */
  renderGridUI() {
    const positions = [
      { id: 'top-left', icon: '↖', label: '左上' },
      { id: 'top-center', icon: '↑', label: '上中' },
      { id: 'top-right', icon: '↗', label: '右上' },
      { id: 'left-middle', icon: '←', label: '左中' },
      null, // 居中位置留空
      { id: 'right-middle', icon: '→', label: '右中' },
      { id: 'bottom-left', icon: '↙', label: '左下' },
      { id: 'bottom-center', icon: '↓', label: '下中' },
      { id: 'bottom-right', icon: '↘', label: '右下' }
    ];

    return `
      <div class="nine-grid-selector">
        <div class="section-label">位置选择</div>
        <div class="grid-container">
          ${positions.map(pos => {
      if (!pos) {
        return '<div class="grid-btn disabled" title="气泡内元素不适合居中">—</div>';
      }
      const isActive = this.currentPosition === pos.id;
      return `
              <button 
                class="grid-btn ${isActive ? 'active' : ''}" 
                data-position="${pos.id}"
                title="${pos.label}"
              >
                ${pos.icon}
              </button>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * [UI] 渲染智能偏移输入框
   * 
   * @returns {string} HTML字符串
   * 
   * @description
   * 根据选择的位置，只显示对应的偏移方向输入框：
   * - 左上：上偏移、左偏移
   * - 上中：上偏移
   * - 右上：上偏移、右偏移
   * - 左中：左偏移
   * - 右中：右偏移
   * - 左下：下偏移、左偏移
   * - 下中：下偏移
   * - 右下：下偏移、右偏移
   */
  renderOffsetInputs() {
    const availableDirections = this.getOffsetDirections(this.currentPosition);

    // 重置偏移滑块缓存
    this.offsetSliders = {};

    // 创建slider实例并缓存
    availableDirections.forEach(dir => {
      const labels = {
        'top': '上偏移',
        'bottom': '下偏移',
        'left': '左偏移',
        'right': '右偏移'
      };

      const currentValue = this.currentOffsets[dir] || 0;

      const slider = new SliderWithInput({
        id: `${this.id}-offset-${dir}`,
        label: labels[dir],
        min: -100,
        max: 100,
        step: 1,
        value: currentValue,
        unit: 'px',
        showInput: true
      });

      // 设置onChange回调
      slider.onChange = (value) => {
        this.currentOffsets[dir] = value;
        this.notifyChange();
      };

      this.offsetSliders[dir] = slider;
    });

    return `
      <div class="offset-sliders">
        <div class="section-label">位置微调</div>
        ${availableDirections.map(dir => this.offsetSliders[dir].render()).join('')}
      </div>
    `;
  }

  /**
   * [UI] 渲染提示信息
   * 
   * @returns {string} HTML字符串
   */
  renderNote() {
    return `
      <div class="smart-tip">
        <div class="tip-text">
          <i class="fa-solid fa-lightbulb"></i>
          控件会自动给气泡外框添加 <code>定位: 相对</code>
        </div>
      </div>
    `;
  }

  /**
   * [CORE] 绑定事件
   * 
   * @param {HTMLElement} element - 父容器元素
   * 
   * @description
   * 绑定所有交互事件：
   * 1. 模式按钮点击
   * 2. 9宫格按钮点击
   * 3. 偏移滑块变化
   */
  bindEvents(element) {
    const container = element.querySelector(`[data-control-id="${this.id}"]`);
    if (!container) {
      logger.warn('[MessageElementPositionControl] 找不到控件容器:', this.id);
      return;
    }

    // 绑定模式按钮
    const modeButtons = container.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = /** @type {HTMLElement} */ (btn).dataset.mode;
        this.onModeChange(mode, /** @type {HTMLElement} */(container));
      });
    });

    // 绑定9宫格按钮
    const gridButtons = container.querySelectorAll('.grid-btn:not(.disabled)');
    gridButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const position = /** @type {HTMLElement} */ (btn).dataset.position;
        this.onPositionChange(position, /** @type {HTMLElement} */(container));
      });
    });

    // 绑定偏移滑块（调用SliderWithInput的bindEvents）
    const availableDirections = this.getOffsetDirections(this.currentPosition);
    availableDirections.forEach(dir => {
      if (this.offsetSliders[dir]) {
        this.offsetSliders[dir].bindEvents(container);
      }
    });
  }

  /**
   * [CORE] 模式切换处理
   * 
   * @param {string} mode - 新模式（absolute / flex）
   * @param {HTMLElement} container - 控件容器
   */
  onModeChange(mode, container) {
    if (this.currentMode === mode) return;

    this.currentMode = mode;
    logger.debug('[MessageElementPositionControl] 模式切换:', mode);

    // 更新按钮状态
    const modeButtons = container.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      const htmlBtn = /** @type {HTMLElement} */ (btn);
      if (htmlBtn.dataset.mode === mode) {
        htmlBtn.classList.add('active');
      } else {
        htmlBtn.classList.remove('active');
      }
    });

    // 触发onChange回调
    this.notifyChange();
  }

  /**
   * [CORE] 位置切换处理
   * 
   * @param {string} position - 新位置
   * @param {HTMLElement} container - 控件容器
   */
  onPositionChange(position, container) {
    if (this.currentPosition === position) return;

    const oldPosition = this.currentPosition;
    this.currentPosition = position;
    logger.debug('[MessageElementPositionControl] 位置切换:', oldPosition, '→', position);

    // 清除旧偏移值（切换位置时，不同方向的偏移不应保留）
    const newAvailableDirections = this.getOffsetDirections(position);
    const cleanedOffsets = {};
    newAvailableDirections.forEach(dir => {
      cleanedOffsets[dir] = this.currentOffsets[dir] || 0;
    });
    this.currentOffsets = cleanedOffsets;

    // 更新按钮状态
    const gridButtons = container.querySelectorAll('.grid-btn:not(.disabled)');
    gridButtons.forEach(btn => {
      const htmlBtn = /** @type {HTMLElement} */ (btn);
      if (htmlBtn.dataset.position === position) {
        htmlBtn.classList.add('active');
      } else {
        htmlBtn.classList.remove('active');
      }
    });

    // 重新渲染偏移输入框（因为可用方向变了）
    const offsetSlidersContainer = container.querySelector('.offset-sliders');
    if (offsetSlidersContainer) {
      // 重新创建slider实例
      this.offsetSliders = {};
      newAvailableDirections.forEach(dir => {
        const labels = {
          'top': '上偏移',
          'bottom': '下偏移',
          'left': '左偏移',
          'right': '右偏移'
        };

        const currentValue = this.currentOffsets[dir] || 0;

        const slider = new SliderWithInput({
          id: `${this.id}-offset-${dir}`,
          label: labels[dir],
          min: -100,
          max: 100,
          step: 1,
          value: currentValue,
          unit: 'px',
          showInput: true
        });

        // 设置onChange回调
        slider.onChange = (value) => {
          this.currentOffsets[dir] = value;
          this.notifyChange();
        };

        this.offsetSliders[dir] = slider;
      });

      // 渲染HTML
      offsetSlidersContainer.innerHTML = `
        <div class="section-label">位置微调</div>
        ${newAvailableDirections.map(dir => this.offsetSliders[dir].render()).join('')}
      `;

      // 绑定事件
      newAvailableDirections.forEach(dir => {
        if (this.offsetSliders[dir]) {
          this.offsetSliders[dir].bindEvents(container);
        }
      });
    }

    // 触发onChange回调
    this.notifyChange();
  }


  /**
   * [CORE] 触发onChange回调
   */
  notifyChange() {
    if (this.onChange) {
      this.onChange(this.getValue());
    }
  }

  /**
   * [CSS] 生成absolute模式CSS
   * 
   * @param {string} position - 位置
   * @param {Object} offsets - 偏移值
   * @returns {string} 中文CSS字符串
   * 
   * @description
   * 根据位置生成对应的absolute定位CSS
   * 
   * 9个位置的CSS模板：
   * - 左上：上: Xpx, 左: Xpx
   * - 上中：上: Xpx, 左: 50%, 变换: translateX(-50%)
   * - 右上：上: Xpx, 右: Xpx
   * - 左中：上: 50%, 左: Xpx, 变换: translateY(-50%)
   * - 右中：上: 50%, 右: Xpx, 变换: translateY(-50%)
   * - 左下：下: Xpx, 左: Xpx
   * - 下中：下: Xpx, 左: 50%, 变换: translateX(-50%)
   * - 右下：下: Xpx, 右: Xpx
   */
  generateAbsoluteCSS(position, offsets) {
    const elementName = this.elementConfig.name;
    const needsOverride = this.elementConfig.needsOverride;

    // CSS属性生成逻辑
    const cssMap = {
      'top-left': `
  定位: 绝对
  上: ${offsets.top || 0}px
  左: ${offsets.left || 0}px
  层级: 1`,

      'top-center': `
  定位: 绝对
  上: ${offsets.top || 0}px
  左: 50%
  变换: translateX(-50%)
  层级: 1`,

      'top-right': `
  定位: 绝对
  上: ${offsets.top || 0}px
  右: ${offsets.right || 0}px
  层级: 1`,

      'left-middle': `
  定位: 绝对
  上: 50%
  左: ${offsets.left || 0}px
  变换: translateY(-50%)
  层级: 1`,

      'right-middle': `
  定位: 绝对
  上: 50%
  右: ${offsets.right || 0}px
  变换: translateY(-50%)
  层级: 1`,

      'bottom-left': `
  定位: 绝对
  下: ${offsets.bottom || 0}px
  左: ${offsets.left || 0}px
  层级: 1`,

      'bottom-center': `
  定位: 绝对
  下: ${offsets.bottom || 0}px
  左: 50%
  变换: translateX(-50%)
  层级: 1`,

      'bottom-right': `
  定位: 绝对
  下: ${offsets.bottom || 0}px
  右: ${offsets.right || 0}px
  层级: 1`
    };

    // 如果需要覆盖官方CSS，添加重要标记（将来编译器需要支持!important）
    const css = cssMap[position] || cssMap['top-left'];

    // 添加父元素CSS
    const parentCSS = this.generateParentElementCSS();

    return `
/* == 角色气泡外框 开始 == */
角色气泡外框 {
${parentCSS}
}
/* == 角色气泡外框 结束 == */

/* == ${elementName} 开始 == */
${elementName} {
${css}
}
/* == ${elementName} 结束 == */
`.trim();
  }

  /**
   * [CSS] 生成flex模式CSS
   * 
   * @param {string} position - 位置
   * @param {Object} offsets - 偏移值（用作margin）
   * @returns {string} 中文CSS字符串
   * 
   * @description
   * 根据位置生成对应的flex布局CSS
   * 
   * flex模式需要生成3部分：
   * 1. 气泡外框：display: flex, flex-direction, align-items
   * 2. 当前元素：position: static, order, align-self, margin
   * 3. 文本块：order（确保顺序正确）
   */
  generateFlexCSS(position, offsets) {
    const elementName = this.elementConfig.name;

    // flex布局配置映射
    const flexConfigMap = {
      'top-left': {
        flexDirection: '纵向',
        alignItems: '起始',
        order: 0,
        alignSelf: '起始',
        margins: `上外边距: ${offsets.top || 0}px; 左外边距: ${offsets.left || 0}px`
      },
      'top-center': {
        flexDirection: '纵向',
        alignItems: '居中',
        order: 0,
        alignSelf: '居中',
        margins: `上外边距: ${offsets.top || 0}px`
      },
      'top-right': {
        flexDirection: '纵向',
        alignItems: '末尾',
        order: 0,
        alignSelf: '末尾',
        margins: `上外边距: ${offsets.top || 0}px; 右外边距: ${offsets.right || 0}px`
      },
      'left-middle': {
        flexDirection: '横向',
        alignItems: '居中',
        order: 0,
        alignSelf: '居中',
        margins: `左外边距: ${offsets.left || 0}px`
      },
      'right-middle': {
        flexDirection: '横向',
        alignItems: '居中',
        order: 1, // 右侧时order为1，文本块为0
        alignSelf: '居中',
        margins: `右外边距: ${offsets.right || 0}px`
      },
      'bottom-left': {
        flexDirection: '纵向',
        alignItems: '起始',
        order: 1, // 下方时order为1，文本块为0
        alignSelf: '起始',
        margins: `下外边距: ${offsets.bottom || 0}px; 左外边距: ${offsets.left || 0}px`
      },
      'bottom-center': {
        flexDirection: '纵向',
        alignItems: '居中',
        order: 1,
        alignSelf: '居中',
        margins: `下外边距: ${offsets.bottom || 0}px`
      },
      'bottom-right': {
        flexDirection: '纵向',
        alignItems: '末尾',
        order: 1,
        alignSelf: '末尾',
        margins: `下外边距: ${offsets.bottom || 0}px; 右外边距: ${offsets.right || 0}px`
      }
    };

    const config = flexConfigMap[position] || flexConfigMap['top-left'];
    const textBlockOrder = config.order === 1 ? 0 : 1;

    return `
/* == 角色气泡外框 开始 == */
角色气泡外框 {
  显示: 伸缩盒
  伸缩方向: ${config.flexDirection}
  交叉轴对齐: ${config.alignItems}
}
/* == 角色气泡外框 结束 == */

/* == ${elementName} 开始 == */
${elementName} {
  定位: 静态
  顺序: ${config.order}
  自身对齐: ${config.alignSelf}
  ${config.margins}
}
/* == ${elementName} 结束 == */

/* == 角色文本块 开始 == */
角色文本块 {
  顺序: ${textBlockOrder}
}
/* == 角色文本块 结束 == */
`.trim();
  }

  /**
   * [CSS] 生成父元素CSS
   * 
   * @returns {string} CSS属性字符串
   * 
   * @description
   * 父元素（气泡外框）需要 position: relative 作为定位父元素
   */
  generateParentElementCSS() {
    return '  定位: 相对';
  }

  /**
   * [UTIL] 获取位置对应的可用偏移方向
   * 
   * @param {string} position - 位置
   * @returns {Array<string>} 可用方向数组
   * 
   * @description
   * 根据位置返回可用的偏移方向：
   * - 左上：[top, left]
   * - 上中：[top]
   * - 右上：[top, right]
   * - 左中：[left]
   * - 右中：[right]
   * - 左下：[bottom, left]
   * - 下中：[bottom]
   * - 右下：[bottom, right]
   */
  getOffsetDirections(position) {
    const offsetMap = {
      'top-left': ['top', 'left'],
      'top-center': ['top'],
      'top-right': ['top', 'right'],
      'left-middle': ['left'],
      'right-middle': ['right'],
      'bottom-left': ['bottom', 'left'],
      'bottom-center': ['bottom'],
      'bottom-right': ['bottom', 'right']
    };

    return offsetMap[position] || [];
  }

  /**
   * [CORE] 获取CSS值
   * 
   * @returns {Object} CSS属性对象
   * 
   * @description
   * 返回当前元素的CSS属性对象（不包含父元素和其他元素）
   * 
   * 返回格式：{ 'position': 'absolute', 'top': '0px', 'left': '0px', 'z-index': '1' }
   * 
   * 重要：切换模式时会返回需要清除的属性（值为null）
   */
  getValue() {
    const result = {};

    // 清除另一个模式的属性（设为null，beginner-mode会删除它们）
    if (this.currentMode === 'absolute') {
      // Absolute模式：清除flex相关属性
      result['order'] = null;
      result['align-self'] = null;
      result['margin-top'] = null;
      result['margin-bottom'] = null;
      result['margin-left'] = null;
      result['margin-right'] = null;
    } else if (this.currentMode === 'flex') {
      // Flex模式：清除absolute相关属性
      result['top'] = null;
      result['bottom'] = null;
      result['left'] = null;
      result['right'] = null;
      result['z-index'] = null;
      // transform保留（可能有用户手动添加的旋转等）
    }

    if (this.currentMode === 'absolute') {
      // Absolute模式
      result['position'] = 'absolute';
      result['z-index'] = '1';

      // 根据位置添加对应的偏移（使用dict中文名："上偏移"等）
      const position = this.currentPosition;

      if (position.includes('top')) {
        result['top'] = `${this.currentOffsets.top || 0}px`;
      }
      if (position.includes('bottom')) {
        result['bottom'] = `${this.currentOffsets.bottom || 0}px`;
      }
      if (position.includes('left') || position === 'left-middle') {
        result['left'] = `${this.currentOffsets.left || 0}px`;
      }
      if (position.includes('right') || position === 'right-middle') {
        result['right'] = `${this.currentOffsets.right || 0}px`;
      }

      // 居中需要transform
      if (position === 'top-center' || position === 'bottom-center') {
        result['left'] = '50%';
        result['transform'] = 'translateX(-50%)';
      } else if (position === 'left-middle' || position === 'right-middle') {
        result['top'] = '50%';
        result['transform'] = 'translateY(-50%)';
      }

    } else if (this.currentMode === 'flex') {
      // Flex模式
      result['position'] = 'static';
      result['order'] = this.getFlexOrder(this.currentPosition);
      result['align-self'] = this.getFlexAlignSelf(this.currentPosition);

      // 添加margin作为偏移
      const margins = this.getFlexMargins(this.currentPosition, this.currentOffsets);
      Object.assign(result, margins);
    }

    return result;
  }

  /**
   * [UTIL] 获取flex模式的order值
   * 
   * @param {string} position - 位置
   * @returns {string} order值
   */
  getFlexOrder(position) {
    // 下方或右侧时order=1，其他为0
    if (position.includes('bottom') || position === 'right-middle') {
      return '1';
    }
    return '0';
  }

  /**
   * [UTIL] 获取flex模式的align-self值
   * 
   * @param {string} position - 位置
   * @returns {string} align-self值
   */
  getFlexAlignSelf(position) {
    // 使用dict已有的中文值："开始"/"结束"/"居中"
    if (position.includes('left')) {
      return '开始';  // flex-start
    }
    if (position.includes('right')) {
      return '结束';  // flex-end
    }
    if (position.includes('center')) {
      return '居中';  // center
    }
    return '开始';
  }

  /**
   * [UTIL] 获取flex模式的margin值
   * 
   * @param {string} position - 位置
   * @param {Object} offsets - 偏移值
   * @returns {Object} margin CSS属性对象
   */
  getFlexMargins(position, offsets) {
    const result = {};

    if (position.includes('top')) {
      result['margin-top'] = `${offsets.top || 0}px`;
    }
    if (position.includes('bottom')) {
      result['margin-bottom'] = `${offsets.bottom || 0}px`;
    }
    if (position.includes('left')) {
      result['margin-left'] = `${offsets.left || 0}px`;
    }
    if (position.includes('right')) {
      result['margin-right'] = `${offsets.right || 0}px`;
    }

    return result;
  }

  /**
   * [CORE] 从CSS值设置控件
   * 
   * @param {string} cssValue - 中文CSS字符串
   * 
   * @description
   * 解析CSS字符串，还原控件状态
   * 
   * TODO: 实现CSS解析逻辑（需要解析中文CSS）
   */
  setValue(cssValue) {
    // TODO: 解析CSS字符串，提取：
    // 1. 模式（检测"定位: 绝对" or "显示: 伸缩盒"）
    // 2. 位置（根据偏移值推断）
    // 3. 偏移值（提取数字）
    logger.warn('[MessageElementPositionControl] setValue 暂未实现');
  }
}

// ========================================
// 控件工厂（辅助函数）
// ========================================

/**
 * TODO: [P0] 控件类型映射表
 * 
 * @description
 * 将控件类型字符串映射到对应的控件类
 * 
 * 用途：
 * - 避免 switch-case 过长
 * - 便于动态创建控件
 */
const CONTROL_CLASS_MAP = {
  // TODO实现
  // 'color': ColorControl,
  // 'shadow': ShadowControl,
  // 'border': BorderControl,
  // 'border-radius': BorderRadiusControl,
  // 'spacing': SpacingControl,
  // 'size': SizeControl,
  // 'position': PositionControl,
  // 'flex': FlexControl,
  // 'transform': TransformControl,
  // 'filter': FilterControl,
  // 'number': NumberControl,
  // 'text': TextControl,
  // 'select': SelectControl,
  // 'checkbox': CheckboxControl,
  // 'font': FontControl,
  // 'decoration-sticker': DecorationStickerControl,
  // 'icon-replacer': IconReplacerControl,
  // 'background-image': BackgroundImageControl,
  // 'gradient-editor': GradientEditorControl,
  // 'transition': TransitionControl,
  // 'animation': AnimationControl,
  // 'border-image': BorderImageControl
};

/**
 * TODO: [P0] 控件工厂函数
 * 
 * @description
 * 根据控件类型创建对应的控件实例
 * 
 * @param {string} controlType - 控件类型（从 css-property-dict.js 查询）
 * @param {object} config - 控件配置
 * @returns {Object|null} 控件实例（未实现时返回null）
 * 
 * 逻辑：
 * 1. 从 CONTROL_CLASS_MAP 查找控件类
 * 2. 如果找不到，记录警告并返回 TextControl（默认）
 * 3. 创建实例：new ControlClass(config)
 * 4. 返回控件实例
 * 
 * 示例：
 * createControl('color', { defaultValue: '#ff0000' })
 * → 返回 ColorControl 实例
 * 
 * 调用位置：
 * - beginner-mode.js 的 renderPropertyControl()
 * - expert-mode.js 的 renderPropertyControl()
 */
export function createControl(controlType, config = {}) {
  // TODO实现
  return null;
  // const ControlClass = CONTROL_CLASS_MAP[controlType];
  // if (!ControlClass) {
  //   logger.warn('[property-controls] 未知控件类型:', controlType);
  //   return new TextControl(config);  // 默认返回文本控件
  // }
  // return new ControlClass(config);
}

/**
 * TODO: [P1] 获取控件类
 * 
 * @description
 * 根据控件类型返回对应的类（不创建实例）
 * 
 * @param {string} controlType - 控件类型
 * @returns {Function|undefined} 控件类构造函数
 * 
 * 用途：
 * - 让调用者自己创建实例
 * - 更灵活的控制
 * 
 * 逻辑：
 * 1. 从 CONTROL_CLASS_MAP 查找
 * 2. 返回类（不是实例）
 */
export function getControlClass(controlType) {
  // TODO实现
  return undefined;
  // return CONTROL_CLASS_MAP[controlType];
}

/**
 * TODO: [P1] 获取所有支持的控件类型
 * 
 * @description
 * 返回所有已注册的控件类型列表
 * 
 * @returns {Array<string>} 控件类型数组
 * 
 * 用途：
 * - 调试时检查哪些控件可用
 * - 验证 css-property-dict.js 的控件类型是否都已实现
 */
export function getSupportedControlTypes() {
  // TODO实现
  return [];
  // return Object.keys(CONTROL_CLASS_MAP);
}

