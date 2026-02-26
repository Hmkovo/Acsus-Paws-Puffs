/**
 * 分支补救工具 (Branch Rescue Tool)
 * 
 * @description
 * 为已经创建的旧分支提供手动继承变量数据的功能
 * 
 * 使用场景：
 * - 在分支继承功能上线前创建的分支
 * - 当时选择了"不继承"，现在想补救
 * - 从其他分支复制变量数据
 */

import logger from '../logger.js';
import { getCurrentChatId, chat_metadata } from '../../../../../script.js';
import * as storage from './variable-storage.js';
import { getVariableManagerV2 } from './variable-manager-v2.js';

// ============================================
// 核心功能
// ============================================

/**
 * 打开分支补救弹窗
 * 
 * @export
 * @async
 * @returns {Promise<void>}
 */
export async function openBranchRescueTool() {
    const currentChatId = getCurrentChatId();
    if (!currentChatId) {
        toastr.warning('请先打开一个聊天', '分支补救工具');
        return;
    }

    // 检查是否是分支聊天（通过 chat_metadata.main_chat 判断）
    const mainChatName = chat_metadata?.main_chat;
    if (!mainChatName) {
        toastr.info('当前聊天不是分支，无需补救', '分支补救工具');
        return;
    }

    logger.info('variable', '[BranchRescue] 打开补救工具');
    logger.debug('variable', '[BranchRescue] 当前分支:', currentChatId, '主线:', mainChatName);

    // 显示补救弹窗
    const html = buildRescueDialogHTML(currentChatId, mainChatName);
    const dialog = $('<div class="branch-rescue-overlay"></div>');
    dialog.html(html);
    $('body').append(dialog);

    bindRescueDialogEvents(dialog, currentChatId, mainChatName);
}

/**
 * 构建补救工具弹窗HTML
 * 
 * @param {string} currentChatId - 当前分支chatId
 * @param {string} mainChatName - 主线聊天名称
 * @returns {string}
 */
function buildRescueDialogHTML(currentChatId, mainChatName) {
    return `
        <div class="branch-rescue-dialog">
            <div class="rescue-header">
                <i class="fa-solid fa-life-ring"></i>
                <h3>分支变量补救工具</h3>
            </div>
            
            <div class="rescue-info">
                <p>当前分支：<strong>${currentChatId}</strong></p>
                <p>主线聊天：<strong>${mainChatName}</strong></p>
            </div>

            <div class="rescue-warning">
                <i class="fa-solid fa-exclamation-triangle"></i>
                <p>此工具会<strong>覆盖</strong>当前分支的所有变量数据！</p>
                <p>请确认主线聊天的变量数据是你想要的。</p>
            </div>

            <div class="rescue-options">
                <label>
                    <input type="checkbox" id="rescue-confirm" />
                    <span>我已了解风险，确认从主线复制变量数据</span>
                </label>
            </div>

            <div class="rescue-actions">
                <button class="btn-cancel">取消</button>
                <button class="btn-rescue" disabled>开始补救</button>
            </div>
        </div>
    `;
}

/**
 * 绑定补救工具事件
 * 
 * @param {jQuery} dialog - 弹窗元素
 * @param {string} targetChatId - 目标分支chatId
 * @param {string} sourceChatName - 源主线聊天名称
 */
function bindRescueDialogEvents(dialog, targetChatId, sourceChatName) {
    // 确认复选框
    dialog.on('change', '#rescue-confirm', function() {
        const confirmed = $(this).prop('checked');
        dialog.find('.btn-rescue').prop('disabled', !confirmed);
    });

    // 取消按钮
    dialog.on('click', '.btn-cancel', function() {
        dialog.remove();
    });

    // 补救按钮
    dialog.on('click', '.btn-rescue', async function() {
        const btn = $(this);
        btn.prop('disabled', true).text('处理中...');

        try {
            await rescueVariables(sourceChatName, targetChatId);
            toastr.success('变量数据已从主线复制到当前分支', '补救成功');
            dialog.remove();
        } catch (error) {
            logger.error('variable', '[BranchRescue] 补救失败:', error);
            toastr.error('补救失败: ' + error.message, '分支补救工具');
            btn.prop('disabled', false).text('开始补救');
        }
    });

    // ESC键关闭
    $(document).on('keydown.branch-rescue', function(e) {
        if (e.key === 'Escape') {
            $(document).off('keydown.branch-rescue');
            dialog.remove();
        }
    });
}

/**
 * 补救变量数据（从主线复制到分支）
 * 
 * @async
 * @param {string} sourceChatName - 源主线聊天名称（需要转换为safeChatId）
 * @param {string} targetChatId - 目标分支chatId
 */
async function rescueVariables(sourceChatName, targetChatId) {
    logger.info('variable', '[BranchRescue] 开始补救');

    // 将聊天名称转换为safeChatId（与storage.js的getValuesFilename逻辑一致）
    const sourceChatId = sourceChatName.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    // 加载主线的变量值
    const sourceValues = await storage.loadValuesV2(sourceChatId);
    
    if (Object.keys(sourceValues).length === 0) {
        throw new Error('主线聊天没有变量数据');
    }

    // 直接复制所有数据到目标分支
    const targetValues = await storage.loadValuesV2(targetChatId);
    Object.assign(targetValues, sourceValues);
    await storage.saveValuesV2(targetChatId);

    logger.info('variable', `[BranchRescue] 已复制 ${Object.keys(sourceValues).length} 个变量`);
}

// ============================================
// 注入样式
// ============================================

let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;
    
    const styles = `
        <style>
        .branch-rescue-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
        }

        .branch-rescue-dialog {
            background: var(--SmartThemeBlurTintColor);
            border-radius: 8px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .rescue-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
            color: #f59e0b;
        }

        .rescue-header i {
            font-size: 24px;
        }

        .rescue-header h3 {
            margin: 0;
            font-size: 18px;
        }

        .rescue-info {
            margin-bottom: 16px;
            padding: 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        .rescue-info strong {
            color: var(--SmartThemeQuoteColor);
        }

        .rescue-warning {
            margin-bottom: 16px;
            padding: 12px;
            background: rgba(239, 68, 68, 0.1);
            border-left: 3px solid #ef4444;
            border-radius: 4px;
            display: flex;
            gap: 12px;
        }

        .rescue-warning i {
            color: #ef4444;
            font-size: 20px;
        }

        .rescue-options {
            margin-bottom: 20px;
        }

        .rescue-options label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
        }

        .rescue-actions {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
        }

        .rescue-actions button {
            padding: 8px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        }

        .btn-cancel {
            background: rgba(255, 255, 255, 0.1);
            color: var(--SmartThemeBodyColor);
        }

        .btn-cancel:hover {
            background: rgba(255, 255, 255, 0.2);
        }

        .btn-rescue {
            background: #f59e0b;
            color: white;
        }

        .btn-rescue:hover:not(:disabled) {
            background: #d97706;
        }

        .btn-rescue:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        </style>
    `;
    
    $('head').append(styles);
    stylesInjected = true;
}

if (typeof window !== 'undefined') {
    injectStyles();
}

// ============================================
// 导出
// ============================================

export default {
    openBranchRescueTool
};
