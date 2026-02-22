/**
 * 节目单 UI - 渲染和交互
 * 
 * @description
 * 负责节目单面板的创建、渲染和交互逻辑
 * 保持与原版节目单一致的视觉风格
 */

import logger from '../logger.js';
import {
  getProgramHistory,
  addProgram,
  deleteProgram,
  sendProgram,
  setCurrentProgram,
  getState,
  toggleProgramPanel,
  switchToSettings,
  switchToMain
} from './program-manager.js';

// 面板和容器 ID
const PANEL_ID = 'pp-panel';
const CONTAINER_ID = 'pp-container';

/**
 * 创建面板 DOM
 * 
 * @description
 * 创建节目单面板，包括：
 * - 帷幕顶部
 * - 标签栏
 * - 内容区域
 */
export function createProgramPanel() {
  // 如果已存在，先删除
  const existingContainer = document.getElementById(CONTAINER_ID);
  if (existingContainer) {
    existingContainer.remove();
  }

  // 创建外层容器（控制显示隐藏）
  const container = document.createElement('div');
  container.id = CONTAINER_ID;
  container.className = 'pp-container';
  container.style.display = 'none';
  // 设置默认位置（避免面板出现在屏幕外）
  container.style.left = '20px';
  container.style.top = '150px';

  // 创建内层面板（样式）
  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'pp-panel';

  // 帷幕顶部
  const curtainHeader = createCurtainHeader();

  // 标签栏
  const tabBar = createTabBar();

  // 内容区域
  const content = createContent();

  // 组装结构：container > panel > (header, tabBar, content)
  panel.appendChild(curtainHeader);
  panel.appendChild(tabBar);
  panel.appendChild(content);
  container.appendChild(panel);

  // 添加到 body
  document.body.appendChild(container);

  // 绑定事件
  bindPanelEvents(panel);

  logger.info('program', '[ProgramUI.createProgramPanel] 面板已创建');
}

/**
 * 创建帷幕顶部
 */
function createCurtainHeader() {
  const header = document.createElement('div');
  header.className = 'pp-curtain-header';

  // 标题
  const title = document.createElement('div');
  title.className = 'pp-curtain-title';
  title.textContent = '节目单';

  // 操作按钮
  const actions = document.createElement('div');
  actions.className = 'pp-header-actions';

  // 关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.className = 'pp-header-btn';
  closeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  closeBtn.title = '关闭';
  closeBtn.addEventListener('click', () => {
    toggleProgramPanel();
  });

  // 设置按钮
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'pp-header-btn';
  settingsBtn.innerHTML = '<i class="fa-solid fa-gear"></i>';
  settingsBtn.title = '设置';
  settingsBtn.addEventListener('click', () => {
    const currentState = getState();
    if (currentState.isSettingsMode) {
      switchToMain();
    } else {
      switchToSettings();
    }
  });

  actions.appendChild(settingsBtn);
  actions.appendChild(closeBtn);
  header.appendChild(title);
  header.appendChild(actions);

  return header;
}

/**
 * 创建标签栏
 */
function createTabBar() {
  const tabBar = document.createElement('div');
  tabBar.className = 'pp-tab-bar';

  // 当前节目标签
  const currentTab = document.createElement('button');
  currentTab.className = 'pp-tab-btn active';
  currentTab.dataset.tab = 'current';
  currentTab.innerHTML = '当前节目<span class="count">(0)</span>';
  currentTab.addEventListener('click', () => switchTab('current'));

  // 过往节目标签
  const historyTab = document.createElement('button');
  historyTab.className = 'pp-tab-btn';
  historyTab.dataset.tab = 'history';
  historyTab.innerHTML = '过往节目<span class="count">(0)</span>';
  historyTab.addEventListener('click', () => switchTab('history'));

  tabBar.appendChild(currentTab);
  tabBar.appendChild(historyTab);

  return tabBar;
}

/**
 * 创建内容区域
 */
function createContent() {
  const content = document.createElement('div');
  content.className = 'pp-content';
  content.id = 'pp-content-area';

  // 当前节目内容容器
  const currentContent = document.createElement('div');
  currentContent.id = 'pp-current-content';
  content.appendChild(currentContent);

  // 历史记录内容容器
  const historyContent = document.createElement('div');
  historyContent.id = 'pp-history-content';
  historyContent.style.display = 'none';
  content.appendChild(historyContent);

  // 空状态（默认显示）
  const emptyState = createEmptyState();
  content.appendChild(emptyState);

  return content;
}

/**
 * 创建空状态
 */
function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'pp-empty';
  empty.id = 'pp-empty-state';
  empty.innerHTML = `
        <div class="icon"><i class="fa-solid fa-cat"></i></div>
        <div class="text">等待聚光灯亮起...</div>
    `;
  return empty;
}

/**
 * 切换标签页
 * 
 * @param {string} tabName - 标签名称 ('current' | 'history')
 */
