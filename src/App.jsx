import React, { useState, useEffect, useMemo, createContext, useContext, useCallback, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    // signInWithEmailAndPassword, // No usado
    // createUserWithEmailAndPassword, // No usado
    signOut,
    // GoogleAuthProvider, // No usado
    // signInWithPopup, // No usado
    signInAnonymously,
    // signInWithCustomToken // No usado en esta versión final
} from 'firebase/auth';
import {
    getFirestore, collection, doc, onSnapshot, setDoc,
    serverTimestamp, writeBatch, updateDoc, query, where, setLogLevel
} from 'firebase/firestore';
import {
    LayoutDashboard, Package, Users, Truck, Search, Plus,
    Trash2, Edit, X, DollarSign, BrainCircuit, AlertCircle, Save,
    FileText, ShoppingCart, Building, LogOut, TrendingUp, TrendingDown, Send, Mail, MapPin, Printer, Upload, Image as ImageIcon
} from 'lucide-react';

// --- 1. CONFIGURACIÓN DE FIREBASE INCORPORADA ---
const firebaseConfig = {
  apiKey: "AIzaSyDSdpnWJiIHqY9TaruFIMBsBuWtm-WsRkI",
  authDomain: "distrifort.firebaseapp.com",
  projectId: "distrifort",
  storageBucket: "distrifort.firebasestorage.app",
  messagingSenderId: "456742367607",
  appId: "1:456742367607:web:25341e7e3126fd7c04f172",
  measurementId: "G-F62DMRC8NZ"
};

const rawAppId = firebaseConfig.projectId || 'default-app-id';
const appId = rawAppId.replace(/[/.]/g, '_');

let app, db, auth;
if (Object.keys(firebaseConfig).length > 0 && firebaseConfig.apiKey) {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    setLogLevel('Debug');
} else {
    console.error("Configuración de Firebase no encontrada o incompleta.");
}

// --- 2. MODELOS DE DATOS ---
const PRODUCT_MODEL = { codigo: '', categoria: '', nombre: '', marca: '', proveedorId: '', nombreProveedor: '', presentacion: '', costo: 0, precioUnidad: 0, precioCaja: 0, precioPack: 0, precioPallet: 0, udsPorCaja: 6, udsPorPack: 0, udsPorPallet: 0, stockTotal: 0, umbralMinimo: 10, archivado: false };
const CLIENT_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', regimen: 'Minorista', minimoCompra: 0, limiteCredito: 0, saldoPendiente: 0, archivado: false };
const ORDER_MODEL = { clienteId: '', nombreCliente: '', items: [], subtotal: 0, costoEnvio: 0, descuento: 0, total: 0, estado: 'Pendiente', archivado: false };
const PROVIDER_MODEL = { nombre: '', cuit: '', telefono: '', email: '', direccion: '', archivado: false };
const PURCHASE_ORDER_MODEL = { proveedorId: '', nombreProveedor: '', items: [], costoTotal: 0, estado: 'Pendiente', archivado: false };

// --- 2b. MAPEADO DE COLECCIONES ---
const COLLECTION_NAMES = { products: 'Inventario', clients: 'Clientes', orders: 'Pedidos', providers: 'Proveedores', purchaseOrders: 'OrdenesCompra' };

// --- 3. HOOKS PERSONALIZADOS ---
const useAuth = () => { /* ... (sin cambios) ... */ };
const useCollection = (collectionName) => { /* ... (sin cambios) ... */ };

// --- 4. CONTEXTO DE DATOS Y ACCIONES ---
const DataContext = createContext(null);
const DataProvider = ({ children }) => { /* ... (sin cambios) ... */ };
const useData = () => useContext(DataContext);

