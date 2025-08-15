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
    loading: false,
    showingAllCodes: false,
    processedNotifications: new Set() // 防止重复处理通知
};

// ============================================
// 通知状态持久化管理
// ============================================

/**
 * 从localStorage加载已处理的通知ID
 */
function loadProcessedNotifications() {
    try {
        const stored = localStorage.getItem('processedNotifications');
        if (stored) {
            const notificationIds = JSON.parse(stored);
            AppState.processedNotifications = new Set(notificationIds);
            console.log('已加载处理过的通知:', notificationIds);
        }
    } catch (error) {
        console.error('加载通知状态失败:', error);
        AppState.processedNotifications = new Set();
    }
}

/**
 * 保存已处理的通知ID到localStorage
 */
function saveProcessedNotifications() {
    try {
        const notificationIds = Array.from(AppState.processedNotifications);
        localStorage.setItem('processedNotifications', JSON.stringify(notificationIds));
        console.log('已保存处理过的通知:', notificationIds);
    } catch (error) {
        console.error('保存通知状态失败:', error);
    }
}

/**
 * 清理过期的通知记录
 */
function cleanupOldNotifications() {
    try {
        const stored = localStorage.getItem('processedNotifications');
        if (stored) {
            const notificationData = JSON.parse(stored);
            const now = Date.now();
            const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
            
            // 如果是数组格式，直接保留（新格式）
            if (Array.isArray(notificationData)) {
                return;
            }
            
            // 如果是对象格式，清理过期的（旧格式）
            const cleaned = {};
            Object.keys(notificationData).forEach(id => {
                const timestamp = notificationData[id];
                if (timestamp > sevenDaysAgo) {
                    cleaned[id] = timestamp;
                }
            });
            localStorage.setItem('processedNotifications', JSON.stringify(Object.keys(cleaned)));
        }
    } catch (error) {
        console.error('清理过期通知记录失败:', error);
    }
}

// ============================================
// 初始化
// ============================================

/**
 * 检查系统通知
 */
async function checkNotifications() {
    try {
        console.log('开始检查系统通知...');
        const data = await utils.get('/api/notifications?unread_only=true');
        console.log('通知API响应:', data);

        if (data.success && data.notifications && data.notifications.length > 0) {
            console.log('收到通知:', data.notifications);

            // 处理系统赠送通知 - 按创建时间排序，确保处理最新的
            const giftNotifications = data.notifications
                .filter(n => n.type === 'gift' && !n.is_dismissed && !AppState.processedNotifications.has(String(n.id)))
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            
            console.log('筛选后的赠送通知:', giftNotifications);

            if (giftNotifications.length > 0) {
                const latest = giftNotifications[0];
                console.log('处理赠送通知:', latest);

                // 验证通知数据完整性
                if (!latest.redemption_code) {
                    console.error('通知缺少兑换码:', latest);
                    return;
                }

                // 立即标记为已处理，防止重复显示
                AppState.processedNotifications.add(String(latest.id));
                saveProcessedNotifications(); // 持久化保存

                // 先标记为已读，再显示弹窗
                try {
                    const dismissResult = await utils.post(`/api/notifications/${latest.id}/dismiss`);
                    console.log('通知dismiss结果:', dismissResult);
                } catch (dismissError) {
                    console.error('标记通知已读失败:', dismissError);
                }

                // 显示弹窗
                showGiftModal(latest.redemption_code, latest.amount, latest.message);

                // 延迟刷新数据，确保弹窗显示后再更新
                setTimeout(async () => {
                    try {
                        await Promise.all([
                            loadRecentCodes(),
                            loadCheckinStats()
                        ]);
                        console.log('数据刷新完成');
                    } catch (refreshError) {
                        console.error('数据刷新失败:', refreshError);
                    }
                }, 1000);
            }

            // 处理补发通知 - 按创建时间排序
            const pendingResolvedNotifications = data.notifications
                .filter(n => n.type === 'pending_resolved' && !n.is_dismissed && !AppState.processedNotifications.has(String(n.id)))
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

            if (pendingResolvedNotifications.length > 0) {
                for (const notification of pendingResolvedNotifications) {
                    AppState.processedNotifications.add(String(notification.id));
                    saveProcessedNotifications(); // 持久化保存

                    utils.showToast(notification.message || '您的待分配兑换码已处理完成', 'success');

                    try {
                        // 标记为已读
                        await utils.post(`/api/notifications/${notification.id}/dismiss`);
                    } catch (dismissError) {
                        console.error('标记通知已读失败:', dismissError);
                    }
                }

                // 刷新兑换码列表和统计
                setTimeout(async () => {
                    await Promise.all([
                        loadRecentCodes(),
                        loadCheckinStats()
                    ]);
                }, 500);
            }
        } else {
            console.log('没有新通知');
        }
    } catch (error) {
        console.error('检查通知失败:', error);
    }
}

