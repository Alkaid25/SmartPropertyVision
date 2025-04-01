import os
import cv2
import time
import torch
import sys

# 尝试导入 ultralytics
try:
    from ultralytics import YOLO

    print("成功导入 ultralytics YOLO")
except ImportError as e:
    print(f"导入 ultralytics 失败: {e}")
    print("请确保已正确安装 ultralytics 包")
    sys.exit(1)


# --- 转换模型功能 ---
def convert_model(original_model_path, output_model_path=None):
    """
    尝试转换旧版本YOLO模型到新版本格式
    """
    try:
        if output_model_path is None:
            # 使用原文件名，添加_converted后缀
            base, ext = os.path.splitext(original_model_path)
            output_model_path = f"{base}_converted{ext}"

        # 尝试使用PyTorch直接加载模型权重
        print(f"尝试转换模型 {original_model_path} -> {output_model_path}")
        device = "cpu"
        ckpt = torch.load(original_model_path, map_location=device)

        # 保存转换后的模型
        if "model" in ckpt:
            torch.save(ckpt["model"].state_dict(), output_model_path)
            print(f"模型转换成功。保存到: {output_model_path}")
            return output_model_path
        else:
            torch.save(ckpt, output_model_path)
            print(f"模型格式未知，但已尝试简单转换。保存到: {output_model_path}")
            return output_model_path
    except Exception as e:
        print(f"转换模型失败: {e}")
        return None


# --- 1. 定义模型、输出文件夹和视频源 ---
model_path = (
    r"E:\Documents\Projects\ElecticYolo\src\Transmission-test\model\best.pt"  # 模型路径
)
output_save_dir = r"E:\Documents\Projects\ElecticYolo\src\Transmission-test\model\detected_frames_annotated"  # 输出目录
video_source = 0  # 或视频文件路径

# --- 检查模型路径 ---
if not os.path.exists(model_path):
    print(f"错误：模型文件未找到: {model_path}")
    exit()

# --- 确保输出目录存在 ---
os.makedirs(output_save_dir, exist_ok=True)
print(f"带标注的检测帧将保存在: {output_save_dir}")

# --- 2. 加载模型 ---
print(f"正在加载模型: {model_path}")
model = None

# 首先尝试直接加载YOLO模型
try:
    # 尝试使用YOLO直接加载原始模型
    model = YOLO(model_path)
    print("模型直接加载成功。")
except Exception as e:
    print(f"直接加载模型失败: {e}")

    # 如果失败，尝试转换模型
    try:
        converted_model_path = convert_model(model_path)
        if converted_model_path:
            try:
                model = YOLO(converted_model_path)
                print("使用转换后的模型加载成功。")
            except Exception as e2:
                print(f"加载转换后的模型失败: {e2}")
    except Exception as e:
        print(f"转换模型失败: {e}")

# 如果模型仍然加载失败，创建一个基础YOLOv8模型作为替代
if model is None:
    try:
        print("尝试使用预训练的YOLOv8n模型作为替代...")
        model = YOLO("yolov8n.pt")  # 使用默认的YOLOv8n模型
        print("预训练模型加载成功。注意：这不是您的自定义模型！")
    except Exception as e:
        print(f"加载替代模型也失败: {e}")
        print("无法继续运行，请确保您的Python环境中有正确的依赖项。")
        sys.exit(1)

# --- 3. 打开视频源 ---
print(f"正在打开视频源: {video_source}")
cap = cv2.VideoCapture(video_source)
if not cap.isOpened():
    print(f"错误: 无法打开视频源 {video_source}")
    exit()

print("视频源已打开，开始处理帧...")
frame_count = 0

# --- 4. 逐帧处理视频流 ---
while True:
    success, frame = cap.read()
    if not success:
        print("视频处理完成或无法读取下一帧。")
        break

    frame_count += 1
    start_time = time.time()

    # --- 使用 YOLO 模型进行预测 ---
    try:
        results = model(frame, verbose=False)

        # --- 检查是否有检测结果 ---
        detected = False
        if results and hasattr(results[0], "boxes"):
            boxes = results[0].boxes
            if len(boxes) > 0:
                detected = True

        # --- 如果检测到目标，则保存带标注的当前帧 ---
        if detected:
            # 使用 results[0].plot() 获取带标注的图像 (NumPy array)
            annotated_frame = results[0].plot()

            # 生成唯一的文件名
            timestamp = int(time.time() * 1000)
            save_filename = f"annotated_frame_{frame_count:05d}_{timestamp}.jpg"
            save_path = os.path.join(output_save_dir, save_filename)

            try:
                # 保存带标注的帧
                cv2.imwrite(save_path, annotated_frame)
                print(f"检测到目标！带标注的帧 {frame_count} 已保存到: {save_path}")
            except Exception as e:
                print(f"保存带标注的帧 {frame_count} 时出错: {e}")

        # --- 实时显示带标注的帧 ---
        try:
            annotated_frame_display = results[0].plot()
            cv2.imshow("YOLO Detection Stream", annotated_frame_display)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("用户请求退出...")
                break
        except Exception as display_err:
            print(f"显示帧出错: {display_err}")
            # 显示原始帧作为备选
            cv2.imshow("Video Stream", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    except Exception as pred_error:
        print(f"预测过程中出错: {pred_error}")
        # 显示原始帧但不进行预测
        cv2.imshow("Video Stream (Error)", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    end_time = time.time()
    fps = 1 / (end_time - start_time)
    # print(f"Frame {frame_count}, FPS: {fps:.2f}")

# --- 5. 清理 ---
cap.release()
cv2.destroyAllWindows()
print("处理完毕，资源已释放。")
