/**
 * 点心铺手机 - 主入口
 * 
 * 职责：
 * - 初始化手机系统（使用 PhoneSystem 类）
 * - 提供打开/关闭手机界面的接口
 * - 注册扩展菜单
 * 
 * 依赖：
 * - phone-system.js
 * - phone-main-ui.js
 */

import logger from '../../logger.js';
import { renderPhoneFrame, closePhoneUI as closeUI } from './phone-main-ui.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../../../script.js';
import { extension_settings } from '../../../../../extensions.js';
import { initPhoneSystem, getPhoneSystem } from './phone-system.js';

// ========================================
// [CONST] 常量定义
// ========================================
const EXT_ID = 'acsusPawsPuffs';

/**
 * 初始化手机系统
 * 
 * @async
 * @returns {Promise<Object>} 返回 PhoneSystem 实例
 */
export async function initPhone() {
  logger.info('[Phone] 开始初始化手机系统');

  try {
    // 初始化 PhoneSystem（完全照搬日记）
    const system = await initPhoneSystem();

    // 如果功能启用，注册扩展菜单
    if (system.enabled) {
      registerMenuEntry();
    }

    logger.info('[Phone] 手机系统初始化完成');
    return system;
  } catch (error) {
    logger.error('[Phone] 手机系统初始化失败:', error);
    throw error;
  }
}

/**
 * 注册扩展菜单入口
 * 
 * @description
 * 在 extensionsMenuButton 的菜单中添加【手机】选项
 * 点击后打开手机界面
 * 根据 phoneSystem.enabled 控制初始显示状态
 */
function registerMenuEntry() {
  eventSource.on(event_types.APP_READY, () => {
    try {
      logger.debug('[Phone] 注册扩展菜单入口');

      // 获取扩展菜单容器
      const extensionsMenu = document.querySelector('#extensionsMenu');
      if (!extensionsMenu) {
        logger.warn('[Phone] 找不到扩展菜单容器');
        return;
      }

      // 创建【手机】菜单项
      const menuItem = document.createElement('div');
      menuItem.className = 'list-group-item flex-container flexGap5';
      menuItem.id = 'phone-menu-entry';
      menuItem.innerHTML = `
                <div class="fa-solid fa-mobile-screen extensionsMenuExtensionButton"></div>
                <span>手机</span>
            `;

      // 绑定点击事件
      menuItem.addEventListener('click', () => {
        logger.info('[Phone] 用户从扩展菜单打开手机');
        openPhoneUI();
      });

      // 添加到菜单
      extensionsMenu.appendChild(menuItem);

      // 根据启用状态控制初始显示
      const system = getPhoneSystem();
      if (system && !system.enabled) {
        menuItem.style.display = 'none';
      }

      logger.info('[Phone] 扩展菜单入口已注册');
    } catch (error) {
      logger.error('[Phone] 注册扩展菜单失败:', error);
    }
  });
}

/**
 * 打开手机界面
 * 
 * @description
 * 创建手机容器元素并添加到页面中
 * 如果已经打开，则不重复创建
 * 
 * @returns {void}
 */
export function openPhoneUI() {
  logger.info('[Phone] 打开手机界面');

  // 检查是否已经打开
  const existingOverlay = document.querySelector('.phone-overlay');
  if (existingOverlay) {
    logger.warn('[Phone] 手机界面已经打开，忽略重复调用');
    return;
  }

  try {
    // 渲染手机框架（返回的是 .phone-overlay）
    const phoneOverlay = renderPhoneFrame();

    // 添加到页面
    document.body.appendChild(phoneOverlay);

    logger.info('[Phone] 手机界面已打开');
  } catch (error) {
    logger.error('[Phone] 打开手机界面失败:', error);
    throw error;
  }
}

/**
 * 关闭手机界面
 * 
 * @description
 * 从页面中移除手机容器元素
 * 
 * @returns {void}
 */
export function closePhoneUI() {
  logger.info('[Phone] 关闭手机界面（从主入口调用）');
  closeUI();
}

/**
 * 启用手机系统
 * 
 * @async
 */
export async function enablePhone() {
  const system = getPhoneSystem();
  if (!system) {
    logger.error('[Phone] 手机系统未初始化');
    return;
  }

  system.enabled = true;
  extension_settings[EXT_ID].phone.enabled = true;
  saveSettingsDebounced();

  showMenuEntry();
  logger.info('[Phone] 手机系统已启用');
}

/**
 * 禁用手机系统
 */
export function disablePhone() {
  const system = getPhoneSystem();
  if (!system) {
    logger.error('[Phone] 手机系统未初始化');
    return;
  }

  system.enabled = false;
  extension_settings[EXT_ID].phone.enabled = false;
  saveSettingsDebounced();

  // 关闭手机界面（如果已打开）
  const existingOverlay = document.querySelector('.phone-overlay');
  if (existingOverlay) {
    closePhoneUI();
  }

  hideMenuEntry();
  logger.info('[Phone] 手机系统已禁用');
}

/**
 * 显示扩展菜单中的手机图标
 * 
 * @description
 * 设置菜单项为可见状态（display: ''）
 * 如果菜单项尚未创建，则不执行任何操作（等待 APP_READY 事件触发）
 * 
 * @returns {void}
 */
export function showMenuEntry() {
  try {
    const menuItem = document.getElementById('phone-menu-entry');
    if (menuItem) {
      menuItem.style.display = '';
      logger.debug('[Phone] 扩展菜单图标已显示');
    } else {
      logger.debug('[Phone] 菜单项尚未创建，跳过显示操作');
    }
  } catch (error) {
    logger.error('[Phone] 显示菜单图标失败:', error);
  }
}

/**
 * 隐藏扩展菜单中的手机图标
 * 
 * @description
 * 设置菜单项为隐藏状态（display: 'none'）
 * 如果菜单项尚未创建，则不执行任何操作
 * 
 * @returns {void}
 */
export function hideMenuEntry() {
  try {
    const menuItem = document.getElementById('phone-menu-entry');
    if (menuItem) {
      menuItem.style.display = 'none';
      logger.debug('[Phone] 扩展菜单图标已隐藏');
    } else {
      logger.debug('[Phone] 菜单项尚未创建，跳过隐藏操作');
    }
  } catch (error) {
    logger.error('[Phone] 隐藏菜单图标失败:', error);
  }
}

