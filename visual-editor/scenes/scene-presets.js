/**
 * @file 场景配置
 * @description 定义20个场景的完整配置
 * 
 * 场景模式核心理念：
 * - 场景 = 拼装说明书（告诉新手用哪些积木）
 * - 聚合不同CSS面板的属性到场景中
 * - 智能提示帮助新手（提示显示在控件旁边，只提示不自动设置）
 * 
 * 参考：
 * - 【文件结构方案】第926-1059行：scene-presets.js详细说明
 * - 【文件结构方案】第989-1008行：智能提示配置示例
 * - 【协作表格】场景1.1-8.5：20个场景的详细定义
 */

import logger from '../../logger.js';

// [MAP] 场景预设
export const scenePresets = {
  // ========================================
  // 场景1：消息气泡
  // ========================================
  '消息气泡': {
    id: 'message-bubble',
    名称: '消息气泡',
    描述: '设计聊天消息的外观样式',
    图标: 'fa-comment',
    适用元素类型: ['container', 'message'],

    // TODO: [交给AI-3] 从【协作表格】场景1.1提取属性分组
    // 参考：【协作表格】场景1.1的属性列表
    属性分组: [
      {
        组名: '外观设计',
        图标: 'fa-palette',
        默认展开: false,
        // TODO: 填写属性列表
        // 使用的控件：ColorControl、BorderControl、BorderRadiusControl、ShadowControl
        // 属性列表: ['background-color', 'border', 'border-radius', 'box-shadow']
        属性列表: []
      },
      {
        组名: '间距设置',
        图标: 'fa-arrows-alt',
        默认展开: false,
        // TODO: 填写属性列表
        // 使用的控件：SpacingControl
        // 属性列表: ['padding', 'margin']
        属性列表: []
      },
      {
        组名: '文字样式',
        图标: 'fa-font',
        默认展开: false,
        // TODO: 填写属性列表
        // 使用的控件：FontControl、ColorControl
        // 属性列表: ['font-size', 'color', 'line-height']
        属性列表: []
      }
    ],

    // 智能提示配置（空数组 = 没有特殊提示）
    智能提示: []
  },

  // ========================================
  // 场景2：贴纸装饰
  // ========================================
  '贴纸装饰': {
    id: 'decoration-sticker',
    名称: '贴纸装饰',
    描述: '在元素上添加装饰图片（如贴纸、光环、背景等）',
    图标: 'fa-image',
    适用元素类型: ['decoration'],

    // TODO: [交给AI-3] 从【协作表格】提取贴纸装饰场景的属性分组
    属性分组: [
      {
        组名: '图片设置',
        图标: 'fa-camera',
        默认展开: false,
        // TODO: 填写属性列表
        // 使用的控件：BackgroundImageControl 或 DecorationStickerControl
        // 属性列表: ['background-image', 'background-size', 'background-position', 'background-repeat']
        属性列表: []
      },
      {
        组名: '位置调整',
        图标: 'fa-arrows-alt',
        默认展开: false,
        // TODO: 填写属性列表
        // 使用的控件：PositionControl、SizeControl
        // 属性列表: ['position', 'top', 'left', 'width', 'height']
        属性列表: []
      },
      {
        组名: '高级选项',
        图标: 'fa-sliders-h',
        默认展开: false,
        // TODO: 填写属性列表
        // 使用的控件：NumberControl、SelectControl、TransformControl、FilterControl
        // 属性列表: ['z-index', 'opacity', 'pointer-events', 'overflow', 'transform', 'filter']
        属性列表: []
      }
    ],

    // 智能提示配置（用户要求：只提示，不自动设置）
    // 重要：触发条件是函数！接收当前值，返回布尔值
    智能提示: [
      {
        目标属性: 'position',
        触发条件: (value) => !value || value === 'static',  // 函数！
        提示级别: 'info',
        提示文本: '贴纸通常需要设置为绝对定位',
        提示位置: '控件旁边',
        推荐值: 'absolute',
        快捷按钮文本: '一键设置为绝对定位'
      },
      {
        目标属性: 'pointer-events',
        触发条件: (value) => !value || value === 'auto',  // 函数！
        提示级别: 'warning',
        提示文本: '建议设置穿透点击，避免挡住下方内容',
        提示位置: '控件旁边',
        推荐值: 'none',
        快捷按钮文本: '一键启用穿透'
      }
    ]
  },

  // ========================================
  // 场景3-20：其他场景（待定义）
  // ========================================

  // TODO: [交给AI-3] 从【协作表格】提取剩余18个场景
  // 参考：【协作表格】场景列表

  // 场景3：消息文字场景
  // TODO: 定义

  // ========================================
  // 场景4：头像设计（使用MessageElementPositionControl）
  // ========================================
  '头像设计': {
    id: 'avatar-design',
    名称: '头像设计',
    描述: '调整聊天页面头像的位置、外观和装饰',
    图标: 'fa-user-circle',
    适用元素类型: ['container', 'image'],

    // 推荐元素列表
    推荐元素: [
      '角色头像包装器',  // 推荐使用新控件定位
      '角色头像容器',
      '角色头像图片'
    ],

    属性分组: [
      {
        组名: '位置控制',
        图标: 'fa-arrows-alt',
        默认展开: true,
        属性列表: [
          {
            css属性: 'position',
            控件类型: 'MessageElementPositionControl',
            控件配置: {
              // elementType 会从当前选中的元素自动获取
              defaultMode: 'absolute',
              defaultPosition: 'top-left',
              defaultOffsets: {}
            }
          },
          'transform'      // 变换（旋转、缩放、位移）- 使用TransformControl
        ]
      },
      {
        组名: '外观样式',
        图标: 'fa-palette',
        默认展开: false,
        属性列表: [
          'width',         // 宽度
          'height',        // 高度
          'border',        // 边框样式
          'border-color',  // 边框颜色
          'border-radius', // 圆角
          'box-shadow',    // 阴影
          'background',    // 背景渐变
          'filter'         // 滤镜效果
        ]
      },
      {
        组名: '装饰贴纸',
        图标: 'fa-image',
        默认展开: false,
        说明: '【P1功能】通过伪元素或@装饰语法在头像上添加装饰图片（当前TODO）',
        属性列表: []  // P1阶段实现
      }
    ],

    智能提示: [
      {
        目标属性: 'position',
        触发条件: (value, context) => {
          // 如果使用了absolute模式
          const isAbsoluteMode = value?.includes('定位: 绝对');
          return isAbsoluteMode;
        },
        提示级别: 'info',
        提示文本: '💡 脱离文档流模式：头像浮在气泡上，不挤压文字',
        提示位置: '控件旁边'
      },
      {
        目标属性: 'position',
        触发条件: (value, context) => {
          // 如果使用了flex模式
          const isFlexMode = value?.includes('显示: 伸缩盒');
          return isFlexMode;
        },
        提示级别: 'info',
        提示文本: '💡 占用空间模式：头像占用空间，会挤压文字形成自然布局',
        提示位置: '控件旁边'
      }
    ]
  },

  // ========================================
  // 场景5：气泡内元素定位（MessageElementPositionControl）
  // ========================================
  '气泡内元素定位': {
    id: 'message-element-positioning',
    名称: '气泡内元素定位',
    描述: '调整气泡内小元素（头像、时间戳、计时器、箭头等）的位置',
    图标: 'fa-location-dot',
    适用元素类型: ['message-element'],

    // 推荐元素列表（10个气泡内元素）
    推荐元素: [
      '角色头像包装器',        // A类：全支持
      '角色左箭头',            // A类：全支持
      '角色文本块',            // A类：全支持
      '角色右箭头',            // A类：暂不支持flex
      '角色分页计数器',        // A类：暂不支持flex
      '角色消息ID',            // B类：仅absolute
      '角色AI计时器',          // B类：仅absolute
      '角色字符数',            // B类：仅absolute
      '角色名',                // B类：仅absolute
      '角色时间戳'             // B类：仅absolute
    ],

    属性分组: [
      {
        组名: '位置',
        图标: 'fa-arrows-up-down-left-right',
        默认展开: true,
        属性列表: [
          {
            css属性: 'position',
            控件类型: 'MessageElementPositionControl',
            控件配置: {
              // elementType 会从上下文自动传入（当前选中的元素）
              defaultMode: 'absolute',
              defaultPosition: 'top-left',
              defaultOffsets: {}
            }
          }
        ]
      }
    ],

    智能提示: [
      {
        目标属性: 'position',
        触发条件: (value, context) => {
          // 如果当前元素是右箭头或分页计数器，且选择了flex模式
          const needsSeparator = ['角色右箭头', '角色分页计数器'].includes(context?.elementName);
          const isFlexMode = value?.includes('显示: 伸缩盒');
          return needsSeparator && isFlexMode;
        },
        提示级别: 'warning',
        提示文本: '⚠️ 右箭头和分页计数器暂不支持flex模式，需要先实现消息元素分离器',
        提示位置: '控件旁边'
      },
      {
        目标属性: 'position',
        触发条件: (value, context) => {
          // 如果使用了absolute模式
          const isAbsoluteMode = value?.includes('定位: 绝对');
          return isAbsoluteMode;
        },
        提示级别: 'info',
        提示文本: '💡 脱离文档流模式：元素浮在气泡上，不挤压文字',
        提示位置: '控件旁边'
      },
      {
        目标属性: 'position',
        触发条件: (value, context) => {
          // 如果使用了flex模式
          const isFlexMode = value?.includes('显示: 伸缩盒');
          return isFlexMode;
        },
        提示级别: 'info',
        提示文本: '💡 占用空间模式：元素占用空间，会挤压文字形成自然布局',
        提示位置: '控件旁边'
      }
    ]
  },

  // 场景6：容器布局场景
  // TODO: 定义

  // 场景7：卡片设计场景
  // TODO: 定义

  // 场景8：输入框设计场景
  // TODO: 定义

  // 场景9：按钮设计场景
  // TODO: 定义

  // 场景10：文本排版场景
  // TODO: 定义

  // 场景11：图标设计场景
  // TODO: 定义

  // 场景12：标签设计场景
  // TODO: 定义

  // 场景13：下拉菜单场景
  // TODO: 定义

  // 场景14：滚动条场景
  // TODO: 定义

  // 场景15：遮罩层场景
  // TODO: 定义

  // 场景16：提示框场景
  // TODO: 定义

  // 场景17：分隔线场景
  // TODO: 定义

  // 场景18：进度条场景
  // TODO: 定义

  // 场景19：开关按钮场景
  // TODO: 定义

  // 场景20：表格场景
  // TODO: 定义
};

