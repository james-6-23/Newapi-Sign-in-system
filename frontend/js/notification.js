/**
 * 通知弹窗组件
 * 用于显示系统赠送的兑换码通知
 */

class NotificationPopup {
    constructor() {
        this.container = null;
        this.currentNotification = null;
        this.init();
    }

    init() {
        // 创建弹窗容器
        this.createContainer();
        
        // 页面加载时检查通知
        this.checkNotifications();
        
        // 每30秒检查一次新通知
        setInterval(() => this.checkNotifications(), 30000);
    }

    createContainer() {
        // 创建样式
        const style = document.createElement('style');
        style.textContent = `
            .notification-popup {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.9);
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                padding: 2rem;
                max-width: 450px;
                width: 90%;
                z-index: 10000;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
            }
            
            .notification-popup.show {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
            }
            
            .notification-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                z-index: 9999;
                opacity: 0;
                transition: opacity 0.3s;
                pointer-events: none;
            }
            
            .notification-overlay.show {
                opacity: 1;
                pointer-events: auto;
            }
            
            .notification-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1.5rem;
            }
            
            .notification-title {
                font-size: 1.5rem;
                font-weight: bold;
                color: #333;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .notification-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                color: #999;
                cursor: pointer;
                padding: 0;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 50%;
                transition: all 0.2s;
            }
            
            .notification-close:hover {
                background: #f5f5f5;
                color: #333;
            }
            
            .notification-body {
                margin-bottom: 1.5rem;
            }
            
            .notification-message {
                font-size: 1.1rem;
                color: #666;
                margin-bottom: 1rem;
                line-height: 1.5;
            }
            
            .notification-code-container {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 8px;
                padding: 1.5rem;
                text-align: center;
                position: relative;
                overflow: hidden;
            }
            
            .notification-code-container::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: linear-gradient(
                    45deg,
                    transparent,
                    rgba(255, 255, 255, 0.1),
                    transparent
                );
                animation: shimmer 2s infinite;
            }
            
            @keyframes shimmer {
                0% { transform: translateX(-100%) translateY(-100%) rotate(45deg); }
                100% { transform: translateX(100%) translateY(100%) rotate(45deg); }
            }
            
            .notification-code-label {
                color: rgba(255, 255, 255, 0.9);
                font-size: 0.875rem;
                margin-bottom: 0.5rem;
            }
            
            .notification-code {
                font-family: 'Courier New', monospace;
                font-size: 1.5rem;
                font-weight: bold;
                color: white;
                letter-spacing: 2px;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                position: relative;
                z-index: 1;
            }
            
            .notification-amount {
                background: #fbbf24;
                color: #78350f;
                padding: 0.25rem 0.75rem;
                border-radius: 20px;
                font-weight: bold;
                display: inline-block;
                margin-top: 1rem;
                font-size: 1.1rem;
            }
            
            .notification-actions {
                display: flex;
                gap: 1rem;
            }
            
            .notification-btn {
                flex: 1;
                padding: 0.75rem 1.5rem;
                border: none;
                border-radius: 8px;
                font-size: 1rem;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .notification-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            
            .notification-btn-primary:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
            }
            
            .notification-btn-secondary {
                background: #f3f4f6;
                color: #4b5563;
            }
            
            .notification-btn-secondary:hover {
                background: #e5e7eb;
            }
            
            .notification-success-message {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-100px);
                background: #10b981;
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                font-weight: 500;
                z-index: 10001;
                transition: transform 0.3s;
            }
            
            .notification-success-message.show {
                transform: translateX(-50%) translateY(0);
            }
            
            .gift-icon {
                font-size: 2rem;
            }
            
            .confetti {
                position: absolute;
                width: 10px;
                height: 10px;
                background: #fbbf24;
                animation: confetti-fall 3s linear;
            }
            
            @keyframes confetti-fall {
                0% {
                    transform: translateY(-100vh) rotate(0deg);
                    opacity: 1;
                }
                100% {
                    transform: translateY(100vh) rotate(720deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);

        // 创建HTML结构
        const overlay = document.createElement('div');
        overlay.className = 'notification-overlay';
        overlay.id = 'notificationOverlay';
        document.body.appendChild(overlay);

        const popup = document.createElement('div');
        popup.className = 'notification-popup';
        popup.id = 'notificationPopup';
        popup.innerHTML = `
            <div class="notification-header">
                <div class="notification-title">
                    <span class="gift-icon">🎁</span>
                    <span id="notificationTitle">系统赠送</span>
                </div>
                <button class="notification-close" id="notificationClose">✕</button>
            </div>
            <div class="notification-body">
                <div class="notification-message" id="notificationMessage">
                    恭喜您获得兑换码！
                </div>
                <div class="notification-code-container">
                    <div class="notification-code-label">兑换码</div>
                    <div class="notification-code" id="notificationCode">-</div>
                    <div class="notification-amount" id="notificationAmount">-</div>
                </div>
            </div>
            <div class="notification-actions">
                <button class="notification-btn notification-btn-primary" id="copyCodeBtn">
                    复制兑换码
                </button>
                <button class="notification-btn notification-btn-secondary" id="viewCodesBtn">
                    查看我的兑换码
                </button>
            </div>
        `;
        document.body.appendChild(popup);

        // 创建成功提示
        const successMessage = document.createElement('div');
        successMessage.className = 'notification-success-message';
        successMessage.id = 'successMessage';
        successMessage.textContent = '兑换码已复制到剪贴板！';
        document.body.appendChild(successMessage);

        this.container = popup;
        this.bindEvents();
    }

    bindEvents() {
        // 关闭按钮
        document.getElementById('notificationClose').addEventListener('click', () => {
            this.close();
        });

        // 点击遮罩关闭
        document.getElementById('notificationOverlay').addEventListener('click', () => {
            this.close();
        });

        // 复制兑换码
        document.getElementById('copyCodeBtn').addEventListener('click', () => {
            this.copyCode();
        });

        // 查看兑换码
        document.getElementById('viewCodesBtn').addEventListener('click', () => {
            window.location.href = 'codes.html';
        });
    }

    async checkNotifications() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/notifications?unread_only=true`, {
                credentials: 'include'
            });

