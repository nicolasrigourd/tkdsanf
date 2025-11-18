import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "./BackupsModal.css";
import { listBackups, restoreBackupToLocal, getTenantQuota } from "../../utils/backups";

function getMillis(v) {
  // Firestore Timestamp
  if (v && typeof v.toMillis === "function") {
    try { return v.toMillis(); } catch { /* noop */ }
  }
  // Posible objeto {seconds, nanoseconds}
  if (v && typeof v === "object" && typeof v.seconds === "number") {
    return Math.floor(v.seconds * 1000);
  }
  // Número (ms)
  if (typeof v === "number") return v;
  // String/Date parseable
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? 0 : ms;
}

export default function BackupsModal({ open, onClose, onRestored }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [quota, setQuota] = useState(null);
  const [confirmId, setConfirmId] = useState(null);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (confirmId) setConfirmId(null);
        else onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, confirmId, onClose]);

  // Cargar lista + cuota
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const qs = await getTenantQuota().catch(() => null);
        let list = await listBackups({ take: 50 });
        list = (list || []).sort((a, b) => {
          const ta = getMillis(a.createdAt || 0);
          const tb = getMillis(b.createdAt || 0);
          return tb - ta;
        });
        setQuota(qs);
        setItems(list);
      } catch (e) {
        alert(`No se pudieron cargar las copias: ${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [open]);

  const used = useMemo(() => Number(quota?.backupsUsed ?? 0), [quota]);
  const limit = useMemo(() => Number(quota?.backupsLimit ?? 0), [quota]);
  const left = useMemo(() => Number(quota?.backupsLeft ?? 0), [quota]);

  if (!open) return null;

  const content = (
    <div
      className="bk-modal-backdrop"
      onClick={() => {
        if (confirmId) setConfirmId(null);
        else onClose?.();
      }}
    >
      <div
        className="bk-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bk-title"
      >
        <header className="bk-header">
          <h3 id="bk-title">Restaurar base de datos · Copias en la nube</h3>
          <button className="bk-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </header>

        {quota && (
          <div className="bk-quota">
            <span>Cupo: <b>{used}</b>/<b>{limit}</b></span>
            <span className={`pill ${left > 0 ? "ok" : "warn"}`}>
              {left > 0 ? `Disponibles: ${left}` : "Sin cupo"}
            </span>
          </div>
        )}

        <div className="bk-body">
          {loading ? (
            <div className="bk-empty">Cargando copias…</div>
          ) : items.length === 0 ? (
            <div className="bk-empty">No hay copias disponibles.</div>
          ) : (
            <ul className="bk-list">
              {items.map((it) => (
                <li key={it.id} className="bk-item">
                  <div className="bk-item-main">
                    <div className="bk-item-title">Backup #{it.id?.slice(0, 6) || "—"}</div>
                    <div className="bk-item-sub">
                      <span>
                        {new Date(getMillis(it.createdAt) || Date.now()).toLocaleString("es-AR")}
                      </span>
                      <span>Partes: {it.parts ?? "—"}</span>
                      <span>Versión DB: {it.dbVersion ?? "—"}</span>
                      {it.note ? <span className="note">Nota: {it.note}</span> : null}
                    </div>
                  </div>

                  {confirmId === it.id ? (
                    <div className="bk-confirm">
                      <span>¿Restaurar esta copia? Se sobreescribirá la base local.</span>
                      <div className="bk-confirm-actions">
                        <button
                          className="btn danger"
                          onClick={async () => {
                            try {
                              await restoreBackupToLocal(it.id);
                              setConfirmId(null);
                              alert("✅ Restauración completa.");
                              onRestored?.();
                              onClose?.();
                            } catch (e) {
                              alert(`❌ Error al restaurar: ${e?.message || e}`);
                            }
                          }}
                        >
                          Sí, restaurar
                        </button>
                        <button className="btn ghost" onClick={() => setConfirmId(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bk-actions">
                      <button className="btn secondary" onClick={() => setConfirmId(it.id)}>
                        Restaurar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
