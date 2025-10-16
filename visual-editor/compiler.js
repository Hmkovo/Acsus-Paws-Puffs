/**
 * @file 可视化编辑器 - 编译器
 * @description
 * 负责中文CSS与英文CSS的双向翻译。
 * 
 * 核心功能：
 * 1. parseChineseCSS() - 中文CSS → 临时数据（Map/对象）
 * 2. generateChineseCSS() - 临时数据 → 中文CSS
 * 3. compileToEnglishCSS() - 中文CSS → 英文CSS
 * 4. smartMerge() - 智能合并（标记分隔符）
 * 
 * 重要说明：
 * - Map/对象是临时变量（运行时的"草稿纸"），不是存储
 * - 编译是实时的，不保存编译结果
 * - 关闭酒馆后，临时变量消失，但中文CSS还在 extension_settings 里
 * 
 * @module visual-editor-compiler
 * @requires visual-editor-element-map - 元素映射
 * @requires visual-editor-property-map - 属性映射
 * 
 * Grep标记：[IMPORT] [CORE] [UTIL] [EXPORT]
 */

// [IMPORT] 导入映射表
import { getSelector } from './st-element-map.js';
import { translateProperty, translateValue } from './css-property-dict.js';

// [CORE] 核心翻译函数

/**
 * 解析中文CSS为临时数据结构
 * 
 * @description
 * 将中文CSS字符串解析为 Map 数据结构（运行时的"草稿纸"）：
 * 1. 按行分割
 * 2. 识别元素名（大括号外的）
 * 3. 识别属性和值（大括号内的）
 * 4. 存储到 Map 中
 * 
 * 注意：Map 是临时变量，不保存到 extension_settings
 * 
 * @param {string} chineseCSS - 中文CSS字符串
 * @returns {Map<string, Object>} 元素名 → 样式对象的映射
 * 
 * @example
 * // 输入：
 * // 用户消息 {
 * //   背景颜色: #FFC0CB
 * //   圆角: 20px
 * // }
 * // 输出：
 * // Map {
 * //   '用户消息' => { '背景颜色': '#FFC0CB', '圆角': '20px' }
 * // }
 */
export function parseChineseCSS(chineseCSS) {
  const stylesMap = new Map();

  if (!chineseCSS || typeof chineseCSS !== 'string') {
    return stylesMap;
  }

  const lines = chineseCSS.split('\n');
  let currentElement = null;
  let currentStyles = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 跳过空行和注释
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // 检测元素名（行末有{且不包含:）
    if (line.includes('{') && !line.includes(':')) {
      // 保存前一个元素（如果有）
      if (currentElement && Object.keys(currentStyles).length > 0) {
        stylesMap.set(currentElement, { ...currentStyles });
      }

      // 开始新元素
      currentElement = line.replace('{', '').trim();
      currentStyles = {};
      continue;
    }

    // 检测属性（包含:且在元素内）
    if (line.includes(':') && currentElement) {
      // 移除末尾的分号
      const cleanLine = line.replace(/;?\s*$/, '');
      const colonIndex = cleanLine.indexOf(':');

      if (colonIndex > 0) {
        const property = cleanLine.substring(0, colonIndex).trim();
        const value = cleanLine.substring(colonIndex + 1).trim();

        if (property && value) {
          currentStyles[property] = value;
        }
      }
    }

    // 检测结束括号
    if (line.includes('}') && currentElement) {
      stylesMap.set(currentElement, { ...currentStyles });
      currentElement = null;
      currentStyles = {};
    }
  }

  // 保存最后一个元素（如果没有闭合括号）
  if (currentElement && Object.keys(currentStyles).length > 0) {
    stylesMap.set(currentElement, { ...currentStyles });
  }

  return stylesMap;
}

/**
 * 将临时数据生成中文CSS字符串
 * 
 * @description
 * 将 Map 或 Object 格式的样式数据转换为中文CSS字符串：
 * 1. 遍历样式数据
 * 2. 格式化为中文CSS格式（元素名 { 属性: 值 }）
 * 3. 添加注释和分隔符以提高可读性
 * 
 * @param {Map<string, Object>|Object} stylesData - 样式数据（Map 或普通对象）
 * @returns {string} 中文CSS字符串
 */
