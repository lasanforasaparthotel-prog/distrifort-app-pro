const OrderManager = ({ setCurrentPage }) => {
    const { clients, products, orders, createOrUpdateDoc, archiveDoc } = useData();
    const [view, setView] = useState('list'); // 'list' o 'creator'

    const getPriceText = (price) => price.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
    const getStatusStyle = (estado) => {
        switch (estado) {
            case 'Pendiente': return 'bg-yellow-100 text-yellow-800';
            case 'Enviado': return 'bg-blue-100 text-blue-800';
            case 'Entregado': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <PageHeader title="Gestión de Pedidos" />
                <Button 
                    onClick={() => setView(view === 'list' ? 'creator' : 'list')} 
                    icon={view === 'list' ? Plus : List}
                >
                    {view === 'list' ? 'Nuevo Pedido' : 'Ver Historial'}
                </Button>
            </div>

            {view === 'list' ? (
                <OrderList 
                    orders={orders} 
                    archiveDoc={archiveDoc}
                    getPriceText={getPriceText} 
                    getStatusStyle={getStatusStyle}
                />
            ) : (
                <OrderCreator 
                    clients={clients} 
                    products={products} 
                    setView={setView} 
                    createOrUpdateDoc={createOrUpdateDoc}
                />
            )}
        </div>
    );
};

const OrderList = ({ orders, archiveDoc, getPriceText, getStatusStyle }) => {
    
    const generateWhatsAppLink = (order) => {
        const client = orders.find(o => o.id === order.id);
        if (!client || !client.telefono) return "Cliente sin teléfono";

        const itemsList = order.items.map(item => 
            `* ${item.quantity} ${item.unit} de ${item.nombre} - ${getPriceText(item.priceAtSale)} c/u`
        ).join('\n');

        const message = `¡Hola ${order.nombreCliente}!\n\n`
            + `Te enviamos el resumen de tu pedido (#${order.numeroPedido || order.id.slice(0, 5)}):\n`
            + `-------------------------\n`
            + `${itemsList}\n`
            + `-------------------------\n`
            + `Subtotal: ${getPriceText(order.subtotal)}\n`
            + `Costo Envío: ${getPriceText(order.costoEnvio)}\n`
            + `Descuento: ${getPriceText(order.descuento)}\n`
            + `*TOTAL FINAL: ${getPriceText(order.total)}*\n\n`
            + `¡Muchas gracias por tu compra!`;
        
        return `https://wa.me/${client.telefono}?text=${encodeURIComponent(message)}`;
    };

    const handleArchive = (id) => {
        // Implementar Modal/Confirmación en lugar de alert/window.confirm
        alert("Función de archivado simulada. Reemplazar con Modal de confirmación.");
        // archiveDoc('orders', id);
    };

    return (
        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {(orders || []).map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap font-semibold">{o.nombreCliente}</td>
                            <td className="px-6 py-4 whitespace-nowrap">{(o.timestamp?.toDate() || new Date()).toLocaleDateString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-700">{getPriceText(o.total || 0)}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusStyle(o.estado)}`}>
                                    {o.estado}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                <a 
                                    href={generateWhatsAppLink(o)} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center !p-2 !bg-green-500 hover:!bg-green-600 rounded-lg text-white transition"
                                >
                                    <Send className="w-4 h-4"/>
                                </a>
                                <Button onClick={() => handleArchive(o.id)} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4"/></Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const OrderCreator = ({ clients, products, setView, createOrUpdateDoc }) => {
    const [cart, setCart] = useState([]);
    const [clientId, setClientId] = useState('');
    const [costoEnvio, setCostoEnvio] = useState(0);
    const [descuentoPorcentaje, setDescuentoPorcentaje] = useState(0);
    const [productSearch, setProductSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const selectedClient = useMemo(() => clients.find(c => c.id === clientId), [clients, clientId]);
    
    const filteredProducts = useMemo(() => {
        if (!productSearch) return products;
        return products.filter(p => p.nombre.toLowerCase().includes(productSearch.toLowerCase()));
    }, [products, productSearch]);

    const { subtotal, descuentoMonto, total } = useMemo(() => {
        let sub = 0;
        cart.forEach(item => {
            const product = products.find(p => p.id === item.productId);
            if (!product) return;

            // Lógica de precios: Mayorista con precio por caja vs Minorista/Unidad
            const price = selectedClient?.regimen === 'Mayorista' && item.unit === 'Caja' && product.precioCaja > 0
                ? product.precioCaja 
                : product.precioUnidad;
            
            item.priceAtSale = price; // Actualiza el precio de venta en el carrito
            sub += item.quantity * price;
        });

        const descMonto = sub * (descuentoPorcentaje / 100);
        const finalTotal = sub - descMonto + (parseFloat(costoEnvio) || 0);
        
        return { subtotal: sub, descuentoMonto: descMonto, total: finalTotal };
    }, [cart, selectedClient, products, costoEnvio, descuentoPorcentaje]);

    const handleAddToCart = (product, quantity, unit) => {
        if (!product || quantity <= 0) return;

        // Se genera un ID único para la línea del carrito (temporal)
        const cartId = Date.now() + Math.random().toString(36).substring(2); 

        const newItem = { 
            cartId, 
            productId: product.id, 
            nombre: product.nombre,
            quantity: quantity, 
            unit: unit,
            priceAtSale: 0, // Se calcula en useMemo
        };
        setCart(prev => [...prev, newItem]);
        setProductSearch('');
    };
    
    const handleRemoveFromCart = (cartId) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    };

    const handleSubmitOrder = async () => {
        if (!selectedClient || cart.length === 0) return alert("Seleccione un cliente y añada productos.");
        
        if (selectedClient.regimen === 'Mayorista' && subtotal < selectedClient.minimoCompra) {
            return alert(`El pedido no alcanza el mínimo de compra de ${selectedClient.minimoCompra.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`);
        }
        // Validación de límite de crédito omitida por simplicidad, pero se recomienda.

        setIsSaving(true);

        try {
            const orderNumber = `PED-${Date.now().toString().slice(-6)}`;
            
            const newOrder = {
                ...ORDER_MODEL,
                clienteId: clientId,
                nombreCliente: selectedClient.nombre,
                fechaPedido: new Date().toISOString().split('T')[0], // Formato YYYY-MM-DD
                numeroPedido: orderNumber,
                bodegaOrigen: "Bodega Principal", // Hardcoded para el ejemplo
                items: cart.map(({ cartId, ...item }) => item), // Excluye el cartId temporal
                subtotal: parseFloat(subtotal.toFixed(2)),
                costoEnvio: parseFloat(costoEnvio.toFixed(2)),
                descuento: parseFloat(descuentoMonto.toFixed(2)),
                total: parseFloat(total.toFixed(2)),
                estado: 'Pendiente',
            };

            await createOrUpdateDoc('orders', newOrder);

            // Nota: Aquí iría la lógica para actualizar el stock de productos y el saldo del cliente
            // usando writeBatch, pero se omite la implementación de esa transacción para este módulo.

            alert(`¡Pedido ${orderNumber} Creado!`);
            setView('list');

        } catch (error) {
            console.error("Error al guardar el pedido:", error);
            alert("Error al guardar el pedido. Revise la consola.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-4 rounded-lg shadow">
                    <Select label="Buscar Cliente" name="cliente" value={clientId} onChange={e => setClientId(e.target.value)} required>
                        <option value="">-- Seleccionar Cliente --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.nombre} (Regimen: {c.regimen})</option>)}
                    </Select>
                    {selectedClient && (
                        <div className="text-xs mt-2 p-2 bg-gray-50 rounded">
                            <p>Régimen: <span className="font-semibold">{selectedClient.regimen}</span></p>
                            <p>Mínimo de compra: <span className="font-semibold">{selectedClient.minimoCompra.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span></p>
                        </div>
                    )}
                </div>
                
                <div className="bg-white p-4 rounded-lg shadow">
                    <Input label="Buscar Producto" name="productSearch" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Escribe el nombre del producto..." />
                    <div className="max-h-96 overflow-y-auto space-y-2 mt-4">
                    {filteredProducts.map(p => (
                        <div key={p.id} className="flex items-center justify-between p-3 border-b hover:bg-gray-50 transition">
                            <div>
                                <p className="font-semibold">{p.nombre}</p>
                                <p className="text-sm text-gray-600">Unidad: {p.precioUnidad.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} | Caja ({p.udsPorCaja}uds): {p.precioCaja.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</p>
                            </div>
                            {/* Botones de acción para añadir */}
                            <div className="flex space-x-2">
                                <Button 
                                    onClick={() => handleAddToCart(p, 1, 'Unidad')} 
                                    className="!px-2 !py-1 text-xs !bg-indigo-400 hover:!bg-indigo-500"
                                >
                                    +1 Unidad
                                </Button>
                                <Button 
                                    onClick={() => handleAddToCart(p, 1, 'Caja')} 
                                    className="!px-2 !py-1 text-xs"
                                >
                                    +1 Caja
                                </Button>
                            </div>
                        </div>
                    ))}
                    </div>
                </div>
            </div>
            
            {/* Columna de Resumen del Pedido */}
            <div className="bg-white p-4 rounded-lg shadow-md space-y-4 h-fit sticky top-4">
                <h3 className="font-bold text-lg">Resumen del Pedido ({cart.length} ítems)</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto border-b pb-4">
                    {cart.map(item => (
                        <div key={item.cartId} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                            <span className="truncate">
                                {item.quantity}x {item.nombre} ({item.unit})
                            </span>
                            <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-red-500 hover:text-red-700 transition ml-2">
                                <X className="w-4 h-4"/>
                            </button>
                        </div>
                    ))}
                    {cart.length === 0 && <p className="text-center text-gray-500">Añade productos para comenzar.</p>}
                </div>

                <div className="border-t mt-4 pt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span>Subtotal:</span> 
                        <span>{subtotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                        <label className="text-sm">Costo Envío:</label>
                        <input 
                            type="number" 
                            value={costoEnvio} 
                            onChange={e => setCostoEnvio(parseFloat(e.target.value) || 0)} 
                            className="w-24 p-1 border rounded-lg text-right shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            step="0.01"
                        />
                    </div>
                    
                    <div className="flex justify-between items-center">
                        <label className="text-sm">Descuento (%):</label>
                        <input 
                            type="number" 
                            value={descuentoPorcentaje} 
                            onChange={e => setDescuentoPorcentaje(parseFloat(e.target.value) || 0)} 
                            className="w-24 p-1 border rounded-lg text-right shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                            min="0"
                            max="100"
                        />
                    </div>
                    
                    <div className="flex justify-between font-bold text-xl border-t pt-2">
                        <span>TOTAL:</span> 
                        <span className="text-indigo-600">{total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</span>
                    </div>
                </div>
                
                <Button 
                    onClick={handleSubmitOrder} 
                    className="w-full !py-3" 
                    disabled={!selectedClient || cart.length === 0 || isSaving}
                    icon={ShoppingCart}
                >
                    {isSaving ? 'Guardando...' : 'Finalizar Pedido'}
                </Button>
            </div>
        </div>
    );
};