/**
 * 初始化应用
 */
async function initApp() {
    try {
        console.log('开始初始化应用...');
        
        // 加载已处理的通知状态
        loadProcessedNotifications();
        
        // 检查用户认证（调试模式下允许失败）
        const user = await utils.checkAuth();
        if (!user) {
            console.log('用户未认证，但继续加载页面以便调试前端样式');
            // 设置一个模拟用户用于调试
            AppState.user = {
                id: 1,
                username: '调试用户',
                email: 'debug@example.com',
                is_admin: false
            };
        } else {
            AppState.user = user;
        }
        
        updateUserInfo(AppState.user);
        
        // 绑定事件
        bindEvents();
        
        // 尝试加载数据（调试模式下允许失败）
        try {
            await Promise.all([
                loadCheckinStatus(),
                loadCheckinStats(),
                loadRecentCodes()
            ]);
        } catch (dataError) {
            console.log('数据加载失败，但继续初始化以便调试:', dataError);
            // 设置一些模拟数据用于调试
            updateCheckinStatus(false);
            updateStats({ total: 0, consecutive: 0, codes: 0, amount: 0 });
            updateCodesList([]);
        }
        
        // 检查通知（延迟执行，避免与页面加载冲突）
        setTimeout(() => {
            // checkNotifications(); // 暂时禁用定期检查通知，避免无限循环
            console.log('通知检查已暂时禁用');
        }, 2000);
        
        console.log('应用初始化完成（调试模式）');
    } catch (error) {
        console.error('应用初始化失败:', error);
        // 即使初始化失败，也要绑定基本事件以便调试
        try {
            bindEvents();
            console.log('基本事件绑定完成，可以进行前端调试');
        } catch (bindError) {
            console.error('事件绑定也失败了:', bindError);
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
    console.log('updateCodesList called with codes:', codes);
    const codesList = document.getElementById('codesList');

    if (!codes || codes.length === 0) {
        console.log('No codes to display');
        codesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>暂无兑换码</p>
                <p class="text-sm text-secondary">完成签到后即可获得兑换码</p>
            </div>
        `;
        return;
    }

    // 按日期排序，最新的在前面
    const sortedCodes = codes.sort((a, b) => {
        const dateA = new Date(a.check_in_time || a.check_in_date || a.created_at);
        const dateB = new Date(b.check_in_time || b.check_in_date || b.created_at);
        return dateB - dateA;
    });

    codesList.innerHTML = sortedCodes.map(code => {
        // 处理待发放状态
        if (code.status === 'pending_distribution') {
            return `
                <div class="code-item pending" data-status="pending">
                    <div class="code-info">
                        <span class="code-text text-warning">⏳ 待分配</span>
                        <span class="code-amount">$${code.amount || 0}</span>
                        <span class="code-date">
                            📅 签到获得 - ${utils.formatDate(new Date(code.check_in_date || code.created_at), 'YYYY-MM-DD HH:mm:ss.SSS')}
                        </span>
                    </div>
                </div>
            `;
        }

        // 确定兑换码来源
        const sourceIcon = code.distribution_type === 'gift' ? '🎁' : '📅';
        const sourceText = code.distribution_type === 'gift' ? '系统赠送' : '签到获得';
        
        // 格式化时间，优先使用 check_in_time，其次是 created_at
        const timestamp = new Date(code.check_in_time || code.check_in_date || code.created_at);
        const formattedTime = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, '0')}-${String(timestamp.getDate()).padStart(2, '0')} ${String(timestamp.getHours()).padStart(2, '0')}:${String(timestamp.getMinutes()).padStart(2, '0')}:${String(timestamp.getSeconds()).padStart(2, '0')}.${String(timestamp.getMilliseconds()).padStart(3, '0')}`;

        return `
            <div class="code-item" data-type="${code.distribution_type || 'checkin'}">
                <div class="code-info">
                    <span class="code-text">${code.redemption_code}</span>
                    <span class="code-amount">$${code.amount || 0}</span>
                    <span class="code-date">
                        ${sourceIcon} ${sourceText} - ${formattedTime}
                    </span>
                </div>
                <button class="copy-btn-modern" onclick="copyCode('${code.redemption_code}', this)" title="复制兑换码">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                    </svg>
                    <span>复制</span>
                </button>
            </div>
        `;
    }).join('');
}

/**
 * 更新查看全部按钮状态
 */
function updateViewAllButton() {
    const viewAllBtn = document.getElementById('viewAllBtn');
    if (!viewAllBtn) return;

    if (AppState.showingAllCodes) {
        viewAllBtn.textContent = '收起';
        viewAllBtn.classList.add('active');
    } else {
        viewAllBtn.textContent = '查看全部';
        viewAllBtn.classList.remove('active');
    }
}

// ============================================
// 数据加载
// ============================================

/**
 * 加载签到状态
 */
async function loadCheckinStatus() {
    try {
        // 获取今日签到记录 - 提高limit并确保按时间倒序排列
        const today = new Date().toISOString().split('T')[0];
        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 20, // 提高limit确保能找到今天的记录
            sort: 'desc', // 确保按时间倒序
            _t: Date.now() // 防止缓存
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
            limit: 200, // 提高limit获取更准确的统计信息
            _t: Date.now() // 防止缓存
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
        const limit = AppState.showingAllCodes ? 100 : 10; // 增加默认显示数量
        console.log('Loading recent codes with limit:', limit);

        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: limit,
            sort: 'desc', // 确保按时间倒序
            _t: Date.now() // 防止缓存
        });

        console.log('API response:', data);

        if (data.success && data.records) {
            // 包含待发放的记录
            console.log('原始API数据:', data.records);

            // 去重处理 - 根据唯一标识去重，优先保留最新的记录
            const uniqueCodes = [];
            const seenKeys = new Set();

            // 按时间排序确保最新的在前
            const sortedRecords = data.records.sort((a, b) => {
                const dateA = new Date(a.check_in_time || a.created_at);
                const dateB = new Date(b.check_in_time || b.created_at);
                return dateB - dateA;
            });

            sortedRecords.forEach(record => {
                // 使用更精确的唯一标识
                const key = record.redemption_code ? 
                    `code_${record.redemption_code}` : 
                    `pending_${record.user_id}_${record.check_in_date}`;
                
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    uniqueCodes.push(record);
                } else {
                    console.warn('发现重复记录:', key, record);
                }
            });

            AppState.recentCodes = uniqueCodes;
            console.log('去重后的兑换码:', AppState.recentCodes);
            updateCodesList(AppState.recentCodes);
        } else {
            console.warn('No records found or API error:', data);
            AppState.recentCodes = [];
            updateCodesList([]);
        }
    } catch (error) {
        console.error('Load recent codes error:', error);
        AppState.recentCodes = [];
        updateCodesList([]);
    }
}

