import logger from '../../../../logger.js';
import { renderImageRealMessage } from './image-real-message.js';
import { renderImageFakeMessage } from './image-fake-message.js';

/**
 * 渲染图片消息气泡（兼容层）
 * 
 * @param {Object} message - 消息对象
 * @param {string} message.type - 消息类型 ('image-real' | 'image-fake' | 'image')
 * @param {string} message.sender - 发送者 ('user' | 'contact')
 * @param {string} [message.imageUrl] - 图片URL（真实图片必需）
 * @param {string} [message.description] - 图片描述
 * @param {number} [message.imageRound] - 图片所属轮次（真实图片必需）
 * @param {Object} contact - 联系人对象
 * @param {string} contact.avatar - 联系人头像
 * @param {string} [contactId] - 联系人ID（用于删除等操作）
 * @returns {HTMLElement} 消息DOM元素
 * 
 * @description
 * 兼容层：自动识别图片类型并调用对应的渲染器
 * - 新消息应该直接使用 'image-real' 或 'image-fake' 类型
 * - 旧消息（type='image'）会根据 imageUrl 字段自动识别类型
 * 
 * @deprecated 建议直接使用 renderImageRealMessage 或 renderImageFakeMessage
 */
export function renderImageMessage(message, contact, contactId) {
  logger.debug('phone','[ImageMessage] 渲染图片消息（兼容层）:', message);

  // ✅ 自动识别类型
  if (message.type === 'image-real') {
    return renderImageRealMessage(message, contact, contactId);
  } else if (message.type === 'image-fake') {
    return renderImageFakeMessage(message, contact, contactId);
  } else if (message.type === 'image') {
    // ✅ 旧数据兼容：根据 imageUrl 判断类型
    if (message.imageUrl) {
      logger.debug('phone','[ImageMessage] 旧数据自动转换为 image-real');
      return renderImageRealMessage(message, contact, contactId);
    } else {
      logger.debug('phone','[ImageMessage] 旧数据自动转换为 image-fake');
      return renderImageFakeMessage(message, contact, contactId);
    }
  } else {
    logger.error('phone','[ImageMessage] 未知的图片消息类型:', message.type);
    // 降级处理：尝试按真实图片渲染
    return renderImageRealMessage(message, contact, contactId);
  }
}

