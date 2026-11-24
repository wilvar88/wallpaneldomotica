/* ========================================
   WALL PANEL DOMÓTICO - SCRIPT V3 (Room Based)
   ======================================== */

/* ========================================
   CONFIGURACIÓN & CREDENCIALES
   ======================================== */
const CONFIG = {
  TUYA_ACCESS_ID: '',
  TUYA_ACCESS_SECRET: '',
  TUYA_UID: '',
  TUYA_REGION: 'us',
  AUTO_REFRESH_INTERVAL: 2000, // 2 seconds for faster state updates
  WEATHER_UPDATE_INTERVAL: 1800000,
};

const TUYA_API_URLS = {
  'us': 'https://openapi.tuyaus.com',
  'eu': 'https://openapi.tuyaeu.com',
  'cn': 'https://openapi.tuyacn.com',
  'in': 'https://openapi.tuyain.com',
};

// Configuración de Salas (Persistente)
const ROOM_CONFIG_KEY = 'wallpanel_v3_room_config';
let roomSettings = JSON.parse(localStorage.getItem(ROOM_CONFIG_KEY)) || {
  'Cocina': { devices: [], bg: 'backgrounds/Cocina.png', layout: 'grid' },
  'Salon': { devices: [], bg: 'backgrounds/Fondo 2.jpg', layout: 'grid' },
  'Oficina': { devices: [], bg: 'backgrounds/Oficina.png', layout: 'grid' },
  'Habitación': { devices: [], bg: 'backgrounds/Habitación.png', layout: 'grid' },
  'Todos': { devices: [], bg: 'backgrounds/Casa.png', layout: 'grid' } // Todos is special
};

// SmartThings Token
let SMARTTHINGS_TOKEN = localStorage.getItem('smartthings_token') || '';

const MULTI_SWITCH_NAMES = ['Salon', 'Cocina', 'Pasillo Estudio'];

// Nombres Personalizados para Sub-Switches (Mapeo manual basado en las imágenes/info)
// Si no hay mapeo, se usa "Switch X"
const SUB_SWITCH_LABELS = {
  'Salon': ['Luz Comedor', 'Luz Sala', 'Luz Calida', 'Luz Ambiente'],
  'Cocina': ['Luz Blanca', 'Luz Calida', 'Microondas', 'Auxiliar'],
  'Pasillo Estudio': ['Luz Pasillo', 'Luz Estudio']
};

// Mapeo de Iconos
const ICON_MAPPING = {
  'Arbolito': 'custom-icons/Arbolito.svg',
  'Chimenea': 'custom-icons/Chimenea.svg',
  'Habitación 2': 'custom-icons/Habitación 2.svg',
  'Habitación': 'custom-icons/Habitación.svg',
  'Luz Barra': 'custom-icons/Luz Barra.svg',
  'Luz Corniza': 'custom-icons/Luz Corniza.svg',
  'Luz Oficina': 'custom-icons/Luz Oficina.svg',
  'Oficina': 'custom-icons/Oficina.svg',
  'Pasillo Estudio': 'custom-icons/Pasillo Estudio.svg',
  'Salon': 'custom-icons/Salon.svg',
  'Cocina': 'custom-icons/Cocina.svg',
  'Cuarto de ropa': 'custom-icons/Cuarto de ropa.svg',
  'Toma Camara': 'custom-icons/Toma Camara.svg',
  'light': 'custom-icons/lightbulb.svg',
  'Lavadora': 'custom-icons/Lavadora.svg',
  'switch': 'custom-icons/switch.svg',
  'outlet': 'custom-icons/outlet.svg',
  'fan': 'custom-icons/fan.svg',
  'curtain': 'custom-icons/curtain.svg',
  'sensor': 'custom-icons/sensor.svg',
  'Camara': 'custom-icons/Camara.svg',
  'lock': 'custom-icons/lock.svg',
  'thermostat': 'custom-icons/thermostat.svg',
  'air_quality': 'custom-icons/sensor.svg',
  'vibration': 'custom-icons/sensor.svg',
  'tv': 'custom-icons/Camara.svg', // Fallback for TV if no specific icon
  'default': 'custom-icons/device.svg',
};

/* ========================================
   ESTADO GLOBAL
   ======================================== */
let currentHls = null;
let allDevices = [];
let groupedDevices = []; // Processed multi-switches
let accessToken = null;
let tokenExpiry = 0;
let currentView = 'home'; // 'home', 'room', 'music'
let activeRoom = null;
let currentGlobalPage = 0; // Page index for the carousel
let currentSpotifyData = null; // Store current Spotify playback for widgets

/* ========================================
   AIR QUALITY STATUS UPDATER
   ======================================== */

// Track previous danger states to detect changes
let previousDangerStates = {
  temp: false,
  hum: false,
  co2: false,
  co: false
};

let airAlertSound = null;
let alertShown = false;

function playAlertSound() {
  // Create a beep sound using Web Audio API
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800; // Frequency in Hz
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);

  // Play 3 beeps
  setTimeout(() => {
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 800;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    osc2.start();
    osc2.stop(audioContext.currentTime + 0.5);
  }, 600);

  setTimeout(() => {
    const osc3 = audioContext.createOscillator();
    const gain3 = audioContext.createGain();
    osc3.connect(gain3);
    gain3.connect(audioContext.destination);
    osc3.frequency.value = 800;
    osc3.type = 'sine';
    gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    osc3.start();
    osc3.stop(audioContext.currentTime + 0.5);
  }, 1200);
}

function showAirQualityAlert(dangerItems) {
  if (alertShown) return; // Don't show multiple times

  const modal = document.getElementById('airQualityAlert');
  const message = document.getElementById('airAlertMessage');

  if (!modal || !message) return;

  let messageHTML = '<p>Se han detectado valores peligrosos:</p><ul style="text-align: left; margin: 20px auto; max-width: 300px;">';

  dangerItems.forEach(item => {
    messageHTML += `<li><strong>${item.name}:</strong> ${item.value}</li>`;
  });

  messageHTML += '</ul><p>Por favor, ventila el área inmediatamente.</p>';

  message.innerHTML = messageHTML;
  modal.style.display = 'flex';
  alertShown = true;

  playAlertSound();
}

window.closeAirQualityAlert = function () {
  const modal = document.getElementById('airQualityAlert');
  if (modal) {
    modal.style.display = 'none';
    alertShown = false;
  }
};

function updateAirQualityStatus() {
  const tempPill = document.getElementById('pill-temp');
  const humPill = document.getElementById('pill-hum');
  const co2Pill = document.getElementById('pill-co2');
  const coPill = document.getElementById('pill-co');

  // Helper to extract numeric value from text
  const getValue = (text) => parseFloat(text.replace(/[^0-9.]/g, ''));

  let newDangerItems = [];
  let currentDangerStates = { temp: false, hum: false, co2: false, co: false };

  // Temperature thresholds (°C)
  if (tempPill && tempPill.textContent !== '--°C') {
    const temp = getValue(tempPill.textContent);
    tempPill.classList.remove('safe-value', 'warning-value', 'danger-value');
    if (temp >= 18 && temp <= 24) {
      tempPill.classList.add('safe-value');
    } else if ((temp >= 15 && temp < 18) || (temp > 24 && temp <= 28)) {
      tempPill.classList.add('warning-value');
    } else {
      tempPill.classList.add('danger-value');
      currentDangerStates.temp = true;
      if (!previousDangerStates.temp) {
        newDangerItems.push({ name: 'Temperatura', value: tempPill.textContent });
      }
    }
  }

  // Humidity thresholds (%)
  if (humPill && humPill.textContent !== '--%') {
    const hum = getValue(humPill.textContent);
    humPill.classList.remove('safe-value', 'warning-value', 'danger-value');
    if (hum >= 30 && hum <= 60) {
      humPill.classList.add('safe-value');
    } else if ((hum >= 25 && hum < 30) || (hum > 60 && hum <= 70)) {
      humPill.classList.add('warning-value');
    } else {
      humPill.classList.add('danger-value');
      currentDangerStates.hum = true;
      if (!previousDangerStates.hum) {
        newDangerItems.push({ name: 'Humedad', value: humPill.textContent });
      }
    }
  }

  // CO2 thresholds (ppm)
  if (co2Pill && co2Pill.textContent !== '--') {
    const co2 = getValue(co2Pill.textContent);
    co2Pill.classList.remove('safe-value', 'warning-value', 'danger-value');
    if (co2 < 800) {
      co2Pill.classList.add('safe-value');
    } else if (co2 >= 800 && co2 <= 1200) {
      co2Pill.classList.add('warning-value');
    } else {
      co2Pill.classList.add('danger-value');
      currentDangerStates.co2 = true;
      if (!previousDangerStates.co2) {
        newDangerItems.push({ name: 'CO2', value: co2Pill.textContent + ' ppm' });
      }
    }
  }

  // CO thresholds (ppm)
  if (coPill && coPill.textContent !== '--') {
    const co = getValue(coPill.textContent);
    coPill.classList.remove('safe-value', 'warning-value', 'danger-value');
    if (co >= 0 && co <= 9) {
      coPill.classList.add('safe-value');
    } else if (co > 9 && co <= 35) {
      coPill.classList.add('warning-value');
    } else {
      coPill.classList.add('danger-value');
      currentDangerStates.co = true;
      if (!previousDangerStates.co) {
        newDangerItems.push({ name: 'CO', value: coPill.textContent + ' ppm' });
      }
    }
  }

  // Show alert if new danger detected
  if (newDangerItems.length > 0) {
    showAirQualityAlert(newDangerItems);
  }

  // Update previous states
  previousDangerStates = currentDangerStates;
}

/* ========================================
   INICIALIZACIÓN
   ======================================== */
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Iniciando Wall Panel V3...');

  // UI Init
  updateClock();
  setInterval(updateClock, 1000);
  updateWeather();
  setInterval(updateWeather, CONFIG.WEATHER_UPDATE_INTERVAL);

  // Air Quality Status Updates
  updateAirQualityStatus();
  setInterval(updateAirQualityStatus, 2000); // Check every 2 seconds

  // Initial Load
  initializeTuya();

  // Auto Refresh (Regular Devices)
  setInterval(() => {
    console.log('🔄 Auto-refreshing...');
    loadDevices(true); // silent refresh
  }, CONFIG.AUTO_REFRESH_INTERVAL);

  // REAL-TIME MONITOR (1000ms) - Air Quality & Alerts
  startRealTimeMonitor();
});

/* ========================================
   TUYA API LOGIC
   ======================================== */
async function initializeTuya() {
  try {
    await getAccessToken();
    await loadDevices();
  } catch (error) {
    console.error('Initial Connection Error:', error);
    showNotification('Error conectando con Tuya', 'error');
  }
}

async function getAccessToken() {
  const now = Date.now();
  if (accessToken && tokenExpiry > now) return accessToken;

  const baseUrl = TUYA_API_URLS[CONFIG.TUYA_REGION];
  const path = '/v1.0/token?grant_type=1';
  const timestamp = Date.now().toString();
  const signStr = CONFIG.TUYA_ACCESS_ID + timestamp + 'GET\n' +
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n\n' + path;

  const signature = CryptoJS.HmacSHA256(signStr, CONFIG.TUYA_ACCESS_SECRET).toString(CryptoJS.enc.Hex).toUpperCase();

  const response = await fetch(baseUrl + path, {
    method: 'GET',
    headers: {
      'client_id': CONFIG.TUYA_ACCESS_ID,
      'sign': signature,
      'sign_method': 'HMAC-SHA256',
      't': timestamp,
    }
  });

  const data = await response.json();
  if (!data.success) throw new Error(data.msg);

  accessToken = data.result.access_token;
  tokenExpiry = now + (data.result.expire_time * 1000);
  return accessToken;
}

async function loadDevices(silent = false) {
  const container = document.getElementById('deviceGrid');
  if (container && !silent) {
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>Conectando servicios...</p></div>';
  }

  try {
    let tuyaDevices = [];

    // 1. Tuya Load (Via Local Server)
    try {
      const response = await fetch('/api/devices');
      if (response.ok) {
        tuyaDevices = await response.json();
        console.log(`[TuyaSync] Loaded ${tuyaDevices.length} devices via Server`);
      } else {
        throw new Error("Local server failed to provide Tuya devices");
      }
    } catch (e) {
      console.warn("Tuya server load failed, checking config for direct fallback...", e);
      // Fallback: Original direct fetch logic (requires browser extension)
      if (CONFIG.TUYA_ACCESS_ID && CONFIG.TUYA_ACCESS_SECRET && !silent) {
        // ... (Direct fetch logic if server fails, keeping it as fallback)
      }
    }

    // 2. SmartThings Load
    let stDevices = await loadSmartThingsDevices();

    // Get statuses for ST in parallel (FULL STATUS)
    if (stDevices.length > 0) {
      await Promise.all(stDevices.map(async (d) => {
        const fullStatus = await getSmartThingsDeviceStatus(d.id);
        d.fullStatus = fullStatus;

        // CRITICAL FIX: Robust isOn detection for all device types
        d.isOn = false;
        if (fullStatus && fullStatus.components) {
          const main = fullStatus.components.main;

          // 1. Standard Switch
          if (main.switch?.switch?.value === 'on') d.isOn = true;

          // 2. Washer / Dryer (Machine States)
          const mState = main.washerOperatingState?.machineState?.value ||
            main.dryerOperatingState?.machineState?.value;
          if (mState && mState !== 'stop' && mState !== 'off' && mState !== 'none') {
            d.isOn = true;
          }

          // 3. Audio/TV State
          if (main.mediaPlayback?.playbackStatus?.value === 'playing') d.isOn = true;

          console.log(`[ST Sync] ${d.name} state: ${d.isOn} (Raw: ${mState || main.switch?.switch?.value})`);
        }
      }));
    }

    // 3. Merge
    const manualDevices = JSON.parse(localStorage.getItem('manual_ip_devices')) || [];
    allDevices = [...tuyaDevices, ...stDevices, ...manualDevices];

    // 4. Process Groups
    processMultiSwitches();

    // 5. Update UI
    renderHomeView();
    updateUI();

  } catch (error) {
    console.error('Initial Connection Error:', error);
    if (container) container.innerHTML = '<p>Error de conexión.</p>';
  }
}



