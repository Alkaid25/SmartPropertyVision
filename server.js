const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const port = 3000;

// 配置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// 创建HTTPS服务器
const options = {
    key: fs.readFileSync(path.join(__dirname, 'certs', 'private.key')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'certificate.crt'))
};

const server = https.createServer(options, app);

// 获取本机IP地址
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // 跳过内部接口和非IPv4地址
            if (iface.family !== 'IPv4' || iface.internal) {
                continue;
            }
            return iface.address;
        }
    }
    return 'localhost';
}

const localIp = getLocalIp();

// 启动服务器
server.listen(port, '0.0.0.0', () => {
    console.log(`HTTPS服务器运行在:`);
    console.log(` - 本机访问: https://localhost:${port}`);
    console.log(` - 局域网访问: https://${localIp}:${port}`);
}); 