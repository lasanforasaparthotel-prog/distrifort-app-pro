// src/firebaseConfig.js
// Configuración e inicialización central de Firebase para DistriFort

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 🔐 Configuración del proyecto Firebase
// (versión corregida con el bucket correcto ".appspot.com")
const firebaseConfig = {
  apiKey: "AIzaSyDSdpnWJiIHqY9TaruFIMBsBuWtm-WsRkI",
  authDomain: "distrifort.firebaseapp.com",
  projectId: "distrifort",
  storageBucket: "distrifort.appspot.com", // ✅ corregido: .appspot.com
  messagingSenderId: "456742367607",
  appId: "1:456742367607:web:25341e7e3126fd7c04f172",
  measurementId: "G-F62DMRC8NZ"
};

// 🚀 Inicializar Firebase
const app = initializeApp(firebaseConfig);

// 💾 Inicializar Firestore (Base de Datos)
const db = getFirestore(app);

// 📤 Exportar la instancia para usar en toda la app
export { db };
