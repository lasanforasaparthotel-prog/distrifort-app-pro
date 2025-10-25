import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getAuth, onAuthStateChanged, signOut, signInAnonymously, signInWithCustomToken
} from 'firebase/auth';
import {
    getFirestore, collection, doc, onSnapshot, setDoc,
    serverTimestamp, writeBatch, updateDoc, query, where, addDoc, getDocs
} from 'firebase/firestore';
import {
    LayoutDashboard, Package, Users, Tag, Truck, Search, Plus,
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save,
    FileText, List, ShoppingCart, Building, LogOut, AtSign, KeyRound, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer, Upload, Code, Image as ImageIcon
} from 'lucide-react';

// --- 1. CONFIGURACIÓN FIREBASE ---
const rawJsonConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : null;

let firebaseConfig = {};
let rawAppId = 'default-app-id';

// console.log("DEBUG: Iniciando script App.jsx");

try {
    if (rawJsonConfig) {
        // console.log("DEBUG: Configuración Firebase encontrada (__firebase_config).");
        firebaseConfig = JSON.parse(rawJsonConfig);
        rawAppId = firebaseConfig.appId || 'default-app-id';
    } else {
        console.error("Error: Configuración de Firebase no cargada. Verifique __firebase_config.");
    }
} catch (e) {
    console.error(`ERROR CRÍTICO: Fallo al parsear el JSON de Firebase. Detalle: ${e.message}`);
}

const appId = rawAppId.replace(/[/.]/g, '_');

// Inicializar Firebase solo si la configuración es válida
let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
    try {
        app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
        db = getFirestore(app);
        auth = getAuth(app);
        // console.log("DEBUG: Firebase inicializado correctamente.");
    } catch (error) {
        console.error("ERROR CRÍTICO: Fallo al inicializar Firebase:", error);
        app = undefined; db = undefined; auth = undefined;
    }
} else {
     console.error("ERROR CRÍTICO: Configuración de Firebase vacía. No se puede inicializar.");
     app = undefined; db = undefined; auth = undefined;
}


// --- 2. MODELOS DE DATOS (Ajustados a Firebase) ---
const PRODUCT_MODEL = { nombre: '', bodega: '', proveedorId: '', especie: '', varietal: '', costo: 0, precioUnidad: 0, precioCaja: 0, udsPorCaja: 6, stockTotal: 0, umbralMinimo: 10, archivado: false };
const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', Direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false, proveedorId: '' };
const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false, id: '' /* Campo id de Firebase */};
const PROVIDER_MODEL = { Nombre: '', Responsable: '', CUIT: '', Telefono: '', Email: '', Direccion: '', archivado: false };
const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

// --- DATOS DE PRUEBA (MOCK DATA) ---
const pricelistOct2025 = [
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Eco", "Nombre del Producto (Variedad)": "Agua Eco 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 6900.0 },
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Glaciar", "Nombre del Producto (Variedad)": "Agua Glaciar 1.5 L", "Presentacion": "1.5 L", "Precio por Unidad (ARS)": 9200.0 },
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Glaciar", "Nombre del Producto (Variedad)": "Agua Glaciar C/Gas 1.5 L", "Presentacion": "1.5 L", "Precio por Unidad (ARS)": 9200.0 },
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Villavicencio", "Nombre del Producto (Variedad)": "Agua Villavicencio 1.5 L", "Presentacion": "1.5 L", "Precio por Unidad (ARS)": 10353.0 },
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Villavicencio", "Nombre del Producto (Variedad)": "Agua Villavicencio 2 L", "Presentacion": "2 L", "Precio por Unidad (ARS)": 10920.0 },
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Villavicencio", "Nombre del Producto (Variedad)": "Agua Villavicencio 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 7995.0 },
    { "Tipo de Bebida": "Agua", "Bodega/Marca": "Villavicencio", "Nombre del Producto (Variedad)": "Agua Villavicencio C/Gas 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 7995.0 },
    { "Tipo de Bebida": "Aperitivo/Licor", "Bodega/Marca": "Branca", "Nombre del Producto (Variedad)": "Fernet Branca 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 11900.0 },
    { "Tipo de Bebida": "Aperitivo/Licor", "Bodega/Marca": "Campari", "Nombre del Producto (Variedad)": "Campari 750ml", "Presentacion": "750ml", "Precio por Unidad (ARS)": 8000.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Andes", "Nombre del Producto (Variedad)": "Cerveza Andes IPA", "Presentacion": null, "Precio por Unidad (ARS)": 33500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Andes", "Nombre del Producto (Variedad)": "Cerveza Andes Negra", "Presentacion": null, "Precio por Unidad (ARS)": 33500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Andes", "Nombre del Producto (Variedad)": "Cerveza Andes Roja", "Presentacion": null, "Precio por Unidad (ARS)": 33500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Andes", "Nombre del Producto (Variedad)": "Cerveza Andes rubia", "Presentacion": null, "Precio por Unidad (ARS)": 32500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Otros", "Nombre del Producto (Variedad)": "Cerveza Brahma 473 ml", "Presentacion": "473 ml", "Precio por Unidad (ARS)": 30500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Otros", "Nombre del Producto (Variedad)": "Cerveza Budweiser 473 ml", "Presentacion": "473 ml", "Precio por Unidad (ARS)": 29500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Heineken", "Nombre del Producto (Variedad)": "Cerveza Heineken Lata 473 ml", "Presentacion": "473 ml", "Precio por Unidad (ARS)": 34000.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Isenbeck", "Nombre del Producto (Variedad)": "Cerveza Isenbeck Lata 473 ml", "Presentacion": "473 ml", "Precio por Unidad (ARS)": 24500.0 },
    { "Tipo de Bebida": "Cerveza", "Bodega/Marca": "Quilmes", "Nombre del Producto (Variedad)": "Cerveza Quilmes Lata 473 ml", "Presentacion": "473 ml", "Precio por Unidad (ARS)": 25000.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "Absolut", "Nombre del Producto (Variedad)": "Vodka Absolut 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 14000.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "Bombay", "Nombre del Producto (Variedad)": "Gin Bombay 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 23500.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "Gordon's", "Nombre del Producto (Variedad)": "Gin Gordon's 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 10500.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "Otros", "Nombre del Producto (Variedad)": "Licor Bols (Menta", "Presentacion": null, "Precio por Unidad (ARS)": 3900.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "Bacardi", "Nombre del Producto (Variedad)": "Ron Bacardi 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 11500.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "Smirnoff", "Nombre del Producto (Variedad)": "Vodka Smirnoff 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 6900.0 },
    { "Tipo de Bebida": "Destilado", "Bodega/Marca": "José Cuervo", "Nombre del Producto (Variedad)": "Tequila José Cuervo 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 19500.0 },
    { "Tipo de Bebida": "Energizante", "Bodega/Marca": "Speed", "Nombre del Producto (Variedad)": "Speed 250 ml", "Presentacion": "250 ml", "Precio por Unidad (ARS)": 3250.0 },
    { "Tipo de Bebida": "Espumante", "Bodega/Marca": "Chandon", "Nombre del Producto (Variedad)": "Champagne Chandon Extra Brut 750", "Presentacion": "750", "Precio por Unidad (ARS)": 7900.0 },
    { "Tipo de Bebida": "Espumante", "Bodega/Marca": "Frizze", "Nombre del Producto (Variedad)": "Champagne Frizze 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4000.0 },
    { "Tipo de Bebida": "Espumante", "Bodega/Marca": "Mumm", "Nombre del Producto (Variedad)": "Champagne Mumm Extra Brut 750", "Presentacion": "750", "Precio por Unidad (ARS)": 6900.0 },
    { "Tipo de Bebida": "Espumante", "Bodega/Marca": "Norton", "Nombre del Producto (Variedad)": "Champagne Norton Cosecha Tardía 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4500.0 },
    { "Tipo de Bebida": "Espumante", "Bodega/Marca": "Rutini", "Nombre del Producto (Variedad)": "Espumante Rutini Extra Brut 750", "Presentacion": "750", "Precio por Unidad (ARS)": 13500.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Aquarius", "Nombre del Producto (Variedad)": "Aquarius 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 5950.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Coca-Cola", "Nombre del Producto (Variedad)": "Coca-cola 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 6400.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Coca-Cola", "Nombre del Producto (Variedad)": "Coca-cola ZERO 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 6400.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Fanta", "Nombre del Producto (Variedad)": "Fanta 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 6400.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Pepsi", "Nombre del Producto (Variedad)": "Linea Pepsi 1.5 L", "Presentacion": "1.5 L", "Precio por Unidad (ARS)": 8600.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Pepsi", "Nombre del Producto (Variedad)": "Linea Pepsi 2.25 L", "Presentacion": "2.25 L", "Precio por Unidad (ARS)": 10100.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Pepsi", "Nombre del Producto (Variedad)": "Linea Pepsi 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 5110.0 },
    { "Tipo de Bebida": "Gaseosa", "Bodega/Marca": "Sprite", "Nombre del Producto (Variedad)": "Sprite 500 ml", "Presentacion": "500 ml", "Precio por Unidad (ARS)": 6400.0 },
    { "Tipo de Bebida": "Jugo/Infusión", "Bodega/Marca": "Cepita", "Nombre del Producto (Variedad)": "Jugo Cepita Bot 1 L", "Presentacion": "1 L", "Precio por Unidad (ARS)": 9250.0 },
    { "Tipo de Bebida": "Jugo/Infusión", "Bodega/Marca": "Terma", "Nombre del Producto (Variedad)": "Terma bot 1.5L", "Presentacion": "1.5L", "Precio por Unidad (ARS)": 11300.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "120", "Nombre del Producto (Variedad)": "Vino 120 Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4500.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "120", "Nombre del Producto (Variedad)": "Vino 120 Sauvignon Blanc 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4500.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Angelica Zapata", "Nombre del Producto (Variedad)": "Angelica Zapata Cabernet Sauvignon", "Presentacion": null, "Precio por Unidad (ARS)": 17900.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Angelica Zapata", "Nombre del Producto (Variedad)": "Angelica Zapata Chardonay", "Presentacion": null, "Precio por Unidad (ARS)": 17900.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Angelica Zapata", "Nombre del Producto (Variedad)": "Angelica Zapata Malbec", "Presentacion": null, "Precio por Unidad (ARS)": 19500.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Benjamin", "Nombre del Producto (Variedad)": "Benjamin Chardonnay 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3670.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Benjamin", "Nombre del Producto (Variedad)": "Benjamin malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3670.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "DV Catena", "Nombre del Producto (Variedad)": "Dv Catena malbec malbec", "Presentacion": null, "Precio por Unidad (ARS)": 13500.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Don Valentin", "Nombre del Producto (Variedad)": "Don Valentin Lacrado 750", "Presentacion": "750", "Precio por Unidad (ARS)": 2850.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Emilia", "Nombre del Producto (Variedad)": "Emilia Chardonnay 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4900.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Emilia", "Nombre del Producto (Variedad)": "Emilia malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4900.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Emilia", "Nombre del Producto (Variedad)": "Emilia blanco dulce 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4900.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Dada 1 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Dada 2 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Dada 3 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Dada 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Dada 8 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Dada 9 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Finca Las Moras", "Nombre del Producto (Variedad)": "Finca Las Moras Syrah 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "La Linda", "Nombre del Producto (Variedad)": "Vino La Linda Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 6300.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Malcriado", "Nombre del Producto (Variedad)": "Malcriado Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 6900.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Nicasia", "Nombre del Producto (Variedad)": "Nicasia Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 8500.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Portillo", "Nombre del Producto (Variedad)": "Portillo Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4300.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Portillo", "Nombre del Producto (Variedad)": "Portillo Malbec Dulce 750", "Presentacion": "750", "Precio por Unidad (ARS)": 4300.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Rutini", "Nombre del Producto (Variedad)": "Vino Rutini Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 25000.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Santa Julia", "Nombre del Producto (Variedad)": "Santa Julia Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Santa Julia", "Nombre del Producto (Variedad)": "Santa Julia Malbec Dulce 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Toro", "Nombre del Producto (Variedad)": "Toro tinto 1 L", "Presentacion": "1 L", "Precio por Unidad (ARS)": 1800.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Trapiche", "Nombre del Producto (Variedad)": "Trapiche Alaris Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3200.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Trapiche", "Nombre del Producto (Variedad)": "Trapiche Alaris Malbec Dulce 750", "Presentacion": "750", "Precio por Unidad (ARS)": 3200.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Trapiche", "Nombre del Producto (Variedad)": "Trapiche Alaris Tardío", "Presentacion": null, "Precio por Unidad (ARS)": 3200.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Trapiche", "Nombre del Producto (Variedad)": "Trapiche Fond de Cave Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 11500.0 },
    { "Tipo de Bebida": "Vino", "Bodega/Marca": "Trumpeter", "Nombre del Producto (Variedad)": "Trumpeter Malbec 750", "Presentacion": "750", "Precio por Unidad (ARS)": 8500.0 },
    { "Tipo de Bebida": "Whisky", "Bodega/Marca": "Johnnie Walker", "Nombre del Producto (Variedad)": "Whisky jw Black Label 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 32900.0 },
    { "Tipo de Bebida": "Whisky", "Bodega/Marca": "Johnnie Walker", "Nombre del Producto (Variedad)": "Whisky jw Doble Black de 1 L", "Presentacion": "1 L", "Precio por Unidad (ARS)": 46000.0 },
    { "Tipo de Bebida": "Whisky", "Bodega/Marca": "White Horse", "Nombre del Producto (Variedad)": "Whisky White Horse 750 ml", "Presentacion": "750 ml", "Precio por Unidad (ARS)": 13000.0 }
];

// Mapear los datos de prueba al PRODUCT_MODEL
const mockProducts = pricelistOct2025.map((item, index) => ({
    ...PRODUCT_MODEL,
    id: `mock-${index}-${Date.now()}`,
    nombre: item["Nombre del Producto (Variedad)"],
    bodega: item["Bodega/Marca"],
    especie: item["Tipo de Bebida"],
    precioUnidad: item["Precio por Unidad (ARS)"],
    costo: parseFloat((item["Precio por Unidad (ARS)"] / 1.3).toFixed(2)),
    stockTotal: Math.floor(Math.random() * 50) + 10,
    archivado: false,
    proveedorId: '',
}));

// --- 3. HOOKS PERSONALIZADOS ---
const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authDomainError, setAuthDomainError] = useState(false);

    useEffect(() => {
        if (!auth) {
            console.error("DEBUG: Auth no inicializado en useAuth");
            setIsAuthReady(true);
            return;
        }
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                    try {
                        const cred = await signInWithCustomToken(auth, __initial_auth_token);
                        setUserId(cred.user.uid);
                    } catch (e) {
                        console.error("Error en autenticación con token:", e);
                        try {
                            const credAnon = await signInAnonymously(auth);
                            setUserId(credAnon.user.uid);
                        } catch (eAnon) {
                            console.error("Error en el fallback de autenticación anónima:", eAnon);
                        }
                    }
                } else {
                     try {
                        const credAnon = await signInAnonymously(auth);
                        setUserId(credAnon.user.uid);
                    } catch (eAnon) {
                        console.error("Error en autenticación anónima (sin token):", eAnon);
                    }
                }
            }
            setIsAuthReady(true);
        });
        return unsub;
    }, []);

    return { userId, isAuthReady, authDomainError, setAuthDomainError };
};

const useCollection = (collectionName) => {
    const { userId, isAuthReady } = useAuth();
    const [data, setData] = useState(collectionName === 'products' ? mockProducts : []);
    const [loading, setLoading] = useState(true);
    const collectionsToListen = useMemo(() => ['products', 'clients', 'orders', 'providers', 'purchaseOrders', 'pricelists'], []);


    useEffect(() => {
        if (!isAuthReady || !userId || !db) {
             if (!(collectionName === 'products' && data.length > 0 && data[0]?.id?.startsWith('mock-'))) {
                setLoading(true);
            } else {
                 setLoading(false);
            }
            if (isAuthReady && !userId && collectionName !== 'products') {
                 setData([]);
                 setLoading(false);
            }
            return;
        };

        if (!collectionsToListen.includes(collectionName)) {
            setLoading(false);
            return;
        }
        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        const q = query(collection(db, path), where("archivado", "==", false));

        setLoading(true);
        const unsub = onSnapshot(q, snapshot => {
            const firestoreData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

            if (firestoreData.length > 0) {
                setData(firestoreData);
            } else if (collectionName === 'products' && data.length > 0 && data[0]?.id?.startsWith('mock-')) {
                // Keep mock data
            } else if (collectionName === 'products' && data.length === 0) {
                setData(mockProducts);
            }
             else {
                setData([]);
            }
            setLoading(false);
        }, err => {
            console.error(`Error en onSnapshot para ${collectionName}:`, err);
            if (collectionName === 'products' && data.length === 0) {
                setData(mockProducts);
            } else if (collectionName === 'products') {
                // Keep existing mock data
            }
            setLoading(false);
        });
        return unsub;
    }, [userId, isAuthReady, collectionName, db]);

    return { data, loading };
};


// --- 4. CONTEXTO DE DATOS Y ACCIONES ---
const DataContext = React.createContext(null); // Usar React.createContext

const DataProvider = ({ children }) => {
    const { userId, isAuthReady, authDomainError, setAuthDomainError } = useAuth();
    const collections = ['products', 'clients', 'orders', 'providers', 'purchaseOrders', 'pricelists'];
    const state = collections.reduce((acc, name) => {
        acc[name] = useCollection(name);
        return acc;
    }, {});

    const logout = () => {
        if (auth) {
            signOut(auth).catch(e => console.error("Error al cerrar sesión:", e));
        } else {
            console.warn("Intento de logout sin auth inicializado.");
        }
    };

    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) {
            console.error(`DEBUG: createOrUpdateDoc - Usuario (${userId}) no autenticado o DB (${!!db}) no inicializada. No se puede guardar en ${collectionName}.`);
            throw new Error("Usuario no autenticado o DB no inicializada.");
        }

        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        try {
            if (id) {
                const docRef = doc(db, path, id);
                await setDoc(docRef, { ...data, timestamp: serverTimestamp() }, { merge: true });
                if(!data.id) {
                    await updateDoc(docRef, { id: id });
                }
                return id;
            } else {
                const collectionRef = collection(db, path);
                const newDocRef = await addDoc(collectionRef, { ...data, timestamp: serverTimestamp() });
                await updateDoc(newDocRef, { id: newDocRef.id });
                return newDocRef.id;
            }
        } catch (error) {
            console.error(`ERROR FIRESTORE al guardar en ${collectionName} (ID: ${id || 'nuevo'}):`, error);
            throw error;
        }

    }, [userId, db]);

    const archiveDoc = useCallback(async (collectionName, id) => {
        if (!userId || !db) {
             console.error(`DEBUG: archiveDoc - Usuario (${userId}) no autenticado o DB (${!!db}) no inicializada. No se puede archivar ${collectionName}/${id}.`);
             throw new Error("Usuario no autenticado o DB no inicializada.");
        }
        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        try {
            await updateDoc(doc(db, path, id), { archivado: true });
        } catch(error) {
             console.error(`ERROR FIRESTORE al archivar ${collectionName}/${id}:`, error);
             throw error;
        }
    }, [userId, db]);

    const globalLoading = Object.values(state).some(s => s.loading);

    const value = {
        userId,
        isAuthReady,
        authDomainError,
        ...collections.reduce((acc, name) => ({ ...acc, [name]: state[name].data }), {}),
        loading: globalLoading,
        logout,
        createOrUpdateDoc,
        archiveDoc,
        db,
        auth,
        Button, Modal, Input, Select, Card, PageLoader, PageHeader,
        InputWithDatalist, FormComponent, ManagerComponent,
        PrintableDocument
    };
    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
