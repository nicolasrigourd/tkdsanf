import React, { useState } from "react";
import ConfirmModal from "../confirm/ConfirmModal";
import {
  dismissAttendancesTodayByClass,
  dismissAllAttendancesToday,           // por si algún día volvés a “todas”
  countAttendancesTodayByClass,         // 👈 NUEVO: conteo real
} from "../../db/indexedDB";
import "./FinalizarClaseButton.css";

/**
 * Props:
 *  - currentClassId: string | null   (clase activa; si es null, el botón queda deshabilitado)
 *  - onAfterFinish?: (count: number) => void
 *  - confirmTitle?: string
 *  - confirmText?: string
 *  - cancelText?: string
 */
export default function FinalizarClaseButton({
  currentClassId = null,
  className = "btn-finish",
  onAfterFinish,
  confirmTitle = "Finalizar clase",
  confirmText = "Sí, finalizar",
  cancelText = "Cancelar",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewCount, setPreviewCount] = useState(null); // cuántos se van a ocultar
  const [message, setMessage] = useState(
    "Se eliminarán de la lista todos los presentes de esta clase (las asistencias se mantendrán registradas). ¿Querés continuar?"
  );

  const openModal = async () => {
    if (disabled || !currentClassId) return;
    setBusy(true);
    try {
      // Conteo real de presentes visibles en la clase activa
      const n = await countAttendancesTodayByClass(currentClassId);
      setPreviewCount(n);

      if (n > 0) {
        setMessage(
          `Se eliminarán de la lista ${n} presente${n === 1 ? "" : "s"} de esta clase. ` +
          `Las asistencias se mantendrán registradas. ¿Querés continuar?`
        );
      } else {
        setMessage(
          "No hay presentes visibles para esta clase en este momento."
        );
      }

      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const closeModal = () => {
    if (!busy) setOpen(false);
  };

  const handleConfirm = async () => {
    // Si no hay nada para ocultar, cerramos sin hacer nada
    if (!currentClassId || (previewCount !== null && previewCount === 0)) {
      setOpen(false);
      return;
    }

    setBusy(true);
    try {
      const count = await dismissAttendancesTodayByClass(currentClassId);
      onAfterFinish && onAfterFinish(count);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const isDisabled = disabled || !currentClassId || busy;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={openModal}
        disabled={isDisabled}
        title={currentClassId ? "Finalizar la clase activa" : "Seleccioná una clase"}
      >
        {busy ? "Finalizando..." : "Finalizar clase"}
      </button>

      <ConfirmModal
        open={open}
        title={confirmTitle}
        message={message}
        confirmText={previewCount === 0 ? "Cerrar" : confirmText}
        cancelText={previewCount === 0 ? "" : cancelText}
        onConfirm={handleConfirm}
        onCancel={closeModal}
      />
    </>
  );
}
