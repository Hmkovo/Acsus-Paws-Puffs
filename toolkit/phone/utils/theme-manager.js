/**
 * 主题管理器（Theme Manager）
 *
 * @description
 * 管理手机界面的日间/夜间模式切换
 *
 * 核心功能：
 * 1. 切换主题（toggle）
 * 2. 设置主题（set）
 * 3. 获取当前主题（get）
 * 4. 持久化保存（localStorage）
 * 5. 初始化加载（init）
 *
 * 性能优化：
 * - 只修改一个 data-theme 属性，浏览器自动重新计算CSS变量
 * - 不遍历元素修改样式，性能极佳，不会卡顿
 */

import logger from '../../../logger.js';
import { saveData, loadData } from '../data-storage/storage-api.js';

// 主题常量
const THEME = {
  LIGHT: 'light',
  DARK: 'dark'
};

// 存储键名
const STORAGE_KEY = 'settings';

/**
 * 初始化主题管理器
 *
 * @description
 * 从存储加载主题设置，应用到界面
 * 在手机界面创建时调用一次
 *
 * @async
 * @param {HTMLElement} [container] - 可选，手机容器元素（.phone-container）
 *                                    如果传入则直接应用，不传则从 document 查找
 */
export async function initTheme(container) {
  logger.debug('phone','[ThemeManager] 初始化主题');

  // 从存储加载主题
  const savedTheme = await getTheme();

  // 应用主题（支持传入容器元素）
  applyTheme(savedTheme, container);

  logger.info('phone',`[ThemeManager] 主题已初始化: ${savedTheme}`);
}

/**
 * 切换主题（Toggle）
 *
 * @description
 * 日间 <-> 夜间 切换
 *
 * @async
 * @returns {Promise<string>} 切换后的主题 ('light' | 'dark')
 */
export async function toggleTheme() {
  const currentTheme = await getTheme();
  const newTheme = currentTheme === THEME.LIGHT ? THEME.DARK : THEME.LIGHT;

  await setTheme(newTheme);

  logger.info('phone',`[ThemeManager] 主题已切换: ${currentTheme} -> ${newTheme}`);

  return newTheme;
}

/**
 * 设置主题
 *
 * @async
 * @param {string} theme - 主题名称 ('light' | 'dark')
 */
export async function setTheme(theme) {
  if (theme !== THEME.LIGHT && theme !== THEME.DARK) {
    logger.warn('phone',`[ThemeManager] 无效的主题: ${theme}，使用默认主题 'light'`);
    theme = THEME.LIGHT;
  }

  // 应用主题
  applyTheme(theme);

  // 保存到存储
  await saveTheme(theme);

  logger.debug('phone',`[ThemeManager] 主题已设置: ${theme}`);
}

/**
 * 获取当前主题
 *
 * @async
 * @returns {Promise<string>} 当前主题 ('light' | 'dark')
 */
export async function getTheme() {
  const settings = await loadData(STORAGE_KEY) || {};
  return settings.theme || THEME.LIGHT;
}

/**
 * 应用主题到界面
 *
 * @description
 * 核心方法：只修改 .phone-container 的 data-theme 属性
 * 浏览器会自动重新计算所有CSS变量，性能极佳
 *
 * @param {string} theme - 主题名称 ('light' | 'dark')
 * @param {HTMLElement} [container] - 可选，手机容器元素（.phone-container）
 *                                    如果传入则直接使用，不传则从 document 查找
 */
function applyTheme(theme, container) {
  // 优先使用传入的容器，否则从 document 查找
  const phoneContainer = container || document.querySelector('.phone-container');

  if (!phoneContainer) {
    logger.warn('phone','[ThemeManager] 找不到 .phone-container，跳过应用主题');
    return;
  }

  // 核心：只修改一个属性，浏览器自动重新计算CSS变量
  if (theme === THEME.DARK) {
    phoneContainer.setAttribute('data-theme', 'dark');
  } else {
    phoneContainer.removeAttribute('data-theme');
  }

  logger.debug('phone',`[ThemeManager] 主题已应用到DOM: ${theme}`);
}

/**
 * 保存主题到存储
 *
 * @async
 * @param {string} theme - 主题名称
 */
async function saveTheme(theme) {
  const settings = await loadData(STORAGE_KEY) || {};
  settings.theme = theme;
  await saveData(STORAGE_KEY, settings);

  logger.debug('phone',`[ThemeManager] 主题已保存: ${theme}`);
}

/**
 * 获取主题图标
 *
 * @description
 * 用于更新按钮图标
 *
 * @param {string} theme - 主题名称
 * @returns {string} Font Awesome 图标类名
 */
export function getThemeIcon(theme) {
  return theme === THEME.DARK ? 'fa-sun' : 'fa-moon';
}

/**
 * 获取主题文本
 *
 * @description
 * 用于更新按钮文字
 *
 * @param {string} theme - 主题名称
 * @returns {string} 主题文字
 */
export function getThemeText(theme) {
  return theme === THEME.DARK ? '日间' : '夜间';
}
