/**
 * KYX 签到系统 - 配置文件
 */

// API配置
// 优先使用环境变量，如果没有则使用默认值
const API_BASE_URL = window.ENV?.API_BASE_URL ||
    (window.location.hostname === 'localhost'
        ? 'http://localhost:8787'
        : 'https://apisign.kkyyxx.xyz'); // 替换为您的 API 地址

// 应用配置
const APP_CONFIG = {
    // 应用名称
    APP_NAME: 'KYX 签到系统',
    
    // 分页配置
    PAGE_SIZE: 20,
    
    // 日期格式
    DATE_FORMAT: 'YYYY-MM-DD',
    DATETIME_FORMAT: 'YYYY-MM-DD HH:mm:ss',
    
    // Toast显示时长（毫秒）
    TOAST_DURATION: 3000,
    
    // 请求超时时间（毫秒）
    REQUEST_TIMEOUT: 10000,
    
    // 本地存储键名
    STORAGE_KEYS: {
        THEME: 'kyx_theme',
        USER_INFO: 'kyx_user_info',
        SESSION: 'kyx_session'
    },
    
    // 主题配置
    THEMES: {
        LIGHT: 'light',
        DARK: 'dark'
    },
    
    // 默认主题
    DEFAULT_THEME: 'dark'
};

// 请求配置
const REQUEST_CONFIG = {
    credentials: 'include', // 包含Cookie
    mode: 'cors', // 明确指定CORS模式
    headers: {
        // 移除默认的Content-Type，由utils.request根据请求类型动态设置
    }
};

// API端点
const API_ENDPOINTS = {
    // 认证相关
    AUTH: {
        LOGIN: '/api/auth/login',
        LOGOUT: '/api/logout',
        USER_INFO: '/api/user',
        OAUTH_CALLBACK: '/api/oauth/callback'
    },
    
    // 签到相关
    CHECKIN: {
        DO_CHECKIN: '/api/checkin',
        RECORDS: '/api/checkin/records'
    },
    
    // 兑换码管理（管理员）
    ADMIN_CODES: {
        UPLOAD: '/api/admin/codes/upload',
        SET_AMOUNT: '/api/admin/codes/set-amount',
        INVENTORY: '/api/admin/codes/inventory',
        LIST: '/api/admin/codes/list',
        CLEAR_UNUSED: '/api/admin/codes/clear-unused',
        STATS: '/api/admin/codes/stats'
    },
    
    // 分发功能（管理员）
    ADMIN_DISTRIBUTE: {
        GIFT: '/api/admin/distribute/gift',
        BATCH: '/api/admin/distribute/batch',
        PENDING: '/api/admin/distribute/pending',
        PENDING_USERS: '/api/admin/distribute/pending-users'
    },
    
    // 通知系统
    NOTIFICATIONS: {
        LIST: '/api/notifications',
        MARK_READ: '/api/notifications/{id}/read',
        DISMISS: '/api/notifications/{id}/dismiss'
    },
    
    // 管理员
    ADMIN: {
        LOGIN: '/api/admin/login',
        REDEMPTIONS: '/api/admin/redemptions'
    }
};

// 导出配置
window.CONFIG = {
    API_BASE_URL,
    APP_CONFIG,
    REQUEST_CONFIG,
    API_ENDPOINTS
};