function processMultiSwitches() {
  groupedDevices = allDevices.map(device => {
    // For Tuya devices, recalculate isOn from status array if it looks like a switch
    if (device.platform === 'tuya') {
      const status = device.status || [];
      const switchStatus = status.filter(s => s.code.startsWith('switch'));
      const isMulti = switchStatus.length > 1;

      // Only overwrite isOn if we found switch status
      if (switchStatus.length > 0) {
        return {
          ...device,
          isMultiSwitch: isMulti,
          switchCount: switchStatus.length,
          isOn: switchStatus.some(s => s.value === true)
        };
      } else {
        // For sensors or IR remotes without a single 'switch' state, keep original isOn
        return {
          ...device,
          isMultiSwitch: false,
          isOn: device.isOn || false
        };
      }
    }

    // For ST or other already processed devices, just return as is or with basic defaults
    return {
      ...device,
      isMultiSwitch: device.isMultiSwitch || false,
      isOn: device.isOn || false
    };
  });
}

/* ========================================
   UI & NAVIGATION LOGIC
   ======================================== */

// Update existing device cards without re-rendering entire views
function updateDeviceStates() {
  // Update all device cards in room view
  const roomCards = document.querySelectorAll('.device-card');
  roomCards.forEach(card => {
    const deviceName = card.querySelector('.device-name-text')?.textContent;
    if (!deviceName) return;

    const device = groupedDevices.find(d => d.name === deviceName);
    if (!device) return;

    // Update class based on current state
    if (device.isOn) {
      if (!card.classList.contains('device-on')) {
        card.classList.add('device-on');
      }
    } else {
      card.classList.remove('device-on');
    }
  });

  // Update all device widgets in dashboard
  const deviceWidgets = document.querySelectorAll('.device-widget-card');
  deviceWidgets.forEach(card => {
    const deviceName = card.querySelector('.device-widget-name')?.textContent;
    if (!deviceName) return;

    const device = groupedDevices.find(d => d.name === deviceName);
    if (!device) return;

    // Update class based on current state
    if (device.isOn) {
      if (!card.classList.contains('device-on')) {
        card.classList.add('device-on');
      }
    } else {
      card.classList.remove('device-on');
    }
  });
}

function updateUI() {
  updateHomeCounts();
  updateDeviceStates(); // Update device states without re-rendering
  initDashboardWidgets(); // Refresh dashboard if active
  if (currentView === 'room' && activeRoom) {
    renderRoomDevices(activeRoom);
  }
}

function updateHomeCounts() {
  // For each room key in configuration, count active devices
  Object.keys(roomSettings).forEach(roomName => {
    const config = roomSettings[roomName];
    let activeCount = 0;

    // If 'Todos', count ALL active
    if (roomName === 'Todos') {
      activeCount = groupedDevices.filter(d => d.isOn).length;
    } else {
      // Count only devices assigned to this room
      activeCount = groupedDevices.filter(d =>
        config.devices.includes(d.id) && d.isOn
      ).length;
    }

    // Update DOM
    const countSpan = document.getElementById(`count-${roomName}`);
    if (countSpan) countSpan.textContent = activeCount;

    // Visual feedback on card
    // Note: We need to find the card element. Using text mapping is risky, better ID?
    // Let's rely on the count span's parent.
    if (countSpan) {
      const card = countSpan.closest('.room-card');
      if (activeCount > 0) card.classList.add('has-active-devices');
      else card.classList.remove('has-active-devices');
    }
  });

  // Handle music card separately if needed (static for now)
}

function navigateToRoom(roomName) {
  activeRoom = roomName;
  currentView = 'room';

  // Switch View
  document.getElementById('home-view').classList.remove('active');
  document.getElementById('room-view').classList.add('active');
  document.getElementById('music-view').classList.remove('active');

  // Setup Room Header
  document.getElementById('roomTitle').textContent = roomName;

  // Apply Room Background
  const bg = roomSettings[roomName]?.bg || 'backgrounds/Fondo.jpg';
  document.getElementById('backgroundLayer').style.backgroundImage = `url('${bg}')`;

  // Render Devices
  renderRoomDevices(roomName);
}

function navigateToMusic() {
  currentView = 'music';
  document.getElementById('home-view').classList.remove('active');
  document.getElementById('room-view').classList.remove('active');
  document.getElementById('music-view').classList.add('active');
}

function navigateToHome() {
  currentView = 'home';
  activeRoom = null;

  document.getElementById('home-view').classList.add('active');
  document.getElementById('room-view').classList.remove('active');
  document.getElementById('music-view').classList.remove('active');

  // Reset Background to Default? Or keep last room? Check user pref.
  // Generally Home might have a main bg.
  document.getElementById('backgroundLayer').style.backgroundImage = `url('backgrounds/Fondo 2.jpg')`;
}

/* ========================================
   RENDER DEVICES IMPLEMENTATION
   ======================================== */
function renderRoomDevices(roomName) {
  const grid = document.getElementById('roomDeviceGrid');
  grid.innerHTML = ''; // Clear

  let relevantDevices = [];

  if (roomName === 'Todos') {
    relevantDevices = groupedDevices;
  } else {
    const config = roomSettings[roomName];
    if (!config || !config.devices) {
      relevantDevices = [];
    } else {
      relevantDevices = groupedDevices.filter(d => config.devices.includes(d.id));
    }
  }

  if (relevantDevices.length === 0) {
    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:rgba(255,255,255,0.5)">No hay dispositivos asignados a esta sala.</div>';
    return;
  }

  relevantDevices.forEach(device => {
    const card = document.createElement('div');
    card.className = `device-card ${device.isOn ? 'device-on' : ''}`;
    card.onclick = (e) => handleDeviceClick(e, device);

    // Icon Logic (Reuse mapping or generic)
    const icon = getIconForDevice(device);

    card.innerHTML = `
            <div class="device-icon-large">
                <img src="${icon}">
            </div>
            <div class="device-name-text">${device.name}</div>
            <div class="power-btn-small">
                <i class="fas fa-power-off"></i>
            </div>
        `;
    grid.appendChild(card);
  });
}

function getIconForDevice(device) {
  // Prioridad: Nombre exacto -> Categoría -> Default
  return ICON_MAPPING[device.name] || ICON_MAPPING[device.category] || ICON_MAPPING['default'];
}


