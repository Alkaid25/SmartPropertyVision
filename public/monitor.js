document.addEventListener('DOMContentLoaded', function () {
    // Socket.IO 连接 - 完全修复SSL问题
    const socket = io({
        forceNew: true,
        secure: false,
        rejectUnauthorized: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        transports: ['websocket', 'polling']
    });

    console.log('监控页面初始化...');
    
    // 初始化对象检测模块
    detector.init(socket);
    
    // 生成随机设备ID
    const deviceId = Math.random().toString(36).substring(2, 15);
    let connectedDevices = []; // 已连接的设备列表
    let peerConnections = {}; // WebRTC连接
    let currentDeviceIndex = -1; // 当前选中的设备索引
    let gridPages = []; // 网格视图中的页面
    let currentGridPage = 0; // 当前网格页面
    
    // 获取DOM元素
    const mainVideo = document.getElementById('main-video');
    const mainVideoWrapper = document.getElementById('main-video-wrapper');
    const mainVideoPlaceholder = document.getElementById('main-video-placeholder');
    const connectHint = document.getElementById('connect-hint');
    const selectorItems = document.getElementById('selector-items');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const currentLocation = document.getElementById('current-location');
    const currentTime = document.getElementById('current-time');
    const gridCurrentTime = document.getElementById('grid-current-time');
    const streamTime = document.getElementById('stream-time');
    const singleView = document.getElementById('single-view');
    const gridView = document.getElementById('grid-view');
    const singleViewBtn = document.getElementById('single-view-btn');
    const gridViewBtn = document.getElementById('grid-view-btn');
    const singleViewBtn2 = document.getElementById('single-view-btn-2');
    const gridViewBtn2 = document.getElementById('grid-view-btn-2');
    const videoGrid = document.getElementById('video-grid');
    const currentPageSpan = document.getElementById('current-page');
    const totalPagesSpan = document.getElementById('total-pages');
    const prevGridBtn = document.getElementById('prev-grid-btn');
    const nextGridBtn = document.getElementById('next-grid-btn');
    
    // 初始化
    updateCurrentTime();
    loadDevices();
    setInterval(updateCurrentTime, 1000);
    
    // 注册为主设备
    socket.on('connect', () => {
        console.log('已连接到信令服务器, socket ID:', socket.id);
        
        // 注册设备
        socket.emit('register', {
            deviceId: deviceId,
            deviceType: 'main'
        });
    });
    
    // 监听注册响应
    socket.on('register_response', (data) => {
        console.log('注册响应:', data);
        if (data.success) {
            console.log('主设备注册成功, ID:', deviceId);
        }
    });
    
    // 监听Offer
    socket.on('offer', async (data) => {
        console.log('收到Offer:', data);
        try {
            const offer = data.offer;
            const sourceId = data.sourceId;
            
            // 处理收到的offer
            await handleIncomingOffer(sourceId, offer);
        } catch (error) {
            console.error('处理offer失败:', error);
        }
    });
    
    // 监听ICE候选
    socket.on('ice_candidate', async (data) => {
        console.log('收到ICE候选:', data);
        const sourceId = data.sourceId;
        
        if (peerConnections[sourceId]) {
            try {
                await peerConnections[sourceId].addIceCandidate(
                    new RTCIceCandidate(data.candidate)
                );
                console.log('添加ICE候选成功');
            } catch (error) {
                console.error('处理ICE候选失败:', error);
            }
        } else {
            console.warn('未找到对应的PeerConnection:', sourceId);
        }
    });
    
    // 监听设备断开连接
    socket.on('device_disconnected', (data) => {
        console.log('设备断开连接:', data);
        const disconnectedId = data.deviceId;
        
        // 移除WebRTC连接
        if (peerConnections[disconnectedId]) {
            peerConnections[disconnectedId].close();
            delete peerConnections[disconnectedId];
        }
        
        // 更新设备状态
        const deviceIndex = connectedDevices.findIndex(d => d.deviceId === disconnectedId);
        if (deviceIndex !== -1) {
            connectedDevices[deviceIndex].status = 'offline';
            
            // 如果当前显示的是断开的设备，则移除视频
            if (currentDeviceIndex === deviceIndex) {
                mainVideoWrapper.classList.add('hidden');
                mainVideoPlaceholder.classList.remove('hidden');
                currentLocation.textContent = '设备已断开连接';
            }
            
            // 更新设备列表和网格视图
            renderDeviceSelector();
            renderGridView();
        }
    });
    
    // 监听边缘设备上线事件
    socket.on('edge_device_online', (data) => {
        console.log('边缘设备上线:', data);
        
        const edgeId = data.deviceId;
        const deviceName = data.deviceName || `设备 ${edgeId.substring(0, 4)}`;
        const deviceLocation = data.deviceLocation || '未知位置';
        
        // 查找设备是否已在列表中
        const deviceIndex = connectedDevices.findIndex(d => d.deviceId === edgeId);
        
        if (deviceIndex === -1) {
            // 添加新设备到列表
            const newDevice = {
                deviceId: edgeId,
                name: deviceName,
                location: deviceLocation,
                status: 'available',
                type: 'camera'
            };
            
            connectedDevices.push(newDevice);
            console.log('新边缘设备添加到列表:', newDevice);
            
            // 更新界面
            renderDeviceSelector();
            renderGridView();
            
            // 如果是第一个设备，自动选择
            if (connectedDevices.length === 1) {
                selectDevice(0);
            }
        } else {
            // 更新设备状态
            connectedDevices[deviceIndex].status = 'available';
            connectedDevices[deviceIndex].name = deviceName;
            connectedDevices[deviceIndex].location = deviceLocation;
            
            // 更新界面
            renderDeviceSelector();
            renderGridView();
        }
    });
    
    // 处理收到的Offer并创建Answer
    async function handleIncomingOffer(edgeId, offer) {
        console.log('处理收到的Offer，edgeId:', edgeId);
        // 查找设备
        const deviceIndex = connectedDevices.findIndex(d => d.deviceId === edgeId);
        let device;
        
        if (deviceIndex === -1) {
            // 新设备连接，从本地存储中查找是否有设备信息
            device = findDeviceFromStorage(edgeId);
            
            if (!device) {
                // 没有找到设备信息，使用默认值
                device = {
                    deviceId: edgeId,
                    name: `未知设备 (${edgeId.substring(0, 4)})`,
                    location: '未知位置',
                    status: 'active',
                    type: 'camera',
                    stream: null
                };
            } else {
                device.status = 'active';
                device.stream = null;
            }
            
            // 添加到已连接设备列表
            connectedDevices.push(device);
            currentDeviceIndex = connectedDevices.length - 1;
            console.log('新设备连接，添加到列表:', device);
        } else {
            // 更新已有设备状态
            device = connectedDevices[deviceIndex];
            device.status = 'active';
            
            // 设备已存在，保留现有视频流，不要清理流
            // 流会在ontrack事件中更新
            
            currentDeviceIndex = deviceIndex;
            console.log('更新现有设备状态:', device);
        }
        
        // 创建RTCPeerConnection
        const pc = createPeerConnection(edgeId);
        
        try {
            // 设置远程描述
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('远程描述设置成功');
            
            // 创建Answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('本地描述设置成功，创建Answer');
            
            // 发送Answer
            socket.emit('answer', {
                sourceId: deviceId,
                targetId: edgeId,
                answer: answer
            });
            console.log('Answer已发送到', edgeId);
            
            // 更新界面，但保持现有流显示
            renderDeviceSelector();
            renderGridView();
            selectDevice(currentDeviceIndex);
            
            return answer;
        } catch (error) {
            console.error('创建Answer失败:', error);
            throw error;
        }
    }
    
    // 创建PeerConnection
    function createPeerConnection(edgeId) {
        console.log(`创建与设备 ${edgeId} 的PeerConnection`);
        
        // 配置STUN服务器
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        const peerConnection = new RTCPeerConnection(configuration);
        
        // 当接收到ICE候选时，发送给边缘设备
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('发送ICE候选到边缘设备');
                socket.emit('ice_candidate', {
                    targetId: edgeId,
                    sourceId: deviceId,
                    candidate: event.candidate
                });
            }
        };
        
        // 连接状态改变时
        peerConnection.onconnectionstatechange = (event) => {
            console.log(`PeerConnection状态: ${peerConnection.connectionState}`);
        };
        
        // 当接收到远程流时
        peerConnection.ontrack = (event) => {
            console.log(`收到远程流, tracks: ${event.streams[0].getTracks().length}`);
            if (event.streams && event.streams[0]) {
                const stream = event.streams[0];
                
                // 更新设备状态
                const deviceIndex = connectedDevices.findIndex(d => d.deviceId === edgeId);
                if (deviceIndex !== -1) {
                    connectedDevices[deviceIndex].stream = stream;
                    connectedDevices[deviceIndex].status = 'active';
                    
                    // 如果当前选中的是这个设备，则更新主视频
                    if (currentDeviceIndex === deviceIndex) {
                        updateMainVideo(stream, deviceIndex);
                        
                        // 启动对象检测
                        startDetection(mainVideo, connectedDevices[deviceIndex]);
                    }
                    
                    // 更新设备选择器
                    renderDeviceSelector();
                    
                    // 更新网格视图
                    updateGridVideoStream(edgeId, stream);
                }
            }
        };
        
        // 错误处理
        peerConnection.onerror = (error) => {
            console.error(`PeerConnection错误: ${error}`);
        };
        
        return peerConnection;
    }
    
    // 更新主视频显示
    function updateMainVideo(stream, deviceIndex) {
        try {
            // 停止现有流的播放（不停止轨道）
            if (mainVideo.srcObject) {
                mainVideo.srcObject = null;
            }
            
            // 克隆流以避免共享问题
            const clonedStream = new MediaStream();
            stream.getTracks().forEach(track => {
                clonedStream.addTrack(track);
            });
            
            // 设置新的流
            mainVideo.srcObject = clonedStream;
            
            // 确保视频元素可见和正确显示
            mainVideo.style.display = 'block';
            mainVideo.style.width = '100%';
            mainVideo.style.height = '100%';
            mainVideo.style.objectFit = 'contain'; // 保持原始比例
            mainVideo.style.backgroundColor = '#000';
            
            mainVideoWrapper.classList.remove('hidden');
            mainVideoPlaceholder.classList.add('hidden');
            connectHint.classList.add('hidden');
            currentLocation.textContent = connectedDevices[deviceIndex].location || '未知位置';
            
            // 先静音播放
            mainVideo.muted = true;
            mainVideo.play().catch(e => console.error('主视图自动播放失败:', e));
            
            // 启动对象检测
            if (mainVideo && stream && connectedDevices[deviceIndex]) {
                startDetection(mainVideo, connectedDevices[deviceIndex]);
            }
        } catch (error) {
            console.error('更新主视频显示失败:', error);
        }
    }
    
    // 更新缩略图视频
    function updateThumbnailVideo(deviceId, stream) {
        const thumbnailVideo = document.getElementById(`thumbnail-video-${deviceId}`);
        if (thumbnailVideo) {
            try {
                // 停止现有流
                if (thumbnailVideo.srcObject) {
                    thumbnailVideo.srcObject = null;
                }
                
                // 克隆流以避免共享问题
                const clonedStream = new MediaStream();
                stream.getTracks().forEach(track => {
                    clonedStream.addTrack(track);
                });
                
                // 设置新的流
                thumbnailVideo.srcObject = clonedStream;
                thumbnailVideo.classList.remove('hidden');
                
                // 隐藏占位符
                const placeholder = thumbnailVideo.previousElementSibling;
                if (placeholder && placeholder.classList.contains('video-placeholder-small')) {
                    placeholder.classList.add('hidden');
                }
                
                // 播放视频
                thumbnailVideo.play().catch(e => {
                    console.error('缩略图视频播放失败:', e);
                });
            } catch (error) {
                console.error('更新缩略图视频失败:', error);
            }
        }
    }
    
    // 更新网格视图中的视频流
    function updateGridVideoStream(deviceId, stream) {
        const gridVideo = document.getElementById(`grid-video-${deviceId}`);
        if (gridVideo) {
            console.log('更新网格视图视频:', deviceId, '流ID:', stream.id);
            
            // 停止现有流
            if (gridVideo.srcObject) {
                try {
                    const tracks = gridVideo.srcObject.getTracks();
                    tracks.forEach(track => track.stop());
                } catch (e) {
                    console.log('停止网格视图现有流出错:', e);
                }
            }
            
            try {
                // 设置新的流
                gridVideo.srcObject = null; // 先清除
                
                // 克隆流以避免共享问题
                const clonedStream = new MediaStream();
                stream.getTracks().forEach(track => {
                    clonedStream.addTrack(track);
                });
                gridVideo.srcObject = clonedStream;
                
                gridVideo.classList.remove('hidden');
                
                // 确保视频元素可见
                gridVideo.style.display = 'block';
                gridVideo.style.width = '100%';
                gridVideo.style.height = '100%';
                gridVideo.style.objectFit = 'contain'; // 保持原始比例
                gridVideo.style.backgroundColor = '#000';
                
                // 先静音
                gridVideo.muted = true;
                
                // 隐藏占位符
                const placeholder = gridVideo.parentElement.querySelector('.video-placeholder');
                if (placeholder) {
                    placeholder.classList.add('hidden');
                }
                
                // 直接播放视频
                gridVideo.play().catch(e => {
                    console.error('网格视图视频播放失败:', e);
                    // 静默处理播放错误，可能需要用户交互
                });
            } catch (error) {
                console.error('设置网格视图视频失败:', error);
            }
        } else {
            console.warn('找不到网格视频元素:', `grid-video-${deviceId}`);
        }
    }
    
    // 查找本地存储中的设备信息
    function findDeviceFromStorage(deviceId) {
        const savedDevices = localStorage.getItem('devices');
        if (savedDevices) {
            const devices = JSON.parse(savedDevices);
            return devices.find(d => d.deviceId === deviceId);
        }
        return null;
    }
    
    // 加载设备列表
    function loadDevices() {
        // 从本地存储中加载设备列表
        const savedDevices = localStorage.getItem('devices');
        if (savedDevices) {
            const devices = JSON.parse(savedDevices);
            
            // 筛选出摄像头类型的设备
            connectedDevices = devices.filter(d => d.type === 'camera').map(d => {
                return {
                    ...d,
                    status: 'offline',  // 初始状态为离线
                    stream: null        // 初始没有视频流
                };
            });
            
            // 渲染设备选择器和网格视图
            renderDeviceSelector();
            renderGridView();
            
            // 如果没有设备，显示连接提示
            if (connectedDevices.length === 0) {
                connectHint.classList.remove('hidden');
            } else {
                connectHint.classList.add('hidden');
                // 如果有设备，默认选择第一个
                if (currentDeviceIndex === -1 && connectedDevices.length > 0) {
                    selectDevice(0);
                }
            }
            
            // 设置一个定时器，等待可能的Socket连接完成，然后尝试自动连接
            setTimeout(() => {
                // 遍历尝试连接所有可用设备
                connectedDevices.forEach(device => {
                    if (device.status === 'offline' || device.status === 'available') {
                        // 发送连接请求
                        connectToEdgeDevice(device.deviceId);
                    }
                });
            }, 2000); // 延迟2秒，确保Socket连接已建立
        } else {
            // 没有设备，显示连接提示
            connectHint.classList.remove('hidden');
        }
    }
    
    // 渲染设备选择器
    function renderDeviceSelector() {
        if (connectedDevices.length === 0) {
            selectorItems.innerHTML = '<div class="empty-state"><p>无可用设备</p></div>';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        
        let html = '';
        connectedDevices.forEach((device, index) => {
            const activeClass = index === currentDeviceIndex ? 'active' : '';
            const statusIcon = device.status === 'active' ? 
                '<i class="fas fa-circle" style="color: #27ae60; font-size: 8px; position: absolute; top: 5px; right: 5px;"></i>' : 
                '<i class="fas fa-circle" style="color: #e74c3c; font-size: 8px; position: absolute; top: 5px; right: 5px;"></i>';
            
            html += `
                <div class="selector-item ${activeClass}" data-index="${index}">
                    <div class="video-thumbnail" style="position: relative;">
                        ${statusIcon}
                        <div class="video-placeholder-small ${device.stream ? 'hidden' : ''}">
                            <i class="fas fa-film"></i>
                        </div>
                        <video id="thumbnail-video-${device.deviceId}" 
                               class="thumbnail-video ${device.stream ? '' : 'hidden'}" 
                               autoplay playsinline muted 
                               style="width:100%; height:100%; object-fit:contain; display:block; background-color:#000;"></video>
                    </div>
                    <div class="video-name">${device.name}</div>
                </div>
            `;
        });
        
        selectorItems.innerHTML = html;
        
        // 为缩略图视频设置流
        connectedDevices.forEach((device, index) => {
            if (device.stream) {
                try {
                    const thumbnailVideo = document.getElementById(`thumbnail-video-${device.deviceId}`);
                    if (thumbnailVideo) {
                        if (thumbnailVideo.srcObject) {
                            // 停止现有流
                            try {
                                const tracks = thumbnailVideo.srcObject.getTracks();
                                tracks.forEach(track => track.stop());
                            } catch (e) {
                                console.log('停止缩略图现有流出错:', e);
                            }
                        }
                        
                        // 克隆流以避免共享问题
                        const clonedStream = new MediaStream();
                        device.stream.getTracks().forEach(track => {
                            clonedStream.addTrack(track);
                        });
                        
                        thumbnailVideo.srcObject = clonedStream;
                        thumbnailVideo.play().catch(e => {
                            console.error('缩略图视频播放失败:', e);
                        });
                    }
                } catch (error) {
                    console.error('设置缩略图视频流失败:', error, device.deviceId);
                }
            }
        });
        
        // 添加点击事件
        document.querySelectorAll('.selector-item').forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                selectDevice(index);
            });
        });
        
        // 更新导航按钮状态
        updateNavButtons();
    }
    
    // 选择设备
    function selectDevice(index) {
        if (index < 0 || index >= connectedDevices.length) return;
        
        currentDeviceIndex = index;
        const device = connectedDevices[index];
        console.log('选择设备:', device);
        
        // 更新当前位置显示
        currentLocation.textContent = device.location || '未知位置';
        
        // 移除所有选择器项的活动状态
        document.querySelectorAll('.selector-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // 为当前选择的项添加活动状态
        const selectedItem = document.querySelector(`.selector-item[data-index="${index}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }
        
        // 显示视频
        if (device.stream) {
            console.log('选择设备时设置视频流:', device, '流ID:', device.stream.id);
            
            // 确保视频元素可见
            mainVideo.style.display = 'block';
            mainVideo.style.width = '100%';
            mainVideo.style.height = '100%';
            mainVideo.style.objectFit = 'contain';
            mainVideo.style.backgroundColor = '#000';
            
            // 停止当前可能的播放但不停止轨道，因为轨道可能被其他地方使用
            if (mainVideo.srcObject) {
                mainVideo.srcObject = null;
            }
            
            // 克隆流以避免共享问题
            try {
                const clonedStream = new MediaStream();
                device.stream.getTracks().forEach(track => {
                    clonedStream.addTrack(track);
                });
                
                // 设置视频源
                mainVideo.srcObject = clonedStream;
                mainVideoWrapper.classList.remove('hidden');
                mainVideoPlaceholder.classList.add('hidden');
                connectHint.classList.add('hidden');
                
                // 确保视频元素正常播放
                mainVideo.muted = true; // 先静音以确保可以自动播放
                mainVideo.play().catch(e => {
                    console.error('设备切换后视频播放失败:', e);
                    setTimeout(() => {
                        mainVideo.play().catch(e2 => {
                            console.error('重试播放失败:', e2);
                        });
                    }, 500);
                });
            } catch (error) {
                console.error('克隆视频流失败:', error);
                // 直接使用原始流作为备选方案
                mainVideo.srcObject = device.stream;
                mainVideo.play().catch(e => console.error('设备切换后备用视频播放失败:', e));
            }
        } else {
            // 没有视频流，显示占位符
            mainVideoWrapper.classList.add('hidden');
            mainVideoPlaceholder.classList.remove('hidden');
            connectHint.classList.add('hidden');
            
            // 尝试连接到该设备
            if (device.status === 'available' || device.status === 'offline') {
                connectToEdgeDevice(device.deviceId);
            }
        }
        
        // 更新导航按钮状态
        updateNavButtons();
    }
    
    // 连接到边缘设备
    function connectToEdgeDevice(edgeId) {
        console.log(`尝试连接到边缘设备 ${edgeId}`);
        
        // 发送连接请求
        socket.emit('connection_request', {
            sourceId: deviceId,
            targetId: edgeId
        });
        
        // 更新设备状态
        const deviceIndex = connectedDevices.findIndex(d => d.deviceId === edgeId);
        if (deviceIndex !== -1) {
            connectedDevices[deviceIndex].status = 'connecting';
            // 更新UI
            renderDeviceSelector();
        }
        
        console.log(`已发送连接请求到边缘设备 ${edgeId}`);
    }
    
    // 更新导航按钮状态
    function updateNavButtons() {
        prevBtn.disabled = currentDeviceIndex <= 0;
        nextBtn.disabled = currentDeviceIndex >= connectedDevices.length - 1;
    }
    
    // 更新网格视图按钮状态
    function updateGridNavButtons() {
        prevGridBtn.disabled = currentGridPage <= 0;
        nextGridBtn.disabled = currentGridPage >= gridPages.length - 1;
        
        currentPageSpan.textContent = gridPages.length > 0 ? currentGridPage + 1 : 1;
        totalPagesSpan.textContent = gridPages.length > 0 ? gridPages.length : 1;
    }
    
    // 渲染网格视图
    function renderGridView() {
        if (connectedDevices.length === 0) {
            videoGrid.innerHTML = `
                <div class="empty-state" style="width: 100%; height: 100%;">
                    <i class="fas fa-film"></i>
                    <p>无可用设备</p>
                </div>
            `;
            gridPages = [];
            currentGridPage = 0;
            updateGridNavButtons();
            return;
        }
        
        // 每页最多显示4个视频源
        const devicesPerPage = 4;
        const pageCount = Math.ceil(connectedDevices.length / devicesPerPage);
        
        gridPages = [];
        for (let i = 0; i < pageCount; i++) {
            gridPages.push(i);
        }
        
        // 确保当前页索引有效
        if (currentGridPage >= pageCount) {
            currentGridPage = pageCount - 1;
        }
        
        let html = '';
        for (let i = 0; i < pageCount; i++) {
            const activeClass = i === currentGridPage ? 'active' : '';
            const startIndex = i * devicesPerPage;
            const endIndex = Math.min(startIndex + devicesPerPage, connectedDevices.length);
            const deviceCount = endIndex - startIndex;
            
            // 为每个页面创建一个grid-page
            html += `<div class="grid-page ${activeClass}">`;
            
            // 根据设备数量决定布局
            if (deviceCount === 1) {
                // 1个视频源：居中显示，填充大部分空间
                const device = connectedDevices[startIndex];
                html += `
                    <div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; padding:10px 60px;">
                        <div style="width:100%; max-width:800px; max-height:80%; display:flex; justify-content:center;">
                            <div class="video-wrapper" data-id="${device.deviceId}" style="width:100%; aspect-ratio:16/9;">
                                <div class="video-placeholder ${device.stream ? 'hidden' : ''}">
                                    <i class="fas fa-film"></i>
                                </div>
                                <video id="grid-video-${device.deviceId}" class="${device.stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                <div class="video-label">${device.name}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (deviceCount === 2) {
                // 2个视频源：水平排列，两个大小相等
                html += `
                    <div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; padding:10px 60px;">
                        <div style="width:100%; max-width:1000px; max-height:80%; display:flex; justify-content:center; gap:10px;">
                `;
                
                for (let j = startIndex; j < endIndex; j++) {
                    const device = connectedDevices[j];
                    html += `
                        <div style="width:50%; display:flex; justify-content:center;">
                            <div class="video-wrapper" data-id="${device.deviceId}" style="width:100%; aspect-ratio:16/9;">
                                <div class="video-placeholder ${device.stream ? 'hidden' : ''}">
                                    <i class="fas fa-film"></i>
                                </div>
                                <video id="grid-video-${device.deviceId}" class="${device.stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                <div class="video-label">${device.name}</div>
                            </div>
                        </div>
                    `;
                }
                
                html += `</div></div>`;
            } else if (deviceCount === 3) {
                // 3个视频源：一行一个，一行两个，所有视频大小相等
                html += `
                    <div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; padding:10px 60px;">
                        <div style="width:100%; max-width:900px; height:100%; max-height:80%; display:flex; flex-direction:column; gap:10px;">
                            <!-- 一行一个视频 -->
                            <div style="display:flex; width:100%; justify-content:center; height:calc(50% - 5px);">
                                <div style="width:50%;">
                                    <div class="video-wrapper" data-id="${connectedDevices[startIndex].deviceId}" style="width:100%; height:100%; aspect-ratio:16/9;">
                                        <div class="video-placeholder ${connectedDevices[startIndex].stream ? 'hidden' : ''}">
                                            <i class="fas fa-film"></i>
                                        </div>
                                        <video id="grid-video-${connectedDevices[startIndex].deviceId}" class="${connectedDevices[startIndex].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                        <div class="video-label">${connectedDevices[startIndex].name}</div>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- 一行两个视频 -->
                            <div style="display:flex; width:100%; justify-content:center; gap:10px; height:calc(50% - 5px);">
                                <div style="width:50%; display:flex; justify-content:flex-end;">
                                    <div class="video-wrapper" data-id="${connectedDevices[startIndex + 1].deviceId}" style="width:100%; height:100%; aspect-ratio:16/9;">
                                        <div class="video-placeholder ${connectedDevices[startIndex + 1].stream ? 'hidden' : ''}">
                                            <i class="fas fa-film"></i>
                                        </div>
                                        <video id="grid-video-${connectedDevices[startIndex + 1].deviceId}" class="${connectedDevices[startIndex + 1].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                        <div class="video-label">${connectedDevices[startIndex + 1].name}</div>
                                    </div>
                                </div>
                                <div style="width:50%; display:flex; justify-content:flex-start;">
                                    <div class="video-wrapper" data-id="${connectedDevices[startIndex + 2].deviceId}" style="width:100%; height:100%; aspect-ratio:16/9;">
                                        <div class="video-placeholder ${connectedDevices[startIndex + 2].stream ? 'hidden' : ''}">
                                            <i class="fas fa-film"></i>
                                        </div>
                                        <video id="grid-video-${connectedDevices[startIndex + 2].deviceId}" class="${connectedDevices[startIndex + 2].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                        <div class="video-label">${connectedDevices[startIndex + 2].name}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else if (deviceCount === 4) {
                // 4个视频源：2x2网格，四个大小相等
                html += `
                    <div style="width:100%; height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:10px 60px;">
                        <!-- 使用固定的两行结构，而不是依赖flex-wrap -->
                        <div style="width:100%; max-width:1000px; display:flex; flex-direction:column; height:100%; gap:10px;">
                            <!-- 第一行：两个视频 -->
                            <div style="display:flex; width:100%; height:calc(50% - 5px); gap:10px;">
                                <!-- 第一个视频 -->
                                <div class="video-wrapper" data-id="${connectedDevices[startIndex].deviceId}" style="width:50%; height:100%; aspect-ratio: 16/9;">
                                    <div class="video-placeholder ${connectedDevices[startIndex].stream ? 'hidden' : ''}">
                                        <i class="fas fa-film"></i>
                                    </div>
                                    <video id="grid-video-${connectedDevices[startIndex].deviceId}" class="${connectedDevices[startIndex].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                    <div class="video-label">${connectedDevices[startIndex].name}</div>
                                </div>
                                
                                <!-- 第二个视频 -->
                                <div class="video-wrapper" data-id="${connectedDevices[startIndex+1].deviceId}" style="width:50%; height:100%; aspect-ratio: 16/9;">
                                    <div class="video-placeholder ${connectedDevices[startIndex+1].stream ? 'hidden' : ''}">
                                        <i class="fas fa-film"></i>
                                    </div>
                                    <video id="grid-video-${connectedDevices[startIndex+1].deviceId}" class="${connectedDevices[startIndex+1].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                    <div class="video-label">${connectedDevices[startIndex+1].name}</div>
                                </div>
                            </div>
                            
                            <!-- 第二行：两个视频 -->
                            <div style="display:flex; width:100%; height:calc(50% - 5px); gap:10px;">
                                <!-- 第三个视频 -->
                                <div class="video-wrapper" data-id="${connectedDevices[startIndex+2].deviceId}" style="width:50%; height:100%; aspect-ratio: 16/9;">
                                    <div class="video-placeholder ${connectedDevices[startIndex+2].stream ? 'hidden' : ''}">
                                        <i class="fas fa-film"></i>
                                    </div>
                                    <video id="grid-video-${connectedDevices[startIndex+2].deviceId}" class="${connectedDevices[startIndex+2].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                    <div class="video-label">${connectedDevices[startIndex+2].name}</div>
                                </div>
                                
                                <!-- 第四个视频 -->
                                <div class="video-wrapper" data-id="${connectedDevices[startIndex+3].deviceId}" style="width:50%; height:100%; aspect-ratio: 16/9;">
                                    <div class="video-placeholder ${connectedDevices[startIndex+3].stream ? 'hidden' : ''}">
                                        <i class="fas fa-film"></i>
                                    </div>
                                    <video id="grid-video-${connectedDevices[startIndex+3].deviceId}" class="${connectedDevices[startIndex+3].stream ? '' : 'hidden'}" autoplay playsinline muted></video>
                                    <div class="video-label">${connectedDevices[startIndex+3].name}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            html += '</div>';
        }
        
        videoGrid.innerHTML = html;
        
        // 设置视频流
        setupGridVideos();
        
        // 更新网格导航按钮状态
        updateGridNavButtons();
    }
    
    // 设置网格视图中的视频流
    function setupGridVideos() {
        console.log('设置网格视图中的视频流');
        // 为网格视图中的视频设置流
        connectedDevices.forEach(device => {
            if (device.stream) {
                console.log('为网格视图设置视频流:', device.deviceId, '流ID:', device.stream.id);
                updateGridVideoStream(device.deviceId, device.stream);
            }
        });
        
        // 确保所有网格视频都能播放
        setTimeout(() => {
            document.querySelectorAll('[id^="grid-video-"]').forEach(videoEl => {
                if (videoEl.paused && videoEl.srcObject) {
                    videoEl.play().catch(e => {
                        console.log('尝试播放网格视图视频失败:', e);
                    });
                }
            });
        }, 500);

        // 添加点击事件
        document.querySelectorAll('.video-wrapper').forEach(wrapper => {
            wrapper.addEventListener('click', function() {
                const deviceId = this.getAttribute('data-id');
                const index = connectedDevices.findIndex(d => d.deviceId === deviceId);
                
                if (index !== -1) {
                    // 切换到单视图并选择该设备
                    showSingleView();
                    selectDevice(index);
                }
            });
        });
    }
    
    // 更新当前时间显示
    function updateCurrentTime() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const timeString = `${hours}:${minutes}:${seconds}`;
        currentTime.textContent = timeString;
        gridCurrentTime.textContent = timeString;
    }
    
    // 显示单视图
    function showSingleView() {
        singleView.classList.remove('hidden');
        gridView.classList.add('hidden');
        singleViewBtn.classList.add('active');
        gridViewBtn.classList.remove('active');
        singleViewBtn2.classList.remove('active');
        gridViewBtn2.classList.add('active');
        
        // 如果当前有选中设备并且有流，启动检测
        if (currentDeviceIndex >= 0 && 
            connectedDevices[currentDeviceIndex] && 
            connectedDevices[currentDeviceIndex].stream) {
            startDetection(mainVideo, connectedDevices[currentDeviceIndex]);
        }
    }
    
    // 显示网格视图
    function showGridView() {
        singleView.classList.add('hidden');
        gridView.classList.remove('hidden');
        singleViewBtn.classList.remove('active');
        gridViewBtn.classList.add('active');
        singleViewBtn2.classList.add('active');
        gridViewBtn2.classList.remove('active');
        
        // 网格视图暂停主视频检测
        detector.stopAllDetection();
    }
    
    // 事件监听：上一个设备
    prevBtn.addEventListener('click', function() {
        if (currentDeviceIndex > 0) {
            selectDevice(currentDeviceIndex - 1);
        }
    });
    
    // 事件监听：下一个设备
    nextBtn.addEventListener('click', function() {
        if (currentDeviceIndex < connectedDevices.length - 1) {
            selectDevice(currentDeviceIndex + 1);
        }
    });
    
    // 事件监听：网格视图上一页
    prevGridBtn.addEventListener('click', function() {
        if (currentGridPage > 0) {
            currentGridPage--;
            
            // 更新网格页面显示
            document.querySelectorAll('.grid-page').forEach((page, index) => {
                if (index === currentGridPage) {
                    page.classList.add('active');
                } else {
                    page.classList.remove('active');
                }
            });
            
            updateGridNavButtons();
        }
    });
    
    // 事件监听：网格视图下一页
    nextGridBtn.addEventListener('click', function() {
        if (currentGridPage < gridPages.length - 1) {
            currentGridPage++;
            
            // 更新网格页面显示
            document.querySelectorAll('.grid-page').forEach((page, index) => {
                if (index === currentGridPage) {
                    page.classList.add('active');
                } else {
                    page.classList.remove('active');
                }
            });
            
            updateGridNavButtons();
        }
    });
    
    // 事件监听：切换到单视图
    singleViewBtn.addEventListener('click', showSingleView);
    singleViewBtn2.addEventListener('click', showSingleView);
    
    // 事件监听：切换到网格视图
    gridViewBtn.addEventListener('click', showGridView);
    gridViewBtn2.addEventListener('click', showGridView);

    // 添加点击视频事件，用于激活自动播放
    mainVideo.addEventListener('click', function() {
        if (mainVideo.paused) {
            mainVideo.play().then(() => {
                console.log('视频开始播放 (用户触发)');
            }).catch(err => {
                console.error('用户触发播放失败:', err);
                // 尝试重新设置视频源
                refreshCurrentVideo();
            });
        }
    });
    
    // 添加视频错误处理
    mainVideo.addEventListener('error', function(e) {
        console.error('主视频加载错误:', e);
        refreshCurrentVideo();
    });
    
    // 重新加载当前选中的视频
    function refreshCurrentVideo() {
        if (currentDeviceIndex >= 0 && currentDeviceIndex < connectedDevices.length) {
            const device = connectedDevices[currentDeviceIndex];
            if (device && device.stream) {
                console.log('尝试刷新视频源:', device.deviceId);
                
                // 清除现有流
                if (mainVideo.srcObject) {
                    mainVideo.srcObject = null;
                }
                
                setTimeout(() => {
                    try {
                        // 重新克隆并设置流
                        const clonedStream = new MediaStream();
                        device.stream.getTracks().forEach(track => {
                            clonedStream.addTrack(track);
                        });
                        
                        mainVideo.srcObject = clonedStream;
                        mainVideo.muted = true;
                        mainVideo.play().catch(e => console.log('重新加载视频失败:', e));
                    } catch (error) {
                        console.error('刷新视频源失败:', error);
                    }
                }, 500);
            }
        }
    }
    
    // 处理页面可见性变化，解决切换标签页后视频停止问题
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            console.log('页面变为可见，检查视频播放状态');
            
            // 延迟一点执行，确保页面完全恢复
            setTimeout(() => {
                // 重新播放主视频
                if (mainVideo.srcObject && mainVideo.paused) {
                    mainVideo.play().catch(err => {
                        console.log('页面恢复可见后视频播放失败:', err);
                        // 如果播放失败，尝试刷新
                        refreshCurrentVideo();
                    });
                }
    
                // 重新播放网格视频
                document.querySelectorAll('[id^="grid-video-"]').forEach(video => {
                    if (video.srcObject && video.paused) {
                        video.play().catch(err => {
                            console.log('页面恢复可见后网格视频播放失败:', err);
                        });
                    }
                });
            }, 300);
        }
    });
    
    // 启动视频流对象检测
    function startDetection(videoElement, deviceInfo) {
        if (!videoElement || !deviceInfo) return;
        
        // 先停止所有其他检测，只对当前主视频进行检测
        detector.stopAllDetection();
        
        // 确保视频元素已加载
        if (videoElement.readyState >= 2) {
            detector.startDetection(videoElement, deviceInfo);
        } else {
            // 如果视频尚未加载，等待加载完成后开始检测
            videoElement.addEventListener('loadeddata', function onLoaded() {
                detector.startDetection(videoElement, deviceInfo);
                videoElement.removeEventListener('loadeddata', onLoaded);
            });
        }
    }
}); 