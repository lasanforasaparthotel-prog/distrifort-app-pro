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
    serverTimestamp, writeBatch, updateDoc, query, where
} from 'firebase/firestore';
import { 
    LayoutDashboard, Package, Users, Tag, Truck, Search, Plus, 
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save, 
    FileText, List, ShoppingCart, Building, LogOut, AtSign, KeyRound, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer
} from 'lucide-react';

// --- 1. CONFIGURACIÓN SEGURA DE FIREBASE ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const appId = rawAppId.replace(/[/.]/g, '_');

let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
} else {
    console.error("Configuración de Firebase no encontrada.");
}

// --- 2. MODELOS DE DATOS ---
const PRODUCT_MODEL = { nombre: '', marca: '', especie: 'Vino', varietal: '', costo: 0, precioUnidad: 0, precioCaja: 0, udsPorCaja: 6, stockTotal: 0, umbralMinimo: 10, archivado: false };
const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
const PROVIDER_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

// --- 3. HOOKS PERSONALIZADOS ---
const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    // Estado para manejar el error específico de dominio no autorizado
    const [authDomainError, setAuthDomainError] = useState(false);

    useEffect(() => {
        if (!auth) {
            setIsAuthReady(true);
            return;
        }
        
        const unsub = onAuthStateChanged(auth, user => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
            } else {
                // Intentamos iniciar sesión anónimamente como FALLBACK
                signInAnonymously(auth).then(cred => {
                    setUserId(cred.user.uid);
                    setIsAuthReady(true);
                }).catch(e => {
                    console.error("Error en el fallback de autenticación anónima:", e);
                    setAuthDomainError(true); // Si falla hasta el anónimo, hay un problema grave
                    setIsAuthReady(true);
                });
            }
        });
        
        return unsub;
    }, []);
    return { userId, isAuthReady, authDomainError, setAuthDomainError };
};

const useCollection = (collectionName) => {
    const { userId } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!userId || !db) {
            setLoading(false);
            return;
        };
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
    }, [userId, collectionName]);
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
    
    // Usamos signInWithPopup
    const signInWithGoogle = useCallback(async () => {
        if (!auth) throw new Error("Firebase Auth no está inicializado.");
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            // Capturamos el error de dominio no autorizado y actualizamos el estado
            if (error.code === 'auth/unauthorized-domain') {
                 setAuthDomainError(true);
            }
            throw error;
        }
    }, []);


    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) throw new Error("No autenticado o DB no inicializada.");
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
        login,
        register,
        logout,
        signInWithGoogle,
        createOrUpdateDoc,
        archiveDoc,
    };

    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
const useData = () => useContext(DataContext);