// =========================================
//    API COMMAND SENDER
// =========================================
async function sendDeviceCommand(deviceId, code, value) {
  console.log(`[TuyaCommand] Sending ${code}:${value} to ${deviceId} via Server`);

  try {
    const res = await fetch(`/api/devices/${deviceId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, value })
    });

    if (!res.ok) throw new Error('Server Command Failed');
    return await res.json();
  } catch (e) {
    console.warn("[TuyaCommand] Server failed, trying direct fetch as fallback...", e);
    // FALLBACK: Original direct fetch logic (requires browser extension)
    await getAccessToken();
    const baseUrl = TUYA_API_URLS[CONFIG.TUYA_REGION];
    const path = `/v1.0/devices/${deviceId}/commands`;
    const timestamp = Date.now().toString();

    const bodyStr = JSON.stringify({ commands: [{ code, value }] });
    const signStr = CONFIG.TUYA_ACCESS_ID + accessToken + timestamp + 'POST\n' +
      CryptoJS.SHA256(bodyStr).toString(CryptoJS.enc.Hex) + '\n\n' + path;
    const signature = CryptoJS.HmacSHA256(signStr, CONFIG.TUYA_ACCESS_SECRET).toString(CryptoJS.enc.Hex).toUpperCase();

    const res = await fetch(baseUrl + path, {
      method: 'POST',
      headers: {
        'client_id': CONFIG.TUYA_ACCESS_ID,
        'access_token': accessToken,
        'sign': signature,
        'sign_method': 'HMAC-SHA256',
        't': timestamp,
        'Content-Type': 'application/json'
      },
      body: bodyStr
    });
    return await res.json();
  }
}

function updateDeviceStateLocally(deviceId, newState) {
  // Update internal array
  const d = groupedDevices.find(x => x.id === deviceId);
  if (d) d.isOn = newState;

  // Update UI
  updateUI();
}

/* ========================================
   ROOM CONFIGURATION
   ======================================== */
function openRoomConfig() {
  if (!activeRoom || activeRoom === 'Todos') {
    alert('La sala "Todos" muestra todos los dispositivos automáticamente.');
    return;
  }

  const modal = document.getElementById('roomConfigModal');
  modal.classList.add('active');

  // Render list of devices to select
  const list = document.getElementById('deviceSelectList');
  list.innerHTML = '';

  const currentConfig = roomSettings[activeRoom] || { devices: [] };

  groupedDevices.forEach(device => {
    const item = document.createElement('div');
    item.className = `device-checkbox-item ${currentConfig.devices.includes(device.id) ? 'checked' : ''}`;
    item.onclick = () => {
      item.classList.toggle('checked');
    };
    item.dataset.id = device.id;
    item.innerHTML = `
            <span>${device.name}</span>
            <i class="fas fa-check" style="margin-left:auto; opacity:${currentConfig.devices.includes(device.id) ? 1 : 0}"></i>
        `;
    list.appendChild(item);
  });

  // Populate BG input
  document.getElementById('configBgInput').value = currentConfig.bg || '';
}

function closeRoomConfig() {
  document.getElementById('roomConfigModal').classList.remove('active');
}

function saveRoomConfig() {
  if (!activeRoom) return;

  const list = document.getElementById('deviceSelectList');
  const selectedIds = Array.from(list.children)
    .filter(el => el.classList.contains('checked'))
    .map(el => el.dataset.id);

  const bgVal = document.getElementById('configBgInput').value;

  // Save
  roomSettings[activeRoom] = {
    ...roomSettings[activeRoom],
    devices: selectedIds,
    bg: bgVal
  };

  localStorage.setItem(ROOM_CONFIG_KEY, JSON.stringify(roomSettings));

  closeRoomConfig();
  updateUI(); // Re-render room with new settings
  navigateToRoom(activeRoom); // Re-trigger background set
}

/* ========================================
   UTILITIES
   ======================================== */
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

async function updateWeather() {
  try {
    const res = await fetch('https://wttr.in/Madrid,Cundinamarca?format=j1');
    const data = await res.json();
    const cur = data.current_condition[0];
    const astronomy = data.weather[0].astronomy[0];
    const temp = cur.temp_C + '°C';
    const loc = 'Madrid, Cundinamarca';
    const desc = cur.lang_es ? cur.lang_es[0].value : cur.weatherDesc[0].value;

    document.getElementById('weatherTemp').textContent = temp;
    document.getElementById('weatherLocation').textContent = loc;

    // Detect Day/Night
    const now = new Date();
    const currentHour = now.getHours();
    // Simplified day/night based on typical 6am-6pm if astronomy fails
    let isDay = currentHour >= 6 && currentHour < 18;

    // Attempt astronomy precision
    try {
      const sr = parseInt(astronomy.sunrise);
      const ss = parseInt(astronomy.sunset) + 12; // PM adjustment
      isDay = currentHour >= sr && currentHour < ss;
    } catch (e) { }

    // Icon Mapping and Dash Update
    const weatherInfo = getWeatherVisuals(cur.weatherCode, isDay, astronomy.moon_phase);

    const dashTemp = document.getElementById('dashWeatherTemp');
    const dashLoc = document.getElementById('dashWeatherLoc');
    const dashIconBase = document.getElementById('dashWeatherIconBase');
    const dashIconOverlay = document.getElementById('dashWeatherIconOverlay');
    const dashDesc = document.getElementById('dashWeatherDesc');
    const weatherCard = document.querySelector('.widget-weather-card');

    if (dashTemp) dashTemp.textContent = temp;
    if (dashLoc) dashLoc.textContent = loc;
    if (dashDesc) dashDesc.textContent = desc;

    if (dashIconBase) {
      dashIconBase.className = `fas ${weatherInfo.base} dash-weather-icon base`;
      dashIconBase.style.color = weatherInfo.baseColor;
    }
    if (dashIconOverlay) {
      dashIconOverlay.className = `fas ${weatherInfo.overlay} dash-weather-icon overlay`;
      dashIconOverlay.style.display = weatherInfo.overlay ? 'block' : 'none';
    }

    if (weatherCard) {
      weatherCard.setAttribute('data-state', isDay ? 'day' : 'night');
    }

  } catch (e) { console.error("Weather error:", e); }
}

function getWeatherVisuals(code, isDay, moonPhase = "") {
  const visuals = {
    base: isDay ? 'fa-sun' : 'fa-moon',
    baseColor: isDay ? '#ffce54' : '#f5f3ce',
    overlay: null
  };

  // Specific Night Icons (Moon Phases)
  if (!isDay) {
    if (moonPhase.includes('New')) visuals.base = 'fa-moon'; // actually no moon but fa-moon is common
    else if (moonPhase.includes('Full')) visuals.base = 'fa-moon'; // fa-moon-o if exists, but we use fa-moon
    // FontAwesome 5 Free has limited moon phases, using base fa-moon
  }

  // Weather Condition Mapping
  const weatherMap = {
    '113': { base: isDay ? 'fa-sun' : 'fa-moon', overlay: null }, // Clear
    '116': { base: isDay ? 'fa-sun' : 'fa-moon', overlay: 'fa-cloud' }, // Partly Cloudy
    '119': { base: 'fa-cloud', overlay: null }, // Cloudy
    '122': { base: 'fa-cloud', overlay: 'fa-cloud' }, // Very Cloudy
    '143': { base: 'fa-smog', overlay: null }, // Fog
    '176': { base: isDay ? 'fa-sun' : 'fa-moon', overlay: 'fa-cloud-rain' }, // Patchy rain
    '263': { base: 'fa-cloud-showers-heavy', overlay: null },
    '302': { base: 'fa-cloud-showers-heavy', overlay: 'fa-bolt' },
    '389': { base: 'fa-bolt', overlay: 'fa-cloud-showers-heavy' }
  };

  if (weatherMap[code]) {
    visuals.base = weatherMap[code].base;
    visuals.overlay = weatherMap[code].overlay;
  }

  return visuals;
}

function showNotification(msg, type = 'info') {
  let toast = document.getElementById('notification-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'notification-toast';
    toast.className = 'notification-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.borderLeft = `5px solid ${type === 'error' ? '#ff4444' : 'var(--primary-yellow)'}`;

  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}


/* ========================================
   GLOBAL SETTINGS
   ======================================== */
function openGlobalSettings() {
  const modal = document.getElementById('globalSettingsModal');
  const spotifyInput = document.getElementById('spotifyClientIdInput');
  const stInput = document.getElementById('smartthingsTokenInput');

  spotifyInput.value = localStorage.getItem('SPOTIFY_CLIENT_ID') || '0686b83e9a174ce6855075bda440a62f';
  stInput.value = localStorage.getItem('smartthings_token') || '';

  modal.classList.add('active');
}

function closeGlobalSettings() {
  document.getElementById('globalSettingsModal').classList.remove('active');
}

function saveGlobalSettings() {
  const spotifyInput = document.getElementById('spotifyClientIdInput');
  const stInput = document.getElementById('smartthingsTokenInput');

  const spotifyVal = spotifyInput.value.trim();
  const stVal = stInput.value.trim();

  if (spotifyVal) {
    localStorage.setItem('SPOTIFY_CLIENT_ID', spotifyVal);
    SPOTIFY_CLIENT_ID = spotifyVal;
  }

  if (stVal) {
    localStorage.setItem('smartthings_token', stVal);
    SMARTTHINGS_TOKEN = stVal;
  }

  alert('Configuración guardada satisfactoriamente.');
  closeGlobalSettings();
}

/* ========================================
   SPOTIFY INTEGRATION (PKCE FLOW)
   ======================================== */
SPOTIFY_CLIENT_ID = (localStorage.getItem('SPOTIFY_CLIENT_ID') || localStorage.getItem('spotify_client_id') || '0686b83e9a174ce6855075bda440a62f').trim();

function getSpotifyRedirectUri() {
  const origin = window.location.origin.replace('http://localhost:', 'http://127.0.0.1:');
  return origin + '/';
}
const SPOTIFY_REDIRECT_URI = getSpotifyRedirectUri();
console.log("Spotify Redirect URI normalizada:", SPOTIFY_REDIRECT_URI);

let spotifyAccessToken = localStorage.getItem('spotify_access_token') || '';
let spotifyRefreshToken = localStorage.getItem('spotify_refresh_token') || '';
let spotifyTokenExpiry = Number(localStorage.getItem('spotify_token_expiry') || 0);

async function syncSpotifyTokensFromServer() {
  try {
    const r = await fetch('/api/spotify/token');
    if (!r.ok) return;
    const d = await r.json();
    if (d.clientId && !localStorage.getItem('SPOTIFY_CLIENT_ID')) {
      SPOTIFY_CLIENT_ID = d.clientId;
    }
    if (!spotifyAccessToken && d.accessToken) {
      spotifyAccessToken = d.accessToken;
      spotifyRefreshToken = d.refreshToken || '';
      spotifyTokenExpiry = Number(d.tokenExpiry || 0);
      localStorage.setItem('spotify_access_token', spotifyAccessToken);
      if (spotifyRefreshToken) localStorage.setItem('spotify_refresh_token', spotifyRefreshToken);
      if (spotifyTokenExpiry) localStorage.setItem('spotify_token_expiry', String(spotifyTokenExpiry));
    }
  } catch (e) {}
}

async function persistSpotifyTokensToServer() {
  try {
    await fetch('/api/spotify/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: SPOTIFY_CLIENT_ID,
        accessToken: spotifyAccessToken || '',
        refreshToken: spotifyRefreshToken || '',
        tokenExpiry: spotifyTokenExpiry || 0
      })
    });
  } catch (e) {}
}

async function refreshSpotifyAccessToken() {
  if (!spotifyRefreshToken || !SPOTIFY_CLIENT_ID) return false;
  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: spotifyRefreshToken,
      client_id: SPOTIFY_CLIENT_ID
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!response.ok) return false;
    const data = await response.json();
    spotifyAccessToken = data.access_token;
    spotifyTokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000);
    if (data.refresh_token) spotifyRefreshToken = data.refresh_token;

    localStorage.setItem('spotify_access_token', spotifyAccessToken);
    localStorage.setItem('spotify_token_expiry', String(spotifyTokenExpiry));
    if (spotifyRefreshToken) localStorage.setItem('spotify_refresh_token', spotifyRefreshToken);
    await persistSpotifyTokensToServer();
    return true;
  } catch (e) {
    return false;
  }
}

window.addEventListener('load', async () => {
  const params = new URLSearchParams(window.location.search);

  if (params.has('code')) {
    const code = params.get('code');
    window.history.replaceState({}, document.title, '/');
    await exchangeCodeForToken(code);
    return;
  }

  await syncSpotifyTokensFromServer();

  if (spotifyAccessToken) {
    if (spotifyTokenExpiry && Date.now() > spotifyTokenExpiry - 60000) {
      const ok = await refreshSpotifyAccessToken();
      if (!ok) {
        logoutSpotify();
        return;
      }
    }
    startSpotifyPolling();
  } else {
    updateSpotifyUI(null);
  }
});

function logoutSpotify() {
  spotifyAccessToken = '';
  spotifyRefreshToken = '';
  spotifyTokenExpiry = 0;
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_token_expiry');
  persistSpotifyTokensToServer();
  updateSpotifyUI(null);
}

async function authorizeSpotify() {
  if (window.location.hostname === 'localhost') {
    window.location.href = 'http://127.0.0.1:' + (window.location.port || '3001') + '/?autoSpotifyAuth=1';
    return;
  }
  if (!SPOTIFY_CLIENT_ID) {
    alert('Por favor configura el Spotify Client ID en Ajustes primero.');
    openGlobalSettings();
    return;
  }

  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  const scope = 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-read-recently-played';
  const args = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: scope,
    redirect_uri: getSpotifyRedirectUri(),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge
  });

  window.location.href = 'https://accounts.spotify.com/authorize?' + args.toString();
}

async function exchangeCodeForToken(code) {
  const codeVerifier = localStorage.getItem('spotify_code_verifier');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: getSpotifyRedirectUri(),
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: codeVerifier
  });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });

    if (!response.ok) throw new Error('HTTP status ' + response.status);
    const data = await response.json();

    spotifyAccessToken = data.access_token;
    spotifyRefreshToken = data.refresh_token || '';
    spotifyTokenExpiry = Date.now() + ((data.expires_in || 3600) * 1000);

    localStorage.setItem('spotify_access_token', spotifyAccessToken);
    localStorage.setItem('spotify_token_expiry', String(spotifyTokenExpiry));
    if (spotifyRefreshToken) localStorage.setItem('spotify_refresh_token', spotifyRefreshToken);

    await persistSpotifyTokensToServer();
    showNotification('🎵 Spotify vinculado y guardado permanentemente');
    startSpotifyPolling();
  } catch (error) {
    console.error('Error exchanging token:', error);
    showNotification('Revisa que la Redirect URI esté registrada en Spotify Developer Dashboard', 'error');
  }
}

function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function pollSpotifyNow() {
  if (!spotifyAccessToken) return;
  if (spotifyTokenExpiry && Date.now() > spotifyTokenExpiry - 60000) {
    await refreshSpotifyAccessToken();
  }
  try {
    const res = await fetch('https://api.spotify.com/v1/me/player', {
      headers: { 'Authorization': 'Bearer ' + spotifyAccessToken }
    });

    if (res.status === 204) {
      const rec = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
        headers: { 'Authorization': 'Bearer ' + spotifyAccessToken }
      });
      if (rec.ok) {
        const recData = await rec.json();
        const lastTrack = recData?.items?.[0]?.track;
        if (lastTrack) updateSpotifyUI({ item: lastTrack, is_playing: false });
      }
      return;
    }

    if (res.status === 401) {
      const ok = await refreshSpotifyAccessToken();
      if (!ok) logoutSpotify();
      return;
    }

    if (res.ok) {
      const data = await res.json();
      updateSpotifyUI(data);
    }
  } catch (e) {
    console.error('Spotify Poll Error', e);
  }
}

async function startSpotifyPolling() {
  if (window.spotifyPollInterval) clearInterval(window.spotifyPollInterval);
  await pollSpotifyNow();
  window.spotifyPollInterval = setInterval(pollSpotifyNow, 4000);
}

function updateSpotifyUI(data) {
  if (data) currentSpotifyData = data;

  const overlay = document.getElementById('spotifyConnectOverlay');
  const art = document.getElementById('musicCardArt');
  const title = document.getElementById('musicTitle');
  const artist = document.getElementById('musicArtist');
  const playBtn = document.getElementById('playPauseBtn');
  const iframe = document.getElementById('spotifyInfoIframe');

  if (!spotifyAccessToken) {
    if (overlay) overlay.classList.add('visible');
    if (window.SpotifyCardManager) window.SpotifyCardManager.syncAllCards();
    return;
  }

  if (overlay) overlay.classList.remove('visible');

  const activeData = data || currentSpotifyData;
  const item = activeData?.item;
  if (item) {
    if (art && item.album && item.album.images?.length > 0) art.src = item.album.images[0].url;
    if (title) title.textContent = item.name;
    if (artist) artist.textContent = (item.artists || []).map(a => a.name).join(', ');
    if (playBtn) playBtn.innerHTML = activeData.is_playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    if (iframe && item.id) {
      const newSrc = 'https://open.spotify.com/embed/track/' + item.id + '?utm_source=generator&theme=0';
      if (!iframe.src.includes(item.id)) iframe.src = newSrc;
    }
  }

  if (window.SpotifyCardManager) window.SpotifyCardManager.syncAllCards();
}

async function controlMusic(action, ev = null) {
  if (ev && ev.stopPropagation) ev.stopPropagation();
  if (!spotifyAccessToken) {
    if (window.SpotifyCardManager) window.SpotifyCardManager.openSpotifyWebModal();
    else authorizeSpotify();
    return;
  }

  const baseUrl = 'https://api.spotify.com/v1/me/player';
  let method = 'POST';
  let endpoint = '';

  switch (action) {
    case 'next': endpoint = '/next'; break;
    case 'previous': endpoint = '/previous'; break;
    case 'playpause': {
      const isPlaying = !!(currentSpotifyData && currentSpotifyData.is_playing);
      endpoint = isPlaying ? '/pause' : '/play';
      method = 'PUT';
      if (currentSpotifyData) {
        currentSpotifyData.is_playing = !isPlaying;
        if (window.SpotifyCardManager) window.SpotifyCardManager.syncAllCards();
      }
      break;
    }
  }

  try {
    const res = await fetch(baseUrl + endpoint, {
      method: method,
      headers: { 'Authorization': 'Bearer ' + spotifyAccessToken }
    });

    if (res.status === 404 || res.status === 403) {
      showNotification('🎧 Abre el reproductor en el Modal de Spotify o en tu celular/PC para activar audio', 'info');
      if (window.SpotifyCardManager) window.SpotifyCardManager.openSpotifyWebModal();
    } else {
      setTimeout(pollSpotifyNow, 450);
    }
  } catch (e) {
    console.error('Control error', e);
  }
}

function updateWidgetMusicCard(widgetId) {
  if (window.SpotifyCardManager) window.SpotifyCardManager.syncAllCards();
}

// Multi-Switch Modal Logic
function openMultiSwitchModal(device) {
  const modal = document.getElementById('deviceModal');
  const content = document.getElementById('modalContent');

  // Determine number of switches based on device name
  let switchCount = 0;
  let customLabels = [];

  if (device.name === 'Salon') {
    switchCount = 4;
    customLabels = SUB_SWITCH_LABELS['Salon'];
  } else if (device.name === 'Cocina') {
    switchCount = 2;
    customLabels = SUB_SWITCH_LABELS['Cocina'];
  } else if (device.name === 'Pasillo Estudio') {
    switchCount = 2;
    customLabels = SUB_SWITCH_LABELS['Pasillo Estudio'];
  } else {
    // Fallback: detect from status
    switchCount = device.status.filter(s => s.code.startsWith('switch')).length;
  }

  let switchesHTML = '';

  // Generate switches based on hardcoded count
  for (let i = 1; i <= switchCount; i++) {
    const switchCode = `switch_${i}`;
    const label = (customLabels && customLabels[i - 1]) ? customLabels[i - 1] : `Switch ${i}`;

    // Find status from device
    const statusItem = device.status.find(s => s.code === switchCode);
    const isOn = statusItem ? statusItem.value : false;

    const icon = getIconForDevice(device);

    switchesHTML += `
      <div class="switch-sub-card ${isOn ? 'active' : ''}">
        <div class="switch-sub-icon">
          <img src="${icon}" alt="icon">
        </div>
        <div class="switch-sub-name">${label}</div>
        <button class="switch-sub-toggle" 
                onclick="toggleMultiSwitch('${device.id}', '${switchCode}', ${!isOn})">
          <i class="fas fa-power-off"></i>
        </button>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="modal-header">
      <h2 style="color:white; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-lightbulb" style="color:var(--primary-yellow)"></i> 
        ${device.name}
      </h2>
      <button class="close-btn" onclick="closeMultiSwitchModal()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body">
      <div class="multi-switch-grid">
        ${switchesHTML}
      </div>
    </div>
  `;

  modal.classList.add('active');
  setTimeout(() => content.style.transform = 'scale(1) rotateX(0)', 10);
}

/* ========================================
   SMARTTHINGS DETAIL MODAL
   ======================================== */
function openSmartThingsModal(device) {
  const modal = document.getElementById('deviceModal');
  const content = document.getElementById('modalContent');

  // Default to empty object if fullStatus missing to prevent crash
  const main = device.fullStatus?.components?.main || {};
  let detailsHTML = '';

  // Custom UI for Washer
  if (device.category === 'washer') {
    const state = main.washerOperatingState?.machineState?.value || 'Desconocido';
    const jobState = main.washerJobState?.completionTime?.value || '-';
    const mode = main.washerMode?.washerMode?.value || '-';
    const temp = main.temperatureMeasurement?.temperature?.value ? main.temperatureMeasurement.temperature.value + '°C' : '-';

    detailsHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top:20px;">
            <div class="st-stat-card">
                <div class="label">Estado</div>
                <div class="value large">${state.toUpperCase()}</div>
            </div>
            <div class="st-stat-card">
                <div class="label">Modo / Ciclo</div>
                <div class="value">${mode}</div>
            </div>
            <div class="st-stat-card">
                <div class="label">Tiempo Faltante</div>
                <div class="value">${jobState}</div>
            </div>
            <div class="st-stat-card">
                <div class="label">Temperatura</div>
                <div class="value">${temp}</div>
            </div>
        </div>
        
        <div style="margin-top:30px; display:flex; justify-content:center; gap:20px;">
             <button class="st-ctrl-btn" onclick="sendSmartThingsCommand('${device.id}', true)">
                <i class="fas fa-play"></i> Iniciar
             </button>
             <button class="st-ctrl-btn stop" onclick="sendSmartThingsCommand('${device.id}', false)">
                <i class="fas fa-stop"></i> Parar
             </button>
        </div>
      `;
  } else {
    detailsHTML = `<p style="text-align:center; margin-top:20px;">Control básico de encendido/apagado disponible.</p>`;
  }

  content.innerHTML = `
    <div class="modal-header">
      <h2 style="color:white; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-info-circle" style="color:var(--primary-yellow)"></i> 
        ${device.name}
      </h2>
      <button class="close-btn" onclick="closeMultiSwitchModal()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body">
      ${detailsHTML}
      ${device.category !== 'washer' ? `
        <div style="text-align:center; margin-top:20px;">
            <button class="switch-sub-toggle" style="width:60px; height:60px; border-radius:50%; font-size:1.5rem;"
                    onclick="toggleSingleDevice('${device.id}')">
                <i class="fas fa-power-off"></i>
            </button>
        </div>
      ` : ''}
    </div>
  `;

  modal.classList.add('active');
  setTimeout(() => content.style.transform = 'scale(1) rotateX(0)', 10);
}

// Updated Handler to include SmartThings
async function handleDeviceClick(e, device) {
  // 0. Air Quality ID Check (Priority)
  if (device.id === 'eb8d7d936eace566544mbl') {
    openAirQualityModal(device);
    return;
  }

  // 1. SmartThings Check
  if (device.platform === 'smartthings') {
    if (device.category === 'washer') {
      openSmartThingsModal(device);
    } else if (device.category === 'mobile') {
      openMobileDetailModal(device);
    } else if (device.category === 'tv') {
      openTVControlModal(device);
    } else {
      toggleSingleDevice(device.id);
    }
    return;
  }

  // 1.5 Manual IP Check
  if (device.platform === 'manual') {
    openTVControlModal(device);
    return;
  }

  // 2. Tuya Specialized Handling (Names like Velas, TV Sala, etc)
  const specializedNamesLower = ['velas', 'tv sala', 'tv oficina'];
  const devNameLower = device.name.toLowerCase();

  if (specializedNamesLower.includes(devNameLower)) {
    if (devNameLower.includes('tv')) {
      openTVControlModal(device);
    } else if (devNameLower === 'velas') {
      openCandleControlModal(device);
    } else {
      // For similar devices
      const status = device.status || [];
      const hasSwitches = status.some(s => s.code.startsWith('switch'));
      if (hasSwitches) {
        openMultiSwitchModal(device);
      } else {
        handleRegularToggle(device);
      }
    }
    return;
  }

  // 2.1 Tuya Categories (Air Quality, Sensors)
  if (device.category === 'hjjyq' || device.category === 'co2yj') {
    openAirQualityModal(device);
    return;
  }
  if (device.category === 'zd') {
    openVibrationModal(device);
    return;
  }
  if (device.category === 'sp' || device.category === 'ipc') {
    openCameraDirect(device);
    return;
  }

  // 2.2 Tuya Multi-Switch
  const isMultiSwitch = MULTI_SWITCH_NAMES.includes(device.name);
  if (isMultiSwitch) {
    openMultiSwitchModal(device);
    return;
  }

  // 3. Regular Tuya
  const newState = !device.isOn;
  updateDeviceStateLocally(device.id, newState);

  try {
    const switchCode = device.status?.find(s => s.code.startsWith('switch'))?.code || 'switch_1';
    await sendDeviceCommand(device.id, switchCode, newState);
  } catch (err) {
    updateDeviceStateLocally(device.id, !newState);
    console.error('Command failed', err);
  }
}

async function handleRegularToggle(device) {
  const newState = !device.isOn;
  updateDeviceStateLocally(device.id, newState);
  try {
    const status = device.status || [];
    const code = status.find(s => s.code.includes('switch'))?.code || 'switch_1';
    await sendDeviceCommand(device.id, code, newState);
  } catch (e) {
    updateDeviceStateLocally(device.id, !newState);
  }
}

// =========================================
//    REAL-TIME MONITOR & ALERTS
// =========================================
function startRealTimeMonitor() {
  const AIR_QUALITY_ID = 'eb8d7d936eace566544mbl';
  let alertActive = false;
  let audioCtx = null;

  async function updateMonitor() {
    try {
      // 1. Try to find in global list first (fast fallback)
      const cachedDevice = allDevices.find(d => d.id === AIR_QUALITY_ID);

      // 2. Fresh fetch to specific endpoint
      const res = await fetch(`/api/devices/${AIR_QUALITY_ID}`);
      let device;

      if (res.ok) {
        device = await res.json();
      } else if (cachedDevice) {
        console.warn(`[Monitor] Fetch failed (${res.status}), using cached data`);
        device = cachedDevice;
      } else {
        console.error(`[Monitor] Device not found in fetch or cache`);
        updatePill('pill-temp', 'ERR', 'danger');
        return;
      }

      const status = device.status || [];
      const getVal = (code) => {
        const s = status.find(item => item.code === code);
        return s ? s.value : 0;
      };

      const data = {
        temp: (getVal('va_temperature') || getVal('temperature') || getVal('temp_current') || 0) / 10,
        hum: getVal('va_humidity') || getVal('humidity') || getVal('humidity_value') || 0,
        co2: getVal('co2_value') || getVal('co2') || status.find(s => s.code.includes('co2'))?.value || 0,
        // CO Mapping: Usa co_indoor_value (DP 101) descubierto en el escaneo profundo
        co: getVal('co_indoor_value') || getVal('co_value') || getVal('co') || getVal('va_co') || getVal('carbon_monoxide') || 0,
        // GAS Mapping:
        gas: getVal('gas_sensor_status') || getVal('ch4_value') || getVal('ch4') || 0,
        voc: getVal('voc_value') || getVal('va_voc') || 0,
        aqi: getVal('air_quality_index') || ''
      };

      // EXTRA DEBUG: Log all codes to find the one that says "70" or other sensor values
      if (status.length > 0) {
        const allCodes = status.map(s => `${s.code}: ${s.value}`).join(' | ');
        console.log(`[Monitor Debug] ALL CODES: ${allCodes}`);
      }

      // Detect if we are using GAS/CH4 instead of CO for the label in the header
      const co2Pill = document.getElementById('pill-co2');
      const coPill = document.getElementById('pill-co');

      // Update labels dynamically based on what's reporting
      if (coPill) {
        const isActuallyGas = (data.gas > 0 || status.some(s => s.code.includes('gas')));
        coPill.parentNode.setAttribute('data-label', isActuallyGas ? 'GAS' : 'CO');
      }

      // DEBUG: Log received values to help mapping
      console.log(`[Monitor] Air Data -> Temp: ${data.temp}, Hum: ${data.hum}, CO2: ${data.co2}, CO: ${data.co}`);
      if (status.length > 0) {
        const rawCodes = status.map(s => `${s.code}: ${s.value}`).join(' | ');
        console.log(`[Monitor] Raw Codes: ${rawCodes}`);
      }

      // Update Header Pills
      updatePill('pill-temp', data.temp > 0 ? `${data.temp.toFixed(1)}°C` : '--', 'ok');
      updatePill('pill-hum', data.hum > 0 ? `${data.hum}%` : '--', 'ok');

      // CO2 Logic
      let co2Status = 'ok';
      if (data.co2 > 1200) co2Status = 'danger';
      else if (data.co2 > 800) co2Status = 'warn';
      updatePill('pill-co2', (data.co2 && data.co2 > 0) ? data.co2 : '--', co2Status);

      // CO / Gas Logic
      let coStatus = 'ok';
      const sensorValue = (data.gas > 0) ? data.gas : data.co;
      if (sensorValue > 50) coStatus = 'danger';
      else if (sensorValue > 10) coStatus = 'warn';
      // Muestra el valor si existe, o 0 si el sensor respondió pero es 0
      const displayCO = (sensorValue !== undefined && status.length > 0) ? sensorValue : '--';
      updatePill('pill-co', displayCO, coStatus);

      // EXTREME ALERT (Shake + Sound)
      if (data.co2 > 1500 || data.co > 50) {
        triggerGlobalAlert(true);
      } else {
        triggerGlobalAlert(false);
      }

    } catch (e) {
      console.error("[Monitor] Update error:", e);
    }
  }

  function updatePill(id, val, status) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val;
    el.className = `status-pill pill-${status}`;
  }

  function triggerGlobalAlert(active) {
    const container = document.querySelector('.app-container');
    if (active) {
      container.classList.add('alert-shake');
      playAlarmSound();
    } else {
      container.classList.remove('alert-shake');
    }
  }

  function playAlarmSound() {
    // Prevent overlapping sounds
    if (alertActive) return;
    alertActive = true;

    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch A
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();

      // Short beep
      setTimeout(() => {
        osc.stop();
        alertActive = false;
      }, 500);
    } catch (e) {
      alertActive = false;
    }
  }

  // First run and then every 1000ms
  updateMonitor();
  setInterval(updateMonitor, 1000);
}

