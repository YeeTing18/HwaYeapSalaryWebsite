const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const { Resend } = require("resend");
require("dotenv").config();

const app = express();

// Increase limits for PDF data
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- CREDENTIALS ---
const EMAIL_USER = process.env.EMAIL_USER || "abbey7341@gmail.com";
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// --- HELPERS ---
function pdfBufferFromClient(input) {
    const b64 = input.includes("base64,") ? input.split("base64,")[1] : input;
    return Buffer.from(b64, "base64");
}

function toGmailRaw(mimeBuf) {
    return mimeBuf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- EMAIL ENGINES ---

async function sendWithGmailApi(payload) {
    const oauth2Client = new google.auth.OAuth2(
        GMAIL_CLIENT_ID,
        GMAIL_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground"
    );
    oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const MailComposer = require("nodemailer/lib/mail-composer");

    const mailOptions = {
        from: `"Hwa Yeap Engineering" <${EMAIL_USER}>`,
        to: payload.recipientEmail,
        subject: `Salary Voucher - ${payload.month} ${payload.year}`,
        text: `Dear ${payload.recipientName},\n\nPlease find attached your salary voucher.\n\nBest regards,\nHwa Yeap Engineering`,
        attachments: [{ filename: payload.fileName, content: payload.pdfBinary }]
    };

    const mimeBuf = await new Promise((res, rej) => {
        new MailComposer(mailOptions).compile().build((err, buf) => err ? rej(err) : res(buf));
    });

    const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: toGmailRaw(mimeBuf) }
    });
    return res.data;
}

async function sendWithResend(payload) {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
        from: "Hwa Yeap Engineering <onboarding@resend.dev>", 
        to: payload.recipientEmail,
        subject: `Salary Voucher - ${payload.month} ${payload.year}`,
        text: `Dear ${payload.recipientName}, your salary voucher is attached.`,
        attachments: [{ 
            filename: payload.fileName, 
            content: payload.pdfBinary.toString("base64") 
        }]
    });
    if (error) throw error;
    return data;
}

// --- MAIN ROUTE ---

app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;
        const pdfBinary = pdfBufferFromClient(pdfBuffer);
        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        // 1. ALWAYS TRY GMAIL API FIRST (To use your abbey7341 address)
        if (GMAIL_REFRESH_TOKEN && GMAIL_CLIENT_ID) {
            try {
                console.log("[Process] Attempting Gmail API...");
                const result = await sendWithGmailApi(payload);
                return res.status(200).json({ success: true, via: "Gmail-API", id: result.id });
            } catch (gmailErr) {
                console.error("[Fallback] Gmail API Failed:", gmailErr.message);
                // If Gmail fails, the code will automatically move to Resend below
            }
        }

        // 2. FALLBACK TO RESEND (If Gmail has invalid_grant or other errors)
        if (RESEND_API_KEY) {
            console.log("[Process] Attempting Resend API...");
            const result = await sendWithResend(payload);
            return res.status(200).json({ success: true, via: "Resend", id: result.id });
        }

        throw new Error("All mail providers failed. Check your tokens.");

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
