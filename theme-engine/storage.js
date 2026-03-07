/**
 * ST-Theme-Engine 存储模块
 *
 * @description
 * 使用 SillyTavern 文件 API 将方案数据持久化到 JSON 文件。
 * 模式：内存缓存 + 300ms 防抖保存（参考 variable-storage.js）
 *
 * 文件实际位置: data/default-user/user/files/st-theme-engine.json
 */

import { getRequestHeaders } from '../../../../../script.js';
import logger from '../logger.js';

// ============================================
// 常量
// ============================================

/** 存储文件名 */
const STORAGE_FILENAME = 'st-theme-engine.json';

/** 文件路径（前端请求用） */
const FILE_PATH = `/user/files/${STORAGE_FILENAME}`;

// ============================================
// 类型定义（JSDoc）
// ============================================

/**
 * 单个HTML注入项
 * @typedef {Object} HtmlInjection
 * @property {string} id - 注入项唯一ID
 * @property {string} selector - CSS选择器（注入目标）
 * @property {string} position - 注入位置（beforebegin/afterbegin/beforeend/afterend）
 * @property {string} html - HTML内容
 * @property {boolean} enabled - 是否启用
 * @property {boolean} observeChat - 是否对动态加载的消息也注入（MutationObserver）
 * @property {string} [decoCSS] - 关联的装饰CSS代码（装饰型注入项特有）
 * @property {string} [decoId] - 装饰CSS的ID标识（如 ste-deco-1234）
 * @property {'first'|'last'} [decoPriority] - 装饰CSS注入优先级（first=排前/last=排后，默认last）
 */

/**
 * 单个方案的数据结构
 * @typedef {Object} ThemeScheme
 * @property {string} id - 方案唯一ID
 * @property {string} name - 方案名称（用户可见）
 * @property {string} cssContent - 用户输入的CSS内容
 * @property {HtmlInjection[]} htmlInjections - HTML注入项列表
 * @property {string} jsContent - 用户输入的JS内容
 * @property {boolean} jsAutoRun - 是否加载时自动执行JS
 * @property {number} createdAt - 创建时间戳
 * @property {number} updatedAt - 最后更新时间戳
 */

/**
 * 存储数据的完整结构
 * @typedef {Object} StorageData
 * @property {number} version - 数据版本号
 * @property {Object} settings - 全局设置
 * @property {string} settings.activeSchemeId - 当前激活的方案ID
 * @property {Object<string, ThemeScheme>} schemes - 所有方案（键=ID，值=方案对象）
 */

// ============================================
// 默认数据
// ============================================

/** @type {StorageData} */
const DEFAULT_DATA = {
    version: 1,
    settings: {
        activeSchemeId: 'default'
    },
    schemes: {
        default: {
            id: 'default',
            name: '默认',
            cssContent: '',
            htmlInjections: [],
            jsContent: '',
            jsAutoRun: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        }
    }
};

// ============================================
// 内存缓存
// ============================================

/** @type {StorageData|null} */
let cachedData = null;

/** @type {number|null} 防抖定时器 */
let saveTimeout = null;

// ============================================
// 核心读写
// ============================================

/**
 * 加载存储数据（优先从缓存读，否则从文件读）
 * @async
 * @returns {Promise<StorageData>}
 */
export async function loadStorage() {
    if (cachedData) return cachedData;

    try {
        logger.debug('themeEngine', '[Storage.load] 尝试加载存储文件...');
        const response = await fetch(FILE_PATH, {
            method: 'GET',
            headers: getRequestHeaders()
        });

        if (response.ok) {
            cachedData = JSON.parse(await response.text());
            logger.info('themeEngine', '[Storage.load] 存储文件加载成功');
            return cachedData;
        }

        if (response.status === 404) {
            logger.info('themeEngine', '[Storage.load] 文件不存在，创建默认数据');
            cachedData = JSON.parse(JSON.stringify(DEFAULT_DATA));
            await saveStorage();
            return cachedData;
        }

        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (error) {
        logger.error('themeEngine', '[Storage.load] 加载失败:', error.message);
        cachedData = JSON.parse(JSON.stringify(DEFAULT_DATA));
        return cachedData;
    }
}

/**
 * 保存存储数据到文件
 * @async
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveStorage() {
    if (!cachedData) {
        logger.warn('themeEngine', '[Storage.save] 没有数据可保存');
        return false;
    }

    try {
        const jsonString = JSON.stringify(cachedData, null, 2);
        const base64Data = btoa(unescape(encodeURIComponent(jsonString)));

        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                name: STORAGE_FILENAME,
                data: base64Data
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        logger.debug('themeEngine', '[Storage.save] 保存成功');
        return true;
    } catch (error) {
        logger.error('themeEngine', '[Storage.save] 保存失败:', error.message);
        return false;
    }
}

/**
 * 防抖保存（300ms）
 * 连续调用只会触发一次实际保存
 */
export function saveDebounced() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveTimeout = null;
        saveStorage();
    }, 300);
}

// ============================================
// 方案管理
// ============================================

/**
 * 获取当前激活方案
 * @async
 * @returns {Promise<ThemeScheme>}
 */
