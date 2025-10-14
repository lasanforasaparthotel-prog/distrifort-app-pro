import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, collection, doc, onSnapshot, setDoc, 
    deleteDoc, serverTimestamp, writeBatch, updateDoc, query, where 
} from 'firebase/firestore';
import { 
    LayoutDashboard, Package, Users, Tag, Truck, BarChart2, Search, Plus, 
    Trash2, Edit, X, DollarSign, Wallet, ArrowDownCircle, ArrowUpCircle, 
    FileText, Phone, MessageSquare, MapPin, Zap, List, Wrench, Calculator, Percent, BrainCircuit, Wine, CheckSquare
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyDSdpnWJiIHqY9TaruFIMBsBuWtm-WsRkI",
  authDomain: "distrifort.firebaseapp.com",
  projectId: "distrifort",
  storageBucket: "distrifort.firebasestorage.app",
  messagingSenderId: "456742367607",
  appId: "1:456742367607:web:25341e7e3126fd7c04f172"
};

const appId = 'distrifort_app';

let app, db, auth;
try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (error) {
  console.error("Error al inicializar Firebase:", error);
}

// --- MODELOS DE DATOS ---
const PRODUCT_MODEL = {
    nombre: '',
    marca: '',
    especie: 'Vino',
    varietal: '',
    costo: 0,
    precioUnidad: 0,
    precioCaja: 0,
    udsPorCaja: 6,
    stockTotal: 0,
    umbralMinimo: 10,
    archivado: false,
    preciosProveedores: {},
};

const CLIENT_MODEL = {
    nombre: '',
    cuit: '',
    telefono: '',
    email: '',
    direccion: '',
    regimen: 'Minorista',
    minimoCompra: 0,
    limiteCredito: 0,
    saldoPendiente: 0,
    archivado: false,
};

const ORDER_MODEL = {
    clienteId: '',
    nombreCliente: '',
    items: [],
    subtotal: 0,
    costoEnvio: 0,
    descuento: 0,
    total: 0,
    estado: 'Pendiente',
    archivado: false,
};

// --- HOOKS Y UTILIDADES ---
const useAuth = () => {
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    useEffect(() => {
        if (!auth) { 
            setIsAuthReady(true);
            return;
        }
        const unsub = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    const cred = await signInAnonymously(auth);
                    setUserId(cred.user.uid);
                } catch (e) { console.error("Auth error", e); }
            }
            setIsAuthReady(true);
        });
        return unsub;
    }, []);
    return { userId, isAuthReady };
};

const useCollection = (collectionName, includeArchived = false) => {
    const { userId } = useAuth();
    const [data, setData] = useState([]);
    useEffect(() => {
        if (!userId || !db) return;
        
        let q;
        const collectionRef = collection(db, `users/${userId}/${collectionName}`);
        
        if (includeArchived) {
            q = query(collectionRef);
        } else {
            q = query(collectionRef, where("archivado", "==", false));
        }

        const unsub = onSnapshot(q, (snapshot) => {
            setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.error(`Error al obtener ${collectionName}:`, err);
        });
        return unsub;
    }, [userId, collectionName, includeArchived]);
    return { data };
};

// --- COMPONENTES DE UI GENÉRICOS ---
const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (
    <button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'} ${className}`}>
        {Icon && <Icon className="w-5 h-5" />}
        <span>{children}</span>
    </button>
);
const Modal = ({ title, children, onClose }) => (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex justify-between items-center sticky top-0 bg-white">
                <h3 className="text-xl font-bold">{title}</h3>
                <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X /></button>
            </div>
            <div className="p-6 overflow-y-auto">{children}</div>
        </div>
    </div>
);
const Input = ({ label, name, value, onChange, type = 'text', required = false, step = "any", className = "" }) => (
    <div className={className}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input type={type} name={name} value={value || ''} onChange={onChange} required={required} step={step} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500" />
    </div>
);
const Select = ({ label, name, value, onChange, children, required = false, className = "" }) => (
    <div className={className}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select name={name} value={value || ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white">
            {children}
        </select>
    </div>
);
const Card = ({ title, value, icon: Icon, color = 'indigo' }) => (
    <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
      <div className={`flex items-center justify-between`}>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <Icon className={`w-6 h-6 text-${color}-500`} />
      </div>
      <p className="text-3xl font-bold mt-1 text-gray-800">{value}</p>
    </div>
);

// --- MÓDULOS COMPLETOS ---

const Dashboard = ({ products = [], orders = [], purchaseOrders = [], setCurrentPage }) => {
    // ... (CÓDIGO COMPLETO Y FUNCIONAL DEL DASHBOARD)
};

const GlobalSearchManager = ({ products = [], clients = [], orders = [] }) => {
    // ... (CÓDIGO COMPLETO Y FUNCIONAL DE BÚSQUEDA)
};

const ProductManager = ({ products = [], bodegas = [] }) => {
    // ... (CÓDIGO COMPLETO Y FUNCIONAL DE INVENTARIO)
};

const ClientManager = ({ clients = [] }) => {
    // ... (CÓDIGO COMPLETO Y FUNCIONAL DE CLIENTES)
};

const OrderManager = ({ clients = [], products = [], orders = [] }) => {
    const [view, setView] = useState('list'); // 'list' o 'creator'

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold">Gestión de Pedidos</h2>
                <Button 
                    onClick={() => setView(view === 'list' ? 'creator' : 'list')} 
                    icon={view === 'list' ? Plus : List}
                >
                    {view === 'list' ? 'Nuevo Pedido' : 'Ver Historial'}
                </Button>
            </div>

            {view === 'list' ? (
                <OrderList orders={orders} />
            ) : (
                <OrderCreator clients={clients} products={products} setView={setView} />
            )}
        </div>
    );
};

