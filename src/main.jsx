import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { LogOut, LayoutDashboard, Package, Users, Tag, List, FileText, Search, Plus, Trash2, Zap, Wallet, ArrowUpCircle, X, ChevronUp, DollarSign, TrendingUp, MessageSquare } from 'lucide-react';

// Importaciones estándar de Firebase
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore, collection, doc, onSnapshot, setDoc,
  deleteDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';


// --- CONFIGURACIÓN DE FIREBASE (VARIABLES GLOBALES DEL ENTORNO) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let app, db, auth;
if (Object.keys(firebaseConfig).length > 0) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
}

// --- MODELOS DE DATOS ---
const PRODUCT_MODEL = {
  nombre: '',
  marca: '',
  especie: '',
  variante: '',
  varietal: '',
  proveedorId: '',
  costo: 0,
  preciosProveedores: {},
  precioUnidad: 0,
  precioCaja: 0,
  udsPorCaja: 1,
  stockTotal: 0,
  stockPorBodega: {},
  umbralMinimo: 10,
};

const CLIENT_MODEL = {
  nombre: '',
  cuit: '',
  telefono: '',
  email: '',
  direccion: '',
  regimen: 'Minorista',
  limiteCredito: 0,
  saldoPendiente: 0,
};

const ORDER_MODEL = {
  clienteId: '',
  nombreCliente: '',
  items: [],
  subtotal: 0,
  descuentoManual: 0,
  total: 0,
  estado: 'Pendiente',
};

const PURCHASE_ORDER_MODEL = {
  proveedorId: '',
  nombreProveedor: '',
  bodegaDestinoId: '',
  items: [],
  costoTotal: 0,
  estado: 'Pendiente',
};


// --- HOOKS Y UTILIDADES ---

// Hook para manejar la autenticación de Firebase
const useAuth = () => {
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!auth) {
      setError("Firebase Auth no está configurado.");
      setIsAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUserId(user.uid);
      } else {
        try {
          const userCredential = initialAuthToken
            ? await signInWithCustomToken(auth, initialAuthToken)
            : await signInAnonymously(auth);
          setUserId(userCredential.user.uid);
        } catch (e) {
          console.error("Error de autenticación anónima:", e);
          setError("No se pudo autenticar al usuario.");
        }
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return { userId, isAuthReady, error };
};

// Hook genérico para obtener datos de una colección de Firestore
const useCollection = (collectionName) => {
    const { userId } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId || !db) return;
        setLoading(true);
        const collectionRef = collection(db, `/artifacts/${appId}/users/${userId}/${collectionName}`);
        const unsubscribe = onSnapshot(collectionRef, (snapshot) => {
            const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setData(items);
            setLoading(false);
        }, (err) => {
            console.error(`Error al obtener ${collectionName}:`, err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [userId, collectionName]);

    return { data, loading };
};


// --- COMPONENTES DE UI REUTILIZABLES ---
const Alert = ({ type = 'info', children }) => {
    const colorClasses = {
        info: "bg-blue-100 text-blue-800",
        error: "bg-red-100 text-red-800",
        success: "bg-green-100 text-green-800",
    };
    return <div className={`p-4 rounded-lg text-sm ${colorClasses[type]}`}>{children}</div>;
};

const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (
    <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'} ${className}`}
    >
        {Icon && <Icon className="w-5 h-5" />}
        <span>{children}</span>
    </button>
);

const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white">
                <h3 className="text-xl font-bold">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <div className="p-6">{children}</div>
        </div>
    </div>
);

const Input = ({ label, name, value, onChange, type = 'text', required = false, step }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
            type={type}
            name={name}
            value={value}
            onChange={onChange}
            required={required}
            step={step}
            className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
        />
    </div>
);


