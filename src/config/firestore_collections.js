import React, { useState, useEffect, useMemo, createContext, useContext, useCallback } from 'react';
import { collection, doc, onSnapshot, setDoc, serverTimestamp, writeBatch, updateDoc, query, where } from 'firebase/firestore';
import { db, auth, APP_ID, signInAnonymously } from './firebaseConfig';

// --- 1. MODELOS DE DATOS ---
export const PRODUCT_MODEL = { nombre: '', bodega: '', especie: 'Vino', varietal: '', costo: 0, precioUnidad: 0, precioCaja: 0, udsPorCaja: 6, stockTotal: 0, umbralMinimo: 10, archivado: false };
export const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
export const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
export const PROVIDER_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
export const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

// --- 2. HOOKS PERSONALIZADOS ---
export const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authDomainError, setAuthDomainError] = useState(false);

    useEffect(() => {
        if (!auth) {
            setIsAuthReady(true);
            return;
        }
        
        const unsub = auth.onAuthStateChanged(user => {
            if (user) {
                setUserId(user.uid);
            } else {
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

export const useCollection = (collectionName) => {
    const { userId, isAuthReady } = useAuth(); 
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isAuthReady || !userId || !db) {
            setLoading(false);
            return;
        };
        const path = `/artifacts/${APP_ID}/users/${userId}/${collectionName}`;
        const q = query(collection(db, path), where("archivado", "==", false));
        const unsub = onSnapshot(q, snapshot => {
            setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, err => {
            console.error(err);
            setLoading(false);
        });
        return unsub;
    }, [userId, collectionName, isAuthReady]); 
    return { data, loading };
};

// --- 3. CONTEXTO DE DATOS Y ACCIONES ---
export const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
    const { userId, isAuthReady, authDomainError, setAuthDomainError } = useAuth();
    const collections = ['products', 'clients', 'orders', 'providers', 'purchaseOrders'];
    const state = collections.reduce((acc, name) => {
        acc[name] = useCollection(name);
        return acc;
    }, {});

    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) throw new Error("No autenticado o DB no inicializada.");
        const path = `/artifacts/${APP_ID}/users/${userId}/${collectionName}`;
        const docRef = id ? doc(db, path, id) : doc(collection(db, path));
        await setDoc(docRef, { ...data, timestamp: serverTimestamp() }, { merge: true });
    }, [userId]);

    const archiveDoc = useCallback(async (collectionName, id) => {
        if (!userId || !db) throw new Error("No autenticado o DB no inicializada.");
        const path = `/artifacts/${APP_ID}/users/${userId}/${collectionName}`;
        await updateDoc(doc(db, path, id), { archivado: true });
    }, [userId]);
    
    // Auth functions for demonstration (simplified for the environment)
    const login = () => { /* Placeholder */ alert("Función de Login no implementada en este contexto."); };
    const register = () => { /* Placeholder */ alert("Función de Registro no implementada en este contexto."); };
    const logout = () => { if (auth) auth.signOut(); };
    const signInWithGoogle = () => { /* Placeholder */ alert("Función de Google Auth no implementada en este contexto."); };
    
    const value = {
        userId,
        isAuthReady,
        authDomainError,
        ...collections.reduce((acc, name) => ({ ...acc, [name]: state[name].data }), {}),
        loading: Object.values(state).some(s => s.loading),
        login,
        register,
        logout,
        signInWithGoogle,
        createOrUpdateDoc,
        archiveDoc,
        db,
        auth,
        APP_ID
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => useContext(DataContext);


// --- 4. UTILIDADES GENERALES ---

export const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

export const secureGeminiFetch = async (prompt, isImageGeneration = false) => {
    try {
        const model = isImageGeneration ? 'imagen-3.0-generate-002' : 'gemini-2.5-flash-preview-05-20';
        const apiKey = ""; // API Key is provided by Canvas runtime.
        const apiUrl = isImageGeneration 
            ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`
            : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
            throw new Error(errorData.error || `Error en el servidor de IA (${model}).`);
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

export const PrintableDocument = React.forwardRef(({ children, title, logoText = "DistriFort" }, ref) => (
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
