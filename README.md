# SmartPropertyVision

一个基于WebRTC、YOLOv8的智能视频监控与物体检测系统，用于实时检测和记录摄像头视频流中的特定物体。

## 项目概述

SmartPropertyVision 是一个完整的智能监控解决方案，它结合了以下功能：

- 实时视频流传输（基于WebRTC）
- 物体检测（基于YOLOv8）
- 检测记录持久化存储
- 警报通知系统
- 多设备管理
- 边缘端和操作端分离架构

系统可以检测多种目标物体，如电动车、自行车、烟、火等，并实时进行识别和记录。

## 项目结构说明

**注意**：该项目有两个版本：
1. **主版本**：完全功能的稳定版本（主要文件为server.py）
2. **重构版本**：正在开发中的模块化版本（Refactoring目录下的代码）

以下文档主要描述主版本的功能和架构，最后会特别说明重构版本的区别。

## 框架和技术栈

### 后端框架
- **Flask**: 核心Web服务器框架，处理HTTP请求和静态资源
- **Flask-SocketIO**: 提供WebSocket通信支持，实现实时通信
- **Eventlet**: 高性能异步I/O库，作为Flask的WSGI服务器和协程框架
- **SQLite**: 轻量级关系型数据库，用于存储检测记录和配置信息

### 前端技术
- **原生JavaScript**: 客户端逻辑实现，无依赖第三方框架
- **WebRTC**: 浏览器原生API，用于点对点实时视频流传输
- **Socket.IO 客户端**: 与服务器进行实时双向通信
- **HTML5/CSS3**: 构建响应式用户界面

### AI与计算机视觉
- **YOLOv8**: 最新版目标检测模型，支持多类别实时目标识别
- **Ultralytics API**: YOLOv8的Python实现，提供高级接口
- **OpenCV (cv2)**: 处理图像转换、显示和基础处理
- **PyTorch**: YOLOv8底层深度学习框架
- **TorchVision**: 提供图像处理工具和数据集

### 辅助库
- **NumPy**: 高效数值计算，处理图像数据
- **Pillow (PIL)**: 图像处理和格式转换
- **python-dotenv**: 管理环境变量和配置
- **pyOpenSSL**: 提供SSL/TLS支持
- **Threading**: 多线程支持，用于并行处理检测和通信

## 详细系统架构

### 后端服务架构
1. **核心服务器 (server.py)**
   - Flask应用初始化和配置
   - SocketIO服务器设置和事件注册
   - HTTP路由和静态资源处理
   - SSL/TLS安全连接配置
   - 服务启动和端口监听

2. **设备管理系统**
   - 边缘设备注册与连接验证
   - 设备状态实时监控和心跳检测
   - 设备元数据存储和更新
   - 设备分组和权限管理

3. **视频流处理**
   - WebRTC信令服务
   - 视频帧接收和解码
   - 帧缓冲队列管理
   - 图像预处理和格式转换

4. **物体检测引擎**
   - YOLOv8模型动态加载和初始化
   - 检测线程池管理
   - 实时帧分析和目标识别
   - 目标跟踪和持久性检测逻辑

5. **数据库管理**
   - 表结构初始化和迁移管理
   - 索引优化和查询性能调优
   - 检测记录CRUD操作
   - 线程安全的数据库访问

6. **通知中心**
   - 基于规则的告警触发机制
   - WebSocket实时推送
   - 可配置的通知策略
   - 扩展接口（短信、邮件等）

### 前端架构
1. **边缘设备界面 (edge.html)**
   - 摄像头访问和媒体流控制
   - WebRTC P2P连接管理
   - 视频质量和分辨率配置
   - 设备状态展示和控制

2. **控制中心界面 (operation.html)**
   - 设备管理控制台
   - 多路视频流并行显示
   - 检测控制面板
   - 实时告警显示
   - 历史记录查询与回放

