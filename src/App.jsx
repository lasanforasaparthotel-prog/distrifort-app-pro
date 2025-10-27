import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    signInAnonymously
} from 'firebase/auth';
import {
    getFirestore, collection, doc, onSnapshot, setDoc,
    serverTimestamp, writeBatch, updateDoc, query, where, setLogLevel
} from 'firebase/firestore';
import {
    LayoutDashboard, Package, Users, Truck, Search, Plus,
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save,
    FileText, ShoppingCart, Building, LogOut, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer, Upload, Image as ImageIcon,
    AtSign, KeyRound, Filter, RotateCcw
} from 'lucide-react';

// --- 1. CONFIGURACIÓN DE FIREBASE INCORPORADA ---
const firebaseConfig = {
  apiKey: "AIzaSyDSdpnWJiIHqY9TaruFIMBsBuWtm-WsRkI",
  authDomain: "distrifort.firebaseapp.com",
  projectId: "distrifort",
  storageBucket: "distrifort.firebasestorage.app",
  messagingSenderId: "456742367607",
  appId: "1:456742367607:web:25341e7e3126fd7c04f172",
  measurementId: "G-F62DMRC8NZ"
};
const rawAppId = firebaseConfig.projectId || 'default-app-id';
const appId = rawAppId.replace(/[/.]/g, '_');
let app, db, auth;
if (Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    setLogLevel('Debug');
} else { console.error("Configuración de Firebase no encontrada."); }

// --- 2. MODELOS DE DATOS ---
const PRODUCT_MODEL = { codigo: '', categoria: '', nombre: '', marca: '', proveedorId: '', nombreProveedor: '', presentacion: '', costo: 0, precioUnidad: 0, precioCaja: 0, precioPack: 0, precioPallet: 0, udsPorCaja: 6, udsPorPack: 0, udsPorPallet: 0, stockTotal: 0, umbralMinimo: 10, archivado: false };
const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
const PROVIDER_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

// --- 2b. MAPEADO DE COLECCIONES ---
const COLLECTION_NAMES = { products: 'Inventario', clients: 'Clientes', orders: 'Pedidos', providers: 'Proveedores', purchaseOrders: 'OrdenesCompra' };

// --- 3. HOOKS PERSONALIZADOS ---
const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authDomainError, setAuthDomainError] = useState(false);

    useEffect(() => {
        if (!auth) {
            console.warn("Auth no inicializado en useAuth");
            setIsAuthReady(true);
            return;
        }
        const unsub = onAuthStateChanged(auth, (user) => {
            setUserId(user ? user.uid : null);
            setIsAuthReady(true);
        });
        return () => unsub();
    }, []);

    return { userId, isAuthReady, authDomainError, setAuthDomainError };
};

const useCollection = (collectionName) => {
    const { userId, isAuthReady } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const unsubscribeRef = useRef(null);

    useEffect(() => {
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
            unsubscribeRef.current = null;
        }
        setData([]);
        setLoading(true);
        if (!isAuthReady || !userId || !db) {
            setLoading(false);
            return;
        };
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) {
            console.error(`[useCollection ${collectionName}] Invalid collection name.`);
            setLoading(false); return;
        }
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        const q = query(collection(db, path), where("archivado", "==", false));
        const unsubscribe = onSnapshot(q, snapshot => {
            const newData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setData(newData);
            setLoading(false);
        }, err => {
            console.error(`[useCollection ${collectionName}] Error in listener for ${path}:`, err);
            setLoading(false);
        });
        unsubscribeRef.current = unsubscribe;
        return () => {
            if (unsubscribeRef.current) {
                unsubscribeRef.current();
                unsubscribeRef.current = null;
            }
        };
    }, [userId, collectionName, isAuthReady, appId]);
    return { data, loading };
};


