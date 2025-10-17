/**
 * 日记API - 上下文构建模块
 * 
 * @description
 * 负责构建发送给AI的完整提示词：
 * - 构建系统提示词（角色卡+世界书+聊天历史+日记）
 * - 构建评论任务提示词
 * - 格式化评论（带临时编号）
 * - 获取世界书、聊天历史、历史日记
 * 
 * @module DiaryAPIBuilder
 */

// ========================================
// [IMPORT] 依赖
// ========================================
import { getContext } from '../../../../../extensions.js';
import { power_user } from '../../../../../power-user.js';
import logger from '../../logger.js';

// ========================================
// [CONST] 常量
// ========================================

/**
 * 路人性格类型定义（参考弹幕观众类型）
 * 
 * @description
 * 从弹幕观众类型中筛选出适合日记评论的类型
 */
export const PASSERBY_PERSONALITIES = {
  default: { name: '默认观众', description: '正常发送评论，友好温和' },
  funny: { name: '搞笑观众', description: '偏好搞抽象/搞笑/幽默/乐子人/玩梗' },
  fanclub: { name: '饭圈观众', description: '热衷CP配对/磕糖/护短/应援' },
  fanficauthor: { name: '二创太太', description: '同人创作者视角，脑内有无数梗和paro' },
  analysis: { name: '分析观众', description: '分析剧情走向/预测心理/深度解读' },
  critic: { name: '烂梗吐槽役', description: '熟读网文影视剧，对套路了然于胸' },
  lore: { name: '设定考据党', description: '对世界观设定和角色背景了如指掌' },
  pessimist: { name: '悲观预言家', description: '永远能解读出最坏的可能' },
  shipper: { name: 'CP粉', description: '万物皆可CP，引力波都是爱情信号' },
  alien: { name: '外星观察员', description: '以疏离客观视角观察人类行为' },
  gamer: { name: '第四天灾玩家', description: '视为RPG游戏，寻找最优解' },
  crossovermaniac: { name: '串台乱入者', description: '脑子里没有次元壁，强行联动' },
  chaos: { name: '混乱拱火乐子人', description: '唯恐天下不乱，以挑起事端为乐' },
  pragmatic: { name: '功利不择手段者', description: '胜利才是一切，鼓励欺骗背叛' },
  vmefifty: { name: '好兄弟v我50', description: '每到周四就开始V我50咏唱仪式' }
};

// ========================================
// [CORE] 上下文构建类
// ========================================

/**
 * 日记API上下文构建器
 * 
 * @class DiaryAPIBuilder
 */
export class DiaryAPIBuilder {
  /**
   * 创建上下文构建器
   * 
   * @param {Object} dataManager - 数据管理器
   */
  constructor(dataManager) {
    this.dataManager = dataManager;
  }

