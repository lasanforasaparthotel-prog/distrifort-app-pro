import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
    getFirestore, collection, doc, onSnapshot, setDoc, query, writeBatch, deleteDoc, updateDoc,
    serverTimestamp,
    getDocs,
} from 'firebase/firestore';
import { LayoutDashboard, Users, Package, Tag, List, FileText, Search, Plus, Trash2, Zap, DollarSign, ArrowUpCircle, X, TrendingUp, Sparkles, Loader2, Clock, CheckCircle, ChevronUp, Truck, ArrowDownCircle } from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE (VARIABLES GLOBALES) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Inicialización de Firebase (se ejecuta una sola vez)
let app, db, auth;
try {
    if (Object.keys(firebaseConfig).length > 0) {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
    }
} catch (e) {
    console.error("Error al inicializar Firebase:", e);
}

// Rutas de las colecciones (Se asume la ruta base del usuario)
const getCollectionPath = (collectionName, userId) => `/artifacts/${appId}/users/${userId}/${collectionName}`;

// --- ESTRUCTURAS DE DATOS BASE ---

const PRODUCT_MODEL = {
    nombre: '',
    marca: '',
    especie: '', // Vino, Cerveza, Gaseosa, etc.
    variante: '', // Sabor: Chicle, Lima, Regular
    varietal: '', // Malbec, Chardonnay (Solo si especie='Vino')
    proveedorId: '', // Proveedor principal
    costo: 0, // Costo principal (Mejor Costo Actual)
    preciosProveedores: {}, // {provId1: 10.50, provId2: 11.00}
    precioUnidad: 0,
    precioCaja: 0,
    udsPorCaja: 1,
    udsPorPack: 1,
    stockTotal: 0,
    stockPorBodega: {}, // {bodegaId: 100}
    umbralMinimo: 50,
    timestamp: serverTimestamp(),
};

const CLIENT_MODEL = {
    nombre: '',
    cuit: '',
    telefono: '',
    email: '',
    direccion: '',
    regimen: 'Minorista', // 'Minorista' o 'Mayorista'
    minimoCompra: 0,
    limiteCredito: 50000,
    saldoPendiente: 0,
    timestamp: serverTimestamp(),
};

const ORDER_MODEL = {
    clienteId: '',
    nombreCliente: '',
    items: [], // [{productoId, nombre, cantidad, precioUnitario, tipoVenta: 'Unidad'/'Caja'}]
    subtotal: 0,
    descuentoManual: 0,
    total: 0,
    estado: 'Pendiente', // 'Pendiente', 'En Ruta', 'Entregado', 'Facturada'
    fecha: serverTimestamp(),
};

const PURCHASE_ORDER_MODEL = {
    proveedorId: '',
    nombreProveedor: '',
    bodegaDestinoId: '',
    items: [], // [{productoId, nombre, cantidad, unidadIngreso, costoUnitario}]
    costoTotal: 0,
    estado: 'Pendiente', // 'Pendiente', 'Enviada', 'Recibida'
    fecha: serverTimestamp(),
};


// --- UTILIDADES Y HOOKS ---

// Hook para inicializar Firebase y manejar autenticación
const useAuthAndFirestore = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!db || !auth) {
            setError("Firebase no está configurado correctamente.");
            setIsAuthReady(true);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    if (initialAuthToken) {
                        const userCredential = await signInWithCustomToken(auth, initialAuthToken);
                        setUserId(userCredential.user.uid);
                    } else {
                        const userCredential = await signInAnonymously(auth);
                        setUserId(userCredential.user.uid);
                    }
                } catch (e) {
                    console.error("Error al autenticar:", e);
                    setError("Error de autenticación: " + e.message);
                }
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    return { db, userId, isAuthReady, error, auth };
};

// Función auxiliar para formatear a ARS
const formatARS = (amount) => {
    return amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 });
};

// **FUNCIÓN DE PROXY SEGURO DE GEMINI (Frontend)**
// Se llama al endpoint '/api/gemini-proxy' que debe estar configurado en el servidor (Vercel/Netlify)
const secureGeminiFetch = async (endpoint, payload, maxRetries = 5) => {
    const proxyUrl = `/api/gemini-proxy?endpoint=${endpoint}`; 
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                throw new Error(`Proxy Error: HTTP status ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            console.warn(`Gemini Proxy call failed, retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Función para convertir la cantidad ingresada a unidades base.
const convertToUnits = (cantidad, unidadTipo, product) => {
    const factorCaja = product.udsPorCaja || 1;
    const factorPack = product.udsPorPack || 1;

    if (unidadTipo === 'Caja') return cantidad * factorCaja;
    if (unidadTipo === 'Pack') return cantidad * factorPack;
    return cantidad; // Unidad
};

// Componente para la Alerta
const Alert = ({ type = 'info', children }) => {
    const baseClasses = "p-3 rounded-lg text-sm font-medium mb-4 flex items-center";
    const colorClasses = {
        info: "bg-blue-100 text-blue-800",
        error: "bg-red-100 text-red-800",
        success: "bg-green-100 text-green-800",
        warning: "bg-yellow-100 text-yellow-800",
    };
    return <div className={`${baseClasses} ${colorClasses[type]}`}>{children}</div>;
};

// Botón primario
const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        type={type}
        className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-lg'} ${className}`}
    >
        {Icon && <Icon className="w-5 h-5" />}
        <span>{children}</span>
    </button>
);

// Componente Input simple
const Input = ({ label, name, type = 'text', value, onChange, required = false, step = 'any', readOnly = false, className = '' }) => (
    <div className={className}>
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            required={required}
            step={step}
            readOnly={readOnly}
            className={`mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border ${readOnly ? 'bg-gray-100 text-gray-500' : ''}`}
        />
    </div>
);

// Componente Modal
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white rounded-t-xl">
                <h3 className="text-xl font-bold text-gray-800">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                    <X className="w-6 h-6" />
                </button>
            </div>
            <div className="p-5">
                {children}
            </div>
        </div>
    </div>
);

