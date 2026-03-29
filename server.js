require("dotenv").config();
const express = require("express");
const { google } = require("googleapis");

const app = express();
app.use(express.json({ limit: "50mb" }));

// Google API 配置
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

app.post("/api/send-email", async (req, res) => {
  try {
    const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    const base64Data = pdfBuffer.split("base64,")[1];
    
    // 构建 MIME 邮件格式 (Gmail API 要求)
    const subject = `HWA YEAP ENGINEERING - Salary Voucher for ${month} ${year}`;
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
      `<p>Dear ${recipientName},</p><p>Please find attached your salary voucher for ${month} ${year}.</p>`,
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

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Gmail API Error:", error);
    res.status(500).json({ error: "Failed to send" });
  }
});

app.listen(process.env.PORT || 3001);
