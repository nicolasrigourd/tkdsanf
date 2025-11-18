// backend/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const fs = require("fs-extra");
const path = require("path");
const cron = require("node-cron");
// Nota: usamos fetch nativo de Node 18+ (no node-fetch)

const app = express();
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));

const {
  PORT = 4000,
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  VERIFY_TOKEN = "mi_verify_token_seguro",
} = process.env;

if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
  console.warn("⚠️ Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en backend/.env");
}

const GRAPH_URL = `https://graph.facebook.com/v22.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// === Paths de datos ===
const DATA_DIR = path.join(__dirname, "data");
const LOGS_DIR = path.join(DATA_DIR, "logs");
fs.ensureDirSync(DATA_DIR);
fs.ensureDirSync(LOGS_DIR);

// === Utils ===
function periodKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
async function readJSON(file, fallback = null) {
  try { return await fs.readJSON(file); } catch { return fallback; }
}
async function writeJSON(file, data) {
  await fs.ensureFile(file);
  return fs.writeJSON(file, data, { spaces: 2 });
}

// Normaliza teléfonos AR a E.164 sin '+'
function normalizePhoneAR(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^0+/, "").replace(/^15/, "");
  if (!s.startsWith("54")) s = "54" + s;            // país
  if (!s.startsWith("549")) s = "549" + s.slice(2); // móvil
  return s;
}

async function sendTemplate(to, name = "hello_world", lang = "en_US", params = []) {
  const components = params.length
    ? [{ type: "body", parameters: params.map(t => ({ type: "text", text: String(t) })) }]
    : undefined;

  const r = await fetch(GRAPH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: { name, language: { code: lang }, components },
    }),
  });

  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message || "Error en WhatsApp API";
    throw new Error(msg);
  }
  return data;
}

// ====== Endpoints base ======
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, service: "whatsapp-backend", time: new Date().toISOString() });
});

// ====== Config ======
app.get("/api/config", async (req, res) => {
  const file = path.join(DATA_DIR, "config.json");
  const cfg = await readJSON(file, { notifications_day: 7, auto_hour: "09:00" });
  res.json(cfg);
});

app.post("/api/config", async (req, res) => {
  const { notifications_day, auto_hour } = req.body || {};
  const file = path.join(DATA_DIR, "config.json");
  const cur = await readJSON(file, { notifications_day: 7, auto_hour: "09:00" });
  const lastDay = new Date().getDate();
  const day = Math.min(31, Math.max(1, Number(notifications_day || cur.notifications_day || 7)));
  const hour = (auto_hour || cur.auto_hour || "09:00").trim();
  await writeJSON(file, { notifications_day: day, auto_hour: hour });
  res.json({ ok: true, notifications_day: day, auto_hour: hour });
});

// ====== Alumnos ======
app.post("/api/students/sync", async (req, res) => {
  const arr = Array.isArray(req.body) ? req.body : [];
  const cleaned = arr.map(s => ({
    dni: String(s.dni || "").trim(),
    first_name: String(s.first_name || "").trim(),
    last_name: String(s.last_name || "").trim(),
    phone: String(s.phone || "").trim(),
  })).filter(s => s.dni);
  await writeJSON(path.join(DATA_DIR, "students.json"), cleaned);
  res.json({ ok: true, count: cleaned.length });
});

app.get("/api/students", async (req, res) => {
  const students = await readJSON(path.join(DATA_DIR, "students.json"), []);
  res.json(students);
});

// ====== Logs ======
app.get("/api/logs/:period", async (req, res) => {
  const period = req.params.period || periodKey();
  const file = path.join(LOGS_DIR, `${period}.json`);
  const logs = await readJSON(file, { sent: {}, results: [] });
  res.json(logs);
});

// ====== Envío individual desde el front (template) ======
app.post("/api/whatsapp/send-template", async (req, res) => {
  try {
    const raw = (req.body?.to || "").toString();
    const to = normalizePhoneAR(raw);
    const name = (req.body?.name || "hello_world").toString();
    const lang = (req.body?.lang || "en_US").toString();
    const params = Array.isArray(req.body?.params) ? req.body.params : [];

    if (!to) return res.status(400).json({ error: "Teléfono destino inválido" });

    const data = await sendTemplate(to, name, lang, params);
    return res.json({ ok: true, data });
  } catch (e) {
    return res.status(400).json({ error: e.message || "Error enviando template" });
  }
});

// ====== Envío batch desde el backend ======
app.post("/api/whatsapp/send-batch", async (req, res) => {
  try {
    const { period = periodKey(), template = "hello_world", lang = "en_US" } = req.body || {};
    const cfg = await readJSON(path.join(DATA_DIR, "config.json"), { notifications_day: 7, auto_hour: "09:00" });
    const students = await readJSON(path.join(DATA_DIR, "students.json"), []);
    const logFile = path.join(LOGS_DIR, `${period}.json`);
    const logs = await readJSON(logFile, { sent: {}, results: [] });

    let ok = 0, fails = 0;
    for (const s of students) {
      const key = s.dni;
      if (logs.sent[key]) continue; // ya enviado este período
      const to = normalizePhoneAR(s.phone);
      if (!to) {
        logs.results.push({ dni: s.dni, phone: s.phone, status: "failed", reason: "Teléfono inválido", ts: new Date().toISOString() });
        continue;
      }
      try {
        await sendTemplate(to, template, lang, []); // cambia a tu plantilla real cuando esté aprobada
        logs.sent[key] = true;
        logs.results.push({ dni: s.dni, phone: to, status: "sent", ts: new Date().toISOString(), mode: "manual" });
        ok++;
        await new Promise(r => setTimeout(r, 350)); // anti-throttling
      } catch (e) {
        logs.results.push({ dni: s.dni, phone: to, status: "failed", reason: e.message, ts: new Date().toISOString(), mode: "manual" });
        fails++;
      }
    }

    await writeJSON(logFile, logs);
    res.json({ ok: true, period, sent: ok, failed: fails });
  } catch (e) {
    res.status(400).json({ error: e.message || "Error en batch" });
  }
});

// ====== Webhooks (opcional) ======
app.get("/api/whatsapp/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});
app.post("/api/whatsapp/webhook", (req, res) => {
  console.log("Webhook:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// ====== Cron: auto-envío el día/hora configurados ======
let lastRunKey = "";
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const cfg = await readJSON(path.join(DATA_DIR, "config.json"), { notifications_day: 7, auto_hour: "09:00" });
    const [hStr, mStr] = String(cfg.auto_hour || "09:00").split(":");
    const H = Number(hStr || 9), M = Number(mStr || 0);

    // Día objetivo (ajusta a fin de mes)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(Math.max(1, Number(cfg.notifications_day || 7)), lastDay);
    if (now.getDate() !== targetDay) return;

    // Hora exacta
    if (now.getHours() !== H || now.getMinutes() !== M) return;

    // Evitar doble ejecución en el mismo minuto
    const runKey = `${periodKey(now)}_${H}:${M}`;
    if (lastRunKey === runKey) return;
    lastRunKey = runKey;

    // Enviar pendientes de este período
    const period = periodKey(now);
    const logFile = path.join(LOGS_DIR, `${period}.json`);
    const logs = await readJSON(logFile, { sent: {}, results: [] });
    const students = await readJSON(path.join(DATA_DIR, "students.json"), []);

    let ok = 0, fails = 0;
    for (const s of students) {
      const key = s.dni;
      if (logs.sent[key]) continue;
      const to = normalizePhoneAR(s.phone);
      if (!to) {
        logs.results.push({ dni: s.dni, phone: s.phone, status: "failed", reason: "Teléfono inválido (auto)", ts: new Date().toISOString(), mode: "auto" });
        continue;
      }
      try {
        await sendTemplate(to, "hello_world", "en_US", []); // TODO: cambiar a tu plantilla real
        logs.sent[key] = true;
        logs.results.push({ dni: s.dni, phone: to, status: "sent", ts: new Date().toISOString(), mode: "auto" });
        ok++;
        await new Promise(r => setTimeout(r, 350));
      } catch (e) {
        logs.results.push({ dni: s.dni, phone: to, status: "failed", reason: e.message, ts: new Date().toISOString(), mode: "auto" });
        fails++;
      }
    }
    await writeJSON(logFile, logs);
    console.log(`🕘 Auto-envío ${period}: sent=${ok}, failed=${fails}`);
  } catch (e) {
    console.error("CRON error:", e.message);
  }
});

app.listen(PORT, () => {
  console.log(`✅ WhatsApp API escuchando en http://localhost:${PORT}`);
});
