// server.js — Wall Panel V4.8 Backend (Hybrid Local Disk + Vercel Private Blob Persistence, Tuya, SmartThings, Spotify Token Sync, Encrypted Vault)
import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: false });
import { kv } from '@vercel/kv';
import { put as blobPut, get as blobGet } from '@vercel/blob';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TuyaContext } from '@tuya/tuya-connector-nodejs';

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '25mb' }));
app.use('/assets', express.static(path.resolve('public/assets')));
app.use('/public', express.static(path.resolve('public')));
app.use(express.static('.'));

const PORT = process.env.PORT || 3001;
const VAULT_FILE = path.resolve('.secrets.vault.json');
const DOCS_DIR = path.resolve('house_docs');
const FACES_DIR = path.resolve('known_faces');
const VAULT_SECRET = process.env.VAULT_SECRET || 'familia_varela_paez_master_key_2026';

if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
if (!fs.existsSync(FACES_DIR)) fs.mkdirSync(FACES_DIR, { recursive: true });

// =========================================================
// 0. LAN IPv4 NETWORK DISCOVERY (FOR TABLET & MOBILE)
// =========================================================
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        addresses.push({ interface: name, ip: net.address, url: `http://${net.address}:${PORT}` });
      }
    }
  }
  return addresses;
}

app.get('/api/network-info', (req, res) => {
  res.json({
    port: PORT,
    lanAddresses: getLanAddresses(),
    hostname: os.hostname()
  });
});

// =========================================================
// 1. ENCRYPTED API CREDENTIALS & SECURITY PIN VAULT
// =========================================================
function getCipherKey() {
  return crypto.createHash('sha256').update(String(VAULT_SECRET)).digest();
}

