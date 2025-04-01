// 对象检测模块
class ObjectDetector {
    constructor(options = {}) {
        // 初始化配置
        this.enabled = options.enabled ?? true; // 是否启用检测
        this.confidence = options.confidence ?? 0.35; // 置信度阈值
        this.classes = options.classes ?? {
            0: { name: '电动车', enabled: true, color: 'rgba(255, 0, 0, 0.8)' },
            1: { name: '自行车', enabled: true, color: 'rgba(0, 255, 0, 0.8)' },
            2: { name: '烟', enabled: true, color: 'rgba(0, 0, 255, 0.8)' },
            3: { name: '火', enabled: true, color: 'rgba(255, 165, 0, 0.8)' }
        };
        this.detectionInterval = options.detectionInterval ?? 1000; // 检测频率，毫秒
        this.maxDetectionRecords = options.maxDetectionRecords ?? 20; // 最大检测记录数量
        this.saveDetections = options.saveDetections ?? false; // 是否保存检测结果到服务器
        this.persistenceThreshold = options.persistenceThreshold ?? 20000; // 持久性阈值，默认20秒
        this.alertEnabled = options.alertEnabled ?? true; // 是否启用一级预警，默认启用
        
        // 检测记录
        this.detectionRecords = [];
        this.processingVideos = {};
        this.socket = null;
        
        // 对象跟踪映射 - 用于追踪检测到的对象
        this.trackedObjects = {};
        // 记录已经在记录中的对象ID，避免重复记录
        this.recordedObjectIds = new Set();
        // 记录已经发送一级预警的对象ID，避免重复预警
        this.alertedObjectIds = new Set();
        
        // 绑定方法
        this.processVideoFrame = this.processVideoFrame.bind(this);
        this.handleDetectionResult = this.handleDetectionResult.bind(this);
    }
    
    // 初始化
    init(socket) {
        console.log('初始化对象检测模块...');
        this.socket = socket;
        
        // 与服务器通信，初始化检测服务
        if (socket) {
            socket.on('detection_result', this.handleDetectionResult);
            
            // 接收数据库保存成功的消息
            socket.on('db_save_result', (data) => {
                console.log('数据库保存结果:', data);
                // 如果保存成功，可以在UI上显示提示或更新状态
                if (data.success) {
                    // 可以触发事件通知UI更新
                    const event = new CustomEvent('db_save', { detail: data });
                    document.dispatchEvent(event);
                }
            });
        }
        
        // 启动定期清理过期对象的计时器
        setInterval(() => this.cleanupExpiredObjects(), 30000); // 每30秒清理一次
        
        // 定期打印跟踪状态 - 调试用
        setInterval(() => this.logTrackingStatus(), 10000); // 每10秒打印一次状态
        
        return this;
    }
    
    // 清理过期的对象跟踪记录
    cleanupExpiredObjects() {
        const now = Date.now();
        
        // 对于已保存到数据库的对象，保留更长时间再清理
        const savedExpireTime = 300000; // 5分钟
        // 对于未保存的对象，使用较短的过期时间
        const unsavedExpireTime = 60000; // 1分钟
        
        let cleanupCount = 0;
        
        for (const objectId in this.trackedObjects) {
            const obj = this.trackedObjects[objectId];
            const lastSeenDuration = now - obj.lastSeenTime;
            
            // 确定该对象的过期时间
            const expireTime = obj.savedToDb ? savedExpireTime : unsavedExpireTime;
            
            if (lastSeenDuration > expireTime) {
                // 对象已过期，从跟踪中移除
                delete this.trackedObjects[objectId];
                this.recordedObjectIds.delete(objectId);
                cleanupCount++;
            }
        }
        
        if (cleanupCount > 0) {
            console.log(`清理了 ${cleanupCount} 个过期对象跟踪记录`);
        }
    }
    
