// 当前用户信息
let currentUser = null;

// 检查认证状态
async function checkAuth() {
    try {
        // 先检查本地缓存
        const cachedUser = getLocalStorage(APP_CONFIG.STORAGE_KEYS.USER_INFO);
        if (cachedUser) {
            currentUser = cachedUser;
            updateUserUI(cachedUser);
        }
        
        // 向服务器验证
        const data = await get(`${API_BASE_URL}/api/auth/me`);
        currentUser = data.user;
        
        // 更新本地缓存
        setLocalStorage(APP_CONFIG.STORAGE_KEYS.USER_INFO, currentUser);
        updateUserUI(currentUser);
        
        return currentUser;
    } catch (error) {
        // 未登录或会话过期
        currentUser = null;
        removeLocalStorage(APP_CONFIG.STORAGE_KEYS.USER_INFO);
        updateUserUI(null);
        return null;
    }
}

// 更新用户界面
function updateUserUI(user) {
    const userInfo = document.getElementById('userInfo');
    if (!userInfo) return;
    
    if (user) {
        userInfo.innerHTML = `
            <img src="${user.avatar_url || 'assets/icons/default-avatar.svg'}" alt="${user.username}" class="user-avatar">
            <span class="user-name">${user.username}</span>
            <button class="logout-btn" onclick="logout()">退出</button>
        `;
    } else {
        userInfo.innerHTML = `
            <button class="login-btn" onclick="login()">使用 Linux Do 登录</button>
        `;
    }
}

// 登录
async function login() {
    try {
        showLoading();
        const data = await get(`${API_BASE_URL}/api/auth/login`);
        
        if (data.authUrl) {
            // 保存当前页面，登录后返回
            sessionStorage.setItem('redirect_after_login', window.location.href);
            // 重定向到 OAuth2 授权页面
            window.location.href = data.authUrl;
        } else {
            showToast('获取登录链接失败', 'error');
        }
    } catch (error) {
        console.error('登录失败:', error);
        showToast('登录失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

// 登出
async function logout() {
    try {
        showLoading();
        await post(`${API_BASE_URL}/api/auth/logout`);
        
        // 清除本地数据
        currentUser = null;
        removeLocalStorage(APP_CONFIG.STORAGE_KEYS.USER_INFO);
        
        // 更新界面
        updateUserUI(null);
        
        // 如果在需要登录的页面，跳转到首页
        if (window.location.pathname.includes('codes.html')) {
            window.location.href = 'index.html';
        } else {
            // 刷新当前页面
            window.location.reload();
        }
    } catch (error) {
        console.error('登出失败:', error);
        showToast('登出失败，请稍后重试', 'error');
    } finally {
        hideLoading();
    }
}

// 处理 OAuth2 回调
async function handleAuthCallback() {
    const code = getUrlParam('code');
    if (!code) return;
    
    try {
        showLoading();
        const data = await get(`${API_BASE_URL}/api/auth/callback`, { code });
        
        if (data.success && data.user) {
            // 保存用户信息
            currentUser = data.user;
            setLocalStorage(APP_CONFIG.STORAGE_KEYS.USER_INFO, currentUser);
            
            // 获取登录前的页面
            const redirectUrl = sessionStorage.getItem('redirect_after_login') || 'index.html';
            sessionStorage.removeItem('redirect_after_login');
            
            // 跳转回原页面
            window.location.href = redirectUrl;
        } else {
            showToast('登录失败', 'error');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        }
    } catch (error) {
        console.error('处理登录回调失败:', error);
        showToast('登录失败: ' + error.message, 'error');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);
    } finally {
        hideLoading();
    }
}

// 需要登录才能访问的功能
function requireLogin(callback) {
    if (currentUser) {
        callback();
    } else {
        showToast('请先登录', 'warning');
        setTimeout(() => {
            login();
        }, 1000);
    }
}

// 获取当前用户
function getCurrentUser() {
    return currentUser;
}

// 页面加载时检查是否是 OAuth2 回调
if (window.location.pathname.includes('auth/callback') || getUrlParam('code')) {
    handleAuthCallback();
}