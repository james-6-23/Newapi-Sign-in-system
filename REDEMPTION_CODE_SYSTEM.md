# 兑换码系统说明文档

## 系统概述

本系统的兑换码不是自动生成的，而是由管理员通过上传 TXT 文件批量导入。这种设计适合：
- 需要使用特定格式的兑换码
- 兑换码来自第三方系统
- 需要严格控制兑换码的发放

## 文件格式要求

### 支持的文件类型
- 纯文本文件（.txt）
- UTF-8 编码

### 兑换码格式
- 只能包含：字母（A-Z, a-z）、数字（0-9）、连字符（-）、下划线（_）
- 长度不限，但建议 8-32 个字符
- 大小写敏感

### 支持的分隔符
系统会自动识别以下分隔符：
1. **换行符**（推荐）
```
CODE-1234-5678-ABCD
CODE-2345-6789-BCDE
CODE-3456-7890-CDEF
```

2. **逗号分隔**
```
CODE-1234,CODE-2345,CODE-3456,CODE-4567
```

3. **分号分隔**
```
CODE-1234;CODE-2345;CODE-3456;CODE-4567
```

4. **混合格式**（系统会自动处理）
```
CODE-1234,CODE-2345
CODE-3456;CODE-4567
CODE-5678
CODE-6789,CODE-7890;CODE-8901
```

### 文件示例
```txt
# codes.txt
SUMMER-2024-ABCD-1234
SUMMER-2024-EFGH-5678
SUMMER-2024-IJKL-9012
SUMMER-2024-MNOP-3456
SUMMER-2024-QRST-7890
```

## 数据库设计

### redemption_codes 表结构
```sql
CREATE TABLE redemption_codes (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,        -- 兑换码
    batch_id TEXT NOT NULL,           -- 批次ID
    status TEXT DEFAULT 'unused',     -- 状态：unused/used/reserved
    used_by INTEGER,                  -- 使用者ID
    used_at DATETIME,                 -- 使用时间
    reserved_by INTEGER,              -- 预留用户ID
    reserved_at DATETIME,             -- 预留时间
    uploaded_at DATETIME,             -- 上传时间
    uploaded_by INTEGER               -- 上传者ID
);
```

### 状态说明
- **unused**: 未使用，可以分配给用户
- **used**: 已使用，记录了使用者和使用时间
- **reserved**: 预留状态（可选功能，当前未启用）

## 解析逻辑

### 1. 文件读取
```javascript
const content = await file.text();
```

### 2. 兑换码提取
```javascript
function parseRedemptionCodes(content) {
  // 使用正则表达式分割
  const codes = content
    .split(/[\n\r,;]+/)           // 按换行、逗号、分号分割
    .map(code => code.trim())      // 去除空白
    .filter(code => code.length > 0) // 过滤空行
    .filter(code => /^[A-Za-z0-9\-_]+$/.test(code)); // 验证格式
  
  // 去重
  const uniqueCodes = [...new Set(codes)];
  
  return {
    codes: uniqueCodes,
    total: codes.length,
    unique: uniqueCodes.length,
    duplicates: codes.length - uniqueCodes.length
  };
}
```

### 3. 批量导入流程
1. 解析文件，提取有效兑换码
2. 检查数据库中已存在的兑换码
3. 过滤出新的兑换码
4. 分批插入数据库（每批 100 个）
5. 记录上传批次信息

## 错误处理机制

### 1. 文件验证
- 检查文件类型（必须是 .txt）
- 检查文件大小（建议限制在 10MB 以内）
- 检查文件内容是否为空

### 2. 兑换码验证
- 格式验证：只允许指定字符
- 重复检查：文件内去重 + 数据库去重
- 空值过滤：自动忽略空行

### 3. 错误响应
```javascript
// 无有效兑换码
{
  error: '文件中没有有效的兑换码',
  details: '兑换码只能包含字母、数字、连字符和下划线'
}

// 文件格式错误
{
  error: '请选择 .txt 文件'
}

// 上传成功但有重复
{
  success: true,
  summary: {
    totalInFile: 100,      // 文件中总数
    uniqueInFile: 95,      // 去重后数量
    newCodes: 90,          // 新增数量
    existingCodes: 5       // 已存在数量
  }
}
```

## 使用流程

### 管理员上传流程
1. 登录系统并进入管理后台（/admin.html）
2. 在"上传兑换码"区域选择或拖拽 TXT 文件
3. 系统自动解析并显示结果
4. 查看上传历史和统计信息

### 用户获取流程
1. 用户每日签到
2. 系统从未使用的兑换码中分配一个
3. 更新兑换码状态为已使用
4. 记录使用者和使用时间

### 兑换码耗尽处理
当所有兑换码都被使用完时：
1. 用户签到时提示"兑换码已发完"
2. 建议联系管理员补充
3. 管理员可以查看剩余数量并及时补充

## API 接口

### 上传兑换码
```
POST /api/admin/codes/upload
Content-Type: multipart/form-data

参数：
- file: TXT 文件

响应：
{
  success: true,
  batchId: "uuid",
  summary: {
    filename: "codes.txt",
    totalInFile: 100,
    uniqueInFile: 95,
    newCodes: 90,
    existingCodes: 5
  }
}
```

### 获取统计信息
```
GET /api/admin/codes/stats

响应：
{
  stats: {
    total: 1000,      // 总数
    unused: 800,      // 未使用
    used: 200         // 已使用
  },
  recentUploads: [    // 最近上传记录
    {
      id: "uuid",
      filename: "codes.txt",
      total_codes: 100,
      valid_codes: 90,
      duplicate_codes: 10,
      uploaded_at: "2024-01-01T00:00:00Z"
    }
  ]
}
```

## 安全考虑

1. **权限控制**
   - 只有管理员可以上传兑换码
   - 通过 is_admin 字段控制权限

2. **防止重复使用**
   - 数据库 UNIQUE 约束
   - 签到时的事务处理

3. **审计追踪**
   - 记录上传者和上传时间
   - 记录使用者和使用时间

## 最佳实践

1. **批量准备**
   - 建议一次上传足够多的兑换码
   - 定期检查剩余数量

2. **命名规范**
   - 使用有意义的前缀（如 SUMMER-2024-）
   - 便于追踪和管理

3. **备份策略**
   - 保留原始 TXT 文件
   - 定期导出数据库

4. **监控告警**
   - 当剩余兑换码少于 100 个时提醒
   - 每日使用量统计

## 扩展功能建议

1. **批次管理**
   - 按批次查看兑换码
   - 批次启用/禁用功能

2. **导出功能**
   - 导出未使用的兑换码
   - 导出使用记录

3. **自动告警**
   - 邮件/短信提醒
   - Webhook 通知

4. **兑换码类型**
   - 支持不同类型的兑换码
   - 不同奖励等级