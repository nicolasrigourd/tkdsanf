import React, { useEffect } from "react";
import "./StatusModal.css";
import { playForType } from "../../utils/sound";

export default function StatusModal({
  open,
  type = "green", // "green" | "yellow" | "red"
  title,
  message,
  onClose,
  onRenew,
  autoCloseMs = 3000,
}) {
  // sonido
  useEffect(() => {
    if (open) playForType?.(type, { long: true });
  }, [open, type]);

  // autocierre solo verde/amarillo
  useEffect(() => {
    if (!open) return;
    if (type === "red") return;
    const t = setTimeout(() => onClose?.(), autoCloseMs);
    return () => clearTimeout(t);
  }, [open, type, autoCloseMs, onClose]);

  // cerrar con ESC (ahora también el rojo)
  useEffect(() => {
    if (!open) return;
    const handler = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const icon =
    type === "green" ? "✅" : type === "yellow" ? "⚠️" : "⛔";

  return (
    <div
      className={`smodal-backdrop ${type}`}
      onClick={onClose}
    >
      <div
        className={`smodal-card ${type}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Encabezado */}
        <div className="smodal-head">
          <span className={`smodal-dot ${type}`} aria-hidden />
          <div className="smodal-title">
            <span className="smodal-icon" aria-hidden>
              {icon}
            </span>
            <span className="smodal-title-text">{title}</span>
          </div>
          <button
            className="smodal-close"
            onClick={onClose}
            aria-label="Cerrar"
            type="button"
          >
            ×
          </button>
        </div>

        {/* Cuerpo */}
        <div className="smodal-body">
          <div className="smodal-msg">{message}</div>
        </div>

        {/* Solo para tipo rojo */}
        {type === "red" && (
          <div className="smodal-actions">
            <button
              className="btn smodal-renew"
              onClick={onRenew}
              type="button"
            >
              Renovar plan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
