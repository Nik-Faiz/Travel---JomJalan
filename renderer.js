// renderer.js - preload script: safe bridge between pages, JSON file and Local Storage
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const KEY = 'jomjalan_plans';

contextBridge.exposeInMainWorld('api', {
  // Ask the main process to fetch JSON (used for the holidays API)
  fetchJSON(url) { return ipcRenderer.invoke('fetch-json', url); },
  // Read travel packages from local JSON file
  getPackages() {
    const file = path.join(__dirname, 'data', 'itineraries.json');  
    return JSON.parse(fs.readFileSync(file, 'utf-8')).packages;
  },
  // Read country list (name, capital, region, currency, languages)
  getCountries() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'countries.json'), 'utf-8')).countries;
  },
  // Offline fallback for the countries dataset
  getCountries() {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'countries.json'), 'utf-8'));
  },
  // Local Storage: load all saved travel plans (empty array if none / corrupted)
  getPlans() {
    try {
      const plans = JSON.parse(localStorage.getItem(KEY)) || [];
      // Repair old records that were saved with objects instead of text
      return plans.map(p => ({ ...p,
        country: (p.country && typeof p.country === 'object') ? (p.country.common || '') : String(p.country ?? ''),
        capital: Array.isArray(p.capital) ? (p.capital[0] || '') : String(p.capital ?? '') }));
    } catch (e) { return []; }
  },
  // Local Storage: save the whole array of plans
  savePlans(plans) { localStorage.setItem(KEY, JSON.stringify(plans)); }
});
