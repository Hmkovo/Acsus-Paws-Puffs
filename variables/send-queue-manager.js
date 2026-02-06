/**
 * 发送队列管理器 (Send Queue Manager)
 *
 * @description
 * 管理变量分析任务的发送队列，支持：
 * - 任务入队/出队
 * - 暂停/继续/移除任务
 * - 快照模式 vs 实时模式
 * - 队列状态监听
 */

import logger from '../logger.js';
import { getContext } from '../../../../extensions.js';
import { eventSource, event_types } from '../../../../../script.js';

// ============================================
// 类型定义
// ============================================

/**
 * @typedef {Object} QueueTask
 * @property {string} id - 任务唯一ID
 * @property {string} suiteId - 套装ID
 * @property {string} suiteName - 套装名称（用于显示）
 * @property {'pending' | 'processing' | 'paused'} status - 任务状态
 * @property {number} chatLengthSnapshot - 入队时的聊天楼层数（快照模式用）
 * @property {string} chatIdSnapshot - 入队时的聊天ID
 * @property {number} createdAt - 创建时间戳
 * @property {string} [triggerType] - 触发类型：'manual' | 'interval' | 'keyword'
 */

// ============================================
// 队列管理器类
// ============================================

class SendQueueManager {
    constructor() {
        /** @type {QueueTask[]} */
        this._queue = [];

        /** @type {boolean} */
        this._isProcessing = false;

        /** @type {boolean} */
        this._useSnapshot = true; // 默认使用入队快照

        /** @type {Set<Function>} */
        this._listeners = new Set();

        /** @type {AbortController|null} */
        this._currentAbortController = null;
    }

    // ============================================
    // 公开方法
    // ============================================

    /**
     * 添加任务到队列
     * @param {string} suiteId - 套装ID
     * @param {string} suiteName - 套装名称
     * @param {'manual' | 'interval' | 'keyword'} [triggerType='manual'] - 触发类型
     * @returns {QueueTask} 创建的任务
     */
    enqueue(suiteId, suiteName, triggerType = 'manual') {
        const ctx = getContext();

        const task = {
            id: this._generateId(),
            suiteId,
            suiteName,
            status: 'pending',
            chatLengthSnapshot: ctx?.chat?.length || 0,
            chatIdSnapshot: ctx?.chatId || '',
            createdAt: Date.now(),
            triggerType
        };

        this._queue.push(task);
        logger.info('[SendQueueManager] 任务入队:', suiteName, '队列长度:', this._queue.length);

        this._notifyListeners();
        this._tryProcessNext();

        return task;
    }

    /**
     * 从队列移除任务
     * @param {string} taskId - 任务ID
     * @returns {boolean} 是否成功移除
     */
    remove(taskId) {
        const index = this._queue.findIndex(t => t.id === taskId);
        if (index === -1) return false;

        const task = this._queue[index];

        // 如果正在处理中，需要中止
        if (task.status === 'processing' && this._currentAbortController) {
            this._currentAbortController.abort();
        }

        this._queue.splice(index, 1);
        logger.info('[SendQueueManager] 任务移除:', task.suiteName);

        this._notifyListeners();
        return true;
    }

    /**
     * 暂停任务（保留在队列但不处理）
     * @param {string} taskId - 任务ID
     * @returns {boolean} 是否成功暂停
     */
    pause(taskId) {
        const task = this._queue.find(t => t.id === taskId);
        if (!task || task.status === 'processing') return false;

        task.status = 'paused';
        logger.info('[SendQueueManager] 任务暂停:', task.suiteName);

        this._notifyListeners();
        return true;
    }

    /**
     * 继续任务
     * @param {string} taskId - 任务ID
     * @returns {boolean} 是否成功继续
     */
    resume(taskId) {
        const task = this._queue.find(t => t.id === taskId);
        if (!task || task.status !== 'paused') return false;

        task.status = 'pending';
        logger.info('[SendQueueManager] 任务继续:', task.suiteName);

        this._notifyListeners();
        this._tryProcessNext();
        return true;
    }

    /**
     * 终止当前正在处理的任务
     */
    abortCurrent() {
        if (this._currentAbortController) {
            this._currentAbortController.abort();
            logger.info('[SendQueueManager] 当前任务已终止');
        }
    }

    /**
     * 清空队列
     */
    clear() {
        this.abortCurrent();
        this._queue = [];
        this._isProcessing = false;
        logger.info('[SendQueueManager] 队列已清空');
        this._notifyListeners();
    }

    /**
     * 获取队列中的所有任务
     * @returns {QueueTask[]}
     */
    getTasks() {
        return [...this._queue];
    }

    /**
     * 获取队列长度
     * @returns {number}
     */
    getLength() {
        return this._queue.length;
    }

    /**
     * 获取指定套装的任务状态
     * @param {string} suiteId - 套装ID
     * @returns {{status: 'idle' | 'processing' | 'pending' | 'paused', position?: number, task?: QueueTask}}
     */
    getSuiteStatus(suiteId) {
        const task = this._queue.find(t => t.suiteId === suiteId);
        if (!task) {
            return { status: 'idle' };
        }

        if (task.status === 'processing') {
            return { status: 'processing', task };
        }

        if (task.status === 'paused') {
            return { status: 'paused', task };
        }

        // pending 状态，计算在队列中的位置
        const pendingTasks = this._queue.filter(t => t.status === 'pending' || t.status === 'processing');
        const position = pendingTasks.findIndex(t => t.suiteId === suiteId) + 1;
        return { status: 'pending', position, task };
    }

