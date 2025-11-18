const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export async function sendTemplateHello(to) {
  const resp = await fetch(`${API_BASE}/api/whatsapp/send-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, name: "hello_world", lang: "en_US", params: [] })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.error?.message || "Fallo envío template");
  return data;
}

export async function sendTemplateRecordatorio(to, params) {
  // A usar cuando tu plantilla real esté aprobada (p. ej. taekwondo_recordatorio)
  const resp = await fetch(`${API_BASE}/api/whatsapp/send-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, name: "taekwondo_recordatorio", lang: "es_AR", params })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.error?.message || "Fallo envío recordatorio");
  return data;
}

export async function sendText(to, body) {
  const resp = await fetch(`${API_BASE}/api/whatsapp/send-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.error?.message || "Fallo envío texto");
  return data;
}

export function normalizePhoneAR(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^0+/, "").replace(/^15/, "");
  if (!s.startsWith("54")) s = "54" + s;
  if (!s.startsWith("549")) s = "549" + s.slice(2);
  return s;
}
