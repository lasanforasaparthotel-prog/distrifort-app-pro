import React, { useMemo } from 'react';
// Asumimos que los hooks y componentes genéricos están disponibles globalmente.
import { 
    LayoutDashboard, DollarSign, Users, AlertCircle, TrendingUp, TrendingDown 
} from 'lucide-react'; 

/* * NOTA: Este código asume que tienes acceso a:
 * - useData (para obtener products, orders, clients)
 * - Card, PageHeader (Componentes de UI genéricos)
 * - getPriceText (utilidad de formateo de moneda)
 */

const Dashboard = ({ setCurrentPage }) => {
    const { products, orders, clients } = useData();

    // Utilidad de formateo de moneda (debe estar disponible globalmente)
    const getPriceText = (price) => price.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });


    // --- CÁLCULOS PRINCIPALES DE MÉTRICAS ---
    const { totalRevenue, totalCost, totalProfit } = useMemo(() => {
        let revenue = 0;
        let cost = 0;

        orders.forEach(order => {
            revenue += parseFloat(order.total || 0); // Total de venta
            
            // Calculamos el costo de los bienes vendidos (COGS)
            order.items.forEach(item => {
                const product = products.find(p => p.id === item.productId);
                if (product) {
                    // Usamos el costo actual del producto para estimar
                    const units = item.unit === 'Caja' ? item.quantity * (product.udsPorCaja || 1) : item.quantity;
                    cost += units * parseFloat(product.costo || 0);
                }
            });
        });

        return {
            totalRevenue: revenue,
            totalCost: cost,
            totalProfit: revenue - cost,
        };
    }, [orders, products]);

    const lowStockCount = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo).length, [products]);
    const activeClientsCount = useMemo(() => clients.filter(c => !c.archivado).length, [clients]);
    const pendingOrdersCount = useMemo(() => orders.filter(o => o.estado === 'Pendiente').length, [orders]);


    // --- RENDERIZADO ---
    return (
        <div className="space-y-8">
            <PageHeader title="Panel de Control Principal" />
            
            {/* Sección de Métricas Financieras */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                <Card 
                    title="Ingresos Totales (Ventas)" 
                    value={getPriceText(totalRevenue)} 
                    icon={DollarSign} 
                    color="green"
                    onClick={() => setCurrentPage('Pedidos')} 
                />
                <Card 
                    title="Ganancia Bruta Estimada" 
                    value={getPriceText(totalProfit)} 
                    icon={totalProfit >= 0 ? TrendingUp : TrendingDown} 
                    color={totalProfit >= 0 ? 'green' : 'red'} 
                />
                <Card 
                    title="Clientes con Saldo Pendiente" 
                    value={clients.filter(c => c.saldoPendiente > 0).length} 
                    icon={Users} 
                    color="yellow"
                    onClick={() => setCurrentPage('Clientes')}
                />
            </div>

            {/* Sección de Métricas Operativas */}
            <h3 className="text-xl font-bold text-gray-800 border-b pb-2">Operaciones y Stock</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
                <Card 
                    title="Productos con Stock Bajo" 
                    value={lowStockCount} 
                    icon={AlertCircle} 
                    color="red" 
                    onClick={() => setCurrentPage('Inventario')} 
                />
                 <Card 
                    title="Órdenes de Compra Pendientes" 
                    value={pendingOrdersCount} 
                    icon={Truck} 
                    color="indigo"
                    onClick={() => setCurrentPage('Órdenes de Compra')} 
                />
                <Card 
                    title="Total de Clientes Activos" 
                    value={activeClientsCount} 
                    icon={Users} 
                    color="blue" 
                    onClick={() => setCurrentPage('Clientes')}
                />
            </div>
            
            {/* Aquí se pueden añadir gráficos o tendencias futuras */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                <h4 className="font-semibold text-lg text-gray-700">Tendencias de Venta (Simulación)</h4>
                <p className='text-gray-500 mt-2'>*Los gráficos de tendencias requieren una librería de charting (ej: Recharts/D3) para visualizar aquí.</p>
            </div>

        </div>
    );
};