// --- 5. COMPONENTES DE UI GENÉRICOS ---
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (<button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} ${className}`}>{Icon && <Icon className="w-5 h-5" />}<span>{children}</span></button>);
const Modal = ({ title, children, onClose }) => (<div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl"><h3 className="text-lg font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X /></button></div><div className="p-4 md:p-6 overflow-y-auto">{children}</div></div></div>);
const Input = ({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '' }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><div className="relative"><input type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className}`} />{Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}</div></div>);
const Select = ({ label, name, value, onChange, children, required = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><select name={name} value={value || ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition">{children}</select></div>);
const Card = ({ title, value, icon: Icon, color = 'indigo' }) => (<div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1"><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">{title}</p><Icon className={`w-6 h-6 text-${color}-500`} /></div><p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p></div>);
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


// --- 6. LÓGICA DE IA (GEMINI) ---
// Nota: La clave API de Gemini DEBE residir en un proxy seguro (ej: Vercel Edge Function).
const secureGeminiFetch = async (prompt) => {
    try {
        const response = await fetch('/api/gemini-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Error en la respuesta del servidor de IA.");
        }
        
        const data = await response.json();
        return data.text;
    } catch (error) {
        console.error("Error fetching Gemini:", error);
        return "Hubo un error al conectar con el asistente de IA. Asegúrate de que el endpoint /api/gemini-proxy esté configurado correctamente.";
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
    
    // Si hay un error de dominio no autorizado, lo mostramos claramente
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
        } catch (err) {
            setError(err.message.includes('auth/invalid-credential') ? 'Credenciales incorrectas.' : 'Error de autenticación.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    
    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            await signInWithGoogle();
        } catch (err) {
            // El hook ya maneja el error de dominio, aquí solo mostramos errores genéricos
            if (err.code !== 'auth/unauthorized-domain') {
                 setError('Error al iniciar sesión con Google.');
            }
            console.error(err);
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

                <form onSubmit={handleSubmit} className="space-y-6">
                    <Input label="Correo Electrónico" name="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="tu@email.com" icon={AtSign}/>
                    <Input label="Contraseña" name="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" icon={KeyRound}/>
                    <Button type="submit" className="w-full !py-3" disabled={loading}>{loading ? 'Procesando...' : (isLogin ? 'Entrar' : 'Registrarse')}</Button>
                </form>
                
                <div className="my-6 flex items-center">
                    <div className="flex-grow border-t border-gray-300"></div>
                    <span className="flex-shrink mx-4 text-gray-400 text-sm">O</span>
                    <div className="flex-grow border-t border-gray-300"></div>
                </div>

                <Button onClick={handleGoogleSignIn} className="w-full !bg-white !text-gray-700 border border-gray-300 hover:!bg-gray-50" disabled={loading} icon={GoogleIcon}>
                    Continuar con Google
                </Button>

                <p className="text-center text-sm text-gray-600 mt-6">
                    {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'}
                    <button onClick={() => {setIsLogin(!isLogin); setError('');}} className="font-semibold text-indigo-600 hover:text-indigo-500 ml-1">
                        {isLogin ? 'Regístrate' : 'Inicia Sesión'}
                    </button>
                </p>
            </div>
        </div>
    );
};

// --- 8. MÓDULOS FUNCIONALES (PÁGINAS) ---

// Componente base para formularios simples (Inventario, Clientes, Proveedores)
const FormComponent = ({ model, onSave, onCancel, children }) => {
    const [item, setItem] = useState(model);
    const handleChange = e => {
        const { name, value, type } = e.target;
        setItem(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };
    const handleSubmit = e => { e.preventDefault(); onSave(item); };
    return <form onSubmit={handleSubmit} className="space-y-4">{React.cloneElement(children, { item, handleChange })}<div className="flex justify-end space-x-3 pt-4"><Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button><Button type="submit" icon={Save}>Guardar</Button></div></form>;
}

// Componente base para gestores (Inventario, Clientes, Proveedores)
const ManagerComponent = ({ title, collectionName, model, FormFields, TableHeaders, TableRow }) => {
    const { [collectionName]: data, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const handleSave = async (itemData) => { await createOrUpdateDoc(collectionName, itemData, selectedItem?.id); setIsModalOpen(false); setSelectedItem(null); };
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

// 8.1 Módulos de Gestión Básica
const ProductFormFields = ({ item, handleChange, onStockUpdate }) => {
    const [stockAmount, setStockAmount] = useState(0);
    const [stockUnit, setStockUnit] = useState('unidad');
    
    const udsPorCaja = item.udsPorCaja || 6;
    
    const handleStockChange = (e) => setStockAmount(parseFloat(e.target.value) || 0);
    const handleUnitChange = (e) => setStockUnit(e.target.value);
    
    const handleApplyStock = () => {
        let unitsToAdd = stockAmount;
        if (stockUnit === 'caja') {
            unitsToAdd *= udsPorCaja;
        }
        
        const newStockTotal = (item.stockTotal || 0) + unitsToAdd;
        onStockUpdate(newStockTotal);
        setStockAmount(0);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required />
            <Input label="Marca" name="marca" value={item.marca} onChange={handleChange} />
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
                    <option value="caja">Caja ({udsPorCaja} uds)</option>
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

const ProductManager = () => {
    const { products, providers, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const lowStockProducts = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo), [products]);
    const [isPOCreationOpen, setIsPOCreationOpen] = useState(false);
    const [poDraft, setPODraft] = useState(null);
    const poRef = useRef();

    // Función para crear un borrador de OC con productos en bajo stock
    const handleGeneratePO = () => {
        if (lowStockProducts.length === 0) return alert("No hay productos con stock bajo para generar una Orden de Compra.");
        
        // Crear items para la OC (cantidad a comprar: 2 cajas por defecto)
        const poItems = lowStockProducts.map(p => ({
            productId: p.id,
            nombreProducto: p.nombre,
            cantidad: p.udsPorCaja * 2, // 2 cajas por defecto
            costoUnidad: p.costo,
            subtotalLinea: p.costo * p.udsPorCaja * 2,
        }));
        
        // Calcular costo total
        const costoTotal = poItems.reduce((sum, item) => sum + item.subtotalLinea, 0);

        setPODraft({
            ...PURCHASE_ORDER_MODEL,
            items: poItems,
            costoTotal: costoTotal,
            nombreProveedor: providers.length > 0 ? providers[0].nombre : '',
            proveedorId: providers.length > 0 ? providers[0].id : '',
        });
        setIsPOCreationOpen(true);
    };

    const handleSavePO = async (poData) => {
        await createOrUpdateDoc('purchaseOrders', poData);
        setIsPOCreationOpen(false);
        setPODraft(null);
    };


    const handleStockUpdate = (newStock) => {
        setSelectedItem(prev => ({ ...prev, stockTotal: newStock }));
    };

    const handleSave = async (itemData) => { 
        // Aseguramos que stockTotal se guarde como número
        itemData.stockTotal = parseFloat(itemData.stockTotal) || 0;
        await createOrUpdateDoc('products', itemData, selectedItem?.id); 
        setIsModalOpen(false); 
        setSelectedItem(null); 
    };
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    
    const ProductTableRow = ({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombre}</td><td className={`px-4 py-4 ${item.stockTotal <= item.umbralMinimo ? 'text-red-500 font-bold' : ''}`}>{item.stockTotal}</td><td className="px-4 py-4">{FORMAT_CURRENCY(item.precioUnidad)}</td><td className="px-4 py-4 text-right space-x-2"><Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td></tr>);
    const ProductTableHeaders = ["Nombre", "Stock", "Precio"];
    
    return (<div className="space-y-6">
        <PageHeader title="Inventario">
            <div className="flex space-x-2">
                {lowStockProducts.length > 0 && (
                     <Button 
                        onClick={handleGeneratePO} 
                        icon={Truck} 
                        className="!bg-red-500 hover:!bg-red-600 animate-pulse"
                        title={`Generar OC con ${lowStockProducts.length} productos bajos`}
                    >
                        Generar OC ({lowStockProducts.length})
                    </Button>
                )}
                <Button onClick={handleAddNew} icon={Plus}>Añadir Producto</Button>
            </div>
        </PageHeader>
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Producto"} onClose={() => setIsModalOpen(false)}>
            <FormComponent model={selectedItem || PRODUCT_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)}>
                <ProductFormFields onStockUpdate={handleStockUpdate} />
            </FormComponent>
        </Modal>}
        {isPOCreationOpen && poDraft && (
             <Modal title="Generar Orden de Compra (Stock Bajo)" onClose={() => setIsPOCreationOpen(false)}>
                <PurchaseOrderForm 
                    model={poDraft} 
                    onSave={handleSavePO} 
                    onCancel={() => setIsPOCreationOpen(false)}
                    ref={poRef}
                />
             </Modal>
        )}

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


const ClientManager = () => <ManagerComponent title="Clientes" collectionName="clients" model={CLIENT_MODEL} FormFields={({ item, handleChange }) => (<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required /><Input label="CUIT" name="cuit" value={item.cuit} onChange={handleChange} /><Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} /><Input label="Email" name="email" value={item.email} onChange={handleChange} /><Input label="Dirección" name="direccion" value={item.direccion} onChange={handleChange} className="col-span-full"/><Input label="Límite de Crédito ($)" name="limiteCredito" type="number" value={item.limiteCredito} onChange={handleChange} /><Input label="Mínimo de Compra ($)" name="minimoCompra" type="number" value={item.minimoCompra} onChange={handleChange} /><Select label="Régimen" name="regimen" value={item.regimen} onChange={handleChange}><option>Minorista</option><option>Mayorista</option></Select></div>)} TableHeaders={["Nombre", "Teléfono", "Saldo"]} TableRow={({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombre}</td><td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td><td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.saldoPendiente)}</td><td className="px-4 py-4 text-right space-x-2"><Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td></tr>)} />;
const ProviderManager = () => <ManagerComponent title="Proveedores" collectionName="providers" model={PROVIDER_MODEL} FormFields={({ item, handleChange }) => (<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required /><Input label="CUIT" name="cuit" value={item.cuit} onChange={handleChange} /><Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} /><Input label="Email" name="email" value={item.email} onChange={handleChange} /><Input label="Dirección" name="direccion" value={item.direccion} onChange={handleChange} className="col-span-full"/></div>)} TableHeaders={["Nombre", "Teléfono"]} TableRow={({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombre}</td><td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td><td className="px-4 py-4 text-right space-x-2"><Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td></tr>)} />;

// 8.2 Módulo de Pedidos (Orders)
// --- FUNCIÓN PARA GENERAR EL ENLACE DE WHATSAPP DEL CLIENTE ---
const generateWhatsAppLink = (client, order) => {
    if (!client || !client.telefono) return null;

    const formattedTotal = FORMAT_CURRENCY(order.total);
    const orderDate = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleDateString() : 'hoy';

    let message = `¡Hola ${client.nombre}!\n\n`;
    message += `Tu Pedido de DistriFort, con N° ${order.id || 'N/A'} y fecha ${orderDate}, está listo.\n\n`;
    message += `*Detalle del Pedido:*\n`;
    
    order.items.forEach(item => {
        message += `- ${item.cantidad}x ${item.nombreProducto} (${FORMAT_CURRENCY(item.subtotalLinea)})\n`;
    });

    message += `\n*Resumen Financiero:*\n`;
    message += `Subtotal: ${FORMAT_CURRENCY(order.subtotal)}\n`;
    if (order.costoEnvio > 0) message += `Envío: ${FORMAT_CURRENCY(order.costoEnvio)}\n`;
    if (order.descuento > 0) message += `Descuento: -${FORMAT_CURRENCY(order.descuento)}\n`;
    message += `*Total a Pagar: ${formattedTotal}*\n\n`;
    message += `Tu estado actual es: ${order.estado}.\n\n¡Gracias por tu compra!`;
    
    // Aseguramos que el teléfono tenga solo números (sin +54 o prefijos)
    const cleanPhone = client.telefono.replace(/\D/g, ''); 
    const phoneNumber = cleanPhone.length >= 10 ? `549${cleanPhone}` : cleanPhone; 

    return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
};

const OrderPrintable = React.forwardRef(({ order, client }, ref) => (
    <PrintableDocument ref={ref} title={`PEDIDO N° ${order.id || 'N/A'}`}>
        <div className="text-sm space-y-4">
            <h3 className="text-lg font-bold">Datos del Cliente</h3>
            <p><strong>Cliente:</strong> {client?.nombre || order.nombreCliente}</p>
            <p><strong>Teléfono:</strong> {client?.telefono || 'N/A'}</p>
            <p><strong>Dirección:</strong> {client?.direccion || 'N/A'}</p>
            
            <h3 className="text-lg font-bold mt-6 border-t pt-4">Detalle del Pedido</h3>
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100 font-semibold">
                        <td className="p-2 border">Producto</td>
                        <td className="p-2 border text-right">Cantidad</td>
                        <td className="p-2 border text-right">Precio Unitario</td>
                        <td className="p-2 border text-right">Subtotal</td>
                    </tr>
                </thead>
                <tbody>
                    {order.items.map((item, index) => (
                        <tr key={index}>
                            <td className="p-2 border">{item.nombreProducto}</td>
                            <td className="p-2 border text-right">{item.cantidad}</td>
                            <td className="p-2 border text-right">{FORMAT_CURRENCY(item.precioUnidad)}</td>
                            <td className="p-2 border text-right">{FORMAT_CURRENCY(item.subtotalLinea)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <div className="flex justify-end pt-4">
                <div className="w-64 space-y-1">
                    <p className="flex justify-between"><span>Subtotal:</span> <span>{FORMAT_CURRENCY(order.subtotal)}</span></p>
                    <p className="flex justify-between"><span>Envío:</span> <span>{FORMAT_CURRENCY(order.costoEnvio)}</span></p>
                    <p className="flex justify-between"><span>Descuento:</span> <span className="text-red-600">-{FORMAT_CURRENCY(order.descuento)}</span></p>
                    <p className="flex justify-between font-bold text-xl border-t pt-2"><span>TOTAL:</span> <span>{FORMAT_CURRENCY(order.total)}</span></p>
                </div>
            </div>
            
            <p className="mt-8">Estado: <strong>{order.estado}</strong></p>
        </div>
    </PrintableDocument>
));


const OrderForm = ({ model, onSave, onCancel }) => {
    const { clients, products } = useData();
    const [order, setOrder] = useState(model);
    const [selectedProductId, setSelectedProductId] = useState('');
    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [selectedProductId, products]);

    // Calcular totales
    useEffect(() => {
        const subtotal = order.items.reduce((sum, item) => sum + (item.subtotalLinea || 0), 0);
        const total = subtotal + (order.costoEnvio || 0) - (order.descuento || 0);
        setOrder(prev => ({ ...prev, subtotal, total }));
    }, [order.items, order.costoEnvio, order.descuento]);

    const handleHeaderChange = e => {
        const { name, value, type } = e.target;
        let newOrder = { ...order, [name]: type === 'number' ? parseFloat(value) || 0 : value };
        
        if (name === 'clienteId') {
            const client = clients.find(c => c.id === value);
            newOrder.nombreCliente = client ? client.nombre : '';
        }
        setOrder(newOrder);
    };

    const handleAddItem = () => {
        if (!selectedProduct || order.items.some(i => i.productId === selectedProductId)) return;

        const newItem = {
            productId: selectedProduct.id,
            nombreProducto: selectedProduct.nombre,
            cantidad: 1,
            precioUnidad: selectedProduct.precioUnidad,
            subtotalLinea: selectedProduct.precioUnidad * 1,
        };

        setOrder(prev => ({ ...prev, items: [...prev.items, newItem] }));
        setSelectedProductId('');
    };

    const handleUpdateItem = (index, key, value) => {
        const newItems = [...order.items];
        newItems[index][key] = value;
        newItems[index].subtotalLinea = newItems[index].cantidad * newItems[index].precioUnidad;
        setOrder(prev => ({ ...prev, items: newItems }));
    };

    const handleRemoveItem = (index) => {
        const newItems = order.items.filter((_, i) => i !== index);
        setOrder(prev => ({ ...prev, items: newItems }));
    };

    const handleSubmit = e => {
        e.preventDefault();
        if (!order.clienteId) return alert("Debes seleccionar un cliente."); // Usando alert temporalmente para validación simple
        if (order.items.length === 0) return alert("El pedido debe tener al menos un producto.");
        onSave(order);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                <Select label="Cliente" name="clienteId" value={order.clienteId} onChange={handleHeaderChange} required>
                    <option value="">Seleccione un Cliente</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </Select>
                <Select label="Estado" name="estado" value={order.estado} onChange={handleHeaderChange}>
                    {['Pendiente', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
                </Select>
                <Input label="Costo de Envío ($)" name="costoEnvio" type="number" value={order.costoEnvio} onChange={handleHeaderChange} />
                <Input label="Descuento ($)" name="descuento" type="number" value={order.descuento} onChange={handleHeaderChange} />
            </div>

            <h4 className="text-lg font-semibold text-gray-700">Productos</h4>
            <div className="flex space-x-2">
                <Select label="Producto" name="selectedProduct" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                    <option value="">Añadir Producto...</option>
                    {products.filter(p => !order.items.some(i => i.productId === p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.nombre} ({p.stockTotal} en stock)</option>
                    ))}
                </Select>
                <Button onClick={handleAddItem} disabled={!selectedProduct} icon={Plus} className="self-end !px-3 !py-2">Añadir</Button>
            </div>

            {order.items.length > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-gray-600">
                                <th className="py-2 px-1">Producto</th>
                                <th className="py-2 px-1 w-20">Cantidad</th>
                                <th className="py-2 px-1 w-20 text-right">Precio Un.</th>
                                <th className="py-2 px-1 w-20 text-right">Subtotal</th>
                                <th className="py-2 px-1 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, index) => (
                                <tr key={item.productId || index} className="border-b hover:bg-white">
                                    <td className="py-2 px-1 font-medium text-gray-800">{item.nombreProducto}</td>
                                    <td className="py-2 px-1">
                                        <input 
                                            type="number" 
                                            min="1"
                                            value={item.cantidad} 
                                            onChange={e => handleUpdateItem(index, 'cantidad', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-center"
                                        />
                                    </td>
                                    <td className="py-2 px-1 text-right">
                                        <input 
                                            type="number" 
                                            value={item.precioUnidad} 
                                            onChange={e => handleUpdateItem(index, 'precioUnidad', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-right"
                                        />
                                    </td>
                                    <td className="py-2 px-1 text-right font-semibold text-gray-900">{FORMAT_CURRENCY(item.subtotalLinea)}</td>
                                    <td className="py-2 px-1 text-right"><button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex justify-end pt-4 space-y-2 flex-col items-end">
                <p className="text-md font-medium">Subtotal: <span className="font-bold">{FORMAT_CURRENCY(order.subtotal)}</span></p>
                <p className="text-md font-medium">Envío: <span className="font-bold">{FORMAT_CURRENCY(order.costoEnvio)}</span></p>
                <p className="text-md font-medium">Descuento: <span className="font-bold text-red-600">-{FORMAT_CURRENCY(order.descuento)}</span></p>
                <p className="text-xl font-bold pt-2 border-t-2 border-indigo-200">Total: <span className="text-indigo-600">{FORMAT_CURRENCY(order.total)}</span></p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button>
                <Button type="submit" icon={Save}>Guardar Pedido</Button>
            </div>
        </form>
    );
};

const OrderManager = () => {
    const { orders, clients, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const componentRef = useRef(); // Ref para impresión

    const handleSave = async (itemData) => { 
        await createOrUpdateDoc('orders', itemData, selectedItem?.id); 
        setIsModalOpen(false); 
        setSelectedItem(null); 
    };
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    const handlePrint = () => window.print();

    // Ordenar los pedidos por fecha de creación descendente (simulado si no hay timestamp)
    const sortedOrders = useMemo(() => orders.slice().sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)), [orders]);

    // Obtener cliente para el WhatsApp Link
    const getClientForOrder = useCallback((order) => {
        return clients.find(c => c.id === order.clienteId);
    }, [clients]);


    return (<div className="space-y-6">
        <PageHeader title="Pedidos">
            <Button onClick={handleAddNew} icon={Plus}>Añadir Pedido</Button>
        </PageHeader>
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Pedido"} onClose={() => setIsModalOpen(false)}>
            <OrderForm model={selectedItem || ORDER_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)} />
        </Modal>}
        
        {/* Documento de Impresión Oculto */}
        {selectedItem && (
             <div className="hidden no-print">
                 <OrderPrintable ref={componentRef} order={selectedItem} client={getClientForOrder(selectedItem)} />
             </div>
        )}

        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {["Cliente", "Total", "Estado", "Fecha"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {sortedOrders.map(item => {
                        const client = getClientForOrder(item);
                        const whatsappLink = generateWhatsAppLink(client, item);
                        
                        return (<tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 font-semibold">{item.nombreCliente}</td>
                            <td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.total)}</td>
                            <td className={`px-4 py-4 font-medium`}>
                                <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.estado === 'Entregado' ? 'bg-green-100 text-green-800' : item.estado === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{item.estado}</span>
                            </td>
                            <td className="px-4 py-4 text-sm">{item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                            <td className="px-4 py-4 text-right space-x-2 flex justify-end">
                                {/* Botón Imprimir/PDF */}
                                <Button onClick={() => { setSelectedItem(item); setTimeout(handlePrint, 50); }} className="!p-2 !bg-blue-500 hover:!bg-blue-600" icon={Printer} title="Imprimir / Guardar PDF"/>
                                
                                {whatsappLink && (
                                    <a 
                                        href={whatsappLink} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="!p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition"
                                        title="Enviar por WhatsApp"
                                    >
                                        <Send className="w-4 h-4"/>
                                    </a>
                                )}
                                <Button onClick={() => handleEdit(item)} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
                                <Button onClick={() => archiveDoc('orders', item.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
                            </td>
                        </tr>);
                    })}
                </tbody>
            </table>
        </div>
    </div>);
};

// 8.3 Módulo de Órdenes de Compra (Purchase Orders)

// --- FUNCIÓN PARA GENERAR EL MENSAJE DE ORDEN DE COMPRA ---
const generatePurchaseOrderLink = (provider, po) => {
    if (!provider) return { whatsapp: null, email: null };

    const poDate = po.timestamp ? new Date(po.timestamp.seconds * 1000).toLocaleDateString() : 'N/A';
    const formattedCost = FORMAT_CURRENCY(po.costoTotal);
    
    let subject = `ORDEN DE COMPRA #${po.id || po.nombreProveedor} - DistriFort`;
    let body = `Estimado(a) ${provider.nombre},\n\n`;
    body += `Adjunto la Orden de Compra (OC) de DistriFort con fecha ${poDate}.\n`;
    body += `*Costo Total Estimado: ${formattedCost}*\n\n`;
    body += `*Detalle de Productos:*\n`;
    
    po.items.forEach(item => {
        body += `- ${item.cantidad}x ${item.nombreProducto} (Costo Un: ${FORMAT_CURRENCY(item.costoUnidad)})\n`;
    });
    body += `\nEstado: ${po.estado}.\n\nPor favor, confirme la recepción y la fecha de entrega.\n\nSaludos,\nDistriFort`;
    
    // Email Link (mailto)
    const emailLink = provider.email ? `mailto:${provider.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
    
    // WhatsApp logic (assuming Argentina format 54 9)
    const cleanPhone = provider.telefono ? provider.telefono.replace(/\D/g, '') : null;
    const phoneNumber = cleanPhone && cleanPhone.length >= 10 ? `549${cleanPhone}` : cleanPhone;
    const whatsappLink = phoneNumber ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(body)}` : null;

    return { whatsapp: whatsappLink, email: emailLink };
};

const PurchaseOrderPrintable = React.forwardRef(({ po, provider }, ref) => (
    <PrintableDocument ref={ref} title={`ORDEN DE COMPRA N° ${po.id || 'N/A'}`}>
        <div className="text-sm space-y-4">
            <h3 className="text-lg font-bold">Datos del Proveedor</h3>
            <p><strong>Proveedor:</strong> {provider?.nombre || po.nombreProveedor}</p>
            <p><strong>Teléfono:</strong> {provider?.telefono || 'N/A'}</p>
            <p><strong>Email:</strong> {provider?.email || 'N/A'}</p>
            
            <h3 className="text-lg font-bold mt-6 border-t pt-4">Detalle de Compra</h3>
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100 font-semibold">
                        <td className="p-2 border">Producto</td>
                        <td className="p-2 border text-right">Cantidad</td>
                        <td className="p-2 border text-right">Costo Unitario</td>
                        <td className="p-2 border text-right">Subtotal</td>
                    </tr>
                </thead>
                <tbody>
                    {po.items.map((item, index) => (
                        <tr key={index}>
                            <td className="p-2 border">{item.nombreProducto}</td>
                            <td className="p-2 border text-right">{item.cantidad}</td>
                            <td className="p-2 border text-right">{FORMAT_CURRENCY(item.costoUnidad)}</td>
                            <td className="p-2 border text-right">{FORMAT_CURRENCY(item.subtotalLinea)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            
            <div className="flex justify-end pt-4">
                <div className="w-64 space-y-1">
                    <p className="flex justify-between font-bold text-xl border-t pt-2"><span>COSTO TOTAL:</span> <span>{FORMAT_CURRENCY(po.costoTotal)}</span></p>
                </div>
            </div>
            
            <p className="mt-8">Estado: <strong>{po.estado}</strong></p>
        </div>
    </PrintableDocument>
));


const PurchaseOrderForm = ({ model, onSave, onCancel, products, providers }) => {
    const [po, setPo] = useState(model);
    const [selectedProductId, setSelectedProductId] = useState('');
    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [selectedProductId, products]);

    // Calcular costo total
    useEffect(() => {
        const costoTotal = po.items.reduce((sum, item) => sum + (item.subtotalLinea || 0), 0);
        setPo(prev => ({ ...prev, costoTotal }));
    }, [po.items]);

    const handleHeaderChange = e => {
        const { name, value, type } = e.target;
        let newPo = { ...po, [name]: type === 'number' ? parseFloat(value) || 0 : value };
        
        if (name === 'proveedorId') {
            const provider = providers.find(p => p.id === value);
            newPo.nombreProveedor = provider ? provider.nombre : '';
        }
        setPo(newPo);
    };

    const handleAddItem = () => {
        if (!selectedProduct || po.items.some(i => i.productId === selectedProductId)) return;

        const newItem = {
            productId: selectedProduct.id,
            nombreProducto: selectedProduct.nombre,
            cantidad: selectedProduct.udsPorCaja || 1, // Sugiere 1 caja por defecto
            costoUnidad: selectedProduct.costo, // Usamos el costo del producto como valor inicial
            subtotalLinea: selectedProduct.costo * (selectedProduct.udsPorCaja || 1),
        };

        setPo(prev => ({ ...prev, items: [...prev.items, newItem] }));
        setSelectedProductId('');
    };

    const handleUpdateItem = (index, key, value) => {
        const newItems = [...po.items];
        newItems[index][key] = value;
        newItems[index].subtotalLinea = newItems[index].cantidad * newItems[index].costoUnidad;
        setPo(prev => ({ ...prev, items: newItems }));
    };

    const handleRemoveItem = (index) => {
        const newItems = po.items.filter((_, i) => i !== index);
        setPo(prev => ({ ...prev, items: newItems }));
    };

    const handleSubmit = e => {
        e.preventDefault();
        if (!po.proveedorId) return alert("Debes seleccionar un proveedor.");
        if (po.items.length === 0) return alert("La orden debe tener al menos un producto.");
        onSave(po);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                <Select label="Proveedor" name="proveedorId" value={po.proveedorId} onChange={handleHeaderChange} required>
                    <option value="">Seleccione un Proveedor</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>
                <Select label="Estado" name="estado" value={po.estado} onChange={handleHeaderChange}>
                    {['Pendiente', 'Recibido', 'Cancelado'].map(s => <option key={s}>{s}</option>)}
                </Select>
            </div>

            <h4 className="text-lg font-semibold text-gray-700">Productos a Comprar</h4>
            <div className="flex space-x-2">
                <Select label="Producto" name="selectedProduct" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}>
                    <option value="">Añadir Producto...</option>
                    {products.filter(p => !po.items.some(i => i.productId === p.id)).map(p => (
                        <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                </Select>
                <Button onClick={handleAddItem} disabled={!selectedProduct} icon={Plus} className="self-end !px-3 !py-2">Añadir</Button>
            </div>

            {po.items.length > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-gray-600">
                                <th className="py-2 px-1">Producto</th>
                                <th className="py-2 px-1 w-20">Cantidad</th>
                                <th className="py-2 px-1 w-20 text-right">Costo Un.</th>
                                <th className="py-2 px-1 w-20 text-right">Subtotal</th>
                                <th className="py-2 px-1 w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {po.items.map((item, index) => (
                                <tr key={item.productId || index} className="border-b hover:bg-white">
                                    <td className="py-2 px-1 font-medium text-gray-800">{item.nombreProducto}</td>
                                    <td className="py-2 px-1">
                                        <input 
                                            type="number" 
                                            min="1"
                                            value={item.cantidad} 
                                            onChange={e => handleUpdateItem(index, 'cantidad', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-center"
                                        />
                                    </td>
                                    <td className="py-2 px-1 text-right">
                                        <input 
                                            type="number" 
                                            value={item.costoUnidad} 
                                            onChange={e => handleUpdateItem(index, 'costoUnidad', parseFloat(e.target.value) || 0)} 
                                            className="w-full p-1 border rounded text-right"
                                        />
                                    </td>
                                    <td className="py-2 px-1 text-right font-semibold text-gray-900">{FORMAT_CURRENCY(item.subtotalLinea)}</td>
                                    <td className="py-2 px-1 text-right"><button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex justify-end pt-4 space-y-2 flex-col items-end">
                <p className="text-xl font-bold pt-2 border-t-2 border-indigo-200">Costo Total: <span className="text-indigo-600">{FORMAT_CURRENCY(po.costoTotal)}</span></p>
            </div>

            <div className="flex justify-end space-x-3 pt-4 border-t">
                <Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button>
                <Button type="submit" icon={Save}>Guardar Orden</Button>
            </div>
        </form>
    );
};

const PurchaseOrderManager = () => {
    const { purchaseOrders, providers, products, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const componentRef = useRef(); // Ref para impresión

    const handleSave = async (itemData) => { 
        await createOrUpdateDoc('purchaseOrders', itemData, selectedItem?.id); 
        setIsModalOpen(false); 
        setSelectedItem(null); 
    };
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    const handlePrint = () => window.print();

    const sortedPurchaseOrders = useMemo(() => purchaseOrders.slice().sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)), [purchaseOrders]);

    // Obtener proveedor para el Link de Comunicación
    const getProviderForPO = useCallback((po) => {
        return providers.find(p => p.id === po.proveedorId);
    }, [providers]);

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
        
        {/* Documento de Impresión Oculto */}
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
                            <td className="px-4 py-4 font-semibold">{item.nombreProveedor}</td>
                            <td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.costoTotal)}</td>
                            <td className={`px-4 py-4 font-medium`}>
                                 <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.estado === 'Recibido' ? 'bg-green-100 text-green-800' : item.estado === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{item.estado}</span>
                            </td>
                            <td className="px-4 py-4 text-sm">{item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                            <td className="px-4 py-4 text-right space-x-2 flex justify-end">
                                {/* Botón Imprimir/PDF */}
                                <Button onClick={() => { setSelectedItem(item); setTimeout(handlePrint, 50); }} className="!p-2 !bg-blue-500 hover:!bg-blue-600" icon={Printer} title="Imprimir / Guardar PDF"/>

                                {/* WhatsApp Button */}
                                {communicationLinks.whatsapp && (
                                    <a 
                                        href={communicationLinks.whatsapp} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="!p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition"
                                        title="Enviar por WhatsApp"
                                    >
                                        <Send className="w-4 h-4"/>
                                    </a>
                                )}
                                {/* Email Button */}
                                {communicationLinks.email && (
                                    <a 
                                        href={communicationLinks.email} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="!p-2 !bg-gray-500 hover:!bg-gray-600 rounded-lg text-white transition"
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

// 8.4 Módulo Lista de Precios (RESTAURADO y COMPLETO)
const PriceListPrintable = React.forwardRef(({ products, client }, ref) => (
    <PrintableDocument ref={ref} title={`LISTA DE PRECIOS (${client.nombre})`}>
        <div className="text-sm space-y-4">
            <h3 className="text-lg font-bold">Cliente: {client.nombre} ({client.regimen})</h3>
            <p className="mb-4">Mostrando precios de: **Precio Unidad**</p>
            
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gray-100 font-semibold">
                        <td className="p-2 border">Producto</td>
                        <td className="p-2 border">Marca</td>
                        <td className="p-2 border text-right">Precio Unitario</td>
                        <td className="p-2 border text-right">Stock (Uds)</td>
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.id}>
                            <td className="p-2 border">{p.nombre}</td>
                            <td className="p-2 border">{p.marca}</td>
                            <td className="p-2 border text-right">{FORMAT_CURRENCY(p.precioUnidad)}</td>
                            <td className="p-2 border text-right">{p.stockTotal}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </PrintableDocument>
));

const PriceListManager = () => {
    const { products, clients } = useData();
    const [selectedClientId, setSelectedClientId] = useState('');
    const componentRef = useRef(); 
    
    const client = useMemo(() => clients.find(c => c.id === selectedClientId), [clients, selectedClientId]);
    
    const handlePrint = () => window.print();

    // Generar mensaje de WhatsApp/Email para la lista de precios
    const generatePriceListMessage = useCallback((client, products) => {
        if (!client) return { whatsapp: null, email: null };

        let message = `¡Hola ${client.nombre}!\n\n`;
        message += `Adjunto la lista de precios actualizada de DistriFort, aplicada a tu régimen *${client.regimen}*.\n\n`;
        message += `*Precios Principales:*\n`;
        
        products.forEach(p => {
            message += `- ${p.nombre}: ${FORMAT_CURRENCY(p.precioUnidad)}\n`;
        });
        
        message += `\n*Recuerda:* La lista de precios completa está adjunta en PDF. ¡Esperamos tu pedido!`;

        const subject = `Lista de Precios Actualizada para ${client.nombre}`;
        const cleanPhone = client.telefono ? client.telefono.replace(/\D/g, '') : null;
        const phoneNumber = cleanPhone && cleanPhone.length >= 10 ? `549${cleanPhone}` : cleanPhone;
        
        return { 
            whatsapp: phoneNumber ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}` : null,
            email: client.email ? `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : null,
        };
    }, [products]);

    const communicationLinks = useMemo(() => {
        return client ? generatePriceListMessage(client, products) : { whatsapp: null, email: null };
    }, [client, products, generatePriceListMessage]);

    return (
        <div className="space-y-6">
            <PageHeader title="Lista de Precios">
                <Select label="Seleccionar Cliente" name="client" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                    <option value="">-- Seleccionar para Personalizar --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.regimen})</option>)}
                </Select>
            </PageHeader>

            {client && (
                <div className="bg-white p-6 rounded-xl shadow-md space-y-4">
                    <h3 className="text-xl font-bold text-gray-800">Precios para {client.nombre}</h3>
                    <div className="flex space-x-3 no-print">
                        <Button onClick={handlePrint} icon={Printer} className="!bg-blue-500 hover:!bg-blue-600">Imprimir / Guardar PDF</Button>
                        {communicationLinks.whatsapp && (
                            <a href={communicationLinks.whatsapp} target="_blank" rel="noopener noreferrer">
                                <Button icon={Send} className="!bg-green-500 hover:!bg-green-600">Enviar WhatsApp</Button>
                            </a>
                        )}
                        {communicationLinks.email && (
                            <a href={communicationLinks.email} target="_blank" rel="noopener noreferrer">
                                <Button icon={Mail} className="!bg-gray-500 hover:!bg-gray-600">Enviar Email</Button>
                            </a>
                        )}
                    </div>

                    <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                                <tr>
                                    {["Producto", "Marca", "Precio Unitario", "Stock (Uds)"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {products.map(p => (
                                    <tr key={p.id}>
                                        <td className="px-4 py-4 font-semibold">{p.nombre}</td>
                                        <td className="px-4 py-4">{p.marca}</td>
                                        <td className="px-4 py-4 text-right">{FORMAT_CURRENCY(p.precioUnidad)}</td>
                                        <td className="px-4 py-4 text-right">{p.stockTotal}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {/* Documento de Impresión Oculto */}
            {client && (
                 <div className="hidden no-print">
                     <PriceListPrintable ref={componentRef} products={products} client={client} />
                 </div>
            )}
        </div>
    );
};


// 8.5 Módulo Búsqueda Global (RESTAURADO)
const GlobalSearch = () => {
    const { products, clients, orders } = useData();
    const [term, setTerm] = useState('');
    const results = useMemo(() => {
        if (!term) return {};
        const lowerTerm = term.toLowerCase();
        return {
            products: products.filter(p => p.nombre.toLowerCase().includes(lowerTerm)),
            clients: clients.filter(c => c.nombre.toLowerCase().includes(lowerTerm)),
            orders: orders.filter(o => o.nombreCliente.toLowerCase().includes(lowerTerm)),
        };
    }, [term, products, clients, orders]);
    return (<div className="space-y-6"><PageHeader title="Búsqueda Global" /><Input placeholder="Buscar productos, clientes, pedidos..." value={term} onChange={e => setTerm(e.target.value)} />{term && Object.entries(results).map(([key, value]) => value.length > 0 && (<div key={key} className="bg-white p-4 rounded-xl shadow-md"><h3 className="text-lg font-bold text-indigo-600 mb-2">{key.charAt(0).toUpperCase() + key.slice(1)} ({value.length})</h3><ul className="space-y-1">{value.map(item => <li key={item.id} className="text-gray-700 p-2 border-b last:border-b-0 hover:bg-gray-50 rounded-md">{item.nombre || item.nombreCliente}</li>)}</ul></div>))}</div>);
};


// 8.6 Módulo Cotización (ShippingQuoter)
const ShippingQuoter = () => {
    const [distance, setDistance] = useState(0);
    const [weight, setWeight] = useState(0);

    const { totalCost, baseRate, ratePerKm, ratePerKg } = useMemo(() => {
        const BASE_RATE = 1500; // Costo base fijo
        const RATE_PER_KM = 25; // Costo por kilómetro
        const RATE_PER_KG = 5;  // Costo por kilogramo
        
        const dist = parseFloat(distance) || 0;
        const wgt = parseFloat(weight) || 0;
        
        const cost = BASE_RATE + (dist * RATE_PER_KM) + (wgt * RATE_PER_KG);

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
                        <p>Costo por Distancia ({distance} km): <span className="font-semibold">{FORMAT_CURRENCY(distance * ratePerKm)}</span></p>
                        <p>Costo por Peso ({weight} kg): <span className="font-semibold">{FORMAT_CURRENCY(weight * ratePerKg)}</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 8.7 Módulo de Herramientas (RESTAURADO y COMPLETO)
const ProfitCalculator = () => {
    const [cost, setCost] = useState(0);
    const [price, setPrice] = useState(0);

    const { margin, markup, marginPercentage, markupPercentage } = useMemo(() => {
        const c = parseFloat(cost) || 0;
        const p = parseFloat(price) || 0;
        
        const profit = p - c;
        
        // Margen (Gross Margin): (Revenue - COGS) / Revenue
        const marginP = p > 0 ? (profit / p) : 0;
        
        // Markup: (Price - Cost) / Cost
        const markupP = c > 0 ? (profit / c) : 0;

        return {
            margin: profit,
            markup: profit,
            marginPercentage: marginP * 100,
            markupPercentage: markupP * 100
        };
    }, [cost, price]);

    const handleChange = (setter) => (e) => setter(parseFloat(e.target.value) || 0);

    const dataCards = [
        { title: "Ganancia (Margen)", value: FORMAT_CURRENCY(margin), icon: DollarSign, color: "green" },
        { title: "Margen Bruto (%)", value: `${marginPercentage.toFixed(2)}%`, icon: TrendingUp, color: "blue" },
        { title: "Markup (%)", value: `${markupPercentage.toFixed(2)}%`, icon: TrendingUp, color: "indigo" },
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-md space-y-4">
                <h4 className="text-xl font-semibold text-gray-700">Calcular Rentabilidad</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input 
                        label="Costo del Producto ($)" 
                        type="number" 
                        value={cost} 
                        onChange={handleChange(setCost)} 
                        required
                    />
                    <Input 
                        label="Precio de Venta ($)" 
                        type="number" 
                        value={price} 
                        onChange={handleChange(setPrice)} 
                        required
                    />
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {dataCards.map(card => (
                    <Card key={card.title} title={card.title} value={card.value} icon={card.icon} color={card.color} />
                ))}
            </div>
        </div>
    );
};

const AIChat = () => {
    const [prompt, setPrompt] = useState('');
    const [response, setResponse] = useState('Pregunta al asistente sobre tendencias del mercado, mejores prácticas de distribución o análisis de tu inventario.');
    const [loading, setLoading] = useState(false);

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        setLoading(true);
        setResponse('...Generando respuesta de IA...');
        
        // Incluir contexto de negocio
        const context = "Actúa como un analista de negocios experto en distribución de bebidas. Ofrece consejos concisos y prácticos. Limita la respuesta a un máximo de 200 palabras.";
        const fullPrompt = `${context} -- Pregunta del usuario: ${prompt}`;
        
        const result = await secureGeminiFetch(fullPrompt);
        
        setResponse(result);
        setLoading(false);
        setPrompt('');
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-md space-y-4 flex flex-col h-full min-h-[50vh]">
            <h4 className="text-xl font-semibold text-indigo-600 flex items-center space-x-2"><BrainCircuit className="w-6 h-6"/><span>Asistente de Distribución IA</span></h4>
            
            <div className="flex-1 overflow-y-auto p-3 bg-gray-50 rounded-lg whitespace-pre-wrap text-sm text-gray-800">
                {loading ? <PageLoader text="Analizando..." /> : response}
            </div>

            <form onSubmit={handleChatSubmit} className="flex space-x-3 pt-4 border-t">
                <Input 
                    name="chatPrompt" 
                    value={prompt} 
                    onChange={e => setPrompt(e.target.value)} 
                    placeholder="Ej: ¿Cuál es la mejor estrategia para rotar el stock de vinos rojos?"
                    className="flex-1"
                />
                <Button type="submit" disabled={!prompt.trim() || loading} icon={Send}>
                    {loading ? '...' : 'Enviar'}
                </Button>
            </form>
        </div>
    );
};


const Tools = () => {
    const [subPage, setSubPage] = useState('calculator'); // 'calculator' o 'ai'

    return (
        <div className="space-y-6">
            <PageHeader title="Herramientas de Distribución">
                <div className="flex space-x-3">
                    <Button 
                        onClick={() => setSubPage('calculator')} 
                        className={subPage === 'calculator' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'}
                        icon={DollarSign}
                    >
                        Calculadora
                    </Button>
                    <Button 
                        onClick={() => setSubPage('ai')} 
                        className={subPage === 'ai' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'}
                        icon={BrainCircuit}
                    >
                        Asistente IA
                    </Button>
                </div>
            </PageHeader>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {subPage === 'calculator' && <ProfitCalculator />}
                {subPage === 'ai' && <AIChat />}
            </div>
        </div>
    );
};

const Dashboard = () => {
    const { products, orders, clients, purchaseOrders } = useData();

    // 1. Métricas de Inventario
    const lowStockCount = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo).length, [products]);
    const totalInventoryValue = useMemo(() => 
        products.reduce((sum, p) => sum + (p.costo * p.stockTotal), 0), 
        [products]
    );

    // 2. Métricas de Ventas y Financieras
    const totalRevenue = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders]);
    
    const ordersThisMonth = useMemo(() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return orders.filter(o => 
            o.timestamp && new Date(o.timestamp.seconds * 1000) >= startOfMonth
        );
    }, [orders]);

    const revenueThisMonth = useMemo(() => 
        ordersThisMonth.reduce((sum, o) => sum + o.total, 0), 
        [ordersThisMonth]
    );
    
    // 3. Métricas de Margen (simulado)
    // Para un margen más realista, necesitamos el costo total de los productos vendidos.
    const productCostMap = useMemo(() => new Map(products.map(p => [p.id, p.costo])), [products]);
    
    const grossProfitTotal = useMemo(() => {
        return orders.reduce((sum, order) => {
            const orderCost = order.items.reduce((costSum, item) => {
                const costPerUnit = productCostMap.get(item.productId) || 0;
                return costSum + (costPerUnit * item.cantidad);
            }, 0);
            return sum + (order.total - orderCost);
        }, 0);
    }, [orders, productCostMap]);
    
    const grossMarginPercent = useMemo(() => {
        if (totalRevenue === 0) return 0;
        return (grossProfitTotal / totalRevenue) * 100;
    }, [totalRevenue, grossProfitTotal]);

    const dashboardCards = [
        { title: "Ingreso Total (Histórico)", value: FORMAT_CURRENCY(totalRevenue), icon: DollarSign, color: "green" },
        { title: "Margen Bruto (%)", value: `${grossMarginPercent.toFixed(1)}%`, icon: TrendingUp, color: grossMarginPercent >= 20 ? "green" : "red" },
        { title: "Valor del Inventario", value: FORMAT_CURRENCY(totalInventoryValue), icon: Package, color: "indigo" },
        { title: "Ingreso del Mes", value: FORMAT_CURRENCY(revenueThisMonth), icon: FileText, color: "blue" },
        { title: "Productos Stock Bajo", value: lowStockCount, icon: AlertCircle, color: lowStockCount > 0 ? "red" : "green" },
        { title: "Pedidos Pendientes", value: orders.filter(o => o.estado === 'Pendiente').length, icon: ShoppingCart, color: "yellow" },
        { title: "Cuentas por Cobrar", value: FORMAT_CURRENCY(clients.reduce((sum, c) => sum + c.saldoPendiente, 0)), icon: TrendingDown, color: "red" },
        { title: "Órdenes de Compra (Pendientes)", value: purchaseOrders.filter(po => po.estado === 'Pendiente').length, icon: Truck, color: "indigo" },
    ];


    return (
        <div className="space-y-6">
            <PageHeader title="Panel de Control">
                <p className="text-sm text-gray-500">Métricas clave de negocio para DistriFort.</p>
            </PageHeader>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {dashboardCards.map(card => (
                    <Card key={card.title} {...card} />
                ))}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-bold text-gray-800 mb-4">Análisis Rápido</h3>
                <p className="text-gray-600">
                    Tu valor total de inventario es de **{FORMAT_CURRENCY(totalInventoryValue)}**. Actualmente tienes **{lowStockCount}** productos bajo el umbral de stock. Tu margen bruto total es de **{grossMarginPercent.toFixed(1)}%**, indicando una buena salud financiera general.
                </p>
            </div>
        </div>
    );
};

// --- 9. APP PRINCIPAL Y NAVEGACIÓN ---
const AppLayout = () => {
    const { logout } = useData();
    const [currentPage, setCurrentPage] = useState('Dashboard');
    
    const navItems = [
        { name: 'Dashboard', icon: LayoutDashboard }, { name: 'Inventario', icon: Package },
        { name: 'Clientes', icon: Users }, { name: 'Proveedores', icon: Building },
        { name: 'Pedidos', icon: ShoppingCart }, { name: 'Órdenes de Compra', icon: Truck },
        { name: 'Lista de Precios', icon: FileText }, // RESTAURADO
        { name: 'Buscar', icon: Search }, { name: 'Herramientas', icon: BrainCircuit },
        { name: 'Cotización', icon: MapPin }, 
    ];

    const renderPage = () => {
        if (!db) return <div className="text-center text-red-500">Error: La configuración de Firebase no se pudo cargar.</div>
        switch (currentPage) {
            case 'Dashboard': return <Dashboard />;
            case 'Inventario': return <ProductManager />;
            case 'Clientes': return <ClientManager />;
            case 'Proveedores': return <ProviderManager />;
            case 'Pedidos': return <OrderManager />; 
            case 'Órdenes de Compra': return <PurchaseOrderManager />;
            case 'Lista de Precios': return <PriceListManager />; // RESTAURADO
            case 'Buscar': return <GlobalSearch />; 
            case 'Herramientas': return <Tools />; 
            case 'Cotización': return <ShippingQuoter />; 
            default: return <Dashboard />;
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans">
            <nav className="fixed bottom-0 left-0 right-0 md:relative md:w-64 bg-white shadow-lg p-2 md:p-4 flex flex-col shrink-0 z-20 border-t md:border-t-0 md:shadow-none md:border-r">
                <h1 className="hidden md:block text-2xl font-black text-indigo-600 mb-8 px-2">DistriFort</h1>
                <ul className="flex flex-row justify-around md:flex-col md:space-y-2 flex-grow">
                    {navItems.map(item => (
                        <li key={item.name}>
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

    if (!userId) {
        return <AuthScreen />;
    }
    
    if(loading) {
        return <PageLoader text="Cargando datos..." />;
    }

    return <AppLayout />;
};
