import React, { useState, useMemo } from 'react';
// Importaciones para las pestañas de herramientas
import { BrainCircuit, Calculator, TrendingUp, ImageIcon, Zap, Search } from 'lucide-react'; 

/* * NOTA: Este código asume que tienes acceso a:
 * - useData (para obtener productos)
 * - PageHeader, Input, Button, Select, Card (Componentes de UI genéricos)
 * - secureGeminiFetch (Lógica de comunicación con el proxy de IA)
 * - getPriceText (utilidad de formateo de moneda)
 */

// --- UTILITIES ---
// La función secureGeminiFetch debe estar definida en App.jsx o en un archivo API accesible.
const secureGeminiFetch = async (prompt) => {
    const API_URL = '/api/gemini-proxy'; 
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
        });
        
        if (!response.ok) throw new Error("Error en la respuesta del servidor de IA.");
        
        const data = await response.json();
        return data.text; // La respuesta de IA en texto plano
        
    } catch (error) {
        console.error("Error fetching Gemini:", error);
        return "Hubo un error al conectar con el asistente de IA. Verifica tu configuración de Vercel y la clave de Gemini.";
    }
};

// Función de utilidad para formatear moneda (asumida globalmente)
const getPriceText = (price) => (parseFloat(price) || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });


// --- 1. ASISTENTE DE DISTRIBUCIÓN (IA) ---
const DistributionAssistant = ({ products }) => {
    const [prompt, setPrompt] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!prompt) return;

        setLoading(true);
        setResponse('Analizando su consulta...');
        
        // Creamos un contexto básico de datos para la IA
        const productContext = products.slice(0, 20).map(p => 
            `{Nombre: ${p.nombre}, Marca: ${p.marca}, Stock: ${p.stockTotal}, Costo: ${p.costo}, Precio: ${p.precioUnidad}}`
        ).join('; ');

        const finalPrompt = `Actúa como un analista de negocios para una distribuidora de bebidas. Utiliza los siguientes datos de inventario como contexto: [${productContext}]. Responde a la siguiente consulta del usuario de forma concisa y profesional: ${prompt}`;
        
        const result = await secureGeminiFetch(finalPrompt);
        setResponse(result);
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            <h4 className="text-lg font-semibold text-indigo-600">Pregunta a la IA sobre tus Datos de Distribución</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
                <textarea
                    rows="4"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Ej: ¿Qué productos tienen el mayor margen de ganancia si vendo por unidad?"
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
                />
                <Button type="submit" disabled={loading} icon={Search}>
                    {loading ? 'Consultando...' : 'Obtener Análisis'}
                </Button>
            </form>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap">
                <p className='font-bold mb-2 text-sm text-gray-700'>Respuesta del Asistente:</p>
                <p>{response || "La IA responderá aquí."}</p>
            </div>
        </div>
    );
};

// --- 2. CALCULADORA DE RENTABILIDAD ---
const ProfitabilityCalculator = () => {
    const [cost, setCost] = useState(0);
    const [price, setPrice] = useState(0);

    const { profit, margin, markup } = useMemo(() => {
        const c = parseFloat(cost) || 0;
        const p = parseFloat(price) || 0;
        
        const prof = p - c;
        // Margen: (Ganancia / Precio de Venta) * 100
        const marg = p > 0 ? (prof / p) * 100 : 0;
        // Markup: (Ganancia / Costo) * 100
        const mark = c > 0 ? (prof / c) * 100 : 0;
        
        return { profit: prof, margin: marg, markup: mark };
    }, [cost, price]);
    
    return (
        <div className="space-y-6">
            <h4 className="text-lg font-semibold text-indigo-600 border-b pb-2">Calcular Margen y Ganancia</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                    label="Costo del Producto (sin IVA)" 
                    name="costo" 
                    type="number" 
                    value={cost} 
                    onChange={e => setCost(e.target.value)} 
                    placeholder="100.00"
                />
                <Input 
                    label="Precio de Venta Final" 
                    name="precio" 
                    type="number" 
                    value={price} 
                    onChange={e => setPrice(e.target.value)} 
                    placeholder="150.00"
                />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <Card title="Ganancia Bruta" value={getPriceText(profit)} icon={DollarSign} color={profit >= 0 ? 'green' : 'red'} />
                <Card title="Margen de Ganancia" value={`${margin.toFixed(2)}%`} icon={TrendingUp} color={margin >= 0 ? 'blue' : 'red'} />
                <Card title="Markup (Sobre Costo)" value={`${markup.toFixed(2)}%`} icon={TrendingUp} color={markup >= 0 ? 'indigo' : 'red'} />
            </div>
        </div>
    );
};


