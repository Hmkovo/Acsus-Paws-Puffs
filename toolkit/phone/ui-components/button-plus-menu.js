/**
 * 右上角加号菜单组件
 * 
 * @module phone/ui-components/button-plus-menu
 * 
 * @description
 * 管理主界面右上角的+按钮弹出菜单，包含多个快捷功能入口
 * 
 * 功能列表：
 * - 同步酒馆角色（已实现）
 * - 创建群聊（待添加）
 * - 加好友/群（待添加）
 * - 分组管理（已实现）
 * - API设置（已实现）
 * - 清空手机数据（已实现）
 */

import logger from '../../../logger.js';

/**
 * 创建加号菜单DOM
 * 
 * @description
 * 创建包含6个菜单项的弹出菜单，初始状态为隐藏
 * 
 * @returns {HTMLElement} 加号菜单元素（.add-menu）
 */
export function createPlusMenu() {
  logger.debug('[PlusMenu] 创建加号菜单');

  const menu = document.createElement('div');
  menu.className = 'add-menu';
  menu.id = 'add-menu';

  // 菜单项配置
  const menuItems = [
    {
      icon: 'fa-arrows-rotate',
      text: '同步酒馆角色',
      action: 'sync-tavern-characters',
      enabled: true
    },
    {
      icon: 'fa-user-plus',
      text: '创建群聊',
      action: 'create-group',
      enabled: false
    },
    {
      icon: 'fa-user-group',
      text: '加好友/群',
      action: 'add-friend',
      enabled: false
    },
    {
      icon: 'fa-layer-group',
      text: '分组管理',
      action: 'manage-groups',
      enabled: true
    },
    {
      icon: 'fa-gear',
      text: 'API设置',
      action: 'api-settings',
      enabled: true
    },
    {
      icon: 'fa-sliders',
      text: '预设',
      action: 'preset-settings',
      enabled: true
    },
    {
      icon: 'fa-trash-can',
      text: '清空手机数据（临时）',
      action: 'clear-phone-data',
      enabled: true,
      style: 'color: #ff4d4f;' // 红色警告
    },
    {
      icon: 'fa-crown',
      text: '清空会员数据（测试）',
      action: 'clear-membership-data',
      enabled: true,
      style: 'color: #ff4d4f;' // 红色警告
    }
  ];

  // 创建菜单项
  menuItems.forEach(item => {
    const menuItem = document.createElement('div');
    menuItem.className = 'add-menu-item';
    menuItem.dataset.action = item.action;

    menuItem.innerHTML = `
      <i class="fa-solid ${item.icon}"></i>
      <span>${item.enabled ? item.text : item.text + '（待添加）'}</span>
    `;

    // 如果功能未启用，添加禁用样式
    if (!item.enabled) {
      menuItem.style.opacity = '0.5';
      menuItem.style.cursor = 'not-allowed';
    }

    // 如果有自定义样式，应用
    if (item.style) {
      const styleElement = menuItem.querySelector('span');
      if (styleElement) {
        styleElement.style.cssText = item.style;
      }
    }

    menu.appendChild(menuItem);
  });

  logger.info('[PlusMenu] 加号菜单创建完成，共', menuItems.length, '个选项');
  return menu;
}

/**
 * 绑定加号菜单的所有事件
 * 
 * @description
 * 绑定+按钮点击、菜单项点击、点击外部关闭等事件
 * 
 * @param {HTMLElement} overlayElement - 手机遮罩层元素（.phone-overlay）
 * @param {Function} onMenuItemClick - 菜单项点击回调函数
 */
export function bindPlusMenuEvents(overlayElement, onMenuItemClick) {
  logger.debug('[PlusMenu] 绑定加号菜单事件');

  const plusBtn = overlayElement.querySelector('#phone-btn-plus');
  const menu = overlayElement.querySelector('#add-menu');

  if (!plusBtn || !menu) {
    logger.warn('[PlusMenu] 找不到+按钮或菜单元素');
    return;
  }

  // +按钮点击：切换菜单显示/隐藏
  plusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu(/** @type {HTMLElement} */(menu));
  });

  // 菜单项点击
  const menuItems = menu.querySelectorAll('.add-menu-item');
  menuItems.forEach(item => {
    const itemElement = /** @type {HTMLElement} */ (item);
    itemElement.addEventListener('click', () => {
      const action = itemElement.dataset.action;
      const isEnabled = itemElement.style.cursor !== 'not-allowed';

      if (!isEnabled) {
        logger.debug('[PlusMenu] 功能未启用:', action);
        return;
      }

      logger.info('[PlusMenu] 点击菜单项:', action);

      // 关闭菜单
      hideMenu(/** @type {HTMLElement} */(menu));

      // 触发回调
      if (onMenuItemClick) {
        onMenuItemClick(action);
      }
    });
  });

  // 点击菜单外部关闭
  document.addEventListener('click', (e) => {
    const target = /** @type {Node} */ (e.target);
    if (!menu.contains(target) && target !== plusBtn) {
      hideMenu(/** @type {HTMLElement} */(menu));
    }
  });

  logger.info('[PlusMenu] 加号菜单事件绑定完成');
}

/**
 * 显示菜单
 * @param {HTMLElement} menu - 菜单元素
 */
function showMenu(menu) {
  menu.classList.add('active');
  logger.debug('[PlusMenu] 菜单已显示');
}

/**
 * 隐藏菜单
 * @param {HTMLElement} menu - 菜单元素
 */
function hideMenu(menu) {
  menu.classList.remove('active');
  logger.debug('[PlusMenu] 菜单已隐藏');
}

/**
 * 切换菜单显示/隐藏
 * @param {HTMLElement} menu - 菜单元素
 */
function toggleMenu(menu) {
  if (menu.classList.contains('active')) {
    hideMenu(menu);
  } else {
    showMenu(menu);
  }
}

/**
 * 导出供外部调用的函数
 */
export { showMenu, hideMenu, toggleMenu };

