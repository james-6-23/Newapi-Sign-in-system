/**
 * KYX 签到系统 - 管理后台逻辑
 */

// ============================================
// 全局状态
// ============================================

const AdminState = {
    currentPage: 'dashboard',
    stats: {
        total: 0,
        unused: 0,
        used: 0,
        rate: 0
    },
    inventory: [],
    codes: [],
    pendingUsers: [],
    users: [],
    selectedUsers: new Set(),
    currentPageNum: 1,
    pageSize: 20,
    redemptionsSort: 'desc',
    defaultCheckinAmount: 10,
    codeAmountFilter: null
};

// ============================================
// 初始化
// ============================================

/**
 * 管理后台初始化
 */
async function initAdmin() {
    try {
        // 设置主题
        const theme = utils.getCurrentTheme();
        utils.setTheme(theme);
        
        // 检查管理员权限
        const user = await utils.checkAuth();
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        
        if (!user.is_admin) {
            utils.showToast('您没有管理员权限', 'error');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            return;
        }
        
        // 绑定事件
        bindAdminEvents();
        
        // 初始化签到金额设置
        initCheckinAmountSetting();
        
        // 加载初始数据
        await loadDashboard();
        
    } catch (error) {
        console.error('Admin init error:', error);
        utils.showToast('初始化失败，请刷新页面重试', 'error');
    }
}

// ============================================
// 页面切换
// ============================================

/**
 * 切换页面
 */
function switchPage(pageName) {
    // 更新导航状态
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-page="${pageName}"]`)?.classList.add('active');
    
    // 更新页面内容
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(`page-${pageName}`)?.classList.add('active');
    
    // 更新标题
    const titles = {
        dashboard: '仪表盘',
        upload: '上传兑换码',
        inventory: '库存管理',
        codes: '兑换码列表',
        pending: '待分配用户',
        gift: '系统赠送',
        redemptions: '兑换记录',
        users: '用户管理',
        'modal-control': '弹窗控制'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || '管理后台';
    
    AdminState.currentPage = pageName;
    
    // 加载页面数据
    loadPageData(pageName);
}

/**
 * 加载页面数据
 */
async function loadPageData(pageName) {
    switch (pageName) {
        case 'dashboard':
            await loadDashboard();
            break;
        case 'inventory':
            await loadInventory();
            break;
        case 'codes':
            await loadCodes();
            break;
        case 'pending':
            await loadPendingUsers();
            break;
        case 'gift':
            await loadGiftPage();
            break;
        case 'redemptions':
            await loadRedemptions();
            break;
        case 'users':
            await loadUsers();
            break;
        case 'modal-control':
            await loadModalControl();
            break;
    }
}

// ============================================
// 仪表盘
// ============================================

/**
 * 加载仪表盘数据
 */
async function loadDashboard() {
    try {
        const data = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.STATS);
        
        if (data.success) {
            // 更新统计
            AdminState.stats = data.stats;
            document.getElementById('statTotal').textContent = data.stats.total || 0;
            document.getElementById('statUnused').textContent = data.stats.unused || 0;
            document.getElementById('statUsed').textContent = data.stats.used || 0;
            
            const rate = data.stats.total > 0 
                ? ((data.stats.used / data.stats.total) * 100).toFixed(1) + '%'
                : '0%';
            document.getElementById('statRate').textContent = rate;
            
            // 更新上传记录
            updateRecentUploads(data.recentUploads || []);
        }
    } catch (error) {
        console.error('Load dashboard error:', error);
        utils.showToast('加载数据失败', 'error');
    }
}

/**
 * 更新最近上传记录
 */
function updateRecentUploads(uploads) {
    const tbody = document.getElementById('recentUploads');
    
    if (uploads.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--color-text-secondary);">
                    暂无上传记录
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = uploads.map(upload => `
        <tr>
            <td>${upload.filename}</td>
            <td>¥${upload.amount}</td>
            <td>${upload.total_codes}</td>
            <td>${upload.valid_codes}</td>
            <td>${upload.duplicate_codes}</td>
            <td>${utils.formatDate(upload.uploaded_at, 'YYYY-MM-DD HH:mm')}</td>
        </tr>
    `).join('');
}

// ============================================
// 上传兑换码
// ============================================

/**
 * 处理文件上传
 */
async function handleFileUpload(file) {
    const amount = document.getElementById('uploadAmount').value;
    
    if (!amount || amount <= 0) {
        utils.showToast('请设置有效的金额', 'error');
        return;
    }
    
    if (!file.name.endsWith('.txt')) {
        utils.showToast('请上传 .txt 文件', 'error');
        return;
    }
    
    utils.showLoading();
    
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('amount', amount);
        
        const response = await fetch(CONFIG.API_BASE_URL + CONFIG.API_ENDPOINTS.ADMIN_CODES.UPLOAD, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            const resultDiv = document.getElementById('uploadResult');
            resultDiv.innerHTML = `
                <div class="card" style="background: var(--color-success); color: white; padding: var(--spacing-lg);">
                    <h4>上传成功！</h4>
                    <p>文件名：${data.summary.filename}</p>
                    <p>金额：¥${data.summary.amount}</p>
                    <p>文件中总数：${data.summary.totalInFile}</p>
                    <p>文件中去重后：${data.summary.uniqueInFile}</p>
                    <p>新增兑换码：${data.summary.newCodes}</p>
                    <p>已存在兑换码：${data.summary.existingCodes}</p>
                </div>
            `;
            
            utils.showToast('上传成功', 'success');
            
            // 清空输入
            document.getElementById('uploadAmount').value = '';
            document.getElementById('fileInput').value = '';
            
            // 刷新统计
            if (AdminState.currentPage === 'dashboard') {
                loadDashboard();
            }
        } else {
            utils.showToast(data.error || '上传失败', 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        utils.showToast('上传失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

// ============================================
// 库存管理
// ============================================

/**
 * 加载库存数据
 */
async function loadInventory() {
    try {
        const data = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        
        if (data.success) {
            AdminState.inventory = data.inventory;
            updateInventoryDisplay(data.inventory);
        }
    } catch (error) {
        console.error('Load inventory error:', error);
        utils.showToast('加载库存失败', 'error');
    }
}

/**
 * 更新库存显示
 */
function updateInventoryDisplay(inventory) {
    const grid = document.getElementById('inventoryGrid');
    
    if (inventory.length === 0) {
        grid.innerHTML = '<div style="text-align: center; color: var(--color-text-secondary);">暂无库存</div>';
        return;
    }
    
    grid.innerHTML = inventory.map(item => {
        const percentage = item.total_count > 0 
            ? ((item.available_count / item.total_count) * 100).toFixed(0)
            : 0;
        
        return `
            <div class="inventory-item">
                <div class="inventory-amount">¥${item.amount}</div>
                <div class="inventory-count">
                    ${item.available_count} / ${item.total_count}
                </div>
                <div class="inventory-bar">
                    <div class="inventory-bar-fill" style="width: ${percentage}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 刷新库存
 */
