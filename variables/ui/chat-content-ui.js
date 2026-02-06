/**
 * 正文条目 UI (Chat Content UI)
 *
 * @description
 * 正文条目的 UI 组件：
 * - 编辑弹窗：范围类型选择、参数配置、预览
 * - 正则设置弹窗：显示可用正则脚本，支持拖拽排序、自定义正则
 *
 * @version 2.1 - 2026-01-14
 * - 正则设置弹窗增加拖拽排序功能
 * - 正则设置弹窗增加添加自定义正则功能
 * - 正则设置弹窗增加快速生成正则功能
 * - 正则对每个楼层单独生效
 */

import logger from '../../logger.js';
import { getSuiteManager } from '../suite-manager.js';
import { getChatContentProcessor } from '../chat-content-processor.js';

// ============================================
// 常量
// ============================================

/** 范围类型配置 */
const RANGE_TYPES = {
    fixed: { label: '固定范围', description: '第 N 楼到第 M 楼' },
    latest: { label: '最新 N 楼', description: '从最新往回数 N 楼' },
    relative: { label: '相对范围', description: '跳过最近 X 楼，取 Y 楼' },
    interval: { label: '间隔采样', description: '从第 N 楼开始，每 M 楼取 1 条' },
    percentage: { label: '百分比范围', description: '取前/后 X%' },
    exclude: { label: '排除范围', description: '全部楼层，但排除某些楼' }
};

// ============================================
// 编辑弹窗
// ============================================

/**
 * 打开正文条目编辑弹窗
 * @param {string|null} itemId - 条目 ID（null 表示新建）
 * @param {string} suiteId - 套装 ID
 * @param {Function} onSave - 保存回调
 */
export function openChatContentEditPopup(itemId, suiteId, onSave) {
    const suiteManager = getSuiteManager();
    const processor = getChatContentProcessor();
    const suite = suiteManager.getSuite(suiteId);

    if (!suite) { toastr.error('套装不存在'); return; }

    let item = null;
    if (itemId) {
        item = suite.items.find(i => i.type === 'chat-content' && i.id === itemId);
    }

    const isNew = !item;
    const currentConfig = item ? { ...item } : {
        rangeConfig: { type: 'latest', count: 20 },
        excludeUser: false,
        regexConfig: { usePromptOnly: true, enabledScripts: [], disabledScripts: [], customScripts: [] }
    };

    const popup = document.createElement('div');
    popup.className = 'var-v2-popup-overlay';
    popup.innerHTML = buildEditPopupHTML(currentConfig, processor.getChatLength());
    document.body.appendChild(popup);

    bindEditPopupEvents(popup, currentConfig, suiteId, itemId, isNew, onSave);
    updateFloorPreview(popup, currentConfig);
    logger.debug('[ChatContentUI] 打开编辑弹窗:', isNew ? '新建' : itemId);
}

/** 构建编辑弹窗 HTML */
function buildEditPopupHTML(config, chatLength) {
    const rangeOptions = Object.entries(RANGE_TYPES)
        .map(([value, { label }]) =>
            `<option value="${value}" ${config.rangeConfig.type === value ? 'selected' : ''}>${label}</option>`
        ).join('');

    return `
        <div class="var-v2-popup chat-content-edit">
            <div class="var-v2-popup-header">
                <span>编辑正文条目</span>
                <button class="var-v2-popup-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="var-v2-popup-body">
                <div class="chat-content-field">
                    <label>范围类型</label>
                    <select id="chat-content-range-type" class="var-v2-select">${rangeOptions}</select>
                    <small class="chat-content-hint" id="chat-content-type-hint">${RANGE_TYPES[config.rangeConfig.type]?.description || ''}</small>
                </div>
                <div id="chat-content-params" class="chat-content-params">${buildParamsHTML(config.rangeConfig)}</div>
                <div class="chat-content-field">
                    <label class="checkbox_label">
                        <input type="checkbox" id="chat-content-exclude-user" ${config.excludeUser ? 'checked' : ''}>
                        <span>排除 User 楼层</span>
                    </label>
                </div>
                <div class="chat-content-preview">
                    <span class="preview-label">预览：</span>
                    <span id="chat-content-preview-text">计算中...</span>
                </div>
                <div class="chat-content-info"><small>当前聊天共 ${chatLength} 楼</small></div>
                <div class="chat-content-error hidden" id="chat-content-error"></div>
            </div>
            <div class="var-v2-popup-footer">
                <button class="var-v2-btn" id="chat-content-save">保存</button>
                <button class="var-v2-btn secondary" id="chat-content-cancel">取消</button>
            </div>
        </div>
    `;
}