/**
 * 切换兑换码视图（显示最近5个或全部）
 */
async function toggleCodesView() {
    const viewAllBtn = document.getElementById('viewAllBtn');

    if (!AppState.showingAllCodes) {
        // 切换到显示全部
        AppState.showingAllCodes = true;
        viewAllBtn.textContent = '收起';
        viewAllBtn.disabled = true;

        // 添加加载状态
        const codesList = document.getElementById('codesList');
        codesList.innerHTML = `
            <div class="loading-state">
                <div class="skeleton-loader" style="height: 60px; margin-bottom: 10px;"></div>
                <div class="skeleton-loader" style="height: 60px; margin-bottom: 10px;"></div>
                <div class="skeleton-loader" style="height: 60px;"></div>
            </div>
        `;

        try {
            await loadRecentCodes();
            viewAllBtn.disabled = false;
        } catch (error) {
            utils.showToast('加载失败，请重试', 'error');
            AppState.showingAllCodes = false;
            viewAllBtn.textContent = '查看全部';
            viewAllBtn.disabled = false;
            await loadRecentCodes();
        }
    } else {
        // 切换到显示最近5个
        AppState.showingAllCodes = false;
        viewAllBtn.textContent = '查看全部';
        await loadRecentCodes();
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
                // 显示系统赠送弹窗
                showGiftModal(data.redemptionCode, data.amount, '恭喜您获得兑换码奖励！');
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
        console.error('Gift modal not found in DOM');
        return;
    }

    // 更新弹窗内容
    const giftCodeInput = document.getElementById('giftCodeInput');
    const amountElement = document.getElementById('giftAmount');
    const subtitleElement = modal.querySelector('.gift-subtitle');

    if (giftCodeInput) giftCodeInput.value = code;
    if (amountElement) amountElement.textContent = amount || 10;
    if (subtitleElement) subtitleElement.textContent = message || '恭喜您获得兑换码奖励！';

    // 显示弹窗
    modal.classList.add('active');
}