    // 设置配置
    setConfig(config) {
        if ('enabled' in config) this.enabled = config.enabled;
        if ('confidence' in config) this.confidence = config.confidence;
        if ('classes' in config) this.classes = {...this.classes, ...config.classes};
        if ('detectionInterval' in config) this.detectionInterval = config.detectionInterval;
        if ('maxDetectionRecords' in config) this.maxDetectionRecords = config.maxDetectionRecords;
        if ('saveDetections' in config) this.saveDetections = config.saveDetections;
        if ('persistenceThreshold' in config) this.persistenceThreshold = config.persistenceThreshold;
        if ('alertEnabled' in config) this.alertEnabled = config.alertEnabled;
        
        // 配置更新后通知服务器
        if (this.socket) {
            this.socket.emit('detection_config', {
                enabled: this.enabled,
                confidence: this.confidence,
                classes: Object.keys(this.classes).filter(id => this.classes[id].enabled),
                saveDetections: this.saveDetections,
                alertEnabled: this.alertEnabled
            });
        }
        
        console.log('检测配置已更新:', config);
        
        // 如果禁用了检测，则停止所有检测任务
        if (!this.enabled) {
            this.stopAllDetection();
        }
        
        return this;
    }
    
    // 获取配置
    getConfig() {
        return {
            enabled: this.enabled,
            confidence: this.confidence,
            classes: this.classes,
            detectionInterval: this.detectionInterval,
            maxDetectionRecords: this.maxDetectionRecords,
            saveDetections: this.saveDetections,
            persistenceThreshold: this.persistenceThreshold
        };
    }
    
    // 开始检测视频流
    startDetection(videoElement, deviceInfo) {
        if (!this.enabled || !videoElement || !deviceInfo) return;
        
        const deviceId = deviceInfo.deviceId;
        
        // 如果已经在处理该视频，则跳过
        if (this.processingVideos[deviceId]) return;
        
        console.log(`开始检测视频流: ${deviceInfo.name}`);
        
        // 创建离屏Canvas用于提取帧
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // 设置Canvas大小
        canvas.width = videoElement.videoWidth || 640;
        canvas.height = videoElement.videoHeight || 480;
        
        // 启动检测任务
        const detectionTask = {
            videoElement: videoElement,
            deviceInfo: deviceInfo,
            canvas: canvas,
            context: context,
            lastDetectionTime: 0,
            interval: setInterval(() => {
                this.processVideoFrame(deviceId);
            }, this.detectionInterval)
        };
        
        this.processingVideos[deviceId] = detectionTask;
        
        return this;
    }
    
    // 停止检测特定视频流
    stopDetection(deviceId) {
        if (this.processingVideos[deviceId]) {
            clearInterval(this.processingVideos[deviceId].interval);
            delete this.processingVideos[deviceId];
            console.log(`停止检测视频流: ${deviceId}`);
        }
        
        return this;
    }
    
    // 停止所有检测
    stopAllDetection() {
        for (const deviceId in this.processingVideos) {
            this.stopDetection(deviceId);
        }
        
        return this;
    }
    
    // 处理视频帧
    processVideoFrame(deviceId) {
        if (!this.enabled) return;
        
        const task = this.processingVideos[deviceId];
        if (!task || !task.videoElement.readyState === HTMLMediaElement.HAVE_ENOUGH_DATA) return;
        
        const now = Date.now();
        
        // 限制检测频率
        if (now - task.lastDetectionTime < this.detectionInterval) return;
        
        task.lastDetectionTime = now;
        
        // 从视频元素中提取帧到Canvas
        task.context.drawImage(
            task.videoElement, 
            0, 0, 
            task.canvas.width, 
            task.canvas.height
        );
        
        // 将帧转换为Base64
        const frameData = task.canvas.toDataURL('image/jpeg', 0.7);
        
        // 发送到服务器进行检测
        if (this.socket) {
            this.socket.emit('detect_frame', {
                frame: frameData,
                deviceId: deviceId,
                timestamp: now,
                confidence: this.confidence,
                classes: Object.keys(this.classes).filter(id => this.classes[id].enabled)
            });
        }
    }
    
    // 生成对象ID - 不再使用位置作为ID的一部分
    generateObjectId(detection, deviceId) {
        // 仅使用设备ID、类别和时间戳创建临时ID
        // 对于移动对象，我们将通过相似度匹配而不是固定ID来跟踪
        const { class: classId } = detection;
        const timestamp = Date.now();
        return `${deviceId}_${classId}_${timestamp}`;
    }
    
