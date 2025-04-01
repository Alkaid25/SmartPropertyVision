document.addEventListener('DOMContentLoaded', function() {
    // 获取视图切换按钮和视图容器
    const gridViewBtn = document.getElementById('grid-view-btn');
    const singleViewBtn = document.getElementById('single-view-btn');
    const gridViewBtn2 = document.getElementById('grid-view-btn-2');
    const singleViewBtn2 = document.getElementById('single-view-btn-2');
    const gridView = document.getElementById('grid-view');
    const singleView = document.getElementById('single-view');
    
    // 视图切换功能
    function switchToGridView() {
        singleView.classList.add('hidden');
        gridView.classList.remove('hidden');
        gridViewBtn.classList.add('active');
        singleViewBtn.classList.remove('active');
        gridViewBtn2.classList.add('active');
        singleViewBtn2.classList.remove('active');
    }
    
    function switchToSingleView() {
        gridView.classList.add('hidden');
        singleView.classList.remove('hidden');
        singleViewBtn.classList.add('active');
        gridViewBtn.classList.remove('active');
        singleViewBtn2.classList.add('active');
        gridViewBtn2.classList.remove('active');
    }
    
    gridViewBtn.addEventListener('click', switchToGridView);
    singleViewBtn.addEventListener('click', switchToSingleView);
    gridViewBtn2.addEventListener('click', switchToGridView);
    singleViewBtn2.addEventListener('click', switchToSingleView);
    
    // 视频选择器功能
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    const selectorItems = document.querySelectorAll('.selector-item');
    const selectorItemsContainer = document.querySelector('.selector-items');
    
    // 当前选中的视频索引
    let currentIndex = 2; // 默认选中第三个视频（12号公寓楼-楼道1）
    
    // 每页显示的缩略图数量
    const itemsPerPage = 4;
    
    // 计算总页数
    const totalItems = selectorItems.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // 当前页码
    let currentPage = 1;
    
    // 更新选中状态
    function updateSelection() {
        selectorItems.forEach((item, index) => {
            if (index === currentIndex) {
                item.classList.add('active');
                // 更新主视频显示的位置信息
                const location = item.getAttribute('data-location');
                document.querySelector('.location-info').textContent = location;
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    // 更新缩略图滚动位置
    function updateSelectorScroll() {
        // 计算当前页的起始索引
        const startIndex = (currentPage - 1) * itemsPerPage;
        
        // 计算滚动距离
        const itemWidth = selectorItems[0].offsetWidth + 10; // 包括margin
        const scrollPosition = startIndex * itemWidth;
        
        // 应用滚动
        selectorItemsContainer.style.transform = `translateX(-${scrollPosition}px)`;
        
        // 更新按钮状态
        prevBtn.disabled = currentPage === 1;
        nextBtn.disabled = currentPage === totalPages;
    }
    
    // 上一页
    prevBtn.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage--;
            updateSelectorScroll();
        }
    });
    
    // 下一页
    nextBtn.addEventListener('click', function() {
        if (currentPage < totalPages) {
            currentPage++;
            updateSelectorScroll();
        }
    });
    
    // 点击选择视频
    selectorItems.forEach((item, index) => {
        item.addEventListener('click', function() {
            currentIndex = index;
            updateSelection();
        });
    });
    
    // 网格视图分页功能
    const gridPages = document.querySelectorAll('.grid-page');
    const prevGridBtn = document.querySelector('.prev-grid-btn');
    const nextGridBtn = document.querySelector('.next-grid-btn');
    const currentPageEl = document.getElementById('current-page');
    const totalPagesEl = document.getElementById('total-pages');
    
    // 当前网格视图页码
    let currentGridPage = 1;
    const totalGridPages = gridPages.length;
    
    // 更新网格视图页码显示
    function updateGridPageInfo() {
        currentPageEl.textContent = currentGridPage;
        totalPagesEl.textContent = totalGridPages;
    }
    
    // 更新网格视图页面
    function updateGridPage() {
        gridPages.forEach((page, index) => {
            if (index === currentGridPage - 1) {
                page.classList.add('active');
            } else {
                page.classList.remove('active');
            }
        });
        
        // 更新按钮状态
        prevGridBtn.disabled = currentGridPage === 1;
        nextGridBtn.disabled = currentGridPage === totalGridPages;
        
        // 更新页码信息
        updateGridPageInfo();
    }
    
    // 上一页网格
    prevGridBtn.addEventListener('click', function() {
        if (currentGridPage > 1) {
            currentGridPage--;
            updateGridPage();
        }
    });
    
    // 下一页网格
    nextGridBtn.addEventListener('click', function() {
        if (currentGridPage < totalGridPages) {
            currentGridPage++;
            updateGridPage();
        }
    });
    
    // 初始化时间显示
    updateClock();
    setInterval(updateClock, 1000);
    
    // 更新时间显示
    function updateClock() {
        const now = new Date();
        const timestamps = document.querySelectorAll('.timestamp');
        
        // 格式化为 YYYY-MM-DD-HH-MM-SS
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const timeString = `${year}-${month}-${day}-${hours}-${minutes}-${seconds}`;
        
        timestamps.forEach(timestamp => {
            timestamp.textContent = timeString;
        });
    }
    
    // 模拟视频播放计时
    let videoTime = 3; // 初始时间（秒）
    const timeDisplay = document.querySelector('.time-display');
    
    setInterval(function() {
        videoTime++;
        const minutes = Math.floor(videoTime / 60);
        const seconds = videoTime % 60;
        timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
    
    // 模拟检测记录高亮效果
    const detectionItems = document.querySelectorAll('.detection-item');
    let detectionIndex = 0;
    
    setInterval(function() {
        detectionItems.forEach(item => item.style.backgroundColor = 'rgba(0, 0, 0, 0.3)');
        detectionItems[detectionIndex].style.backgroundColor = 'rgba(52, 152, 219, 0.3)';
        detectionIndex = (detectionIndex + 1) % detectionItems.length;
    }, 3000);
    
    // 初始化
    updateSelection();
    updateSelectorScroll();
    updateGridPageInfo();
    updateGridPage();
});