/**
 * KYX 签到系统 - 工具函数
 */

// ============================================
// HTTP 请求工具
// ============================================

/**
 * 发送HTTP请求
 */
async function request(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const hasBody = options.body != null;
    
    // 只在有JSON body时设置Content-Type，避免GET请求触发预检
    const headers = {
        ...(method !== 'GET' && hasBody && typeof options.body === 'string' ? 
            { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    const config = {
        ...window.CONFIG.REQUEST_CONFIG,
        ...options,
        headers
    };

    try {
        const response = await fetch(window.CONFIG.API_BASE_URL + url, config);
        
        // 处理204 No Content和空响应
        const contentType = response.headers.get('content-type') || '';
        const isNoContent = response.status === 204 || response.headers.get('content-length') === '0';
        
        let data = null;
        if (!isNoContent && contentType.includes('application/json')) {
            try {
                data = await response.json();
            } catch (jsonError) {
                console.warn('JSON解析失败，可能是空响应:', jsonError);
                data = null;
            }
        }

        if (!response.ok) {
            const errorMessage = data && data.error ? data.error : `请求失败: ${response.status}`;
            throw new Error(errorMessage);
        }

        // 对于204或空响应，返回成功标识
        return data || { success: true };
    } catch (error) {
        console.error('Request error:', error);
        throw error;
    }
}

/**
 * GET请求
 */
async function get(url, params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    return request(fullUrl, { method: 'GET' });
}

/**
 * 检查用户认证状态
 */
async function checkAuth() {
    try {
        const data = await get('/api/auth/me');
        if (data.success && data.user) {
            return data.user;
        }
        
        // 用户未认证，暂时注释掉重定向以便调试前端样式
        // if (!user) {
        //     window.location.href = 'login.html';
        // }
        console.log('用户未认证，但重定向已暂时禁用以便调试');
        return null;
    } catch (error) {
        console.error('Auth check failed:', error);
        // window.location.href = 'login.html';
        console.log('认证检查失败，但重定向已暂时禁用以便调试');
        return null;
    }
}

/**
 * DELETE请求
 */
async function del(url, data = null) {
    const options = { method: 'DELETE' };
    if (data) {
        options.body = JSON.stringify(data);
    }
    return request(url, options);
}

// ============================================
// Toast 通知
// ============================================

/**
 * 显示Toast通知
 */
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    }[type] || 'ℹ️';
    
    toast.innerHTML = `
        <span>${icon}</span>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // 自动移除
    setTimeout(() => {
        toast.style.animation = 'toastSlideOut 0.3s ease-out';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, duration);
}

/**
 * 创建Toast容器
 */
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// ============================================
// 主题管理
// ============================================

/**
 * 获取当前主题
 */
function getCurrentTheme() {
    return localStorage.getItem(window.CONFIG.APP_CONFIG.STORAGE_KEYS.THEME) || 
           window.CONFIG.APP_CONFIG.DEFAULT_THEME;
}

/**
 * 设置主题
 */
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(window.CONFIG.APP_CONFIG.STORAGE_KEYS.THEME, theme);
    updateThemeIcon(theme);
}

/**
 * 切换主题
 */
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    return newTheme;
}

/**
 * 更新主题图标
 */
function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = theme === 'dark' ? '🌙' : '☀️';
    }
}

// ============================================
// 日期时间工具
// ============================================

/**
 * 格式化日期
 */
function formatDate(date, format = 'YYYY-MM-DD') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 获取相对时间
 */
function getRelativeTime(date) {
    const now = new Date();
    const target = new Date(date);
    const diff = now - target;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    if (seconds > 0) return `${seconds}秒前`;
    return '刚刚';
}

// ============================================
// 本地存储
// ============================================

/**
 * 保存到本地存储
 */
function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error('Save to storage error:', error);
        return false;
    }
}

/**
 * 从本地存储读取
 */
function getFromStorage(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
        console.error('Get from storage error:', error);
        return defaultValue;
    }
}

/**
 * 从本地存储删除
 */
function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Remove from storage error:', error);
        return false;
    }
}

// ============================================
// 用户认证
// ============================================

/**
 * 检查用户登录状态
 */
async function checkAuth() {
    try {
        console.log('Checking auth status...');
        const data = await get(window.CONFIG.API_ENDPOINTS.AUTH.USER_INFO);
        console.log('Auth response:', data);
        
        if (data.success && data.user) {
            saveToStorage(window.CONFIG.APP_CONFIG.STORAGE_KEYS.USER_INFO, data.user);
            return data.user;
        }
        
        console.warn('Auth check failed: No user data in response');
        return null;
    } catch (error) {
        console.error('Auth check error:', error);
        console.error('API URL:', window.CONFIG.API_BASE_URL + window.CONFIG.API_ENDPOINTS.AUTH.USER_INFO);
        
        // 如果是网络错误，可能是CORS问题或API不可用
        if (error.message.includes('Failed to fetch')) {
            console.error('Network error - possible CORS issue or API is down');
        }
        
        return null;
    }
}

/**
 * 获取当前用户信息
 */
function getCurrentUser() {
    return getFromStorage(window.CONFIG.APP_CONFIG.STORAGE_KEYS.USER_INFO);
}

/**
 * 退出登录
 */
async function logout() {
    try {
        await post(window.CONFIG.API_ENDPOINTS.AUTH.LOGOUT);
        removeFromStorage(window.CONFIG.APP_CONFIG.STORAGE_KEYS.USER_INFO);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('退出登录失败', 'error');
    }
}

// ============================================
// 复制到剪贴板
// ============================================

/**
 * 复制文本到剪贴板
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
        } else {
            // 降级方案
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-999999px';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
        }
        return true;
    } catch (error) {
        console.error('Copy to clipboard error:', error);
        return false;
    }
}

// ============================================
// 防抖和节流
// ============================================

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ============================================
// 加载状态管理
// ============================================

/**
 * 显示加载状态
 */
function showLoading(selector = 'body') {
    const element = document.querySelector(selector);
    if (element) {
        element.classList.add('loading');
        element.setAttribute('data-loading', 'true');
    }
}

/**
 * 隐藏加载状态
 */
function hideLoading(selector = 'body') {
    const element = document.querySelector(selector);
    if (element) {
        element.classList.remove('loading');
        element.removeAttribute('data-loading');
    }
}

/**
 * 创建骨架屏
 */
function createSkeleton(type = 'text', count = 3) {
    const skeletons = [];
    for (let i = 0; i < count; i++) {
        skeletons.push(`<div class="skeleton skeleton-${type}"></div>`);
    }
    return skeletons.join('');
}

// ============================================
// 数字格式化
// ============================================

/**
 * 格式化数字
 */
function formatNumber(num, decimals = 0) {
    return new Intl.NumberFormat('zh-CN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

/**
 * 格式化金额
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY'
    }).format(amount);
}

// ============================================
// 导出工具函数
// ============================================

window.utils = {
    // HTTP请求
    request,
    get,
    post,
    put,
    del,
    
    // Toast通知
    showToast,
    
    // 主题管理
    getCurrentTheme,
    setTheme,
    toggleTheme,
    
    // 日期时间
    formatDate,
    getRelativeTime,
    
    // 本地存储
    saveToStorage,
    getFromStorage,
    removeFromStorage,
    
    // 用户认证
    checkAuth,
    getCurrentUser,
    logout,
    
    // 剪贴板
    copyToClipboard,
    
    // 防抖节流
    debounce,
    throttle,
    
    // 加载状态
    showLoading,
    hideLoading,
    createSkeleton,
    
    // 数字格式化
    formatNumber,
    formatCurrency
};