async function refreshInventory() {
    await loadInventory();
    utils.showToast('库存已刷新', 'success');
}

/**
 * 导出库存报表
 */
function exportInventory() {
    // 生成CSV数据
    const headers = ['金额', '总数', '可用', '已用'];
    const rows = AdminState.inventory.map(item => [
        item.amount,
        item.total_count,
        item.available_count,
        item.used_count
    ]);
    
    const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    // 下载文件
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `inventory_${utils.formatDate(new Date(), 'YYYY-MM-DD')}.csv`;
    link.click();
    
    utils.showToast('报表已导出', 'success');
}

/**
 * 清空未使用的兑换码
 */
async function clearUnused() {
    if (!confirm('确定要清空所有未使用的兑换码吗？此操作不可恢复！')) {
        return;
    }
    
    const confirmText = prompt('请输入"一键清空"以确认操作：');
    if (confirmText !== '一键清空') {
        utils.showToast('操作已取消', 'info');
        return;
    }
    
    try {
        const data = await utils.del(CONFIG.API_ENDPOINTS.ADMIN_CODES.CLEAR_UNUSED, {
            confirmation: '一键清空'
        });
        
        if (data.success) {
            utils.showToast(data.message, 'success');
            await loadInventory();
        }
    } catch (error) {
        console.error('Clear unused error:', error);
        utils.showToast('清空失败', 'error');
    }
}

// ============================================
// 兑换码列表
// ============================================

/**
 * 加载兑换码列表（增强版）
 */
async function loadCodes(page = 1) {
    try {
        const statusFilter = document.getElementById('codeStatusFilter')?.value;
        const amountFilter = document.getElementById('codeAmountFilter')?.value;
        const params = {
            page: page,
            limit: AdminState.pageSize
        };
        
        if (statusFilter) {
            params.status = statusFilter;
        }
        
        if (amountFilter) {
            params.amount = amountFilter;
        }
        
        const data = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.LIST, params);
        
        if (data.success) {
            AdminState.codes = data.codes;
            updateCodesDisplay(data.codes);
            updatePagination(data.pagination);
            
            // 更新金额筛选选项
            updateAmountFilterOptions();
        }
    } catch (error) {
        console.error('Load codes error:', error);
        utils.showToast('加载兑换码失败', 'error');
    }
}

/**
 * 更新金额筛选选项
 */
async function updateAmountFilterOptions() {
    try {
        const inventory = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        if (inventory.success) {
            const amountFilter = document.getElementById('codeAmountFilter');
            if (amountFilter) {
                const currentValue = amountFilter.value;
                amountFilter.innerHTML = '<option value="">全部金额</option>' +
                    inventory.inventory
                        .map(item => `<option value="${item.amount}">¥${item.amount}</option>`)
                        .join('');
                amountFilter.value = currentValue;
            }
        }
    } catch (error) {
        console.error('Update amount filter error:', error);
    }
}

/**
 * 更新兑换码显示（增强版）
 */