const useData = () => {
    const context = React.useContext(DataContext); // Usar React.useContext
    if (context === undefined) {
      throw new Error('useData debe ser usado dentro de un DataProvider');
    }
    return context;
};


// --- 5. COMPONENTES DE UI GENÉRICOS ---
// ... (Componentes UI sin cambios) ...
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (<button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} ${className}`}>{Icon && <Icon className="w-5 h-5" />}<span>{children}</span></button>);
const Modal = ({ title, children, onClose }) => (<div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl"><h3 className="text-lg font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X /></button></div><div className="p-4 md:p-6 overflow-y-auto">{children}</div></div></div>);
const Input = ({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '', step = 'any', disabled = false }) => (
    <div>
        <label htmlFor={name} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            <input
                id={name}
                type={type}
                name={name}
                value={value || ''}
                onChange={onChange}
                required={required}
                placeholder={placeholder}
                className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className} ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                step={step}
                disabled={disabled}
            />
            {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}
        </div>
    </div>
);
const Select = ({ label, name, value, onChange, children, required = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><select name={name} value={value || ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition">{children}</select></div>);
const PageLoader = ({ text }) => (<div className="min-h-screen flex flex-col items-center justify-center text-gray-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div><p className="mt-2">{text}</p></div>);
const PageHeader = ({ title, children }) => (<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h2 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h2><div>{children}</div></div>);
const Card = ({ title, value, icon: Icon, color = 'indigo', onClick }) => (<div onClick={onClick} className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">{title}</p><Icon className={`w-6 h-6 text-${color}-500`} /></div><p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p></div>);


const FormComponent = ({ model, onSave, onCancel, children }) => {
    const [item, setItem] = useState(model);
    useEffect(() => {
        setItem(model);
    }, [model]);
    const handleChange = e => {
        const { name, value, type } = e.target;
        setItem(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };
    const handleSubmit = e => { e.preventDefault(); onSave(item); };

    const childrenWithProps = React.Children.map(children, child => {
        if (React.isValidElement(child)) {
            return React.cloneElement(child, { item, handleChange });
        }
        return child;
    });
    return <form onSubmit={handleSubmit} className="space-y-4">{childrenWithProps}<div className="flex justify-end space-x-3 pt-4"><Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button><Button type="submit" icon={Save}>Guardar</Button></div></form>;
};

const ManagerComponent = ({ title, collectionName, model, FormFields, TableHeaders, TableRow }) => {
    const hookData = useData();
    const data = hookData[collectionName] || [];
    const { createOrUpdateDoc, archiveDoc } = hookData;
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);

    const handleSave = async (itemData) => {
        try {
            if (!createOrUpdateDoc) {
                console.error("handleSave: createOrUpdateDoc no está disponible.");
                alert("Error interno: No se puede guardar.");
                return;
            }
            await createOrUpdateDoc(collectionName, itemData, selectedItem?.id);
            setIsModalOpen(false);
            setSelectedItem(null);
            console.log(`SUCCESS: ${title.slice(0, -1)} guardado correctamente.`);
        } catch (error) {
            console.error(`ERROR CRÍTICO AL GUARDAR ${title.slice(0, -1)}:`, error);
            alert(`Error al guardar. Revise la consola. Detalle: ${error.message}`);
        }
    };

    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };

    return (<div className="space-y-6">
        <PageHeader title={title}>
            <Button onClick={handleAddNew} icon={Plus}>Añadir {title.slice(0, -1)}</Button>
        </PageHeader>
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + title.slice(0, -1)} onClose={() => setIsModalOpen(false)}>
            <FormComponent model={selectedItem || model} onSave={handleSave} onCancel={() => setIsModalOpen(false)}>
                <FormFields />
            </FormComponent>
        </Modal>}
        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {TableHeaders.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {(data || []).map(item => <TableRow key={item.id} item={item} onEdit={() => handleEdit(item)} onArchive={() => archiveDoc(collectionName, item.id)} />)}
                </tbody>
            </table>
        </div>
    </div>);
};


const InputWithDatalist = ({ label, name, value, onChange, required = false, placeholder = "", icon: Icon, listId, options = [] }) => (
    <div>
        <label htmlFor={listId + '-input'} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            <input
                id={listId + '-input'}
                type="text"
                name={name}
                value={value || ''}
                onChange={onChange}
                required={required}
                placeholder={placeholder}
                list={listId}
                autoComplete="off"
                className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''}`}
            />
            {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}
            <datalist id={listId}>
                {(options || []).map((opt, index) => (
                    <option key={`${listId}-${index}`} value={opt} />
                ))}
            </datalist>
        </div>
    </div>
);

// --- FUNCIÓN GENÉRICA PARA IMPRIMIR ---
const PrintableDocument = React.forwardRef(({ children, title, logoText = "DistriFort" }, ref) => (
    <div ref={ref} className="p-6 print:p-0 print:text-black w-full min-h-screen">
        <div className="hidden print:block mb-8 border-b-2 border-gray-900 pb-2">
            <h1 className="text-3xl font-black">{logoText}</h1>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm">Fecha de Emisión: {new Date().toLocaleDateString()}</p>
        </div>
        {children}
        <style dangerouslySetInnerHTML={{__html: `
            @page { size: A4; margin: 1cm; }
            body { margin: 0 !important; }
            .print\\:hidden { display: none !important; }
            .hidden.print\\:block { display: block !important; }
            .print\\:text-black { color: #000 !important; }
            .print\\:p-0 { padding: 0 !important; }
            @media print {
                .no-print { display: none !important; }
            }
        `}} />
    </div>
));


// --- 8. MÓDULOS FUNCIONALES ---

