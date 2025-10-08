import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";
import logo from "../../assets/tkd-sanf.jpg";
import ConfirmModal from "../confirm/ConfirmModal";

export default function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);          // menú mobile
  const [profileOpen, setProfileOpen] = useState(false); // dropdown perfil
  const [logoutOpen, setLogoutOpen] = useState(false);   // modal confirm logout
  const profileRef = useRef(null);

  // Traer usuario desde la sesión
  let username = "Usuario";
  try {
    const raw = localStorage.getItem("tkd_session");
    if (raw) {
      const s = JSON.parse(raw);
      username = s?.user?.username || username;
    }
  } catch {}

  const isActive = (path) =>
    pathname === path ? "navbar-link active" : "navbar-link";

  const toggleMenu = () => setOpen((p) => !p);
  const closeMenu = () => setOpen(false);

  const toggleProfile = () => setProfileOpen((p) => !p);
  const closeProfile = () => setProfileOpen(false);

  // Cerrar dropdown al hacer click afuera
  useEffect(() => {
    const onClickOutside = (e) => {
      if (!profileRef.current) return;
      if (!profileRef.current.contains(e.target)) closeProfile();
    };
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, []);

  const handleLogoutConfirmed = () => {
    localStorage.removeItem("tkd_session");
    navigate("/login");
  };

  const handleChangePassword = () => {
    // Placeholder: navegá a una página de perfil/cambio de contraseña cuando la tengas
    // navigate("/perfil"); 
    alert("Función de cambiar contraseña (pendiente de implementar).");
    closeProfile();
  };

  return (
    <header className="navbar">
      <div className="navbar-row">
        {/* Izquierda: Logo + Brand */}
        <div className="navbar-left">
          <img src={logo} alt="TKD Admin" className="navbar-logo" />
          <span className="navbar-brand">TKD Santiago del Estero</span>
        </div>

        {/* Centro: Links (visible en desktop) */}
        <nav className="navbar-center">
          <Link to="/" className={isActive("/")} onClick={closeMenu}>Home</Link>
          <Link to="/alumnos" className={isActive("/alumnos")} onClick={closeMenu}>Socios</Link>
          <Link to="/productos" className={isActive("/productos")} onClick={closeMenu}>Productos</Link>
          <Link to="/config" className={isActive("/config")} onClick={closeMenu}>Configuración</Link>
        </nav>

        {/* Derecha: Burger + Notificaciones + Perfil/Logout */}
        <div className="navbar-right" ref={profileRef}>
          {/* Botón hamburguesa (solo mobile) */}
          <button
            className={`navbar-burger ${open ? "is-open" : ""}`}
            onClick={toggleMenu}
            aria-label="Abrir menú"
            aria-expanded={open}
            aria-controls="navbar-mobile"
          >
            <span />
            <span />
            <span />
          </button>

          {/* Campanita de notificaciones */}
          <button className="navbar-bell" title="Notificaciones" aria-label="Notificaciones">
            {/* Pequeño ícono SVG de campana */}
            <svg viewBox="0 0 24 24" className="bell-icon" aria-hidden="true">
              <path d="M12 2a6 6 0 00-6 6v2.586l-1.293 1.293A1 1 0 005 14h14a1 1 0 00.707-1.707L18.414 10.586V8a6 6 0 00-6-6zm0 20a3 3 0 002.995-2.824L15 19h-6a3 3 0 002.824 2.995L12 22z"/>
            </svg>
            {/* Indicador (opcional) */}
            {/* <span className="bell-dot" /> */}
          </button>

          {/* Perfil con dropdown */}
          <button
            className={`navbar-profile ${profileOpen ? "open" : ""}`}
            onClick={toggleProfile}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            title="Opciones de perfil"
          >
            <span className="avatar" aria-hidden="true">👤</span>
            <span className="logout-text">{username}</span>
          </button>

          {profileOpen && (
            <div className="profile-menu" role="menu">
              <div className="profile-head">
                <div className="profile-avatar">👤</div>
                <div className="profile-user">
                  <div className="profile-name">{username}</div>
                  <div className="profile-role">Administrador</div>
                </div>
              </div>
              <button className="profile-item" onClick={handleChangePassword} role="menuitem">
                Cambiar contraseña
              </button>
              <button
                className="profile-item danger"
                onClick={() => setLogoutOpen(true)}
                role="menuitem"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Menú colapsable en mobile */}
      <nav id="navbar-mobile" className={`navbar-mobile ${open ? "open" : ""}`} onClick={closeMenu}>
        <Link to="/" className={isActive("/")}>Home</Link>
        <Link to="/alumnos" className={isActive("/alumnos")}>Socios</Link>
        <Link to="/productos" className={isActive("/productos")}>Productos</Link>
        <Link to="/config" className={isActive("/config")}>Configuración</Link>
      </nav>

      {/* Modal confirmación logout */}
      <ConfirmModal
        open={logoutOpen}
        title="Cerrar sesión"
        message="¿Querés cerrar la sesión actual?"
        confirmText="Sí, cerrar"
        cancelText="Cancelar"
        onConfirm={handleLogoutConfirmed}
        onCancel={() => setLogoutOpen(false)}
      />
    </header>
  );
}