/** 构建参数输入区域 HTML */
function buildParamsHTML(rangeConfig) {
    const type = rangeConfig.type;
    switch (type) {
        case 'fixed':
            return `<div class="chat-content-param-row"><label>第</label><input type="number" id="param-start" class="var-v2-input small" value="${rangeConfig.start || 1}" min="1"><label>楼到第</label><input type="number" id="param-end" class="var-v2-input small" value="${rangeConfig.end || 50}" min="1"><label>楼</label></div>`;
        case 'latest':
            return `<div class="chat-content-param-row"><label>最新</label><input type="number" id="param-count" class="var-v2-input small" value="${rangeConfig.count || 20}" min="1"><label>楼</label></div>`;
        case 'relative':
            return `<div class="chat-content-param-row"><label>跳过最近</label><input type="number" id="param-skip" class="var-v2-input small" value="${rangeConfig.skip || 0}" min="0"><label>楼，取</label><input type="number" id="param-count" class="var-v2-input small" value="${rangeConfig.count || 20}" min="1"><label>楼</label></div>`;
        case 'interval':
            return `<div class="chat-content-param-row"><label>从第</label><input type="number" id="param-start" class="var-v2-input small" value="${rangeConfig.start || 1}" min="1"><label>楼开始，每</label><input type="number" id="param-step" class="var-v2-input small" value="${rangeConfig.step || 5}" min="1"><label>楼取 1 条</label></div>`;
        case 'percentage':
            return `<div class="chat-content-param-row"><label>取</label><select id="param-position" class="var-v2-select small"><option value="start" ${rangeConfig.position === 'start' ? 'selected' : ''}>前</option><option value="end" ${rangeConfig.position !== 'start' ? 'selected' : ''}>后</option></select><input type="number" id="param-percent" class="var-v2-input small" value="${rangeConfig.percent || 30}" min="1" max="100"><label>%</label></div>`;
        case 'exclude':
            return `<div class="chat-content-param-row"><label>全部楼层，但排除第</label><input type="number" id="param-exclude-start" class="var-v2-input small" value="${rangeConfig.excludeStart || 1}" min="1"><label>到第</label><input type="number" id="param-exclude-end" class="var-v2-input small" value="${rangeConfig.excludeEnd || 10}" min="1"><label>楼</label></div>`;
        default: return '';
    }
}

