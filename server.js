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

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID && String(process.env.GMAIL_CLIENT_ID).trim();
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET && String(process.env.GMAIL_CLIENT_SECRET).trim();
const GMAIL_REFRESH_TOKEN =
    process.env.GMAIL_REFRESH_TOKEN && String(process.env.GMAIL_REFRESH_TOKEN).trim();

/** Redirect URI must match how the refresh token was issued (often OAuth Playground). */
const GMAIL_OAUTH_REDIRECT_URI =
    (process.env.GMAIL_OAUTH_REDIRECT_URI &&
        String(process.env.GMAIL_OAUTH_REDIRECT_URI).trim()) ||
    "https://developers.google.com/oauthplayground";

const MAIL_PROVIDER = String(process.env.MAIL_PROVIDER || "auto").trim().toLowerCase();
const forceGmailApi = MAIL_PROVIDER === "gmail";
const forceResend = MAIL_PROVIDER === "resend";

const useGmailApi = Boolean(GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && EMAIL_USER);
const useResend = Boolean(RESEND_API_KEY);
const canUseGmailApi = useGmailApi && !forceResend;
const canUseResend = useResend && !forceGmailApi;

if (canUseGmailApi) {
    console.log("[mail] Using Gmail API (HTTPS) — From:", EMAIL_USER, "(matches Render; SMTP not used)");
} else if (canUseResend) {
    console.log(
        "[mail] Using Resend; From:",
        RESEND_FROM,
        "(cannot spoof @gmail.com — use Gmail OAuth env vars to send from your Gmail)"
    );
} else if (EMAIL_USER && EMAIL_PASS) {
    console.log("[mail] Using Gmail SMTP (local only; blocked on many clouds). Sender:", EMAIL_USER);
} else {
    console.warn(
        "[mail] No mail configured. Recommended on Render: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN + EMAIL_USER. Or RESEND_API_KEY."
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
    if (error.errors && Array.isArray(error.errors)) {
        parts.push(JSON.stringify(error.errors).slice(0, 400));
    }
    return parts.join(" | ");
}

function isInvalidGrantError(error) {
    if (!error) return false;
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("invalid_grant")) return true;
    if (Array.isArray(error.errors)) {
        return error.errors.some((e) =>
            String((e && (e.message || e.reason || e.error)) || "")
                .toLowerCase()
                .includes("invalid_grant")
        );
    }
    return false;
}

/** Gmail API expects RFC 822 as base64url. */
function toGmailRaw(mimeBuf) {
    return mimeBuf
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function buildMimeMailBuffer(mailOptions) {
    const MailComposer = require("nodemailer/lib/mail-composer");
    const mimeNode = new MailComposer(mailOptions).compile();
    return new Promise((resolve, reject) => {
        mimeNode.build((err, buf) => (err ? reject(err) : resolve(buf)));
    });
}

async function sendWithGmailApi({ recipientEmail, recipientName, month, year, pdfBinary, fileName }) {
    const { google } = require("googleapis");
    const { OAuth2Client } = require("google-auth-library");
    const oauth2Client = new OAuth2Client(
        GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET,
        GMAIL_OAUTH_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const subject = `Salary Voucher for ${month} ${year}`;
    const text =
        `Dear ${recipientName},\n\nPlease find attached your salary voucher for ${month} ${year}.\n\nBest regards,\nHwa Yeap Engineering`;

    const mimeBuf = await buildMimeMailBuffer({
        from: `"Hwa Yeap Engineering" <${EMAIL_USER}>`,
        to: recipientEmail,
        subject,
        text,
        attachments: [
            {
                filename: fileName,
                content: pdfBinary,
                contentType: "application/pdf"
            }
        ]
    });

    const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: toGmailRaw(mimeBuf)
        }
    });
    return data;
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

let transporter = null;
if (!canUseGmailApi && !canUseResend && EMAIL_USER && EMAIL_PASS) {
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

        let pdfBinary;
        try {
            pdfBinary = pdfBufferFromClient(pdfBuffer);
        } catch (decodeErr) {
            console.error("[mail] PDF decode error:", decodeErr.message);
            return res.status(400).json({ error: "Invalid PDF attachment", details: decodeErr.message });
        }

        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        if (canUseGmailApi) {
            try {
                const data = await sendWithGmailApi(payload);
                console.log("[mail] Gmail API sent id:", data && data.id, "→", recipientEmail);
                return res.status(200).json({
                    message: "Email sent successfully",
                    messageId: (data && data.id) || null
                });
            } catch (gmailErr) {
                if (isInvalidGrantError(gmailErr) && canUseResend && !forceGmailApi) {
                    console.warn("[mail] Gmail OAuth invalid_grant. Falling back to Resend for this request.");
                    const data = await sendWithResend(payload);
                    return res.status(200).json({
                        message: "Email sent successfully",
                        messageId: (data && data.id) || null,
                        via: "resend-fallback"
                    });
                }
                throw gmailErr;
            }
        }

        if (canUseResend) {
            const data = await sendWithResend(payload);
            console.log("[mail] Resend sent id:", data && data.id, "→", recipientEmail);
            return res.status(200).json({
                message: "Email sent successfully",
                messageId: (data && data.id) || null
            });
        }

        if (!EMAIL_USER || !EMAIL_PASS || !transporter) {
            return res.status(503).json({
                error: "Email is not configured on the server",
                details:
                    "Use Gmail OAuth: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, plus EMAIL_USER (your Gmail). Or RESEND_API_KEY."
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
