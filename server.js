const express = require("express");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();

// Increase limits for PDF data
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- CREDENTIALS FROM YOUR INPUT ---
const EMAIL_USER = process.env.EMAIL_USER || "abbey7341@gmail.com";
const EMAIL_PASS = process.env.EMAIL_PASS; // mxvf emdn yqoj udhi
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// --- HELPERS ---

function pdfBufferFromClient(input) {
    const b64 = input.includes("base64,") ? input.split("base64,")[1] : input;
    return Buffer.from(b64, "base64");
}

/** Gmail API requires base64url encoding */
function toGmailRaw(mimeBuf) {
    return mimeBuf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- EMAIL ENGINES ---

/** * Engine 1: Gmail API (OAuth2)
 * This is the most secure method for Render.
 */
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

/** * Engine 2: Gmail SMTP (App Password)
 * Use this as a backup if OAuth fails.
 */
async function sendWithSmtp(payload) {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS // The app password provided: mxvf emdn yqoj udhi
        }
    });

    return await transporter.sendMail({
        from: `"Hwa Yeap Engineering" <${EMAIL_USER}>`,
        to: payload.recipientEmail,
        subject: `Salary Voucher - ${payload.month} ${payload.year}`,
        text: `Dear ${payload.recipientName},\n\nPlease find attached your salary voucher.\n\nBest regards,\nHwa Yeap Engineering`,
        attachments: [{ filename: payload.fileName, content: payload.pdfBinary }]
    });
}

// --- MAIN ROUTE ---

app.post("/api/send-email", async (req, res) => {
    console.log(`[Request] Attempting to send email to: ${req.body.recipientEmail}`);

    try {
        const { recipientEmail, recipientName, month, year, pdfBuffer, fileName } = req.body;
        const pdfBinary = pdfBufferFromClient(pdfBuffer);
        const payload = { recipientEmail, recipientName, month, year, pdfBinary, fileName };

        // STEP 1: Try Gmail OAuth API (Best for Render)
        if (GMAIL_REFRESH_TOKEN) {
            try {
                console.log("[Process] Trying Gmail OAuth API...");
                const result = await sendWithGmailApi(payload);
                return res.status(200).json({ success: true, via: "Gmail-OAuth", id: result.id });
            } catch (oauthErr) {
                console.error("[Fallback] Gmail OAuth Failed:", oauthErr.message);
                // If it's a token error, continue to SMTP fallback
            }
        }

        // STEP 2: Try Gmail SMTP (App Password)
        if (EMAIL_PASS) {
            console.log("[Process] Trying Gmail SMTP with App Password...");
            await sendWithSmtp(payload);
            return res.status(200).json({ success: true, via: "Gmail-SMTP" });
        }

        // STEP 3: Try Resend (Last Resort)
        if (RESEND_API_KEY) {
            console.log("[Process] Trying Resend API...");
            const { Resend } = require("resend");
            const resend = new Resend(RESEND_API_KEY);
            await resend.emails.send({
                from: "onboarding@resend.dev",
                to: recipientEmail,
                subject: `Salary Voucher - ${month} ${year}`,
                text: `Voucher attached.`,
                attachments: [{ filename: fileName, content: pdfBinary.toString("base64") }]
            });
            return res.status(200).json({ success: true, via: "Resend" });
        }

        throw new Error("No valid email credentials found (Check Render Environment Variables)");

    } catch (finalError) {
        console.error("[Fatal Error]:", finalError.message);
        res.status(500).json({ error: "Failed to send email", details: finalError.message });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
