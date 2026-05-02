const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();

// 1. INCREASE LIMITS FOR PDF BASE64 STRINGS
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

app.use(express.static(path.join(__dirname, "public")));

// --- ENVIRONMENT VARIABLES ---
const EMAIL_USER = (process.env.EMAIL_USER || "abbey7341@gmail.com").trim();
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID && String(process.env.GMAIL_CLIENT_ID).trim();
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET && String(process.env.GMAIL_CLIENT_SECRET).trim();
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN && String(process.env.GMAIL_REFRESH_TOKEN).trim();

// Provider selection
const MAIL_PROVIDER = String(process.env.MAIL_PROVIDER || "gmail").trim().toLowerCase();
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Check if Gmail API is configured
const canUseGmailApi = Boolean(GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && EMAIL_USER);

// --- HELPER FUNCTIONS ---

function pdfBufferFromClient(input) {
    if (typeof input !== "string" || !input.trim()) throw new Error("Invalid pdfBuffer");
    const marker = "base64,";
    const idx = input.indexOf(marker);
    const b64 = idx !== -1 ? input.slice(idx + marker.length) : input;
    return Buffer.from(b64, "base64");
}

function toGmailRaw(mimeBuf) {
    return mimeBuf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function buildMimeMailBuffer(mailOptions) {
    const MailComposer = require("nodemailer/lib/mail-composer");
    const mimeNode = new MailComposer(mailOptions).compile();
    return new Promise((resolve, reject) => {
        mimeNode.build((err, buf) => (err ? reject(err) : resolve(buf)));
    });
}

// --- EMAIL SENDING ENGINES ---

async function sendWithGmailApi({ recipientEmail, recipientName, month, year, pdfBinary, fileName }) {
    const { google } = require("googleapis");
    const { OAuth2Client } = require("google-auth-library");

    const oauth2Client = new OAuth2Client(
        GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    
    const mimeBuf = await buildMimeMailBuffer({
        from: `"Hwa Yeap Engineering" <${EMAIL_USER}>`,
        to: recipientEmail,
        subject: `Salary Voucher - ${month} ${year}`,
        text: `Dear ${recipientName},\n\nPlease find attached your salary voucher for ${month} ${year}.\n\nBest regards,\nHwa Yeap Engineering`,
        attachments: [{ filename: fileName, content: pdfBinary, contentType: "application/pdf" }]
    });

    const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: toGmailRaw(mimeBuf) }
    });
    return data;
}

async function sendWithResend({ recipientEmail, recipientName, month, year, pdfBinary, fileName }) {
    const { Resend } = require("resend");
    const resend = new Resend(RESEND_API_KEY);
    return await resend.emails.send({
        from: "Hwa Yeap Engineering <onboarding@resend.dev>", // Resend usually limits this unless domain is verified
        to: recipientEmail,
        subject: `Salary Voucher - ${month} ${year}`,
        text: `Dear ${recipientName}, attached is your voucher.`,
        attachments: [{ filename: fileName, content: pdfBinary.toString("base64") }]
    });
}

// --- API ROUTES ---

app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;

        if (!recipientEmail || !pdfBuffer) {
            return res.status(400).json({ error: "Missing required data (Email or PDF)" });
        }

        const pdfBinary = pdfBufferFromClient(pdfBuffer);
        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        // LOGIC: PRIORITIZE GMAIL API TO USE YOUR abbey7341 ADDRESS
        if (MAIL_PROVIDER === "gmail" || (canUseGmailApi && MAIL_PROVIDER !== "resend")) {
            console.log(`[Attempt] Sending via Gmail API as ${EMAIL_USER}`);
            const result = await sendWithGmailApi(payload);
            return res.status(200).json({ success: true, message: "Sent via Gmail API", id: result.id });
        } 
        
        // FALLBACK TO RESEND
        if (RESEND_API_KEY) {
            console.log("[Attempt] Sending via Resend Fallback");
            const result = await sendWithResend(payload);
            return res.status(200).json({ success: true, message: "Sent via Resend" });
        }

        throw new Error("No email provider configured correctly.");

    } catch (error) {
        console.error("CRITICAL SEND ERROR:", error.message);
        res.status(500).json({ 
            error: "Failed to send email", 
            details: error.message 
        });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server active on port ${PORT}. Mode: ${MAIL_PROVIDER}`);
});
