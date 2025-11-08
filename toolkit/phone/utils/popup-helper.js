/**
 * 手机弹窗工具（通用）
 * @module phone/utils/popup-helper
 * 
 * @description
 * 统一的弹窗组件，替换官方 callGenericPopup
 * 提供输入、确认、自定义内容三种弹窗类型
 * 样式统一、带动画效果、可扩展
 */

import logger from '../../../logger.js';

/**
 * 显示输入弹窗
 * 
 * @description
 * 弹出输入框，支持单行/多行输入
 * 
 * @async
 * @param {string} title - 弹窗标题
 * @param {string} defaultValue - 默认值
 * @param {Object} [options={}] - 配置项
 * @param {boolean} [options.multiline=false] - 是否多行输入
 * @param {string} [options.placeholder=''] - 占位符
 * @param {string} [options.okButton='保存'] - 确定按钮文字
 * @param {string} [options.cancelButton='取消'] - 取消按钮文字
 * @param {number} [options.maxLength=500] - 最大字符数
 * @param {string} [options.hint=''] - 提示信息（显示在输入框上方）
 * @returns {Promise<string|null>} 用户输入（取消返回 null）
 * 
 * @example
 * const remark = await showInputPopup('设置备注', contact.remark, { 
 *   placeholder: '请输入备注',
 *   maxLength: 50,
 *   hint: '这是一个小提示'
 * });
 */
export async function showInputPopup(title, defaultValue = '', options = {}) {
  const {
    multiline = false,
    placeholder = '',
    okButton = '保存',
    cancelButton = '取消',
    maxLength = 500,
    hint = ''
  } = options;

  logger.debug('[PopupHelper.showInputPopup] 显示输入弹窗:', title);

  return new Promise((resolve) => {
    // 创建弹窗HTML
    const inputHTML = multiline
      ? `<textarea class="phone-popup-input" placeholder="${placeholder}" maxlength="${maxLength}" rows="4">${defaultValue}</textarea>`
      : `<input type="text" class="phone-popup-input" placeholder="${placeholder}" maxlength="${maxLength}" value="${defaultValue}">`;

    const hintHTML = hint ? `<div class="phone-popup-hint">${hint}</div>` : '';

    const popupHTML = `
            <div class="phone-popup">
                <div class="phone-popup-header">
                    <h3>${title}</h3>
                    <button class="phone-popup-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="phone-popup-content">
                    ${hintHTML}
                    ${inputHTML}
                </div>
                <div class="phone-popup-footer">
                    <button class="phone-popup-cancel">${cancelButton}</button>
                    <button class="phone-popup-ok">${okButton}</button>
                </div>
            </div>
        `;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'phone-popup-overlay';
    overlay.innerHTML = popupHTML;
    document.body.appendChild(overlay);

    // 触发动画
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    // 获取元素
    const input = overlay.querySelector('.phone-popup-input');
    const closeBtn = overlay.querySelector('.phone-popup-close');
    const cancelBtn = overlay.querySelector('.phone-popup-cancel');
    const okBtn = overlay.querySelector('.phone-popup-ok');

    // 聚焦输入框，选中文本
    if (input) {
      input.focus();
      if (!multiline && input instanceof HTMLInputElement) {
        input.select();
      }
    }

    // 关闭弹窗
    const closePopup = (result) => {
      logger.debug('[PopupHelper.showInputPopup] 弹窗关闭，结果:', result === null ? '取消' : '确定');
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 300); // 等待动画完成
    };

    // 绑定事件
    closeBtn?.addEventListener('click', () => closePopup(null));
    cancelBtn?.addEventListener('click', () => closePopup(null));
    okBtn?.addEventListener('click', () => {
      const value = input?.value?.trim() || '';
      closePopup(value);
    });

    // 回车提交（仅单行输入）
    if (!multiline && input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const value = input.value.trim();
          closePopup(value);
        }
      });
    }

    // ESC 取消
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closePopup(null);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

/**
 * 显示确认弹窗
 * 
 * @description
 * 弹出确认对话框，用于危险操作或重要提示
 * 
 * @async
 * @param {string} title - 弹窗标题
 * @param {string} message - 提示消息
 * @param {Object} [options={}] - 配置项
 * @param {string} [options.okButton='确定'] - 确定按钮文字
 * @param {string} [options.cancelButton='取消'] - 取消按钮文字
 * @param {boolean} [options.danger=false] - 是否危险操作（确定按钮显示红色）
 * @returns {Promise<boolean>} 是否确认（true=确定，false=取消）
 * 
 * @example
 * const confirmed = await showConfirmPopup(
 *   '删除好友',
 *   '确定要删除该好友吗？此操作不可撤销。',
 *   { danger: true, okButton: '删除' }
 * );
 */