// ========================================
//    CAMERA MODAL (Rediseñado)
// ========================================
async function openCameraModal(device) {
  // Redireccionar a la versión v4 forzada
  if (typeof openCameraDirect === 'function') return openCameraDirect(device);
  const modal = document.getElementById('deviceModal');
  const modalContent = modal.querySelector('.modal-content');
  const content = document.getElementById('modalContent');
  if (!modal || !modalContent || !content) return;
  modalContent.classList.add('modal-camera');
  content.innerHTML = `<div class="camera-container"><video id="cameraVideo" class="camera-video" playsinline muted controls></video></div>`;
  modal.style.display = 'flex';
}

// ========================================
//    NUEVA FUNCIÓN FORZADA v4 (Bypass Cache)
// ========================================
async function openCameraDirect(device) {
  const modal = document.getElementById('camModal');
  const modalContent = document.getElementById('camModalContent');

  if (!modal || !modalContent) return;
  modalContent.setAttribute('data-device', JSON.stringify(device));

  function updateCamLog(msg) {
    const log = document.getElementById('cameraDebugLog');
    if (log) {
      log.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
      log.scrollTop = log.scrollHeight;
    }
    console.log(`[Camera v4] ${msg}`);
  }

  // Preparar UI
  modalContent.className = 'modal-content modal-camera';
  modalContent.innerHTML = `
    <div style="position:relative; width:100%; height:100%; background:#000;">
      <div id="cameraLoading" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; z-index:10;">
        <i class="fas fa-spinner fa-spin fa-2x"></i>
        <span>Cargando v4 (HD Force)...</span>
      </div>
      <div id="cameraDebugLog" style="position:absolute; top:5px; left:5px; right:5px; background:rgba(0,0,0,0.6); color:#0f0; font-family:monospace; font-size:9px; padding:5px; max-height:60px; overflow-y:auto; z-index:100; pointer-events:none; border-radius:3px; border:1px solid rgba(0,255,0,0.3);">
         -- MONITOR V8 (FORCED) --
      </div>
      <div id="resIndicator" style="position:absolute; bottom:60px; right:15px; background:rgba(0,0,0,0.8); color:#0f0; font-size:14px; font-weight:bold; padding:5px 10px; border-radius:5px; z-index:101; font-family:monospace; border:1px solid #0f0;">
         --x--
      </div>
      
      <div class="camera-container" style="position:relative; width:100% !important; height:100% !important;">
        <video id="cameraVideo" class="camera-video" playsinline muted controls style="display:block;"></video>
      </div>

      <img id="cameraSnapshot" style="width:100%; height:100%; object-fit:contain; display:none; background:#000;" />
      
      <div class="camera-toolbar">
         <button class="cam-btn" onclick="cycleQuality('${device.id}')" id="btnQuality" title="Cambiar Calidad"><i class="fas fa-signal"></i></button>
         <button class="cam-btn" onclick="forceCameraHD('${device.id}')" title="Forzar HD"><i class="fas fa-hd"></i></button>
         <button class="cam-btn" onclick="toggleWebRTC('${device.id}')" title="Modo WebRTC"><i class="fas fa-bolt"></i></button>
         <button class="cam-btn" onclick="toggleCameraFullscreenDirect()"><i class="fas fa-expand" id="fullIcon"></i></button>
         <button class="cam-btn" onclick="closeCameraDirect()"><i class="fas fa-times"></i></button>
      </div>
    </div>
  `;

  modal.classList.add('active');
  updateCamLog(`DISP: ${device.name}`);

  const video = document.getElementById('cameraVideo');
  // Monitor de resolución y Aspect Ratio
  const updateRes = () => {
    const resNode = document.getElementById('resIndicator');
    if (video && resNode) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w === 0 || h === 0) return;

      const isHD = w >= 1280 || h >= 720;
      resNode.innerText = `${isHD ? 'HD' : 'SD'} ${w}x${h}`;
      resNode.style.background = isHD ? 'rgba(0,180,0,0.7)' : 'rgba(255,0,0,0.7)';

      // AJUSTE DINÁMICO DE CLASE
      if (h > w) {
        modalContent.classList.add('vertical-mode');
      } else {
        modalContent.classList.remove('vertical-mode');
      }
    }
  };
  video.addEventListener('loadedmetadata', updateRes);
  video.addEventListener('resize', updateRes);
  setInterval(updateRes, 3000); // Check periodico

  if (currentHls) { currentHls.destroy(); currentHls = null; }

  // FUEZA HD ANTES DE CARGAR
  try {
    updateCamLog("FORZANDO DPs -> video_clarity: HD");
    await fetch(`/api/devices/${device.id}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'video_clarity', value: 'HD' })
    });
  } catch (e) { updateCamLog("HD CMD Error: " + e.message); }

  const snapTimeout = setTimeout(async () => {
    if (document.getElementById('cameraLoading')?.style.display !== 'none') {
      updateCamLog("VIDEO TIMEOUT -> SNAPSHOT");
      try {
        const r = await fetch(`/api/devices/${device.id}/snapshot`);
        const d = await r.json();
        if (d.success && d.result.url) {
          document.getElementById('cameraSnapshot').src = d.result.url;
          document.getElementById('cameraSnapshot').style.display = 'block';
          if (document.getElementById('cameraVideo')) document.getElementById('cameraVideo').style.display = 'none';
          document.getElementById('cameraLoading').style.display = 'none';
        }
      } catch (e) { }
    }
  }, 12000);

  try {
    const prefQ = localStorage.getItem('cam_pref_q') || '4';
    updateCamLog(`SOLICITANDO Q=${prefQ}`);
    const res = await fetch(`/api/devices/${device.id}/stream?quality=${prefQ}`);
    const data = await res.json();
    if (data.success && data.result.url) {
      updateCamLog("STREAM URL RECIBIDA (v4)");
      const video = document.getElementById('cameraVideo');

      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        currentHls = new Hls();
        currentHls.loadSource(data.result.url);
        currentHls.attachMedia(video);

        currentHls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          document.getElementById('cameraLoading').style.display = 'none';
          clearTimeout(snapTimeout);

          // BLOQUEAR CALIDAD MAXIMA (Para evitar saltos SD/HD)
          if (data.levels && data.levels.length > 1) {
            const highest = data.levels.length - 1;
            updateCamLog(`Manifest: ${data.levels.length} niveles. Forzando L${highest}`);
            currentHls.currentLevel = highest;
            currentHls.loadLevel = highest;
          }

          video.play();
          updateCamLog("PLAYING HD (LOCKED)");
        });
      }
    }
  } catch (e) { updateCamLog("ERROR: " + e.message); }
}

async function toggleWebRTC(deviceId) {
  updateCamLog("SOLICITANDO WEBRTC...");
  try {
    const res = await fetch(`/api/devices/${deviceId}/webrtc-configs`);
    const configs = await res.json();
    updateCamLog("WebRTC Config: " + (configs.success ? "OK" : "Error"));

    if (configs.success) {
      updateCamLog("Protocolo WebRTC disponible.");
      alert("El dispositivo soporta WebRTC. Para activarlo se requiere un túnel P2P.\nPor ahora, he bloqueado el HLS en su resolución máxima para evitar el pixelado.");
    } else {
      updateCamLog("WebRTC no soportado por este firmware.");
    }
  } catch (e) { updateCamLog("WebRTC Error: " + e.message); }
}

let currentQualityIndex = 0;
const qualityLevels = ['4', '1', '2', '0']; // HD-SDK, HD-Gen, Med, SD

async function cycleQuality(deviceId) {
  currentQualityIndex = (currentQualityIndex + 1) % qualityLevels.length;
  const q = qualityLevels[currentQualityIndex];
  updateCamLog(`CAMBIANDO CALIDAD A: ${q}`);

  // Intentar forzar nitidez maxima
  try {
    await fetch(`/api/devices/${deviceId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ipc_sharp', value: 100 })
    });
  } catch (e) { }

  const d = JSON.parse(document.getElementById('camModalContent').getAttribute('data-device'));

  // Almacenamos preferencia temporalmente
  localStorage.setItem('cam_pref_q', q);

  openCameraDirect(d);
}