/** 绑定编辑弹窗事件 */
function bindEditPopupEvents(popup, config, suiteId, itemId, isNew, onSave) {
    const processor = getChatContentProcessor();

    // 关闭按钮
    popup.querySelector('.var-v2-popup-close')?.addEventListener('click', () => popup.remove());
    popup.querySelector('#chat-content-cancel')?.addEventListener('click', () => popup.remove());
    popup.addEventListener('click', (e) => { if (e.target === popup) popup.remove(); });

    // 范围类型切换
    popup.querySelector('#chat-content-range-type')?.addEventListener('change', (e) => {
        const newType = e.target.value;
        config.rangeConfig = { type: newType };
        // 设置默认值
        switch (newType) {
            case 'fixed': config.rangeConfig.start = 1; config.rangeConfig.end = 50; break;
            case 'latest': config.rangeConfig.count = 20; break;
            case 'relative': config.rangeConfig.skip = 0; config.rangeConfig.count = 20; break;
            case 'interval': config.rangeConfig.start = 1; config.rangeConfig.step = 5; break;
            case 'percentage': config.rangeConfig.percent = 30; config.rangeConfig.position = 'end'; break;
            case 'exclude': config.rangeConfig.excludeStart = 1; config.rangeConfig.excludeEnd = 10; break;
        }
        const paramsContainer = popup.querySelector('#chat-content-params');
        if (paramsContainer) {
            paramsContainer.innerHTML = buildParamsHTML(config.rangeConfig);
            bindParamInputEvents(popup, config);
        }
        const hint = popup.querySelector('#chat-content-type-hint');
        if (hint) hint.textContent = RANGE_TYPES[newType]?.description || '';
        updateFloorPreview(popup, config);
    });

    bindParamInputEvents(popup, config);

    // 排除 User 勾选
    popup.querySelector('#chat-content-exclude-user')?.addEventListener('change', (e) => {
        config.excludeUser = e.target.checked;
        updateFloorPreview(popup, config);
    });

    // 保存按钮
    popup.querySelector('#chat-content-save')?.addEventListener('click', () => {
        const chatLength = processor.getChatLength();
        const validation = processor.validateRange(config.rangeConfig, chatLength);
        if (!validation.valid) { showError(popup, validation.error); return; }

        const suiteManager = getSuiteManager();
        if (isNew) {
            suiteManager.addChatContentItem(suiteId, {
                rangeConfig: config.rangeConfig,
                excludeUser: config.excludeUser,
                regexConfig: config.regexConfig
            });
        } else {
            suiteManager.updateChatContentItem(suiteId, itemId, {
                rangeConfig: config.rangeConfig,
                excludeUser: config.excludeUser,
                regexConfig: config.regexConfig
            });
        }
        popup.remove();
        if (onSave) onSave();
        toastr.success(isNew ? '正文条目已添加' : '正文条目已更新');
    });
}

/** 绑定参数输入事件 */
function bindParamInputEvents(popup, config) {
    const inputs = popup.querySelectorAll('#chat-content-params input, #chat-content-params select');
    inputs.forEach(input => {
        input.addEventListener('input', () => { updateConfigFromInputs(popup, config); updateFloorPreview(popup, config); });
        input.addEventListener('change', () => { updateConfigFromInputs(popup, config); updateFloorPreview(popup, config); });
    });
}

/** 从输入框更新配置 */
function updateConfigFromInputs(popup, config) {
    const type = config.rangeConfig.type;
    switch (type) {
        case 'fixed':
            config.rangeConfig.start = parseInt(popup.querySelector('#param-start')?.value) || 1;
            config.rangeConfig.end = parseInt(popup.querySelector('#param-end')?.value) || 50;
            break;
        case 'latest':
            config.rangeConfig.count = parseInt(popup.querySelector('#param-count')?.value) || 20;
            break;
        case 'relative':
            config.rangeConfig.skip = parseInt(popup.querySelector('#param-skip')?.value) || 0;
            config.rangeConfig.count = parseInt(popup.querySelector('#param-count')?.value) || 20;
            break;
        case 'interval':
            config.rangeConfig.start = parseInt(popup.querySelector('#param-start')?.value) || 1;
            config.rangeConfig.step = parseInt(popup.querySelector('#param-step')?.value) || 5;
            break;
        case 'percentage':
            config.rangeConfig.percent = parseInt(popup.querySelector('#param-percent')?.value) || 30;
            config.rangeConfig.position = popup.querySelector('#param-position')?.value || 'end';
            break;
        case 'exclude':
            config.rangeConfig.excludeStart = parseInt(popup.querySelector('#param-exclude-start')?.value) || 1;
            config.rangeConfig.excludeEnd = parseInt(popup.querySelector('#param-exclude-end')?.value) || 10;
            break;
    }
}

