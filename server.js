const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
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

// --- HELPERS ---
function pdfBufferFromClient(input) {
    const b64 = input.includes("base64,") ? input.split("base64,")[1] : input;
    return Buffer.from(b64, "base64");
}

function toGmailRaw(mimeBuf) {
    return mimeBuf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- EMAIL ENGINE ---

async function sendWithGmailApi(payload) {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        throw new Error("Missing Gmail OAuth credentials. Please set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.");
    }

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
        text: `Dear ${payload.recipientName},\n\nPlease find attached your salary voucher for ${payload.month} ${payload.year}.\n\nIf there are any discrepancies, please notify the office within 14 days of receiving this slip.\n\nBest regards,\nHwa Yeap Engineering`,
        attachments: [{ filename: payload.fileName, content: payload.pdfBinary }]
    };

    const mimeBuf = await new Promise((res, rej) => {
        new MailComposer(mailOptions).compile().build((err, buf) => err ? rej(err) : res(buf));
    });

    const result = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: toGmailRaw(mimeBuf) }
    });
    return result.data;
}

// --- MAIN ROUTE ---

app.post("/api/send-email", async (req, res) => {
    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;
        const pdfBinary = pdfBufferFromClient(pdfBuffer);
        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        console.log(`[Process] Sending email from ${EMAIL_USER} via Gmail API...`);
        const result = await sendWithGmailApi(payload);
        console.log(`[Success] Email sent: ${result.id}`);
        return res.status(200).json({ success: true, via: "Gmail-API", id: result.id });

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
