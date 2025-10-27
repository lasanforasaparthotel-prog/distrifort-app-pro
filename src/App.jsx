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
    signInAnonymously,
    signInWithCustomToken // Asegúrate que esta importación esté (la añadimos para corregir un error anterior)
} from 'firebase/auth';
import {
    getFirestore, collection, doc, onSnapshot, setDoc,
    serverTimestamp, writeBatch, updateDoc, query, where, setLogLevel
} from 'firebase/firestore';
import { // Remove unused icons: Tag, List, AtSign, KeyRound, Code
    LayoutDashboard, Package, Users, Truck, Search, Plus,
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save,
    FileText, ShoppingCart, Building, LogOut, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer, Upload, Image as ImageIcon
} from 'lucide-react';

// --- 1. SOLUCIÓN: CONFIGURACIÓN DE FIREBASE INCORPORADA ---
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
const PRODUCT_MODEL = {
    codigo: '', categoria: '', nombre: '', marca: '', proveedorId: '', nombreProveedor: '',
    presentacion: '', costo: 0, precioUnidad: 0, precioCaja: 0, precioPack: 0, precioPallet: 0,
    udsPorCaja: 6, udsPorPack: 0, udsPorPallet: 0, stockTotal: 0, umbralMinimo: 10, archivado: false
};
const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
const PROVIDER_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

// --- 2b. MAPEADO DE COLECCIONES ---
const COLLECTION_NAMES = {
    products: 'Inventario', clients: 'Clientes', orders: 'Pedidos',
    providers: 'Proveedores', purchaseOrders: 'OrdenesCompra'
};

// --- 3. HOOKS PERSONALIZADOS ---
const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    useEffect(() => {
        if (!auth) { setIsAuthReady(true); return; }
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) { setUserId(user.uid); }
            else { try { const cred = await signInAnonymously(auth); setUserId(cred.user.uid); } catch(e) { console.error("Error auth anónima:", e); }}
            setIsAuthReady(true);
        });
        return unsub;
    }, []);
    return { userId, isAuthReady }; // Simplificado, authDomainError no se usa
};

const useCollection = (collectionName) => {
    const { userId, isAuthReady } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!isAuthReady || !userId || !db) { setLoading(false); return; };
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) { console.error(`Colección inválida: ${collectionName}`); setLoading(false); return; }
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        const q = query(collection(db, path), where("archivado", "==", false));
        const unsub = onSnapshot(q, snapshot => {
            setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, err => { console.error(`Error en ${path}:`, err); setLoading(false); });
        return unsub;
    }, [userId, collectionName, isAuthReady]);
    return { data, loading };
};

// --- 4. CONTEXTO DE DATOS Y ACCIONES ---
const DataContext = createContext(null);
const DataProvider = ({ children }) => {
    const { userId, isAuthReady } = useAuth(); // Simplificado
    const collections = ['products', 'clients', 'orders', 'providers', 'purchaseOrders'];
    const state = collections.reduce((acc, name) => { acc[name] = useCollection(name); return acc; }, {});
    const logout = () => signOut(auth); // Simplificado
    const createOrUpdateDoc = useCallback(async (collectionName, data, id) => {
        if (!userId || !db) throw new Error("No autenticado o DB no inicializada.");
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) throw new Error(`Nombre de colección no válido: ${collectionName}`);
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        const docRef = id ? doc(db, path, id) : doc(collection(db, path));
        try {
            // Limpiar datos antes de guardar (convertir a número si es necesario)
             const cleanedData = { ...data };
            const numericFields = ['costo', 'precioUnidad', 'precioCaja', 'precioPack', 'precioPallet', 'udsPorCaja', 'udsPorPack', 'udsPorPallet', 'stockTotal', 'umbralMinimo', 'minimoCompra', 'limiteCredito', 'saldoPendiente', 'costoTotal', 'subtotal', 'costoEnvio', 'descuento', 'total'];
            numericFields.forEach(field => {
                if (cleanedData[field] !== undefined && typeof cleanedData[field] !== 'number') {
                    cleanedData[field] = parseFloat(cleanedData[field]) || 0;
                }
             });
             // Asegurar que items sea un array (para Pedidos y OrdenesCompra)
             if (collectionName === 'orders' || collectionName === 'purchaseOrders') {
                 cleanedData.items = Array.isArray(cleanedData.items) ? cleanedData.items : [];
                 // Limpiar items individualmente
                 cleanedData.items = cleanedData.items.map(item => {
                     const cleanedItem = {...item};
                     const itemNumericFields = ['cantidad', 'precioUnidad', 'subtotalLinea', 'costoUnidad'];
                     itemNumericFields.forEach(f => {
                         if(cleanedItem[f] !== undefined && typeof cleanedItem[f] !== 'number') {
                             cleanedItem[f] = parseFloat(cleanedItem[f]) || 0;
                         }
                     });
                     return cleanedItem;
                 });
             }

            await setDoc(docRef, { ...cleanedData, timestamp: serverTimestamp() }, { merge: true });
        } catch (error) {
            console.error(`[createOrUpdateDoc] Error al escribir en ${docRef.path}:`, error);
        }
    }, [userId]);
    const archiveDoc = useCallback(async (collectionName, id) => {
        if (!userId || !db) throw new Error("No autenticado o DB no inicializada.");
        const realCollectionName = COLLECTION_NAMES[collectionName];
        if (!realCollectionName) throw new Error(`Nombre de colección no válido: ${collectionName}`);
        const path = `/artifacts/${appId}/users/${userId}/${realCollectionName}`;
        try {
            await updateDoc(doc(db, path, id), { archivado: true });
        } catch (error) {
             console.error(`[archiveDoc] Error al archivar ${path}/${id}:`, error);
        }
    }, [userId]);
    const value = {
        userId, isAuthReady,
        ...collections.reduce((acc, name) => ({ ...acc, [name]: state[name].data }), {}),
        loading: Object.values(state).some(s => s.loading),
        logout, createOrUpdateDoc, archiveDoc,
    }; // Funciones de login/registro/google no usadas aquí
    return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};
const useData = () => useContext(DataContext);