export async function getActiveScheme() {
    const data = await loadStorage();
    const id = data.settings.activeSchemeId || 'default';

    // 确保激活方案存在
    if (!data.schemes[id]) {
        const defaultScheme = JSON.parse(JSON.stringify(DEFAULT_DATA.schemes.default));
        defaultScheme.id = id;
        data.schemes[id] = defaultScheme;
    }

    return data.schemes[id];
}

/**
 * 获取所有方案列表（用于渲染下拉框）
 * @async
 * @returns {Promise<{id: string, name: string, isActive: boolean}[]>}
 */
export async function getSchemeList() {
    const data = await loadStorage();
    const activeId = data.settings.activeSchemeId;
    return Object.values(data.schemes).map(s => ({
        id: s.id,
        name: s.name,
        isActive: s.id === activeId
    }));
}

/**
 * 保存当前方案的CSS内容
 * @async
 * @param {string} cssContent - 用户输入的CSS
 */
export async function saveSchemeCSS(cssContent) {
    const data = await loadStorage();
    const scheme = data.schemes[data.settings.activeSchemeId];
    if (scheme) {
        scheme.cssContent = cssContent;
        scheme.updatedAt = Date.now();
        saveDebounced();
    }
}

/**
 * 创建新方案
 * @async
 * @param {string} name - 方案名称
 * @returns {Promise<ThemeScheme>} 新建的方案
 */
export async function createScheme(name) {
    const data = await loadStorage();
    const id = `scheme-${Date.now()}`;
    data.schemes[id] = {
        id,
        name: name.trim() || '新方案',
        cssContent: '',
        htmlInjections: [],
        jsContent: '',
        jsAutoRun: false,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    data.settings.activeSchemeId = id;
    await saveStorage(); // 重要操作立即保存
    logger.info('themeEngine', '[Storage.createScheme] 新建方案:', name, id);
    return data.schemes[id];
}

/**
 * 切换激活方案
 * @async
 * @param {string} id - 目标方案ID
 * @returns {Promise<ThemeScheme|null>} 切换后的方案，失败返回null
 */
export async function switchScheme(id) {
    const data = await loadStorage();
    if (!data.schemes[id]) {
        logger.warn('themeEngine', '[Storage.switchScheme] 方案不存在:', id);
        return null;
    }
    data.settings.activeSchemeId = id;
    await saveStorage();
    logger.info('themeEngine', '[Storage.switchScheme] 切换至:', id);
    return data.schemes[id];
}

/**
 * 删除方案
 * @async
 * @param {string} id - 要删除的方案ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function deleteScheme(id) {
    if (id === 'default') {
        logger.warn('themeEngine', '[Storage.deleteScheme] 不允许删除默认方案');
        return false;
    }

    const data = await loadStorage();
    if (Object.keys(data.schemes).length <= 1) {
        logger.warn('themeEngine', '[Storage.deleteScheme] 只剩一个方案，不允许删除');
        return false;
    }

    const wasActive = data.settings.activeSchemeId === id;
    delete data.schemes[id];

    if (wasActive) {
        data.settings.activeSchemeId = data.schemes.default
            ? 'default'
            : Object.keys(data.schemes)[0];
    }

    await saveStorage();
    logger.info('themeEngine', '[Storage.deleteScheme] 已删除方案:', id);
    return true;
}

/**
 * 重命名方案
 * @async
 * @param {string} id - 方案ID
 * @param {string} newName - 新名称
 * @returns {Promise<boolean>}
 */
export async function renameScheme(id, newName) {
    const data = await loadStorage();
    if (!data.schemes[id]) return false;
    data.schemes[id].name = newName.trim() || data.schemes[id].name;
    data.schemes[id].updatedAt = Date.now();
    await saveStorage();
    return true;
}

/**
 * 保存当前方案的HTML注入列表
 * @async
 * @param {HtmlInjection[]} injections - HTML注入项列表
 */
export async function saveSchemeHTML(injections) {
    const data = await loadStorage();
    const scheme = data.schemes[data.settings.activeSchemeId];
    if (scheme) {
        scheme.htmlInjections = injections;
        scheme.updatedAt = Date.now();
        saveDebounced();
    }
}

/**
 * 保存当前方案的JS内容
 * @async
 * @param {string} jsContent - 用户输入的JS
 */
export async function saveSchemeJS(jsContent) {
    const data = await loadStorage();
    const scheme = data.schemes[data.settings.activeSchemeId];
    if (scheme) {
        scheme.jsContent = jsContent;
        scheme.updatedAt = Date.now();
        saveDebounced();
    }
}

/**
 * 保存当前方案的JS自动执行开关
 * @async
 * @param {boolean} autoRun - 是否自动执行
 */
export async function saveSchemeJSAutoRun(autoRun) {
    const data = await loadStorage();
    const scheme = data.schemes[data.settings.activeSchemeId];
    if (scheme) {
        scheme.jsAutoRun = autoRun;
        scheme.updatedAt = Date.now();
        saveDebounced();
    }
}

/**
 * 强制刷新缓存（下次读取会重新从文件加载）
 */
export function invalidateCache() {
    cachedData = null;
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
}

