require("dotenv").config(); // 必须放在第一行

const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer"); // 替换了 Resend

const app = express();

// 配置 Gmail 发信通道 (Nodemailer)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // 使用 SSL
  auth: {
    user: "abbey7341@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD || "hwhagjdnmrocwcid",
  },
  // 增加超时设置，防止网络波动导致中断
  connectionTimeout: 10000, // 10秒超时
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

app.use(cors());
// 提高限额以处理大型 PDF 文件
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// 托管静态文件 (HTML/JS/Images)
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 邮件发送接口
app.post("/api/send-email", async (req, res) => {
  try {
    const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;

    if (!pdfBuffer) {
      return res.status(400).json({ error: "缺少 PDF 文件数据" });
    }

    // 处理 Base64 数据并转换为 Node.js Buffer
    const base64Data = pdfBuffer.split("base64,")[1];
    const fileBuffer = Buffer.from(base64Data, 'base64');

    // 配置邮件内容
    const mailOptions = {
      from: `"Hwa Yeap Engineering" <abbey7341@gmail.com>`, // 发件人
      to: recipientEmail, // 收件人 (员工邮箱)
      subject: `HWA YEAP ENGINEERING - Salary Voucher for ${month} ${year}`,
      html: `
        <p>Dear ${recipientName},</p>
        <p>Please find attached your salary voucher for <b>${month} ${year}</b>.</p>
        <p>If you have any questions, please ask the office staff.</p>
        <br/>
        <p>Best regards,<br/><b>Hwa Yeap Engineering</b></p>
      `,
      attachments: [
        {
          filename: fileName,
          content: fileBuffer
        }
      ]
    };

    // 执行邮件发送
    await transporter.sendMail(mailOptions);
    
    console.log(`成功发送邮件至: ${recipientEmail}`);
    res.json({ success: true });

  } catch (error) {
    console.error("邮件发送报错:", error);
    res.status(500).json({ 
      error: "邮件发送失败", 
      details: error.message 
    });
  }
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error("服务器错误:", err);
  res.status(500).json({
    error: "内部服务器错误",
    details: err.message
  });
});

// 启动服务器
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器正在端口 ${PORT} 上运行`);
});
