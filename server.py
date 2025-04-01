from flask import Flask, send_from_directory, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import json
import eventlet
import ssl
import socket
import base64
import time
import numpy as np
import cv2
from io import BytesIO
from PIL import Image
import threading
import sqlite3
import datetime
from ultralytics import YOLO

# 使用eventlet作为异步后端
eventlet.monkey_patch()  # 使用默认monkey patching，不带dns参数

app = Flask(__name__)
app.config["SECRET_KEY"] = "secret!"
# 允许所有源，禁用CORS检查，使用WebSocket作为首选传输方式
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")
port = 5000

# 存储设备信息的字典
devices = {}

# 模型路径
model_path = "model/best.pt"
model = None
model_lock = threading.Lock()  # 多线程访问模型的锁
detection_enabled = True  # 全局检测开关

# 模型类别
class_names = ["电动车", "自行车", "烟", "火"]

# 数据库路径
DB_PATH = "detection_records.db"
db_lock = threading.Lock()  # 数据库访问锁


# 初始化数据库
def init_database():
    """初始化SQLite数据库，创建必要的表"""
    with db_lock:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 创建检测记录表
        cursor.execute(
            """
        CREATE TABLE IF NOT EXISTS persistent_detections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            object_id TEXT NOT NULL,
            device_id TEXT NOT NULL,
            device_name TEXT,
            class_id INTEGER NOT NULL,
            class_name TEXT,
            confidence REAL,
            box_x1 REAL,
            box_y1 REAL,
            box_x2 REAL,
            box_y2 REAL,
            first_seen_time INTEGER NOT NULL,
            last_seen_time INTEGER NOT NULL,
            save_time INTEGER NOT NULL,
            image_data TEXT,
            UNIQUE(object_id)
        )
        """
        )

        # 创建索引
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_object_id ON persistent_detections(object_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_device_id ON persistent_detections(device_id)"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_class_id ON persistent_detections(class_id)"
        )

        conn.commit()
        conn.close()

        print("数据库初始化完成")


# 保存检测记录到数据库
def save_detection_to_db(data):
    """将持久性检测记录保存到SQLite数据库"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()

            # 检查记录是否已存在
            cursor.execute(
                "SELECT id FROM persistent_detections WHERE object_id = ?",
                (data.get("objectId"),),
            )
            existing = cursor.fetchone()

            if existing:
                # 更新现有记录
                cursor.execute(
                    """
                UPDATE persistent_detections 
                SET 
                    last_seen_time = ?,
                    confidence = ?,
                    box_x1 = ?,
                    box_y1 = ?,
                    box_x2 = ?,
                    box_y2 = ?,
                    save_time = ?
                WHERE object_id = ?
                """,
                    (
                        data.get("lastSeenTime"),
                        data.get("confidence"),
                        data.get("box")[0],
                        data.get("box")[1],
                        data.get("box")[2],
                        data.get("box")[3],
                        int(time.time() * 1000),
                        data.get("objectId"),
                    ),
                )
            else:
                # 插入新记录
                cursor.execute(
                    """
                INSERT INTO persistent_detections (
                    object_id,
                    device_id,
                    device_name,
                    class_id,
                    class_name,
                    confidence,
                    box_x1,
                    box_y1,
                    box_x2,
                    box_y2,
                    first_seen_time,
                    last_seen_time,
                    save_time,
                    image_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        data.get("objectId"),
                        data.get("deviceId"),
                        data.get("deviceName"),
                        data.get("classId"),
                        data.get("className"),
                        data.get("confidence"),
                        data.get("box")[0],
                        data.get("box")[1],
                        data.get("box")[2],
                        data.get("box")[3],
                        data.get("firstSeenTime"),
                        data.get("lastSeenTime"),
                        int(time.time() * 1000),
                        data.get("imageData"),
                    ),
                )

            conn.commit()
            conn.close()

            # 转化时间为可读格式
            first_seen = datetime.datetime.fromtimestamp(
                data.get("firstSeenTime") / 1000
            ).strftime("%Y-%m-%d %H:%M:%S")
            last_seen = datetime.datetime.fromtimestamp(
                data.get("lastSeenTime") / 1000
            ).strftime("%Y-%m-%d %H:%M:%S")

            print(
                f"保存到数据库成功: {data.get('className')} (设备: {data.get('deviceName')}), "
                f"首次检测: {first_seen}, 持续时间: {(data.get('lastSeenTime') - data.get('firstSeenTime'))/1000:.1f}秒"
            )

            return True, f"保存{data.get('className')}记录成功"
    except Exception as e:
        print(f"保存到数据库失败: {e}")
        return False, f"保存失败: {str(e)}"


