// 兑换码页面逻辑
class CodesPage {
    constructor() {
        this.codes = [];
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalPages = 1;
        this.isLoading = false;
        
        this.init();
    }

    async init() {
        console.log('初始化兑换码页面');
        
        // 绑定事件
        this.bindEvents();
        
        // 加载数据
        await this.loadCodes();
        
        // 渲染页面
        this.renderCodes();
        this.renderPagination();
    }

    bindEvents() {
        // 刷新按钮
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshCodes());
        }

        // 搜索功能
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }

        // 分页按钮
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('page-btn')) {
                const page = parseInt(e.target.dataset.page);
                this.goToPage(page);
            }
        });

        // 复制按钮
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('copy-btn')) {
                const code = e.target.dataset.code;
                this.copyCode(code, e.target);
            }
        });
    }

    async loadCodes() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();

        try {
            const response = await fetch(`${CONFIG.API_BASE}/api/codes?page=${this.currentPage}&limit=${this.pageSize}&_t=${Date.now()}`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.codes = data.codes || [];
                this.totalPages = Math.ceil((data.total || 0) / this.pageSize);
                console.log(`加载了 ${this.codes.length} 个兑换码`);
            } else {
                console.error('加载兑换码失败:', response.status);
                this.codes = this.getMockCodes(); // 使用模拟数据
            }
        } catch (error) {
            console.error('加载兑换码出错:', error);
            this.codes = this.getMockCodes(); // 使用模拟数据
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    getMockCodes() {
        // 模拟数据，用于调试
        const mockCodes = [];
        for (let i = 1; i <= 10; i++) {
            mockCodes.push({
                id: i,
                code: `MOCK${String(i).padStart(4, '0')}`,
                type: i % 3 === 0 ? 'system_gift' : 'checkin_reward',
                status: i % 4 === 0 ? 'used' : 'unused',
                created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                used_at: i % 4 === 0 ? new Date(Date.now() - i * 12 * 60 * 60 * 1000).toISOString() : null
            });
        }
        return mockCodes;
    }

    renderCodes() {
        const container = document.getElementById('codesContainer');
        if (!container) return;

        if (this.codes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-ticket-alt"></i>
                    <p>暂无兑换码</p>
                </div>
            `;
            return;
        }

        const codesHtml = this.codes.map(code => this.renderCodeItem(code)).join('');
        container.innerHTML = codesHtml;
    }

    renderCodeItem(code) {
        const typeText = code.type === 'system_gift' ? '系统赠送' : '签到获得';
        const typeClass = code.type === 'system_gift' ? 'system' : 'checkin';
        const statusText = code.status === 'used' ? '已使用' : '未使用';
        const statusClass = code.status === 'used' ? 'used' : 'unused';
        
        const createdTime = new Date(code.created_at).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        });

        const usedTime = code.used_at ? new Date(code.used_at).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            fractionalSecondDigits: 3
        }) : '';

        return `
            <div class="code-item ${statusClass}">
                <div class="code-header">
                    <div class="code-info">
                        <span class="code-value">${code.code}</span>
                        <span class="code-type ${typeClass}">${typeText}</span>
                    </div>
                    <div class="code-actions">
                        <button class="copy-btn" data-code="${code.code}" ${code.status === 'used' ? 'disabled' : ''}>
                            <i class="fas fa-copy"></i>
                            复制
                        </button>
                        <span class="code-status ${statusClass}">${statusText}</span>
                    </div>
                </div>
                <div class="code-details">
                    <div class="code-time">
                        <span class="time-label">创建时间:</span>
                        <span class="time-value">${createdTime}</span>
                    </div>
                    ${usedTime ? `
                        <div class="code-time">
                            <span class="time-label">使用时间:</span>
                            <span class="time-value">${usedTime}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    renderPagination() {
        const container = document.getElementById('paginationContainer');
        if (!container || this.totalPages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let paginationHtml = '<div class="pagination">';
        
        // 上一页
        if (this.currentPage > 1) {
            paginationHtml += `<button class="page-btn" data-page="${this.currentPage - 1}">上一页</button>`;
        }

        // 页码
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);

        if (startPage > 1) {
            paginationHtml += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === this.currentPage ? 'active' : '';
            paginationHtml += `<button class="page-btn ${activeClass}" data-page="${i}">${i}</button>`;
        }

        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                paginationHtml += `<span class="page-ellipsis">...</span>`;
            }
            paginationHtml += `<button class="page-btn" data-page="${this.totalPages}">${this.totalPages}</button>`;
        }

        // 下一页
        if (this.currentPage < this.totalPages) {
            paginationHtml += `<button class="page-btn" data-page="${this.currentPage + 1}">下一页</button>`;
        }

        paginationHtml += '</div>';
        container.innerHTML = paginationHtml;
    }

    async goToPage(page) {
        if (page === this.currentPage || page < 1 || page > this.totalPages) return;
        
        this.currentPage = page;
        await this.loadCodes();
        this.renderCodes();
        this.renderPagination();
    }

    async refreshCodes() {
        console.log('刷新兑换码列表');
        this.currentPage = 1;
        await this.loadCodes();
        this.renderCodes();
        this.renderPagination();
        
        // 显示刷新成功提示
        this.showMessage('刷新成功', 'success');
    }

    handleSearch(query) {
        // 简单的前端搜索
        const filteredCodes = this.codes.filter(code => 
            code.code.toLowerCase().includes(query.toLowerCase())
        );
        
        const container = document.getElementById('codesContainer');
        if (!container) return;

        if (filteredCodes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-search"></i>
                    <p>未找到匹配的兑换码</p>
                </div>
            `;
            return;
        }

        const codesHtml = filteredCodes.map(code => this.renderCodeItem(code)).join('');
        container.innerHTML = codesHtml;
    }

    async copyCode(code, button) {
        try {
            await navigator.clipboard.writeText(code);
            
            // 更新按钮状态
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fas fa-check"></i> 已复制';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('copied');
            }, 2000);
            
            this.showMessage('兑换码已复制到剪贴板', 'success');
        } catch (error) {
            console.error('复制失败:', error);
            this.showMessage('复制失败，请手动复制', 'error');
        }
    }

    showLoading() {
        const container = document.getElementById('codesContainer');
        if (container) {
            container.innerHTML = `
                <div class="loading-state">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>加载中...</p>
                </div>
            `;
        }
    }

    hideLoading() {
        // Loading state will be replaced by renderCodes()
    }

    showMessage(message, type = 'info') {
        // 创建消息元素
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${type}`;
        messageEl.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;

        // 添加到页面
        document.body.appendChild(messageEl);

        // 显示动画
        setTimeout(() => messageEl.classList.add('show'), 100);

        // 自动隐藏
        setTimeout(() => {
            messageEl.classList.remove('show');
            setTimeout(() => messageEl.remove(), 300);
        }, 3000);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new CodesPage();
});