// 8.1 Dashboard (Resumen)
const Dashboard = ({ setCurrentPage }) => {
    const { products = [], clients = [], orders = [] } = useData();

    const totalClients = useMemo(() => clients.length, [clients]);
    const lowStockProducts = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo).length, [products]);

    const { pendingOrders, totalRevenue, totalInvestment, netProfit } = useMemo(() => {
        let pending = 0;
        let revenue = 0;
        let investment = 0;

        (orders || []).forEach(o => {
            if (o.estado === 'Pendiente') pending++;
            revenue += (o.total || 0);

            (o.items || []).forEach(item => {
                if (item.productId) {
                    const product = products.find(p => p.id === item.productId);
                    if (product) {
                        const cost = product.costo || 0;
                        const quantity = item.cantidad || 0;
                        investment += cost * quantity;
                    } else {
                         console.warn(`Dashboard: Producto con ID ${item.productId} no encontrado para calcular inversión.`);
                    }
                }
            });
        });

        const profit = revenue - investment;

        return {
            pendingOrders: pending,
            totalRevenue: revenue,
            totalInvestment: investment,
            netProfit: profit
        };
    }, [orders, products]);

    const totalDebt = useMemo(() => {
        return (clients || []).reduce((acc, client) => acc + (client.saldoPendiente || 0), 0);
    }, [clients]);

    const recentPendingOrders = useMemo(() => {
        return (orders || [])
            .filter(o => o.estado === 'Pendiente')
            .sort((a, b) => (b.timestamp?.toDate()?.getTime() || 0) - (a.timestamp?.toDate()?.getTime() || 0))
            .slice(0, 5);
    }, [orders]);

    const topDebtors = useMemo(() => {
        return (clients || [])
            .filter(c => (c.saldoPendiente || 0) > 0)
            .sort((a, b) => (b.saldoPendiente || 0) - (a.saldoPendiente || 0))
            .slice(0, 5);
    }, [clients]);

     const lowStockItems = useMemo(() => {
        return (products || [])
            .filter(p => p.stockTotal <= p.umbralMinimo && p.stockTotal > 0)
            .sort((a, b) => (a.stockTotal || 0) - (b.stockTotal || 0))
            .slice(0, 5);
    }, [products]);


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <PageHeader title="Resumen" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

                <Card
                    title="Ingresos Totales (Ventas)"
                    value={FORMAT_CURRENCY(totalRevenue)}
                    icon={TrendingUp}
                    color="green"
                    onClick={() => setCurrentPage('orders')}
                />

                <Card
                    title="Costos Totales (Inversión)"
                    value={FORMAT_CURRENCY(totalInvestment)}
                    icon={TrendingDown}
                    color="red"
                    onClick={() => setCurrentPage('inventory')}
                />

                <div className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1`}>
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-500">Ganancia Neta</p>
                        <DollarSign className={`w-6 h-6 ${netProfit >= 0 ? 'text-green-500' : 'text-red-500'}`} />
                    </div>
                    <p className={`text-2xl md:text-3xl font-bold mt-1 ${netProfit >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                        {FORMAT_CURRENCY(netProfit)}
                    </p>
                </div>

                <Card
                    title="Deuda Total Clientes"
                    value={FORMAT_CURRENCY(totalDebt)}
                    icon={AlertCircle}
                    color="orange"
                    onClick={() => setCurrentPage('clients')}
                />
                <Card
                    title="Pedidos Pendientes"
                    value={pendingOrders}
                    icon={ShoppingCart}
                    color="yellow"
                    onClick={() => setCurrentPage('orders')}
                />
                <Card
                    title="Productos (Stock Bajo)"
                    value={lowStockProducts}
                    icon={Package}
                    color="red"
                    onClick={() => setCurrentPage('inventory')}
                />
            </div>

             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                 <div className="bg-white p-4 rounded-lg shadow lg:col-span-1">
                     <h3 className="font-bold text-lg mb-4">Últimos Pedidos Pendientes</h3>
                     <div className="space-y-3">
                         {recentPendingOrders.length === 0 && <p className="text-sm text-gray-500">No hay pedidos pendientes.</p>}
                         {recentPendingOrders.map(o => (
                             <div
                                key={o.id}
                                className="flex justify-between items-center text-sm border-b pb-2 last:border-b-0 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded-lg"
                                onClick={() => setCurrentPage('orders')}
                             >
                                 <div>
                                     <p className="font-semibold">{o.nombreCliente}</p>
                                     <p className="text-gray-500 text-xs">{(o.timestamp?.toDate() || new Date(o.fechaPedido || Date.now())).toLocaleDateString()}</p>
                                 </div>
                                 <span className="font-bold">{FORMAT_CURRENCY(o.total)}</span>
                             </div>
                         ))}
                     </div>
                 </div>

                 <div className="bg-white p-4 rounded-lg shadow lg:col-span-1">
                     <h3 className="font-bold text-lg mb-4">Clientes con Mayor Deuda</h3>
                     <div className="space-y-3">
                         {topDebtors.length === 0 && <p className="text-sm text-gray-500">No hay clientes con deuda.</p>}
                         {topDebtors.map(c => (
                             <div
                                key={c.id}
                                className="flex justify-between items-center text-sm border-b pb-2 last:border-b-0 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded-lg"
                                onClick={() => setCurrentPage('clients')}
                             >
                                 <p className="font-semibold">{c.nombre}</p>
                                 <span className="font-bold text-orange-600">{FORMAT_CURRENCY(c.saldoPendiente)}</span>
                             </div>
                         ))}
                     </div>
                 </div>

                 <div className="bg-white p-4 rounded-lg shadow lg:col-span-1">
                     <h3 className="font-bold text-lg mb-4">Productos con Stock Bajo</h3>
                     <div className="space-y-3">
                         {lowStockItems.length === 0 && <p className="text-sm text-gray-500">No hay productos con stock bajo.</p>}
                         {lowStockItems.map(p => (
                             <div
                                key={p.id}
                                className="flex justify-between items-center text-sm border-b pb-2 last:border-b-0 cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded-lg"
                                onClick={() => setCurrentPage('inventory')}
                             >
                                 <p className="font-semibold">{p.nombre}</p>
                                 <span className="font-bold text-red-500">{p.stockTotal} Uds.</span>
                             </div>
                         ))}
                     </div>
                 </div>
             </div>
        </div>
    );
};

// 8.2 Módulos de Gestión: Clientes
const ClientFormFields = ({ item, handleChange, clients = [], providers = [] }) => {
    const uniqueClientNombres = useMemo(() => {
        const nombres = clients.map(c => c.nombre).filter(Boolean);
        return [...new Set(nombres)].sort();
    }, [clients]);

    const uniqueClientCuits = useMemo(() => {
        const cuits = clients.map(c => c.cuit).filter(Boolean);
        return [...new Set(cuits)].sort();
    }, [clients]);

    const uniqueClientEmails = useMemo(() => {
        const emails = clients.map(c => c.email).filter(Boolean);
        return [...new Set(emails)].sort();
    }, [clients]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputWithDatalist
                label="Nombre"
                name="nombre"
                value={item.nombre}
                onChange={handleChange}
                required
                listId="client-nombres-list"
                options={uniqueClientNombres}
                placeholder="Escriba o seleccione un cliente"
            />
            <InputWithDatalist
                label="CUIT"
                name="cuit"
                value={item.cuit}
                onChange={handleChange}
                listId="client-cuits-list"
                options={uniqueClientCuits}
                placeholder="Escriba o seleccione un CUIT"
            />
            <Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} />
            <InputWithDatalist
                label="Email"
                name="email"
                value={item.email}
                onChange={handleChange}
                listId="client-emails-list"
                options={uniqueClientEmails}
                placeholder="Escriba o seleccione un email"
            />
            <Input label="Dirección" name="Direccion" value={item.Direccion} onChange={handleChange} className="col-span-full"/>
            <Input label="Límite de Crédito ($)" name="limiteCredito" type="number" value={item.limiteCredito} onChange={handleChange} />
            <Input label="Mínimo de Compra ($)" name="minimoCompra" type="number" value={item.minimoCompra} onChange={handleChange} />
            <Select label="Régimen" name="regimen" value={item.regimen} onChange={handleChange}>
                <option>Minorista</option>
                <option>Mayorista</option>
            </Select>
            <Select label="Proveedor Asociado (Opcional)" name="proveedorId" value={item.proveedorId} onChange={handleChange}>
                <option value="">-- Ninguno --</option>
                {(providers || []).map(p => <option key={p.id} value={p.id}>{p.Nombre}</option>)}
            </Select>
        </div>
    );
};

const ClientManager = () => {
    const { clients = [], providers = [], archiveDoc, createOrUpdateDoc } = useData();

    const FormFieldsWrapper = (props) => (
        <ClientFormFields
            {...props}
            clients={clients}
            providers={providers}
        />
    );

    const ClientTableRow = ({ item, onEdit, onArchive }) => (
        <tr className="hover:bg-gray-50">
            <td className="px-4 py-4 font-semibold">{item.nombre}</td>
            <td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td>
            <td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.saldoPendiente)}</td>
            <td className="px-4 py-4 text-right space-x-2">
                <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
                <Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
            </td>
        </tr>
    );

    return <ManagerComponent
        title="Clientes"
        collectionName="clients"
        model={CLIENT_MODEL}
        FormFields={FormFieldsWrapper}
        TableHeaders={["Nombre", "Teléfono", "Saldo"]}
        TableRow={ClientTableRow}
    />;
};


// 8.3 Módulos de Gestión: Proveedores
const ProviderManager = () => {
    const { providers = [], archiveDoc, createOrUpdateDoc } = useData();

    const uniqueProviderNombres = useMemo(() => {
        const nombres = providers.map(p => p.Nombre).filter(Boolean);
        return [...new Set(nombres)].sort();
    }, [providers]);

    const uniqueProviderResponsables = useMemo(() => {
        const responsables = providers.map(p => p.Responsable).filter(Boolean);
        return [...new Set(responsables)].sort();
    }, [providers]);

    const uniqueProviderEmails = useMemo(() => {
        const emails = providers.map(p => p.Email).filter(Boolean);
        return [...new Set(emails)].sort();
    }, [providers]);

    const ProviderFormFields = ({ item, handleChange }) => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputWithDatalist
                label="Nombre (Bodega)"
                name="Nombre"
                value={item.Nombre}
                onChange={handleChange}
                required
                listId="provider-nombres-list"
                options={uniqueProviderNombres}
                placeholder="Escriba o seleccione una bodega"
            />
            <InputWithDatalist
                label="Nombre del Responsable"
                name="Responsable"
                value={item.Responsable}
                onChange={handleChange}
                listId="provider-responsables-list"
                options={uniqueProviderResponsables}
                placeholder="Escriba o seleccione un responsable"
            />
            <Input label="CUIT" name="CUIT" value={item.CUIT} onChange={handleChange} />
            <Input label="Teléfono" name="Telefono" value={item.Telefono} onChange={handleChange} />
            <InputWithDatalist
                label="Email"
                name="Email"
                value={item.Email}
                onChange={handleChange}
                listId="provider-emails-list"
                options={uniqueProviderEmails}
                placeholder="Escriba o seleccione un email"
            />
            <Input label="Dirección" name="Direccion" value={item.Direccion} onChange={handleChange} className="col-span-full"/>
        </div>
    );

    const ProviderTableRow = ({ item, onEdit, onArchive }) => (
        <tr className="hover:bg-gray-50">
            <td className="px-4 py-4 font-semibold">{item.Nombre}</td>
            <td className="px-4 py-4 hidden sm:table-cell">{item.Responsable}</td>
            <td className="px-4 py-4 hidden sm:table-cell">{item.Telefono}</td>
            <td className="px-4 py-4 text-right space-x-2">
                <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
                <Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
            </td>
        </tr>
    );

    const FormFieldsWrapper = (props) => (
        <ProviderFormFields
            {...props}
        />
    );

    return <ManagerComponent
        title="Proveedores"
        collectionName="providers"
        model={PROVIDER_MODEL}
        FormFields={FormFieldsWrapper}
        TableHeaders={["Nombre (Bodega)", "Responsable", "Teléfono"]}
        TableRow={ProviderTableRow}
    />;
};


