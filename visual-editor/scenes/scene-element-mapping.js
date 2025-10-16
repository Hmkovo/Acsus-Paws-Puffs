/**
 * @file 元素→场景映射
 * @description 定义每个元素推荐使用什么场景
 * 
 * 为什么需要这个文件？
 * 用户点击左侧元素列表的"气泡外框" → 新手模式问："我应该显示什么场景？"
 * → 查询此文件 → '气泡外框' 的推荐场景 = '消息气泡'
 * → 加载 scene-presets.js 的 '消息气泡' 配置 → 显示对应的属性分组
 * 
 * 为什么不合并到 st-element-map.js？
 * - st-element-map.js：记录酒馆有哪些元素（600行，已经很多）
 * - scene-element-mapping.js：记录元素用什么场景（200行）
 * - 合并后800行太长，分开后逻辑清晰好维护
 * 
 * 参考：
 * - 【文件结构方案】第1062-1129行：scene-element-mapping.js详细说明
 * - 【协作表格】场景1.1-8.5：元素与场景的对应关系
 */

import logger from '../../logger.js';

// [MAP] 元素场景映射
export const sceneElementMapping = {
  // ========================================
  // 聊天页面元素（约50个）
  // ========================================

  // TODO: [交给AI-3] 从【协作表格】场景1.1-1.8提取所有元素的场景映射
  // 参考：【协作表格】第27-245行

  // 示例：消息气泡相关元素
  '气泡外圈（用户）': {
    元素类型: 'container',
    推荐场景: '消息气泡',
    可选场景: ['容器布局', '卡片设计'],
    说明: '用户消息的最外层容器'
  },

  '气泡外圈（角色）': {
    元素类型: 'container',
    推荐场景: '消息气泡',
    可选场景: ['容器布局', '卡片设计'],
    说明: '角色消息的最外层容器'
  },

  '气泡内圈（用户）': {
    元素类型: 'container',
    推荐场景: '容器布局',
    可选场景: ['消息气泡'],
    说明: '用户消息的内容容器'
  },

  // TODO: 其他消息气泡元素
  // - 普通文字（用户）
  // - 普通文字（角色）
  // - 加粗文字
  // - 斜体文字
  // - 代码块
  // - 引用块
  // - 等等...

  // 头像相关元素（P0阶段：只包含真实DOM元素）
  '角色头像容器': {
    元素类型: 'container',
    推荐场景: '头像设计',
    可选场景: [],
    说明: '控制头像位置和旋转'
  },

  '角色头像图片': {
    元素类型: 'image',
    推荐场景: '头像设计',
    可选场景: [],
    说明: '头像图片本身，调整边框、圆角、阴影'
  },

  '用户头像容器': {
    元素类型: 'container',
    推荐场景: '头像设计',
    可选场景: [],
    说明: '控制头像位置和旋转'
  },

  '用户头像图片': {
    元素类型: 'image',
    推荐场景: '头像设计',
    可选场景: [],
    说明: '头像图片本身，调整边框、圆角、阴影'
  },

  // 气泡内小元素（10个元素，使用MessageElementPositionControl）
  '角色头像包装器': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: ['头像设计'],
    说明: '头像包装器，支持9宫格定位和flex布局'
  },

  '角色左箭头': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '左箭头按钮，用于切换回复'
  },

  '角色文本块': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '消息文本内容区域'
  },

  '角色右箭头': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '右箭头按钮（注意：暂不支持flex模式）'
  },

  '角色分页计数器': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '分页计数器（如 1/15）（注意：暂不支持flex模式）'
  },

  '角色消息ID': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '消息ID显示（仅支持absolute定位）'
  },

  '角色AI计时器': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: 'AI生成时间显示（仅支持absolute定位）'
  },

  '角色字符数': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '字符数计数器（仅支持absolute定位）'
  },

  '角色名': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '角色名称文本（仅支持absolute定位）'
  },

  '角色时间戳': {
    元素类型: 'message-element',
    推荐场景: '气泡内元素定位',
    可选场景: [],
    说明: '消息时间戳（仅支持absolute定位）'
  },

  // 示例：装饰元素
  '导航栏装饰贴纸': {
    元素类型: 'decoration',
    推荐场景: '贴纸装饰',
    可选场景: [],
    说明: '导航栏右下角的装饰图片（::after伪元素）'
  },

  // TODO: 其他装饰元素

  // ========================================
  // 主界面元素（约15个）
  // ========================================

  // TODO: [交给AI-3] 从【协作表格】场景2.1-2.3提取
  // - 导航栏容器
  // - 导航栏底部背景
  // - 左上角图标1-9
  // - 等等...

  // ========================================
  // 其他分类元素（约55个）
  // ========================================

  // TODO: [交给AI-3] 从【协作表格】提取剩余元素
  // - 角色管理页面元素
  // - 世界书元素
  // - 预设页面元素
  // - 输入框元素
  // - 按钮元素
  // - 等等...
};

