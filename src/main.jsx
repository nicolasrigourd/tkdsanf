import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { unlockAudio } from "./utils/sound";
unlockAudio();

// --- PWA update banner ---
import { registerSW } from "virtual:pwa-register";

const updateSW = registerSW({
  onNeedRefresh() {
    // Aviso simple; si querés un banner custom, armamos un componente
    const ok = confirm("Hay una actualización disponible. ¿Actualizar ahora?");
    if (ok) updateSW(true);
  },
  onOfflineReady() {
    console.log("PWA lista para trabajar offline.");
  },
});

// --- Semilla de sesión demo (solo para desarrollo)
const demoUser = { username: "mauricio", password: "1234", role: "admin" };
if (!localStorage.getItem("userTk")) {
  localStorage.setItem("userTk", JSON.stringify(demoUser));
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
