/**
 * V5版本签到功能
 * 支持库存不足处理、待分配机制等新功能
 */

let checkinData = null;
let isCheckedIn = false;

// 初始化签到功能
async function initCheckin() {
    await loadCheckinData();
    bindCheckinEvents();
}

// 加载签到数据
async function loadCheckinData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/checkin/status`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            checkinData = await response.json();
            updateCheckinUI();
            loadCheckinStats();
        }
    } catch (error) {
        console.error('加载签到数据失败:', error);
    }
}

// 更新签到界面
function updateCheckinUI() {
    const checkinBtn = document.getElementById('checkinBtn');
    const checkinStatus = document.getElementById('checkinStatus');
    const pendingNotice = document.getElementById('pendingNotice');
    
    if (checkinData && checkinData.hasCheckedIn) {
        isCheckedIn = true;
        checkinBtn.disabled = true;
        checkinBtn.innerHTML = `
            <span class="icon">✅</span>
            <span class="text">今日已签到</span>
        `;
        
        if (checkinData.status === 'completed') {
            checkinStatus.textContent = '今日已签到';
            checkinStatus.className = 'checkin-status completed';
            if (pendingNotice) pendingNotice.style.display = 'none';
        } else if (checkinData.status === 'pending_distribution') {
            checkinStatus.textContent = '今日已签到（待分配兑换码）';
            checkinStatus.className = 'checkin-status pending';
            if (pendingNotice) pendingNotice.style.display = 'block';
        }
    } else {
        isCheckedIn = false;
        checkinBtn.disabled = false;
        checkinBtn.innerHTML = `
            <span class="icon">📅</span>
            <span class="text">立即签到</span>
        `;
        checkinStatus.textContent = '今日尚未签到';
        checkinStatus.className = 'checkin-status';
        if (pendingNotice) pendingNotice.style.display = 'none';
    }
}

// 加载签到统计
async function loadCheckinStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/checkin/stats`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const stats = await response.json();
            updateStatsDisplay(stats);
        }
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

// 更新统计显示
function updateStatsDisplay(stats) {
    const totalDaysEl = document.getElementById('totalDays');
    const consecutiveDaysEl = document.getElementById('consecutiveDays');
    const totalCodesEl = document.getElementById('totalCodes');
    
    if (totalDaysEl) totalDaysEl.textContent = stats.totalDays || 0;
    if (consecutiveDaysEl) consecutiveDaysEl.textContent = stats.consecutiveDays || 0;
    if (totalCodesEl) totalCodesEl.textContent = stats.totalCodes || 0;
}

// 绑定签到事件
function bindCheckinEvents() {
    const checkinBtn = document.getElementById('checkinBtn');
    if (checkinBtn) {
        checkinBtn.addEventListener('click', handleCheckin);
    }
    
    // 复制按钮事件
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyRedemptionCode);
    }
    
    // 关闭弹窗事件
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', () => {
            document.getElementById('codeModal').style.display = 'none';
        });
    }
}

// 处理签到
async function handleCheckin() {
    if (isCheckedIn) {
        showToast('今日已签到', 'info');
        return;
    }
    
    const checkinBtn = document.getElementById('checkinBtn');
    const originalContent = checkinBtn.innerHTML;
    
    try {
        // 显示加载状态
        checkinBtn.disabled = true;
        checkinBtn.innerHTML = `
            <span class="icon">⏳</span>
            <span class="text">签到中...</span>
        `;
        
        const response = await fetch(`${API_BASE_URL}/api/checkin`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // 处理签到成功
            await handleCheckinSuccess(result);
        } else {
            // 处理签到失败
            showToast(result.message || '签到失败', 'error');
            checkinBtn.disabled = false;
            checkinBtn.innerHTML = originalContent;
        }
    } catch (error) {
        console.error('签到失败:', error);
        showToast('签到失败，请稍后重试', 'error');
        checkinBtn.disabled = false;
        checkinBtn.innerHTML = originalContent;
    }
}

// 处理签到成功
async function handleCheckinSuccess(result) {
    isCheckedIn = true;
    
    if (result.status === 'completed' && result.redemptionCode) {
        // 正常获得兑换码
        showRedemptionCodeModal(result.redemptionCode, result.amount);
        showToast('签到成功！获得兑换码', 'success');
    } else if (result.status === 'pending_distribution') {
        // 待分配状态
        showToast('签到成功！兑换码待管理员分配', 'info');
        const pendingNotice = document.getElementById('pendingNotice');
        if (pendingNotice) {
            pendingNotice.style.display = 'block';
        }
    }
    
    // 更新UI状态
    updateCheckinUI();
    
    // 重新加载数据
    await loadCheckinData();
    await loadCheckinStats();
    
    // 如果有日历，更新日历
    if (typeof updateCalendar === 'function') {
        updateCalendar();
    }
}

// 显示兑换码弹窗
function showRedemptionCodeModal(code, amount) {
    const modal = document.getElementById('codeModal');
    const codeInput = document.getElementById('codeInput');
    const codeAmount = document.getElementById('codeAmount');
    const amountValue = document.getElementById('amountValue');
    
    if (modal && codeInput) {
        codeInput.value = code;
        
        if (amount && codeAmount && amountValue) {
            amountValue.textContent = `¥${amount}`;
            codeAmount.style.display = 'block';
        } else if (codeAmount) {
            codeAmount.style.display = 'none';
        }
        
        modal.style.display = 'flex';
        
        // 自动选中兑换码文本
        codeInput.select();
    }
}

// 复制兑换码
async function copyRedemptionCode() {
    const codeInput = document.getElementById('codeInput');
    const copyBtn = document.getElementById('copyBtn');
    
    if (!codeInput || !copyBtn) return;
    
    try {
        await navigator.clipboard.writeText(codeInput.value);
        
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '已复制';
        copyBtn.style.background = 'var(--success-color)';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.background = '';
        }, 2000);
        
        showToast('兑换码已复制到剪贴板', 'success');
    } catch (error) {
        console.error('复制失败:', error);
        
        // 降级方案：选中文本
        codeInput.select();
        document.execCommand('copy');
        showToast('请手动复制兑换码', 'info');
    }
}

// 检查待分配状态
async function checkPendingStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/checkin/pending`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.hasPending) {
                const pendingNotice = document.getElementById('pendingNotice');
                if (pendingNotice) {
                    pendingNotice.style.display = 'block';
                }
            }
        }
    } catch (error) {
        console.error('检查待分配状态失败:', error);
    }
}

// 获取今日签到状态
async function getTodayCheckinStatus() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/checkin/today`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            return data;
        }
    } catch (error) {
        console.error('获取今日签到状态失败:', error);
    }
    
    return null;
}

// 导出函数供其他模块使用
window.checkinV5 = {
    init: initCheckin,
    loadData: loadCheckinData,
    handleCheckin: handleCheckin,
    checkPending: checkPendingStatus,
    getTodayStatus: getTodayCheckinStatus
};

// 页面加载时自动初始化（如果在签到页面）
document.addEventListener('DOMContentLoaded', () => {
    const checkinBtn = document.getElementById('checkinBtn');
    if (checkinBtn) {
        initCheckin();
    }
});