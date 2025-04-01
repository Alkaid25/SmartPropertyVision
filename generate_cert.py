from OpenSSL import crypto
import os
import socket


def generate_self_signed_cert():
    # 创建证书目录
    if not os.path.exists("certs"):
        os.makedirs("certs")

    # 获取本机IP地址
    hostname = socket.gethostname()
    try:
        local_ip = socket.gethostbyname(hostname)
    except:
        local_ip = "127.0.0.1"  # 如果获取失败，使用默认值

    # 尝试获取所有本机IP地址
    all_ips = []
    try:
        for interface in socket.getaddrinfo(hostname, None):
            ip = interface[4][0]
            if (
                ip not in all_ips and ip != "127.0.0.1" and ":" not in ip
            ):  # 排除本地回环和IPv6
                all_ips.append(ip)
    except:
        pass

    if not all_ips:
        all_ips = [local_ip]

    # 生成密钥
    k = crypto.PKey()
    k.generate_key(crypto.TYPE_RSA, 2048)

    # 生成证书
    cert = crypto.X509()
    cert.get_subject().C = "CN"
    cert.get_subject().ST = "State"
    cert.get_subject().L = "City"
    cert.get_subject().O = "Organization"
    cert.get_subject().OU = "Organizational Unit"
    cert.get_subject().CN = local_ip  # 使用本机IP作为CN
    cert.set_serial_number(1000)
    cert.gmtime_adj_notBefore(0)
    cert.gmtime_adj_notAfter(365 * 24 * 60 * 60)  # 有效期一年
    cert.set_issuer(cert.get_subject())
    cert.set_pubkey(k)

    # 添加备选名称 (SAN) 扩展
    alt_names = ["IP:127.0.0.1", "DNS:localhost"]

    # 添加本机所有IP
    for ip in all_ips:
        alt_names.append(f"IP:{ip}")
        alt_names.append(f"DNS:{ip}")

    # 添加主机名
    alt_names.append(f"DNS:{hostname}")

    san_extension = crypto.X509Extension(
        b"subjectAltName", False, ", ".join(alt_names).encode()
    )

    # 添加更多扩展以提高兼容性
    extensions = [
        san_extension,
        crypto.X509Extension(b"keyUsage", True, b"digitalSignature,keyEncipherment"),
        crypto.X509Extension(b"extendedKeyUsage", False, b"serverAuth,clientAuth"),
        crypto.X509Extension(b"basicConstraints", True, b"CA:FALSE"),
    ]

    cert.add_extensions(extensions)
    cert.sign(k, "sha256")

    # 保存证书和私钥
    with open("certs/certificate.crt", "wb") as f:
        f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))

    with open("certs/private.key", "wb") as f:
        f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))

    print(f"证书生成完成!")
    print(f"已包含以下主机名/IP:")
    print(f" - 本机IP地址: {', '.join(all_ips)}")
    print(f" - 主机名: {hostname}")
    print(f" - localhost (127.0.0.1)")


if __name__ == "__main__":
    generate_self_signed_cert()
