/**
 * KYX 签到系统 - 主应用逻辑
 */

// ============================================
// 全局状态
// ============================================

const AppState = {
    user: null,
    hasCheckedIn: false,
    checkinStats: {
        total: 0,
        consecutive: 0,
        codes: 0,
        amount: 0
    },
    recentCodes: [],
    loading: false
};

// ============================================
// 初始化
// ============================================

/**
 * 检查系统通知
 */
async function checkNotifications() {
    try {
        const data = await utils.get('/api/notifications?unread_only=true');
        
        if (data.success && data.notifications && data.notifications.length > 0) {
            // 处理系统赠送通知
            const giftNotifications = data.notifications.filter(n =>
                n.type === 'gift' && !n.is_dismissed
            );
            
            if (giftNotifications.length > 0) {
                const latest = giftNotifications[0];
                showGiftModal(latest.redemption_code, latest.amount, latest.message);
                
                // 标记为已读
                await utils.post(`/api/notifications/${latest.id}/dismiss`);
            }
            
            // 处理补发通知
            const pendingResolvedNotifications = data.notifications.filter(n =>
                n.type === 'pending_resolved' && !n.is_dismissed
            );
            
            if (pendingResolvedNotifications.length > 0) {
                const latest = pendingResolvedNotifications[0];
                utils.showToast('您的待分配兑换码已补发！', 'success');
                
                // 标记为已读
                await utils.post(`/api/notifications/${latest.id}/dismiss`);
                
                // 刷新兑换码列表
                await loadRecentCodes();
            }
        }
    } catch (error) {
        console.error('Check notifications error:', error);
    }
}

/**
 * 应用初始化
 */
async function initApp() {
    try {
        console.log('Initializing app...');
        
        // 设置主题
        const theme = utils.getCurrentTheme();
        utils.setTheme(theme);
        
        // 检查登录状态
        console.log('Checking authentication...');
        const user = await utils.checkAuth();
        
        if (!user) {
            console.warn('No user found, redirecting to login...');
            // 延迟一下重定向，让用户看到可能的错误信息
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
            return;
        }
        
        console.log('User authenticated:', user);
        AppState.user = user;
        
        // 更新UI
        updateUserInfo(user);
        
        // 加载数据
        console.log('Loading user data...');
        await Promise.all([
            loadCheckinStatus(),
            loadCheckinStats(),
            loadRecentCodes()
        ]);
        
        // 检查系统通知
        await checkNotifications();
        
        // 绑定事件
        bindEvents();
        
        // 定期检查通知
        setInterval(checkNotifications, 30000); // 每30秒检查一次
        
        console.log('App initialization completed');
        
    } catch (error) {
        console.error('App init error:', error);
        utils.showToast('初始化失败，请刷新页面重试', 'error');
        
        // 如果是认证相关的错误，延迟后重定向到登录页
        if (error.message && error.message.includes('401')) {
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    }
}

// ============================================
// UI更新
// ============================================

/**
 * 更新用户信息显示
 */
function updateUserInfo(user) {
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) {
        userName.textContent = user.username || '用户';
    }
    
    if (userAvatar && user.avatar_url) {
        userAvatar.innerHTML = `<img src="${user.avatar_url}" alt="${user.username}">`;
    }
}

/**
 * 更新签到状态
 */
function updateCheckinStatus(hasCheckedIn, redemptionCode = null, status = 'completed') {
    const checkinBtn = document.getElementById('checkinBtn');
    const checkinBtnText = document.getElementById('checkinBtnText');
    const checkinSubtitle = document.getElementById('checkinSubtitle');
    
    AppState.hasCheckedIn = hasCheckedIn;
    
    if (hasCheckedIn) {
        checkinBtn.classList.add('checked');
        checkinBtn.disabled = true;
        checkinBtnText.textContent = '今日已签到';
        
        if (redemptionCode) {
            checkinSubtitle.textContent = `今日兑换码：${redemptionCode}`;
        } else if (status === 'pending_distribution') {
            checkinSubtitle.textContent = '兑换码待管理员分配';
        } else {
            checkinSubtitle.textContent = '今日已完成签到，明天再来吧！';
        }
    } else {
        checkinBtn.classList.remove('checked');
        checkinBtn.disabled = false;
        checkinBtnText.textContent = '立即签到';
        checkinSubtitle.textContent = '今日还未签到，点击下方按钮完成签到';
    }
}

