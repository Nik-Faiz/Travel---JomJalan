// index.js - Explore page: API calls, suggestion logic, calculation
const $ = id => document.getElementById(id);
let current = null; // holds latest data: {country, weather, rate, suggestion}

// ---------- DOM helpers ----------
function showMsg(el, text, type) { el.textContent = text; el.className = 'msg ' + type; }
function clearMsg(el) { el.textContent = ''; el.className = 'msg'; }
function kv(label, value) { return `<div class="kv"><b>${label}:</b> ${value}</div>`; }

// Convert Open-Meteo weather code to label + category used by suggestion logic
function describeWeather(code) {
  if (code === 0) return { label: 'Clear sky', cat: 'clear' };
  if (code <= 3) return { label: 'Partly cloudy', cat: 'cloudy' };
  if (code <= 48) return { label: 'Foggy', cat: 'cloudy' };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Rainy', cat: 'rain' };
  if (code <= 77 || code >= 85 && code <= 86) return { label: 'Snowy', cat: 'snow' };
  return { label: 'Thunderstorm', cat: 'storm' };
}

// ---------- API integration (5 external APIs + local JSON packages) ----------
async function getJSON(url, label) {
  let res;
  try { res = await fetch(url); }
  catch (e) { throw new Error(`${label} could not be reached (${e.message})`); } // network / blocked
  if (!res.ok) throw new Error(`${label} failed (HTTP ${res.status})`);
  try { return await res.json(); } catch (e) { throw new Error(`${label} returned no data`); }
}
// Holidays API request goes through the main process (avoids CORS/CSP blocking)
async function holidayRequest(url) {
  try { return await window.api.fetchJSON(url); }
  catch (e) { throw new Error('Holidays API failed (' + String(e.message).replace(/^Error invoking remote method '[^']*': (Error: )?/, '') + ')'); }
}
let countryList = null, usingOffline = false; // dataset is downloaded once, then cached

async function search() {
  const name = $('countryInput').value.trim();
  clearMsg($('status'));
  if (!/^[\p{L}\s.'-]{2,}$/u.test(name)) { // input validation
    showMsg($('status'), 'Please enter a valid country name (letters only).', 'error'); return; }
  showMsg($('status'), 'Loading data...', 'info');
  $('results').classList.add('hidden');
  try {
    // API 1: Countries dataset (JSON via jsDelivr) - capital, region, currency, languages
    if (!countryList) {
      try { countryList = await window.api.fetchJSON('https://cdn.jsdelivr.net/gh/mledoze/countries@master/dist/countries.json'); usingOffline = false; }
      catch (e) { console.warn('Online country list failed:', e.message, '- using local data/countries.json'); 
        countryList = window.api.getCountries(); usingOffline = true; }
    }
    // Accent-insensitive search + common aliases (e.g. "Turkiye" -> Turkey)
    const aliases = { malay : 'malaysia', turkiye: 'turkey', usa: 'united states', us: 'united states', america: 'united states', 
      uk: 'united kingdom', britain: 'united kingdom', uae: 'united arab emirates', burma: 'myanmar', korea: 'south korea', palestine: 'palestine' };
    const norm = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const q = aliases[norm(name)] || norm(name);
    const c = countryList.find(x => norm(x.name.common) === q || norm(x.name.official) === q || (x.altSpellings || []).some(s => norm(s) === q))
          || countryList.find(x => norm(x.name.common).startsWith(q));
    if (!c) { showMsg($('status'), `No results found for "${name}". Check the spelling.` + (usingOffline ?
       ' (Offline list has only 30 countries - check your connection.)' : ''), 'error'); return; } // empty result
    const cur = Object.keys(c.currencies || {})[0];
    const capital = (c.capital || [])[0] || c.name.common;

    // Capital coordinates (Open-Meteo Geocoding); falls back to the country centre point
    let [lat, lon] = c.latlng;
    try {
      const g = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(capital)}&count=1&countryCode=${c.cca2}`, 'Geocoding API');
      if (g.results) { lat = g.results[0].latitude; lon = g.results[0].longitude; }
    } catch (e) { /* keep fallback */ }

    // API 2: Open-Meteo - current weather + 5-day forecast
    const w = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto`, 'Weather API');

    // API 3: ExchangeRate API - MYR -> destination currency
    let rate = null;
    try { const ex = await getJSON('https://open.er-api.com/v6/latest/MYR', 'Exchange rate API'); rate = ex.rates[cur] || null; } catch (e) { rate = null; }

    // API 4: Wikipedia - destination summary
    let wiki = null;
    try { wiki = await getJSON('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(c.name.common), 'Wikipedia API'); } catch (e) { wiki = null; }

    // API 5: Nager.Date - public holidays (this year + next year), keep upcoming ones
    let holidays = [];
    const y = new Date().getFullYear(), today = new Date().toISOString().slice(0, 10);
    const res = await Promise.allSettled([1, 0].map(n => holidayRequest(`https://date.nager.at/api/v3/PublicHolidays/${y + n}/${c.cca2}`)));
    holidays = res.flatMap(r => r.status === 'fulfilled' ? r.value : []).filter(h => h.date >= today).sort((p, q2) => p.date.localeCompare(q2.date)).slice(0, 4);
    const failed = res.filter(r => r.status === 'rejected'); // keep the reason so it can be shown
    if (failed.length) console.warn('Holiday request problem:', failed.map(f => f.reason.message));
    const holidayNote = holidays.length ? '' : (failed.length === res.length ? failed[0].reason.message : 'No upcoming public holidays returned for this country.');

    current = { country: c, weather: w, rate, cur, wiki, holidays, holidayNote };
    current.suggestion = suggest(c.region, w.current.temperature_2m, describeWeather(w.current.weather_code).cat, w.current.wind_speed_10m, holidays[0]);
    render();
    if (usingOffline) showMsg($('status'), 'Online country list unavailable - using the offline list of 30 countries.', 'info'); else clearMsg($('status'));
  } catch (err) { // error handling: failed request
    console.error(err);
    showMsg($('status'), 'Could not load data: ' + err.message, 'error'); // names the API that failed
  }
}

// ---------- Suggestion logic (student-written control statements) ----------
function suggest(region, temp, cat, wind, holiday) {
  let acts = [];
  // 1) Weather condition decides main activity type
  switch (cat) {
    case 'clear':
      if (temp >= 30) acts.push('Beach or island hopping', 'Swimming & water sports', 'Visit sights early morning / evening to avoid heat');
      else if (temp >= 20) acts.push('City walking tour', 'Outdoor markets', 'Scenic photography');
      else acts.push('Sightseeing with a light jacket', 'Hiking nature trails');
      break;
    case 'cloudy':
      acts.push('Museum & gallery visits', 'Cafe hopping', 'Cultural walking tour'); break;
    case 'rain':
      acts.push('Indoor shopping malls', 'Museums & aquariums', 'Local food tasting at restaurants'); break;
    case 'snow':
      acts.push('Skiing / snowboarding', 'Hot spring or spa', 'Winter festival visit'); break;
    case 'storm':
      acts.push('Stay indoors: hotel spa, cinema', 'Reschedule outdoor tours'); break;
  }
  // 2) Country region adds a regional flavour
  if (region === 'Asia') acts.push('Try street food & night markets');
  else if (region === 'Europe') acts.push('Historic old-town and castle tour');
  else if (region === 'Africa') acts.push('Safari or nature reserve (if weather allows)');
  else if (region === 'Americas') acts.push('National park or city skyline tour');
  else if (region === 'Oceania') acts.push('Coastal drive and wildlife tour');
  // 3) Extra safety rule
  if (wind > 40) acts.unshift('⚠ Strong wind: avoid boat trips and high viewpoints');
  // 4) Public holiday within 14 days -> crowd warning
  if (holiday && (new Date(holiday.date) - new Date()) / 86400000 <= 14) acts.push(`Public holiday "${holiday.name}" on ${holiday.date}: book early, expect crowds`);
  // 5) Fallback if nothing suitable
  if (acts.length === 0) return { activities: [], text: 'No suitable suggestion available for these conditions. Try another destination.' };
  return { activities: acts, text: acts.join(' • ') };
}

// ---------- Render results (DOM manipulation) ----------
function render() {
  const { country: c, weather: w, rate, cur, wiki, holidays } = current;
  const cw = describeWeather(w.current.weather_code);
  $('countryBox').innerHTML = `<img class="flag" src="https://flagcdn.com/w160/${c.cca2.toLowerCase()}.png" alt="Flag of ${c.name.common}">` +
    kv('Country', c.name.official) + kv('Capital', (c.capital || ['N/A'])[0]) + kv('Region', c.region + (c.subregion ? ' / ' + c.subregion : '')) +
    kv('Area', c.area ? c.area.toLocaleString() + ' km²' : 'N/A') + kv('Languages', Object.values(c.languages || {}).join(', ') || 'N/A') +
    kv('Currency', cur ? `${c.currencies[cur].name} (${cur})` : 'N/A') +
    kv('Exchange rate', rate ? `1 MYR = ${rate.toFixed(3)} ${cur}` : 'Unavailable');

  let fc = w.daily.time.map((d, i) => `<div class="day"><b>${d.slice(5)}</b><br>${describeWeather(w.daily.weather_code[i]).label}<br>${Math.round(w.daily.temperature_2m_min[i])}–${Math.round(w.daily.temperature_2m_max[i])}°C</div>`).join('');
  $('weatherBox').innerHTML = kv('Now', `${cw.label}, ${w.current.temperature_2m}°C`) + kv('Wind', w.current.wind_speed_10m + ' km/h') + `<div class="forecast">${fc}</div>`;

  $('wikiBox').innerHTML = wiki && wiki.extract ? `<p>${wiki.extract}</p>` : '<p>No description available.</p>';
  $('suggestBox').textContent = current.suggestion.text;
  $('holidayBox').innerHTML = holidays.length ? holidays.map(h => kv(h.date, `${h.name} (${h.localName})`)).join('') : `<p>${current.holidayNote || 'No upcoming public holiday data available.'}</p>`;

  // Packages from local JSON filtered by region
  const pk = window.api.getPackages().filter(p => p.regions.includes(c.region));
  $('pkgBox').innerHTML = pk.length ? pk.map(p => `<div class="pkg"><b>${p.name}</b> (${p.type})<br>${p.days} days – RM ${p.priceMYR.toLocaleString()}<br><small>${p.includes}</small></div>`).join('') : '<p>No packages available for this region.</p>';
  $('pkgSelect').innerHTML = '<option value="0">No package</option>' + pk.map(p => `<option value="${p.id}">${p.name} – RM ${p.priceMYR}</option>`).join('');
  $('calcResult').classList.add('hidden'); clearMsg($('calcMsg'));
  $('results').classList.remove('hidden');
}

// ---------- Calculation: total trip cost ----------
function calculate() {
  clearMsg($('calcMsg'));
  const days = Number($('days').value), trav = Number($('travelers').value), daily = Number($('daily').value);
  if (!Number.isInteger(days) || days < 1 || days > 60) return showMsg($('calcMsg'), 'Days must be a whole number from 1 to 60.', 'error');
  if (!Number.isInteger(trav) || trav < 1 || trav > 20) return showMsg($('calcMsg'), 'Travelers must be from 1 to 20.', 'error');
  if (isNaN(daily) || daily < 0) return showMsg($('calcMsg'), 'Daily spending cannot be negative.', 'error');
  const pkg = window.api.getPackages().find(p => p.id === $('pkgSelect').value);
  const pkgCost = pkg ? pkg.priceMYR * trav : 0;       // package price per person
  const spend = daily * days * trav;                    // personal spending
  const total = pkgCost + spend;
  let html = `<div class="kv"><b>Package cost:</b> RM ${pkgCost.toFixed(2)}</div><div class="kv"><b>Spending (${days} days × ${trav} person × RM ${daily}):</b> 
  RM ${spend.toFixed(2)}</div><div class="kv"><b>Total:</b> RM ${total.toFixed(2)}</div><div class="kv"><b>Per person:</b> RM ${(total / trav).toFixed(2)}</div>`;
  if (current.rate) html += `<div class="kv"><b>Total in ${current.cur}:</b> ${(total * current.rate).toFixed(2)} ${current.cur}</div>`;
  $('calcResult').innerHTML = html; $('calcResult').classList.remove('hidden');
  current.total = total; current.days = days; current.travelers = trav;
}

// ---------- Save plan to Local Storage (Create) ----------
function savePlan() {
  const c = current.country;
  const plans = window.api.getPlans();
  plans.push({
    id: Date.now(), country: c.name.common, capital: (c.capital || [''])[0],
    startDate: '', endDate: '', travelers: current.travelers || 1,
    budget: current.total ? Math.round(current.total) : 0,
    weather: `${describeWeather(current.weather.current.weather_code).label}, ${current.weather.current.temperature_2m}°C`,
    suggestion: current.suggestion.text, notes: ''
  });
  window.api.savePlans(plans);
  showMsg($('status'), `Saved "${c.name.common}" to My Travel Plans. Open that page to add dates and notes.`, 'success');
}

// ---------- Event handlers ----------
$('searchBtn').addEventListener('click', search);                       // 1) click: search
$('countryInput').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });// 2) Enter key
$('calcBtn').addEventListener('click', calculate);                      // 3) click: calculate
$('savePlanBtn').addEventListener('click', savePlan);                   // 4) click: save plan
$('pkgSelect').addEventListener('change', () => {                       // 5) change: auto-fill days
  const p = window.api.getPackages().find(x => x.id === $('pkgSelect').value);
  if (p) $('days').value = p.days;
});

// Fill the autocomplete list (datalist) with country names from the local data file
// 1) getCountries() reads the country objects from data/countries.json
// 2) map() turns each country into an <option> tag using its common name (e.g. "Germany")
// 3) join('') combines all the tags into one string, which is placed inside the datalist
$('countryList').innerHTML = window.api.getCountries().map(c => `<option value="${c.name.common}">`).join('');
