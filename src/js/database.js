// IndexedDB Caching Layer for Pokedex
const DB_NAME = 'PokedexDB';
const DB_VERSION = 1;
const STORE_NAME = 'cache';

class PokedexDatabase {
  constructor() {
    this.db = null;
  }

  // Initialize the database
  init() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        return resolve(this.db);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  // Get data from store
  async get(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        console.error(`Error getting key ${key}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Save data to store
  async set(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        console.error(`Error setting key ${key}:`, event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Check if basic Pokemon list is cached
  async isBasicListCached() {
    const list = await this.get('basic_pokemon_list');
    return list && list.length === 1025;
  }

  // Clear cache if needed (for debugging/development)
  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }
}

export const db = new PokedexDatabase();