export function generateChineseCSS(stylesData) {
  let chineseCSS = '';

  // 转换为统一格式（Map）
  const dataMap = stylesData instanceof Map ? stylesData : new Map(Object.entries(stylesData));

  // 遍历所有元素
  for (const [elementName, styles] of dataMap) {
    if (!styles || Object.keys(styles).length === 0) {
      continue;
    }

    // 添加元素名
    chineseCSS += `${elementName} {\n`;

    // 添加所有属性
    for (const [property, value] of Object.entries(styles)) {
      chineseCSS += `  ${property}: ${value}\n`;
    }

    // 闭合括号
    chineseCSS += `}\n\n`;
  }

  return chineseCSS.trim();
}

/**
 * 将中文CSS编译为英文CSS
 * 
 * @description
 * 编译流程：
 * 1. 调用 parseChineseCSS() 解析中文CSS → stylesMap
 * 2. 遍历 stylesMap
 * 3. 查找CSS选择器（调用 element-map 的 getSelector）
 * 4. 转换属性名和值（调用 property-map 的 translateProperty 和 translateValue）
 * 5. 生成标准CSS字符串
 * 
 * 注意：编译是实时的，不保存编译结果
 * 
 * @param {string} chineseCSS - 中文CSS字符串
 * @returns {string} 英文CSS字符串
 */
export function compileToEnglishCSS(chineseCSS) {
  if (!chineseCSS) {
    return '';
  }

  let englishCSS = '';

  // 1. 解析中文CSS
  const stylesMap = parseChineseCSS(chineseCSS);

  // 2. 遍历所有元素
  for (const [elementName, styles] of stylesMap) {
    // 3. 查找CSS选择器
    const selector = getSelector(elementName);

    if (!selector) {
      console.warn(`[编译器] 未找到元素"${elementName}"的CSS选择器`);
      continue;
    }

    // 开始CSS规则
    englishCSS += `${selector} {\n`;

    // 4. 转换所有属性
    for (const [chineseProp, chineseValue] of Object.entries(styles)) {
      const cssProp = translateProperty(chineseProp);

      if (!cssProp) {
        console.warn(`[编译器] 未找到属性"${chineseProp}"的CSS属性名`);
        continue;
      }

      const cssValue = translateValue(chineseValue, cssProp);
      englishCSS += `  ${cssProp}: ${cssValue};\n`;
    }

    // 闭合CSS规则
    englishCSS += `}\n\n`;
  }

  return englishCSS.trim();
}

// [UTIL] 工具函数

/**
 * 分隔符常量
 * 
 * @description
 * 用于在输入框中标记中文CSS区域
 * 保护用户手写的原生CSS不被覆盖
 */
export const VISUAL_MARKER_START = '/* ===== ˚₊·⸅ 可视化 开始 ⸅·₊˚ ===== */';
export const VISUAL_MARKER_END = '/* ===== ˚₊·⸅ 可视化 结束 ⸅·₊˚ ===== */';

/**
 * 从输入框提取中文CSS
 * 
 * @description
 * 从输入框的完整内容中提取分隔符内的中文CSS
 * 如果没有分隔符，返回空字符串
 * 
 * @param {string} inputContent - 输入框的完整内容
 * @returns {string} 中文CSS（不包含分隔符）
 * 
 * @example
 * extractChineseCSS('user css\n/* ===== 开始 ===== *\/\n中文CSS\n/* ===== 结束 ===== *\/')
 * // 返回: '中文CSS'
 */
export function extractChineseCSS(inputContent) {
  if (!inputContent || typeof inputContent !== 'string') {
    return '';
  }

  const startIndex = inputContent.indexOf(VISUAL_MARKER_START);
  const endIndex = inputContent.indexOf(VISUAL_MARKER_END);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return ''; // 没有找到分隔符
  }

  // 提取分隔符之间的内容
  const chineseCSS = inputContent.substring(
    startIndex + VISUAL_MARKER_START.length,
    endIndex
  ).trim();

  return chineseCSS;
}

/**
 * 智能合并中文CSS到输入框
 * 
 * @description
 * 将新的中文CSS智能合并到输入框内容中：
 * 1. 如果有分隔符，更新分隔符内的内容
 * 2. 如果没有分隔符，在末尾添加分隔符和中文CSS
 * 3. 保留分隔符外的用户原生CSS
 * 
 * @param {string} inputContent - 输入框的完整内容
 * @param {string} newChineseCSS - 新的中文CSS
 * @returns {string} 合并后的完整内容
 * 
 * @example
 * mergeChineseCSS('user css', '气泡外框 { 背景颜色: #000 }')
 * // 返回: 'user css\n\n/* ===== 开始 ===== *\/\n气泡外框 { 背景颜色: #000 }\n/* ===== 结束 ===== *\/'
 */
