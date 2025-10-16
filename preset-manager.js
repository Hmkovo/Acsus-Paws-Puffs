/**
 * 预设管理器 - 主控制器
 * 
 * 核心功能：
 * - 世界书条目集成管理
 * - 条目收纳模式（不干扰ST原生拖拽）
 * - 与SillyTavern原生预设系统无缝集成
 */

// ========================================
// ✅ SillyTavern 原生 API 导入（推荐方式）
// ========================================
import {
  extension_settings
} from '../../../extensions.js';

import {
  saveSettingsDebounced,
  eventSource,
  event_types
} from '../../../../script.js';

import { callGenericPopup } from '../../../popup.js';

import { isMobile } from '../../../RossAscends-mods.js';

// ========================================
// 本地模块导入
// ========================================
import { PresetManagerUI } from './preset-manager-ui.js';
import { WorldInfoIntegration } from './preset-manager-worldinfo.js';
import logger from './logger.js';

// ========================================
// 收纳管理器类
// ========================================
class NestingManager {
  constructor(presetModule) {
    this.presetModule = presetModule;
    this.isNestingMode = false;
    this.pendingItem = null;
    this.nestingData = new Map();  // 父ID -> [子ID数组]
    this.collapsedState = new Set();  // 折叠的容器ID集合
    this.promptListObserver = null;
    this.isUpdating = false;  // 防止循环触发的标志
    this.updateDebounceTimer = null;  // 防抖计时器
  }

  /**
   * 初始化
   */
  init() {
    this.loadNestingData();
    this.observePromptListChanges();
  }

  /**
   * 监听预设列表和footer的渲染变化
   */
  observePromptListChanges() {
    this.promptListObserver = new MutationObserver((mutations) => {
      // 如果正在更新DOM，忽略本次触发（避免循环）
      if (this.isUpdating) {
        return;
      }

      // 清除之前的防抖计时器
      if (this.updateDebounceTimer) {
        clearTimeout(this.updateDebounceTimer);
      }

      // 防抖：200ms内只执行一次
      this.updateDebounceTimer = setTimeout(() => {
        this.handlePromptListChange();
      }, 200);
    });

    // 观察整个预设管理器容器（包括footer）
    const container = document.querySelector('#completion_prompt_manager, #prompt_manager');
    if (container) {
      this.promptListObserver.observe(container, {
        childList: true,
        subtree: true  // 监听子树变化，包括footer
      });
    }
  }

  /**
   * 处理预设列表变化（防抖后执行）
   */
  handlePromptListChange() {
    // 1. 检查footer是否被重新渲染（按钮消失了）
    const footer = document.querySelector('.completion_prompt_manager_footer');
    if (footer && !footer.querySelector('.paws-nesting-mode-btn')) {
      logger.debug(' 检测到footer重新渲染，重新添加收纳按钮');
      this.addNestingModeButton();
    }

    // 2. 检查列表是否重新渲染（只在非收纳模式且有收纳数据时）
    const list = document.querySelector('#completion_prompt_manager_list');
    const $list = $(list);

    // 重要：只有在 sortable 已经初始化后才应用我们的修改
    // 避免干扰官方的 makeDraggable() 流程
    if (list && list.children.length > 0 && !this.isNestingMode && this.nestingData.size > 0) {
      // 检查 sortable 是否已经初始化
      if ($list.hasClass('ui-sortable')) {
        logger.debug(' ST渲染完成（sortable已初始化），重新应用收纳视觉');
        this.applyNestingChanges();
      } else {
        // sortable 还没初始化，等待下一次变化
        logger.debug(' ST正在渲染中（sortable未初始化），等待下一次检测');
      }
    }
  }

  /**
   * 应用收纳变化（带锁防止循环）
   */
  applyNestingChanges() {
    // 设置更新标志
    this.isUpdating = true;

    // 临时断开observer
    if (this.promptListObserver) {
      this.promptListObserver.disconnect();
    }

    try {
      // 执行DOM修改
      this.updateNestingVisuals();
      this.updateFunctionalIcons();
    } finally {
      // 重新连接observer（延迟100ms确保DOM修改完成）
      setTimeout(() => {
        this.isUpdating = false;

        // 重新连接observer
        const container = document.querySelector('#completion_prompt_manager, #prompt_manager');
        if (container && this.promptListObserver) {
          this.promptListObserver.observe(container, {
            childList: true,
            subtree: true
          });
        }
      }, 100);
    }
  }