/** 更新楼层预览 */
function updateFloorPreview(popup, config) {
    const processor = getChatContentProcessor();
    const chat = processor.getChat();
    const chatLength = chat.length;
    const previewEl = popup.querySelector('#chat-content-preview-text');
    const errorEl = popup.querySelector('#chat-content-error');

    if (!previewEl) return;
    if (errorEl) { errorEl.classList.add('hidden'); errorEl.textContent = ''; }

    if (chatLength === 0) { previewEl.textContent = '（当前没有聊天记录）'; return; }

    const validation = processor.validateRange(config.rangeConfig, chatLength);
    if (!validation.valid) { previewEl.textContent = '（配置无效）'; showError(popup, validation.error); return; }

    const floors = processor.calculateFloors(config.rangeConfig, chatLength, config.excludeUser, chat);
    previewEl.textContent = processor.formatPreview(floors);
}

/** 显示错误 */
function showError(popup, message) {
    const errorEl = popup.querySelector('#chat-content-error');
    if (errorEl) { errorEl.textContent = message; errorEl.classList.remove('hidden'); }
}


// ============================================
// 正则设置弹窗
// ============================================

/**
 * 打开正则设置弹窗
 * @param {string} itemId - 条目 ID
 * @param {string} suiteId - 套装 ID
 * @param {Function} onSave - 保存回调
 */
export async function openRegexSettingsPopup(itemId, suiteId, onSave) {
    const suiteManager = getSuiteManager();
    const processor = getChatContentProcessor();
    const suite = suiteManager.getSuite(suiteId);

    if (!suite) { toastr.error('套装不存在'); return; }

    const item = suite.items.find(i => i.type === 'chat-content' && i.id === itemId);
    if (!item) { toastr.error('条目不存在'); return; }

    // 加载当前可用的正则脚本（异步）
    const scripts = await processor.loadRegexScripts();

    const popup = document.createElement('div');
    popup.className = 'var-v2-popup-overlay';
    popup.innerHTML = buildRegexPopupHTML(scripts, item.regexConfig);
    document.body.appendChild(popup);

    bindRegexPopupEvents(popup, item, suiteId, itemId, onSave);
    initRegexSortable(popup);
    logger.debug('[ChatContentUI] 打开正则设置弹窗:', itemId);
}

/** 构建正则设置弹窗 HTML */
function buildRegexPopupHTML(scripts, regexConfig) {
    const customScripts = regexConfig?.customScripts || [];

    const buildScriptList = (scriptList, groupId, groupName) => {
        if (!scriptList || scriptList.length === 0) {
            return `<div class="regex-empty">（无${groupName}脚本）</div>`;
        }
        return scriptList.map((script, index) => {
            const scriptId = script.id || script.scriptName || `${groupId}_${index}`;
            const isDisabled = regexConfig?.disabledScripts?.includes(scriptId);
            return `
                <div class="regex-script-item" data-script-id="${scriptId}" data-group="${groupId}" draggable="true">
                    <span class="regex-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                    <label class="regex-script-label">
                        <input type="checkbox" data-script-id="${scriptId}" ${!isDisabled ? 'checked' : ''}>
                        <span>${script.scriptName || '未命名脚本'}</span>
                    </label>
                    ${groupId === 'custom' ? `<span class="regex-script-actions"><i class="fa-solid fa-pen regex-edit-custom" data-index="${index}" title="编辑"></i><i class="fa-solid fa-trash regex-delete-custom" data-index="${index}" title="删除"></i></span>` : ''}
                </div>
            `;
        }).join('');
    };

    return `
        <div class="var-v2-popup regex-settings">
            <div class="var-v2-popup-header">
                <span>正则设置</span>
                <button class="var-v2-popup-close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="var-v2-popup-body">
                <p class="regex-hint"><i class="fa-solid fa-info-circle"></i> 拖拽调整执行顺序，勾选启用/禁用。正则对每个楼层单独生效。</p>
                <div class="regex-btn-group">
                    <button class="var-v2-btn small" id="regex-add-custom"><i class="fa-solid fa-plus"></i> 添加自定义</button>
                    <button class="var-v2-btn small" id="regex-quick-gen"><i class="fa-solid fa-wand-magic-sparkles"></i> 快速生成</button>
                    <button class="var-v2-btn small" id="regex-help"><i class="fa-solid fa-circle-question"></i> 说明</button>
                </div>
                <div class="regex-group" data-group="custom">
                    <div class="regex-group-header"><i class="fa-solid fa-wand-magic-sparkles"></i> 自定义正则 <span class="regex-count">${customScripts.length}</span></div>
                    <div class="regex-group-items" id="regex-custom">${buildScriptList(customScripts, 'custom', '自定义')}</div>
                </div>
                <div class="regex-group" data-group="global">
                    <div class="regex-group-header"><i class="fa-solid fa-globe"></i> 全局正则 <span class="regex-count">${scripts.global.length}</span></div>
                    <div class="regex-group-items" id="regex-global">${buildScriptList(scripts.global, 'global', '全局')}</div>
                </div>
                <div class="regex-group" data-group="preset">
                    <div class="regex-group-header"><i class="fa-solid fa-box"></i> 预设正则 <span class="regex-count">${scripts.preset.length}</span></div>
                    <div class="regex-group-items" id="regex-preset">${buildScriptList(scripts.preset, 'preset', '预设')}</div>
                </div>
                <div class="regex-group" data-group="scoped">
                    <div class="regex-group-header"><i class="fa-solid fa-user"></i> 局部正则 <span class="regex-count">${scripts.scoped.length}</span></div>
                    <div class="regex-group-items" id="regex-scoped">${buildScriptList(scripts.scoped, 'scoped', '局部')}</div>
                </div>
            </div>
            <div class="var-v2-popup-footer">
                <button class="var-v2-btn" id="regex-save">保存</button>
                <button class="var-v2-btn secondary" id="regex-cancel">取消</button>
            </div>
        </div>
    `;
}