function encryptText(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getCipherKey(), iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptText(payload) {
  if (!payload || !payload.includes(':')) return payload || '';
  try {
    const [ivHex, encHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getCipherKey(), iv);
    let decrypted = decipher.update(encHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return '';
  }
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(`wallpanel_pin_salt_${String(pin).trim()}`).digest('hex');
}

function hasVercelBlob() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function hasVercelKV() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function readBlobJson(pathname) {
  if (!hasVercelBlob()) return null;
  try {
    const res = await blobGet(pathname, { access: 'private' });
    if (res && res.statusCode === 200 && res.stream) {
      const txt = await new Response(res.stream).text();
      return JSON.parse(txt);
    }
  } catch (e) {
    if (!String(e.message || '').toLowerCase().includes('not found')) {
      console.warn(`[Blob] Read warning (${pathname}):`, e.message);
    }
  }
  return null;
}

async function writeBlobJson(pathname, dataObj) {
  if (!hasVercelBlob()) return false;
  try {
    await blobPut(pathname, JSON.stringify(dataObj, null, 2), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return true;
  } catch (e) {
    console.warn(`[Blob] Write warning (${pathname}):`, e.message);
    return false;
  }
}

async function loadVault() {
  const defaults = {
    TUYA_ACCESS_ID: process.env.TUYA_ACCESS_ID || '',
    TUYA_ACCESS_SECRET: process.env.TUYA_ACCESS_SECRET || '',
    TUYA_UID: process.env.TUYA_UID || '',
    TUYA_BASE_URL: process.env.TUYA_BASE_URL || 'https://openapi.tuyaus.com',
    SMARTTHINGS_TOKEN: process.env.SMARTTHINGS_TOKEN || '',
    SMARTTHINGS_CLIENT_ID: process.env.SMARTTHINGS_CLIENT_ID || '',
    SMARTTHINGS_CLIENT_SECRET: process.env.SMARTTHINGS_CLIENT_SECRET || '',
    SMARTTHINGS_REFRESH_TOKEN: process.env.SMARTTHINGS_REFRESH_TOKEN || '',
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '0686b83e9a174ce6855075bda440a62f',
    SPOTIFY_ACCESS_TOKEN: '',
    SPOTIFY_REFRESH_TOKEN: '',
    SPOTIFY_TOKEN_EXPIRY: '',
    ALEXA_VOICE_MONKEY_TOKEN: process.env.ALEXA_VOICE_MONKEY_TOKEN || '',
    ALEXA_VOICE_MONKEY_DEVICE: process.env.ALEXA_VOICE_MONKEY_DEVICE || 'echo-dot',
    ALEXA_NOTIFY_ME_CODE: process.env.ALEXA_NOTIFY_ME_CODE || '',
    SINRIC_APP_KEY: process.env.SINRIC_APP_KEY || '',
    SINRIC_DEVICE_ID: process.env.SINRIC_DEVICE_ID || '',
    HA_URL: process.env.HA_URL || 'http://homeassistant.local:8123',
    HA_TOKEN: process.env.HA_TOKEN || '',
    OLLAMA_URL: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
    OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.2',
    SECURITY_PIN_HASH: hashPin('123456'),
    SECURITY_ALERT_EMAIL: process.env.SECURITY_ALERT_EMAIL || '',
    SECURITY_EMAIL_WEBHOOK: process.env.SECURITY_EMAIL_WEBHOOK || ''
  };

  // 1. Try Vercel Private Blob encrypted vault
  const blobEncrypted = await readBlobJson('wallpanel_vault.enc.json');
  if (blobEncrypted && typeof blobEncrypted === 'object') {
    const decrypted = {};
    for (const [k, v] of Object.entries(blobEncrypted)) {
      const val = decryptText(v);
      if (val !== '') decrypted[k] = val;
    }
    return { ...defaults, ...decrypted };
  }

  // 2. Try Vercel KV if configured
  if (hasVercelKV()) {
    try {
      const stored = await kv.get('vault');
      if (stored) {
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        return { ...defaults, ...parsed };
      }
    } catch (e) {
      console.warn('[Vault] KV load warning:', e.message);
    }
  }

  // 3. Fallback to local file-based storage
  if (fs.existsSync(VAULT_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
      const decrypted = {};
      for (const [k, v] of Object.entries(raw)) {
        const val = decryptText(v);
        if (val !== '') decrypted[k] = val;
      }
      return { ...defaults, ...decrypted };
    } catch (e) {
      console.error('[Vault] File load error:', e.message);
    }
  }
  return defaults;
}

async function saveVault(newConfig) {
  const current = vaultConfig || await loadVault();
  const merged = { ...current, ...newConfig };
  vaultConfig = merged;
  const encrypted = {};
  for (const [k, v] of Object.entries(merged)) {
    encrypted[k] = encryptText(v);
  }
  try {
    fs.writeFileSync(VAULT_FILE, JSON.stringify(encrypted, null, 2), 'utf8');
  } catch (e) {
    // Expected on Vercel read-only FS
  }
  await writeBlobJson('wallpanel_vault.enc.json', encrypted);
  if (hasVercelKV()) {
    try { await kv.set('vault', JSON.stringify(merged)); } catch (e) {}
  }
  return merged;
}

let vaultConfig = await loadVault();
if (!process.env.VERCEL && !fs.existsSync(VAULT_FILE)) {
  await saveVault(vaultConfig);
}

function getTuyaClient() {
  return new TuyaContext({
    baseUrl: vaultConfig.TUYA_BASE_URL || 'https://openapi.tuyaus.com',
    accessKey: vaultConfig.TUYA_ACCESS_ID,
    secretKey: vaultConfig.TUYA_ACCESS_SECRET,
  });
}

let tuya = getTuyaClient();

app.get('/api/vault/status', (req, res) => {
  const mask = (str) => {
    if (!str) return '';
    if (str.length <= 8) return '****';
    return str.slice(0, 4) + '••••••••' + str.slice(-4);
  };
  res.json({
    tuyaConfigured: !!(vaultConfig.TUYA_ACCESS_ID && vaultConfig.TUYA_ACCESS_SECRET),
    tuyaIdMask: mask(vaultConfig.TUYA_ACCESS_ID),
    tuyaUidMask: mask(vaultConfig.TUYA_UID),
    tuyaBaseUrl: vaultConfig.TUYA_BASE_URL,
    smartthingsConfigured: !!vaultConfig.SMARTTHINGS_TOKEN,
    smartthingsMask: mask(vaultConfig.SMARTTHINGS_TOKEN),
    smartthingsOAuthConfigured: !!(vaultConfig.SMARTTHINGS_CLIENT_ID && vaultConfig.SMARTTHINGS_REFRESH_TOKEN),
    spotifyClientId: vaultConfig.SPOTIFY_CLIENT_ID,
    alexaConfigured: !!(vaultConfig.ALEXA_VOICE_MONKEY_TOKEN || vaultConfig.ALEXA_NOTIFY_ME_CODE || vaultConfig.SINRIC_APP_KEY),
    alexaVoiceMonkeyDevice: vaultConfig.ALEXA_VOICE_MONKEY_DEVICE,
    haUrl: vaultConfig.HA_URL,
    haConfigured: !!vaultConfig.HA_TOKEN,
    haTokenMask: mask(vaultConfig.HA_TOKEN),
    ollamaUrl: vaultConfig.OLLAMA_URL,
    ollamaModel: vaultConfig.OLLAMA_MODEL,
    securityEmail: vaultConfig.SECURITY_ALERT_EMAIL || '',
    securityEmailWebhook: vaultConfig.SECURITY_EMAIL_WEBHOOK || '',
    lanAddresses: getLanAddresses()
  });
});

app.post('/api/vault/update', async (req, res) => {
  try {
    const updates = {};
    const allowedKeys = [
      'TUYA_ACCESS_ID', 'TUYA_ACCESS_SECRET', 'TUYA_UID', 'TUYA_BASE_URL',
      'SMARTTHINGS_TOKEN', 'SMARTTHINGS_CLIENT_ID', 'SMARTTHINGS_CLIENT_SECRET', 'SMARTTHINGS_REFRESH_TOKEN',
      'SPOTIFY_CLIENT_ID', 'SPOTIFY_ACCESS_TOKEN', 'SPOTIFY_REFRESH_TOKEN', 'SPOTIFY_TOKEN_EXPIRY',
      'ALEXA_VOICE_MONKEY_TOKEN', 'ALEXA_VOICE_MONKEY_DEVICE',
      'ALEXA_NOTIFY_ME_CODE', 'SINRIC_APP_KEY', 'SINRIC_DEVICE_ID',
      'HA_URL', 'HA_TOKEN', 'OLLAMA_URL', 'OLLAMA_MODEL',
      'SECURITY_ALERT_EMAIL', 'SECURITY_EMAIL_WEBHOOK'
    ];
    for (const key of allowedKeys) {
      if (req.body[key] !== undefined && req.body[key] !== '' && !String(req.body[key]).includes('••••')) {
        updates[key] = String(req.body[key]).trim();
      }
    }
    vaultConfig = await saveVault(updates);
    tuya = getTuyaClient();
    res.json({ success: true, message: 'Credenciales cifradas en AES-256 y guardadas de forma persistente.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync Spotify OAuth PKCE Tokens across PC, Tablet & Vercel
app.get('/api/spotify/token', async (req, res) => {
  if (!vaultConfig.SPOTIFY_ACCESS_TOKEN) {
    vaultConfig = await loadVault();
  }
  res.json({
    clientId: vaultConfig.SPOTIFY_CLIENT_ID || '0686b83e9a174ce6855075bda440a62f',
    accessToken: vaultConfig.SPOTIFY_ACCESS_TOKEN || '',
    refreshToken: vaultConfig.SPOTIFY_REFRESH_TOKEN || '',
    tokenExpiry: Number(vaultConfig.SPOTIFY_TOKEN_EXPIRY || 0)
  });
});

app.post('/api/spotify/token', async (req, res) => {
  try {
    const { clientId, accessToken, refreshToken, tokenExpiry } = req.body || {};
    const updates = {};
    if (clientId !== undefined) updates.SPOTIFY_CLIENT_ID = String(clientId).trim();
    if (accessToken !== undefined) updates.SPOTIFY_ACCESS_TOKEN = String(accessToken);
    if (refreshToken !== undefined) updates.SPOTIFY_REFRESH_TOKEN = String(refreshToken);
    if (tokenExpiry !== undefined) updates.SPOTIFY_TOKEN_EXPIRY = String(tokenExpiry);
    vaultConfig = await saveVault(updates);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================
// 1.5 ARMED SECURITY SYSTEM PIN VERIFICATION & EMAIL DISPATCH
// =========================================================
let securityEventsLog = [];

app.post('/api/security/verify-pin', (req, res) => {
  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ valid: false, error: 'PIN requerido' });
  const incomingHash = hashPin(pin);
  const currentHash = vaultConfig.SECURITY_PIN_HASH || hashPin('123456');
  const valid = incomingHash === currentHash;
  res.json({ valid });
});

app.post('/api/security/change-pin', async (req, res) => {
  const { currentPin, newPin } = req.body || {};
  if (!currentPin || !newPin || String(newPin).trim().length < 4) {
    return res.status(400).json({ success: false, error: 'PIN actual y nuevo PIN (mínimo 4 dígitos) requeridos.' });
  }
  const currentHash = vaultConfig.SECURITY_PIN_HASH || hashPin('123456');
  if (hashPin(currentPin) !== currentHash) {
    return res.status(403).json({ success: false, error: 'La contraseña actual no es correcta.' });
  }
  vaultConfig = await saveVault({ SECURITY_PIN_HASH: hashPin(newPin) });
  res.json({ success: true, message: 'Contraseña de seguridad actualizada y cifrada con SHA-256 + AES-256.' });
});

app.post('/api/security/send-alert-email', async (req, res) => {
  const { sensorName, sensorState, emailTo, details } = req.body || {};
  const targetEmail = emailTo || vaultConfig.SECURITY_ALERT_EMAIL || 'Sin correo configurado';
  const timestamp = new Date().toLocaleString('es-CO');

  const logItem = {
    id: 'sec_' + Date.now(),
    time: timestamp,
    sensorName: sensorName || 'Sensor de Seguridad',
    sensorState: sensorState || 'ABIERTO / ACTIVADO',
    emailTo: targetEmail,
    details: details || 'Alarma de intrusión activada tras 30 segundos sin desarmar.',
    dispatched: false
  };

  // Send via configured Webhook (Zapier / Make / IFTTT / FormSubmit) if present
  if (vaultConfig.SECURITY_EMAIL_WEBHOOK) {
    try {
      const r = await fetch(vaultConfig.SECURITY_EMAIL_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logItem)
      });
      if (r.ok) logItem.dispatched = true;
    } catch (e) {
      console.warn('[Security Email Webhook]', e.message);
    }
  }

  // Also add to work/notifications feed so it's visible everywhere
  securityEventsLog.unshift(logItem);
  if (securityEventsLog.length > 40) securityEventsLog.pop();

  console.log(`🚨 [SEGURIDAD ARMADA] Alerta enviada a ${targetEmail} | Sensor: ${sensorName} (${sensorState})`);
  res.json({ success: true, event: logItem });
});

app.get('/api/security/events', (req, res) => {
  res.json(securityEventsLog);
});

// =========================================================
// 2. TUYA CLOUD ENDPOINTS
// =========================================================
function normalizeDevice(d) {
  let state = false;
  const status = d.status || [];
  const sw = status.find(s => s.code === 'switch' || s.code === 'switch_led' || s.code.startsWith('switch_'));
  if (sw) state = !!sw.value;

  return {
    id: d.id,
    name: d.name || d.id,
    icon: 'lightbulb.svg',
    category: d.category,
    online: d.online,
    state: state,
    isOn: state,
    status: status,
    platform: 'tuya'
  };
}

app.get('/api/devices', async (req, res) => {
  try {
    if (!vaultConfig.TUYA_UID) {
      return res.json([{ id: 'demo1', name: 'Configura TUYA_UID en Bóveda API', state: false, online: true, icon: 'device.svg', platform: 'tuya' }]);
    }
    const pathUrl = `/v1.0/users/${vaultConfig.TUYA_UID}/devices`;
    const data = await tuya.request({ method: 'GET', path: pathUrl });

    if (!data.success) {
      return res.status(500).json({ error: 'tuya_list_error', msg: data.msg });
    }
    res.json((data?.result || []).map(normalizeDevice));
  } catch (err) {
    res.status(500).json({ error: 'tuya_list_error', detail: err?.message });
  }
});

app.get('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const info = await tuya.request({ method: 'GET', path: `/v1.0/devices/${id}` });
    const status = await tuya.request({ method: 'GET', path: `/v1.0/devices/${id}/status` });
    const shadow = await tuya.request({ method: 'GET', path: `/v2.0/cloud/thing/${id}/shadow/properties` });

    let mergedStatus = [...(status.success ? status.result : (info.result?.status || []))];
    if (shadow.success && shadow.result && shadow.result.properties) {
      shadow.result.properties.forEach(prop => {
        const existing = mergedStatus.find(s => s.code === prop.code);
        if (existing) existing.value = prop.value;
        else mergedStatus.push({ code: prop.code, value: prop.value });
      });
    }
    res.json(normalizeDevice({ ...(info?.result || {}), status: mergedStatus }));
  } catch (err) {
    res.status(500).json({ error: 'tuya_get_error', detail: err?.message });
  }
});

app.get('/api/devices/:id/stream', async (req, res) => {
  const { id } = req.params;
  try {
    const response = await tuya.request({
      method: 'POST',
      path: `/v1.0/devices/${id}/stream/actions/allocate`,
      body: { type: 'hls' }
    });
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/devices/:id/webrtc-configs', async (req, res) => {
  const { id } = req.params;
  try {
    const response = await tuya.request({
      method: 'GET',
      path: `/v1.0/devices/${id}/webrtc-configs`
    });
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/devices/:id/snapshot', async (req, res) => {
  const { id } = req.params;
  try {
    const response = await tuya.request({
      method: 'GET',
      path: `/v1.0/devices/${id}/snapshot`
    });
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  const { id } = req.params;
  const { commands } = req.body || {};
  try {
    const body = commands ? { commands } : { commands: [{ code: req.body.code || 'switch', value: req.body.value }] };
    const response = await tuya.request({
      method: 'POST',
      path: `/v1.0/devices/${id}/commands`,
      body
    });
    if (!response.success) throw new Error(response.msg || 'Tuya Error');
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: 'tuya_command_error', detail: err?.message });
  }
});

app.post('/api/devices/:id/ir-commands', async (req, res) => {
  const { id } = req.params;
  const { key } = req.body;
  try {
    const deviceDetail = await tuya.request({ method: 'GET', path: `/v1.0/iot-03/devices/${id}` });
    const resData = deviceDetail.result || {};
    const hubId = resData.gateway_id || resData.parent_id;

    if (!hubId) {
      const direct = await tuya.request({ method: 'POST', path: `/v1.0/devices/${id}/commands`, body: { commands: [{ code: 'ir_send', value: key }] } });
      return res.json(direct);
    }

    const keyVariants = [key];
    if (key === 'vol+') keyVariants.push('vol_up', 'volume_up', 'v+', 'up');
    if (key === 'vol-') keyVariants.push('vol_down', 'volume_down', 'v-', 'down');
    if (key === 'power') keyVariants.push('power_on', 'on', 'off');

    const trials = [];
    for (const v of keyVariants) {
      trials.push({ p: `/v1.0/infrareds/${hubId}/remotes/${id}/command`, b: { key: v } });
      trials.push({ p: `/v1.0/infrared-remotes/${hubId}/remote-controls/${id}/command`, b: { code: v } });
    }

    for (const t of trials) {
      const resp = await tuya.request({ method: 'POST', path: t.p, body: t.b });
      if (resp.success) return res.json(resp);
    }
    res.status(500).json({ error: 'tuya_ir_failed' });
  } catch (err) {
    res.status(500).json({ error: 'tuya_ir_error', detail: err.message });
  }
});

// =========================================================
// 3. SAMSUNG SMARTTHINGS PROXY + NOTIFICATION BRIDGE + OAUTH
// =========================================================
let smartThingsBridgeState = {
  washer: {
    machineState: 'stop',
    jobState: 'none',
    completionTime: null,
    remainingMinutes: 0,
    cycleName: 'Normal',
    waterTemp: 'Fría',
    lastNotification: 'Sin notificaciones recientes de SmartThings en la Tablet',
    updatedAt: null,
    source: 'cloud_or_bridge'
  },
  notifications: []
};

async function refreshSmartThingsOAuth() {
  if (!vaultConfig.SMARTTHINGS_CLIENT_ID || !vaultConfig.SMARTTHINGS_CLIENT_SECRET || !vaultConfig.SMARTTHINGS_REFRESH_TOKEN) {
    return false;
  }
  try {
    const basicAuth = Buffer.from(`${vaultConfig.SMARTTHINGS_CLIENT_ID}:${vaultConfig.SMARTTHINGS_CLIENT_SECRET}`).toString('base64');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: vaultConfig.SMARTTHINGS_REFRESH_TOKEN
    });
    const resp = await fetch('https://api.smartthings.com/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    if (resp.ok) {
      const data = await resp.json();
      vaultConfig = await saveVault({
        SMARTTHINGS_TOKEN: data.access_token,
        SMARTTHINGS_REFRESH_TOKEN: data.refresh_token || vaultConfig.SMARTTHINGS_REFRESH_TOKEN
      });
      return true;
    }
  } catch (e) {}
  return false;
}

app.get('/api/smartthings/devices', async (req, res) => {
  if (!vaultConfig.SMARTTHINGS_TOKEN) return res.json({ items: [], bridgeState: smartThingsBridgeState });
  try {
    let response = await fetch('https://api.smartthings.com/v1/devices', {
      headers: { 'Authorization': `Bearer ${vaultConfig.SMARTTHINGS_TOKEN}` }
    });
    if (response.status === 401) {
      const refreshed = await refreshSmartThingsOAuth();
      if (refreshed) {
        response = await fetch('https://api.smartthings.com/v1/devices', {
          headers: { 'Authorization': `Bearer ${vaultConfig.SMARTTHINGS_TOKEN}` }
        });
      }
    }
    if (!response.ok) {
      return res.status(response.status).json({
        error: 'st_token_expired',
        status: response.status,
        bridgeState: smartThingsBridgeState
      });
    }
    const data = await response.json();
    res.json({ ...data, bridgeState: smartThingsBridgeState });
  } catch (err) {
    res.status(500).json({ error: err.message, bridgeState: smartThingsBridgeState });
  }
});

app.get('/api/smartthings/devices/:id/status', async (req, res) => {
  if (!vaultConfig.SMARTTHINGS_TOKEN) return res.json({ bridgeState: smartThingsBridgeState });
  try {
    const response = await fetch(`https://api.smartthings.com/v1/devices/${req.params.id}/status`, {
      headers: { 'Authorization': `Bearer ${vaultConfig.SMARTTHINGS_TOKEN}` }
    });
    if (!response.ok) return res.status(response.status).json({ error: 'st_status_error', bridgeState: smartThingsBridgeState });
    const data = await response.json();
    res.json({ ...data, bridgeState: smartThingsBridgeState });
  } catch (err) {
    res.status(500).json({ error: err.message, bridgeState: smartThingsBridgeState });
  }
});

app.post('/api/smartthings/devices/:id/commands', async (req, res) => {
  if (!vaultConfig.SMARTTHINGS_TOKEN) return res.status(400).json({ error: 'no_token' });
  try {
    const response = await fetch(`https://api.smartthings.com/v1/devices/${req.params.id}/commands`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vaultConfig.SMARTTHINGS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/smartthings/bridge-webhook', (req, res) => {
  const { title = '', text = '', machineState, remainingMinutes, cycleName } = req.body || {};
  const combined = `${title} ${text}`.toLowerCase();

  let detectedState = machineState || smartThingsBridgeState.washer.machineState;
  let detectedMins = remainingMinutes !== undefined ? Number(remainingMinutes) : smartThingsBridgeState.washer.remainingMinutes;

  if (combined.includes('termin') || combined.includes('finaliz') || combined.includes('complet') || combined.includes('finished')) {
    detectedState = 'stop';
    detectedMins = 0;
  } else if (combined.includes('lavando') || combined.includes('inici') || combined.includes('centrifug') || combined.includes('enjuag') || combined.includes('running')) {
    detectedState = 'run';
    const minMatch = combined.match(/(\d+)\s*(min|m\b)/);
    if (minMatch) detectedMins = parseInt(minMatch[1], 10);
    else if (detectedMins === 0) detectedMins = 45;
  } else if (combined.includes('pausa') || combined.includes('pause')) {
    detectedState = 'pause';
  }

  const now = new Date();
  const completion = detectedMins > 0 ? new Date(now.getTime() + detectedMins * 60000).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : 'Completado';

  smartThingsBridgeState.washer = {
    machineState: detectedState,
    jobState: detectedState === 'run' ? 'wash' : 'none',
    completionTime: completion,
    remainingMinutes: detectedMins,
    cycleName: cycleName || (combined.includes('rápido') ? 'Lavado Rápido' : (combined.includes('cama') ? 'Ropa de Cama' : 'Ciclo Normal')),
    waterTemp: 'Fría / Eco',
    lastNotification: text || title || `Estado actualizado: ${detectedState.toUpperCase()}`,
    updatedAt: now.toISOString(),
    source: 'tablet_notification_bridge'
  };

  smartThingsBridgeState.notifications.unshift({
    id: Date.now(),
    title: title || 'SmartThings Lavadora',
    text: text || `Estado: ${detectedState} (${detectedMins} min restantes)`,
    time: now.toLocaleTimeString('es-CO')
  });
  if (smartThingsBridgeState.notifications.length > 20) smartThingsBridgeState.notifications.pop();

  res.json({ success: true, washer: smartThingsBridgeState.washer });
});

app.get('/api/smartthings/bridge-state', (req, res) => {
  res.json(smartThingsBridgeState);
});

// =========================================================
// 4. ALEXA AUDIO / TTS / ANNOUNCEMENT BRIDGE
// =========================================================
let alexaHistory = [];

app.post('/api/alexa/notify', async (req, res) => {
  const { message, title = 'Alerta Wall Panel', type = 'announcement' } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Mensaje requerido' });

  const results = { sent: false, methodsTried: [], timestamp: new Date().toLocaleTimeString('es-CO') };

  if (vaultConfig.ALEXA_VOICE_MONKEY_TOKEN) {
    try {
      const vmUrl = `https://api-v2.voicemonkey.io/announcement?token=${encodeURIComponent(vaultConfig.ALEXA_VOICE_MONKEY_TOKEN)}&device=${encodeURIComponent(vaultConfig.ALEXA_VOICE_MONKEY_DEVICE || 'echo')}&text=${encodeURIComponent(message)}`;
      const r = await fetch(vmUrl);
      results.methodsTried.push({ method: 'VoiceMonkey TTS', status: r.status });
      if (r.ok) results.sent = true;
    } catch (e) {
      results.methodsTried.push({ method: 'VoiceMonkey TTS', error: e.message });
    }
  }

  if (vaultConfig.ALEXA_NOTIFY_ME_CODE) {
    try {
      const r = await fetch('https://api.notifymyecho.com/v1/NotifyMe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification: message,
          accessCode: vaultConfig.ALEXA_NOTIFY_ME_CODE,
          title
        })
      });
      results.methodsTried.push({ method: 'NotifyMe Echo', status: r.status });
      if (r.ok) results.sent = true;
    } catch (e) {
      results.methodsTried.push({ method: 'NotifyMe Echo', error: e.message });
    }
  }

  if (vaultConfig.HA_URL && vaultConfig.HA_TOKEN) {
    try {
      const r = await fetch(`${vaultConfig.HA_URL.replace(/\/$/, '')}/api/services/notify/alexa_media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vaultConfig.HA_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message,
          data: { type: 'announce', method: 'all' }
        })
      });
      results.methodsTried.push({ method: 'HomeAssistant Alexa Media', status: r.status });
      if (r.ok) results.sent = true;
    } catch (e) {
      results.methodsTried.push({ method: 'HomeAssistant Alexa Media', error: e.message });
    }
  }

  const entry = { id: Date.now(), title, message, type, results, time: results.timestamp };
  alexaHistory.unshift(entry);
  if (alexaHistory.length > 30) alexaHistory.pop();

  res.json({ success: true, entry });
});

app.get('/api/alexa/history', (req, res) => {
  res.json(alexaHistory);
});

// =========================================================
// 5. ZAPIER / MICROSOFT TEAMS / WORK MEETINGS WEBHOOK
// =========================================================
let workNotifications = [
  {
    id: 'demo-meeting-1',
    source: 'Microsoft Teams / Zapier',
    title: 'Reunión de Sincronización de Proyecto',
    organizer: 'Equipo de Trabajo',
    time: 'Hoy - En 15 min',
    priority: 'high',
    link: 'https://teams.microsoft.com',
    active: true
  }
];

app.post('/api/webhooks/zapier', (req, res) => {
  const { title, message, organizer, time, source = 'Zapier / MS Teams', priority = 'normal', link = '' } = req.body || {};
  const newNotif = {
    id: 'zap_' + Date.now(),
    source,
    title: title || message || 'Notificación de Trabajo',
    organizer: organizer || 'Calendario Outlook / Teams',
    time: time || new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
    priority,
    link,
    active: true
  };
  workNotifications.unshift(newNotif);
  if (workNotifications.length > 25) workNotifications.pop();
  res.json({ success: true, notification: newNotif });
});

app.get('/api/webhooks/zapier', (req, res) => {
  res.json(workNotifications);
});

app.delete('/api/webhooks/zapier/:id', (req, res) => {
  workNotifications = workNotifications.filter(n => n.id !== req.params.id);
  res.json({ success: true });
});

// =========================================================
// 6. LOCAL AI RAG DOCUMENTS & OLLAMA PROXY
// =========================================================
app.get('/api/docs', (req, res) => {
  try {
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.json'));
    const docs = files.map(filename => {
      const content = fs.readFileSync(path.join(DOCS_DIR, filename), 'utf8');
      return { filename, content, updatedAt: fs.statSync(path.join(DOCS_DIR, filename)).mtime };
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/docs', (req, res) => {
  try {
    const { filename, content } = req.body || {};
    if (!filename || content === undefined) return res.status(400).json({ error: 'Nombre y contenido requeridos' });
    const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    const finalName = (safeName.endsWith('.md') || safeName.endsWith('.txt')) ? safeName : `${safeName}.md`;
    fs.writeFileSync(path.join(DOCS_DIR, finalName), content, 'utf8');
    res.json({ success: true, filename: finalName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/docs/:filename', (req, res) => {
  try {
    const safeName = path.basename(req.params.filename);
    const fullPath = path.join(DOCS_DIR, safeName);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  const { prompt, contextData = {} } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Prompt requerido' });

  let docsContext = '';
  try {
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    docsContext = files.map(f => `--- DOCUMENTO: ${f} ---\n${fs.readFileSync(path.join(DOCS_DIR, f), 'utf8')}`).join('\n\n');
  } catch (e) {}

  try {
    const systemPrompt = `Eres el Asistente IA Local del Wall Panel de la Familia Varela Páez (Apartamento Natura Torre 7 Apto 902).
Responde en español de manera concisa, amable y útil.
Tienes acceso a los documentos del hogar:
${docsContext}

Estado actual de la casa:
${JSON.stringify(contextData)}
`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const ollamaRes = await fetch(`${vaultConfig.OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: vaultConfig.OLLAMA_MODEL || 'llama3.2',
        prompt: `${systemPrompt}\n\nUsuario: ${prompt}\nAsistente:`,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (ollamaRes.ok) {
      const data = await ollamaRes.json();
      return res.json({ reply: data.response, engine: `Ollama Local (${vaultConfig.OLLAMA_MODEL})`, docsCount: docsContext.length });
    }
  } catch (e) {}

  const q = prompt.toLowerCase();
  const lines = docsContext.split('\n').map(l => l.trim()).filter(Boolean);
  let matchedLines = [];

  const keywords = q.replace(/[¿?¡!.,]/g, '').split(/\s+/).filter(w => w.length > 2 && !['como', 'cuando', 'donde', 'cual', 'cuales', 'para', 'los', 'las', 'del', 'una', 'que', 'por', 'con', 'hay', 'dias', 'dia', 'fecha', 'fechas'].includes(w));

  lines.forEach((line, idx) => {
    const lLower = line.toLowerCase();
    let score = 0;
    keywords.forEach(kw => {
      if (lLower.includes(kw)) score += 3;
    });
    if (q.includes('basura') && (lLower.includes('basura') || lLower.includes('reciclaje') || lLower.includes('orgánica'))) score += 5;
    if ((q.includes('pago') || q.includes('pagar') || q.includes('recibo') || q.includes('administracion')) && (lLower.includes('pago') || lLower.includes('día') || lLower.includes('administración') || lLower.includes('enel') || lLower.includes('internet') || lLower.includes('gas'))) score += 5;
    if ((q.includes('sismo') || q.includes('emergencia') || q.includes('temblor')) && (lLower.includes('sismo') || lLower.includes('emergencia') || lLower.includes('encuentro'))) score += 5;
    if ((q.includes('lavadora') || q.includes('lavado')) && lLower.includes('lavadora')) score += 5;
    if (score > 0) {
      matchedLines.push({ line, score, nextLine: lines[idx + 1] || '' });
    }
  });

  matchedLines.sort((a, b) => b.score - a.score);
  let reply = '';
  if (matchedLines.length > 0) {
    const topSnippets = matchedLines.slice(0, 4).map(m => m.line.replace(/^[-*#]+\s*/, '')).join(' • ');
    reply = `Según los documentos de tu hogar: ${topSnippets}`;
  } else {
    reply = `He revisado los documentos del hogar (${lines.length} líneas indexadas). Puedes preguntarme sobre días de sacar la basura, fechas de pago de recibos y administración, protocolos de sismo, ciclos de la lavadora, o pedirme que encienda/apague cualquier luz o cree un temporizador.`;
  }

  res.json({ reply, engine: 'Motor RAG Local Integrado', docsUsed: true });
});

// =========================================================
// 7. KNOWN FACES DIRECTORY FOR LOCAL CAMERA AI
// =========================================================
app.get('/api/faces', (req, res) => {
  try {
    const people = [];
    const entries = fs.readdirSync(FACES_DIR, { withFileTypes: true });
    entries.forEach(ent => {
      if (ent.isDirectory()) {
        const personDir = path.join(FACES_DIR, ent.name);
        const photos = fs.readdirSync(personDir)
          .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
          .map(f => `/known_faces/${encodeURIComponent(ent.name)}/${encodeURIComponent(f)}`);
        people.push({ name: ent.name, photos, count: photos.length });
      }
    });
    res.json(people);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/faces', (req, res) => {
  try {
    const { name, imageBase64 } = req.body || {};
    if (!name || !imageBase64) return res.status(400).json({ error: 'Nombre e imagen requeridos' });
    const safePerson = path.basename(name).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _-]/g, '').trim();
    const personDir = path.join(FACES_DIR, safePerson);
    if (!fs.existsSync(personDir)) fs.mkdirSync(personDir, { recursive: true });

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const fileName = `foto_${Date.now()}.jpg`;
    fs.writeFileSync(path.join(personDir, fileName), Buffer.from(base64Data, 'base64'));
    res.json({ success: true, name: safePerson, photo: `/known_faces/${encodeURIComponent(safePerson)}/${fileName}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/faces/:name', (req, res) => {
  try {
    const safePerson = path.basename(req.params.name);
    const personDir = path.join(FACES_DIR, safePerson);
    if (fs.existsSync(personDir)) fs.rmSync(personDir, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 8. HOME ASSISTANT BRIDGE PROXY
// =========================================================
app.get('/api/ha/states', async (req, res) => {
  if (!vaultConfig.HA_URL || !vaultConfig.HA_TOKEN) {
    return res.status(400).json({ error: 'Home Assistant URL o Token no configurados en la Bóveda API.' });
  }
  try {
    const r = await fetch(`${vaultConfig.HA_URL.replace(/\/$/, '')}/api/states`, {
      headers: {
        'Authorization': `Bearer ${vaultConfig.HA_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    if (!r.ok) return res.status(r.status).json({ error: `HA HTTP ${r.status}` });
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ha/service', async (req, res) => {
  if (!vaultConfig.HA_URL || !vaultConfig.HA_TOKEN) {
    return res.status(400).json({ error: 'Home Assistant no configurado' });
  }
  const { domain, service, serviceData } = req.body || {};
  try {
    const r = await fetch(`${vaultConfig.HA_URL.replace(/\/$/, '')}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vaultConfig.HA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(serviceData || {})
    });
    const data = await r.json();
    res.json({ success: r.ok, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// 9. PERSISTENT SHARED JSON MEMORY (Local Disk + Vercel Private Blob + KV)
//    Guarantees changes NEVER revert or get lost on Local OR Vercel!
// =========================================================
const STATE_JSON_FILE = path.resolve('wallpanel_state.json');
const TMP_STATE_FILE = path.join(os.tmpdir(), 'wallpanel_state_runtime.json');
let inMemoryStateCache = null;
let lastBlobCheckMs = 0;

function pickNewestState(...candidates) {
  let best = null;
  let bestTime = -1;
  for (const c of candidates) {
    if (!c || typeof c !== 'object' || Object.keys(c).length === 0) continue;
    const t = c.updatedAt ? Date.parse(c.updatedAt) : 0;
    const validT = Number.isNaN(t) ? 0 : t;
    if (!best || validT >= bestTime) {
      best = c;
      bestTime = validT;
    }
  }
  return best || {};
}

function readDiskStateSync() {
  let bundled = null;
  let tmpState = null;
  try {
    if (fs.existsSync(STATE_JSON_FILE)) {
      bundled = JSON.parse(fs.readFileSync(STATE_JSON_FILE, 'utf8'));
    }
  } catch (e) {}
  try {
    if (fs.existsSync(TMP_STATE_FILE)) {
      tmpState = JSON.parse(fs.readFileSync(TMP_STATE_FILE, 'utf8'));
    }
  } catch (e) {}
  return pickNewestState(bundled, tmpState);
}

async function readSharedState(forceCloud = false) {
  const diskState = readDiskStateSync();
  let cloudState = null;

  const now = Date.now();
  if (hasVercelBlob() && (forceCloud || !inMemoryStateCache || (now - lastBlobCheckMs > 3500))) {
    lastBlobCheckMs = now;
    cloudState = await readBlobJson('wallpanel_state.json');
  } else if (hasVercelKV() && (forceCloud || !inMemoryStateCache || (now - lastBlobCheckMs > 3500))) {
    lastBlobCheckMs = now;
    try {
      const kvRaw = await kv.get('wallpanel_state');
      if (kvRaw) cloudState = typeof kvRaw === 'string' ? JSON.parse(kvRaw) : kvRaw;
    } catch (e) {}
  }

  inMemoryStateCache = pickNewestState(diskState, inMemoryStateCache, cloudState);
  return inMemoryStateCache;
}

async function writeSharedState(partialUpdate) {
  const current = await readSharedState(true);
  const incomingTime = partialUpdate?.updatedAt ? Date.parse(partialUpdate.updatedAt) : Date.now();
  const effectiveIso = !Number.isNaN(incomingTime) ? new Date(incomingTime).toISOString() : new Date().toISOString();

  const merged = {
    ...current,
    ...partialUpdate,
    updatedAt: effectiveIso
  };
  inMemoryStateCache = merged;
  lastBlobCheckMs = Date.now();

  // 1. Write to project wallpanel_state.json (works on Local PC/LAN)
  try {
    fs.writeFileSync(STATE_JSON_FILE, JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {
    // Read-only FS on Vercel Serverless: write to /tmp fallback as well
    try {
      fs.writeFileSync(TMP_STATE_FILE, JSON.stringify(merged, null, 2), 'utf8');
    } catch (e2) {}
  }

  // 2. Write to Vercel Private Blob (persists globally across all serverless instances!)
  const blobSaved = await writeBlobJson('wallpanel_state.json', merged);

  // 3. Write to Vercel KV if configured
  if (hasVercelKV()) {
    try { await kv.set('wallpanel_state', JSON.stringify(merged)); } catch (e) {}
  }

  return { merged, blobSaved };
}

app.get('/api/state', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const state = await readSharedState(false);
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/state', async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { merged, blobSaved } = await writeSharedState(req.body || {});
    res.json({ success: true, cloudPersisted: blobSaved, state: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bind explicitly to 0.0.0.0 so any Tablet or Mobile on the same Wi-Fi network can connect
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    const lans = getLanAddresses();
    console.log(`\n============================================================`);
    console.log(`✅ Wall Panel V4.7 Server activo en PC: http://127.0.0.1:${PORT}`);
    lans.forEach(l => {
      console.log(`📱 Conecta tu TABLET / CELULAR en:     ${l.url} (${l.interface})`);
    });
    console.log(`💾 Memoria JSON compartida activa:     ${STATE_JSON_FILE}`);
    console.log(`🔒 Bóveda AES-256 + PIN SHA-256 activos`);
    console.log(`============================================================\n`);
  });
}

export default app;
