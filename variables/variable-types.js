/**
 * 动态变量系统 V2 - 类型定义 (Variable Types)
 *
 * @description
 * 定义 V2 系统的所有数据类型，使用 JSDoc 提供类型提示
 * 这个文件不包含任何运行时代码，只是类型定义
 */

// ============================================
// 套装相关类型
// ============================================

/**
 * 触发配置
 * @typedef {Object} TriggerConfig
 * @property {'manual' | 'interval' | 'keyword'} type - 触发类型
 * @property {number} [interval] - 间隔楼层数（type='interval' 时使用）
 * @property {string[]} [keywords] - 触发关键词（type='keyword' 时使用）
 */

/**
 * 提示词条目（发送给 AI 的内容）
 * @typedef {Object} PromptItem
 * @property {'prompt'} type - 条目类型标识
 * @property {string} id - 唯一标识
 * @property {string} [name] - 条目名称（可选，用于显示）
 * @property {string} content - 提示词内容（可包含宏）
 * @property {boolean} enabled - 是否启用（开关，true=发送给AI）
 */

/**
 * 变量条目（接收 AI 返回的容器）
 * @typedef {Object} VariableItem
 * @property {'variable'} type - 条目类型标识
 * @property {string} id - 引用的变量定义 ID
 * @property {boolean} enabled - 是否启用（开关）
 */

/**
 * 正文条目范围配置
 * @typedef {Object} RangeConfig
 * @property {'fixed'|'latest'|'relative'|'interval'|'percentage'|'exclude'} type - 范围类型
 * @property {number} [start] - 起始楼（fixed, interval）
 * @property {number} [end] - 结束楼（fixed）
 * @property {number} [count] - 数量（latest, relative）
 * @property {number} [skip] - 跳过数量（relative）
 * @property {number} [step] - 间隔步长（interval）
 * @property {number} [percent] - 百分比（percentage）
 * @property {'start'|'end'} [position] - 位置（percentage）
 * @property {number} [excludeStart] - 排除起始（exclude）
 * @property {number} [excludeEnd] - 排除结束（exclude）
 */

/**
 * 自定义正则脚本
 * @typedef {Object} CustomRegexScript
 * @property {string} id - 脚本 ID（如 custom_1234567890_abc123）
 * @property {string} scriptName - 脚本名称
 * @property {string} findRegex - 查找正则表达式
 * @property {string} replaceString - 替换字符串
 * @property {boolean} only_format_prompt - 是否仅格式提示词
 * @property {boolean} disabled - 是否禁用
 * @property {'custom'} source - 来源标识
 */

/**
 * 正文条目正则配置
 * @typedef {Object} RegexConfig
 * @property {boolean} usePromptOnly - 使用「仅格式提示词」正则
 * @property {string[]} enabledScripts - 启用的脚本 ID
 * @property {string[]} disabledScripts - 禁用的脚本 ID
 * @property {CustomRegexScript[]} [customScripts] - 自定义正则脚本列表
 * @property {string[]} [scriptOrder] - 脚本执行顺序（脚本ID数组，用于拖拽排序）
 */

/**
 * 正文条目（引用酒馆聊天楼层）
 * @typedef {Object} ChatContentItem
 * @property {'chat-content'} type - 条目类型标识
 * @property {string} id - 唯一标识
 * @property {string} [name] - 条目名称（可选，用于显示）
 * @property {boolean} enabled - 是否启用（开关，true=发送给AI）
 * @property {RangeConfig} rangeConfig - 范围配置
 * @property {boolean} excludeUser - 排除 User 楼层
 * @property {RegexConfig} regexConfig - 正则配置
 */

/**
 * 角色条目（绑定到特定角色，随角色切换显示/隐藏）
 * @typedef {Object} CharPromptItem
 * @property {'char-prompt'} type - 条目类型标识
 * @property {string} id - 唯一标识
 * @property {string} charId - 角色标识符（角色 avatar 文件名，如 "Seraphina.png"）
 * @property {'char-desc' | 'char-personality' | 'char-scenario' | 'worldbook'} subType - 子类型
 * @property {string} label - 显示标签（如 "[角色设定]"）
 * @property {number} [entryUid] - 世界书条目 UID（subType='worldbook' 时使用）
 * @property {boolean} enabled - 是否启用
 */

/**
 * 套装条目（提示词、变量、正文或角色条目）
 * @typedef {PromptItem | VariableItem | ChatContentItem | CharPromptItem} SuiteItem
 */