// ========================================
// [FUNC] 查询函数
// ========================================

/**
 * 获取推荐场景
 * 
 * @param {string} elementName - 元素名称（中文）
 * @returns {string|null} 推荐场景名称，如果不存在返回null
 */
export function getRecommendedScene(elementName) {
  const mapping = sceneElementMapping[elementName];
  if (!mapping) {
    logger.warn('[scene-element-mapping.getRecommendedScene] 元素不存在:', elementName);
    return null;
  }
  return mapping.推荐场景;
}

/**
 * 获取可选场景
 * 
 * @param {string} elementName - 元素名称
 * @returns {Array<string>} 可选场景名称数组
 */
export function getOptionalScenes(elementName) {
  return sceneElementMapping[elementName]?.可选场景 || [];
}

/**
 * TODO: [P1] 获取元素类型
 * 
 * @description
 * 获取元素的类型（container/text/decoration/interactive）
 * 
 * @param {string} elementName - 元素名称
 * @returns {string|null} 元素类型
 * 
 * 示例：
 * getElementType('气泡外圈（用户）')
 * → 'container'
 */
export function getElementType(elementName) {
  // TODO实现
  // return sceneElementMapping[elementName]?.元素类型;
}

/**
 * TODO: [P1] 获取元素说明
 * 
 * @description
 * 获取元素的说明文本
 * 
 * @param {string} elementName - 元素名称
 * @returns {string|null} 说明文本
 * 
 * 用途：
 * - 在UI中显示元素的解释
 * - 帮助用户理解元素的作用
 * 
 * 示例：
 * getElementDescription('气泡外圈（用户）')
 * → '用户消息的最外层容器'
 */
export function getElementDescription(elementName) {
  // TODO实现
  // return sceneElementMapping[elementName]?.说明;
}

/**
 * TODO: [P1] 根据场景获取适用元素
 * 
 * @description
 * 反向查询：找到所有推荐使用某场景的元素
 * 
 * @param {string} sceneName - 场景名称
 * @returns {Array<string>} 元素名称列表
 * 
 * 逻辑：
 * 1. 遍历 sceneElementMapping
 * 2. 筛选 推荐场景 或 可选场景 包含指定场景的元素
 * 3. 返回元素名称数组
 * 
 * 用途：
 * - 显示"这个场景可以用在哪些元素上"
 * - 帮助用户了解场景的适用范围
 * 
 * 示例：
 * getElementsByScene('消息气泡')
 * → ['气泡外圈（用户）', '气泡外圈（角色）', ...]
 */
export function getElementsByScene(sceneName) {
  // TODO实现
}

/**
 * TODO: [P1] 根据元素类型获取元素列表
 * 
 * @description
 * 筛选指定类型的所有元素
 * 
 * @param {string} elementType - 元素类型
 * @returns {Array<string>} 元素名称列表
 * 
 * 示例：
 * getElementsByType('decoration')
 * → ['导航栏装饰贴纸', '聊天区域装饰贴纸', ...]
 */
export function getElementsByType(elementType) {
  // TODO实现
}

/**
 * TODO: [P2] 验证映射完整性
 * 
 * @description
 * 检查映射表是否完整、有效
 * 
 * @returns {Object} 验证结果 { valid: boolean, errors: Array<string> }
 * 
 * 检查项：
 * - 是否有元素没有推荐场景
 * - 推荐场景是否在 scene-presets.js 中定义
 * - 可选场景是否在 scene-presets.js 中定义
 * - 元素类型是否合法（container/text/decoration/interactive）
 * 
 * 用途：
 * - 开发时检查配置错误
 * - 帮助AI-3填写数据时验证
 */
export function validateMapping() {
  // TODO实现
}

/**
 * TODO: [P2] 获取映射统计信息
 * 
 * @description
 * 返回映射表的统计数据
 * 
 * @returns {Object} 统计信息
 * {
 *   总元素数: number,
 *   按类型统计: { container: number, text: number, ... },
 *   按场景统计: { '消息气泡': number, '贴纸装饰': number, ... }
 * }
 * 
 * 用途：
 * - 了解映射表的覆盖情况
 * - 检查是否有场景没有对应元素
 */
export function getMappingStats() {
  // TODO实现
}

