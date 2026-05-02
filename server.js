const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

// ✅ Serve Static Files from `public/`
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html")); // Main Page
});

const EMAIL_USER = process.env.EMAIL_USER && String(process.env.EMAIL_USER).trim();
const EMAIL_PASS = process.env.EMAIL_PASS && String(process.env.EMAIL_PASS).replace(/\s+/g, "").trim();

if (!EMAIL_USER || !EMAIL_PASS) {
    console.warn(
        "[mail] EMAIL_USER / EMAIL_PASS are missing. Set them in Render: Environment tab (this app does not read public/.env). " +
            "Local: use HWAYEAP/.env next to server.js."
    );
} else {
    console.log("[mail] SMTP sender configured:", EMAIL_USER);
}

/**
 * Accept data URI from html2pdf (`data:application/pdf;base64,...`) or raw base64.
 */
function pdfBufferFromClient(input) {
    if (typeof input !== "string" || !input.trim()) {
        throw new Error("Invalid or empty pdfBuffer");
    }
    const trimmed = input.trim();
    const marker = "base64,";
    const idx = trimmed.indexOf(marker);
    const b64 =
        idx !== -1 ? trimmed.slice(idx + marker.length) : trimmed;
    const buf = Buffer.from(b64, "base64");
    if (!buf.length) {
        throw new Error("Decoded PDF attachment is empty (check PDF generation)");
    }
    if (buf.length < 4 || buf.subarray(0, 4).toString("ascii") !== "%PDF") {
        console.warn("[mail] Attachment may not be a valid PDF file (missing %PDF header).");
    }
    return buf;
}

function formatMailError(error) {
    const parts = [error.message || String(error)];
    if (error.code) parts.push("code:" + error.code);
    if (error.responseCode) parts.push("smtp:" + error.responseCode);
    if (typeof error.response === "string" && error.response) {
        parts.push(error.response.trim().slice(0, 300));
    }
    return parts.join(" | ");
}

// ✅ Gmail SMTP — use App Password (Google Account → Security → 2-Step Verification → App passwords)
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});

transporter.verify((error) => {
    if (error) {
        console.error("[mail] SMTP verify failed:", formatMailError(error));
    } else {
        console.log("[mail] SMTP server is ready to send emails");
    }
});

app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body || {};

        if (!recipientEmail || !recipientName || !month || !year || !pdfBuffer || !fileName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        if (!EMAIL_USER || !EMAIL_PASS) {
            console.error("[mail] Reject send: EMAIL_USER / EMAIL_PASS not configured on server");
            return res.status(503).json({
                error: "Email is not configured on the server",
                details: "Set EMAIL_USER and EMAIL_PASS in Render → Environment (Gmail App Password, no spaces). Redeploy if needed."
            });
        }

        let pdfAttachment;
        try {
            pdfAttachment = pdfBufferFromClient(pdfBuffer);
        } catch (decodeErr) {
            console.error("[mail] PDF decode error:", decodeErr.message);
            return res.status(400).json({ error: "Invalid PDF attachment", details: decodeErr.message });
        }

        const mailOptions = {
            from: {
                name: "Hwa Yeap Engineering",
                address: EMAIL_USER
            },
            to: recipientEmail,
            subject: `Salary Voucher for ${month} ${year}`,
            text:
                `Dear ${recipientName},\n\nPlease find attached your salary voucher for ${month} ${year}.\n\nBest regards,\nHwa Yeap Engineering`,
            attachments: [
                {
                    filename: fileName,
                    content: pdfAttachment,
                    contentType: "application/pdf"
                }
            ]
        };

        const info = await transporter.sendMail(mailOptions);
        console.log("[mail] sent:", info.messageId, "→", recipientEmail);

        res.status(200).json({
            message: "Email sent successfully",
            messageId: info.messageId
        });
    } catch (error) {
        const detail = formatMailError(error);
        console.error("[mail] sendMail failed:", detail);
        if (error && error.stack) console.error(error.stack);

        res.status(500).json({
            error: "Failed to send email",
            details: error.message || detail
        });
    }
});

app.use((err, req, res, next) => {
    console.error("Server error:", err);
    res.status(500).json({
        error: "Internal server error",
        details: err.message
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
