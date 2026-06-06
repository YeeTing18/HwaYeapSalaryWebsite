const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// Increase limits for PDF data
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- CREDENTIALS ---
// Uses Gmail SMTP with App Password (never expires, no OAuth token rotation needed)
// To set up: Google Account > Security > 2-Step Verification > App Passwords
// Generate an App Password for "Mail" and set it as GMAIL_APP_PASSWORD env var
const EMAIL_USER = process.env.EMAIL_USER || "abbey7341@gmail.com";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// --- HELPERS ---
function pdfBufferFromClient(input) {
    const b64 = input.includes("base64,") ? input.split("base64,")[1] : input;
    return Buffer.from(b64, "base64");
}

// --- EMAIL ENGINE ---

async function sendWithGmailSmtp(payload) {
    if (!GMAIL_APP_PASSWORD) {
        throw new Error("GMAIL_APP_PASSWORD is not set. Please add it to your environment variables.");
    }

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: EMAIL_USER,
            pass: GMAIL_APP_PASSWORD,
        },
    });

    const info = await transporter.sendMail({
        from: `"Hwa Yeap Engineering" <${EMAIL_USER}>`,
        to: payload.recipientEmail,
        subject: `Salary Voucher - ${payload.month} ${payload.year}`,
        text: `Dear ${payload.recipientName},\n\nPlease find attached your salary voucher.\n\nBest regards,\nHwa Yeap Engineering`,
        attachments: [{ filename: payload.fileName, content: payload.pdfBinary }],
    });

    return info;
}

// --- MAIN ROUTE ---

app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;
        const pdfBinary = pdfBufferFromClient(pdfBuffer);
        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        console.log(`[Process] Sending email from ${EMAIL_USER} via Gmail SMTP...`);
        const result = await sendWithGmailSmtp(payload);
        console.log(`[Success] Email sent: ${result.messageId}`);
        return res.status(200).json({ success: true, via: "Gmail-SMTP", id: result.messageId });

    } catch (finalError) {
        console.error("[Fatal Error]:", finalError.message);
        res.status(500).json({ error: "Failed to send email", details: finalError.message });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