// --- 3. CREADOR DE PROMOS (IA) ---
const PromotionGenerator = () => {
    const [prompt, setPrompt] = useState('');
    const [imageURL, setImageURL] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!prompt) return;

        setLoading(true);
        setError(null);
        setImageURL('');
        
        // Utilizaremos la URL de la API de Imagen 3.0 (gemini-2.5-flash-image-preview)
        const apiKey = ""; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

        const finalPrompt = `Crea una imagen promocional de alta calidad con el siguiente tema. Enfócate en una distribución mayorista de bebidas. Tono: ${prompt}`;

        const payload = { instances: { prompt: finalPrompt }, parameters: { "sampleCount": 1} };

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();

            if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
                const base64Data = result.predictions[0].bytesBase64Encoded;
                setImageURL(`data:image/png;base64,${base64Data}`);
            } else {
                setError("La IA no pudo generar la imagen. Intenta con una descripción diferente.");
                console.error("AI Image Generation Error:", result);
            }
        } catch (e) {
            setError("Error de conexión al servicio de IA de imágenes.");
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h4 className="text-lg font-semibold text-indigo-600 border-b pb-2">Generar Imagen de Promoción (Marketing IA)</h4>
            <form onSubmit={handleGenerate} className="space-y-4">
                <textarea
                    rows="3"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Ej: 'Diseño de cartel digital moderno con botellas de vino espumante y la frase: ¡50% de descuento en tu primer pedido!'"
                    className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                    disabled={loading}
                />
                <Button type="submit" disabled={loading} icon={Zap}>
                    {loading ? 'Generando imagen...' : 'Generar Imagen de Promoción'}
                </Button>
            </form>

            {error && <div className="p-3 text-sm text-red-700 bg-red-100 rounded-lg">{error}</div>}

            {imageURL && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                    <img src={imageURL} alt="Imagen de Promoción Generada por IA" className="max-w-full h-auto rounded-lg shadow-xl mx-auto" />
                    <div className='mt-4 space-x-3'>
                        <a href={imageURL} download="Promo_DistriFort.png" className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold bg-green-600 text-white hover:bg-green-700 transition">
                            <Save className='w-5 h-5'/><span>Descargar PNG</span>
                        </a>
                    </div>
                </div>
            )}
            
             {loading && <PageLoader text="Creando imagen publicitaria..." />}
        </div>
    );
};


// --- MÓDULO PRINCIPAL DE HERRAMIENTAS ---
const Tools = () => {
    const { products } = useData();
    const [activeTab, setActiveTab] = useState('Assistant');
    
    const renderContent = () => {
        switch (activeTab) {
            case 'Assistant': return <DistributionAssistant products={products} />;
            case 'Calculator': return <ProfitabilityCalculator />;
            case 'ImageGenerator': return <PromotionGenerator />;
            default: return <DistributionAssistant products={products} />;
        }
    };
    
    const tabs = [
        { id: 'Assistant', name: 'Asistente IA', icon: BrainCircuit },
        { id: 'Calculator', name: 'Calculadora', icon: Calculator },
        { id: 'ImageGenerator', name: 'Promoción IA', icon: ImageIcon },
    ];

    return (
        <div className="space-y-6">
            <PageHeader title="Herramientas de Productividad" />
            
            <div className="bg-white p-2 rounded-xl shadow-lg border border-gray-100 flex overflow-x-auto whitespace-nowrap">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 text-sm flex-shrink-0 ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <tab.icon className="w-5 h-5" />
                        <span>{tab.name}</span>
                    </button>
                ))}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                {renderContent()}
            </div>
        </div>
    );
};