async function forceCameraHD(deviceId) {
  const logNode = document.getElementById('cameraDebugLog');
  if (logNode) logNode.innerHTML += `<div>[${new Date().toLocaleTimeString()}] RE-FORZANDO HD...</div>`;
  try {
    await fetch(`/api/devices/${deviceId}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'video_clarity', value: 'HD' })
    });
    // Intentar recargar stream
    setTimeout(() => {
      const d = JSON.parse(document.getElementById('camModalContent').getAttribute('data-device'));
      openCameraDirect(d);
    }, 1000);
  } catch (e) { console.error(e); }
}

// Carousel Navigation
function goToPage(pageIndex) {
  const carousel = document.getElementById('viewCarousel');
  const dots = document.querySelectorAll('.page-indicators .dot');
  if (!carousel) return;

  currentGlobalPage = pageIndex;
  // El contenedor es 200vw o 200%. Pagina 0: 0, Pagina 1: -50%
  const offset = pageIndex * -50;
  carousel.style.transform = `translateX(${offset}%)`;

  dots.forEach((dot, idx) => {
    dot.classList.toggle('active', idx === pageIndex);
  });
}

/* ========================================
   DASHBOARD & WIDGET SYSTEM (Phase 2)
   ======================================== */
const DASHBOARD_CONFIG_KEY = 'wallpanel_v3_dashboard_widgets';

window.DashboardManager = {
  widgets: JSON.parse(localStorage.getItem(DASHBOARD_CONFIG_KEY)) || [
    { id: 'widget-clock', type: 'clock' },
    { id: 'widget-weather', type: 'weather' }
  ],

  isEditMode: false,

  save() {
    localStorage.setItem(DASHBOARD_CONFIG_KEY, JSON.stringify(this.widgets));
  },

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    const dashView = document.getElementById('dashboard-view');
    if (dashView) {
      dashView.classList.toggle('edit-mode', this.isEditMode);
    }

    if (!this.isEditMode) {
      this.syncAllWidgetDimensions();
      this.save();
      showNotification("Configuración guardada 💾");
    } else {
      showNotification("Modo Edición Activado 🛠️");
    }

    this.render();
  },

  syncAllWidgetDimensions() {
    this.widgets.forEach(w => {
      const el = document.getElementById(w.id);
      if (el) {
        w.x = el.offsetLeft;
        w.y = el.offsetTop;
        w.w = el.offsetWidth;
        w.h = el.offsetHeight;
        w.pos = 'absolute';
      }
    });
  },

  render() {
    const grid = document.getElementById('dashboardGrid');
    if (!grid) return;

    const emptyMsg = grid.querySelector('.dashboard-empty');
    grid.innerHTML = '';
    if (emptyMsg) grid.appendChild(emptyMsg);

    if (this.widgets.length === 0) {
      if (emptyMsg) emptyMsg.style.display = 'flex';
    } else {
      if (emptyMsg) emptyMsg.style.display = 'none';
      this.widgets.forEach(w => this.createWidgetElement(w, grid));
    }

    if (this.widgets.some(w => w.type === 'clock')) {
      if (window.flipClockInterval) clearInterval(window.flipClockInterval);
      window.flipClockInterval = setInterval(updateFlipClock, 1000);
      updateFlipClock();
    }
  },

  createWidgetElement(widget, container) {
    const card = document.createElement('div');
    card.className = 'glass-card widget-card';
    card.id = widget.id;

    // Apply saved dimensions or defaults
    if (widget.w) {
      card.style.width = widget.w + 'px';
    } else {
      // Default widths based on type
      const defaultWidth = widget.type === 'device' ? 200 : 300;
      card.style.width = defaultWidth + 'px';
    }

    if (widget.h) {
      card.style.height = widget.h + 'px';
    } else {
      // Default heights based on type
      const defaultHeight = widget.type === 'device' ? 280 : (widget.type === 'clock' ? 200 : 250);
      card.style.height = defaultHeight + 'px';
    }

    if (widget.pos === 'absolute') {
      card.style.position = 'absolute';
      card.style.left = (widget.x || 0) + 'px';
      card.style.top = (widget.y || 0) + 'px';
      card.style.margin = '0';
    }

    if (this.isEditMode) {
      this.initDragAndDrop(card, widget);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'widget-remove-btn';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      this.removeWidget(widget.id);
    };
    card.appendChild(removeBtn);

    if (widget.type === 'clock') {
      card.classList.add('widget-flip-clock');
      card.insertAdjacentHTML('beforeend', `
        <div class="flip-clock-container">
          <div class="flip-digit-group" id="group-hr">
            <div class="flip-card" data-current="00" data-next="00">
              <div class="top">00</div>
              <div class="bottom">00</div>
              <div class="leaf"><div class="leaf-front">00</div><div class="leaf-back">00</div></div>
            </div>
          </div>
          <div class="flip-separator">:</div>
          <div class="flip-digit-group" id="group-min">
            <div class="flip-card" data-current="00" data-next="00">
              <div class="top">00</div>
              <div class="bottom">00</div>
              <div class="leaf"><div class="leaf-front">00</div><div class="leaf-back">00</div></div>
            </div>
          </div>
          <div class="flip-separator">:</div>
          <div class="flip-digit-group" id="group-sec">
            <div class="flip-card" data-current="00" data-next="00">
              <div class="top">00</div>
              <div class="bottom">00</div>
              <div class="leaf"><div class="leaf-front">00</div><div class="leaf-back">00</div></div>
            </div>
          </div>
        </div>
      `);
    } else if (widget.type === 'calendar') {
      card.classList.add('widget-flip-calendar');
      const now = new Date();
      const day = now.getDate();
      const month = now.toLocaleString('es-ES', { month: 'short' }).toUpperCase();
      card.insertAdjacentHTML('beforeend', `
        <div class="flip-calendar-container">
           <div class="cal-month">${month}</div>
           <div class="flip-card" id="cal-day-card" data-current="${day}" data-next="${day}">
              <div class="top">${day}</div>
              <div class="bottom">${day}</div>
              <div class="leaf"><div class="leaf-front">${day}</div><div class="leaf-back">${day}</div></div>
           </div>
        </div>
      `);
    } else if (widget.type === 'weather') {
      card.insertAdjacentHTML('beforeend', `
        <div class="widget-weather-card">
          <div id="dashWeatherLoc" class="dash-weather-loc">Madrid, Cundinamarca</div>
          <div class="dash-weather-visuals">
             <i id="dashWeatherIconBase" class="fas fa-sun dash-weather-icon base"></i>
             <i id="dashWeatherIconOverlay" class="fas fa-cloud dash-weather-icon overlay"></i>
          </div>
          <div id="dashWeatherTemp" class="dash-weather-temp">--°C</div>
          <div id="dashWeatherDesc" class="dash-weather-desc">Cargando...</div>
        </div>
      `);
      setTimeout(updateDashboardWeather, 100);
    } else if (widget.type === 'device') {
      const device = groupedDevices.find(d => d.id === widget.deviceId);
      if (device) {
        const icon = getIconForDevice(device);
        card.classList.add('device-widget-card');
        if (device.isOn) card.classList.add('device-on');
        card.onclick = (e) => handleDeviceClick(e, device);
        card.insertAdjacentHTML('beforeend', `
            <div class="device-widget-icon">
                <img src="${icon}">
            </div>
            <div class="device-widget-name">${device.name}</div>
            <div class="device-widget-power">
                <i class="fas fa-power-off"></i>
            </div>
        `);
      } else {
        card.insertAdjacentHTML('beforeend', `<div style="padding:20px; color:#666;">Dispositivo no encontrado</div>`);
      }
    } else if (widget.type === 'music') {
      // Use Spotify API mini-player (same as in Home view)
      card.style.padding = '0';
      card.style.overflow = 'hidden'; // Enable resize without scrollbars
      card.classList.add('widget-music-mini');
      card.insertAdjacentHTML('beforeend', `
        <!-- Spotify Connect Overlay -->
        <div id="widgetSpotifyOverlay-${widget.id}" class="spotify-overlay-widget" onclick="authorizeSpotify()" style="display:none;">
          <i class="fab fa-spotify" style="font-size:4rem; margin-bottom:15px;"></i>
          <span>Conectar Spotify</span>
        </div>

        <!-- Album Art -->
        <div class="music-widget-art">
          <img src="https://placehold.co/400x400/1e1e1e/FFD700?text=Spotify&font=montserrat" 
               alt="Album Art" id="widgetMusicArt-${widget.id}">
        </div>

        <!-- Track Info -->
        <div class="music-widget-info">
          <div class="music-widget-title" id="widgetMusicTitle-${widget.id}">Conecta Spotify</div>
          <div class="music-widget-artist" id="widgetMusicArtist-${widget.id}">para ver info</div>
        </div>

        <!-- Mini Controls -->
        <div class="music-widget-controls">
          <button class="music-ctrl-btn small" onclick="event.stopPropagation(); controlMusic('previous');">
            <i class="fas fa-step-backward"></i>
          </button>
          <button class="music-ctrl-btn play" onclick="event.stopPropagation(); controlMusic('playpause');" id="widgetPlayBtn-${widget.id}">
            <i class="fas fa-play"></i>
          </button>
          <button class="music-ctrl-btn small" onclick="event.stopPropagation(); controlMusic('next');">
            <i class="fas fa-step-forward"></i>
          </button>
        </div>
      `);
      // Call update immediately if token exists
      setTimeout(() => updateWidgetMusicCard(widget.id), 100);
    }

    container.appendChild(card);
  },

  initDragAndDrop(el, widget) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    el.onpointerdown = (e) => {
      if (!this.isEditMode || e.target.closest('.widget-remove-btn')) return;

      isDragging = true;
      el.setPointerCapture(e.pointerId);

      startX = e.clientX;
      startY = e.clientY;
      initialLeft = el.offsetLeft;
      initialTop = el.offsetTop;

      el.style.zIndex = '1000';
      el.style.transition = 'none';
      el.style.position = 'absolute';
      el.style.margin = '0';
      el.style.cursor = 'grabbing';
    };

    el.onpointermove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      el.style.left = (initialLeft + dx) + 'px';
      el.style.top = (initialTop + dy) + 'px';
    };

    el.onpointerup = (e) => {
      if (!isDragging) return;
      isDragging = false;
      el.releasePointerCapture(e.pointerId);
      el.style.zIndex = '';
      el.style.transition = '';
      el.style.cursor = 'move';

      widget.x = el.offsetLeft;
      widget.y = el.offsetTop;
      widget.pos = 'absolute';
    };
  },

  removeWidget(id) {
    this.widgets = this.widgets.filter(w => w.id !== id);
    this.save();
    this.render();
  },

  addWidget(type, deviceId = null) {
    const id = `widget-${Date.now()}`;
    const newWidget = { id, type, deviceId };
    this.widgets.push(newWidget);
    this.save();
    this.render();
    if (typeof closeWidgetSelector === 'function') closeWidgetSelector();
    showNotification(`Widget agregado: ${type}`);
  }
};

function updateDashboardWeather() {
  // Solo llama a updateWeather que ya centraliza todo
  updateWeather();
}

// Modal Controls
window.openWidgetSelector = function () {
  const modal = document.getElementById('widgetSelectorModal');
  const list = document.getElementById('deviceWidgetList');
  if (!modal || !list) return;

  list.innerHTML = `
    <div class="gallery-category">
        <h4 style="margin:20px 0 10px 0; color:var(--primary-yellow); border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">UTILIDADES</h4>
        <div class="gallery-grid">
            <div class="gallery-item" onclick="DashboardManager.addWidget('clock')">
                <i class="fas fa-clock"></i>
                <span style="display:block; margin-top:5px;">Reloj Flip</span>
            </div>
            <div class="gallery-item" onclick="DashboardManager.addWidget('weather')">
                <i class="fas fa-cloud-sun"></i>
                <span style="display:block; margin-top:5px;">Clima</span>
            </div>
            <div class="gallery-item" onclick="DashboardManager.addWidget('music')">
                <i class="fab fa-spotify"></i>
                <span style="display:block; margin-top:5px;">Música</span>
            </div>
            <div class="gallery-item" onclick="DashboardManager.addWidget('calendar')">
                <i class="fas fa-calendar-alt"></i>
                <span style="display:block; margin-top:5px;">Calendario</span>
            </div>
        </div>
    </div>

    <div class="gallery-category" style="margin-top:20px;">
        <h4 style="margin:20px 0 10px 0; color:var(--primary-yellow); border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:5px;">MIS DISPOSITIVOS</h4>
        <div id="selectorDeviceGrid" class="gallery-grid"></div>
    </div>
  `;

  const deviceGrid = document.getElementById('selectorDeviceGrid');
  groupedDevices.forEach(device => {
    const icon = getIconForDevice(device);
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.onclick = () => DashboardManager.addWidget('device', device.id);
    item.innerHTML = `
        <img src="${icon}" style="width:32px; height:32px; margin-bottom:5px;">
        <span>${device.name}</span>
    `;
    deviceGrid.appendChild(item);
  });

  modal.classList.add('active');
};

window.closeWidgetSelector = function () {
  document.getElementById('widgetSelectorModal').classList.remove('active');
};

window.addWidget = function (type) {
  DashboardManager.addWidget(type);
};

// Replace old init function
function initDashboardWidgets() {
  const grid = document.getElementById('dashboardGrid');
  if (!grid) return;

  // Only render if grid is empty (initial load) - don't destroy existing widgets
  const existingWidgets = grid.querySelectorAll('.widget-card');
  if (existingWidgets.length === 0) {
    DashboardManager.render();
  }
  // Otherwise, widgets are already rendered and will update themselves
}

function updateFlipClock() {
  const now = new Date();
  const time = {
    hr: String(now.getHours()).padStart(2, '0'),
    min: String(now.getMinutes()).padStart(2, '0'),
    sec: String(now.getSeconds()).padStart(2, '0')
  };

  Object.keys(time).forEach(unit => {
    const parent = document.getElementById(`group-${unit}`);
    if (!parent) return;
    const card = parent.querySelector('.flip-card');
    const newVal = time[unit];
    const currVal = card.querySelector('.top').innerText;

    if (newVal !== currVal) {
      card.querySelector('.top').innerText = newVal;
      card.querySelector('.bottom').innerText = newVal;
    }
  });

  // Calendar auto-update if present
  const calCard = document.getElementById('cal-day-card');
  if (calCard) {
    const d = String(now.getDate());
    if (calCard.querySelector('.top').innerText !== d) {
      calCard.querySelector('.top').innerText = d;
      calCard.querySelector('.bottom').innerText = d;
    }
  }
}

// Master Initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log("🚀 Powering up Wall Panel V3...");
  setTimeout(() => {
    // Si hay parámetros de Spotify en la URL, no resetear a page 0 inmediatamente para no confundir
    const params = new URLSearchParams(window.location.search);
    if (!params.has('code')) {
      goToPage(0);
    }
    initDashboardWidgets();
  }, 300);
});


function toggleCameraFullscreenDirect() {
  const c = document.getElementById('camModalContent');
  if (c) c.classList.toggle('fullscreen');
}

function closeCameraDirect() {
  if (currentHls) { currentHls.destroy(); currentHls = null; }
  document.getElementById('camModal').classList.remove('active');
}



/* ========================================
   AIR QUALITY MODAL
   ======================================== */
function openAirQualityModal(device) {
  const modal = document.getElementById('deviceModal');
  const content = document.getElementById('modalContent');
  const status = device.status || [];

  const getS = (code) => {
    const s = status.find(st => st.code === code);
    return s ? s.value : null;
  };

  // Extensive code mapping for different sensor versions
  const co2 = getS('co2_value') || getS('co2') || 0;
  const pm25 = getS('pm25_value') || getS('pm25') || getS('va_pm25') || 0;
  const pm10 = getS('pm10_value') || getS('pm10') || getS('va_pm10') || 0;
  const pm1 = getS('pm1_value') || getS('pm1') || getS('va_pm1') || 0;
  const temp = (getS('temp_current') || getS('va_temperature') || getS('temperature') || 0) / 10;
  const hum = getS('humidity_value') || getS('va_humidity') || getS('humidity') || 0;
  const voc = getS('voc_value') || getS('va_voc') || getS('voc') || 0;
  const tvoc = getS('va_tvoc') || getS('tvoc') || 0;
  const hcho = getS('ch2o_value') || getS('va_hcho') || getS('hcho') || 0;
  // CO Mapping: Agregado co_indoor_value
  const co = getS('co_indoor_value') || getS('co_value') || getS('co') || 0;
  // Gas Mapping:
  const ch4 = getS('gas_sensor_status') || getS('ch4_value') || getS('ch4') || 0;
  const o3 = getS('o3_value') || getS('o3') || 0;

  content.innerHTML = `
    <div class="modal-header">
      <h2 style="color:white; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-wind" style="color:var(--primary-yellow)"></i> 
        ${device.name}
      </h2>
      <button class="close-btn" onclick="closeMultiSwitchModal()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body">
      <div class="aq-grid">
        <div class="aq-card ${pm25 < 50 ? 'aq-status-good' : (pm25 < 100 ? 'aq-status-fair' : 'aq-status-poor')}">
          <div class="aq-label">PM2.5</div>
          <div class="aq-value">${pm25}<span class="aq-unit">µg/m³</span></div>
        </div>
        <div class="aq-card ${pm10 < 54 ? 'aq-status-good' : (pm10 < 154 ? 'aq-status-fair' : 'aq-status-poor')}">
          <div class="aq-label">PM10</div>
          <div class="aq-value">${pm10}<span class="aq-unit">µg/m³</span></div>
        </div>
        <div class="aq-card ${co2 < 800 ? 'aq-status-good' : (co2 < 1200 ? 'aq-status-fair' : 'aq-status-poor')}">
          <div class="aq-label">CO2</div>
          <div class="aq-value">${co2}<span class="aq-unit">ppm</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">PM1.0</div>
          <div class="aq-value">${pm1}<span class="aq-unit">µg/m³</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">Temperatura</div>
          <div class="aq-value">${temp.toFixed(1)}<span class="aq-unit">°C</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">Humedad</div>
          <div class="aq-value">${hum}<span class="aq-unit">%</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">Formaldehído (HCHO)</div>
          <div class="aq-value">${hcho}<span class="aq-unit">mg/m³</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">TVOC</div>
          <div class="aq-value">${tvoc}<span class="aq-unit">mg/m³</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">CO</div>
          <div class="aq-value">${co}<span class="aq-unit">ppm</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">VOC</div>
          <div class="aq-value">${voc}<span class="aq-unit">mg/m³</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">Ozono (O3)</div>
          <div class="aq-value">${o3}<span class="aq-unit">ppm</span></div>
        </div>
        <div class="aq-card">
          <div class="aq-label">Metano / Gas</div>
          <div class="aq-value">${ch4}<span class="aq-unit">%</span></div>
        </div>
      </div>
      <div style="margin-top:20px; font-size:0.8rem; color:#666; text-align:center;">
        Los valores se actualizan automáticamente desde Tuya Cloud
      </div>
    </div>
  `;

  modal.classList.add('active');
  setTimeout(() => content.style.transform = 'scale(1) rotateX(0)', 10);
}

function openVibrationModal(device) {
  const modal = document.getElementById('deviceModal');
  const content = document.getElementById('modalContent');
  const statusItem = (device.status || []).find(s => s.code === 'vibration_status');
  const status = statusItem ? statusItem.value : 'no_vibration';

  content.innerHTML = `
    <div class="modal-header">
      <h2 style="color:white; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-bell" style="color:var(--primary-yellow)"></i> 
        ${device.name}
      </h2>
      <button class="close-btn" onclick="closeMultiSwitchModal()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body" style="text-align:center; padding:40px;">
      <i class="fas ${status === 'vibration' || status === 'vibrate' ? 'fa-exclamation-triangle' : 'fa-check-circle'}" 
         style="font-size:4rem; color:${status === 'vibration' || status === 'vibrate' ? '#ff4444' : '#00ff88'}"></i>
      <h3 style="margin-top:20px; font-size:1.5rem;">${status === 'vibration' || status === 'vibrate' ? '¡Vibración Detectada!' : 'Sin Vibración'}</h3>
      <p style="color:#aaa; margin-top:10px;">Estado actual: ${status}</p>
    </div>
  `;

  modal.classList.add('active');
  setTimeout(() => content.style.transform = 'scale(1) rotateX(0)', 10);
}

// Keep closeMultiSwitchModal as generic close
function closeMultiSwitchModal() {

  document.getElementById('deviceModal').classList.remove('active');
}

window.toggleMultiSwitch = async function (deviceId, code, newValue) {
  try {
    await sendDeviceCommand(deviceId, code, newValue);

    // Update local state deeply
    const dev = groupedDevices.find(d => d.id === deviceId);
    if (dev) {
      const s = dev.status.find(st => st.code === code);
      if (s) s.value = newValue;

      // Re-render modal to show new state
      openMultiSwitchModal(dev);

      // Update main UI too
      updateUI();
    }
  } catch (e) {
    console.error(e);
  }
};

/* ========================================
   DYNAMIC HOME VIEW RENDERING
   ======================================== */
function renderHomeView() {
  const grid = document.querySelector('.home-grid');
  if (!grid) return;

  grid.innerHTML = ''; // Clear existing

  // 1. Render User Rooms (from roomSettings)
  Object.keys(roomSettings).forEach(name => {
    // Skip 'Todos' which goes last
    if (name === 'Todos') return;

    // Create Card
    const card = document.createElement('div');
    card.className = 'glass-card room-card';
    card.onclick = () => navigateToRoom(name);

    // Icon resolving
    let iconKey = roomSettings[name].icon || name;
    let iconSrc = ICON_MAPPING[iconKey] || ICON_MAPPING['default'];

    let iconHTML = '';
    if (iconSrc.includes('.svg') || iconSrc.includes('/')) {
      iconHTML = `<img src="${iconSrc}" alt="${name}" onerror="this.src='custom-icons/device.svg'">`;
    } else {
      iconHTML = `<i class="fas fa-cube" style="font-size: 3rem; color: rgba(255,255,255,0.8);"></i>`;
    }

    card.innerHTML = `
        <div class="card-name">${name}</div>
        <div class="card-icon">
            ${iconHTML}
        </div>
        <div class="card-footer">
            <span class="device-count" id="count-${name}">0</span>
        </div>
        <div class="card-glow"></div>
    `;
    grid.appendChild(card);
  });

  // 2. Render Music Card (Fixed Position)
  const musicCard = document.createElement('div');
  musicCard.className = 'glass-card room-card music-card-horizontal';
  musicCard.id = 'musicCardBase';

  // Re-creating the custom UI that supports the JS logic
  musicCard.innerHTML = `
        <div class="music-card-header" onclick="navigateToMusic()">
            <span class="music-card-title">MUSICA</span>
        </div>

        <!-- Connect Overlay (Shown if no token) -->
        <div id="spotifyConnectOverlay" class="spotify-overlay" onclick="authorizeSpotify()" style="display:none;">
            <i class="fab fa-spotify" style="font-size:4rem; margin-bottom:10px;"></i>
            <span>Conectar Spotify</span>
        </div>

        <!-- Info & Art -->
        <div class="music-card-content" onclick="navigateToMusic()">
            <div class="music-card-art">
                <img src="https://placehold.co/800x800/1e1e1e/FFD700?text=Spotify&font=montserrat" 
                     alt="Album Art" id="musicCardArt">
            </div>
            <div class="music-track-info" id="musicTrackInfo">
                <div class="music-track-title" id="musicTitle">Cargando...</div>
                <div class="music-track-artist" id="musicArtist">Spotify</div>
            </div>
        </div>

        <!-- Mini Controls -->
        <div class="music-mini-controls">
            <button class="music-ctrl-btn small" onclick="event.stopPropagation(); controlMusic('previous')">
                <i class="fas fa-step-backward"></i>
            </button>
            <button class="music-ctrl-btn play" onclick="event.stopPropagation(); controlMusic('playpause')" id="playPauseBtn">
                <i class="fas fa-play"></i>
            </button>
            <button class="music-ctrl-btn small" onclick="event.stopPropagation(); controlMusic('next')">
                <i class="fas fa-step-forward"></i>
            </button>
        </div>
  `;
  grid.appendChild(musicCard);

  // Trigger update to check auth state immediately
  updateSpotifyUI();

  // 3. Render 'Todos' Card (Always Last)
  const todosCard = document.createElement('div');
  todosCard.className = 'glass-card room-card';
  todosCard.onclick = () => navigateToRoom('Todos');
  todosCard.innerHTML = `
        <div class="card-name">TODOS</div>
        <div class="card-icon">
            <i class="fas fa-layer-group" style="font-size: 3rem; color: rgba(255,255,255,0.8);"></i>
        </div>
        <div class="card-footer">
            <span class="device-count" id="count-Todos">0</span>
        </div>
        <div class="card-glow"></div>
  `;
  grid.appendChild(todosCard);
}

/* ========================================
   GLOBAL SETTINGS (Add Rooms)
   ======================================== */
window.openGlobalSettings = function () {
  const modal = document.getElementById('globalSettingsModal');
  const body = modal.querySelector('.modal-body');

  const iconOptions = Object.keys(ICON_MAPPING).map(key =>
    `<option value="${key}">${key}</option>`
  ).join('');

  const roomList = Object.keys(roomSettings)
    .filter(r => r !== 'Todos')
    .map(r => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:#333; padding:10px; margin-bottom:5px; border-radius:8px;">
                <span style="color:white;">${r}</span>
                <button onclick="deleteRoom('${r}')" style="background:#ff4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `).join('');

  // Get Manual Devices
  const manualDevices = JSON.parse(localStorage.getItem('manual_ip_devices')) || [];
  const manualListHtml = manualDevices.map((d, index) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:#333; padding:10px; margin-bottom:5px; border-radius:8px;">
            <div style="display:flex; flex-direction:column;">
                <span style="color:white; font-weight:bold;">${d.name}</span>
                <span style="color:#aaa; font-size:0.8rem;">${d.ip} (${d.type})</span>
            </div>
            <button onclick="deleteManualDevice(${index})" style="background:#ff4444; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
   `).join('');

  body.innerHTML = `
        <div class="config-group">
            <h3>Agregar Nueva Sala</h3>
            <input type="text" id="newRoomName" placeholder="Nombre de la sala" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#222; color:white;">
            <select id="newRoomIcon" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#222; color:white;">
                <option value="">Seleccionar Icono...</option>
                ${iconOptions}
            </select>
            <button onclick="addNewRoom()" style="width:100%; padding:10px; background:var(--primary-yellow); border:none; border-radius:8px; font-weight:bold; cursor:pointer; color:black;">
                Crear Sala
            </button>
        </div>

        <div class="config-group">
            <h3>Administrar Salas</h3>
            <div style="max-height: 150px; overflow-y: auto;">
                ${roomList || '<p style="color:#aaa; font-size:0.9rem;">No hay salas personalizadas.</p>'}
            </div>
        </div>

        <div class="config-group" style="margin-top:20px; border-top:1px solid #444; padding-top:20px;">
             <h3>Dispositivos Manuales (IP)</h3>
             <p style="font-size:0.8rem; color:#aaa; margin-bottom:10px;">Para dispositivos locales (Roku, Android) no detectados por SmartThings.</p>
             
             <input type="text" id="manualDevName" placeholder="Nombre (ej. TV Sala)" style="width:100%; padding:10px; margin-bottom:5px; border-radius:8px; border:none; background:#222; color:white;">
             <input type="text" id="manualDevIP" placeholder="IP (ej. 192.168.1.77)" style="width:100%; padding:10px; margin-bottom:5px; border-radius:8px; border:none; background:#222; color:white;">
             <select id="manualDevType" style="width:100%; padding:10px; margin-bottom:10px; border-radius:8px; border:none; background:#222; color:white;">
                 <option value="roku">Roku (Puerto 8060)</option>
                 <option value="android">Android TV (Genérico IP)</option>
             </select>
             <button onclick="addManualDevice()" style="width:100%; padding:10px; background:var(--primary-yellow); border:none; border-radius:8px; font-weight:bold; cursor:pointer; color:black;">
                Agregar Dispositivo IP
            </button>

            <div style="max-height: 150px; overflow-y: auto; margin-top:10px;">
                ${manualListHtml || '<p style="color:#aaa; font-size:0.8rem;">No hay dispositivos manuales.</p>'}
            </div>
        </div>

        <div class="config-group" style="margin-top:20px; border-top:1px solid #444; padding-top:20px;">
            <h3>Integraciones API</h3>
            
            <!-- Spotify -->
            <p style="font-size:0.8rem; color:#aaa; margin-bottom:5px;">Spotify Client ID</p>
            <input type="text" id="spotifyClientIdInput" placeholder="Client ID" value="${SPOTIFY_CLIENT_ID || ''}"
                style="width:100%; padding:10px; margin-bottom:15px; border-radius:8px; border:1px solid #444; background:#222; color:white;">

            <!-- SmartThings -->
            <p style="font-size:0.8rem; color:#aaa; margin-bottom:5px;">Samsung SmartThings Token</p>
            <div style="display:flex; gap:10px;">
                <input type="text" id="stTokenInput" placeholder="Personal Access Token" value="${SMARTTHINGS_TOKEN || ''}"
                    style="flex:1; padding:10px; border-radius:8px; border:1px solid #444; background:#222; color:white;">
                <button onclick="resetSmartThingsToken()" style="background:#ff4444; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;" title="Limpiar Token">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
            <p style="font-size:0.7rem; color:#666; margin-top:5px;">Consíguelo en <a href="https://account.smartthings.com/tokens" target="_blank" style="color:var(--primary-yellow)">account.smartthings.com</a></p>
        </div>
    `;

  modal.classList.add('active');
}

window.closeGlobalSettings = function () {
  document.getElementById('globalSettingsModal').classList.remove('active');
}

window.saveGlobalSettings = function () {
  const spotifyInput = document.getElementById('spotifyClientIdInput');
  if (spotifyInput) {
    localStorage.setItem('spotify_client_id', spotifyInput.value.trim());
  }

  const stInput = document.getElementById('stTokenInput');
  if (stInput) {
    localStorage.setItem('smartthings_token', stInput.value.trim());
  }

  location.reload();
}

window.resetSmartThingsToken = function () {
  if (confirm("¿Seguro que quieres borrar el Token de SmartThings?")) {
    localStorage.removeItem('smartthings_token');
    SMARTTHINGS_TOKEN = '';
    const input = document.getElementById('stTokenInput');
    if (input) input.value = '';
    showNotification("Token borrado. Ingresa uno nuevo y guarda.");
  }
}

// Manual Device Logic
window.addManualDevice = function () {
  const name = document.getElementById('manualDevName').value.trim();
  const ip = document.getElementById('manualDevIP').value.trim();
  const type = document.getElementById('manualDevType').value;

  if (!name || !ip) { alert("Nombre e IP requeridos"); return; }

  const validIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip);
  if (!validIp) { alert("IP inválida"); return; }

  const manualDevices = JSON.parse(localStorage.getItem('manual_ip_devices')) || [];
  manualDevices.push({ name, ip, type, id: 'manual_' + Date.now(), platform: 'manual' });

  localStorage.setItem('manual_ip_devices', JSON.stringify(manualDevices));

  // Refresh modal and app
  openGlobalSettings();
  location.reload();
}

window.deleteManualDevice = function (index) {
  const manualDevices = JSON.parse(localStorage.getItem('manual_ip_devices')) || [];
  manualDevices.splice(index, 1);
  localStorage.setItem('manual_ip_devices', JSON.stringify(manualDevices));
  openGlobalSettings();
  location.reload();
}

window.addNewRoom = function () {
  const nameInput = document.getElementById('newRoomName');
  const iconSelect = document.getElementById('newRoomIcon');
  const name = nameInput.value.trim();
  const iconKey = iconSelect.value;

  if (!name) {
    alert("Por favor escribe un nombre para la sala.");
    return;
  }
  if (roomSettings[name]) {
    alert("Ya existe una sala con este nombre.");
    return;
  }

  // Add to settings
  roomSettings[name] = {
    devices: [],
    bg: 'backgrounds/Fondo.jpg',
    layout: 'grid',
    icon: iconKey
  };

  // Save
  localStorage.setItem(ROOM_CONFIG_KEY, JSON.stringify(roomSettings));

  // Refresh
  renderHomeView();
  updateUI();
  openGlobalSettings(); // Refresh list to show new room
}

window.deleteRoom = function (name) {
  if (!confirm(`¿Estás seguro de que quieres eliminar la sala "${name}"?`)) return;

  delete roomSettings[name];
  localStorage.setItem(ROOM_CONFIG_KEY, JSON.stringify(roomSettings));

  renderHomeView();
  updateUI();
  openGlobalSettings();
}

// Initial Render
document.addEventListener('DOMContentLoaded', () => {
  renderHomeView();
});

/* ========================================
   SMARTTHINGS API INTEGRATION (FINAL)
   ======================================== */
async function loadSmartThingsDevices() {
  if (!SMARTTHINGS_TOKEN) {
    console.log("No SmartThings Token configured.");
    return [];
  }

  console.log("Loading SmartThings with token...");

  try {
    const response = await fetch('https://api.smartthings.com/v1/devices', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SMARTTHINGS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error("SmartThings API Error:", response.status);
      if (response.status === 401) {
        if (!window.stErrorShown) {
          showNotification("Token SmartThings inválido o expirado. Ve a configuración.", "error");
          window.stErrorShown = true;
        }
      }
      return [];
    }
    window.stErrorShown = false;


    const data = await response.json();
    console.log("SmartThings Devices Found:", data.items.length);

    // DEBUG: Log all devices and their capabilities to help find the missing TV
    data.items.forEach(d => {
      const caps = d.components?.[0]?.capabilities?.map(c => c.id) || [];
      console.log(`Device: ${d.label || d.name} | Capabilities: ${caps.join(', ')}`);
    });

    return data.items.map(device => ({
      id: device.deviceId,
      name: device.label || device.name,
      platform: 'smartthings',
      category: getCategoryFromCapabilities(device.components?.[0]?.capabilities || []),
      isOn: false,
      status: [],
      fullStatus: null, // Placeholder for full details
      originalData: device
    }));

  } catch (error) {
    console.error("Failed to load SmartThings devices:", error);
    return [];
  }
}

function getCategoryFromCapabilities(capabilities) {
  const caps = capabilities.map(c => c.id);
  if (caps.includes('washerOperatingState')) return 'washer';
  if (caps.includes('presenceSensor') && caps.includes('battery')) return 'mobile';

  // Broader TV Check
  if (
    caps.includes('tv') ||
    caps.includes('mediaPlayback') ||
    caps.includes('mediaTrackControl') ||
    caps.includes('audioVolume') ||
    caps.includes('samsungTV') ||
    caps.includes('refresh') // Some basic infrared remotes only show 'refresh' + 'switch'
  ) return 'tv';

  if (caps.includes('switch')) return 'light';
  return 'default';
}

async function getSmartThingsDeviceStatus(deviceId) {
  if (!SMARTTHINGS_TOKEN) return null;
  try {
    const response = await fetch(`https://api.smartthings.com/v1/devices/${deviceId}/status`, {
      headers: { 'Authorization': `Bearer ${SMARTTHINGS_TOKEN}` }
    });
    return await response.json(); // Return full object
  } catch (e) {
    console.error("ST Status Error:", e);
    return null;
  }
}