# 获取数据库中的记录
def get_db_records(limit=100, class_id=None, device_id=None):
    """查询数据库中的检测记录"""
    try:
        with db_lock:
            conn = sqlite3.connect(DB_PATH)
            # 确保返回的字段可以被JSON序列化
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 先获取总记录数，看数据库中实际有多少条记录
            cursor.execute("SELECT COUNT(*) FROM persistent_detections")
            total_count = cursor.fetchone()[0]
            print(f"数据库中实际记录总数: {total_count}")

            # 简化查询，不加条件，确保能返回数据
            query = "SELECT * FROM persistent_detections ORDER BY id DESC LIMIT ?"
            params = [limit]

            cursor.execute(query, params)
            rows = cursor.fetchall()

            # 获取列名
            columns = [desc[0] for desc in cursor.description]

            # 将结果转换为字典列表，并确保数据格式的一致性
            records = []
            for row in rows:
                # 使用dict构建记录，确保所有值都是JSON序列化兼容的
                record = dict(zip(columns, [x for x in row]))

                # 确保时间戳是整数
                for time_field in ["first_seen_time", "last_seen_time", "save_time"]:
                    if time_field in record and record[time_field] is not None:
                        record[time_field] = int(record[time_field])

                # 确保置信度是浮点数
                if "confidence" in record and record["confidence"] is not None:
                    record["confidence"] = float(record["confidence"])

                # 为box坐标创建数组格式
                if all(k in record for k in ["box_x1", "box_y1", "box_x2", "box_y2"]):
                    record["box"] = [
                        float(record["box_x1"]),
                        float(record["box_y1"]),
                        float(record["box_x2"]),
                        float(record["box_y2"]),
                    ]

                records.append(record)

            print(f"查询到 {len(records)} 条记录")
            if records:
                # 打印第一条记录的关键字段，用于调试
                sample = records[0]
                print(
                    f"样本记录: ID={sample.get('id')}, 类别={sample.get('class_name')}, 时间戳={sample.get('first_seen_time')}"
                )

            conn.close()
            return records
    except Exception as e:
        print(f"查询数据库失败: {e}")
        import traceback

        traceback.print_exc()
        return []


# 初始化模型
def load_model():
    global model
    try:
        print("加载YOLO模型...")
        model = YOLO(model_path)
        print("模型加载成功")
    except Exception as e:
        print(f"加载模型出错: {e}")
        try:
            # 尝试使用默认模型
            print("尝试加载默认YOLOv8n模型...")
            model = YOLO("yolov8n.pt")
            print("默认模型加载成功")
        except Exception as e:
            print(f"加载默认模型也失败: {e}")
            model = None


# 解码Base64图像
def decode_base64_image(base64_string):
    if "base64," in base64_string:
        # 移除 data URL 部分 (e.g., "data:image/jpeg;base64,")
        base64_string = base64_string.split("base64,")[1]

    image_data = base64.b64decode(base64_string)
    image = Image.open(BytesIO(image_data))

    # 转换为OpenCV格式
    open_cv_image = np.array(image)
    # RGB转BGR (如果是彩色图像)
    if len(open_cv_image.shape) == 3:
        open_cv_image = open_cv_image[:, :, ::-1].copy()

    return open_cv_image


