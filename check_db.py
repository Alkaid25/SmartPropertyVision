import sqlite3
import json
import os


def main():
    print(f"工作目录: {os.getcwd()}")
    print(f"检查数据库文件是否存在: {'detection_records.db' in os.listdir()}")

    conn = sqlite3.connect("detection_records.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 检查表结构
    cursor.execute("PRAGMA table_info(persistent_detections)")
    columns = cursor.fetchall()
    print("\n表结构:")
    for col in columns:
        print(f"  {col['name']} ({col['type']})")

    # 获取记录数
    cursor.execute("SELECT COUNT(*) FROM persistent_detections")
    count = cursor.fetchone()[0]
    print(f"\n总记录数: {count}")

    # 检查前两条记录
    if count > 0:
        cursor.execute("SELECT * FROM persistent_detections LIMIT 2")
        rows = cursor.fetchall()
        print("\n记录样本:")
        for i, row in enumerate(rows):
            record = {k: row[k] for k in row.keys()}
            print(f"\n--- 记录 {i+1} ---")
            for k, v in record.items():
                if k != "image_data":  # 跳过大型图像数据
                    print(f"  {k}: {v}")
                else:
                    print(f"  {k}: [图像数据, 长度 {len(str(v)) if v else 0}]")

    conn.close()


if __name__ == "__main__":
    main()
