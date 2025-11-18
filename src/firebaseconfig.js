// /firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔐 Configuración del proyecto Firebase (tus credenciales)
const firebaseConfig = {
  apiKey: "AIzaSyB4NuI3_inOQDLQ_SKcFYjKVHQRVTK_Nek",
  authDomain: "tkd-control.firebaseapp.com",
  projectId: "tkd-control",
  storageBucket: "tkd-control.firebasestorage.app",
  messagingSenderId: "212877283011",
  appId: "1:212877283011:web:e7e9f1630e4b370daa9c76"
};

// 🚀 Inicializar Firebase (solo una vez)
export const app = initializeApp(firebaseConfig);

// 💾 Inicializar Firestore (base de datos principal)
export const firestore = getFirestore(app);