// --- 5. COMPONENTES DE UI GENÉRICOS ---
const FORMAT_CURRENCY = (value) => (value || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' });
const Button = React.memo(({ children, onClick, className = '', icon: Icon, disabled = false, type = 'button' }) => (<button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-semibold transition duration-200 ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'} ${className}`}>{Icon && <Icon className="w-5 h-5" />}<span>{children}</span></button>));
const Modal = ({ title, children, onClose }) => (<div className="fixed inset-0 bg-gray-900 bg-opacity-80 z-50 flex items-center justify-center p-4 animate-fade-in"><div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col"><div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10 rounded-t-xl"><h3 className="text-lg font-bold text-gray-800">{title}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition"><X /></button></div><div className="p-4 md:p-6 overflow-y-auto">{children}</div></div></div>);
const Input = React.memo(({ label, name, value, onChange, type = 'text', required = false, placeholder = "", icon: Icon, className = '', step = 'any' }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><div className="relative"><input type={type} name={name} value={value ?? ''} onChange={onChange} required={required} placeholder={placeholder} className={`w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition ${Icon ? 'pl-10' : ''} ${className}`} step={step} />{Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}</div></div>));
const Select = React.memo(({ label, name, value, onChange, children, required = false }) => (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label><select name={name} value={value ?? ''} onChange={onChange} required={required} className="w-full p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition">{children}</select></div>));
const Card = React.memo(({ title, value, icon: Icon, color = 'indigo', onClick }) => (<div onClick={onClick} className={`bg-white p-4 rounded-xl shadow-md border border-gray-100 flex-1 ${onClick ? 'cursor-pointer hover:shadow-lg transition-shadow' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-gray-500">{title}</p>{Icon && <Icon className={`w-6 h-6 text-${color}-500`} />}</div><p className="text-2xl md:text-3xl font-bold mt-1 text-gray-800">{value}</p></div>));
const PageLoader = ({ text }) => (<div className="min-h-screen flex flex-col items-center justify-center text-gray-500"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div><p className="mt-2">{text}</p></div>);
const PageHeader = React.memo(({ title, children }) => (<div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4"><h2 className="text-2xl md:text-3xl font-bold text-gray-800">{title}</h2><div>{children}</div></div>));
const PrintableDocument = React.forwardRef(({ children, title, logoText = "DistriFort" }, ref) => (<div ref={ref} className="p-6 print:p-0 print:text-black w-full min-h-screen"><div className="hidden print:block mb-8 border-b-2 border-gray-900 pb-2"><h1 className="text-3xl font-black">{logoText}</h1><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm">Fecha de Emisión: {new Date().toLocaleDateString()}</p></div>{children}<style dangerouslySetInnerHTML={{__html: `@page { size: A4; margin: 1cm; } body { margin: 0 !important; } .print\\:hidden { display: none !important; } .hidden.print\\:block { display: block !important; } .print\\:text-black { color: #000 !important; } .print\\:p-0 { padding: 0 !important; } @media print { .no-print { display: none !important; } }`}} /></div>));

// --- 6. LÓGICA DE IA (GEMINI) --- (MODIFICADA PARA USAR PROXY)
const secureGeminiFetch = async (prompt, isImageGeneration = false) => {
    // --- INICIO MODIFICACIÓN: LLAMAR AL PROXY ---
    // La URL ahora apunta a tu función de Vercel
    const proxyUrl = '/api/proxy_gemini'; // Ruta relativa
    // --- FIN MODIFICACIÓN ---

    try {
        console.log(`[secureGeminiFetch] Calling Proxy: ${proxyUrl}`);

        // --- INICIO MODIFICACIÓN: PAYLOAD PARA EL PROXY ---
        // Enviar el prompt y una bandera para indicar si es imagen
        const payload = {
            prompt: prompt,
            isImage: isImageGeneration // Añadimos esta bandera
        };
        // --- FIN MODIFICACIÓN ---

        // Implementar reintentos con backoff exponencial (como antes)
        let response;
        let attempts = 0;
        const maxAttempts = 3;
        let delay = 1000;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                // --- INICIO MODIFICACIÓN: LLAMADA A FETCH AL PROXY ---
                response = await fetch(proxyUrl, { // Usar proxyUrl
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload), // Enviar el nuevo payload
                });
                // --- FIN MODIFICACIÓN ---

                // Manejo de reintentos (sin cambios)
                if (response.status === 429 || response.status >= 500) {
                   if (attempts >= maxAttempts) throw new Error(`Proxy error after ${attempts} attempts (status ${response.status}).`);
                   console.warn(`[secureGeminiFetch] Proxy attempt ${attempts} failed (${response.status}). Retrying in ${delay / 1000}s...`);
                   await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2; continue;
                }
                break;
            } catch (networkError) {
                 if (attempts >= maxAttempts) throw networkError;
                 console.warn(`[secureGeminiFetch] Proxy attempt ${attempts} network error. Retrying in ${delay / 1000}s...`, networkError);
                 await new Promise(resolve => setTimeout(resolve, delay)); delay *= 2;
            }
        }

        if (!response) throw new Error("No response from proxy after attempts.");

        if (!response.ok) {
            let errorData;
            try { errorData = await response.json(); } catch (e) { throw new Error(`HTTP error ${response.status}: ${response.statusText}`); }
            // El proxy debería devolver un error en formato { error: "mensaje" }
            const message = errorData?.error || `Error ${response.status} desde el proxy.`;
            console.error("[secureGeminiFetch] Proxy Error Data:", errorData);
            throw new Error(message);
        }

        const data = await response.json();

        // --- INICIO MODIFICACIÓN: PROCESAR RESPUESTA DEL PROXY ---
        // El proxy ahora debería devolver { text: "..." } o { imageUrl: "data:..." }
        if (isImageGeneration) {
            if (!data.imageUrl) throw new Error("Proxy no devolvió una URL de imagen válida.");
            return data.imageUrl; // Usar la URL base64 devuelta por el proxy
        } else {
            if (!data.text) { console.warn("Respuesta del proxy vacía:", data); return "Proxy no generó respuesta válida."; }
            return data.text; // Usar el texto devuelto por el proxy
        }
        // --- FIN MODIFICACIÓN ---

    } catch (error) {
        console.error("[secureGeminiFetch] Final Error calling Proxy:", error);
        return `Hubo un error al conectar con el asistente de IA vía proxy. (Detalle: ${error.message})`;
    }
};


// --- 8. MÓDULOS FUNCIONALES (PÁGINAS) ---
// (Componentes FormComponent, ManagerComponent, Módulos Producto, Clientes, Proveedores, Pedidos, OC, Lista Precios, Búsqueda, Cotización, Herramientas, Dashboard, Importador)
// ... (Sin cambios funcionales en estos módulos, usar las definiciones completas anteriores) ...
const FormComponent = React.memo(({ model, onSave, onCancel, children, ...props }) => { /* ... */ });
const ManagerComponent = React.memo(({ title, collectionName, model, FormFields, TableHeaders, TableRow, ...props }) => { /* ... */ });
const ProductFormFields = React.memo(({ item, handleChange, providers }) => { /* ... */ });
const ProductTableRow = React.memo(({ item, onEdit, onArchive }) => { /* ... */ });
const ProductManager = () => { /* ... */ };
const ClientFormFields = React.memo(({ item, handleChange }) => { /* ... */ });
const ClientTableRow = React.memo(({ item, onEdit, onArchive }) => { /* ... */ });
const ClientManager = () => { /* ... */ };
const ProviderFormFields = React.memo(({ item, handleChange }) => { /* ... */ });
const ProviderTableRow = React.memo(({ item, onEdit, onArchive }) => { /* ... */ });
const ProviderManager = () => { /* ... */ };
const generateWhatsAppLink = (client, order) => { /* ... */ };
const OrderPrintable = React.forwardRef(({ order, client }, ref) => { /* ... */ });
const OrderForm = ({ model, onSave, onCancel }) => { /* ... */ };
const OrderManager = () => { /* ... */ };
const generatePurchaseOrderLink = (provider, po) => { /* ... */ };
const PurchaseOrderPrintable = React.forwardRef(({ po, provider }, ref) => { /* ... */ });
const PurchaseOrderForm = ({ model, onSave, onCancel, products, providers }) => { /* ... */ };
const PurchaseOrderManager = () => { /* ... */ };
const PriceListPrintable = React.forwardRef(({ groupedProducts, client }, ref) => { /* ... */ });
const PriceListManager = () => { /* ... */ };
const GlobalSearch = () => { /* ... */ };
const ShippingQuoter = () => { /* ... */ };
const ProfitCalculator = () => { /* ... */ };
const AIChat = () => { /* ... */ };
const PromotionGenerator = () => { /* ... */ };
const Tools = () => { /* ... */ };
const Dashboard = ({ setCurrentPage }) => { /* ... */ };
const PriceListImporter = () => { /* ... */ };


// --- 9. APP PRINCIPAL Y NAVEGACIÓN ---
const AppLayout = () => { /* ... (sin cambios, usar definición completa anterior) ... */ };
export default function DistriFortApp() { return ( <DataProvider> <AppController /> </DataProvider> ); };
const AppController = () => { /* ... (sin cambios, usar definición completa anterior) ... */ };