export async function showConfirmPopup(title, message, options = {}) {
  const {
    okButton = '确定',
    cancelButton = '取消',
    danger = false
  } = options;

  logger.debug('[PopupHelper.showConfirmPopup] 显示确认弹窗:', title);

  return new Promise((resolve) => {
    // 创建弹窗HTML
    const dangerClass = danger ? 'danger' : '';
    const popupHTML = `
            <div class="phone-popup">
                <div class="phone-popup-header">
                    <h3>${title}</h3>
                    <button class="phone-popup-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="phone-popup-content">
                    <p class="phone-popup-message">${message}</p>
                </div>
                <div class="phone-popup-footer">
                    <button class="phone-popup-cancel">${cancelButton}</button>
                    <button class="phone-popup-ok ${dangerClass}">${okButton}</button>
                </div>
            </div>
        `;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'phone-popup-overlay';
    overlay.innerHTML = popupHTML;
    document.body.appendChild(overlay);

    // 触发动画
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    // 获取元素
    const closeBtn = overlay.querySelector('.phone-popup-close');
    const cancelBtn = overlay.querySelector('.phone-popup-cancel');
    const okBtn = overlay.querySelector('.phone-popup-ok');

    // 关闭弹窗
    const closePopup = (result) => {
      logger.debug('[PopupHelper.showConfirmPopup] 弹窗关闭，结果:', result ? '确定' : '取消');
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 300);
    };

    // 绑定事件
    closeBtn?.addEventListener('click', () => closePopup(false));
    cancelBtn?.addEventListener('click', () => closePopup(false));
    okBtn?.addEventListener('click', () => closePopup(true));

    // ESC 取消
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closePopup(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

/**
 * 显示自定义内容弹窗
 * 
 * @description
 * 弹出自定义HTML内容，支持自定义按钮
 * 适用于复杂场景（如分组选择器）
 * 
 * @async
 * @param {string} title - 弹窗标题
 * @param {string} contentHTML - 内容HTML
 * @param {Object} [options={}] - 配置项
 * @param {Array<Object>} [options.buttons=[]] - 按钮配置数组
 * @param {boolean} [options.showClose=true] - 是否显示关闭按钮
 * @param {string} [options.width='auto'] - 弹窗宽度（如 '500px'）
 * @returns {Promise<any>} 用户操作结果
 * 
 * @example
 * const result = await showCustomPopup('选择分组', selectorHTML, {
 *   buttons: [
 *     { text: '取消', value: null, class: 'cancel' },
 *     { text: '确定', value: 'ok', class: 'ok' }
 *   ]
 * });
 */
export async function showCustomPopup(title, contentHTML, options = {}) {
  const {
    buttons = [],
    showClose = true,
    width = 'auto'
  } = options;

  logger.debug('[PopupHelper.showCustomPopup] 显示自定义弹窗:', title);

  return new Promise((resolve) => {
    // 创建按钮HTML
    const buttonsHTML = buttons.length > 0
      ? `<div class="phone-popup-footer">
                ${buttons.map((btn, index) =>
        `<button class="phone-popup-btn ${btn.class || ''}" data-index="${index}">${btn.text}</button>`
      ).join('')}
            </div>`
      : '';

    // 创建弹窗HTML
    const closeButtonHTML = showClose
      ? `<button class="phone-popup-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>`
      : '';

    const popupHTML = `
            <div class="phone-popup" ${width !== 'auto' ? `style="width: ${width}; max-width: 90%;"` : ''}>
                <div class="phone-popup-header">
                    <h3>${title}</h3>
                    ${closeButtonHTML}
                </div>
                <div class="phone-popup-content">
                    ${contentHTML}
                </div>
                ${buttonsHTML}
            </div>
        `;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'phone-popup-overlay';
    overlay.innerHTML = popupHTML;
    document.body.appendChild(overlay);

    // 触发动画
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });

    // 获取元素
    const closeBtn = overlay.querySelector('.phone-popup-close');
    const buttonElements = overlay.querySelectorAll('.phone-popup-btn');

    // 关闭弹窗
    const closePopup = (result) => {
      logger.debug('[PopupHelper.showCustomPopup] 弹窗关闭，结果:', result);
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 300);
    };

    // 绑定关闭按钮
    closeBtn?.addEventListener('click', () => closePopup(null));

    // 绑定自定义按钮
    buttonElements.forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index || '0', 10);
        const value = buttons[index]?.value;
        closePopup(value);
      });
    });

    // ESC 关闭
    if (showClose) {
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          closePopup(null);
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);
    }

    // 返回弹窗元素和关闭函数（供外部调用）
    resolve.overlay = overlay;
    resolve.close = closePopup;
  });
}