/** 初始化正则脚本拖拽排序 */
function initRegexSortable(popup) {
    const groups = popup.querySelectorAll('.regex-group-items');
    groups.forEach(group => {
        group.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.regex-script-item');
            if (!item) return;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        group.addEventListener('dragend', (e) => {
            const item = e.target.closest('.regex-script-item');
            if (item) item.classList.remove('dragging');
            popup.querySelectorAll('.regex-script-item').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
        });
        group.addEventListener('dragover', (e) => {
            e.preventDefault();
            const target = e.target.closest('.regex-script-item');
            if (!target || target.classList.contains('dragging')) return;
            const rect = target.getBoundingClientRect();
            popup.querySelectorAll('.regex-script-item').forEach(el => { if (el !== target) el.classList.remove('drag-over-top', 'drag-over-bottom'); });
            if (e.clientY < rect.top + rect.height / 2) { target.classList.add('drag-over-top'); target.classList.remove('drag-over-bottom'); }
            else { target.classList.add('drag-over-bottom'); target.classList.remove('drag-over-top'); }
        });
        group.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.target.closest('.regex-script-item');
            const dragging = popup.querySelector('.regex-script-item.dragging');
            if (!target || !dragging || target === dragging) return;
            const rect = target.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) target.parentNode.insertBefore(dragging, target);
            else target.parentNode.insertBefore(dragging, target.nextSibling);
            target.classList.remove('drag-over-top', 'drag-over-bottom');
        });
    });
}


