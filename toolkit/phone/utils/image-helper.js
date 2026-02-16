/**
 * 图片处理工具函数
 * @module phone/utils/image-helper
 */

import logger from '../../../logger.js';
import { getRequestHeaders } from '../../../../../../../script.js';
import { getBase64Async } from '../../../../../../utils.js';
import { saveImage } from '../storage/image-data.js';

/**
 * 压缩图片文件
 * 
 * @description
 * 将图片压缩到指定大小以内，使用Canvas缩放
 * 
 * @async
 * @param {File} file - 原始图片文件
 * @param {number} maxSizeKB - 最大文件大小（KB）
 * @returns {Promise<{base64: string, size: number}>} 压缩后的base64和大小
 * @throws {Error} 压缩失败时
 * 
 * @example
 * const compressed = await compressImage(file, 200);
 * console.log('压缩后大小:', compressed.size);
 */
export async function compressImage(file, maxSizeKB = 200) {
    logger.debug('phone','[ImageHelper] 开始压缩图片:', file.name, `原大小: ${(file.size / 1024).toFixed(2)}KB`);

    try {
        // 读取原始图片
        const originalBase64 = await getBase64Async(file);
        const originalSize = file.size;

        // 如果原图已经够小，直接返回
        if (originalSize <= maxSizeKB * 1024) {
            logger.debug('phone','[ImageHelper] 图片无需压缩');
            return {
                base64: originalBase64,
                size: originalSize
            };
        }

        // 创建Image对象
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = originalBase64;
        });

        // 计算缩放比例（从原尺寸开始尝试）
        let quality = 0.9;
        let scale = 1.0;
        let compressed = null;

        // 最多尝试10次
        for (let i = 0; i < 10; i++) {
            // 创建Canvas
            const canvas = document.createElement('canvas');
            const targetWidth = Math.floor(img.width * scale);
            const targetHeight = Math.floor(img.height * scale);
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

            // 转换为base64
            compressed = canvas.toDataURL('image/jpeg', quality);
            const compressedSize = Math.floor((compressed.length * 0.75));

            logger.debug('phone',`[ImageHelper] 压缩尝试 ${i + 1}: ${targetWidth}x${targetHeight}, 质量${quality}, 大小${(compressedSize / 1024).toFixed(2)}KB`);

            // 检查大小
            if (compressedSize <= maxSizeKB * 1024) {
                logger.info('phone','[ImageHelper] 压缩成功:', `${(compressedSize / 1024).toFixed(2)}KB`);
                return {
                    base64: compressed,
                    size: compressedSize
                };
            }

            // 调整参数
            if (quality > 0.5) {
                quality -= 0.1;
            } else {
                scale -= 0.1;
                quality = 0.9;
            }

            // 防止过度压缩
            if (scale < 0.3) {
                logger.warn('phone','[ImageHelper] 达到最小缩放比例，停止压缩');
                break;
            }
        }

        // 如果仍然过大，返回最后一次压缩结果
        logger.warn('phone','[ImageHelper] 压缩后仍超过限制，返回最后结果');
        return {
            base64: compressed,
            size: Math.floor((compressed.length * 0.75))
        };

    } catch (error) {
        logger.error('phone','[ImageHelper] 压缩失败:', error);
        throw error;
    }
}

/**
 * 上传图片到服务器
 * 
 * @description
 * 调用酒馆的API上传图片，返回URL
 * 使用FormData格式上传，兼容酒馆的文件上传API
 * 
 * @async
 * @param {string} base64Data - base64数据（完整data URL）
 * @param {string} filename - 文件名
 * @returns {Promise<string>} 图片URL
 * @throws {Error} 上传失败时
 * 
 * @example
 * const url = await uploadImage(base64DataUrl, 'photo.jpg');
 */
export async function uploadImage(base64Data, filename) {
    logger.debug('phone','[ImageHelper] 上传图片:', filename);

    try {
        // 导入酒馆的认证头函数
        const { getRequestHeaders } = await import('../../../../../../../script.js');

        // 生成唯一文件名
        const timestamp = Date.now();
        const ext = filename.split('.').pop() || 'jpg';
        const uniqueName = `phone_${timestamp}.${ext}`;

        // 去掉data URL前缀，只保留纯base64（服务器需要）
        // 格式：data:image/jpeg;base64,xxxxxxxx -> xxxxxxxx
        const pureBase64 = base64Data.includes(',') 
            ? base64Data.split(',')[1] 
            : base64Data;

        // 调用酒馆API（使用JSON格式，与表情包上传一致）
        const response = await fetch('/api/files/upload', {
            method: 'POST',
            headers: getRequestHeaders(),  // 包含认证头
            body: JSON.stringify({
                name: uniqueName,
                data: pureBase64  // 纯base64字符串（无data URL前缀）
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(error);
        }

        const result = await response.json();
        const imageUrl = result.path || result.url;
        logger.info('phone','[ImageHelper] 上传成功:', imageUrl);
        
        // 记录到图片管理列表（使用数据管理系统）
        const fileSize = Math.floor((pureBase64.length * 3) / 4);
        await saveImage({
            id: timestamp.toString(),
            filename: uniqueName,
            imagePath: imageUrl,
            size: fileSize,
            addedTime: timestamp
        });
        
        return imageUrl;

    } catch (error) {
        logger.error('phone','[ImageHelper] 上传失败:', error);
        throw error;
    }
}

/**
 * 显示图片预览（放大查看）
 * 
 * @param {string} imageUrl - 图片URL
 */
export function showImagePreview(imageUrl) {
    logger.debug('phone','[ImageHelper] 显示图片预览:', imageUrl);

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'phone-image-preview-overlay';
    overlay.innerHTML = `
        <div class="phone-image-preview-container">
            <img src="${imageUrl}" class="phone-image-preview-img" alt="图片预览">
            <button class="phone-image-preview-close">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>
    `;

    // 点击关闭
    overlay.addEventListener('click', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        if (target === overlay || target.closest('.phone-image-preview-close')) {
            overlay.remove();
        }
    });

    document.body.appendChild(overlay);
}