# 检测图像中的目标
def detect_objects(image, confidence=0.35, classes=None):
    global model, model_lock

    if model is None:
        return []

    try:
        with model_lock:
            # 设置置信度阈值和需要检测的类别
            results = model(image, conf=confidence, verbose=False)

            # 筛选结果
            detections = []
            for result in results:
                if hasattr(result, "boxes") and len(result.boxes) > 0:
                    boxes = result.boxes

                    for box in boxes:
                        # 获取类别
                        cls = int(box.cls.item())
                        # 如果指定了类别且当前类别不在其中，则跳过
                        if classes is not None and str(cls) not in classes:
                            continue

                        # 获取置信度
                        conf = float(box.conf.item())
                        # 获取边界框
                        x1, y1, x2, y2 = map(float, box.xyxy[0].tolist())

                        # 创建检测结果
                        detections.append(
                            {
                                "class": cls,
                                "class_name": (
                                    class_names[cls]
                                    if cls < len(class_names)
                                    else f"未知类别_{cls}"
                                ),
                                "confidence": conf,
                                "box": [x1, y1, x2, y2],
                            }
                        )

            # 获取带标注的图像
            annotated_frame = results[0].plot()
            _, buffer = cv2.imencode(".jpg", annotated_frame)
            annotated_image_base64 = "data:image/jpeg;base64," + base64.b64encode(
                buffer
            ).decode("utf-8")

            return detections, annotated_image_base64
    except Exception as e:
        print(f"检测过程出错: {e}")
        return [], None


# 配置静态文件目录
@app.route("/")
def index():
    return send_from_directory("public", "index.html")


@app.route("/edge.html")
def edge_device():
    return send_from_directory("public", "edge.html")