3. **客户端库**
   - WebRTC连接管理 (script.js)
   - Socket.IO通信封装 (operation.js)
   - 检测结果可视化 (detection.js)
   - 交互界面控制 (interface-script.js)
   - 告警提示系统 (audio-alert.js)

## 源代码组织结构

```
SmartPropertyVision/
│
├── server.py                 # 主服务器入口点，包含大部分后端逻辑
├── VideoDetect.py            # 独立视频检测模块，可单独运行
├── check_db.py               # 数据库检查和维护工具
├── SMSexample.py             # 短信通知功能示例
├── generate_cert.py          # SSL证书生成工具
├── server.js                 # Node.js替代服务器（用于特定环境）
│
├── app/                      # 应用代码结构
│   └── models/               # 数据模型定义
│
├── model/                    # YOLOv8模型文件
│   └── best.pt               # 训练好的权重文件
│
├── public/                   # 前端静态资源
│   ├── css/                  # 样式文件
│   ├── images/               # 图片资源
│   ├── js/                   # JavaScript文件
│   │   ├── detection.js      # 检测逻辑（605行）
│   │   ├── script.js         # 主脚本（209行）
│   │   ├── operation.js      # 操作控制台脚本（222行）
│   │   ├── interface-script.js # 界面交互脚本（209行）
│   │   ├── audio-alert.js    # 音频告警脚本（157行）
│   │   └── new/              # 新版脚本目录
│   │
│   ├── edge.html             # 边缘设备页面（911行）
│   ├── operation.html        # 操作控制台页面（1799行）
│   ├── index.html            # 主页（1250行）
│   └── monitor.js            # 监控脚本（1134行）
│
├── templates/                # Flask模板目录
├── certs/                    # 证书存储目录
├── data/                     # 数据和配置文件
├── png/                      # 图像资源
│
├── cert.pem                  # SSL证书
├── key.pem                   # SSL私钥
├── detection_records.db      # SQLite数据库文件（2.3MB）
└── requirements.txt          # Python依赖列表（40行）
```

## 关键模块功能详解

### 1. 服务器核心 (server.py - 1046行)

服务器核心是系统的中枢，实现了以下关键功能：
- **应用初始化**：设置Flask和SocketIO，配置跨域和安全选项
- **设备管理**：使用`devices`字典存储和管理连接的设备信息
- **数据库初始化**：创建表结构、索引和初始数据
- **模型管理**：加载YOLOv8模型，处理模型初始化异常
- **事件处理**：注册和实现WebSocket事件处理函数
- **API路由**：提供HTTP接口用于查询和管理
- **并发控制**：使用线程锁（`threading.Lock`）保护共享资源

主要组件包括：
```python
# 核心初始化
app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# 全局状态管理
devices = {}  # 设备信息字典
model = None  # YOLOv8模型实例
model_lock = threading.Lock()  # 模型访问锁
db_lock = threading.Lock()  # 数据库访问锁
detection_enabled = True  # 全局检测开关
```

### 2. 视频检测引擎 (VideoDetect.py - 176行)

视频检测模块可独立运行，提供完整的检测功能：
- **模型加载**：支持多种加载方式，包括错误恢复
- **视频捕获**：支持摄像头和视频文件作为输入源
- **实时检测**：每帧应用YOLOv8模型进行目标识别
- **结果处理**：可视化检测结果并保存到磁盘
- **错误处理**：全面的异常处理确保稳定运行

核心实现：
```python
# 模型加载逻辑
try:
    model = YOLO(model_path)
except Exception as e:
    # 尝试转换模型或使用备选模型
    
# 检测循环
while True:
    success, frame = cap.read()
    results = model(frame, verbose=False)
    
    # 处理检测结果
    if detected:
        annotated_frame = results[0].plot()
        # 保存结果...
```

### 3. 数据持久化