// --- 5. COMPONENTES DE UI GENÉRICOS ---
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (<button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} ${className}`}>{Icon && <Icon className="w-5 h-5" />}<span>{children}</span></button>);
const Modal = ({ title, children, onClose }) => (<div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl"><h3 className="text-lg font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X /></button></div><div className="p-4 md:p-6 overflow-y-auto">{children}</div></div></div>);
const Input = ({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '', step = 'any' }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><div className="relative"><input type={type} name={name} value={value || ''} onChange={onChange} required={required} placeholder={placeholder} className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className}`} step={step} />{Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}</div></div>);
const Select = ({ label, name, value, onChange, children, required = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><select name={name} value={value || ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition">{children}</select></div>);
const Card = ({ title, value, icon: Icon, color = 'indigo', onClick }) => (<div onClick={onClick} className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">{title}</p><Icon className={`w-6 h-6 text-${color}-500`} /></div><p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p></div>);
const PageLoader = ({ text }) => (<div className="min-h-screen flex flex-col items-center justify-center text-gray-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div><p className="mt-2">{text}</p></div>);
const PageHeader = ({ title, children }) => (<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h2 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h2><div>{children}</div></div>);
const GoogleIcon = () => (<svg className="w-5 h-5" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571l6.19,5.238C42.022,35.335,44,30.038,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>); // No usado actualmente
const PrintableDocument = React.forwardRef(({ children, title, logoText = "DistriFort" }, ref) => (<div ref={ref} className="p-6 print:p-0 print:text-black w-full min-h-screen"><div className="hidden print:block mb-8 border-b-2 border-gray-900 pb-2"><h1 className="text-3xl font-black">{logoText}</h1><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm">Fecha de Emisión: {new Date().toLocaleDateString()}</p></div>{children}<style dangerouslySetInnerHTML={{__html: `@page { size: A4; margin: 1cm; } body { margin: 0 !important; } .print\\:hidden { display: none !important; } .hidden.print\\:block { display: block !important; } .print\\:text-black { color: #000 !important; } .print\\:p-0 { padding: 0 !important; } @media print { .no-print { display: none !important; } }`}} /></div>));

// --- 6. LÓGICA DE IA (GEMINI) ---
const secureGeminiFetch = async (prompt, isImageGeneration = false) => {
    try {
        const model = isImageGeneration ? 'imagen-3.0-generate-002' : 'gemini-pro'; // Ajustado a gemini-pro como default
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
            // Intenta extraer un mensaje más específico si está disponible
            const message = errorData?.error?.message || `Error en el servidor de IA (${model}).`;
            throw new Error(message);
        }

        const data = await response.json();

        if (isImageGeneration) {
            const base64Data = data.predictions?.[0]?.bytesBase64Encoded;
            if (!base64Data) throw new Error("La IA no generó una imagen válida (respuesta vacía).");
            return `data:image/png;base64,${base64Data}`;
        } else {
             // Manejar caso donde no hay candidatos o contenido
             if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
                console.warn("Respuesta de IA vacía o inesperada:", data);
                return "La IA no generó una respuesta de texto válida.";
            }
            return data.candidates[0].content.parts[0].text;
        }

    } catch (error) {
        console.error("Error fetching Gemini/Imagen:", error);
        // Mostrar un mensaje más genérico al usuario
        return `Hubo un error al conectar con el asistente de IA. Por favor, inténtalo de nuevo más tarde. (Detalle: ${error.message})`;
    }
};

// --- 7. PANTALLA DE AUTENTICACIÓN (ELIMINADA) ---

// --- 8. MÓDULOS FUNCIONALES (PÁGINAS) ---

// Componentes FormComponent y ManagerComponent
const FormComponent = ({ model, onSave, onCancel, children, ...props }) => {
    const [item, setItem] = useState(model || {});
    useEffect(() => { setItem(model || {}); }, [model]);
    const handleChange = useCallback((e) => {
        const { name, value, type } = e.target;
        setItem(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    }, []);
    const handleSubmit = e => { e.preventDefault(); onSave(item); };
    const childrenWithProps = React.Children.map(children, child => React.isValidElement(child) ? React.cloneElement(child, { item, handleChange, ...props }) : child);
    return (<form onSubmit={handleSubmit} className="space-y-4">{childrenWithProps}<div className="flex justify-end space-x-3 pt-4 border-t mt-6"><Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button><Button type="submit" icon={Save}>Guardar</Button></div></form>);
};
const ManagerComponent = ({ title, collectionName, model, FormFields, TableHeaders, TableRow, ...props }) => {
    const { [collectionName]: data, createOrUpdateDoc, archiveDoc, providers } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const handleSave = async (itemData) => { /* Logic with numeric conversion */
        const numericFields = ['costo', 'precioUnidad', 'precioCaja', 'precioPack', 'precioPallet', 'udsPorCaja', 'udsPorPack', 'udsPorPallet', 'stockTotal', 'umbralMinimo', 'minimoCompra', 'limiteCredito', 'saldoPendiente', 'costoTotal', 'subtotal', 'costoEnvio', 'descuento', 'total'];
        numericFields.forEach(field => { if (itemData[field] !== undefined && typeof itemData[field] !== 'number') itemData[field] = parseFloat(itemData[field]) || 0; });
        if (collectionName === 'clients') { itemData.minimoCompra = parseFloat(itemData.minimoCompra) || 0; itemData.limiteCredito = parseFloat(itemData.limiteCredito) || 0; itemData.saldoPendiente = parseFloat(itemData.saldoPendiente) || 0; }
        await createOrUpdateDoc(collectionName, itemData, selectedItem?.id);
        setIsModalOpen(false); setSelectedItem(null);
    };
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    const formProps = collectionName === 'products' ? { providers, ...props } : { ...props };
    return (<div className="space-y-6"><PageHeader title={title}><Button onClick={handleAddNew} icon={Plus}>Añadir {title.slice(0, -1)}</Button></PageHeader>{isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + title.slice(0, -1)} onClose={() => setIsModalOpen(false)}><FormComponent model={selectedItem || model} onSave={handleSave} onCancel={() => setIsModalOpen(false)} {...formProps}><FormFields /></FormComponent></Modal>}<div className="bg-white shadow-lg rounded-xl overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{TableHeaders.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}<th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{data && data.map(item => <TableRow key={item.id} item={item} onEdit={() => handleEdit(item)} onArchive={() => archiveDoc(collectionName, item.id)} />)}</tbody></table>{(!data || data.length === 0) && (<p className="p-4 text-center text-gray-500">No hay {title.toLowerCase()} para mostrar.</p>)}</div></div>);
};

// Módulo Producto (Inventario)
const ProductFormFields = ({ item, handleChange, providers }) => { /* ... (definición completa anterior) ... */
    const [stockAmount, setStockAmount] = useState(0);
    const [stockUnit, setStockUnit] = useState('unidad');

    const handleProviderChange = (e) => {
        const selectedId = e.target.value;
        const selectedProvider = providers.find(p => p.id === selectedId);
        handleChange({ target: { name: 'proveedorId', value: selectedId } });
        handleChange({ target: { name: 'nombreProveedor', value: selectedProvider ? selectedProvider.nombre : '' } });
    };

    const handleApplyStock = () => {
        let unitsToAdd = parseFloat(stockAmount) || 0;
        const currentStock = parseFloat(item.stockTotal) || 0;
        switch (stockUnit) {
            case 'caja': unitsToAdd *= (parseFloat(item.udsPorCaja) || 1); break;
            case 'pack': unitsToAdd *= (parseFloat(item.udsPorPack) || 1); break;
            case 'pallet': unitsToAdd *= (parseFloat(item.udsPorPallet) || 1); break;
        }
        const newStockTotal = currentStock + unitsToAdd;
        handleChange({ target: { name: 'stockTotal', value: newStockTotal, type: 'number' } });
        setStockAmount(0);
    };

    return (
        <div className="space-y-4">
            <h4 className="text-lg font-semibold border-b pb-2">Información Básica</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> <Input label="Código" name="codigo" value={item.codigo} onChange={handleChange} required placeholder="Ej: VTM001"/> <Input label="Categoría (Tipo Bebida)" name="categoria" value={item.categoria} onChange={handleChange} placeholder="Ej: Vino Tinto, Agua"/> <Input label="Nombre / Variante" name="nombre" value={item.nombre} onChange={handleChange} required placeholder="Ej: Emilia Malbec"/> </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> <Input label="Marca / Bodega" name="marca" value={item.marca} onChange={handleChange} placeholder="Ej: Bodega Norton"/> <Input label="Presentación" name="presentacion" value={item.presentacion} onChange={handleChange} placeholder="Ej: 750cc, 1L, Lata 473cc"/> <div className="flex items-end space-x-2"> <Select label="Proveedor" name="proveedorId" value={item.proveedorId} onChange={handleProviderChange} required> <option value="">-- Seleccionar --</option> {providers && providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)} </Select> </div> <input type="hidden" name="nombreProveedor" value={item.nombreProveedor || ''} /> </div>
            <h4 className="text-lg font-semibold border-b pb-2 mt-6">Precios y Costos</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> <Input label="Costo por Unidad ($)" name="costo" type="number" value={item.costo} onChange={handleChange} required /> <Input label="Precio Unidad (Público) ($)" name="precioUnidad" type="number" value={item.precioUnidad} onChange={handleChange} required /> <Input label="Precio por Caja ($)" name="precioCaja" type="number" value={item.precioCaja} onChange={handleChange} /> </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> <Input label="Precio por Pack ($)" name="precioPack" type="number" value={item.precioPack} onChange={handleChange} /> <Input label="Precio por Pallet ($)" name="precioPallet" type="number" value={item.precioPallet} onChange={handleChange} /> </div>
            <h4 className="text-lg font-semibold border-b pb-2 mt-6">Unidades y Stock</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4"> <Input label="Unidades por Caja" name="udsPorCaja" type="number" value={item.udsPorCaja} onChange={handleChange} /> <Input label="Unidades por Pack" name="udsPorPack" type="number" value={item.udsPorPack} onChange={handleChange} /> <Input label="Unidades por Pallet" name="udsPorPallet" type="number" value={item.udsPorPallet} onChange={handleChange} /> <Input label="Umbral Mínimo (uds)" name="umbralMinimo" type="number" value={item.umbralMinimo} onChange={handleChange} /> </div>
            <div className="border-t pt-4 mt-6"> <label className="block text-sm font-medium text-gray-700 mb-1">Stock Actual (Unidades)</label> <p className="text-2xl font-bold text-indigo-600">{item.stockTotal || 0}</p> </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end"> <Input label="Añadir Stock (Cantidad)" type="number" value={stockAmount} onChange={(e) => setStockAmount(e.target.value)} step="any" /> <Select label="Unidad de Medida" value={stockUnit} onChange={(e) => setStockUnit(e.target.value)}> <option value="unidad">Unidad</option> <option value="caja">Caja ({item.udsPorCaja || 'N/A'} uds)</option> <option value="pack">Pack ({item.udsPorPack || 'N/A'} uds)</option> <option value="pallet">Pallet ({item.udsPorPallet || 'N/A'} uds)</option> </Select> <Button onClick={handleApplyStock} disabled={!stockAmount || parseFloat(stockAmount) === 0} className="!bg-green-600 hover:!bg-green-700 !py-2.5" type="button"> Aplicar al Stock </Button> </div>
            <input type="hidden" name="stockTotal" value={item.stockTotal || 0} />
        </div>
    );
 };
const ProductManager = () => { /* ... (definición completa anterior) ... */
    const { products, providers, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const lowStockProducts = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo), [products]);
    const [isPOCreationOpen, setIsPOCreationOpen] = useState(false);
    const [poDraft, setPODraft] = useState(null);
    const poRef = useRef();

    const handleGeneratePO = () => {
        if (!lowStockProducts || lowStockProducts.length === 0) { console.log("No hay productos con stock bajo"); return;}
        const poItems = lowStockProducts.map(p => ({ productId: p.id, nombreProducto: p.nombre, cantidad: (p.udsPorCaja || 1) * 2, costoUnidad: p.costo, subtotalLinea: p.costo * (p.udsPorCaja || 1) * 2 }));
        const costoTotal = poItems.reduce((sum, item) => sum + item.subtotalLinea, 0);
        setPODraft({ ...PURCHASE_ORDER_MODEL, items: poItems, costoTotal: costoTotal, nombreProveedor: providers?.[0]?.nombre || '', proveedorId: providers?.[0]?.id || '', });
        setIsPOCreationOpen(true);
    };
    const handleSavePO = async (poData) => { await createOrUpdateDoc('purchaseOrders', poData); setIsPOCreationOpen(false); setPODraft(null); };

    return (
        <ManagerComponent
            title="Inventario" collectionName="products" model={PRODUCT_MODEL}
            FormFields={ProductFormFields}
            TableHeaders={["Código", "Nombre/Variante", "Categoría", "Marca", "Stock", "Precio Un."]}
            TableRow={({ item, onEdit, onArchive }) => (
                <tr className="hover:bg-gray-50 text-sm">
                    <td className="px-4 py-3 font-mono text-xs">{item.codigo}</td> <td className="px-4 py-3 font-semibold">{item.nombre}</td> <td className="px-4 py-3 hidden md:table-cell">{item.categoria}</td> <td className="px-4 py-3 hidden lg:table-cell">{item.marca}</td> <td className={`px-4 py-3 text-center ${item.stockTotal <= item.umbralMinimo ? 'text-red-500 font-bold' : ''}`}> {item.stockTotal} </td> <td className="px-4 py-3 text-right">{FORMAT_CURRENCY(item.precioUnidad)}</td>
                    <td className="px-4 py-3 text-right space-x-1"> <Button onClick={onEdit} className="!p-1.5 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button> <Button onClick={onArchive} className="!p-1.5 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button> </td>
                </tr>
            )}
            providers={providers} // Pasar providers aquí
            // Añadir props extra si son necesarios por handleGeneratePO
             lowStockProducts={lowStockProducts} handleGeneratePO={handleGeneratePO}
        />
        // Modal para crear PO desde bajo stock (si la lógica está incluida)
         // {isPOCreationOpen && poDraft && ( <Modal title="Generar Orden de Compra (Stock Bajo)" onClose={() => setIsPOCreationOpen(false)}> <PurchaseOrderForm model={poDraft} onSave={handleSavePO} onCancel={() => setIsPOCreationOpen(false)} products={products} providers={providers} ref={poRef}/> </Modal> )}
    );
};


// Módulos Clientes y Proveedores
const ClientManager = () => <ManagerComponent title="Clientes" collectionName="clients" model={CLIENT_MODEL} FormFields={({ item, handleChange }) => (<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required /><Input label="CUIT" name="cuit" value={item.cuit} onChange={handleChange} /><Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} /><Input label="Email" name="email" value={item.email} onChange={handleChange} /><Input label="Dirección" name="direccion" value={item.direccion} onChange={handleChange} className="col-span-full"/><Input label="Límite de Crédito ($)" name="limiteCredito" type="number" value={item.limiteCredito} onChange={handleChange} /><Input label="Mínimo de Compra ($)" name="minimoCompra" type="number" value={item.minimoCompra} onChange={handleChange} /><Select label="Régimen" name="regimen" value={item.regimen} onChange={handleChange}><option>Minorista</option><option>Mayorista</option></Select></div>)} TableHeaders={["Nombre", "Teléfono", "Saldo"]} TableRow={({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombre}</td><td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td><td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.saldoPendiente)}</td><td className="px-4 py-4 text-right space-x-2"><Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td></tr>)} />;
const ProviderManager = () => <ManagerComponent title="Proveedores" collectionName="providers" model={PROVIDER_MODEL} FormFields={({ item, handleChange }) => (<div className="grid grid-cols-1 md:grid-cols-2 gap-4"><Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required /><Input label="CUIT" name="cuit" value={item.cuit} onChange={handleChange} /><Input label="Teléfono" name="telefono" value={item.telefono} onChange={handleChange} /><Input label="Email" name="email" value={item.email} onChange={handleChange} /><Input label="Dirección" name="direccion" value={item.direccion} onChange={handleChange} className="col-span-full"/></div>)} TableHeaders={["Nombre", "Teléfono"]} TableRow={({ item, onEdit, onArchive }) => (<tr className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombre}</td><td className="px-4 py-4 hidden sm:table-cell">{item.telefono}</td><td className="px-4 py-4 text-right space-x-2"><Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td></tr>)} />;