/**
 * 关闭系统赠送弹窗
 */
function closeGiftModal() {
    const modal = document.getElementById('giftModal');
    if (modal) {
        modal.classList.remove('active');
        
        // 清空输入框
        const codeInput = document.getElementById('giftCodeInput');
        if (codeInput) {
            codeInput.value = '';
        }
        
        // 重置金额显示
        const amountElement = document.getElementById('giftAmount');
        if (amountElement) {
            amountElement.textContent = '10';
        }
        
        // 关闭弹窗后刷新兑换码列表，确保新的兑换码显示
        setTimeout(() => {
            loadRecentCodes();
        }, 300);
    }
}

/**
 * 复制赠送弹窗中的兑换码
 */
async function copyGiftCode() {
    const codeInput = document.getElementById('giftCodeInput');
    const code = codeInput.value;
    const copyBtn = document.querySelector('.copy-code-btn');
    
    try {
        await navigator.clipboard.writeText(code);
        
        // 保存原始内容
        const originalHTML = copyBtn.innerHTML;
        
        // 更新按钮状态
        copyBtn.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
            <span>已复制</span>
        `;
        
        setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
        }, 2000);
        
        utils.showToast('兑换码已复制', 'success');
    } catch (error) {
        // 降级方案：选中文本
        codeInput.select();
        codeInput.setSelectionRange(0, 99999);
        utils.showToast('请手动复制兑换码', 'warning');
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
    try {
        await navigator.clipboard.writeText(code);
        
        // 保存原始内容
        const originalHTML = button.innerHTML;
        
        button.classList.add('copied');
        
        // 检查是否是现代化按钮
        if (button.classList.contains('copy-btn-modern')) {
            button.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20,6 9,17 4,12"></polyline>
                </svg>
                <span>已复制</span>
            `;
        } else {
            button.innerHTML = '<span>✓</span>';
        }
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.classList.remove('copied');
        }, 2000);
        
        utils.showToast('兑换码已复制', 'success');
    } catch (error) {
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
        viewAllBtn.addEventListener('click', toggleCodesView);
    }

    // 刷新兑换码按钮事件
    const refreshCodesBtn = document.getElementById('refreshCodesBtn');
    if (refreshCodesBtn) {
        refreshCodesBtn.addEventListener('click', async () => {
            refreshCodesBtn.disabled = true;
            refreshCodesBtn.innerHTML = '🔄 刷新中...';

            try {
                // 清除缓存的数据
                AppState.recentCodes = [];
                await loadRecentCodes();
                utils.showToast('兑换码列表已刷新', 'success');
            } catch (error) {
                utils.showToast('刷新失败，请重试', 'error');
            } finally {
                refreshCodesBtn.disabled = false;
                refreshCodesBtn.innerHTML = '🔄 刷新';
            }
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
        // 页面重新可见时只刷新状态，暂时不检查通知
        loadCheckinStatus();
        // checkNotifications(); // 暂时禁用
        console.log('页面可见性变化 - 通知检查已暂时禁用');
    }
});

/**
 * 测试系统赠送弹窗
 */
function testGiftModal() {
    const testCode = 'aec973db8988433e8401c7c5d48e2188';
    const testAmount = 10;
    const testMessage = '恭喜您获得兑换码奖励！';
    showGiftModal(testCode, testAmount, testMessage);
}

/**
 * 简单测试函数
 */
function simpleTest() {
    alert('JavaScript正常工作！');
    console.log('simpleTest函数被调用');
}

/**
 * 紧急停止所有通知检查
 */
function emergencyStopNotifications() {
    try {
        // 清除所有可能的定时器
        for (let i = 1; i < 99999; i++) {
            window.clearInterval(i);
        }

        // 重新定义checkNotifications为空函数
        window.checkNotifications = function() {
            console.log('通知检查已被紧急停止');
            return Promise.resolve();
        };

        console.log('所有通知检查已紧急停止');
        alert('所有通知检查已紧急停止！');
    } catch (error) {
        console.error('紧急停止失败:', error);
        alert('紧急停止失败: ' + error.message);
    }
}

/**
 * 强制刷新兑换码列表
 */
async function forceRefreshCodes() {
    try {
        console.log('强制刷新兑换码列表...');

        // 清空当前数据
        AppState.recentCodes = [];

        // 显示加载状态
        const codesList = document.getElementById('codesList');
        if (codesList) {
            codesList.innerHTML = '<div class="loading">🔄 刷新中...</div>';
        }

        // 重新加载数据
        await loadRecentCodes();

        alert('兑换码列表已刷新！');
    } catch (error) {
        console.error('刷新失败:', error);
        alert('刷新失败: ' + error.message);
    }
}

