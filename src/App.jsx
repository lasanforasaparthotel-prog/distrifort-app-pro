import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
    getAuth, onAuthStateChanged, signOut, signInAnonymously 
} from 'firebase/auth'; 
import { 
    getFirestore, collection, doc, onSnapshot, setDoc, 
    serverTimestamp, writeBatch, updateDoc, query, where, addDoc 
} from 'firebase/firestore';
import { 
    LayoutDashboard, Package, Users, Tag, Truck, Search, Plus, 
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save, 
    FileText, List, ShoppingCart, Building, LogOut, AtSign, KeyRound, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer, Upload, Code, Image as ImageIcon
} from 'lucide-react';

// --- 1. CONFIGURACIÓN FIREBASE (CORRECCIÓN VITE & DUPLICIDAD) ---
const rawJsonConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : 
                      (import.meta.env.VITE_FIREBASE_JSON_ONLY || null); 

let firebaseConfig = {};
let rawAppId = 'default-app-id';

try {
    if (rawJsonConfig) {
        firebaseConfig = JSON.parse(rawJsonConfig);
        rawAppId = firebaseConfig.appId || 'default-app-id'; 
    } else {
        console.error("Error: Configuración de Firebase no cargada. Verifique VITE_FIREBASE_JSON_ONLY.");
    }
} catch (e) {
    console.error(`ERROR CRÍTICO: Fallo al parsear el JSON de Firebase. Detalle: ${e.message}`);
}

const appId = rawAppId.replace(/[/.]/g, '_');

let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
} 

// --- 2. MODELOS DE DATOS ---
const PRODUCT_MODEL = { nombre: '', bodega: '', proveedorId: '', especie: 'Vino', varietal: '', costo: 0, precioUnidad: 0, precioCaja: 0, udsPorCaja: 6, stockTotal: 0, umbralMinimo: 10, archivado: false };
const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
const PROVIDER_MODEL = { nombre: '', responsable: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
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
    id: `mock-${index}-${Date.now()}`, // ID de prueba único
    nombre: item["Nombre del Producto (Variedad)"],
    bodega: item["Bodega/Marca"],
    especie: item["Tipo de Bebida"],
    precioUnidad: item["Precio por Unidad (ARS)"],
    costo: parseFloat((item["Precio por Unidad (ARS)"] / 1.3).toFixed(2)), // Asumir un 30% de margen
    stockTotal: Math.floor(Math.random() * 50) + 10, // Stock de prueba (entre 10 y 60)
    archivado: false,
    proveedorId: '', // ID de proveedor de prueba
}));

// --- 3. HOOKS PERSONALIZADOS ---
const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authDomainError, setAuthDomainError] = useState(false);

    useEffect(() => {
        if (!auth) {
            setIsAuthReady(true);
            return;
        }
        
        const unsub = onAuthStateChanged(auth, user => {
            if (user) {
                setUserId(user.uid);
            } else {
                // FORZAR AUTENTICACIÓN ANÓNIMA 
                 signInAnonymously(auth).then(cred => {
                    setUserId(cred.user.uid);
                 }).catch(e => {
                    console.error("Error en el fallback de autenticación anónima:", e);
                 });
            }
            setIsAuthReady(true);
        });
        
        return unsub;
    }, []);
    return { userId, isAuthReady, authDomainError, setAuthDomainError };
};

