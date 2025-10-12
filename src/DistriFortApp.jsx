import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Box,
  FileText,
  LayoutDashboard,
  Package,
  Truck,
  Plus,
  ShoppingCart,
  DollarSign, // Para la inversión
  ArrowUpCircle, // Para la ganancia
  Zap,
} from 'lucide-react';

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

  // Simulación: Carga los datos inmediatamente (vacíos)
  useEffect(() => {
    setData(collections[collectionName] || []);
    setLoading(false);
  }, [collectionName, collections]);

  return { data, loading };
};
// --- FIN SIMULACIÓN DE FIREBASE ---

// --- COMPONENTES GENÉRICOS DE INTERFAZ ---

const Card = ({ title, value, icon: Icon, color = 'indigo' }) => (
  <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100 transition duration-300 hover:shadow-xl hover:scale-[1.02] transform">
    <div className={`flex items-center justify-between`}>
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <Icon className={`w-6 h-6 text-${color}-500`} />
    </div>
    <p className="text-3xl font-bold mt-1 text-gray-800">{value}</p>
  </div>
);

const Button = ({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800 shadow-lg'} ${className}`}
  >
    {Icon && <Icon className="w-5 h-5" />}
    <span>{children}</span>
  </button>
);

// --- COMPONENTE DASHBOARD (Modificado) ---

const Dashboard = () => {
  // --- MOCK DE DATOS DEL BI (Valores iniciales en 0 / $0) ---
  const mockMetrics = useMemo(() => {
    const inversionMes = 0; // Inversión inicial en 0
    const gananciaBrutaMes = 0; // Ganancia inicial en 0
    const lowStockCount = 0;
    const totalClients = 0;

    return {
      inversionMes: inversionMes,
      gananciaBrutaMes: gananciaBrutaMes,
      lowStockCount,
      totalClients,
    };
  }, []);

  // Formateo para las cards del Dashboard
  const formatCurrency = (value, isNegativeRed = false) => {
    const formatted = value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 });
    // Estilo para negativo
    if (isNegativeRed && value < 0) {
      return <span className='text-red-600'>{formatted}</span>;
    }
    return formatted;
  };

  const LowStockAlerts = () => (
    <div className="bg-white p-4 rounded-xl shadow-lg border border-red-100 mt-4">
      <h3 className="text-lg font-bold text-red-600 mb-3 flex items-center space-x-2">
        <Zap className="w-5 h-5" />
        <span>Alertas de Stock Crítico ({mockMetrics.lowStockCount})</span>
      </h3>
      <p className="text-sm text-gray-500 flex items-center"><ArrowUpCircle className='w-4 h-4 mr-2 text-green-500'/>¡Inventario en orden! (Simulación)</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold text-gray-800">Dashboard de DistriFort (Simulación)</h2>

      {/* Tarjetas de Métricas Principales */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Item 1: Inversión Total por Mes (puede ser Negativa si es Salida de Caja) */}
        <Card
          title="Inversión/Gasto Mes"
          value={formatCurrency(mockMetrics.inversionMes, true)}
          icon={DollarSign}
          color={mockMetrics.inversionMes < 0 ? 'red' : 'green'}
        />

        {/* Item 2: Ganancia Bruta Mes (Puede ser Baja) */}
        <Card
          title="Ganancia Bruta Mes"
          value={formatCurrency(mockMetrics.gananciaBrutaMes)}
          icon={ArrowUpCircle}
          color={mockMetrics.gananciaBrutaMes > 0 ? 'green' : 'gray'}
        />

        {/* Items originales ajustados a la simulación */}
        <Card title="Clientes Activos" value={mockMetrics.totalClients} icon={Users} color="indigo" />
        <Card title="Stock Crítico" value={mockMetrics.lowStockCount} icon={Zap} color="red" />
      </div>

      <LowStockAlerts />

      {/* SECCIÓN: ACCIONES RÁPIDAS */}
      <div className="bg-white p-4 rounded-xl shadow-lg border border-indigo-200 flex flex-col sm:flex-row justify-between items-center space-y-3 sm:space-y-0">
        <p className="text-lg font-bold text-indigo-700">Acciones Rápidas:</p>
        <div className='flex space-x-3'>
          <Button icon={Plus} className="bg-indigo-500 hover:bg-indigo-600">
            Añadir Producto
          </Button>
          <Button icon={ShoppingCart} className="bg-green-500 hover:bg-green-600">
            Nuevo Pedido
          </Button>
        </div>
      </div>
      
      {/* Gráfico de Volumen (Simulación Simple) */}
      <div className="bg-white p-4 rounded-xl shadow-md border border-gray-100">
        <h3 className="text-lg font-semibold mb-3">Volumen de Venta por Especie (Simulación)</h3>
        <div className="h-48 flex items-end justify-around p-2 text-xs">
          {['Vino', 'Cerveza', 'Gaseosa', 'Agua'].map((specie, index) => (
            <div key={specie} className="flex flex-col items-center">
              <div
                className={`w-10 rounded-t-lg bg-indigo-500 transition-all duration-700 hover:bg-indigo-700`}
                style={{ height: `${(index + 1) * 20 + 30}px` }}
              ></div>
              <span className="mt-1 font-medium text-gray-700">{specie}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTE PRINCIPAL DE LA APLICACIÓN ---

const DistriFortApp = () => {
    // Si bien este componente es la aplicación en sí, simulamos la carga de datos de las colecciones
    const { data: products } = useFirestore('productos');
    const { data: clients } = useFirestore('clientes');
    const { data: orders } = useFirestore('pedidos');
    
    // Aquí iría el sistema de navegación si tuvieras más componentes (Products, Clients, etc.)
    // Pero como solo tenemos el Dashboard, lo renderizamos directamente.

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="flex justify-between items-center p-4 bg-white border-b sticky top-0 z-10 shadow-lg">
                <h1 className="text-3xl font-black text-indigo-700">DistriFort</h1>
                <div className="flex space-x-3">
                    {/* Botones de navegación simulados */}
                    <Button icon={LayoutDashboard} className="bg-indigo-600">BI</Button>
                    <Button icon={Package} className="bg-gray-500 hover:bg-gray-600">Productos</Button>
                </div>
            </header>
            <main className="p-4 sm:p-6 pb-20">
                <Dashboard products={products} clients={clients} orders={orders} />
            </main>
            <footer className="fixed bottom-0 w-full p-2 bg-gray-100 text-center text-xs text-gray-500 border-t">
                <p>&copy; {new Date().getFullYear()} DistriFort Logística | Simulación de UI Vercel.</p>
            </footer>
        </div>
    );
};

export default DistriFortApp;
