import React, { useState, useEffect } from "react";
import "./IngrSocios.css";

export default function IngrSocios({ onSubmit }) {
  const [dni, setDni] = useState("");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const value = dni.trim();
    if (!value) return;
    onSubmit?.(value);
    setDni("");
  };

  const fecha = now.toLocaleDateString("es-AR", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const hora = now.toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <section className="ingr-compact">
      {/* Fila 1: fecha a la izquierda, hora a la derecha */}
      <div className="ingr-head">
        <span className="ingr-fecha" title={fecha}>{fecha}</span>
        <span className="ingr-hora" aria-label="Hora actual">{hora}</span>
      </div>

      {/* Fila 2: input + botón, alineados en una sola línea */}
      <form className="ingr-form-compact" onSubmit={handleSubmit}>
        <input
          id="dni-input"
          type="text"
          inputMode="numeric"
          className="ingr-input-compact"
          placeholder="DNI (ej. 12345678)"
          value={dni}
          onChange={(e) => setDni(e.target.value)}
          aria-label="Número de DNI"
        />
        <button type="submit" className="ingr-btn-compact">Ingresar</button>
      </form>
    </section>
  );
}