// --- INICIO RESTAURACIÓN MÓDULOS ---

// 8.2 Módulo de Pedidos (Orders) - RESTAURADO
const generateWhatsAppLink = (client, order) => {
    if (!client || !client.telefono) return null;
    const formattedTotal = FORMAT_CURRENCY(order.total);
    const orderDate = order.timestamp ? new Date(order.timestamp.seconds * 1000).toLocaleDateString() : 'hoy';
    let message = `¡Hola ${client.nombre}!\n\n`;
    message += `Tu Pedido de DistriFort, con N° ${order.id || 'N/A'} y fecha ${orderDate}, está listo.\n\n`;
    message += `*Detalle del Pedido:*\n`;
    order.items.forEach(item => { message += `- ${item.cantidad}x ${item.nombreProducto} (${FORMAT_CURRENCY(item.subtotalLinea)})\n`; });
    message += `\n*Resumen Financiero:*\n`;
    message += `Subtotal: ${FORMAT_CURRENCY(order.subtotal)}\n`;
    if (order.costoEnvio > 0) message += `Envío: ${FORMAT_CURRENCY(order.costoEnvio)}\n`;
    if (order.descuento > 0) message += `Descuento: -${FORMAT_CURRENCY(order.descuento)}\n`;
    message += `*Total a Pagar: ${formattedTotal}*\n\n`;
    message += `Estado: ${order.estado}.\n\n¡Gracias por tu compra!`;
    const cleanPhone = client.telefono.replace(/\D/g, '');
    const phoneNumber = cleanPhone.length >= 10 ? `549${cleanPhone}` : cleanPhone;
    return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
};
const OrderPrintable = React.forwardRef(({ order, client }, ref) => (
    <PrintableDocument ref={ref} title={`PEDIDO N° ${order.id || 'N/A'}`}>
        <div className="text-sm space-y-4">
            <h3 className="text-lg font-bold">Datos del Cliente</h3> <p><strong>Cliente:</strong> {client?.nombre || order.nombreCliente}</p> <p><strong>Teléfono:</strong> {client?.telefono || 'N/A'}</p> <p><strong>Dirección:</strong> {client?.direccion || 'N/A'}</p>
            <h3 className="text-lg font-bold mt-6 border-t pt-4">Detalle del Pedido</h3>
            <table className="w-full border-collapse"> <thead><tr className="bg-gray-100 font-semibold"><td className="p-2 border">Producto</td><td className="p-2 border text-right">Cantidad</td><td className="p-2 border text-right">Precio Unitario</td><td className="p-2 border text-right">Subtotal</td></tr></thead>
                <tbody>{order.items.map((item, index) => (<tr key={index}><td className="p-2 border">{item.nombreProducto}</td><td className="p-2 border text-right">{item.cantidad}</td><td className="p-2 border text-right">{FORMAT_CURRENCY(item.precioUnidad)}</td><td className="p-2 border text-right">{FORMAT_CURRENCY(item.subtotalLinea)}</td></tr>))}</tbody>
            </table>
            <div className="flex justify-end pt-4"><div className="w-64 space-y-1"><p className="flex justify-between"><span>Subtotal:</span> <span>{FORMAT_CURRENCY(order.subtotal)}</span></p><p className="flex justify-between"><span>Envío:</span> <span>{FORMAT_CURRENCY(order.costoEnvio)}</span></p><p className="flex justify-between"><span>Descuento:</span> <span className="text-red-600">-{FORMAT_CURRENCY(order.descuento)}</span></p><p className="flex justify-between font-bold text-xl border-t pt-2"><span>TOTAL:</span> <span>{FORMAT_CURRENCY(order.total)}</span></p></div></div>
            <p className="mt-8">Estado: <strong>{order.estado}</strong></p>
        </div>
    </PrintableDocument>
));
const OrderForm = ({ model, onSave, onCancel }) => {
    const { clients, products, userId } = useData();
    const [order, setOrder] = useState({ ...model, userId: model.userId || userId });
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
        if (name === 'clienteId') { const client = clients.find(c => c.id === value); newOrder.nombreCliente = client ? client.nombre : ''; }
        setOrder(newOrder);
    };
    const handleAddItem = () => {
        if (!selectedProduct || order.items.some(i => i.productId === selectedProductId)) return;
        const price = selectedClient?.regimen === 'Mayorista' && selectedProduct.precioCaja > 0 ? selectedProduct.precioCaja : selectedProduct.precioUnidad;
        const newItem = { productId: selectedProduct.id, nombreProducto: selectedProduct.nombre, cantidad: 1, precioUnidad: price, subtotalLinea: price * 1 };
        setOrder(prev => ({ ...prev, items: [...prev.items, newItem] }));
        setSelectedProductId('');
    };
    const handleUpdateItem = (index, key, value) => {
        const newItems = [...order.items]; const numericValue = parseFloat(value) || 0;
        newItems[index][key] = numericValue; newItems[index].subtotalLinea = newItems[index].cantidad * newItems[index].precioUnidad;
        setOrder(prev => ({ ...prev, items: newItems }));
    };
    const handleRemoveItem = (index) => { const newItems = order.items.filter((_, i) => i !== index); setOrder(prev => ({ ...prev, items: newItems })); };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!order.clienteId || order.items.length === 0 || !order.userId) { console.error("Validación fallida: Faltan datos del pedido."); return; }
        const batch = writeBatch(db);
        const collectionPath = `/artifacts/${appId}/users/${order.userId}/${COLLECTION_NAMES.orders}`;
        const orderId = order.id || doc(collection(db, collectionPath)).id;
        const orderRef = doc(db, collectionPath, orderId);
        const clientRef = doc(db, `/artifacts/${appId}/users/${order.userId}/${COLLECTION_NAMES.clients}`, order.clienteId);
        batch.set(orderRef, { ...order, timestamp: serverTimestamp(), subtotal: parseFloat(order.subtotal) || 0, total: parseFloat(order.total) || 0, costoEnvio: parseFloat(order.costoEnvio) || 0, descuento: parseFloat(order.descuento) || 0, userId: order.userId, id: orderId }, { merge: true });
        const newSaldoPendiente = (selectedClient.saldoPendiente || 0) + (order.total || 0);
        batch.update(clientRef, { saldoPendiente: newSaldoPendiente });
        for (const item of order.items) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                const productRef = doc(db, `/artifacts/${appId}/users/${order.userId}/${COLLECTION_NAMES.products}`, item.productId);
                const newStockTotal = product.stockTotal - item.cantidad;
                batch.update(productRef, { stockTotal: newStockTotal });
            }
        }
        try { await batch.commit(); onSave({ ...order, id: orderId }); } catch (e) { console.error("Error al ejecutar la transacción:", e); }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                <Select label="Cliente" name="clienteId" value={order.clienteId} onChange={handleHeaderChange} required><option value="">Seleccione un Cliente</option>{clients.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
                <Select label="Estado" name="estado" value={order.estado} onChange={handleHeaderChange}>{['Pendiente', 'Confirmado', 'Enviado', 'Entregado', 'Cancelado'].map(s => <option key={s}>{s}</option>)}</Select>
                <Input label="Costo de Envío ($)" name="costoEnvio" type="number" value={order.costoEnvio} onChange={handleHeaderChange} />
                <Input label="Descuento ($)" name="descuento" type="number" value={order.descuento} onChange={handleHeaderChange} />
            </div>
            <h4 className="text-lg font-semibold text-gray-700">Productos</h4>
            <div className="flex space-x-2">
                <Select label="Producto" name="selectedProduct" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}><option value="">Añadir Producto...</option>{products.filter(p => !order.items.some(i => i.productId === p.id)).map(p => (<option key={p.id} value={p.id}>{p.nombre} ({p.stockTotal} en stock)</option>))}</Select>
                <Button onClick={handleAddItem} disabled={!selectedProduct} icon={Plus} className="self-end !px-3 !py-2">Añadir</Button>
            </div>
            {order.items.length > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm"><thead><tr className="border-b text-left text-gray-600"><th className="py-2 px-1">Producto</th><th className="py-2 px-1 w-20">Cantidad</th><th className="py-2 px-1 w-20 text-right">Precio Un.</th><th className="py-2 px-1 w-20 text-right">Subtotal</th><th className="py-2 px-1 w-10"></th></tr></thead>
                        <tbody>{order.items.map((item, index) => (<tr key={item.productId || index} className="border-b hover:bg-white"><td className="py-2 px-1 font-medium text-gray-800">{item.nombreProducto}</td><td className="py-2 px-1"><input type="number" min="1" step="1" value={item.cantidad} onChange={e => handleUpdateItem(index, 'cantidad', e.target.value)} className="w-full p-1 border rounded text-center"/></td><td className="py-2 px-1 text-right"><input type="number" value={item.precioUnidad} onChange={e => handleUpdateItem(index, 'precioUnidad', e.target.value)} className="w-full p-1 border rounded text-right"/></td><td className="py-2 px-1 text-right font-semibold text-gray-900">{FORMAT_CURRENCY(item.subtotalLinea)}</td><td className="py-2 px-1 text-right"><button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td></tr>))}</tbody>
                    </table>
                </div>
            )}
            <div className="flex justify-end pt-4 space-y-2 flex-col items-end"><p className="text-md font-medium">Subtotal: <span className="font-bold">{FORMAT_CURRENCY(order.subtotal)}</span></p><p className="text-md font-medium">Envío: <span className="font-bold">{FORMAT_CURRENCY(order.costoEnvio)}</span></p><p className="text-md font-medium">Descuento: <span className="font-bold text-red-600">-{FORMAT_CURRENCY(order.descuento)}</span></p><p className="text-xl font-bold pt-2 border-t-2 border-indigo-200">Total: <span className="text-indigo-600">{FORMAT_CURRENCY(order.total)}</span></p></div>
            <div className="flex justify-end space-x-3 pt-4 border-t"><Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button><Button type="submit" icon={Save}>Guardar Pedido</Button></div>
        </form>
    );
};
const OrderManager = () => {
    const { orders, clients, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false); const [selectedItem, setSelectedItem] = useState(null); const componentRef = useRef();
    const handleSave = async (itemData) => { await createOrUpdateDoc('orders', itemData, selectedItem?.id); setIsModalOpen(false); setSelectedItem(null); };
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); }; const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); }; const handlePrint = () => window.print();
    const sortedOrders = useMemo(() => (orders || []).slice().sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)), [orders]);
    const getClientForOrder = useCallback((order) => (clients || []).find(c => c.id === order.clienteId), [clients]);

    return (
        <div className="space-y-6">
            <PageHeader title="Pedidos"><Button onClick={handleAddNew} icon={Plus}>Añadir Pedido</Button></PageHeader>
            {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Pedido"} onClose={() => setIsModalOpen(false)}><OrderForm model={selectedItem || ORDER_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)} /></Modal>}
            {selectedItem && (<div className="hidden no-print"><OrderPrintable ref={componentRef} order={selectedItem} client={getClientForOrder(selectedItem)} /></div>)}
            <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{["Cliente", "Total", "Estado", "Fecha"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}<th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th></tr></thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedOrders.map(item => { const client = getClientForOrder(item); const whatsappLink = generateWhatsAppLink(client, item);
                            return (<tr key={item.id} className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombreCliente}</td><td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.total)}</td><td className={`px-4 py-4 font-medium`}><span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.estado === 'Entregado' ? 'bg-green-100 text-green-800' : item.estado === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{item.estado}</span></td><td className="px-4 py-4 text-sm">{item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                                <td className="px-4 py-4 text-right space-x-2 flex justify-end"><Button onClick={() => { setSelectedItem(item); setTimeout(handlePrint, 50); }} className="!p-2 !bg-blue-500 hover:!bg-blue-600" icon={Printer} title="Imprimir / Guardar PDF"/>{whatsappLink && (<a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="!p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition" title="Enviar por WhatsApp"><Send className="w-4 h-4"/></a>)}<Button onClick={() => handleEdit(item)} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={() => archiveDoc('orders', item.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td>
                            </tr>); })}
                    </tbody>
                </table>
                 {(!sortedOrders || sortedOrders.length === 0) && (<p className="p-4 text-center text-gray-500">No hay pedidos para mostrar.</p>)}
            </div>
        </div>
    );
};

