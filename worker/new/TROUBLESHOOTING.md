# KYX 签到系统 - 故障排查指南

## 🔍 常见问题

### 1. 登录后立即退出到登录页面

**可能原因：**
- API地址配置错误
- CORS（跨域）问题
- Cookie未正确设置
- 后端服务未启动

**解决方案：**

1. **检查API配置**
   - 编辑 `js/config.js` 文件
   - 确保 `API_BASE_URL` 正确设置：
   ```javascript
   const API_BASE_URL = 'https://apisign.kkyyxx.xyz'; // 您的实际API地址
   ```

2. **使用调试页面**
   - 访问 `/debug.html` 页面
   - 点击"测试API连接"按钮
   - 查看控制台日志了解具体错误

3. **检查CORS设置**
   - 确保后端 `workers-v5.js` 中的 `FRONTEND_URL` 环境变量正确设置
   - CORS头应该允许您的前端域名

4. **检查Cookie设置**
   - 确保前端和后端使用相同的域名（或子域名）
   - 如果使用不同域名，需要配置正确的CORS和Cookie策略

### 2. API请求失败

**症状：**
- 控制台显示 "Failed to fetch" 错误
- 网络请求返回 CORS 错误

**解决方案：**

1. **本地开发环境**
   ```javascript
   // config.js
   const API_BASE_URL = window.location.hostname === 'localhost' 
       ? 'http://localhost:8787'  // 本地Workers开发服务器
       : 'https://apisign.kkyyxx.xyz'; // 生产环境API
   ```

2. **生产环境**
   - 确保API服务已部署并运行
   - 检查Cloudflare Workers的日志
   - 验证环境变量是否正确设置

### 3. OAuth登录失败

**可能原因：**
- OAuth回调URL配置错误
- Linux Do OAuth应用配置问题

**解决方案：**

1. **检查OAuth配置**
   - 在Linux Do OAuth应用设置中
   - 确保回调URL为：`https://您的域名/oauth/linuxdo`

2. **检查环境变量**
   - `OAUTH_CLIENT_ID`
   - `OAUTH_CLIENT_SECRET`
   - 确保这些值与Linux Do应用设置匹配

## 🛠️ 调试工具

### 使用调试页面

1. 访问 `/debug.html`
2. 查看以下信息：
   - API配置信息
   - Cookie状态
   - API连接测试结果
   - 实时控制台日志

### 浏览器开发者工具

1. **Network标签**
   - 查看API请求是否发送
   - 检查响应状态码
   - 查看请求和响应头

2. **Console标签**
   - 查看JavaScript错误
   - 查看调试日志输出

3. **Application/Storage标签**
   - 检查Cookies
   - 查看LocalStorage数据

## 📋 部署检查清单

### 前端部署

- [ ] 修改 `js/config.js` 中的 `API_BASE_URL`
- [ ] 构建并上传所有文件到静态托管
- [ ] 确保所有文件路径正确
- [ ] 测试主题切换功能
- [ ] 验证所有页面可以访问

### 后端部署

- [ ] 部署 `workers-v5.js` 到Cloudflare Workers
- [ ] 设置所有必需的环境变量：
  - `OAUTH_CLIENT_ID`
  - `OAUTH_CLIENT_SECRET`
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `SESSION_SECRET`
  - `FRONTEND_URL`
- [ ] 绑定D1数据库
- [ ] 执行数据库初始化脚本

### 测试流程

1. **OAuth登录测试**
   - 点击登录按钮
   - 完成Linux Do授权
   - 验证重定向回应用

2. **功能测试**
   - 用户签到
   - 查看兑换码
   - 管理员登录
   - 上传兑换码
   - 用户管理

## 🚨 紧急修复

### 清除所有缓存和Cookie

1. 访问 `/debug.html`
2. 点击"清除本地存储"按钮
3. 或手动执行：
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   // 清除所有Cookie
   document.cookie.split(";").forEach(function(c) { 
       document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
   });
   ```

### 临时禁用认证检查（仅用于调试）

在 `app.js` 中临时注释掉重定向：
```javascript
// if (!user) {
//     window.location.href = 'login.html';
//     return;
// }
```

⚠️ **警告**：调试完成后必须恢复此代码！

## 📞 获取帮助

如果以上方法都无法解决问题：

1. 收集以下信息：
   - 浏览器控制台的完整错误日志
   - Network标签中失败请求的详细信息
   - `/debug.html` 页面的截图

2. 检查：
   - Cloudflare Workers的实时日志
   - D1数据库的查询日志

3. 确认：
   - 所有环境变量是否正确设置
   - API服务是否正常运行
   - 数据库连接是否正常

## 🔄 版本兼容性

确保使用兼容的版本：
- 前端代码：v5
- 后端API：workers-v5.js
- 数据库架构：schema-v5.sql

不同版本之间可能不兼容，请确保所有组件使用相同版本。