function openMobileDetailModal(device) {
  const modal = document.getElementById('deviceModal');
  const content = document.getElementById('modalContent');
  const main = device.fullStatus?.components?.main || {};

  // Extract Status
  const battery = main.battery?.battery?.value; // e.g. 85
  const presence = main.presenceSensor?.presence?.value; // 'present' or 'not present'
  const charging = main.powerSource?.powerSource?.value; // 'battery', 'dc', 'mains'

  // Format Values
  const batteryLevel = battery !== undefined ? `${battery}%` : '--';
  const isPresent = presence === 'present';
  const locationText = isPresent ? 'En Casa' : 'Ausente';
  const locationColor = isPresent ? 'var(--primary-yellow)' : '#ff4444';

  // Charging Icon
  let batteryIcon = 'fa-battery-full';
  if (battery !== undefined) {
    if (battery < 20) batteryIcon = 'fa-battery-quarter';
    else if (battery < 50) batteryIcon = 'fa-battery-half';
    else if (battery < 80) batteryIcon = 'fa-battery-three-quarters';
  }

  // Charging Status Text
  let chargingText = '';
  if (charging === 'dc' || charging === 'mains') {
    chargingText = '<span style="color:#00ff00; font-size:0.8rem; margin-left:5px;"><i class="fas fa-bolt"></i> Cargando</span>';
  }

  // Location / Presence Section
  const presenceHTML = `
      <div class="st-stat-card" style="grid-column: span 2;">
          <div class="label">Ubicación / Presencia</div>
          <div class="value large" style="color:${locationColor}">${locationText}</div>
      </div>
  `;

  content.innerHTML = `
    <div class="modal-header">
      <h2 style="color:white; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-mobile-alt" style="color:var(--primary-yellow)"></i> 
        ${device.name}
      </h2>
      <button class="close-btn" onclick="closeMultiSwitchModal()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top:20px;">
          
          <!-- Battery -->
          <div class="st-stat-card">
              <div class="label">Batería</div>
              <div class="value">
                  <i class="fas ${batteryIcon}"></i> ${batteryLevel}
                  ${chargingText}
              </div>
          </div>

          <!-- Signal (Placeholder or Actual if available) -->
          <div class="st-stat-card">
              <div class="label">Señal</div>
              <div class="value">Active</div> 
          </div>

          ${presenceHTML}

      </div>
      
      <div style="margin-top:20px; font-size:0.8rem; color:#666; text-align:center;">
        Datos actualizados de SmartThings
      </div>
    </div>
  `;

  modal.classList.add('active');
  setTimeout(() => content.style.transform = 'scale(1) rotateX(0)', 10);
}

