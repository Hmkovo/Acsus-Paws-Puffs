/**
 * 日记预设数据管理器
 * 
 * @description
 * 负责预设的增删改查、排序、导入导出：
 * - 预设条目管理（增删改查）
 * - 预设排序（order 管理）
 * - 预设导入/导出
 * - 保存到 extension_settings
 * 
 * @module DiaryPresetDataManager
 */

// ========================================
// [IMPORT] SillyTavern 原生 API
// ========================================
import { extension_settings } from '../../../../../extensions.js';
import { saveSettingsDebounced } from '../../../../../../script.js';
import { download } from '../../../../../utils.js';
import logger from '../../logger.js';

// ========================================
// [CONST] 常量
// ========================================
const EXT_ID = 'Acsus-Paws-Puffs';
const MODULE_NAME = 'diary';

// 上下文条目ID（对应设置项）
const CONTEXT_PRESETS = [
  { id: 'context_persona_desc', subType: 'personaDescription', name: '[系统] 用户设定', order: 10 },
  { id: 'context_char_desc', subType: 'charDescription', name: '[系统] 角色描述', order: 100 },
  { id: 'context_char_personality', subType: 'charPersonality', name: '[系统] 角色性格', order: 200 },
  { id: 'context_char_scenario', subType: 'charScenario', name: '[系统] 角色场景', order: 300 },
  { id: 'context_world_info', subType: 'worldInfo', name: '[系统] 世界书', order: 400 },
  { id: 'context_recent_chat', subType: 'recentChat', name: '[系统] 最近对话', order: 500 },
  { id: 'context_history_diaries', subType: 'historyDiaries', name: '[系统] 历史日记', order: 600 },
];

// 日记写作指南ID
const DIARY_INSTRUCTION_ID = 'diary_instruction';
const DIARY_INSTRUCTION_ORDER = 700;

// ========================================
// [CORE] 预设数据管理类
// ========================================

/**
 * 日记预设数据管理器
 * 
 * @class DiaryPresetDataManager
 */
export class DiaryPresetDataManager {
  constructor() {
    this.presets = [];
    this.init();
  }

  /**
   * 初始化
   * 
   * @description
   * 加载预设，自动创建默认的上下文条目和日记写作指南（如果不存在）
   */
  init() {
    this.loadPresets();
    this.ensureDefaultContextPresets();
    this.ensureDefaultDiaryInstruction();
    logger.info('[DiaryPresetDataManager] 初始化完成，已加载', this.presets.length, '个预设');
  }

  /**
   * 确保默认上下文条目存在
   * 
   * @description
   * 自动创建7个上下文条目（用户设定、角色描述、性格、场景、世界书、最近对话、历史日记）
   * 这些条目内容为空（运行时动态生成），只能修改角色类型
   */
  ensureDefaultContextPresets() {
    let created = 0;

    CONTEXT_PRESETS.forEach(({ id, subType, name, order }) => {
      // 检查是否已存在
      const exists = this.presets.some(p => p.id === id);

      if (!exists) {
        this.presets.push({
          id,
          name,
          type: 'context',
          subType,
          role: 'system',
          content: '',  // 空字符串，运行时动态生成
          order,
          enabled: true,  // 默认启用
          locked: false,
          editable: 'role-only'  // 只能修改角色类型
        });
        created++;
      }
    });

    if (created > 0) {
      this.savePresets();
      logger.info('[DiaryPresetDataManager] 已自动创建', created, '个上下文条目');
    } else {
      logger.debug('[DiaryPresetDataManager] 上下文条目已存在，跳过创建');
    }
  }

  /**
   * 确保默认日记写作指南存在
   * 
   * @description
   * 如果用户的预设列表中不存在日记写作指南，自动创建一个
   * 这个预设完全可编辑、可禁用、可删除、可拖拽
   */
  ensureDefaultDiaryInstruction() {
    // 检查是否已存在日记写作指南
    const exists = this.presets.some(p => p.id === DIARY_INSTRUCTION_ID);

    if (!exists) {
      // 创建默认日记写作指南
      const instruction = {
        id: DIARY_INSTRUCTION_ID,
        name: '日记写作指南',
        type: 'instruction',
        role: 'system',
        content: this.getDiaryInstructionContent(),
        order: DIARY_INSTRUCTION_ORDER,
        enabled: true,
        locked: false,
        editable: 'full'  // 完全可编辑
      };

      this.presets.push(instruction);
      this.savePresets();

      logger.info('[DiaryPresetDataManager] 已自动创建日记写作指南');
    } else {
      logger.debug('[DiaryPresetDataManager] 日记写作指南已存在，跳过创建');
    }
  }

