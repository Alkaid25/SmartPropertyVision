/**
 * 语音提醒模块 - 用于在检测到目标时进行语音播报
 */
class AudioAlert {
    constructor(options = {}) {
        // 默认配置
        this.enabled = options.enabled ?? true; // 是否启用语音提醒
        this.volume = options.volume ?? 1.0; // 音量 (0.0 - 1.0)
        this.rate = options.rate ?? 1.0; // 语速 (0.1 - 10.0, 默认为1.0)
        this.pitch = options.pitch ?? 1.0; // 音调 (0.0 - 2.0, 默认为1.0)
        this.lang = options.lang ?? 'zh-CN'; // 语言
        
        // 警告消息模板
        this.alertMessages = {
            0: "警告，请将电动车移至指定区域停放。",
            1: "警告，请将自行车移至指定区域停放。",
            2: "警告，发现吸烟行为，请立即停止。",
            3: "警告，发现火情，请立即处理。"
        };
        
        // 消息队列和锁，避免多个语音重叠
        this.messageQueue = [];
        this.isSpeaking = false;
        
        // 绑定方法
        this.speak = this.speak.bind(this);
        this.processQueue = this.processQueue.bind(this);
        
        // 已播报的对象ID集合，避免重复播报
        this.alertedObjectIds = new Set();
        
        // 检查浏览器是否支持语音合成
        this.isSupportSpeech = 'speechSynthesis' in window;
        if (!this.isSupportSpeech) {
            console.warn("当前浏览器不支持语音合成API");
        }
    }
    
    // 初始化
    init() {
        if (!this.isSupportSpeech) return this;
        
        console.log("初始化语音提醒模块...");
        
        // 清空已播报记录，每次初始化重置
        this.alertedObjectIds.clear();
        
        // 添加检测事件监听
        document.addEventListener('detection', this.handleDetection.bind(this));
        
        return this;
    }
    
    // 处理检测事件
    handleDetection(event) {
        if (!this.enabled || !this.isSupportSpeech) return;
        
        const detection = event.detail;
        if (!detection || !detection.detections || detection.detections.length === 0) return;
        
        // 如果该对象已经播报过警告，则跳过
        if (this.alertedObjectIds.has(detection.id)) return;
        
        // 标记为已播报
        this.alertedObjectIds.add(detection.id);
        
        // 获取检测的第一个对象
        const firstDetection = detection.detections[0];
        const classId = firstDetection.class;
        const className = firstDetection.class_name;
        
        // 获取警告消息
        let message = this.alertMessages[classId] || `警告，检测到${className}。`;
        
        // 添加到消息队列
        this.addToQueue({
            message,
            deviceId: detection.deviceId,
            objectId: detection.id,
            classId,
            className
        });
    }
    
    // 添加消息到队列
    addToQueue(alert) {
        this.messageQueue.push(alert);
        if (!this.isSpeaking) {
            this.processQueue();
        }
    }
    
    // 处理消息队列
    processQueue() {
        if (this.messageQueue.length === 0) {
            this.isSpeaking = false;
            return;
        }
        
        this.isSpeaking = true;
        const alert = this.messageQueue.shift();
        this.speak(alert.message, () => {
            // 播放完成后处理下一条
            setTimeout(() => {
                this.processQueue();
            }, 500); // 添加短暂间隔
        });
    }
    
    // 语音合成播放
    speak(text, onEndCallback) {
        if (!this.isSupportSpeech) return;
        
        console.log(`语音播报: ${text}`);
        
        // 创建SpeechSynthesisUtterance实例
        const utterance = new SpeechSynthesisUtterance(text);
        
        // 设置语音参数
        utterance.volume = this.volume;
        utterance.rate = this.rate;
        utterance.pitch = this.pitch;
        utterance.lang = this.lang;
        
        // 设置回调
        utterance.onend = () => {
            if (onEndCallback) onEndCallback();
        };
        
        utterance.onerror = (event) => {
            console.error("语音合成错误:", event.error);
            if (onEndCallback) onEndCallback();
        };
        
        // 开始播放
        window.speechSynthesis.speak(utterance);
    }
    
    // 清理播报记录
    clearAlertedObjects() {
        this.alertedObjectIds.clear();
    }
    
    // 设置配置
    setConfig(config) {
        if ('enabled' in config) this.enabled = config.enabled;
        if ('volume' in config) this.volume = config.volume;
        if ('rate' in config) this.rate = config.rate;
        if ('pitch' in config) this.pitch = config.pitch;
        if ('lang' in config) this.lang = config.lang;
        
        return this;
    }
}

// 导出模块
window.AudioAlert = AudioAlert; 