/**
 * 管理员兑换码管理 V5
 * 支持金额管理、面额筛选、批量分发等功能
 */

// 全局变量
let currentTab = 'codes';
let currentPage = 1;
let currentAmountFilter = '';
let currentStatusFilter = '';
let selectedFile = null;
let selectedUsers = new Set();
let allUsers = [];
let inventoryData = [];

// 标签页切换
const tabBtns = document.querySelectorAll('.tab-btn');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === currentTab) return;
        
        // 更新按钮状态
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // 更新内容显示
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tab}-tab`).classList.add('active');
        
        currentTab = tab;
        
        // 加载对应数据
        switch(tab) {
            case 'codes':
                loadCodes();
                break;
            case 'upload':
                resetUploadForm();
                break;
            case 'inventory':
                loadInventory();
                break;
            case 'distribute':
                loadDistributeData();
                break;
        }
    });
});

// ============================================
// 兑换码列表功能
// ============================================

async function loadCodes(page = 1) {
    try {
        showLoading();
        currentPage = page;
        
        const params = new URLSearchParams({
            page: page,
            limit: 50
        });
        
        if (currentAmountFilter) {
            params.append('amount', currentAmountFilter);
        }
        
        if (currentStatusFilter) {
            params.append('status', currentStatusFilter);
        }
        
        const response = await fetch(`${API_BASE_URL}/api/admin/codes/list?${params}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('加载失败');
        }
        
        const data = await response.json();
        displayCodes(data.codes);
        updateCodesPagination(data.pagination);
    } catch (error) {
        console.error('加载兑换码失败:', error);
        showToast('加载兑换码失败', 'error');
    } finally {
        hideLoading();
    }
}

function displayCodes(codes) {
    const tbody = document.getElementById('codesTableBody');
    
    if (codes.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">暂无兑换码</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = codes.map(code => {
        const statusText = code.is_used ? '已分配' : '待分配';
        const statusClass = code.is_used ? 'distributed' : 'pending';
        const userDisplay = code.username || '-';
        const timeDisplay = code.distribution_time ? formatDateTime(code.distribution_time) : '-';
        
        return `
            <tr>
                <td><span class="code-badge">${code.code}</span></td>
                <td>
                    ${code.amount ? `<span class="amount-badge">¥${code.amount}</span>` : '-'}
                </td>
                <td>${userDisplay}</td>
                <td>${timeDisplay}</td>
                <td>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function updateCodesPagination(pagination) {
    const paginationEl = document.getElementById('codesPagination');
    
    if (pagination.totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    
    paginationEl.innerHTML = `
        <button ${!pagination.hasPrev ? 'disabled' : ''} 
                onclick="loadCodes(${currentPage - 1})">
            上一页
        </button>
        <span class="page-info">
            第 ${pagination.page} / ${pagination.totalPages} 页
        </span>
        <button ${!pagination.hasNext ? 'disabled' : ''} 
                onclick="loadCodes(${currentPage + 1})">
            下一页
        </button>
    `;
}

// 筛选功能
document.getElementById('amountFilter').addEventListener('change', (e) => {
    currentAmountFilter = e.target.value;
    loadCodes(1);
});

document.getElementById('statusFilter').addEventListener('change', (e) => {
    currentStatusFilter = e.target.value;
    loadCodes(1);
});

// 一键清空功能
document.getElementById('clearCodesBtn').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.add('show');
    document.getElementById('clearConfirmModal').classList.add('show');
    document.getElementById('confirmInput').value = '';
    document.getElementById('confirmInput').focus();
});

document.getElementById('cancelClearBtn').addEventListener('click', () => {
    document.getElementById('modalOverlay').classList.remove('show');
    document.getElementById('clearConfirmModal').classList.remove('show');
});

document.getElementById('confirmClearBtn').addEventListener('click', async () => {
    const confirmText = document.getElementById('confirmInput').value;
    
    if (confirmText !== '一键清空') {
        showToast('请输入"一键清空"以确认操作', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE_URL}/api/admin/codes/clear-unused`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ confirmation: '一键清空' })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(data.message, 'success');
            document.getElementById('modalOverlay').classList.remove('show');
            document.getElementById('clearConfirmModal').classList.remove('show');
            loadCodes(1);
            loadInventory();
        } else {
            showToast(data.error || '清空失败', 'error');
        }
    } catch (error) {
        console.error('清空失败:', error);
        showToast('清空失败', 'error');
    } finally {
        hideLoading();
    }
});

