import React, { useState, useEffect, useRef } from "react";
import "./IngrSocios.css";

export default function IngrSocios({ onSubmit }) {
  const [dni, setDni] = useState("");
  const [now, setNow] = useState(new Date());

  const inputRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const INACTIVITY_MS = 5000; // 5 segundos

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Focus inicial al montar
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Manejo de inactividad: a los 5s vuelve el foco al input
  useEffect(() => {
    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, INACTIVITY_MS);
    };

    const handleActivity = () => {
      resetInactivityTimer();
    };

    // Registramos actividad global (dentro de la página)
    window.addEventListener("click", handleActivity);
    window.addEventListener("keydown", handleActivity);
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("touchstart", handleActivity);

    // Arrancamos el timer al montar
    resetInactivityTimer();

    return () => {
      window.removeEventListener("click", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const value = dni.trim();
    if (!value) return;
    onSubmit?.(value);
    setDni("");
    // Después de enviar, volvemos a enfocar el input para el próximo DNI
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const fecha = now.toLocaleDateString("es-AR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hora = now.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <section className="ingr-compact">
      {/* Fila 1: fecha a la izquierda, hora a la derecha */}
      <div className="ingr-head">
        <span className="ingr-fecha" title={fecha}>
          {fecha}
        </span>
        <span className="ingr-hora" aria-label="Hora actual">
          {hora}
        </span>
      </div>

      {/* Fila 2: input + botón, alineados en una sola línea */}
      <form className="ingr-form-compact" onSubmit={handleSubmit}>
        <input
          id="dni-input"
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className="ingr-input-compact"
          placeholder="DNI (ej. 12345678)"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          aria-label="Número de DNI"
        />
        <button type="submit" className="ingr-btn-compact">
          Ingresar
        </button>
      </form>
    </section>
  );
}