// --- 4. CONTEXTO DE DATOS Y ACCIONES ---
const DataContext = createContext(null);
const DataProvider = ({ children }) => {
    const { userId, isAuthReady, authDomainError, setAuthDomainError } = useAuth();
    const collections = ['products', 'clients', 'orders', 'providers', 'purchaseOrders'];
    const state = collections.reduce((acc, name) => { acc[name] = useCollection(name); return acc; }, {});

    const handleAuthentication = useCallback(async (authFunction, email, password) => {
        if (!auth) throw new Error("Firebase Auth no está inicializado.");
        return await authFunction(auth, email, password);
    }, []);

    const login = useCallback((email, password) => handleAuthentication(signInWithEmailAndPassword, email, password), [handleAuthentication]);
    const register = useCallback((email, password) => handleAuthentication(createUserWithEmailAndPassword, email, password), [handleAuthentication]);
    const logout = useCallback(() => { if (auth) signOut(auth); else console.error("Logout: Auth no inicializado"); }, []);
    const signInWithGoogle = useCallback(async () => {
        if (!auth) throw new Error("Firebase Auth no está inicializado.");
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            await signInWithPopup(auth, provider);
            setAuthDomainError(false);
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            if (error.code === 'auth/unauthorized-domain') {
                console.error("Error: Dominio no autorizado...");
                setAuthDomainError(true);
            }
            throw error;
        }
    }, [setAuthDomainError]);

    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) { console.error("createOrUpdateDoc: No autenticado o DB no inicializada."); return; }
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) { console.error(`createOrUpdateDoc: Nombre de colección no válido: ${collectionName}`); return; }
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        const docRef = id ? doc(db, path, id) : doc(collection(db, path));
        try {
            const cleanedData = { ...data };
            const numericFields = ['costo', 'precioUnidad', 'precioCaja', 'precioPack', 'precioPallet', 'udsPorCaja', 'udsPorPack', 'udsPorPallet', 'stockTotal', 'umbralMinimo', 'minimoCompra', 'limiteCredito', 'saldoPendiente', 'costoTotal', 'subtotal', 'costoEnvio', 'descuento', 'total'];
            numericFields.forEach(field => { if (cleanedData[field] !== undefined && typeof cleanedData[field] !== 'number') cleanedData[field] = parseFloat(cleanedData[field]) || 0; });
            if (collectionName === 'orders' || collectionName === 'purchaseOrders') {
                cleanedData.items = Array.isArray(cleanedData.items) ? cleanedData.items : [];
                cleanedData.items = cleanedData.items.map(item => { const cleanedItem = {...item}; const itemNumericFields = ['cantidad', 'precioUnidad', 'subtotalLinea', 'costoUnidad']; itemNumericFields.forEach(f => { if(cleanedItem[f] !== undefined && typeof cleanedItem[f] !== 'number') cleanedItem[f] = parseFloat(cleanedItem[f]) || 0; }); return cleanedItem; });
            }
            Object.keys(cleanedData).forEach(key => cleanedData[key] === undefined && delete cleanedData[key]);
            await setDoc(docRef, { ...cleanedData, timestamp: serverTimestamp() }, { merge: true });
        } catch (error) { console.error(`[createOrUpdateDoc] Error al escribir en ${docRef.path}:`, error); }
    }, [userId]);

    const archiveDoc = useCallback(async (collectionName, id) => {
        if (!userId || !db) { console.error("archiveDoc: No autenticado o DB no inicializada."); return; }
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) { console.error(`archiveDoc: Nombre de colección no válido: ${collectionName}`); return; }
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        try { await updateDoc(doc(db, path, id), { archivado: true }); }
        catch (error) { console.error(`[archiveDoc] Error al archivar ${path}/${id}:`, error); }
    }, [userId]);

    const combinedLoading = useMemo(() => Object.values(state).some(s => s.loading), [state]);

    const value = { userId, isAuthReady, authDomainError, ...collections.reduce((acc, name) => ({ ...acc, [name]: state[name].data }), {}), loading: combinedLoading, login, register, logout, signInWithGoogle, createOrUpdateDoc, archiveDoc, };
    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
const useData = () => useContext(DataContext);

