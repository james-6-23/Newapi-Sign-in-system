// 抽奖系统JavaScript逻辑
// 模拟数据
let currentTab = 'lottery';
let currentWheelId = 2;
let isSpinning = false;

// 模拟转盘配置数据
const wheelConfigs = {
    1: {
        name: '炼气境转盘',
        level: 1,
        maxSpins: 3,
        remainingSpins: 3,
        pityCounter: 0,
        pityThreshold: 10,
        items: [
            { id: 1, name: '小额兑换码', icon: '💰', probability: 30, rarity: 'common' },
            { id: 2, name: '经验小包', icon: '📚', probability: 35, rarity: 'common' },
            { id: 3, name: '中额兑换码', icon: '💎', probability: 20, rarity: 'rare' },
            { id: 4, name: '经验中包', icon: '📖', probability: 10, rarity: 'rare' },
            { id: 5, name: '心魔入侵', icon: '💀', probability: 5, rarity: 'common' }
        ]
    },
    2: {
        name: '筑基境转盘',
        level: 2,
        maxSpins: 3,
        remainingSpins: 2,
        pityCounter: 3,
        pityThreshold: 9,
        items: [
            { id: 1, name: '小额兑换码', icon: '💰', probability: 25, rarity: 'common' },
            { id: 2, name: '经验小包', icon: '📚', probability: 25, rarity: 'common' },
            { id: 3, name: '中额兑换码', icon: '💎', probability: 20, rarity: 'rare' },
            { id: 4, name: '经验中包', icon: '📖', probability: 15, rarity: 'rare' },
            { id: 5, name: '签到双倍', icon: '⚡', probability: 10, rarity: 'epic' },
            { id: 6, name: '心魔入侵', icon: '💀', probability: 3, rarity: 'common' },
            { id: 7, name: '修炼阻滞', icon: '🌫️', probability: 2, rarity: 'rare' }
        ]
    },
    3: {
        name: '结丹境转盘',
        level: 3,
        maxSpins: 4,
        remainingSpins: 0,
        pityCounter: 0,
        pityThreshold: 8,
        items: [
            { id: 1, name: '中额兑换码', icon: '💎', probability: 20, rarity: 'rare' },
            { id: 2, name: '经验中包', icon: '📖', probability: 20, rarity: 'rare' },
            { id: 3, name: '签到双倍', icon: '⚡', probability: 25, rarity: 'epic' },
            { id: 4, name: '签到三倍', icon: '🌟', probability: 15, rarity: 'legendary' },
            { id: 5, name: '大额兑换码', icon: '💍', probability: 10, rarity: 'legendary' },
            { id: 6, name: '经验大包', icon: '📕', probability: 8, rarity: 'epic' },
            { id: 7, name: '修炼阻滞', icon: '🌫️', probability: 2, rarity: 'rare' }
        ]
    }
};

// 标签页切换
function showTab(tabName) {
    // 隐藏所有标签页内容
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 移除所有标签页按钮的激活状态
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 显示选中的标签页内容
    document.getElementById(tabName).classList.add('active');
    
    // 激活选中的标签页按钮
    event.target.classList.add('active');
    
    currentTab = tabName;

    // 如果切换到抽奖页面，重新生成转盘
    if (tabName === 'lottery') {
        generateWheel();
    }
}