系统使用SQLite数据库存储检测记录，主要功能：
- **记录存储**：将检测到的物体信息保存到数据库
- **记录更新**：跟踪已存在物体的状态变化
- **查询功能**：按类别、设备、时间等条件查询
- **图像存储**：支持将检测图像以Base64格式存储

数据库结构：
```sql
CREATE TABLE persistent_detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT,
    class_id INTEGER NOT NULL,
    class_name TEXT,
    confidence REAL,
    box_x1 REAL, box_y1 REAL, box_x2 REAL, box_y2 REAL,
    first_seen_time INTEGER NOT NULL,
    last_seen_time INTEGER NOT NULL,
    save_time INTEGER NOT NULL,
    image_data TEXT,
    UNIQUE(object_id)
)
```

## 重构版本详情 (Refactoring/)

项目的重构版本正在开发中，采用了更现代的架构：

### 架构差异

1. **模块化设计**：严格分离关注点，每个功能都有专门的模块
2. **服务层抽象**：将业务逻辑封装为服务类
3. **依赖注入**：降低组件间耦合
4. **配置管理**：集中式配置处理
5. **日志系统**：改进的日志记录和错误处理

### 当前限制

重构版本存在以下已知问题：

1. **模型加载冲突**：
   - Eventlet与subprocess之间存在兼容性问题
   - 在模型下载过程中可能导致卡死

2. **错误处理**：
   - 模型加载失败时缺少完善的回退机制 
   - 需要手动下载模型文件到正确位置

3. **完成度**：
   - 部分功能尚未迁移到新架构
   - API可能与原版不完全兼容

### 使用建议

- 主要开发和测试应使用稳定的主版本
- 仅在开发环境中测试重构版本
- 运行重构版本前手动下载YOLOv8模型

## 环境要求

- Python 3.7或更高版本
- CUDA (可选，用于GPU加速)
- 摄像头设备
- 现代浏览器（支持WebRTC）
- Windows 10或Linux（均已测试）

## 安装步骤

