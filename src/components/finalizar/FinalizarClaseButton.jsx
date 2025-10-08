import React, { useState } from "react";
import ConfirmModal from "../confirm/ConfirmModal";
import { dismissAllAttendancesToday } from "../../db/indexedDB";
import "./FinalizarClaseButton.css";

export default function FinalizarClaseButton({
  className = "btn-finish",
  onAfterFinish,         // callback opcional para refrescar lista / mostrar mensaje
  confirmTitle = "Finalizar clase",
  confirmMessage = "Se eliminarán de la lista todos los presentes de hoy (las asistencias se mantendrán registradas). ¿Querés continuar?",
  confirmText = "Sí, finalizar",
  cancelText = "Cancelar",
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openModal = () => setOpen(true);
  const closeModal = () => { if (!busy) setOpen(false); };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const count = await dismissAllAttendancesToday(); // oculta todos los visibles de HOY
      onAfterFinish && onAfterFinish(count);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={openModal} disabled={busy}>
        {busy ? "Finalizando..." : "Finalizar clase"}
      </button>

      <ConfirmModal
        open={open}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmText}
        cancelText={cancelText}
        onConfirm={handleConfirm}
        onCancel={closeModal}
      />
    </>
  );
}
