import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, signOut, GoogleAuthProvider, 
    signInWithPopup, signInAnonymously 
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
                      (import.meta.env.VITE_FIREBASE_JSON_ONLY || null); // CORRECCIÓN VITE

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
    const [data, setData] = useState([]);
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
            setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, err => {
            console.error(err);
            setLoading(false);
        });
        return unsub;
    }, [userId, collectionName, isAuthReady, collectionsToListen]); 
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

    const handleAuthentication = useCallback(async (authFunction, email, password) => {
        if (!auth) throw new Error("Firebase Auth no está inicializado.");
        return await authFunction(auth, email, password);
    }, []);
    
    const login = (email, password) => handleAuthentication(signInWithEmailAndPassword, email, password);
    const register = (email, password) => handleAuthentication(createUserWithEmailAndPassword, email, password);
    const logout = () => signOut(auth);
    
    const signInWithGoogle = useCallback(async () => {
        if (!auth) throw new Error("Firebase Auth no está inicializado.");
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            if (error.code === 'auth/unauthorized-domain') {
                 setAuthDomainError(true);
            }
            throw error;
        }
    }, []);

    // FUNCIÓN DE GUARDADO/ACTUALIZACIÓN CENTRAL (CORREGIDA PARA ROBUSTEZ)
    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) throw new Error("ERROR (createOrUpdateDoc): Usuario no autenticado o DB no inicializada.");
        
        const path = `/artifacts/${appId}/users/${userId}/${collectionName}`;
        const docRef = id ? doc(db, path, id) : doc(collection(db, path));
        
        // setDoc con merge: true para crear (sin id) o actualizar (con id)
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
        login,
        register,
        logout,
        signInWithGoogle,
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

// --- 6. LÓGICA DE IA (GEMINI API KEY CORREGIDA) ---
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

