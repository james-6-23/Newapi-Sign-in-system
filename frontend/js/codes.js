// 兑换码管理相关功能

let currentPage = 1;
let totalPages = 1;
let isSearchMode = false;
let searchQuery = '';

// 加载兑换码列表
async function loadCodes(page = 1) {
    try {
        showLoading();
        
        let url = `${API_BASE_URL}/api/codes`;
        let params = {
            page: page,
            limit: APP_CONFIG.PAGE_SIZE
        };
        
        // 如果是搜索模式
        if (isSearchMode && searchQuery) {
            url = `${API_BASE_URL}/api/codes/search`;
            params.q = searchQuery;
        }
        
        const data = await get(url, params);
        
        if (data.codes) {
            displayCodes(data.codes);
            
            // 更新分页信息
            if (data.pagination) {
                currentPage = data.pagination.page;
                totalPages = data.pagination.totalPages;
                updatePagination(data.pagination);
            }
        }
    } catch (error) {
        console.error('加载兑换码失败:', error);
        showToast('加载兑换码失败', 'error');
    } finally {
        hideLoading();
    }
}

// 显示兑换码列表
function displayCodes(codes) {
    const codesList = document.getElementById('codesList');
    if (!codesList) return;
    
    clearElement(codesList);
    
    if (codes.length === 0) {
        codesList.innerHTML = `
            <div class="empty-state">
                <p>${isSearchMode ? '没有找到匹配的兑换码' : '您还没有兑换码'}</p>
                ${!isSearchMode ? '<p>快去签到获取兑换码吧！</p>' : ''}
            </div>
        `;
        return;
    }
    
    codes.forEach(code => {
        const codeItem = createElement('div', 'code-item');
        codeItem.innerHTML = `
            <div class="code-info">
                <div class="code-text">${code.redemption_code}</div>
                <div class="code-date">获取时间：${formatDateTime(code.created_at)}</div>
                <div class="code-date">签到日期：${code.check_in_date}</div>
            </div>
            <div class="code-actions">
                <button onclick="copyCodeText('${code.redemption_code}')">复制</button>
                <button onclick="showCodeDetail(${code.id})">详情</button>
            </div>
        `;
        codesList.appendChild(codeItem);
    });
}

// 更新分页控件
function updatePagination(pagination) {
    const paginationElement = document.getElementById('pagination');
    if (!paginationElement) return;
    
    clearElement(paginationElement);
    
    // 如果只有一页，不显示分页
    if (pagination.totalPages <= 1) return;
    
    // 上一页按钮
    const prevBtn = createElement('button');
    prevBtn.textContent = '上一页';
    prevBtn.disabled = !pagination.hasPrev;
    prevBtn.onclick = () => loadCodes(currentPage - 1);
    paginationElement.appendChild(prevBtn);
    
    // 页码信息
    const pageInfo = createElement('span', 'page-info');
    pageInfo.textContent = `第 ${pagination.page} / ${pagination.totalPages} 页`;
    paginationElement.appendChild(pageInfo);
    
    // 下一页按钮
    const nextBtn = createElement('button');
    nextBtn.textContent = '下一页';
    nextBtn.disabled = !pagination.hasNext;
    nextBtn.onclick = () => loadCodes(currentPage + 1);
    paginationElement.appendChild(nextBtn);
}

// 复制兑换码
async function copyCodeText(code) {
    const success = await copyToClipboard(code);
    if (success) {
        showToast('兑换码已复制', 'success');
    } else {
        showToast('复制失败，请手动复制', 'error');
    }
}

// 显示兑换码详情
async function showCodeDetail(codeId) {
    try {
        showLoading();
        const data = await get(`${API_BASE_URL}/api/codes/${codeId}`);
        
        if (data.code) {
            const modal = document.getElementById('codeDetailModal');
            const codeDetail = document.getElementById('codeDetail');
            
            if (modal && codeDetail) {
                codeDetail.innerHTML = `
                    <div class="detail-item">
                        <label>兑换码：</label>
                        <span class="code-text">${data.code.redemption_code}</span>
                    </div>
                    <div class="detail-item">
                        <label>签到日期：</label>
                        <span>${data.code.check_in_date}</span>
                    </div>
                    <div class="detail-item">
                        <label>获取时间：</label>
                        <span>${formatDateTime(data.code.created_at)}</span>
                    </div>
                    <div class="detail-actions">
                        <button onclick="copyCodeText('${data.code.redemption_code}')" class="copy-btn">复制兑换码</button>
                    </div>
                `;
                modal.classList.add('show');
            }
        }
    } catch (error) {
        console.error('获取兑换码详情失败:', error);
        showToast('获取详情失败', 'error');
    } finally {
        hideLoading();
    }
}

// 搜索兑换码
async function searchCodes() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    const query = searchInput.value.trim();
    if (query.length < 3) {
        showToast('搜索关键词至少需要3个字符', 'warning');
        return;
    }
    
    isSearchMode = true;
    searchQuery = query;
    currentPage = 1;
    
    await loadCodes(1);
}

// 清除搜索
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    isSearchMode = false;
    searchQuery = '';
    currentPage = 1;
    
    loadCodes(1);
}

// 初始化兑换码页面
function initCodesPage() {
    // 搜索功能
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', searchCodes);
    }
    
    if (searchInput) {
        // 回车搜索
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchCodes();
            }
        });
        
        // 清空时重置
        searchInput.addEventListener('input', debounce((e) => {
            if (e.target.value === '' && isSearchMode) {
                clearSearch();
            }
        }, 500));
    }
    
    // 关闭详情弹窗
    const closeDetailModal = document.getElementById('closeDetailModal');
    if (closeDetailModal) {
        closeDetailModal.addEventListener('click', () => {
            const modal = document.getElementById('codeDetailModal');
            if (modal) {
                modal.classList.remove('show');
            }
        });
    }
    
    // 点击弹窗外部关闭
    const codeDetailModal = document.getElementById('codeDetailModal');
    if (codeDetailModal) {
        codeDetailModal.addEventListener('click', (e) => {
            if (e.target === codeDetailModal) {
                codeDetailModal.classList.remove('show');
            }
        });
    }
}

// 显示兑换码区域
function showCodesSection() {
    const codesSection = document.getElementById('codesSection');
    const loginPrompt = document.getElementById('loginPrompt');
    
    if (codesSection) codesSection.style.display = 'block';
    if (loginPrompt) loginPrompt.style.display = 'none';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    initCodesPage();
});