// ============================================
// 上传兑换码功能
// ============================================

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadForm = document.getElementById('uploadForm');

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    if (!file.name.endsWith('.txt')) {
        showToast('请选择 .txt 文件', 'error');
        return;
    }
    
    selectedFile = file;
    document.getElementById('fileName').value = file.name;
    uploadForm.classList.add('show');
    document.getElementById('codeAmount').focus();
}

document.getElementById('confirmUploadBtn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('codeAmount').value);
    
    if (!amount || amount <= 0) {
        showToast('请输入有效的金额', 'error');
        return;
    }
    
    if (!selectedFile) {
        showToast('请选择文件', 'error');
        return;
    }
    
    try {
        showLoading();
        
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('amount', amount);
        
        const response = await fetch(`${API_BASE_URL}/api/admin/codes/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(`上传成功！新增 ${data.summary.newCodes} 个兑换码`, 'success');
            resetUploadForm();
            
            // 如果在兑换码列表页，刷新列表
            if (currentTab === 'codes') {
                loadCodes(1);
            }
        } else {
            showToast(data.error || '上传失败', 'error');
        }
    } catch (error) {
        console.error('上传失败:', error);
        showToast('上传失败', 'error');
    } finally {
        hideLoading();
    }
});

document.getElementById('cancelUploadBtn').addEventListener('click', () => {
    resetUploadForm();
});

function resetUploadForm() {
    selectedFile = null;
    fileInput.value = '';
    document.getElementById('fileName').value = '';
    document.getElementById('codeAmount').value = '';
    uploadForm.classList.remove('show');
}

// ============================================
// 库存统计功能
// ============================================

async function loadInventory() {
    try {
        showLoading();
        
        // 加载总体统计
        const statsResponse = await fetch(`${API_BASE_URL}/api/admin/codes/stats`, {
            credentials: 'include'
        });
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            
            document.getElementById('totalCodes').textContent = statsData.stats.total || 0;
            document.getElementById('unusedCodes').textContent = statsData.stats.unused || 0;
            document.getElementById('usedCodes').textContent = statsData.stats.used || 0;
            
            const usageRate = statsData.stats.total > 0 
                ? ((statsData.stats.used / statsData.stats.total) * 100).toFixed(1) + '%'
                : '0%';
            document.getElementById('usageRate').textContent = usageRate;
        }
        
        // 加载面额库存
        const inventoryResponse = await fetch(`${API_BASE_URL}/api/admin/codes/inventory`, {
            credentials: 'include'
        });
        
        if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json();
            displayInventoryDetails(inventoryData.inventory);
        }
    } catch (error) {
        console.error('加载库存失败:', error);
        showToast('加载库存失败', 'error');
    } finally {
        hideLoading();
    }
}

function displayInventoryDetails(inventory) {
    inventoryData = inventory;
    const container = document.getElementById('inventoryDetails');
    
    if (inventory.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无库存</div>';
        return;
    }
    
    container.innerHTML = inventory.map(item => `
        <div class="inventory-item">
            <div class="inventory-amount">¥${item.amount}</div>
            <div class="inventory-count">
                可用: ${item.available_count} / ${item.total_count}
            </div>
        </div>
    `).join('');
}

// ============================================
// 批量分发功能
// ============================================

async function loadDistributeData() {
    try {
        showLoading();
        
        // 加载用户列表
        const usersResponse = await fetch(`${API_BASE_URL}/api/admin/distribute/pending-users`, {
            credentials: 'include'
        });
        
        if (usersResponse.ok) {
            const usersData = await usersResponse.json();
            
            // 获取所有用户（这里简化处理，实际应该有专门的用户列表API）
            // 暂时使用待分配用户作为示例
            allUsers = usersData.pendingUsers || [];
            displayUsersList();
        }
        
        // 加载可用面额
        const inventoryResponse = await fetch(`${API_BASE_URL}/api/admin/codes/inventory`, {
            credentials: 'include'
        });
        
        if (inventoryResponse.ok) {
            const inventoryData = await inventoryResponse.json();
            updateAmountOptions(inventoryData.inventory);
        }
    } catch (error) {
        console.error('加载分发数据失败:', error);
        showToast('加载分发数据失败', 'error');
    } finally {
        hideLoading();
    }
}

function displayUsersList() {
    const container = document.getElementById('usersList');
    
    if (allUsers.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无用户</div>';
        return;
    }
    
    container.innerHTML = allUsers.map(user => `
        <div style="padding: 0.5rem; border-bottom: 1px solid var(--border-color);">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" class="user-checkbox" data-user-id="${user.user_id}">
                <span>${user.username} (ID: ${user.linux_do_id})</span>
            </label>
        </div>
    `).join('');
    
    // 绑定复选框事件
    document.querySelectorAll('.user-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const userId = parseInt(e.target.dataset.userId);
            if (e.target.checked) {
                selectedUsers.add(userId);
            } else {
                selectedUsers.delete(userId);
            }
            updateSelectedCount();
        });
    });
}

function updateAmountOptions(inventory) {
    const select = document.getElementById('distributeAmount');
    
    const availableAmounts = inventory.filter(item => item.available_count > 0);
    
    if (availableAmounts.length === 0) {
        select.innerHTML = '<option value="">无可用库存</option>';
        return;
    }
    
    select.innerHTML = '<option value="">请选择面额</option>' +
        availableAmounts.map(item => 
            `<option value="${item.amount}">¥${item.amount} (库存: ${item.available_count})</option>`
        ).join('');
    
    select.addEventListener('change', (e) => {
        const amount = e.target.value;
        if (amount) {
            const item = inventory.find(i => i.amount == amount);
            document.getElementById('amountInventory').textContent = 
                `当前库存: ${item.available_count} 个`;
        } else {
            document.getElementById('amountInventory').textContent = '';
        }
    });
}

document.getElementById('selectAllUsers').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.user-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = e.target.checked;
        const userId = parseInt(checkbox.dataset.userId);
        if (e.target.checked) {
            selectedUsers.add(userId);
        } else {
            selectedUsers.delete(userId);
        }
    });
    updateSelectedCount();
});

function updateSelectedCount() {
    document.getElementById('selectedCount').textContent = selectedUsers.size;
}

document.getElementById('distributeBtn').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('distributeAmount').value);
    
    if (selectedUsers.size === 0) {
        showToast('请选择用户', 'error');
        return;
    }
    
    if (!amount) {
        showToast('请选择面额', 'error');
        return;
    }
    
    if (!confirm(`确定要为 ${selectedUsers.size} 个用户分发 ¥${amount} 的兑换码吗？`)) {
        return;
    }
    
    try {
        showLoading();
        
        const response = await fetch(`${API_BASE_URL}/api/admin/distribute/batch`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_ids: Array.from(selectedUsers),
                amount: amount,
                confirm: true
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast(data.message, 'success');
            selectedUsers.clear();
            updateSelectedCount();
            document.getElementById('selectAllUsers').checked = false;
            loadDistributeData();
        } else {
            showToast(data.error || '分发失败', 'error');
        }
    } catch (error) {
        console.error('分发失败:', error);
        showToast('分发失败', 'error');
    } finally {
        hideLoading();
    }
});

// ============================================
// 初始化
// ============================================

async function initPage() {
    const user = await requireAdmin();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }
    
    // 加载初始数据
    loadCodes();
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', initPage);