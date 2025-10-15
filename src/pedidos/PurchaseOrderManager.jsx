import React, { useState } from 'react';
// Asumimos que los componentes y hooks (useData, ManagerComponent, etc.) 
// están disponibles globalmente o se importarán desde archivos superiores.

// --- MODELO (Para referencia) ---
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
    archivado: false 
};

// --- FUNCIÓN DE CÁLCULO DE STOCK (CRÍTICA) ---
// Calcula el nuevo stock total en unidades basado en la entrada del usuario (caja o unidad).
const calculateNewStock = (currentStock, entryQuantity, entryUnit, unitsPerCase) => {
    const quantityInUnits = entryUnit === 'Caja' 
        ? entryQuantity * unitsPerCase
        : entryQuantity;
    
    // Asumimos que la operación de stock es siempre una SUMA de entrada en este formulario.
    // Para edición de stock existente, la lógica debería ser más compleja.
    return currentStock + quantityInUnits;
};


// --- COMPONENTE DEL FORMULARIO ---
// Este componente define la estructura del modal de Añadir/Editar Producto.
const ProductFormFields = React.memo(({ item, handleChange }) => {
    // Estado local para manejar la nueva entrada de stock temporalmente
    const [stockEntry, setStockEntry] = useState(0);
    const [entryUnit, setEntryUnit] = useState('Unidad');

    // Maneja todos los cambios de campos normales
    const handleRegularChange = (e) => {
        handleChange(e);
    };

    // Maneja la entrada de nuevo stock y recalcula el stock total
    const handleStockEntry = () => {
        if (stockEntry <= 0) return;

        const newTotal = calculateNewStock(
            item.stockTotal, 
            stockEntry, 
            entryUnit, 
            item.udsPorCaja
        );
        
        // Simular un evento de cambio para actualizar el estado del formulario padre (ManagerComponent)
        handleChange({ 
            target: { 
                name: 'stockTotal', 
                value: newTotal,
                type: 'number' 
            } 
        });
        
        // Limpiar campos de entrada de stock temporal
        setStockEntry(0);
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Nombre" name="nombre" value={item.nombre} onChange={handleRegularChange} required className="md:col-span-2" />
                <Input label="Marca" name="marca" value={item.marca} onChange={handleRegularChange} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t pt-4">
                <Input label="Precio Unidad ($)" name="precioUnidad" type="number" value={item.precioUnidad} onChange={handleRegularChange} required />
                <Input label="Precio Caja ($)" name="precioCaja" type="number" value={item.precioCaja} onChange={handleRegularChange} />
                <Input label="Uds. por Caja" name="udsPorCaja" type="number" value={item.udsPorCaja} onChange={handleRegularChange} required />
                <Input label="Costo por Unidad ($)" name="costo" type="number" value={item.costo} onChange={handleRegularChange} />
            </div>

            <div className="border-t pt-4">
                <Input label="Stock Total Actual (Uds.)" name="stockTotal" type="number" value={item.stockTotal} onChange={handleRegularChange} disabled />
                <Input label="Umbral Mínimo (Alerta)" name="umbralMinimo" type="number" value={item.umbralMinimo} onChange={handleRegularChange} />
            </div>
            
            {/* --- Sección de Entrada de Stock por Caja/Unidad --- */}
            <div className="border border-indigo-100 p-4 rounded-lg bg-indigo-50 space-y-3">
                <p className="font-semibold text-sm text-indigo-700">Añadir Stock (por Compra)</p>
                <div className="flex space-x-2">
                    <div className="flex-1">
                        <Input 
                            label="Cantidad a Añadir" 
                            type="number" 
                            value={stockEntry} 
                            onChange={e => setStockEntry(parseFloat(e.target.value) || 0)} 
                            min="0"
                        />
                    </div>
                    <Select 
                        label="Unidad" 
                        value={entryUnit} 
                        onChange={e => setEntryUnit(e.target.value)}
                        className="w-1/3"
                    >
                        <option>Unidad</option>
                        <option>Caja</option>
                    </Select>
                    <div className="flex items-end pt-5">
                        <Button onClick={handleStockEntry} disabled={stockEntry <= 0} className="!h-10 !px-3 !bg-green-600 hover:!bg-green-700">
                            + Añadir
                        </Button>
                    </div>
                </div>
                <p className="text-xs text-gray-600">
                    *Al añadir {stockEntry} {entryUnit}(s), el stock aumentará en **{(entryUnit === 'Caja' ? stockEntry * item.udsPorCaja : stockEntry) || 0} unidades**.
                </p>
            </div>
        </div>
    );
});


// --- FILA DE LA TABLA ---
const ProductTableRow = React.memo(({ item, onEdit, onArchive }) => (
    <tr className="hover:bg-gray-50">
        <td className="px-4 py-4 font-semibold">{item.nombre}</td>
        <td className="px-4 py-4 hidden sm:table-cell">{item.marca}</td>
        <td className={`px-4 py-4 font-bold ${item.stockTotal <= item.umbralMinimo ? 'text-red-600 bg-red-50 rounded-md' : 'text-green-700'}`}>
            {item.stockTotal} Uds.
        </td>
        <td className="px-4 py-4">{(item.precioUnidad || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}</td>
        <td className="px-4 py-4 text-right space-x-2">
            <Button onClick={onEdit} className="!p-2 !bg-gray-200 !text-gray-700 hover:!bg-gray-300">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M17 3a2.85 2.85 0 0 0 4 4L13 15l-4 1 1-4 8-8Z"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>
            </Button>
            <Button onClick={onArchive} className="!p-2 !bg-red-500 hover:!bg-red-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            </Button>
        </td>
    </tr>
));


// --- COMPONENTE PRINCIPAL DEL MANAGER ---
export const ProductManager = () => {
    // Si estás modularizando, necesitarás ManagerComponent, useData, Button, etc., 
    // pero si lo estás pegando en tu archivo monolítico, solo necesitas que se ejecute.

    // Asumimos que ManagerComponent, useData, Button, etc. están disponibles.
    /*
    return (
        <ManagerComponent 
            title="Inventario de Productos" 
            collectionName="products" 
            model={PRODUCT_MODEL} 
            FormFields={ProductFormFields} 
            TableHeaders={["Nombre", "Marca", "Stock Actual", "Precio Unidad"]} 
            TableRow={ProductTableRow} 
        />
    );
    */
    
    // Devolveremos un marcador de posición si se está ejecutando fuera del contexto del ManagerComponent
    return (
        <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-2xl font-bold">ProductManager (Inventario)</h2>
            <p className="mt-2">Lógica de entrada por caja/unidad implementada en <code>ProductFormFields</code>.</p>
        </div>
    );
};