@app.route("/operation.html")
def operation_page():
    return send_from_directory("public", "operation.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory("public", path)


# WebSocket事件处理
@socketio.on("connect")
def handle_connect():
    print("客户端连接：", request.sid)


@socketio.on("disconnect")
def handle_disconnect():
    print("客户端断开连接：", request.sid)
    # 从设备列表中移除断开连接的设备
    for device_id, info in list(devices.items()):
        if info.get("sid") == request.sid:
            del devices[device_id]
            print(f"设备 {device_id} 已移除")
            # 通知其他设备此设备已断开
            emit("device_disconnected", {"deviceId": device_id}, broadcast=True)
            break


@socketio.on("register")
def handle_register(data):
    """处理旧版注册请求"""
    device_id = data.get("deviceId")
    device_type = data.get("deviceType")  # 'main' or 'edge'
    device_name = data.get("deviceName", "未命名设备")  # 修复不完整的字段名
    device_location = data.get("deviceLocation", "")  # 可选

    print(f"收到旧版注册请求: ID={device_id}, 类型={device_type}")

    if device_id and device_type:
        # 使用完整的旧式注册流程
        devices[device_id] = {
            "sid": request.sid,
            "type": device_type,
            "name": device_name,
            "location": device_location,
            "socketId": request.sid,
        }
        join_room(device_id)  # 加入以设备ID命名的房间
        print(f"{device_type}设备注册: {device_id}")

        # 如果是边缘设备注册，广播到所有主设备
        if device_type == "edge":
            for d_id, d_info in devices.items():
                if d_info.get("type") == "main":
                    emit(
                        "edge_device_online",
                        {
                            "deviceId": device_id,
                            "deviceName": device_name,
                            "deviceLocation": device_location,
                        },
                        room=d_id,
                    )

            # 也广播到所有客户端
            emit(
                "edge_device_online",
                {
                    "deviceId": device_id,
                    "deviceName": device_name,
                    "deviceLocation": device_location,
                },
                broadcast=True,
            )

        emit("register_response", {"success": True, "message": "设备注册成功"})

        # 更新在线设备列表
        update_online_devices()
    else:
        emit("register_response", {"success": False, "message": "无效的设备信息"})


@socketio.on("detection_config")
def handle_detection_config(data):
    """处理客户端发来的检测配置"""
    global detection_enabled

    print("收到检测配置:", data)

    # 更新全局检测开关
    if "enabled" in data:
        detection_enabled = data["enabled"]

    # 返回确认
    emit("detection_config_response", {"success": True, "message": "检测配置已更新"})


@socketio.on("detect_frame")
def handle_detect_frame(data):
    """处理客户端发来的帧进行对象检测"""
    global detection_enabled

    if not detection_enabled:
        return

    frame_data = data.get("frame")
    device_id = data.get("deviceId")
    timestamp = data.get("timestamp", int(time.time() * 1000))
    confidence = data.get("confidence", 0.35)
    classes = data.get("classes", None)

    if not frame_data or not device_id:
        emit(
            "detection_result",
            {
                "success": False,
                "message": "缺少必要参数",
                "deviceId": device_id,
                "timestamp": timestamp,
                "detections": [],
            },
        )
        return

    try:
        # 解码图像
        image = decode_base64_image(frame_data)

        # 执行检测
        detections, annotated_frame = detect_objects(image, confidence, classes)

        # 返回检测结果
        emit(
            "detection_result",
            {
                "success": True,
                "deviceId": device_id,
                "timestamp": timestamp,
                "detections": detections,
                "annotatedFrame": annotated_frame,
            },
        )

        # 检查是否有检测结果，但不在这里直接发送一级预警
        # 这个检测是在监控端进行的，监控端会通过 first_level_alert 事件请求发送警告
    except Exception as e:
        print(f"检测过程出错: {e}")
        emit(
            "detection_result",
            {
                "success": False,
                "message": f"检测出错: {str(e)}",
                "deviceId": device_id,
                "timestamp": timestamp,
                "detections": [],
            },
        )


@socketio.on("save_to_db")
def handle_save_to_db(data):
    """处理客户端发来的持久性检测对象，保存到数据库"""
    if not data or not data.get("objectId"):
        emit(
            "db_save_result",
            {
                "success": False,
                "message": "无效的数据格式",
                "objectId": data.get("objectId", "unknown"),
            },
        )
        return

    try:
        # 保存到数据库
        success, message = save_detection_to_db(data)

        # 返回结果
        emit(
            "db_save_result",
            {
                "success": success,
                "message": message,
                "objectId": data.get("objectId"),
                "className": data.get("className"),
                "deviceName": data.get("deviceName"),
                "saveTime": int(time.time() * 1000),
            },
        )
    except Exception as e:
        print(f"保存到数据库过程中出错: {e}")
        emit(
            "db_save_result",
            {
                "success": False,
                "message": f"保存过程出错: {str(e)}",
                "objectId": data.get("objectId", "unknown"),
            },
        )


@socketio.on("get_db_records")
def handle_get_db_records(data):
    """处理客户端获取数据库记录的请求"""
    try:
        print(f"收到获取数据库记录请求: {data}")
        limit = int(data.get("limit", 100))
        class_id = data.get("class_id")
        device_id = data.get("device_id")

        # 获取数据库记录
        records = get_db_records(limit, class_id, device_id)

        # 处理图像数据
        for record in records:
            if "image_data" in record:
                try:
                    # 检查image_data是否为None或空字符串
                    if not record["image_data"]:
                        record["image_data"] = None
                        continue

                    # 确保是字符串
                    image_data = str(record["image_data"])

                    # 清理Base64字符串，移除可能的前缀
                    if image_data.startswith("data:image"):
                        # 如果已经是完整的data URL，保持不变
                        pass
                    elif "base64," in image_data:
                        # 提取base64部分
                        image_data = image_data.split("base64,")[1]

                    # 验证是否是有效的Base64
                    try:
                        # 尝试解码前几个字符以验证格式
                        import base64

                        base64.b64decode(
                            image_data[:20] + "=" * (4 - len(image_data[:20]) % 4)
                        )
                        # 如果成功，保存回记录
                        record["image_data"] = image_data
                    except:
                        print(f"记录 {record.get('id')} 的图像数据不是有效的Base64")
                        record["image_data"] = None
                except Exception as e:
                    print(f"处理图像数据错误: {e}")
                    record["image_data"] = None

        print(f"查询成功，返回 {len(records)} 条记录")
        if records:
            print(f"前三条记录ID: {[r.get('id') for r in records[:3]]}")

        # 发送记录给客户端
        emit("db_records", {"count": len(records), "records": records})
        print("数据库记录已发送到客户端")
    except Exception as e:
        print(f"获取数据库记录失败: {e}")
        import traceback

        traceback.print_exc()
        emit("db_records", {"count": 0, "records": [], "error": str(e)})


@socketio.on("get_edge_devices")
def handle_get_edge_devices():
    # 筛选出所有边缘设备
    edge_devices = []
    for device_id, info in devices.items():
        if info.get("type") == "edge":
            edge_devices.append(
                {
                    "deviceId": device_id,
                    "deviceName": info.get("name", ""),
                    "deviceLocation": info.get("location", ""),
                }
            )

    print(f"发送边缘设备列表，共 {len(edge_devices)} 个设备")
    emit("edge_devices_list", {"devices": edge_devices})


@socketio.on("offer")
def handle_offer(data):
    target_id = data.get("targetId")
    offer = data.get("offer")
    source_id = data.get("sourceId")

    if target_id and target_id in devices:
        print(f"转发offer从 {source_id} 到 {target_id}")
        print(f"Offer SDP类型: {offer['type']}")
        emit("offer", {"offer": offer, "sourceId": source_id}, room=target_id)
    else:
        print(f"目标设备不存在或未连接: {target_id}")
        emit("error", {"message": "目标设备不存在或未连接"})


@socketio.on("answer")
def handle_answer(data):
    target_id = data.get("targetId")
    answer = data.get("answer")
    source_id = data.get("sourceId")

    if target_id and target_id in devices:
        print(f"转发answer从 {source_id} 到 {target_id}")
        print(f"Answer SDP: {answer['type']}")
        emit("answer", {"answer": answer, "sourceId": source_id}, room=target_id)
    else:
        print(f"目标设备不存在或未连接: {target_id}")
        emit("error", {"message": "目标设备不存在或未连接"})


@socketio.on("ice_candidate")
def handle_ice_candidate(data):
    target_id = data.get("targetId")
    candidate = data.get("candidate")
    source_id = data.get("sourceId")

    if target_id and target_id in devices:
        print(f"转发ICE候选从 {source_id} 到 {target_id}")
        emit(
            "ice_candidate",
            {"candidate": candidate, "sourceId": source_id},
            room=target_id,
        )
    else:
        print(f"目标设备不存在或未连接: {target_id}")
        emit("error", {"message": "目标设备不存在或未连接"})


@socketio.on("connection_request")
def handle_connection_request(data):
    target_id = data.get("targetId")
    source_id = data.get("sourceId")

    if target_id and target_id in devices:
        print(f"转发连接请求从 {source_id} 到 {target_id}")
        emit(
            "connection_request",
            {"sourceId": source_id},
            room=target_id,
        )
    else:
        print(f"目标设备不存在或未连接: {target_id}")
        emit("error", {"message": "目标设备不存在或未连接"})


@socketio.on("register_device")
def handle_register_device(data):
    """处理客户端发来的设备注册请求"""
    device_id = data.get("deviceId")
    device_type = data.get("deviceType", "edge")  # 默认为edge类型
    device_name = data.get("deviceName", "未命名设备")
    device_location = data.get("deviceLocation", "未知位置")

    # 检查设备ID
    if not device_id:
        emit("register_response", {"success": False, "message": "缺少设备ID"})
        return

    print(
        f"设备注册请求: ID={device_id}, 类型={device_type}, 名称={device_name}, 位置={device_location}"
    )
    print(f"WebSocket SID: {request.sid}")

    # 将设备加入对应房间，用于定向发送消息
    device_room = f"device_{device_id}"
    join_room(device_room)
    # 同时也加入设备类型房间
    type_room = f"{device_type}_devices"
    join_room(type_room)
    print(f"设备 {device_id} 已加入房间: {device_room} 和 {type_room}")

    # 保存设备信息
    devices[device_id] = {
        "id": device_id,
        "type": device_type,  # 保存设备类型
        "name": device_name,
        "location": device_location,
        "socketId": request.sid,
        "room": device_room,
        "lastSeen": time.time(),
        "clientIp": request.remote_addr,
    }

    print(
        f"设备注册: {device_name} (ID: {device_id}, 类型: {device_type}, 位置: {device_location})"
    )
    print(f"当前所有设备: {list(devices.keys())}")

    # 返回确认信息
    emit(
        "register_response",
        {
            "success": True,
            "deviceId": device_id,
            "message": f"设备 {device_name} 注册成功",
        },
    )

    # 如果是边缘设备注册，广播到所有主设备
    if device_type == "edge":
        print(f"广播边缘设备上线消息")
        # 找出所有主设备
        for d_id, d_info in devices.items():
            if d_info.get("type") == "main":
                # 发送给所有主设备
                emit(
                    "edge_device_online",
                    {
                        "deviceId": device_id,
                        "deviceName": device_name,
                        "deviceLocation": device_location,
                    },
                    room=d_id,
                )

        # 也广播到所有客户端
        emit(
            "edge_device_online",
            {
                "deviceId": device_id,
                "deviceName": device_name,
                "deviceLocation": device_location,
            },
            broadcast=True,
        )

    # 更新在线设备列表
    update_online_devices()


@socketio.on("disconnect")
def handle_disconnect():
    """处理客户端断开连接"""
    # 查找对应的设备
    device_id = None
    socket_id = request.sid

    for d_id, device in devices.items():
        if device.get("socketId") == socket_id:
            device_id = d_id
            break

    if device_id:
        # 离开设备房间 (新增代码)
        device_room = f"device_{device_id}"
        leave_room(device_room)

        # 标记设备为离线
        if device_id in devices:
            print(f"设备离线: {devices[device_id].get('name')} (ID: {device_id})")
            # 不删除设备信息，只更新状态
            devices[device_id]["socketId"] = None
            devices[device_id]["offline"] = True
            devices[device_id]["offlineTime"] = time.time()

        # 更新在线设备列表
        update_online_devices()
    else:
        print(f"未知客户端断开: {socket_id}")


# 处理测试连接消息
@socketio.on("test_connection")
def handle_test_connection(data):
    """处理客户端发送的测试连接消息"""
    device_id = data.get("deviceId")
    message = data.get("message", "测试消息")

    print(f"收到测试连接消息: {message}, 设备ID: {device_id}, SID: {request.sid}")

    # 向客户端发送确认消息
    emit(
        "test_response",
        {
            "message": f"服务器收到测试消息，SID: {request.sid}",
            "timestamp": int(time.time() * 1000),
        },
    )

    # 尝试直接广播一个测试预警
    try:
        print(f"尝试向设备 {device_id} 广播测试预警")
        # 直接广播
        emit(
            "first_level_alert",
            {
                "deviceId": device_id,
                "classId": 0,
                "className": "测试对象",
                "confidence": 0.99,
                "box": [100, 100, 200, 200],
                "timestamp": int(time.time() * 1000),
                "alertLevel": 1,
                "message": "这是一条测试预警消息",
            },
        )

        # 特定房间广播
        device_room = f"device_{device_id}"
        print(f"尝试向房间 {device_room} 广播测试预警")
        emit(
            "first_level_alert",
            {
                "deviceId": device_id,
                "classId": 0,
                "className": "测试对象-房间",
                "confidence": 0.99,
                "box": [100, 100, 200, 200],
                "timestamp": int(time.time() * 1000),
                "alertLevel": 1,
                "message": "这是一条发送到房间的测试预警消息",
            },
            room=device_room,
        )

        # 使用SID广播
        print(f"尝试向SID {request.sid} 广播测试预警")
        emit(
            "first_level_alert",
            {
                "deviceId": device_id,
                "classId": 0,
                "className": "测试对象-SID",
                "confidence": 0.99,
                "box": [100, 100, 200, 200],
                "timestamp": int(time.time() * 1000),
                "alertLevel": 1,
                "message": "这是一条发送到SID的测试预警消息",
            },
            room=request.sid,
        )
    except Exception as e:
        print(f"广播测试预警时出错: {e}")


@socketio.on("first_level_alert")
def handle_first_level_alert(data):
    """处理客户端发送的一级预警，转发到对应的边缘设备"""
    device_id = data.get("deviceId")
    if not device_id:
        print("一级预警数据缺少deviceId")
        return

    print(f"收到一级预警请求: 设备 {device_id}, 类别 {data.get('className')}")

    # 获取设备信息
    device_info = devices.get(device_id)
    if not device_info:
        print(f"未找到设备信息: {device_id}")
        print(f"尝试使用设备ID作为房间名直接发送")
        # 尝试直接使用设备ID作为房间名
        emit("first_level_alert", data, room=device_id)
        # 尝试广播到所有客户端
        print("尝试广播到所有客户端，依赖客户端自行过滤")
        emit("first_level_alert", data, broadcast=True)
        return

    # 向对应的边缘设备发送一级预警
    # 这里使用边缘设备的房间名和直接ID都尝试
    device_room = f"device_{device_id}"
    socket_id = device_info.get("socketId")

    print(f"尝试向房间 {device_room} 发送一级预警")
    emit("first_level_alert", data, room=device_room)

    print(f"尝试直接使用设备ID {device_id} 作为房间发送一级预警")
    emit("first_level_alert", data, room=device_id)

    if socket_id:
        print(f"尝试直接向socketId {socket_id} 发送一级预警")
        emit("first_level_alert", data, room=socket_id)

    # 也尝试广播到所有客户端，依赖客户端自行过滤
    print("尝试广播到所有客户端，依赖客户端自行过滤")
    emit("first_level_alert", data, broadcast=True)

    # 打印设备列表和房间，用于调试
    print(f"当前设备列表: {list(devices.keys())}")
    print(f"目标设备信息: {device_info}")

    # 同时向监控页面广播预警信息，但仅显示通知，不播放声音
    emit(
        "alert_notification",
        {
            "deviceId": device_id,
            "deviceName": data.get("deviceName", "未知设备"),
            "alertLevel": 1,
            "className": data.get("className"),
            "timestamp": data.get("timestamp", int(time.time() * 1000)),
            "message": f"一级预警: 检测到{data.get('className')}",
        },
        broadcast=True,
    )

    # 记录预警信息
    print(f"向设备 {device_id} 发送一级预警: {data.get('className')}")


def update_online_devices():
    """更新并广播在线设备列表"""
    # 筛选出所有边缘设备
    edge_devices = []
    for device_id, info in devices.items():
        if info.get("type") == "edge" and not info.get("offline", False):
            edge_devices.append(
                {
                    "deviceId": device_id,
                    "deviceName": info.get("name", "未命名设备"),
                    "deviceLocation": info.get("location", "未知位置"),
                    "status": "online",
                    "lastSeen": info.get("lastSeen", time.time()),
                }
            )

    # 广播给所有客户端
    print(f"广播在线设备列表更新，共 {len(edge_devices)} 个边缘设备在线")
    emit("edge_devices_list", {"devices": edge_devices}, broadcast=True)


# 启动HTTPS服务器
if __name__ == "__main__":
    cert_path = "certs/certificate.crt"
    key_path = "certs/private.key"

    # 初始化数据库
    init_database()

    # 加载对象检测模型
    load_model()

    # 获取本机IP地址，不使用DNS解析
    try:
        # 尝试获取非回环地址
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))  # 连接到任意外部地址
        local_ip = s.getsockname()[0]
        s.close()
    except:
        # 如果失败，使用localhost
        local_ip = "127.0.0.1"

    print(f"HTTPS服务器运行在:")
    print(f" - 本机访问: https://localhost:{port}")
    print(f" - 局域网访问: https://{local_ip}:{port}")
    print(f" - 边缘设备访问: https://{local_ip}:{port}/edge.html")

    # 创建SSL上下文, 禁用证书验证
    context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    context.load_cert_chain(cert_path, key_path)

    # 使用eventlet的wsgi服务器
    server_sock = eventlet.listen(("0.0.0.0", port))
    server_sock = eventlet.wrap_ssl(
        server_sock,
        certfile=cert_path,
        keyfile=key_path,
        server_side=True,
        cert_reqs=ssl.CERT_NONE,  # 不要求客户端证书
        do_handshake_on_connect=False,  # 允许延迟握手
    )

    print("服务器已启动，等待连接...")
    try:
        eventlet.wsgi.server(server_sock, app)
    except (KeyboardInterrupt, SystemExit):
        print("服务器关闭...")
    except Exception as e:
        print(f"服务器错误: {e}")
    finally:
        server_sock.close()
