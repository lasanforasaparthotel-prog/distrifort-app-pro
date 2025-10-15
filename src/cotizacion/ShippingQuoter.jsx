import React, { useState, useMemo } from 'react';
// Asumimos que los componentes y hooks (PageHeader, Input, Button, etc.) 
// están disponibles globalmente o se importarán desde archivos superiores.
import { MapPin, Package, DollarSign, Calculator } from 'lucide-react'; 

/* * NOTA: Este código asume que tienes acceso a:
 * - PageHeader, Card, Input, Select, Button (Componentes de UI genéricos)
 * - getPriceText (utilidad de formateo de moneda)
 * - Los módulos no necesitan datos de useData para este cálculo, ya que es una simulación local.
 */

// UTILITY: Simulación de tarifas de envío
// En una aplicación real, esto se conectaría a una API de transportista (OCA, Correo, etc.)
const SHIPPING_RATES = {
    // Tarifas por kg volumétrico (Peso real o volumétrico, el que sea mayor)
    BASE_RATE: 1500, // Costo fijo por envío
    RATE_PER_KG: 350, // Costo por kilogramo (real o volumétrico)
    RATE_PER_KM: 5,   // Costo por kilómetro recorrido (para grandes distancias)
};

// FACTORES DE CÁLCULO VOLUMÉTRICO
// Usamos el factor estándar: (Largo * Ancho * Alto) / Factor = Peso Volumétrico
const VOLUMETRIC_FACTOR = 5000; // Factor común para transporte terrestre (en cm³)

const ShippingQuoter = () => {
    const [distanceKm, setDistanceKm] = useState(10); // Distancia en km
    const [destination, setDestination] = useState(''); // Ciudad o provincia
    const [packages, setPackages] = useState([{ id: 1, weight: 1, length: 20, width: 20, height: 20 }]);

    const getPriceText = (price) => price.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });

    const handlePackageChange = (id, field, value) => {
        setPackages(prev => prev.map(pkg => 
            pkg.id === id ? { ...pkg, [field]: parseFloat(value) || 0 } : pkg
        ));
    };

    const addPackage = () => {
        setPackages(prev => [...prev, { id: Date.now(), weight: 1, length: 20, width: 20, height: 20 }]);
    };

    const removePackage = (id) => {
        setPackages(prev => prev.filter(pkg => pkg.id !== id));
    };

    const { totalWeight, volumetricWeight, totalCost } = useMemo(() => {
        let totalWeight = 0;
        let totalVolumetricWeight = 0;

        packages.forEach(pkg => {
            const volumeCm3 = pkg.length * pkg.width * pkg.height;
            const volWeight = volumeCm3 / VOLUMETRIC_FACTOR;

            totalWeight += pkg.weight;
            totalVolumetricWeight += volWeight;
        });

        // 1. Determinar el peso a facturar (el mayor entre real y volumétrico)
        const chargeableWeight = Math.max(totalWeight, totalVolumetricWeight);

        // 2. Calcular costos
        const costWeight = chargeableWeight * SHIPPING_RATES.RATE_PER_KG;
        const costDistance = distanceKm * SHIPPING_RATES.RATE_PER_KM;
        
        const finalCost = SHIPPING_RATES.BASE_RATE + costWeight + costDistance;

        return {
            totalWeight,
            volumetricWeight: totalVolumetricWeight,
            totalCost: finalCost,
        };
    }, [packages, distanceKm]);


    // --- COMPONENTES INTERNOS ---
    const PackageInput = ({ pkg }) => (
        <div className="grid grid-cols-5 gap-3 p-3 bg-gray-50 rounded-lg border">
            <Input 
                label="Peso (kg)" 
                type="number" 
                value={pkg.weight} 
                onChange={e => handlePackageChange(pkg.id, 'weight', e.target.value)} 
            />
            <Input 
                label="Largo (cm)" 
                type="number" 
                value={pkg.length} 
                onChange={e => handlePackageChange(pkg.id, 'length', e.target.value)} 
            />
            <Input 
                label="Ancho (cm)" 
                type="number" 
                value={pkg.width} 
                onChange={e => handlePackageChange(pkg.id, 'width', e.target.value)} 
            />
            <Input 
                label="Alto (cm)" 
                type="number" 
                value={pkg.height} 
                onChange={e => handlePackageChange(pkg.id, 'height', e.target.value)} 
            />
            <div className='flex items-end justify-center'>
                <Button 
                    onClick={() => removePackage(pkg.id)} 
                    className="!p-2 !bg-red-500 hover:!bg-red-600 w-full" 
                    disabled={packages.length === 1}
                >
                    <Trash2 className="w-4 h-4"/>
                </Button>
            </div>
        </div>
    );

    // --- RENDERIZADO PRINCIPAL ---
    return (
        <div className="space-y-6">
            <PageHeader title="Cotización de Envíos">
                <Button onClick={() => alert("Simulando conexión a transportista...")} icon={MapPin}>
                    Conectar Transportista
                </Button>
            </PageHeader>

            {/* Panel de Configuración de Envío */}
            <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                <h3 className="text-xl font-bold border-b pb-2 text-indigo-600">Detalles del Envío</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input 
                        label="Destino (Ciudad/Provincia)" 
                        value={destination} 
                        onChange={e => setDestination(e.target.value)} 
                        icon={MapPin}
                        placeholder="Ej: Córdoba, Mendoza"
                    />
                    <Input 
                        label="Distancia (km)" 
                        type="number" 
                        value={distanceKm} 
                        onChange={e => setDistanceKm(e.target.value)} 
                        placeholder="Distancia de la ruta"
                    />
                </div>
            </div>

            {/* Panel de Paquetes */}
            <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                <div className='flex justify-between items-center border-b pb-2'>
                    <h3 className="text-xl font-bold text-indigo-600">Paquetes a Enviar</h3>
                    <Button onClick={addPackage} icon={Plus} className="!py-1 !px-3 text-sm">
                        Añadir Bulto
                    </Button>
                </div>

                <div className="space-y-4">
                    {packages.map(pkg => <PackageInput key={pkg.id} pkg={pkg} />)}
                </div>
            </div>

            {/* Resultados y Métricas */}
            <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                <h3 className="text-xl font-bold border-b pb-2 text-green-600">Resultado de la Cotización</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Card title="Peso Total Real" value={`${totalWeight.toFixed(2)} kg`} icon={Package} color="gray"/>
                    <Card title="Peso Volumétrico" value={`${volumetricWeight.toFixed(2)} kg`} icon={Calculator} color="gray"/>
                    <Card title="Costo Estimado" value={getPriceText(totalCost)} icon={DollarSign} color="green"/>
                </div>
                
                <p className="text-sm text-gray-500 pt-2">
                    *Nota: El peso cobrable es el mayor entre el peso real ({totalWeight.toFixed(2)} kg) y el peso volumétrico ({volumetricWeight.toFixed(2)} kg). Esta es una simulación basada en tarifas internas.
                </p>
            </div>
        </div>
    );
};