    // 检查两个对象是否相似（可能是同一个对象）- 增强版
    areObjectsSimilar(obj1, obj2) {
        // 1. 必须是相同类别的对象
        if (obj1.classId !== obj2.classId) return false;
        
        // 2. 检查时间差 - 如果时间差太大，可能不是同一个对象
        const timeDiff = Math.abs(obj1.timestamp - obj2.timestamp);
        if (timeDiff > 5000) return false; // 5秒以上的时间差视为不同对象
        
        // 3. 计算中心点
        const center1 = obj1.center;
        const center2 = obj2.center;
        
        // 4. 计算两个检测框的大小
        const size1 = Math.sqrt(Math.pow(obj1.box[2] - obj1.box[0], 2) + Math.pow(obj1.box[3] - obj1.box[1], 2));
        const size2 = Math.sqrt(Math.pow(obj2.box[2] - obj2.box[0], 2) + Math.pow(obj2.box[3] - obj2.box[1], 2));
        
        // 5. 根据对象大小和时间差动态调整距离阈值
        // 对象越大，允许的移动距离越大；时间差越大，允许的移动距离也越大
        const sizeAvg = (size1 + size2) / 2;
        const timeRatio = Math.min(timeDiff / 1000, 1); // 最多1秒
        
        // 基本阈值 + 尺寸调整 + 时间调整
        const dynamicThreshold = 50 + sizeAvg * 0.5 + timeRatio * 100;
        
        // 6. 计算欧几里得距离
        const distanceSquared = Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2);
        
        // 7. 计算两个边界框的IoU (Intersection over Union)
        const iou = this.calculateIoU(obj1.box, obj2.box);
        
        // 8. 综合判断：距离和IoU
        // 如果IoU足够高，直接认为是同一个对象
        if (iou > 0.3) return true;
        
