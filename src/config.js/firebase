import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore"; // Importación de Firestore

// Las claves deben ser cargadas desde variables de entorno en producción (Vercel)
const firebaseConfig = {
  // NOTA: Reemplaza estos valores por process.env.NEXT_PUBLIC_... en tu código fuente
  apiKey: "AIzaSyDSdpnWJiIHqY9TaruFIMBsBuWtm-WsRkI", 
  authDomain: "distrifort.firebaseapp.com",
  projectId: "distrifort",
  storageBucket: "distrifort.firebasestorage.app",
  messagingSenderId: "456742367607",
  appId: "1:456742367607:web:25341e7e3126fd7c04f172",
  measurementId: "G-F62DMRC8NZ"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app); // Inicializar Firestore

// Exportar la instancia de la Base de Datos
export { db };