  /**
   * 添加收纳模式按钮
   */
  addNestingModeButton() {
    const footer = document.querySelector('.completion_prompt_manager_footer');
    if (!footer || footer.querySelector('.paws-nesting-mode-btn')) return;

    // 找到"新提示词"按钮
    const newPromptBtn = footer.querySelector('.fa-plus-square');
    if (!newPromptBtn) return;

    // 创建收纳模式按钮（插入在"新提示词"按钮之前）
    const nestingBtn = document.createElement('a');
    nestingBtn.className = 'menu_button fa-folder fa-solid fa-fw interactable paws-nesting-mode-btn';
    nestingBtn.title = '收纳模式';
    nestingBtn.setAttribute('tabindex', '0');

    nestingBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // 检查是否启用了扩展
      if (!this.presetModule.enabled) {
        this.showMessage('请先启用预设管理增强功能', 'warning');
        return;
      }

      // 检查是否启用了预设收纳功能
      if (!this.presetModule.nestingEnabled) {
        this.showMessage('预设收纳功能已禁用', 'warning');
        return;
      }

      if (this.isNestingMode) {
        this.exitNestingMode();
      } else {
        this.enterNestingMode();
      }
    });

    // 创建清空收纳按钮（插入在收纳模式按钮之后）
    const clearBtn = document.createElement('a');
    clearBtn.className = 'menu_button fa-broom fa-solid fa-fw interactable paws-clear-nesting-btn';
    clearBtn.title = '清空当前预设的所有收纳';
    clearBtn.setAttribute('tabindex', '0');

    clearBtn.addEventListener('click', (e) => {
      e.preventDefault();

      // 检查是否启用了扩展
      if (!this.presetModule.enabled) {
        this.showMessage('请先启用预设管理增强功能', 'warning');
        return;
      }

      // 检查是否启用了预设收纳功能
      if (!this.presetModule.nestingEnabled) {
        this.showMessage('预设收纳功能已禁用', 'warning');
        return;
      }

      this.clearAllNesting();
    });

    // 插入到"新提示词"按钮之前
    newPromptBtn.parentElement.insertBefore(nestingBtn, newPromptBtn);
    newPromptBtn.parentElement.insertBefore(clearBtn, newPromptBtn);

    logger.debug(' 收纳模式按钮和清空按钮已添加');
  }

  /**
   * 进入收纳模式
   */
  enterNestingMode() {
    logger.debug(' 进入收纳模式');
    this.isNestingMode = true;

    const $list = $('#completion_prompt_manager_list');
    const list = $list[0];
    if (!list) return;

    // 1. 禁用ST的sortable
    if ($list.hasClass('ui-sortable')) {
      $list.sortable('disable');
      logger.debug(' 已临时禁用ST拖拽');
    }

    // 2. 添加视觉类
    list.classList.add('paws-nesting-mode');

    // 3. 显示提示栏
    this.showNestingHint();

    // 4. 添加收纳监听
    this.attachNestingListeners(list);

    // 5. 更新按钮状态
    const btn = document.querySelector('.paws-nesting-mode-btn');
    if (btn) {
      btn.classList.remove('fa-folder');
      btn.classList.add('fa-check');
      btn.title = '完成收纳';
      btn.style.color = 'var(--SmartThemeQuoteColor)';
    }

    this.showMessage('收纳模式已激活', 'info');
  }

  /**
   * 退出收纳模式
   */
  exitNestingMode() {
    logger.debug(' 退出收纳模式');
    this.isNestingMode = false;
    this.pendingItem = null;

    const $list = $('#completion_prompt_manager_list');
    const list = $list[0];
    if (!list) return;

    // 1. 重新启用ST的sortable
    if ($list.hasClass('ui-sortable')) {
      $list.sortable('enable');
      logger.debug(' 已恢复ST拖拽');
    }

    // 2. 移除视觉类
    list.classList.remove('paws-nesting-mode');
    list.querySelectorAll('.paws-pending, .paws-clickable').forEach(el => {
      el.classList.remove('paws-pending', 'paws-clickable');
    });

    // 3. 隐藏提示栏
    this.hideNestingHint();

    // 4. 移除收纳监听
    this.removeNestingListeners(list);

    // 5. 更新按钮状态
    const btn = document.querySelector('.paws-nesting-mode-btn');
    if (btn) {
      btn.classList.remove('fa-check');
      btn.classList.add('fa-folder');
      btn.title = '收纳模式';
      btn.style.color = '';
    }

    // 6. 保持收纳视觉和功能图标
    this.updateNestingVisuals();
    this.updateFunctionalIcons();

    this.showMessage('收纳模式已退出', 'info');
  }

  /**
   * 显示收纳提示（使用 Toast）
   */
  showNestingHint(message) {
    if (typeof toastr !== 'undefined') {
      toastr.info(message || '📁 收纳模式：点击第一个条目，再点击目标容器');
    }
  }

  /**
   * 隐藏提示栏（Toast 会自动消失，保留此方法以兼容旧代码）
   */
  hideNestingHint() {
    // Toast 会自动消失，不需要手动移除
  }

  /**
   * 添加收纳监听
   */
  attachNestingListeners(list) {
    const items = list.querySelectorAll('.completion_prompt_manager_prompt');

    items.forEach(item => {
      item.classList.add('paws-clickable');

      const handler = (e) => {
        // 排除点击到按钮区域
        if (e.target.closest('.prompt_manager_prompt_controls')) return;
        if (e.target.closest('.drag-handle')) return;

        e.preventDefault();
        e.stopPropagation();
        this.handleNestingClick(item);
      };

      item.addEventListener('click', handler);
      item._pawsNestingHandler = handler;
    });
  }

  /**
   * 移除收纳监听
   */
  removeNestingListeners(list) {
    const items = list.querySelectorAll('.completion_prompt_manager_prompt');

    items.forEach(item => {
      if (item._pawsNestingHandler) {
        item.removeEventListener('click', item._pawsNestingHandler);
        delete item._pawsNestingHandler;
      }
      item.classList.remove('paws-clickable');
    });
  }

  /**
   * 检查条目是否是 Preset Prompt（有星号图标）
   */
  isPresetPrompt(item) {
    // 查找星号图标或我们修改过的文件夹/箭头图标
    const asterisk = item.querySelector('.fa-asterisk, .fa-folder, .fa-folder-open, .fa-arrow-up-from-bracket');
    return !!asterisk;
  }

  /**
   * 处理收纳点击
   */
  handleNestingClick(item) {
    // 检查是否是 Preset Prompt（只有带星号的才能收纳）
    if (!this.isPresetPrompt(item)) {
      this.showMessage('⚠️ 仅支持收纳"预设提示词"类型的条目', 'warning');
      return;
    }

    if (!this.pendingItem) {
      // 第一次点击：选择要收纳的条目
      this.pendingItem = item;
      item.classList.add('paws-pending');
      const itemName = this.getItemName(item);
      this.showNestingHint(`已选择：${itemName} - 现在点击目标容器`);
    } else if (this.pendingItem === item) {
      // 点击自己：取消选择
      item.classList.remove('paws-pending');
      this.pendingItem = null;
      this.showNestingHint('已取消 - 重新点击条目开始收纳');
    } else {
      // 第二次点击：执行收纳
      this.performNesting(this.pendingItem, item);
    }
  }

  /**
   * 执行收纳
   */
  performNesting(child, parent) {
    const childId = this.getIdentifier(child);
    const parentId = this.getIdentifier(parent);

    if (!childId || !parentId) {
      this.showMessage('无法获取条目标识符', 'error');
      return;
    }

    // 限制嵌套层级：不允许多层嵌套（A→B→C）
    if (this.isNestedItem(parentId)) {
      this.showMessage('不能收纳到已被收纳的条目中（仅支持一层收纳）', 'warning');
      child.classList.remove('paws-pending');
      this.pendingItem = null;
      this.showNestingHint('重新点击条目开始收纳');
      return;
    }

    // 检查是否有循环引用
    if (this.wouldCreateCycle(childId, parentId)) {
      this.showMessage('不能创建循环收纳', 'warning');
      child.classList.remove('paws-pending');
      this.pendingItem = null;
      this.showNestingHint('重新点击条目开始收纳');
      return;
    }

    // 先从所有容器中移除这个子项（如果之前被收纳过）
    this.nestingData.forEach((children, pid) => {
      const index = children.indexOf(childId);
      if (index > -1) {
        children.splice(index, 1);
        if (children.length === 0) {
          this.nestingData.delete(pid);
        }
      }
    });

    // 添加到新容器
    if (!this.nestingData.has(parentId)) {
      this.nestingData.set(parentId, []);
    }
    this.nestingData.get(parentId).push(childId);

    // 清除待选状态
    child.classList.remove('paws-pending');
    this.pendingItem = null;

    // 更新视觉
    this.updateNestingVisuals();
    this.updateFunctionalIcons();

    // 保存数据
    this.saveNestingData();

    // 显示成功提示
    this.showNestingHint('✓ 收纳成功！可继续收纳或点击"完成"退出');
    this.showMessage('收纳成功', 'success');
  }

  /**
   * 检查是否会创建循环
   */
  wouldCreateCycle(childId, parentId) {
    // 如果子项本身就是一个容器，检查父项是否在它的子树中
    if (this.nestingData.has(childId)) {
      const descendants = this.getAllDescendants(childId);
      if (descendants.includes(parentId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取所有后代
   */
  getAllDescendants(parentId) {
    const descendants = [];
    const children = this.nestingData.get(parentId) || [];

    children.forEach(childId => {
      descendants.push(childId);
      if (this.nestingData.has(childId)) {
        descendants.push(...this.getAllDescendants(childId));
      }
    });

    return descendants;
  }

  /**
   * 更新收纳视觉
   * 
   * 修复：使用CSS类代替内联样式，消除列表闪烁问题
   * 参考官方做法：PromptManager.js 使用 CSS 类控制禁用状态
   */
  updateNestingVisuals() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return;

    const items = list.querySelectorAll('.completion_prompt_manager_prompt');

    // 重置所有条目（移除所有收纳相关的CSS类）
    items.forEach(item => {
      item.classList.remove('paws-nested-child', 'paws-container', 'paws-collapsed');
      item.style.marginLeft = '';
      item.style.borderLeft = '';
      item.style.paddingLeft = '';
      // 移除了 item.style.display = ''; 避免闪烁
    });

    // 应用收纳关系
    this.nestingData.forEach((children, parentId) => {
      const parent = this.findItemByIdentifier(parentId);
      if (!parent) return;

      parent.classList.add('paws-container');

      children.forEach(childId => {
        const child = this.findItemByIdentifier(childId);
        if (!child) return;

        child.classList.add('paws-nested-child');
        // 不再使用缩进和边框，只用图标区分
        child.style.marginLeft = '';
        child.style.borderLeft = '';
        child.style.paddingLeft = '';

        // ✅ 如果父容器折叠，使用CSS类隐藏子条目（而不是内联样式）
        if (this.collapsedState.has(parentId)) {
          child.classList.add('paws-collapsed');
        }
      });
    });
  }

  /**
   * 移除收纳视觉效果
   * 
   * @description
   * 当禁用预设收纳功能时调用，移除所有收纳相关的视觉样式和图标
   * 但不删除收纳数据，关闭后再打开可以恢复
   */
  removeNestingVisuals() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return;

    const items = list.querySelectorAll('.completion_prompt_manager_prompt');

    // 移除所有收纳相关的CSS类和样式
    items.forEach(item => {
      item.classList.remove('paws-nested-child', 'paws-container', 'paws-collapsed');
      item.style.marginLeft = '';
      item.style.borderLeft = '';
      item.style.paddingLeft = '';
    });

    // 恢复所有图标为标准星号
    items.forEach(item => {
      const asterisk = item.querySelector('.fa-folder, .fa-folder-open, .fa-arrow-up-from-bracket');
      if (asterisk) {
        // 移除事件监听
        if (asterisk._pawsClickHandler) {
          asterisk.removeEventListener('click', asterisk._pawsClickHandler);
          delete asterisk._pawsClickHandler;
        }
        if (asterisk._pawsMouseEnter) {
          asterisk.removeEventListener('mouseenter', asterisk._pawsMouseEnter);
          delete asterisk._pawsMouseEnter;
        }
        if (asterisk._pawsMouseLeave) {
          asterisk.removeEventListener('mouseleave', asterisk._pawsMouseLeave);
          delete asterisk._pawsMouseLeave;
        }

        // 恢复为标准星号
        asterisk.className = 'fa-fw fa-solid fa-asterisk';
        asterisk.title = 'Preset Prompt';
        asterisk.style.cssText = '';
      }
    });

    logger.debug('[NestingManager.removeNestingVisuals] 已移除收纳视觉效果');
  }

  /**
   * 更新功能图标（利用官方的星号位置）
   */
  updateFunctionalIcons() {
    const list = document.querySelector('#completion_prompt_manager_list');
    if (!list) return;

    const items = list.querySelectorAll('.completion_prompt_manager_prompt');

    items.forEach(item => {
      const itemId = item.getAttribute('data-pm-identifier');
      if (!itemId) return;

      this.updateItemIcon(item, itemId);
    });
  }

  /**
   * 更新单个条目的图标
   */
  updateItemIcon(item, itemId) {
    // 查找预设提示词的星号图标
    // 注意：可能是原始的星号，也可能是我们修改过的文件夹/箭头图标
    let asterisk = item.querySelector('.fa-asterisk[title="Preset Prompt"]');

    // 如果没找到原始星号，尝试查找我们修改过的图标
    if (!asterisk) {
      asterisk = item.querySelector('.fa-folder, .fa-folder-open, .fa-arrow-up-from-bracket');
    }

    // 如果还是没找到，说明这不是预设提示词条目，跳过
    if (!asterisk) return;

    // 判断当前状态（每次都重新判断，不依赖 dataset）
    const isContainer = this.nestingData.has(itemId);
    const isNested = this.isNestedItem(itemId);

    // 移除旧的事件监听（如果有）
    if (asterisk._pawsClickHandler) {
      asterisk.removeEventListener('click', asterisk._pawsClickHandler);
      delete asterisk._pawsClickHandler;
    }
    if (asterisk._pawsMouseEnter) {
      asterisk.removeEventListener('mouseenter', asterisk._pawsMouseEnter);
      delete asterisk._pawsMouseEnter;
    }
    if (asterisk._pawsMouseLeave) {
      asterisk.removeEventListener('mouseleave', asterisk._pawsMouseLeave);
      delete asterisk._pawsMouseLeave;
    }

    if (isContainer) {
      // 容器条目：替换为文件夹图标（折叠功能）
      const isCollapsed = this.collapsedState.has(itemId);
      const childCount = this.nestingData.get(itemId)?.length || 0;

      asterisk.className = `fa-fw fa-solid ${isCollapsed ? 'fa-folder' : 'fa-folder-open'}`;
      asterisk.title = `${isCollapsed ? '展开' : '折叠'} (${childCount}个子项)`;
      asterisk.style.cssText = 'cursor: pointer; color: var(--SmartThemeQuoteColor); opacity: 0.9; transition: all 0.2s;';

      // 添加hover效果
      asterisk._pawsMouseEnter = () => {
        asterisk.style.opacity = '1';
        asterisk.style.transform = 'scale(1.15)';
      };
      asterisk._pawsMouseLeave = () => {
        asterisk.style.opacity = '0.9';
        asterisk.style.transform = 'scale(1)';
      };
      asterisk.addEventListener('mouseenter', asterisk._pawsMouseEnter);
      asterisk.addEventListener('mouseleave', asterisk._pawsMouseLeave);

      // 添加点击事件
      asterisk._pawsClickHandler = (e) => {
        e.stopPropagation();
        this.toggleFold(item, itemId);
      };
      asterisk.addEventListener('click', asterisk._pawsClickHandler);

    } else if (isNested) {
      // 被收纳条目：替换为箭头图标（移出收纳功能）
      asterisk.className = 'fa-fw fa-solid fa-arrow-up-from-bracket';
      asterisk.title = '点击移出收纳';
      asterisk.style.cssText = 'cursor: pointer; color: var(--SmartThemeUnderlineColor); opacity: 0.85; transition: all 0.2s;';

      // 添加hover效果
      asterisk._pawsMouseEnter = () => {
        asterisk.style.opacity = '1';
        asterisk.style.transform = 'translateY(-2px) scale(1.1)';
      };
      asterisk._pawsMouseLeave = () => {
        asterisk.style.opacity = '0.85';
        asterisk.style.transform = 'translateY(0) scale(1)';
      };
      asterisk.addEventListener('mouseenter', asterisk._pawsMouseEnter);
      asterisk.addEventListener('mouseleave', asterisk._pawsMouseLeave);

      // 添加点击事件
      asterisk._pawsClickHandler = (e) => {
        e.stopPropagation();
        this.unnestItem(itemId);
      };
      asterisk.addEventListener('click', asterisk._pawsClickHandler);

    } else {
      // 普通条目：恢复为标准星号（不依赖 dataset，确保每次都正确恢复）
      asterisk.className = 'fa-fw fa-solid fa-asterisk';
      asterisk.title = 'Preset Prompt';
      asterisk.style.cssText = '';  // 清空内联样式，由CSS统一管理间距
    }
  }

  /**
   * 判断条目是否被收纳
   */
  isNestedItem(itemId) {
    for (const children of this.nestingData.values()) {
      if (children.includes(itemId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 移出收纳
   */
  unnestItem(itemId) {
    // 从所有容器中移除
    let removed = false;
    this.nestingData.forEach((children, parentId) => {
      const index = children.indexOf(itemId);
      if (index > -1) {
        children.splice(index, 1);
        removed = true;

        // 如果容器空了，删除容器
        if (children.length === 0) {
          this.nestingData.delete(parentId);
          this.collapsedState.delete(parentId);
        }
      }
    });

    if (removed) {
      this.updateNestingVisuals();
      this.updateFunctionalIcons();
      this.saveNestingData();
      this.showMessage('已移出收纳', 'success');
    }
  }

  /**
   * 折叠/展开
   * 
   * 修复：使用CSS类代替内联样式，消除闪烁
   */
  toggleFold(item, itemId) {
    const children = this.nestingData.get(itemId) || [];
    const isCollapsed = this.collapsedState.has(itemId);

    if (isCollapsed) {
      this.collapsedState.delete(itemId);
    } else {
      this.collapsedState.add(itemId);
    }

    // 更新子条目显示（使用CSS类）
    children.forEach(childId => {
      const child = this.findItemByIdentifier(childId);
      if (child) {
        if (isCollapsed) {
          child.classList.remove('paws-collapsed');  // 展开
        } else {
          child.classList.add('paws-collapsed');     // 折叠
        }
      }
    });

    // 更新图标
    this.updateItemIcon(item, itemId);

    this.saveNestingData();
  }

  /**
   * 清空所有收纳
   */
  async clearAllNesting() {
    // 检查是否有收纳数据
    if (this.nestingData.size === 0) {
      logger.debug('[NestingManager.clearAllNesting] 没有收纳数据');
      this.showMessage('当前没有收纳数据', 'info');
      return;
    }

    const count = this.nestingData.size;
    logger.debug('[NestingManager.clearAllNesting] 准备清空', count, '个容器的收纳关系');

    // 确认对话框
    const confirmed = await callGenericPopup(
      `确定要清空当前预设的所有收纳吗？\n\n这将移除 ${count} 个容器的收纳关系，此操作无法撤销。`,
      'confirm',
      '',
      { okButton: '清空', cancelButton: '取消' }
    );

    if (!confirmed) {
      logger.debug('[NestingManager.clearAllNesting] 用户取消清空操作');
      return;
    }

    // 清空数据
    this.nestingData.clear();
    this.collapsedState.clear();

    // 更新视觉
    this.updateNestingVisuals();
    this.updateFunctionalIcons();

    // 保存
    this.saveNestingData();

    logger.info('[NestingManager.clearAllNesting] 已清空', count, '个容器的收纳关系');
    this.showMessage('已清空所有收纳', 'success');
  }

  /**
   * 工具方法
   */
  getIdentifier(item) {
    return item?.getAttribute('data-pm-identifier');
  }

  getItemName(item) {
    return item?.querySelector('[data-pm-name]')?.getAttribute('data-pm-name') || '';
  }

  findItemByIdentifier(id) {
    return document.querySelector(`[data-pm-identifier="${id}"]`);
  }

  /**
   * 保存收纳数据
   */
  saveNestingData() {
    extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
    extension_settings['Acsus-Paws-Puffs'].presetManager = extension_settings['Acsus-Paws-Puffs'].presetManager || {};

    extension_settings['Acsus-Paws-Puffs'].presetManager.nesting = {
      data: Array.from(this.nestingData.entries()),
      collapsed: Array.from(this.collapsedState)
    };

    saveSettingsDebounced();

    logger.debug('[NestingManager.saveNestingData] 已保存:', this.nestingData.size, '个容器,', this.collapsedState.size, '个折叠');
  }

  /**
   * 加载收纳数据
   */
  loadNestingData() {
    const saved = extension_settings['Acsus-Paws-Puffs']?.presetManager?.nesting;
    if (saved) {
      this.nestingData = new Map(saved.data || []);
      this.collapsedState = new Set(saved.collapsed || []);
      logger.debug('[NestingManager.loadNestingData] 已加载:', this.nestingData.size, '个容器,', this.collapsedState.size, '个折叠');
    } else {
      logger.debug('[NestingManager.loadNestingData] 首次使用，无历史数据');
    }
  }

  /**
   * 显示消息
   */
  showMessage(message, type = 'info') {
    if (typeof toastr !== 'undefined') {
      switch (type) {
        case 'success': toastr.success(message); break;
        case 'warning': toastr.warning(message); break;
        case 'error': toastr.error(message); break;
        default: toastr.info(message);
      }
    }
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.promptListObserver) {
      this.promptListObserver.disconnect();
    }

    if (this.isNestingMode) {
      this.exitNestingMode();
    }
  }
}

// ========================================
// 预设管理器主模块
// ========================================
export class PresetManagerModule {
  constructor() {
    // 模块状态
    this.enabled = true;
    this.nestingEnabled = true;  // 预设收纳功能开关
    this.initialized = false;
    this.moduleId = 'preset-manager';

    // UI实例
    this.ui = null;

    // 世界书集成
    this.worldInfo = null;

    // 收纳管理器
    this.nestingManager = null;

    // 当前活动预设
    this.currentPreset = null;

    // DOM观察器
    this.presetObserver = null;
  }

  /**
   * 初始化模块
   */
  async init() {
    logger.debug('[PresetManager.init] 初始化预设管理器...');

    // 加载设置
    await this.loadSettings();

    // 初始化收纳管理器
    this.nestingManager = new NestingManager(this);
    this.nestingManager.init();

    // 初始化世界书集成
    this.worldInfo = new WorldInfoIntegration(this);
    await this.worldInfo.init();

    // 监听预设页面出现
    this.observePresetPage();

    // 设置事件监听
    this.setupEventListeners();

    this.initialized = true;
    logger.info('[PresetManager.init] 预设管理器初始化完成，启用状态:', this.enabled);

    // 如果已启用，延迟检查预设页面
    if (this.enabled) {
      setTimeout(() => {
        this.checkAndEnhancePresetPage();
      }, 500);
    }
  }

  /**
   * 渲染UI（由index.js调用，参考字体管理器的架构）
   * @param {HTMLElement} container - UI容器元素
   */
  async renderUI(container) {
    if (!container) {
      logger.warn('[PresetManager.renderUI] 容器元素不存在');
      return;
    }

    try {
      // 实例化UI类（内部管理，不暴露给index.js）
      this.ui = new PresetManagerUI(this);
      await this.ui.init(container);
      logger.debug('[PresetManager.renderUI] UI渲染成功');
    } catch (error) {
      logger.error('[PresetManager.renderUI] UI渲染失败:', error.message);
      throw error;
    }
  }

  /**
   * 加载设置
   */
  async loadSettings() {
    try {
      extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
      extension_settings['Acsus-Paws-Puffs'].presetManager = extension_settings['Acsus-Paws-Puffs'].presetManager || {};

      const settings = extension_settings['Acsus-Paws-Puffs'].presetManager;
      this.enabled = settings.enabled !== false;
      this.nestingEnabled = settings.nestingEnabled !== false;  // 默认启用

      logger.debug('[PresetManager.loadSettings] 设置已加载，启用状态:', this.enabled, '收纳启用:', this.nestingEnabled);
    } catch (error) {
      logger.error('[PresetManager.loadSettings] 加载设置失败:', error.message || error);
      this.enabled = true;
      this.nestingEnabled = true;
    }
  }

  /**
   * 保存设置
   */
  async saveSettings() {
    try {
      extension_settings['Acsus-Paws-Puffs'] = extension_settings['Acsus-Paws-Puffs'] || {};
      extension_settings['Acsus-Paws-Puffs'].presetManager = extension_settings['Acsus-Paws-Puffs'].presetManager || {};
      extension_settings['Acsus-Paws-Puffs'].presetManager.enabled = this.enabled;
      extension_settings['Acsus-Paws-Puffs'].presetManager.nestingEnabled = this.nestingEnabled;

      saveSettingsDebounced();
      logger.debug('[PresetManager.saveSettings] 设置已保存');
    } catch (error) {
      logger.error('[PresetManager.saveSettings] 保存设置失败:', error.message || error);
    }
  }

  /**
   * 设置模块启用状态
   */
  async setEnabled(enabled) {
    this.enabled = enabled;
    await this.saveSettings();

    if (enabled) {
      // 移除旧的增强标记，强制重新增强
      const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
      if (promptList) {
        promptList.removeAttribute('data-paws-enhanced');
      }

      this.checkAndEnhancePresetPage();

      if (!promptList) {
        setTimeout(() => {
          this.checkAndEnhancePresetPage();
        }, 300);
      }
    } else {
      this.cleanupEnhancements();
    }

    eventSource.emit('pawsPresetEnabledChanged', enabled);
    logger.debug(' 预设管理功能', enabled ? '已启用' : '已禁用');
  }

  /**
   * 设置预设收纳功能启用状态
   */
  async setNestingEnabled(enabled) {
    this.nestingEnabled = enabled;
    await this.saveSettings();

    if (enabled) {
      // 启用收纳功能
      logger.debug('[PresetManager.setNestingEnabled] 启用预设收纳');

      // 更新按钮状态（移除禁用）
      this.updateNestingButtonsState();

      // 恢复收纳视觉效果
      if (this.nestingManager) {
        this.nestingManager.updateNestingVisuals();
        this.nestingManager.updateFunctionalIcons();
      }
    } else {
      // 禁用收纳功能
      logger.debug('[PresetManager.setNestingEnabled] 禁用预设收纳');

      // 如果正在收纳模式，先退出
      if (this.nestingManager && this.nestingManager.isNestingMode) {
        this.nestingManager.exitNestingMode();
      }

      // 禁用按钮
      this.updateNestingButtonsState();

      // 移除收纳视觉效果
      if (this.nestingManager) {
        this.nestingManager.removeNestingVisuals();
      }
    }

    logger.debug('[PresetManager.setNestingEnabled] 预设收纳功能', enabled ? '已启用' : '已禁用');
  }

  /**
   * 更新收纳按钮的启用/禁用状态
   */
  updateNestingButtonsState() {
    const nestingBtn = document.querySelector('.paws-nesting-mode-btn');
    const clearBtn = document.querySelector('.paws-clear-nesting-btn');

    if (nestingBtn) {
      nestingBtn.style.display = this.nestingEnabled ? '' : 'none';
    }

    if (clearBtn) {
      clearBtn.style.display = this.nestingEnabled ? '' : 'none';
    }
  }

  /**
   * 检查并增强预设页面
   */
  checkAndEnhancePresetPage() {
    logger.debug(' 检查预设页面状态...');
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');

    if (promptList) {
      logger.debug(' 找到预设列表，状态:', {
        enabled: this.enabled,
        enhanced: promptList.hasAttribute('data-paws-enhanced')
      });

      if (!promptList.hasAttribute('data-paws-enhanced')) {
        logger.debug(' 执行预设页面增强');
        this.enhancePresetPage();
      }
    } else {
      logger.debug(' 未找到预设列表');
    }
  }

  /**
   * 监听预设页面出现
   */
  observePresetPage() {
    this.presetObserver = new MutationObserver((mutations) => {
      const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
      if (promptList && !promptList.hasAttribute('data-paws-enhanced')) {
        logger.debug(' 检测到预设列表，开始增强');
        this.enhancePresetPage();
      }
    });

    if (document.body) {
      this.presetObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    this.checkAndEnhancePresetPage();
  }

  /**
   * 增强预设页面
   */
  enhancePresetPage() {
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
    if (!promptList || promptList.hasAttribute('data-paws-enhanced')) return;

    // 标记已增强
    promptList.setAttribute('data-paws-enhanced', 'true');

    // 获取当前预设名称
    this.detectCurrentPreset();

    // 创建世界书折叠栏（替代弹窗）
    if (this.enabled && this.worldInfo) {
      this.worldInfo.createWorldBookDrawer();
    }

    // 添加收纳模式按钮（无论是否启用都添加）
    this.nestingManager.addNestingModeButton();

    // 更新收纳按钮状态
    this.updateNestingButtonsState();

    // 如果已启用收纳功能，应用收纳视觉
    if (this.enabled && this.nestingEnabled) {
      setTimeout(() => {
        this.nestingManager.updateNestingVisuals();
        this.nestingManager.updateFunctionalIcons();
      }, 100);
    }

    logger.debug(' 预设页面增强完成');
  }

  /**
   * 检测当前预设
   */
  detectCurrentPreset() {
    const presetSelect = document.querySelector('#settings_preset_openai, #settings_preset');
    if (presetSelect) {
      this.currentPreset = presetSelect.value;
      logger.debug(' 当前预设:', this.currentPreset);
    }
  }

  /**
   * 清理增强功能
   */
  cleanupEnhancements() {
    const promptList = document.querySelector('#completion_prompt_manager_list, #prompt_manager_list');
    if (promptList) {
      promptList.removeAttribute('data-paws-enhanced');
    }

    // 删除世界书折叠栏
    if (this.worldInfo) {
      this.worldInfo.destroy();
    }

    // 收纳按钮不删除，只是禁用功能
  }

  /**
   * 显示消息提示
   */
  showMessage(message, type = 'info') {
    logger.info(`${type.toUpperCase()}: ${message}`);

    if (typeof toastr !== 'undefined') {
      switch (type) {
        case 'success': toastr.success(message); break;
        case 'warning': toastr.warning(message); break;
        case 'error': toastr.error(message); break;
        default: toastr.info(message);
      }
    } else {
      alert(`${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    document.addEventListener('change', (e) => {
      if (e.target.matches('#settings_preset_openai, #settings_preset')) {
        this.currentPreset = e.target.value;
        logger.debug(' 预设已切换到:', this.currentPreset);
      }
    });

    // 世界书功能已移至独立工具
  }

  /**
   * 获取标签页配置
   */
  getTabConfig() {
    return {
      id: this.moduleId,
      title: '预设管理',
      icon: 'fa-list',
      ui: PresetManagerUI,
      order: 4
    };
  }

  /**
   * 获取模块统计信息
   */
  getStats() {
    return {
      enabled: this.enabled,
      currentPreset: this.currentPreset
    };
  }

  /**
   * 销毁模块
   */
  destroy() {
    this.cleanupEnhancements();

    if (this.presetObserver) {
      this.presetObserver.disconnect();
    }

    if (this.nestingManager) {
      this.nestingManager.destroy();
    }

    if (this.ui) {
      this.ui.destroy();
    }

    if (this.worldInfo) {
      this.worldInfo.destroy();
    }
  }
}