/** 绑定正则设置弹窗事件 */
function bindRegexPopupEvents(popup, item, suiteId, itemId, onSave) {
    let customScripts = [...(item.regexConfig?.customScripts || [])];

    popup.querySelector('.var-v2-popup-close')?.addEventListener('click', () => popup.remove());
    popup.querySelector('#regex-cancel')?.addEventListener('click', () => popup.remove());
    popup.addEventListener('click', (e) => { if (e.target === popup) popup.remove(); });

    // 添加自定义正则
    popup.querySelector('#regex-add-custom')?.addEventListener('click', () => {
        openRegexEditDialog(null, (script) => {
            script.id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            script.source = 'custom';
            customScripts.push(script);
            refreshCustomScriptsList(popup, customScripts);
        });
    });

    // 快速生成正则
    popup.querySelector('#regex-quick-gen')?.addEventListener('click', () => {
        openQuickGenDialog((script) => {
            script.id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            script.source = 'custom';
            customScripts.push(script);
            refreshCustomScriptsList(popup, customScripts);
        });
    });

    // 说明按钮
    popup.querySelector('#regex-help')?.addEventListener('click', () => showRegexHelpDialog());

    // 编辑/删除自定义正则
    popup.querySelector('#regex-custom')?.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.regex-edit-custom');
        const deleteBtn = e.target.closest('.regex-delete-custom');
        if (editBtn) {
            const index = parseInt(editBtn.dataset.index);
            const script = customScripts[index];
            if (script) {
                openRegexEditDialog(script, (edited) => {
                    customScripts[index] = { ...script, ...edited };
                    refreshCustomScriptsList(popup, customScripts);
                });
            }
        }
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            if (confirm('确定要删除这个正则吗？')) {
                customScripts.splice(index, 1);
                refreshCustomScriptsList(popup, customScripts);
            }
        }
    });

    // 保存按钮
    popup.querySelector('#regex-save')?.addEventListener('click', () => {
        const disabledScripts = [];
        popup.querySelectorAll('.regex-script-item input[type="checkbox"]').forEach(cb => {
            if (!cb.checked && cb.dataset.scriptId) disabledScripts.push(cb.dataset.scriptId);
        });
        const scriptOrder = [];
        popup.querySelectorAll('.regex-script-item').forEach(item => {
            if (item.dataset.scriptId) scriptOrder.push(item.dataset.scriptId);
        });

        const suiteManager = getSuiteManager();
        suiteManager.updateChatContentItem(suiteId, itemId, {
            regexConfig: { usePromptOnly: true, enabledScripts: [], disabledScripts, customScripts, scriptOrder }
        });
        popup.remove();
        if (onSave) onSave();
        toastr.success('正则设置已保存');
    });
}

/** 刷新自定义正则列表 */
function refreshCustomScriptsList(popup, customScripts) {
    const container = popup.querySelector('#regex-custom');
    const countEl = popup.querySelector('.regex-group[data-group="custom"] .regex-count');
    if (!container) return;

    if (customScripts.length === 0) {
        container.innerHTML = '<div class="regex-empty">（无自定义脚本）</div>';
    } else {
        container.innerHTML = customScripts.map((script, index) => {
            const scriptId = script.id || `custom_${index}`;
            return `
                <div class="regex-script-item" data-script-id="${scriptId}" data-group="custom" draggable="true">
                    <span class="regex-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                    <label class="regex-script-label">
                        <input type="checkbox" data-script-id="${scriptId}" ${!script.disabled ? 'checked' : ''}>
                        <span>${script.scriptName || '未命名脚本'}</span>
                    </label>
                    <span class="regex-script-actions">
                        <i class="fa-solid fa-pen regex-edit-custom" data-index="${index}" title="编辑"></i>
                        <i class="fa-solid fa-trash regex-delete-custom" data-index="${index}" title="删除"></i>
                    </span>
                </div>
            `;
        }).join('');
    }
    if (countEl) countEl.textContent = customScripts.length.toString();
    initRegexSortable(popup);
}