const useCollection = (collectionName) => {
    const { userId, isAuthReady } = useAuth(); 
    // CORRECCIÓN: Usar mock data para 'products', array vacío para los demás.
    const [data, setData] = useState(collectionName === 'products' ? mockProducts : []); 
    const [loading, setLoading] = useState(true);
    
    const collectionsToListen = useMemo(() => ['products', 'clients', 'orders', 'providers', 'purchaseOrders', 'priceLists'], []);


    useEffect(() => {
        if (!isAuthReady || !userId || !db) {
            setLoading(false);
            return;
        };

        if (!collectionsToListen.includes(collectionName)) {
            setLoading(false);
            return;
        }

        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        const q = query(collection(db, path), where("archivado", "==", false));
        
        const unsub = onSnapshot(q, snapshot => {
            // Cuando Firebase responde, REEMPLAZA los mock data si hay datos reales.
            const firestoreData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            if (firestoreData.length > 0) {
                setData(firestoreData);
            } else if (collectionName === 'products' && data.length === 0) { // Solo setear mock data si 'data' está vacío
                // Si no hay nada en Firebase, mantenemos los mock products
                setData(mockProducts);
            } else if (data.length === 0) {
                // Si no hay nada en Firebase para otras colecciones, es un array vacío
                setData([]);
            }
            setLoading(false);
        }, err => {
            console.error(err);
            // Si hay error (ej. reglas de seguridad), mantenemos los mock products para testing
            if (collectionName === 'products') {
                setData(mockProducts);
            }
            setLoading(false);
        });
        return unsub;
    }, [userId, isAuthReady, collectionName, collectionsToListen, data.length]); // Dependencias corregidas
    return { data, loading };
};

// --- 4. CONTEXTO DE DATOS Y ACCIONES ---
const DataContext = createContext(null);
const DataProvider = ({ children }) => {
    const { userId, isAuthReady, authDomainError, setAuthDomainError } = useAuth();
    
    const collections = ['products', 'clients', 'orders', 'providers', 'purchaseOrders'];
    const state = collections.reduce((acc, name) => {
        acc[name] = useCollection(name);
        return acc;
    }, {});

    const logout = () => signOut(auth);
    
    // FUNCIÓN DE GUARDADO/ACTUALIZACIÓN CENTRAL (VERSIÓN ESTABLE Y DE DIAGNÓSTICO)
    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) {
            console.error("DEBUG: Usuario no autenticado o DB no inicializada. No se puede guardar.");
            return;
        } 
        
        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        const docRef = id ? doc(db, path, id) : doc(collection(db, path));
        
        await setDoc(docRef, { ...data, timestamp: serverTimestamp() }, { merge: true });
    }, [userId]);

    const archiveDoc = useCallback(async (collectionName, id) => {
        if (!userId || !db) throw new Error("No autenticado o DB no inicializada.");
        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        await updateDoc(doc(db, path, id), { archivado: true });
    }, [userId]);
    
    const value = {
        userId,
        isAuthReady,
        authDomainError,
        ...collections.reduce((acc, name) => ({ ...acc, [name]: state[name].data }), {}),
        loading: Object.values(state).some(s => s.loading),
        logout,
        createOrUpdateDoc,
        archiveDoc,
        db, 
        auth
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
const useData = () => useContext(DataContext);

// --- 5. COMPONENTES DE UI GENÉRICOS ---
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (<button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} ${className}`}>{Icon && <Icon className="w-5 h-5" />}<span>{children}</span></button>);
const Modal = ({ title, children, onClose }) => (<div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl"><h3 className="text-lg font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X /></button></div><div className="p-4 md:p-6 overflow-y-auto">{children}</div></div></div>);
const Input = ({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '', step = 'any', disabled = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><div className="relative"><input type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className} ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} step={step} disabled={disabled} />{Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}</div></div>);
const Select = ({ label, name, value, onChange, children, required = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><select name={name} value={value || ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition">{children}</select></div>);
const Card = ({ title, value, icon: Icon, color = 'indigo', onClick }) => (<div onClick={onClick} className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">{title}</p><Icon className={`w-6 h-6 text-${color}-500`} /></div><p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p></div>);
const PageLoader = ({ text }) => (<div className="min-h-screen flex flex-col items-center justify-center text-gray-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div><p className="mt-2">{text}</p></div>);
const PageHeader = ({ title, children }) => (<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h2 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h2><div>{children}</div></div>);
const GoogleIcon = () => (<svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.335,44,30.038,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>);

// --- FUNCIÓN GENÉRICA PARA IMPRIMIR ---
const PrintableDocument = React.forwardRef(({ children, title, logoText = "DistriFort" }, ref) => (
    <div ref={ref} className="p-6 print:p-0 print:text-black w-full min-h-screen">
        <div className="hidden print:block mb-8 border-b-2 border-gray-900 pb-2">
            <h1 className="text-3xl font-black">{logoText}</h1>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm">Fecha de Emisión: {new Date().toLocaleDateString()}</p>
        </div>
        {children}
    </div>
));

// --- 6. LÓGICA DE IA ---
const secureGeminiFetch = async (prompt, isImageGeneration = false) => {
    try {
        const model = isImageGeneration ? 'imagen-3.0-generate-002' : 'gemini-2.5-flash-preview-05-20';
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""; 
        const apiUrl = isImageGeneration 
            ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`
            : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        if (!apiKey) throw new Error("API Key de Gemini no configurada.");

        const payload = isImageGeneration
            ? { instances: { prompt: prompt }, parameters: { "sampleCount": 1 } }
            : { contents: [{ parts: [{ text: prompt }] }] };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `Error en el servidor de IA (${model}).`);
        }
        
        const data = await response.json();

        if (isImageGeneration) {
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) throw new Error("La IA no generó una imagen válida.");
            return `data:image/png;base64,${base64Data}`;
        } else {
            return data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar una respuesta de texto.";
        }

    } catch (error) {
        console.error("Error fetching Gemini/Imagen:", error);
        return `Hubo un error al conectar con el asistente de IA. Error: ${error.message}`;
    }
};

