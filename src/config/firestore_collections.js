// Archivo: src/config/firestore_collections.js
// Propósito: Exportar referencias a todas las colecciones de Firestore para garantizar consistencia.

import { collection } from 'firebase/firestore';
import { db } from './firebase_config.js'; // Importamos la instancia de la base de datos

// --- Módulos de Gestión Principal ---
export const clientsCollection = collection(db, 'Clientes');
export const ordersCollection = collection(db, 'Pedidos');
export const inventoryCollection = collection(db, 'Inventario');

// --- Módulos de Apoyo ---
export const providersCollection = collection(db, 'Proveedores');
export const purchaseOrdersCollection = collection(db, 'OrdenesCompra');
export const priceListsCollection = collection(db, 'ListasPrecios');

// NOTA: Para usar estas colecciones, simplemente impórtalas:
// import { clientsCollection, ordersCollection } from '../config/firestore_collections.js';
// Y úsalas directamente en tus consultas:
// const q = query(clientsCollection, where("activo", "==", true));
