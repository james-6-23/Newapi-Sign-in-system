// 签到相关功能

// 检查今日签到状态
async function checkTodayStatus() {
    try {
        const data = await get(`${API_BASE_URL}/api/checkin/today`);
        updateCheckinUI(data);
        return data;
    } catch (error) {
        console.error('检查签到状态失败:', error);
        return null;
    }
}

// 更新签到界面
function updateCheckinUI(data) {
    const checkinBtn = document.getElementById('checkinBtn');
    const checkinStatus = document.getElementById('checkinStatus');
    const totalDays = document.getElementById('totalDays');
    const consecutiveDays = document.getElementById('consecutiveDays');
    
    if (!checkinBtn || !checkinStatus) return;
    
    if (data.checkedIn) {
        checkinBtn.classList.add('disabled');
        checkinBtn.innerHTML = `
            <span class="icon">✅</span>
            <span class="text">今日已签到</span>
        `;
        checkinStatus.textContent = `今日兑换码：${data.code}`;
        checkinStatus.style.color = 'var(--success-color)';
    } else {
        // 检查是否还有可用兑换码
        if (data.codesAvailable === false) {
            checkinBtn.classList.add('disabled');
            checkinBtn.innerHTML = `
                <span class="icon">❌</span>
                <span class="text">兑换码已发完</span>
            `;
            checkinStatus.textContent = '兑换码已全部发放完毕，请联系管理员补充';
            checkinStatus.style.color = 'var(--error-color)';
        } else {
            checkinBtn.classList.remove('disabled');
            checkinBtn.innerHTML = `
                <span class="icon">📅</span>
                <span class="text">立即签到</span>
            `;
            checkinStatus.textContent = '今日还未签到，快来领取兑换码吧！';
            checkinStatus.style.color = 'var(--text-secondary)';
        }
    }
    
    // 更新统计数据
    if (data.stats) {
        if (totalDays) totalDays.textContent = data.stats.totalDays;
        if (consecutiveDays) consecutiveDays.textContent = data.stats.consecutiveDays;
    }
}

// 执行签到
async function doCheckin() {
    const checkinBtn = document.getElementById('checkinBtn');
    if (checkinBtn.classList.contains('disabled')) {
        showToast('今日已签到', 'warning');
        return;
    }
    
    try {
        showLoading();
        const data = await post(`${API_BASE_URL}/api/checkin`);
        
        if (data.success) {
            // 更新界面
            updateCheckinUI({
                checkedIn: true,
                code: data.code,
                stats: data.stats
            });
            
            // 显示兑换码弹窗
            showCodeModal(data.code);
            
            // 刷新日历
            if (window.refreshCalendar) {
                window.refreshCalendar();
            }
            
            showToast('签到成功！', 'success');
        } else {
            if (data.error === 'no_codes_available') {
                showToast('兑换码已发完，请联系管理员', 'warning');
                // 更新按钮状态
                checkinBtn.classList.add('disabled');
                checkinBtn.innerHTML = `
                    <span class="icon">❌</span>
                    <span class="text">兑换码已发完</span>
                `;
            } else {
                showToast(data.message || '签到失败', 'error');
            }
        }
    } catch (error) {
        console.error('签到失败:', error);
        showToast('签到失败: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// 显示兑换码弹窗
function showCodeModal(code) {
    const modal = document.getElementById('codeModal');
    const codeInput = document.getElementById('codeInput');
    
    if (!modal || !codeInput) return;
    
    codeInput.value = code;
    modal.classList.add('show');
}

// 关闭兑换码弹窗
function closeCodeModal() {
    const modal = document.getElementById('codeModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// 复制兑换码
async function copyCode() {
    const codeInput = document.getElementById('codeInput');
    if (!codeInput) return;
    
    const success = await copyToClipboard(codeInput.value);
    if (success) {
        showToast('兑换码已复制到剪贴板', 'success');
        
        // 改变按钮文字提示
        const copyBtn = document.getElementById('copyBtn');
        if (copyBtn) {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '已复制';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        }
    } else {
        showToast('复制失败，请手动复制', 'error');
    }
}

// 初始化签到功能
function initCheckin() {
    // 签到按钮点击事件
    const checkinBtn = document.getElementById('checkinBtn');
    if (checkinBtn) {
        checkinBtn.addEventListener('click', () => {
            requireLogin(doCheckin);
        });
    }
    
    // 复制按钮点击事件
    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyCode);
    }
    
    // 关闭弹窗按钮
    const closeModal = document.getElementById('closeModal');
    if (closeModal) {
        closeModal.addEventListener('click', closeCodeModal);
    }
    
    // 点击弹窗外部关闭
    const codeModal = document.getElementById('codeModal');
    if (codeModal) {
        codeModal.addEventListener('click', (e) => {
            if (e.target === codeModal) {
                closeCodeModal();
            }
        });
    }
}

// 显示签到区域
function showCheckinSection() {
    const checkinSection = document.getElementById('checkinSection');
    const calendarSection = document.getElementById('calendarSection');
    const loginPrompt = document.getElementById('loginPrompt');
    
    if (checkinSection) checkinSection.style.display = 'block';
    if (calendarSection) calendarSection.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
}

// 显示登录提示
function showLoginPrompt() {
    const checkinSection = document.getElementById('checkinSection');
    const calendarSection = document.getElementById('calendarSection');
    const loginPrompt = document.getElementById('loginPrompt');
    
    if (checkinSection) checkinSection.style.display = 'none';
    if (calendarSection) calendarSection.style.display = 'none';
    if (loginPrompt) loginPrompt.style.display = 'block';
}