document.addEventListener('DOMContentLoaded', function() {
    // 获取元素
    const deviceForm = document.getElementById('device-form');
    const deviceDetails = document.getElementById('device-details');
    const formTitle = document.getElementById('form-title');
    const addDeviceBtn = document.getElementById('add-device-btn');
    const saveDeviceBtn = document.getElementById('save-device');
    const cancelDeviceBtn = document.getElementById('cancel-device');
    const backToFormBtn = document.getElementById('back-to-form');
    const editBtns = document.querySelectorAll('.edit-btn');
    const deleteBtns = document.querySelectorAll('.delete-btn');
    const deviceTable = document.getElementById('device-table');
    
    // 表格排序功能
    const sortableHeaders = document.querySelectorAll('.sortable');
    let currentSortColumn = null;
    let isAscending = true;
    
    // 设备表单数据重置
    function resetForm() {
        document.getElementById('device-name').value = '';
        document.getElementById('device-location').value = '';
        document.getElementById('device-id').value = '';
        document.getElementById('device-type').value = 'camera';
        document.getElementById('device-status').value = 'active';
        document.getElementById('device-ip').value = '';
        document.getElementById('device-description').value = '';
        formTitle.textContent = '添加设备';
    }
    
    // 显示设备表单
    function showDeviceForm() {
        deviceForm.classList.remove('hidden');
        deviceDetails.classList.add('hidden');
    }
    
    // 显示设备详情
    function showDeviceDetails(deviceData) {
        // 填充设备详情
        document.getElementById('detail-title').textContent = '设备详情：' + deviceData.name;
        document.getElementById('detail-name').textContent = deviceData.name;
        document.getElementById('detail-location').textContent = deviceData.location;
        document.getElementById('detail-id').textContent = deviceData.id;
        document.getElementById('detail-type').textContent = deviceData.type;
        
        // 更新状态样式
        const statusElement = document.getElementById('detail-status');
        statusElement.textContent = deviceData.status;
        statusElement.className = 'detail-value';
        if (deviceData.status === '正常运行') {
            statusElement.classList.add('status-active');
        } else if (deviceData.status === '需要维护') {
            statusElement.classList.add('status-warning');
        } else if (deviceData.status === '离线') {
            statusElement.classList.add('status-offline');
        }
        
        document.getElementById('detail-ip').textContent = deviceData.ip;
        document.getElementById('detail-lastActive').textContent = deviceData.lastActive;
        document.getElementById('detail-description').textContent = deviceData.description;
        
        // 显示详情面板
        deviceForm.classList.add('hidden');
        deviceDetails.classList.remove('hidden');
    }
    
    // 获取表格行数据
    function getRowData(row) {
        const cells = row.cells;
        
        // 获取状态文本
        const statusText = cells[3].querySelector('span').textContent;
        
        return {
            name: cells[0].textContent,
            location: cells[1].textContent,
            id: cells[2].textContent,
            status: statusText,
            lastActive: cells[4].textContent,
            type: '监控摄像头', // 假设类型
            ip: '192.168.1.' + (100 + Math.floor(Math.random() * 100)), // 模拟IP
            description: `用于监控${cells[1].textContent}的摄像头，设备型号为XX-100，安装于2025年1月。` // 模拟描述
        };
    }
    
    // 填充编辑表单
    function fillEditForm(deviceData) {
        document.getElementById('device-name').value = deviceData.name;
        document.getElementById('device-location').value = deviceData.location;
        document.getElementById('device-id').value = deviceData.id;
        
        // 设置设备类型
        let deviceType = 'camera';
        if (deviceData.type.includes('传感器')) deviceType = 'sensor';
        if (deviceData.type.includes('报警')) deviceType = 'alarm';
        document.getElementById('device-type').value = deviceType;
        
        // 设置设备状态
        let deviceStatus = 'active';
        if (deviceData.status === '需要维护') deviceStatus = 'warning';
        if (deviceData.status === '离线') deviceStatus = 'offline';
        document.getElementById('device-status').value = deviceStatus;
        
        document.getElementById('device-ip').value = deviceData.ip;
        document.getElementById('device-description').value = deviceData.description;
        
        formTitle.textContent = '编辑设备';
    }
    
    // 添加设备按钮点击事件
    addDeviceBtn.addEventListener('click', function() {
        resetForm();
        showDeviceForm();
    });
    
    // 保存设备按钮点击事件
    saveDeviceBtn.addEventListener('click', function() {
        // 在实际应用中，这里应该有表单验证和数据保存的逻辑
        alert('设备信息已保存！');
        resetForm();
    });
    
    // 取消按钮点击事件
    cancelDeviceBtn.addEventListener('click', function() {
        resetForm();
    });
    
    // 返回按钮点击事件
    backToFormBtn.addEventListener('click', function() {
        showDeviceForm();
    });
    
    // 编辑按钮点击事件
    editBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const row = this.closest('tr');
            const deviceData = getRowData(row);
            fillEditForm(deviceData);
            showDeviceForm();
        });
    });
    
    // 删除按钮点击事件
    deleteBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (confirm('确定要删除此设备吗？')) {
                // 在实际应用中，这里应该有删除数据的逻辑
                this.closest('tr').remove();
            }
        });
    });
    
    // 表格行点击事件 - 显示设备详情
    deviceTable.addEventListener('click', function(e) {
        // 如果点击的是操作按钮或其父元素，则不执行查看详情
        if (e.target.closest('.action-cell')) {
            return;
        }
        
        const row = e.target.closest('tr');
        if (row && row.parentElement.tagName === 'TBODY') {
            const deviceData = getRowData(row);
            showDeviceDetails(deviceData);
        }
    });
    
    // 表格排序功能
    sortableHeaders.forEach(header => {
        header.addEventListener('click', function() {
            const column = this.getAttribute('data-sort');
            const columnIndex = Array.from(this.parentNode.children).indexOf(this);
            
            // 切换排序方向
            if (currentSortColumn === column) {
                isAscending = !isAscending;
            } else {
                currentSortColumn = column;
                isAscending = true;
            }
            
            // 更新排序图标
            sortableHeaders.forEach(h => {
                const icon = h.querySelector('.sort-icon i');
                if (h === this) {
                    icon.className = isAscending ? 'fas fa-sort-up' : 'fas fa-sort-down';
                } else {
                    icon.className = 'fas fa-sort';
                }
            });
            
            // 获取表格行
            const tbody = deviceTable.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // 排序行
            rows.sort((a, b) => {
                let aValue = a.cells[columnIndex].textContent;
                let bValue = b.cells[columnIndex].textContent;
                
                // 如果是状态列，需要特殊处理
                if (column === 'status') {
                    aValue = a.cells[columnIndex].querySelector('span').textContent;
                    bValue = b.cells[columnIndex].querySelector('span').textContent;
                }
                
                // 比较
                if (aValue < bValue) {
                    return isAscending ? -1 : 1;
                }
                if (aValue > bValue) {
                    return isAscending ? 1 : -1;
                }
                return 0;
            });
            
            // 重新插入排序后的行
            rows.forEach(row => {
                tbody.appendChild(row);
            });
        });
    });
}); 