    /**
     * 终止指定套装的任务
     * @param {string} suiteId - 套装ID
     * @returns {boolean} 是否成功终止
     */
    abortSuite(suiteId) {
        const task = this._queue.find(t => t.suiteId === suiteId);
        if (!task) return false;

        if (task.status === 'processing' && this._currentAbortController) {
            this._currentAbortController.abort();
        }

        return this.remove(task.id);
    }

    /**
     * 是否正在处理
     * @returns {boolean}
     */
    isProcessing() {
        return this._isProcessing;
    }

    /**
     * 设置是否使用快照模式
     * @param {boolean} useSnapshot - true=入队快照，false=实时获取
     */
    setSnapshotMode(useSnapshot) {
        this._useSnapshot = useSnapshot;
        logger.info('[SendQueueManager] 快照模式:', useSnapshot ? '入队快照' : '实时获取');
    }

    /**
     * 获取当前快照模式
     * @returns {boolean}
     */
    getSnapshotMode() {
        return this._useSnapshot;
    }

    /**
     * 添加队列变化监听器
     * @param {Function} listener - 监听函数
     */
    addListener(listener) {
        this._listeners.add(listener);
    }

    /**
     * 移除监听器
     * @param {Function} listener - 监听函数
     */
    removeListener(listener) {
        this._listeners.delete(listener);
    }

    // ============================================
    // 私有方法
    // ============================================

    /**
     * 生成唯一ID
     * @returns {string}
     */
    _generateId() {
        return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 通知所有监听器
     */
    _notifyListeners() {
        const tasks = this.getTasks();
        this._listeners.forEach(listener => {
            try {
                listener(tasks);
            } catch (e) {
                logger.error('[SendQueueManager] 监听器执行失败:', e);
            }
        });
    }

    /**
     * 尝试处理下一个任务
     */
    async _tryProcessNext() {
        if (this._isProcessing) return;

        // 找到第一个 pending 状态的任务
        const nextTask = this._queue.find(t => t.status === 'pending');
        if (!nextTask) return;

        await this._processTask(nextTask);
    }

    /**
     * 处理单个任务
     * @param {QueueTask} task
     */
    async _processTask(task) {
        this._isProcessing = true;
        task.status = 'processing';
        this._notifyListeners();

        this._currentAbortController = new AbortController();

        try {
            // 动态导入分析器，避免循环依赖
            const { getVariableAnalyzerV2 } = await import('./variable-analyzer-v2.js');
            const analyzer = getVariableAnalyzerV2();

            // 根据快照模式决定使用哪个楼层数
            const chatLength = this._useSnapshot
                ? task.chatLengthSnapshot
                : (getContext()?.chat?.length || 0);

            logger.info('[SendQueueManager] 开始处理任务:', task.suiteName, '楼层:', chatLength);

            // 执行分析（注意：analyze 第二个参数是 AbortSignal，不是对象）
            const result = await analyzer.analyze(task.suiteId, this._currentAbortController.signal);

            if (result.success && result.results) {
                // 自动分配结果
                const floorRange = analyzer.getLastFloorRange() || String(chatLength);
                const assignResult = await analyzer.assignResults(result.results, task.chatIdSnapshot, floorRange);

                logger.info('[SendQueueManager] 任务完成:', task.suiteName, '结果数:', result.results.length, '已分配:', assignResult.assigned);

                // 用户提示
                if (assignResult.assigned > 0) {
                    toastr.success(`${task.suiteName}: 已分配 ${assignResult.assigned} 个变量`);
                } else if (result.results.length > 0) {
                    toastr.warning(`${task.suiteName}: 解析到 ${result.results.length} 个结果，但未能分配到变量`);
                } else {
                    toastr.info(`${task.suiteName}: AI 返回内容中未找到匹配的标签`);
                }

                // 触发完成事件（UI 监听此事件来更新返回预览）
                eventSource.emit('paws_queue_task_complete', {
                    taskId: task.id,
                    suiteId: task.suiteId,
                    suiteName: task.suiteName,
                    resultsCount: result.results.length,
                    assignedCount: assignResult.assigned,
                    rawResponse: analyzer.getLastResponse()
                });
            } else {
                logger.warn('[SendQueueManager] 任务失败:', task.suiteName, result.error);
                toastr.error(`${task.suiteName}: ${result.error || '分析失败'}`);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.info('[SendQueueManager] 任务被中止:', task.suiteName);
            } else {
                logger.error('[SendQueueManager] 任务执行失败:', task.suiteName, error);
            }
        } finally {
            // 从队列移除已完成的任务
            const index = this._queue.findIndex(t => t.id === task.id);
            if (index !== -1) {
                this._queue.splice(index, 1);
            }

            this._isProcessing = false;
            this._currentAbortController = null;
            this._notifyListeners();

            // 继续处理下一个
            this._tryProcessNext();
        }
    }
}

// ============================================
// 单例导出
// ============================================

/** @type {SendQueueManager|null} */
let instance = null;

/**
 * 获取队列管理器实例
 * @returns {SendQueueManager}
 */
export function getSendQueueManager() {
    if (!instance) {
        instance = new SendQueueManager();
    }
    return instance;
}

export { SendQueueManager };