  /**
   * 加载预设
   */
  loadPresets() {
    const settings = extension_settings[EXT_ID]?.[MODULE_NAME]?.presets;
    this.presets = settings ? [...settings] : [];
  }

  /**
   * 保存预设
   */
  savePresets() {
    if (!extension_settings[EXT_ID]) {
      extension_settings[EXT_ID] = {};
    }
    if (!extension_settings[EXT_ID][MODULE_NAME]) {
      extension_settings[EXT_ID][MODULE_NAME] = {};
    }

    extension_settings[EXT_ID][MODULE_NAME].presets = this.presets;
    saveSettingsDebounced();

    logger.debug('[DiaryPresetDataManager] 已保存预设，共', this.presets.length, '个');
  }

  /**
   * 获取所有预设（按 order 排序）
   * 
   * @returns {Array<Object>} 预设列表
   */
  getPresets() {
    // 按 order 排序
    const presets = [...this.presets];
    presets.sort((a, b) => a.order - b.order);
    return presets;
  }

  /**
   * 获取启用的预设（用于生成）
   * 
   * @returns {Array<Object>} 启用的预设列表
   */
  getEnabledPresets() {
    return this.getPresets().filter(p => p.enabled);
  }

  /**
   * 获取单个预设
   * 
   * @param {string} id - 预设ID
   * @returns {Object|null} 预设对象
   */
  getPreset(id) {
    return this.presets.find(p => p.id === id) || null;
  }

  /**
   * 添加预设
   * 
   * @param {Object} preset - 预设对象
   * @param {string} preset.name - 预设名称
   * @param {string} preset.role - 角色类型（system/user/assistant）
   * @param {string} preset.content - 预设内容
   * @param {number} [preset.order] - 排序（不提供则自动计算）
   * @param {string} [preset.type] - 预设类型（custom/instruction/context）
   * @returns {Object} 新建的预设对象
   */
  addPreset({ name, role, content, order, type = 'custom' }) {
    // 生成唯一ID
    const id = `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 如果没有提供 order，自动计算
    if (order === undefined) {
      // 获取所有预设的最大 order
      const maxOrder = this.presets.reduce((max, p) => Math.max(max, p.order || 0), 0);
      order = maxOrder + 100;
    }

    const newPreset = {
      id,
      name: name || '新预设',
      role: role || 'system',
      content: content || '',
      order: order,
      enabled: true,
      type: type || 'custom'
    };

    this.presets.push(newPreset);
    this.savePresets();

    logger.info('[DiaryPresetDataManager] 已添加预设:', name);

    return newPreset;
  }

  /**
   * 更新预设
   * 
   * @param {string} id - 预设ID
   * @param {Object} updates - 更新的字段
   */
  updatePreset(id, updates) {
    const preset = this.presets.find(p => p.id === id);
    if (!preset) {
      logger.warn('[DiaryPresetDataManager] 预设不存在:', id);
      return false;
    }

    // 更新字段
    Object.assign(preset, updates);
    this.savePresets();

    logger.debug('[DiaryPresetDataManager] 已更新预设:', id);

    return true;
  }

  /**
   * 删除预设
   * 
   * @param {string} id - 预设ID
   */
  deletePreset(id) {
    const index = this.presets.findIndex(p => p.id === id);
    if (index === -1) {
      logger.warn('[DiaryPresetDataManager] 预设不存在:', id);
      return false;
    }

    this.presets.splice(index, 1);
    this.savePresets();

    logger.info('[DiaryPresetDataManager] 已删除预设:', id);

    return true;
  }

  /**
   * 切换预设启用状态
   * 
   * @param {string} id - 预设ID
   */
  togglePreset(id) {
    const preset = this.presets.find(p => p.id === id);
    if (!preset) {
      return false;
    }

    preset.enabled = !preset.enabled;
    this.savePresets();

    logger.debug('[DiaryPresetDataManager] 已切换预设状态:', id, preset.enabled);

    return true;
  }

  /**
   * 更新预设顺序
   * 
   * @param {Array<string>} orderedIds - 排序后的预设ID数组
   */
  updateOrder(orderedIds) {
    // 为每个预设分配新的 order 值
    orderedIds.forEach((id, index) => {
      const preset = this.presets.find(p => p.id === id);
      if (preset) {
        preset.order = index * 100;
      }
    });

    this.savePresets();

    logger.debug('[DiaryPresetDataManager] 已更新预设顺序');
  }

  /**
   * 导出预设为 JSON
   * 
   * @returns {string} JSON 字符串
   */
  exportPresets() {
    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      presets: this.presets
    };

    const json = JSON.stringify(exportData, null, 2);

    logger.info('[DiaryPresetDataManager] 已导出预设，共', this.presets.length, '个');

    return json;
  }

  /**
   * 下载预设文件
   */
  downloadPresets() {
    const json = this.exportPresets();
    const filename = `diary-presets_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    const blob = new Blob([json], { type: 'application/json' });
    download(blob, filename, 'application/json');

    logger.info('[DiaryPresetDataManager] 已下载预设文件:', filename);
  }