/** 打开正则编辑对话框 */
function openRegexEditDialog(script, onSave) {
    const isNew = !script;
    const popup = document.createElement('div');
    popup.className = 'var-v2-popup-overlay';
    popup.innerHTML = `
        <div class="var-v2-popup regex-edit-dialog">
            <div class="var-v2-popup-header"><span>${isNew ? '添加自定义正则' : '编辑正则'}</span><button class="var-v2-popup-close"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="var-v2-popup-body">
                <div class="regex-edit-field"><label>名称</label><input type="text" id="regex-edit-name" class="var-v2-input" placeholder="如：移除思维链" value="${script?.scriptName || ''}"></div>
                <div class="regex-edit-field"><label>查找（正则表达式）</label><textarea id="regex-edit-find" class="var-v2-textarea" rows="3" placeholder="如：<Think>.*?</Think>">${script?.findRegex || ''}</textarea><small class="regex-edit-hint">填写需要查找的格式</small></div>
                <div class="regex-edit-field"><label>替换为</label><textarea id="regex-edit-replace" class="var-v2-textarea" rows="2" placeholder="留空来删除">${script?.replaceString || ''}</textarea><small class="regex-edit-hint">留空则删除匹配内容</small></div>
            </div>
            <div class="var-v2-popup-footer"><button class="var-v2-btn" id="regex-edit-save">保存</button><button class="var-v2-btn secondary" id="regex-edit-cancel">取消</button></div>
        </div>
    `;
    document.body.appendChild(popup);

    const close = () => popup.remove();
    popup.querySelector('.var-v2-popup-close')?.addEventListener('click', close);
    popup.querySelector('#regex-edit-cancel')?.addEventListener('click', close);
    popup.addEventListener('click', (e) => { if (e.target === popup) close(); });

    popup.querySelector('#regex-edit-save')?.addEventListener('click', () => {
        const name = popup.querySelector('#regex-edit-name')?.value.trim();
        const find = popup.querySelector('#regex-edit-find')?.value.trim();
        const replace = popup.querySelector('#regex-edit-replace')?.value || '';
        if (!name) { toastr.warning('请输入名称'); return; }
        if (!find) { toastr.warning('请输入查找正则'); return; }
        onSave({ scriptName: name, findRegex: find, replaceString: replace, only_format_prompt: true, disabled: false });
        close();
        toastr.success(isNew ? '已添加自定义正则' : '已保存修改');
    });
}


/** 打开快速生成正则对话框 */
function openQuickGenDialog(onSave) {
    const popup = document.createElement('div');
    popup.className = 'var-v2-popup-overlay';
    popup.innerHTML = `
        <div class="var-v2-popup regex-quick-gen-dialog">
            <div class="var-v2-popup-header"><span>快速生成正则</span><button class="var-v2-popup-close"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="var-v2-popup-body">
                <div class="regex-gen-modes">
                    <label class="regex-gen-mode"><input type="radio" name="genMode" value="deleteToTag" checked><div class="mode-content"><span class="mode-title">删除开头到标签</span><span class="mode-desc">如 &lt;/thinking&gt;</span></div></label>
                    <label class="regex-gen-mode"><input type="radio" name="genMode" value="deleteFromTag"><div class="mode-content"><span class="mode-title">删除标签到结尾</span><span class="mode-desc">如 &lt;end&gt;</span></div></label>
                    <label class="regex-gen-mode"><input type="radio" name="genMode" value="deleteTagPair"><div class="mode-content"><span class="mode-title">删除标签对及内容</span><span class="mode-desc">如 &lt;think&gt;...&lt;/think&gt;</span></div></label>
                </div>
                <div class="regex-edit-field"><label id="gen-input-label">输入结束标签</label><input type="text" id="gen-tag-input" class="var-v2-input" placeholder="</thinking>"></div>
                <div class="regex-edit-field"><label>生成的正则</label><div class="regex-gen-preview" id="gen-preview">^[\\s\\S]*?&lt;/thinking&gt;</div></div>
            </div>
            <div class="var-v2-popup-footer"><button class="var-v2-btn" id="gen-confirm">确认生成</button><button class="var-v2-btn secondary" id="gen-cancel">取消</button></div>
        </div>
    `;
    document.body.appendChild(popup);

    const escapeRegexChars = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapeHtml = (str) => str.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const updatePreview = () => {
        const mode = popup.querySelector('input[name="genMode"]:checked')?.value;
        const tag = popup.querySelector('#gen-tag-input')?.value.trim() || '</thinking>';
        const preview = popup.querySelector('#gen-preview');
        const label = popup.querySelector('#gen-input-label');
        let regex = '', labelText = '';
        switch (mode) {
            case 'deleteToTag': regex = `^[\\s\\S]*?${escapeRegexChars(tag)}`; labelText = '输入结束标签'; break;
            case 'deleteFromTag': regex = `${escapeRegexChars(tag)}[\\s\\S]*$`; labelText = '输入开始标签'; break;
            case 'deleteTagPair': const tagName = tag.replace(/[<>/]/g, '').trim() || 'think'; regex = `<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`; labelText = '输入标签名称（如 think）'; break;
        }
        if (preview) preview.innerHTML = escapeHtml(regex);
        if (label) label.textContent = labelText;
    };

    popup.querySelectorAll('input[name="genMode"]').forEach(r => r.addEventListener('change', updatePreview));
    popup.querySelector('#gen-tag-input')?.addEventListener('input', updatePreview);
    updatePreview();

    const close = () => popup.remove();
    popup.querySelector('.var-v2-popup-close')?.addEventListener('click', close);
    popup.querySelector('#gen-cancel')?.addEventListener('click', close);
    popup.addEventListener('click', (e) => { if (e.target === popup) close(); });

    popup.querySelector('#gen-confirm')?.addEventListener('click', () => {
        const mode = popup.querySelector('input[name="genMode"]:checked')?.value;
        const tag = popup.querySelector('#gen-tag-input')?.value.trim();
        if (!tag) { toastr.warning('请输入标签'); return; }
        let regex = '', name = '';
        switch (mode) {
            case 'deleteToTag': regex = `^[\\s\\S]*?${escapeRegexChars(tag)}`; name = `删除开头到 ${tag}`; break;
            case 'deleteFromTag': regex = `${escapeRegexChars(tag)}[\\s\\S]*$`; name = `删除 ${tag} 到结尾`; break;
            case 'deleteTagPair': const tagName = tag.replace(/[<>/]/g, '').trim(); regex = `<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`; name = `删除 <${tagName}> 标签`; break;
        }
        onSave({ scriptName: name, findRegex: regex, replaceString: '', only_format_prompt: true, disabled: false });
        close();
        toastr.success('已生成正则');
    });
}

