/**
 * 分支继承管理器 (Branch Inherit Manager)
 * 
 * @description
 * 监听SillyTavern的分支创建，自动弹窗询问是否继承变量数据
 * 
 * 核心逻辑：
 * 1. 拦截 .mes_create_branch 点击事件
 * 2. 弹窗询问用户是否继承变量
 * 3. 记录原始chatId和mesId
 * 4. 等待CHAT_CHANGED事件（分支创建后自动触发）
 * 5. 检测到新分支后，复制变量数据
 */

import logger from '../logger.js';
import { eventSource, event_types } from '../../../../../script.js';
import { getCurrentChatId } from '../../../../../script.js';
import * as storage from './variable-storage.js';
import { getVariableManagerV2 } from './variable-manager-v2.js';
import { openBranchInheritDialog } from './ui/branch-inherit-ui.js';

// ============================================
// 状态管理
// ============================================

/** @type {boolean} 是否已绑定事件监听器 */
let isListenerBound = false;

/** @type {Object|null} 等待继承的分支信息 */
let pendingInherit = null;

// ============================================
// 核心函数
// ============================================

/**
 * 初始化分支继承监听
 * @export
 */
export function initBranchInherit() {
    if (isListenerBound) {
        logger.debug('variable', '[BranchInherit] 已绑定监听器，跳过初始化');
        return;
    }

    // 监听分支创建按钮点击（使用事件委托，在branchChat执行前拦截）
    $(document).on('click.branch-inherit', '.mes_create_branch', async function(e) {
        const mesId = Number($(this).closest('.mes').attr('mesid'));
        
        // 获取当前chatId
        const originalChatId = getCurrentChatId();
        if (!originalChatId) {
            logger.warn('variable', '[BranchInherit] 无法获取当前chatId，跳过继承');
            return;
        }

        // 检查当前聊天是否有变量数据
        const values = await storage.loadValuesV2(originalChatId);
        const hasVariables = values && Object.keys(values).length > 0;
        
        if (!hasVariables) {
            logger.debug('variable', '[BranchInherit] 当前聊天无变量数据，跳过继承弹窗');
            return;
        }

        logger.info('variable', '[BranchInherit] 检测到分支创建请求，楼层:', mesId);

        // 先设置待继承标记（占位，防止CHAT_CHANGED先触发）
        pendingInherit = {
            originalChatId,
            mesId,
            inheritConfig: null, // 稍后更新
            timestamp: Date.now()
        };

        // 弹窗询问用户
        const inheritConfig = await openBranchInheritDialog(originalChatId, mesId);

        // 检查 pendingInherit 是否还在（可能已被 CHAT_CHANGED 处理）
        if (!pendingInherit || pendingInherit.originalChatId !== originalChatId) {
            logger.warn('variable', '[BranchInherit] 弹窗期间状态已变化，取消继承');
            return;
        }

        if (!inheritConfig) {
            logger.info('variable', '[BranchInherit] 用户取消继承');
            pendingInherit = null; // 清除标记
            return;
        }

        if (inheritConfig.inherit === false) {
            logger.info('variable', '[BranchInherit] 用户选择不继承');
            pendingInherit = null; // 清除标记
            return;
        }

        // 更新配置
        pendingInherit.inheritConfig = inheritConfig;
        
        // 检查是否在弹窗期间已经切换到新分支
        if (pendingInherit.newChatId) {
            const targetChatId = pendingInherit.newChatId;
            logger.info('variable', '[BranchInherit] 分支已创建，立即执行继承');
            
            try {
                await inheritVariables(
                    pendingInherit.originalChatId,
                    targetChatId,
                    pendingInherit.mesId,
                    pendingInherit.inheritConfig
                );
                toastr.success('变量数据已继承到分支', '分支继承');
            } catch (error) {
                logger.error('variable', '[BranchInherit] 继承失败:', error);
                toastr.error('变量继承失败: ' + error.message, '分支继承');
            } finally {
                pendingInherit = null;
            }
        } else {
            logger.info('variable', '[BranchInherit] 等待分支创建完成...', pendingInherit);
        }
    });

    // 监听聊天切换事件
    eventSource.on(event_types.CHAT_CHANGED, onChatChanged);

    isListenerBound = true;
    logger.info('variable', '[BranchInherit] 分支继承监听器已初始化');
}

/**
 * 销毁分支继承监听
 * @export
 */
export function destroyBranchInherit() {
    $(document).off('click.branch-inherit', '.mes_create_branch');
    eventSource.removeListener(event_types.CHAT_CHANGED, onChatChanged);
    isListenerBound = false;
    pendingInherit = null;
    logger.info('variable', '[BranchInherit] 分支继承监听器已销毁');
}

/**
 * 聊天切换事件处理
 * 
 * @description
 * CHAT_CHANGED 事件不传递参数，需要主动调用 getCurrentChatId() 获取
 */
