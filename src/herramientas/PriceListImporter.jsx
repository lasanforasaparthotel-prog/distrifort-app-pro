import React, { useState, useMemo } from 'react';
import { Upload, Code, Save, Zap } from 'lucide-react';
// Asumimos que los hooks y componentes genéricos (useData, PageHeader, Modal, etc.) 
// están disponibles globalmente o se importan desde archivos superiores.

/* * NOTA: Este módulo depende de la función secureGeminiFetch para la IA. 
 * Asumimos que tienes acceso a:
 * - useData (para obtener products, providers, createOrUpdateDoc)
 * - PageHeader, Input, Button, Modal, Select (Componentes de UI)
 * - secureGeminiFetch (Lógica de comunicación con el proxy de IA)
 */

const PriceListImporter = () => {
    const { providers, createOrUpdateDoc } = useData();
    const [listText, setListText] = useState('');
    const [selectedProviderId, setSelectedProviderId] = useState('');
    const [loading, setLoading] = useState(false);
    const [importedProducts, setImportedProducts] = useState([]);
    const [error, setError] = useState(null);

    const selectedProvider = useMemo(() => providers.find(p => p.id === selectedProviderId), [providers, selectedProviderId]);

    // Función para comunicarse con el proxy de IA y estructurar el texto
    const secureGeminiFetch = async (prompt) => {
        // Esta función debe estar definida en App.jsx o un archivo de API accesible
        // Aquí se incluye la URL del proxy de Vercel para la IA
        const API_URL = '/api/gemini-proxy'; 
        
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt }),
            });
            
            if (!response.ok) throw new Error("Error en la respuesta del servidor de IA.");
            
            const data = await response.json();
            
            // La IA debe devolver un JSON en el campo 'text'
            return JSON.parse(data.text);
            
        } catch (error) {
            console.error("Error fetching Gemini or parsing JSON:", error);
            setError("Error de la IA: No se pudo obtener la estructura JSON. Asegúrate de pegar los datos correctamente.");
            return null;
        }
    };


    const formatTextForIA = () => {
        // 1. Definir el esquema JSON que queremos que Gemini nos devuelva
        const schema = JSON.stringify({
            type: "array",
            items: {
                type: "object",
                properties: {
                    nombre: { type: "string" },
                    marca: { type: "string" },
                    precioUnidad: { type: "number" },
                    precioCaja: { type: "number" },
                    udsPorCaja: { type: "number" }
                }
            }
        });

        // 2. Crear el prompt detallado
        const prompt = `Analiza el siguiente texto que contiene una lista de productos y precios. Identifica el nombre, marca, precio por unidad, precio por caja y unidades por caja (si no se encuentra, asume 1, 6 o 12). Convierte toda la información al formato JSON ARRAY, siguiendo estrictamente este esquema: ${schema}. El output debe ser ÚNICAMENTE el JSON. Texto a analizar:\n\n${listText}`;
        
        return prompt;
    };

    const handleProcessList = async () => {
        if (!listText) {
            setError("Por favor, pega el texto de la lista de precios.");
            return;
        }
        setError(null);
        setLoading(true);
        setImportedProducts([]);

        const prompt = formatTextForIA();
        const jsonResult = await secureGeminiFetch(prompt);

        if (jsonResult && Array.isArray(jsonResult)) {
            // Limpiamos los productos para asegurar que los precios sean números
            const cleanProducts = jsonResult.map(p => ({
                nombre: String(p.nombre || 'Producto sin Nombre'),
                marca: String(p.marca || 'Sin Marca'),
                precioUnidad: parseFloat(p.precioUnidad || 0),
                precioCaja: parseFloat(p.precioCaja || 0),
                udsPorCaja: parseInt(p.udsPorCaja || 1, 10),
            }));
            
            setImportedProducts(cleanProducts);
        } else {
            setError("La IA no pudo procesar la lista. Asegúrate de que el formato de texto sea claro.");
        }

        setLoading(false);
    };

    const handleSaveImport = async () => {
        if (!selectedProviderId) {
            setError("Por favor, selecciona un proveedor antes de guardar.");
            return;
        }

        if (importedProducts.length === 0) return;

        setLoading(true);
        setError(null);
        
        try {
            const productsToSave = importedProducts.map(p => ({
                ...p,
                // Mapeamos los campos del producto IA a la estructura final de tu inventario si es necesario
                // Aquí solo creamos un nuevo registro o actualizamos si existe
            }));

            // Lógica: La Lista de Precios del proveedor se puede guardar como un campo en el proveedor
            // O podemos simplemente crear nuevos productos en el inventario con los datos del proveedor.
            // Para simplificar, actualizamos los productos existentes si el nombre coincide.

            let itemsSaved = 0;
            const batch = writeBatch(db); // Asumimos que db está disponible globalmente

            for (const item of productsToSave) {
                // Buscamos si el producto ya existe en nuestro inventario (por nombre)
                const existingProduct = products.find(p => p.nombre.toLowerCase() === item.nombre.toLowerCase());
                
                const productData = {
                    ...PRODUCT_MODEL, // Usamos el modelo base
                    ...item,
                    costo: item.precioUnidad, // Usamos el precio unidad del proveedor como nuestro costo
                };

                if (existingProduct) {
                    // Actualizar
                    const docRef = doc(db, `/artifacts/${appId}/users/${userId}/Productos`, existingProduct.id);
                    batch.update(docRef, productData);
                } else {
                    // Crear nuevo producto (Si es un producto nuevo del proveedor)
                    const docRef = doc(collection(db, `/artifacts/${appId}/users/${userId}/Productos`));
                    batch.set(docRef, productData);
                }
                itemsSaved++;
            }

            await batch.commit();

            alert(`¡Importación exitosa! Se procesaron ${importedProducts.length} productos y se guardaron ${itemsSaved} registros.`);
            setListText('');
            setImportedProducts([]);
            setSelectedProviderId('');

        } catch (e) {
            console.error("Error al guardar la importación:", e);
            setError("Error al guardar los datos en Firestore. Revisa la consola.");
        } finally {
            setLoading(false);
        }
    };


    // --- RENDERIZADO ---
    return (
        <div className="space-y-6">
            <PageHeader title="Importador de Listas de Proveedores" />

            <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                <h3 className="text-xl font-bold text-indigo-600 border-b pb-2 flex items-center space-x-2">
                    <Upload className="w-6 h-6"/> 
                    <span>1. Pegar Lista y Procesar con IA</span>
                </h3>

                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <Select label="Proveedor de la Lista (Opcional)" value={selectedProviderId} onChange={e => setSelectedProviderId(e.target.value)}>
                        <option value="">-- Seleccionar Proveedor --</option>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </Select>
                </div>

                <div className='mt-4'>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pega el texto de la lista de precios aquí (copiado de PDF o Excel)</label>
                    <textarea 
                        rows="8" 
                        value={listText} 
                        onChange={e => setListText(e.target.value)} 
                        placeholder="Ej: Vino Malbec MarcaX 12uds $300/caja. Cerveza Pilsen MarcaY 6uds $150/unidad"
                        className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>

                <Button 
                    onClick={handleProcessList} 
                    disabled={loading || !listText}
                    icon={Zap}
                    className='w-full !py-3'
                >
                    {loading ? 'Analizando con IA...' : 'Procesar Lista con IA'}
                </Button>
            </div>

            {/* Sección de Resultados */}
            <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                <h3 className="text-xl font-bold text-green-600 border-b pb-2 flex items-center space-x-2">
                    <Code className="w-6 h-6"/> 
                    <span>2. Productos Encontrados ({importedProducts.length})</span>
                </h3>

                {error && (
                    <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">
                        Error: {error}
                    </div>
                )}

                {importedProducts.length > 0 && (
                    <>
                        <div className="max-h-80 overflow-y-auto border rounded-lg">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marca</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">U/Pz</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Caja ($)</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200 text-sm">
                                    {importedProducts.map((p, index) => (
                                        <tr key={index}>
                                            <td className="px-4 py-2 font-semibold">{p.nombre}</td>
                                            <td className="px-4 py-2">{p.marca}</td>
                                            <td className="px-4 py-2">{p.precioUnidad.toFixed(2)}</td>
                                            <td className="px-4 py-2">{p.precioCaja.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <Button 
                            onClick={handleSaveImport} 
                            disabled={loading || !selectedProviderId || importedProducts.length === 0}
                            icon={Save}
                            className='w-full !py-3 !bg-green-600 hover:!bg-green-700'
                        >
                            {loading ? 'Guardando...' : `Guardar ${importedProducts.length} Productos al Inventario`}
                        </Button>
                        <p className='text-xs text-red-500 mt-2'>*Advertencia: Esto actualizará el COSTO de los productos existentes o creará nuevos.</p>
                    </>
                )}
            </div>
        </div>
    );
};
