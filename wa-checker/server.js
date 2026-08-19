/**
 * WhatsApp number checker microservice (free).
 *
 * Uses Baileys to maintain a WhatsApp Web session so we can query whether a
 * given E.164 number is registered on WhatsApp — the one thing `wa.me` links
 * cannot tell us server-side.
 *
 * Setup (one-time): scan the QR code with any spare WhatsApp number (or use
 * the pairing code). Once linked, this service answers /check requests.
 *
 * Endpoints:
 *   GET /status        -> { connected, qr (string|null), message }
 *   GET /pair?phone=.. -> { pairing_code } (alternative to QR)
 *   GET /check?phone=9198... -> { exists, jid, error, cached }
 */
import express from "express";
import qrcode from "qrcode-terminal";
import pino from "pino";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";

const PORT = Number(process.env.WA_CHECKER_PORT || 8100);
const HOST = process.env.WA_CHECKER_HOST || "0.0.0.0";

// Silent pino logger (Baileys requires a logger with a .child() method).
const silentLogger = pino({ level: "silent" });

const app = express();
app.use(express.json());

let sock = null;
let connected = false;
let currentQr = null;
let lastError = null;

function log(...args) {
  console.log(`[wa-checker]`, ...args);
}

async function startSession() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  log(`Baileys ${version.join(".")} (latest: ${isLatest})`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 30_000,
    logger: silentLogger,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQr = qr;
      qrcode.generate(qr, { small: true }, (out) => log("QR:\n" + out));
    }
    if (connection === "open") {
      connected = true;
      currentQr = null;
      lastError = null;
      log("Connected to WhatsApp. Number checks are now live.");
    } else if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      connected = false;
      log(`Connection closed. Reconnect: ${shouldReconnect}`);
      lastError = lastDisconnect?.error?.message || lastDisconnect?.error?.output?.payload?.message || "closed";
      if (shouldReconnect) {
        setTimeout(startSession, 3000);
      }
    }
  });
}

app.get("/status", (_req, res) => {
  res.json({
    connected,
    qr: currentQr,
    error: lastError,
    message: connected
      ? "Linked. WhatsApp checks are live."
      : currentQr
        ? "Waiting for QR scan (open /pair for a code instead)."
        : "Session not linked. Scan the QR or use /pair to connect.",
  });
});

app.get("/pair", async (req, res) => {
  try {
    const phone = String(req.query.phone || "").replace(/\D/g, "");
    if (!phone) {
      return res.status(400).json({ error: "Provide ?phone=<e164 digits>" });
    }
    const code = await sock.requestPairingCode(phone);
    return res.json({ pairing_code: code });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/check", async (req, res) => {
  if (!connected) {
    return res.status(503).json({
      error: "not_connected",
      message: "WhatsApp session is not linked. Scan the QR or run /pair first.",
    });
  }
  const phone = String(req.query.phone || "").replace(/\D/g, "");
  if (!phone) {
    return res.status(400).json({ error: "Provide ?phone=<e164 digits>" });
  }
  try {
    const result = await sock.onWhatsApp(phone);
    const entry = result?.[0] || null;
    return res.json({
      exists: entry ? Boolean(entry.exists) : false,
      jid: entry?.jid || null,
      error: null,
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

startSession().catch((err) => {
  lastError = err.message;
  log("Failed to start session:", err.message);
});

app.listen(PORT, HOST, () => {
  log(`Listening on http://${HOST}:${PORT}`);
  log("Scan the QR with a spare WhatsApp number once, then use /check.");
});