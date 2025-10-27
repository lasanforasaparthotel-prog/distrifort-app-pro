import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    // AÑADIR/RESTAURAR funciones necesarias para login persistente
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    signInAnonymously // Mantener por si acaso, aunque no será el flujo principal
} from 'firebase/auth';
import {
    getFirestore, collection, doc, onSnapshot, setDoc,
    serverTimestamp, writeBatch, updateDoc, query, where, setLogLevel
} from 'firebase/firestore';
import {
    LayoutDashboard, Package, Users, Truck, Search, Plus,
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save,
    FileText, ShoppingCart, Building, LogOut, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer, Upload, Image as ImageIcon,
    // AÑADIR íconos para AuthScreen
    AtSign, KeyRound
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
} else {
    console.error("Configuración de Firebase no encontrada o incompleta.");
}

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
            console.log("Auth state changed:", user ? `User ID: ${user.uid}` : "No user");
            setUserId(user ? user.uid : null);
            setIsAuthReady(true);
        });
        return () => { console.log("Cleaning up auth listener"); unsub(); };
    }, []);

    return { userId, isAuthReady, authDomainError, setAuthDomainError };
};

const useCollection = (collectionName) => {
    const { userId, isAuthReady } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!isAuthReady || !userId || !db) {
             if (isAuthReady && !userId) setData([]);
            setLoading(false); return;
        };
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) { console.error(`Colección inválida: ${collectionName}`); setLoading(false); return; }
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        const q = query(collection(db, path), where("archivado", "==", false));
        setLoading(true);
        const unsub = onSnapshot(q, snapshot => {
            setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false);
        }, err => { console.error(`Error en ${path}:`, err); setLoading(false); });
        return unsub;
    }, [userId, collectionName, isAuthReady]);
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
            await signInWithPopup(auth, provider); setAuthDomainError(false);
        } catch (error) {
            console.error("Google Sign-In Error:", error);
            if (error.code === 'auth/unauthorized-domain') { console.error("Error: Dominio no autorizado..."); setAuthDomainError(true); }
            throw error;
        }
    }, [setAuthDomainError]);
    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => { /* ... (sin cambios) ... */ }, [userId]);
    const archiveDoc = useCallback(async (collectionName, id) => { /* ... (sin cambios) ... */ }, [userId]);
    const combinedLoading = useMemo(() => Object.values(state).some(s => s.loading), [state]);
    const value = { userId, isAuthReady, authDomainError, ...collections.reduce((acc, name) => ({ ...acc, [name]: state[name].data }), {}), loading: combinedLoading, login, register, logout, signInWithGoogle, createOrUpdateDoc, archiveDoc, };
    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
const useData = () => useContext(DataContext);

