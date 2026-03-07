/**
 * @file 常用选择器中文名映射
 *
 * @description
 * 仅保留 HTML 注入相关元数据：
 * - SELECTOR_NAMES：常用 CSS 选择器中文名映射
 * - getSelectorName()：按选择器查询中文名
 * - getCommonSelectors()：常用选择器分组列表
 */

// ============================================
// 常用选择器 -> 中文名称
// ============================================

/**
 * 常用CSS选择器的中文名称映射
 *
 * @description
 * 用途：
 * 1. HTML注入标签页：用户输入选择器时自动显示中文名
 * 2. 常用选择器快速添加列表
 *
 * @type {Record<string, string>}
 */
export const SELECTOR_NAMES = {
    // --- 消息相关 ---
    '.mes': '消息容器',
    '.mes_text': '消息正文',
    '.mes_block': '消息块（头像右侧区域）',
    '.mes_reasoning': '推理/思考过程',
    '.mes[is_user="true"]': '用户消息',
    '.mes[is_user="false"]': 'AI消息',
    '.mes[is_user="true"] .mes_text': '用户消息正文',
    '.mes[is_user="false"] .mes_text': 'AI消息正文',
    '.mes[is_user="true"] .mes_block': '用户消息块',
    '.mes[is_user="false"] .mes_block': 'AI消息块',
    '.mes .avatar': '消息头像',
    '.mes .name_text': '角色名称',
    '.mes .timestamp': '消息时间戳',
    '.mes .mes_buttons': '消息操作按钮区',

    // --- 聊天区域 ---
    '#chat': '聊天容器（所有消息的父容器）',
    '#chat .last_mes': '最后一条消息',

    // --- 顶部/底部 ---
    '#top-bar': '顶部导航栏',
    '#top-settings-holder': '顶部设置区域',
    '#send_form': '底部发送栏',
    '#send_textarea': '消息输入框',
    '#send_but': '发送按钮',
    '#rightSendForm': '发送栏右侧区域',
    '#leftSendForm': '发送栏左侧区域',

    // --- 侧边栏 ---
    '#right-nav-panel': '右侧面板',
    '#left-nav-panel': '左侧面板（角色列表区）',
    '#sheld': '主内容区（中间聊天+面板）',
    '#nav-toggle': '侧边栏切换按钮',

    // --- 角色 ---
    '.character_select': '角色卡片',
    '.avatar-container': '头像容器',
    '#avatar_div': '角色大头像',
    '#character_popup': '角色详情弹窗',

    // --- 设置面板 ---
    '#user-settings-block': '用户设置区块',
    '.drawer-content': '抽屉面板内容',
    '.drawer-icon': '抽屉面板图标',

    // --- 全局 ---
    'body': '页面主体',
    '#bg1': '背景图容器',
    '#blur-tint': '背景模糊层',
};

/**
 * 根据选择器获取中文名称
 *
 * @param {string} selector - CSS选择器
 * @returns {string} 中文名称，找不到返回空字符串
 */
export function getSelectorName(selector) {
    if (!selector) return '';
    // 精确匹配
    if (SELECTOR_NAMES[selector]) return SELECTOR_NAMES[selector];
    // 去空格后匹配
    const trimmed = selector.trim();
    if (SELECTOR_NAMES[trimmed]) return SELECTOR_NAMES[trimmed];
    return '';
}

/**
 * 获取常用选择器列表（用于快速添加UI）
 *
 * @description
 * 按分类返回，方便UI显示分组
 *
 * @returns {Array<{category: string, items: Array<{selector: string, name: string}>}>}
 */
export function getCommonSelectors() {
    return [
        {
            category: '消息',
            items: [
                { selector: '.mes', name: '消息容器' },
                { selector: '.mes_text', name: '消息正文' },
                { selector: '.mes_block', name: '消息块' },
                { selector: '.mes[is_user="true"]', name: '用户消息' },
                { selector: '.mes[is_user="false"]', name: 'AI消息' },
                { selector: '.mes[is_user="true"] .mes_text', name: '用户消息正文' },
                { selector: '.mes[is_user="false"] .mes_text', name: 'AI消息正文' },
                { selector: '.mes .avatar', name: '消息头像' },
                { selector: '.mes .name_text', name: '角色名称' },
            ],
        },
        {
            category: '布局',
            items: [
                { selector: '#chat', name: '聊天容器' },
                { selector: '#top-bar', name: '顶部导航栏' },
                { selector: '#send_form', name: '底部发送栏' },
                { selector: '#send_textarea', name: '消息输入框' },
                { selector: '#right-nav-panel', name: '右侧面板' },
                { selector: '#left-nav-panel', name: '左侧面板' },
                { selector: '#sheld', name: '主内容区' },
            ],
        },
        {
            category: '全局',
            items: [
                { selector: 'body', name: '页面主体' },
                { selector: '#bg1', name: '背景图容器' },
                { selector: '#blur-tint', name: '背景模糊层' },
                { selector: '.character_select', name: '角色卡片' },
                { selector: '.drawer-content', name: '抽屉面板内容' },
            ],
        },
    ];
}
