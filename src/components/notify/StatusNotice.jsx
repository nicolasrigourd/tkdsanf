// src/components/notify/StatusNotice.jsx
import React, { useEffect } from "react";
import "./StatusNotice.css";
import { playSuccessLong, playWarningLong, playErrorLong } from "../../utils/sound";

/**
 * Props:
 *  - open: boolean
 *  - type: "green" | "yellow" | "red"
 *  - title: string
 *  - message: string
 *  - autoCloseMs?: number
 *  - onClose: () => void
 *  - onRenew?: () => void
 *  - onDefer?: () => void
 *  - enableSound?: boolean  (default true)
 */
export default function StatusNotice({
  open,
  type = "green",
  title,
  message,
  autoCloseMs = 7400, // un pelín más largo para acompañar el sonido largo
  onClose,
  onRenew,
  onDefer,
  enableSound = true,
}) {
  // Sonido largo por tipo cuando se abre
  useEffect(() => {
    if (!open || !enableSound) return;
    try {
      if (type === "green") playSuccessLong();
      else if (type === "yellow") playWarningLong();
      else if (type === "red") playErrorLong();
    } catch {}
  }, [open, type, enableSound]);

  // Autocierre (excepto rojo)
  useEffect(() => {
    if (!open) return;
    if (type === "red") return; // no autoclose para rojo
    const t = setTimeout(() => onClose?.(), autoCloseMs);
    return () => clearTimeout(t);
  }, [open, type, autoCloseMs, onClose]);

  if (!open) return null;

  return (
    <div className={`sn-wrap ${type}`}>
      <div className="sn-card" role="status" aria-live="polite">
        <div className="sn-head">
          <div className={`sn-dot ${type}`} aria-hidden="true" />
          <div className="sn-title">{title}</div>
          <button className="sn-close" onClick={onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="sn-msg">{message}</div>

        {type === "red" && (
          <div className="sn-actions">
            <button className="sn-btn primary" onClick={onRenew}>Renovar plan</button>
            <button className="sn-btn ghost" onClick={onDefer}>Solicitar prórroga</button>
          </div>
        )}
      </div>
    </div>
  );
}