export function mergeChineseCSS(inputContent, newChineseCSS) {
  if (!newChineseCSS || newChineseCSS.trim() === '') {
    // 如果新的中文CSS为空，移除分隔符区域
    return removeChineseCSSMarkers(inputContent);
  }

  const startIndex = inputContent.indexOf(VISUAL_MARKER_START);
  const endIndex = inputContent.indexOf(VISUAL_MARKER_END);

  if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
    // 有分隔符：更新分隔符内的内容
    const before = inputContent.substring(0, startIndex).trim();
    const after = inputContent.substring(endIndex + VISUAL_MARKER_END.length).trim();

    const parts = [];
    if (before) parts.push(before);
    parts.push(`${VISUAL_MARKER_START}\n${newChineseCSS}\n${VISUAL_MARKER_END}`);
    if (after) parts.push(after);

    return parts.join('\n\n');
  } else {
    // 没有分隔符：在末尾添加
    const trimmedInput = (inputContent || '').trim();
    const parts = [];
    if (trimmedInput) parts.push(trimmedInput);
    parts.push(`${VISUAL_MARKER_START}\n${newChineseCSS}\n${VISUAL_MARKER_END}`);

    return parts.join('\n\n');
  }
}

/**
 * 移除分隔符区域
 * 
 * @description
 * 从输入框内容中移除整个分隔符区域（包括分隔符和中文CSS）
 * 保留其他内容
 * 
 * @param {string} inputContent - 输入框的完整内容
 * @returns {string} 移除分隔符区域后的内容
 */
export function removeChineseCSSMarkers(inputContent) {
  if (!inputContent || typeof inputContent !== 'string') {
    return '';
  }

  const startIndex = inputContent.indexOf(VISUAL_MARKER_START);
  const endIndex = inputContent.indexOf(VISUAL_MARKER_END);

  if (startIndex === -1 || endIndex === -1) {
    return inputContent.trim(); // 没有分隔符，直接返回
  }

  const before = inputContent.substring(0, startIndex).trim();
  const after = inputContent.substring(endIndex + VISUAL_MARKER_END.length).trim();

  const parts = [];
  if (before) parts.push(before);
  if (after) parts.push(after);

  return parts.join('\n\n');
}

/**
 * 检测字符串中是否包含中文CSS
 * 
 * @description
 * 使用正则表达式检测 CSS 文本中是否包含中文字符（\u4e00-\u9fa5）
 * 用于判断是否需要编译
 * 
 * @param {string} cssText - CSS文本
 * @returns {boolean} 是否包含中文CSS
 */
export function hasChineseCSS(cssText) {
  // TODO: 实现检测逻辑
  // 检测是否有中文字符
  return /[\u4e00-\u9fa5]/.test(cssText);
}

/**
 * 解析中文CSS，提取指定元素的样式
 * 
 * @description
 * 从中文CSS字符串中提取单个元素的样式对象
 * 复用 parseChineseCSS 函数，然后从 Map 中获取指定元素
 * 
 * @param {string} chineseCSS - 中文CSS字符串
 * @param {string} elementName - 元素名称（如"气泡外框"）
 * @returns {Object|null} 样式对象（如 { "背景颜色": "#ff0000", "圆角": "10px" }）
 * 
 * @example
 * parseElementStyles('气泡外框 { 背景颜色: #ff0000 }', '气泡外框')
 * // 返回: { "背景颜色": "#ff0000" }
 */
export function parseElementStyles(chineseCSS, elementName) {
  if (!chineseCSS || !elementName) {
    return null;
  }

  // 复用已有的 parseChineseCSS 函数
  const stylesMap = parseChineseCSS(chineseCSS);

  // 从 Map 中获取指定元素的样式
  const styles = stylesMap.get(elementName);

  return styles || null;
}

// [DEPRECATED] smartMergeCSS 函数已废弃
// 原因：编译结果直接应用到 DOM，不写回输入框
// 输入框只显示中文CSS，用 mergeChineseCSS 函数处理

// [EXPORT] 导出
export default {
  parseChineseCSS,
  generateChineseCSS,
  compileToEnglishCSS,
  hasChineseCSS,
  parseElementStyles,
  VISUAL_MARKER_START,
  VISUAL_MARKER_END,
  extractChineseCSS,
  mergeChineseCSS,
  removeChineseCSSMarkers
};




