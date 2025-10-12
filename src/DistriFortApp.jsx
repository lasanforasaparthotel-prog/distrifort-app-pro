import React, { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Box,
  FileText,
  LayoutDashboard,
  Package,
  Truck,
  Plus,
  ShoppingCart,
} from "lucide-react";

// --- SIMULACIÓN DE FIREBASE (para desarrollo) ---
const useFirestore = (collectionName) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const collections = useMemo(
    () => ({
      productos: [],
      pedidos: [],
      clientes: [],
    }),
    []
  );

  useEffect(() => {
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
    const index = collections[collectionName].findIndex((d) => d.id === id);
    if (index > -1) {
      collections[collectionName][index] = {
        ...collections[collectionName][index],
        ...updates,
      };
      setData([...collections[collectionName]]);
    }
    return Promise.resolve();
  };

  return { data, loading, addDocument, updateDocument };
};

// --- UTILIDADES ---
const formatCurrency = (amount) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(amount);

const Icon = ({ name, className = "w-5 h-5" }) => {
  const icons = {
    "trending-up": <TrendingUp className={className} />,
    box: <Box className={className} />,
    "file-text": <FileText className={className} />,
    "layout-dashboard": <LayoutDashboard className={className} />,
    package: <Package className={className} />,
    truck: <Truck className={className} />,
    plus: <Plus className={className} />,
    "shopping-cart": <ShoppingCart className={className} />,
  };
  return icons[name] || null;
};

const TabButton = ({ isActive, onClick, icon, children }) => (
  <button
    onClick={onClick}
    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition duration-200 ${
      isActive
        ? "bg-blue-600 text-white shadow-md"
        : "text-gray-600 hover:bg-gray-100"
    }`}
  >
    <Icon name={icon} />
    <span className="hidden sm:inline">{children}</span>
  </button>
);

// --- DASHBOARD ---
const StatCard = ({ title, value, icon, color }) => (
  <div className={`p-5 rounded-xl text-white shadow-lg ${color}`}>
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-medium">{title}</h3>
      <Icon name={icon} className="w-8 h-8 opacity-75" />
    </div>
    <p className="text-3xl font-bold mt-2">{value}</p>
  </div>
);

const Dashboard = ({ pedidos, productos }) => {
  const totalFacturacion = pedidos.reduce((sum, p) => sum + p.total, 0);
  const totalVolumen = pedidos.reduce(
    (sum, p) => sum + p.items.reduce((v, i) => v + i.cantidad, 0),
    0
  );

  const productSales = pedidos
    .flatMap((p) => p.items)
    .reduce((acc, item) => {
      const prod = productos.find((p) => p.id === item.productId);
      const productName = prod ? prod.nombre : "Desconocido";
      acc[productName] = (acc[productName] || 0) + item.cantidad;
      return acc;
    }, {});

  const topProducts = Object.entries(productSales)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">
        Dashboard de Análisis (BI)
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Facturación Total (ARS)"
          value={formatCurrency(totalFacturacion)}
          icon="trending-up"
          color="bg-green-500"
        />
        <StatCard
          title="Volumen Total (Unidades)"
          value={totalVolumen.toLocaleString()}
          icon="box"
          color="bg-yellow-500"
        />
        <StatCard
          title="Órdenes de Compra"
          value={pedidos.length}
          icon="file-text"
          color="bg-blue-500"
        />
      </div>

      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="text-xl font-semibold mb-4 text-gray-700">
          Top 5 Productos por Volumen
        </h3>
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

// --- PRODUCTOS ---
const Productos = ({ productos, addDocument }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    precioUnidad: "",
    precioCaja: "",
    stockBodega1: 0,
    stockBodega2: 0,
    varietal: "",
    proveedor: "",
  });

  const handleSave = async (e) => {
    e.preventDefault();
    await addDocument({
      ...form,
      precioUnidad: parseFloat(form.precioUnidad),
      precioCaja: parseFloat(form.precioCaja),
    });
    setForm({
      nombre: "",
      precioUnidad: "",
      precioCaja: "",
      stockBodega1: 0,
      stockBodega2: 0,
      varietal: "",
      proveedor: "",
    });
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">
          Catálogo e Inventario
        </h2>
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Producto
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                P. Unidad
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                P. Caja
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {productos.map((p) => (
              <tr key={p.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {p.nombre} ({p.varietal})
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatCurrency(p.precioUnidad)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatCurrency(p.precioCaja)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {p.stockBodega1 + p.stockBodega2}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
            <h3 className="text-xl font-bold mb-4">Añadir Nuevo Producto</h3>
            <form onSubmit={handleSave} className="space-y-4">
              {[
                ["nombre", "Nombre (Ej: Malbec 750ml)"],
                ["precioUnidad", "Precio Unidad (ARS)"],
                ["precioCaja", "Precio Caja (ARS)"],
                ["stockBodega1", "Stock Bodega 1"],
                ["stockBodega2", "Stock Bodega 2"],
                ["varietal", "Varietal / Tipo"],
                ["proveedor", "Proveedor"],
              ].map(([field, placeholder]) => (
                <input
                  key={field}
                  className="w-full p-2 border rounded"
                  required
                  placeholder={placeholder}
                  type={field.includes("precio") || field.includes("stock") ? "number" : "text"}
                  step="0.01"
                  value={form[field]}
                  onChange={(e) =>
                    setForm({ ...form, [field]: e.target.value })
                  }
                />
              ))}
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600"
                >
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

// --- COMPONENTE PRINCIPAL ---
const DistriFortApp = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { data: productos, loading: loadingProductos, addDocument: addProducto } =
    useFirestore("productos");
  const { data: pedidos, loading: loadingPedidos, addDocument: addPedido } =
    useFirestore("pedidos");

  if (loadingProductos || loadingPedidos) {
    return (
      <div className="p-8 text-center text-xl text-gray-500">
        Cargando datos de DistriFort...
      </div>
    );
  }

  let content;
  if (activeTab === "dashboard")
    content = <Dashboard pedidos={pedidos} productos={productos} />;
  if (activeTab === "productos")
    content = <Productos productos={productos} addDocument={addProducto} />;
  if (activeTab === "pedidos")
    content = <div className="text-gray-600">Módulo de pedidos en desarrollo.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-extrabold text-blue-600">
            DistriFort Bebidas
          </h1>
          <div className="flex space-x-2">
            <TabButton
              isActive={activeTab === "dashboard"}
              onClick={() => setActiveTab("dashboard")}
              icon="layout-dashboard"
            >
              Dashboard
            </TabButton>
            <TabButton
              isActive={activeTab === "productos"}
              onClick={() => setActiveTab("productos")}
              icon="package"
            >
              Productos
            </TabButton>
            <TabButton
              isActive={activeTab === "pedidos"}
              onClick={() => setActiveTab("pedidos")}
              icon="truck"
            >
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

export default DistriFortApp;
