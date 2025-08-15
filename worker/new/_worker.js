/**
 * Cloudflare Pages Functions
 * 用于注入环境变量到前端
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // 只处理HTML文件
  if (!url.pathname.endsWith('.html') && url.pathname !== '/') {
    return context.next();
  }
  
  // 获取原始响应
  const response = await context.next();
  
  // 如果不是HTML响应，直接返回
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('text/html')) {
    return response;
  }
  
  // 读取HTML内容
  const html = await response.text();
  
  // 注入环境变量脚本
  const envScript = `
    <script>
      // 注入环境变量
      window.ENV = {
        API_BASE_URL: '${env.API_BASE_URL || 'https://apisign.kkyyxx.xyz'}'
      };
    </script>
  `;
  
  // 在<head>标签后注入脚本
  const modifiedHtml = html.replace('<head>', `<head>${envScript}`);
  
  // 返回修改后的响应
  return new Response(modifiedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}