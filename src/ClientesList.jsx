import React, { useState, useEffect } from 'react';
// Importa la instancia de la Base de Datos (db) desde la configuración
// NOTA: La ruta se simplifica a './config/firebase_config.js'
import { db } from './config/firebase_config.js'; 
import { collection, getDocs } from 'firebase/firestore';

// Componente para mostrar la lista de clientes
const ClientesList = () => {
    const [clientes, setClientes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Función asíncrona para cargar los datos desde Firestore
    const fetchClientes = async () => {
        if (!db) {
             // Esto puede ocurrir si la inicialización de Firebase falla en firebase_config.js
             setError("Error: La base de datos no está inicializada. Revisa firebase_config.js.");
             setLoading(false);
             return;
        }

        try {
            // 1. Referencia a la colección
            // NOTA: Asumimos que la colección se llama 'Clientes'
            const clientesCollectionRef = collection(db, "Clientes");
            
            // 2. Obtener los documentos de la colección
            const snapshot = await getDocs(clientesCollectionRef);
            
            // 3. Mapear y transformar los datos
            const clientesData = snapshot.docs.map(doc => ({
                id: doc.id, // ID del documento
                ...doc.data() // Todos los campos dentro del documento
            }));

            setClientes(clientesData);
            setLoading(false);
            
        } catch (err) {
            console.error("Error al cargar los clientes:", err);
            // El error más común aquí es 'PERMISSION DENIED' (si las reglas de seguridad no están bien).
            setError("No se pudieron cargar los datos. Revisa las Reglas de Seguridad de Firestore y la conexión.");
            setLoading(false);
        }
    };

    // useEffect se ejecuta una vez, cuando el componente se monta
    useEffect(() => {
        fetchClientes();
    }, []); 

    // --- Lógica de Renderizado ---
    if (loading) {
        return <div className="p-4 text-center text-blue-500 font-inter">Cargando Clientes...</div>;
    }

    if (error) {
        return <div className="p-4 text-center text-red-500 font-bold font-inter">Error: {error}</div>;
    }
    
    if (clientes.length === 0) {
        return <div className="p-4 text-center text-gray-500 font-inter">No hay clientes registrados en Firestore.</div>;
    }

    // Si todo está bien, mostramos la lista
    return (
        <div className="p-6 bg-white shadow-xl rounded-lg max-w-4xl mx-auto font-inter">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 border-b pb-2">Lista de Clientes DistriFort ({clientes.length})</h2>
            <ul className="space-y-3">
                {clientes.map(cliente => (
                    <li key={cliente.id} className="p-3 bg-gray-50 rounded-md border border-gray-200 hover:bg-gray-100 transition duration-150 ease-in-out">
                        <p className="font-bold text-lg text-indigo-600">{cliente.nombre || 'Nombre no disponible'}</p>
                        <p className="text-sm text-gray-600">Email: {cliente.email || 'N/A'}</p>
                        <p className="text-sm text-gray-600">ID de Documento: <span className="font-mono text-xs bg-gray-200 px-1 rounded">{cliente.id}</span></p>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ClientesList;