  /**
   * 构造完整的系统提示词（支持临时编号和批量评论）
   * 
   * @async
   * @param {Object} diary - 当前日记对象
   * @param {string} charName - 角色名称
   * @param {Object} ctx - 上下文对象
   * @param {Object} presetManager - 预设管理器（用于获取启用状态）
   * @returns {Promise<{contextContents: Object, tempIdMap: Object, tempCommentIdMap: Object}>}
   */
  async buildCompleteSystemPrompt(diary, charName, ctx, presetManager) {
    const contextContents = {};
    const settings = this.dataManager.getSettings();
    const character = ctx.characters[ctx.characterId];

    // 获取所有预设（包括上下文条目）
    const allPresets = presetManager ? presetManager.getPresets() : [];
    
    // 辅助函数：检查上下文条目是否启用
    const isContextEnabled = (subType) => {
      const preset = allPresets.find(p => p.type === 'context' && p.subType === subType);
      return preset ? preset.enabled : settings[`include${subType.charAt(0).toUpperCase() + subType.slice(1)}`];
    };

    // 1. 用户设定
    if (settings.includePersonaDescription) {
      const personaDesc = power_user.persona_description;
      if (personaDesc && personaDesc.trim()) {
        // 暂时保留，未来可能也变成上下文条目
        logger.debug('[DiaryAPIBuilder] 已包含用户设定');
      }
    }

    // 2. 角色描述
    if (character && isContextEnabled('charDescription') && character.description) {
      contextContents.charDescription = `# 角色信息\n你是 ${character.name}。\n\n${character.description}`;
      logger.debug('[DiaryAPIBuilder] 已包含角色描述');
    }

    // 3. 角色性格
    if (character && isContextEnabled('charPersonality') && character.personality) {
      contextContents.charPersonality = `# 角色性格\n${character.personality}`;
      logger.debug('[DiaryAPIBuilder] 已包含角色性格');
    }

    // 4. 角色场景
    if (character && isContextEnabled('charScenario') && character.scenario) {
      contextContents.charScenario = `# 角色场景\n${character.scenario}`;
      logger.debug('[DiaryAPIBuilder] 已包含角色场景');
    }

    // 5. 世界书
    if (isContextEnabled('worldInfo')) {
      const worldInfo = await this.getSimpleWorldInfo(ctx.characterId);
      if (worldInfo) {
        contextContents.worldInfo = worldInfo;
        logger.debug('[DiaryAPIBuilder] 已包含世界书');
      }
    }

    // 6. 最近对话
    if (isContextEnabled('recentChat')) {
      const count = settings.recentChatCount || 5;
      const recentChat = this.getRecentChatHistory(ctx, count);
      if (recentChat) {
        contextContents.recentChat = `# 最近对话\n${recentChat}`;
        logger.debug('[DiaryAPIBuilder] 已包含最近对话');
      }
    }

    // 7. 历史日记
    const diariesToSend = [];
    const tempIdMap = {};
    const tempCommentIdMap = {};

    if (isContextEnabled('historyDiaries')) {
      const count = settings.historyDiaryCount || 3;
      const historyDiaries = this.getHistoryDiariesObjects(diary.id, count);
      diariesToSend.push(...historyDiaries);
    }

    diariesToSend.push(diary);

    // 创建临时编号映射
    diariesToSend.forEach((d, index) => {
      tempIdMap[index + 1] = d.id;
    });

    // 构造历史日记内容
    if (diariesToSend.length > 0) {
      let diariesContent = `# 最近日记（共${diariesToSend.length}篇）\n\n`;

      diariesToSend.forEach((d, index) => {
        const tempId = index + 1;
        const content = d.contentBlocks
          .map(b => {
            if (b.type === 'image' && b.imageUrl) {
              return `[图片链接：${b.imageUrl}]\n[图片描述：${b.imageDesc || '无描述'}]`;
            }
            return b.content;
          })
          .filter(c => c.trim())
          .join('\n');

        diariesContent += `#${tempId} ${d.title} (${d.date})\n`;
        diariesContent += `${content || '（空白日记）'}\n`;

        if (d.comments && d.comments.length > 0) {
          diariesContent += `\n已有评论：\n`;
          diariesContent += this.formatCommentsWithReplies(d.comments, 1, tempCommentIdMap);
        }

        diariesContent += `\n`;
      });

      // 将历史日记内容放入上下文
      if (isContextEnabled('historyDiaries')) {
        contextContents.historyDiaries = diariesContent;
      }
    }

    logger.debug('[DiaryAPIBuilder] 上下文内容已构建完成');
    logger.debug('[DiaryAPIBuilder] 临时日记编号映射:', tempIdMap);
    logger.debug('[DiaryAPIBuilder] 临时评论编号映射:', tempCommentIdMap);

    return { contextContents, tempIdMap, tempCommentIdMap };
  }

  /**
   * 格式化评论（带回复层级和临时编号）
   */
  formatCommentsWithReplies(comments, indent = 1, commentIdMap = null, counter = [1]) {
    if (!comments || comments.length === 0) return '';

    let result = '';
    const prefix = '  '.repeat(indent);

    comments.forEach(comment => {
      const authorDisplay = comment.authorName || comment.author;
      const tempCommentId = `c${counter[0]}`;

      if (commentIdMap) {
        commentIdMap[tempCommentId] = comment.id;
      }
      counter[0]++;

      result += `${prefix}#${tempCommentId} ${authorDisplay}：${comment.content}\n`;

      logger.debug('[DiaryAPIBuilder.formatCommentsWithReplies] 格式化评论:', {
        tempId: tempCommentId,
        realId: comment.id,
        author: authorDisplay,
        content: comment.content.substring(0, 30),
        hasReplies: !!(comment.replies && comment.replies.length > 0),
        indent: indent
      });

      if (comment.replies && comment.replies.length > 0) {
        result += this.formatCommentsWithReplies(comment.replies, indent + 1, commentIdMap, counter);
      }
    });

    return result;
  }

