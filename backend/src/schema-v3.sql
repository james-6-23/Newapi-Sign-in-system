-- 用户表（移除 is_admin 字段）
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linux_do_id TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    email TEXT,
    avatar_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 兑换码池表（存储所有上传的兑换码）
CREATE TABLE IF NOT EXISTS redemption_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    batch_id TEXT NOT NULL,  -- 批次ID，用于追踪哪次上传
    status TEXT DEFAULT 'unused',  -- unused, used, reserved
    used_by INTEGER,  -- 使用者用户ID
    used_at DATETIME,  -- 使用时间
    reserved_by INTEGER,  -- 预留给某个用户（签到时分配）
    reserved_at DATETIME,  -- 预留时间
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    uploaded_by INTEGER NOT NULL,  -- 上传者用户ID
    FOREIGN KEY (used_by) REFERENCES users(id),
    FOREIGN KEY (reserved_by) REFERENCES users(id),
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- 签到记录表（修改版）
CREATE TABLE IF NOT EXISTS check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    check_in_date DATE NOT NULL,
    redemption_code_id INTEGER NOT NULL,  -- 关联到兑换码池
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (redemption_code_id) REFERENCES redemption_codes(id),
    UNIQUE(user_id, check_in_date)
);

-- 上传批次记录表
CREATE TABLE IF NOT EXISTS upload_batches (
    id TEXT PRIMARY KEY,  -- UUID
    filename TEXT NOT NULL,
    total_codes INTEGER NOT NULL,
    valid_codes INTEGER NOT NULL,
    duplicate_codes INTEGER NOT NULL,
    uploaded_by INTEGER NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_redemption_codes_status ON redemption_codes(status);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_batch ON redemption_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_redemption_codes_code ON redemption_codes(code);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_date ON check_ins(user_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_linux_do_id ON users(linux_do_id);