// --- 8. MÓDULOS FUNCIONALES (PÁGINAS) ---

// Componente base para formularios (para Clientes, Proveedores)
const FormComponent = ({ model, onSave, onCancel, children }) => {
    const [item, setItem] = useState(model);
    const handleChange = e => {
        const { name, value, type } = e.target;
        setItem(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };
    const handleSubmit = e => { e.preventDefault(); onSave(item); };
    return <form onSubmit={handleSubmit} className="space-y-4">{React.cloneElement(children, { item, handleChange })}<div className="flex justify-end space-x-3 pt-4"><Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button><Button type="submit" icon={Save}>Guardar</Button></div></form>;
}

// Componente base para gestores 
const ManagerComponent = ({ title, collectionName, model, FormFields, TableHeaders, TableRow }) => {
    const { [collectionName]: data, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    
    // CORRECCIÓN: Ahora incluye try...catch y diagnóstico
    const handleSave = async (itemData) => { 
        try {
            if (!createOrUpdateDoc) return; 
            await createOrUpdateDoc(collectionName, itemData, selectedItem?.id);
            setIsModalOpen(false); 
            setSelectedItem(null);
            console.log(`SUCCESS: ${title.slice(0, -1)} guardado correctamente.`);
        } catch (error) {
            console.error(`ERROR CRÍTICO AL GUARDAR ${title.slice(0, -1)}:`, error);
            alert(`Error al guardar. Revise la consola del navegador para el error de Firebase. Detalle: ${error.message}`);
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
                    {data.map(item => <TableRow key={item.id} item={item} onEdit={() => handleEdit(item)} onArchive={() => archiveDoc(collectionName, item.id)} />)}
                </tbody>
            </table>
        </div>
    </div>);
}

// 8.1 Módulos de Gestión Básica (ProductManager)
const ProductFormFields = ({ item, handleChange }) => {
    const { providers } = useData(); 
    const UNITS_PER_PALLET = 300; 

    const [stockAmount, setStockAmount] = useState(0);
    const [stockUnit, setStockUnit] = useState('unidad');
    
    const udsPorCaja = item.udsPorCaja || 6;
    
    const handleStockChange = (e) => setStockAmount(parseFloat(e.target.value) || 0);
    const handleUnitChange = (e) => setStockUnit(e.target.value);
    
    // El botón "Aplicar" ahora actualiza el estado 'item' a través de handleChange
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
            <Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required />
            <Input label="Bodega" name="bodega" value={item.bodega} onChange={handleChange} />
            
            <Select label="Proveedor" name="proveedorId" value={item.proveedorId} onChange={handleChange} required>
                <option value="">-- Seleccionar Proveedor --</option>
                {providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
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

const ProductManager = () => {
    const { products, providers, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const lowStockProducts = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo), [products]);

    const handleSave = async (itemData) => { 
        try {
            await createOrUpdateDoc('products', itemData, selectedItem?.id); 
            setIsModalOpen(false); 
            setSelectedItem(null); 
        } catch (error) {
             console.error("ERROR CRÍTICO AL GUARDAR PRODUCTO:", error);
            alert(`Error al guardar. Revise la consola del navegador para el error de Firebase. Detalle: ${error.message}`);
        }
    };
    
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    
    const ProductTableHeaders = ["Nombre", "Proveedor", "Stock", "Precio"];
    
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
                <ProductFormFields />
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
                    {products.map(item => <ProductTableRow key={item.id} item={item} onEdit={() => handleEdit(item)} onArchive={() => archiveDoc('products', item.id)} />)}
                </tbody>
            </table>
        </div>
    </div>);
};

// 8.2 Módulos de Gestión: Clientes
const ClientManager = () => <ManagerComponent title="Clientes" collectionName="clients" model={CLIENT_MODEL} FormFields={({ item, handleChange }) => (<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required /><Input label="CUIT" name="cuit" value={item.cuit} onChange={handleChange} /><Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} /><Input label="Email" name="email" value={item.email} onChange={handleChange} /><Input label="Dirección" name="direccion" value={item.direccion} onChange={handleChange} className="col-span-full"/><Input label="Límite de Crédito ($)" name="limiteCredito" type="number" value={item.limiteCredito} onChange={handleChange} /><Input label="Mínimo de Compra ($)" name="minimoCompra" type="number" value={item.minimoCompra} onChange={handleChange} /><Select label="Régimen" name="regimen" value={item.regimen} onChange={handleChange}><option>Minorista</option><option>Mayorista</option></Select></div>)} TableHeaders={["Nombre", "Teléfono", "Saldo"]} TableRow={({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombre}</td><td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td><td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.saldoPendiente)}</td><td className="px-4 py-4 text-right space-x-2"><Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td></tr>)} />;

