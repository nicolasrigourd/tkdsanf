import React, { useEffect, useMemo, useState } from "react";
import "./Notificaciones.css";
import Navbar from "../../components/navbar/Navbar";
import Footer from "../../components/footer/Footer";
import { db, getAppConfig, saveAppConfig } from "../../db/indexedDB";

/* ===================== Utils front ===================== */
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

function periodKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Bitácora liviana en localStorage por período (YYYY-MM)
function loadLog(pk = periodKey()) {
  try {
    return JSON.parse(localStorage.getItem(`notify_log_${pk}`) || "{}");
  } catch {
    return {};
  }
}
function saveLog(log, pk = periodKey()) {
  localStorage.setItem(`notify_log_${pk}`, JSON.stringify(log));
}

// Normaliza teléfonos AR a E.164 sin '+'
function normalizePhoneAR(raw) {
  if (!raw) return "";
  let s = String(raw).replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^0+/, "").replace(/^15/, "");
  if (!s.startsWith("54")) s = "54" + s;
  if (!s.startsWith("549")) s = "549" + s.slice(2);
  return s;
}

function isTodaySendDay(day) {
  const now = new Date();
  const d = now.getDate();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const target = Math.min(Math.max(1, Number(day || 1)), last);
  return d === target;
}

/* ===================== API helpers ===================== */
async function backendSaveConfig(day, autoHour = "09:00") {
  const r = await fetch(`${API_BASE}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notifications_day: Number(day), auto_hour: autoHour }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "No se pudo guardar config backend");
  return data;
}

async function syncStudentsToBackend(students) {
  const payload = students.map((s) => ({
    dni: s.dni,
    first_name: s.first_name,
    last_name: s.last_name,
    phone: s.phone,
  }));
  const r = await fetch(`${API_BASE}/api/students/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "No se pudo sincronizar alumnos");
  return data;
}

async function fetchLogs(period) {
  const r = await fetch(`${API_BASE}/api/logs/${period}`);
  return r.json(); // { sent: {dni:true}, results: [{dni, status, reason?, ts}] }
}

async function sendTemplateHello(to) {
  const r = await fetch(`${API_BASE}/api/whatsapp/send-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, name: "hello_world", lang: "en_US", params: [] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.error?.message || "Fallo envío template");
  return data;
}

async function triggerBatch(template = "hello_world", lang = "en_US", period = periodKey()) {
  const r = await fetch(`${API_BASE}/api/whatsapp/send-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template, lang, period }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error || "Fallo batch backend");
  return data;
}