// Función de exportación simple a CSV/Excel
const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) {
        console.warn("No hay datos para exportar.");
        return;
    }
    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(';'),
        ...data.map(row => headers.map(header => {
            let value = row[header] === null || row[header] === undefined ? '' : row[header].toString();
            if (value.includes(',') || value.includes(';') || value.includes('"')) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};

// --- COMPONENTES DE UTILIDAD DE GESTIÓN DE DATOS ---

// Componente: Selector de Taxonomía con opción de añadir nuevo valor
const TaxonomySelect = ({ label, name, value, onChange, options, required = false }) => {
    const isCustomValue = !options.includes(value) && value !== '';
    const [isInputMode, setIsInputMode] = useState(isCustomValue);
    const [inputValue, setInputValue] = useState(value);

    useEffect(() => {
        setInputValue(value);
        setIsInputMode(!options.includes(value) && value !== '');
    }, [value, options]);

    const handleSelectChange = (e) => {
        const selectedValue = e.target.value;
        setIsInputMode(false);
        setInputValue(selectedValue);
        onChange(e);
    };

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(e);
    };

    const switchToInputMode = () => {
        setIsInputMode(true);
        setInputValue(value || '');
    };

    const switchToSelectMode = () => {
        setIsInputMode(false);
        if (!options.includes(inputValue)) {
            onChange({ target: { name, value: inputValue } });
        }
    };

    return (
        <div>
            <label className="block text-sm font-medium text-gray-700">{label}</label>
            <div className="relative">
                {isInputMode ? (
                    <div className="flex space-x-2 mt-1">
                        <input
                            type="text"
                            name={name}
                            value={inputValue}
                            onChange={handleInputChange}
                            required={required}
                            placeholder={`Ingresa el nuevo ${label.toLowerCase()}...`}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                        />
                        <button
                            type="button"
                            onClick={switchToSelectMode}
                            className="py-1 px-3 text-xs text-gray-600 font-semibold bg-gray-200 rounded-md hover:bg-gray-300 transition"
                            title="Volver a seleccionar de la lista"
                        >
                            <ChevronUp className="w-4 h-4 inline-block transform rotate-90" />
                        </button>
                    </div>
                ) : (
                    <div className='flex space-x-2 mt-1'>
                        <select
                            name={name}
                            value={value}
                            onChange={handleSelectChange}
                            required={required}
                            className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white pr-10"
                        >
                            <option value="">Seleccione existente</option>
                            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <button
                            type="button"
                            className="py-1 px-3 text-xs text-indigo-600 font-semibold bg-indigo-50 rounded-md hover:bg-indigo-100 transition"
                            onClick={switchToInputMode}
                            title={`Agregar un nuevo valor a ${label}`}
                        >
                            + NUEVO
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// Componente Modal Genérico para Proveedores y Bodegas
const GenericDataModal = ({ db, userId, data, collectionName, title, fields, onClose }) => {
    const isNew = data.id === undefined;
    const [formData, setFormData] = useState(data);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const docRef = doc(db, getCollectionPath(collectionName, userId), data.id || new Date().getTime().toString());
            await setDoc(docRef, { ...formData, timestamp: serverTimestamp() }, { merge: true });
            setMessage(`${title} guardado exitosamente!`);
            setTimeout(onClose, 1000);
        } catch (e) {
            console.error(`Error al guardar ${title}:`, e);
            setMessage("Error al guardar: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title={isNew ? `Nuevo ${title}` : `Editar ${title}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {message && <Alert type={message.includes('Error') ? 'error' : 'success'}>{message}</Alert>}
                {fields.map(field => (
                    <Input
                        key={field.name}
                        label={field.label}
                        name={field.name}
                        type={field.type || 'text'}
                        value={formData[field.name] || ''}
                        onChange={handleChange}
                        required={field.required || false}
                    />
                ))}
                <div className="flex justify-end space-x-4 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">Cancelar</button>
                    <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
                </div>
            </form>
        </Modal>
    );
};

// Módulo de Gestión de Proveedores/Bodegas
const DataManager = ({ db, userId, data, collectionName, title, fields, initialModel }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingData, setEditingData] = useState(null);
    const safeData = data || [];

    const handleEdit = (item) => {
        setEditingData(item);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingData(initialModel);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm(`¿Seguro que desea archivar/eliminar ${title}?`)) return;
        try {
            await deleteDoc(doc(db, getCollectionPath(collectionName, userId), id));
            console.log(`${title} eliminado`);
        } catch (e) {
            console.error(`Error al eliminar ${title}:`, e);
        }
    };

    return (
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
            <div className="flex justify-between items-center mb-4">
                <h4 className="text-lg font-semibold text-gray-700">{title}</h4>
                <Button onClick={handleCreate} icon={Plus} className="!py-1.5 !px-3 text-sm">Nuevo</Button>
            </div>
            <ul className="space-y-3 max-h-48 overflow-y-auto">
                {safeData.map((item) => (
                    <li key={item.id} className="border-b pb-2 flex justify-between items-center text-sm">
                        <span>{item.nombre}</span>
                        <div className='space-x-2'>
                            <button onClick={() => handleEdit(item)} className="text-indigo-600 hover:text-indigo-800 text-xs">Editar</button>
                            <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800 text-xs" title="Archivar/Eliminar"><Trash2 className="w-4 h-4 inline" /></button>
                        </div>
                    </li>
                ))}
            </ul>
            {isModalOpen && (
                <GenericDataModal
                    db={db} userId={userId}
                    data={editingData}
                    collectionName={collectionName}
                    title={title}
                    fields={fields}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
};

const ProviderManager = (props) => (
    <DataManager
        {...props}
        collectionName="providers"
        title="Proveedores"
        fields={[
            { label: "Nombre o Razón Social", name: "nombre", required: true },
            { label: "CUIT / ID Fiscal", name: "cuit" },
            { label: "Contacto Principal", name: "contacto" },
            { label: "Teléfono", name: "telefono" },
        ]}
        initialModel={{ nombre: '', cuit: '', contacto: '', telefono: '' }}
    />
);

const BodegaManager = (props) => (
    <DataManager
        {...props}
        collectionName="bodegas"
        title="Bodegas"
        fields={[
            { label: "Nombre de la Bodega", name: "nombre", required: true },
            { label: "Dirección", name: "direccion" },
            { label: "Responsable", name: "responsable" },
        ]}
        initialModel={{ nombre: '', direccion: '', responsable: '' }}
    />
);

// Módulo de Taxonomía (simulado)
const TaxonomyManager = ({ onClose, taxonomies }) => {
    const [currentTaxonomy, setCurrentTaxonomy] = useState('marcas');
    const currentList = taxonomies[currentTaxonomy] || [];

    return (
        <Modal title="Gestión de Taxonomías" onClose={onClose}>
            <p className="text-sm text-gray-600 mb-4">Las taxonomías se gestionan automáticamente al crear/editar productos usando el campo '+ Nuevo'.</p>

            <div className="flex space-x-4 mb-4 border-b pb-2 overflow-x-auto">
                {Object.keys(taxonomies).map(key => (
                    <button
                        key={key}
                        onClick={() => setCurrentTaxonomy(key)}
                        className={`font-semibold py-1 px-3 rounded-lg text-sm transition ${currentTaxonomy === key ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">Lista Actual de {currentTaxonomy.toUpperCase()} ({currentList.length})</h4>
                <ul className="max-h-32 overflow-y-auto border p-2 rounded-lg bg-gray-50 text-sm space-y-1">
                    {currentList.length > 0 ? currentList.map(item => <li key={item}>{item}</li>) : <li className='text-gray-500'>Lista vacía</li>}
                </ul>
            </div>

            <div className="flex justify-end pt-4">
                <Button onClick={onClose}>Cerrar</Button>
            </div>
        </Modal>
    );
};


// --- COMPONENTES DE PÁGINA PRINCIPAL ---

// Dashboard (BI)
const Dashboard = ({ products, clients, setCurrentPage }) => {
    const lowStockCount = products.filter(p => p.stockTotal <= (p.umbralMinimo || 50)).length;
    const totalClients = clients.length; // Se mantiene por si se quiere volver a usar o para el análisis

    const mockMetrics = useMemo(() => {
        // Aseguramos que los mocks son 0 si no hay datos.
        const hasData = products.length > 0;
        
        // Facturación: 0 si no hay data, o un mock aleatorio
        const facturacionMes = hasData ? (45000 + Math.floor(Math.random() * 5000)) : 0;
        const facturacionAnual = hasData ? (380000 + Math.floor(Math.random() * 20000)) : 0;
        
        // Nueva métrica 1: Inversión Mensual (MOCK: 50%-90% de la facturación, o 0)
        const inversionMensual = hasData ? (facturacionMes * (Math.random() * 0.4 + 0.5)) : 0;
        
        // Nueva métrica 2: Rentabilidad (Facturación - Inversión)
        const rentabilidad = facturacionMes - inversionMensual;

        return {
            facturacionMes: facturacionMes,
            facturacionAnual: facturacionAnual,
            inversionMensual: inversionMensual,
            rentabilidad: rentabilidad,
            lowStockCount: lowStockCount,
            totalClients: totalClients,
        };
    }, [products, clients]);

    const Card = ({ title, value, icon: Icon, color = 'indigo' }) => (
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 transition duration-300 hover:shadow-lg">
            <div className={`flex items-center justify-between`}>
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <Icon className={`w-6 h-6 text-${color}-500`} />
            </div>
            <p className="text-3xl font-bold mt-1 text-gray-800">{value}</p>
        </div>
    );

    const LowStockAlerts = () => (
        <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 mt-4">
            <h3 className="text-lg font-semibold text-red-600 mb-3 flex items-center space-x-2">
                <Zap className="w-5 h-5" />
                <span>Alertas de Stock Crítico ({mockMetrics.lowStockCount})</span>
            </h3>
            {lowStockCount > 0 ? (
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {products
                        .filter(p => p.stockTotal <= (p.umbralMinimo || 50))
                        .map(p => (
                            <li key={p.id} className="text-sm border-b pb-1 last:border-b-0 flex justify-between">
                                <span>{p.nombre} ({p.variante || p.varietal})</span>
                                <span className="font-bold text-red-500">{p.stockTotal} Uds.</span>
                            </li>
                        ))}
                </ul>
            ) : (
                <p className="text-sm text-gray-500">¡Inventario en orden! No hay alertas críticas de stock.</p>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Dashboard de DistriFort</h2>

            {/* Tarjetas de Métricas Principales */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card 
                    title="Facturación Mes" 
                    value={formatARS(mockMetrics.facturacionMes)} 
                    icon={ArrowUpCircle} 
                    color="green" 
                />
                
                {/* REEMPLAZO 1: Clientes Activos -> Inversión Mensual */}
                <Card 
                    title="Inversión Mensual" 
                    value={formatARS(mockMetrics.inversionMensual)} 
                    icon={ArrowDownCircle} 
                    color="red" 
                />
                
                {/* REEMPLAZO 2: Stock Crítico -> Rentabilidad Mensual */}
                <Card 
                    title="Rentabilidad Mes" 
                    value={formatARS(mockMetrics.rentabilidad)} 
                    icon={DollarSign} 
                    color={mockMetrics.rentabilidad >= 0 ? 'green' : 'red'} 
                />
                
                {/* Reposicionar Facturación Anual */}
                 <Card 
                    title="Facturación Anual" 
                    value={formatARS(mockMetrics.facturacionAnual)} 
                    icon={DollarSign} 
                    color="green" 
                />
            </div>

            <LowStockAlerts />

            <div className="bg-white p-4 rounded-xl shadow-md border border-indigo-200 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
                <p className="text-lg font-semibold text-gray-800">¿Qué quieres hacer ahora?</p>
                <div className='flex space-x-3'>
                    {/* CORRECCIÓN: Botón Producto para abrir la pestaña 'Products' */}
                    <Button
                        onClick={() => setCurrentPage('Products')}
                        icon={Plus}
                        className="bg-indigo-500 hover:bg-indigo-600"
                    >
                        Añadir Producto
                    </Button>
                    {/* CORRECCIÓN: Botón Pedido para abrir la pestaña 'Orders' */}
                    <Button
                        onClick={() => setCurrentPage('Orders')}
                        icon={Tag}
                        className="bg-green-500 hover:bg-green-600"
                    >
                        Nuevo Pedido
                    </Button>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
                <h3 className="text-lg font-semibold mb-3">Volumen de Venta por Especie (Unidades)</h3>
                <div className="h-48 flex items-end justify-around p-2 text-xs">
                    {['Vino', 'Cerveza', 'Gaseosa', 'Agua'].map((specie, index) => (
                        <div key={specie} className="flex flex-col items-center">
                            <div
                                className={`w-10 rounded-t-lg bg-blue-400 transition-all duration-700`}
                                style={{ height: `${(index + 1) * 20 + 30}px` }}
                            ></div>
                            <span className="mt-1">{specie}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Gestión de Productos e Inventario
const ProductManager = ({ db, userId, products, providers, bodegas, taxonomies }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isTaxonomyModalOpen, setIsTaxonomyModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredProducts = useMemo(() => {
        if (!searchTerm) return products;
        const term = searchTerm.toLowerCase();
        return products.filter(p =>
            p.nombre?.toLowerCase().includes(term) ||
            p.marca?.toLowerCase().includes(term) ||
            p.especie?.toLowerCase().includes(term) ||
            p.variante?.toLowerCase().includes(term) ||
            p.varietal?.toLowerCase().includes(term) ||
            providers.find(prov => prov.id === p.proveedorId)?.nombre.toLowerCase().includes(term)
        );
    }, [products, providers, searchTerm]);

    const handleEdit = (product) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingProduct(PRODUCT_MODEL);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Seguro que desea archivar/eliminar este producto?")) return;
        try {
            await deleteDoc(doc(db, getCollectionPath('products', userId), id));
            console.log("Producto eliminado/archivado");
        } catch (e) {
            console.error("Error al eliminar producto:", e);
        }
    };

    const ProductModal = ({ db, userId, product, onClose, providers, bodegas, taxonomies }) => {
        const isNew = product.id === undefined;
        const [formData, setFormData] = useState(product);
        const [stockInput, setStockInput] = useState({ cantidad: 0, unidadTipo: 'Unidad', bodegaId: bodegas[0]?.id || '' });
        const [loading, setLoading] = useState(false);
        const [message, setMessage] = useState('');

        const [priceSettingType, setPriceSettingType] = useState('fixed');
        const [markupPercent, setMarkupPercent] = useState(50);

        const [altProviderCost, setAltProviderCost] = useState({ providerId: '', cost: 0 });

        // Recalcula el precio unitario si el modo es "Porcentaje"
        useEffect(() => {
            if (priceSettingType === 'percent') {
                const newPrice = formData.costo * (1 + markupPercent / 100);
                setFormData(prev => ({ ...prev, precioUnidad: parseFloat(newPrice.toFixed(2)) }));
            }
        }, [priceSettingType, markupPercent, formData.costo]);


        const handleChange = (e) => {
            const { name, value, type } = e.target;
            setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        };

        const handleCostChange = (e) => {
            const { value } = e.target;
            const newCost = parseFloat(value) || 0;
            setFormData(prev => ({ ...prev, costo: newCost }));
            if (formData.proveedorId) {
                setFormData(prev => ({
                    ...prev,
                    preciosProveedores: {
                        ...prev.preciosProveedores,
                        [formData.proveedorId]: newCost
                    }
                }));
            }
        };

        const handleProviderChange = (e) => {
            const newProviderId = e.target.value;
            const newCost = formData.preciosProveedores[newProviderId] || 0;

            setFormData(prev => ({
                ...prev,
                proveedorId: newProviderId,
                costo: newCost
            }));
        };

        const handleAltCostChange = (e) => {
            const { name, value, type } = e.target;
            const parsedValue = type === 'number' ? parseFloat(value) || 0 : value;
            setAltProviderCost(prev => ({ ...prev, [name]: parsedValue }));
        };

        const handleAddAltCost = () => {
            if (!altProviderCost.providerId || altProviderCost.cost <= 0) {
                setMessage("Seleccione un proveedor y un costo válido.");
                return;
            }
            setFormData(prev => ({
                ...prev,
                preciosProveedores: {
                    ...prev.preciosProveedores,
                    [altProviderCost.providerId]: altProviderCost.cost
                }
            }));
            setAltProviderCost({ providerId: '', cost: 0 });
        };

        const bestCostData = useMemo(() => {
            let bestCost = Infinity;
            let bestProviderId = null;

            if (formData.preciosProveedores) {
                for (const [providerId, cost] of Object.entries(formData.preciosProveedores)) {
                    if (cost < bestCost) {
                        bestCost = cost;
                        bestProviderId = providerId;
                    }
                }
            }

            const currentCost = formData.costo;
            const isCurrentBest = currentCost <= bestCost;

            return {
                bestCost: bestCost === Infinity ? 0 : bestCost,
                bestProviderName: providers.find(p => p.id === bestProviderId)?.nombre || 'N/A',
                isCurrentBest
            };
        }, [formData.preciosProveedores, formData.costo, providers]);


        const handleStockChange = (e) => {
            const { name, value, type } = e.target;
            setStockInput(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        };

        const handleAddStock = () => {
            if (stockInput.cantidad <= 0 || !stockInput.bodegaId) {
                setMessage("Debe ingresar una cantidad y seleccionar una bodega.");
                return;
            }

            const unitsToAdd = convertToUnits(stockInput.cantidad, stockInput.unidadTipo, formData);
            const newStockPorBodega = {
                ...formData.stockPorBodega,
                [stockInput.bodegaId]: (formData.stockPorBodega[stockInput.bodegaId] || 0) + unitsToAdd
            };

            const newStockTotal = Object.values(newStockPorBodega).reduce((sum, val) => sum + val, 0);

            setFormData(prev => ({
                ...prev,
                stockTotal: newStockTotal,
                stockPorBodega: newStockPorBodega
            }));
            setStockInput({ cantidad: 0, unidadTipo: 'Unidad', bodegaId: bodegas[0]?.id || '' });
            setMessage(`Se agregaron ${unitsToAdd} unidades al stock.`);
        };


        const handleSubmit = async (e) => {
            e.preventDefault();
            setLoading(true);

            try {
                const docRef = doc(db, getCollectionPath('products', userId), product.id || new Date().getTime().toString());

                let finalFormData = { ...formData };
                if (!isNew && bestCostData.bestCost > 0 && finalFormData.costo !== bestCostData.bestCost) {
                    finalFormData.costo = bestCostData.bestCost;
                    console.log(`Costo principal actualizado al mejor precio: ${finalFormData.costo}`);
                }


                await setDoc(docRef, { ...finalFormData, timestamp: serverTimestamp() }, { merge: true });
                setMessage("Producto guardado exitosamente!");
                setTimeout(onClose, 1000);
            } catch (e) {
                console.error("Error al guardar producto:", e);
                setMessage("Error al guardar: " + e.message);
            } finally {
                setLoading(false);
            }
        };

        const profitUnit = formData.precioUnidad - formData.costo;
        const marginUnit = formData.precioUnidad > 0 ? (profitUnit / formData.precioUnidad) * 100 : 0;

        return (
            <Modal title={isNew ? "Nuevo Producto" : `Editar ${product.nombre}`} onClose={onClose}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {message && <Alert type={message.includes('Error') ? 'error' : 'success'}>{message}</Alert>}

                    <h4 className="font-semibold text-indigo-600 border-b pb-1">Datos Básicos y Taxonomía</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Input label="Nombre del Producto" name="nombre" value={formData.nombre} onChange={handleChange} required />
                        <TaxonomySelect label="Marca" name="marca" value={formData.marca} onChange={handleChange} options={taxonomies.marcas} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <TaxonomySelect label="Especie" name="especie" value={formData.especie} onChange={handleChange} options={taxonomies.especies} required />

                        <TaxonomySelect label="Variante (Sabor/Tipo)" name="variante" value={formData.variante} onChange={handleChange} options={taxonomies.variantes} />
                        {formData.especie === 'Vino' && (
                            <TaxonomySelect label="Varietal (Vino)" name="varietal" value={formData.varietal} onChange={handleChange} options={taxonomies.varietales} />
                        )}
                    </div>

                    <h4 className="font-semibold text-indigo-600 border-b pb-1 flex items-center space-x-2">
                        <DollarSign className="w-5 h-5" /> Costos y Precios
                    </h4>

                    {/* Costo de Compra y Proveedor */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Input
                            label={`Costo PRINCIPAL Actual (${formatARS(1)} / Unidad)`}
                            name="costo"
                            type="number"
                            value={formData.costo}
                            onChange={handleCostChange}
                            required
                            readOnly={!isNew && !bestCostData.isCurrentBest}
                            className={!bestCostData.isCurrentBest && !isNew ? 'border-red-400 bg-red-50' : ''}
                        />

                        {/* Proveedor Principal */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Proveedor Principal</label>
                            <select
                                name="proveedorId"
                                value={formData.proveedorId}
                                onChange={handleProviderChange}
                                className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                            >
                                <option value="">Seleccione...</option>
                                {providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* LÓGICA DE COMPETENCIA DE PROVEEDORES */}
                    <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                        <h5 className="font-semibold text-sm text-yellow-800 mb-2">Comparación de Precios de Costo</h5>

                        {bestCostData.bestCost > 0 && (
                            <p className="text-xs text-green-700 font-bold mb-2">
                                <Zap className="w-4 h-4 inline mr-1" />
                                Mejor Costo: {formatARS(bestCostData.bestCost)} (de {bestCostData.bestProviderName})
                            </p>
                        )}

                        <div className="grid grid-cols-3 gap-2 items-end">
                            <div>
                                <label className="block text-xs font-medium text-gray-700">Proveedor Alternativo</label>
                                <select
                                    name="providerId"
                                    value={altProviderCost.providerId}
                                    onChange={handleAltCostChange}
                                    className="mt-1 block w-full rounded-lg border-gray-300 text-xs p-1.5"
                                >
                                    <option value="">Seleccione...</option>
                                    {providers.filter(p => p.id !== formData.proveedorId).map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <Input
                                label="Costo (ARS)"
                                name="cost"
                                type="number"
                                value={altProviderCost.cost}
                                onChange={handleAltCostChange}
                                step="0.01"
                            />
                            <Button
                                type="button"
                                onClick={handleAddAltCost}
                                className="!py-1.5 bg-yellow-500 hover:bg-yellow-600"
                                icon={Plus}
                            >
                                Guardar Costo
                            </Button>
                        </div>

                        <div className="mt-3 space-y-1">
                            {Object.entries(formData.preciosProveedores || {}).map(([id, cost]) => (
                                <div key={id} className="flex justify-between text-xs p-1 bg-white rounded-md">
                                    <span>{providers.find(p => p.id === id)?.nombre || 'Proveedor Desconocido'}</span>
                                    <span className={`font-bold ${cost === bestCostData.bestCost ? 'text-green-600' : 'text-gray-600'}`}>
                                        {formatARS(cost)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Lógica de Precio de Venta (Unidad) */}
                    <div className="bg-gray-50 p-3 rounded-lg border">
                        <label className="block text-sm font-bold text-gray-800 mb-2">Precio de Venta (Unidad)</label>
                        <div className="grid grid-cols-3 gap-4 items-end">
                            <div className="col-span-1 flex space-x-2">
                                <button
                                    type="button"
                                    onClick={() => setPriceSettingType('fixed')}
                                    className={`w-1/2 py-2 text-sm font-semibold rounded-lg transition ${priceSettingType === 'fixed' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                >
                                    Fijar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPriceSettingType('percent')}
                                    className={`w-1/2 py-2 text-sm font-semibold rounded-lg transition ${priceSettingType === 'percent' ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                                >
                                    %
                                </button>
                            </div>

                            {priceSettingType === 'fixed' ? (
                                <Input label={`Precio Fijo (${formatARS(1)})`} name="precioUnidad" type="number" value={formData.precioUnidad} onChange={handleChange} required step="0.01" />
                            ) : (
                                <Input
                                    label="Margen de Ganancia (%)"
                                    name="markupPercent"
                                    type="number"
                                    value={markupPercent}
                                    onChange={(e) => setMarkupPercent(Math.min(200, parseFloat(e.target.value) || 0))}
                                    required
                                    step="1"
                                />
                            )}

                            <Input
                                label={`P. Venta Calculado (${formatARS(1)})`}
                                name="precioUnidadDisplay"
                                type="number"
                                value={formData.precioUnidad}
                                readOnly
                                step="0.01"
                            />
                        </div>
                    </div>

                    {/* Precio Caja/Pack */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Input label="Uds. por Caja/Pack" name="udsPorCaja" type="number" value={formData.udsPorCaja} onChange={handleChange} />
                        <Input label={`Precio Venta Caja (${formatARS(1)})`} name="precioCaja" type="number" value={formData.precioCaja} onChange={handleChange} step="0.01" />
                    </div>

                    {/* Utilidad / Ganancia */}
                    <h4 className="font-semibold text-indigo-600 border-b pb-1 mt-4">Utilidad / Ganancia (Unidad)</h4>
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg">
                        <div className={`p-2 rounded-lg ${profitUnit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                            <p className="text-sm text-gray-700">Ganancia por Unidad:</p>
                            <p className="font-bold text-lg">{formatARS(profitUnit)}</p>
                        </div>
                        <div className={`p-2 rounded-lg ${marginUnit >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                            <p className="text-sm text-gray-700">Margen de Utilidad:</p>
                            <p className="font-bold text-lg">{marginUnit.toFixed(1)}%</p>
                        </div>
                    </div>

                    {/* Promociones (Simplified) */}
                    <h4 className="font-semibold text-indigo-600 border-b pb-1 mt-4">Gestión de Promociones (Simulado)</h4>
                    <div className="flex space-x-4 items-end">
                        <div className="w-2/3">
                            <label className="block text-sm font-medium text-gray-700">Promoción Aplicable</label>
                            <select className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white">
                                <option value="">Ninguna</option>
                                <option value="2x1">2x1 (Cerveza X)</option>
                                <option value="descuento5">5% Desc. por Volumen</option>
                            </select>
                        </div>
                        <Button type="button" icon={Plus} className="w-1/3 bg-indigo-500 hover:bg-indigo-700">Crear Nueva</Button>
                    </div>


                    <h4 className="font-semibold text-indigo-600 border-b pb-1 mt-4">Gestión de Stock ({formData.stockTotal} Uds. en total)</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                        <Input label="Cantidad" name="cantidad" type="number" value={stockInput.cantidad} onChange={handleStockChange} step="1" />
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Unidad Ingreso</label>
                            <select name="unidadTipo" value={stockInput.unidadTipo} onChange={handleStockChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white">
                                <option value="Unidad">Unidad</option>
                                {formData.udsPorPack > 1 && <option value="Pack">Pack ({formData.udsPorPack} Uds)</option>}
                                {formData.udsPorCaja > 1 && <option value="Caja">Caja ({formData.udsPorCaja} Uds)</option>}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Bodega</label>
                            <select name="bodegaId" value={stockInput.bodegaId} onChange={handleStockChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white">
                                <option value="">Seleccione...</option>
                                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                            </select>
                        </div>
                        <Button type="button" onClick={handleAddStock} className="mt-0 py-2.5 bg-gray-500 hover:bg-gray-600" disabled={loading}>
                            <Plus className="w-4 h-4" /> Agregar Stock
                        </Button>
                    </div>
                    <Input label="Umbral Mínimo (Alerta)" name="umbralMinimo" type="number" value={formData.umbralMinimo} onChange={handleChange} step="1" />


                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">Cancelar</button>
                        <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar Producto'}</Button>
                    </div>
                </form>
            </Modal>
        );
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Gestión de Productos e Inventario</h2>

            <div className="flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0 sm:space-x-3">
                <div className="relative w-full sm:w-1/3">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, marca, proveedor..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <div className="flex space-x-2">
                    <Button onClick={handleCreate} icon={Plus}>Nuevo Producto</Button>
                    <Button onClick={() => setIsTaxonomyModalOpen(true)} icon={Tag} className="bg-gray-500 hover:bg-gray-600">Taxonomías</Button>
                </div>
            </div>

            {/* Lista de Productos (Tabla Responsive) */}
            <div className="bg-white shadow-md rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto (Marca/Variante)</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo / Precio U.</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Total</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredProducts.map((p) => (
                            <tr key={p.id}>
                                <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {p.nombre}
                                    <div className="text-xs text-indigo-600">{p.marca} ({p.variante || p.varietal || p.especie})</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                    Costo: {formatARS(p.costo)}
                                    <div className="text-xs text-gray-700">Venta: {formatARS(p.precioUnidad)}</div>
                                </td>
                                <td className={`px-3 py-4 whitespace-nowrap text-sm font-bold ${p.stockTotal <= p.umbralMinimo ? 'text-red-500' : 'text-green-600'}`}>
                                    {p.stockTotal} Uds.
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {providers.find(prov => prov.id === p.proveedorId)?.nombre || 'N/A'}
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    <button onClick={() => handleEdit(p)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                    <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-900" title="Archivar Producto"><Trash2 className="w-4 h-4 inline" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modales */}
            {isModalOpen && (
                <ProductModal
                    db={db} userId={userId}
                    product={editingProduct}
                    onClose={() => setIsModalOpen(false)}
                    providers={providers} bodegas={bodegas}
                    taxonomies={taxonomies}
                />
            )}
            {isTaxonomyModalOpen && (
                <TaxonomyManager
                    db={db} userId={userId}
                    onClose={() => setIsTaxonomyModalOpen(false)}
                    taxonomies={taxonomies}
                />
            )}

            <h3 className="text-xl font-bold mt-8 text-gray-700">Gestión de Proveedores</h3>
            <ProviderManager db={db} userId={userId} data={providers} />

            <h3 className="text-xl font-bold mt-8 text-gray-700">Gestión de Bodegas</h3>
            <BodegaManager db={db} userId={userId} data={bodegas} />
        </div>
    );
};

// Gestión de Clientes
const ClientManager = ({ db, userId, clients }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState(null);

    const handleEdit = (client) => {
        setEditingClient(client);
        setIsModalOpen(true);
    };

    const handleCreate = () => {
        setEditingClient(CLIENT_MODEL);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Seguro que desea archivar/inactivar este cliente?")) return;
        try {
            await deleteDoc(doc(db, getCollectionPath('clients', userId), id));
            console.log("Cliente eliminado/archivado");
        } catch (e) {
            console.error("Error al eliminar cliente:", e);
        }
    };

    const ClientModal = ({ db, userId, client, onClose }) => {
        const isNew = client.id === undefined;
        const [formData, setFormData] = useState(client);
        const [loading, setLoading] = useState(false);
        const [message, setMessage] = useState('');

        const handleChange = (e) => {
            const { name, value, type } = e.target;
            setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            setLoading(true);

            try {
                const docRef = doc(db, getCollectionPath('clients', userId), client.id || new Date().getTime().toString());
                await setDoc(docRef, { ...formData, timestamp: serverTimestamp() }, { merge: true });
                setMessage("Cliente guardado exitosamente!");
                setTimeout(onClose, 1000);
            } catch (e) {
                console.error("Error al guardar cliente:", e);
                setMessage("Error al guardar: " + e.message);
            } finally {
                setLoading(false);
            }
        };

        return (
            <Modal title={isNew ? "Nuevo Cliente" : `Editar ${client.nombre}`} onClose={onClose}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {message && <Alert type={message.includes('Error') ? 'error' : 'success'}>{message}</Alert>}

                    <h4 className="font-semibold text-indigo-600 border-b pb-1">Datos de Contacto</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        <Input label="Nombre/Razón Social" name="nombre" value={formData.nombre} onChange={handleChange} required />
                        <Input label="CUIT/ID Fiscal" name="cuit" value={formData.cuit} onChange={handleChange} />
                        <Input label="Teléfono" name="telefono" value={formData.telefono} onChange={handleChange} />
                        <Input label="Email" name="email" value={formData.email} onChange={handleChange} />
                        <Input label="Dirección de Entrega" name="direccion" value={formData.direccion} onChange={handleChange} required className="md:col-span-3" />
                    </div>

                    <h4 className="font-semibold text-indigo-600 border-b pb-1">Condiciones Comerciales</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Régimen de Compra</label>
                            <select name="regimen" value={formData.regimen} onChange={handleChange} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white">
                                <option value="Minorista">Minorista (Precio general)</option>
                                <option value="Mayorista">Mayorista (Precios especiales)</option>
                            </select>
                        </div>
                        <Input label={`Límite de Crédito (${formatARS(1)})`} name="limiteCredito" type="number" value={formData.limiteCredito} onChange={handleChange} />
                    </div>

                    {formData.regimen === 'Mayorista' && (
                        <div className="space-y-4">
                            <Alert type="warning">
                                <Tag className="w-5 h-5 mr-2" />
                                Este cliente tiene Régimen Mayorista.
                            </Alert>
                            <Input label={`Mínimo de Compra Requerido (${formatARS(1)})`} name="minimoCompra" type="number" value={formData.minimoCompra} onChange={handleChange} className="mt-2" />
                        </div>
                    )}

                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300">Cancelar</button>
                        <Button type="submit" disabled={loading}>{loading ? 'Guardando...' : 'Guardar Cliente'}</Button>
                    </div>
                </form>
            </Modal>
        );
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Gestión de Clientes y Crédito</h2>
            <Button onClick={handleCreate} icon={Plus}>Nuevo Cliente</Button>

            <div className="bg-white shadow-md rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente (Régimen)</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Crédito Máx.</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Pendiente</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {clients.map((c) => (
                            <tr key={c.id}>
                                <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {c.nombre}
                                    <div className={`text-xs ${c.regimen === 'Mayorista' ? 'text-green-600' : 'text-indigo-600'}`}>{c.regimen}</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {formatARS(c.limiteCredito)}
                                </td>
                                <td className={`px-3 py-4 whitespace-nowrap text-sm font-bold ${c.saldoPendiente > c.limiteCredito ? 'text-red-500' : 'text-green-600'}`}>
                                    {formatARS(c.saldoPendiente)}
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    <button onClick={() => handleEdit(c)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                    <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-900" title="Archivar Cliente"><Trash2 className="w-4 h-4 inline" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <ClientModal
                    db={db} userId={userId}
                    client={editingClient}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
};

// Flujo de Pedidos (Venta Asistida + Listado)
const OrderFlow = ({ db, userId, products, clients, orders }) => {
    const [view, setView] = useState('list');
    const [selectedClient, setSelectedClient] = useState(null);
    const [cart, setCart] = useState([]);
    const [descuentoGlobal, setDescuentoGlobal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');
    
    // Estados para la funcionalidad LLM (Draft Message)
    const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
    const [draftContent, setDraftContent] = useState('');
    const [isDraftLoading, setIsDraftLoading] = useState(false);
    const [currentOrderForDraft, setCurrentOrderForDraft] = useState(null);

    const handleDeleteOrder = async (id) => {
        if (!window.confirm("¿Seguro que desea archivar/eliminar este Pedido? Esta acción es irreversible.")) return;
        try {
            await deleteDoc(doc(db, getCollectionPath('orders', userId), id));
            setMessage("Pedido archivado/eliminado.");
        } catch (e) {
            console.error("Error al eliminar pedido:", e);
            setMessage("Error al eliminar pedido.");
        }
    };
    
    const getStatusColor = (status) => {
        switch (status) {
            case 'Facturada': return 'bg-green-100 text-green-800';
            case 'En Ruta': return 'bg-blue-100 text-blue-800';
            case 'Pendiente': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const handleUpdateStatus = async (orderId, newStatus) => {
        if (!db) return;
        try {
            const orderRef = doc(db, getCollectionPath('orders', userId), orderId);
            await updateDoc(orderRef, {
                estado: newStatus,
                fechaActualizacion: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error updating order status:", error);
        }
    };

    // --- LLM 1: GENERADOR DE BORRADOR DE MENSAJE (USA PROXY SEGURO) ---
    const generateEmailDraft = async (order) => {
        setIsDraftLoading(true);
        setDraftContent('');
        setCurrentOrderForDraft(order);
        setIsDraftModalOpen(true);
    
        const productsList = order.items.map(item => `${item.cantidad} unidades de ${item.nombre}`).join(', ');
        const customerPhone = clients.find(c => c.id === order.clienteId)?.telefono || 'N/A';
        const orderStatus = order.estado;

        const systemPrompt = "Actúa como un agente de servicio al cliente profesional y amigable de una distribuidora de bebidas. Genera un borrador de mensaje conciso y formal (máximo 4 frases) para el cliente, basado en el estado de su pedido. Incluye un saludo, el resumen del estado actual y el agradecimiento. No uses markdown ni listas. Simplemente el texto plano del mensaje.";
    
        const userQuery = `El nombre del cliente es ${order.nombreCliente}. El estado del pedido es "${orderStatus}". La lista de productos es: ${productsList}. El total es ${formatARS(order.total)}. Genera el borrador del mensaje.`;
    
        const payload = {
            model: "gemini-2.5-flash-preview-05-20",
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            const response = await secureGeminiFetch('generateContent', payload);
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No se pudo generar el contenido. Intenta de nuevo.";
            setDraftContent({ text, customerPhone });
        } catch (error) {
            console.error("Gemini Proxy Error:", error);
            setDraftContent({ text: "Lo sentimos, hubo un error al conectar con la IA para generar el mensaje.", customerPhone });
        } finally {
            setIsDraftLoading(false);
        }
    };
    
    // Modal para mostrar el borrador generado por la IA
    const DraftModal = () => {
        if (!isDraftModalOpen || !currentOrderForDraft || !draftContent) return null;
    
        const handleCopy = () => {
            const textToCopy = draftContent.text.trim();
            const textarea = document.createElement('textarea');
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                console.log('Mensaje copiado al portapapeles!');
            } catch (err) {
                console.error('Failed to copy text: ', err);
            }
            document.body.removeChild(textarea);
        };
        
        const whatsappUrl = draftContent.customerPhone !== 'N/A' 
            ? `https://wa.me/${draftContent.customerPhone}?text=${encodeURIComponent(draftContent.text.trim())}`
            : null;

        const StatusIcon = currentOrderForDraft.estado === 'Pendiente' ? Clock : currentOrderForDraft.estado === 'En Ruta' ? Truck : CheckCircle;
    
        return (
            <Modal title="Borrador de Mensaje (Asistente IA)" onClose={() => setIsDraftModalOpen(false)}>
                <div className="flex items-start mb-4 p-3 bg-gray-50 rounded-lg border">
                    <StatusIcon className="w-6 h-6 mr-3 text-indigo-600" />
                    <div>
                        <h3 className="font-semibold text-gray-800">{currentOrderForDraft.nombreCliente}</h3>
                        <p className='text-sm text-gray-600'>Pedido #{currentOrderForDraft.id.substring(0, 8)} | Estado: {currentOrderForDraft.estado}</p>
                    </div>
                </div>
    
                <div className="p-4 rounded-lg bg-gray-100 min-h-32 max-h-60 overflow-y-auto whitespace-pre-wrap">
                    {isDraftLoading ? (
                        <div className="flex items-center justify-center h-full text-indigo-500">
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Generando borrador con IA...
                        </div>
                    ) : (
                        <p className="text-gray-700">{draftContent.text}</p>
                    )}
                </div>
    
                <div className="mt-4 flex justify-end space-x-3">
                    {whatsappUrl && !isDraftLoading && (
                        <Button
                            type="button"
                            onClick={() => window.open(whatsappUrl, '_blank')}
                            className="bg-green-500 hover:bg-green-600"
                            icon={() => <svg fill="#ffffff" viewBox="0 0 16 16" width="1em" height="1em" className='w-5 h-5'><path d="M13.62 2.38a7.5 7.5 0 1 0 1.25 10.22l.88 3.06a.5.5 0 0 1-.62.62l-3.06-.88a7.5 7.5 0 0 0-10.22-1.25zM12 9.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zm-5 0a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM10.5 7a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 1-.5.5zM6 7a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 1-.5.5z"/></svg>}
                        >
                            Abrir en WhatsApp
                        </Button>
                    )}
                    <Button
                        onClick={handleCopy}
                        disabled={isDraftLoading || !draftContent}
                        className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-400"
                    >
                        Copiar
                    </Button>
                    <button
                        onClick={() => setIsDraftModalOpen(false)}
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                    >
                        Cerrar
                    </button>
                </div>
            </Modal>
        );
    };
    // --- FIN LLM 1 ---

    const OrderListManagement = () => (
        <div className='space-y-4'>
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Historial de Pedidos ({orders.length})</h2>
                <Button onClick={() => setView('create')} icon={Plus}>Crear Nuevo Pedido</Button>
            </div>

            <div className="bg-white shadow-md rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID / Cliente</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha / Total</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {orders.map((o) => (
                            <tr key={o.id}>
                                <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <span className='text-xs text-gray-500'>#{o.id.substring(0, 8)}</span>
                                    <div className="text-sm font-bold">{o.nombreCliente}</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {o.fecha ? new Date(o.fecha.seconds * 1000).toLocaleDateString('es-AR') : 'N/A'}
                                    <div className='font-bold text-gray-800'>{formatARS(o.total || 0)}</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(o.estado)}`}>
                                        {o.estado}
                                    </span>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    <button onClick={() => generateEmailDraft(o)} className="text-purple-600 hover:text-purple-900 mr-2" title="Generar Mensaje IA">
                                        <Sparkles className='w-4 h-4 inline' />
                                    </button>
                                    {o.estado !== 'Facturada' && (
                                        <button onClick={() => handleUpdateStatus(o.id, 'Facturada')} className="text-green-600 hover:text-green-900" title="Marcar como Facturado">
                                            <CheckCircle className='w-4 h-4 inline' />
                                        </button>
                                    )}
                                    <button onClick={() => handleDeleteOrder(o.id)} className="text-red-600 hover:text-red-900" title="Archivar Pedido"><Trash2 className="w-4 h-4 inline" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <DraftModal />
        </div>
    );


    const filteredProducts = useMemo(() => {
        if (!productSearchTerm) return products;
        const term = productSearchTerm.toLowerCase();
        return products.filter(p =>
            p.nombre?.toLowerCase().includes(term) ||
            p.marca?.toLowerCase().includes(term) ||
            p.variante?.toLowerCase().includes(term)
        );
    }, [products, productSearchTerm]);

    const cartTotals = useMemo(() => {
        let subtotal = 0;
        cart.forEach(item => {
            let price = selectedClient?.regimen === 'Mayorista' && item.tipoVenta === 'Caja' && item.product.precioCaja > 0
                ? item.product.precioCaja
                : item.product.precioUnidad;

            price *= item.cantidad;

            // Simulación de Promoción 2x1
            if (item.product.nombre.toLowerCase().includes('promocion 2x1') && item.cantidad >= 2) {
                price = price * (2 / 3);
            }

            subtotal += price;
        });

        const descuento = subtotal * (descuentoGlobal / 100);
        const total = subtotal - descuento;

        return { subtotal, descuento, total };
    }, [cart, selectedClient, descuentoGlobal]);

    const handleAddToCart = (product) => {
        const existingItem = cart.find(item => item.product.id === product.id);

        if (existingItem) {
            setCart(cart.map(item =>
                item.product.id === product.id
                    ? { ...item, cantidad: item.cantidad + 1 }
                    : item
            ));
        } else {
            setCart([...cart, {
                product: product,
                cantidad: 1,
                precioUnitarioAplicado: product.precioUnidad,
                tipoVenta: 'Unidad'
            }]);
        }
    };

    const handleUpdateQuantity = (productId, newQuantity) => {
        const quantity = parseInt(newQuantity);

        if (isNaN(quantity) || quantity < 1) {
            setCart(cart.filter(item => item.product.id !== productId));
            return;
        }

        setCart(cart.map(item =>
            item.product.id === productId
                ? { ...item, cantidad: quantity }
                : item
        ));
    };

    const handleSubmitOrder = async () => {
        if (!selectedClient || cart.length === 0) {
            setMessage("Debe seleccionar un cliente y agregar productos al carrito.");
            return;
        }

        if (selectedClient.saldoPendiente + cartTotals.total > selectedClient.limiteCredito) {
            setMessage(`ERROR: El cliente excede su límite de crédito de ${formatARS(selectedClient.limiteCredito)}. Saldo actual: ${formatARS(selectedClient.saldoPendiente)}.`);
            return;
        }

        if (selectedClient.regimen === 'Mayorista' && selectedClient.minimoCompra > 0 && cartTotals.total < selectedClient.minimoCompra) {
            if (!window.confirm(`ALERTA MAYORISTA: El total de ${formatARS(cartTotals.total)} es menor al mínimo de compra requerido de ${formatARS(selectedClient.minimoCompra)}. ¿Desea continuar?`)) {
                return;
            }
        }

        setLoading(true);
        const orderId = new Date().getTime().toString();
        const batch = writeBatch(db);

        try {
            // 1. Crear el pedido
            const orderRef = doc(db, getCollectionPath('orders', userId), orderId);
            batch.set(orderRef, {
                ...ORDER_MODEL,
                clienteId: selectedClient.id,
                nombreCliente: selectedClient.nombre,
                items: cart.map(i => ({
                    productId: i.product.id,
                    nombre: i.product.nombre,
                    cantidad: i.cantidad,
                    precioAplicado: i.precioUnitarioAplicado,
                })),
                subtotal: cartTotals.subtotal,
                descuentoManual: cartTotals.descuento,
                total: cartTotals.total,
                estado: 'Pendiente'
            });

            // 2. Actualizar Cuentas Corrientes (Aumento el saldo pendiente)
            const clientRef = doc(db, getCollectionPath('clients', userId), selectedClient.id);
            batch.update(clientRef, { saldoPendiente: selectedClient.saldoPendiente + cartTotals.total });

            // 3. Actualizar Stock (Descontar unidades)
            cart.forEach(item => {
                const unitsToSubtract = convertToUnits(item.cantidad, item.tipoVenta, item.product);
                const productRef = doc(db, getCollectionPath('products', userId), item.product.id);

                batch.update(productRef, {
                    stockTotal: item.product.stockTotal - unitsToSubtract,
                });
            });

            await batch.commit();
            setMessage("Pedido creado y saldo/stock actualizado exitosamente!");
            setCart([]);
            setSelectedClient(null);
            setDescuentoGlobal(0);

        } catch (e) {
            console.error("Error al procesar el pedido:", e);
            setMessage("Error al procesar el pedido: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const WhatsAppButton = ({ telefono, text }) => {
        if (!telefono) return null;
        const url = `https://wa.me/${telefono}?text=${encodeURIComponent(text)}`;
        return (
            <Button icon={() => <svg fill="#ffffff" viewBox="0 0 16 16" width="1em" height="1em" className='w-5 h-5'><path d="M13.62 2.38a7.5 7.5 0 1 0 1.25 10.22l.88 3.06a.5.5 0 0 1-.62.62l-3.06-.88a7.5 7.5 0 0 0-10.22-1.25zM12 9.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zm-5 0a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM10.5 7a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 1-.5.5zM6 7a.5.5 0 0 1-.5-.5v-2a.5.5 0 0 1 1 0v2a.5.5 0 0 1-.5.5z"/></svg>} className="bg-green-500 hover:bg-green-600 !px-3" onClick={() => window.open(url, '_blank')} />
        );
    };

    if (view === 'list') {
        return <OrderListManagement />;
    }

    // Vista de Creación de Pedido
    return (
        <div className="space-y-6">
            <div className='flex justify-between items-center'>
                <h2 className="text-2xl font-bold text-gray-800">Creación de Pedido (Venta Asistida)</h2>
                <Button onClick={() => setView('list')} className='bg-gray-500 hover:bg-gray-600'>Volver a Pedidos</Button>
            </div>
            {message && <Alert type={message.includes('ERROR') ? 'error' : 'success'}>{message}</Alert>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUMNA 1: SELECCIÓN DE CLIENTE Y CATÁLOGO */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
                        <h3 className="font-semibold text-lg mb-2 flex justify-between items-center">
                            <span>Selección de Cliente</span>
                            {selectedClient && (
                                <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${selectedClient.regimen === 'Mayorista' ? 'bg-green-100 text-green-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                    {selectedClient.regimen.toUpperCase()}
                                </div>
                            )}
                        </h3>
                        <select
                            onChange={(e) => setSelectedClient(clients.find(c => c.id === e.target.value))}
                            value={selectedClient?.id || ''}
                            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                        >
                            <option value="">Seleccione un Cliente</option>
                            {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} (Saldo: {formatARS(c.saldoPendiente)})</option>)}
                        </select>
                        {selectedClient && (
                            <div className="mt-2 text-sm text-gray-600 flex justify-between">
                                <span>Crédito Máx: {formatARS(selectedClient.limiteCredito)}</span>
                                <span className={selectedClient.saldoPendiente > selectedClient.limiteCredito ? 'text-red-600 font-bold' : 'text-green-600'}>
                                    Pendiente: {formatARS(selectedClient.saldoPendiente)}
                                </span>
                                <WhatsAppButton telefono={selectedClient.telefono} text={`Hola ${selectedClient.nombre},`} />
                            </div>
                        )}
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
                        <h3 className="font-semibold text-lg mb-2">Catálogo de Productos</h3>
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar producto..."
                                value={productSearchTerm}
                                onChange={(e) => setProductSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        <div className="max-h-96 overflow-y-auto space-y-2">
                            {filteredProducts.map(p => (
                                <div key={p.id} className="border p-3 rounded-lg flex justify-between items-center bg-gray-50 hover:bg-gray-100">
                                    <div>
                                        <p className="font-medium text-gray-800">{p.nombre} ({p.variante || p.varietal})</p>
                                        <p className="text-xs text-gray-500">Stock: {p.stockTotal} Uds. | Precio U.: {formatARS(p.precioUnidad)}</p>
                                        {p.nombre.toLowerCase().includes('promocion 2x1') && <span className="text-xs text-red-500 font-bold">¡Promoción 2x1 Activa!</span>}
                                    </div>
                                    <Button onClick={() => handleAddToCart(p)} icon={Plus} className="!py-1.5 !px-3 text-sm">Añadir</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* COLUMNA 2: CARRITO Y RESUMEN */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-lg border border-indigo-100 sticky top-20">
                        <h3 className="font-bold text-xl mb-3 text-indigo-600">Carrito de Pedido ({cart.length} ítems)</h3>

                        {/* Alerta Mayorista */}
                        {selectedClient?.regimen === 'Mayorista' && selectedClient?.minimoCompra > 0 && cartTotals.total < selectedClient.minimoCompra && (
                            <Alert type="warning">
                                <Zap className="w-4 h-4 mr-2" />
                                Faltan {formatARS(selectedClient.minimoCompra - cartTotals.total)} para el Mínimo Mayorista.
                            </Alert>
                        )}

                        <ul className="max-h-52 overflow-y-auto border-b pb-3 space-y-2">
                            <li className='flex justify-between font-semibold text-xs text-gray-500 pb-1 border-b'>
                                <span className='w-1/2'>Producto</span>
                                <span className='w-1/4 text-center'>Cant.</span>
                                <span className='w-1/4 text-right'>Total</span>
                                <span className='w-4'></span>
                            </li>
                            {cart.map(item => {
                                const price = selectedClient?.regimen === 'Mayorista' && item.tipoVenta === 'Caja' && item.product.precioCaja > 0
                                    ? item.product.precioCaja
                                    : item.product.precioUnidad;
                                let lineTotal = item.cantidad * price;

                                if (item.product.nombre.toLowerCase().includes('promocion 2x1') && item.cantidad >= 2) {
                                    lineTotal = lineTotal * (2 / 3);
                                }

                                return (
                                    <li key={item.product.id} className="flex justify-between items-center text-sm border-b py-1">
                                        <div className="w-1/2 min-w-0 pr-1">
                                            <p className="font-medium text-gray-800 truncate">{item.product.nombre}</p>
                                            <p className="text-xs text-gray-500">@ {formatARS(item.product.precioUnidad)}</p>
                                        </div>

                                        <input
                                            type="number"
                                            value={item.cantidad}
                                            min="1"
                                            onChange={(e) => handleUpdateQuantity(item.product.id, e.target.value)}
                                            className="w-1/4 text-center rounded-lg border-gray-300 text-sm p-1 shadow-sm mx-1"
                                        />

                                        <span className='font-bold text-right w-1/4'>
                                            {formatARS(lineTotal)}
                                        </span>

                                        <button onClick={() => handleUpdateQuantity(item.product.id, 0)} className="text-red-500 hover:text-red-700 ml-2">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>

                        <div className="pt-3 space-y-1">
                            <div className="flex justify-between text-sm text-gray-700"><span>Subtotal:</span><span>{formatARS(cartTotals.subtotal)}</span></div>

                            {/* Descuento Manual Global */}
                            <div className="flex justify-between items-center text-sm border-t pt-2">
                                <span className="font-semibold text-gray-700">Desc. Global (%):</span>
                                <input
                                    type="number"
                                    value={descuentoGlobal}
                                    onChange={(e) => setDescuentoGlobal(Math.min(100, parseFloat(e.target.value) || 0))}
                                    className="w-16 text-right rounded-lg border-gray-300 text-sm p-1"
                                />
                            </div>

                            <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                <span>TOTAL:</span>
                                <span className="text-indigo-600">{formatARS(cartTotals.total)}</span>
                            </div>
                        </div>

                        <Button
                            onClick={handleSubmitOrder}
                            disabled={loading || cart.length === 0 || !selectedClient}
                            className="w-full mt-4"
                            icon={ArrowUpCircle}
                        >
                            {loading ? 'Procesando...' : 'Finalizar Pedido y Facturar'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- NUEVO MODULO: GESTIÓN DE ORDENES DE COMPRA ---

const PurchaseOrderFlow = ({ db, userId, products, providers, bodegas, purchaseOrders }) => {
    const [view, setView] = useState('list');
    const [poCart, setPoCart] = useState([]);
    const [poData, setPoData] = useState(PURCHASE_ORDER_MODEL);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [productSearchTerm, setProductSearchTerm] = useState('');

    const filteredProducts = useMemo(() => {
        if (!productSearchTerm) return products;
        const term = productSearchTerm.toLowerCase();
        return products.filter(p => p.nombre?.toLowerCase().includes(term) || p.marca?.toLowerCase().includes(term));
    }, [products, productSearchTerm]);

    const poTotals = useMemo(() => {
        const costTotal = poCart.reduce((sum, item) => sum + (item.costoUnitario * item.cantidad), 0);
        return { costTotal };
    }, [poCart]);

    const handlePoAddToCart = (product) => {
        const existingItem = poCart.find(item => item.product.id === product.id);
        
        // Obtener el costo del proveedor seleccionado para la OC
        const providerCost = poData.proveedorId && product.preciosProveedores[poData.proveedorId] !== undefined 
            ? product.preciosProveedores[poData.proveedorId]
            : product.costo;
        
        if (existingItem) {
            setPoCart(poCart.map(item =>
                item.product.id === product.id
                    ? { ...item, cantidad: item.cantidad + 1 }
                    : item
            ));
        } else {
            setPoCart([...poCart, {
                product: product,
                cantidad: 1,
                costoUnitario: providerCost,
                unidadIngreso: 'Caja', // Por defecto se compra por caja
            }]);
        }
    };
    
    const handlePoUpdateQuantity = (productId, newQuantity) => {
        const quantity = parseInt(newQuantity);
        if (isNaN(quantity) || quantity < 1) {
            setPoCart(poCart.filter(item => item.product.id !== productId));
            return;
        }

        setPoCart(poCart.map(item =>
            item.product.id === productId
                ? { ...item, cantidad: quantity }
                : item
        ));
    };

    const handlePoSubmit = async () => {
        if (!poData.proveedorId || !poData.bodegaDestinoId || poCart.length === 0) {
            setMessage("Seleccione proveedor, bodega de destino y añada productos.");
            return;
        }
        
        setLoading(true);
        const poId = new Date().getTime().toString();
        
        try {
            // **CREACIÓN DE ORDEN DE COMPRA**
            const poRef = doc(db, getCollectionPath('purchaseOrders', userId), poId);
            
            const selectedProvider = providers.find(p => p.id === poData.proveedorId);
            
            await setDoc(poRef, {
                ...PURCHASE_ORDER_MODEL,
                proveedorId: poData.proveedorId,
                nombreProveedor: selectedProvider?.nombre || 'Desconocido',
                bodegaDestinoId: poData.bodegaDestinoId,
                items: poCart.map(i => ({
                    productId: i.product.id,
                    nombre: i.product.nombre,
                    cantidad: i.cantidad,
                    unidadIngreso: i.unidadIngreso,
                    costoUnitario: i.costoUnitario,
                })),
                costoTotal: poTotals.costoTotal,
                estado: 'Enviada', // Se asume que se envía inmediatamente
            });

            setMessage(`Orden de Compra #${poId} creada (Inversión: ${formatARS(poTotals.costoTotal)}).`);
            
            // Simular exportación a Excel (Función 16)
            const exportData = poCart.map(item => ({
                Producto: item.product.nombre,
                Marca: item.product.marca,
                Cantidad_Cajas: item.cantidad,
                Uds_por_Caja: item.product.udsPorCaja,
                Costo_Unidad: (item.costoUnitario / (item.product.udsPorCaja || 1)).toFixed(2),
                Costo_Total_Linea: (item.costoUnitario * item.cantidad).toFixed(2),
                Proveedor: selectedProvider?.nombre
            }));
            exportToCSV(exportData, `OC_${selectedProvider?.nombre}_${poId}`);

            setPoCart([]);
            setPoData(PURCHASE_ORDER_MODEL);

        } catch (e) {
            console.error("Error al procesar la OC:", e);
            setMessage("Error al procesar la Orden de Compra: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const PurchaseList = () => (
        <div className='space-y-4'>
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Órdenes de Compra ({purchaseOrders.length})</h2>
                <div className='space-x-2'>
                    <Button onClick={() => setView('create')} icon={Plus}>Nueva OC</Button>
                    <Button
                        onClick={() => exportToCSV(purchaseOrders.map(po => ({
                            ID: po.id,
                            Proveedor: po.nombreProveedor,
                            Bodega: bodegas.find(b => b.id === po.bodegaDestinoId)?.nombre || 'N/A',
                            Inversion: po.costoTotal,
                            Estado: po.estado,
                            Fecha: po.fecha ? new Date(po.fecha.seconds * 1000).toLocaleDateString('es-AR') : 'N/A'
                        })), 'Reporte_OC_DistriFort')}
                        icon={FileText}
                        className="bg-gray-500 hover:bg-gray-600"
                    >
                        Exportar
                    </Button>
                </div>
            </div>
            <div className="bg-white shadow-md rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID / Proveedor</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Inversión</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bodega Destino</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {purchaseOrders.map((po) => (
                            <tr key={po.id}>
                                <td className="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <span className='text-xs text-gray-500'>#{po.id}</span>
                                    <div className="text-sm font-bold">{po.nombreProveedor}</div>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-sm text-red-700 font-semibold">
                                    {formatARS(po.costoTotal || 0)}
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {bodegas.find(b => b.id === po.bodegaDestinoId)?.nombre || 'N/A'}
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${po.estado === 'Recibida' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                                        {po.estado}
                                    </span>
                                </td>
                                <td className="px-3 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    <button onClick={() => deleteDoc(doc(db, getCollectionPath('purchaseOrders', userId), po.id))} className="text-red-600 hover:text-red-900" title="Archivar Orden"><Trash2 className="w-4 h-4 inline" /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    if (view === 'list') {
        return <PurchaseList />;
    }
    
    // Vista de Creación de OC
    return (
        <div className="space-y-6">
            <div className='flex justify-between items-center'>
                <h2 className="text-2xl font-bold text-gray-800">Crear Orden de Compra</h2>
                <Button onClick={() => setView('list')} className='bg-gray-500 hover:bg-gray-600'>Volver a Compras</Button>
            </div>
            {message && <Alert type={message.includes('Error') ? 'error' : 'success'}>{message}</Alert>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* COLUMNA 1: PROVEEDOR Y PRODUCTOS */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100 grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Proveedor</label>
                            <select
                                name="proveedorId"
                                value={poData.proveedorId}
                                onChange={(e) => setPoData(prev => ({...prev, proveedorId: e.target.value}))}
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                            >
                                <option value="">Seleccione Proveedor</option>
                                {providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Bodega de Destino</label>
                            <select
                                name="bodegaDestinoId"
                                value={poData.bodegaDestinoId}
                                onChange={(e) => setPoData(prev => ({...prev, bodegaDestinoId: e.target.value}))}
                                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border bg-white"
                            >
                                <option value="">Seleccione Bodega</option>
                                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
                        <h3 className="font-semibold text-lg mb-2">Productos a Comprar</h3>
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar producto (solo productos con costo)..."
                                value={productSearchTerm}
                                onChange={(e) => setProductSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        <div className="max-h-96 overflow-y-auto space-y-2">
                            {filteredProducts.filter(p => p.costo > 0).map(p => {
                                // Obtener el costo específico del proveedor seleccionado, o el costo principal
                                const costToDisplay = poData.proveedorId && p.preciosProveedores[poData.proveedorId] !== undefined 
                                    ? p.preciosProveedores[poData.proveedorId]
                                    : p.costo;
                                    
                                return (
                                    <div key={p.id} className="border p-3 rounded-lg flex justify-between items-center bg-gray-50 hover:bg-gray-100">
                                        <div>
                                            <p className="font-medium text-gray-800">{p.nombre} ({p.variante || p.varietal})</p>
                                            <p className="text-xs text-gray-500">Costo Aplicado: {formatARS(costToDisplay)}</p>
                                        </div>
                                        <Button 
                                            onClick={() => handlePoAddToCart({ ...p, costo: costToDisplay })} 
                                            icon={Plus} 
                                            className="!py-1.5 !px-3 text-sm"
                                            disabled={!poData.proveedorId || !poData.bodegaDestinoId}
                                        >
                                            Añadir
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* COLUMNA 2: CARRITO DE COMPRA */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-white p-4 rounded-xl shadow-lg border border-red-100 sticky top-20">
                        <h3 className="font-bold text-xl mb-3 text-red-600">Inversión de Reposición ({poCart.length} ítems)</h3>

                        <ul className="max-h-52 overflow-y-auto border-b pb-3 space-y-2">
                            <li className='flex justify-between font-semibold text-xs text-gray-500 pb-1 border-b'>
                                <span className='w-1/2'>Producto</span>
                                <span className='w-1/4 text-center'>Cant.</span>
                                <span className='w-1/4 text-right'>Costo</span>
                                <span className='w-4'></span>
                            </li>
                            {poCart.map(item => {
                                // Se asume que item.costoUnitario ya es el costo por caja/pack
                                const lineTotal = item.cantidad * item.costoUnitario;

                                return (
                                    <li key={item.product.id} className="flex justify-between items-center text-sm border-b py-1">
                                        <div className="w-1/2 min-w-0 pr-1">
                                            <p className="font-medium text-gray-800 truncate">{item.product.nombre}</p>
                                            <p className="text-xs text-gray-500">@ {formatARS(item.costoUnitario)} / Caja</p>
                                        </div>
                                        <input
                                            type="number"
                                            value={item.cantidad}
                                            min="1"
                                            onChange={(e) => handlePoUpdateQuantity(item.product.id, e.target.value)}
                                            className="w-1/4 text-center rounded-lg border-gray-300 text-sm p-1 shadow-sm mx-1"
                                        />
                                        <span className='font-bold text-right w-1/4 text-red-600'>
                                            {formatARS(lineTotal)}
                                        </span>
                                        <button onClick={() => handlePoUpdateQuantity(item.product.id, 0)} className="text-red-500 hover:text-red-700 ml-2">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>

                        <div className="pt-3 space-y-1">
                            <div className="flex justify-between font-bold text-lg pt-2 border-t">
                                <span>INVERSIÓN TOTAL:</span>
                                <span className="text-red-600">{formatARS(poTotals.costoTotal)}</span>
                            </div>
                        </div>

                        <Button
                            onClick={handlePoSubmit}
                            disabled={loading || poCart.length === 0 || !poData.proveedorId || !poData.bodegaDestinoId}
                            className="w-full mt-4 bg-red-600 hover:bg-red-700"
                            icon={ArrowUpCircle}
                        >
                            {loading ? 'Procesando...' : 'Generar Orden de Compra'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- LLM 2: ANÁLISIS DE DEMANDA ---
const DemandAnalysis = ({ products, orders }) => {
    const [report, setReport] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const generateAnalysis = async () => {
        if (isLoading) return;
        if (products.length === 0) {
            setReport("No hay productos cargados en el inventario para realizar un análisis.");
            return;
        }

        setIsLoading(true);
        setReport('');

        const inventorySummary = products.map(p =>
            `Producto: ${p.nombre}, Stock: ${p.stockTotal}, Umbral Mínimo: ${p.umbralMinimo}, Precio: ${formatARS(p.precioUnidad)}`
        ).join('; ');

        // Se utilizan todos los pedidos para un mejor análisis, pero se resumen en el prompt
        const totalItemsSold = orders.flatMap(o => o.items).reduce((acc, item) => {
            acc[item.nombre] = (acc[item.nombre] || 0) + item.cantidad;
            return acc;
        }, {});
        
        const soldSummary = Object.entries(totalItemsSold)
            .sort(([, a], [, b]) => b - a)
            .map(([name, count]) => `${name} (${count} uds vendidas)`).join('; ');


        const systemPrompt = "Actúa como un analista de negocios especializado en distribución de bebidas. Tu tarea es analizar los datos de inventario y el historial de ventas para proporcionar una conclusión concisa (máximo 7 frases) sobre la salud del negocio. Tu análisis debe incluir una recomendación clave, resaltando los productos con stock bajo (cercanos al Umbral Mínimo - riesgo) y los productos que más se han vendido (oportunidad/alta demanda). Siempre sé profesional y usa un tono de recomendación estratégica.";

        const userQuery = `Analiza la siguiente información. Inventario actual (Nombre, Stock, Precio): ${inventorySummary}. Resumen de Unidades Vendidas Recientes (Nombre, Cantidad): ${soldSummary}.`;

        const payload = {
            model: "gemini-2.5-flash-preview-05-20",
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };

        try {
            const response = await secureGeminiFetch('generateContent', payload);
            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Error al generar el análisis. Verifica que haya datos suficientes.";
            setReport(text);
        } catch (error) {
            console.error("Gemini Proxy Error:", error);
            setReport("No se pudo conectar con el servicio de análisis de IA. Por favor, inténtalo más tarde.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Análisis Estratégico de Demanda</h2>
            <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
                <p className="text-gray-600 mb-4">
                    Obtén una evaluación estratégica de la **salud de tu inventario y tendencias de venta** basada en tus datos de DISTRIFORT, asistida por inteligencia artificial.
                </p>

                <Button
                    onClick={generateAnalysis}
                    disabled={isLoading || products.length === 0}
                    className="w-full"
                    icon={Sparkles}
                >
                    {isLoading ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : 'Generar Análisis de Demanda ✨'}
                </Button>

                {report && (
                    <div className="mt-6 p-4 border-2 border-purple-300 bg-purple-50 rounded-xl shadow-inner">
                        <h3 className="font-bold text-lg mb-2 text-purple-800 flex items-center">
                            <TrendingUp className="w-5 h-5 mr-2" /> Conclusión del Analista de IA
                        </h3>
                        <p className="text-gray-800 whitespace-pre-wrap">{report}</p>
                    </div>
                )}

                {!report && !isLoading && (
                    <div className="mt-6 p-4 text-center text-gray-500 bg-gray-100 rounded-xl">
                        Haz clic en el botón para generar tu reporte. Necesitas productos y pedidos registrados.
                    </div>
                )}
            </div>
        </div>
    );
};

// --- COMPONENTE DE APLICACIÓN PRINCIPAL (APP) ---

const App = () => {
    const { db, userId, isAuthReady, error } = useAuthAndFirestore();
    const [currentPage, setCurrentPage] = useState('Dashboard');
    const [loadingData, setLoadingData] = useState(true);

    const [products, setProducts] = useState([]);
    const [clients, setClients] = useState([]);
    const [providers, setProviders] = useState([]);
    const [bodegas, setBodegas] = useState([]);
    const [orders, setOrders] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);

    const useCollectionData = (collectionName, setState) => {
        useEffect(() => {
            if (!db || !userId) return;

            const collectionRef = collection(db, getCollectionPath(collectionName, userId));
            const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setState(data);
                // Solo marcamos como cargado después de la primera carga de todas las colecciones principales
                if (collectionName === 'products' || collectionName === 'clients') setLoadingData(false);
            }, (e) => {
                console.error(`Error fetching ${collectionName}:`, e);
                setLoadingData(false);
            });

            return () => unsubscribe();
        }, [db, userId, collectionName]);
    };

    useCollectionData('products', setProducts);
    useCollectionData('clients', setClients);
    useCollectionData('providers', setProviders);
    useCollectionData('bodegas', setBodegas);
    useCollectionData('orders', setOrders);
    useCollectionData('purchaseOrders', setPurchaseOrders);

    // Extracción de taxonomía (marcas, especies, etc.)
    const [marcas, setMarcas] = useState([]);
    const [especies, setEspecies] = useState([]);
    const [variantes, setVariantes] = useState([]);
    const [varietales, setVarietales] = useState([]);

    useEffect(() => {
        const extractUnique = (data, field) => [...new Set(data.map(item => item[field]).filter(Boolean))];

        setMarcas(extractUnique(products, 'marca'));
        setEspecies(extractUnique(products, 'especie'));
        setVariantes(extractUnique(products, 'variante'));
        setVarietales(extractUnique(products, 'varietal'));
    }, [products]);


    const Navigation = () => (
        <div className="flex justify-between items-center p-4 bg-white border-b sticky top-0 z-10 shadow-sm">
            <h1 className="text-2xl font-black text-indigo-600">DISTRIFORT</h1>
            <div className="flex space-x-1 sm:space-x-3">
                <NavButton icon={LayoutDashboard} label="BI" target="Dashboard" current={currentPage} setCurrent={setCurrentPage} />
                <NavButton icon={Package} label="Productos" target="Products" current={currentPage} setCurrent={setCurrentPage} />
                <NavButton icon={Users} label="Clientes" target="Clients" current={currentPage} setCurrent={setCurrentPage} />
                <NavButton icon={Tag} label="Pedidos" target="Orders" current={currentPage} setCurrent={setCurrentPage} />
                <NavButton icon={List} label="Compras" target="Purchases" current={currentPage} setCurrent={setCurrentPage} />
                <NavButton icon={TrendingUp} label="Análisis IA" target="Analysis" current={currentPage} setCurrent={setCurrentPage} />
            </div>
        </div>
    );

    const NavButton = ({ icon: Icon, label, target, current, setCurrent }) => (
        <button
            onClick={e => {
                e.preventDefault();
                setCurrent(target);
            }}
            className={`flex flex-col items-center text-xs px-2 py-1 rounded-lg transition duration-150 ${current === target ? 'text-indigo-600 bg-indigo-50' : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-100'}`}
        >
            {Icon && <Icon className="w-5 h-5" />}
            <span className="hidden sm:inline">{label}</span>
        </button>
    );

    const renderPage = () => {
        const taxonomies = { marcas, especies, variantes, varietales };

        switch (currentPage) {
            case 'Dashboard':
                return <Dashboard products={products} clients={clients} setCurrentPage={setCurrentPage} />;
            case 'Products':
                return <ProductManager
                    db={db} userId={userId}
                    products={products} providers={providers} bodegas={bodegas}
                    taxonomies={taxonomies}
                />;
            case 'Clients':
                return <ClientManager db={db} userId={userId} clients={clients} />;
            case 'Orders':
                return <OrderFlow
                    db={db} userId={userId}
                    products={products} clients={clients}
                    orders={orders}
                />;
            case 'Purchases':
                return <PurchaseOrderFlow
                    db={db} userId={userId}
                    products={products} providers={providers} bodegas={bodegas}
                    purchaseOrders={purchaseOrders}
                />;
            case 'Analysis':
                return <DemandAnalysis products={products} orders={orders} />;
            default:
                return <Dashboard products={products} clients={clients} setCurrentPage={setCurrentPage} />;
        }
    };

    if (error) return <Alert type="error">Error Fatal: {error}</Alert>;
    if (!isAuthReady || loadingData) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="flex items-center text-lg font-semibold text-indigo-600">
                <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                Cargando DistriFort Bebidas...
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            {/* Nota: Se usan CDNs para Tailwind y el tipo text/babel en index.html para simplificar el despliegue en Vercel/Netlify. */}
            <Navigation />
            <main className="p-4 sm:p-6 pb-20">
                {renderPage()}
            </main>
            <footer className="fixed bottom-0 w-full p-2 bg-gray-100 text-center text-xs text-gray-500 border-t">
                <p>DistriFort Bebidas | Gestor: {userId}</p>
            </footer>
        </div>
    );
};

export default App;
