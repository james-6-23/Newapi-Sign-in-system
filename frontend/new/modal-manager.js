/**
 * KYX 签到系统 - 弹窗管理器
 * 统一管理所有弹窗的显示、关闭和状态控制
 * 确保弹窗在复制或关闭后不再重复显示
 */

class ModalManager {
    constructor(apiBaseUrl = '') {
        this.apiBaseUrl = apiBaseUrl;
        this.activeModals = new Map(); // 当前活跃的弹窗
        this.modalHistory = new Map(); // 弹窗显示历史
        this.config = {
            autoCloseDelay: 5000, // 自动关闭延迟（毫秒）
            maxDisplayCount: 1, // 默认最大显示次数
            enableAutoClose: false // 是否启用自动关闭
        };
        
        this.init();
    }

    /**
     * 初始化弹窗管理器
     */
    init() {
        // 绑定全局事件
        this.bindGlobalEvents();
        
        // 从localStorage恢复状态
        this.restoreState();
        
        console.log('ModalManager initialized');
    }

    /**
     * 绑定全局事件
     */
    bindGlobalEvents() {
        // 页面卸载时保存状态
        window.addEventListener('beforeunload', () => {
            this.saveState();
        });

        // 监听键盘事件（ESC关闭弹窗）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    /**
     * 检查弹窗是否应该显示
     */
    async checkDisplayPermission(type, key) {
        try {
            // 首先检查本地状态
            const localKey = `${type}_${key}`;
            const localHistory = this.modalHistory.get(localKey);
            
            if (localHistory && localHistory.isDismissed) {
                return {
                    shouldDisplay: false,
                    reason: 'dismissed_locally',
                    displayCount: localHistory.displayCount,
                    maxCount: this.config.maxDisplayCount
                };
            }

            // 检查服务器状态
            const response = await fetch(`${this.apiBaseUrl}/api/modal/check?type=${type}&key=${encodeURIComponent(key)}`, {
                credentials: 'include'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to check modal display permission:', error);
            // 出错时默认允许显示，但记录错误
            return {
                shouldDisplay: true,
                reason: 'error_fallback',
                displayCount: 0,
                maxCount: this.config.maxDisplayCount
            };
        }
    }

    /**
     * 显示弹窗
     */
    async showModal(type, key, options = {}) {
        const modalKey = `${type}_${key}`;
        
        // 检查是否已经显示
        if (this.activeModals.has(modalKey)) {
            console.log(`Modal ${modalKey} is already active`);
            return false;
        }

        // 检查显示权限
        const permission = await this.checkDisplayPermission(type, key);
        if (!permission.shouldDisplay) {
            console.log(`Modal ${modalKey} blocked:`, permission.reason);
            return false;
        }

        // 创建弹窗配置
        const modalConfig = {
            type,
            key,
            modalKey,
            element: null,
            displayedAt: new Date(),
            autoCloseTimer: null,
            ...options
        };

        try {
            // 记录显示到服务器
            await this.recordDisplay(type, key, options.notificationId);

            // 显示弹窗
            const success = this.displayModal(modalConfig);
            if (success) {
                this.activeModals.set(modalKey, modalConfig);
                this.updateLocalHistory(modalKey, 'displayed');
                
                // 设置自动关闭（如果启用）
                if (this.config.enableAutoClose && options.autoClose !== false) {
                    this.setAutoClose(modalKey, options.autoCloseDelay || this.config.autoCloseDelay);
                }
                
                console.log(`Modal ${modalKey} displayed successfully`);
                return true;
            }
        } catch (error) {
            console.error(`Failed to show modal ${modalKey}:`, error);
        }

        return false;
    }

    /**
     * 实际显示弹窗DOM元素
     */
    displayModal(config) {
        const { type, key, modalKey } = config;
        
        // 根据类型显示不同的弹窗
        switch (type) {
            case 'checkin':
                return this.showCheckinModal(key, config);
            case 'gift':
                return this.showGiftModal(key, config);
            case 'pending':
                return this.showPendingModal(key, config);
            case 'system':
                return this.showSystemModal(key, config);
            default:
                console.error(`Unknown modal type: ${type}`);
                return false;
        }
    }

    /**
     * 显示签到成功弹窗
     */
    showCheckinModal(code, config) {
        const modal = document.getElementById('codeModal');
        if (!modal) {
            console.error('Checkin modal element not found');
            return false;
        }

        const codeInput = document.getElementById('modalCodeInput');
        const amountSpan = document.getElementById('modalCodeAmount');
        
        if (codeInput) codeInput.value = code;
        if (amountSpan) amountSpan.textContent = config.amount || '-';
        
        modal.classList.add('active');
        config.element = modal;
        
        // 绑定关闭事件
        this.bindModalCloseEvents(modal, config);
        
        return true;
    }

    /**
     * 显示系统赠送弹窗
     */
    showGiftModal(code, config) {
        const modal = document.getElementById('giftModal');
        if (!modal) {
            console.error('Gift modal element not found');
            return false;
        }

        const codeInput = document.getElementById('giftCodeInput');
        const amountSpan = document.getElementById('giftAmount');
        const messageSpan = modal.querySelector('.gift-subtitle');
        
        if (codeInput) codeInput.value = code;
        if (amountSpan) amountSpan.textContent = config.amount || 10;
        if (messageSpan) messageSpan.textContent = config.message || '恭喜您获得兑换码奖励！';
        
        modal.classList.add('active');
        config.element = modal;
        
        // 绑定关闭事件
        this.bindModalCloseEvents(modal, config);
        
        return true;
    }

    /**
     * 显示待分配弹窗
     */
    showPendingModal(key, config) {
        const modal = document.getElementById('pendingModal');
        if (!modal) {
            console.error('Pending modal element not found');
            return false;
        }

        modal.classList.add('active');
        config.element = modal;
        
        // 绑定关闭事件
        this.bindModalCloseEvents(modal, config);
        
        return true;
    }

    /**
     * 显示系统通知弹窗
     */
    showSystemModal(key, config) {
        // 创建动态系统通知弹窗
        const modal = this.createSystemModal(config);
        document.body.appendChild(modal);
        
        setTimeout(() => modal.classList.add('active'), 100);
        config.element = modal;
        
        // 绑定关闭事件
        this.bindModalCloseEvents(modal, config);
        
        return true;
    }

    /**
     * 创建系统通知弹窗
     */
    createSystemModal(config) {
        const modal = document.createElement('div');
        modal.className = 'modal system-modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${config.title || '系统通知'}</h3>
                </div>
                <div class="modal-body">
                    <p>${config.message || ''}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary modal-close-btn">确定</button>
                </div>
            </div>
        `;
        
        return modal;
    }

    /**
     * 绑定弹窗关闭事件
     */
    bindModalCloseEvents(modal, config) {
        const { modalKey } = config;
        
        // 点击背景关闭
        const backdrop = modal.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                this.closeModal(modalKey, 'backdrop_click');
            });
        }

        // 点击关闭按钮
        const closeButtons = modal.querySelectorAll('.modal-close-btn, [onclick*="close"]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModal(modalKey, 'close_button');
            });
        });

        // 复制按钮（自动关闭）
        const copyButtons = modal.querySelectorAll('[onclick*="copy"]');
        copyButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // 延迟关闭，让复制操作完成
                setTimeout(() => {
                    this.closeModal(modalKey, 'copy_action');
                }, 500);
            });
        });
    }

    /**
     * 关闭弹窗
     */
    async closeModal(modalKey, reason = 'user_action') {
        const config = this.activeModals.get(modalKey);
        if (!config) {
            console.log(`Modal ${modalKey} not found in active modals`);
            return;
        }

        try {
            // 隐藏弹窗元素
            if (config.element) {
                config.element.classList.remove('active');
                
                // 如果是动态创建的弹窗，延迟删除
                if (config.type === 'system') {
                    setTimeout(() => {
                        if (config.element.parentNode) {
                            config.element.parentNode.removeChild(config.element);
                        }
                    }, 300);
                }
            }

            // 清除自动关闭定时器
            if (config.autoCloseTimer) {
                clearTimeout(config.autoCloseTimer);
            }

            // 记录关闭到服务器
            await this.recordDismiss(config.type, config.key, reason);

            // 更新本地状态
            this.updateLocalHistory(modalKey, 'dismissed', reason);

            // 从活跃列表中移除
            this.activeModals.delete(modalKey);

            console.log(`Modal ${modalKey} closed (reason: ${reason})`);
        } catch (error) {
            console.error(`Failed to close modal ${modalKey}:`, error);
        }
    }

    /**
     * 关闭所有弹窗
     */
    closeAllModals() {
        const activeKeys = Array.from(this.activeModals.keys());
        activeKeys.forEach(modalKey => {
            this.closeModal(modalKey, 'escape_key');
        });
    }

    /**
     * 设置自动关闭
     */
    setAutoClose(modalKey, delay) {
        const config = this.activeModals.get(modalKey);
        if (!config) return;

        config.autoCloseTimer = setTimeout(() => {
            this.closeModal(modalKey, 'auto_close');
        }, delay);
    }

    /**
     * 记录弹窗显示到服务器
     */
    async recordDisplay(type, key, notificationId = null) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/modal/display`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    key,
                    notification_id: notificationId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to record modal display:', error);
            throw error;
        }
    }

    /**
     * 记录弹窗关闭到服务器
     */
    async recordDismiss(type, key, reason) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/modal/dismiss`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    key,
                    reason
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Failed to record modal dismiss:', error);
            // 不抛出错误，避免影响用户体验
        }
    }

    /**
     * 更新本地历史记录
     */
    updateLocalHistory(modalKey, action, reason = null) {
        const history = this.modalHistory.get(modalKey) || {
            displayCount: 0,
            isDismissed: false,
            lastAction: null,
            lastActionAt: null
        };

        if (action === 'displayed') {
            history.displayCount++;
        } else if (action === 'dismissed') {
            history.isDismissed = true;
            history.dismissReason = reason;
        }

        history.lastAction = action;
        history.lastActionAt = new Date().toISOString();

        this.modalHistory.set(modalKey, history);
    }

    /**
     * 保存状态到localStorage
     */
    saveState() {
        try {
            const state = {
                modalHistory: Object.fromEntries(this.modalHistory),
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('modalManager_state', JSON.stringify(state));
        } catch (error) {
            console.error('Failed to save modal manager state:', error);
        }
    }

    /**
     * 从localStorage恢复状态
     */
    restoreState() {
        try {
            const saved = localStorage.getItem('modalManager_state');
            if (saved) {
                const state = JSON.parse(saved);
                
                // 检查状态是否过期（24小时）
                const savedTime = new Date(state.timestamp);
                const now = new Date();
                const hoursDiff = (now - savedTime) / (1000 * 60 * 60);
                
                if (hoursDiff < 24) {
                    this.modalHistory = new Map(Object.entries(state.modalHistory));
                    console.log('Modal manager state restored from localStorage');
                } else {
                    console.log('Modal manager state expired, starting fresh');
                    localStorage.removeItem('modalManager_state');
                }
            }
        } catch (error) {
            console.error('Failed to restore modal manager state:', error);
        }
    }

    /**
     * 清除所有状态
     */
    clearState() {
        this.modalHistory.clear();
        this.activeModals.clear();
        localStorage.removeItem('modalManager_state');
        console.log('Modal manager state cleared');
    }

    /**
     * 获取弹窗统计信息
     */
    getStats() {
        return {
            activeModals: this.activeModals.size,
            historyEntries: this.modalHistory.size,
            totalDisplays: Array.from(this.modalHistory.values())
                .reduce((sum, history) => sum + history.displayCount, 0)
        };
    }
}

// 导出单例实例
const modalManager = new ModalManager(window.location.origin);

// 全局访问
window.modalManager = modalManager;

// 兼容性函数（保持向后兼容）
window.showCodeModal = (code, amount) => {
    modalManager.showModal('checkin', code, { amount });
};

window.showGiftModal = (code, amount, message) => {
    modalManager.showModal('gift', code, { amount, message });
};

window.closeModal = () => {
    modalManager.closeAllModals();
};

export default modalManager;