// 转盘选择
function selectWheel(wheelId) {
    // 移除所有选中状态
    document.querySelectorAll('.wheel-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // 添加选中状态
    event.currentTarget.classList.add('selected');
    
    currentWheelId = wheelId;
    updateWheelInfo();
    generateWheel();
}

// 更新转盘信息
function updateWheelInfo() {
    const config = wheelConfigs[currentWheelId];
    if (!config) return;

    document.getElementById('remainingSpins').textContent = config.remainingSpins;
    document.getElementById('pityCounter').textContent = `${config.pityCounter}/${config.pityThreshold}`;
    
    // 更新抽奖按钮状态
    const spinButton = document.getElementById('spinButton');
    if (config.remainingSpins <= 0) {
        spinButton.disabled = true;
        spinButton.textContent = '今日次数已用完';
    } else {
        spinButton.disabled = false;
        spinButton.textContent = '开始抽奖';
    }
}

// 生成转盘SVG - 优化版本支持稀有物品特效
function generateWheel() {
    const config = wheelConfigs[currentWheelId];
    if (!config) return;

    const svg = document.getElementById('wheelSvg');
    svg.innerHTML = '';

    // 适应放大30%的转盘 (520px)
    const centerX = 260;
    const centerY = 260;
    const radius = 230;
    const items = config.items;
    const anglePerItem = 360 / items.length;

    // 稀有度颜色映射 - 更丰富的渐变色
    const rarityColors = {
        'common': 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
        'rare': 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        'epic': 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        'legendary': 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    };

    // 创建渐变定义
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    Object.entries(rarityColors).forEach(([rarity, gradient]) => {
        const gradientElement = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradientElement.setAttribute('id', `gradient-${rarity}`);
        gradientElement.setAttribute('x1', '0%');
        gradientElement.setAttribute('y1', '0%');
        gradientElement.setAttribute('x2', '100%');
        gradientElement.setAttribute('y2', '100%');
        
        // 解析渐变色
        const colors = gradient.match(/#[0-9a-f]{6}/gi) || ['#6b7280', '#4b5563'];
        colors.forEach((color, index) => {
            const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
            stop.setAttribute('offset', `${index * 100}%`);
            stop.setAttribute('stop-color', color);
            gradientElement.appendChild(stop);
        });
        
        defs.appendChild(gradientElement);
    });
    svg.appendChild(defs);

    items.forEach((item, index) => {
        const startAngle = index * anglePerItem - 90; // -90度使第一个扇形从顶部开始
        const endAngle = (index + 1) * anglePerItem - 90;
        
        const startAngleRad = (startAngle * Math.PI) / 180;
        const endAngleRad = (endAngle * Math.PI) / 180;
        
        const x1 = centerX + radius * Math.cos(startAngleRad);
        const y1 = centerY + radius * Math.sin(startAngleRad);
        const x2 = centerX + radius * Math.cos(endAngleRad);
        const y2 = centerY + radius * Math.sin(endAngleRad);
        
        const largeArcFlag = anglePerItem > 180 ? 1 : 0;
        
        const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
            'Z'
        ].join(' ');
        
        // 创建扇形路径
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', `url(#gradient-${item.rarity})`);
        
        // 根据稀有度添加特殊边框和效果
        if (item.rarity === 'rare') {
            path.setAttribute('class', 'wheel-segment-rare wheel-segment-border-rare');
            path.setAttribute('stroke', 'rgba(59, 130, 246, 0.8)');
            path.setAttribute('stroke-width', '3');
        } else if (item.rarity === 'epic') {
            path.setAttribute('class', 'wheel-segment-epic wheel-segment-border-epic');
            path.setAttribute('stroke', 'rgba(147, 51, 234, 0.9)');
            path.setAttribute('stroke-width', '4');
        } else if (item.rarity === 'legendary') {
            path.setAttribute('class', 'wheel-segment-legendary wheel-segment-border-legendary');
            path.setAttribute('stroke', 'rgba(245, 158, 11, 1)');
            path.setAttribute('stroke-width', '5');
            path.setAttribute('stroke-dasharray', '8 4');
        } else {
            path.setAttribute('stroke', 'rgba(255, 255, 255, 0.4)');
            path.setAttribute('stroke-width', '2');
        }
        
        svg.appendChild(path);
        
        // 添加文字
        const textAngle = (startAngle + endAngle) / 2;
        const textAngleRad = (textAngle * Math.PI) / 180;
        const textRadius = radius * 0.7;
        const textX = centerX + textRadius * Math.cos(textAngleRad);
        const textY = centerY + textRadius * Math.sin(textAngleRad);
        
        // 图标 - 放大并添加特效
        const iconText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        iconText.setAttribute('x', textX);
        iconText.setAttribute('y', textY - 12);
        iconText.setAttribute('text-anchor', 'middle');
        iconText.setAttribute('dominant-baseline', 'middle');
        iconText.setAttribute('font-size', '32'); // 放大图标
        iconText.textContent = item.icon;
        
        // 为稀有物品添加发光效果
        if (item.rarity === 'legendary') {
            iconText.setAttribute('filter', 'drop-shadow(0 0 8px rgba(245, 158, 11, 1))');
        } else if (item.rarity === 'epic') {
            iconText.setAttribute('filter', 'drop-shadow(0 0 6px rgba(147, 51, 234, 0.9))');
        } else if (item.rarity === 'rare') {
            iconText.setAttribute('filter', 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.8))');
        }
        
        svg.appendChild(iconText);
        
        // 名称 - 放大并根据稀有度设置颜色
        const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameText.setAttribute('x', textX);
        nameText.setAttribute('y', textY + 20);
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('dominant-baseline', 'middle');
        nameText.setAttribute('font-size', '16'); // 放大字体
        nameText.setAttribute('font-weight', 'bold');
        nameText.setAttribute('class', `wheel-text wheel-text-${item.rarity}`);
        
        // 根据稀有度设置文字颜色和效果
        if (item.rarity === 'rare') {
            nameText.setAttribute('fill', '#93c5fd');
            nameText.setAttribute('filter', 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.8))');
        } else if (item.rarity === 'epic') {
            nameText.setAttribute('fill', '#c4b5fd');
            nameText.setAttribute('filter', 'drop-shadow(0 0 6px rgba(147, 51, 234, 0.9))');
        } else if (item.rarity === 'legendary') {
            nameText.setAttribute('fill', '#fbbf24');
            nameText.setAttribute('filter', 'drop-shadow(0 0 8px rgba(245, 158, 11, 1))');
        } else {
            nameText.setAttribute('fill', 'white');
            nameText.setAttribute('filter', 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))');
        }
        
        nameText.textContent = item.name;
        svg.appendChild(nameText);
        
        // 为传说级物品添加额外的闪烁星星
        if (item.rarity === 'legendary') {
            const star = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            const starRadius = radius * 0.85;
            const starX = centerX + starRadius * Math.cos(textAngleRad);
            const starY = centerY + starRadius * Math.sin(textAngleRad);
            
            star.setAttribute('x', starX);
            star.setAttribute('y', starY);
            star.setAttribute('text-anchor', 'middle');
            star.setAttribute('dominant-baseline', 'middle');
            star.setAttribute('font-size', '24');
            star.setAttribute('fill', '#fbbf24');
            star.setAttribute('filter', 'drop-shadow(0 0 12px rgba(245, 158, 11, 1))');
            star.setAttribute('class', 'wheel-text-legendary');
            star.textContent = '✨';
            
            svg.appendChild(star);
        }
    });
}

