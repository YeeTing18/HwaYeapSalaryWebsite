
const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// ✅ Serve Static Files from `public/`
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html")); // Main Page
});

// ✅ Configure Gmail SMTP for Sending Emails
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// ✅ Verify SMTP Connection
transporter.verify((error, success) => {
    if (error) {
        console.error("SMTP connection error:", error);
    } else {
        console.log("SMTP server is ready to send emails");
    }
});

// ✅ Email Sending Endpoint
app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;

        if (!recipientEmail || !recipientName || !month || !year || !pdfBuffer || !fileName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const mailOptions = {
            from: {
                name: "Hwa Yeap Engineering",
                address: process.env.EMAIL_USER
            },
            to: recipientEmail,
            subject: `Salary Voucher for ${month} ${year}`,
            text: `Dear ${recipientName},\n\nPlease find attached your salary voucher for ${month} ${year}.\n\nBest regards,\nHwa Yeap Engineering`,
            attachments: [{
                filename: fileName,
                content: Buffer.from(pdfBuffer.split("base64,")[1], "base64"),
                contentType: "application/pdf"
            }]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent:", info.messageId);

        res.status(200).json({
            message: "Email sent successfully",
            messageId: info.messageId
        });

    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({
            error: "Failed to send email",
            details: error.message
        });
    }
});

// ✅ Error Handling Middleware
app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({
        error: "Internal server error",
        details: err.message
    });
});

// ✅ Start the Server on Port `3001`
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
