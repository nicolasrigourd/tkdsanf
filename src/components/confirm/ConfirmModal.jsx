import React, { useEffect, useRef, useState, useCallback } from "react";
import "./ConfirmModal.css";

export default function ConfirmModal({
  open,
  title = "Confirmar",
  message = "¿Estás seguro?",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  onConfirm,
  onCancel,
}) {
  const cancelBtnRef = useRef(null);
  const confirmBtnRef = useRef(null);
  const [focusIndex, setFocusIndex] = useState(1); // 0=cancel, 1=confirm

  const handleKey = useCallback(
    (e) => {
      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (focusIndex === 0) onCancel?.();
        else onConfirm?.();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const nextIndex = focusIndex === 0 ? 1 : 0;
        setFocusIndex(nextIndex);
      }
    },
    [open, focusIndex, onCancel, onConfirm]
  );

  // Cuando cambia el índice de foco, actualiza el focus visual
  useEffect(() => {
    if (focusIndex === 0) cancelBtnRef.current?.focus();
    else confirmBtnRef.current?.focus();
  }, [focusIndex]);

  useEffect(() => {
    if (open) {
      setFocusIndex(1); // arranca en confirmar
      confirmBtnRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (!open) return null;

  return (
    <div className="cm-overlay">
      <div
        className="cm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cm-title"
      >
        <h3 id="cm-title" className="cm-title">
          {title}
        </h3>

        <p className="cm-message">{message}</p>

        <div className="cm-actions">
          {cancelText && (
            <button
              ref={cancelBtnRef}
              className="cm-btn cm-cancel"
              onClick={onCancel}
              type="button"
            >
              {cancelText}
            </button>
          )}

          <button
            ref={confirmBtnRef}
            className="cm-btn cm-confirm"
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