// --- 5. COMPONENTES DE UI GENÉRICOS ---
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
// --- INICIO RESTAURACIÓN UI COMPONENTS ---
const Button = React.memo(({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${
            disabled
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
        } ${className}`}
    >
        {Icon && <Icon className="w-5 h-5" />}
        <span>{children}</span>
    </button>
));
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl">
                <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
                    <X />
                </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto">
                {children}
            </div>
        </div>
    </div>
);
const Input = React.memo(({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '', step = 'any' }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            <input
                type={type}
                name={name}
                value={value ?? ''}
                onChange={onChange}
                required={required}
                placeholder={placeholder}
                className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className}`}
                step={step}
            />
            {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}
        </div>
    </div>
));
const Select = React.memo(({ label, name, value, onChange, children, required = false }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select
            name={name}
            value={value ?? ''}
            onChange={onChange}
            required={required}
            className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition"
        >
            {children}
        </select>
    </div>
));
const Card = React.memo(({ title, value, icon: Icon, color = 'indigo', onClick }) => (
    <div
        onClick={onClick}
        className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}
    >
        <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">{title}</p>
            {Icon && <Icon className={`w-6 h-6 text-${color}-500`} />}
        </div>
        <p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p>
    </div>
));
const PageLoader = ({ text }) => (
    <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        <p className="mt-2">{text}</p>
    </div>
);
const PageHeader = React.memo(({ title, children }) => (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h2>
        <div className="flex flex-wrap gap-2">{children}</div>
    </div>
));
const PrintableDocument = React.forwardRef(({ children, title, logoText = "Distribuidora 5" }, ref) => (
    <div ref={ref} className="p-6 print:p-0 print:text-black w-full min-h-screen">
        <div className="hidden print:block mb-8 border-b-2 border-gray-900 pb-2">
            <h1 className="text-3xl font-black">{logoText}</h1>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-sm">Fecha de Emisión: {new Date().toLocaleDateString()}</p>
        </div>
        {children}
        <style dangerouslySetInnerHTML={{__html: `@page { size: A4; margin: 1cm; } body { margin: 0 !important; } .print\\:hidden { display: none !important; } .hidden.print\\:block { display: block !important; } .print\\:text-black { color: #000 !important; } .print\\:p-0 { padding: 0 !important; } @media print { .no-print { display: none !important; } }`}} />
    </div>
));
const GoogleIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path>
        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path>
        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path>
        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.335,44,30.038,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path>
    </svg>
);
// --- FIN RESTAURACIÓN UI COMPONENTS ---


// --- 6. LÓGICA DE IA (GEMINI) ---
const secureGeminiFetch = async (prompt, isImageGeneration = false) => { /* ... (definición completa anterior) ... */ };


// --- 7. PANTALLA DE AUTENTICACIÓN ---
const AuthScreen = () => { /* ... (definición completa anterior) ... */ };


// --- 8. MÓDULOS FUNCIONALES (PÁGINAS) ---
const FormComponent = React.memo(({ model, onSave, onCancel, children, ...props }) => { /* ... */ });
const ManagerComponent = React.memo(({ title, collectionName, model, FormFields, TableHeaders, TableRow, ...props }) => { /* ... */ });
const ProductFormFields = React.memo(({ item, handleChange, providers }) => { /* ... */ });
const ProductTableRow = React.memo(({ item, onEdit, onArchive }) => { /* ... */ });
const ProductManager = () => { /* ... */ };
const ClientFormFields = React.memo(({ item, handleChange }) => { /* ... */ });
const ClientTableRow = React.memo(({ item, onEdit, onArchive }) => { /* ... */ });
const ClientManager = () => { /* ... */ };
const ProviderFormFields = React.memo(({ item, handleChange }) => { /* ... */ });
const ProviderTableRow = React.memo(({ item, onEdit, onArchive }) => { /* ... */ });
const ProviderManager = () => { /* ... */ };
const OrderPrintable = React.forwardRef(({ order, client }, ref) => { /* ... */ });
const OrderForm = ({ model, onSave, onCancel }) => { /* ... */ };
const OrderManager = () => { /* ... */ };
const PurchaseOrderPrintable = React.forwardRef(({ po, provider }, ref) => { /* ... */ });
const PurchaseOrderForm = ({ model, onSave, onCancel, products, providers }) => { /* ... */ };
const PurchaseOrderManager = () => { /* ... */ };
const EditablePriceInput = ({ productId, field, value, onChange }) => { /* ... */ };
const PriceListPrintable = React.forwardRef(({ groupedProducts }, ref) => { /* ... */ });
const PriceListManager = () => { /* ... */ };
const GlobalSearch = () => { /* ... */ };
const ShippingQuoter = () => { /* ... */ };
const ProfitCalculator = () => { /* ... */ }; const AIChat = () => { /* ... */ }; const PromotionGenerator = () => { /* ... */ }; const Tools = () => { /* ... */ };
const Dashboard = ({ setCurrentPage }) => { /* ... */ };
const PriceListImporter = () => { /* ... */ };


// --- 9. APP PRINCIPAL Y NAVEGACIÓN ---
const AppLayout = () => { /* ... (definición completa anterior) ... */ };
export default function DistriFortApp() { return ( <DataProvider> <AppController /> </DataProvider> ); };
const AppController = () => { /* ... (definición completa anterior) ... */ };