// 8.3 Módulos de Gestión: Proveedores
const ProviderManager = () => <ManagerComponent 
    title="Proveedores" 
    collectionName="providers" 
    model={PROVIDER_MODEL} 
    FormFields={({ item, handleChange }) => (<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label="Nombre (Bodega)" name="nombre" value={item.nombre} onChange={handleChange} required />
        <Input label="Nombre del Responsable" name="responsable" value={item.responsable} onChange={handleChange} />
        <Input label="CUIT" name="cuit" value={item.cuit} onChange={handleChange} />
        <Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} />
        <Input label="Email" name="email" value={item.email} onChange={handleChange} />
        <Input label="Dirección" name="direccion" value={item.direccion} onChange={handleChange} className="col-span-full"/>
    </div>)} 
    TableHeaders={["Nombre (Bodega)", "Responsable", "Teléfono"]} 
    TableRow={({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50">
        <td className="px-4 py-4 font-semibold">{item.nombre}</td>
        <td className="px-4 py-4 hidden sm:table-cell">{item.responsable}</td>
        <td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td>
        <td className="px-4 py-4 text-right space-x-2">
            <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
            <Button onClick={() => archiveDoc('providers', item.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
        </td>
    </tr>)} 
/>;

// 8.4 Módulos de Gestión: Pedidos (OrderManager) - (RESTAURADO A LA VERSIÓN DEL USUARIO CON CORRECCIONES)
const OrderManager = ({ setCurrentPage }) => {
    const { clients, products, orders, createOrUpdateDoc, archiveDoc } = useData();
    const [view, setView] = useState('list'); // 'list' o 'creator'

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
                    setView={setView} 
                    createOrUpdateDoc={createOrUpdateDoc}
                    // Pasando las props que faltaban
                    getPriceText={getPriceText}
                    archiveDoc={archiveDoc}
                    useData={useData} // Pasando el hook
                />
            )}
        </div>
    );
};

