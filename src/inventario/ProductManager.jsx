import React, { useState, useMemo } from 'react';
// IMPORTANTE: Este código asume que los hooks y componentes genéricos 
// (useData, Button, Modal, Input, Select, etc.) existen en el archivo principal (App.jsx).
import { Plus, Trash2, Edit, AlertCircle, Save } from 'lucide-react'; 

// --- MODELOS (Para Referencia) ---
const PRODUCT_MODEL = { 
    nombre: '', 
    marca: '', 
    especie: 'Vino', 
    varietal: '', 
    costo: 0, 
    precioUnidad: 0, 
    precioCaja: 0, 
    udsPorCaja: 6, // Unidades por caja es clave
    stockTotal: 0, 
    umbralMinimo: 10, 
    archivado: false 
};

// --- FUNCIÓN UTILITARIA ---
const getPriceText = (price) => price.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });

// --- 1. COMPONENTE DE FORMULARIO PARA PRODUCTOS (ProductForm) ---
const ProductForm = ({ item, handleChange, onSave, onCancel }) => {
    const [formData, setFormData] = useState({ 
        ...item,
        // Estado temporal para la entrada de nuevo stock
        newStockQuantity: 0,
        newStockUnit: 'Unidad',
        stockOperation: 'add'
    });

    // Calcula el stock total basado en la operación de entrada
    const calculateStock = () => {
        let stockChange = parseFloat(formData.newStockQuantity) || 0;
        let totalUnits = formData.stockTotal || 0;

        // Si la unidad es Caja, multiplicamos por las unidades por caja
        if (formData.newStockUnit === 'Caja') {
            stockChange *= parseFloat(formData.udsPorCaja) || 1;
        }

        if (formData.stockOperation === 'add') {
            return totalUnits + stockChange;
        } else if (formData.stockOperation === 'subtract') {
            return Math.max(0, totalUnits - stockChange); // Evitar stock negativo
        }
        return totalUnits;
    };
    
    // Maneja los cambios en los campos del formulario
    const handleFormChange = (e) => {
        const { name, value, type } = e.target;
        
        let newValue = (type === 'number' || name === 'udsPorCaja' || name === 'costo' || name === 'precioUnidad' || name === 'precioCaja')
            ? parseFloat(value) || 0 
            : value;
        
        setFormData(prev => ({ ...prev, [name]: newValue }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const finalStock = calculateStock();

        // Creamos el objeto final para guardar en Firestore
        const dataToSave = {
            ...formData,
            stockTotal: finalStock,
            // Eliminamos campos temporales antes de guardar
            newStockQuantity: undefined,
            newStockUnit: undefined,
            stockOperation: undefined,
        };

        onSave(dataToSave);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <h4 className="text-md font-semibold text-gray-700 border-b pb-2">Información Básica y Precios</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Nombre Producto" name="nombre" value={formData.nombre} onChange={handleFormChange} required />
                <Input label="Marca" name="marca" value={formData.marca} onChange={handleFormChange} />
                <Input label="Costo/Unidad ($)" name="costo" type="number" value={formData.costo} onChange={handleFormChange} required />
                <Input label="Precio Venta/Unidad ($)" name="precioUnidad" type="number" value={formData.precioUnidad} onChange={handleFormChange} required />
                <Input label="Precio Venta/Caja ($)" name="precioCaja" type="number" value={formData.precioCaja} onChange={handleFormChange} required />
                <Input label="Unidades por Caja" name="udsPorCaja" type="number" value={formData.udsPorCaja} onChange={handleFormChange} required />
            </div>

            <h4 className="text-md font-semibold text-gray-700 border-b pb-2 pt-4">Gestión de Stock</h4>
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="grid grid-cols-3 gap-4 mb-3 items-end">
                    <Select label="Operación" name="stockOperation" value={formData.stockOperation} onChange={handleFormChange}>
                        <option value="add">Añadir Stock</option>
                        <option value="subtract">Reducir Stock</option>
                    </Select>
                    <Input 
                        label="Cantidad" 
                        name="newStockQuantity" 
                        type="number" 
                        value={formData.newStockQuantity} 
                        onChange={handleFormChange} 
                        required 
                        min="0"
                    />
                    <Select label="Unidad" name="newStockUnit" value={formData.newStockUnit} onChange={handleFormChange}>
                        <option>Unidad</option>
                        <option>Caja</option>
                    </Select>
                </div>
                <p className="font-semibold text-gray-700 text-sm">
                    Stock Actual: {item.stockTotal} unidades. 
                    <span className="text-indigo-600 ml-2">Stock Final Estimado: {calculateStock()} unidades.</span>
                </p>
            </div>
             <Input label="Umbral Mínimo de Stock" name="umbralMinimo" type="number" value={formData.umbralMinimo} onChange={handleFormChange} required />

            <div className="flex justify-end space-x-3 pt-4">
                <Button onClick={onCancel} className="bg-gray-200 text-gray-800 hover:bg-gray-300">Cancelar</Button>
                <Button type="submit" icon={Save}>Guardar Producto</Button>
            </div>
        </form>
    );
}

// --- 2. GESTOR PRINCIPAL (ProductManager) ---
export const ProductManager = () => {
    // Renombrado de las colecciones para evitar confusión con el estado
    const { products: productsData, createOrUpdateDoc, archiveDoc } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    
    // Muestra solo los productos activos (no archivados)
    const activeProducts = productsData.filter(p => !p.archivado);

    const handleSave = async (itemData) => { 
        await createOrUpdateDoc('products', itemData, selectedItem?.id); 
        setIsModalOpen(false); 
        setSelectedItem(null); 
    };
    
    const handleEdit = (item) => { 
        setSelectedItem(item); 
        setIsModalOpen(true); 
    };
    
    const handleAddNew = () => { 
        setSelectedItem(null); 
        setIsModalOpen(true); 
    };

    // Fila de la tabla para Productos
    const ProductTableRow = ({ item, onEdit, onArchive }) => (
        <tr className="hover:bg-gray-50">
            <td className="px-4 py-4 font-semibold">{item.nombre}</td>
            <td className="px-4 py-4">{item.marca}</td>
            <td className={`px-4 py-4 font-bold ${item.stockTotal <= item.umbralMinimo ? 'text-red-600' : 'text-green-600'}`}>
                {item.stockTotal} <span className="text-xs text-gray-500">(Und.)</span>
            </td>
            <td className="px-4 py-4">{getPriceText(item.precioUnidad)}</td>
            <td className="px-4 py-4 text-right space-x-2">
                <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300">
                    <Edit className="w-4 h-4" />
                </Button>
                <Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600">
                    <Trash2 className="w-4 h-4" />
                </Button>
            </td>
        </tr>
    );

    return (
        <div className="space-y-6">
            <PageHeader title="Gestión de Inventario">
                <Button onClick={handleAddNew} icon={Plus}>Añadir Producto</Button>
            </PageHeader>
            
            {isModalOpen && (
                <Modal title={(selectedItem ? "Editar " : "Nuevo ") + "Producto"} onClose={() => setIsModalOpen(false)}>
                    <ProductForm 
                        item={selectedItem || PRODUCT_MODEL} 
                        onSave={handleSave} 
                        onCancel={() => setIsModalOpen(false)}
                    />
                </Modal>
            )}

            <div className="bg-white shadow-lg rounded-xl overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stock Total</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Precio Unidad</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {activeProducts.map(item => (
                            <ProductTableRow 
                                key={item.id} 
                                item={item} 
                                onEdit={() => handleEdit(item)} 
                                onArchive={() => archiveDoc('products', item.id)} 
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