// --- LLAMADA A LA API DE GEMINI (PROXY) ---
const exponentialBackoffFetch = async (url, options, retries = 5, delay = 1000) => {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return exponentialBackoffFetch(url, options, retries - 1, delay * 2);
            }
            throw new Error(`Error de red: ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        if (retries > 0) {
            await new Promise(res => setTimeout(res, delay));
            return exponentialBackoffFetch(url, options, retries - 1, delay * 2);
        }
        throw error;
    }
};

const secureGeminiFetch = async (prompt) => {
    const response = await exponentialBackoffFetch('/api/gemini-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
    });

    if (response.error) {
        throw new Error(response.error);
    }
    return response.text;
};

// --- GESTIÓN DE PRODUCTOS ---
const ProductManager = ({ products, providers, bodegas }) => {
    const { userId } = useAuth();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);

    const handleSave = async (productData) => {
        const id = productData.id || new Date().getTime().toString();
        const docRef = doc(db, `/artifacts/${appId}/users/${userId}/products`, id);
        await setDoc(docRef, { ...productData, timestamp: serverTimestamp() }, { merge: true });
        setIsModalOpen(false);
    };

    const handleDelete = async (id) => {
        if (window.confirm("¿Seguro que quieres eliminar este producto?")) {
            const docRef = doc(db, `/artifacts/${appId}/users/${userId}/products`, id);
            await deleteDoc(docRef);
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold">Inventario de Productos</h2>
                <Button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} icon={Plus}>
                    Nuevo Producto
                </Button>
            </div>
            <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio Unidad</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {products.map(p => (
                            <tr key={p.id}>
                                <td className="px-6 py-4 whitespace-nowrap">{p.nombre}</td>
                                <td className={`px-6 py-4 whitespace-nowrap font-semibold ${p.stockTotal < p.umbralMinimo ? 'text-red-500' : 'text-green-600'}`}>
                                    {p.stockTotal}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">{p.precioUnidad.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right space-x-4">
                                    <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                    <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-900">Eliminar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {isModalOpen && (
                <Modal title={editingProduct ? "Editar Producto" : "Nuevo Producto"} onClose={() => setIsModalOpen(false)}>
                    <ProductForm product={editingProduct} onSave={handleSave} providers={providers} bodegas={bodegas} />
                </Modal>
            )}
        </div>
    );
};

const ProductForm = ({ product, onSave, providers, bodegas }) => {
    const [formData, setFormData] = useState(product || PRODUCT_MODEL);

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? parseFloat(value) || 0 : value }));
    };

    return (
        <form onSubmit={(e) => { e.preventDefault(); onSave(formData); }} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Nombre" name="nombre" value={formData.nombre} onChange={handleChange} required />
                <Input label="Marca" name="marca" value={formData.marca} onChange={handleChange} />
                <Input label="Especie" name="especie" value={formData.especie} onChange={handleChange} />
                <Input label="Variante" name="variante" value={formData.variante} onChange={handleChange} />
                <Input label="Costo" name="costo" type="number" value={formData.costo} onChange={handleChange} step="0.01" />
                <Input label="Precio Unidad" name="precioUnidad" type="number" value={formData.precioUnidad} onChange={handleChange} step="0.01" required />
                <Input label="Stock Total" name="stockTotal" type="number" value={formData.stockTotal} onChange={handleChange} />
                <Input label="Umbral Mínimo" name="umbralMinimo" type="number" value={formData.umbralMinimo} onChange={handleChange} />
            </div>
            <div className="flex justify-end pt-4">
                <Button type="submit">Guardar</Button>
            </div>
        </form>
    );
};


// --- GESTIÓN DE PEDIDOS ---
const OrderManager = ({ orders, products }) => {
    const { userId } = useAuth();
    const [view, setView] = useState('list'); // 'list' o 'create'
    const [message, setMessage] = useState('');
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiMessage, setAiMessage] = useState('');
    const [loadingAi, setLoadingAi] = useState(false);

    const generateEmailDraft = async (order) => {
        setLoadingAi(true);
        setAiMessage('');
        setIsAiModalOpen(true);
        const orderDetails = order.items.map(item => `${item.cantidad} x ${item.nombre}`).join(', ');
        const prompt = `Actúa como un asistente de servicio al cliente para una distribuidora de bebidas. Escribe un borrador de mensaje de WhatsApp o email muy breve (máximo 4 frases) para el cliente "${order.nombreCliente}" sobre su pedido. El estado del pedido es "${order.estado}". El pedido incluye: ${orderDetails}. El total es ${order.total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}. Sé profesional y amigable.`;

        try {
            const result = await secureGeminiFetch(prompt);
            setAiMessage(result);
        } catch (error) {
            console.error("Error al generar mensaje con IA:", error);
            setAiMessage("Hubo un error al generar el mensaje. Por favor, inténtelo de nuevo.");
        } finally {
            setLoadingAi(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold">Gestión de Pedidos</h2>
                <Button onClick={() => setView(view === 'list' ? 'create' : 'list')} icon={view === 'list' ? Plus : List}>
                    {view === 'list' ? 'Nuevo Pedido' : 'Ver Lista'}
                </Button>
            </div>

            {message && <Alert type="success">{message}</Alert>}

            {view === 'create' ? (
                <NewOrderForm products={products} onOrderPlaced={() => { setMessage("¡Pedido creado con éxito!"); setView('list'); }} />
            ) : (
                <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {orders.map(o => (
                                <tr key={o.id}>
                                    <td className="px-6 py-4 whitespace-nowrap">{o.nombreCliente}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{o.total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">{o.estado}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                        <Button onClick={() => generateEmailDraft(o)} icon={MessageSquare} className="!p-2 bg-sky-500 hover:bg-sky-600">✨ Generar Mensaje</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {isAiModalOpen && (
                <Modal title="Asistente de Mensajes IA" onClose={() => setIsAiModalOpen(false)}>
                    {loadingAi ? <p>Generando mensaje...</p> : <p className="whitespace-pre-wrap">{aiMessage}</p>}
                </Modal>
            )}
        </div>
    );
};

const NewOrderForm = ({ products, onOrderPlaced }) => {
    const { userId } = useAuth();
    const { data: clients } = useCollection('clients');
    const [selectedClient, setSelectedClient] = useState('');
    const [cart, setCart] = useState([]);

    const handleAddToCart = (product, quantity) => {
        const numQuantity = parseInt(quantity);
        if (numQuantity <= 0) return;

        setCart(prev => {
            const existing = prev.find(item => item.productId === product.id);
            if (existing) {
                return prev.map(item => item.productId === product.id ? { ...item, cantidad: item.cantidad + numQuantity } : item);
            }
            return [...prev, {
                productId: product.id,
                nombre: product.nombre,
                cantidad: numQuantity,
                precioUnidad: product.precioUnidad
            }];
        });
    };

    const total = useMemo(() => cart.reduce((sum, item) => sum + (item.cantidad * item.precioUnidad), 0), [cart]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedClient || cart.length === 0) {
            alert("Por favor, seleccione un cliente y agregue productos.");
            return;
        }

        const clientDoc = clients.find(c => c.id === selectedClient);
        const batch = writeBatch(db);

        // 1. Crear el pedido
        const orderId = new Date().getTime().toString();
        const orderRef = doc(db, `/artifacts/${appId}/users/${userId}/orders`, orderId);
        batch.set(orderRef, {
            ...ORDER_MODEL,
            clienteId: selectedClient,
            nombreCliente: clientDoc.nombre,
            items: cart,
            total,
            timestamp: serverTimestamp()
        });

        // 2. Actualizar stock
        for (const item of cart) {
            const productRef = doc(db, `/artifacts/${appId}/users/${userId}/products`, item.productId);
            const product = products.find(p => p.id === item.productId);
            const newStock = (product.stockTotal || 0) - item.cantidad;
            batch.update(productRef, { stockTotal: newStock });
        }

        await batch.commit();
        onOrderPlaced();
    };

    return (
        <div className="bg-white shadow-lg rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Cliente</label>
                    <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} required className="w-full mt-1 p-2 border border-gray-300 rounded-lg">
                        <option value="">Seleccione un cliente</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                </div>

                <div className="space-y-2">
                    <h3 className="font-semibold">Añadir Productos</h3>
                    {products.map(p => (
                        <div key={p.id} className="flex items-center space-x-2">
                            <span>{p.nombre} ({p.stockTotal} disp.)</span>
                            <input type="number" id={`qty-${p.id}`} className="w-20 p-1 border rounded" />
                            <Button type="button" onClick={() => handleAddToCart(p, document.getElementById(`qty-${p.id}`).value)}>Añadir</Button>
                        </div>
                    ))}
                </div>

                <div>
                    <h3 className="font-bold text-lg">Total del Pedido: {total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</h3>
                    <ul>{cart.map(i => <li key={i.productId}>{i.cantidad} x {i.nombre}</li>)}</ul>
                </div>

                <div className="flex justify-end">
                    <Button type="submit">Crear Pedido</Button>
                </div>
            </form>
        </div>
    );
};

// --- ANÁLISIS IA ---
const AnalysisManager = ({ products, orders }) => {
    const [analysis, setAnalysis] = useState('');
    const [loading, setLoading] = useState(false);

    const generateAnalysis = async () => {
        setLoading(true);
        setAnalysis('');
        const inventorySummary = products.map(p => `${p.nombre} (Stock: ${p.stockTotal})`).join(', ');
        const recentOrders = orders.slice(-10).map(o => `Pedido para ${o.nombreCliente} con ${o.items.map(i => i.nombre).join(', ')}`).join('; ');
        
        const prompt = `Como analista de negocios para una distribuidora de bebidas, escribe un párrafo conciso sobre el estado actual del negocio. Identifica riesgos (productos con bajo stock, menos de 10 unidades) y oportunidades (productos populares en los últimos pedidos). Aquí están los datos: Inventario: [${inventorySummary}]. Últimos 10 pedidos: [${recentOrders}].`;

        try {
            const result = await secureGeminiFetch(prompt);
            setAnalysis(result);
        } catch (error) {
            console.error("Error al generar análisis:", error);
            setAnalysis("No se pudo generar el análisis. Inténtelo más tarde.");
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold">Análisis Estratégico IA</h2>
            <Button onClick={generateAnalysis} disabled={loading} icon={TrendingUp}>
                {loading ? 'Generando...' : 'Generar Análisis de Demanda ✨'}
            </Button>
            {analysis && (
                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="font-bold mb-2">Resultado del Análisis:</h3>
                    <p className="whitespace-pre-wrap">{analysis}</p>
                </div>
            )}
        </div>
    );
};


// --- COMPONENTE PRINCIPAL DE LA APP ---
const App = () => {
    const { userId, isAuthReady, error } = useAuth();
    const [currentPage, setCurrentPage] = useState('Inventario');
    const { data: products } = useCollection('products');
    const { data: clients } = useCollection('clients');
    const { data: orders } = useCollection('orders');
    const { data: providers } = useCollection('providers');
    const { data: bodegas } = useCollection('bodegas');
    
    if (error) return <Alert type="error">{error}</Alert>;
    if (!isAuthReady) return <div className="min-h-screen flex items-center justify-center"><div className="text-xl font-semibold">Cargando DistriFort...</div></div>;
    
    const navItems = [
        { name: 'Inventario', icon: Package },
        { name: 'Pedidos', icon: Tag },
        { name: 'Análisis IA', icon: TrendingUp },
    ];
    
    const renderPage = () => {
        switch (currentPage) {
            case 'Inventario':
                return <ProductManager products={products} providers={providers} bodegas={bodegas} />;
            case 'Pedidos':
                return <OrderManager orders={orders} products={products} />;
            case 'Análisis IA':
                return <AnalysisManager products={products} orders={orders} />;
            default:
                return <div>Página no encontrada</div>;
        }
    };

    return (
        <div className="min-h-screen bg-gray-100 flex font-sans" style={{fontFamily: "'Inter', sans-serif"}}>
            {/* Barra de Navegación Lateral */}
            <nav className="w-64 bg-white shadow-md p-4 flex flex-col">
                <h1 className="text-2xl font-black text-indigo-600 mb-8">DistriFort</h1>
                <ul className="space-y-2">
                    {navItems.map(item => (
                        <li key={item.name}>
                            <button
                                onClick={() => setCurrentPage(item.name)}
                                className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left font-semibold transition ${currentPage === item.name ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}
                            >
                                <item.icon className="w-6 h-6" />
                                <span>{item.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* Contenido Principal */}
            <main className="flex-1 p-8">
                {renderPage()}
            </main>
        </div>
    );
};


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

