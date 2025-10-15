import React, { useState, useMemo, useCallback } from 'react';
// Asumimos que los componentes y hooks (useData, ManagerComponent, etc.) 
// están disponibles globalmente o se importarán desde archivos superiores.
import { Plus, List, Trash2, Mail, Send, Printer } from 'lucide-react'; 

/* * NOTA: Este código asume que tienes acceso a:
 * - useData, Button, Modal, Input, Select, PageHeader, PrintableDocument
 * - PURCHASE_ORDER_MODEL, PROVIDER_MODEL (Debes definirlos en un archivo de modelos)
 * - El patrón ManagerComponent (o los componentes de UI genéricos)
 */

// --- MODELOS (Para referencia) ---
const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };
const PROVIDER_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
// Nota: PRODUCT_MODEL se requiere para que OrderCreator obtenga el costo inicial.

// --- UTILITIES ---
const getCostText = (cost) => cost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

// --- CREADOR DE ÓRDENES DE COMPRA (PurchaseOrderCreator) ---
const PurchaseOrderCreator = ({ products, providers, setView }) => {
    const { createOrUpdateDoc, archiveDoc } = useData(); // Se agregó archiveDoc por si se necesita
    const [cart, setCart] = useState([]);
    const [providerId, setProviderId] = useState('');
    const [productSearch, setProductSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const selectedProvider = useMemo(() => providers.find(p => p.id === providerId), [providers, providerId]);
    
    // Calcula el costo total de la orden
    const { costoTotal } = useMemo(() => {
        const total = cart.reduce((sum, item) => sum + (item.quantity * item.costoUnitario), 0);
        return { costoTotal: total };
    }, [cart]);

    const filteredProducts = useMemo(() => {
        if (!productSearch) return products;
        const lowerSearch = productSearch.toLowerCase();
        return products.filter(p => p.nombre.toLowerCase().includes(lowerSearch) || p.marca.toLowerCase().includes(lowerSearch));
    }, [products, productSearch]);
    
    const handleAddToCart = (product) => {
        const existingItem = cart.find(i => i.productId === product.id);
        if (existingItem) return;

        const newItem = { 
            cartId: new Date().getTime(), 
            productId: product.id, 
            nombre: product.nombre,
            quantity: 1, 
            unit: 'Caja', // Por defecto, compramos por caja
            costoUnitario: product.costo > 0 ? product.costo : 0, 
            totalItem: product.costo > 0 ? product.costo : 0,
        };
        setCart(prev => [...prev, newItem]);
    };

    const handleUpdateCartItem = useCallback((cartId, field, value) => {
        setCart(prev => prev.map(item => {
            if (item.cartId === cartId) {
                const numValue = (field === 'quantity' || field === 'costoUnitario') ? parseFloat(value) || 0 : value;
                const updatedItem = { ...item, [field]: numValue };
                
                // Si cambiamos cantidad o costo, recalcular el total de la línea
                if (field === 'quantity' || field === 'costoUnitario') {
                    updatedItem.totalItem = updatedItem.quantity * updatedItem.costoUnitario;
                }
                return updatedItem;
            }
            return item;
        }));
    }, []);

    const handleRemoveFromCart = (cartId) => {
        setCart(prev => prev.filter(item => item.cartId !== cartId));
    };

    const handleSubmitOrder = async () => {
        if (!selectedProvider || cart.length === 0) return alert("Seleccione un proveedor y añada productos.");
        
        setIsSaving(true);
        try {
            const orderData = {
                ...PURCHASE_ORDER_MODEL,
                proveedorId: providerId,
                nombreProveedor: selectedProvider.nombre,
                items: cart.map(({ cartId, totalItem, ...item }) => ({...item, totalItem})), // Limpiamos el cartId y mantenemos totalItem
                costoTotal,
                estado: 'Pendiente',
            };
            
            await createOrUpdateDoc('purchaseOrders', orderData);

            alert("¡Orden de Compra Creada!");
            setView('list');
        } catch (e) {
            console.error("Error al crear Orden de Compra:", e);
            alert("Error al guardar la orden. Revisa la consola.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columna 1 y 2: Selección de Proveedor y Productos */}
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-white p-4 rounded-xl shadow">
                    <Select label="Seleccionar Proveedor" name="proveedor" value={providerId} onChange={e => setProviderId(e.target.value)} required>
                        <option value="">-- Seleccionar Proveedor --</option>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.cuit})</option>)}
                    </Select>
                </div>
                
                {selectedProvider && (
                    <div className="bg-white p-4 rounded-xl shadow">
                        <Input label="Buscar Producto" name="productSearch" value={productSearch} onChange={e => setProductSearch(e.target.value)} />
                        <div className="max-h-80 overflow-y-auto space-y-2 mt-4">
                            {filteredProducts.map(p => (
                                <div key={p.id} className="flex items-center justify-between p-2 border-b hover:bg-gray-50 transition">
                                    <div>
                                        <p className="font-semibold">{p.nombre} ({p.marca})</p>
                                        <p className="text-sm text-gray-600">Costo Ref.: {getCostText(p.costo)} / Unidad</p>
                                    </div>
                                    <Button onClick={() => handleAddToCart(p)} icon={Plus} className="!px-3 !py-1 text-sm">Añadir</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Columna 3: Resumen de la Orden de Compra */}
            <div className="bg-white p-4 rounded-lg shadow-md space-y-4">
                <h3 className="font-bold text-lg border-b pb-2">Artículos a Comprar ({cart.length})</h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                    {cart.map(item => (
                        <div key={item.cartId} className="p-3 border rounded-lg bg-gray-50">
                            <div className="flex justify-between items-start">
                                <span className="font-medium text-sm">{item.nombre}</span>
                                <button onClick={() => handleRemoveFromCart(item.cartId)} className="text-red-500 hover:text-red-700 ml-2"><Trash2 className="w-4 h-4"/></button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                                <Input 
                                    label="Cantidad" 
                                    type="number" 
                                    value={item.quantity} 
                                    onChange={e => handleUpdateCartItem(item.cartId, 'quantity', e.target.value)} 
                                />
                                <Input 
                                    label="Costo Unitario" 
                                    type="number" 
                                    value={item.costoUnitario} 
                                    onChange={e => handleUpdateCartItem(item.cartId, 'costoUnitario', e.target.value)} 
                                />
                                <Select 
                                    label="Unidad" 
                                    value={item.unit} 
                                    onChange={e => handleUpdateCartItem(item.cartId, 'unit', e.target.value)}
                                >
                                    <option>Unidad</option>
                                    <option>Caja</option>
                                </Select>
                            </div>
                             <p className="text-right font-semibold text-sm mt-2">Total: {getCostText(item.totalItem)}</p>
                        </div>
                    ))}
                    {cart.length === 0 && <p className="text-center text-gray-500 py-4">Añada productos a la orden.</p>}
                </div>

                <div className="border-t mt-4 pt-4 space-y-2">
                    <div className="flex justify-between font-bold text-xl"><span>COSTO TOTAL:</span> <span className="text-indigo-600">{getCostText(costoTotal)}</span></div>
                </div>

                <Button onClick={handleSubmitOrder} className="w-full !py-3 mt-4" disabled={!selectedProvider || cart.length === 0 || isSaving}>
                    {isSaving ? 'Guardando...' : 'Finalizar Orden de Compra'}
                </Button>
            </div>
        </div>
    );
};


// --- LISTA DE ÓRDENES DE COMPRA (PurchaseOrderList) ---
const PurchaseOrderList = ({ purchaseOrders }) => {
    const { archiveDoc, providers } = useData();
    // Generación de links de comunicación
    const generateCommunicationLink = useCallback((order, type) => {
        const proveedor = providers.find(p => p.id === order.proveedorId) || PROVIDER_MODEL;
        
        let subject = `Orden de Compra #${order.id} - DistriFort`;
        let body = `Estimado ${proveedor.nombre},\n\nAdjuntamos la Orden de Compra (OC) No. ${order.id} por un costo total de ${getCostText(order.costoTotal)}.\n\nDetalle:\n`;
        order.items.forEach(item => {
            body += `- ${item.quantity} ${item.unit} de ${item.nombre} (Costo: ${getCostText(item.totalItem)})\n`;
        });
        body += `\nTotal: ${getCostText(order.costoTotal)}`;

        if (type === 'whatsapp' && proveedor.telefono) {
            return `https://wa.me/${proveedor.telefono}?text=${encodeURIComponent(body)}`;
        }
        if (type === 'email' && proveedor.email) {
            return `mailto:${proveedor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }
        return null;
    }, [providers]);


    return (
        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Proveedor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Costo Total</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {(purchaseOrders || []).map(o => {
                        const whatsappLink = generateCommunicationLink(o, 'whatsapp');
                        const emailLink = generateCommunicationLink(o, 'email');
                        return (
                            <tr key={o.id}>
                                <td className="px-6 py-4 whitespace-nowrap">{o.nombreProveedor}</td>
                                <td className="px-6 py-4 whitespace-nowrap font-semibold text-indigo-600">{getCostText(o.costoTotal)}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">{o.estado}</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                    {/* Botones de Comunicación */}
                                    {whatsappLink && (
                                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center !p-2 !bg-green-500 hover:!bg-green-600 text-white rounded-lg">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7c-1.1-1.9-1.6-4.1-.9-6.3a8.38 8.38 0 0 1 .9-3.8 8.5 8.5 0 0 1 7.6-4.7 8.38 8.38 0 0 1 3.8.9l5.7-1.9L21 3z"></path></svg>
                                        </a>
                                    )}
                                    {emailLink && (
                                        <a href={emailLink} className="inline-flex items-center justify-center !p-2 !bg-blue-500 hover:!bg-blue-600 text-white rounded-lg">
                                            <Mail className="w-4 h-4"/>
                                        </a>
                                    )}
                                    {/* Botón de Imprimir (Simulado, requiere PrintableDocument) */}
                                    <Button onClick={() => alert('Función Imprimir/PDF aún no implementada en este contexto.')} className="!p-2 !bg-gray-400 hover:!bg-gray-500">
                                        <Printer className="w-4 h-4"/>
                                    </Button>
                                    {/* Botón de Archivar */}
                                    <Button onClick={() => archiveDoc('purchaseOrders', o.id)} className="!p-2 !bg-red-500 hover:!bg-red-600">
                                        <Trash2 className="w-4 h-4"/>
                                    </Button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL DEL MANAGER ---
export const PurchaseOrderManager = () => {
    const { purchaseOrders, products, providers, archiveDoc } = useData();
    const [view, setView] = useState('list'); // 'list' o 'creator'

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <PageHeader title="Gestión de Órdenes de Compra" />
                <Button 
                    onClick={() => setView(view === 'list' ? 'creator' : 'list')} 
                    icon={view === 'list' ? Plus : List}
                >
                    {view === 'list' ? 'Nueva Orden de Compra' : 'Ver Historial'}
                </Button>
            </div>

            {view === 'list' ? (
                <PurchaseOrderList purchaseOrders={purchaseOrders} />
            ) : (
                <PurchaseOrderCreator 
                    products={products} 
                    providers={providers} 
                    setView={setView} 
                />
            )}
        </div>
    );
};
