require("dotenv").config();

const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");

const app = express();

// --- 核心修改部分：针对云服务器优化的 Gmail 配置 ---
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // 强制使用 465 端口
  secure: true, // 465 端口必须设置为 true
  auth: {
    user: "abbey7341@gmail.com",
    // 确保你的 Render 环境变量中 GMAIL_APP_PASSWORD 是 hwhagjdnmrocwcid (没有空格)
    pass: process.env.GMAIL_APP_PASSWORD || "hwhagjdnmrocwcid" 
  },
  // 增加超时时间，给服务器更多反应时间
  connectionTimeout: 10000, 
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// 邮件发送接口
app.post("/api/send-email", async (req, res) => {
  try {
    const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;

    if (!pdfBuffer) {
      return res.status(400).json({ error: "Missing PDF file" });
    }

    const base64Data = pdfBuffer.split("base64,")[1];
    const fileBuffer = Buffer.from(base64Data, 'base64');

    const mailOptions = {
      from: `"Hwa Yeap Engineering" <abbey7341@gmail.com>`,
      to: recipientEmail,
      subject: `HWA YEAP ENGINEERING - Salary Voucher for ${month} ${year}`,
      html: `
        <p>Dear ${recipientName},</p>
        <p>Please find attached your salary voucher for ${month} ${year}.</p>
        <p>Best regards,<br/>Hwa Yeap Engineering</p>
      `,
      attachments: [
        {
          filename: fileName,
          content: fileBuffer
        }
      ]
    };

    // 发送邮件
    await transporter.sendMail(mailOptions);
    console.log(`Email successfully sent to ${recipientEmail}`);
    res.json({ success: true });

  } catch (error) {
    console.error("邮件发送报错:", error);
    res.status(500).json({ error: "邮件发送失败", details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