        // 否则根据距离判断
        return distanceSquared <= Math.pow(dynamicThreshold, 2);
    }
    
    // 计算两个边界框的IoU (Intersection over Union)
    calculateIoU(box1, box2) {
        // 计算交集区域
        const [x1_1, y1_1, x2_1, y2_1] = box1;
        const [x1_2, y1_2, x2_2, y2_2] = box2;
        
        const xA = Math.max(x1_1, x1_2);
        const yA = Math.max(y1_1, y1_2);
        const xB = Math.min(x2_1, x2_2);
        const yB = Math.min(y2_1, y2_2);
        
        // 计算交集面积
        const intersectionArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        
        // 计算两个边界框的面积
        const box1Area = (x2_1 - x1_1) * (y2_1 - y1_1);
        const box2Area = (x2_2 - x1_2) * (y2_2 - y1_2);
        
        // 计算并集面积
        const unionArea = box1Area + box2Area - intersectionArea;
        
        // 计算IoU
        return unionArea > 0 ? intersectionArea / unionArea : 0;
    }
    
    // 寻找最匹配的已跟踪对象
    findBestMatch(detection, deviceId, timestamp) {
        const { class: classId, box } = detection;
        const [x1, y1, x2, y2] = box;
        const centerX = Math.round((x1 + x2) / 2);
        const centerY = Math.round((y1 + y2) / 2);
        
        // 创建当前检测的对象表示
        const currentObject = {
            deviceId,
            classId,
            center: { x: centerX, y: centerY },
            box,
            timestamp
        };
        
        // 遍历所有已跟踪的对象，寻找最佳匹配
        let bestMatchId = null;
        let bestMatchScore = -1;
        
        for (const objectId in this.trackedObjects) {
            const trackedObj = this.trackedObjects[objectId];
            
            // 只考虑同一设备同一类别的对象
            if (trackedObj.deviceId !== deviceId || trackedObj.classId !== classId) continue;
            
            // 如果已经保存到数据库，不再尝试匹配
            if (trackedObj.savedToDb) continue;
            
            // 检查是否相似
            if (this.areObjectsSimilar(trackedObj, currentObject)) {
                // 计算匹配分数 - 基于IoU和时间接近度
                const iou = this.calculateIoU(trackedObj.box, currentObject.box);
                const timeDiff = Math.abs(trackedObj.lastSeenTime - timestamp);
                const timeScore = Math.exp(-timeDiff / 2000); // 时间差越小，分数越高
                
                const matchScore = iou * 0.7 + timeScore * 0.3; // IoU权重70%，时间权重30%
                
                if (matchScore > bestMatchScore) {
                    bestMatchScore = matchScore;
                    bestMatchId = objectId;
                }
            }
        }
        
        return bestMatchId;
    }
    
    // 检查对象是否持久存在
    isObjectPersistent(objectId) {
        const obj = this.trackedObjects[objectId];
        if (!obj) return false;
        
        const now = Date.now();
        const firstDetectionTime = obj.firstSeenTime;
        const lastDetectionTime = obj.lastSeenTime;
        
        // 计算总跟踪时长
        const totalDuration = lastDetectionTime - firstDetectionTime;
        
        // 检查整体持续时间是否达到阈值
        if (totalDuration >= this.persistenceThreshold) {
            // 还需要检查中间是否有长时间没有检测到的情况
            // 如果最近一次检测距现在太久，说明对象可能已经离开
            const recentDetectionGap = now - lastDetectionTime;
            if (recentDetectionGap > 5000) { // 5秒内需要有新的检测
                return false;
            }
            
            // 对于总跟踪时长特别长的对象，可以确定为持久对象
            return true;
        }
        
        return false;
    }
    
    // 处理检测结果
    handleDetectionResult(data) {
        if (!data || !data.detections) return;
        
        console.log('收到检测结果:', data);
        
        // 若没有检测到对象，则不处理
        if (data.detections.length === 0) return;
        
        const deviceId = data.deviceId;
        const timestamp = data.timestamp || Date.now();
        const deviceName = this.processingVideos[deviceId]?.deviceInfo.name || '未知设备';
        
        // 处理每个检测到的对象
        data.detections.forEach(detection => {
            // 提取检测信息
            const { class: classId, class_name: className, confidence, box } = detection;
            const [x1, y1, x2, y2] = box;
            
            // 计算中心点
            const centerX = Math.round((x1 + x2) / 2);
            const centerY = Math.round((y1 + y2) / 2);
            
            // 创建当前对象的表示
            const currentObject = {
                deviceId,
                classId,
                center: { x: centerX, y: centerY },
                box,
                timestamp
            };
            
            // 查找最佳匹配的已跟踪对象
            const bestMatchId = this.findBestMatch(detection, deviceId, timestamp);
            
            if (bestMatchId) {
                // 更新已跟踪的对象
                const trackedObj = this.trackedObjects[bestMatchId];
                trackedObj.lastSeenTime = timestamp;
                trackedObj.box = box;
                trackedObj.confidence = confidence;
                trackedObj.center = { x: centerX, y: centerY };
                
                // 如果长时间跟踪同一对象，记录跟踪时长
                const trackingDuration = timestamp - trackedObj.firstSeenTime;
                console.log(`持续跟踪对象 ${bestMatchId} 达 ${Math.round(trackingDuration/1000)} 秒`);
                
                // 检查对象是否持久存在且尚未保存到数据库
                if (this.isObjectPersistent(bestMatchId) && !trackedObj.savedToDb) {
                    // 标记为已保存到数据库
                    trackedObj.savedToDb = true;
                    
                    // 发送到服务器保存到数据库
                    if (this.socket) {
                        console.log(`对象 ${bestMatchId} 持续检测到 ${Math.round((timestamp - trackedObj.firstSeenTime) / 1000)} 秒，保存到数据库`);
                        
                        // 创建数据库记录对象
                        const dbRecord = {
                            deviceId,
                            deviceName,
                            objectId: bestMatchId,
                            classId,
                            className,
                            confidence,
                            box,
                            firstSeenTime: trackedObj.firstSeenTime,
                            lastSeenTime: timestamp,
                            imageData: data.annotatedFrame || data.frame
                        };
                        
                        // 发送到服务器保存
                        this.socket.emit('save_to_db', dbRecord);
                    }
                }
            } else {
                // 生成新的对象ID
                const objectId = this.generateObjectId(detection, deviceId);
                
                // 创建新的跟踪对象
                this.trackedObjects[objectId] = {
                    objectId,
                    deviceId,
                    classId,
                    className,
                    confidence,
                    center: { x: centerX, y: centerY },
                    box,
                    firstSeenTime: timestamp,
                    lastSeenTime: timestamp,
                    savedToDb: false
                };
                
                // 发送一级预警 - 当首次检测到对象时 (新增代码)
                if (this.alertEnabled && !this.alertedObjectIds.has(objectId) && this.socket) {
                    // 标记为已发送预警
                    this.alertedObjectIds.add(objectId);
                    
                    console.log(`发送一级预警: ${className} (ID: ${objectId})`);
                    
                    // 获取正确的设备信息
                    const edgeDeviceId = deviceId; // 边缘设备ID，用于接收预警的设备
                    const edgeDeviceName = this.processingVideos[deviceId]?.deviceInfo.name || '未知设备';
                    
                    console.log(`目标边缘设备: ${edgeDeviceId}, 名称: ${edgeDeviceName}`);
                    
                    // 创建预警数据
                    const alertData = {
                        deviceId: edgeDeviceId, // 这是接收预警的边缘设备ID
                        deviceName: edgeDeviceName,
                        objectId,
                        classId,
                        className,
                        confidence,
                        box,
                        timestamp,
                        alertLevel: 1, // 一级预警
                        message: `检测到${className}，请注意`
                    };
                    
                    // 发送一级预警事件
                    this.socket.emit('first_level_alert', alertData);
                    console.log(`已向服务器发送一级预警事件，目标设备: ${edgeDeviceId}`);
                }
                
                // 检查是否已经记录在检测记录中
                if (!this.recordedObjectIds.has(objectId)) {
                    // 标记为已记录
                    this.recordedObjectIds.add(objectId);
                    
                    // 创建检测记录
                    const record = {
                        id: objectId,
                        timestamp,
                        deviceId,
                        deviceName,
                        detections: [detection],
                        imageData: data.annotatedFrame || data.frame
                    };
                    
                    // 添加到检测记录，并保持最大记录数量
                    this.detectionRecords.unshift(record);
                    if (this.detectionRecords.length > this.maxDetectionRecords) {
                        this.detectionRecords.pop();
                    }
                    
                    // 触发检测事件，通知UI更新
                    const event = new CustomEvent('detection', { detail: record });
                    document.dispatchEvent(event);
                }
            }
        });
    }
    
    // 获取检测记录
    getDetectionRecords() {
        return this.detectionRecords;
    }
    
    // 获取对象持久性状态
    getObjectPersistenceStatus() {
        const result = [];
        const now = Date.now();
        
        for (const objectId in this.trackedObjects) {
            const obj = this.trackedObjects[objectId];
            const duration = obj.lastSeenTime - obj.firstSeenTime;
            const isPersistent = this.isObjectPersistent(objectId);
            const lastSeenAgo = now - obj.lastSeenTime;
            
            result.push({
                objectId,
                deviceId: obj.deviceId,
                classId: obj.classId,
                className: obj.className,
                durationMs: duration,
                durationSec: Math.round(duration / 1000),
                lastSeenMs: lastSeenAgo,
                lastSeenSec: Math.round(lastSeenAgo / 1000),
                isPersistent,
                savedToDb: obj.savedToDb,
                center: obj.center,
                box: obj.box
            });
        }
        
        return result;
    }
    
    // 打印对象跟踪状态信息 - 用于调试
    logTrackingStatus() {
        const status = this.getObjectPersistenceStatus();
        console.log("=== 对象跟踪状态 ===");
        console.log(`当前跟踪对象数: ${status.length}`);
        
        status.forEach(obj => {
            console.log(
                `${obj.className} (ID: ${obj.objectId.substring(0, 8)}...): ` +
                `持续时间: ${obj.durationSec}秒, ` +
                `${obj.lastSeenSec}秒前最后检测, ` +
                `位置: (${Math.round(obj.center.x)},${Math.round(obj.center.y)}), ` +
                `${obj.isPersistent ? '🟢持久' : '⚪临时'}, ` +
                `${obj.savedToDb ? '💾已保存' : '📝未保存'}`
            );
        });
        console.log("==================");
    }
    
    // 清空检测记录
    clearDetectionRecords() {
        this.detectionRecords = [];
        return this;
    }
    
    // 清理预警记录
    clearAlertedObjects() {
        this.alertedObjectIds.clear();
        return this;
    }
}

// 创建全局检测实例
const detector = new ObjectDetector(); 