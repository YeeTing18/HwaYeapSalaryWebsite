const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

const RESEND_API_KEY = process.env.RESEND_API_KEY && String(process.env.RESEND_API_KEY).trim();
const RESEND_FROM =
    (process.env.RESEND_FROM && String(process.env.RESEND_FROM).trim()) ||
    "Hwa Yeap Engineering <onboarding@resend.dev>";

const EMAIL_USER = process.env.EMAIL_USER && String(process.env.EMAIL_USER).trim();
const EMAIL_PASS = process.env.EMAIL_PASS && String(process.env.EMAIL_PASS).replace(/\s+/g, "").trim();

/** Prefer Resend on hosts (e.g. Render) where outbound SMTP to Gmail is blocked (ETIMEDOUT). */
const useResend = Boolean(RESEND_API_KEY);

if (useResend) {
    console.log("[mail] Using Resend API over HTTPS (works on Render). From:", RESEND_FROM.split("<").pop().replace(">", ""));
    console.log(
        "[mail] Tip: Verify your own domain in Resend and set RESEND_FROM to e.g. Hwa Yeap Engineering <noreply@yourdomain.com>. " +
            "onboarding@resend.dev only allows sending to approved test addresses."
    );
} else if (EMAIL_USER && EMAIL_PASS) {
    console.log("[mail] Using Gmail SMTP (OK on local PCs; often blocked on cloud hosts). Sender:", EMAIL_USER);
} else {
    console.warn(
        "[mail] No mail configured. On Render add RESEND_API_KEY (+ RESEND_FROM after domain verify). Local dev can use EMAIL_USER / EMAIL_PASS for SMTP."
    );
}

function pdfBufferFromClient(input) {
    if (typeof input !== "string" || !input.trim()) {
        throw new Error("Invalid or empty pdfBuffer");
    }
    const trimmed = input.trim();
    const marker = "base64,";
    const idx = trimmed.indexOf(marker);
    const b64 = idx !== -1 ? trimmed.slice(idx + marker.length) : trimmed;
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

let transporter = null;
if (!useResend && EMAIL_USER && EMAIL_PASS) {
    const nodemailer = require("nodemailer");
    transporter = nodemailer.createTransport({
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
            console.log("[mail] SMTP server is ready");
        }
    });
}

async function sendWithResend({ recipientEmail, recipientName, month, year, pdfBinary, fileName }) {
    const { Resend } = require("resend");
    const resend = new Resend(RESEND_API_KEY);
    const text =
        `Dear ${recipientName},\n\nPlease find attached your salary voucher for ${month} ${year}.\n\nBest regards,\nHwa Yeap Engineering`;

    const { data, error } = await resend.emails.send({
        from: RESEND_FROM,
        to: recipientEmail,
        subject: `Salary Voucher for ${month} ${year}`,
        text,
        attachments: [
            {
                filename: fileName,
                content: pdfBinary.toString("base64"),
                contentType: "application/pdf"
            }
        ]
    });

    if (error) {
        const msg =
            typeof error.message === "string"
                ? error.message
                : JSON.stringify(error);
        throw new Error(msg || "Resend API rejected the send");
    }
    return data;
}

async function sendWithSmtp({ recipientEmail, recipientName, month, year, pdfBinary, fileName }) {
    await transporter.sendMail({
        from: {
            name: "Hwa Yeap Engineering",
            address: EMAIL_USER
        },
        to: recipientEmail,
        subject: `Salary Voucher for ${month} ${year}`,
        text:
            `Dear ${recipientName},\n\nPlease find attached your salary voucher for ${month} ${year}.\n\nBest regards,\nHwa Yeap Engineering`,
        attachments: [{ filename: fileName, content: pdfBinary, contentType: "application/pdf" }]
    });
}

app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body || {};

        if (!recipientEmail || !recipientName || !month || !year || !pdfBuffer || !fileName) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        if (!useResend && (!EMAIL_USER || !EMAIL_PASS || !transporter)) {
            return res.status(503).json({
                error: "Email is not configured on the server",
                details:
                    "On Render, outbound SMTP to Gmail usually times out — set RESEND_API_KEY and RESEND_FROM in Environment. Local: set EMAIL_USER and EMAIL_PASS (Gmail App Password)."
            });
        }

        let pdfBinary;
        try {
            pdfBinary = pdfBufferFromClient(pdfBuffer);
        } catch (decodeErr) {
            console.error("[mail] PDF decode error:", decodeErr.message);
            return res.status(400).json({ error: "Invalid PDF attachment", details: decodeErr.message });
        }

        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        if (useResend) {
            const data = await sendWithResend(payload);
            console.log("[mail] Resend sent id:", data && data.id, "→", recipientEmail);
            return res.status(200).json({
                message: "Email sent successfully",
                messageId: (data && data.id) || null
            });
        }

        await sendWithSmtp(payload);
        console.log("[mail] SMTP sent →", recipientEmail);
        return res.status(200).json({
            message: "Email sent successfully"
        });
    } catch (error) {
        const detail = formatMailError(error);
        console.error("[mail] send failed:", detail);
        if (error && error.stack) console.error(error.stack);

        return res.status(500).json({
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