// ========================================
// [FUNC] 查询函数
// ========================================

/**
 * 获取场景配置
 * 
 * @param {string} sceneName - 场景名称
 * @returns {Object|null} 场景配置对象，如果不存在返回null
 */
export function getSceneConfig(sceneName) {
  const config = scenePresets[sceneName];
  if (!config) {
    logger.warn('[scene-presets.getSceneConfig] 场景不存在:', sceneName);
    return null;
  }
  return config;
}

/**
 * 获取所有场景列表
 * 
 * @returns {Array<string>} 场景名称数组
 */
export function getAllScenes() {
  return Object.keys(scenePresets);
}

/**
 * TODO: [P1] 根据元素类型获取推荐场景
 * 
 * @description
 * 根据元素类型筛选适用的场景
 * 
 * @param {string} elementType - 元素类型（container/text/decoration/interactive）
 * @returns {Array<string>} 适用的场景名称列表
 * 
 * 逻辑：
 * 1. 遍历 scenePresets
 * 2. 筛选 适用元素类型 包含指定类型的场景
 * 3. 返回场景名称数组
 * 
 * 示例：
 * getScenesByElementType('decoration')
 * → ['贴纸装饰', '图标设计', ...]
 */
export function getScenesByElementType(elementType) {
  // TODO实现
  return [];
}