// --- 7. PANTALLA DE AUTENTICACIÓN ---
const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login, register, signInWithGoogle, authDomainError } = useData();
    
    const currentError = authDomainError 
        ? "Error Crítico: El dominio actual no está autorizado en Firebase. Añádelo en la consola de Firebase."
        : error;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLogin) {
                await login(email, password);
            } else {
                await register(email, password);
            }
        } catch (e) {
            setError(e.message.replace('Firebase:', '').trim() || 'Error de autenticación.');
        } finally {
            setLoading(false);
        }
    };
    
    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            await signInWithGoogle();
        } catch (e) {
            setError(e.message.replace('Firebase:', '').trim() || 'Error de autenticación con Google.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm mx-auto bg-white p-8 rounded-2xl shadow-xl">
                <h1 className="text-3xl font-black text-indigo-600 text-center mb-2">DistriFort</h1>
                <h2 className="text-xl font-bold text-gray-800 text-center mb-6">{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
                
                {currentError && (
                    <div className="p-3 mb-4 text-sm text-red-700 bg-red-100 rounded-lg" role="alert">
                        {currentError}
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <Input 
                        label="Email" 
                        type="email" 
                        icon={AtSign}
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                    />
                    <Input 
                        label="Contraseña" 
                        type="password" 
                        icon={KeyRound}
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                    />
                    <Button type="submit" disabled={loading} className="w-full">
                        {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
                    </Button>
                </form>
                
                <div className="flex items-center my-6">
                    <div className="flex-1 border-t border-gray-300"></div>
                    <span className="px-3 text-sm text-gray-500">O</span>
                    <div className="flex-1 border-t border-gray-300"></div>
                </div>
                
                <Button onClick={handleGoogleSignIn} disabled={loading} icon={GoogleIcon} className="w-full !bg-white !text-gray-600 border border-gray-300 hover:!bg-gray-100">
                    {loading ? 'Cargando...' : 'Acceder con Google'}
                </Button>

                <p className="mt-6 text-center text-sm text-gray-600">
                    {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
                    <button 
                        type="button" 
                        onClick={() => setIsLogin(!isLogin)} 
                        className="font-semibold text-indigo-600 hover:text-indigo-500 ml-1"
                    >
                        {isLogin ? 'Regístrate' : 'Inicia Sesión'}
                    </button>
                </p>
            </div>
        </div>
    );
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
    
    // CORRECCIÓN: Añadido try...catch al handleSave para diagnóstico de fallas
    const handleSave = async (itemData) => { 
        try {
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
    
    // CORRECCIÓN: El botón "Aplicar" ahora actualiza el estado 'item' a través de handleChange
    const handleApplyStock = () => {
        let unitsToAdd = stockAmount;
        if (stockUnit === 'caja') {
            unitsToAdd *= udsPorCaja;
        } else if (stockUnit === 'pallet') {
            unitsToAdd *= UNITS_PER_PALLET; 
        }
        
        const newStockTotal = (item.stockTotal || 0) + unitsToAdd;
        // Pasa el stock actualizado al estado del formulario
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

    // Lógica de Guardado con Manejo de Errores (para diagnóstico)
    const handleSave = async (itemData) => { 
        try {
            await createOrUpdateDoc('products', itemData, selectedItem?.id); 
            setIsModalOpen(false); 
            setSelectedItem(null); 
            console.log("SUCCESS: Producto guardado/actualizado con éxito.");
        } catch (error) {
            console.error("ERROR CRÍTICO AL GUARDAR EL PRODUCTO:", error);
            alert(`Error al guardar el producto. Revise la consola para más detalles. Detalle: ${error.message}`);
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

// 8.4 Módulos de Gestión: Pedidos (OrderManager)
const OrderPrintable = React.forwardRef(({ order, client }, ref) => (
    <PrintableDocument ref={ref} title={`PEDIDO N° ${order.id || 'N/A'}`}>
        {/* ... (Contenido de OrderPrintable) ... */}
    </PrintableDocument>
));

const OrderForm = ({ model, onSave, onCancel }) => {
    // ... (Lógica de OrderForm, incluyendo la transacción con writeBatch y try...catch) ...
    const handleSubmit = async (e) => {
        e.preventDefault();
        // ... (Validaciones y lógica de batch) ...
        try {
            await batch.commit();
            console.log("SUCCESS: Pedido Guardado y Stock Actualizado!");
            onSave({ ...order, id: orderId }); 
        } catch (e) {
            console.error("Error al ejecutar la transacción:", e);
            alert(`Error al guardar el pedido. Detalle: ${e.message}`);
        }
    };
    // ... (Resto del formulario de OrderForm) ...
    return <form>{/* ... */}</form>;
};


const OrderManager = () => {
    const { orders, clients, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const componentRef = useRef(); 

    const handleSave = async (itemData) => { 
        try {
            await createOrUpdateDoc('orders', itemData, selectedItem?.id); 
            setIsModalOpen(false); 
            setSelectedItem(null); 
        } catch (error) {
            console.error("ERROR CRÍTICO AL GUARDAR EL PEDIDO:", error);
            alert(`Error al guardar el pedido. Detalle: ${error.message}`);
        }
    };
    // ... (Resto del OrderManager) ...
    return <div>{/* ... */}</div>;
};

// 8.5 Módulos de Gestión: Órdenes de Compra
const PurchaseOrderPrintable = React.forwardRef(({ po, provider }, ref) => (
    <PrintableDocument ref={ref} title={`ORDEN DE COMPRA N° ${po.id || 'N/A'}`}>
        {/* ... (Contenido de PurchaseOrderPrintable) ... */}
    </PrintableDocument>
));

const PurchaseOrderForm = ({ model, onSave, onCancel, products, providers }) => {
    // ... (Lógica de PurchaseOrderForm) ...
    const handleSubmit = e => {
        e.preventDefault();
        if (!po.proveedorId) return console.warn("VALIDATION: Debes seleccionar un proveedor.");
        if (po.items.length === 0) return console.warn("VALIDATION: La orden debe tener al menos un producto.");
        onSave(po);
    };
    // ... (Resto del formulario) ...
    return <form>{/* ... */}</form>;
};

const PurchaseOrderManager = () => {
    const { purchaseOrders, providers, products, createOrUpdateDoc, archiveDoc } = useData();
    // ... (Lógica de PurchaseOrderManager con handleSave usando try...catch) ...
    return <div>{/* ... */}</div>;
};


// 8.6 Módulos de Listado, Búsqueda y Herramientas
const PriceListManager = () => { /* ... Lógica de PriceListManager ... */ return <div>{/* ... */}</div>; };
const GlobalSearch = () => { /* ... Lógica de GlobalSearch ... */ return <div>{/* ... */}</div>; };
const ShippingQuoter = () => { /* ... Lógica de ShippingQuoter ... */ return <div>{/* ... */}</div>; };
const ProfitCalculator = () => { /* ... Lógica de ProfitCalculator ... */ return <div>{/* ... */}</div>; };
const AIChat = () => { /* ... Lógica de AIChat usando secureGeminiFetch ... */ return <div>{/* ... */}</div>; };
const PromotionGenerator = () => { /* ... Lógica de PromotionGenerator usando secureGeminiFetch ... */ return <div>{/* ... */}</div>; };
const Tools = () => { /* ... Lógica de Tools ... */ return <div>{/* ... */}</div>; };
const Dashboard = ({ setCurrentPage }) => { /* ... Lógica de Dashboard ... */ return <div>{/* ... */}</div>; };
const PriceListImporter = () => { /* ... Lógica de PriceListImporter usando secureGeminiFetch ... */ return <div>{/* ... */}</div>; };


// --- 9. APP PRINCIPAL Y NAVEGACIÓN ---
const AppLayout = () => {
    const { logout } = useData();
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

    const handleSetCurrentPage = (pageName) => {
        setCurrentPage(pageName);
    };

    const renderPage = () => {
        if (Object.keys(firebaseConfig).length === 0) return <div className="p-10 text-center text-red-500 font-semibold border-2 border-red-300 rounded-xl bg-red-50 mt-10">Error: La configuración de Firebase no se pudo cargar.</div>
        
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
            <nav className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-white shadow-lg p-2 md:p-4 flex flex-col shrink-0 z-20 border-t md:border-t-0 md:shadow-none md:border-r">
                <h1 className="hidden md:block text-2xl font-black text-indigo-600 mb-8 px-2">DistriFort</h1>
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
                <div className="mt-auto hidden md:block">
                     <button onClick={logout} className="w-full flex items-center space-x-3 p-3 rounded-lg text-left font-semibold text-gray-600 hover:bg-gray-100 hover:text-indigo-600 transition">
                        <LogOut className="w-6 h-6" />
                        <span>Cerrar Sesión</span>
                    </button>
                </div>
            </nav>
            <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8">{renderPage()}</main>
        </div>
    );
}


// --- PUNTO DE ENTRADA ---
export default function DistriFortApp() {
    const isFirebaseConfigured = Object.keys(firebaseConfig).length > 0;

    if (!isFirebaseConfigured) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="p-10 text-center text-red-500 font-semibold border-2 border-red-300 rounded-xl bg-red-50 shadow-lg">
                    Error: La configuración de Firebase no se pudo cargar. Por favor, verifique que la variable de entorno VITE_FIREBASE_JSON_ONLY contenga un JSON válido y puro.
                </div>
            </div>
        );
    }

    return (
        <DataProvider>
            <AppController />
        </DataProvider>
    );
}

const AppController = () => {
    const { userId, isAuthReady, loading } = useData();
    
    if (!isAuthReady) {
        return <PageLoader text="Inicializando..." />;
    }
    
    // Usamos AuthScreen si el usuario no está logueado
    // Nota: Tu implementación actual usa signInAnonymously como fallback, 
    // por lo que siempre habrá un userId, pero mantendré la estructura si decides usar Auth
    // if (!userId) { return <AuthScreen />; }

    if(loading) {
        return <PageLoader text="Cargando datos..." />;
    }

    return <AppLayout />;
};