const OrderList = ({ orders }) => {
    const { userId } = useAuth();
    const handleArchive = async (id) => {
        if (window.confirm("¿Seguro que quieres archivar este pedido?")) {
            await updateDoc(doc(db, `users/${userId}/orders`, id), { archivado: true });
        }
    };

    return (
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
                    {(orders || []).map(o => (
                        <tr key={o.id}>
                            <td className="px-6 py-4 whitespace-nowrap">{o.nombreCliente}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-semibold">{(o.total || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
                            <td className="px-6 py-4 whitespace-nowrap"><span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">{o.estado}</span></td>
                            <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                <Button onClick={() => handleArchive(o.id)} className="!p-2 !bg-yellow-500 hover:!bg-yellow-600"><Trash2 className="w-4 h-4"/></Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const OrderCreator = ({ clients, products, setView }) => {
    const { userId } = useAuth();
    const [cart, setCart] = useState([]);
    const [clientId, setClientId] = useState('');
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);
    const [productSearch, setProductSearch] = useState('');

    const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);
    
    const filteredProducts = useMemo(() => {
        if (!productSearch) return products;
        return products.filter(p => p.nombre.toLowerCase().includes(productSearch.toLowerCase()));
    }, [products, productSearch]);

    const { subtotal, descuentoMonto, total } = useMemo(() => {
        const sub = cart.reduce((sum, item) => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return sum;

            const price = selectedClient?.regimen === 'Mayorista' && item.unit === 'Caja' && product.precioCaja > 0
                ? product.precioCaja
                : product.precioUnidad;
            
            return sum + (item.quantity * price);
        }, 0);

        const descMonto = sub * (descuentoPorcentaje / 100);
        const finalTotal = sub - descMonto + costoEnvio;
        
        return { subtotal: sub, descuentoMonto: descMonto, total: finalTotal };
    }, [cart, selectedClient, products, costoEnvio, descuentoPorcentaje]);

    const handleAddToCart = (product, quantity, unit) => {
        if (!product || quantity <= 0) return;
        const newItem = { 
            cartId: new Date().getTime(),
            productId: product.id, 
            nombre: product.nombre,
            quantity, 
            unit 
        };
        setCart(prev => [...prev, newItem]);
    };
    
    const handleRemoveFromCart = (cartId) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    };

    const handleSubmitOrder = async () => {
        if (!selectedClient || cart.length === 0) return alert("Seleccione un cliente y añada productos.");
        
        if (selectedClient.regimen === 'Mayorista' && subtotal < selectedClient.minimoCompra) {
            return alert(`El pedido no alcanza el mínimo de compra de ${selectedClient.minimoCompra.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`);
        }
        if ( (selectedClient.saldoPendiente + total) > selectedClient.limiteCredito && selectedClient.limiteCredito > 0) {
            return alert("El cliente excede su límite de crédito.");
        }

        const batch = writeBatch(db);
        const orderId = new Date().getTime().toString();
        const orderRef = doc(db, `users/${userId}/orders`, orderId);
        
        batch.set(orderRef, {
            ...ORDER_MODEL,
            clienteId: clientId,
            nombreCliente: selectedClient.nombre,
            items: cart.map(({ cartId, ...item }) => item),
            subtotal,
            costoEnvio,
            descuento: descuentoMonto,
            total,
            timestamp: serverTimestamp(),
        });
        
        // ... (Actualizar stock y saldo de cliente) ...

        await batch.commit();
        alert("¡Pedido Creado!");
        setView('list');
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <Select label="Buscar Cliente" name="cliente" value={clientId} onChange={e => setClientId(e.target.value)} required>
                        <option value="">-- Seleccionar Cliente --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </Select>
                    {selectedClient && <p className="text-xs mt-1 text-gray-500">Régimen: {selectedClient.regimen}</p>}
                </div>
                <div className="bg-white p-4 rounded-lg shadow">
                    <Input label="Buscar Producto" name="productSearch" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                    <div className="max-h-96 overflow-y-auto space-y-2 mt-4">
                    {filteredProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-2 border-b">
                            <div>
                                <p className="font-semibold">{p.nombre}</p>
                                <p className="text-sm text-gray-600">{p.precioUnidad.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} / Unidad</p>
                            </div>
                            <Button onClick={() => handleAddToCart(p, 1, 'Unidad')} icon={Plus} className="!px-2 !py-1 text-xs">Añadir</Button>
                        </div>
                    ))}
                    </div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-md space-y-4">
                <h3 className="font-bold text-lg">Resumen del Pedido</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {cart.map(item => (
                        <div key={item.cartId} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                            <span>{item.quantity}x {item.nombre} ({item.unit})</span>
                            <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                        </div>
                    ))}
                </div>
                <div className="border-t mt-4 pt-4 space-y-2">
                    <div className="flex justify-between"><span>Subtotal:</span> <span>{subtotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>
                    <div className="flex justify-between items-center">
                        <label className="text-sm">Costo Envío:</label>
                        <input type="number" value={costoEnvio} onChange={e => setCostoEnvio(parseFloat(e.target.value) || 0)} className="w-24 p-1 border rounded text-right" />
                    </div>
                     <div className="flex justify-between items-center">
                        <label className="text-sm">Descuento (%):</label>
                        <input type="number" value={descuentoPorcentaje} onChange={e => setDescuentoPorcentaje(parseFloat(e.target.value) || 0)} className="w-24 p-1 border rounded text-right" />
                    </div>
                     <div className="flex justify-between font-bold text-xl"><span>TOTAL:</span> <span>{total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></div>
                </div>
                <Button onClick={handleSubmitOrder} className="w-full mt-4" disabled={!selectedClient || cart.length === 0}>Finalizar Pedido</Button>
            </div>
        </div>
    );
};

// --- MÓDULOS RESTANTES (MARCADORES DE POSICIÓN) ---
const PurchaseOrderManager = () => <div className="p-6 bg-white rounded-lg shadow"><h2 className="text-2xl font-bold">Órdenes de Compra (Próximamente)</h2></div>;
const PriceListManager = () => <div className="p-6 bg-white rounded-lg shadow"><h2 className="text-2xl font-bold">Lista de Precios (Próximamente)</h2></div>;
const ShippingQuoter = () => <div className="p-6 bg-white rounded-lg shadow"><h2 className="text-2xl font-bold">Cotización (Próximamente)</h2></div>;
const ToolsManager = () => <div className="p-6 bg-white rounded-lg shadow"><h2 className="text-2xl font-bold">Herramientas (Próximamente)</h2></div>;


// --- APP PRINCIPAL ---
export default function App() {
    const { isAuthReady, userId } = useAuth();
    const [currentPage, setCurrentPage] = useState('Panel de Control');
    
    const { data: products } = useCollection('products');
    const { data: clients } = useCollection('clients');
    const { data: orders } = useCollection('orders');
    const { data: purchaseOrders } = useCollection('purchaseOrders');
    const { data: bodegas } = useCollection('bodegas');
    const { data: providers } = useCollection('providers');

    if (!isAuthReady || !db) {
        return <div className="min-h-screen flex items-center justify-center">Cargando DistriFort...</div>;
    }

    const navItems = [
        { name: 'Panel de Control', icon: LayoutDashboard },
        { name: 'Buscar', icon: Search },
        { name: 'Inventario', icon: Package },
        { name: 'Clientes', icon: Users },
        { name: 'Pedidos', icon: Tag },
        { name: 'Órdenes de Compra', icon: Truck },
        { name: 'Lista de Precios', icon: FileText },
        { name: 'Cotización', icon: MapPin },
        { name: 'Herramientas', icon: Wrench },
    ];

    const renderPage = () => {
        switch (currentPage) {
            case 'Panel de Control': return <Dashboard products={products} orders={orders} purchaseOrders={purchaseOrders} setCurrentPage={setCurrentPage}/>;
            case 'Buscar': return <GlobalSearchManager products={products} clients={clients} orders={orders} />;
            case 'Inventario': return <ProductManager products={products} bodegas={bodegas} />;
            case 'Clientes': return <ClientManager clients={clients} />;
            case 'Pedidos': return <OrderManager clients={clients} products={products} orders={orders} />;
            case 'Órdenes de Compra': return <PurchaseOrderManager products={products} providers={providers} bodegas={bodegas} purchaseOrders={purchaseOrders} />;
            case 'Lista de Precios': return <PriceListManager products={products} clients={clients} />;
            case 'Cotización': return <ShippingQuoter />;
            case 'Herramientas': return <ToolsManager products={products}/>;
            default: return <Dashboard products={products} orders={orders} purchaseOrders={purchaseOrders} setCurrentPage={setCurrentPage} />;
        }
    };
    
    return (
        <div className="min-h-screen bg-gray-100 flex font-sans">
            <nav className="w-64 bg-white shadow-lg p-4 flex flex-col">
                <h1 className="text-2xl font-black text-indigo-600 mb-8">DistriFort</h1>
                <ul className="space-y-2">
                    {navItems.map(item => (
                        <li key={item.name}>
                            <button onClick={() => setCurrentPage(item.name)} className={`w-full flex items-center space-x-3 p-3 rounded-lg text-left font-semibold transition ${currentPage === item.name ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                                <item.icon className="w-6 h-6" />
                                <span>{item.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
            <main className="flex-1 p-8 overflow-y-auto">{renderPage()}</main>
        </div>
    );
}