/**
 * 提示词套装
 * @typedef {Object} PromptSuite
 * @property {string} id - 唯一标识
 * @property {string} name - 套装名称
 * @property {boolean} enabled - 是否启用
 * @property {TriggerConfig} trigger - 触发配置
 * @property {SuiteItem[]} items - 条目列表（提示词 + 变量，按顺序排列）
 * @property {boolean} [useSnapshotMode] - 队列快照模式（true=入队时快照楼层，false=实时获取）
 * @property {number} createdAt - 创建时间戳
 * @property {number} updatedAt - 更新时间戳
 */

// ============================================
// 变量相关类型
// ============================================

/**
 * 变量定义（V2 版本，添加 tag 和 mode）
 * @typedef {Object} VariableDefinitionV2
 * @property {string} id - 唯一标识 (UUID)
 * @property {string} name - 变量名（用于宏 {{变量名}}）
 * @property {string} tag - AI 输出标签，如 "[摘要]"
 * @property {'stack' | 'replace'} mode - 叠加/覆盖模式
 * @property {number} createdAt - 创建时间戳
 * @property {number} updatedAt - 更新时间戳
 */

/**
 * 变量条目（叠加模式下的单个条目）
 * @typedef {Object} VariableEntry
 * @property {number} id - 条目 ID（自增）
 * @property {string} content - 内容
 * @property {string} floorRange - 生成时的楼层范围（如 "56-65" 或 "65"）
 * @property {number} timestamp - 生成时间
 * @property {boolean} hidden - 是否隐藏
 * @property {string} [exportedToWorldBook] - 导出的世界书条目 ID
 */

/**
 * 叠加模式的变量值
 * @typedef {Object} StackVariableValue
 * @property {VariableEntry[]} entries - 条目列表
 * @property {number} nextEntryId - 下一个条目 ID
 */

/**
 * 覆盖模式的变量值
 * @typedef {Object} ReplaceVariableValue
 * @property {string} currentValue - 当前值
 * @property {number} currentFloor - 当前值生成时的楼层
 * @property {VariableEntry[]} history - 历史记录
 * @property {number} historyIndex - 当前查看的历史索引（-1 表示当前值）
 */

/**
 * 变量值（根据模式不同有不同结构）
 * @typedef {StackVariableValue | ReplaceVariableValue} VariableValueV2
 */

// ============================================
// 设置相关类型
// ============================================

/**
 * API 配置
 * @typedef {Object} APIConfig
 * @property {'default' | 'custom'} source - API 来源
 * @property {string} baseUrl - 自定义 API 地址
 * @property {string} apiKey - API 密钥
 * @property {string} model - 模型名称
 * @property {string} format - API 格式（openai/claude/deepseek 等）
 * @property {Object} params - 额外参数
 */

/**
 * V2 全局设置
 * @typedef {Object} VariableSettingsV2
 * @property {boolean} enabled - 主开关
 * @property {string} activeSuiteId - 当前激活的套装 ID
 * @property {APIConfig} apiConfig - API 配置
 * @property {Object<string, Object<string, number>>} messageCounts - 按套装的消息计数
 */

// ============================================
// 存储相关类型
// ============================================

/**
 * V2 存储数据结构
 * @typedef {Object} VariableStorageDataV2
 * @property {number} version - 数据版本号（V2 = 2）
 * @property {Object<string, PromptSuite>} suites - 套装（按 ID 索引）
 * @property {Object<string, VariableDefinitionV2>} variables - 变量定义（按 ID 索引）
 * @property {VariableSettingsV2} settings - 全局设置
 */

/**
 * 变量值存储数据结构（按聊天分文件）
 * @typedef {Object} VariableValuesStorage
 * @property {string} chatId - 聊天 ID
 * @property {Object<string, VariableValueV2>} values - 变量值（按变量 ID 索引）
 */

// ============================================
// 宏解析相关类型
// ============================================

/**
 * 范围定义
 * @typedef {Object} Range
 * @property {number | 'end'} start - 起始位置
 * @property {number | 'end'} end - 结束位置
 */

/**
 * 解析后的引用
 * @typedef {Object} ParsedReference
 * @property {string} name - 变量名或 "酒馆楼层"
 * @property {Range[]} ranges - 范围列表
 */

/**
 * 宏上下文
 * @typedef {Object} MacroContext
 * @property {string} chatId - 聊天 ID
 * @property {number} lastMessageId - 最新消息楼层号
 * @property {Map<string, VariableDefinitionV2>} variables - 变量定义映射
 */

// ============================================
// 标签解析相关类型
// ============================================

/**
 * 解析后的内容
 * @typedef {Object} ParsedContent
 * @property {string} tag - 标签名
 * @property {string} content - 内容
 */

// ============================================
// 导出（空导出，仅用于类型引用）
// ============================================

export default {};
