// API 配置
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8787' 
    : 'https://apisign.kkyyxx.xyz';

// 应用配置
const APP_CONFIG = {
    // 分页配置
    PAGE_SIZE: 20,
    
    // 日历配置
    CALENDAR_START_YEAR: 2024,
    
    // Toast 显示时长（毫秒）
    TOAST_DURATION: 3000,
    
    // 请求超时时间（毫秒）
    REQUEST_TIMEOUT: 10000,
    
    // 本地存储键名
    STORAGE_KEYS: {
        USER_INFO: 'checkin_user_info',
        THEME: 'checkin_theme'
    }
};

// 请求配置
const REQUEST_CONFIG = {
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json'
    }
};