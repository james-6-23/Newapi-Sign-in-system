// 认证相关功能 - V2 版本（支持管理员认证）

// 检查用户认证状态
async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/user`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.user;
        }
        
        return null;
    } catch (error) {
        console.error('检查认证状态失败:', error);
        return null;
    }
}

// 需要认证的页面保护
async function requireAuth(redirectTo = 'login.html') {
    const user = await checkAuth();
    if (!user) {
        window.location.href = redirectTo;
        return null;
    }
    return user;
}

// 需要管理员权限的页面保护
async function requireAdmin(redirectTo = 'login.html') {
    const user = await checkAuth();
    if (!user || !user.is_admin) {
        showToast('需要管理员权限', 'error');
        setTimeout(() => {
            window.location.href = redirectTo;
        }, 1500);
        return null;
    }
    return user;
}

// 退出登录
async function logout() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            window.location.href = 'login.html';
        } else {
            showToast('退出登录失败', 'error');
        }
    } catch (error) {
        console.error('退出登录失败:', error);
        showToast('退出登录失败', 'error');
    }
}

// 管理员登录
async function adminLogin(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            return { success: true };
        } else {
            return { 
                success: false, 
                error: data.error || '登录失败' 
            };
        }
    } catch (error) {
        console.error('管理员登录失败:', error);
        return { 
            success: false, 
            error: '网络错误，请稍后重试' 
        };
    }
}

// 更新页面用户信息显示
async function updateUserDisplay() {
    const user = await checkAuth();
    const userInfoElements = document.querySelectorAll('.user-info');
    
    userInfoElements.forEach(element => {
        if (user) {
            const userNameEl = element.querySelector('.user-name');
            const userAvatarEl = element.querySelector('.user-avatar');
            
            if (userNameEl) {
                userNameEl.textContent = user.is_admin ? '管理员' : user.username;
            }
            
            if (userAvatarEl && user.avatar_url) {
                userAvatarEl.src = user.avatar_url;
                userAvatarEl.alt = user.username;
            }
        }
    });
}

// 初始化认证状态
async function initAuth() {
    const user = await checkAuth();
    if (user) {
        updateUserDisplay();
    }
    return user;
}