            if (!response.ok) return;

            const data = await response.json();
            const notifications = data.notifications || [];

            // 找到第一个未关闭的赠送通知
            const giftNotification = notifications.find(n => 
                n.type === 'gift' && !n.is_dismissed
            );

            if (giftNotification) {
                this.show(giftNotification);
            }
        } catch (error) {
            console.error('检查通知失败:', error);
        }
    }

    show(notification) {
        this.currentNotification = notification;

        // 更新内容
        document.getElementById('notificationTitle').textContent = notification.title || '系统赠送';
        document.getElementById('notificationMessage').textContent = notification.message || '恭喜您获得兑换码！';
        document.getElementById('notificationCode').textContent = notification.redemption_code || '-';
        
        if (notification.amount) {
            document.getElementById('notificationAmount').textContent = `¥${notification.amount}`;
            document.getElementById('notificationAmount').style.display = 'inline-block';
        } else {
            document.getElementById('notificationAmount').style.display = 'none';
        }

        // 显示弹窗
        document.getElementById('notificationOverlay').classList.add('show');
        this.container.classList.add('show');

        // 添加彩带效果
        this.createConfetti();

        // 标记为已读
        this.markAsRead(notification.id);
    }

    close() {
        document.getElementById('notificationOverlay').classList.remove('show');
        this.container.classList.remove('show');

        // 标记为已关闭
        if (this.currentNotification) {
            this.dismiss(this.currentNotification.id);
        }
    }

    async copyCode() {
        if (!this.currentNotification || !this.currentNotification.redemption_code) return;

        try {
            await navigator.clipboard.writeText(this.currentNotification.redemption_code);
            
            // 显示成功提示
            const successMsg = document.getElementById('successMessage');
            successMsg.classList.add('show');
            
            setTimeout(() => {
                successMsg.classList.remove('show');
            }, 3000);
        } catch (error) {
            console.error('复制失败:', error);
            alert('复制失败，请手动复制兑换码');
        }
    }

    async markAsRead(notificationId) {
        try {
            await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('标记已读失败:', error);
        }
    }

    async dismiss(notificationId) {
        try {
            await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/dismiss`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            console.error('关闭通知失败:', error);
        }
    }

    createConfetti() {
        const colors = ['#fbbf24', '#f87171', '#60a5fa', '#34d399', '#a78bfa'];
        
        for (let i = 0; i < 30; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.animationDelay = Math.random() * 0.5 + 's';
                confetti.style.animationDuration = (Math.random() * 2 + 2) + 's';
                document.body.appendChild(confetti);

                setTimeout(() => {
                    confetti.remove();
                }, 4000);
            }, i * 50);
        }
    }
}

// 初始化通知弹窗
let notificationPopup = null;

document.addEventListener('DOMContentLoaded', () => {
    // 只在已登录的页面初始化
    if (typeof checkAuth === 'function') {
        checkAuth().then(user => {
            if (user) {
                notificationPopup = new NotificationPopup();
            }
        });
    }
});

// 导出给其他模块使用
window.NotificationPopup = NotificationPopup;