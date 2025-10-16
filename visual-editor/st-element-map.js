/**
 * @file 可视化编辑器 - 元素映射表
 * @description
 * 负责中文元素名到CSS选择器的映射。
 * 
 * 提供9大分类：
 * 1. 全局通用（标题栏、输入框、滚动条等）
 * 2. 主界面（导航栏、下方输入框）
 * 3. 聊天页面（消息气泡、头像、文本样式）- 重中之重
 * 4. 角色管理页面
 * 5. 用户角色管理页面
 * 6. 世界书页面
 * 7. 预设管理页面
 * 8. 弹窗与对话框
 * 9. 功能开关（隐藏/显示元素）
 * 
 * @module visual-editor-element-map
 * @requires 无
 * 
 * Grep标记：[MAP] [FUNC] [EXPORT]
 */

// [MAP] 元素映射表（9大分类）
export const elementMap = {
  /**
   * 1️⃣ 全局通用元素
   * 
   * @description
   * 包含：标题栏、输入框、滚动条、勾选框、下拉选择框等
   * 这些元素在多个页面都会出现，修改后全局生效
   */
  '全局通用': {
    // TODO: 用户补充以下元素的CSS选择器
    // '所有标题栏': '.inline-drawer-header, #user-settings-block h4, .standoutHeader',
    // '所有输入框': 'input[type="text"], textarea',
    // '滚动条': '::-webkit-scrollbar',
    // '勾选框': 'input[type="checkbox"]',
    // '下拉箭头': 'select',
    // '下拉选择框': '.selector',
  },

  /**
   * 2️⃣ 主界面元素
   * 
   * @description
   * 包含：上方导航栏、下方输入框、滑块组件等
   */
  '主界面': {
    '上方导航栏': {
      // TODO: 用户补充导航栏元素
      // '导航栏整体': '#top-bar',
      // '导航栏按钮（9个图标）': '#top-bar .menu_button',
      // '导航栏装饰': '#top-bar::after',
    },
    '下方输入框': {
      // TODO: 用户补充输入框元素
      // '输入框整体': '#send_textarea',
      // '发送按钮': '#send_but',
      // '终止按钮': '#mes_stop',
    },
    '滑块组件': {
      // TODO: 用户补充滑块元素
      // '横向拉条': 'input[type="range"]',
      // '拉条对应的数字输入框': '.range-block-input',
    },
  },

  /**
   * 3️⃣ 聊天页面（重中之重）
   * 
   * @description
   * 包含：角色/用户消息气泡、头像、文本样式、辅助元素等
   */
  '聊天页面': {
    '用户消息气泡': {
      '气泡外框': '.mes[is_user="true"]',
      // TODO: 用户补充更多子元素
      // '气泡内容区': '.mes[is_user="true"] .mes_block',
      // '气泡装饰（伪元素）': '.mes[is_user="true"]::before',
      // '消息操作按钮': '.mes[is_user="true"] .mes_buttons',
    },
    '角色消息气泡': {
      '角色气泡外框': '#chat .mes:not([is_user="true"])',
      // TODO: 用户补充更多角色消息元素
      // '气泡内容区': '.mes:not([is_user="true"]) .mes_block',
    },
    '头像': {
      '角色头像容器': '#chat .mes:not([is_user="true"]) .avatar',
      '角色头像图片': '#chat .mes:not([is_user="true"]) .avatar img',
      '用户头像容器': '#chat .mes[is_user="true"] .avatar',
      '用户头像图片': '#chat .mes[is_user="true"] .avatar img',
    },
    '气泡内小元素': {
      // A类元素（支持absolute + flex定位）
      '角色头像包装器': '#chat .mes:not([is_user="true"]) .mesAvatarWrapper',
      '角色左箭头': '#chat .mes:not([is_user="true"]) .swipe_left',
      '角色文本块': '#chat .mes:not([is_user="true"]) .mes_block',
      '角色右箭头': '#chat .mes:not([is_user="true"]) .swipe_right',
      '角色分页计数器': '#chat .mes:not([is_user="true"]) .swipes-counter',

      // B类元素（仅支持absolute定位）
      '角色消息ID': '#chat .mes:not([is_user="true"]) .mesIDDisplay',
      '角色AI计时器': '#chat .mes:not([is_user="true"]) .mes_timer',
      '角色字符数': '#chat .mes:not([is_user="true"]) .tokenCounterDisplay',
      '角色名': '#chat .mes:not([is_user="true"]) .name_text',
      '角色时间戳': '#chat .mes:not([is_user="true"]) .timestamp',
    },
    '文本样式（Markdown）': {
      // TODO: 用户补充文本元素
      // '加粗': '.mes_text strong',
      // '斜体': '.mes_text em',
      // '代码块': '.mes_text pre',
    },
    '辅助元素': {
      // TODO: 用户补充辅助元素
      // '时间戳': '.timestamp',
      // 'Token计数': '.token_counter',
      // '翻页按钮': '.mes_pagination',
    },
  },

  /**
   * 4️⃣ 角色管理页面
   * 
   * @description
   * 包含：角色卡片、角色列表、角色筛选等
   */
  '角色管理页面': {
    // TODO: 用户补充角色管理元素
    // '角色卡片': '.character_select',
    // '角色列表': '#rm_characters_block',
  },

  /**
   * 5️⃣ 用户角色管理页面
   * 
   * @description
   * 包含：用户卡片、用户列表、用户切换等
   */
  '用户角色管理页面': {
    // TODO: 用户补充用户管理元素
    // '用户卡片': '.user_avatar',
    // '用户列表': '#user_avatar_block',
  },

  /**
   * 6️⃣ 世界书页面
   * 
   * @description
   * 包含：世界书条目、世界书输入框、世界书编辑器等
   */
  '世界书页面': {
    // TODO: 用户补充世界书元素
    // '世界书条目': '.world_entry',
    // '世界书编辑器': '#world_popup',
  },

  /**
   * 7️⃣ 预设管理页面
   * 
   * @description
   * 包含：预设条目、预设图标、预设编辑器等
   */
  '预设管理页面': {
    // TODO: 用户补充预设管理元素
    // '预设条目': '.preset_item',
    // '预设图标（3个）': '.preset_icon',
  },

  /**
   * 8️⃣ 弹窗与对话框
   * 
   * @description
   * 包含：通用弹窗、确认对话框、设置面板等
   */
  '弹窗与对话框': {
    // TODO: 用户补充弹窗元素
    // '通用弹窗': '.popup',
    // '确认对话框': '#dialogue_popup',
  },

  /**
   * 9️⃣ 功能开关（隐藏/显示）
   * 
   * @description
   * 包含：隐藏用户ID、隐藏代理警告等
   */
  '功能开关': {
    // TODO: 用户补充功能开关元素
    // '隐藏用户ID': '.user_id',
    // '隐藏代理警告': '.proxy_warning',
  }
};