// 执行抽奖
function performSpin() {
    if (isSpinning) return;
    
    const config = wheelConfigs[currentWheelId];
    if (!config || config.remainingSpins <= 0) {
        showNotification('今日抽奖次数已用完', 'warning');
        return;
    }

    isSpinning = true;
    const spinButton = document.getElementById('spinButton');
    spinButton.disabled = true;
    spinButton.textContent = '抽奖中...';

    // 模拟抽奖结果
    const result = simulateLottery(config);
    
    // 转盘旋转动画
    const wheelSvg = document.getElementById('wheelSvg');
    const randomRotation = 1440 + Math.random() * 1440; // 4-8圈
    const anglePerItem = 360 / config.items.length;
    // 计算目标角度，使扇区中心对准指针（顶部）
    const targetAngle = 360 - (result.index * anglePerItem + anglePerItem / 2);
    const finalRotation = randomRotation + targetAngle;
    
    wheelSvg.style.transform = `rotate(${finalRotation}deg)`;

    // 3秒后显示结果
    setTimeout(() => {
        showResult(result.item);
        
        // 更新数据
        config.remainingSpins--;
        if (['epic', 'legendary'].includes(result.item.rarity)) {
            config.pityCounter = 0; // 重置保底
        } else {
            config.pityCounter++;
        }
        
        updateWheelInfo();
        isSpinning = false;
    }, 3000);
}

