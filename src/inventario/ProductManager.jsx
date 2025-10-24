import React, { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, Edit, AlertCircle, Save } from 'lucide-react';
// Asegúrate de que estos elementos sean importados/exportados correctamente desde App.jsx
// Ej: import { useData, Button, Modal, PageHeader, Input, Select, FORMAT_CURRENCY } from '../App.jsx';

// Asumo la existencia de estos elementos globales/exportados de App.jsx
const ProductManager = () => {
    // NOTA: Reemplaza useData() por la forma en que lo importas si no es un hook global
    const { products, providers, createOrUpdateDoc, archiveDoc, useData, Button, Modal, PageHeader, Input, Select, FORMAT_CURRENCY, FormComponent, PRODUCT_MODEL } = useData(); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    // Asumo la definición de PRODUCT_MODEL en App.jsx
    const lowStockProducts = useMemo(() => products.filter(p => p.stockTotal <= p.umbralMinimo), [products]);

    // --- SUB-COMPONENTES DEFINIDOS AQUÍ ---

    // 1. Formulario de campos de producto
    const ProductFormFields = ({ item, handleChange }) => {
        // Usa la desestructuración de props que asumo están disponibles globalmente o via useData()
        const UNITS_PER_PALLET = 300; 

        const [stockAmount, setStockAmount] = useState(0);
        const [stockUnit, setStockUnit] = useState('unidad');
        
        const udsPorCaja = item.udsPorCaja || 6;
        
        const handleStockChange = (e) => setStockAmount(parseFloat(e.target.value) || 0);
        const handleUnitChange = (e) => setStockUnit(e.target.value);
        
        // CORRECCIÓN: El botón "Aplicar" ahora actualiza el estado 'item' a través de handleChange
        const handleApplyStock = () => {
            let unitsToAdd = stockAmount;
            if (stockUnit === 'caja') {
                unitsToAdd *= udsPorCaja;
            } else if (stockUnit === 'pallet') {
                unitsToAdd *= UNITS_PER_PALLET; 
            }
            
            const newStockTotal = (item.stockTotal || 0) + unitsToAdd;
            // Pasa el stock actualizado al estado del formulario, resolviendo el problema de "Aplicar"
            handleChange({ target: { name: 'stockTotal', value: newStockTotal, type: 'number' } }); 
            setStockAmount(0);
        };

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Nombre" name="nombre" value={item.nombre} onChange={handleChange} required />
                <Input label="Bodega" name="bodega" value={item.bodega} onChange={handleChange} />
                
                <Select label="Proveedor" name="proveedorId" value={item.proveedorId} onChange={handleChange} required>
                    <option value="">-- Seleccionar Proveedor --</option>
                    {providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </Select>

                <Input label="Precio Unidad ($)" name="precioUnidad" type="number" value={item.precioUnidad} onChange={handleChange} required />
                <Input label="Costo por Unidad ($)" name="costo" type="number" value={item.costo} onChange={handleChange} required />
                <Input label="Unidades por Caja" name="udsPorCaja" type="number" value={item.udsPorCaja} onChange={handleChange} />
                <Input label="Umbral Mínimo" name="umbralMinimo" type="number" value={item.umbralMinimo} onChange={handleChange} />
                
                <div className="col-span-full border-t pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Actual (Unidades)</label>
                    <p className="text-2xl font-bold text-indigo-600">{item.stockTotal || 0}</p>
                </div>
                
                <div className="col-span-full grid grid-cols-3 gap-2 items-end">
                    <Input label="Añadir Stock" type="number" value={stockAmount} onChange={handleStockChange} className="col-span-1" />
                    <Select label="Unidad" value={stockUnit} onChange={handleUnitChange} className="col-span-1">
                        <option value="unidad">Unidad</option>
                        <option value="caja">Caja (x{udsPorCaja} uds)</option>
                        <option value="pallet">Pallet (x{UNITS_PER_PALLET} uds)</option>
                    </Select>
                    <Button 
                        onClick={handleApplyStock} 
                        disabled={stockAmount <= 0} 
                        className="col-span-1 !bg-green-600 hover:!bg-green-700 !py-2"
                    >
                        Aplicar
                    </Button>
                </div>
                <input type="hidden" name="stockTotal" value={item.stockTotal} />
            </div>
        );
    };

    // 2. Fila de la tabla de producto
    const ProductTableRow = ({ item, onEdit, onArchive }) => (
        <tr className="hover:bg-gray-50">
            <td className="px-4 py-4 font-semibold">{item.nombre}</td>
            <td className="px-4 py-4">{item.bodega}</td>
            <td className={`px-4 py-4 ${item.stockTotal <= item.umbralMinimo ? 'text-red-500 font-bold' : ''}`}>{item.stockTotal}</td>
            <td className="px-4 py-4">{FORMAT_CURRENCY(item.precioUnidad)}</td>
            <td className="px-4 py-4 text-right space-x-2">
                <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300"><Edit className="w-4 h-4" /></Button>
                <Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600"><Trash2 className="w-4 h-4" /></Button>
            </td>
        </tr>
    );

    // Lógica de Guardado con Manejo de Errores (para diagnóstico)
    const handleSave = async (itemData) => { 
        try {
            // Asumo que createOrUpdateDoc viene del hook useData en App.jsx
            await createOrUpdateDoc('products', itemData, selectedItem?.id); 
            setIsModalOpen(false); 
            setSelectedItem(null); 
            console.log("SUCCESS: Producto guardado/actualizado con éxito.");
        } catch (error) {
            // Muestra el error crítico de Firebase / Firestore
            console.error("ERROR CRÍTICO AL GUARDAR EL PRODUCTO:", error);
            alert(`Error al guardar el producto. Revise la consola para más detalles. Detalle: ${error.message}`);
        }
    };
    
    const handleEdit = (item) => { setSelectedItem(item); setIsModalOpen(true); };
    const handleAddNew = () => { setSelectedItem(null); setIsModalOpen(true); };
    
    const ProductTableHeaders = ["Nombre", "Proveedor", "Stock", "Precio"];
    
    return (<div className="space-y-6">
        <PageHeader title="Inventario">
            <Button onClick={handleAddNew} icon={Plus}>Añadir Producto</Button>
        </PageHeader>
        {lowStockProducts.length > 0 && (
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4" role="alert">
                <p className="font-bold">Alerta de Stock</p>
                <p>Tienes {lowStockProducts.length} productos bajo el umbral mínimo.</p>
            </div>
        )}
        {isModalOpen && <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Producto"} onClose={() => setIsModalOpen(false)}>
            {/* FormComponent debe ser un componente genérico definido en App.jsx */}
            <FormComponent model={selectedItem || PRODUCT_MODEL} onSave={handleSave} onCancel={() => setIsModalOpen(false)}>
                <ProductFormFields />
            </FormComponent>
        </Modal>}

        <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        {ProductTableHeaders.map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>)}
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {products.map(item => <ProductTableRow key={item.id} item={item} onEdit={() => handleEdit(item)} onArchive={() => archiveDoc('products', item.id)} />)}
                </tbody>
            </table>
        </div>
    </div>);
};

export default ProductManager;
