// 日历相关功能

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let checkedDates = [];

// 初始化日历
function initCalendar() {
    const prevMonth = document.getElementById('prevMonth');
    const nextMonth = document.getElementById('nextMonth');
    
    if (prevMonth) {
        prevMonth.addEventListener('click', () => {
            changeMonth(-1);
        });
    }
    
    if (nextMonth) {
        nextMonth.addEventListener('click', () => {
            changeMonth(1);
        });
    }
    
    // 初始显示当前月份
    updateCalendar();
}

// 改变月份
function changeMonth(delta) {
    currentMonth += delta;
    
    if (currentMonth > 12) {
        currentMonth = 1;
        currentYear++;
    } else if (currentMonth < 1) {
        currentMonth = 12;
        currentYear--;
    }
    
    updateCalendar();
}

// 更新日历显示
async function updateCalendar() {
    const currentMonthElement = document.getElementById('currentMonth');
    const calendarBody = document.getElementById('calendarBody');
    
    if (!currentMonthElement || !calendarBody) return;
    
    // 更新月份显示
    currentMonthElement.textContent = `${currentYear}年${currentMonth}月`;
    
    // 获取签到数据
    try {
        const data = await get(`${API_BASE_URL}/api/checkin/calendar`, {
            year: currentYear,
            month: currentMonth
        });
        checkedDates = data.checkedDates || [];
    } catch (error) {
        console.error('获取签到日历失败:', error);
        checkedDates = [];
    }
    
    // 渲染日历
    renderCalendar();
}

// 渲染日历
function renderCalendar() {
    const calendarBody = document.getElementById('calendarBody');
    if (!calendarBody) return;
    
    // 清空日历
    clearElement(calendarBody);
    
    // 获取当月第一天和最后一天
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();
    
    // 获取今天的日期
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
    const todayDate = today.getDate();
    
    // 填充上月的日期
    const prevMonthLastDay = new Date(currentYear, currentMonth - 1, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
        const day = prevMonthLastDay - i;
        const dayElement = createDayElement(day, true, false, false);
        calendarBody.appendChild(dayElement);
    }
    
    // 填充当月的日期
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isChecked = checkedDates.includes(dateStr);
        const isToday = isCurrentMonth && day === todayDate;
        const dayElement = createDayElement(day, false, isChecked, isToday);
        
        // 添加点击事件（可选：显示当天的兑换码）
        if (isChecked) {
            dayElement.addEventListener('click', () => {
                showDayCode(dateStr);
            });
        }
        
        calendarBody.appendChild(dayElement);
    }
    
    // 填充下月的日期
    const totalCells = calendarBody.children.length;
    const remainingCells = 42 - totalCells; // 6行 x 7列 = 42格
    for (let day = 1; day <= remainingCells; day++) {
        const dayElement = createDayElement(day, true, false, false);
        calendarBody.appendChild(dayElement);
    }
}

// 创建日期元素
function createDayElement(day, isOtherMonth, isChecked, isToday) {
    const dayElement = createElement('div', 'calendar-day');
    dayElement.textContent = day;
    
    if (isOtherMonth) {
        dayElement.classList.add('other-month');
    }
    
    if (isChecked) {
        dayElement.classList.add('checked');
        dayElement.title = '已签到';
    }
    
    if (isToday) {
        dayElement.classList.add('today');
    }
    
    return dayElement;
}

// 显示某天的兑换码（可选功能）
async function showDayCode(dateStr) {
    try {
        // 这里可以添加显示特定日期兑换码的功能
        const codes = await get(`${API_BASE_URL}/api/codes`, {
            date: dateStr,
            limit: 1
        });
        
        if (codes.codes && codes.codes.length > 0) {
            const code = codes.codes[0];
            showToast(`${dateStr} 的兑换码：${code.redemption_code}`, 'info');
        }
    } catch (error) {
        console.error('获取兑换码失败:', error);
    }
}

// 刷新日历（供其他模块调用）
window.refreshCalendar = function() {
    updateCalendar();
};

// 获取当前显示的年月
function getCurrentYearMonth() {
    return {
        year: currentYear,
        month: currentMonth
    };
}

// 跳转到指定年月
function goToYearMonth(year, month) {
    currentYear = year;
    currentMonth = month;
    updateCalendar();
}

// 跳转到今天
function goToToday() {
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth() + 1;
    updateCalendar();
}