// 模拟抽奖逻辑
function simulateLottery(config) {
    const items = config.items;
    
    // 检查是否触发保底
    if (config.pityCounter >= config.pityThreshold) {
        const rareItems = items.filter(item => ['epic', 'legendary'].includes(item.rarity));
        const selectedItem = rareItems[Math.floor(Math.random() * rareItems.length)];
        const index = items.findIndex(item => item.id === selectedItem.id);
        return { item: selectedItem, index, isPity: true };
    }
    
    // 正常概率抽奖
    const totalProbability = items.reduce((sum, item) => sum + item.probability, 0);
    const random = Math.random() * totalProbability;
    
    let currentProbability = 0;
    for (let i = 0; i < items.length; i++) {
        currentProbability += items[i].probability;
        if (random <= currentProbability) {
            return { item: items[i], index: i, isPity: false };
        }
    }
    
    // 兜底返回第一个
    return { item: items[0], index: 0, isPity: false };
}

// 显示抽奖结果
function showResult(item) {
    document.getElementById('modalPrizeIcon').textContent = item.icon;
    document.getElementById('modalPrizeName').textContent = `恭喜获得：${item.name}`;
    
    let description = '';
    switch (item.name) {
        case '小额兑换码':
            description = '获得5元兑换码，已自动发放到您的账户';
            break;
        case '中额兑换码':
            description = '获得15元兑换码，已自动发放到您的账户';
            break;
        case '大额兑换码':
            description = '获得50元兑换码，已自动发放到您的账户';
            break;
        case '经验小包':
            description = '获得50点修炼经验，助您早日突破境界';
            break;
        case '经验中包':
            description = '获得150点修炼经验，修为大增';
            break;
        case '经验大包':
            description = '获得500点修炼经验，修为突飞猛进';
            break;
        case '签到双倍':
            description = '24小时内签到经验翻倍，效果已激活';
            break;
        case '签到三倍':
            description = '24小时内签到经验三倍，效果已激活';
            break;
        case '心魔入侵':
            description = '修炼遇到心魔，失去30点经验值';
            break;
        case '修炼阻滞':
            description = '修炼受阻，24小时内签到经验减半';
            break;
        default:
            description = '神秘的奖励等待您去发现...';
    }
    
    document.getElementById('modalPrizeDescription').textContent = description;
    document.getElementById('resultModal').classList.add('show');
}

// 关闭结果模态框
function closeResultModal() {
    document.getElementById('resultModal').classList.remove('show');
}

// 通知系统
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type}`;
    notification.textContent = message;
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    notification.style.transform = 'translateX(100%)';
    notification.style.transition = 'transform 0.3s ease';
    notification.style.padding = '15px';
    notification.style.borderRadius = '8px';
    notification.style.backdropFilter = 'blur(8px)';
    
    // 设置颜色
    switch (type) {
        case 'success':
            notification.style.background = 'rgba(16, 185, 129, 0.12)';
            notification.style.color = '#b6ffdf';
            notification.style.borderLeft = '4px solid #10b981';
            break;
        case 'warning':
            notification.style.background = 'rgba(245, 158, 11, 0.12)';
            notification.style.color = '#ffd699';
            notification.style.borderLeft = '4px solid #f59e0b';
            break;
        case 'error':
            notification.style.background = 'rgba(239, 68, 68, 0.12)';
            notification.style.color = '#ffb3b3';
            notification.style.borderLeft = '4px solid #ef4444';
            break;
        default:
            notification.style.background = 'rgba(59, 130, 246, 0.12)';
            notification.style.color = '#b3d9ff';
            notification.style.borderLeft = '4px solid #3b82f6';
    }

    document.body.appendChild(notification);

    // 显示动画
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 点击模态框背景关闭
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

// 转盘卡片点击事件
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.wheel-card').forEach(card => {
        card.addEventListener('click', function() {
            if (!this.classList.contains('locked')) {
                const wheelId = parseInt(this.dataset.wheelId);
                selectWheel(wheelId);
            } else {
                showNotification('等级不足，无法使用此转盘', 'warning');
            }
        });
    });

    // 初始化转盘
    updateWheelInfo();
    generateWheel();
    
    // 显示欢迎消息
    setTimeout(() => {
        showNotification('欢迎来到秘境抽奖！每日都有新的机缘等待您', 'info');
    }, 1000);
});