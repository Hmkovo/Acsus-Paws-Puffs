/**
 * 好友申请消息回退处理器
 * @module phone/messages/friend-request-rollback-handler
 * 
 * @description
 * 当用户点击"重roll"删除AI回复时，同步删除对应的好友申请消息
 */

import logger from '../../../logger.js';
import { registerRollbackHandler } from './message-rollback-manager.js';
import { deleteReapplyMessageByMsgId } from '../contacts/contact-list-data.js';

/**
 * 初始化好友申请消息回退处理器
 * 
 * @description
 * 注册到统一回退系统，当AI消息被删除时自动触发
 */
export function initFriendRequestRollbackHandler() {
  registerRollbackHandler({
    name: '好友申请消息',
    priority: 15,
    rollback: async (contactId, deletedMessages, deletedMessageIds) => {
      logger.debug('[FriendRequestRollback] 开始回退好友申请消息，联系人:', contactId);

      let deletedCount = 0;

      // 遍历被删除的AI消息
      for (const aiMsg of deletedMessages) {
        // 检查是否是好友申请消息
        if (aiMsg.type === 'friend_request') {
          logger.debug('[FriendRequestRollback] 检测到好友申请消息:', aiMsg.id, aiMsg.content?.substring(0, 20));
          
          // ✅ 从 reapplyMessages 中删除对应的消息
          const success = await deleteReapplyMessageByMsgId(contactId, aiMsg.id);
          
          if (success) {
            deletedCount++;
            logger.info('[FriendRequestRollback] 已删除好友申请消息:', aiMsg.id);
          }
        }
      }

      if (deletedCount > 0) {
        logger.info('[FriendRequestRollback] 共回退', deletedCount, '条好友申请消息');
        
        // ✅ 触发详情页刷新事件
        document.dispatchEvent(new CustomEvent('phone-ai-generation-complete', {
          detail: { contactId }
        }));
        logger.debug('[FriendRequestRollback] 已触发详情页刷新事件');
      }
    }
  });

  logger.info('[FriendRequestRollback] 好友申请消息回退处理器已注册');
}