// 8.4 Módulos de Gestión: Pedidos (OrderManager)
const OrderManager = ({ setCurrentPage }) => {
    const { clients = [], products = [], orders = [], providers = [], createOrUpdateDoc, archiveDoc } = useData();
    const [view, setView] = useState('list');

    const getPriceText = (price) => (price || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const getStatusStyle = (estado) => {
        switch (estado) {
            case 'Pendiente': return 'bg-yellow-100 text-yellow-800';
            case 'Enviado': return 'bg-blue-100 text-blue-800';
            case 'Entregado': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <PageHeader title="Gestión de Pedidos" />
                <Button
                    onClick={() => setView(view === 'list' ? 'creator' : 'list')}
                    icon={view === 'list' ? Plus : List}
                >
                    {view === 'list' ? 'Nuevo Pedido' : 'Ver Historial'}
                </Button>
            </div>

            {view === 'list' ? (
                <OrderList
                    orders={orders}
                    archiveDoc={archiveDoc}
                    getPriceText={getPriceText}
                    getStatusStyle={getStatusStyle}
                />
            ) : (
                <OrderCreator
                    clients={clients}
                    products={products}
                    providers={providers}
                    setView={setView}
                    createOrUpdateDoc={createOrUpdateDoc}
                    getPriceText={getPriceText}
                    archiveDoc={archiveDoc}
                />
            )}
        </div>
    );
};

const OrderList = ({ orders, archiveDoc, getPriceText, getStatusStyle }) => {

    const generateWhatsAppLink = (order) => {
        const clientPhone = order.telefonoCliente || '';
        if (!clientPhone) return "#";

        const itemsList = (order.items || []).map(item =>
            `* ${item.cantidad || 0} Uds. de ${item.nombreProducto || '?'} - ${getPriceText(item.precioUnidad || 0)} c/u`
        ).join('\n');

        const message = `¡Hola ${order.nombreCliente || 'Cliente'}!\n\n`
            + `Te enviamos el resumen de tu pedido (#${order.numeroPedido || order.id?.slice(0, 5) || '?'}):\n`
            + `-------------------------\n`
            + `${itemsList}\n`
            + `-------------------------\n`
            + `Subtotal: ${getPriceText(order.subtotal)}\n`
            + `Costo Envío: ${getPriceText(order.costoEnvio)}\n`
            + `Descuento: ${getPriceText(order.descuento)}\n`
            + `*TOTAL FINAL: ${getPriceText(order.total)}*\n\n`
            + `¡Muchas gracias por tu compra!`;

        const cleanedPhone = clientPhone.replace(/[^0-9]/g, '');
        const finalPhone = cleanedPhone.length > 10 ? cleanedPhone : `549${cleanedPhone}`;

        return `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
    };

    const handleArchive = (id) => {
        if (!archiveDoc) {
             console.error("handleArchive: archiveDoc no disponible.");
             alert("Error interno: No se puede archivar.");
             return;
        }
        console.log("Archivando pedido:", id);
        archiveDoc('orders', id).catch(e => {
             console.error("Error al archivar pedido:", e);
             alert(`Error al archivar: ${e.message}`);
        });
    };

    return (
        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {(orders || []).map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap font-semibold">{o.nombreCliente}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{(o.timestamp?.toDate() || new Date(o.fechaPedido || Date.now())).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-700">{getPriceText(o.total || 0)}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusStyle(o.estado)}`}>
                                    {o.estado}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                <a
                                    href={generateWhatsAppLink(o)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center !p-2 rounded-lg text-white transition ${!o.telefonoCliente ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:!bg-green-600'}`}
                                    title={!o.telefonoCliente ? "Cliente sin teléfono" : "Enviar por WhatsApp"}
                                    onClick={(e) => !o.telefonoCliente && e.preventDefault()}
                                >
                                    <Send className="w-4 h-4"/>
                                </a>
                                <Button onClick={() => handleArchive(o.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4"/></Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const OrderCreator = ({ clients = [], products = [], providers = [], setView, createOrUpdateDoc, getPriceText }) => {
    const [cart, setCart] = useState([]);
    const [clientId, setClientId] = useState('');
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);

    const [clientSearch, setClientSearch] = useState('');
    const [isClientListOpen, setIsClientListOpen] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);

    const [productSearch, setProductSearch] = useState('');
    const [isProductListOpen, setIsProductListOpen] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const { userId, db } = useData();

    const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);

    const filteredClients = useMemo(() => {
        if (!clientSearch) return clients.slice(0, 10);
        return clients.filter(c => c.nombre?.toLowerCase().includes(clientSearch.toLowerCase()));
    }, [clients, clientSearch]);

    const handleSelectClient = (client) => {
        setClientId(client.id);
        setClientSearch(client.nombre);
        setIsClientListOpen(false);
    };

    const handleSaveNewClient = async (newClientData) => {
        if (!createOrUpdateDoc) {
             console.error("handleSaveNewClient: createOrUpdateDoc no disponible.");
             alert("Error interno: No se puede guardar el cliente.");
             return;
        }
        try {
            const newClientId = await createOrUpdateDoc('clients', newClientData, null);
            setClientId(newClientId);
            setClientSearch(newClientData.nombre);
            setIsClientModalOpen(false);
            alert("Cliente nuevo guardado.");
        } catch (error) {
            console.error("Error al guardar nuevo cliente:", error);
            alert(`Error al guardar cliente. Detalle: ${error.message}`);
        }
    };

    const filteredProducts = useMemo(() => {
        if (!productSearch) return products.slice(0, 10);
        return products.filter(p => p.nombre?.toLowerCase().includes(productSearch.toLowerCase()));
    }, [products, productSearch]);

    const handleAddToCart = (product, quantity, unit) => {
        if (!product || quantity <= 0) return;
        const cartId = Date.now() + Math.random().toString(36).substring(2);

        const newItem = {
            cartId,
            productId: product.id,
            nombre: product.nombre,
            quantity: quantity,
            unit: unit,
            priceAtSale: 0,
        };
        setCart(prev => [...prev, newItem]);
        setProductSearch('');
        setIsProductListOpen(false);
    };

    const handleRemoveFromCart = (cartId) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    };

    const { subtotal, descuentoMonto, total } = useMemo(() => {
        let sub = 0;
        cart.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;

            const price = selectedClient?.regimen === 'Mayorista' && item.unit === 'Caja' && product.precioCaja > 0
                ? product.precioCaja
                : product.precioUnidad;

            item.priceAtSale = price || 0;
            sub += item.quantity * (item.priceAtSale || 0);
        });

        const descMonto = sub * (descuentoPorcentaje / 100);
        const finalTotal = sub - descMonto + (parseFloat(costoEnvio) || 0);

        return { subtotal: sub, descuentoMonto: descMonto, total: finalTotal };
    }, [cart, selectedClient, products, costoEnvio, descuentoPorcentaje]);


    const handleSubmitOrder = async () => {
        if (!selectedClient || cart.length === 0) {
            alert("Seleccione un cliente y añada productos.");
            return;
        }

        if (selectedClient.regimen === 'Mayorista' && subtotal < (selectedClient.minimoCompra || 0)) {
            return alert(`El pedido no alcanza el mínimo de compra de ${getPriceText(selectedClient.minimoCompra || 0)}.`);
        }

        setIsSaving(true);

        if (!userId || !db) {
            alert("Error: Usuario no autenticado o DB no inicializada.");
            setIsSaving(false);
            return;
        }

        const batch = writeBatch(db);

        try {
            const orderNumber = `PED-${Date.now().toString().slice(-6)}`;
            const orderId = doc(collection(db, `/artifacts/${appId}/users/${userId}/orders`)).id;
            const orderRef = doc(db, `/artifacts/${appId}/users/${userId}/orders`, orderId);
            const clientRef = doc(db, `/artifacts/${appId}/users/${userId}/clients`, clientId);

            const newOrder = {
                archivado: false,
                clienteId: clientId,
                nombreCliente: selectedClient.nombre,
                telefonoCliente: selectedClient.telefono || '',
                costoEnvio: parseFloat(costoEnvio || 0),
                descuento: parseFloat(descuentoMonto.toFixed(2)),
                estado: 'Pendiente',
                id: orderId,
                items: cart.map(({ cartId, productId, nombre, quantity, priceAtSale, unit }) => {
                    const product = products.find(p => p.id === productId);
                    const unitsPerItem = unit === 'Caja' ? (product?.udsPorCaja || 6) : 1;
                    const unitPrice = (priceAtSale || 0) / unitsPerItem;
                    return {
                        productId: productId,
                        nombreProducto: nombre,
                        cantidad: quantity * unitsPerItem,
                        precioUnidad: unitPrice || 0,
                        subtotalLinea: quantity * (priceAtSale || 0)
                    };
                }),
                subtotal: parseFloat(subtotal.toFixed(2)),
                timestamp: serverTimestamp(),
                total: parseFloat(total.toFixed(2)),
                numeroPedido: orderNumber,
                fechaPedido: new Date().toISOString().split('T')[0],
            };

            batch.set(orderRef, newOrder);

            const newSaldoPendiente = (selectedClient.saldoPendiente || 0) + total;
            batch.update(clientRef, { saldoPendiente: newSaldoPendiente });

            for (const item of cart) {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    const productRef = doc(db, `/artifacts/${appId}/users/${userId}/products`, item.productId);
                    const unitsSold = item.unit === 'Caja' ? (item.quantity * (product.udsPorCaja || 6)) : item.quantity;
                    const newStockTotal = (product.stockTotal || 0) - unitsSold;

                    batch.set(productRef, { stockTotal: newStockTotal }, { merge: true });
                }
            }

            await batch.commit();

            alert(`¡Pedido ${orderNumber} Creado!`);
            setView('list');

        } catch (error) {
            console.error("Error al guardar el pedido (writeBatch):", error);
            alert(`Error al guardar el pedido. Detalle: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {isClientModalOpen && (
                <Modal title="Añadir Nuevo Cliente" onClose={() => setIsClientModalOpen(false)}>
                    <FormComponent
                        model={{ ...CLIENT_MODEL, nombre: clientSearch }}
                        onSave={handleSaveNewClient}
                        onCancel={() => setIsClientModalOpen(false)}
                    >
                         {React.createElement((props) => (
                            <ClientFormFields
                                {...props}
                                clients={clients}
                                providers={providers}
                            />
                         ))}
                    </FormComponent>
                </Modal>
            )}

            <div className="lg:col-span-2 space-y-4">

                <div className="bg-white p-4 rounded-lg shadow">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Cliente</label>
                    <div className="relative">
                        <Input
                            label=""
                            name="clientSearch"
                            value={clientSearch}
                            onChange={e => {
                                setClientSearch(e.target.value);
                                setClientId('');
                                setIsClientListOpen(true);
                            }}
                            onFocus={() => setIsClientListOpen(true)}
                            onBlur={() => setTimeout(() => setIsClientListOpen(false), 150)}
                            placeholder="Escribe el nombre del cliente..."
                        />
                        {isClientListOpen && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                {filteredClients.map(c => (
                                    <div
                                        key={c.id}
                                        className="p-3 hover:bg-indigo-100 cursor-pointer"
                                        onMouseDown={() => handleSelectClient(c)}
                                    >
                                        <p className="font-semibold">{c.nombre}</p>
                                        <p className="text-sm text-gray-500">{c.cuit || 'Sin CUIT'}</p>
                                    </div>
                                ))}
                                {filteredClients.length === 0 && clientSearch.length > 2 && (
                                     <div
                                        className="p-3 hover:bg-green-100 cursor-pointer text-green-600 font-semibold"
                                        onMouseDown={() => {
                                             setIsClientModalOpen(true);
                                             setIsClientListOpen(false);
                                        }}
                                    >
                                        <Plus className="w-4 h-4 inline-block mr-2" />
                                        Añadir "{clientSearch}"
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                     {selectedClient && (
                        <div className="text-xs mt-2 p-2 bg-gray-50 rounded">
                            <p>Régimen: <span className="font-semibold">{selectedClient.regimen}</span></p>
                            <p>Mínimo de compra: <span className="font-semibold">{getPriceText(selectedClient.minimoCompra || 0)}</span></p>
                        </div>
                    )}
                </div>

                <div className="bg-white p-4 rounded-lg shadow">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Buscar Producto</label>
                     <div className="relative">
                        <Input
                            label=""
                            name="productSearch"
                            value={productSearch}
                            onChange={e => {
                                setProductSearch(e.target.value);
                                setIsProductListOpen(true);
                            }}
                            onFocus={() => setIsProductListOpen(true)}
                            onBlur={() => setTimeout(() => setIsProductListOpen(false), 150)}
                            placeholder="Escribe el nombre del producto..."
                        />
                         {isProductListOpen && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-96 overflow-y-auto">
                                {filteredProducts.map(p => (
                                    <div key={p.id} className="flex items-center justify-between p-3 border-b hover:bg-gray-50 transition">
                                        <div>
                                            <p className="font-semibold">{p.nombre}</p>
                                            <p className="text-sm text-gray-600">
                                                Unidad: {getPriceText(p.precioUnidad)}
                                                {(p.precioCaja || 0) > 0 && ` | Caja (${p.udsPorCaja || 6}u): ${getPriceText(p.precioCaja)}`}
                                            </p>
                                        </div>
                                        <div className="flex space-x-2">
                                            <Button
                                                onMouseDown={() => handleAddToCart(p, 1, 'Unidad')}
                                                className="!px-2 !py-1 text-xs !bg-indigo-400 hover:!bg-indigo-500"
                                            >
                                                +1 Unidad
                                            </Button>
                                            {(p.precioCaja || 0) > 0 && (
                                                <Button
                                                    onMouseDown={() => handleAddToCart(p, 1, 'Caja')}
                                                    className="!px-2 !py-1 text-xs"
                                                >
                                                    +1 Caja
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                         )}
                    </div>
                </div>

                 <div className="bg-white p-4 rounded-lg shadow">
                    <h3 className="font-bold text-lg mb-4">Carrito de Pedido</h3>
                     <div className="space-y-3">
                        {cart.length === 0 && <p className="text-sm text-gray-500">Aún no hay productos en el carrito.</p>}
                        {cart.map(item => {
                            const product = products.find(p => p.id === item.productId);
                            const price = item.priceAtSale || 0;
                            const lineTotal = price * item.quantity;

                            return (
                                <div key={item.cartId} className="flex items-center justify-between p-2 border-b">
                                    <div>
                                        <p className="font-semibold">{item.nombre}</p>
                                        <p className="text-sm text-gray-600">
                                            {item.quantity} {item.unit}(s) x {getPriceText(price)} c/u
                                        </p>
                                    </div>
                                    <div className="flex items-center space-x-3">
                                        <p className="font-bold">{getPriceText(lineTotal)}</p>
                                        <Button onClick={() => handleRemoveFromCart(item.cartId)} className="!p-2 !bg-red-100 !text-red-600 hover:!bg-red-200">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                     </div>
                 </div>
            </div>

            <div className="lg:col-span-1 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow sticky top-4">
                    <h3 className="font-bold text-xl mb-4">Resumen del Pedido</h3>
                    <div className="space-y-2">
                         <div className="flex justify-between">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-semibold">{getPriceText(subtotal)}</span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-gray-600">Costo Envío ($)</span>
                             <input
                                type="number"
                                value={costoEnvio}
                                onChange={e => setCostoEnvio(parseFloat(e.target.value) || 0)}
                                className="w-24 p-1 border border-gray-300 rounded text-right font-semibold"
                            />
                        </div>

                         <div className="flex justify-between items-center">
                            <span className="text-gray-600">Descuento (%)</span>
                            <input
                                type="number"
                                value={descuentoPorcentaje}
                                onChange={e => setDescuentoPorcentaje(parseFloat(e.target.value) || 0)}
                                className="w-24 p-1 border border-gray-300 rounded text-right font-semibold"
                            />
                        </div>
                         <div className="flex justify-between text-sm text-red-500">
                            <span>Monto Descuento</span>
                            <span className="font-semibold">-{getPriceText(descuentoMonto)}</span>
                        </div>

                        <div className="border-t pt-2 mt-2">
                             <div className="flex justify-between text-xl font-bold">
                                <span>TOTAL</span>
                                <span>{getPriceText(total)}</span>
                            </div>
                        </div>

                        <Button
                            onClick={handleSubmitOrder}
                            disabled={!selectedClient || cart.length === 0 || isSaving}
                            icon={isSaving ? null : Save}
                            className="w-full !mt-6 !py-3 !text-lg !bg-green-600 hover:!bg-green-700"
                        >
                            {isSaving ? "Guardando..." : "Guardar Pedido"}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};


// 8.5 Módulos de Gestión: Productos (ProductManager)
const ProductManager = () => {
    const { products = [], providers = [], createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const lowStockProducts = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo), [products]);

    const uniqueBodegas = useMemo(() => {
        const bodegas = products.map(p => p.bodega).filter(Boolean);
        return [...new Set(bodegas)].sort();
    }, [products]);

    const uniqueNombres = useMemo(() => {
        const nombres = products.map(p => p.nombre).filter(Boolean);
        return [...new Set(nombres)].sort();
    }, [products]);


    const ProductFormFields = ({ item, handleChange }) => {
        const UNITS_PER_PALLET = 300;

        const [stockAmount, setStockAmount] = useState(0);
        const [stockUnit, setStockUnit] = useState('unidad');

        const udsPorCaja = item.udsPorCaja || 6;

        const handleStockChange = (e) => setStockAmount(parseFloat(e.target.value) || 0);
        const handleUnitChange = (e) => setStockUnit(e.target.value);

        const handleApplyStock = () => {
            let unitsToAdd = stockAmount;
            if (stockUnit === 'caja') {
                unitsToAdd *= udsPorCaja;
            } else if (stockUnit === 'pallet') {
                unitsToAdd *= UNITS_PER_PALLET;
            }

            const newStockTotal = (item.stockTotal || 0) + unitsToAdd;
            handleChange({ target: { name: 'stockTotal', value: newStockTotal, type: 'number' } });
            setStockAmount(0);
        };

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <InputWithDatalist
                    label="Nombre"
                    name="nombre"
                    value={item.nombre}
                    onChange={handleChange}
                    required
                    listId="nombres-list"
                    options={uniqueNombres}
                    placeholder="Escriba o seleccione un nombre"
                />
                <InputWithDatalist
                    label="Bodega"
                    name="bodega"
                    value={item.bodega}
                    onChange={handleChange}
                    listId="bodegas-list"
                    options={uniqueBodegas}
                    placeholder="Escriba o seleccione una bodega"
                />

                <Select label="Proveedor" name="proveedorId" value={item.proveedorId} onChange={handleChange} required>
                    <option value="">-- Seleccionar Proveedor --</option>
                    {(providers || []).map(p => <option key={p.id} value={p.id}>{p.Nombre}</option>)}
                </Select>

                <Input label="Precio Unidad ($)" name="precioUnidad" type="number" value={item.precioUnidad} onChange={handleChange} required />
                <Input label="Costo por Unidad ($)" name="costo" type="number" value={item.costo} onChange={handleChange} required />
                <Input label="Unidades por Caja" name="udsPorCaja" type="number" value={item.udsPorCaja} onChange={handleChange} />
                <Input label="Umbral Mínimo" name="umbralMinimo" type="number" value={item.umbralMinimo} onChange={handleChange} />

                <div className="col-span-full border-t pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Actual (Unidades)</label>
                    <p className="text-2xl font-bold text-indigo-600">{item.stockTotal || 0}</p>
                </div>

                <div className="col-span-full grid grid-cols-3 gap-2 items-end">
                    <Input label="Añadir Stock" type="number" value={stockAmount} onChange={handleStockChange} className="col-span-1" />
                    <Select label="Unidad" value={stockUnit} onChange={handleUnitChange} className="col-span-1">
                        <option value="unidad">Unidad</option>
                        <option value="caja">Caja (x{udsPorCaja} uds)</option>
                        <option value="pallet">Pallet (x{UNITS_PER_PALLET} uds)</option>
                    </Select>
                    <Button
                        onClick={handleApplyStock}
                        disabled={stockAmount <= 0}
                        className="col-span-1 !bg-green-600 hover:!bg-green-700 !py-2"
                    >
                        Aplicar
                    </Button>
                </div>
                <input type="hidden" name="stockTotal" value={item.stockTotal} />
            </div>
        );
    };

    const ProductTableRow = ({ item, onEdit, onArchive }) => (
        <tr className="hover:bg-gray-50">
            <td className="px-4 py-4 font-semibold">{item.nombre}</td>
            <td className="px-4 py-4">{item.bodega}</td>
            <td className={`px-4 py-4 ${item.stockTotal <= item.umbralMinimo ? 'text-red-500 font-bold' : ''}`}>{item.stockTotal}</td>
            <td className="px-4 py-4">{FORMAT_CURRENCY(item.precioUnidad)}</td>
            <td className="px-4 py-4 text-right space-x-2">
                <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
                <Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
            </td>
        </tr>
    );

    const handleSave = async (itemData) => {
        try {
            if (!createOrUpdateDoc) throw new Error("Función createOrUpdateDoc no disponible.");
            await createOrUpdateDoc('products', itemData, selectedItem?.id);
            setIsModalOpen(false);
            setSelectedItem(null);
            console.log("SUCCESS: Producto guardado/actualizado con éxito.");
        } catch (error) {
            console.error("ERROR CRÍTICO AL GUARDAR EL PRODUCTO:", error);
            alert(`Error al guardar el producto. Detalle: ${error.message}`);
        }
    };

    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };

    const ProductTableHeaders = ["Nombre", "Bodega", "Stock", "Precio"];

    const FormFieldsWrapper = (props) => (
        <ProductFormFields
            {...props}
        />
    );

    return (<div className="space-y-6">
        <PageHeader title="Inventario">
            <Button onClick={handleAddNew} icon={Plus}>Añadir Producto</Button>
        </PageHeader>
        {lowStockProducts.length > 0 && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
                <p className="font-bold">Alerta de Stock</p>
                <p>Tienes {lowStockProducts.length} productos bajo el umbral mínimo.</p>
            </div>
        )}
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Producto"} onClose={() => setIsModalOpen(false)}>
            <FormComponent model={selectedItem || PRODUCT_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)}>
                <FormFieldsWrapper />
            </FormComponent>
        </Modal>}

        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {ProductTableHeaders.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {(products || []).map(item => <ProductTableRow key={item.id} item={item} onEdit={() => handleEdit(item)} onArchive={() => archiveDoc('products', item.id)} />)}
                </tbody>
            </table>
        </div>
    </div>);
};




// --- MÓDULOS RESTAURADOS ---

const PurchaseOrderManager = () => {
    const { purchaseOrders = [], providers = [], products = [], createOrUpdateDoc, archiveDoc, PrintableDocument, userId, db } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const componentRef = useRef();

    const handleSave = async (itemData) => {
        try {
             const finalData = { ...itemData };
             finalData.costoTotal = parseFloat(finalData.costoTotal) || 0;
             finalData.items = (finalData.items || []).map(item => ({
                 ...item,
                 cantidad: parseInt(item.cantidad) || 0,
                 costoUnidad: parseFloat(item.costoUnidad) || 0,
                 subtotalLinea: parseFloat(item.subtotalLinea) || 0,
             }));

            await createOrUpdateDoc('purchaseOrders', finalData, selectedItem?.id);
            setIsModalOpen(false);
            setSelectedItem(null);
            console.log("SUCCESS: Orden de compra guardada.");
        } catch (error) {
            console.error("ERROR al guardar la orden de compra:", error);
            alert(`Error al guardar la orden de compra: ${error.message}`);
        }
    };

    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    const handlePrint = () => window.print();

    const sortedPurchaseOrders = useMemo(() => purchaseOrders.slice().sort((a, b) => (b.timestamp?.toDate()?.getTime() || 0) - (a.timestamp?.toDate()?.getTime() || 0)), [purchaseOrders]);

    const getProviderForPO = useCallback((po) => {
        return providers.find(p => p.id === po.proveedorId);
    }, [providers]);

    const generatePurchaseOrderLink = (provider, po) => {
        if (!provider) return { whatsapp: null, email: null };

        const poDate = po.timestamp ? po.timestamp.toDate().toLocaleDateString() : 'N/A';
        const formattedCost = FORMAT_CURRENCY(po.costoTotal);

        let subject = `ORDEN DE COMPRA #${po.id?.slice(0,5) || po.nombreProveedor} - DistriFort`;
        let body = `Estimado(a) ${provider.Nombre || 'Proveedor'},\n\n`;
        body += `Adjunto la Orden de Compra (OC) de DistriFort con fecha ${poDate}.\n`;
        body += `*Costo Total Estimado: ${formattedCost}*\n\n`;
        body += `*Detalle de Productos:*\n`;

        (po.items || []).forEach(item => {
            body += `- ${item.cantidad}x ${item.nombreProducto} (Costo Un: ${FORMAT_CURRENCY(item.costoUnidad)})\n`;
        });
        body += `\nEstado: ${po.estado}.\n\nPor favor, confirme la recepción y la fecha de entrega.\n\nSaludos,\nDistriFort`;

        const emailLink = provider.Email ? `mailto:${provider.Email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;

        const cleanPhone = provider.Telefono ? provider.Telefono.replace(/\D/g, '') : null;
        const phoneNumber = cleanPhone && cleanPhone.length >= 10 ? `549${cleanPhone}` : cleanPhone;
        const whatsappLink = phoneNumber ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(body)}` : null;

        return { whatsapp: whatsappLink, email: emailLink };
    };

    return (<div className="space-y-6">
        <PageHeader title="Órdenes de Compra">
            <Button onClick={handleAddNew} icon={Plus}>Añadir Orden de Compra</Button>
        </PageHeader>
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nueva ") + "Orden de Compra"} onClose={() => setIsModalOpen(false)}>
            <PurchaseOrderForm
                model={selectedItem || PURCHASE_ORDER_MODEL}
                onSave={handleSave}
                onCancel={() => setIsModalOpen(false)}
                products={products}
                providers={providers}
            />
        </Modal>}

        {selectedItem && (
             <div className="hidden no-print">
                 <PurchaseOrderPrintable ref={componentRef} po={selectedItem} provider={getProviderForPO(selectedItem)} />
             </div>
        )}

        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {["Proveedor", "Costo Total", "Estado", "Fecha"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {sortedPurchaseOrders.map(item => {
                        const provider = getProviderForPO(item);
                        const communicationLinks = generatePurchaseOrderLink(provider, item);

                        return (<tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 font-semibold">{item.nombreProveedor || provider?.Nombre || 'N/A'}</td>
                            <td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.costoTotal)}</td>
                            <td className={`px-4 py-4 font-medium`}>
                                 <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.estado === 'Recibido' ? 'bg-green-100 text-green-800' : item.estado === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{item.estado}</span>
                            </td>
                            <td className="px-4 py-4 text-sm">{item.timestamp ? item.timestamp.toDate().toLocaleDateString() : 'N/A'}</td>
                            <td className="px-4 py-4 text-right space-x-2 flex justify-end">
                                <Button onClick={() => { setSelectedItem(item); setTimeout(handlePrint, 50); }} className="!p-2 !bg-blue-500 hover:!bg-blue-600" icon={Printer} title="Imprimir / Guardar PDF"/>
                                {communicationLinks.whatsapp && (
                                    <a
                                        href={communicationLinks.whatsapp}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center !p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition"
                                        title="Enviar por WhatsApp"
                                    >
                                        <Send className="w-4 h-4"/>
                                    </a>
                                )}
                                {communicationLinks.email && (
                                    <a
                                        href={communicationLinks.email}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center !p-2 !bg-gray-500 hover:!bg-gray-600 rounded-lg text-white transition"
                                        title="Enviar por Email"
                                    >
                                        <Mail className="w-4 h-4"/>
                                    </a>
                                )}
                                <Button onClick={() => handleEdit(item)} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
                                <Button onClick={() => archiveDoc('purchaseOrders', item.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
                            </td>
                        </tr>);
                    })}
                </tbody>
            </table>
        </div>
    </div>);
};

const PriceListItemsTable = ({ items, products, onPriceChange, onRemoveItem }) => {
    return (
        <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-gray-600">
                        <th className="py-2 px-1">Producto</th>
                        <th className="py-2 px-1 w-32 text-right">Precio Lista ($)</th>
                        <th className="py-2 px-1 w-10"></th>
                    </tr>
                </thead>
                <tbody>
                    {(items || []).map((item, index) => {
                         const productInfo = products.find(p => p.id === item.productId);
                         return (
                            <tr key={item.productId || index} className="border-b hover:bg-white">
                                <td className="py-2 px-1 font-medium text-gray-800">
                                    {item.nombreProducto}
                                    {productInfo && <span className="text-xs text-gray-500 ml-2">({productInfo.bodega})</span>}
                                </td>
                                <td className="py-2 px-1">
                                    <input
                                        type="number" step="any"
                                        value={item.precioLista || ''}
                                        onChange={e => onPriceChange(index, parseFloat(e.target.value) || 0)}
                                        className="w-full p-1 border rounded text-right"
                                    />
                                </td>
                                <td className="py-2 px-1 text-right">
                                    <button type="button" onClick={() => onRemoveItem(index)} className="text-red-500 hover:text-red-700">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                         );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const PriceListPrintable = React.forwardRef(({ products, client }, ref) => {
    // Necesitamos obtener PrintableDocument del contexto
    const { PrintableDocument } = useData();
    return (
    <PrintableDocument ref={ref} title={`LISTA DE PRECIOS (${client?.nombre || 'General'})`}>
        <div className="text-sm space-y-4">
            {client && <h3 className="text-lg font-bold">Cliente: {client.nombre} ({client.regimen})</h3>}
            <p className="mb-4">Mostrando precios de: **Precio Unidad**</p>

            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100 font-semibold">
                        <td className="p-2 border">Producto</td>
                        <td className="p-2 border">Bodega</td>
                        <td className="p-2 border text-right">Precio Unitario</td>
                        <td className="p-2 border text-right">Stock (Uds)</td>
                    </tr>
                </thead>
                <tbody>
                    {(products || []).map((p) => (
                        <tr key={p.id}>
                            <td className="p-2 border">{p.nombre}</td>
                            <td className="p-2 border">{p.bodega}</td>
                            <td className="p-2 border text-right">{FORMAT_CURRENCY(p.precioUnidad)}</td>
                            <td className="p-2 border text-right">{p.stockTotal}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </PrintableDocument>
    );
});


const PriceListManager = () => {
    const { products = [], clients = [], pricelists = [], createOrUpdateDoc, archiveDoc, PrintableDocument } = useData();
    const [selectedListId, setSelectedListId] = useState(null);
    const [editingList, setEditingList] = useState(null);
    const [newListName, setNewListName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [productToAddId, setProductToAddId] = useState('');
    const componentRef = useRef();
     const [clientForPDF, setClientForPDF] = useState(null);

    useEffect(() => {
        if (selectedListId) {
            const listData = pricelists.find(pl => pl.id === selectedListId);
            if (listData) {
                setEditingList({ ...listData, items: [...(listData.items || [])] });
            } else {
                setEditingList(null);
            }
        } else {
            setEditingList(null);
        }
    }, [selectedListId, pricelists]);

    const handleCreateNewList = async () => {
        if (!newListName.trim()) return alert("El nombre de la lista no puede estar vacío.");
        try {
            const newListData = { nombre: newListName.trim(), items: [], archivado: false };
            const newId = await createOrUpdateDoc('pricelists', newListData, null);
            setSelectedListId(newId);
            setNewListName('');
            setIsCreating(false);
        } catch (error) {
            alert(`Error al crear la lista: ${error.message}`);
        }
    };

    const handlePriceChange = (index, newPrice) => {
        if (!editingList) return;
        const updatedItems = [...editingList.items];
        updatedItems[index].precioLista = newPrice;
        setEditingList({ ...editingList, items: updatedItems });
    };

    const handleAddItemToList = () => {
        if (!editingList || !productToAddId) return;
        const product = products.find(p => p.id === productToAddId);
        if (!product || editingList.items.some(item => item.productId === productToAddId)) {
            setProductToAddId('');
            return;
        }

        const newItem = {
            productId: product.id,
            nombreProducto: product.nombre,
            precioLista: product.precioUnidad || 0
        };

        setEditingList({ ...editingList, items: [...editingList.items, newItem] });
        setProductToAddId('');
    };

    const handleRemoveItemFromList = (index) => {
        if (!editingList) return;
        const updatedItems = editingList.items.filter((_, i) => i !== index);
        setEditingList({ ...editingList, items: updatedItems });
    };

    const handleSavePriceList = async () => {
        if (!editingList || !selectedListId) return;
        try {
            const dataToSave = {
                nombre: editingList.nombre,
                items: editingList.items.map(item => ({
                    productId: item.productId,
                    nombreProducto: item.nombreProducto,
                    precioLista: parseFloat(item.precioLista) || 0,
                })),
                archivado: false,
            };
            await createOrUpdateDoc('pricelists', dataToSave, selectedListId);
            alert(`Lista "${editingList.nombre}" guardada.`);
        } catch (error) {
            alert(`Error al guardar la lista: ${error.message}`);
        }
    };

     const handleArchiveList = async (listIdToArchive) => {
        if (!listIdToArchive) return;
        if (confirm("¿Estás seguro de que quieres archivar esta lista de precios?")) {
            try {
                await archiveDoc('pricelists', listIdToArchive);
                if (selectedListId === listIdToArchive) {
                    setSelectedListId(null);
                }
                alert("Lista de precios archivada.");
            } catch (error) {
                alert(`Error al archivar la lista: ${error.message}`);
            }
        }
    };

     const availableProductsToAdd = useMemo(() => {
         if (!editingList) return products;
         const currentProductIds = new Set((editingList.items || []).map(item => item.productId));
         return products.filter(p => !currentProductIds.has(p.id));
     }, [products, editingList]);

    const handlePrintForClient = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            setClientForPDF(client);
            setTimeout(() => window.print(), 100);
        }
    };


    if (editingList) {
        return (
            <div className="space-y-6">
                 <PageHeader title={`Editando Lista: ${editingList.nombre}`}>
                     <div className="flex space-x-2">
                         <Button onClick={() => setSelectedListId(null)} className="!bg-gray-500 hover:!bg-gray-600">Volver a Listas</Button>
                         <Button onClick={handleSavePriceList} icon={Save} className="!bg-green-600 hover:!bg-green-700">Guardar Cambios</Button>
                     </div>
                 </PageHeader>
                 <div className="bg-white p-4 rounded-lg shadow space-y-2">
                     <h4 className="font-semibold">Añadir Producto a la Lista</h4>
                     <div className="flex space-x-2">
                         <Select
                             label=""
                             name="productToAdd"
                             value={productToAddId}
                             onChange={e => setProductToAddId(e.target.value)}
                             className="flex-1"
                         >
                             <option value="">-- Seleccionar producto del inventario --</option>
                             {availableProductsToAdd.map(p => (
                                 <option key={p.id} value={p.id}>
                                     {p.nombre} ({p.bodega}) - Precio Base: {FORMAT_CURRENCY(p.precioUnidad)}
                                 </option>
                             ))}
                         </Select>
                         <Button onClick={handleAddItemToList} disabled={!productToAddId} icon={Plus} className="self-end !px-3 !py-2">Añadir</Button>
                     </div>
                 </div>
                 <div className="bg-white p-4 rounded-lg shadow">
                     <h4 className="font-semibold mb-2">Items en "{editingList.nombre}" ({(editingList.items || []).length})</h4>
                     <PriceListItemsTable
                         items={editingList.items}
                         products={products}
                         onPriceChange={handlePriceChange}
                         onRemoveItem={handleRemoveItemFromList}
                     />
                 </div>
            </div>
        );
    } else {
        return (
            <div className="space-y-6">
                <PageHeader title="Gestionar Listas de Precios">
                    {!isCreating && <Button onClick={() => setIsCreating(true)} icon={Plus}>Crear Nueva Lista</Button>}
                </PageHeader>
                {isCreating && (
                    <div className="bg-white p-4 rounded-lg shadow flex space-x-2 items-end">
                         <Input
                             label="Nombre de la Nueva Lista"
                             value={newListName}
                             onChange={e => setNewListName(e.target.value)}
                             placeholder="Ej: Lista Noviembre 2025"
                             className="flex-1"
                         />
                         <Button onClick={handleCreateNewList} icon={Save}>Crear</Button>
                         <Button onClick={() => setIsCreating(false)} className="!bg-gray-300 !text-gray-700">Cancelar</Button>
                    </div>
                )}
                <div className="bg-white p-4 rounded-lg shadow">
                     <h3 className="text-lg font-semibold mb-3">Listas Existentes</h3>
                     {(pricelists || []).length === 0 && (
                         <p className="text-gray-500">No hay listas de precios creadas.</p>
                     )}
                     <div className="space-y-2">
                        {(pricelists || []).map(list => (
                            <div key={list.id} className="flex justify-between items-center p-3 border rounded-lg hover:bg-gray-50">
                                <div>
                                     <p className="font-semibold">{list.nombre}</p>
                                     <p className="text-xs text-gray-500">Items: {(list.items || []).length}</p>
                                </div>
                                <div className="space-x-2">
                                     <Button onClick={() => setSelectedListId(list.id)} icon={Edit} className="!p-2">Editar</Button>
                                     <Button onClick={() => handleArchiveList(list.id)} icon={Trash2} className="!p-2 !bg-red-500 hover:!bg-red-600">Archivar</Button>
                                </div>
                            </div>
                        ))}
                     </div>
                </div>
                 <div className="bg-white p-4 rounded-lg shadow">
                      <h3 className="text-lg font-semibold mb-3">Imprimir / Enviar Lista General</h3>
                      <p className="text-sm text-gray-600 mb-3">Selecciona un cliente para generar una lista de precios con los precios unitarios base.</p>
                       <Select label="Seleccionar Cliente" name="clientForPDF" value={clientForPDF?.id || ''} onChange={e => setClientForPDF(clients.find(c => c.id === e.target.value))}>
                           <option value="">-- Seleccionar Cliente --</option>
                           {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.regimen})</option>)}
                       </Select>
                       {clientForPDF && (
                           <div className="mt-4 flex space-x-2">
                               <Button onClick={() => window.print()} icon={Printer}>Imprimir para {clientForPDF.nombre}</Button>
                           </div>
                       )}
                 </div>
                 {clientForPDF && (
                     <div className="hidden no-print">
                         <PriceListPrintable ref={componentRef} products={products} client={clientForPDF} />
                     </div>
                 )}
            </div>
        );
    }
};

const PriceListImporter = () => {
    const { providers = [], products = [], createOrUpdateDoc } = useData();
    const [providerId, setProviderId] = useState('');
    const [listText, setListText] = useState('');
    const [loading, setLoading] = useState(false);
    const [importLog, setImportLog] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!providerId) return setImportLog("Error: Debes seleccionar un proveedor.");
        if (!listText.trim()) return setImportLog("Error: El campo de texto de la lista está vacío.");

        setLoading(true);
        setImportLog("1. Estructurando datos con IA...");

        const aiPrompt = `Actúa como un parser de datos. Transforma la siguiente lista de precios en un ARRAY JSON de objetos. Cada objeto debe tener las claves "nombre", "costo" y "precioUnidad". Solo devuelve el JSON puro. Si un valor falta, usa 0 o null. Texto:\n\n${listText}`;

        let jsonResponse;
        try {
            const model = 'gemini-2.5-flash-preview-05-20';
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: aiPrompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "ARRAY",
                            items: {
                                type: "OBJECT",
                                properties: {
                                    "nombre": { "type": "STRING" },
                                    "costo": { "type": "NUMBER" },
                                    "precioUnidad": { "type": "NUMBER" }
                                },
                            }
                        }
                    }
                }),
            });

            if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(`Error ${response.status}: ${errorData?.error?.message || 'Fallo en API IA'}`);
            }

            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!jsonText) throw new Error("La IA no devolvió JSON.");

            jsonResponse = JSON.parse(jsonText);
            if (!Array.isArray(jsonResponse)) throw new Error("La respuesta de la IA no es un array JSON.");

            setImportLog("2. Datos estructurados. Procesando importación...");
        } catch (e) {
            console.error("AI/JSON Parsing Error:", e);
            setImportLog(`Error procesando con IA: ${e.message}. Asegúrate de que el formato sea claro.`);
            setLoading(false);
            return;
        }

        const providerName = providers.find(p => p.id === providerId)?.Nombre || 'Desconocido';
        let updatesCount = 0;
        let errors = [];

        for (const item of jsonResponse) {
            if (!item.nombre || item.costo === undefined || item.precioUnidad === undefined) {
                errors.push(`Saltando ítem incompleto: ${JSON.stringify(item)}`);
                continue;
            }

            try {
                const existingProduct = products.find(p => p.nombre?.toLowerCase().trim() === item.nombre?.toLowerCase().trim());

                if (existingProduct) {
                    await createOrUpdateDoc('products', {
                        costo: parseFloat(item.costo) || 0,
                        precioUnidad: parseFloat(item.precioUnidad) || 0,
                        proveedorId: providerId,
                    }, existingProduct.id);
                } else {
                    await createOrUpdateDoc('products', {
                        ...PRODUCT_MODEL,
                        nombre: item.nombre.trim(),
                        costo: parseFloat(item.costo) || 0,
                        precioUnidad: parseFloat(item.precioUnidad) || 0,
                        proveedorId: providerId,
                        bodega: providerName,
                        archivado: false,
                    }, null);
                }
                updatesCount++;
            } catch (dbError) {
                 console.error("Error guardando producto:", dbError, item);
                 errors.push(`Error al guardar ${item.nombre}: ${dbError.message}`);
            }
        }

        let logMessage = `Éxito: Se procesaron ${updatesCount} ítems.`;
        if (errors.length > 0) {
            logMessage += `\nErrores (${errors.length}):\n${errors.join('\n')}`;
        }
        setImportLog(logMessage);
        setLoading(false);
        setListText('');
    };

    return (
        <div className="space-y-6">
            <PageHeader title="Importador de Listas de Precios (IA)">
                <p className="text-sm text-gray-500">Convierte texto de listas en datos de productos.</p>
            </PageHeader>
            <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Select label="Proveedor de la Lista" name="providerId" value={providerId} onChange={e => setProviderId(e.target.value)} required>
                        <option value="">-- Seleccione el Proveedor --</option>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.Nombre}</option>)}
                    </Select>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Pegar Contenido de la Lista (Texto)</label>
                        <textarea
                            value={listText}
                            onChange={e => setListText(e.target.value)}
                            rows="10"
                            placeholder="Copia y pega el texto aquí (nombre, costo, precio)."
                            className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            required
                        />
                    </div>
                    <Button type="submit" icon={Upload} disabled={loading || !providerId || !listText.trim()}>
                        {loading ? 'Procesando con IA...' : 'Importar Productos y Precios'}
                    </Button>
                </form>
                {importLog && (
                    <div className={`p-4 rounded-lg text-sm whitespace-pre-wrap ${importLog.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        <h4 className="font-bold">Registro de Importación:</h4>
                        <p>{importLog}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
const GlobalSearch = () => {
    const { products = [], clients = [], orders = [] } = useData();
    const [term, setTerm] = useState('');
    const results = useMemo(() => {
        if (!term) return {};
        const lowerTerm = term.toLowerCase();
        return {
            products: products.filter(p => p.nombre?.toLowerCase().includes(lowerTerm)),
            clients: clients.filter(c => c.nombre?.toLowerCase().includes(lowerTerm)),
            orders: orders.filter(o => o.nombreCliente?.toLowerCase().includes(lowerTerm) || o.id?.includes(term)),
        };
    }, [term, products, clients, orders]);
    return (<div className="space-y-6">
        <PageHeader title="Búsqueda Global" />
        <Input placeholder="Buscar productos, clientes, pedidos por nombre o ID..." value={term} onChange={e => setTerm(e.target.value)} icon={Search} />
        {term && Object.entries(results).map(([key, value]) => value.length > 0 && (
            <div key={key} className="bg-white p-4 rounded-xl shadow-md">
                <h3 className="text-lg font-bold text-indigo-600 mb-2">{key.charAt(0).toUpperCase() + key.slice(1)} ({value.length})</h3>
                <ul className="space-y-1 max-h-60 overflow-y-auto">
                    {value.map(item => (
                        <li key={item.id} className="text-gray-700 p-2 border-b last:border-b-0 hover:bg-gray-50 rounded-md">
                           {key === 'products' && `${item.nombre} (${item.bodega}) - Stock: ${item.stockTotal}`}
                           {key === 'clients' && `${item.nombre} - Tel: ${item.telefono || 'N/A'}`}
                           {key === 'orders' && `Pedido ${item.id.slice(0,5)} - ${item.nombreCliente} (${FORMAT_CURRENCY(item.total)})`}
                        </li>
                    ))}
                </ul>
            </div>
        ))}
         {term && Object.values(results).every(arr => arr.length === 0) && (
             <div className="text-center text-gray-500 py-6">No se encontraron resultados para "{term}".</div>
         )}
        </div>);
};
const ShippingQuoter = () => {
    const [distance, setDistance] = useState('');
    const [weight, setWeight] = useState('');

    const { totalCost, baseRate, ratePerKm, ratePerKg } = useMemo(() => {
        const BASE_RATE = 1500;
        const RATE_PER_KM = 25;
        const RATE_PER_KG = 5;

        const dist = parseFloat(distance) || 0;
        const wgt = parseFloat(weight) || 0;

        const cost = (dist > 0 || wgt > 0) ? BASE_RATE + (dist * RATE_PER_KM) + (wgt * RATE_PER_KG) : 0;

        return {
            totalCost: cost,
            baseRate: BASE_RATE,
            ratePerKm: RATE_PER_KM,
            ratePerKg: RATE_PER_KG
        };
    }, [distance, weight]);

    return (
        <div className="space-y-6">
            <PageHeader title="Calculadora de Costos de Envío">
                <p className="text-sm text-gray-500">Estimación basada en distancia y peso.</p>
            </PageHeader>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md space-y-4">
                    <h4 className="text-xl font-semibold text-gray-700 flex items-center space-x-2"><MapPin className="w-6 h-6"/><span>Parámetros del Envío</span></h4>
                    <Input
                        label="Distancia del Envío (km)"
                        type="number"
                        value={distance}
                        onChange={e => setDistance(e.target.value)}
                        placeholder="ej: 150"
                        required
                    />
                    <Input
                        label="Peso Total de la Carga (kg)"
                        type="number"
                        value={weight}
                        onChange={e => setWeight(e.target.value)}
                        placeholder="ej: 500"
                        required
                    />
                    <div className="text-sm text-gray-600 pt-4 border-t">
                        <p className="font-semibold">Tarifas usadas:</p>
                        <p>Base: {FORMAT_CURRENCY(baseRate)}</p>
                        <p>Por km: {FORMAT_CURRENCY(ratePerKm)}</p>
                        <p>Por kg: {FORMAT_CURRENCY(ratePerKg)}</p>
                    </div>
                </div>
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-md space-y-4 border-l-4 border-indigo-600">
                    <h4 className="text-xl font-semibold text-indigo-600 flex items-center space-x-2">
                        <Truck className="w-6 h-6" />
                        <span>Costo Estimado</span>
                    </h4>
                    <p className="text-5xl font-bold text-gray-800">{FORMAT_CURRENCY(totalCost)}</p>
                    <div className="text-base text-gray-700 space-y-1 pt-4 border-t">
                        <p>Costo por Distancia ({distance || 0} km): <span className="font-semibold">{FORMAT_CURRENCY((parseFloat(distance) || 0) * ratePerKm)}</span></p>
                        <p>Costo por Peso ({weight || 0} kg): <span className="font-semibold">{FORMAT_CURRENCY((parseFloat(weight) || 0) * ratePerKg)}</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
};
const Calculators = () => {
    const [costoMargen, setCostoMargen] = useState('');
    const [precioVentaMargen, setPrecioVentaMargen] = useState('');
    const margenCalculado = useMemo(() => {
        const costo = parseFloat(costoMargen);
        const venta = parseFloat(precioVentaMargen);
        if (!isNaN(costo) && !isNaN(venta) && venta > 0 && costo >= 0) {
            const ganancia = venta - costo;
            const margen = (ganancia / venta) * 100;
            return margen.toFixed(2);
        }
        return null;
    }, [costoMargen, precioVentaMargen]);

    const [unidadesConvertir, setUnidadesConvertir] = useState('');
    const [udsPorCajaConvertir, setUdsPorCajaConvertir] = useState(6);
    const conversionResultado = useMemo(() => {
        const unidades = parseInt(unidadesConvertir);
        const porCaja = parseInt(udsPorCajaConvertir);
        if (!isNaN(unidades) && !isNaN(porCaja) && porCaja > 0 && unidades >= 0) {
            const cajasCompletas = Math.floor(unidades / porCaja);
            const unidadesSueltas = unidades % porCaja;
            return `${cajasCompletas} caja(s) y ${unidadesSueltas} unidad(es)`;
        }
        return null;
    }, [unidadesConvertir, udsPorCajaConvertir]);

     return (
         <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-gray-700">Calculadora de Margen (%)</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <Input
                        label="Costo Unitario ($)"
                        type="number" value={costoMargen}
                        onChange={(e) => setCostoMargen(e.target.value)}
                        placeholder="Ej: 1000"
                    />
                    <Input
                        label="Precio Venta Unitario ($)"
                        type="number" value={precioVentaMargen}
                        onChange={(e) => setPrecioVentaMargen(e.target.value)}
                        placeholder="Ej: 1500"
                    />
                    <div className="bg-gray-50 p-4 rounded-md text-center h-full flex flex-col justify-center">
                        <p className="text-sm font-medium text-gray-500 mb-1">Margen</p>
                        {margenCalculado !== null ? (
                             <p className={`text-2xl font-bold ${margenCalculado < 0 ? 'text-red-500' : 'text-green-600'}`}>
                                {margenCalculado}%
                            </p>
                        ) : <p className="text-gray-400">-</p>}
                    </div>
                </div>
            </div>
             <div className="bg-white p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold mb-4 text-gray-700">Convertidor Unidades a Cajas</h3>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                     <Input
                        label="Total Unidades" type="number"
                        value={unidadesConvertir}
                        onChange={(e) => setUnidadesConvertir(e.target.value)}
                        placeholder="Ej: 25"
                    />
                    <Input
                        label="Unidades por Caja" type="number"
                        value={udsPorCajaConvertir}
                        onChange={(e) => setUdsPorCajaConvertir(e.target.value)}
                        placeholder="Ej: 6"
                    />
                     <div className="bg-gray-50 p-4 rounded-md text-center h-full flex flex-col justify-center">
                        <p className="text-sm font-medium text-gray-500 mb-1">Resultado</p>
                        {conversionResultado !== null ? (
                             <p className="text-lg font-bold text-indigo-600">
                                {conversionResultado}
                            </p>
                        ) : <p className="text-gray-400">-</p>}
                    </div>
                 </div>
             </div>
         </div>
     );
};
const PromotionGenerator = () => {
    const { products = [] } = useData();
    const [prompt, setPrompt] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [generationMode, setGenerationMode] = useState('promo');

    const suggestPromotion = () => {
        const highStockProducts = products.filter(p => p.stockTotal > 30);
        if (highStockProducts.length >= 2) {
            const p1 = highStockProducts[Math.floor(Math.random() * highStockProducts.length)];
            let p2 = highStockProducts[Math.floor(Math.random() * highStockProducts.length)];
            while (p2.id === p1.id) {
                 p2 = highStockProducts[Math.floor(Math.random() * highStockProducts.length)];
            }
            setPrompt(`Oferta especial: Compra ${p1.nombre} y llévate un ${p2.nombre} con 15% de descuento. Imagen de ambas botellas juntas.`);
        } else if (highStockProducts.length === 1) {
             setPrompt(`Promoción imperdible para ${highStockProducts[0].nombre}. Descuento del 10%. Imagen de la botella con etiqueta de oferta.`);
        }
         else {
            setPrompt("Imagen genérica de oferta de vinos y bebidas variadas.");
        }
        setGenerationMode('promo');
    };

    const handleGenerateImage = async (e) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setLoading(true);
        setError('');

        let finalPrompt = prompt;
        if (generationMode === 'promo') {
            finalPrompt += `, estilo publicitario para redes sociales, colores vibrantes, enfocado en bebidas/distribución.`;
        } else {
             finalPrompt += `, tarjeta de saludo, estilo festivo/elegante según el mensaje.`;
        }

        try {
            const model = 'imagen-3.0-generate-002';
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
            const payload = { instances: { prompt: finalPrompt }, parameters: { "sampleCount": 1 } };

            let retries = 0;
            let response;
            while (retries < 3) {
                response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (response.ok) break;
                if (response.status === 429 || response.status >= 500) {
                    retries++;
                    const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000;
                    console.warn(`Intento ${retries} fallido (${response.status}). Reintentando en ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                     const errorData = await response.json();
                     throw new Error(errorData.error?.message || `Error ${response.status} en la API de Imagen.`);
                }
            }

             if (!response.ok) {
                 const errorData = await response.json();
                 throw new Error(errorData.error?.message || `Error ${response.status} tras reintentos.`);
             }

            const data = await response.json();
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) throw new Error("La IA no generó una imagen válida.");
            setImageUrl(`data:image/png;base64,${base64Data}`);

        } catch (e) {
            setError(`Error al generar: ${e.message}. Intenta de nuevo o ajusta la descripción.`);
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = () => {
        if (imageUrl) {
            const link = document.createElement('a');
            link.href = imageUrl;
            link.download = `${generationMode}_distrifort_ia.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const handleShare = () => {
        if (!imageUrl) return;
        const shareMessage = encodeURIComponent(`¡Mira esta ${generationMode === 'promo' ? 'promoción' : 'salutación'} especial de DistriFort!\n\n${prompt}\n\n(Puedes descargar la imagen desde la app)`);
        const whatsappLink = `https://wa.me/?text=${shareMessage}`;
        window.open(whatsappLink, '_blank');
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="text-xl font-semibold text-indigo-600 flex items-center space-x-2">
                        <ImageIcon className="w-6 h-6"/>
                        <span>Generador Visual con IA</span>
                    </h4>
                    <div className="flex space-x-2">
                        <Button
                            onClick={() => {setGenerationMode('promo'); setPrompt(''); setImageUrl(''); setError('')}}
                            className={generationMode === 'promo' ? '' : '!bg-gray-200 !text-gray-700'}
                            size="sm"
                        >Promoción</Button>
                        <Button
                            onClick={() => {setGenerationMode('greeting'); setPrompt(''); setImageUrl(''); setError('')}}
                            className={generationMode === 'greeting' ? '' : '!bg-gray-200 !text-gray-700'}
                            size="sm"
                        >Saludo</Button>
                    </div>
                </div>

                <form onSubmit={handleGenerateImage} className="space-y-3">
                    {generationMode === 'promo' && (
                        <p className="text-sm text-gray-600">
                            Describe la promoción (ej: "Botella Malbec con 20% OFF") o
                            <button type="button" onClick={suggestPromotion} className="text-indigo-600 hover:underline ml-1 font-medium">
                                sugiere una basada en stock.
                            </button>
                        </p>
                    )}
                     {generationMode === 'greeting' && (
                        <p className="text-sm text-gray-600">
                            Escribe el mensaje de saludo (ej: "Felices Fiestas les desea DistriFort").
                        </p>
                    )}

                    <div className="flex space-x-3">
                        <Input
                            name="imagePrompt"
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder={generationMode === 'promo' ? "Describe tu imagen promocional..." : "Escribe tu mensaje de saludo..."}
                            className="flex-1"
                            required
                        />
                        <Button type="submit" disabled={!prompt.trim() || loading} icon={ImageIcon}>
                            {loading ? 'Creando...' : 'Generar Imagen'}
                        </Button>
                    </div>
                </form>

                {error && <div className="text-red-500 text-sm mt-2">{error}</div>}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-xl">
                <h4 className="text-lg font-semibold text-gray-700 mb-4">Resultado</h4>
                {loading && <PageLoader text="Generando imagen..." /> }
                {!loading && imageUrl && (
                    <div className="space-y-4">
                        <img src={imageUrl} alt="Imagen Generada por IA" className="w-full max-w-lg mx-auto rounded-xl shadow-lg border" />
                        <div className="flex flex-wrap justify-center gap-4">
                             <Button onClick={handleGenerateImage} disabled={loading} icon={ImageIcon} className="!bg-orange-500 hover:!bg-orange-600">
                                Generar Otra
                             </Button>
                             <Button onClick={handleDownload} className="!bg-blue-500 hover:!bg-blue-600">Descargar PNG</Button>
                             <Button onClick={handleShare} icon={Send} className="!bg-green-500 hover:!bg-green-600">Compartir (WhatsApp)</Button>
                        </div>
                    </div>
                )}
                 {!loading && !imageUrl && (
                    <div className="text-center text-gray-500 py-10">La imagen generada aparecerá aquí.</div>
                )}
            </div>
        </div>
    );
};
const Tools = () => {
    const [subPage, setSubPage] = useState('calculator');

    return (
        <div className="space-y-6">
            <PageHeader title="Herramientas de Distribución">
                 <div className="flex flex-wrap gap-3">
                    <Button
                        onClick={() => setSubPage('calculator')}
                        className={subPage === 'calculator' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'}
                        icon={DollarSign}
                    >Calculadoras</Button>
                    <Button
                        onClick={() => setSubPage('promoGen')}
                        className={subPage === 'promoGen' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'}
                        icon={ImageIcon}
                    >Generador Visual IA</Button>
                </div>
            </PageHeader>
            <div>
                {subPage === 'calculator' && <Calculators />}
                {subPage === 'promoGen' && <PromotionGenerator />}
            </div>
        </div>
    );
};


// --- 9. COMPONENTES PRINCIPALES (APP Y NAVEGACIÓN) ---
const Sidebar = ({ currentPage, setCurrentPage, logout }) => {
    const navItems = [
        { id: 'dashboard', label: 'Resumen', icon: LayoutDashboard },
        { id: 'inventory', label: 'Inventario', icon: Package },
        { id: 'clients', label: 'Clientes', icon: Users },
        { id: 'providers', label: 'Proveedores', icon: Building },
        { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
        { id: 'purchaseOrders', label: 'Órdenes de Compra', icon: Truck },
        { id: 'pricelists', label: 'Lista de Precios', icon: FileText },
        { id: 'iaImporter', label: 'Importar Lista (IA)', icon: BrainCircuit },
        { id: 'search', label: 'Buscar', icon: Search },
        { id: 'tools', label: 'Herramientas', icon: Code },
        { id: 'quoter', label: 'Cotización', icon: Printer },
    ];

    const NavItem = ({ id, label, icon: Icon }) => {
        const isActive = currentPage === id;
        return (
            <button
                onClick={() => setCurrentPage(id)}
                className={`flex items-center w-full px-4 py-3 space-x-3 rounded-lg transition-all duration-200 ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
            >
                <Icon className="w-6 h-6" />
                <span className="font-semibold">{label}</span>
            </button>
        );
    };

    return (
        <div className="w-64 h-full bg-white shadow-2xl p-4 flex flex-col">
            <h1 className="text-3xl font-bold text-indigo-700 px-2 mb-6">DistriFort</h1>
            <nav className="flex-1 space-y-2 overflow-y-auto">
                {navItems.map(item => <NavItem key={item.id} {...item} />)}
            </nav>
            <div className="mt-6">
                <button
                    onClick={logout}
                    className="flex items-center w-full px-4 py-3 space-x-3 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
                >
                    <LogOut className="w-6 h-6" />
                    <span className="font-semibold">Cerrar Sesión</span>
                </button>
            </div>
        </div>
    );
};
const MainContent = ({ currentPage, setCurrentPage }) => {
    const renderPage = () => {
        switch (currentPage) {
            case 'dashboard': return <Dashboard setCurrentPage={setCurrentPage} />;
            case 'inventory': return <ProductManager />;
            case 'clients': return <ClientManager />;
            case 'providers': return <ProviderManager />;
            case 'orders': return <OrderManager setCurrentPage={setCurrentPage} />;
            case 'purchaseOrders': return <PurchaseOrderManager />;
            case 'pricelists': return <PriceListManager />;
            case 'iaImporter': return <PriceListImporter />;
            case 'search': return <GlobalSearch />;
            case 'tools': return <Tools />;
            case 'quoter': return <ShippingQuoter />;
            default:
                console.warn(`Página no encontrada: ${currentPage}, mostrando Dashboard.`);
                return <Dashboard setCurrentPage={setCurrentPage} />;
        }
    };

    return (
        <main className="flex-1 p-6 md:p-10 bg-gray-50 min-h-screen overflow-y-auto">
            {renderPage()}
        </main>
    );
};
const AppContent = () => {
    const { userId, isAuthReady, loading, logout } = useData();
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // console.log(`DEBUG: AppContent - loading: ${loading}, isAuthReady: ${isAuthReady}, userId: ${userId}`);

    if (loading || !isAuthReady) {
        // console.log("DEBUG: AppContent - Renderizando PageLoader...");
        return <PageLoader text="Cargando DistriFort..." />;
    }

    if (!userId && isAuthReady) {
         console.error("AppContent: Auth listo pero sin userId. Verifica la lógica de autenticación en useAuth.");
         return <PageLoader text="Error de autenticación. Revisa la consola." />;
    }

    // console.log("DEBUG: AppContent - Renderizando contenido principal...");
    return (
        <div className="flex w-full min-h-screen font-inter antialiased overflow-x-hidden relative">
            <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="fixed top-4 left-4 z-30 lg:hidden p-2 bg-indigo-600 text-white rounded-lg shadow-lg"
            >
                {isMobileMenuOpen ? <X /> : <List />}
            </button>

            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-10 lg:hidden"
                    onClick={() => setIsMobileMenuOpen(false)}
                ></div>
            )}

            <div className={`fixed lg:static top-0 left-0 h-full z-20 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 transition-transform duration-300 ease-in-out w-64`}>
                <Sidebar
                    currentPage={currentPage}
                    setCurrentPage={(page) => {
                        setCurrentPage(page);
                        setIsMobileMenuOpen(false);
                    }}
                    logout={logout}
                />
            </div>

            <div className="flex-1 lg:ml-64 transition-all duration-300 ease-in-out">
                <MainContent currentPage={currentPage} setCurrentPage={setCurrentPage} />
            </div>
        </div>
    );
};
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error: error };
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo: errorInfo });
        console.error("Error capturado por ErrorBoundary:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="w-full min-h-screen flex items-center justify-center bg-red-50 p-4 font-inter">
                    <div className="bg-white p-8 rounded-lg shadow-xl border border-red-200 max-w-2xl">
                        <h2 className="text-2xl font-bold text-red-600 mb-4">¡Oops! Algo salió mal.</h2>
                        <p className="text-gray-700 mb-2">Hubo un error crítico en la aplicación. Por favor, reporta el siguiente error:</p>
                        <pre className="bg-gray-100 p-4 rounded-md text-red-700 text-sm overflow-auto mb-4">
                            <strong>Error:</strong> {this.state.error?.message || 'Error desconocido'}
                        </pre>
                         <details className="text-xs text-gray-500">
                             <summary>Detalles técnicos (Stack Trace)</summary>
                            <pre className="bg-gray-50 p-2 rounded-md mt-2 overflow-auto">
                                {this.state.errorInfo?.componentStack || this.state.error?.stack || 'No disponible'}
                            </pre>
                         </details>
                        <Button onClick={() => window.location.reload()} className="!bg-red-600 hover:!bg-red-700 mt-6">
                            Recargar Aplicación
                        </Button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
export default function App() {
    if (!app || !db || !auth) {
        return (
             <div className="w-full min-h-screen flex items-center justify-center bg-red-50 p-4 font-inter">
                <div className="bg-white p-8 rounded-lg shadow-xl border border-red-200 max-w-2xl">
                    <h2 className="text-2xl font-bold text-red-600 mb-4">Error Crítico de Configuración</h2>
                    <p className="text-gray-700 mb-2">No se pudo inicializar Firebase.</p>
                    <p className="text-gray-600 text-sm">Verifica que la variable <code className="bg-gray-100 p-1 rounded">__firebase_config</code> sea un JSON válido y revisa la consola para errores detallados de inicialización.</p>
                    {rawJsonConfig && <details className="mt-4 text-xs"><summary>Ver Configuración Recibida</summary><pre className="bg-gray-100 p-2 rounded mt-1 overflow-auto">{JSON.stringify(firebaseConfig, null, 2)}</pre></details>}
                </div>
            </div>
        );
    }

    return (
        <ErrorBoundary>
            <DataProvider>
                <AppContent />
            </DataProvider>
        </ErrorBoundary>
    );
}

