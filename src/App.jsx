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

    // Lógica de Guardado (simple, no tenía diagnóstico, pero funcionaba para la compilación)
    const handleSave = async (itemData) => { 
        try {
            await createOrUpdateDoc('products', itemData, selectedItem?.id); 
            setIsModalOpen(false); 
            setSelectedItem(null); 
        } catch (error) {
             console.error("DEBUG: Fallo al guardar (posiblemente DB no lista o error de permisos en la DB).", error);
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
); 

const OrderForm = ({ model, onSave, onCancel }) => {
    const { clients, products, db, auth } = useData(); 
    const [order, setOrder] = useState(model);
    const [selectedProductId, setSelectedProductId] = useState('');
    const selectedClient = useMemo(() => clients.find(c => c.id === order.clienteId), [order.clienteId, clients]);
    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [selectedProductId, products]);

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

        const price = selectedClient?.regimen === 'Mayorista' && selectedProduct.precioCaja > 0 
            ? selectedProduct.precioCaja 
            : selectedProduct.precioUnidad;

        const newItem = {
            productId: selectedProduct.id,
            nombreProducto: selectedProduct.nombre,
            cantidad: 1,
            precioUnidad: price,
            subtotalLinea: price * 1,
        };

        setOrder(prev => ({ ...prev, items: [...prev.items, newItem] }));
        setSelectedProductId('');
    };
    const handleUpdateItem = (index, key, value) => {
        const newItems = [...order.items];
        const numericValue = parseFloat(value) || 0;

        newItems[index][key] = numericValue;
        newItems[index].subtotalLinea = newItems[index].cantidad * newItems[index].precioUnidad;
        setOrder(prev => ({ ...prev, items: newItems }));
    };
    const handleRemoveItem = (index) => {
        const newItems = order.items.filter((_, i) => i !== index);
        setOrder(prev => ({ ...prev, items: newItems }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!order.clienteId) return console.warn("VALIDATION: Debes seleccionar un cliente."); 
        if (order.items.length === 0) return console.warn("VALIDATION: El pedido debe tener al menos un producto.");
        
        const batch = writeBatch(db);
        const userId = auth.currentUser.uid;
        
        // 1. Prepara Referencias y el ID del Pedido
        const orderId = order.id || doc(collection(db, `/artifacts/${appId}/users/${userId}/orders`)).id; 
        const orderRef = doc(db, `/artifacts/${appId}/users/${userId}/orders`, orderId);
        const clientRef = doc(db, `/artifacts/${appId}/users/${userId}/clients`, order.clienteId);

        // 2. Guarda/Actualiza el Documento del Pedido
        batch.set(orderRef, { 
            ...order, 
            timestamp: serverTimestamp(),
            subtotal: parseFloat(order.subtotal) || 0,
            total: parseFloat(order.total) || 0,
            costoEnvio: parseFloat(order.costoEnvio) || 0,
            descuento: parseFloat(order.descuento) || 0,
            userId: userId, 
            id: orderId
        }, { merge: true });

        // 3. Actualiza el Saldo Pendiente del Cliente
        const newSaldoPendiente = (clients.find(c => c.id === order.clienteId)?.saldoPendiente || 0) + (order.total || 0);
        batch.update(clientRef, { saldoPendiente: newSaldoPendiente });

        // 4. Actualiza el Stock de los Productos
        for (const item of order.items) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const productRef = doc(db, `/artifacts/${appId}/users/${userId}/products`, item.productId);
                const newStockTotal = product.stockTotal - item.cantidad;
                batch.update(productRef, { stockTotal: newStockTotal });
            }
        }

        try {
            // EJECUTA LA TRANSACCIÓN
            await batch.commit();
            console.log("SUCCESS: Pedido Guardado, Saldo y Stock Actualizados!");
            onSave({ ...order, id: orderId }); // Llama al handleSave del ManagerComponent
        } catch (e) {
            console.error("ERROR CRÍTICO AL EJECUTAR LA TRANSACCIÓN:", e);
            alert(`Error de Transacción Firestore. Detalle: ${e.message}. El guardado ha fallado.`);
        }
    };
    return (<form onSubmit={handleSubmit}>
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
                                            step="1"
                                            value={item.cantidad} 
                                            onChange={e => handleUpdateItem(index, 'cantidad', e.target.value)} 
                                            className="w-full p-1 border rounded text-center"
                                        />
                                    </td>
                                    <td className="py-2 px-1 text-right">
                                        <input 
                                            type="number" 
                                            value={item.precioUnidad} 
                                            onChange={e => handleUpdateItem(index, 'precioUnidad', e.target.value)} 
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
        <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button>
            <Button type="submit" icon={Save}>Guardar Pedido</Button>
        </div>
    </form>);
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
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    const handlePrint = () => window.print();
    
    const sortedOrders = useMemo(() => orders.slice().sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)), [orders]);
    const getClientForOrder = useCallback((order) => clients.find(c => c.id === order.clienteId), [clients]);
    
    return (<div className="space-y-6">
        <PageHeader title="Pedidos">
            <Button onClick={handleAddNew} icon={Plus}>Añadir Pedido</Button>
        </PageHeader>
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Pedido"} onClose={() => setIsModalOpen(false)}>
            <OrderForm model={selectedItem || ORDER_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)} />
        </Modal>}
        {selectedItem && (<div className="hidden no-print">
            <OrderPrintable ref={componentRef} order={selectedItem} client={getClientForOrder(selectedItem)} />
        </div>)}
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
                                <Button onClick={() => { setSelectedItem(item); setTimeout(handlePrint, 50); }} className="!p-2 !bg-blue-500 hover:!bg-blue-600" icon={Printer} title="Imprimir / Guardar PDF"/>

                                {whatsappLink && (
                                    <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="!p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition" title="Enviar por WhatsApp">
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

// 8.5 Módulos de Gestión: Órdenes de Compra
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
);

const PurchaseOrderForm = ({ model, onSave, onCancel, products, providers }) => {
    const [po, setPo] = useState(model);
    const [selectedProductId, setSelectedProductId] = useState('');
    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [selectedProductId, products]);

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
            cantidad: selectedProduct.udsPorCaja || 1, 
            costoUnidad: selectedProduct.costo, 
            subtotalLinea: selectedProduct.costo * (selectedProduct.udsPorCaja || 1),
        };

        setPo(prev => ({ ...prev, items: [...prev.items, newItem] }));
        setSelectedProductId('');
    };

    const handleUpdateItem = (index, key, value) => {
        const newItems = [...po.items];
        const numericValue = parseFloat(value) || 0;

        newItems[index][key] = numericValue;
        newItems[index].subtotalLinea = newItems[index].cantidad * newItems[index].costoUnidad;
        setPo(prev => ({ ...prev, items: newItems }));
    };

    const handleRemoveItem = (index) => {
        const newItems = po.items.filter((_, i) => i !== index);
        setPo(prev => ({ ...prev, items: newItems }));
    };

    const handleSubmit = e => {
        e.preventDefault();
        if (!po.proveedorId) return console.warn("VALIDATION: Debes seleccionar un proveedor.");
        if (po.items.length === 0) return console.warn("VALIDATION: La orden debe tener al menos un producto.");
        onSave(po);
    };
    return (<form onSubmit={handleSubmit}>
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
                {products.filter(p => !po.items.some(i => i.productId === selectedProductId)).map(p => (
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
            189| const AppController = () => {
190|     const { userId, isAuthReady, loading } = useData();
191|     
192|     if (!isAuthReady) {
193|         return <PageLoader text="Inicializando..." />;
194|     }
195| 
196|     if(loading) {
197|         return <PageLoader text="Cargando datos..." />;
198|     }
199| 
200|     // Ya que dependemos de la autenticación anónima, vamos directo al layout
201|     return <AppLayout />;
202| };
203| 
204| 
205| // --- 2. MODELOS DE DATOS ---
206| const PRODUCT_MODEL = { nombre: '', bodega: '', proveedorId: '', especie: 'Vino', varietal: '', costo: 0, precioUnidad: 0, precioCaja: 0, udsPorCaja: 6, stockTotal: 0, umbralMinimo: 10, archivado: false };
207| const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
208| const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
209| const PROVIDER_MODEL = { nombre: '', responsable: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
210| const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

Error durante la compilación:
Error: La transformación falló con 1 error:
/vercel/path0/src/App.jsx:550:1: ERROR: Se esperaba ")" pero se encontró ";"
    en FailureErrorWithLog (/vercel/path0/node_modules/esbuild/lib/main.js:1649:15)
    en /vercel/path0/node_modules/esbuild/lib/main.js:847:29
    en responseCallbacks.<computed> (/vercel/path0/node_modules/esbuild/lib/main.js:703:9)
    en handleIncomingPacket (/vercel/path0/node_modules/esbuild/lib/main.js:762:9)
    en Socket.readFromStdout (/vercel/path0/node_modules/esbuild/lib/main.js:679:7)
    en Socket.emit (nodo:eventos:519:28)
    en addChunk (nodo:internal/streams/readable:561:12)
    en readableAddChunkPushByteMode (nodo:internal/streams/readable:512:3)
    en Readable.push (nodo:internal/streams/readable:392:5)
    en Pipe.onStreamRead (nodo:internal/stream_base_commons:189:23)
Error: el comando "npm run build" salió con 1