const OrderList = ({ orders, archiveDoc, getPriceText, getStatusStyle }) => {
    
    const generateWhatsAppLink = (order) => {
        const clientPhone = order.telefonoCliente || ''; // Asumimos que el teléfono se guarda en el pedido
        if (!clientPhone) return "Cliente sin teléfono";

        const itemsList = order.items.map(item => 
            `* ${item.quantity || item.cantidad} ${item.unit || 'Uds.'} de ${item.nombre || item.nombreProducto} - ${getPriceText(item.priceAtSale || item.precioUnidad)} c/u`
        ).join('\n');

        const message = `¡Hola ${order.nombreCliente}!\n\n`
            + `Te enviamos el resumen de tu pedido (#${order.numeroPedido || order.id.slice(0, 5)}):\n`
            + `-------------------------\n`
            + `${itemsList}\n`
            + `-------------------------\n`
            + `Subtotal: ${getPriceText(order.subtotal)}\n`
            + `Costo Envío: ${getPriceText(order.costoEnvio)}\n`
            + `Descuento: ${getPriceText(order.descuento)}\n`
            + `*TOTAL FINAL: ${getPriceText(order.total)}*\n\n`
            + `¡Muchas gracias por tu compra!`;
        
        return `https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`;
    };

    const handleArchive = (id) => {
        console.log("Archivando pedido:", id); 
        archiveDoc('orders', id);
    };

    return (
        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
              t       <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
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
                            <td className="px-6 py-4 whitespace-nowrap">{(o.timestamp?.toDate() || new Date(o.fechaPedido) || new Date()).toLocaleDateString()}</td>
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
                                    className="inline-flex items-center !p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition"
                    _Boton               title="Enviar por WhatsApp"
                                    >
                                        <Send className="w-4 h-4"/>
                                </a>
                A           <Button onClick={() => handleArchive(o.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4"/></Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const OrderCreator = ({ clients, products, setView, createOrUpdateDoc, getPriceText }) => {
    const [cart, setCart] = useState([]);
    const [clientId, setClientId] = useState('');
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);
    const [productSearch, setProductSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { userId, db } = useData(); // Obtenemos el userId y db del contexto

    const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);
    
    const filteredProducts = useMemo(() => {
        if (!productSearch) return products;
        return products.filter(p => p.nombre.toLowerCase().includes(productSearch.toLowerCase()));
    }, [products, productSearch]);

    const { subtotal, descuentoMonto, total } = useMemo(() => {
        let sub = 0;
        cart.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;

            // Lógica de precios: Mayorista con precio por caja vs Minorista/Unidad
            const price = selectedClient?.regimen === 'Mayorista' && item.unit === 'Caja' && product.precioCaja > 0
                ? product.precioCaja 
                : product.precioUnidad;
            
            item.priceAtSale = price; // Actualiza el precio de venta en el carrito
            sub += item.quantity * price;
        });

        const descMonto = sub * (descuentoPorcentaje / 100);
        const finalTotal = sub - descMonto + (parseFloat(costoEnvio) || 0);
        
        return { subtotal: sub, descuentoMonto: descMonto, total: finalTotal };
    }, [cart, selectedClient, products, costoEnvio, descuentoPorcentaje]);

    const handleAddToCart = (product, quantity, unit) => {
        if (!product || quantity <= 0) return;

        // Se genera un ID único para la línea del carrito (temporal)
        const cartId = Date.now() + Math.random().toString(36).substring(2); 

        const newItem = { 
            cartId, 
            productId: product.id, 
            nombre: product.nombre,
            quantity: quantity, 
            unit: unit,
            priceAtSale: 0, // Se calcula en useMemo
        };
        setCart(prev => [...prev, newItem]);
        setProductSearch('');
    };
    
    const handleRemoveFromCart = (cartId) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    };

    // CORRECCIÓN: Implementación de la lógica de guardado (writeBatch)
    const handleSubmitOrder = async () => {
        if (!selectedClient || cart.length === 0) {
            alert("Seleccione un cliente y añada productos.");
            return;
        }
        
        if (selectedClient.regimen === 'Mayorista' && subtotal < selectedClient.minimoCompra) {
            return alert(`El pedido no alcanza el mínimo de compra de ${selectedClient.minimoCompra.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`);
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
            const clientRef = doc(db, `/artifacts/${appId}/users/${userId}/clients`, clientId); // Use 'clientId' from state
            
            const newOrder = {
                ...ORDER_MODEL,
                id: orderId,
                clienteId: clientId,
                nombreCliente: selectedClient.nombre,
                telefonoCliente: selectedClient.telefono || '', // Guardamos el teléfono para el link de WSP
                fechaPedido: new Date().toISOString().split('T')[0], 
                numeroPedido: orderNumber,
                items: cart.map(({ cartId, ...item }) => item), 
                subtotal: parseFloat(subtotal.toFixed(2)),
                costoEnvio: parseFloat(costoEnvio.toFixed(2)),
                descuento: parseFloat(descuentoMonto.toFixed(2)),
                total: parseFloat(total.toFixed(2)),
                estado: 'Pendiente',
                timestamp: serverTimestamp(),
            };

            // 1. Añadir el pedido
            batch.set(orderRef, newOrder);

            // 2. Actualizar Saldo del Cliente
            const newSaldoPendiente = (selectedClient.saldoPendiente || 0) + total;
            batch.update(clientRef, { saldoPendiente: newSaldoPendiente });

            // 3. Actualizar Stock de Productos
            for (const item of cart) {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    const productRef = doc(db, `/artifacts/${appId}/users/${userId}/products`, item.productId);
                    // Calculate units sold (Caja vs Unidad)
                    const unitsSold = item.unit === 'Caja' ? (item.quantity * (product.udsPorCaja || 6)) : item.quantity;
                    const newStockTotal = (product.stockTotal || 0) - unitsSold;
                    batch.update(productRef, { stockTotal: newStockTotal });
                }
            }

            await batch.commit(); // <-- Execute transaction

            alert(`¡Pedido ${orderNumber} Creado!`);
            setView('list');

        } catch (error) {
            console.error("Error al guardar el pedido (writeBatch):", error);
            alert("Error al guardar el pedido. Revise la consola. (Probablemente error de permisos de Firebase)");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <Select label="Buscar Cliente" name="cliente" value={clientId} onChange={e => setClientId(e.target.value)} required>
                        <option value="">-- Seleccionar Cliente --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} (Regimen: {c.regimen})</option>)}
                    </Select>
                    {selectedClient && (
                        <div className="text-xs mt-2 p-2 bg-gray-50 rounded">
CON                   <p>Régimen: <span className="font-semibold">{selectedClient.regimen}</span></p>
                            <p>Mínimo de compra: <span className="font-semibold">{selectedClient.minimoCompra.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></p>
                        </div>
                    )}
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow">
                    <Input label="Buscar Producto" name="productSearch" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Escribe el nombre del producto..." />
                    <div className="max-h-96 overflow-y-auto space-y-2 mt-4">
                    {filteredProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 border-b hover:bg-gray-50 transition">
                            <div>
                                <p className="font-semibold">{p.nombre}</p>
                                <p className="text-sm text-gray-600">Unidad: {p.precioUnidad.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} | Caja ({p.udsPorCaja}uds): {p.precioCaja.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</p>
                            </div>
                            {/* Botones de acción para añadir */}
                            <div className="flex space-x-2">
                                <Button 
                                    onClick={() => handleAddToCart(p, 1, 'Unidad')} 
                                    className="!px-2 !py-1 text-xs !bg-indigo-400 hover:!bg-indigo-500"
                                >
                                    +1 Unidad
                                </Button>
                                <Button 
                                    onClick={() => handleAddToCart(p, 1, 'Caja')} 
                                    className="!px-2 !py-1 text-xs"
                                >
                                    +1 Caja
s                           </Button>
                            </div>
                        </div>
                    ))}
                    </div>
Note: The end of the file "Aplicacion DistriFort (Version Final Unificada):App.jsx" was cut off, it ends with:
`                    </div>
`

