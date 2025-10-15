import React, { useState, useMemo } from 'react';
// Asumimos que los hooks y componentes genéricos (useData, PageHeader, Input, etc.) 
// están disponibles globalmente o se importan desde archivos superiores.
import { Search, Package, Users, ShoppingCart } from 'lucide-react';

/* * NOTA: Este código asume que tienes acceso a:
 * - useData (para obtener products, clients, orders)
 * - PageHeader, Input, Card (Componentes de UI genéricos)
 */

// Función de utilidad para formatear texto y hacerlo más legible
const formatResultText = (text) => {
    if (!text) return 'N/A';
    // Limita la longitud del texto
    return text.length > 50 ? text.substring(0, 47) + '...' : text;
};

const GlobalSearch = () => {
    // Obtenemos todos los datos desde el Contexto
    const { products, clients, orders } = useData();
    const [searchTerm, setSearchTerm] = useState('');

    // Utilizamos useMemo para realizar el filtrado de forma eficiente
    const results = useMemo(() => {
        if (!searchTerm || searchTerm.length < 2) {
            return { products: [], clients: [], orders: [] };
        }

        const lowerTerm = searchTerm.toLowerCase();

        // Filtro de Productos
        const productResults = products.filter(p =>
            p.nombre.toLowerCase().includes(lowerTerm) ||
            p.marca.toLowerCase().includes(lowerTerm)
        ).slice(0, 5); // Limitar a 5 resultados

        // Filtro de Clientes
        const clientResults = clients.filter(c =>
            c.nombre.toLowerCase().includes(lowerTerm) ||
            c.cuit.includes(lowerTerm) ||
            c.telefono.includes(lowerTerm)
        ).slice(0, 5);

        // Filtro de Pedidos (Buscamos por ID de pedido o nombre del cliente)
        const orderResults = orders.filter(o =>
            o.nombreCliente.toLowerCase().includes(lowerTerm) ||
            o.numeroPedido?.includes(lowerTerm)
        ).slice(0, 5);

        return { products: productResults, clients: clientResults, orders: orderResults };
    }, [searchTerm, products, clients, orders]);
    
    const hasResults = Object.values(results).some(arr => arr.length > 0);

    // --- COMPONENTES INTERNOS DE RESULTADOS ---

    const ResultList = ({ title, icon: Icon, data, itemFormatter, labelKey, type }) => (
        <div className="bg-white p-5 rounded-xl shadow-md border border-gray-100 space-y-3">
            <h3 className="text-lg font-bold text-indigo-600 flex items-center space-x-2 border-b pb-2">
                <Icon className="w-5 h-5" /> <span>{title} ({data.length})</span>
            </h3>
            <ul className="space-y-2">
                {data.map(item => (
                    <li key={item.id} className="p-3 bg-gray-50 hover:bg-indigo-50 rounded-lg transition border border-gray-100 cursor-pointer">
                        <p className="font-semibold text-sm">{formatResultText(item[labelKey])}</p>
                        <p className="text-xs text-gray-500">{itemFormatter(item)}</p>
                    </li>
                ))}
            </ul>
        </div>
    );

    // --- RENDERIZADO PRINCIPAL ---
    return (
        <div className="space-y-6">
            <PageHeader title="Búsqueda Global" />
            
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <Input 
                    label="Buscar en Productos, Clientes y Pedidos" 
                    name="globalSearch" 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    placeholder="Escriba un nombre, marca, teléfono o N° de pedido..."
                    icon={Search}
                />
            </div>

            {/* Muestra los resultados */}
            {searchTerm.length > 1 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    <ResultList
                        title="Productos"
                        icon={Package}
                        data={results.products}
                        labelKey="nombre"
                        itemFormatter={item => `Marca: ${item.marca} | Stock: ${item.stockTotal}`}
                    />

                    <ResultList
                        title="Clientes"
                        icon={Users}
                        data={results.clients}
                        labelKey="nombre"
                        itemFormatter={item => `Teléfono: ${item.telefono} | Saldo Pendiente: ${item.saldoPendiente.toLocaleString('es-AR', { style: 'currency', currency: 'ARS'})}`}
                    />

                    <ResultList
                        title="Pedidos"
                        icon={ShoppingCart}
                        data={results.orders}
                        labelKey="nombreCliente"
                        itemFormatter={item => `N° Pedido: ${item.numeroPedido || item.id.slice(0, 6)} | Total: ${item.total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS'})}`}
                    />
                </div>
            )}
            
            {/* Mensaje de No Resultados */}
            {searchTerm.length > 1 && !hasResults && (
                <div className="text-center p-10 bg-white rounded-xl shadow-lg">
                    <p className="text-xl text-gray-500">No se encontraron resultados para "{searchTerm}"</p>
                </div>
            )}
            
            {/* Mensaje de Sugerencia */}
            {searchTerm.length < 2 && (
                <div className="text-center p-10 bg-white rounded-xl shadow-lg">
                    <p className="text-xl text-gray-500">Escriba al menos 2 caracteres para iniciar la búsqueda...</p>
                </div>
            )}

        </div>
    );
};