  /**
   * 导入预设
   * 
   * @param {string} json - JSON 字符串
   * @param {boolean} [replace=false] - 是否替换现有预设
   * @returns {Object} 导入结果 {success: number, skipped: number, total: number}
   */
  importPresets(json, replace = false) {
    try {
      const data = JSON.parse(json);

      if (!data.presets || !Array.isArray(data.presets)) {
        throw new Error('无效的预设文件格式');
      }

      let success = 0;
      let skipped = 0;

      // 如果是替换模式，清空现有预设
      if (replace) {
        this.presets = [];
      }

      // 导入预设
      data.presets.forEach(preset => {
        // 检查是否已存在（根据 ID）
        const exists = this.presets.find(p => p.id === preset.id);

        if (exists && !replace) {
          skipped++;
          return;
        }

        // 添加预设
        this.presets.push({
          id: preset.id || `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          name: preset.name || '未命名预设',
          role: preset.role || 'system',
          content: preset.content || '',
          order: preset.order || 0,
          enabled: preset.enabled !== false
        });

        success++;
      });

      this.savePresets();

      logger.info('[DiaryPresetDataManager] 导入完成:', success, '成功,', skipped, '跳过');

      return {
        success,
        skipped,
        total: data.presets.length
      };

    } catch (error) {
      logger.error('[DiaryPresetDataManager] 导入失败:', error.message);
      throw error;
    }
  }

  /**
   * 清空所有预设
   */
  clearAllPresets() {
    this.presets = [];
    this.savePresets();

    logger.info('[DiaryPresetDataManager] 已清空所有预设');
  }

  /**
   * 构建 messages 数组（用于发送）
   * 
   * @param {Object} contextContents - 上下文内容映射对象
   * @param {string} [contextContents.charDescription] - 角色描述内容
   * @param {string} [contextContents.charPersonality] - 角色性格内容
   * @param {string} [contextContents.charScenario] - 角色场景内容
   * @param {string} [contextContents.worldInfo] - 世界书内容
   * @param {string} [contextContents.recentChat] - 最近对话内容
   * @param {string} [contextContents.historyDiaries] - 历史日记内容
   * @returns {Array<Object>} messages 数组
   */
  buildMessagesArray(contextContents = {}) {
    const allPresets = this.getEnabledPresets();

    // 构建 messages 数组
    const messages = allPresets.map(preset => {
      let content = preset.content;

      // 如果是上下文条目，使用动态生成的内容
      if (preset.type === 'context' && contextContents[preset.subType]) {
        content = contextContents[preset.subType];
      }

      return {
        role: preset.role,
        content: content
      };
    });

    logger.debug('[DiaryPresetDataManager] 已构建 messages 数组，共', messages.length, '条');

    return messages;
  }

  /**
   * 获取日记写作指南的默认内容
   * 
   * @returns {string} 日记写作指南内容
   */
  getDiaryInstructionContent() {
    return `<日记写作任务>
  任务定位:
    你可以像用户一样写日记，记录今天发生的事情、你的感受和想法

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 日记的语气、用词、关注点必须符合{{char}}的性格设定
    - 可以参考【最近对话】或【历史日记】中的内容，但不要直接复述
    - 日记应该基于你的视角和感受，而不是客观记录

  字数要求:
    - 正文内容建议 100-300 字
    - 不要写得太长，保持简洁和真实
    - 如果内容丰富，可以分成多个段落，每段之间空一行

  格式要求（强制执行，将被正则扫描）:
    必须使用[日记]和[/日记]标签包裹，格式如下：
    [日记]
    标题：{日记标题，简短有力，4-8个字}
    日期：{格式 YYYY-MM-DD，如：2025-10-16}

    {正文内容第一段}

    {正文内容第二段（如果有）}

    {如果想描述图片，使用：[图片：图片描述]}
    [/日记]

  注意事项:
    1. 标题：贴合主题
    2. 日期和星期：必须准确（参考最近对话或当前时间）
    3. 正文：符合{{char}}的性格和说话方式
    4. 图片描述：只是描述图片内容，不能真的发图片
    5. 禁止OOC：不要使用"作为AI..."这类表述，保持角色身份

  输出示例:
    [日记]
    标题：今天又折腾了一天
    日期：2025-10-16

    {正文内容第一段}
    
    {正文内容第二段（如果有）}

    [图片：图片描述]
    [/日记]
</日记写作任务>`;
  }
}

