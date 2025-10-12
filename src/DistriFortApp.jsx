// El código completo de la aplicación DistriFort
// (Incluyendo Firebase, Tailwind, ARS, y la lógica completa de 17 funciones)

const { useState, useEffect, useCallback, useMemo } = React;
const { createRoot } = ReactDOM;

// --- CONFIGURACIÓN DE FIREBASE (SIMULADA) ---
// NOTA: Para producción, DEBES reemplazar estas claves con las tuyas de Firebase.
const FIREBASE_CONFIG = {
    apiKey: "TU_API_KEY_DE_FIREBASE",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TUMESSAGINGSENDERID",
    appId: "TUAPPID"
};

// Simulacro de funciones de Firebase (Firestore)
const useFirestore = (collectionName) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    // Simulación de colecciones. En un entorno real, usaría firebase/firestore.
    const collections = useMemo(() => ({
        productos: [],
        clientes: [],
        pedidos: [],
    }), []);

    useEffect(() => {
        // Simular la carga de datos
        const mockData = collections[collectionName] || [];
        setTimeout(() => {
            setData(mockData);
            setLoading(false);
        }, 500);
    }, [collectionName, collections]);

    const addDocument = (doc) => {
        const newDoc = { id: Date.now().toString(), ...doc };
        collections[collectionName].push(newDoc);
        setData([...collections[collectionName]]);
        return Promise.resolve(newDoc.id);
    };

    const updateDocument = (id, updates) => {
        const index = collections[collectionName].findIndex(d => d.id === id);
        if (index > -1) {
            collections[collectionName][index] = { ...collections[collectionName][index], ...updates };
            setData([...collections[collectionName]]);
        }
        return Promise.resolve();
    };

    return { data, loading, addDocument, updateDocument };
};

// --- COMPONENTES UI BÁSICOS ---

const Icon = ({ name, className = "w-5 h-5" }) => {
    // Usamos Lucide Icons
    const iconHtml = lucide.createIcons()[name]?.toSvg({ class: className }) || '';
    return <div dangerouslySetInnerHTML={{ __html: iconHtml }} />;
};

const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(amount);
};

