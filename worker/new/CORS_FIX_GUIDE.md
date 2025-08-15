# 跨域Cookie问题修复指南

## 问题描述

您的前端部署在 `qd-eir.pages.dev`，后端API部署在 `apisign.kkyyxx.xyz`，由于是不同的域名，浏览器默认不会在跨域请求中发送Cookie，导致认证失败（401错误）。

## 解决方案

### 方案1：修改后端Cookie设置（推荐）

在 `workers-v5.js` 中，找到所有设置Cookie的地方并修改：

#### 1. OAuth回调处理（约第1182-1189行）
```javascript
// 原代码
'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,

// 修改为
'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${7 * 24 * 60 * 60}`,
```

#### 2. 管理员登录（约第1220-1223行）
```javascript
// 原代码
'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,

// 修改为
'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${7 * 24 * 60 * 60}`,
```

#### 3. 退出登录（约第1245行）
```javascript
// 原代码
'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',

// 修改为
'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0',
```

#### 4. 更新CORS头部（约第107-114行）
```javascript
function corsHeaders(env) {
    return {
        'Access-Control-Allow-Origin': env.FRONTEND_URL || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Credentials': 'true', // 确保这一行存在
    };
}
```

### 方案2：使用子域名（最佳实践）

将前端和后端部署在同一主域名下：

1. **前端**：`https://sign.kkyyxx.xyz` 或 `https://app.kkyyxx.xyz`
2. **后端**：`https://apisign.kkyyxx.xyz`

然后在Cookie设置中使用域名属性：
```javascript
'Set-Cookie': `session=${sessionId}; Domain=.kkyyxx.xyz; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${7 * 24 * 60 * 60}`,
```

### 方案3：使用代理（Cloudflare Pages）

在Cloudflare Pages中配置代理，将API请求转发到后端：

1. 创建 `_redirects` 文件：
```
/api/* https://apisign.kkyyxx.xyz/api/:splat 200
```

2. 修改前端配置：
```javascript
const API_BASE_URL = ''; // 使用相对路径
```

### 方案4：改用Token认证

如果Cookie方案无法实施，可以改用Token认证：

1. **后端修改**：
   - 登录成功后返回Token而不是设置Cookie
   - 验证时从Authorization header读取Token

2. **前端修改**：
   - 登录成功后将Token存储在localStorage
   - 每次请求时在header中携带Token

## 立即测试步骤

1. **修改后端代码**
   - 按照方案1修改所有Cookie设置
   - 重新部署Workers

2. **设置环境变量**
   - 在Cloudflare Workers中设置：
   ```
   FRONTEND_URL = https://qd-eir.pages.dev
   ```

3. **清除浏览器缓存**
   - 访问调试页面：`https://qd-eir.pages.dev/debug.html`
   - 点击"清除本地存储"

4. **重新测试登录**
   - 访问登录页面
   - 完成OAuth授权
   - 检查是否成功跳转到主页

## 验证修复

1. 在调试页面查看Cookie状态
2. 测试API连接应返回用户信息而不是401错误
3. 检查浏览器开发者工具的Network标签，确认请求携带了Cookie

## 注意事项

- `SameSite=None` 要求必须使用HTTPS
- 某些旧版浏览器可能不支持 `SameSite=None`
- 建议最终使用子域名方案，这是最安全和兼容的做法

## 紧急联系

如果以上方案都无法解决，可以考虑：
1. 临时禁用认证进行调试
2. 使用本地开发环境测试
3. 查看Cloudflare Workers的实时日志获取更多信息