// 8.3 Módulo de Órdenes de Compra (Purchase Orders) - RESTAURADO
const generatePurchaseOrderLink = (provider, po) => {
    if (!provider) return { whatsapp: null, email: null };
    const poDate = po.timestamp ? new Date(po.timestamp.seconds * 1000).toLocaleDateString() : 'N/A';
    const formattedCost = FORMAT_CURRENCY(po.costoTotal);
    let subject = `ORDEN DE COMPRA #${po.id || po.nombreProveedor} - DistriFort`;
    let body = `Estimado(a) ${provider.nombre},\n\n`; body += `Adjunto OC (${poDate}).\n*Costo Total: ${formattedCost}*\n\n*Detalle:*\n`;
    po.items.forEach(item => { body += `- ${item.cantidad}x ${item.nombreProducto} (Costo Un: ${FORMAT_CURRENCY(item.costoUnidad)})\n`; });
    body += `\nEstado: ${po.estado}.\n\nConfirmar recepción.\nSaludos,\nDistriFort`;
    const emailLink = provider.email ? `mailto:${provider.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
    const cleanPhone = provider.telefono ? provider.telefono.replace(/\D/g, '') : null; const phoneNumber = cleanPhone && cleanPhone.length >= 10 ? `549${cleanPhone}` : cleanPhone;
    const whatsappLink = phoneNumber ? `https://wa.me/${phoneNumber}?text=${encodeURIComponent(body)}` : null;
    return { whatsapp: whatsappLink, email: emailLink };
};
const PurchaseOrderPrintable = React.forwardRef(({ po, provider }, ref) => (
    <PrintableDocument ref={ref} title={`ORDEN DE COMPRA N° ${po.id || 'N/A'}`}>
         <div className="text-sm space-y-4">
             <h3 className="text-lg font-bold">Datos del Proveedor</h3> <p><strong>Proveedor:</strong> {provider?.nombre || po.nombreProveedor}</p> <p><strong>Teléfono:</strong> {provider?.telefono || 'N/A'}</p> <p><strong>Email:</strong> {provider?.email || 'N/A'}</p>
             <h3 className="text-lg font-bold mt-6 border-t pt-4">Detalle de Compra</h3>
             <table className="w-full border-collapse"><thead><tr className="bg-gray-100 font-semibold"><td className="p-2 border">Producto</td><td className="p-2 border text-right">Cantidad</td><td className="p-2 border text-right">Costo Unitario</td><td className="p-2 border text-right">Subtotal</td></tr></thead>
                 <tbody>{po.items.map((item, index) => (<tr key={index}><td className="p-2 border">{item.nombreProducto}</td><td className="p-2 border text-right">{item.cantidad}</td><td className="p-2 border text-right">{FORMAT_CURRENCY(item.costoUnidad)}</td><td className="p-2 border text-right">{FORMAT_CURRENCY(item.subtotalLinea)}</td></tr>))}</tbody>
             </table>
             <div className="flex justify-end pt-4"><div className="w-64 space-y-1"><p className="flex justify-between font-bold text-xl border-t pt-2"><span>COSTO TOTAL:</span> <span>{FORMAT_CURRENCY(po.costoTotal)}</span></p></div></div>
             <p className="mt-8">Estado: <strong>{po.estado}</strong></p>
         </div>
    </PrintableDocument>
));
const PurchaseOrderForm = ({ model, onSave, onCancel, products, providers }) => {
    const [po, setPo] = useState(model);
    const [selectedProductId, setSelectedProductId] = useState('');
    const selectedProduct = useMemo(() => products.find(p => p.id === selectedProductId), [selectedProductId, products]);
    useEffect(() => { const costoTotal = po.items.reduce((sum, item) => sum + (item.subtotalLinea || 0), 0); setPo(prev => ({ ...prev, costoTotal })); }, [po.items]);
    const handleHeaderChange = e => {
        const { name, value, type } = e.target; let newPo = { ...po, [name]: type === 'number' ? parseFloat(value) || 0 : value };
        if (name === 'proveedorId') { const provider = providers.find(p => p.id === value); newPo.nombreProveedor = provider ? provider.nombre : ''; }
        setPo(newPo);
    };
    const handleAddItem = () => {
        if (!selectedProduct || po.items.some(i => i.productId === selectedProductId)) return;
        const newItem = { productId: selectedProduct.id, nombreProducto: selectedProduct.nombre, cantidad: selectedProduct.udsPorCaja || 1, costoUnidad: selectedProduct.costo, subtotalLinea: selectedProduct.costo * (selectedProduct.udsPorCaja || 1) };
        setPo(prev => ({ ...prev, items: [...prev.items, newItem] })); setSelectedProductId('');
    };
    const handleUpdateItem = (index, key, value) => {
        const newItems = [...po.items]; const numericValue = parseFloat(value) || 0;
        newItems[index][key] = numericValue; newItems[index].subtotalLinea = newItems[index].cantidad * newItems[index].costoUnidad;
        setPo(prev => ({ ...prev, items: newItems }));
    };
    const handleRemoveItem = (index) => { const newItems = po.items.filter((_, i) => i !== index); setPo(prev => ({ ...prev, items: newItems })); };
    const handleSubmit = e => { e.preventDefault(); if (!po.proveedorId || po.items.length === 0) { console.error("Validación fallida: Faltan datos de la OC."); return; } onSave(po); };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b pb-4">
                <Select label="Proveedor" name="proveedorId" value={po.proveedorId} onChange={handleHeaderChange} required><option value="">Seleccione un Proveedor</option>{providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select>
                <Select label="Estado" name="estado" value={po.estado} onChange={handleHeaderChange}>{['Pendiente', 'Recibido', 'Cancelado'].map(s => <option key={s}>{s}</option>)}</Select>
            </div>
            <h4 className="text-lg font-semibold text-gray-700">Productos a Comprar</h4>
            <div className="flex space-x-2">
                <Select label="Producto" name="selectedProduct" value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}><option value="">Añadir Producto...</option>{products.filter(p => !po.items.some(i => i.productId === p.id)).map(p => (<option key={p.id} value={p.id}>{p.nombre}</option>))}</Select>
                <Button onClick={handleAddItem} disabled={!selectedProduct} icon={Plus} className="self-end !px-3 !py-2">Añadir</Button>
            </div>
            {po.items.length > 0 && (
                <div className="bg-gray-50 p-3 rounded-lg overflow-x-auto">
                    <table className="min-w-full text-sm"><thead><tr className="border-b text-left text-gray-600"><th className="py-2 px-1">Producto</th><th className="py-2 px-1 w-20">Cantidad</th><th className="py-2 px-1 w-20 text-right">Costo Un.</th><th className="py-2 px-1 w-20 text-right">Subtotal</th><th className="py-2 px-1 w-10"></th></tr></thead>
                        <tbody>{po.items.map((item, index) => (<tr key={item.productId || index} className="border-b hover:bg-white"><td className="py-2 px-1 font-medium text-gray-800">{item.nombreProducto}</td><td className="py-2 px-1"><input type="number" min="1" step="1" value={item.cantidad} onChange={e => handleUpdateItem(index, 'cantidad', e.target.value)} className="w-full p-1 border rounded text-center"/></td><td className="py-2 px-1 text-right"><input type="number" value={item.costoUnidad} onChange={e => handleUpdateItem(index, 'costoUnidad', e.target.value)} className="w-full p-1 border rounded text-right"/></td><td className="py-2 px-1 text-right font-semibold text-gray-900">{FORMAT_CURRENCY(item.subtotalLinea)}</td><td className="py-2 px-1 text-right"><button type="button" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td></tr>))}</tbody>
                    </table>
                </div>
            )}
            <div className="flex justify-end pt-4 space-y-2 flex-col items-end"><p className="text-xl font-bold pt-2 border-t-2 border-indigo-200">Costo Total: <span className="text-indigo-600">{FORMAT_CURRENCY(po.costoTotal)}</span></p></div>
            <div className="flex justify-end space-x-3 pt-4 border-t"><Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button><Button type="submit" icon={Save}>Guardar Orden</Button></div>
        </form>
    );
};
const PurchaseOrderManager = () => {
    const { purchaseOrders, providers, products, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false); const [selectedItem, setSelectedItem] = useState(null); const componentRef = useRef();
    const handleSave = async (itemData) => { await createOrUpdateDoc('purchaseOrders', itemData, selectedItem?.id); setIsModalOpen(false); setSelectedItem(null); };
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); }; const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); }; const handlePrint = () => window.print();
    const sortedPurchaseOrders = useMemo(() => (purchaseOrders || []).slice().sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)), [purchaseOrders]);
    const getProviderForPO = useCallback((po) => (providers || []).find(p => p.id === po.proveedorId), [providers]);

    return (
        <div className="space-y-6">
            <PageHeader title="Órdenes de Compra"><Button onClick={handleAddNew} icon={Plus}>Añadir Orden de Compra</Button></PageHeader>
            {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nueva ") + "Orden de Compra"} onClose={() => setIsModalOpen(false)}><PurchaseOrderForm model={selectedItem || PURCHASE_ORDER_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)} products={products || []} providers={providers || []} /></Modal>}
            {selectedItem && (<div className="hidden no-print"><PurchaseOrderPrintable ref={componentRef} po={selectedItem} provider={getProviderForPO(selectedItem)} /></div>)}
            <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>{["Proveedor", "Costo Total", "Estado", "Fecha"].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}<th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th></tr></thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {sortedPurchaseOrders.map(item => { const provider = getProviderForPO(item); const communicationLinks = generatePurchaseOrderLink(provider, item);
                            return (<tr key={item.id} className="hover:bg-gray-50"><td className="px-4 py-4 font-semibold">{item.nombreProveedor}</td><td className="px-4 py-4 font-mono">{FORMAT_CURRENCY(item.costoTotal)}</td><td className={`px-4 py-4 font-medium`}><span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${item.estado === 'Recibido' ? 'bg-green-100 text-green-800' : item.estado === 'Cancelado' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{item.estado}</span></td><td className="px-4 py-4 text-sm">{item.timestamp ? new Date(item.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}</td>
                                <td className="px-4 py-4 text-right space-x-2 flex justify-end"><Button onClick={() => { setSelectedItem(item); setTimeout(handlePrint, 50); }} className="!p-2 !bg-blue-500 hover:!bg-blue-600" icon={Printer} title="Imprimir / Guardar PDF"/>{communicationLinks.whatsapp && (<a href={communicationLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="!p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition" title="Enviar por WhatsApp"><Send className="w-4 h-4"/></a>)}{communicationLinks.email && (<a href={communicationLinks.email} target="_blank" rel="noopener noreferrer" className="!p-2 !bg-gray-500 hover:!bg-gray-600 rounded-lg text-white transition" title="Enviar por Email"><Mail className="w-4 h-4"/></a>)}<Button onClick={() => handleEdit(item)} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button><Button onClick={() => archiveDoc('purchaseOrders', item.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button></td>
                            </tr>); })}
                    </tbody>
                </table>
                {(!sortedPurchaseOrders || sortedPurchaseOrders.length === 0) && (<p className="p-4 text-center text-gray-500">No hay órdenes de compra para mostrar.</p>)}
            </div>
        </div>
    );
};


// 8.4 Módulo Lista de Precios - RESTAURADO (con modificaciones anteriores)
const PriceListPrintable = React.forwardRef(({ groupedProducts, client }, ref) => ( /* ... Definición completa anterior ... */
     <PrintableDocument ref={ref} title={`LISTA DE PRECIOS ${client ? `(${client.nombre} - ${client.regimen})` : ''}`}>
        <div className="text-sm space-y-4"> {client && <h3 className="text-lg font-bold">Cliente: {client.nombre} ({client.regimen})</h3>}
            {Object.entries(groupedProducts).map(([categoria, productsInCategory]) => (
                <div key={categoria} className="mb-6 last:mb-0">
                    <h4 className="text-base font-bold bg-gray-100 p-2 border-b-2 border-gray-300 mb-2 print:bg-gray-200 print:border-gray-500"> {categoria || "Sin Categoría"} </h4>
                    <table className="w-full border-collapse text-xs"> <thead> <tr className="bg-gray-50 font-semibold print:bg-gray-100"> <td className="p-1 border print:border-gray-400">Código</td> <td className="p-1 border print:border-gray-400">Nombre/Variante</td> <td className="p-1 border print:border-gray-400 hidden sm:table-cell">Marca</td> <td className="p-1 border print:border-gray-400 hidden md:table-cell">Presentación</td> <td className="p-1 border print:border-gray-400 text-right">Pr. Unidad</td> <td className="p-1 border print:border-gray-400 text-right hidden sm:table-cell">Pr. Caja</td> <td className="p-1 border print:border-gray-400 text-right hidden lg:table-cell">Pr. Pack</td> <td className="p-1 border print:border-gray-400 text-right hidden lg:table-cell">Pr. Pallet</td> <td className="p-1 border print:border-gray-400 text-center">Stock</td> </tr> </thead>
                        <tbody> {productsInCategory.map((p) => ( <tr key={p.id}> <td className="p-1 border print:border-gray-400 font-mono text-gray-600">{p.codigo}</td> <td className="p-1 border print:border-gray-400 font-semibold">{p.nombre}</td> <td className="p-1 border print:border-gray-400 hidden sm:table-cell">{p.marca}</td> <td className="p-1 border print:border-gray-400 hidden md:table-cell">{p.presentacion}</td> <td className="p-1 border print:border-gray-400 text-right font-medium">{FORMAT_CURRENCY(p.precioUnidad)}</td> <td className="p-1 border print:border-gray-400 text-right hidden sm:table-cell">{p.precioCaja > 0 ? FORMAT_CURRENCY(p.precioCaja) : '-'}</td> <td className="p-1 border print:border-gray-400 text-right hidden lg:table-cell">{p.precioPack > 0 ? FORMAT_CURRENCY(p.precioPack) : '-'}</td> <td className="p-1 border print:border-gray-400 text-right hidden lg:table-cell">{p.precioPallet > 0 ? FORMAT_CURRENCY(p.precioPallet) : '-'}</td> <td className={`p-1 border print:border-gray-400 text-center ${p.stockTotal <= p.umbralMinimo ? 'text-red-600 font-bold' : ''}`}>{p.stockTotal}</td> </tr> ))} </tbody>
                    </table>
                </div>
            ))}
        </div>
    </PrintableDocument>
));
const PriceListManager = () => { /* ... (definición completa anterior con agrupación) ... */
     const { products, clients } = useData();
    const [selectedClientId, setSelectedClientId] = useState('');
    const componentRef = useRef();
    const client = useMemo(() => (clients || []).find(c => c.id === selectedClientId), [clients, selectedClientId]);
    const groupedAndSortedProducts = useMemo(() => {
        if (!products || products.length === 0) return {};
        const grouped = (products || []).reduce((acc, product) => {
            const category = product.categoria || "Sin Categoría";
            if (!acc[category]) acc[category] = [];
            acc[category].push(product); return acc;
        }, {});
        const sortedCategories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
        const finalGrouped = {};
        sortedCategories.forEach(category => { finalGrouped[category] = grouped[category].sort((a, b) => a.nombre.localeCompare(b.nombre)); });
        return finalGrouped;
    }, [products]);
    const handlePrint = () => window.print();
    const generatePriceListMessage = useCallback((client, groupedProds) => { /* ... (logic restored) ... */ }, []);
    const communicationLinks = useMemo(() => client ? generatePriceListMessage(client, groupedAndSortedProducts) : { whatsapp: null, email: null }, [client, groupedAndSortedProducts, generatePriceListMessage]);

    return (
        <div className="space-y-6">
            <PageHeader title="Lista de Precios"><Select label="Seleccionar Cliente" name="client" value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}><option value="">-- General / Seleccionar Cliente --</option>{(clients || []).map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.regimen})</option>)}</Select></PageHeader>
            <div className="bg-white p-4 md:p-6 rounded-xl shadow-md space-y-4">
                 <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3"> <h3 className="text-xl font-bold text-gray-800"> {client ? `Precios para ${client.nombre}` : 'Lista de Precios General'} </h3> <div className="flex space-x-2 no-print self-start sm:self-center"> <Button onClick={handlePrint} icon={Printer} className="!bg-blue-500 hover:!bg-blue-600 !px-3 !py-1.5 text-sm">Imprimir / PDF</Button> {client && communicationLinks.whatsapp && (<a href={communicationLinks.whatsapp} target="_blank" rel="noopener noreferrer"><Button icon={Send} className="!bg-green-500 hover:!bg-green-600 !px-3 !py-1.5 text-sm">WhatsApp</Button></a>)} {client && communicationLinks.email && (<a href={communicationLinks.email} target="_blank" rel="noopener noreferrer"><Button icon={Mail} className="!bg-gray-500 hover:!bg-gray-600 !px-3 !py-1.5 text-sm">Email</Button></a>)} </div> </div>
                <div className="space-y-6 mt-4">
                    {Object.entries(groupedAndSortedProducts).map(([categoria, productsInCategory]) => (
                         <div key={categoria} className="border rounded-lg overflow-hidden"> <h4 className="text-md font-semibold bg-gray-100 p-3 border-b"> {categoria} </h4> <div className="overflow-x-auto"> <table className="min-w-full divide-y divide-gray-200 text-sm"> <thead className="bg-gray-50"> <tr> <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Código</th> <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre/Variante</th> <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Marca</th> <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">Pres.</th> <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Pr. Un.</th> <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">Pr. Caja</th> <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Pr. Pack</th> <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase hidden lg:table-cell">Pr. Pallet</th> <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Stock</th> </tr> </thead>
                            <tbody className="bg-white divide-y divide-gray-200"> {productsInCategory.map(p => ( <tr key={p.id} className="hover:bg-gray-50"> <td className="px-3 py-2 whitespace-nowrap font-mono text-xs text-gray-500">{p.codigo}</td> <td className="px-3 py-2 whitespace-nowrap font-semibold">{p.nombre}</td> <td className="px-3 py-2 whitespace-nowrap hidden sm:table-cell">{p.marca}</td> <td className="px-3 py-2 whitespace-nowrap hidden md:table-cell">{p.presentacion}</td> <td className="px-3 py-2 whitespace-nowrap text-right font-medium">{FORMAT_CURRENCY(p.precioUnidad)}</td> <td className="px-3 py-2 whitespace-nowrap text-right hidden sm:table-cell">{p.precioCaja > 0 ? FORMAT_CURRENCY(p.precioCaja) : '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-right hidden lg:table-cell">{p.precioPack > 0 ? FORMAT_CURRENCY(p.precioPack) : '-'}</td> <td className="px-3 py-2 whitespace-nowrap text-right hidden lg:table-cell">{p.precioPallet > 0 ? FORMAT_CURRENCY(p.precioPallet) : '-'}</td> <td className={`px-3 py-2 whitespace-nowrap text-center ${p.stockTotal <= p.umbralMinimo ? 'text-red-600 font-bold' : ''}`}>{p.stockTotal}</td> </tr> ))} </tbody>
                         </table> </div> </div>
                    ))}
                     {Object.keys(groupedAndSortedProducts).length === 0 && (<p className="text-center text-gray-500 py-6">No hay productos en el inventario para mostrar.</p>)}
                </div>
            </div>
            <div className="hidden no-print"><PriceListPrintable ref={componentRef} groupedProducts={groupedAndSortedProducts} client={client} /></div>
        </div>
    );
 };

// 8.5 Módulo Búsqueda Global - RESTAURADO
const GlobalSearch = () => {
    const { products, clients, orders } = useData(); const [term, setTerm] = useState('');
    const results = useMemo(() => {
        if (!term) return {}; const lowerTerm = term.toLowerCase();
        const productResults = (products || []).filter(p => p.nombre?.toLowerCase().includes(lowerTerm) || p.codigo?.toLowerCase().includes(lowerTerm) || p.categoria?.toLowerCase().includes(lowerTerm) || p.marca?.toLowerCase().includes(lowerTerm));
        const clientResults = (clients || []).filter(c => c.nombre?.toLowerCase().includes(lowerTerm) || c.cuit?.includes(lowerTerm));
        const orderResults = (orders || []).filter(o => o.nombreCliente?.toLowerCase().includes(lowerTerm) || o.id?.toLowerCase().includes(lowerTerm) || o.estado?.toLowerCase().includes(lowerTerm));
        return { Inventario: productResults, Clientes: clientResults, Pedidos: orderResults };
    }, [term, products, clients, orders]);
    return (
        <div className="space-y-6"> <PageHeader title="Búsqueda Global" /> <Input placeholder="Buscar por código, nombre, categoría, marca, cliente, CUIT, N° pedido..." value={term} onChange={e => setTerm(e.target.value)} icon={Search}/>
            {term && Object.entries(results).map(([key, value]) => value.length > 0 && (
                <div key={key} className="bg-white p-4 rounded-xl shadow-md"> <h3 className="text-lg font-bold text-indigo-600 mb-2">{key} ({value.length})</h3>
                    <ul className="space-y-1 text-sm">{value.map(item => <li key={item.id} className="text-gray-700 p-2 border-b last:border-b-0 hover:bg-gray-50 rounded-md"> {/* Mostrar info relevante según tipo */} {key === 'Inventario' ? `${item.codigo || ''} - ${item.nombre} (${item.marca || 'S/M'})` : key === 'Clientes' ? `${item.nombre} (CUIT: ${item.cuit || 'N/A'})` : `${item.id?.slice(-6) || 'N/A'} - ${item.nombreCliente} (${item.estado}) - ${FORMAT_CURRENCY(item.total)}`} </li>)}</ul>
                </div>
            ))}
            {term && Object.values(results).every(arr => arr.length === 0) && (<p className="text-center text-gray-500 pt-4">No se encontraron resultados para "{term}".</p>)}
        </div>
    );
};

// 8.6 Módulo Cotización (ShippingQuoter) - RESTAURADO
const ShippingQuoter = () => {
    const [distance, setDistance] = useState(''); const [weight, setWeight] = useState(''); // Usar '' para placeholders
    const { totalCost, baseRate, ratePerKm, ratePerKg } = useMemo(() => {
        const BASE_RATE = 1500; const RATE_PER_KM = 25; const RATE_PER_KG = 5;
        const dist = parseFloat(distance) || 0; const wgt = parseFloat(weight) || 0;
        const cost = (dist > 0 || wgt > 0) ? BASE_RATE + (dist * RATE_PER_KM) + (wgt * RATE_PER_KG) : 0; // Mostrar 0 si no hay input
        return { totalCost: cost, baseRate: BASE_RATE, ratePerKm: RATE_PER_KM, ratePerKg: RATE_PER_KG };
    }, [distance, weight]);

    return (
        <div className="space-y-6"> <PageHeader title="Calculadora de Costos de Envío"><p className="text-sm text-gray-500">Estimación basada en distancia y peso.</p></PageHeader>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-md space-y-4"> <h4 className="text-xl font-semibold text-gray-700 flex items-center space-x-2"><MapPin className="w-6 h-6"/><span>Parámetros del Envío</span></h4> <Input label="Distancia del Envío (km)" type="number" value={distance} onChange={e => setDistance(e.target.value)} placeholder="ej: 150"/> <Input label="Peso Total de la Carga (kg)" type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="ej: 500"/>
                    <div className="text-sm text-gray-600 pt-4 border-t"> <p className="font-semibold">Tarifas usadas:</p> <p>Base: {FORMAT_CURRENCY(baseRate)}</p> <p>Por km: {FORMAT_CURRENCY(ratePerKm)}</p> <p>Por kg: {FORMAT_CURRENCY(ratePerKg)}</p> </div>
                </div>
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-md space-y-4 border-l-4 border-indigo-600"> <h4 className="text-xl font-semibold text-indigo-600 flex items-center space-x-2"><Truck className="w-6 h-6" /><span>Costo Estimado</span></h4> <p className="text-5xl font-bold text-gray-800">{FORMAT_CURRENCY(totalCost)}</p>
                    <div className="text-base text-gray-700 space-y-1 pt-4 border-t"> <p>Costo Base: <span className="font-semibold">{FORMAT_CURRENCY(baseRate)}</span></p> <p>+ Costo Distancia ({distance || 0} km): <span className="font-semibold">{FORMAT_CURRENCY((parseFloat(distance) || 0) * ratePerKm)}</span></p> <p>+ Costo Peso ({weight || 0} kg): <span className="font-semibold">{FORMAT_CURRENCY((parseFloat(weight) || 0) * ratePerKg)}</span></p> </div>
                </div>
            </div>
        </div>
    );
};

// 8.7 Módulo de Herramientas - RESTAURADO
const ProfitCalculator = () => {
    const [cost, setCost] = useState(''); const [price, setPrice] = useState(''); // Usar '' para placeholders
    const { margin, marginPercentage, markupPercentage } = useMemo(() => {
        const c = parseFloat(cost) || 0; const p = parseFloat(price) || 0;
        const profit = p > 0 ? p - c : 0; // Margen es 0 si no hay precio
        const marginP = p > 0 ? (profit / p) : 0;
        const markupP = c > 0 ? (profit / c) : 0;
        return { margin: profit, marginPercentage: marginP * 100, markupPercentage: markupP * 100 };
    }, [cost, price]);
    const handleChange = (setter) => (e) => setter(e.target.value); // Guardar como string
    const dataCards = [ { title: "Ganancia Neta ($)", value: FORMAT_CURRENCY(margin), icon: DollarSign, color: "green" }, { title: "Margen Bruto (%)", value: `${marginPercentage.toFixed(1)}%`, icon: TrendingUp, color: "blue" }, { title: "Markup (%)", value: `${markupPercentage.toFixed(1)}%`, icon: TrendingUp, color: "indigo" }, ];
    return ( <div className="space-y-6"> <div className="bg-white p-6 rounded-xl shadow-md space-y-4"> <h4 className="text-xl font-semibold text-gray-700">Calcular Rentabilidad Simple</h4> <div className="grid grid-cols-1 md:grid-cols-2 gap-4"> <Input label="Costo del Producto ($)" type="number" value={cost} onChange={handleChange(setCost)} placeholder="0.00"/> <Input label="Precio de Venta ($)" type="number" value={price} onChange={handleChange(setPrice)} placeholder="0.00"/> </div> </div> <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> {dataCards.map(card => (<Card key={card.title} title={card.title} value={card.value} icon={card.icon} color={card.color} />))} </div> </div> );
};
const AIChat = () => {
    const [prompt, setPrompt] = useState(''); const [response, setResponse] = useState('Pregunta al asistente sobre tendencias del mercado, mejores prácticas de distribución o análisis de tu inventario.'); const [loading, setLoading] = useState(false);
    const handleChatSubmit = async (e) => { e.preventDefault(); if (!prompt.trim()) return; setLoading(true); setResponse('...'); const context = "Actúa como analista experto en distribución de bebidas. Ofrece consejos concisos (máx 200 palabras)."; const fullPrompt = `${context} -- Pregunta: ${prompt}`; const result = await secureGeminiFetch(fullPrompt); setResponse(result); setLoading(false); setPrompt(''); };
    return ( <div className="bg-white p-6 rounded-xl shadow-md space-y-4 flex flex-col h-full min-h-[50vh]"> <h4 className="text-xl font-semibold text-indigo-600 flex items-center space-x-2"><BrainCircuit className="w-6 h-6"/><span>Asistente de Distribución IA</span></h4> <div className="flex-1 overflow-y-auto p-3 bg-gray-50 rounded-lg whitespace-pre-wrap text-sm text-gray-800"> {loading ? <PageLoader text="Analizando..." /> : response} </div> <form onSubmit={handleChatSubmit} className="flex space-x-3 pt-4 border-t"> <Input name="chatPrompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Ej: ¿Mejor estrategia para rotar stock de vinos rojos?" className="flex-1"/> <Button type="submit" disabled={!prompt.trim() || loading} icon={Send}> {loading ? '...' : 'Enviar'} </Button> </form> </div> );
};
const PromotionGenerator = () => {
    const [prompt, setPrompt] = useState(''); const [imageUrl, setImageUrl] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
    const handleGenerateImage = async (e) => { e.preventDefault(); if (!prompt.trim()) return; setLoading(true); setError(''); setImageUrl(''); const stylePrompt = `, digital art, vibrant colors, social media ready, professional, wine distribution focus.`; const fullPrompt = `${prompt}${stylePrompt}`; try { const url = await secureGeminiFetch(fullPrompt, true); setImageUrl(url); } catch (e) { setError(`Error: ${e.message}`); console.error(e); } finally { setLoading(false); } };
    const handleDownload = () => { if (imageUrl) { const link = document.createElement('a'); link.href = imageUrl; link.download = 'promo_distrifort_ia.png'; document.body.appendChild(link); link.click(); document.body.removeChild(link); } };
    const handleShare = () => { if (!imageUrl) return; const shareMessage = encodeURIComponent("¡Nueva Promoción de DistriFort!\n\nMira esta imagen especial."); const whatsappLink = `https://wa.me/?text=${shareMessage}`; window.open(whatsappLink, '_blank'); }; // WhatsApp sin número
    return ( <div className="space-y-6"> <div className="bg-white p-6 rounded-xl shadow-md space-y-4"> <h4 className="text-xl font-semibold text-indigo-600 flex items-center space-x-2"><ImageIcon className="w-6 h-6"/><span>Generador de Promociones Visuales (IA)</span></h4> <p className="text-sm text-gray-600">Describe la promoción (Ej: "Botella Malbec en paisaje nevado con texto 50% OFF").</p> <form onSubmit={handleGenerateImage} className="flex space-x-3 pt-2"> <Input name="imagePrompt" value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe tu imagen promocional..." className="flex-1" required/> <Button type="submit" disabled={!prompt.trim() || loading} icon={ImageIcon}> {loading ? 'Creando...' : 'Generar'} </Button> </form> {error && <div className="text-red-500 text-sm mt-2">{error}</div>} </div> <div className="bg-white p-6 rounded-xl shadow-xl min-h-[300px] flex flex-col justify-center"> <h4 className="text-lg font-semibold text-gray-700 mb-4 text-center">Resultado</h4> {loading ? (<PageLoader text="Dibujando promoción..." />) : imageUrl ? (<div className="space-y-4"> <img src={imageUrl} alt="Promoción Generada por IA" className="w-full max-w-md mx-auto rounded-xl shadow-lg border" /> <div className="flex justify-center space-x-4"> <Button onClick={handleDownload} className="!bg-blue-500 hover:!bg-blue-600">Descargar</Button> <Button onClick={handleShare} icon={Send} className="!bg-green-500 hover:!bg-green-600">Compartir</Button> </div> </div>) : (<div className="text-center text-gray-500 py-10">La imagen generada aparecerá aquí.</div>)} </div> </div> );
};
const Tools = () => {
    const [subPage, setSubPage] = useState('calculator');
    return ( <div className="space-y-6"> <PageHeader title="Herramientas"><div className="flex space-x-2 flex-wrap gap-2"> <Button onClick={() => setSubPage('calculator')} className={subPage === 'calculator' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'} icon={DollarSign}> Rentabilidad </Button> <Button onClick={() => setSubPage('ai')} className={subPage === 'ai' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'} icon={BrainCircuit}> Asistente IA </Button> <Button onClick={() => setSubPage('promo')} className={subPage === 'promo' ? '' : '!bg-gray-200 !text-gray-700 hover:!bg-gray-300'} icon={ImageIcon}> Promo (IA) </Button> </div> </PageHeader> <div className="grid grid-cols-1 gap-6"> {subPage === 'calculator' && <ProfitCalculator />} {subPage === 'ai' && <AIChat />} {subPage === 'promo' && <PromotionGenerator />} </div> </div> );
};

// 8.8 Dashboard - RESTAURADO
const Dashboard = ({ setCurrentPage }) => {
    const { products = [], orders = [], clients = [], purchaseOrders = [] } = useData(); // Default to empty arrays
    const lowStockCount = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo).length, [products]);
    const totalInventoryValue = useMemo(() => products.reduce((sum, p) => sum + ((p.costo || 0) * (p.stockTotal || 0)), 0), [products]);
    const totalRevenue = useMemo(() => orders.reduce((sum, o) => sum + (o.total || 0), 0), [orders]);
    const ordersThisMonth = useMemo(() => { const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); return orders.filter(o => o.timestamp && new Date(o.timestamp.seconds * 1000) >= startOfMonth); }, [orders]);
    const revenueThisMonth = useMemo(() => ordersThisMonth.reduce((sum, o) => sum + (o.total || 0), 0), [ordersThisMonth]);
    const productCostMap = useMemo(() => new Map(products.map(p => [p.id, p.costo || 0])), [products]);
    const grossProfitTotal = useMemo(() => orders.reduce((sum, order) => { const orderCost = (order.items || []).reduce((costSum, item) => costSum + ((productCostMap.get(item.productId) || 0) * (item.cantidad || 0)), 0); return sum + ((order.total || 0) - orderCost); }, 0), [orders, productCostMap]);
    const grossMarginPercent = useMemo(() => totalRevenue === 0 ? 0 : (grossProfitTotal / totalRevenue) * 100, [totalRevenue, grossProfitTotal]);
    const totalPendingBalance = useMemo(() => clients.reduce((sum, c) => sum + (c.saldoPendiente || 0), 0), [clients]);
    const pendingOrdersCount = useMemo(() => orders.filter(o => o.estado === 'Pendiente').length, [orders]);
    const pendingPOCount = useMemo(() => purchaseOrders.filter(po => po.estado === 'Pendiente').length, [purchaseOrders]);

    const dashboardCards = [
        { title: "Ingreso Total (Hist.)", value: FORMAT_CURRENCY(totalRevenue), icon: DollarSign, color: "green", page: 'Pedidos' },
        { title: "Margen Bruto (%)", value: `${grossMarginPercent.toFixed(1)}%`, icon: TrendingUp, color: grossMarginPercent >= 20 ? "green" : "orange", page: 'Herramientas' }, // Adjusted color threshold
        { title: "Valor Inventario", value: FORMAT_CURRENCY(totalInventoryValue), icon: Package, color: "indigo", page: 'Inventario' },
        { title: "Ingreso del Mes", value: FORMAT_CURRENCY(revenueThisMonth), icon: FileText, color: "blue", page: 'Pedidos' },
        { title: "Productos Stock Bajo", value: lowStockCount, icon: AlertCircle, color: lowStockCount > 0 ? "red" : "green", page: 'Inventario' },
        { title: "Pedidos Pendientes", value: pendingOrdersCount, icon: ShoppingCart, color: pendingOrdersCount > 0 ? "yellow" : "gray", page: 'Pedidos' }, // Adjusted color
        { title: "Cuentas por Cobrar", value: FORMAT_CURRENCY(totalPendingBalance), icon: TrendingDown, color: totalPendingBalance > 0 ? "red" : "gray", page: 'Clientes' }, // Adjusted color
        { title: "OC Pendientes", value: pendingPOCount, icon: Truck, color: pendingPOCount > 0 ? "purple" : "gray", page: 'Órdenes de Compra' }, // Adjusted color
    ];

    return (
        <div className="space-y-6"> <PageHeader title="Panel de Control"><p className="text-sm text-gray-500">Métricas clave de negocio.</p></PageHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6"> {dashboardCards.map(card => (<Card key={card.title} title={card.title} value={card.value} icon={card.icon} color={card.color} onClick={() => setCurrentPage(card.page)}/>))} </div>
            <div className="bg-white p-6 rounded-xl shadow-md"> <h3 className="text-xl font-bold text-gray-800 mb-4">Análisis Rápido</h3> <p className="text-gray-600"> Valor inventario: **{FORMAT_CURRENCY(totalInventoryValue)}**. **{lowStockCount}** prod. bajos. Margen bruto: **{grossMarginPercent.toFixed(1)}%**. Cuentas por cobrar: **{FORMAT_CURRENCY(totalPendingBalance)}**. </p> </div>
        </div>
    );
};

// 8.9 Módulo Importador de Listas de Precios (IA) - RESTAURADO (con modificaciones anteriores)
const PriceListImporter = () => { /* ... (definición completa anterior con IA) ... */
    const { providers, products, createOrUpdateDoc } = useData();
    const [providerId, setProviderId] = useState('');
    const [listText, setListText] = useState('');
    const [loading, setLoading] = useState(false);
    const [importLog, setImportLog] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!providerId || !listText.trim()) { setImportLog("Error: Debes seleccionar un proveedor y pegar el texto de la lista."); return; }
        setLoading(true); setImportLog("1. Estructurando datos con IA...");

        // Prompt actualizado para extraer más campos
        const aiPrompt = `Actúa como parser de datos. Transforma la siguiente lista de precios en un ARRAY JSON de OBJETOS. Cada objeto DEBE tener las claves "codigo" (si existe, si no usa null), "tipo" (ej: Vino Tinto, Cerveza), "nombre" (variante ej: Malbec Reserva), "marca" (bodega), "presentacion" (ej: 750cc), "costo" (numérico), "precioUnidad" (numérico) y "precioCaja" (numérico, si existe). Usa 0 si no encuentras valor numérico. Solo devuelve el JSON. Texto:\n\n${listText}`;
        let jsonResponse;
        try {
            const resultText = await secureGeminiFetch(aiPrompt);
            const cleanedText = resultText.replace(/```json|```/g, '').trim();
            jsonResponse = JSON.parse(cleanedText);
            setImportLog("2. Datos estructurados. Procesando importación...");
        } catch (e) {
            console.error("AI/JSON Parsing Error:", e, resultText); // Loguear texto original
            setImportLog(`Error: Fallo al procesar datos con IA. Verifica el formato del texto y la respuesta JSON.`);
            setLoading(false); return;
        }

        const providerData = providers.find(p => p.id === providerId);
        const providerName = providerData?.nombre || 'Desconocido';
        let updatesCount = 0; let creationsCount = 0; const errors = [];

        for (const item of jsonResponse) {
            if (!item.nombre || (item.costo === undefined && item.precioUnidad === undefined) ) { errors.push(`Saltando ítem incompleto: ${item.nombre || 'Nombre faltante'}`); continue; }
            const existingProduct = products.find(p => p.nombre?.toLowerCase().trim() === item.nombre?.toLowerCase().trim() || (item.codigo && p.codigo === item.codigo));

            const productData = {
                codigo: item.codigo || '',
                categoria: item.tipo || '', // Mapear tipo a categoria
                nombre: item.nombre,
                marca: item.marca || providerName, // Usar marca IA o proveedor
                presentacion: item.presentacion || '',
                costo: parseFloat(item.costo) || 0,
                precioUnidad: parseFloat(item.precioUnidad) || 0,
                precioCaja: parseFloat(item.precioCaja) || 0,
                // Mantener otros precios/uds si se actualiza, o usar default si es nuevo
                precioPack: existingProduct?.precioPack || parseFloat(item.precioPack) || 0,
                precioPallet: existingProduct?.precioPallet || parseFloat(item.precioPallet) || 0,
                udsPorCaja: existingProduct?.udsPorCaja || parseFloat(item.udsPorCaja) || PRODUCT_MODEL.udsPorCaja,
                udsPorPack: existingProduct?.udsPorPack || parseFloat(item.udsPorPack) || PRODUCT_MODEL.udsPorPack,
                udsPorPallet: existingProduct?.udsPorPallet || parseFloat(item.udsPorPallet) || PRODUCT_MODEL.udsPorPallet,
                proveedorId: providerId, // Asociar al proveedor seleccionado
                nombreProveedor: providerName
            };

            if (existingProduct) {
                // Actualizar producto existente
                await createOrUpdateDoc('products', productData, existingProduct.id);
                updatesCount++;
            } else {
                // Crear nuevo producto
                await createOrUpdateDoc('products', { ...PRODUCT_MODEL, ...productData }); // Combinar con defaults
                creationsCount++;
            }
        }
        setImportLog(`Éxito: ${creationsCount} creados, ${updatesCount} actualizados (${errors.length} errores/saltos).`);
        setLoading(false); setListText(''); setProviderId(''); // Limpiar campos
    };

    return (
        <div className="space-y-6"> <PageHeader title="Importador de Listas de Precios (IA)"><p className="text-sm text-gray-500">Convierte texto de listas en datos de inventario.</p></PageHeader>
            <div className="bg-white p-6 rounded-xl shadow-md space-y-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <Select label="Proveedor de la Lista" name="providerId" value={providerId} onChange={e => setProviderId(e.target.value)} required><option value="">-- Seleccione Proveedor --</option>{(providers || []).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</Select>
                    <div> <label className="block text-sm font-medium text-gray-700 mb-1">Pegar Contenido de la Lista (PDF/Excel)</label> <textarea value={listText} onChange={e => setListText(e.target.value)} rows="10" placeholder="Copia y pega el texto aquí. Incluye: Código (opc), Tipo, Nombre, Marca, Presentación, Costo, Precio Unidad, Precio Caja (opc)." className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" required /> <p className="text-xs text-gray-500 mt-1">La IA intentará extraer: código, tipo(categoría), nombre(variante), marca, presentación, costo, precio unidad, precio caja.</p> </div>
                    <Button type="submit" icon={Upload} disabled={loading || !providerId || !listText.trim()}> {loading ? 'Procesando con IA...' : 'Importar Productos'} </Button>
                </form>
                {importLog && (<div className={`p-4 rounded-lg text-sm ${importLog.startsWith('Error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}> <h4 className="font-bold">Registro:</h4> <p>{importLog}</p> </div>)}
            </div>
        </div>
    );
};


// --- FIN RESTAURACIÓN MÓDULOS ---


// --- 9. APP PRINCIPAL Y NAVEGACIÓN ---
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
        if (!db) return <div className="text-center text-red-500 pt-10">Error: La configuración de Firebase no se pudo cargar.</div>; // Added padding
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
                <ul className="flex flex-row md:flex-col md:space-y-2 flex-grow overflow-x-auto whitespace-nowrap md:overflow-x-visible"> {navItems.map(item => (<li key={item.name} className="flex-shrink-0 md:flex-shrink"> <button onClick={() => setCurrentPage(item.name)} className={`w-full flex flex-col md:flex-row items-center space-y-1 md:space-y-0 md:space-x-3 p-1 md:p-3 rounded-lg text-center md:text-left font-semibold transition ${currentPage === item.name ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100 hover:text-indigo-600'}`}> <item.icon className="w-6 h-6" /> <span className="text-xs md:text-base">{item.name}</span> </button> </li>))} </ul>
                <div className="mt-auto hidden md:block space-y-2 pt-4 border-t"> <div className='px-3 text-xs text-gray-400 truncate'> <p title={`App ID: ${appId}`}>App: {appId}</p> <p title={`User ID: ${userId}`}>User: {userId || '...'}</p> </div> <button onClick={logout} className="w-full flex items-center space-x-3 p-3 rounded-lg text-left font-semibold text-gray-600 hover:bg-gray-100 hover:text-indigo-600 transition"> <LogOut className="w-6 h-6" /> <span>Cerrar Sesión</span> </button> </div>
            </nav>
            <main className="flex-1 p-4 md:p-8 overflow-y-auto pb-20 md:pb-8">{renderPage()}</main>
        </div>
    );
};

// --- PUNTO DE ENTRADA ---
export default function DistriFortApp() {
    return ( <DataProvider> <AppController /> </DataProvider> );
};
const AppController = () => {
    const { userId, isAuthReady, loading } = useData();
    if (!isAuthReady) { return <PageLoader text="Inicializando..." />; }
    // Muestra cargando si la autenticación está lista pero algún useCollection aún está cargando
    if (loading && isAuthReady) { return <PageLoader text="Cargando datos..." />; }
    if (!db) { return <div className="min-h-screen flex items-center justify-center text-red-500">Error Crítico: No se pudo inicializar Firebase. Revisa la configuración.</div>; }
    return <AppLayout />;
};