async function onChatChanged() {
    if (!pendingInherit) return;

    // 主动获取当前chatId
    const newChatId = getCurrentChatId();
    if (!newChatId) {
        logger.warn('variable', '[BranchInherit] 无法获取当前chatId，跳过');
        return;
    }

    // 检查是否是5秒内的待继承请求（防止误触发）
    const elapsed = Date.now() - pendingInherit.timestamp;
    if (elapsed > 5000) {
        logger.warn('variable', '[BranchInherit] 待继承请求超时，清除');
        pendingInherit = null;
        return;
    }

    // 检查是否切换到了新分支
    if (newChatId === pendingInherit.originalChatId) {
        logger.debug('variable', '[BranchInherit] 切换回原聊天，忽略');
        return;
    }

    // 如果 inheritConfig 还未设置，说明用户还在弹窗中选择，记录新分支ID等待
    if (!pendingInherit.inheritConfig) {
        logger.info('variable', '[BranchInherit] 检测到切换到新分支，等待用户确认继承选项');
        pendingInherit.newChatId = newChatId; // 记录新分支ID
        return;
    }

    logger.info('variable', '[BranchInherit] 检测到聊天切换，开始继承变量');
    logger.debug('variable', '[BranchInherit] 从', pendingInherit.originalChatId, '→', newChatId);

    try {
        await inheritVariables(
            pendingInherit.originalChatId,
            newChatId,
            pendingInherit.mesId,
            pendingInherit.inheritConfig
        );
        toastr.success('变量数据已继承到分支', '分支继承');
    } catch (error) {
        logger.error('variable', '[BranchInherit] 继承失败:', error);
        toastr.error('变量继承失败: ' + error.message, '分支继承');
    } finally {
        pendingInherit = null;
    }
}

/**
 * 继承变量数据到新分支
 * 
 * @async
 * @param {string} sourceChatId - 源聊天ID
 * @param {string} targetChatId - 目标分支ID
 * @param {number} branchMesId - 分支点楼层
 * @param {Object} config - 继承配置
 * @param {boolean} config.inherit - 是否继承
 * @param {'all'|'custom'} config.mode - 继承模式
 * @param {Object<string, boolean>} [config.variables] - 自定义模式下的变量选择
 */
async function inheritVariables(sourceChatId, targetChatId, branchMesId, config) {
    logger.info('variable', '[BranchInherit] 开始继承变量数据');
    logger.debug('variable', '[BranchInherit] 配置:', config);

    // 加载源聊天的变量值
    const sourceValues = await storage.loadValuesV2(sourceChatId);
    
    if (Object.keys(sourceValues).length === 0) {
        logger.info('variable', '[BranchInherit] 源聊天无变量数据，跳过');
        return;
    }

    const variableManager = getVariableManagerV2();
    const targetValues = {};
    let inheritedCount = 0;

    // 遍历所有变量
    for (const [variableId, value] of Object.entries(sourceValues)) {
        const variable = variableManager.getDefinition(variableId);
        if (!variable) {
            logger.warn('variable', '[BranchInherit] 变量定义不存在，跳过:', variableId);
            continue;
        }

        // 检查是否选择继承该变量
        if (config.mode === 'custom' && !config.variables?.[variableId]) {
            logger.debug('variable', '[BranchInherit] 跳过未选中的变量:', variable.name);
            continue;
        }

        // 根据模式过滤数据
        if (variable.mode === 'stack') {
            // 叠加模式：过滤楼层
            const filteredValue = filterStackValue(value, branchMesId);
            if (filteredValue.entries.length > 0) {
                targetValues[variableId] = filteredValue;
                inheritedCount++;
                logger.debug('variable', '[BranchInherit] 继承叠加变量:', variable.name, 
                    `(${filteredValue.entries.length}个条目)`);
            }
        } else {
            // 覆盖模式：检查当前值的楼层
            const filteredValue = filterReplaceValue(value, branchMesId);
            if (filteredValue) {
                targetValues[variableId] = filteredValue;
                inheritedCount++;
                logger.debug('variable', '[BranchInherit] 继承覆盖变量:', variable.name);
            }
        }
    }

    // 保存到目标分支
    if (inheritedCount > 0) {
        // 直接写入缓存并保存
        const cachedValues = await storage.loadValuesV2(targetChatId);
        Object.assign(cachedValues, targetValues);
        await storage.saveValuesV2(targetChatId);
        
        logger.info('variable', `[BranchInherit] 成功继承 ${inheritedCount} 个变量`);
    } else {
        logger.info('variable', '[BranchInherit] 没有可继承的变量数据');
    }
}

/**
 * 过滤叠加模式变量值（只保留楼层 <= branchMesId 的条目）
 * 
 * @param {Object} value - 变量值
 * @param {number} branchMesId - 分支点楼层
 * @returns {Object} 过滤后的值
 */
function filterStackValue(value, branchMesId) {
    const filtered = {
        entries: [],
        nextEntryId: value.nextEntryId || 1
    };

    if (!value.entries || !Array.isArray(value.entries)) {
        return filtered;
    }

    for (const entry of value.entries) {
        const floorRange = parseFloorRange(entry.floorRange);
        if (floorRange && floorRange.end <= branchMesId) {
            filtered.entries.push({ ...entry });
        }
    }

    return filtered;
}

/**
 * 过滤覆盖模式变量值（只有当前值的楼层 <= branchMesId 时才继承）
 * 
 * @param {Object} value - 变量值
 * @param {number} branchMesId - 分支点楼层
 * @returns {Object|null} 过滤后的值，如果不符合条件返回null
 */
function filterReplaceValue(value, branchMesId) {
    if (!value.currentValue) {
        return null;
    }

    // 解析当前值的楼层范围
    const floorRange = parseFloorRange(value.currentFloorRange || String(value.currentFloor || 0));
    if (!floorRange || floorRange.end > branchMesId) {
        return null;
    }

    // 只保留当前值，清空历史
    return {
        currentValue: value.currentValue,
        currentFloorRange: value.currentFloorRange,
        currentFloor: value.currentFloor,
        history: [],
        historyIndex: -1
    };
}

/**
 * 解析楼层范围字符串
 * 
 * @param {string} floorRange - 楼层范围字符串（如 "1-10" 或 "5"）
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
// 导出
// ============================================

export default {
    initBranchInherit,
    destroyBranchInherit
};