/**
 * 清除通知状态（调试用）
 */
function clearNotificationState() {
    try {
        AppState.processedNotifications.clear();
        localStorage.removeItem('processedNotifications');
        console.log('通知状态已清除');
        alert('通知状态已清除！下次刷新页面时会重新显示未处理的通知。');
    } catch (error) {
        console.error('清除通知状态失败:', error);
        alert('清除失败: ' + error.message);
    }
}

/**
 * 检查通知状态（调试用）
 */
function checkNotificationState() {
    try {
        const processedIds = Array.from(AppState.processedNotifications);
        const stored = localStorage.getItem('processedNotifications');

        console.log('=== 通知状态检查 ===');
        console.log('内存中已处理的通知ID:', processedIds);
        console.log('localStorage中的数据:', stored);

        alert(`已处理的通知数量: ${processedIds.length}\n详情请查看控制台`);
    } catch (error) {
        console.error('检查通知状态失败:', error);
        alert('检查失败: ' + error.message);
    }
}

/**
 * 验证API数据一致性（调试用）
 */
async function validateAPIData() {
    try {
        console.log('=== API数据一致性验证 ===');

        // 1. 检查通知API
        console.log('1. 检查通知API...');
        const notificationData = await utils.get('/api/notifications?unread_only=true');
        console.log('通知API响应:', notificationData);

        // 2. 检查兑换码记录API
        console.log('2. 检查兑换码记录API...');
        const recordsData = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 10,
            _t: Date.now()
        });
        console.log('兑换码记录API响应:', recordsData);

        // 3. 比较数据一致性
        if (notificationData.success && notificationData.notifications) {
            const giftNotifications = notificationData.notifications.filter(n => n.type === 'gift');
            console.log('赠送通知:', giftNotifications);

            if (recordsData.success && recordsData.records) {
                console.log('兑换码记录:', recordsData.records);

                // 检查是否有匹配的兑换码
                giftNotifications.forEach(notification => {
                    const matchingRecord = recordsData.records.find(record =>
                        record.redemption_code === notification.redemption_code
                    );
                    console.log(`通知 ${notification.id} (${notification.redemption_code}) 在记录中${matchingRecord ? '找到' : '未找到'}匹配项`);
                });
            }
        }

        alert('API数据验证完成，详情请查看控制台');
    } catch (error) {
        console.error('API数据验证失败:', error);
        alert('验证失败: ' + error.message);
    }
}

/**
 * 调试函数：检查当前数据状态
 */
function debugDataState() {
    try {
        console.log('=== 数据状态调试 ===');
        console.log('AppState:', typeof AppState !== 'undefined' ? AppState : 'AppState未定义');

        if (typeof AppState !== 'undefined') {
            console.log('AppState.recentCodes:', AppState.recentCodes);
            console.log('AppState.showingAllCodes:', AppState.showingAllCodes);
            console.log('当前显示的兑换码数量:', AppState.recentCodes?.length || 0);
        }

        // 检查DOM中的兑换码
        const codeItems = document.querySelectorAll('.code-item');
        console.log('DOM中的兑换码项数量:', codeItems.length);

        codeItems.forEach((item, index) => {
            const codeText = item.querySelector('.code-text')?.textContent;
            const codeAmount = item.querySelector('.code-amount')?.textContent;
            const codeDate = item.querySelector('.code-date')?.textContent;
            console.log(`兑换码 ${index + 1}:`, { codeText, codeAmount, codeDate });
        });

        alert('调试信息已输出到控制台');
    } catch (error) {
        console.error('调试函数执行错误:', error);
        alert('调试函数执行错误: ' + error.message);
    }
}

// 导出全局函数
window.copyCode = copyCode;
window.closeModal = closeModal;
window.copyModalCode = copyModalCode;
window.closeGiftModal = closeGiftModal;
window.copyGiftCode = copyGiftCode;
window.toggleCodesView = toggleCodesView;
window.testGiftModal = testGiftModal;
window.debugDataState = debugDataState;
window.simpleTest = simpleTest;
window.forceRefreshCodes = forceRefreshCodes;
window.clearNotificationState = clearNotificationState;
window.checkNotificationState = checkNotificationState;
window.validateAPIData = validateAPIData;
window.emergencyStopNotifications = emergencyStopNotifications;
