// 主应用程序入口

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化各个模块
    initApp();
});

// 初始化应用
async function initApp() {
    try {
        // 检查认证状态
        const user = await checkAuth();
        
        if (user) {
            // 已登录
            showCheckinSection();
            
            // 显示管理员链接
            if (user.is_admin) {
                const adminLink = document.getElementById('adminLink');
                if (adminLink) {
                    adminLink.style.display = 'flex';
                }
            }
            
            // 初始化签到功能
            initCheckin();
            
            // 初始化日历
            initCalendar();
            
            // 检查今日签到状态
            await checkTodayStatus();
            
            // 加载日历数据
            await updateCalendar();
        } else {
            // 未登录
            showLoginPrompt();
        }
        
        // 绑定登录按钮事件
        bindLoginButtons();
        
    } catch (error) {
        console.error('应用初始化失败:', error);
        showToast('应用初始化失败', 'error');
    }
}

// 绑定登录按钮事件
function bindLoginButtons() {
    // 头部登录按钮
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    }
    
    // 大登录按钮
    const loginBtnLarge = document.getElementById('loginBtnLarge');
    if (loginBtnLarge) {
        loginBtnLarge.addEventListener('click', login);
    }
}

// 处理页面可见性变化
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentUser) {
        // 页面重新可见时，刷新签到状态
        checkTodayStatus();
    }
});

// 监听存储变化（多标签页同步）
window.addEventListener('storage', (e) => {
    if (e.key === APP_CONFIG.STORAGE_KEYS.USER_INFO) {
        // 用户信息变化，重新加载页面
        window.location.reload();
    }
});

// 全局错误处理
window.addEventListener('error', (event) => {
    console.error('全局错误:', event.error);
    // 可以在这里添加错误上报逻辑
});

// 处理未捕获的 Promise 错误
window.addEventListener('unhandledrejection', (event) => {
    console.error('未处理的 Promise 错误:', event.reason);
    // 可以在这里添加错误上报逻辑
});

// 添加 PWA 支持（可选）
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // 暂时不启用 Service Worker
        // navigator.serviceWorker.register('/sw.js');
    });
}

// 导出全局函数供 HTML 内联事件使用
window.login = login;
window.logout = logout;
window.doCheckin = doCheckin;
window.copyCode = copyCode;
window.copyCodeText = copyCodeText;
window.showCodeDetail = showCodeDetail;
window.searchCodes = searchCodes;
window.loadCodes = loadCodes;

// 添加页面切换动画（可选）
function addPageTransitions() {
    const links = document.querySelectorAll('a[href^="/"], a[href^="./"], a[href^="../"]');
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && !href.includes('#') && !link.target) {
                e.preventDefault();
                document.body.style.opacity = '0';
                setTimeout(() => {
                    window.location.href = href;
                }, 200);
            }
        });
    });
}

// 页面加载完成后添加过渡效果
window.addEventListener('load', () => {
    document.body.style.opacity = '1';
    addPageTransitions();
});

// 添加键盘快捷键（可选）
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K 快速签到
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (currentUser) {
            doCheckin();
        }
    }
    
    // ESC 关闭弹窗
    if (e.key === 'Escape') {
        const modals = document.querySelectorAll('.modal.show');
        modals.forEach(modal => {
            modal.classList.remove('show');
        });
    }
});

// 检测网络状态
window.addEventListener('online', () => {
    showToast('网络已连接', 'success');
});

window.addEventListener('offline', () => {
    showToast('网络已断开', 'error');
});

// 添加触摸设备支持
if ('ontouchstart' in window) {
    document.body.classList.add('touch-device');
}

// 性能监控（可选）
if ('PerformanceObserver' in window) {
    // 监控长任务
    try {
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (entry.duration > 50) {
                    console.warn('检测到长任务:', entry);
                }
            }
        });
        observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {
        // 某些浏览器可能不支持
    }
}