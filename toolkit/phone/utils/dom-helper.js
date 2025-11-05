/**
 * DOM 操作工具
 * @module phone/utils/dom-helper
 */

/**
 * 创建元素（快捷方法）
 * @param {string} tag - 标签名
 * @param {string} [className] - 类名
 * @param {string} [innerHTML] - 内部 HTML
 * @returns {HTMLElement} 元素
 */
function createElement(tag, className = '', innerHTML = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (innerHTML) el.innerHTML = innerHTML;
  return el;
}

/**
 * 滚动到底部
 * @param {HTMLElement} container - 容器元素
 * @param {boolean} [smooth=true] - 是否平滑滚动
 */
function scrollToBottom(container, smooth = true) {
  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
}

export {
  createElement,
  scrollToBottom
};

