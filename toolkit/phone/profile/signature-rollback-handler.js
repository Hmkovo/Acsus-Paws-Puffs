/**
 * 个性签名回退处理器
 * @module phone/profile/signature-rollback-handler
 * 
 * @description
 * 注册个性签名的回退逻辑到统一回退管理器
 * 当重roll时，自动删除被回退的个签消息对应的个签记录
 */

import logger from '../../../logger.js';
import { registerRollbackHandler } from '../messages/message-rollback-manager.js';
import { rollbackSignatureHistory } from './signature-data.js';

/**
 * 初始化个性签名回退处理器
 * 
 * @description
 * 在扩展初始化时调用，注册回退逻辑
 */
export function initSignatureRollbackHandler() {
    registerRollbackHandler({
        name: '个性签名',
        priority: 20, // 优先级中等
        rollback: async (contactId, deletedMessages, deletedMessageIds) => {
            logger.debug('[SignatureRollback] 开始回退个签历史');

            const rollbackResult = await rollbackSignatureHistory(contactId, deletedMessageIds);

            if (rollbackResult.count > 0) {
                logger.info('[SignatureRollback] 共回退', rollbackResult.count, '条个签记录');
                logger.debug('[SignatureRollback] 删除的个签:', rollbackResult.deleted.map(s => s.signature || s.content).join(', '));

                // 刷新个签历史UI（如果当前正在查看）
                try {
                    const historyPage = document.querySelector('.signature-history-page');
                    if (historyPage && historyPage.closest('.phone-popup')) {
                        logger.debug('[SignatureRollback] 检测到个签历史页面打开，刷新UI');
                        const { renderSignatureHistory } = await import('./signature-history-ui.js');
                        const newContent = await renderSignatureHistory({ targetType: 'contact', contactId });
                        historyPage.replaceWith(newContent);
                    }
                } catch (uiError) {
                    logger.warn('[SignatureRollback] UI刷新失败（不影响数据回退）:', uiError);
                }
            } else {
                logger.debug('[SignatureRollback] 没有需要回退的个签');
            }
        }
    });

    logger.info('[SignatureRollback] 个性签名回退处理器已初始化');
}