function openTVControlModal(device) {
  const modal = document.getElementById('deviceModal');
  const content = document.getElementById('modalContent');
  const main = device.fullStatus?.components?.main || {};

  // Extract Info
  const trackDesc = main.audioTrackData?.audioTrackData?.value || {};
  const playbackStatus = main.mediaPlayback?.playbackStatus?.value || 'unknown';
  const volume = main.audioVolume?.volume?.value || 0;

  let title = "Reproduciendo";
  let artist = device.name;
  let artUrl = "custom-icons/Camara.svg"; // Fallback icon

  if (trackDesc && typeof trackDesc === 'object') {
    if (trackDesc.title) title = trackDesc.title;
    if (trackDesc.artist) artist = trackDesc.artist;
    if (trackDesc.albumArtUrl) artUrl = trackDesc.albumArtUrl;
  }

  // Power State
  const powerState = main.switch?.switch?.value || 'off';
  const isPowerOn = powerState === 'on';

  content.innerHTML = `
    <div class="modal-header">
      <h2 style="color:white; display:flex; align-items:center; gap:10px;">
        <i class="fas fa-tv" style="color:var(--primary-yellow)"></i> 
        ${device.name}
      </h2>
      <button class="close-btn" onclick="closeMultiSwitchModal()">
        <i class="fas fa-times"></i>
      </button>
    </div>
    <div class="modal-body">
      
      <!-- Power & Art Section -->
      <div style="text-align:center; margin-bottom:20px;">
          <div style="position:relative; display:inline-block;">
             <img src="${artUrl}" style="width:100%; max-width:300px; border-radius:12px; box-shadow:0 5px 15px rgba(0,0,0,0.5);">
             <div style="position:absolute; bottom:10px; left:10px; right:10px; background:rgba(0,0,0,0.7); padding:5px; border-radius:6px; color:white;">
                <div style="font-weight:bold; font-size:1rem;">${title}</div>
                <div style="font-size:0.8rem; color:#ccc;">${artist}</div>
             </div>
          </div>
          
          <div style="margin-top:15px;">
               <button class="st-ctrl-btn ${isPowerOn ? '' : 'stop'}" 
                       style="border-radius:50%; width:60px; height:60px; font-size:1.5rem;"
                       onclick="dispatchMediaCommand('${device.id}', 'switch', '${isPowerOn ? 'off' : 'on'}')">
                   <i class="fas fa-power-off"></i>
               </button>
          </div>
      </div>

      <!-- Controls Grid -->
      <div style="display:grid; grid-template-columns: 1fr 1.5fr 1fr; gap:10px; align-items:center;">
          
          <!-- Volume -->
          <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
              <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'volume', 'up')">
                 <i class="fas fa-plus"></i>
              </button>
              <span style="font-weight:bold; color:var(--primary-yellow);">${volume}%</span>
              <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'volume', 'down')">
                 <i class="fas fa-minus"></i>
              </button>
          </div>

          <!-- D-Pad -->
          <div class="d-pad-grid" style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; justify-items:center;">
               <div></div>
               <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'key', 'up')"><i class="fas fa-chevron-up"></i></button>
               <div></div>
               
               <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'key', 'left')"><i class="fas fa-chevron-left"></i></button>
               <button class="st-ctrl-btn small main-ok" onclick="dispatchMediaCommand('${device.id}', 'key', 'ok')">OK</button>
               <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'key', 'right')"><i class="fas fa-chevron-right"></i></button>

               <div></div>
               <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'key', 'down')"><i class="fas fa-chevron-down"></i></button>
               <div></div>
          </div>
          
          <!-- Media Transport -->
           <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
              <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'media', 'play')">
                 <i class="fas fa-play"></i>
              </button>
              <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'media', 'pause')">
                 <i class="fas fa-pause"></i>
              </button>
              <button class="st-ctrl-btn small" onclick="dispatchMediaCommand('${device.id}', 'key', 'home')">
                 <i class="fas fa-home"></i>
              </button>
          </div>

      </div>
    </div>
  `;

  modal.classList.add('active');
  setTimeout(() => content.style.transform = 'scale(1) rotateX(0)', 10);
}