1. 克隆项目：
```bash
git clone <repository-url>
cd SmartPropertyVision
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 生成SSL证书（用于HTTPS连接）：
```bash
python generate_cert.py
```

4. 准备YOLOv8模型：
   - 将您的自定义YOLOv8模型（.pt文件）放置在`model/`目录下
   - 默认使用`model/best.pt`，如果文件不存在会自动下载官方YOLOv8模型
   - 如果自动下载失败，请手动下载：https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt

## 启动服务器

### 标准版本（推荐）
```bash
python server.py
```

### 重构版本（开发中）
```bash
# 如果使用重构版本，建议先手动下载YOLOv8模型
# curl -L https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt -o yolov8n.pt
python -m Refactoring.main --no-ssl
```

## 使用方法

1. 服务器启动后，可以通过以下URL访问系统：
   - 本机访问：https://localhost:5000
   - 局域网访问：https://[本机IP]:5000

2. 访问不同页面：
   - 边缘设备页面（设备摄像头）：https://[服务器IP]:5000/edge.html
   - 操作控制台：https://[服务器IP]:5000/operation.html

3. 边缘设备配置：
   - 访问边缘设备页面
   - 允许浏览器访问摄像头
   - 设置设备名称并注册

4. 操作控制台功能：
   - 查看所有连接的边缘设备
   - 实时监控视频流
   - 开启/关闭物体检测
   - 调整检测灵敏度
   - 查看和管理检测记录
   - 接收警报通知

## 系统功能说明

### 实时检测
系统可以检测以下物体类别：
- 电动车
- 自行车
- 烟
- 火

### 持久化记录
检测到的物体会被记录到本地SQLite数据库中，包含以下信息：
- 物体类别及置信度
- 检测时间（首次检测和最后检测时间）
- 设备信息
- 物体位置坐标
- 物体图像（Base64格式）

### 警报系统
当检测到特定物体时，系统会：
- 在界面上显示警报
- 记录到数据库
- 可扩展接入短信通知系统（参考SMSexample.py）

## 性能优化

系统通过多种方式优化性能：

1. **多线程处理**:
   - 使用线程锁保护共享资源（model_lock, db_lock）
   - 检测过程与WebSocket通信并行执行
   - 数据库操作异步处理

2. **模型优化**:
   - 支持GPU加速模型推理（要求安装CUDA）
   - 动态调整检测频率（帧率控制）
   - 模型转换和兼容性处理

3. **网络传输优化**:
   - 二进制WebSocket消息减少带宽使用
   - 自适应视频质量调整
   - 消息队列和批处理减少延迟

4. **数据库优化**:
   - 索引优化提高查询性能
   - 批量操作减少I/O开销
   - 定期清理过期数据

## 故障排除

### 1. 视频传输问题

#### 症状：
- 视频无法显示或卡顿
- WebRTC连接失败

#### 解决方案：
- 确保浏览器支持WebRTC（推荐Chrome或Edge最新版）
- 检查网络连接和防火墙设置
- 尝试降低视频分辨率（在edge.html页面设置）
- 确认STUN/TURN服务器可访问

### 2. 模型加载问题

#### 症状：
- 服务器启动时报错"模型加载失败"
- 检测功能不可用

#### 解决方案：
- 确保model目录存在且有写入权限
- 手动下载模型文件到model目录
  ```bash
  curl -L https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt -o model/best.pt
  ```
- 检查Python环境是否满足PyTorch要求
- 尝试使用CPU模式（修改server.py中的device参数）

### 3. 数据库错误

#### 症状：
- 检测记录无法保存
- 数据库查询失败

#### 解决方案：
- 检查数据库文件权限
- 使用check_db.py工具修复损坏的数据库
- 重建数据库（备份后删除detection_records.db）

### 4. 重构版本特定问题

#### 症状：
- 重构版本启动时卡在模型下载
- Eventlet与subprocess冲突错误

#### 解决方案：
- **必须**手动预先下载模型文件
- 使用标准版本（server.py）替代
- 在非Eventlet环境中测试重构代码

## 进阶配置

### 服务器配置
- 修改`server.py`中的以下参数：
  ```python
  port = 5000  # 修改服务端口
  # 调整SSL设置
  ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
  ssl_context.load_cert_chain(certfile='cert.pem', keyfile='key.pem')
  ```

### 检测设置
- 调整检测灵敏度和频率：
  ```python
  # server.py中的检测参数
  DETECTION_CONFIDENCE = 0.25  # 置信度阈值（0-1）
  DETECTION_INTERVAL = 500  # 检测间隔（毫秒）
  ```

### 数据管理
- 数据库清理和备份：
  ```python
  # 自动清理30天前的记录
  def cleanup_old_records():
    threshold = int(time.time() * 1000) - (30 * 24 * 60 * 60 * 1000)
    conn.execute("DELETE FROM persistent_detections WHERE last_seen_time < ?", (threshold,))
  ```

## 开发与扩展

### 添加新的检测类别
1. 准备新类别的训练数据和标注
2. 使用Ultralytics训练新模型
   ```bash
   yolo train data=path/to/data.yaml model=yolov8n.pt epochs=100
   ```
3. 更新`class_names`列表
   ```python
   # server.py
   class_names = ["电动车", "自行车", "烟", "火", "新类别"]
   ```
4. 更新前端显示和告警逻辑

### 添加新的通知渠道
1. 创建新的通知模块（例如Email通知）：
   ```python
   # email_notify.py
   def send_email_alert(detection_data):
       # 实现邮件发送逻辑
   ```
2. 在检测回调中集成：
   ```python
   # 在server.py中引入
   from email_notify import send_email_alert
   
   # 在检测回调中添加
   if detection_confirmed:
       send_email_alert(detection_data)
   ```

## 许可证

[请添加许可证信息]

## 联系方式

[请添加联系方式] 