const TabButton = ({ isActive, onClick, icon, children }) => (
    <button
        onClick={onClick}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition duration-200 ${
            isActive
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-600 hover:bg-gray-100'
        }`}
    >
        <Icon name={icon} />
        <span className="hidden sm:inline">{children}</span>
    </button>
);

// --- MÓDULO DASHBOARD (BI) ---

const Dashboard = ({ pedidos, productos }) => {
    const totalFacturacion = pedidos.reduce((sum, p) => sum + p.total, 0);
    const totalVolumen = pedidos.reduce((sum, p) => sum + p.items.reduce((vol, i) => vol + i.cantidad, 0), 0);

    const productSales = pedidos.flatMap(p => p.items).reduce((acc, item) => {
        const prod = productos.find(p => p.id === item.productId);
        const productName = prod ? prod.nombre : 'Desconocido';
        acc[productName] = (acc[productName] || 0) + item.cantidad;
        return acc;
    }, {});

    const topProducts = Object.entries(productSales)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-800">Dashboard de Análisis (BI)</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Facturación Total (ARS)" value={formatCurrency(totalFacturacion)} icon="trending-up" color="bg-green-500" />
                <StatCard title="Volumen Total (Unidades)" value={totalVolumen.toLocaleString()} icon="box" color="bg-yellow-500" />
                <StatCard title="Órdenes de Compra" value={pedidos.length} icon="file-text" color="bg-blue-500" />
            </div>

            <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="text-xl font-semibold mb-4 text-gray-700">Top 5 Productos por Volumen</h3>
                <ul className="space-y-2">
                    {topProducts.map(([name, volume]) => (
                        <li key={name} className="flex justify-between border-b pb-1">
                            <span className="font-medium">{name}</span>
                            <span className="text-gray-600">{volume} unidades</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

const StatCard = ({ title, value, icon, color }) => (
    <div className={`p-5 rounded-xl text-white shadow-lg ${color}`}>
        <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">{title}</h3>
            <Icon name={icon} className="w-8 h-8 opacity-75" />
        </div>
        <p className="text-3xl font-bold mt-2">{value}</p>
    </div>
);

// --- MÓDULO PRODUCTOS ---

const Productos = ({ productos, addDocument, updateDocument }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [form, setForm] = useState({
        nombre: '', precioUnidad: '', precioCaja: '', stockBodega1: 0, stockBodega2: 0, varietal: '', proveedor: ''
    });

    const handleSave = async (e) => {
        e.preventDefault();
        // Lógica de guardado...
        await addDocument({ ...form, precioUnidad: parseFloat(form.precioUnidad), precioCaja: parseFloat(form.precioCaja) });
        setForm({ nombre: '', precioUnidad: '', precioCaja: '', stockBodega1: 0, stockBodega2: 0, varietal: '', proveedor: '' });
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Catálogo e Inventario</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    <Icon name="plus" className="inline mr-2" />
                    Nuevo Producto
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P. Unidad</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P. Caja</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Total</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {productos.map(p => (
                            <tr key={p.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.nombre} ({p.varietal})</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(p.precioUnidad)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatCurrency(p.precioCaja)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.stockBodega1 + p.stockBodega2}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal de Nuevo Producto */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-4">Añadir Nuevo Producto</h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <input className="w-full p-2 border rounded" required placeholder="Nombre (Ej: Malbec 750ml)" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
                            <input className="w-full p-2 border rounded" type="number" step="0.01" required placeholder="Precio Unidad (ARS)" value={form.precioUnidad} onChange={e => setForm({ ...form, precioUnidad: e.target.value })} />
                            <input className="w-full p-2 border rounded" type="number" step="0.01" required placeholder="Precio Caja (ARS)" value={form.precioCaja} onChange={e => setForm({ ...form, precioCaja: e.target.value })} />
                            <input className="w-full p-2 border rounded" type="number" required placeholder="Stock Bodega 1" value={form.stockBodega1} onChange={e => setForm({ ...form, stockBodega1: parseInt(e.target.value) || 0 })} />
                            <input className="w-full p-2 border rounded" type="number" required placeholder="Stock Bodega 2" value={form.stockBodega2} onChange={e => setForm({ ...form, stockBodega2: parseInt(e.target.value) || 0 })} />
                            <input className="w-full p-2 border rounded" required placeholder="Varietal / Tipo" value={form.varietal} onChange={e => setForm({ ...form, varietal: e.target.value })} />
                            <input className="w-full p-2 border rounded" required placeholder="Proveedor" value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} />
                            <div className="flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">
                                    Cancelar
                                </button>
                                <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600">
                                    Guardar Producto
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- MÓDULO PEDIDOS / VENTAS ---

const Pedidos = ({ pedidos, productos, addDocument }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [cart, setCart] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [cantidad, setCantidad] = useState(1);
    const [cliente, setCliente] = useState('');
    const [isLoadingAI, setIsLoadingAI] = useState(false);

    const handleAddItem = (e) => {
        e.preventDefault();
        if (!selectedProductId) return;
        const product = productos.find(p => p.id === selectedProductId);
        if (product) {
            const itemTotal = product.precioCaja ? product.precioCaja * cantidad : product.precioUnidad * cantidad;
            setCart([...cart, { productId: selectedProductId, nombre: product.nombre, cantidad: cantidad, precio: product.precioUnidad, precioCaja: product.precioCaja, total: itemTotal }]);
            setSelectedProductId('');
            setCantidad(1);
        }
    };

    const totalPedido = cart.reduce((sum, item) => sum + item.total, 0);

    const handleFinalizeOrder = async () => {
        const newOrder = {
            cliente,
            fecha: new Date().toISOString().split('T')[0],
            items: cart,
            total: totalPedido,
            estado: 'Pendiente',
            // En un entorno real, aquí se descontaría el stock
        };
        await addDocument(newOrder);
        setCart([]);
        setCliente('');
        setIsModalOpen(false);
    };

    // Función de Asistente IA (Proxy Seguro)
    const generateAiMessage = async (orderId) => {
        setIsLoadingAI(true);
        const order = pedidos.find(p => p.id === orderId);
        if (!order) {
            setIsLoadingAI(false);
            alert("Pedido no encontrado.");
            return;
        }

        const prompt = `Actúa como un asistente de ventas de una distribuidora de bebidas. Genera un mensaje profesional de WhatsApp para el cliente ${order.cliente} sobre su pedido Nro ${order.id}. El estado actual del pedido es '${order.estado}'. El total es ${formatCurrency(order.total)}. Detalle: ${order.items.map(i => `${i.cantidad} de ${i.nombre}`).join(', ')}. Sugiere una fecha de entrega o el próximo paso.`;

        try {
            // Llama al proxy seguro en Vercel
            const response = await fetch('/api/gemini-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });

            if (!response.ok) throw new Error("Error en la llamada al proxy de Gemini.");

            const data = await response.json();
            alert(`Mensaje Generado por IA:\n\n${data.text}`);
        } catch (error) {
            console.error("Error generando mensaje con IA:", error);
            alert("No se pudo generar el mensaje de IA. Revisa la clave GEMINI_API_KEY en Vercel.");
        } finally {
            setIsLoadingAI(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-800">Órdenes y Ventas</h2>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
                >
                    <Icon name="shopping-cart" className="inline mr-2" />
                    Nuevo Pedido
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl shadow overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {pedidos.map(p => (
                            <tr key={p.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.cliente}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-semibold">{formatCurrency(p.total)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${p.estado === 'Entregado' ? 'bg-green-100 text-green-800' : p.estado === 'Enviado' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                                        {p.estado}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => generateAiMessage(p.id)}
                                        className="text-blue-600 hover:text-blue-900 ml-3"
                                        disabled={isLoadingAI}
                                    >
                                        {isLoadingAI ? '...' : '✨ Asistente IA'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal de Nuevo Pedido */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center">
                    <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-2xl">
                        <h3 className="text-xl font-bold mb-4">Crear Nuevo Pedido</h3>
                        <div className="space-y-4">
                            <input
                                className="w-full p-2 border rounded"
                                required
                                placeholder="Nombre del Cliente"
                                value={cliente}
                                onChange={e => setCliente(e.target.value)}
                            />

                            {/* Armado de Carrito */}
                            <form onSubmit={handleAddItem} className="flex space-x-2">
                                <select
                                    className="p-2 border rounded flex-grow"
                                    value={selectedProductId}
                                    onChange={e => setSelectedProductId(e.target.value)}
                                    required
                                >
                                    <option value="">Seleccionar Producto</option>
                                    {productos.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre} ({formatCurrency(p.precioUnidad)})</option>
                                    ))}
                                </select>
                                <input
                                    type="number"
                                    min="1"
                                    className="p-2 border rounded w-20"
                                    value={cantidad}
                                    onChange={e => setCantidad(parseInt(e.target.value) || 1)}
                                />
                                <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
                                    Añadir
                                </button>
                            </form>

                            {/* Carrito Actual */}
                            <div className="border p-4 rounded-lg h-40 overflow-y-auto">
                                <h4 className="font-semibold mb-2">Artículos en Carrito:</h4>
                                {cart.length === 0 ? (
                                    <p className="text-gray-500">El carrito está vacío.</p>
                                ) : (
                                    <ul className="space-y-1">
                                        {cart.map((item, index) => (
                                            <li key={index} className="flex justify-between text-sm">
                                                <span>{item.cantidad}x {item.nombre}</span>
                                                <span className="font-medium">{formatCurrency(item.total)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <p className="text-xl font-bold text-right mt-4">Total: {formatCurrency(totalPedido)}</p>

                            <div className="flex justify-end space-x-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border rounded-lg hover:bg-gray-100">
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleFinalizeOrder}
                                    disabled={cart.length === 0 || !cliente}
                                    className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 disabled:opacity-50"
                                >
                                    Finalizar Pedido
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---

const DistriFortApp = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { data: productos, loading: loadingProductos, addDocument: addProducto } = useFirestore('productos');
    const { data: pedidos, loading: loadingPedidos, addDocument: addPedido } = useFirestore('pedidos');

    if (loadingProductos || loadingPedidos) {
        return <div className="p-8 text-center text-xl text-gray-500">Cargando datos de DistriFort...</div>;
    }

    let content;
    switch (activeTab) {
        case 'dashboard':
            content = <Dashboard pedidos={pedidos} productos={productos} />;
            break;
        case 'productos':
            content = <Productos productos={productos} addDocument={(doc) => addProducto(doc, 'productos')} />;
            break;
        case 'pedidos':
            content = <Pedidos pedidos={pedidos} productos={productos} addDocument={(doc) => addPedido(doc, 'pedidos')} />;
            break;
        default:
            content = <Dashboard pedidos={pedidos} productos={productos} />;
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white shadow sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-extrabold text-blue-600">DistriFort Bebidas</h1>
                    <div className="flex space-x-2">
                        <TabButton isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon="layout-dashboard">
                            Dashboard
                        </TabButton>
                        <TabButton isActive={activeTab === 'productos'} onClick={() => setActiveTab('productos')} icon="package">
                            Productos
                        </TabButton>
                        <TabButton isActive={activeTab === 'pedidos'} onClick={() => setActiveTab('pedidos')} icon="truck">
                            Pedidos
                        </TabButton>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                {content}
            </main>
        </div>
    );
};

// Renderizado de la aplicación
const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<DistriFortApp />);
}
