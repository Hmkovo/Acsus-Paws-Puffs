/**
 * 图片数据管理模块（学习表情包管理器模式）
 * @module phone/storage/image-data
 */

import { extension_settings } from '../../../../../../extensions.js';
import { saveSettingsDebounced as saveSetting, getRequestHeaders } from '../../../../../../../script.js';
import logger from '../../../logger.js';
import { stateManager } from '../utils/state-manager.js';

/**
 * 获取上传图片列表
 *
 * @returns {Array<Object>} 图片数组
 *
 * @description
 * 返回格式：
 * [
 *   {
 *     id: '1763883714461',          // 图片ID（时间戳）
 *     filename: 'phone_xxx.jpg',    // 文件名
 *     imagePath: '/user/files/...',  // 图片路径
 *     size: 256000,                  // 文件大小（字节）
 *     addedTime: 1763883714461      // 添加时间（毫秒）
 *   }
 * ]
 */
export function getUploadedImages() {
    if (!extension_settings.acsusPawsPuffs) {
        extension_settings.acsusPawsPuffs = {};
    }
    if (!extension_settings.acsusPawsPuffs.phone) {
        extension_settings.acsusPawsPuffs.phone = {};
    }

    // 数据迁移：兼容旧版本数组格式
    if (!extension_settings.acsusPawsPuffs.phone.uploadedImages) {
        extension_settings.acsusPawsPuffs.phone.uploadedImages = { items: [] };
    } else if (Array.isArray(extension_settings.acsusPawsPuffs.phone.uploadedImages)) {
        // 旧数据是数组格式，迁移到新格式
        logger.warn('[ImageData] 检测到旧数据格式，正在迁移...');
        const oldData = extension_settings.acsusPawsPuffs.phone.uploadedImages;
        extension_settings.acsusPawsPuffs.phone.uploadedImages = { items: oldData };
        logger.info('[ImageData] 数据迁移完成，共', oldData.length, '条记录');

        // 【关键修复】立即保存迁移后的数据，避免下次刷新又触发迁移
        saveSetting();
        logger.info('[ImageData] 已保存迁移后的数据到配置文件');
    }

    return extension_settings.acsusPawsPuffs.phone.uploadedImages.items;
}

/**
 * 保存图片记录
 *
 * @async
 * @param {Object} image - 图片对象
 * @param {string} image.id - 图片ID
 * @param {string} image.filename - 文件名
 * @param {string} image.imagePath - 图片路径
 * @param {number} image.size - 文件大小（字节）
 * @param {number} image.addedTime - 添加时间（毫秒）
 * @returns {Promise<boolean>} 是否成功
 */
export async function saveImage(image) {
    const images = getUploadedImages();

    // 检查是否已存在（按文件名）
    const index = images.findIndex(img => img.filename === image.filename);
    if (index !== -1) {
        // 更新已有记录
        images[index] = image;
        logger.info('[ImageData] 已更新图片记录:', image.filename);
    } else {
        // 添加新记录
        images.push(image);
        logger.info('[ImageData] 已添加图片记录:', image.filename);
    }

    await saveSetting();

    // 通知订阅者数据已变化
    await stateManager.set('images', getUploadedImages(), {
        action: index !== -1 ? 'update' : 'add',
        image: image
    });

    return true;
}

/**
 * 删除图片（批量）
 *
 * @async
 * @param {Array<string>} filenames - 要删除的文件名列表
 * @returns {Promise<{deletedCount: number, successCount: number, failCount: number}>} 删除结果
 *
 * @description
 * 删除图片数据并删除服务器上的图片文件
 * 使用 /api/files/delete 端点删除实际文件
 */
export async function deleteImages(filenames) {
    const images = getUploadedImages();
    const beforeCount = images.length;

    // 找出要删除的图片（用于删除文件）
    const imagesToDelete = images.filter(img => filenames.includes(img.filename));

    // 删除服务器上的图片文件
    let successCount = 0;
    let failCount = 0;

    for (const image of imagesToDelete) {
        try {
            const response = await fetch('/api/files/delete', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ path: image.imagePath })
            });

            if (response.ok) {
                successCount++;
                logger.info('[ImageData] 已删除文件:', image.imagePath);
            } else {
                failCount++;
                logger.warn('[ImageData] 删除文件失败:', image.imagePath, '状态码:', response.status);
            }
        } catch (error) {
            failCount++;
            logger.error('[ImageData] 删除文件时出错:', image.imagePath, error);
        }
    }

    // 过滤掉要删除的图片（从数据中移除）
    extension_settings.acsusPawsPuffs.phone.uploadedImages.items =
        images.filter(img => !filenames.includes(img.filename));

    const deletedCount = beforeCount - extension_settings.acsusPawsPuffs.phone.uploadedImages.items.length;
    logger.info(`[ImageData] 已删除 ${deletedCount} 条图片记录（文件：成功${successCount}，失败${failCount}）`);

    await saveSetting();

    // 通知订阅者数据已变化
    if (deletedCount > 0) {
        await stateManager.set('images', getUploadedImages(), {
            action: 'delete',
            count: deletedCount,
            successCount,
            failCount
        });
    }

    return { deletedCount, successCount, failCount };
}

/**
 * 根据文件名查找图片
 *
 * @param {string} filename - 文件名
 * @returns {Object|null} 图片对象
 */
export function findImageByFilename(filename) {
    const images = getUploadedImages();
    return images.find(img => img.filename === filename) || null;
}

/**
 * 根据ID查找图片
 *
 * @param {string} id - 图片ID
 * @returns {Object|null} 图片对象
 */
export function findImageById(id) {
    const images = getUploadedImages();
    return images.find(img => img.id === id) || null;
}

/**
 * 清空所有图片记录（不删除文件）
 *
 * @async
 * @description
 * 用于数据重置或迁移，只清空记录，不删除实际文件
 */
export async function clearAllImages() {
    const count = getUploadedImages().length;
    extension_settings.acsusPawsPuffs.phone.uploadedImages.items = [];
    await saveSetting();

    logger.info('[ImageData] 已清空所有图片记录，数量:', count);

    // 通知订阅者数据已变化
    await stateManager.set('images', [], {
        action: 'clear',
        count
    });
}
