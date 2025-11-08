/**
 * 转账消息回退处理器
 * @module phone/transfers/transfer-rollback-handler
 * 
 * @description
 * 注册转账消息的回退逻辑到统一回退管理器
 * 当重roll时，自动删除被回退的转账消息对应的转账记录和余额变化
 * 
 * 回退逻辑：
 * - 查找被删除消息中的转账消息（type='transfer'）
 * - 删除对应的转账记录（自动恢复余额）
 * - 触发钱包数据变化事件
 */

import logger from '../../../logger.js';
import { registerRollbackHandler } from '../messages/message-rollback-manager.js';
import { getTransactions, deleteTransaction } from '../data-storage/storage-wallet.js';

/**
 * 初始化转账消息回退处理器
 * 
 * @description
 * 在扩展初始化时调用，注册回退逻辑
 */
export function initTransferRollbackHandler() {
    registerRollbackHandler({
        name: '转账消息',
        priority: 5, // 优先级最高（涉及金钱数据，必须先处理）
        rollback: async (contactId, deletedMessages, deletedMessageIds) => {
            logger.debug('[TransferRollback] 开始回退转账消息');

            let deletedCount = 0;
            const deletedTransfers = [];

            // 获取该联系人的所有转账记录
            const allTransactions = await getTransactions({ contactId });

            // 遍历所有被删除的消息ID，查找关联的转账记录
            for (const msgId of deletedMessageIds) {
                // 查找与该消息ID关联的转账记录
                const transaction = allTransactions.find(t => t.messageId === msgId);

                if (transaction) {
                    logger.debug('[TransferRollback] 发现需要删除的转账记录:', {
                        transactionId: transaction.id,
                        messageId: msgId,
                        direction: transaction.direction,
                        amount: transaction.amount
                    });

                    // 删除转账记录（deleteTransaction 会自动恢复余额）
                    const success = await deleteTransaction(transaction.id);

                    if (success) {
                        deletedCount++;
                        deletedTransfers.push({
                            direction: transaction.direction,
                            amount: transaction.amount,
                            message: transaction.message
                        });
                    } else {
                        logger.warn('[TransferRollback] 删除转账记录失败:', transaction.id);
                    }
                }
            }

            if (deletedCount > 0) {
                logger.info('[TransferRollback] 共回退', deletedCount, '条转账记录');
                logger.debug('[TransferRollback] 删除的转账:', deletedTransfers.map(t => 
                    `${t.direction === 'sent' ? '支出' : '收入'}¥${t.amount}${t.message ? `(${t.message})` : ''}`
                ).join(', '));

                // 刷新钱包UI（如果当前正在查看）
                try {
                    const walletPage = document.querySelector('.wallet-page');
                    if (walletPage && walletPage.closest('.phone-popup')) {
                        logger.debug('[TransferRollback] 检测到钱包页面打开，刷新UI');
                        // 触发钱包数据变化事件，让钱包页自动刷新
                        const event = new CustomEvent('wallet-data-changed', {
                            detail: {
                                action: 'rollback-transfer',
                                contactId,
                                count: deletedCount
                            }
                        });
                        document.dispatchEvent(event);
                    }
                } catch (uiError) {
                    logger.warn('[TransferRollback] UI刷新失败（不影响数据回退）:', uiError);
                }
            } else {
                logger.debug('[TransferRollback] 没有需要回退的转账记录');
            }
        }
    });

    logger.info('[TransferRollback] 转账消息回退处理器已初始化');
}