function switchTab(tabName) {
  const tabs = document.querySelectorAll('.pp-tab-btn');
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // 刷新内容
  refreshContent(tabName);
  logger.debug('program', '[ProgramUI.switchTab] 切换到:', tabName);
}

/**
 * 刷新内容区域
 * 
 * @param {string} tabName - 标签名称
 */
function refreshContent(tabName) {
  const currentContent = document.getElementById('pp-current-content');
  const historyContent = document.getElementById('pp-history-content');
  const emptyState = document.getElementById('pp-empty-state');

  if (!currentContent || !historyContent) return;

  if (tabName === 'current') {
    currentContent.style.display = 'block';
    historyContent.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    renderCurrentProgram(currentContent);
  } else {
    currentContent.style.display = 'none';
    historyContent.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    renderHistory(historyContent);
  }
}

/**
 * 渲染当前节目
 */
function renderCurrentProgram(container) {
  const state = getState();

  // 更新标签计数
  updateTabCounts();

  // 清空内容
  container.innerHTML = '';

  // 使用 currentProgram（包含所有当前解析出的节目）
  const currentProgram = state.currentProgram;

  if (!currentProgram || currentProgram.length === 0) {
    // 空状态
    const empty = createEmptyState();
    container.appendChild(empty);
    return;
  }

  // 渲染所有当前节目
  currentProgram.forEach((item, index) => {
    const card = createProgramCard(item, index);
    container.appendChild(card);
  });
}

/**
 * 渲染历史记录
 */
function renderHistory(container) {
  const history = getProgramHistory();

  // 更新标签计数
  updateTabCounts();

  // 清空内容
  container.innerHTML = '';

  // 搜索栏
  const searchBar = createSearchBar();
  container.appendChild(searchBar);

  if (history.length === 0) {
    // 空状态
    const empty = createEmptyState();
    container.appendChild(empty);
    return;
  }

  // 显示所有历史记录（不跳过任何一条）
  history.forEach((program, index) => {
    const item = createHistoryItem(program, index);
    container.appendChild(item);
  });
}

/**
 * 创建搜索栏
 */
function createSearchBar() {
  const searchBar = document.createElement('div');
  searchBar.className = 'pp-search-bar';

  const wrapper = document.createElement('div');
  wrapper.className = 'pp-search-wrapper';

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-magnifying-glass pp-search-icon';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'pp-search-input';
  input.placeholder = '搜索节目...';
  input.addEventListener('input', (e) => {
    filterHistory(e.target.value);
  });

  wrapper.appendChild(icon);
  wrapper.appendChild(input);
  searchBar.appendChild(wrapper);

  return searchBar;
}

/**
 * 筛选历史记录
 * 
 * @param {string} query - 搜索关键词
 */