/**
 * TODO: [P1] 获取场景的属性列表（扁平化）
 * 
 * @description
 * 从场景配置中提取所有属性，返回扁平的属性数组
 * 
 * @param {string} sceneName - 场景名称
 * @returns {Array<string>} CSS属性名数组
 * 
 * 逻辑：
 * 1. 获取场景配置
 * 2. 遍历所有属性分组
 * 3. 合并所有属性列表
 * 4. 返回扁平数组
 * 
 * 示例：
 * getSceneProperties('消息气泡')
 * → ['background-color', 'border', 'border-radius', 'box-shadow', 'padding', 'margin', ...]
 */
export function getSceneProperties(sceneName) {
  // TODO实现
  return [];
}

/**
 * TODO: [P2] 验证场景配置
 * 
 * @description
 * 检查场景配置是否完整有效
 * 
 * @param {string} sceneName - 场景名称
 * @returns {Object} 验证结果 { valid: boolean, errors: Array<string> }
 * 
 * 检查项：
 * - 是否存在必需字段（id、名称、描述等）
 * - 属性分组是否为空
 * - 属性是否在 css-property-dict.js 中定义
 * - 智能提示配置是否合法
 * 
 * 用途：
 * - 开发时检查配置错误
 * - 帮助AI-3填写数据时验证
 */
export function validateSceneConfig(sceneName) {
  // TODO实现
}