// Global Dispatcher
window.dispatchMediaCommand = function (deviceId, type, action) {
  console.log(`[MediaDispatch] Request: ID=${deviceId}, Type=${type}, Action=${action}`);

  // Find device in available lists
  const device = groupedDevices.find(d => d.id === deviceId);

  if (!device) {
    console.error(`[MediaDispatch] Device not found in groupedDevices: ${deviceId}`);
    // Fallback search in raw lists if needed, but groupedDevices should have it.
    return;
  }

  console.log(`[MediaDispatch] Found Device: ${device.name} (${device.platform})`);

  if (device.platform === 'smartthings') {
    sendSmartThingsMediaCommand(deviceId, type, action);
  } else if (device.platform === 'tuya') {
    sendTuyaIrCommand(device, type, action);
  } else if (device.platform === 'manual') {
    sendIpCommand(device, type, action);
  }
}

async function sendTuyaIrCommand(device, type, action) {
  console.log(`[TuyaIR] Sending ${type}:${action} to ${device.id} via Server`);

  // Mapping standard actions to Tuya IR keys
  let irKey = action;
  if (type === 'volume') irKey = action === 'up' ? 'vol+' : 'vol-';
  if (type === 'key') {
    if (action === 'up') irKey = 'up';
    if (action === 'down') irKey = 'down';
    if (action === 'left') irKey = 'left';
    if (action === 'right') irKey = 'right';
    if (action === 'ok') irKey = 'ok';
    if (action === 'home') irKey = 'home';
  }
  if (type === 'switch') irKey = 'power';

  try {
    const res = await fetch(`/api/devices/${device.id}/ir-commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: irKey })
    });

    if (!res.ok) throw new Error("IR Server failed");
    showNotification(`Comando IR ${irKey} enviado`);
  } catch (e) {
    console.error("[TuyaIR] Error:", e);
    showNotification("Error enviando comando IR", "error");
  }
}

async function sendIpCommand(device, type, action) {
  console.log(`[IPCommand] Sending to ${device.ip} (${device.type})...`);

  if (device.type === 'roku') {
    let key = '';
    if (type === 'key') {
      if (action === 'up') key = 'Up';
      if (action === 'down') key = 'Down';
      if (action === 'left') key = 'Left';
      if (action === 'right') key = 'Right';
      if (action === 'ok') key = 'Select';
      if (action === 'home') key = 'Home';
    } else if (type === 'volume') {
      key = action === 'up' ? 'VolumeUp' : 'VolumeDown';
    } else if (type === 'switch') {
      key = 'Power'; // Toggle
    } else if (type === 'media') {
      if (action === 'play') key = 'Play';
      if (action === 'pause') key = 'Play'; // Roku uses toggle
    }

    if (key) {
      try {
        const url = `http://${device.ip}:8060/keypress/${key}`;
        console.log(`[IPCommand] Fetching: ${url}`);
        await fetch(url, { method: 'POST' });
      } catch (e) {
        console.error("[IPCommand] Roku Error", e);
        showNotification("Error contactando el dispositivo Roku local", "error");
      }
    }
  } else if (device.type === 'android') {
    // Legacy ADB logic removed as per user request for Tuya IR solution
    console.warn(`[IPCommand] Android IP Control is legacy. Please use Tuya IR for ${device.name}`);
    showNotification(`Control IP deshabilitado para ${device.name}. Usa el control Tuya.`, "info");
  }
}

// Dedicated helper for media commands
async function sendSmartThingsMediaCommand(deviceId, type, action) {
  if (!SMARTTHINGS_TOKEN) return;

  let capability = '';
  let command = '';
  let args = [];

  if (type === 'switch') {
    capability = 'switch';
    command = action;
  } else if (type === 'volume') {
    capability = 'audioVolume';
    command = action === 'up' ? 'volumeUp' : 'volumeDown';
  } else if (type === 'media') {
    capability = 'mediaPlayback';
    command = action; // play, pause, stop
  } else if (type === 'key') {
    // This usually requires a custom capability or generic remote control
    // We will try 'mediaTrackControl' or assume specific driver handling
    // For many ST TVs, it's tricky. We'll try common standard commands if available
    // but 'up', 'down', 'ok' often aren't standard capabilities.
    // We will try to map to 'mediaPlayback' standard if possible or fail gracefully.
    // NOTE: Real D-Pad often needs specific 'remoteControl' cap not always standard.
    console.warn("D-Pad not fully standardized in ST API without specific capability.");
    return;
  }

  const body = {
    commands: [{
      component: 'main',
      capability: capability,
      command: command,
      arguments: args
    }]
  };

  try {
    await fetch(`https://api.smartthings.com/v1/devices/${deviceId}/commands`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SMARTTHINGS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (e) { console.error("ST Media Command Error:", e); }
}

async function sendSmartThingsCommand(deviceId, command) {
  if (!SMARTTHINGS_TOKEN) return;
  const body = {
    commands: [{
      component: 'main',
      capability: 'switch',
      command: command ? 'on' : 'off',
      arguments: []
    }]
  };
  try {
    await fetch(`https://api.smartthings.com/v1/devices/${deviceId}/commands`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SMARTTHINGS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (e) { console.error("ST Command Error:", e); }
}

// --- Control Visual del Asistente ---
const AssistantUI = {
    banner: document.getElementById('assistant-banner'),

    // Llama esto cuando el sistema detecte la palabra de activación
    showListening() {
        if (!this.banner) this.banner = document.getElementById('assistant-banner');
        if (this.banner) this.banner.className = 'assistant-banner-visible assistant-listening';
    },

    // Llama esto justo antes de que el asistente empiece a hablar
    showResponding() {
        if (!this.banner) this.banner = document.getElementById('assistant-banner');
        if (this.banner) this.banner.className = 'assistant-banner-visible assistant-responding';
    },

    // Llama esto cuando el asistente termine de hablar o se cancele la petición
    hide() {
        if (!this.banner) this.banner = document.getElementById('assistant-banner');
        if (this.banner) this.banner.className = 'assistant-banner-hidden';
    }
};

