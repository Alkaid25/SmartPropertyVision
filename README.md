# WebRTC视频流传输系统

这是一个基于WebRTC的局域网视频流传输系统，用于实时视频传输和后续的模型检测。

## 环境要求

- Python 3.7或更高版本
- pip (Python包管理器)

## 安装步骤

1. 安装依赖：
```bash
pip install -r requirements.txt
```

2. 生成SSL证书：
```bash
python generate_cert.py
```

3. 启动服务器：
```bash
python server.py
```

## 使用方法

1. 服务器启动后，在浏览器中访问：
   - 本机访问：https://localhost:3000
   - 局域网访问：https://[本机IP]:3000

2. 首次访问时，浏览器会显示安全警告，这是因为使用了自签名证书。点击"继续访问"即可。

3. 允许浏览器访问摄像头权限。

## 注意事项

- 确保防火墙允许3000端口的访问
- 如果使用Windows系统，可能需要以管理员身份运行命令提示符
- 首次访问时需要在浏览器中接受自签名证书 