require("dotenv").config(); // 必须在第一行
const express = require("express");
const { google } = require("googleapis");
const path = require("path"); // 必须引入，用于处理文件路径
const cors = require("cors"); // 引入 cors 解决跨域问题

const app = express();

// --- 1. 中间件配置 ---
app.use(cors());
// 增加 body 解析限额，防止 PDF 过大导致失败
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --- 2. 静态文件托管 (解决 Cannot GET / 的关键) ---
// 假设你的 login.html 等文件在名为 public 的文件夹内
app.use(express.static(path.join(__dirname, "public")));

// --- 3. 首页路由 ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// --- 4. Google Gmail API 配置 ---
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oAuth2Client.setCredentials({ 
    refresh_token: process.env.GMAIL_REFRESH_TOKEN 
});

// --- 5. 邮件发送接口 ---
app.post("/api/send-email", async (req, res) => {
  try {
    const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;
    
    // 初始化 Gmail 服务
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // 提取 Base64 数据
    const base64Data = pdfBuffer.split("base64,")[1];
    
    // 构建 MIME 邮件格式
    const subject = `HWA YEAP ENGINEERING - Salary Voucher for ${month} ${year}`;
    // 对中文/特殊字符主题进行编码
    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    
    const messageParts = [
      `From: Hwa Yeap Engineering <abbey7341@gmail.com>`,
      `To: ${recipientEmail}`,
      `Subject: ${utf8Subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="foo_bar_baz"`,
      ``,
      `--foo_bar_baz`,
      `Content-Type: text/html; charset="utf-8"`,
      `Content-Transfer-Encoding: 7bit`,
      ``,
      `<p>Dear ${recipientName},</p><p>Please find attached your salary voucher for ${month} ${year}.</p><p>Best regards,<br>Hwa Yeap Engineering</p>`,
      ``,
      `--foo_bar_baz`,
      `Content-Type: application/pdf`,
      `Content-Disposition: attachment; filename="${fileName}"`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64Data,
      `--foo_bar_baz--`,
    ];

    const message = messageParts.join('\n');
    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // 执行发送
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    console.log(`成功发送至: ${recipientEmail}`);
    res.json({ success: true });

  } catch (error) {
    console.error("Gmail API 报错详情:", error);
    res.status(500).json({ 
      error: "邮件发送失败", 
      details: error.message 
    });
  }
});

// --- 6. 启动服务器 ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器已启动，监听端口: ${PORT}`);
});
