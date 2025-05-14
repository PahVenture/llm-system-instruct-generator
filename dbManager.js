// pv-llm-full-generator/dbManager.js
const DB_NAME = 'fileAccessDB';
const STORE_NAME = 'folderHandles';
const DB_VERSION = 1;

let db;

async function openDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const localDb = event.target.result;
            if (!localDb.objectStoreNames.contains(STORE_NAME)) {
                localDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('IndexedDB error:', event.target.error);
            reject('Error opening IndexedDB.');
        };
    });
}

export async function storeDirectoryHandle(id, handle) {
    const localDb = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = localDb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, handle });

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error storing directory handle:', event.target.error);
            reject('Error storing directory handle.');
        };
    });
}

export async function getDirectoryHandle(id) {
    const localDb = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = localDb.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = (event) => {
            resolve(event.target.result ? event.target.result.handle : null);
        };
        request.onerror = (event) => {
            console.error('Error retrieving directory handle:', event.target.error);
            reject('Error retrieving directory handle.');
        };
    });
}

export async function removeDirectoryHandle(id) {
    const localDb = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = localDb.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = (event) => {
            console.error('Error removing directory handle:', event.target.error);
            reject('Error removing directory handle.');
        };
    });
}

export async function listStoredHandles() {
    const localDb = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = localDb.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = (event) => {
            resolve(event.target.result.map(item => item.id));
        };
        request.onerror = (event) => {
            console.error('Error listing stored handles:', event.target.error);
            reject('Error listing stored handles.');
        };
    });
} 