function updateCodesDisplay(codes) {
    const tbody = document.getElementById('codesList');
    
    if (codes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--color-text-secondary);">
                    暂无兑换码
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = codes.map(code => {
        // 发放状态
        let distributionStatus = '待发放';
        let statusClass = 'badge-default';
        
        if (code.is_used) {
            distributionStatus = '已发放';
            statusClass = 'badge-success';
        }
        
        return `
            <tr>
                <td style="font-family: var(--font-mono);">${code.code}</td>
                <td>¥${code.amount}</td>
                <td>${code.username || '-'}</td>
                <td>${code.distribution_time ? utils.formatDate(code.distribution_time, 'YYYY-MM-DD HH:mm') : '-'}</td>
                <td>
                    <span class="badge ${statusClass}">
                        ${distributionStatus}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-ghost" onclick="copyCode('${code.code}')">
                        复制
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 清空未使用的兑换码（增强版）
 */
async function clearAllUnusedCodes() {
    const confirmText = prompt('此操作将清空所有未使用的兑换码！\n请输入"一键清空"以确认操作：');
    
    if (confirmText !== '一键清空') {
        utils.showToast('操作已取消', 'info');
        return;
    }
    
    try {
        utils.showLoading();
        const data = await utils.del(CONFIG.API_ENDPOINTS.ADMIN_CODES.CLEAR_UNUSED, {
            confirmation: '一键清空'
        });
        
        if (data.success) {
            utils.showToast(data.message, 'success');
            await loadCodes(1);
            await loadInventory();
        }
    } catch (error) {
        console.error('Clear all unused error:', error);
        utils.showToast('清空失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

/**
 * 复制兑换码
 */
async function copyCode(code) {
    const success = await utils.copyToClipboard(code);
    if (success) {
        utils.showToast('兑换码已复制', 'success');
    } else {
        utils.showToast('复制失败', 'error');
    }
}

// ============================================
// 待分配用户
// ============================================

/**
 * 加载待分配用户
 */
async function loadPendingUsers() {
    try {
        const data = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_DISTRIBUTE.PENDING_USERS);
        
        if (data.success) {
            AdminState.pendingUsers = data.pendingUsers;
            updatePendingDisplay(data.pendingUsers);
        }
    } catch (error) {
        console.error('Load pending users error:', error);
        utils.showToast('加载待分配用户失败', 'error');
    }
}

/**
 * 更新待分配用户显示
 */
function updatePendingDisplay(users) {
    const list = document.getElementById('pendingList');
    
    if (users.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; color: var(--color-text-secondary); padding: var(--spacing-2xl);">
                <div style="font-size: var(--text-3xl); margin-bottom: var(--spacing-md);">🎉</div>
                <div>没有待分配的用户</div>
            </div>
        `;
        return;
    }
    
    list.innerHTML = users.map(user => `
        <div class="pending-item">
            <div class="pending-user">
                <div class="pending-avatar">
                    ${user.avatar_url ? `<img src="${user.avatar_url}" alt="${user.username}">` : '👤'}
                </div>
                <div class="pending-info">
                    <div class="pending-name">${user.username}</div>
                    <div class="pending-date">签到时间：${utils.formatDate(user.check_in_time, 'YYYY-MM-DD HH:mm')}</div>
                </div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="assignCode(${user.user_id})">
                分配兑换码
            </button>
        </div>
    `).join('');
}

/**
 * 一键补发
 */
async function resolvePending() {
    if (AdminState.pendingUsers.length === 0) {
        utils.showToast('没有待分配的用户', 'info');
        return;
    }
    
    if (!confirm(`确定要为 ${AdminState.pendingUsers.length} 个用户补发兑换码吗？`)) {
        return;
    }
    
    try {
        utils.showLoading();
        const data = await utils.post(CONFIG.API_ENDPOINTS.ADMIN_DISTRIBUTE.PENDING);
        
        if (data.success) {
            utils.showToast(data.message, 'success');
            await loadPendingUsers();
        }
    } catch (error) {
        console.error('Resolve pending error:', error);
        utils.showToast('补发失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

// ============================================
// 系统赠送
// ============================================

/**
 * 加载赠送页面
 */
async function loadGiftPage() {
    try {
        // 加载用户列表
        await loadUsersList();
        
        // 加载可用金额
        const inventory = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        if (inventory.success) {
            const amountSelect = document.getElementById('giftAmount');
            amountSelect.innerHTML = '<option value="">请选择金额</option>' +
                inventory.inventory
                    .filter(item => item.available_count > 0)
                    .map(item => `<option value="${item.amount}">¥${item.amount} (剩余 ${item.available_count} 个)</option>`)
                    .join('');
        }
    } catch (error) {
        console.error('Load gift page error:', error);
        utils.showToast('加载页面失败', 'error');
    }
}

/**
 * 加载用户列表
 */
async function loadUsersList() {
    try {
        // 这里应该调用获取用户列表的API
        // 暂时使用签到记录来获取用户
        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 100
        });
        
        if (data.success && data.records) {
            const users = {};
            data.records.forEach(record => {
                if (record.user_id && record.username) {
                    users[record.user_id] = record.username;
                }
            });
            
            const select = document.getElementById('giftUsers');
            select.innerHTML = Object.entries(users)
                .map(([id, name]) => `<option value="${id}">${name}</option>`)
                .join('');
        }
    } catch (error) {
        console.error('Load users list error:', error);
    }
}

/**
 * 发送赠送
 */
async function sendGift() {
    const selectedOptions = document.getElementById('giftUsers').selectedOptions;
    const userIds = Array.from(selectedOptions).map(opt => opt.value);
    const amount = document.getElementById('giftAmount').value;
    const message = document.getElementById('giftMessage').value;
    
    if (userIds.length === 0) {
        utils.showToast('请选择用户', 'error');
        return;
    }
    
    if (!amount) {
        utils.showToast('请选择金额', 'error');
        return;
    }
    
    if (!confirm(`确定要向 ${userIds.length} 个用户赠送 ¥${amount} 的兑换码吗？`)) {
        return;
    }
    
    try {
        utils.showLoading();
        const data = await utils.post(CONFIG.API_ENDPOINTS.ADMIN_DISTRIBUTE.GIFT, {
            user_ids: userIds,
            amount: parseFloat(amount),
            message: message
        });
        
        if (data.success) {
            utils.showToast(data.message, 'success');
            
            // 清空选择
            document.getElementById('giftUsers').selectedIndex = -1;
            document.getElementById('giftAmount').value = '';
            document.getElementById('giftMessage').value = '';
            
            // 刷新库存
            await loadGiftPage();
        }
    } catch (error) {
        console.error('Send gift error:', error);
        utils.showToast(error.message || '赠送失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

// ============================================
// 兑换记录
// ============================================

/**
 * 加载兑换记录（增强版，支持排序）
 */
async function loadRedemptions(page = 1) {
    try {
        const search = document.getElementById('searchInput')?.value || '';
        const params = {
            page: page,
            limit: AdminState.pageSize,
            sort: AdminState.redemptionsSort || 'desc'
        };
        
        if (search) {
            params.search = search;
        }
        
        const data = await utils.get(CONFIG.API_ENDPOINTS.ADMIN.REDEMPTIONS, params);
        
        if (data.success) {
            updateRedemptionsDisplay(data.redemptions);
            updatePagination(data.pagination);
        }
    } catch (error) {
        console.error('Load redemptions error:', error);
        utils.showToast('加载签到记录失败', 'error');
    }
}

/**
 * 更新兑换记录显示 - 增强版（显示精确时间、待发放状态）
 */
function updateRedemptionsDisplay(redemptions) {
    const tbody = document.getElementById('redemptionsList');
    
    if (redemptions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--color-text-secondary);">
                    暂无签到记录
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = redemptions.map(record => {
        // 格式化精确到毫秒的时间
        const checkInTime = new Date(record.check_in_time);
        const formattedTime = utils.formatDate(checkInTime, 'YYYY-MM-DD HH:mm:ss') +
                            '.' + checkInTime.getMilliseconds().toString().padStart(3, '0');
        
        // 处理待发放状态
        let codeDisplay = '-';
        let statusBadge = '';
        
        if (record.status === 'pending_distribution') {
            codeDisplay = '<span style="color: var(--color-warning);">已签到待发放</span>';
            statusBadge = '<span class="badge badge-warning">待发放</span>';
        } else if (record.redemption_code) {
            codeDisplay = `<span style="font-family: var(--font-mono);">${record.redemption_code}</span>`;
            statusBadge = '<span class="badge badge-success">已发放</span>';
        } else {
            statusBadge = '<span class="badge badge-default">未知</span>';
        }
        
        return `
            <tr>
                <td title="${formattedTime}">${formattedTime}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                        ${record.avatar_url ? `<img src="${record.avatar_url}" style="width: 24px; height: 24px; border-radius: 50%;">` : '👤'}
                        ${record.username}
                    </div>
                </td>
                <td>${record.linux_do_id || '-'}</td>
                <td>${codeDisplay}</td>
                <td>¥${record.amount || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    ${record.status === 'pending_distribution' ?
                        `<button class="btn btn-sm btn-primary" onclick="assignSingleCode(${record.user_id}, ${record.id})">补发</button>` :
                        '-'
                    }
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * 为单个用户补发兑换码
 */
async function assignSingleCode(userId, checkinId) {
    if (!confirm('确定要为该用户补发兑换码吗？')) {
        return;
    }
    
    try {
        utils.showLoading();
        // 这里应该调用单独补发的API，暂时使用批量补发
        const data = await utils.post(CONFIG.API_ENDPOINTS.ADMIN_DISTRIBUTE.PENDING);
        
        if (data.success) {
            utils.showToast('补发成功', 'success');
            await loadRedemptions(AdminState.currentPageNum);
        }
    } catch (error) {
        console.error('Assign single code error:', error);
        utils.showToast('补发失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

/**
 * 切换签到记录排序
 */
function toggleRedemptionsSort() {
    const currentSort = AdminState.redemptionsSort || 'desc';
    AdminState.redemptionsSort = currentSort === 'desc' ? 'asc' : 'desc';
    loadRedemptions(1);
}

/**
 * 搜索兑换记录
 */
function searchRedemptions() {
    loadRedemptions(1);
}

// ============================================
// 用户管理
// ============================================

/**
 * 加载用户列表（增强版，支持选择）
 */
async function loadUsers() {
    try {
        // 暂时使用签到记录统计用户数据
        const data = await utils.get(CONFIG.API_ENDPOINTS.CHECKIN.RECORDS, {
            page: 1,
            limit: 100
        });
        
        if (data.success && data.records) {
            const userStats = {};
            
            data.records.forEach(record => {
                if (!userStats[record.user_id]) {
                    userStats[record.user_id] = {
                        id: record.user_id,
                        username: record.username,
                        linux_do_id: record.linux_do_id,
                        checkins: 0,
                        codes: 0,
                        pendingCodes: 0,
                        firstCheckin: record.check_in_date
                    };
                }
                userStats[record.user_id].checkins++;
                if (record.redemption_code) {
                    userStats[record.user_id].codes++;
                } else if (record.status === 'pending_distribution') {
                    userStats[record.user_id].pendingCodes++;
                }
            });
            
            AdminState.users = Object.values(userStats);
            updateUsersDisplay(AdminState.users);
        }
    } catch (error) {
        console.error('Load users error:', error);
        utils.showToast('加载用户列表失败', 'error');
    }
}

/**
 * 更新用户显示（增强版，支持选择）
 */
function updateUsersDisplay(users) {
    const tbody = document.getElementById('usersList');
    
    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--color-text-secondary);">
                    暂无用户数据
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = users.map(user => `
        <tr>
            <td>
                <input type="checkbox"
                       value="${user.id}"
                       onchange="toggleUserSelection(${user.id})"
                       ${AdminState.selectedUsers.has(user.id) ? 'checked' : ''}>
            </td>
            <td>${user.username}</td>
            <td>${user.linux_do_id || '-'}</td>
            <td>${user.checkins}</td>
            <td>${user.codes}</td>
            <td>${user.pendingCodes > 0 ? `<span class="badge badge-warning">${user.pendingCodes}</span>` : '-'}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="showGiftModalForUser(${user.id}, '${user.username}')">
                    发放
                </button>
            </td>
        </tr>
    `).join('');
    
    // 更新选中计数
    updateSelectedCount();
}

/**
 * 切换用户选择
 */
function toggleUserSelection(userId) {
    if (AdminState.selectedUsers.has(userId)) {
        AdminState.selectedUsers.delete(userId);
    } else {
        AdminState.selectedUsers.add(userId);
    }
    updateSelectedCount();
}

/**
 * 全选/取消全选
 */
function toggleSelectAll() {
    const checkboxes = document.querySelectorAll('#usersList input[type="checkbox"]');
    const selectAllCheckbox = document.getElementById('selectAllUsers');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
        const userId = parseInt(checkbox.value);
        if (selectAllCheckbox.checked) {
            AdminState.selectedUsers.add(userId);
        } else {
            AdminState.selectedUsers.delete(userId);
        }
    });
    
    updateSelectedCount();
}

/**
 * 更新选中计数
 */
function updateSelectedCount() {
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = `已选择 ${AdminState.selectedUsers.size} 个用户`;
    }
    
    // 启用/禁用批量操作按钮
    const batchButtons = document.querySelectorAll('.batch-action-btn');
    batchButtons.forEach(btn => {
        btn.disabled = AdminState.selectedUsers.size === 0;
    });
}

/**
 * 批量发放兑换码
 */
async function batchDistributeToSelected() {
    if (AdminState.selectedUsers.size === 0) {
        utils.showToast('请先选择用户', 'error');
        return;
    }
    
    // 显示批量发放弹窗
    showBatchDistributeModal();
}

/**
 * 显示批量发放弹窗
 */
function showBatchDistributeModal() {
    const modal = document.getElementById('batchDistributeModal');
    if (!modal) {
        // 创建弹窗
        const modalHtml = `
            <div class="modal" id="batchDistributeModal">
                <div class="modal-backdrop" onclick="closeBatchDistributeModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>批量发放兑换码</h3>
                        <button class="modal-close" onclick="closeBatchDistributeModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p>即将为 <strong>${AdminState.selectedUsers.size}</strong> 个用户发放兑换码</p>
                        <div class="form-group">
                            <label>选择金额</label>
                            <select id="batchAmount" class="input">
                                <option value="">请选择金额</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>备注信息（可选）</label>
                            <textarea id="batchMessage" class="input" rows="3" placeholder="输入备注信息..."></textarea>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeBatchDistributeModal()">取消</button>
                        <button class="btn btn-primary" onclick="confirmBatchDistribute()">确认发放</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // 加载可用金额
    loadAvailableAmounts('batchAmount');
    
    document.getElementById('batchDistributeModal').classList.add('active');
}

/**
 * 关闭批量发放弹窗
 */
function closeBatchDistributeModal() {
    const modal = document.getElementById('batchDistributeModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 确认批量发放
 */
async function confirmBatchDistribute() {
    const amount = document.getElementById('batchAmount').value;
    const message = document.getElementById('batchMessage').value;
    
    if (!amount) {
        utils.showToast('请选择金额', 'error');
        return;
    }
    
    const userIds = Array.from(AdminState.selectedUsers);
    
    if (!confirm(`确定要为 ${userIds.length} 个用户发放 ¥${amount} 的兑换码吗？`)) {
        return;
    }
    
    try {
        utils.showLoading();
        
        // 先检查库存
        const inventory = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        if (inventory.success) {
            const amountInventory = inventory.inventory.find(i => i.amount == amount);
            if (!amountInventory || amountInventory.available_count < userIds.length) {
                utils.showToast(`库存不足！当前 ¥${amount} 仅剩 ${amountInventory?.available_count || 0} 个`, 'error');
                return;
            }
        }
        
        // 执行批量发放
        const data = await utils.post(CONFIG.API_ENDPOINTS.ADMIN_DISTRIBUTE.BATCH, {
            user_ids: userIds,
            amount: parseFloat(amount),
            confirm: true,
            message: message
        });
        
        if (data.success) {
            utils.showToast(data.message, 'success');
            closeBatchDistributeModal();
            AdminState.selectedUsers.clear();
            await loadUsers();
        }
    } catch (error) {
        console.error('Batch distribute error:', error);
        utils.showToast(error.message || '批量发放失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

/**
 * 加载可用金额选项
 */
async function loadAvailableAmounts(selectId) {
    try {
        const inventory = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        if (inventory.success) {
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">请选择金额</option>' +
                    inventory.inventory
                        .filter(item => item.available_count > 0)
                        .map(item => `<option value="${item.amount}">¥${item.amount} (剩余 ${item.available_count} 个)</option>`)
                        .join('');
            }
        }
    } catch (error) {
        console.error('Load available amounts error:', error);
    }
}

/**
 * 显示单个用户发放弹窗
 */
function showGiftModalForUser(userId, username) {
    AdminState.selectedUsers.clear();
    AdminState.selectedUsers.add(userId);
    
    const modal = document.getElementById('singleGiftModal');
    if (!modal) {
        // 创建弹窗
        const modalHtml = `
            <div class="modal" id="singleGiftModal">
                <div class="modal-backdrop" onclick="closeSingleGiftModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>发放兑换码</h3>
                        <button class="modal-close" onclick="closeSingleGiftModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p>为用户 <strong id="giftUsername"></strong> 发放兑换码</p>
                        <div class="form-group">
                            <label>选择金额</label>
                            <select id="singleGiftAmount" class="input">
                                <option value="">请选择金额</option>
                            </select>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeSingleGiftModal()">取消</button>
                        <button class="btn btn-primary" onclick="confirmSingleGift()">确认发放</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    document.getElementById('giftUsername').textContent = username;
    loadAvailableAmounts('singleGiftAmount');
    document.getElementById('singleGiftModal').classList.add('active');
}

/**
 * 关闭单个用户发放弹窗
 */
function closeSingleGiftModal() {
    const modal = document.getElementById('singleGiftModal');
    if (modal) {
        modal.classList.remove('active');
    }
    AdminState.selectedUsers.clear();
}

/**
 * 确认单个用户发放
 */
async function confirmSingleGift() {
    const amount = document.getElementById('singleGiftAmount').value;
    
    if (!amount) {
        utils.showToast('请选择金额', 'error');
        return;
    }
    
    const userId = Array.from(AdminState.selectedUsers)[0];
    
    try {
        utils.showLoading();
        const data = await utils.post(CONFIG.API_ENDPOINTS.ADMIN_DISTRIBUTE.GIFT, {
            user_ids: [userId],
            amount: parseFloat(amount),
            message: `系统赠送 ¥${amount} 兑换码`
        });
        
        if (data.success) {
            utils.showToast('发放成功', 'success');
            closeSingleGiftModal();
            await loadUsers();
        }
    } catch (error) {
        console.error('Single gift error:', error);
        utils.showToast(error.message || '发放失败', 'error');
    } finally {
        utils.hideLoading();
    }
}

// ============================================
// 分页
// ============================================

/**
 * 更新分页
 */
function updatePagination(pagination) {
    // 这里可以添加分页组件的更新逻辑
    AdminState.currentPageNum = pagination.page;
}

// ============================================
// 事件绑定
// ============================================

/**
 * 绑定管理员事件
 */
function bindAdminEvents() {
    // 导航点击
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) {
                switchPage(page);
            }
        });
    });
    
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
    
    // 移动端菜单
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }
    
    // 文件上传
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    
    if (uploadZone && fileInput) {
        uploadZone.addEventListener('click', () => {
            fileInput.click();
        });
        
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });
        
        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });
        
        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });
    }
    
    // 兑换码筛选
    const codeFilter = document.getElementById('codeFilter');
    if (codeFilter) {
        codeFilter.addEventListener('change', () => {
            loadCodes(1);
        });
    }
}

// ============================================
// 页面加载
// ============================================

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', initAdmin);

/**
 * 设置默认签到金额
 */
async function setDefaultCheckinAmount() {
    const modal = document.getElementById('checkinAmountModal');
    if (!modal) {
        // 创建设置弹窗
        const modalHtml = `
            <div class="modal" id="checkinAmountModal">
                <div class="modal-backdrop" onclick="closeCheckinAmountModal()"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>设置签到发放金额</h3>
                        <button class="modal-close" onclick="closeCheckinAmountModal()">×</button>
                    </div>
                    <div class="modal-body">
                        <p>设置用户签到时默认发放的兑换码金额</p>
                        <div class="form-group">
                            <label>选择金额</label>
                            <select id="checkinAmount" class="input">
                                <option value="">请选择金额</option>
                            </select>
                        </div>
                        <div id="amountInventoryInfo" style="margin-top: 10px; color: var(--color-text-secondary);"></div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeCheckinAmountModal()">取消</button>
                        <button class="btn btn-primary" onclick="confirmCheckinAmount()">确认设置</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
    
    // 加载可用金额并显示库存
    loadCheckinAmountOptions();
    document.getElementById('checkinAmountModal').classList.add('active');
}

/**
 * 加载签到金额选项
 */
async function loadCheckinAmountOptions() {
    try {
        const inventory = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        if (inventory.success) {
            const select = document.getElementById('checkinAmount');
            const infoDiv = document.getElementById('amountInventoryInfo');
            
            if (select) {
                select.innerHTML = '<option value="">请选择金额</option>' +
                    inventory.inventory
                        .map(item => {
                            const hasStock = item.available_count > 0;
                            const optionText = `¥${item.amount} (库存: ${item.available_count})`;
                            return `<option value="${item.amount}" ${!hasStock ? 'disabled' : ''}>${optionText}</option>`;
                        })
                        .join('');
                
                // 设置当前默认值
                select.value = AdminState.defaultCheckinAmount || '';
                
                // 监听选择变化
                select.onchange = () => {
                    const selectedAmount = select.value;
                    if (selectedAmount) {
                        const item = inventory.inventory.find(i => i.amount == selectedAmount);
                        if (item) {
                            if (item.available_count === 0) {
                                infoDiv.innerHTML = `<span style="color: var(--color-error);">⚠️ 该金额暂无库存，请先上传兑换码</span>`;
                            } else if (item.available_count < 10) {
                                infoDiv.innerHTML = `<span style="color: var(--color-warning);">⚠️ 库存较少，请及时补充</span>`;
                            } else {
                                infoDiv.innerHTML = `<span style="color: var(--color-success);">✓ 库存充足</span>`;
                            }
                        }
                    } else {
                        infoDiv.innerHTML = '';
                    }
                };
                
                // 触发一次以显示当前状态
                select.onchange();
            }
        }
    } catch (error) {
        console.error('Load checkin amount options error:', error);
        utils.showToast('加载金额选项失败', 'error');
    }
}

/**
 * 关闭签到金额设置弹窗
 */
function closeCheckinAmountModal() {
    const modal = document.getElementById('checkinAmountModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 确认设置签到金额
 */
async function confirmCheckinAmount() {
    const amount = document.getElementById('checkinAmount').value;
    
    if (!amount) {
        utils.showToast('请选择金额', 'error');
        return;
    }
    
    // 检查库存
    try {
        const inventory = await utils.get(CONFIG.API_ENDPOINTS.ADMIN_CODES.INVENTORY);
        if (inventory.success) {
            const item = inventory.inventory.find(i => i.amount == amount);
            if (!item || item.available_count === 0) {
                utils.showToast('该金额暂无库存，无法设置', 'error');
                return;
            }
        }
    } catch (error) {
        console.error('Check inventory error:', error);
    }
    
    // 保存设置（这里应该调用后端API保存，暂时保存在本地）
    AdminState.defaultCheckinAmount = parseFloat(amount);
    localStorage.setItem('defaultCheckinAmount', amount);
    
    utils.showToast(`签到金额已设置为 ¥${amount}`, 'success');
    closeCheckinAmountModal();
    
    // 更新显示
    const displayElement = document.getElementById('currentCheckinAmount');
    if (displayElement) {
        displayElement.textContent = `¥${amount}`;
    }
}

/**
 * 初始化签到金额设置
 */
function initCheckinAmountSetting() {
    // 从本地存储读取设置
    const savedAmount = localStorage.getItem('defaultCheckinAmount');
    if (savedAmount) {
        AdminState.defaultCheckinAmount = parseFloat(savedAmount);
    }
    
    // 更新显示
    const displayElement = document.getElementById('currentCheckinAmount');
    if (displayElement) {
        displayElement.textContent = AdminState.defaultCheckinAmount ? `¥${AdminState.defaultCheckinAmount}` : '未设置';
    }
}

// 导出全局函数
window.switchPage = switchPage;
window.refreshInventory = refreshInventory;
window.exportInventory = exportInventory;
window.clearUnused = clearUnused;
window.clearAllUnusedCodes = clearAllUnusedCodes;
window.loadCodes = loadCodes;
window.copyCode = copyCode;
window.resolvePending = resolvePending;
window.sendGift = sendGift;
window.searchRedemptions = searchRedemptions;
window.toggleUserSelection = toggleUserSelection;
window.toggleSelectAll = toggleSelectAll;
window.batchDistributeToSelected = batchDistributeToSelected;
window.showGiftModalForUser = showGiftModalForUser;
window.closeBatchDistributeModal = closeBatchDistributeModal;
window.confirmBatchDistribute = confirmBatchDistribute;
window.closeSingleGiftModal = closeSingleGiftModal;
window.confirmSingleGift = confirmSingleGift;
window.assignSingleCode = assignSingleCode;
window.toggleRedemptionsSort = toggleRedemptionsSort;
window.setDefaultCheckinAmount = setDefaultCheckinAmount;
window.closeCheckinAmountModal = closeCheckinAmountModal;
window.confirmCheckinAmount = confirmCheckinAmount;

// ============================================
// 弹窗控制系统
// ============================================

/**
 * 加载弹窗控制页面
 */
async function loadModalControl() {
    try {
        // 加载弹窗统计
        await refreshModalStats();

        utils.showToast('弹窗控制页面已加载', 'success');
    } catch (error) {
        console.error('加载弹窗控制页面失败:', error);
        utils.showToast('加载失败', 'error');
    }
}

/**
 * 刷新弹窗统计
 */
async function refreshModalStats() {
    try {
        // 这里需要后端提供弹窗统计API
        // 暂时使用模拟数据
        document.getElementById('modalStatsTotal').textContent = '0';
        document.getElementById('modalStatsUsers').textContent = '0';
        document.getElementById('modalStatsDismissed').textContent = '0';

        utils.showToast('弹窗统计已刷新', 'success');
    } catch (error) {
        console.error('刷新弹窗统计失败:', error);
        utils.showToast('刷新失败', 'error');
    }
}

/**
 * 重置所有弹窗状态
 */
async function resetAllModalStates() {
    try {
        const confirmed = confirm('确定要重置所有用户的弹窗状态吗？\n这将允许所有弹窗重新显示。');
        if (!confirmed) return;

        const result = await utils.post('/api/admin/modal/reset', {
            reset_type: 'all'
        });

        if (result.success) {
            utils.showToast(`已重置 ${result.affected_rows} 条弹窗记录`, 'success');
            await refreshModalStats();
        } else {
            utils.showToast(result.message || '重置失败', 'error');
        }
    } catch (error) {
        console.error('重置所有弹窗状态失败:', error);
        utils.showToast('重置失败', 'error');
    }
}

/**
 * 重置赠送弹窗
 */
async function resetGiftModals() {
    try {
        const confirmed = confirm('确定要重置所有赠送弹窗状态吗？');
        if (!confirmed) return;

        const result = await utils.post('/api/admin/modal/reset', {
            reset_type: 'type',
            modal_type: 'gift'
        });

        if (result.success) {
            utils.showToast(`已重置 ${result.affected_rows} 条赠送弹窗记录`, 'success');
            await refreshModalStats();
        } else {
            utils.showToast(result.message || '重置失败', 'error');
        }
    } catch (error) {
        console.error('重置赠送弹窗失败:', error);
        utils.showToast('重置失败', 'error');
    }
}

/**
 * 重置用户弹窗状态
 */
async function resetUserModalState() {
    try {
        const userId = document.getElementById('resetUserId').value;
        const modalType = document.getElementById('resetModalType').value;

        if (!userId) {
            utils.showToast('请输入用户ID', 'warning');
            return;
        }

        const confirmed = confirm(`确定要重置用户 ${userId} 的${modalType ? modalType + '类型' : '所有'}弹窗状态吗？`);
        if (!confirmed) return;

        const requestData = {
            reset_type: modalType ? 'specific' : 'user',
            user_id: parseInt(userId)
        };

        if (modalType) {
            requestData.modal_type = modalType;
        }

        const result = await utils.post('/api/admin/modal/reset', requestData);

        if (result.success) {
            utils.showToast(`已重置 ${result.affected_rows} 条弹窗记录`, 'success');
            document.getElementById('resetUserId').value = '';
            document.getElementById('resetModalType').value = '';
            await refreshModalStats();
        } else {
            utils.showToast(result.message || '重置失败', 'error');
        }
    } catch (error) {
        console.error('重置用户弹窗状态失败:', error);
        utils.showToast('重置失败', 'error');
    }
}

// 导出弹窗控制函数
window.refreshModalStats = refreshModalStats;
window.resetAllModalStates = resetAllModalStates;
window.resetGiftModals = resetGiftModals;
window.resetUserModalState = resetUserModalState;