// [FUNC] 查找函数

/**
 * 根据中文名获取CSS选择器
 * 
 * @description
 * 在9大分类中查找中文元素名对应的CSS选择器：
 * 1. 遍历9大分类
 * 2. 支持嵌套查找（如：用户消息气泡.气泡外框）
 * 3. 找不到返回 null
 * 
 * @param {string} chineseName - 中文元素名
 * @returns {string|Array<string>|null} CSS选择器（单个或多个）
 */
export function getSelector(chineseName) {
  // 遍历所有分类查找元素
  for (const category of Object.values(elementMap)) {
    // 直接匹配
    if (category[chineseName]) {
      const value = category[chineseName];

      // 如果是对象（父元素/二级分类），返回null（不应该编译）
      if (typeof value === 'object' && !Array.isArray(value)) {
        console.warn(`[getSelector] "${chineseName}" 是二级分类，不是可编辑元素，跳过编译`);
        return null;
      }

      // 字符串直接返回（这是真正的CSS选择器）
      return value;
    }

    // 嵌套匹配（如：气泡外框）
    for (const [key, value] of Object.entries(category)) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        // 这是一个嵌套对象，查找子元素
        if (value[chineseName]) {
          return value[chineseName];
        }
      }
    }
  }

  return null;
}

/**
 * 获取所有元素列表（用于UI显示）
 * 
 * @description
 * 返回完整的元素映射表，包含9大分类和所有元素
 * 
 * @returns {Object} 分类后的元素列表
 */
export function getAllElements() {
  return elementMap;
}

/**
 * 获取某个分类下的所有元素
 * 
 * @description
 * 根据分类名称（如"聊天页面"）返回该分类下的所有元素
 * 
 * @param {string} category - 分类名称
 * @returns {Object} 该分类下的元素
 */
export function getElementsByCategory(category) {
  return elementMap[category] || {};
}

// [EXPORT] 导出
export default {
  elementMap,
  getSelector,
  getAllElements,
  getElementsByCategory
};