/** 显示正则说明对话框 */
function showRegexHelpDialog() {
    const popup = document.createElement('div');
    popup.className = 'var-v2-popup-overlay';
    popup.innerHTML = `
        <div class="var-v2-popup regex-help-dialog">
            <div class="var-v2-popup-header"><span>正则配置说明</span><button class="var-v2-popup-close"><i class="fa-solid fa-xmark"></i></button></div>
            <div class="var-v2-popup-body">
                <div class="regex-help-content">
                    <h4><i class="fa-solid fa-circle-info"></i> 什么是正则配置？</h4>
                    <p>正则是一种<strong>查找特定格式</strong>的工具，用于消除酒馆发送的思维链、状态栏等内容。</p>
                    <h4><i class="fa-solid fa-arrow-down-1-9"></i> 执行顺序</h4>
                    <p>正则按照<strong>从上到下</strong>的顺序执行，对<strong>每个楼层单独生效</strong>。</p>
                    <ul><li><strong>自定义正则</strong>最先执行</li><li>然后是<strong>全局正则</strong></li><li>再然后是<strong>预设正则</strong></li><li>最后是<strong>局部正则</strong></li></ul>
                    <p>你可以<strong>拖拽</strong>调整顺序。</p>
                    <h4><i class="fa-solid fa-lightbulb"></i> 快速上手</h4>
                    <p>点击「快速生成」可以快速创建常用正则，如删除思维链。</p>
                </div>
            </div>
            <div class="var-v2-popup-footer"><button class="var-v2-btn" id="help-close">知道了</button></div>
        </div>
    `;
    document.body.appendChild(popup);
    const close = () => popup.remove();
    popup.querySelector('.var-v2-popup-close')?.addEventListener('click', close);
    popup.querySelector('#help-close')?.addEventListener('click', close);
    popup.addEventListener('click', (e) => { if (e.target === popup) close(); });
}

// ============================================
// 导出
// ============================================

export default { openChatContentEditPopup, openRegexSettingsPopup, RANGE_TYPES };