// --- 5. COMPONENTES DE UI GENÉRICOS ---
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const Button = React.memo(({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (<button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} ${className}`}>{Icon && <Icon className="w-5 h-5" />}<span>{children}</span></button>));
const Modal = ({ title, children, onClose }) => (<div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl"><h3 className="text-lg font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X /></button></div><div className="p-4 md:p-6 overflow-y-auto">{children}</div></div></div>);
const Input = React.memo(({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '', step = 'any' }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><div className="relative"><input type={type} name={name} value={value ?? ''} onChange={onChange} required={required} placeholder={placeholder} className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className}`} step={step} />{Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}</div></div>));
const Select = React.memo(({ label, name, value, onChange, children, required = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><select name={name} value={value ?? ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition">{children}</select></div>));
const Card = React.memo(({ title, value, icon: Icon, color = 'indigo', onClick }) => (<div onClick={onClick} className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">{title}</p>{Icon && <Icon className={`w-6 h-6 text-${color}-500`} />}</div><p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p></div>));
const PageLoader = ({ text }) => (<div className="min-h-screen flex flex-col items-center justify-center text-gray-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div><p className="mt-2">{text}</p></div>);
const PageHeader = React.memo(({ title, children }) => (<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h2 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h2><div>{children}</div></div>));
// --- INICIO CAMBIO NOMBRE EMPRESA ---
const PrintableDocument = React.forwardRef(({ children, title, logoText = "Distribuidora 5" }, ref) => ( // Cambiado aquí
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
// --- FIN CAMBIO NOMBRE EMPRESA ---
const GoogleIcon = () => (<svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.335,44,30.038,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>);


// --- 6. LÓGICA DE IA (GEMINI) ---
const secureGeminiFetch = async (prompt, isImageGeneration = false) => { /* ... (sin cambios) ... */ };


// --- 7. PANTALLA DE AUTENTICACIÓN ---
// --- INICIO CAMBIO NOMBRE EMPRESA ---
const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, register, signInWithGoogle, authDomainError } = useData();
    const displayError = authDomainError ? "Error: Dominio no autorizado para Google Sign-In..." : error;

    const handleSubmit = async (e) => {
        e.preventDefault(); setError(''); setLoading(true);
        try { if (isLogin) await login(email, password); else await register(email, password); }
        catch (err) { console.error("Auth error:", err); setError(err.message || 'Ocurrió un error.'); }
        finally { setLoading(false); }
    };

    const handleGoogleSignIn = async () => {
        setError(''); setLoading(true);
        try { await signInWithGoogle(); }
        catch (err) { if (!authDomainError) setError(err.message || 'Error con Google.'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 via-white to-indigo-100 flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-sm mx-auto bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
                {/* Cambiado aquí */}
                <h1 className="text-3xl font-black text-indigo-600 text-center mb-2">Distribuidora 5</h1>
                <h2 className="text-xl font-bold text-gray-800 text-center mb-6">{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
                {displayError && (<div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg border border-red-200" role="alert">{displayError}</div>)}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input label="Correo Electrónico" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="tu@email.com" icon={AtSign} />
                    <Input label="Contraseña" name="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" icon={KeyRound} />
                    <Button type="submit" disabled={loading} className="w-full">{loading ? 'Procesando...' : (isLogin ? 'Entrar' : 'Registrarse')}</Button>
                </form>
                <div className="mt-6 text-center"><button onClick={() => setIsLogin(!isLogin)} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">{isLogin ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia Sesión'}</button></div>
                <div className="my-6 flex items-center"><div className="flex-grow border-t border-gray-300"></div><span className="flex-shrink mx-4 text-gray-400 text-sm">O</span><div className="flex-grow border-t border-gray-300"></div></div>
                <Button onClick={handleGoogleSignIn} disabled={loading} className="w-full !bg-white !text-gray-700 border border-gray-300 hover:!bg-gray-50 shadow-sm" icon={GoogleIcon}>{loading ? 'Conectando...' : 'Continuar con Google'}</Button>
            </div>
        </div>
    );
};
// --- FIN CAMBIO NOMBRE EMPRESA ---

// --- 8. MÓDULOS FUNCIONALES (PÁGINAS) ---
// (Componentes FormComponent, ManagerComponent, Módulos Producto, Clientes, Proveedores, Pedidos, OC, Lista Precios, Búsqueda, Cotización, Herramientas, Dashboard, Importador)
// ... (Sin cambios funcionales en estos módulos, usar las definiciones completas anteriores) ...
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
const PriceListPrintable = React.forwardRef(({ groupedProducts, client }, ref) => { /* ... */ });
const PriceListManager = () => { /* ... */ };
const GlobalSearch = () => { /* ... */ };
const ShippingQuoter = () => { /* ... */ };
const ProfitCalculator = () => { /* ... */ };
const AIChat = () => { /* ... */ };
const PromotionGenerator = () => { /* ... */ };
const Tools = () => { /* ... */ };
const Dashboard = ({ setCurrentPage }) => { /* ... */ };
const PriceListImporter = () => { /* ... */ };


// --- 9. APP PRINCIPAL Y NAVEGACIÓN ---
// --- INICIO CAMBIO NOMBRE EMPRESA ---
const AppLayout = () => {
    const { logout, userId } = useData();
    const [currentPage, setCurrentPage] = useState('Dashboard');
    const navItems = [
        { name: 'Dashboard', icon: LayoutDashboard }, { name: 'Inventario', icon: Package },
        { name: 'Clientes', icon: Users }, { name: 'Proveedores', icon: Building },
        { name: 'Pedidos', icon: ShoppingCart }, { name: 'Órdenes de Compra', icon: Truck },
        { name: 'Lista de Precios', icon: FileText },
        { name: 'Importar Lista (IA)', icon: Upload },
        { name: 'Buscar', icon: Search }, { name: 'Herramientas', icon: BrainCircuit },
        { name: 'Cotización', icon: MapPin },
    ];
    const handleSetCurrentPage = (pageName) => { setCurrentPage(pageName); };

    const renderPage = () => {
        if (!db) return <div className="text-center text-red-500">Error: La configuración de Firebase no se pudo cargar.</div>
        switch (currentPage) {
            case 'Dashboard': return <Dashboard setCurrentPage={handleSetCurrentPage} />;
            case 'Inventario': return <ProductManager />;
            case 'Clientes': return <ClientManager />;
            case 'Proveedores': return <ProviderManager />;
            case 'Pedidos': return <OrderManager />;
            case 'Órdenes de Compra': return <PurchaseOrderManager />;
            case 'Lista de Precios': return <PriceListManager />;
            case 'Importar Lista (IA)': return <PriceListImporter />;
            case 'Buscar': return <GlobalSearch />;
            case 'Herramientas': return <Tools />;
            case 'Cotización': return <ShippingQuoter />;
            default: return <Dashboard setCurrentPage={handleSetCurrentPage} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans">
            <nav className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-white shadow-lg p-2 md:p-4 flex flex-col shrink-0 z-20 border-t md:border-t-0 md:shadow-none md-border-r">
                {/* Cambiado aquí */}
                <h1 className="hidden md:block text-2xl font-black text-indigo-600 mb-8 px-2">Distribuidora 5</h1>
                <ul className="flex flex-row md:flex-col md:space-y-2 flex-grow overflow-x-auto whitespace-nowrap md:overflow-x-visible">
                    {navItems.map(item => (
                        <li key={item.name} className="flex-shrink-0 md:flex-shrink">
                            <button onClick={() => setCurrentPage(item.name)} className={`w-full flex flex-col md:flex-row items-center space-y-1 md:space-y-0 md:space-x-3 p-1 md:p-3 rounded-lg text-center md:text-left font-semibold transition ${currentPage === item.name ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600'}`}>
                                <item.icon className="w-6 h-6" />
                                <span className="text-xs md:text-base">{item.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="mt-auto hidden md:block space-y-2 pt-4 border-t">
                     <div className='px-3 text-xs text-gray-400 truncate'>
                        <p title={`App ID: ${appId}`}>App: {appId}</p>
                        <p title={`User ID: ${userId}`}>User: {userId}</p>
                     </div>
                     <button onClick={logout} className="w-full flex items-center space-x-3 p-3 rounded-lg text-left font-semibold text-gray-600 hover:bg-gray-100 hover:text-indigo-600 transition">
                        <LogOut className="w-6 h-6" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </nav>
            <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8">{renderPage()}</main>
        </div>
    );
};
// --- FIN CAMBIO NOMBRE EMPRESA ---

export default function DistriFortApp() { return ( <DataProvider> <AppController /> </DataProvider> ); };
const AppController = () => {
    const { userId, isAuthReady, loading } = useData();
    if (!isAuthReady) { return <PageLoader text="Verificando sesión..." />; }
    if (!userId) { return <AuthScreen />; }
    else { if (loading) { return <PageLoader text="Cargando datos..." />; } return <AppLayout />; }
};