  /**
   * 构建评论任务提示词（参考弹幕系统风格）
   * 
   * @param {Array<Object>} diariesToSend - 要评论的日记数组
   * @param {string} charName - 角色名称
   * @param {Object} settings - 设置对象
   * @returns {string} 评论任务提示词
   */
  buildCommentTask(diariesToSend, charName, settings) {
    const isBatch = diariesToSend.length > 1;
    const allowPasserby = settings.allowPasserbyComments;
    const personality = PASSERBY_PERSONALITIES[settings.passerbyPersonality] || PASSERBY_PERSONALITIES.default;

    let task = '';

    if (isBatch) {
      // 批量日记评论
      if (allowPasserby) {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了${diariesToSend.length}篇日记，需要你作为角色"${charName}"或"路人"进行评论

  角色扮演要求:
    作为${charName}评论时:
      - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
      - 评论的语气、用词、关注点必须符合${charName}的性格设定
    
    作为路人评论时:
      - 当前路人类型：**${personality.name}**
      - 性格特点：${personality.description}
      - 路人ID命名：符合当前路人类型，(参考微博/贴吧/小红书风格)
      - 同一路人ID在不同日记下保持一致性格

  互动规则:
    - ${charName}至少为每篇日记写1条评论
    - 路人评论数量：${settings.passerbyCommentMin}~${settings.passerbyCommentMax}条
    - 路人之间可以互相回复
    - 路人可以回复${charName}，${charName}也可以回复路人
    - 至少20%的评论应该形成互动（回复其他评论）

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，优先回复{{user}}
    2. 如果${charName}已评论过该日记：可以回复其他人，或根据性格补充新观点（不强制重复评论）
    3. 如果日记无评论：${charName}和路人都可以直接评论

  编号系统说明:
    日记编号（#1、#2、#3）:
      - 上方显示了多篇日记，每篇都有临时日记编号
      - #1 = 最早的日记，#2 = 次早，#3 = 最新（当前）
      - 评论时必须写明日记编号
    
    评论编号（#c1、#c2、#c3）:
      - 已有评论也有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
      - 用于精确回复某条评论（避免同一人有多条评论时混淆）
      - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: #日记编号 评论者ID：评论内容
    回复已有评论格式: #日记编号 评论者ID回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：写明日记编号即可（#1、#2、#3）
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 评论者ID和内容之间用中文冒号：或英文冒号:分隔

  输出示例:
    假设日记#3有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    #1 ${charName}：评论日记#1
    #1 @路人ID：评论日记#1
    #2 @路人ID：评论日记#2
    #3 ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    #3 @路人ID回复@c1：回复${charName}的#c1
    [/评论]
</日记评论任务>
`;
      } else {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了${diariesToSend.length}篇日记，需要你作为角色"${charName}"进行评论

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 评论的语气、用词、关注点必须符合${charName}的性格设定
    - 评论数量根据角色性格和日记内容决定，但每篇日记下必须至少1条评论

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，${charName}应该优先回复{{user}}
    2. 如果${charName}已评论过该日记：可以回复其他人，或根据性格补充新观点（不强制重复评论）
    3. 如果日记无评论：${charName}直接评论日记内容

  编号系统说明:
    日记编号（#1、#2、#3）:
      - 上方显示了多篇日记，每篇都有临时日记编号
      - #1 = 最早的日记，#2 = 次早，#3 = 最新（当前）
      - 评论时必须写明日记编号
    
    评论编号（#c1、#c2、#c3）:
      - 已有评论也有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
      - 用于精确回复某条评论（避免同一人有多条评论时混淆）
      - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: #日记编号 ${charName}：评论内容
    回复已有评论格式: #日记编号 ${charName}回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：写明日记编号即可（#1、#2、#3）
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 必须使用你的名字"${charName}"
      - 评论者ID和内容之间用中文冒号：或英文冒号:分隔

  输出示例:
    假设日记#3有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    #1 ${charName}：评论日记#1
    #2 ${charName}：评论日记#2
    #3 ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    #3 ${charName}：也可以写新的评论
    [/评论]
</日记评论任务>
`;
      }
    } else {
      // 单条日记评论
      if (allowPasserby) {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了一篇日记，需要你作为角色"${charName}"或"路人"进行评论

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 评论的语气、用词、关注点必须符合${charName}的性格设定
    - 评论数量根据角色性格和日记内容决定，但每篇日记下必须至少1条评论
    
    作为路人评论时:
      - 当前路人观众类型：**${personality.name}**
      - 性格特点：${personality.description}
      - 路人ID命名：符合当前路人类型，(参考微博/贴吧/小红书风格)

  互动规则:
    - ${charName}至少写1条评论
    - 路人评论数量：${settings.passerbyCommentMin}~${settings.passerbyCommentMax}条
    - 路人之间可以互相回复
    - 路人可以回复${charName}，${charName}也可以回复路人
    - 鼓励形成对话互动（回复其他评论）

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录，**每条评论都有临时编号（#c1、#c2、#c3...）**
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，${charName}或路人应该优先回复{{user}}
    2. 如果某人已评论过：可以回复其他人，或根据性格补充新观点（不强制重复）

  评论编号说明:
    - 已有评论有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
    - 用于精确回复某条评论（避免同一人有多条评论时混淆）
    - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: 评论者ID：评论内容
    回复已有评论格式: 评论者ID回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：直接写"评论者ID：内容"
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 评论者ID和内容之间用中文冒号：或英文冒号:分隔

  输出示例:
    假设日记有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    @路人ID：评论内容
    @路人ID回复@c1：回复${charName}的#c1
    [/评论]
</日记评论任务>
`;
      } else {
        task = `
<日记评论任务>
  任务定位:
    {{user}}发布了一篇日记，需要你作为角色"${charName}"进行评论

  角色扮演要求:
    - 严格遵守上方收到的【角色信息】，避免OOC（偏离角色性格）
    - 评论的语气、用词、关注点必须符合${charName}的性格设定
    - 评论数量根据角色性格和日记内容决定，但每篇日记下必须至少1条评论

  重要提示:
    - 如果日记下方显示了【已有评论】，这是之前的互动记录，**每条评论都有临时编号（#c1、#c2、#c3...）**
    - **严禁重复已有评论的内容**，应该继续对话或补充新的观点

  评论优先级:
    1. **最高优先级**：如果发现{{user}}回复了某条评论，${charName}应该优先回复{{user}}
    2. 如果${charName}已评论过：可以回复其他人，或根据性格补充新观点（不强制重复）

  评论编号说明:
    - 已有评论有临时评论编号（在评论开头显示，如：#c1 ${charName}：xxx）
    - 用于精确回复某条评论（避免同一人有多条评论时混淆）
    - 回复时写"回复@c编号"（如：回复@c1、回复@c2）

  格式要求（强制执行，将被正则扫描）:
    新评论格式: ${charName}：评论内容
    回复已有评论格式: ${charName}回复@c评论编号：回复内容
    注意事项:
      - 必须使用[评论]和[/评论]标签包裹
      - 新评论：直接写"${charName}：内容"
      - 回复已有评论：使用"回复@c编号"精确指向（如：回复@c1、回复@c2）
      - 可以写多条评论（每条另起一行）

  输出示例:
    假设日记有已有评论：
      #c1 ${charName}：评论内容
        #c2 {{user}}：评论内容
    
    正确的回复方式：
    [评论]
    ${charName}回复@c2：评论内容（精确回复{{user}}的#c2）
    ${charName}：评论内容
    [/评论]
</日记评论任务>
`;
      }
    }

    return task;
  }

  /**
   * 获取简化版世界书
   */
  async getSimpleWorldInfo(characterId) {
    try {
      const ctx = getContext();
      const character = ctx.characters[characterId];

      if (!character || !character.data?.character_book) {
        return '';
      }

      const characterBook = character.data.character_book;
      const entries = characterBook.entries || [];

      if (entries.length === 0) return '';

      const entriesAny = /** @type {any[]} */ (entries);
      const constantEntries = entriesAny
        .filter(e => {
          if (e.enabled === false) return false;
          if (e.disable || e.disabled) return false;
          return e.constant === true;
        })
        .map(e => e.content || e.comment || '')
        .filter(c => c.trim())
        .join('\n\n');

      if (!constantEntries) return '';

      const constantCount = entriesAny.filter(e =>
        !e.disable && !e.disabled && e.constant === true
      ).length;

      logger.debug('[DiaryAPIBuilder.getSimpleWorldInfo] 已获取常驻世界书，条目数:', constantCount);

      return `# 世界设定\n${constantEntries}\n\n`;

    } catch (error) {
      logger.warn('[DiaryAPIBuilder.getSimpleWorldInfo] 获取世界书失败:', error.message);
      return '';
    }
  }

  /**
   * 获取最近聊天历史
   */
  getRecentChatHistory(ctx, count = 5) {
    if (!ctx.chat || ctx.chat.length === 0) return '';

    const recentMessages = ctx.chat
      .slice(-count)
      .map(msg => {
        const author = msg.is_user ? ctx.name1 : ctx.name2;
        const content = msg.mes || '';
        return `${author}: ${content}`;
      })
      .join('\n');

    return recentMessages;
  }

  /**
   * 获取历史日记对象（用于批量评论）
   */
  getHistoryDiariesObjects(currentDiaryId, count = 3) {
    const allDiaries = this.dataManager.getDiaries();

    if (allDiaries.length === 0) return [];

    const historyDiaries = allDiaries
      .filter(d => d.id !== currentDiaryId && !d.privacy)
      .slice(-count);

    return historyDiaries;
  }
}