/**
 * 更新统计信息
 */
function updateStats(stats) {
    document.getElementById('totalCheckins').textContent = stats.total || 0;
    document.getElementById('consecutiveDays').textContent = stats.consecutive || 0;
    document.getElementById('totalCodes').textContent = stats.codes || 0;
    document.getElementById('totalAmount').textContent = stats.amount || 0;
}

/**
 * 更新兑换码列表
 */
function updateCodesList(codes) {
    const codesList = document.getElementById('codesList');
    
    if (!codes || codes.length === 0) {
        codesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>暂无兑换码</p>
                <p class="text-sm text-secondary">完成签到后即可获得兑换码</p>
            </div>
        `;
        return;
    }
    
    codesList.innerHTML = codes.map(code => {
        // 处理待发放状态
        if (code.status === 'pending_distribution') {
            return `
                <div class="code-item pending" data-status="pending">
                    <div class="code-info">
                        <span class="code-text text-warning">等待管理员发放</span>
                        <span class="code-date">${utils.formatDate(code.check_in_date)}</span>
                    </div>
                    <button class="copy-btn" disabled>
                        <span>⏳</span>
                    </button>
                </div>
            `;
        }
        
        return `
            <div class="code-item" data-code="${code.redemption_code}">
                <div class="code-info">
                    <span class="code-text">${code.redemption_code}</span>
                    ${code.amount ? `<span class="code-amount">¥${code.amount}</span>` : ''}
                    <span class="code-date">${utils.formatDate(code.check_in_date)}</span>
                </div>
                <button class="copy-btn" onclick="copyCode('${code.redemption_code}', this)">
                    <span>📋</span>
                </button>
            </div>
        `;
    }).join('');
}

// ============================================
// 数据加载
// ============================================

/**
 * 加载签到状态
 */
async function loadCheckinStatus() {
    try {
        // 获取今日签到记录
        const today = new Date().toISOString().split('T')[0];
        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 1
        });
        
        if (data.success && data.records && data.records.length > 0) {
            const todayRecord = data.records.find(r => 
                r.check_in_date === today
            );
            
            if (todayRecord) {
                updateCheckinStatus(true, todayRecord.redemption_code, todayRecord.status);
            } else {
                updateCheckinStatus(false);
            }
        } else {
            updateCheckinStatus(false);
        }
    } catch (error) {
        console.error('Load checkin status error:', error);
    }
}

/**
 * 加载签到统计
 */
async function loadCheckinStats() {
    try {
        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 100
        });
        
        if (data.success && data.records) {
            const stats = calculateStats(data.records);
            AppState.checkinStats = stats;
            updateStats(stats);
        }
    } catch (error) {
        console.error('Load checkin stats error:', error);
    }
}

/**
 * 加载最近的兑换码
 */
async function loadRecentCodes() {
    try {
        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 5
        });
        
        if (data.success && data.records) {
            // 包含待发放的记录
            AppState.recentCodes = data.records;
            updateCodesList(AppState.recentCodes);
        }
    } catch (error) {
        console.error('Load recent codes error:', error);
    }
}

/**
 * 计算统计数据
 */
function calculateStats(records) {
    const stats = {
        total: records.length,
        consecutive: 0,
        codes: 0,
        amount: 0
    };
    
    // 计算连续签到天数
    const sortedDates = records
        .map(r => new Date(r.check_in_date))
        .sort((a, b) => b - a);
    
    if (sortedDates.length > 0) {
        let consecutive = 1;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 检查今天是否签到
        const lastCheckin = new Date(sortedDates[0]);
        lastCheckin.setHours(0, 0, 0, 0);
        
        const dayDiff = Math.floor((today - lastCheckin) / (1000 * 60 * 60 * 24));
        
        if (dayDiff <= 1) {
            for (let i = 1; i < sortedDates.length; i++) {
                const current = new Date(sortedDates[i]);
                const prev = new Date(sortedDates[i - 1]);
                current.setHours(0, 0, 0, 0);
                prev.setHours(0, 0, 0, 0);
                
                const diff = Math.floor((prev - current) / (1000 * 60 * 60 * 24));
                
                if (diff === 1) {
                    consecutive++;
                } else {
                    break;
                }
            }
        }
        
        stats.consecutive = consecutive;
    }
    
    // 计算兑换码数量和金额（不包括待发放的）
    records.forEach(record => {
        if (record.redemption_code && record.status !== 'pending_distribution') {
            stats.codes++;
            stats.amount += record.amount || 0;
        }
    });
    
    return stats;
}

// ============================================
// 签到功能
// ============================================

/**
 * 执行签到
 */
async function doCheckin() {
    if (AppState.loading || AppState.hasCheckedIn) {
        return;
    }
    
    const checkinBtn = document.getElementById('checkinBtn');
    const checkinBtnText = document.getElementById('checkinBtnText');
    
    AppState.loading = true;
    checkinBtn.disabled = true;
    checkinBtnText.textContent = '签到中...';
    
    try {
        const data = await utils.post(CONFIG.API_ENDPOINTS.CHECKIN.DO_CHECKIN);
        
        if (data.success) {
            // 签到成功
            updateCheckinStatus(true, data.redemptionCode, data.status);
            
            if (data.redemptionCode) {
                // 显示兑换码弹窗
                showCodeModal(data.redemptionCode, data.amount);
                utils.showToast('签到成功！获得兑换码', 'success');
            } else if (data.status === 'pending_distribution') {
                // 库存不足，待分配
                utils.showToast('签到成功！兑换码待管理员分配', 'warning');
                showPendingModal();
            } else {
                utils.showToast('签到成功！', 'success');
            }
            
            // 重新加载数据
            await Promise.all([
                loadCheckinStats(),
                loadRecentCodes()
            ]);
        } else {
            if (data.hasCheckedIn) {
                updateCheckinStatus(true, data.redemptionCode);
                utils.showToast('今日已签到', 'info');
            } else {
                utils.showToast(data.message || '签到失败', 'error');
            }
        }
    } catch (error) {
        console.error('Checkin error:', error);
        utils.showToast('签到失败，请稍后重试', 'error');
        checkinBtn.disabled = false;
        checkinBtnText.textContent = '立即签到';
    } finally {
        AppState.loading = false;
    }
}

/**
 * 显示兑换码弹窗
 */
function showCodeModal(code, amount) {
    const modal = document.getElementById('codeModal');
    const modalCodeInput = document.getElementById('modalCodeInput');
    const modalTitle = modal.querySelector('.modal-title');
    const modalSubtitle = modal.querySelector('.modal-subtitle');
    
    modalCodeInput.value = code;
    modalTitle.textContent = '签到成功！';
    modalSubtitle.textContent = amount ? `获得 ¥${amount} 兑换码` : '获得兑换码';
    modal.classList.add('active');
}

/**
 * 显示待分配弹窗
 */
function showPendingModal() {
    const modal = document.getElementById('pendingModal');
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * 显示系统赠送弹窗
 */
function showGiftModal(code, amount, message) {
    const modal = document.getElementById('giftModal');
    if (!modal) {
        // 创建系统赠送弹窗
        const modalHtml = `
            <div class="modal" id="giftModal">
                <div class="modal-backdrop" onclick="closeGiftModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">🎁 系统赠送</h3>
                        <button class="modal-close" onclick="closeGiftModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p class="modal-subtitle">${message || `恭喜您获得 ¥${amount} 兑换码！`}</p>
                        <div class="code-display">
                            <input type="text" id="giftCodeInput" readonly value="${code}">
                            <button class="btn btn-primary" onclick="copyGiftCode()">
                                <span>📋</span> 复制
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeGiftModal()">关闭</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } else {
        // 更新现有弹窗内容
        const giftCodeInput = document.getElementById('giftCodeInput');
        const subtitle = modal.querySelector('.modal-subtitle');
        giftCodeInput.value = code;
        subtitle.textContent = message || `恭喜您获得 ¥${amount} 兑换码！`;
    }
    
    document.getElementById('giftModal').classList.add('active');
}