/* ===================== Página ===================== */
export default function Notificaciones() {
  const [cfg, setCfg] = useState(null);
  const [students, setStudents] = useState([]);
  const [day, setDay] = useState(7);
  const [q, setQ] = useState("");
  const [log, setLog] = useState({});
  const [reasons, setReasons] = useState({});
  const [pk, setPk] = useState(periodKey());
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Cargar config + alumnos + log de periodo actual + logs backend
  useEffect(() => {
    (async () => {
      const c = await getAppConfig();
      setCfg(c);
      setDay(Number(c?.notifications_day || 7));

      const all = await db.students.orderBy("last_name").toArray();
      setStudents(all);

      const currentPk = periodKey();
      setPk(currentPk);
      setLog(loadLog(currentPk));

      // Logs del backend
      try {
        const logs = await fetchLogs(currentPk);
        const sentDict = logs?.sent || {};
        const rs = {};
        (logs?.results || []).forEach((r) => {
          if (r.status === "failed") rs[r.dni] = r.reason || "Fallo desconocido";
        });
        const merged = { ...loadLog(currentPk), ...sentDict };
        setLog(merged);
        setReasons(rs);
      } catch (e) {
        // si aún no hay logs, no pasa nada
      }
    })();
  }, []);

  // Derivados
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = students;
    if (!term) return base;
    return base.filter((s) => {
      const full = `${s.last_name || ""} ${s.first_name || ""}`.toLowerCase();
      return (s.dni || "").includes(term) || full.includes(term);
    });
  }, [students, q]);

  const stats = useMemo(() => {
    const total = students.length;
    const sent = Object.values(log).filter(Boolean).length;
    return { total, sent, pending: Math.max(0, total - sent) };
  }, [students, log]);

  // Acciones
  const saveDay = async (e) => {
    e?.preventDefault?.();
    setSaving(true);
    try {
      const val = Math.max(1, Math.min(31, Number(day) || 7));
      await saveAppConfig({ notifications_day: val });
      await backendSaveConfig(val, "09:00");
      setDay(val);
      alert(
        "✅ Día guardado (frontend y backend). El backend enviará automático ese día a las 09:00."
      );
    } catch (err) {
      alert(`❌ No se pudo guardar: ${err?.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const markSentLocal = (dni) => {
    const next = { ...log, [dni]: true };
    setLog(next);
    saveLog(next, pk);
  };
  const undoSentLocal = (dni) => {
    const next = { ...log };
    delete next[dni];
    setLog(next);
    saveLog(next, pk);
  };

  const markAllSim = () => {
    if (!confirm(`Marcar como "Enviado" a ${filtered.length} alumnos visibles?`)) return;
    const next = { ...log };
    filtered.forEach((s) => {
      next[s.dni] = true;
    });
    setLog(next);
    saveLog(next, pk);
  };

  const changePeriod = async (delta) => {
    const [y, m] = pk.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newPk = periodKey(d);
    setPk(newPk);
    setLog(loadLog(newPk));
    try {
      const logs = await fetchLogs(newPk);
      const sentDict = logs?.sent || {};
      const rs = {};
      (logs?.results || []).forEach((r) => {
        if (r.status === "failed") rs[r.dni] = r.reason || "Fallo desconocido";
      });
      const merged = { ...loadLog(newPk), ...sentDict };
      setLog(merged);
      setReasons(rs);
    } catch {
      // sin logs, no pasa nada
    }
  };

  const sendTestToStudent = async (student) => {
    try {
      setSending(true);
      const to = normalizePhoneAR(student.phone);
      if (!to) throw new Error("El alumno no tiene teléfono válido");
      await sendTemplateHello(to);
      markSentLocal(student.dni);
    } catch (err) {
      alert(
        `❌ No se pudo enviar a ${student.first_name || ""} ${
          student.last_name || ""
        }: ${err.message}`
      );
    } finally {
      setSending(false);
    }
  };

  const sendPendingBulkFront = async () => {
    if (!confirm(`¿Enviar (hello_world) a ${filtered.length} alumnos visibles?`)) return;
    setSending(true);
    let ok = 0,
      fails = 0;
    for (const s of filtered) {
      if (log[s.dni]) continue;
      try {
        const to = normalizePhoneAR(s.phone);
        if (!to) throw new Error("Teléfono inválido");
        await sendTemplateHello(to);
        markSentLocal(s.dni);
        ok++;
        await new Promise((r) => setTimeout(r, 350));
      } catch (e) {
        fails++;
      }
    }
    setSending(false);
    alert(`✅ Finalizado. Enviados: ${ok}. Fallidos: ${fails}.`);
  };

  const sendBatchFromBackend = async () => {
    if (!confirm("¿Enviar a TODOS los alumnos sincronizados (desde el backend)?")) return;
    try {
      setSending(true);
      const resp = await triggerBatch("hello_world", "en_US", pk);
      alert(`Batch backend → enviados: ${resp.sent}, fallidos: ${resp.failed}`);
      const logs = await fetchLogs(pk);
      const sentDict = logs?.sent || {};
      const rs = {};
      (logs?.results || []).forEach((r) => {
        if (r.status === "failed") rs[r.dni] = r.reason || "Fallo desconocido";
      });
      const merged = { ...loadLog(pk), ...sentDict };
      setLog(merged);
      setReasons(rs);
    } catch (e) {
      alert(`❌ ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleSyncStudents = async () => {
    try {
      const res = await syncStudentsToBackend(students);
      alert(`✅ Sincronizados ${res.count} alumnos al backend`);
    } catch (e) {
      alert(`❌ ${e.message}`);
    }
  };

  const todayIsSendDay = isTodaySendDay(day);

  return (
    <div className="notif-page">
      <Navbar />

      <main className="notif-content">
        <header className="notif-header">
          <h2>Notificaciones por WhatsApp</h2>
          <div className="notif-summary">
            <span>
              <b>Período:</b> {pk}
            </span>
            <span>
              <b>Total:</b> {stats.total}
            </span>
            <span className="notif-ok">
              <b>Enviados:</b> {stats.sent}
            </span>
            <span className="notif-warn">
              <b>Pendientes:</b> {stats.pending}
            </span>
          </div>
        </header>

        {todayIsSendDay && (
          <div className="notif-banner-sendday">
            📅 Hoy es el día configurado ({day}). El backend enviará automáticamente a las{" "}
            <b>09:00</b>.
          </div>
        )}

        {/* Config del día fijo */}
        <section className="notif-card">
          <form className="notif-row" onSubmit={saveDay}>
            <label className="notif-label">
              Día fijo del mes para enviar recordatorios
              <input
                type="number"
                min="1"
                max="31"
                value={day}
                onChange={(e) => setDay(e.target.value)}
                title="Día entre 1 y 31"
                className="notif-input-number"
              />
            </label>
            <button
              className="notif-btn notif-btn-primary"
              disabled={saving}
              type="submit"
            >
              Guardar
            </button>

            <div className="notif-period-nav">
              <button
                type="button"
                className="notif-btn notif-btn-ghost"
                onClick={() => changePeriod(-1)}
              >
                ⟵ Mes anterior
              </button>
              <button
                type="button"
                className="notif-btn notif-btn-ghost"
                onClick={() => {
                  const c = periodKey();
                  setPk(c);
                  setLog(loadLog(c));
                }}
              >
                Mes actual
              </button>
              <button
                type="button"
                className="notif-btn notif-btn-ghost"
                onClick={() => changePeriod(1)}
              >
                Mes siguiente ⟶
              </button>
            </div>
          </form>
          <p className="notif-hint">
            El día se guarda en el backend para el envío automático (cron) y en tu app
            para mostrar la UI.
          </p>
        </section>

        {/* Herramientas */}
        <section className="notif-tools">
          <input
            className="notif-search-input"
            placeholder="Buscar por DNI, nombre o apellido…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="notif-tool-actions">
            <button
              className="notif-btn notif-btn-ghost"
              onClick={handleSyncStudents}
              type="button"
            >
              🔄 Sincronizar alumnos (backend)
            </button>
            <button
              className="notif-btn notif-btn-secondary"
              onClick={sendBatchFromBackend}
              disabled={sending}
              type="button"
            >
              🚀 Enviar desde backend (batch)
            </button>
            <button
              className="notif-btn notif-btn-ghost"
              onClick={sendPendingBulkFront}
              disabled={sending || filtered.length === 0}
              type="button"
            >
              💬 Enviar visibles (front/API)
            </button>
            <button
              className="notif-btn notif-btn-ghost"
              onClick={markAllSim}
              title="Solo cambia el estado visual del período actual"
              type="button"
            >
              ✔️ Marcar visibles como enviados (simulado)
            </button>
          </div>
        </section>

        {/* Tabla */}
        <section className="notif-table-wrap">
          {filtered.length === 0 ? (
            <div className="notif-empty">No hay alumnos para mostrar.</div>
          ) : (
            <table className="notif-table">
              <thead>
                <tr>
                  <th style={{ width: "120px" }}>DNI</th>
                  <th>Apellido, Nombre</th>
                  <th style={{ width: "160px" }}>Teléfono</th>
                  <th style={{ width: "140px" }}>Estado</th>
                  <th style={{ width: "220px" }}>Acciones</th>
                  <th style={{ width: "240px" }}>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const sent = !!log[s.dni];
                  const phone = (s.phone || "").trim();
                  const fullName = `${s.last_name || ""}, ${s.first_name || ""}`;
                  return (
                    <tr key={s.dni}>
                      <td>{s.dni}</td>
                      <td>{fullName}</td>
                      <td>{phone || "—"}</td>
                      <td>
                        <span
                          className={`notif-badge ${
                            sent ? "notif-badge-green" : "notif-badge-gray"
                          }`}
                        >
                          {sent ? "ENVIADO" : "PENDIENTE"}
                        </span>
                      </td>
                      <td className="notif-row-actions">
                        <button
                          className="notif-btn notif-btn-whats"
                          disabled={sending || !phone}
                          title="Enviar template hello_world (prueba API)"
                          type="button"
                          onClick={() => sendTestToStudent(s)}
                        >
                          💬 Enviar prueba
                        </button>
                        {sent ? (
                          <button
                            className="notif-link notif-link-danger"
                            onClick={() => undoSentLocal(s.dni)}
                            type="button"
                          >
                            Deshacer
                          </button>
                        ) : (
                          <button
                            className="notif-link"
                            onClick={() => markSentLocal(s.dni)}
                            type="button"
                          >
                            Marcar enviado
                          </button>
                        )}
                      </td>
                      <td>{reasons[s.dni] || (sent ? "OK" : "—")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
