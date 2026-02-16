/**
 * 送会员消息回退处理器
 * @module phone/membership/gift-membership-rollback-handler
 * 
 * @description
 * 注册送会员消息的回退逻辑到统一回退管理器
 * 当重roll时，自动撤销被回退的会员开通和交易记录
 * 
 * 回退逻辑：
 * - 查找被删除消息中的送会员消息（type='gift-membership'）
 * - 撤销对应的会员记录（删除会员数据）
 * - 删除对应的交易记录（自动恢复余额）
 * - 触发会员和钱包数据变化事件
 */

import logger from '../../../logger.js';
import { registerRollbackHandler } from '../messages/message-rollback-manager.js';
import { getTransactions, deleteTransaction } from '../data-storage/storage-wallet.js';
import { revokeUserMembership, revokeCharacterMembership } from '../data-storage/storage-membership.js';

/**
 * 初始化送会员消息回退处理器
 * 
 * @description
 * 在扩展初始化时调用，注册回退逻辑
 */
export function initGiftMembershipRollbackHandler() {
  registerRollbackHandler({
    name: '送会员消息',
    priority: 6, // 优先级略低于转账（6 vs 5），但高于其他业务逻辑
    rollback: async (contactId, deletedMessages, deletedMessageIds) => {
      logger.debug('phone','[GiftMembershipRollback] 开始回退送会员消息');

      let revokedMemberships = 0;
      let deletedTransactions = 0;

      // 获取该联系人的所有交易记录
      const allTransactions = await getTransactions({ contactId });

      // 遍历所有被删除的消息
      for (const aiMsg of deletedMessages) {
        if (aiMsg.type !== 'gift-membership') continue;

        logger.debug('phone','[GiftMembershipRollback] 处理送会员消息:', aiMsg.id);

        // 1. 撤销会员记录
        if (aiMsg.sender === 'user') {
          // 用户送角色：撤销角色会员
          const revoked = await revokeCharacterMembership(contactId, aiMsg.id);
          if (revoked) revokedMemberships++;
        } else {
          // 角色送用户：撤销用户会员
          const revoked = await revokeUserMembership(aiMsg.id);
          if (revoked) revokedMemberships++;
        }

        // 2. 删除交易记录
        const transaction = allTransactions.find(t => t.relatedMsgId === aiMsg.id);
        if (transaction) {
          logger.debug('phone','[GiftMembershipRollback] 发现需要删除的交易记录:', {
            transactionId: transaction.id,
            messageId: aiMsg.id,
            direction: transaction.direction,
            amount: transaction.amount
          });

          const success = await deleteTransaction(transaction.id);
          if (success) {
            deletedTransactions++;
          } else {
            logger.warn('phone','[GiftMembershipRollback] 删除交易记录失败:', transaction.id);
          }
        }
      }

      if (revokedMemberships > 0 || deletedTransactions > 0) {
        logger.info('phone','[GiftMembershipRollback] 共撤销', revokedMemberships, '个会员，删除', deletedTransactions, '条交易记录');
        
        // 注：deleteTransaction 已通过 stateManager.set 自动触发钱包数据变化通知，不需要重复触发
      } else {
        logger.debug('phone','[GiftMembershipRollback] 没有需要回退的送会员记录');
      }
    }
  });

  logger.info('phone','[GiftMembershipRollback] 送会员消息回退处理器已初始化');
}