/**
 * 关闭系统赠送弹窗
 */
function closeGiftModal() {
    const modal = document.getElementById('giftModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 复制系统赠送的兑换码
 */
async function copyGiftCode() {
    const giftCodeInput = document.getElementById('giftCodeInput');
    const success = await utils.copyToClipboard(giftCodeInput.value);
    
    if (success) {
        utils.showToast('兑换码已复制', 'success');
    } else {
        utils.showToast('复制失败，请手动复制', 'error');
    }
}

/**
 * 关闭弹窗
 */
function closeModal() {
    const modal = document.getElementById('codeModal');
    modal.classList.remove('active');
}

/**
 * 复制弹窗中的兑换码
 */
async function copyModalCode() {
    const modalCodeInput = document.getElementById('modalCodeInput');
    const success = await utils.copyToClipboard(modalCodeInput.value);
    
    if (success) {
        utils.showToast('兑换码已复制', 'success');
    } else {
        utils.showToast('复制失败，请手动复制', 'error');
    }
}

/**
 * 复制兑换码
 */
async function copyCode(code, button) {
    const success = await utils.copyToClipboard(code);
    
    if (success) {
        button.classList.add('copied');
        button.innerHTML = '<span>✅</span>';
        utils.showToast('兑换码已复制', 'success');
        
        setTimeout(() => {
            button.classList.remove('copied');
            button.innerHTML = '<span>📋</span>';
        }, 2000);
    } else {
        utils.showToast('复制失败，请手动复制', 'error');
    }
}

// ============================================
// 事件绑定
// ============================================

/**
 * 绑定事件
 */
function bindEvents() {
    // 签到按钮
    const checkinBtn = document.getElementById('checkinBtn');
    if (checkinBtn) {
        checkinBtn.addEventListener('click', doCheckin);
    }
    
    // 主题切换
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const newTheme = utils.toggleTheme();
            utils.showToast(`已切换到${newTheme === 'dark' ? '深色' : '浅色'}模式`, 'success');
        });
    }
    
    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm('确定要退出登录吗？')) {
                await utils.logout();
            }
        });
    }
    
    // 查看全部兑换码
    const viewAllBtn = document.getElementById('viewAllBtn');
    if (viewAllBtn) {
        viewAllBtn.addEventListener('click', () => {
            window.location.href = 'codes.html';
        });
    }
    
    // 用户菜单
    const userMenu = document.getElementById('userMenu');
    if (userMenu) {
        userMenu.addEventListener('click', () => {
            // 可以添加下拉菜单功能
            if (AppState.user && AppState.user.is_admin) {
                window.location.href = 'admin.html';
            }
        });
    }
}

// ============================================
// 页面加载
// ============================================

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 页面可见性变化时刷新数据
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && AppState.user) {
        loadCheckinStatus();
    }
});

// 导出全局函数
window.copyCode = copyCode;
window.closeModal = closeModal;
window.copyModalCode = copyModalCode;
window.closeGiftModal = closeGiftModal;
window.copyGiftCode = copyGiftCode;