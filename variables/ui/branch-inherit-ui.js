/**
 * 分支继承弹窗 UI (Branch Inherit Dialog UI)
 * 
 * @description
 * 在创建分支时弹出询问窗口，让用户选择如何继承变量
 */

import logger from '../../logger.js';
import { getVariableManagerV2 } from '../variable-manager-v2.js';
import * as storage from '../variable-storage.js';

// ============================================
// 弹窗HTML构建
// ============================================

/**
 * 构建分支继承弹窗HTML
 * 
 * @param {string} chatId - 当前聊天ID
 * @param {number} mesId - 分支点楼层
 * @returns {Promise<string>}
 */
async function buildDialogHTML(chatId, mesId) {
    const variableManager = getVariableManagerV2();
    const sourceValues = await storage.loadValuesV2(chatId);
    
    // 统计变量信息
    const variableStats = [];
    for (const [variableId, value] of Object.entries(sourceValues)) {
        const variable = variableManager.getDefinition(variableId);
        if (!variable) continue;

        let stat = {
            id: variableId,
            name: variable.name,
            mode: variable.mode,
            total: 0,
            inherited: 0,
            excluded: 0
        };

        if (variable.mode === 'stack') {
            stat.total = value.entries?.length || 0;
            stat.inherited = value.entries?.filter(e => {
                const range = parseFloorRange(e.floorRange);
                return range && range.end <= mesId;
            }).length || 0;
            stat.excluded = stat.total - stat.inherited;
        } else {
            // 覆盖模式
            const range = parseFloorRange(value.currentFloorRange || String(value.currentFloor || 0));
            if (range && range.end <= mesId) {
                stat.total = 1;
                stat.inherited = 1;
            } else {
                stat.total = 1;
                stat.excluded = 1;
            }
        }

        variableStats.push(stat);
    }

    const hasVariables = variableStats.length > 0;
    const totalInherited = variableStats.reduce((sum, s) => sum + s.inherited, 0);

    return `
        <div class="branch-inherit-dialog">
            <div class="branch-inherit-header">
                <i class="fa-solid fa-code-branch"></i>
                <h3>分支变量继承</h3>
            </div>
            
            <div class="branch-inherit-info">
                <p>当前聊天在第 <strong>${mesId + 1}</strong> 楼创建分支</p>
                ${!hasVariables ? '<p class="text-muted">（当前聊天没有变量数据）</p>' : ''}
            </div>

            ${hasVariables ? `
                <div class="branch-inherit-mode">
                    <label>选择继承方式：</label>
                    <div class="radio-group">
                        <label class="radio-label">
                            <input type="radio" name="inherit-mode" value="none" />
                            <span>不继承（从空白开始）</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="inherit-mode" value="all" checked />
                            <span>继承全部（推荐）</span>
                        </label>
                        <label class="radio-label">
                            <input type="radio" name="inherit-mode" value="custom" />
                            <span>自定义选择</span>
                        </label>
                    </div>
                </div>

                <div class="branch-inherit-summary">
                    <p>将继承 <strong>${totalInherited}</strong> 条变量数据</p>
                </div>

                <div class="branch-inherit-variables" style="display: none;">
                    <div class="variables-list">
                        ${variableStats.map(stat => `
                            <div class="variable-item" data-variable-id="${stat.id}">
                                <label class="checkbox-label">
                                    <input type="checkbox" checked data-variable-id="${stat.id}" />
                                    <span class="variable-name">${stat.name}</span>
                                </label>
                                <span class="variable-mode">${stat.mode === 'stack' ? '叠加' : '覆盖'}</span>
                                <span class="variable-stats">
                                    ${stat.inherited > 0 ? `✓ ${stat.inherited}条` : ''}
                                    ${stat.excluded > 0 ? `<span class="text-muted">(跳过${stat.excluded}条)</span>` : ''}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="inherit-tip">
                        <i class="fa-solid fa-info-circle"></i>
                        只继承楼层 ≤ ${mesId + 1} 的变量数据
                    </div>
                </div>
            ` : ''}

            <div class="branch-inherit-actions">
                <button class="btn-cancel">取消</button>
                <button class="btn-confirm">${hasVariables ? '确定继承' : '确定'}</button>
            </div>
        </div>
    `;
}

/**
 * 解析楼层范围字符串
 * @param {string} floorRange
 * @returns {{start: number, end: number}|null}
 */
function parseFloorRange(floorRange) {
    if (!floorRange) return null;
    const str = String(floorRange).trim();
    
    if (str.includes('-')) {
        const [start, end] = str.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end)) {
            return { start, end };
        }
    } else {
        const num = parseInt(str);
        if (!isNaN(num)) {
            return { start: num, end: num };
        }
    }
    return null;
}

// ============================================
// 弹窗交互
// ============================================

/**
 * 打开分支继承弹窗
 * 
 * @export
 * @param {string} chatId - 当前聊天ID
 * @param {number} mesId - 分支点楼层
 * @returns {Promise<Object|null>} 用户选择的配置，取消返回null
 */
export async function openBranchInheritDialog(chatId, mesId) {
    return new Promise(async (resolve) => {
        try {
            const html = await buildDialogHTML(chatId, mesId);
            
            // 创建弹窗
            const dialog = $('<div class="branch-inherit-popup-overlay"></div>');
            dialog.html(html);
            $('body').append(dialog);

            // 绑定事件
            bindDialogEvents(dialog, resolve);

            logger.debug('variable', '[BranchInheritUI] 弹窗已打开');
        } catch (error) {
            logger.error('variable', '[BranchInheritUI] 弹窗创建失败:', error);
            resolve(null);
        }
    });
}

/**
 * 绑定弹窗事件
 * @param {jQuery} dialog - 弹窗元素
 * @param {Function} resolve - Promise resolve函数
 */
function bindDialogEvents(dialog, resolve) {
    // 模式切换
    dialog.on('change', 'input[name="inherit-mode"]', function() {
        const mode = $(this).val();
        const variablesSection = dialog.find('.branch-inherit-variables');
        const summary = dialog.find('.branch-inherit-summary');
        
        if (mode === 'custom') {
            variablesSection.show();
            summary.hide();
        } else {
            variablesSection.hide();
            summary.show();
        }
    });

    // 取消按钮
    dialog.on('click', '.btn-cancel', function() {
        dialog.remove();
        resolve(null);
    });

    // 确定按钮
    dialog.on('click', '.btn-confirm', function() {
        const mode = dialog.find('input[name="inherit-mode"]:checked').val();
        
        let config = null;
        
        if (!mode || mode === 'none') {
            // 不继承
            config = { inherit: false };
        } else if (mode === 'all') {
            // 全部继承
            config = { inherit: true, mode: 'all' };
        } else if (mode === 'custom') {
            // 自定义选择
            const selectedVariables = {};
            dialog.find('.variable-item input[type="checkbox"]').each(function() {
                const variableId = $(this).data('variable-id');
                selectedVariables[variableId] = $(this).prop('checked');
            });
            config = {
                inherit: true,
                mode: 'custom',
                variables: selectedVariables
            };
        }

        dialog.remove();
        resolve(config);
    });

    // ESC键关闭
    $(document).on('keydown.branch-inherit', function(e) {
        if (e.key === 'Escape') {
            $(document).off('keydown.branch-inherit');
            dialog.remove();
            resolve(null);
        }
    });
}

// ============================================
// 样式（内联CSS，稍后移到主CSS文件）
// ============================================

// 在第一次调用时注入样式
let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;
    
    const styles = `
        <style>
        .branch-inherit-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100vh;
            height: 100dvh;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        }

        .branch-inherit-dialog {
            background: var(--SmartThemeBlurTintColor);
            border-radius: 0.5em;
            padding: 1.5em;
            max-width: 31.25em;
            width: 90%;
            max-height: 80vh;
            max-height: 80dvh;
            overflow-y: auto;
            box-shadow: 0 0.25em 1.25em rgba(0, 0, 0, 0.3);
        }

        .branch-inherit-header {
            display: flex;
            align-items: center;
            gap: 0.75em;
            margin-bottom: 1em;
            color: var(--SmartThemeQuoteColor);
        }

        .branch-inherit-header i {
            font-size: 1.5em;
        }

        .branch-inherit-header h3 {
            margin: 0;
            font-size: 1.125em;
        }

        .branch-inherit-info {
            margin-bottom: 1.25em;
            padding: 0.75em;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 0.25em;
        }

        .branch-inherit-info strong {
            color: var(--SmartThemeQuoteColor);
        }

        .branch-inherit-mode {
            margin-bottom: 1em;
        }

        .branch-inherit-mode label {
            display: block;
            margin-bottom: 0.5em;
            font-weight: bold;
        }

        .radio-group {
            display: flex;
            flex-direction: column;
            gap: 0.5em;
        }

        .radio-label {
            display: flex;
            align-items: center;
            gap: 0.5em;
            padding: 0.5em;
            cursor: pointer;
            border-radius: 0.25em;
            transition: background 0.2s;
        }

        .radio-label:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .branch-inherit-summary {
            padding: 0.75em;
            background: rgba(66, 153, 225, 0.1);
            border-left: 0.1875em solid #4299e1;
            border-radius: 0.25em;
            margin-bottom: 1em;
        }

        .branch-inherit-variables {
            margin-bottom: 1em;
        }

        .variables-list {
            max-height: 18.75em;
            overflow-y: auto;
            border: 0.0625em solid rgba(255, 255, 255, 0.1);
            border-radius: 0.25em;
            padding: 0.5em;
        }

        .variable-item {
            display: flex;
            align-items: center;
            gap: 0.75em;
            padding: 0.5em;
            border-bottom: 0.0625em solid rgba(255, 255, 255, 0.05);
        }

        .variable-item:last-child {
            border-bottom: none;
        }

        .checkbox-label {
            display: flex;
            align-items: center;
            gap: 0.5em;
            flex: 1;
            cursor: pointer;
        }

        .variable-name {
            font-weight: bold;
        }

        .variable-mode {
            padding: 0.125em 0.5em;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 0.25em;
            font-size: 0.75em;
        }

        .variable-stats {
            font-size: 0.75em;
            color: #4ade80;
        }

        .inherit-tip {
            margin-top: 0.5em;
            padding: 0.5em;
            background: rgba(251, 191, 36, 0.1);
            border-radius: 0.25em;
            font-size: 0.8125em;
            display: flex;
            align-items: center;
            gap: 0.5em;
        }

        .inherit-tip i {
            color: #fbbf24;
        }

        .branch-inherit-actions {
            display: flex;
            justify-content: flex-end;
            gap: 0.75em;
            margin-top: 1.25em;
        }

        .branch-inherit-actions button {
            padding: 0.5em 1.25em;
            border: none;
            border-radius: 0.25em;
            cursor: pointer;
            font-size: 0.875em;
            transition: all 0.2s;
        }

        .btn-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: var(--SmartThemeBodyColor);
        }

        .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .btn-confirm {
            background: #4299e1;
            color: white;
        }

        .btn-confirm:hover {
            background: #3182ce;
        }

        .text-muted {
            color: rgba(255, 255, 255, 0.5);
        }
        </style>
    `;
    
    $('head').append(styles);
    stylesInjected = true;
}

// 在导出函数前注入样式
if (typeof window !== 'undefined') {
    injectStyles();
}

// ============================================
// 导出
// ============================================

export default {
    openBranchInheritDialog
};