/**
 * 显示自定义内容弹窗（支持在关闭前获取数据）
 * 
 * @description
 * 与showCustomPopup相同，但支持在弹窗关闭前通过beforeClose回调获取表单数据
 * 用于避免弹窗关闭后DOM被移除导致无法获取输入值的问题
 * 
 * @param {string} title - 弹窗标题
 * @param {string} contentHTML - 内容HTML
 * @param {Object} options - 配置项
 * @param {Array<Object>} options.buttons - 按钮配置数组
 * @param {boolean} [options.showClose=true] - 是否显示关闭按钮
 * @param {string} [options.width='auto'] - 弹窗宽度
 * @param {Function} [options.onShow] - 弹窗显示后立即执行的回调 (overlay) => void，用于绑定内部事件
 * @param {Function} [options.beforeClose] - 关闭前回调 (buttonValue, overlay) => data
 * @returns {Promise<any>} beforeClose回调的返回值
 * 
 * @example
 * const result = await showCustomPopupWithData('标题', '<input id="name">', {
 *   buttons: [{ text: '保存', value: 'ok' }],
 *   onShow: (overlay) => {
 *     // 弹窗显示后绑定搜索等功能
 *     const input = overlay.querySelector('#search');
 *     input.addEventListener('input', handleSearch);
 *   },
 *   beforeClose: (value) => {
 *     if (value === 'ok') {
 *       return { name: document.querySelector('#name').value };
 *     }
 *     return null;
 *   }
 * });
 */
export async function showCustomPopupWithData(title, contentHTML, options = {}) {
  const {
    buttons = [],
    showClose = true,
    width = 'auto',
    beforeClose = null,
    onShow = null
  } = options;

  logger.debug('[PopupHelper.showCustomPopupWithData] 显示自定义弹窗:', title);

  return new Promise((resolve) => {
    // 创建按钮HTML
    const buttonsHTML = buttons.length > 0
      ? `<div class="phone-popup-footer">
                ${buttons.map((btn, index) =>
        `<button class="phone-popup-btn ${btn.class || ''}" data-index="${index}">${btn.text}</button>`
      ).join('')}
            </div>`
      : '';

    // 创建弹窗HTML
    const closeButtonHTML = showClose
      ? `<button class="phone-popup-close" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button>`
      : '';

    const popupHTML = `
            <div class="phone-popup" ${width !== 'auto' ? `style="width: ${width}; max-width: 90%;"` : ''}>
                <div class="phone-popup-header">
                    <h3>${title}</h3>
                    ${closeButtonHTML}
                </div>
                <div class="phone-popup-content">
                    ${contentHTML}
                </div>
                ${buttonsHTML}
            </div>
        `;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'phone-popup-overlay';
    overlay.innerHTML = popupHTML;
    document.body.appendChild(overlay);

    // 触发动画
    requestAnimationFrame(() => {
      overlay.classList.add('show');

      // 弹窗显示后立即调用回调（用于绑定内部事件等）
      if (onShow && typeof onShow === 'function') {
        try {
          onShow(overlay);
          logger.debug('[PopupHelper.showCustomPopupWithData] onShow回调已执行');
        } catch (error) {
          logger.error('[PopupHelper.showCustomPopupWithData] onShow回调错误:', error);
        }
      }
    });

    // 获取元素
    const closeBtn = overlay.querySelector('.phone-popup-close');
    const buttonElements = overlay.querySelectorAll('.phone-popup-btn');

    // 关闭弹窗
    const closePopup = (buttonValue) => {
      // 在关闭前调用回调获取数据（传递overlay让回调可以访问DOM）
      let result = buttonValue;
      if (beforeClose && typeof beforeClose === 'function') {
        try {
          result = beforeClose(buttonValue, overlay);
          logger.debug('[PopupHelper.showCustomPopupWithData] beforeClose回调返回:', result);
        } catch (error) {
          logger.error('[PopupHelper.showCustomPopupWithData] beforeClose回调错误:', error);
          result = buttonValue;
        }
      }

      logger.debug('[PopupHelper.showCustomPopupWithData] 弹窗关闭，结果:', result);
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(result);
      }, 300);
    };

    // 绑定关闭按钮
    closeBtn?.addEventListener('click', () => closePopup(null));

    // 绑定自定义按钮
    buttonElements.forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index || '0', 10);
        const value = buttons[index]?.value;
        closePopup(value);
      });
    });

    // ESC 关闭
    if (showClose) {
      const handleEsc = (e) => {
        if (e.key === 'Escape') {
          closePopup(null);
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);
    }

    logger.info('[PopupHelper.showCustomPopupWithData] 自定义弹窗已显示');
  });
}