function filterHistory(query) {
  const items = document.querySelectorAll('.pp-history-item');
  const lowerQuery = query.toLowerCase();

  items.forEach(item => {
    const topic = item.querySelector('.topic')?.textContent?.toLowerCase() || '';
    if (topic.includes(lowerQuery)) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

/**
 * 创建节目卡片
 */
function createProgramCard(program, index) {
  const card = document.createElement('div');
  card.className = 'pp-card';

  // 头部 - 添加 data-index 属性
  const header = document.createElement('div');
  header.className = 'pp-card-header';
  header.dataset.index = index;

  // 包裹主题和元信息的容器
  const contentWrapper = document.createElement('div');

  // 主题
  const topic = document.createElement('div');
  topic.className = 'pp-card-topic';
  topic.textContent = program.topic || '未命名';

  // 元信息
  const meta = document.createElement('div');
  meta.className = 'pp-card-meta';

  if (program.genre) {
    const tag = document.createElement('span');
    tag.className = 'pp-card-tag';
    tag.textContent = program.genre;
    meta.appendChild(tag);
  }

  // 组装内容包装器
  contentWrapper.appendChild(topic);
  contentWrapper.appendChild(meta);

  // 展开按钮 - 使用 span 而不是 div
  const expand = document.createElement('span');
  expand.className = 'pp-card-expand';
  expand.textContent = '···';

  // 头部点击展开/收起
  header.addEventListener('click', (e) => {
    // 如果点击的是按钮，不触发展开
    if (e.target.closest('.pp-card-actions')) return;
    card.classList.toggle('expanded');
  });

  header.appendChild(contentWrapper);
  header.appendChild(expand);

  // 身体
  const body = document.createElement('div');
  body.className = 'pp-card-body';

  // 描述
  if (program.expansion_angles) {
    const desc = document.createElement('div');
    desc.className = 'pp-card-desc';
    desc.textContent = program.expansion_angles;
    body.appendChild(desc);
  }

  // 操作按钮
  const actions = document.createElement('div');
  actions.className = 'pp-card-actions';

  // 发送按钮
  const sendBtn = document.createElement('button');
  sendBtn.className = 'pp-card-btn pp-card-btn-send';
  sendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> 发送';
  sendBtn.addEventListener('click', async () => {
    // 传递完整的节目对象，让 manager 生成发送内容
    await sendProgram(program, program.useJs || false);
  });

  // JS模式按钮
  const setBtn = document.createElement('button');
  setBtn.className = 'pp-card-btn pp-card-btn-js';
  setBtn.innerHTML = '<i class="fa-solid fa-code"></i> JS';
  // 添加复选框
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = program.useJs || false;
  checkbox.addEventListener('change', (e) => {
    program.useJs = e.target.checked;
    setBtn.classList.toggle('active', e.target.checked);
  });
  setBtn.appendChild(checkbox);
  setBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 切换复选框状态
    checkbox.checked = !checkbox.checked;
    program.useJs = checkbox.checked;
    setBtn.classList.toggle('active', checkbox.checked);
  });

  actions.appendChild(sendBtn);
  actions.appendChild(setBtn);
  body.appendChild(actions);

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

/**
 * 创建历史记录项
 */
function createHistoryItem(program, realIndex) {
  const item = document.createElement('div');
  item.className = 'pp-history-item';

  // 主题
  const topic = document.createElement('span');
  topic.className = 'topic';
  topic.textContent = program.topic || '未命名';

  // 日期
  const date = document.createElement('span');
  date.className = 'date';
  if (program.timestamp) {
    const d = new Date(program.timestamp);
    date.textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // 删除按钮
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteProgram(realIndex);
    refreshContent('history');
  });

  // 点击设为当前
  item.addEventListener('click', () => {
    setCurrentProgram(program);
    switchTab('current');
  });

  item.appendChild(topic);
  item.appendChild(date);
  item.appendChild(deleteBtn);

  return item;
}

/**
 * 更新标签计数
 */
function updateTabCounts() {
  const history = getProgramHistory();
  const state = getState();
  // 当前节目数量 = 实际解析到的节目数（不再硬编码为1）
  const currentCount = state.currentProgram?.length || 0;
  const historyCount = history.length;

  const currentTab = document.querySelector('.pp-tab-btn[data-tab="current"] .count');
  const historyTab = document.querySelector('.pp-tab-btn[data-tab="history"] .count');

  if (currentTab) currentTab.textContent = `(${currentCount})`;
  if (historyTab) historyTab.textContent = `(${historyCount})`;

  // 同时更新悬浮按钮徽章
  updateBadge(currentCount);
}

/**
 * 更新悬浮按钮徽章
 * @param {number} count - 当前节目数量
 */
export function updateBadge(count) {
  const btn = document.getElementById('pp-toggle-btn');
  if (!btn) return;

  let badge = btn.querySelector('.badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'badge';
    btn.appendChild(badge);
  }

  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

/**
 * 绑定面板事件（包含面板头部拖动）
 *
 * @description
 * 绑定帷幕顶部（.pp-curtain-header）的拖动事件，
 * 拖动时移动整个容器（#pp-container），保持在窗口内
 */
function bindPanelEvents(panel) {
  const header = panel.querySelector('.pp-curtain-header');
  if (!header) return;

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const container = document.getElementById('pp-container');
  if (!container) return;

  header.style.cursor = 'move';

  // 鼠标按下 - 开始拖动
  header.addEventListener('mousedown', (e) => {
    // 忽略按钮点击
    if (e.target.closest('.pp-header-btn')) return;

    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = container.offsetLeft;
    startTop = container.offsetTop;

    const onMouseMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      // 限制在窗口内（面板宽约320px，高约400px）
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 320));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - 200));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // 触摸支持
  header.addEventListener('touchstart', (e) => {
    if (e.target.closest('.pp-header-btn')) return;

    e.preventDefault();
    const touch = e.touches[0];
    isDragging = true;
    startX = touch.clientX;
    startY = touch.clientY;
    startLeft = container.offsetLeft;
    startTop = container.offsetTop;

    const onTouchMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      let newLeft = startLeft + deltaX;
      let newTop = startTop + deltaY;

      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - 320));
      newTop = Math.max(0, Math.min(newTop, window.innerHeight - 200));

      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
    };

    const onTouchEnd = () => {
      isDragging = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: false });
}

/**
 * 刷新面板（供 manager 调用）
 */
export function refreshProgramPanelUI() {
  const state = getState();

  // 如果在设置模式，不刷新内容
  if (state.isSettingsMode) {
    return;
  }

  const activeTab = document.querySelector('.pp-tab-btn.active')?.dataset.tab || 'current';
  refreshContent(activeTab);
}

// 注册到全局，供 manager 调用
window.refreshProgramPanel = refreshProgramPanelUI;

logger.info('program', '[ProgramUI] UI 模块已加载');
