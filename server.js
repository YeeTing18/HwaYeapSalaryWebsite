require("dotenv").config(); // MUST be first

const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Resend } = require("resend");

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);

app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Email Endpoint
app.post("/api/send-email", async (req, res) => {
  try {
    const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;

    if (!pdfBuffer) {
      return res.status(400).json({ error: "Missing PDF file" });
    }

    const base64File = pdfBuffer.split("base64,")[1];

    await resend.emails.send({
      from: "Hwa Yeap Engineering <onboarding@resend.dev>",
      to: recipientEmail,
      subject: `Salary Voucher for ${month} ${year}`,
      html: `
        <p>Dear ${recipientName},</p>
        <p>Please find attached your salary voucher for ${month} ${year}.</p>
        <p>Best regards,<br/>Hwa Yeap Engineering</p>
      `,
      attachments: [
        {
          filename: fileName,
          content: base64File
        }
      ]
    });

    res.json({ success: true });

  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// Error middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    error: "Internal server error",
    details: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
