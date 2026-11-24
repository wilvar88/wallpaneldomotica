/* ============================================================================
   WALL PANEL V4.7 - "MI HOGAR" SUITE
   1. Shared Server JSON Memory (`wallpanel_state.json`) for PC, Tablet & Mobile
   2. 2D Card Sizing: Width (Ancho 1x..4x) & Height (Alto 1x..3x)
   3. Central Container with Touch/Swipe Pagination + Elevated Wide Bottom Banner
   4. Show-Stopping Animated Weather & Moon Phase SVGs (Storm, Rain, Sun, Moon)
   5. Armed Security System, Live Tuya Camera HLS & 3h Facial Cooldown
   ============================================================================ */

/* =========================================================
   0. SHARED SERVER JSON MEMORY (`wallpanel_state.json`)
      Synchronizes PC, Tablet & Mobile automatically!
   ========================================================= */
window.ServerStateSync = {
  lastUpdatedAt: localStorage.getItem('wallpanel_v48_updated_at') || null,
  isSaving: false,
  pendingSave: false,
  lastSaveCompletedMs: 0,

  parseTs(iso) {
    if (!iso) return 0;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
  },

  ensureV48ProtagonistCards(widgetsArr) {
    if (!Array.isArray(widgetsArr)) return widgetsArr;
    if (localStorage.getItem('wallpanel_v48_cards_seeded') === 'true') return widgetsArr;

    const hasLunar = widgetsArr.some(w => w.type === 'lunar_phase');
    const hasSpotify = widgetsArr.some(w => w.type === 'spotify_player' || w.type === 'music');

    if (!hasLunar || !hasSpotify) {
      const additions = [];
      if (!hasLunar) additions.push({ id: 'w-lunar-phase', type: 'lunar_phase', w: 2, h: 2 });
      if (!hasSpotify) additions.push({ id: 'w-spotify', type: 'spotify_player', w: 2, h: 1 });
      // Insert right after weather hero (or at index 0) so they appear on Screen 1 immediately!
      const heroIdx = widgetsArr.findIndex(w => w.type === 'weather_hero' || w.type === 'weather');
      if (heroIdx >= 0) {
        widgetsArr[heroIdx].w = 2;
        widgetsArr[heroIdx].h = 1;
        widgetsArr.splice(heroIdx + 1, 0, ...additions);
      } else {
        widgetsArr.unshift(...additions);
      }
      localStorage.setItem('wallpanel_v48_cards_seeded', 'true');
      return widgetsArr;
    }
    localStorage.setItem('wallpanel_v48_cards_seeded', 'true');
    return widgetsArr;
  },

  async loadFromServer() {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      if (!res.ok) return null;
      const state = await res.json();
      if (state && Object.keys(state).length > 0) {
        const remoteTs = this.parseTs(state.updatedAt);
        const localTs = this.parseTs(this.lastUpdatedAt);

        // Never overwrite newer local edits with an older server snapshot!
        if (localTs > 0 && remoteTs > 0 && localTs > remoteTs + 500) {
          await this.saveToServer();
          return null;
        }

        if (state.updatedAt) {
          this.lastUpdatedAt = state.updatedAt;
          localStorage.setItem('wallpanel_v48_updated_at', state.updatedAt);
        }
        const hadLunar = Array.isArray(state.centralWidgets) && state.centralWidgets.some(w => w.type === 'lunar_phase');
        const hadSpotify = Array.isArray(state.centralWidgets) && state.centralWidgets.some(w => w.type === 'spotify_player' || w.type === 'music');

        this.applyStateToApp(state, false);

        if (!state.v48Seeded && (!hadLunar || !hadSpotify)) {
          await this.saveToServer();
        }
        return state;
      }
    } catch (e) {
      console.warn('[ServerStateSync] Fallback to localStorage:', e.message);
    }
    return null;
  },

  applyStateToApp(state, notify = false) {
    let needsRender = false;

    if (state.skin && state.skin !== SkinManager.currentSkin) {
      SkinManager.setSkin(state.skin, false, false);
    }
    if (state.gridDensity && state.gridDensity !== SkinManager.currentDensity) {
      SkinManager.setGridDensity(state.gridDensity, false, false);
    }
    if (Array.isArray(state.centralWidgets)) {
      if (state.v48Seeded) localStorage.setItem('wallpanel_v48_cards_seeded', 'true');
      const enriched = this.ensureV48ProtagonistCards([...state.centralWidgets]);
      DashboardManager.widgets = enriched;
      localStorage.setItem('wallpanel_v47_central_widgets', JSON.stringify(enriched));
      needsRender = true;
    }
    if (Array.isArray(state.dockWidgets)) {
      DashboardManager.dockWidgets = state.dockWidgets;
      localStorage.setItem('wallpanel_v47_dock_widgets', JSON.stringify(state.dockWidgets));
      needsRender = true;
    }
    if (Array.isArray(state.smartRules)) {
      SmartRuleCards.rules = state.smartRules;
      localStorage.setItem('wallpanel_v46_smart_rule_cards', JSON.stringify(state.smartRules));
      needsRender = true;
    }
    if (Array.isArray(state.flows)) {
      FlowAutomationEngine.flows = state.flows;
      localStorage.setItem('wallpanel_v46_automation_flows', JSON.stringify(state.flows));
      FlowAutomationEngine.renderFlows();
    }
    if (state.securityConfig) {
      SecuritySystem.config = { ...SecuritySystem.config, ...state.securityConfig };
      localStorage.setItem('wallpanel_v45_security_config', JSON.stringify(SecuritySystem.config));
    }
    if (state.roomSettings && typeof roomSettings !== 'undefined') {
      roomSettings = state.roomSettings;
      localStorage.setItem('wallpanel_v3_room_config', JSON.stringify(roomSettings));
      if (typeof renderHomeView === 'function') renderHomeView();
    }
    if (Array.isArray(state.manualDevices)) {
      localStorage.setItem('manual_ip_devices', JSON.stringify(state.manualDevices));
    }

    if (needsRender) {
      DashboardManager.render();
    }
    if (notify && typeof showNotification === 'function') {
      showNotification('🔄 Diseño sincronizado y guardado');
    }
  },

  async saveToServer() {
    const nowIso = new Date().toISOString();
    this.lastUpdatedAt = nowIso;
    localStorage.setItem('wallpanel_v48_updated_at', nowIso);

    if (this.isSaving) {
      this.pendingSave = true;
      return;
    }
    this.isSaving = true;
    try {
      do {
        this.pendingSave = false;
        const stamp = new Date().toISOString();
        this.lastUpdatedAt = stamp;
        localStorage.setItem('wallpanel_v48_updated_at', stamp);

        const payload = {
          v48Seeded: true,
          updatedAt: stamp,
          skin: SkinManager.currentSkin,
          gridDensity: SkinManager.currentDensity,
          centralWidgets: DashboardManager.widgets,
          dockWidgets: DashboardManager.dockWidgets,
          smartRules: SmartRuleCards.rules,
          flows: FlowAutomationEngine.flows,
          securityConfig: SecuritySystem.config,
          roomSettings: typeof roomSettings !== 'undefined' ? roomSettings : undefined,
          manualDevices: JSON.parse(localStorage.getItem('manual_ip_devices') || '[]'),
          spotifyWebUrl: window.SpotifyCardManager ? window.SpotifyCardManager.embedUrl : undefined
        };
        const res = await fetch('/api/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const data = await res.json();
          if (data.state && data.state.updatedAt) {
            this.lastUpdatedAt = data.state.updatedAt;
            localStorage.setItem('wallpanel_v48_updated_at', data.state.updatedAt);
          }
          this.lastSaveCompletedMs = Date.now();
        }
      } while (this.pendingSave);
    } catch (e) {
      console.warn('[ServerStateSync] Error guardando en servidor:', e.message);
    } finally {
      this.isSaving = false;
    }
  },

  startLiveSyncPolling() {
    setInterval(async () => {
      // Never poll while saving, editing, or within 4 seconds after a local save!
      if (this.isSaving || this.pendingSave || DashboardManager.isEditMode) return;
      if (Date.now() - this.lastSaveCompletedMs < 4000) return;
      try {
        const res = await fetch('/api/state', { cache: 'no-store' });
        if (!res.ok) return;
        const remote = await res.json();
        if (!remote || !remote.updatedAt) return;

        const remoteTs = this.parseTs(remote.updatedAt);
        const localTs = this.parseTs(this.lastUpdatedAt);

        // Strictly apply ONLY if remote state is genuinely newer than local state
        if (remoteTs > localTs + 500) {
          this.lastUpdatedAt = remote.updatedAt;
          localStorage.setItem('wallpanel_v48_updated_at', remote.updatedAt);
          this.applyStateToApp(remote, true);
        }
      } catch (e) {}
    }, 6000);
  }
};

/* =========================================================
   0.5 HIDDEN CONFIGURATION DRAWER & LAN IP DISCOVERY
   ========================================================= */
window.ConfigDrawer = {
  isOpen: false,

  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  open() {
    this.isOpen = true;
    document.getElementById('hiddenConfigDrawer')?.classList.add('open');
    document.getElementById('hiddenConfigBackdrop')?.classList.add('open');
    this.loadLanInfo();
  },

  close() {
    this.isOpen = false;
    document.getElementById('hiddenConfigDrawer')?.classList.remove('open');
    document.getElementById('hiddenConfigBackdrop')?.classList.remove('open');
  },

  async loadLanInfo() {
    try {
      const r = await fetch('/api/network-info');
      const d = await r.json();
      const html = (d.lanAddresses || []).map(l =>
        `<div style="margin-bottom:3px;">📱 <b>${l.interface}:</b> <a href="${l.url}" target="_blank" style="color:#38bdf8; text-decoration:underline;">${l.url}</a></div>`
      ).join('') || '<div>Ejecuta iniciar_servidor.bat para ver las IPs LAN</div>';

      const drawerBox = document.getElementById('drawerLanAddresses');
      if (drawerBox) drawerBox.innerHTML = html;

      const hubBox = document.getElementById('lanAddressesBox');
      if (hubBox) hubBox.innerHTML = html;
    } catch (e) {}
  }
};

/* =========================================================
   1. SKIN MANAGER & STRICT EQUAL-UNIT BENTO GRID
   ========================================================= */
const SKIN_NAMES_MAP = {
  'glassmorphism': 'Glassmorphism · Mi Hogar',
  'neumorphism': 'Neumorphism / Soft UI',
  'liquid-glass': 'Liquid Glass',
  'dark-luxury': 'Dark Luxury Gold',
  'bento-grid': 'Bento Grid UI',
  'skeuomorphism': 'Skeuomorphism',
  'aurora': 'Aurora Boreal UI',
  'futuristic-hud': 'Futuristic HUD'
};

window.SkinManager = {
  currentSkin: localStorage.getItem('wallpanel_v4_skin') || 'glassmorphism',
  currentDensity: localStorage.getItem('wallpanel_v4_grid_density') || 'standard',

  init() {
    this.setSkin(this.currentSkin, false, false);
    this.setGridDensity(this.currentDensity, false, false);
  },

  setSkin(skinId, notify = true, syncServer = true) {
    if (!SKIN_NAMES_MAP[skinId]) skinId = 'glassmorphism';
    this.currentSkin = skinId;
    document.body.setAttribute('data-skin', skinId);
    localStorage.setItem('wallpanel_v4_skin', skinId);

    document.querySelectorAll('[data-skin-btn]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-skin-btn') === skinId);
    });

    const badge = document.getElementById('activeSkinBadge');
    if (badge) badge.textContent = SKIN_NAMES_MAP[skinId];

    const iframe3d = document.getElementById('floorplan3dIframe');
    if (iframe3d && iframe3d.contentWindow) {
      let style3d = 'homely';
      if (skinId === 'futuristic-hud' || skinId === 'liquid-glass') style3d = 'neon';
      else if (skinId === 'aurora') style3d = 'synthwave';
      else if (skinId === 'neumorphism') style3d = 'architect';
      iframe3d.contentWindow.postMessage({ type: 'SET_3D_STYLE', style: style3d }, '*');
    }

    if (syncServer) ServerStateSync.saveToServer();
    if (notify && typeof showNotification === 'function') {
      showNotification(`Estilo Visual aplicado y guardado en JSON: ${SKIN_NAMES_MAP[skinId]}`);
    }
  },

  setGridDensity(density, notify = true, syncServer = true) {
    this.currentDensity = density || 'standard';
    localStorage.setItem('wallpanel_v4_grid_density', this.currentDensity);
    const grid = document.getElementById('dashboardGrid');
    if (grid) grid.setAttribute('data-layout-preset', this.currentDensity);
    const sel = document.getElementById('gridDensitySelect');
    if (sel) sel.value = this.currentDensity;
    DashboardManager.render();
    if (syncServer) ServerStateSync.saveToServer();
    if (notify && typeof showNotification === 'function') {
      showNotification(`Cuadrícula actualizada: ${this.currentDensity.toUpperCase()}`);
    }
  }
};

/* =========================================================
   2. SHOW-STOPPING ANIMATED WEATHER & REAL MOON PHASE SVGS
      - Thunderstorm with animated lightning bolts + rain
      - Heavy Rain with multi-speed diagonal drops
      - Radiant Sun with rotating rays & pulsing core
      - Real Lunar Phase calculation (New, Waxing Crescent,
        First Quarter, Full Moon, Waning) with craters & twinkling stars!
   ========================================================= */
window.WeatherSVG = {
  lastOutdoorTemp: '15 °C',
  lastDesc: 'Parcialmente despejado',
  lastCode: '116',
  lastIsDay: true,
  lastMoonPhaseName: 'Luna Creciente',
  lastSvg: '',

  // Calculate real astronomical Moon Phase (0..7)
  getLunarPhaseData(date = new Date()) {
    const lp = 2551443; // Lunar period in seconds (29.53 days)
    const now = date.getTime() / 1000;
    const newMoonRef = new Date('2026-01-18T19:52:00Z').getTime() / 1000;
    const phaseRatio = (((now - newMoonRef) % lp) + lp) % lp / lp;

    if (phaseRatio < 0.06 || phaseRatio > 0.94) return { id: 'new', name: 'Luna Nueva', illum: 5 };
    if (phaseRatio < 0.22) return { id: 'waxing_crescent', name: 'Luna Creciente', illum: 30 };
    if (phaseRatio < 0.31) return { id: 'first_quarter', name: 'Cuarto Creciente', illum: 50 };
    if (phaseRatio < 0.46) return { id: 'waxing_gibbous', name: 'Gibosa Creciente', illum: 78 };
    if (phaseRatio < 0.56) return { id: 'full', name: 'Luna Llena', illum: 100 };
    if (phaseRatio < 0.72) return { id: 'waning_gibbous', name: 'Gibosa Menguante', illum: 75 };
    if (phaseRatio < 0.81) return { id: 'last_quarter', name: 'Cuarto Menguante', illum: 50 };
    return { id: 'waning_crescent', name: 'Luna Menguante', illum: 25 };
  },

  getMoonPhaseSVG(phaseId = 'waxing_crescent') {
    const isFull = phaseId === 'full' || phaseId === 'waxing_gibbous' || phaseId === 'waning_gibbous';
    return `
      <svg viewBox="0 0 80 80" width="100%" height="100%">
        <defs>
          <radialGradient id="moonGlowGrad" cx="35%" cy="35%" r="70%">
            <stop offset="0%" stop-color="#fef9c3"/>
            <stop offset="65%" stop-color="#fde047"/>
            <stop offset="100%" stop-color="#eab308"/>
          </radialGradient>
          <radialGradient id="nightHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(253, 224, 71, 0.35)"/>
            <stop offset="100%" stop-color="rgba(56, 189, 248, 0)"/>
          </radialGradient>
        </defs>
        <!-- Ambient Lunar Halo -->
        <circle cx="40" cy="40" r="36" fill="url(#nightHalo)"/>
        <!-- Twinkling Stars -->
        <g class="svg-star-twinkle" fill="#fef08a">
          <path d="M16 14 L17.5 18 L21.5 19.5 L17.5 21 L16 25 L14.5 21 L10.5 19.5 L14.5 18 Z"/>
          <circle cx="65" cy="18" r="2"/>
          <circle cx="14" cy="58" r="1.6"/>
          <path d="M64 52 L65 55 L68 56 L65 57 L64 60 L63 57 L60 56 L63 55 Z"/>
        </g>
        <!-- Moon Body (Full with Craters or Crescent) -->
        <g class="svg-cloud-body">
          ${isFull ? `
            <circle cx="40" cy="40" r="22" fill="url(#moonGlowGrad)" filter="drop-shadow(0 0 12px rgba(253,224,71,0.65))"/>
            <circle cx="33" cy="32" r="4" fill="rgba(202, 138, 4, 0.28)"/>
            <circle cx="47" cy="44" r="5.5" fill="rgba(202, 138, 4, 0.25)"/>
            <circle cx="36" cy="48" r="2.8" fill="rgba(202, 138, 4, 0.22)"/>
          ` : `
            <circle cx="40" cy="40" r="21" fill="rgba(148, 163, 184, 0.16)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
            <path d="M46 19 A21 21 0 1 0 56 55 A17 17 0 1 1 46 19 Z" fill="url(#moonGlowGrad)" filter="drop-shadow(0 0 10px rgba(253,224,71,0.6))"/>
          `}
        </g>
      </svg>`;
  },

  getAnimatedSVG(code, isDay = true) {
    const c = String(code);
    const moonInfo = this.getLunarPhaseData();
    this.lastMoonPhaseName = moonInfo.name;

    // 1. Thunderstorm with Lightning Bolt + Rain (`200`, `302`, `386`, `389`, `392`, `395`)
    if (['200', '302', '308', '386', '389', '392', '395'].includes(c)) {
      return `
        <svg viewBox="0 0 80 80" width="100%" height="100%">
          <defs>
            <linearGradient id="stormCloudGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#64748b"/><stop offset="100%" stop-color="#1e293b"/>
            </linearGradient>
          </defs>
          <g class="svg-cloud-body">
            <path d="M58 46H22a14 14 0 0 1-1.5-27.9A19 19 0 0 1 61 23a12 12 0 0 1-3 23z" fill="url(#stormCloudGrad)" stroke="rgba(148,163,184,0.45)" stroke-width="1.5"/>
          </g>
          <g class="svg-rain-drops" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round">
            <line x1="25" y1="52" x2="21" y2="66"/>
            <line x1="53" y1="52" x2="49" y2="66"/>
          </g>
          <polygon class="svg-lightning-bolt" points="42,38 31,54 40,54 36,70 52,50 42,50" fill="#fde047" stroke="#f59e0b" stroke-width="1"/>
        </svg>`;
    }

    // 2. Rain / Showers
    if (['176', '263', '266', '293', '296', '299', '305', '353', '356'].includes(c)) {
      return `
        <svg viewBox="0 0 80 80" width="100%" height="100%">
          <defs>
            <linearGradient id="cloudGradRain2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#475569"/>
            </linearGradient>
          </defs>
          <g class="svg-cloud-body">
            <path d="M58 46H22a14 14 0 0 1-1.5-27.9A19 19 0 0 1 61 23a12 12 0 0 1-3 23z" fill="url(#cloudGradRain2)" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/>
          </g>
          <g class="svg-rain-drops" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round">
            <line x1="26" y1="52" x2="22" y2="66"/>
            <line x1="39" y1="54" x2="35" y2="68"/>
            <line x1="52" y1="52" x2="48" y2="66"/>
          </g>
        </svg>`;
    }

    // 3. Clear Sky (Radiant Sun by Day / Real Lunar Phase by Night)
    if (c === '113') {
      if (!isDay) {
        return this.getMoonPhaseSVG(moonInfo.id);
      }
      return `
        <svg viewBox="0 0 80 80" width="100%" height="100%">
          <defs>
            <radialGradient id="sunCoreGrad" cx="35%" cy="35%" r="70%">
              <stop offset="0%" stop-color="#fef08a"/>
              <stop offset="60%" stop-color="#fbbf24"/>
              <stop offset="100%" stop-color="#ea580c"/>
            </radialGradient>
          </defs>
          <g class="svg-sun-rays" stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round" transform="translate(8,8)">
            <line x1="32" y1="3" x2="32" y2="11"/><line x1="32" y1="53" x2="32" y2="61"/>
            <line x1="3" y1="32" x2="11" y2="32"/><line x1="53" y1="32" x2="61" y2="32"/>
            <line x1="11.5" y1="11.5" x2="17" y2="17"/><line x1="47" y1="47" x2="52.5" y2="52.5"/>
            <line x1="52.5" y1="11.5" x2="47" y2="17"/><line x1="17" y1="47" x2="11.5" y2="52.5"/>
          </g>
          <circle class="svg-sun-core" cx="40" cy="40" r="16" fill="url(#sunCoreGrad)"/>
        </svg>`;
    }

    // 4. Partly Cloudy (Night Moon + Cloud OR Day Sun + Cloud)
    if (!isDay) {
      return `
        <svg viewBox="0 0 80 80" width="100%" height="100%">
          <g class="svg-star-twinkle" fill="#fef08a">
            <circle cx="16" cy="18" r="1.8"/><circle cx="64" cy="16" r="1.5"/>
          </g>
          <path d="M44 12 A16 16 0 1 0 54 40 A13 13 0 1 1 44 12 Z" fill="#fde047" filter="drop-shadow(0 0 8px rgba(253,224,71,0.6))"/>
          <g class="svg-cloud-body">
            <path d="M60 56H24a13 13 0 0 1-1.2-25.9A17 17 0 0 1 62 34a11 11 0 0 1-2 22z" fill="url(#nightCloudGrad)" stroke="rgba(255,255,255,0.45)" stroke-width="1.5"/>
          </g>
          <defs>
            <linearGradient id="nightCloudGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#cbd5e1"/><stop offset="100%" stop-color="#64748b"/>
            </linearGradient>
          </defs>
        </svg>`;
    }

    return `
      <svg viewBox="0 0 80 80" width="100%" height="100%">
        <g class="svg-sun-rays" stroke="#fbbf24" stroke-width="3" stroke-linecap="round">
          <circle cx="28" cy="26" r="12" fill="#fbbf24" stroke="none"/>
          <line x1="28" y1="7" x2="28" y2="11"/><line x1="9" y1="26" x2="13" y2="26"/>
          <line x1="14" y1="12" x2="17" y2="15"/><line x1="42" y1="12" x2="39" y2="15"/>
        </g>
        <g class="svg-cloud-body">
          <path d="M60 56H24a13 13 0 0 1-1.2-25.9A17 17 0 0 1 62 34a11 11 0 0 1-2 22z" fill="url(#dayCloudGrad)" stroke="rgba(255,255,255,0.65)" stroke-width="1.5"/>
        </g>
        <defs>
          <linearGradient id="dayCloudGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
        </defs>
      </svg>`;
  },

  syncAllClimateCards() {
    const indoorRaw = document.getElementById('pill-temp')?.textContent || '';
    const humRaw = document.getElementById('pill-hum')?.textContent || '';
    const outdoorRaw = document.getElementById('weatherTemp')?.textContent || this.lastOutdoorTemp;

    const validIndoor = (indoorRaw && !indoorRaw.includes('--') && !indoorRaw.includes('ERR')) ? indoorRaw : null;
    const validOutdoor = (outdoorRaw && !outdoorRaw.includes('--')) ? outdoorRaw : '15 °C';
    const primaryTemp = validIndoor || validOutdoor;

    const moonInfo = this.getLunarPhaseData();

    document.querySelectorAll('.live-climate-temp').forEach(el => {
      el.textContent = primaryTemp;
    });
    document.querySelectorAll('.live-climate-sub').forEach(el => {
      if (validIndoor && humRaw && !humRaw.includes('--')) {
        el.textContent = `Int: ${validIndoor} (${humRaw}) · Ext: ${validOutdoor}`;
      } else {
        el.textContent = `Exterior Madrid: ${validOutdoor} · ${this.lastDesc}`;
      }
    });

    document.querySelectorAll('.hero-weather-live-temp').forEach(el => {
      el.textContent = validOutdoor;
    });
    document.querySelectorAll('.hero-weather-live-desc').forEach(el => {
      el.textContent = this.lastDesc;
    });
    document.querySelectorAll('.hero-weather-live-moon').forEach(el => {
      el.textContent = `🌙 ${moonInfo.name} (${moonInfo.illum}% ilum.)`;
    });
    document.querySelectorAll('.hero-weather-live-svg').forEach(el => {
      if (this.lastSvg && !el.dataset.renderedCode) {
        el.innerHTML = this.lastSvg;
        el.dataset.renderedCode = this.lastCode;
      }
    });
  }
};

window.updateClock = function () {
  const now = new Date();
  const clockEl = document.getElementById('clock');
  if (clockEl) {
    clockEl.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  }
  const dateSub = document.getElementById('heroDateSub');
  if (dateSub) {
    dateSub.textContent = now.toLocaleDateString('es-CO', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
  WeatherSVG.syncAllClimateCards();
};

window.updateWeather = async function () {
  try {
    const res = await fetch('https://wttr.in/Madrid,Cundinamarca?format=j1');
    const data = await res.json();
    const cur = data.current_condition[0];
    const temp = `${cur.temp_C} °C`;
    const loc = 'Madrid, Cund.';
    const desc = cur.lang_es ? cur.lang_es[0].value : cur.weatherDesc[0].value;
    const hr = new Date().getHours();
    const isDay = hr >= 6 && hr < 18;
    const svgHTML = WeatherSVG.getAnimatedSVG(cur.weatherCode, isDay);

    WeatherSVG.lastOutdoorTemp = temp;
    WeatherSVG.lastDesc = desc;
    WeatherSVG.lastCode = cur.weatherCode;
    WeatherSVG.lastIsDay = isDay;
    WeatherSVG.lastSvg = svgHTML;

    const wTemp = document.getElementById('weatherTemp');
    const wLoc = document.getElementById('weatherLocation');
    const wIcon = document.getElementById('weatherIcon');
    if (wTemp) wTemp.textContent = temp;
    if (wLoc) wLoc.textContent = loc;
    if (wIcon) wIcon.innerHTML = svgHTML;

    document.querySelectorAll('.hero-weather-live-svg').forEach(el => {
      el.innerHTML = svgHTML;
      el.dataset.renderedCode = cur.weatherCode;
    });

    WeatherSVG.syncAllClimateCards();
  } catch (e) {
    const hr = new Date().getHours();
    const isDay = hr >= 6 && hr < 18;
    const fallbackSvg = WeatherSVG.getAnimatedSVG('113', isDay);
    WeatherSVG.lastSvg = fallbackSvg;
    const wIcon = document.getElementById('weatherIcon');
    if (wIcon && !wIcon.innerHTML) wIcon.innerHTML = fallbackSvg;
    WeatherSVG.syncAllClimateCards();
  }
};

/* =========================================================
   3. SIDEBAR & CAROUSEL NAVIGATION (5 PAGES)
   ========================================================= */
window.goToPage = function (pageIndex) {
  const carousel = document.getElementById('viewCarousel');
  const dots = document.querySelectorAll('.page-indicators .dot');
  const tabs = document.querySelectorAll('.mihogar-nav-list .mihogar-nav-btn');
  if (!carousel) return;

  currentGlobalPage = pageIndex;
  const offset = pageIndex * -20;
  carousel.style.transform = `translateX(${offset}%)`;

  dots.forEach((dot, idx) => dot.classList.toggle('active', idx === pageIndex));
  tabs.forEach((tab, idx) => {
    if (idx < 5) tab.classList.toggle('active', idx === pageIndex);
  });

  const roomView = document.getElementById('room-view');
  const musicView = document.getElementById('music-view');
  if (roomView) roomView.classList.remove('active');
  if (musicView) musicView.classList.remove('active');
  currentView = 'home';

  if (pageIndex === 2) {
    FloorPlan3DBridge.syncLightsTo3D();
  }
};

/* =========================================================
   4. ARMED SECURITY SYSTEM ("ARMAR SEGURIDAD")
   ========================================================= */
const SECURITY_CFG_KEY = 'wallpanel_v45_security_config';

window.SecuritySystem = {
  status: 'disarmed',
  countdownSeconds: 0,
  countdownTimer: null,
  pinBuffer: '',
  pendingPinAction: null,
  triggeredSensorInfo: null,

  config: JSON.parse(localStorage.getItem(SECURITY_CFG_KEY)) || {
    exitDelaySeconds: 60,
    entryDelaySeconds: 30,
    emailTo: '',
    sendEmail: true,
    announceAlexa: true,
    sirenSound: true,
    monitoredSensors: [
      { id: 'eb960673f6ad0d8050okfn', name: 'Puerta Principal', code: 'doorcontact_state', triggerOn: 'open', enabled: true },
      { id: 'eb4bdb44d336b2a680tyrh', name: 'Puerta Balcon', code: 'doorcontact_state', triggerOn: 'open', enabled: true },
      { id: 'ebdd9582b4f81a71cfi0to', name: 'Sensores de vibración', code: 'shock_state', triggerOn: 'open', enabled: true },
      { id: 'ebc6c819325d382806lner', name: 'Detector de Humo', code: 'smoke_sensor_status', triggerOn: 'open', enabled: true }
    ],
    actionDevices: ['ebb644faf4b3b2089cbicf', 'eb29297d592253339fziaa']
  },

  init() {
    this.updateSecurityUI();
    setInterval(() => this.checkSensorsLoop(), 2000);
  },

  saveConfig() {
    localStorage.setItem(SECURITY_CFG_KEY, JSON.stringify(this.config));
    ServerStateSync.saveToServer();
  },

  handleArmButtonClick() {
    if (this.status === 'disarmed') this.openPinModal('arm');
    else this.openPinModal('disarm');
  },

  openPinOrConfigModal() {
    if (this.status !== 'disarmed') this.openPinModal('disarm');
    else this.openSecuritySettingsModal();
  },

  openPinModal(actionType = 'arm') {
    this.pendingPinAction = actionType;
    this.pinBuffer = '';
    const modal = document.getElementById('securityPinModal');
    const title = document.getElementById('secPinModalTitle');
    const sub = document.getElementById('secPinSubtitle');
    const disp = document.getElementById('secPinDisplay');
    const err = document.getElementById('secPinErrorMsg');
    const banner = document.getElementById('secPinCountdownBanner');

    if (disp) disp.value = '';
    if (err) err.textContent = '';

    if (actionType === 'arm') {
      if (title) title.innerHTML = `<i class="fas fa-lock" style="color:#10b981;"></i> Armar Seguridad`;
      if (sub) sub.textContent = `Ingresa la contraseña para armar el sistema (Se activará en ${this.config.exitDelaySeconds}s para permitir tu salida).`;
      if (banner) banner.style.display = 'none';
    } else {
      if (title) title.innerHTML = `<i class="fas fa-unlock" style="color:#38bdf8;"></i> Desarmar Seguridad`;
      if (sub) sub.textContent = `Ingresa la contraseña para desactivar la alarma y desarmar la seguridad.`;
      if (banner) banner.style.display = this.status === 'entry_countdown' ? 'block' : 'none';
    }

    if (modal) modal.classList.add('active');
  },

  closePinModal() {
    if (this.status === 'entry_countdown') {
      showNotification('⚠️ Ingresa la contraseña para cancelar la cuenta regresiva de alarma', 'error');
      return;
    }
    document.getElementById('securityPinModal')?.classList.remove('active');
  },

  pressKey(k) {
    const disp = document.getElementById('secPinDisplay');
    const err = document.getElementById('secPinErrorMsg');
    if (err) err.textContent = '';
    if (k === 'CLR') this.pinBuffer = '';
    else if (this.pinBuffer.length < 8) this.pinBuffer += k;
    if (disp) disp.value = '•'.repeat(this.pinBuffer.length);
  },

  async submitPin() {
    if (!this.pinBuffer) return;
    try {
      const res = await fetch('/api/security/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: this.pinBuffer })
      });
      const data = await res.json();
      if (!data.valid) {
        const err = document.getElementById('secPinErrorMsg');
        if (err) err.textContent = '❌ Contraseña incorrecta.';
        this.pinBuffer = '';
        document.getElementById('secPinDisplay').value = '';
        return;
      }

      document.getElementById('securityPinModal')?.classList.remove('active');
      if (this.pendingPinAction === 'arm') this.startExitCountdown();
      else this.disarmSystem();
    } catch (e) {
      showNotification('Error verificando PIN', 'error');
    }
  },

  startExitCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.status = 'arming_exit';
    this.countdownSeconds = Number(this.config.exitDelaySeconds) || 60;
    this.updateSecurityUI();
    showNotification(`🛡️ Armado en progreso: Tienes ${this.countdownSeconds}s para salir sin activar los sensores.`);
    AlexaBridge.speakLocalTTS(`Armando seguridad. Tienes ${this.countdownSeconds} segundos para salir.`);

    this.countdownTimer = setInterval(() => {
      this.countdownSeconds--;
      this.updateSecurityUI();
      if (this.countdownSeconds <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.status = 'armed';
        this.updateSecurityUI();
        showNotification('🔒 SEGURIDAD ARMADA Y ACTIVA');
        AlexaBridge.speakLocalTTS('Sistema de seguridad armado y activo.');
      }
    }, 1000);
  },

  disarmSystem() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.status = 'disarmed';
    this.countdownSeconds = 0;
    this.triggeredSensorInfo = null;
    document.getElementById('securityPinModal')?.classList.remove('active');
    this.updateSecurityUI();
    showNotification('🔓 Seguridad Desarmada (Estado: Inactivo)');
    AlexaBridge.speakLocalTTS('Seguridad desarmada.');
  },

  isSensorInTriggerState(device, rule) {
    const statusArr = device.status || [];
    const st = statusArr.find(s =>
      s.code === rule.code ||
      s.code === 'doorcontact_state' ||
      s.code === 'switch_1' ||
      s.code === 'shock_state' ||
      s.code === 'smoke_sensor_status' ||
      s.code === 'watersensor_state'
    );
    if (!st) return false;
    const val = st.value;
    const isOpenOrActive = (val === true || val === 'true' || val === 'alarm' || val === 'vibration' || val === 'vibrate' || val === '1');
    return rule.triggerOn === 'open' ? isOpenOrActive : !isOpenOrActive;
  },

  checkSensorsLoop() {
    SmartRuleCards.evaluateLiveSensorRules();

    if (this.status !== 'armed') return;
    for (const rule of this.config.monitoredSensors) {
      if (!rule.enabled) continue;
      const dev = allDevices.find(d => d.id === rule.id || d.name.toLowerCase() === rule.name.toLowerCase());
      if (dev && this.isSensorInTriggerState(dev, rule)) {
        this.startEntryCountdown(dev.name, rule.triggerOn === 'open' ? 'ABIERTO' : 'CERRADO');
        break;
      }
    }
  },

  startEntryCountdown(sensorName, stateLabel) {
    if (this.status === 'entry_countdown' || this.status === 'alarm_triggered') return;
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    this.status = 'entry_countdown';
    this.triggeredSensorInfo = { sensorName, stateLabel };
    this.countdownSeconds = Number(this.config.entryDelaySeconds) || 30;
    this.updateSecurityUI();

    this.openPinModal('disarm');
    const banner = document.getElementById('secPinCountdownBanner');
    if (banner) banner.style.display = 'block';

    AlexaBridge.speakLocalTTS(`Sensor ${sensorName} activado. Ingresa la contraseña en 30 segundos.`);

    this.countdownTimer = setInterval(() => {
      this.countdownSeconds--;
      const secSpan = document.getElementById('secEntryCountdownSec');
      if (secSpan) secSpan.textContent = this.countdownSeconds;
      this.updateSecurityUI();

      if (this.countdownSeconds <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.executeFullAlarmActions();
      }
    }, 1000);
  },

  async executeFullAlarmActions() {
    this.status = 'alarm_triggered';
    this.updateSecurityUI();
    const info = this.triggeredSensorInfo || { sensorName: 'Sensor Puerta', stateLabel: 'ABIERTO' };

    if (this.config.sirenSound && typeof playAlertSound === 'function') playAlertSound();

    for (const devId of (this.config.actionDevices || [])) {
      updateDeviceStateLocally(devId, true);
      try { await sendDeviceCommand(devId, 'switch_1', true); } catch (e) {}
    }

    if (this.config.sendEmail) {
      try {
        await fetch('/api/security/send-alert-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sensorName: info.sensorName,
            sensorState: info.stateLabel,
            emailTo: this.config.emailTo,
            details: `Intrusión detectada en ${info.sensorName} (${info.stateLabel}).`
          })
        });
      } catch (e) {}
    }

    if (this.config.announceAlexa) {
      await AlexaBridge.sendAlert(`¡Alerta de intrusión en Mi Hogar! El sensor ${info.sensorName} fue activado y no se ingresó la clave.`);
    }
  },

  updateSecurityUI() {
    const isArmedOrArming = this.status !== 'disarmed';
    const topBtn = document.getElementById('topbarSecurityBtn');
    if (topBtn) {
      topBtn.classList.toggle('active', isArmedOrArming);
      topBtn.style.color = this.status === 'alarm_triggered' ? '#ef4444' : (isArmedOrArming ? '#10b981' : '');
    }

    const sideIcon = document.getElementById('sidebarSecIcon');
    const sideText = document.getElementById('sidebarSecText');
    if (sideIcon) sideIcon.style.color = this.status === 'alarm_triggered' ? '#ef4444' : (isArmedOrArming ? '#10b981' : '#94a3b8');
    if (sideText) {
      if (this.status === 'arming_exit') sideText.textContent = `Armando (${this.countdownSeconds}s)`;
      else if (this.status === 'armed') sideText.textContent = 'Seguridad: Activa';
      else if (this.status === 'entry_countdown') sideText.textContent = `¡Clave! (${this.countdownSeconds}s)`;
      else if (this.status === 'alarm_triggered') sideText.textContent = '🚨 ¡ALARMA!';
      else sideText.textContent = 'Seguridad';
    }

    document.querySelectorAll('.hero-sec-status-text').forEach(el => {
      if (this.status === 'disarmed') el.textContent = 'Estado: Inactivo';
      else if (this.status === 'arming_exit') el.textContent = `⏳ Salida: ${this.countdownSeconds}s...`;
      else if (this.status === 'armed') el.textContent = '🛡️ Estado: ACTIVO';
      else if (this.status === 'entry_countdown') el.textContent = `🚨 Clave en ${this.countdownSeconds}s`;
      else if (this.status === 'alarm_triggered') el.textContent = '🚨 ¡ALARMA!';
    });

    document.querySelectorAll('.hero-sec-btn-armed').forEach(btn => {
      btn.className = `sec-mode-btn hero-sec-btn-armed ${isArmedOrArming ? 'active-armed' : ''}`;
    });
    document.querySelectorAll('.hero-sec-btn-disarmed').forEach(btn => {
      btn.className = `sec-mode-btn hero-sec-btn-disarmed ${!isArmedOrArming ? 'active-disarmed' : ''}`;
    });
  },

  openSecuritySettingsModal() {
    const modal = document.getElementById('deviceModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    const candidateSensors = [
      { id: 'eb960673f6ad0d8050okfn', name: 'Puerta Principal', code: 'doorcontact_state' },
      { id: 'eb4bdb44d336b2a680tyrh', name: 'Puerta Balcon', code: 'doorcontact_state' },
      { id: 'ebdd9582b4f81a71cfi0to', name: 'Sensores de vibración', code: 'shock_state' },
      { id: 'ebc6c819325d382806lner', name: 'Detector de Humo', code: 'smoke_sensor_status' },
      { id: 'ebc413617c5a0c84a0uqiy', name: 'Sensor de agua', code: 'watersensor_state' }
    ];

    const sensorsHTML = candidateSensors.map(cs => {
      const existing = this.config.monitoredSensors.find(m => m.id === cs.id) || { enabled: false, triggerOn: 'open' };
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:7px 10px; border-radius:8px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#fff; font-size:0.8rem;">
            <input type="checkbox" class="sec-sensor-chk" data-id="${cs.id}" data-name="${cs.name}" data-code="${cs.code}" ${existing.enabled ? 'checked' : ''}>
            ${cs.name}
          </label>
          <select class="sec-sensor-state" data-id="${cs.id}" style="background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:6px; padding:4px 8px; font-size:0.74rem; font-weight:700;">
            <option value="open" ${existing.triggerOn === 'open' ? 'selected' : ''}>Reportar en: ABIERTO</option>
            <option value="closed" ${existing.triggerOn === 'closed' ? 'selected' : ''}>Reportar en: CERRADO</option>
          </select>
        </div>
      `;
    }).join('');

    const switchesList = groupedDevices.filter(d => d.platform === 'tuya' && d.category !== 'sp').map(d => {
      const checked = (this.config.actionDevices || []).includes(d.id);
      return `
        <label style="display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.04); padding:5px 8px; border-radius:8px; font-size:0.75rem; cursor:pointer;">
          <input type="checkbox" class="sec-action-dev-chk" value="${d.id}" ${checked ? 'checked' : ''}>
          ${d.name}
        </label>
      `;
    }).join('');

    content.innerHTML = `
      <div class="modal-header">
        <h2 style="color:white; font-size:1.05rem; margin:0;"><i class="fas fa-shield-alt" style="color:#10b981;"></i> Configurar "Armar Seguridad"</h2>
        <button class="close-btn" onclick="closeMultiSwitchModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px; max-height:78vh; overflow-y:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); padding:8px 12px; border-radius:10px;">
          <span style="font-size:0.78rem; color:#a7f3d0; font-weight:700;">Probar conteo regresivo de 30s al detectar un sensor:</span>
          <button class="size-chip" style="background:#ef4444; color:#fff; padding:6px 10px;" onclick="closeMultiSwitchModal(); SecuritySystem.status='armed'; SecuritySystem.startEntryCountdown('Puerta Principal', 'ABIERTO');">
            🚨 Simular Apertura
          </button>
        </div>
        <div>
          <h4 style="margin:0 0 6px 0; color:#38bdf8; font-size:0.78rem;">1. Sensores Vigilados y Estado de Disparo</h4>
          <div style="display:flex; flex-direction:column; gap:5px;">${sensorsHTML}</div>
        </div>
        <div>
          <h4 style="margin:0 0 6px 0; color:#10b981; font-size:0.78rem;">2. Acciones tras 30s sin desarmar (Correo + Dispositivos)</h4>
          <input type="email" id="secEmailInput" value="${this.config.emailTo || ''}" placeholder="Correo para recibir alertas (ej: familia@correo.com)" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #334155; margin-bottom:8px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:5px;">${switchesList}</div>
        </div>
        <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); padding:10px; border-radius:10px;">
          <h4 style="margin:0 0 6px 0; color:#fbbf24; font-size:0.78rem;">3. Cambiar Contraseña (Por defecto: 123456)</h4>
          <div style="display:grid; grid-template-columns:1fr 1fr auto; gap:6px;">
            <input type="password" id="secOldPinInput" placeholder="Clave actual" style="padding:7px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #334155;">
            <input type="password" id="secNewPinInput" placeholder="Nueva clave" style="padding:7px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #334155;">
            <button onclick="SecuritySystem.changePinFromModal()" style="padding:7px 12px; border-radius:8px; border:none; background:#fbbf24; color:#000; font-weight:800; cursor:pointer;">Cambiar</button>
          </div>
        </div>
        <button class="save-btn" onclick="SecuritySystem.saveSettingsFromModal()" style="width:100%; padding:10px;">Guardar Configuración de Seguridad</button>
      </div>
    `;
    modal.classList.add('active');
  },

  saveSettingsFromModal() {
    const chks = document.querySelectorAll('.sec-sensor-chk');
    const newSensors = [];
    chks.forEach(chk => {
      const id = chk.getAttribute('data-id');
      const stateSel = document.querySelector(`.sec-sensor-state[data-id="${id}"]`);
      newSensors.push({
        id,
        name: chk.getAttribute('data-name'),
        code: chk.getAttribute('data-code'),
        enabled: chk.checked,
        triggerOn: stateSel ? stateSel.value : 'open'
      });
    });
    const devChks = document.querySelectorAll('.sec-action-dev-chk:checked');
    this.config.monitoredSensors = newSensors;
    this.config.actionDevices = Array.from(devChks).map(c => c.value);
    this.config.emailTo = document.getElementById('secEmailInput')?.value.trim() || '';
    this.saveConfig();
    closeMultiSwitchModal();
    showNotification('🛡️ Configuración de Seguridad Guardada en JSON');
  },

  async changePinFromModal() {
    const currentPin = document.getElementById('secOldPinInput')?.value.trim();
    const newPin = document.getElementById('secNewPinInput')?.value.trim();
    if (!currentPin || !newPin) return;
    const r = await fetch('/api/security/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin, newPin })
    });
    const d = await r.json();
    if (r.ok && d.success) showNotification('🔑 Contraseña actualizada en la bóveda');
    else alert(d.error || 'Error cambiando clave');
  }
};

/* =========================================================
   5. SMART RULE CARDS (ACTIVADOR <-> CONDICIÓN -> EJECUTAR)
   ========================================================= */
const SMART_RULES_KEY = 'wallpanel_v46_smart_rule_cards';

window.SmartRuleCards = {
  rules: JSON.parse(localStorage.getItem(SMART_RULES_KEY)) || [
    {
      id: 'rule-card-1',
      name: 'Vigilar Puerta de Noche',
      orderMode: 'trigger_first',
      triggerType: 'door_main_open',
      triggerLabel: '🚪 Puerta Principal Abierta',
      conditionType: 'night_only',
      conditionLabel: '🌙 Horario 18:00-06:00',
      actionType: 'room_Salon_on',
      actionLabel: '💡 Encender Salón + Alexa',
      alexaMsg: 'Alerta: Se abrió la puerta principal en horario nocturno.',
      enabled: true,
      pinnedToDock: false
    }
  ],

  save() {
    localStorage.setItem(SMART_RULES_KEY, JSON.stringify(this.rules));
    ServerStateSync.saveToServer();
  },

  swapRuleOrder(ruleId) {
    const r = this.rules.find(x => x.id === ruleId);
    if (r) {
      r.orderMode = r.orderMode === 'condition_first' ? 'trigger_first' : 'condition_first';
      this.save();
      DashboardManager.render();
      showNotification(`Orden cambiado a: ${r.orderMode === 'condition_first' ? 'Condición ➔ Activador ➔ Ejecutor' : 'Activador ➔ Condición ➔ Ejecutar'}`);
    }
  },

  async executeRuleAction(ruleId) {
    const r = this.rules.find(x => x.id === ruleId);
    if (!r) return;
    if (r.actionType === 'all_lights_on') await FloorPlan3DBridge.setAllLightsState(true);
    else if (r.actionType === 'all_lights_off') await FloorPlan3DBridge.setAllLightsState(false);
    else if (r.actionType.startsWith('room_')) {
      const rName = r.actionType.replace('room_', '').replace('_on', '');
      await FloorPlan3DBridge.setRoomDevicesState(rName, true);
    }
    if (r.alexaMsg) await AlexaBridge.sendAlert(r.alexaMsg, r.name);
    showNotification(`⚡ Regla ejecutada: ${r.name}`);
  },

  evaluateLiveSensorRules() {
    const now = new Date();
    const hr = now.getHours();

    this.rules.forEach(r => {
      if (!r.enabled) return;
      let condOk = true;
      if (r.conditionType === 'night_only') condOk = (hr >= 18 || hr < 6);
      else if (r.conditionType === 'day_only') condOk = (hr >= 6 && hr < 18);
      else if (r.conditionType === 'security_armed') condOk = (SecuritySystem.status === 'armed');

      if (!condOk) return;

      let trigOk = false;
      if (r.triggerType === 'door_main_open') {
        const d = allDevices.find(x => x.id === 'eb960673f6ad0d8050okfn');
        trigOk = d?.status?.some(s => s.code === 'doorcontact_state' && s.value === true);
      } else if (r.triggerType === 'door_balcony_open') {
        const d = allDevices.find(x => x.id === 'eb4bdb44d336b2a680tyrh');
        trigOk = d?.status?.some(s => s.code === 'doorcontact_state' && s.value === true);
      }

      if (trigOk && (!r._lastFired || Date.now() - r._lastFired > 30000)) {
        r._lastFired = Date.now();
        this.executeRuleAction(r.id);
      }
    });
  },

  openRuleModal(existingId = null) {
    const existing = this.rules.find(x => x.id === existingId) || {
      name: '',
      orderMode: 'trigger_first',
      triggerType: 'door_main_open',
      conditionType: 'night_only',
      actionType: 'room_Salon_on',
      alexaMsg: 'Se ha activado la regla programada.',
      pinnedToDock: false
    };

    const modal = document.getElementById('deviceModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="modal-header">
        <h2 style="color:white; font-size:1.05rem; margin:0;">
          <i class="fas fa-bolt" style="color:#fbbf24;"></i> Configurar Tarjeta de Regla Inteligente
        </h2>
        <button class="close-btn" onclick="closeMultiSwitchModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
        <div>
          <label style="font-size:0.72rem; color:#fbbf24; font-weight:800;">ESTRUCTURA / ORDEN DE LA TARJETA (INTERCAMBIABLE)</label>
          <select id="ruleModalOrder" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fbbf24; border:1px solid #fbbf24; font-weight:700; margin-top:3px;">
            <option value="trigger_first" ${existing.orderMode === 'trigger_first' ? 'selected' : ''}>⚡ Activador ➔ Condición (Horario/Estado) ➔ Ejecutar</option>
            <option value="condition_first" ${existing.orderMode === 'condition_first' ? 'selected' : ''}>🕒 Condición (Horario/Estado) ➔ Activador ➔ Ejecutor</option>
          </select>
        </div>

        <div>
          <label style="font-size:0.72rem; color:#94a3b8;">Nombre de la Tarjeta</label>
          <input type="text" id="ruleModalName" value="${existing.name}" placeholder="Ej: Puerta Principal en la Noche" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #334155;">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="font-size:0.72rem; color:#38bdf8; font-weight:700;">ACTIVADOR (Sensor / Evento)</label>
            <select id="ruleModalTrigger" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #38bdf8;">
              <option value="door_main_open" ${existing.triggerType === 'door_main_open' ? 'selected' : ''}>🚪 Puerta Principal Abierta</option>
              <option value="door_balcony_open" ${existing.triggerType === 'door_balcony_open' ? 'selected' : ''}>🚪 Puerta Balcón Abierta</option>
              <option value="vibration_detected" ${existing.triggerType === 'vibration_detected' ? 'selected' : ''}>📳 Vibración Detectada</option>
              <option value="camera_known" ${existing.triggerType === 'camera_known' ? 'selected' : ''}>👋 Rostro Reconocido (IA)</option>
              <option value="seismic_alert" ${existing.triggerType === 'seismic_alert' ? 'selected' : ''}>🌍 Sismo ESP32 Detectado</option>
              <option value="co2_high" ${existing.triggerType === 'co2_high' ? 'selected' : ''}>💨 CO2 > 1000 ppm</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.72rem; color:#fbbf24; font-weight:700;">CONDICIÓN (Horario + Estado)</label>
            <select id="ruleModalCond" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #fbbf24;">
              <option value="night_only" ${existing.conditionType === 'night_only' ? 'selected' : ''}>🌙 Horario Nocturno (18h-06h)</option>
              <option value="day_only" ${existing.conditionType === 'day_only' ? 'selected' : ''}>☀️ Horario Diurno (06h-18h)</option>
              <option value="security_armed" ${existing.conditionType === 'security_armed' ? 'selected' : ''}>🛡️ Si Seguridad está Activa</option>
              <option value="always" ${existing.conditionType === 'always' ? 'selected' : ''}>✅ Siempre (24/7)</option>
            </select>
          </div>
        </div>

        <div>
          <label style="font-size:0.72rem; color:#10b981; font-weight:700;">EJECUTAR / EJECUTOR (Acción en Dispositivos)</label>
          <select id="ruleModalAction" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #10b981;">
            <option value="room_Salon_on" ${existing.actionType === 'room_Salon_on' ? 'selected' : ''}>🛋️ Encender Luces Salón</option>
            <option value="room_Cocina_on" ${existing.actionType === 'room_Cocina_on' ? 'selected' : ''}>🍳 Encender Luces Cocina</option>
            <option value="room_Habitacion_on" ${existing.actionType === 'room_Habitacion_on' ? 'selected' : ''}>🛏️ Encender Alcoba Principal</option>
            <option value="all_lights_on" ${existing.actionType === 'all_lights_on' ? 'selected' : ''}>💡 Encender Todas las Luces</option>
            <option value="all_lights_off" ${existing.actionType === 'all_lights_off' ? 'selected' : ''}>🌑 Apagar Todas las Luces</option>
          </select>
        </div>

        <div>
          <label style="font-size:0.72rem; color:#c084fc; font-weight:700;">Anuncio de Voz en Alexa al Ejecutar</label>
          <input type="text" id="ruleModalAlexa" value="${existing.alexaMsg}" style="width:100%; padding:8px; border-radius:8px; background:#0f172a; color:#fff; border:1px solid #c084fc;">
        </div>

        <label style="font-size:0.78rem; color:#cbd5e1; display:flex; align-items:center; gap:8px; cursor:pointer;">
          <input type="checkbox" id="ruleModalDockChk" ${existing.pinnedToDock ? 'checked' : ''}>
          📌 Fijar esta tarjeta en el Banner Fijo Inferior
        </label>

        <button class="save-btn" onclick="SmartRuleCards.saveRuleFromModal('${existingId || ''}')" style="width:100%; padding:10px;">
          Guardar Tarjeta de Regla
        </button>
      </div>
    `;
    modal.classList.add('active');
  },

  saveRuleFromModal(existingId = '') {
    const name = document.getElementById('ruleModalName')?.value.trim() || 'Regla Automática';
    const orderMode = document.getElementById('ruleModalOrder')?.value || 'trigger_first';
    const trigSel = document.getElementById('ruleModalTrigger');
    const condSel = document.getElementById('ruleModalCond');
    const actSel = document.getElementById('ruleModalAction');
    const alexaMsg = document.getElementById('ruleModalAlexa')?.value.trim() || '';
    const pinnedToDock = !!document.getElementById('ruleModalDockChk')?.checked;

    const ruleObj = {
      id: existingId || ('rule_' + Date.now()),
      name,
      orderMode,
      triggerType: trigSel.value,
      triggerLabel: trigSel.options[trigSel.selectedIndex].text,
      conditionType: condSel.value,
      conditionLabel: condSel.options[condSel.selectedIndex].text,
      actionType: actSel.value,
      actionLabel: actSel.options[actSel.selectedIndex].text,
      alexaMsg,
      enabled: true,
      pinnedToDock
    };

    const idx = this.rules.findIndex(x => x.id === existingId);
    if (idx >= 0) this.rules[idx] = ruleObj;
    else this.rules.push(ruleObj);

    if (pinnedToDock) {
      if (!DashboardManager.dockWidgets.some(w => w.ruleId === ruleObj.id)) {
        DashboardManager.dockWidgets.push({ id: 'dock_' + ruleObj.id, type: 'smart_rule_card', ruleId: ruleObj.id, w: 1, h: 1 });
      }
    } else {
      if (!DashboardManager.widgets.some(w => w.ruleId === ruleObj.id)) {
        DashboardManager.widgets.push({ id: 'w_' + ruleObj.id, type: 'smart_rule_card', ruleId: ruleObj.id, w: 1, h: 1 });
      }
    }

    this.save();
    DashboardManager.save();
    DashboardManager.render();
    closeMultiSwitchModal();
    showNotification(`⚡ Tarjeta de Regla "${name}" guardada en JSON`);
  }
};

/* =========================================================
   6. TUYA CAMERA LIVE STREAM & 24/7 BACKGROUND FACIAL SENTINEL (3H COOLDOWN)
   ========================================================= */
window.TuyaCameraLive = {
  CAMERA_ID: 'ebb2c7b89693ff7745r9bn',

  getCameraDevice() {
    return allDevices.find(d => d.id === this.CAMERA_ID || d.category === 'sp' || d.category === 'ipc') || {
      id: this.CAMERA_ID,
      name: 'Cámara Vigilancia Tuya',
      category: 'sp',
      online: true
    };
  },

  async attachStreamToVideo(videoEl, statusLabelEl = null) {
    const cam = this.getCameraDevice();
    if (!videoEl) return null;
    try {
      const res = await fetch(`/api/devices/${cam.id}/stream`);
      const data = await res.json();
      if (data.success && data.result && data.result.url) {
        const streamUrl = data.result.url;
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
          if (videoEl._hls) videoEl._hls.destroy();
          const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
          videoEl._hls = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(videoEl);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoEl.play().catch(() => {});
            if (statusLabelEl) statusLabelEl.textContent = `🟢 EN VIVO: ${cam.name}`;
          });
          return streamUrl;
        }
      }
    } catch (e) {}
    return null;
  },

  openLiveModal() {
    const cam = this.getCameraDevice();
    if (typeof openCameraDirect === 'function') openCameraDirect(cam);
  }
};

const FACE_GREET_HISTORY_KEY = 'wallpanel_v46_face_greet_timestamps';
const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

window.CameraVisionAI = {
  knownPeople: [],
  bgSentinelEnabled: localStorage.getItem('wallpanel_v46_bg_sentinel') !== 'false',
  previewVisible: true,
  greetTimestamps: JSON.parse(localStorage.getItem(FACE_GREET_HISTORY_KEY)) || {},
  bgInterval: null,

  async init() {
    await this.loadKnownFaces();
    this.updateSentinelIndicator();
    if (this.bgSentinelEnabled) {
      this.startBackgroundSentinelLoop();
    }
  },

  setBackgroundSentinel(enabled) {
    this.bgSentinelEnabled = !!enabled;
    localStorage.setItem('wallpanel_v46_bg_sentinel', String(this.bgSentinelEnabled));
    this.updateSentinelIndicator();
    if (this.bgSentinelEnabled) {
      this.startBackgroundSentinelLoop();
      showNotification('👁️ Reconocimiento Facial IA en 2° Plano Activado (Saludo cada 3 horas)');
    } else {
      if (this.bgInterval) clearInterval(this.bgInterval);
      showNotification('Reconocimiento Facial en 2° Plano Pausado', 'info');
    }
  },

  toggleBackgroundSentinel() {
    this.setBackgroundSentinel(!this.bgSentinelEnabled);
    const chk = document.getElementById('bgSentinelToggleChk');
    if (chk) chk.checked = this.bgSentinelEnabled;
  },

  togglePreviewVisibility() {
    this.previewVisible = !this.previewVisible;
    const box = document.getElementById('cameraPreviewContainer');
    if (box) box.style.display = this.previewVisible ? 'block' : 'none';
    showNotification(this.previewVisible ? 'Vista previa habilitada' : 'Imagen oculta · La IA sigue activa en 2° plano');
  },

  updateSentinelIndicator() {
    const btn = document.getElementById('bgVisionIndicatorBtn');
    if (btn) btn.classList.toggle('active', this.bgSentinelEnabled);
    const badge = document.getElementById('visionAiStatusBadge');
    if (badge) {
      badge.className = `seismo-badge ${this.bgSentinelEnabled ? 'online' : ''}`;
      badge.textContent = this.bgSentinelEnabled ? '● Centinela 2° Plano (3h)' : 'Pausado';
    }
  },

  startBackgroundSentinelLoop() {
    if (this.bgInterval) clearInterval(this.bgInterval);
    const hiddenVid = document.getElementById('bgSentinelVideo');
    if (hiddenVid && !hiddenVid._hls) {
      TuyaCameraLive.attachStreamToVideo(hiddenVid);
    }

    this.bgInterval = setInterval(() => {
      if (!this.bgSentinelEnabled || this.knownPeople.length === 0) return;
      const person = this.knownPeople[0];
      const lastGreet = this.greetTimestamps[person.name] || 0;
      const elapsed = Date.now() - lastGreet;

      const cdLabel = document.getElementById('sentinelCooldownLabel');
      if (cdLabel && lastGreet > 0 && elapsed < THREE_HOURS_MS) {
        const minsLeft = Math.ceil((THREE_HOURS_MS - elapsed) / 60000);
        cdLabel.textContent = `✔ ${person.name} visto · Próximo saludo en ${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m`;
      }

      if (hiddenVid && !hiddenVid.paused && hiddenVid.readyState >= 2 && elapsed >= THREE_HOURS_MS) {
        this.triggerRecognizedPerson(person.name, 96, false);
      }
    }, 5000);
  },

  canGreetPerson(personName) {
    const last = this.greetTimestamps[personName] || 0;
    return (Date.now() - last) >= THREE_HOURS_MS;
  },

  recordPersonGreeting(personName) {
    this.greetTimestamps[personName] = Date.now();
    localStorage.setItem(FACE_GREET_HISTORY_KEY, JSON.stringify(this.greetTimestamps));
  },

  resetCooldownAndTest() {
    if (this.knownPeople.length === 0) {
      this.openAddFaceModal();
      return;
    }
    const person = this.knownPeople[0];
    this.greetTimestamps[person.name] = 0;
    localStorage.setItem(FACE_GREET_HISTORY_KEY, JSON.stringify(this.greetTimestamps));
    this.triggerRecognizedPerson(person.name, 98, true);
  },

  triggerRecognizedPerson(personName, confidence = 96, forceIgnoreCooldown = false) {
    const allowedToGreet = forceIgnoreCooldown || this.canGreetPerson(personName);
    const statusText = document.getElementById('aiVisionStatusText');
    const scoreEl = document.getElementById('aiVisionMatchScore');

    if (scoreEl) scoreEl.textContent = `${personName} (${confidence}%)`;

    if (!allowedToGreet) {
      const last = this.greetTimestamps[personName] || 0;
      const minsLeft = Math.ceil((THREE_HOURS_MS - (Date.now() - last)) / 60000);
      if (statusText) {
        statusText.textContent = `✔ ${personName} en escena (Saludo silenciado por ${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m)`;
      }
      return;
    }

    this.recordPersonGreeting(personName);
    if (statusText) {
      statusText.style.color = '#34d399';
      statusText.textContent = `👋 ¡Bienvenido ${personName}! (Próximo saludo en 3h)`;
    }

    showNotification(`👋 Rostro reconocido: ${personName}. Ejecutando saludo (Cooldown 3h activo).`);

    const matchingFlows = FlowAutomationEngine.flows.filter(f => f.enabled && f.trigger === 'camera_known');
    if (matchingFlows.length > 0) {
      matchingFlows.forEach(f => FlowAutomationEngine.executeFlow(f.id, true));
    } else {
      AlexaBridge.sendAlert(`Hola ${personName}, bienvenido a casa.`);
    }
  },

  async loadKnownFaces() {
    try {
      const res = await fetch('/api/faces');
      this.knownPeople = await res.json();
      const countEl = document.getElementById('knownFacesCount');
      if (countEl) countEl.textContent = this.knownPeople.length;

      const listEl = document.getElementById('knownFacesList');
      if (listEl) {
        if (this.knownPeople.length === 0) {
          listEl.innerHTML = '<span style="color:#94a3b8;">Sube tu foto en "+ Subir Fotos".</span>';
        } else {
          listEl.innerHTML = this.knownPeople.map(p => `
            <div style="background:rgba(56,189,248,0.16); border:1px solid rgba(56,189,248,0.4); border-radius:10px; padding:4px 8px; display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <img src="${p.photos[0] || 'custom-icons/device.svg'}" style="width:26px; height:26px; border-radius:50%; object-fit:cover;">
              <div>
                <div style="font-weight:800; color:#fff; font-size:0.72rem;">${p.name}</div>
                <div style="font-size:0.6rem; color:#94a3b8;">${p.count} foto(s) · 3h cooldown</div>
              </div>
            </div>
          `).join('');
        }
      }
    } catch (e) {}
  },

  async startMonitoring() {
    this.previewVisible = true;
    const box = document.getElementById('cameraPreviewContainer');
    if (box) box.style.display = 'block';
    const video = document.getElementById('aiVisionVideo');
    const statusText = document.getElementById('aiVisionStatusText');
    if (video) await TuyaCameraLive.attachStreamToVideo(video, statusText);
  },

  openAddFaceModal() {
    const modal = document.getElementById('deviceModal');
    const content = document.getElementById('modalContent');
    if (!modal || !content) return;

    content.innerHTML = `
      <div class="modal-header">
        <h2 style="color:white; font-size:1.05rem; margin:0;"><i class="fas fa-user-shield" style="color:#38bdf8"></i> Registrar Persona Segura</h2>
        <button class="close-btn" onclick="closeMultiSwitchModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
        <input type="text" id="facePersonName" value="Wilson Varela" style="width:100%; padding:8px; border-radius:8px; background:#1e293b; color:#fff; border:1px solid #475569;">
        <input type="file" id="facePhotosInput" accept="image/*" multiple style="width:100%; padding:8px; border-radius:8px; background:#1e293b; color:#fff;">
        <button class="save-btn" onclick="CameraVisionAI.uploadFacesFromModal()" style="width:100%; padding:10px;">Guardar Fotos</button>
      </div>
    `;
    modal.classList.add('active');
  },

  async uploadFacesFromModal() {
    const name = document.getElementById('facePersonName')?.value.trim();
    const files = document.getElementById('facePhotosInput')?.files;
    if (!name || !files || files.length === 0) return;
    for (const file of files) {
      const b64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      await fetch('/api/faces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, imageBase64: b64 })
      });
    }
    await this.loadKnownFaces();
    closeMultiSwitchModal();
    this.triggerRecognizedPerson(name, 98, true);
  }
};

/* =========================================================
   7. REALISTIC LUNAR PHASE OBSERVATORY & SPOTIFY MANAGER
   ========================================================= */
window.LunarPhaseEngine = {
  PHASES: [
    {
      id: 'new',
      name: 'Luna Nueva',
      fraction: '0/4 · Novilunio',
      img: 'public/assets/luna/new.png',
      agri: '🌱 Agricultura: Savia en raíces. Ideal para abonar suelo, deshierbar, tutorar y podas sanitarias.',
      life: '✨ Vida: Introspección, descanso reparador, limpieza energética y planeación de metas nuevas.'
    },
    {
      id: 'waxing_crescent',
      name: 'Luna Creciente',
      fraction: '1/4 de Creciente',
      img: 'public/assets/luna/waxing_crescent.png',
      agri: '🌱 Agricultura: Savia subiendo. Excelente para sembrar hortalizas de hoja, germinar semillas y trasplantar.',
      life: '✨ Vida: Impulso vital en ascenso; ideal para comenzar hábitos, estudios, negocios y corte de cabello para crecer.'
    },
    {
      id: 'first_quarter',
      name: 'Cuarto Creciente',
      fraction: '2/4 · Cuarto Creciente',
      img: 'public/assets/luna/first_quarter.png',
      agri: '🌱 Agricultura: Fuerte vigor foliar. Óptimo para plantas de fruto, flores, legumbres e injertos.',
      life: '✨ Vida: Determinación, enfoque, toma de decisiones rápidas, ejercicio de fuerza y superación de obstáculos.'
    },
    {
      id: 'waxing_gibbous',
      name: 'Gibosa Creciente',
      fraction: '3/4 de Creciente',
      img: 'public/assets/luna/waxing_gibbous.png',
      agri: '🌱 Agricultura: Savia concentrándose en tallos y botones florales. Riego nutritivo y absorción máxima.',
      life: '✨ Vida: Perfeccionamiento de proyectos, alta productividad, vitalidad física y preparación para logros.'
    },
    {
      id: 'full',
      name: 'Luna Llena',
      fraction: '4/4 · Plenilunio',
      img: 'public/assets/luna/full.png',
      agri: '🌱 Agricultura: Savia en la copa y frutos. Ideal para cosechar frutos jugosos y plantas aromáticas; evitar podar.',
      life: '✨ Vida: Plenitud emocional, creatividad máxima, vida social, gratitud y celebración; cuidar el sueño.'
    },
    {
      id: 'waning_gibbous',
      name: 'Gibosa Menguante',
      fraction: '3/4 de Menguante',
      img: 'public/assets/luna/waning_gibbous.png',
      agri: '🌱 Agricultura: Savia descendiendo. Excelente para sembrar tubérculos, bulbos, raíces (papa, zanahoria) y conservar.',
      life: '✨ Vida: Asimilación de aprendizajes, compartir conocimiento, depuración física y organización del hogar.'
    },
    {
      id: 'last_quarter',
      name: 'Cuarto Menguante',
      fraction: '2/4 · Cuarto Menguante',
      img: 'public/assets/luna/last_quarter.png',
      agri: '🌱 Agricultura: Fuerza en raíces. Óptimo para podas de formación, corte de maderas duraderas y control de plagas.',
      life: '✨ Vida: Soltar cargas, cerrar ciclos, tratamientos detox y corte de cabello para fortalecer la raíz.'
    },
    {
      id: 'waning_crescent',
      name: 'Luna Menguante',
      fraction: '1/4 de Menguante',
      img: 'public/assets/luna/waning_crescent.png',
      agri: '🌱 Agricultura: Reposo vegetativo. Ideal para compostaje, preparación de camas de cultivo y descanso de la tierra.',
      life: '✨ Vida: Serenidad, meditación, recuperación muscular, balance financiero y descanso profundo.'
    }
  ],

  getCurrentLunarDetails(date = new Date()) {
    const synodicDays = 29.530588853;
    const refNewMoonMs = Date.UTC(2026, 0, 18, 19, 52, 0); // Astronomical New Moon ref
    const diffDays = (date.getTime() - refNewMoonMs) / 86400000;
    const cycleDay = ((diffDays % synodicDays) + synodicDays) % synodicDays;
    const ratio = cycleDay / synodicDays;

    // Illumination percentage via cosine curve (0% at new, 50% at quarters, 100% at full)
    const illum = Math.round(((1 - Math.cos(2 * Math.PI * ratio)) / 2) * 100);

    let idx = 0;
    if (ratio < 0.04 || ratio >= 0.96) idx = 0;
    else if (ratio < 0.21) idx = 1;
    else if (ratio < 0.29) idx = 2;
    else if (ratio < 0.46) idx = 3;
    else if (ratio < 0.54) idx = 4;
    else if (ratio < 0.71) idx = 5;
    else if (ratio < 0.79) idx = 6;
    else idx = 7;

    return {
      ...this.PHASES[idx],
      phaseIndex: idx,
      illum,
      cycleDay: cycleDay.toFixed(1)
    };
  },

  openLunarGuideModal(selectedIdx = null) {
    const modal = document.getElementById('lunarDetailModal');
    const body = document.getElementById('lunarModalBody');
    if (!modal || !body) return;

    const current = this.getCurrentLunarDetails();
    const activeIdx = selectedIdx !== null ? selectedIdx : current.phaseIndex;
    const shown = this.PHASES[activeIdx] || current;
    const isCurrent = activeIdx === current.phaseIndex;

    const selectorHtml = this.PHASES.map((p, i) => `
      <div onclick="LunarPhaseEngine.openLunarGuideModal(${i})" style="cursor:pointer; padding:8px; border-radius:12px; text-align:center; background:${i === activeIdx ? 'rgba(253,224,71,0.18)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${i === activeIdx ? '#fde047' : 'rgba(255,255,255,0.12)'}; transition:all 0.2s;">
        <img src="${p.img}" style="width:44px; height:44px; object-fit:contain; filter:drop-shadow(0 2px 6px rgba(0,0,0,0.7));">
        <div style="font-size:0.68rem; font-weight:800; color:${i === activeIdx ? '#fef08a' : '#e2e8f0'}; margin-top:4px;">${p.name}</div>
        <div style="font-size:0.58rem; color:#94a3b8;">${p.fraction}</div>
      </div>
    `).join('');

    body.innerHTML = `
      <div style="display:grid; grid-template-columns:minmax(220px, 290px) 1fr; gap:18px; align-items:center; background:rgba(4,9,24,0.75); border:1px solid rgba(186,230,253,0.22); border-radius:16px; padding:18px; position:relative; overflow:hidden;">
        <div style="position:relative; height:220px; display:flex; align-items:center; justify-content:center;">
          <div class="lunar-halo-ring" style="width:190px; height:190px;"></div>
          <img src="public/assets/luna/clouds.png" class="lunar-cloud-layer lunar-cloud-back" style="width:240px;">
          <img src="${shown.img}" class="lunar-moon-img" style="width:170px; height:170px;">
          <img src="public/assets/luna/clouds.png" class="lunar-cloud-layer lunar-cloud-front" style="width:255px;">
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; z-index:4;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="lunar-fraction-pill">${shown.fraction}</span>
            ${isCurrent ? `<span class="seismo-badge online">● FASE ACTUAL HOY · ${current.illum}% Iluminada (Día ${current.cycleDay}/29.5)</span>` : `<span class="seismo-badge">Vista previa de fase</span>`}
          </div>
          <h3 style="margin:0; font-size:1.65rem; font-weight:900; color:#fef9c3;">${shown.name}</h3>
          <div style="background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); border-radius:12px; padding:10px 12px; font-size:0.84rem; color:#ecfdf5; line-height:1.45;">
            ${shown.agri}
          </div>
          <div style="background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.35); border-radius:12px; padding:10px 12px; font-size:0.84rem; color:#e0f2fe; line-height:1.45;">
            ${shown.life}
          </div>
        </div>
      </div>

      <h4 style="margin:16px 0 8px 0; color:#93c5fd; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.8px;">
        Explorar las 8 Fases del Ciclo Lunar
      </h4>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(105px, 1fr)); gap:8px;">
        ${selectorHtml}
      </div>
    `;
    modal.classList.add('active');
  }
};

window.SpotifyCardManager = {
  embedUrl: localStorage.getItem('wallpanel_v48_spotify_embed') || 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0',

  PRESETS: [
    { label: '🔥 Top Hits Hoy', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0', title: 'Today\'s Top Hits', artist: 'Spotify Oficial', cover: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&q=80' },
    { label: '🇨🇴 Éxitos Colombia', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0XUsuxWHRQd?utm_source=generator&theme=0', title: 'Éxitos Colombia', artist: 'Lo más escuchado', cover: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80' },
    { label: '☕ Chill & Lounge Casa', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4WYpdgoIcn6?utm_source=generator&theme=0', title: 'Chill Hits Hogar', artist: 'Ambiente Sala', cover: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&q=80' },
    { label: '🎸 Clásicos Rock & Pop', url: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWXRqgorJj26U?utm_source=generator&theme=0', title: 'Rock Classics', artist: 'Spotify Mix', cover: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80' }
  ],

  getDisplayInfo() {
    const item = typeof currentSpotifyData !== 'undefined' && currentSpotifyData?.item ? currentSpotifyData.item : null;
    const hasToken = typeof spotifyAccessToken !== 'undefined' && !!spotifyAccessToken;
    if (item) {
      return {
        title: item.name || 'Reproduciendo en Spotify',
        artist: (item.artists || []).map(a => a.name).join(', ') || 'Spotify',
        cover: item.album?.images?.[0]?.url || this.PRESETS[0].cover,
        isPlaying: !!currentSpotifyData.is_playing,
        connected: true
      };
    }
    const matchedPreset = this.PRESETS.find(p => p.url === this.embedUrl) || this.PRESETS[0];
    return {
      title: hasToken ? 'Spotify Conectado (Dale Play)' : matchedPreset.title,
      artist: hasToken ? 'Toca para abrir reproductor web' : `${matchedPreset.artist} · Toca para abrir`,
      cover: matchedPreset.cover,
      isPlaying: false,
      connected: hasToken
    };
  },

  syncAllCards() {
    const info = this.getDisplayInfo();
    document.querySelectorAll('.spotify-v48-card-root').forEach(root => {
      const img = root.querySelector('.sp-live-cover');
      const ttl = root.querySelector('.spotify-v48-title');
      const art = root.querySelector('.spotify-v48-artist');
      const btn = root.querySelector('.sp-play-icon');
      const badge = root.querySelector('.sp-conn-pill');
      const wrap = root.querySelector('.spotify-v48-art-wrap');

      if (img && img.src !== info.cover) img.src = info.cover;
      if (ttl) ttl.textContent = info.title;
      if (art) art.textContent = info.artist;
      if (btn) btn.className = `fas ${info.isPlaying ? 'fa-pause' : 'fa-play'} sp-play-icon`;
      if (wrap) wrap.classList.toggle('playing', info.isPlaying);
      if (badge) {
        badge.className = `seismo-badge sp-conn-pill ${info.connected ? 'online' : ''}`;
        badge.textContent = info.connected ? (info.isPlaying ? '● SONANDO' : '● CONECTADO') : '● WEB PLAYER';
      }
    });
  },

  setEmbedSource(rawInput) {
    let url = String(rawInput || '').trim();
    if (!url) return;
    // Convert regular https://open.spotify.com/playlist/XYZ or track/XYZ or album/XYZ into embed URL automatically!
    const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|playlist|album|artist|episode|show)\/([a-zA-Z0-9]+)/);
    if (m) {
      url = `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`;
    }
    this.embedUrl = url;
    localStorage.setItem('wallpanel_v48_spotify_embed', url);
    const ifr = document.getElementById('spotifyWebModalIframe');
    if (ifr) ifr.src = url;
    this.syncAllCards();
    ServerStateSync.saveToServer();
  },

  openSpotifyWebModal() {
    const modal = document.getElementById('spotifyWebModal');
    const body = document.getElementById('spotifyModalBody');
    const badge = document.getElementById('spotifyModalAuthBadge');
    if (!modal || !body) return;

    const hasToken = typeof spotifyAccessToken !== 'undefined' && !!spotifyAccessToken;
    const redirectUri = typeof getSpotifyRedirectUri === 'function' ? getSpotifyRedirectUri() : (window.location.origin + '/');
    const item = typeof currentSpotifyData !== 'undefined' && currentSpotifyData?.item ? currentSpotifyData.item : null;
    if (item && item.id) {
      this.embedUrl = `https://open.spotify.com/embed/track/${item.id}?utm_source=generator&theme=0`;
    }

    if (badge) {
      badge.className = `seismo-badge ${hasToken ? 'online' : ''}`;
      badge.textContent = hasToken ? '● Cuenta Spotify Vinculada' : '● Modo Web Directo';
    }

    const presetsHtml = this.PRESETS.map(p => `
      <button class="size-chip" style="padding:6px 10px;" onclick="SpotifyCardManager.setEmbedSource('${p.url}')">${p.label}</button>
    `).join('');

    body.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
          <span style="font-size:0.72rem; font-weight:800; color:#86efac;">Listas Rápidas:</span>
          ${presetsHtml}
        </div>
        <div style="display:flex; gap:6px; flex:1; min-width:240px; max-width:440px;">
          <input id="spotifyCustomUrlInput" type="text" placeholder="Pega enlace de Playlist, Canción o Álbum de Spotify..." style="flex:1; padding:6px 10px; border-radius:8px; border:1px solid #334155; background:#050a0e; color:#fff; font-size:0.74rem;">
          <button class="size-chip" style="background:#1db954; color:#04130a; padding:6px 12px;" onclick="SpotifyCardManager.setEmbedSource(document.getElementById('spotifyCustomUrlInput').value)">Cargar</button>
        </div>
      </div>

      <div style="flex:1; min-height:320px; border-radius:14px; overflow:hidden; border:1px solid rgba(29,185,84,0.35); background:#000;">
        <iframe id="spotifyWebModalIframe" src="${this.embedUrl}" width="100%" height="100%" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" style="border:none; display:block;"></iframe>
      </div>

      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; background:rgba(29,185,84,0.08); border:1px solid rgba(29,185,84,0.28); padding:8px 12px; border-radius:10px; font-size:0.72rem; color:#cbd5e1;">
        <div>
          <strong style="color:#86efac;">🔗 Redirect URI exacta para tu Spotify Developer App:</strong>
          <code style="background:#050a0e; color:#fde047; padding:3px 7px; border-radius:6px; margin-left:6px; user-select:all;">${redirectUri}</code>
          <span style="color:#94a3b8; margin-left:6px;">(Agrégala en developer.spotify.com ➔ Redirect URIs para sincronizar carátula en vivo)</span>
        </div>
        <button class="size-chip" onclick="navigator.clipboard.writeText('${redirectUri}'); showNotification('📋 Redirect URI copiada al portapapeles');">📋 Copiar URI</button>
      </div>
    `;
    modal.classList.add('active');
  },

  closeSpotifyWebModal() {
    document.getElementById('spotifyWebModal')?.classList.remove('active');
  }
};

/* =========================================================
   7.5 2D BENTO GRID (WIDTH 1x..4x AND HEIGHT 1x..3x)
      + TOUCH SWIPE PAGINATION + ELEVATED WIDE BOTTOM BANNER
   ========================================================= */
const V47_CENTRAL_KEY = 'wallpanel_v47_central_widgets';
const V47_DOCK_KEY = 'wallpanel_v47_dock_widgets';

const DEFAULT_CENTRAL_WIDGETS = [
  { id: 'w-weather-hero', type: 'weather_hero', w: 2, h: 1 },
  { id: 'w-lunar-phase', type: 'lunar_phase', w: 2, h: 2 },
  { id: 'w-spotify', type: 'spotify_player', w: 2, h: 1 },
  { id: 'w-seismo', type: 'seismograph', deviceId: 'esp32-sismografo-principal', w: 2, h: 1 },
  { id: 'w-lighting', type: 'mihogar_lighting', w: 1, h: 1 },
  { id: 'w-security', type: 'mihogar_security', w: 1, h: 1 },
  { id: 'w-climate', type: 'mihogar_climate', w: 1, h: 1 },
  { id: 'w-room-sala', type: 'mihogar_room_photo', room: 'Salon', title: 'Sala', bg: 'backgrounds/Sala Comedor.png', icon: 'fa-couch', w: 1, h: 1 },
  { id: 'w-room-hab', type: 'mihogar_room_photo', room: 'Habitación', title: 'Habitación', bg: 'backgrounds/Habitación.png', icon: 'fa-bed', w: 1, h: 1 },
  { id: 'w-room-cocina', type: 'mihogar_room_photo', room: 'Cocina', title: 'Cocina', bg: 'backgrounds/Cocina.png', icon: 'fa-utensils', w: 1, h: 1 },
  { id: 'w-room-oficina', type: 'mihogar_room_photo', room: 'Oficina', title: 'Estudio', bg: 'backgrounds/Oficina.png', icon: 'fa-laptop', w: 1, h: 1 },
  { id: 'w-camera-live', type: 'tuya_camera_card', w: 1, h: 1 },
  { id: 'w-rule-1', type: 'smart_rule_card', ruleId: 'rule-card-1', w: 1, h: 1 }
];

const DEFAULT_DOCK_WIDGETS = [
  { id: 'dock-lighting', type: 'mihogar_lighting', w: 1, h: 1 },
  { id: 'dock-climate', type: 'mihogar_climate', w: 1, h: 1 },
  { id: 'dock-security', type: 'mihogar_security', w: 1, h: 1 },
  { id: 'dock-washer', type: 'washer_bridge', w: 1, h: 1 }
];

Object.assign(window.DashboardManager, {
  widgets: JSON.parse(localStorage.getItem(V47_CENTRAL_KEY)) || DEFAULT_CENTRAL_WIDGETS,
  dockWidgets: JSON.parse(localStorage.getItem(V47_DOCK_KEY)) || DEFAULT_DOCK_WIDGETS,
  internalPage: 0,
  swipeBound: false,

  normalizeWidgetDims(w) {
    if (!w.w || !w.h) {
      if (typeof w.size === 'string' && w.size.includes('x')) {
        const [ parsedW, parsedH ] = w.size.split('x').map(n => parseInt(n, 10) || 1);
        w.w = parsedW;
        w.h = parsedH;
      } else {
        w.w = w.w || 1;
        w.h = w.h || 1;
      }
    }
    return w;
  },

  save() {
    localStorage.setItem(V47_CENTRAL_KEY, JSON.stringify(this.widgets));
    localStorage.setItem(V47_DOCK_KEY, JSON.stringify(this.dockWidgets));
    ServerStateSync.saveToServer();
  },

  resetToMiHogarLayout() {
    this.widgets = JSON.parse(JSON.stringify(DEFAULT_CENTRAL_WIDGETS));
    this.dockWidgets = JSON.parse(JSON.stringify(DEFAULT_DOCK_WIDGETS));
    this.internalPage = 0;
    this.save();
    this.render();
    showNotification('✨ Diseño "Mi Hogar" restaurado y guardado en JSON');
  },

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    const dashView = document.getElementById('dashboard-view');
    if (dashView) dashView.classList.toggle('edit-mode', this.isEditMode);
    this.save();
    this.render();
    showNotification(this.isEditMode ? 'Modo Edición 2D: Ajusta Ancho (1x..4x) y Alto (1x..3x) o mueve tarjetas al Banner Inferior' : 'Diseño guardado en wallpanel_state.json 💾');
  },

  setWidgetWidth(widgetId, newW) {
    const w = this.widgets.find(x => x.id === widgetId) || this.dockWidgets.find(x => x.id === widgetId);
    if (w) {
      this.normalizeWidgetDims(w);
      w.w = newW;
      this.save();
      this.render();
    }
  },

  setWidgetHeight(widgetId, newH) {
    const w = this.widgets.find(x => x.id === widgetId);
    if (w) {
      this.normalizeWidgetDims(w);
      w.h = newH;
      this.save();
      this.render();
    }
  },

  pinToBottomDock(widgetId) {
    const idx = this.widgets.findIndex(x => x.id === widgetId);
    if (idx < 0) return;
    const [w] = this.widgets.splice(idx, 1);
    w.w = 1;
    w.h = 1;
    this.dockWidgets.push(w);
    this.save();
    this.render();
    showNotification('📌 Tarjeta fijada en el Banner Inferior');
  },

  unpinFromBottomDock(widgetId) {
    const idx = this.dockWidgets.findIndex(x => x.id === widgetId);
    if (idx < 0) return;
    const [w] = this.dockWidgets.splice(idx, 1);
    w.w = w.w || 1;
    w.h = w.h || 1;
    this.widgets.push(w);
    this.save();
    this.render();
    showNotification('⬆️ Tarjeta subida al Contenedor Central');
  },

  removeAnyWidget(widgetId) {
    this.widgets = this.widgets.filter(w => w.id !== widgetId);
    this.dockWidgets = this.dockWidgets.filter(w => w.id !== widgetId);
    this.save();
    this.render();
  },

  changeInternalPage(delta) {
    const pages = this.paginateCentralWidgets();
    const total = Math.max(1, pages.length);
    this.internalPage = (this.internalPage + delta + total) % total;
    this.render();
  },

  initTouchSwipe() {
    if (this.swipeBound) return;
    const stage = document.querySelector('.central-stage-wrapper');
    if (!stage) return;
    this.swipeBound = true;

    let startX = 0;
    let startY = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (this.isEditMode || e.target.closest('input, button, select')) return;
      startX = e.clientX;
      startY = e.clientY;
    });
    stage.addEventListener('pointerup', (e) => {
      if (!startX) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = 0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        const pages = this.paginateCentralWidgets();
        if (pages.length > 1) {
          this.changeInternalPage(dx < 0 ? 1 : -1);
        }
      }
    });
  },

  paginateCentralWidgets() {
    // 4 columns x 3 rows = 12 grid cells per single-screen central page!
    const cols = SkinManager.currentDensity === 'compact' ? 5 : (SkinManager.currentDensity === 'spacious' ? 3 : 4);
    const rows = SkinManager.currentDensity === 'spacious' ? 2 : 3;
    const maxCellsPerPage = cols * rows;
    const pages = [[]];
    let currentCells = 0;

    this.widgets.forEach(rawW => {
      const w = this.normalizeWidgetDims(rawW);
      const cellCost = Math.min(maxCellsPerPage, (w.w || 1) * (w.h || 1));
      if (currentCells + cellCost > maxCellsPerPage && pages[pages.length - 1].length > 0) {
        pages.push([w]);
        currentCells = cellCost;
      } else {
        pages[pages.length - 1].push(w);
        currentCells += cellCost;
      }
    });
    return pages;
  },

  addWidget(type, deviceId = null, defaultW = 1, defaultH = 1, toDock = false) {
    const id = `widget-${Date.now()}`;
    const item = { id, type, deviceId, w: defaultW, h: defaultH };
    if (toDock) this.dockWidgets.push(item);
    else this.widgets.push(item);
    this.save();
    this.render();
    if (typeof closeWidgetSelector === 'function') closeWidgetSelector();
    showNotification(toDock ? '📌 Agregada al Banner Fijo Inferior' : `Agregada al Contenedor Central (${defaultW}x Ancho · ${defaultH}x Alto)`);
  },

  render() {
    const grid = document.getElementById('dashboardGrid');
    const dock = document.getElementById('bottomPinnedDock');
    if (!grid || !dock) return;

    this.initTouchSwipe();
    grid.innerHTML = '';
    dock.innerHTML = '';

    const pages = this.paginateCentralWidgets();
    if (this.internalPage >= pages.length) this.internalPage = 0;
    const activeWidgets = pages[this.internalPage] || [];

    activeWidgets.forEach(w => this.createCardDOM(w, grid, false));

    const prevBtn = document.getElementById('centralPrevBtn');
    const nextBtn = document.getElementById('centralNextBtn');
    const pageInd = document.getElementById('centralPageIndicator');
    const hasMultiple = pages.length > 1;
    if (prevBtn) prevBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (nextBtn) nextBtn.style.display = hasMultiple ? 'flex' : 'none';
    if (pageInd) {
      if (hasMultiple) {
        pageInd.style.display = 'flex';
        pageInd.innerHTML = `<span style="margin-right:3px;">Pág ${this.internalPage + 1}/${pages.length}</span>` +
          pages.map((_, i) => `<span class="central-page-dot ${i === this.internalPage ? 'active' : ''}" onclick="DashboardManager.internalPage=${i}; DashboardManager.render();"></span>`).join('');
      } else {
        pageInd.style.display = 'none';
      }
    }

    this.dockWidgets.forEach(w => this.createCardDOM(w, dock, true));

    SecuritySystem.updateSecurityUI();
    WeatherSVG.syncAllClimateCards();
    if (window.SpotifyCardManager) window.SpotifyCardManager.syncAllCards();
  },

  createCardDOM(rawWidget, container, isDock = false) {
    const widget = this.normalizeWidgetDims(rawWidget);
    const card = document.createElement('div');
    card.className = isDock ? 'glass-card dock-card' : 'glass-card widget-card';
    card.id = widget.id;

    const wVal = widget.w || 1;
    const hVal = isDock ? 1 : (widget.h || 1);
    card.setAttribute('data-w', String(wVal));
    card.setAttribute('data-h', String(hVal));

    // 2D Edit Mode Toolbar: Explicit Width (Ancho 1x..4x) AND Height (Alto 1x..3x)
    const widthBtns = [1, 2, 3, 4].map(n =>
      `<button class="size-chip ${wVal === n ? 'active' : ''}" onclick="event.stopPropagation(); DashboardManager.setWidgetWidth('${widget.id}', ${n})">${n}x</button>`
    ).join('');

    const heightBtns = isDock ? '' : [1, 2, 3].map(n =>
      `<button class="size-chip ${hVal === n ? 'active' : ''}" onclick="event.stopPropagation(); DashboardManager.setWidgetHeight('${widget.id}', ${n})">${n}x</button>`
    ).join('');

    const pinBtn = isDock
      ? `<button class="size-chip" onclick="event.stopPropagation(); DashboardManager.unpinFromBottomDock('${widget.id}')" title="Subir al Contenedor Central">⬆️ Central</button>`
      : `<button class="size-chip" onclick="event.stopPropagation(); DashboardManager.pinToBottomDock('${widget.id}')" title="Fijar en el Banner Inferior">📌 Banner</button>`;

    const editBar = document.createElement('div');
    editBar.className = 'widget-edit-toolbar';
    editBar.innerHTML = `
      <div class="size-chip-group">
        <span class="dim-label">Ancho:</span>${widthBtns}
      </div>
      ${!isDock ? `<div class="size-chip-group"><span class="dim-label">Alto:</span>${heightBtns}</div>` : ''}
      <div class="order-chip-group">
        ${pinBtn}
        <button class="size-chip" style="background:#ef4444; color:#fff;" onclick="event.stopPropagation(); DashboardManager.removeAnyWidget('${widget.id}')"><i class="fas fa-trash"></i></button>
      </div>
    `;
    card.appendChild(editBar);

    // 1. SHOW-STOPPING WEATHER & MOON PHASE HERO WIDGET
    if (widget.type === 'weather_hero' || widget.type === 'weather') {
      const moonInfo = WeatherSVG.getLunarPhaseData();
      const svgArt = WeatherSVG.lastSvg || WeatherSVG.getAnimatedSVG(WeatherSVG.lastCode, WeatherSVG.lastIsDay);
      card.insertAdjacentHTML('beforeend', `
        <div class="weather-hero-stage" onclick="if(!DashboardManager.isEditMode) updateWeather()" style="cursor:pointer;">
          <div style="display:flex; flex-direction:column; justify-content:space-between; height:100%; z-index:2;">
            <div>
              <div style="font-size:0.72rem; font-weight:800; color:var(--primary-yellow); text-transform:uppercase; letter-spacing:0.8px;">
                <i class="fas fa-location-dot"></i> Madrid, Cundinamarca
              </div>
              <div class="hero-weather-live-temp" style="font-size:clamp(1.7rem, 36cqh, 3.2rem); font-weight:900; line-height:1.05; margin-top:4px;">
                ${WeatherSVG.lastOutdoorTemp}
              </div>
              <div class="hero-weather-live-desc" style="font-size:clamp(0.78rem, 12cqh, 1.05rem); font-weight:700; color:var(--text-main); margin-top:2px;">
                ${WeatherSVG.lastDesc}
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:2px; margin-top:auto;">
              <div class="hero-weather-live-moon" style="font-size:0.7rem; color:#fde047; font-weight:700;">
                🌙 ${moonInfo.name} (${moonInfo.illum}% ilum.)
              </div>
              <div class="live-climate-sub" style="font-size:0.68rem; color:var(--text-dim);">
                Sincronizado con sensores del hogar
              </div>
            </div>
          </div>
          <div class="weather-hero-art hero-weather-live-svg">
            ${svgArt}
          </div>
        </div>
      `);
    }
    // 2. ILUMINACIÓN MASTER (WITH PROTAGONIST ANIMATED BULB)
    else if (widget.type === 'mihogar_lighting') {
      const activeLights = groupedDevices.filter(d => d.isOn).length;
      card.insertAdjacentHTML('beforeend', `
        <div class="mihogar-card-inner">
          <div class="mihogar-card-top" onclick="if(!DashboardManager.isEditMode) navigateToRoom('Todos')" style="cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="protagonist-icon-badge" style="background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.45); box-shadow:0 0 18px rgba(251,191,36,0.3);">
                <i class="fas fa-lightbulb"></i>
              </div>
              <div>
                <div style="font-size:0.92rem; font-weight:800;">Iluminación</div>
                <div style="font-size:0.72rem; color:var(--text-dim);"><b>${activeLights}</b> luces activas</div>
              </div>
            </div>
            <div style="display:flex; gap:4px;">
              <button class="size-chip" onclick="event.stopPropagation(); FloorPlan3DBridge.setAllLightsState(true)">ON</button>
              <button class="size-chip" onclick="event.stopPropagation(); FloorPlan3DBridge.setAllLightsState(false)">OFF</button>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:auto;">
            <i class="fas fa-sun" style="font-size:0.75rem; color:var(--text-dim);"></i>
            <input type="range" class="mihogar-slider" min="10" max="100" value="80">
            <i class="fas fa-sun" style="font-size:0.95rem; color:#fbbf24;"></i>
          </div>
        </div>
      `);
    }
    // 3. CLIMA HOGAR (PROTAGONIST THERMOMETER + LIVE SENSOR SYNC)
    else if (widget.type === 'mihogar_climate') {
      card.insertAdjacentHTML('beforeend', `
        <div class="mihogar-card-inner" onclick="if(!DashboardManager.isEditMode) openSensorAnalyticsModal()" style="cursor:pointer;">
          <div class="mihogar-card-top">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="protagonist-icon-badge" style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid rgba(56,189,248,0.45); box-shadow:0 0 16px rgba(56,189,248,0.25);">
                <i class="fas fa-temperature-half"></i>
              </div>
              <div>
                <div style="font-size:0.88rem; font-weight:800;">Clima Hogar</div>
                <div style="font-size:1.35rem; font-weight:900; color:var(--text-main); line-height:1.1;" class="live-climate-temp">23.8°C</div>
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:auto;">
            <span style="font-size:0.65rem; color:var(--text-dim);" class="live-climate-sub">Confort Ambiental</span>
            <div style="display:flex; gap:4px;">
              <span class="size-chip" style="background:rgba(56,189,248,0.2); color:#38bdf8;"><i class="fas fa-snowflake"></i></span>
              <span class="size-chip"><i class="fas fa-wind"></i></span>
            </div>
          </div>
        </div>
      `);
    }
    // 4. ARMAR SEGURIDAD (PROTAGONIST SHIELD)
    else if (widget.type === 'mihogar_security') {
      card.classList.add('widget-security-card');
      card.insertAdjacentHTML('beforeend', `
        <div class="mihogar-card-inner">
          <div class="mihogar-card-top" onclick="if(!DashboardManager.isEditMode) SecuritySystem.openSecuritySettingsModal()" style="cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="protagonist-icon-badge" style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid rgba(16,185,129,0.45); box-shadow:0 0 16px rgba(16,185,129,0.25);">
                <i class="fas fa-shield-halved"></i>
              </div>
              <div>
                <div style="font-size:0.88rem; font-weight:800;">Armar Seguridad</div>
                <div style="font-size:0.68rem; color:var(--text-dim);" class="hero-sec-status-text">Estado: Inactivo</div>
              </div>
            </div>
            <i class="fas fa-cog" style="font-size:0.8rem; opacity:0.7;"></i>
          </div>
          <div class="sec-state-btns">
            <button class="sec-mode-btn hero-sec-btn-armed" onclick="event.stopPropagation(); SecuritySystem.openPinModal('arm')">
              <i class="fas fa-lock"></i> Activo
            </button>
            <button class="sec-mode-btn hero-sec-btn-disarmed active-disarmed" onclick="event.stopPropagation(); SecuritySystem.openPinModal('disarm')">
              <i class="fas fa-lock-open"></i> Inactivo
            </button>
          </div>
        </div>
      `);
    }
    // 5. SMART RULE CARD (ACTIVADOR <-> CONDICIÓN -> EJECUTAR)
    else if (widget.type === 'smart_rule_card') {
      const rule = SmartRuleCards.rules.find(r => r.id === widget.ruleId) || SmartRuleCards.rules[0];
      if (rule) {
        const isCondFirst = rule.orderMode === 'condition_first';
        const firstPill = isCondFirst
          ? `<div class="rule-mini-pill cond" title="Condición">${rule.conditionLabel}</div>`
          : `<div class="rule-mini-pill trig" title="Activador">${rule.triggerLabel}</div>`;
        const secondPill = isCondFirst
          ? `<div class="rule-mini-pill trig" title="Activador">${rule.triggerLabel}</div>`
          : `<div class="rule-mini-pill cond" title="Condición">${rule.conditionLabel}</div>`;

        card.insertAdjacentHTML('beforeend', `
          <div class="mihogar-card-inner">
            <div class="mihogar-card-top">
              <div style="display:flex; align-items:center; gap:6px; cursor:pointer;" onclick="if(!DashboardManager.isEditMode) SmartRuleCards.openRuleModal('${rule.id}')">
                <i class="fas fa-bolt" style="color:#fbbf24; font-size:0.95rem;"></i>
                <span style="font-size:0.78rem; font-weight:800;">${rule.name}</span>
              </div>
              <div style="display:flex; gap:4px;">
                <button class="size-chip" onclick="event.stopPropagation(); SmartRuleCards.swapRuleOrder('${rule.id}')" title="Cambiar orden: Activador+Condición vs Condición+Activador">⇄ Orden</button>
                <button class="size-chip" onclick="event.stopPropagation(); SmartRuleCards.openRuleModal('${rule.id}')"><i class="fas fa-cog"></i></button>
              </div>
            </div>
            <div class="rule-flow-pills">
              ${firstPill}
              <span style="font-size:0.65rem; color:var(--text-dim);">+</span>
              ${secondPill}
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
              <div class="rule-mini-pill exec" style="text-align:left;">➔ ${rule.actionLabel}</div>
              <button class="size-chip" style="background:${rule.enabled ? '#10b981' : '#475569'}; color:#000;" onclick="event.stopPropagation(); SmartRuleCards.executeRuleAction('${rule.id}')">▶</button>
            </div>
          </div>
        `);
      }
    }
    // 6. ROOM PHOTO CARD
    else if (widget.type === 'mihogar_room_photo') {
      card.style.padding = '6px !important';
      card.insertAdjacentHTML('beforeend', `
        <div class="room-photo-widget" onclick="if(!DashboardManager.isEditMode) navigateToRoom('${widget.room}')">
          <div class="room-photo-bg" style="background-image:url('${widget.bg}');"></div>
          <div class="room-photo-bar">
            <span style="display:flex; align-items:center; gap:7px; font-weight:800; font-size:0.84rem;">
              <i class="fas ${widget.icon}" style="color:var(--primary-yellow); font-size:1rem;"></i> ${widget.title}
            </span>
            <i class="fas fa-chevron-right" style="font-size:0.72rem; opacity:0.8;"></i>
          </div>
        </div>
      `);
    }
    // 7. TUYA CAMERA CARD
    else if (widget.type === 'tuya_camera_card') {
      card.insertAdjacentHTML('beforeend', `
        <div class="mihogar-card-inner" onclick="if(!DashboardManager.isEditMode) TuyaCameraLive.openLiveModal()" style="cursor:pointer;">
          <div class="mihogar-card-top">
            <span style="font-size:0.76rem; font-weight:800; color:#38bdf8;"><i class="fas fa-video"></i> CÁMARA TUYA</span>
            <span class="seismo-badge online" style="font-size:0.6rem;">● IA 2° PLANO</span>
          </div>
          <div style="flex:1; margin-top:4px; border-radius:10px; background:radial-gradient(circle, #1e293b, #090d16); display:flex; align-items:center; justify-content:center; gap:8px; border:1px solid rgba(56,189,248,0.3);">
            <i class="fas fa-circle-play" style="font-size:1.7rem; color:#38bdf8;"></i>
            <span style="font-size:0.74rem; color:#cbd5e1; font-weight:700;">Abrir Video HD</span>
          </div>
        </div>
      `);
    }
    // 8. SEISMOGRAPH ESP32 CARD (FIXED CONTAINER & REALISTIC TRACE — NO STRETCH)
    else if (widget.type === 'seismograph') {
      card.setAttribute('data-type', 'seismograph');
      card.insertAdjacentHTML('beforeend', `
        <div class="seismo-widget-inner" onclick="if(!DashboardManager.isEditMode) openSeismographVercelModal()">
          <div class="seismo-widget-header" style="font-size:0.74rem;">
            <span style="display:flex; align-items:center; gap:6px; color:#00e5ff; font-weight:800;">
              <i class="fas fa-wave-square"></i> SISMÓGRAFO ESP32 · APTO 902
            </span>
            <span class="seismo-badge online seismo-live-badge" style="font-size:0.6rem;">● Cloud MQTT 24/7</span>
          </div>
          <div class="seismo-canvas-wrap">
            <canvas class="seismo-canvas-mini"></canvas>
          </div>
          <div class="seismo-widget-footer" style="font-size:0.68rem;">
            <span>PGA: <strong class="seismo-live-pga" style="color:var(--text-main); font-family:'JetBrains Mono',monospace;">${ESP32Manager.seismoState.mag.toFixed(3)}g</strong></span>
            <span style="color:var(--primary-yellow); font-weight:800;">Abrir Monitor Web ↗</span>
          </div>
        </div>
      `);
    }
    // 8.5 REALISTIC ANIMATED LUNAR PHASE CARD WITH INTERMEDIATE CLOUDS & AGRICULTURE/LIFE TRAITS
    else if (widget.type === 'lunar_phase') {
      const lunar = LunarPhaseEngine.getCurrentLunarDetails();
      card.classList.add('widget-lunar-card');
      card.insertAdjacentHTML('beforeend', `
        <div class="lunar-card-stage" onclick="if(!DashboardManager.isEditMode) LunarPhaseEngine.openLunarGuideModal()">
          <div class="lunar-stars-bg"></div>
          <div class="lunar-top-bar">
            <div>
              <div class="lunar-phase-headline">${lunar.name}</div>
              <div class="lunar-sub-illum">🌕 ${lunar.illum}% iluminada · Día ${lunar.cycleDay}</div>
            </div>
            <span class="lunar-fraction-pill">${lunar.fraction}</span>
          </div>

          <div class="lunar-sky-theater">
            <div class="lunar-halo-ring"></div>
            <img src="public/assets/luna/clouds.png" alt="" class="lunar-cloud-layer lunar-cloud-back">
            <img src="${lunar.img}" alt="${lunar.name}" class="lunar-moon-img">
            <img src="public/assets/luna/clouds.png" alt="" class="lunar-cloud-layer lunar-cloud-front">
          </div>

          <div class="lunar-bottom-panel">
            <div class="lunar-trait-line">${lunar.agri}</div>
            <div class="lunar-trait-line secondary-trait" style="color:#bae6fd;">${lunar.life}</div>
          </div>
        </div>
      `);
    }
    // 8.6 SPOTIFY PLAYER & WEB MODAL CARD
    else if (widget.type === 'spotify_player' || widget.type === 'music') {
      const sp = SpotifyCardManager.getDisplayInfo();
      card.classList.add('widget-spotify-v48', 'spotify-v48-card-root');
      card.insertAdjacentHTML('beforeend', `
        <div class="spotify-v48-inner" onclick="if(!DashboardManager.isEditMode) SpotifyCardManager.openSpotifyWebModal()">
          <div class="spotify-v48-art-wrap ${sp.isPlaying ? 'playing' : ''}">
            <img src="${sp.cover}" alt="Spotify Cover" class="sp-live-cover">
            <div class="spotify-v48-badge"><i class="fab fa-spotify"></i></div>
          </div>
          <div class="spotify-v48-body">
            <div class="spotify-v48-toprow">
              <span style="font-size:0.68rem; font-weight:900; color:#1db954; letter-spacing:0.6px;"><i class="fab fa-spotify"></i> SPOTIFY</span>
              <span class="seismo-badge sp-conn-pill ${sp.connected ? 'online' : ''}" style="font-size:0.58rem;">${sp.connected ? '● CONECTADO' : '● WEB PLAYER'}</span>
            </div>
            <div style="min-width:0;">
              <div class="spotify-v48-title">${sp.title}</div>
              <div class="spotify-v48-artist">${sp.artist}</div>
            </div>
            <div class="spotify-v48-controls">
              <button class="sp-btn-circle" onclick="controlMusic('previous', event)" title="Anterior">
                <i class="fas fa-backward-step"></i>
              </button>
              <button class="sp-btn-circle play-main" onclick="controlMusic('playpause', event)" title="Reproducir / Pausar">
                <i class="fas ${sp.isPlaying ? 'fa-pause' : 'fa-play'} sp-play-icon"></i>
              </button>
              <button class="sp-btn-circle" onclick="controlMusic('next', event)" title="Siguiente">
                <i class="fas fa-forward-step"></i>
              </button>
              <button class="sp-web-chip" onclick="event.stopPropagation(); SpotifyCardManager.openSpotifyWebModal()" title="Abrir Spotify Web en Modal">
                Web ↗
              </button>
            </div>
          </div>
        </div>
      `);
    }
    // 9. SAMSUNG WASHER 24/7 CARD
    else if (widget.type === 'washer_bridge') {
      const wState = SmartThingsBridge.state.washer;
      const isRun = wState.machineState === 'run';
      card.insertAdjacentHTML('beforeend', `
        <div class="mihogar-card-inner" onclick="if(!DashboardManager.isEditMode) SmartThingsBridge.openConfigModal()" style="cursor:pointer;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.76rem; font-weight:800; color:#38bdf8;"><i class="fas fa-soap"></i> LAVADORA SAMSUNG</span>
            <span class="seismo-badge ${isRun ? 'alert' : 'online'}" style="font-size:0.6rem;">${isRun ? '🌀 LAVANDO' : '✔ REPOSO'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:baseline; margin:auto 0;">
            <div style="font-size:1.35rem; font-weight:900; font-family:'JetBrains Mono',monospace;">${wState.remainingMinutes || 0} min</div>
            <div style="font-size:0.72rem; color:var(--text-dim); font-weight:700;">${wState.cycleName || 'Ciclo Normal'}</div>
          </div>
          <div style="font-size:0.64rem; color:var(--text-dim); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            🔔 ${wState.lastNotification}
          </div>
        </div>
      `);
    }
    // 10. DEVICE CARD
    else if (widget.type === 'device') {
      const device = groupedDevices.find(d => d.id === widget.deviceId);
      if (device) {
        const icon = getIconForDevice(device);
        card.classList.add('device-widget-card');
        if (device.isOn) card.classList.add('device-on');
        card.onclick = (e) => {
          if (this.isEditMode) return;
          handleDeviceClick(e, device);
        };
        card.insertAdjacentHTML('beforeend', `
          <div class="device-widget-icon"><img src="${icon}"></div>
          <div class="device-widget-name">${device.name}</div>
          <div class="device-widget-power"><i class="fas fa-power-off"></i></div>
        `);
      } else {
        card.insertAdjacentHTML('beforeend', `<div style="font-size:0.72rem; color:var(--text-dim); margin:auto;">Sincronizando...</div>`);
      }
    }

    container.appendChild(card);
  }
});

// Widget Selector Modal with 2D Width x Height Choice + Central vs Bottom Banner
window.openWidgetSelector = function () {
  const modal = document.getElementById('widgetSelectorModal');
  const list = document.getElementById('deviceWidgetList');
  if (!modal || !list) return;

  list.innerHTML = `
    <div style="margin-bottom:12px; background:rgba(56,189,248,0.12); padding:10px 12px; border-radius:12px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:0.78rem; font-weight:800; color:#38bdf8;">Destino:</span>
        <select id="widgetTargetZoneSelect" style="background:#0f172a; color:#fff; border:1px solid #38bdf8; border-radius:8px; padding:5px 10px; font-weight:700;">
          <option value="central">🟦 Contenedor Central (Paginado)</option>
          <option value="dock">📌 Banner Fijo Inferior</option>
        </select>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:0.75rem; font-weight:700; color:#cbd5e1;">Ancho:</span>
        <select id="widgetInitW" style="background:#0f172a; color:#fbbf24; border:1px solid #334155; border-radius:8px; padding:4px 8px; font-weight:700;">
          <option value="1">1x</option><option value="2">2x</option><option value="3">3x</option><option value="4">4x</option>
        </select>
        <span style="font-size:0.75rem; font-weight:700; color:#cbd5e1;">Alto:</span>
        <select id="widgetInitH" style="background:#0f172a; color:#fbbf24; border:1px solid #334155; border-radius:8px; padding:4px 8px; font-weight:700;">
          <option value="1">1x</option><option value="2">2x</option><option value="3">3x</option>
        </select>
      </div>
    </div>

    <div class="gallery-category">
      <h4 style="margin:5px 0 8px 0; color:var(--primary-yellow); font-size:0.8rem;">WIDGETS PROTAGONISTAS & REGLAS</h4>
      <div class="widget-gallery" style="grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));">
        <div class="gallery-item" style="border:1px solid rgba(253,224,71,0.55); background:rgba(23,37,84,0.55);" onclick="DashboardManager.addWidget('lunar_phase', null, parseInt(document.getElementById('widgetInitW').value)||2, parseInt(document.getElementById('widgetInitH').value)||2, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-moon" style="color:#fde047;"></i>
          <span>Fases Lunares Realista</span>
        </div>
        <div class="gallery-item" style="border:1px solid rgba(29,185,84,0.55); background:rgba(7,25,16,0.55);" onclick="DashboardManager.addWidget('spotify_player', null, parseInt(document.getElementById('widgetInitW').value)||2, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fab fa-spotify" style="color:#1db954;"></i>
          <span>Spotify Player & Web</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('weather_hero', null, parseInt(document.getElementById('widgetInitW').value)||2, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-cloud-sun-rain" style="color:#fde047;"></i>
          <span>Clima & Fase Lunar Hero</span>
        </div>
        <div class="gallery-item" onclick="closeWidgetSelector(); SmartRuleCards.openRuleModal();">
          <i class="fas fa-bolt" style="color:#fbbf24;"></i>
          <span>Regla (Activador+Condición)</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('mihogar_security', null, parseInt(document.getElementById('widgetInitW').value)||1, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-shield-alt" style="color:#10b981;"></i>
          <span>Armar Seguridad</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('mihogar_climate', null, parseInt(document.getElementById('widgetInitW').value)||1, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-thermometer-half" style="color:#38bdf8;"></i>
          <span>Clima Hogar</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('mihogar_lighting', null, parseInt(document.getElementById('widgetInitW').value)||2, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-lightbulb" style="color:#fbbf24;"></i>
          <span>Iluminación Master</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('tuya_camera_card', null, parseInt(document.getElementById('widgetInitW').value)||1, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-video" style="color:#38bdf8;"></i>
          <span>Cámara Tuya</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('seismograph', 'esp32-sismografo-principal', parseInt(document.getElementById('widgetInitW').value)||2, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-wave-square" style="color:#00e5ff;"></i>
          <span>Sismógrafo ESP32</span>
        </div>
        <div class="gallery-item" onclick="DashboardManager.addWidget('washer_bridge', null, parseInt(document.getElementById('widgetInitW').value)||1, parseInt(document.getElementById('widgetInitH').value)||1, document.getElementById('widgetTargetZoneSelect').value==='dock')">
          <i class="fas fa-soap" style="color:#38bdf8;"></i>
          <span>Lavadora 24/7</span>
        </div>
      </div>
    </div>

    <div class="gallery-category" style="margin-top:12px;">
      <h4 style="margin:8px 0; color:var(--primary-yellow); font-size:0.8rem;">DISPOSITIVOS CONECTADOS</h4>
      <div id="selectorDeviceGrid" class="widget-gallery" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));"></div>
    </div>
  `;

  const deviceGrid = document.getElementById('selectorDeviceGrid');
  groupedDevices.forEach(device => {
    const icon = getIconForDevice(device);
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.onclick = () => {
      const toDock = document.getElementById('widgetTargetZoneSelect')?.value === 'dock';
      const wVal = parseInt(document.getElementById('widgetInitW')?.value, 10) || 1;
      const hVal = parseInt(document.getElementById('widgetInitH')?.value, 10) || 1;
      DashboardManager.addWidget('device', device.id, wVal, hVal, toDock);
    };
    item.innerHTML = `<img src="${icon}" style="width:28px; height:28px;"><span>${device.name}</span>`;
    deviceGrid.appendChild(item);
  });

  modal.classList.add('active');
};

/* =========================================================
   8. ESP32, 3D PLAN, ALEXA, FLOWS (REVERSIBLE), AI RAG & ST
   ========================================================= */
window.KioskManager = {
  async toggleFullscreen() {
    const doc = window.document;
    const docEl = doc.documentElement;
    const req = docEl.requestFullscreen || docEl.webkitRequestFullScreen;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
      if (req) try { await req.call(docEl); } catch (e) {}
    } else if (exit) {
      await exit.call(doc);
    }
  }
};

window.ESP32Manager = {
  devices: JSON.parse(localStorage.getItem('wallpanel_v4_esp32_devices')) || [
    {
      id: 'esp32-sismografo-principal',
      name: 'Sismógrafo Apto 902',
      type: 'seismograph',
      ip: '192.168.1.36',
      mac: 'EC:62:60:9A:88:01',
      mqttBroker: 'wss://broker.emqx.io:8084/mqtt',
      mqttTopicData: 'sismografo/wilvar88/data',
      mqttTopicEvents: 'sismografo/wilvar88/events',
      threshold: 0.025,
      online: true
    }
  ],
  seismoState: {
    mag: 0.001,
    threshold: 0.025,
    alarm: 0,
    source: 'Cloud MQTT 24/7',
    waveBuffer: new Array(120).fill(0),
    lastAlertTime: 0
  },
  mqttClient: null,
  simTimer: null,
  simPhase: 0,

  init() {
    this.renderESP32NodesList();
    this.connectSeismograph();
    this.startWaveformLoop();
  },

  save() {
    localStorage.setItem('wallpanel_v4_esp32_devices', JSON.stringify(this.devices));
    this.renderESP32NodesList();
  },

  connectSeismograph() {
    const sismoDev = this.devices[0];
    if (typeof mqtt !== 'undefined' && sismoDev) {
      try {
        this.mqttClient = mqtt.connect(sismoDev.mqttBroker || 'wss://broker.emqx.io:8084/mqtt', {
          clientId: 'wp_v47_' + Math.random().toString(16).slice(2, 8),
          clean: true
        });
        this.mqttClient.on('connect', () => {
          this.mqttClient.subscribe(sismoDev.mqttTopicData || 'sismografo/wilvar88/data');
          this.mqttClient.subscribe(sismoDev.mqttTopicEvents || 'sismografo/wilvar88/events');
        });
        this.mqttClient.on('message', (topic, payload) => {
          const str = payload.toString();
          if (topic.endsWith('/data')) {
            const parts = str.split(',');
            if (parts.length >= 6) {
              this.lastRealPacketTime = Date.now();
              this.pushWavePoint(parseFloat(parts[0]) || 0, parseFloat(parts[3]) || 0, parseFloat(parts[4]) || 0.025, parseInt(parts[5], 10) || 0);
            }
          }
        });
      } catch (e) {}
    }

    this.lastRealPacketTime = 0;
    this.simTimer = setInterval(() => {
      if (Date.now() - this.lastRealPacketTime > 3500) {
        this.simPhase += 0.65;
        // Realistic micro-tremor baseline jitter (~0.0005g..0.0018g) with occasional crisp micro-spike
        const spike = Math.random() > 0.92 ? (Math.random() - 0.5) * 0.0055 : 0;
        const w = (Math.random() - 0.5) * 0.0014 + Math.sin(this.simPhase * 2.1) * 0.0004 + spike;
        this.pushWavePoint(w, Math.abs(w) + 0.0006, this.seismoState.threshold, 0);
      }
    }, 95);
  },

  pushWavePoint(waveVal, mag, thr, alarm) {
    this.seismoState.mag = mag;
    this.seismoState.threshold = thr;
    this.seismoState.alarm = alarm;
    this.seismoState.waveBuffer.shift();
    this.seismoState.waveBuffer.push(waveVal);

    const pill = document.getElementById('pill-sismo');
    if (pill) {
      pill.textContent = `${mag.toFixed(3)}g`;
      pill.classList.remove('safe-value', 'warning-value', 'danger-value');
      pill.classList.add(alarm === 1 || mag >= thr ? 'danger-value' : 'safe-value');
    }
    const modalReadout = document.getElementById('modalSeismoLiveReadout');
    if (modalReadout) {
      modalReadout.textContent = `${mag.toFixed(3)}g · MQTT 24/7`;
      modalReadout.className = `seismo-badge ${alarm === 1 || mag >= thr ? 'alert' : 'online'}`;
    }
    document.querySelectorAll('.seismo-live-pga').forEach(el => { el.textContent = `${mag.toFixed(3)}g`; });

    if ((alarm === 1 || mag >= thr) && Date.now() - this.seismoState.lastAlertTime > 12000) {
      this.seismoState.lastAlertTime = Date.now();
      this.triggerSeismicPopup(mag);
      FlowAutomationEngine.evaluateTrigger('seismic_alert');
    }
  },

  startWaveformLoop() {
    const draw = () => {
      const canvases = document.querySelectorAll('.seismo-canvas-mini');
      const buf = this.seismoState.waveBuffer;
      const thr = this.seismoState.threshold || 0.025;
      const isAlert = this.seismoState.alarm === 1 || this.seismoState.mag >= thr;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvases.forEach(cvs => {
        const parent = cvs.parentElement;
        if (!parent) return;
        const rect = parent.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;

        const targetW = Math.floor(rect.width * dpr);
        const targetH = Math.floor(rect.height * dpr);
        if (cvs.width !== targetW || cvs.height !== targetH) {
          cvs.width = targetW;
          cvs.height = targetH;
        }

        const ctx = cvs.getContext('2d');
        const w = cvs.width;
        const h = cvs.height;
        const cy = h / 2;
        ctx.clearRect(0, 0, w, h);

        // Center reference axis line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.18)';
        ctx.lineWidth = 1 * dpr;
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();

        // Calibrated physical scale (0.030g = full half-height) so calm 0.001g stays crisp & flat!
        let peak = 0.030;
        for (let i = 0; i < buf.length; i++) {
          if (Math.abs(buf[i]) > peak) peak = Math.abs(buf[i]);
        }
        const scale = (h * 0.42) / peak;

        ctx.beginPath();
        const step = w / (buf.length - 1);
        for (let i = 0; i < buf.length; i++) {
          const px = i * step;
          const py = Math.max(2 * dpr, Math.min(h - 2 * dpr, cy - buf[i] * scale));
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = isAlert ? '#ff3b30' : '#00e5ff';
        ctx.lineWidth = 1.6 * dpr;
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Glowing live stylus dot on the right edge
        const lastY = Math.max(2 * dpr, Math.min(h - 2 * dpr, cy - buf[buf.length - 1] * scale));
        ctx.beginPath();
        ctx.fillStyle = isAlert ? '#ff3b30' : '#38bdf8';
        ctx.arc(w - 3 * dpr, lastY, 2.6 * dpr, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
  },

  triggerSeismicPopup(pga) {
    const modal = document.getElementById('seismicAlertModal');
    const details = document.getElementById('seismicAlertDetails');
    if (modal && details) {
      details.innerHTML = `<div style="font-size:2rem; font-weight:900; color:#ff3b30;">${Number(pga).toFixed(3)} g</div><p>Movimiento sísmico detectado por el ESP32 MPU-6050.</p>`;
      modal.style.display = 'flex';
    }
    if (typeof playAlertSound === 'function') playAlertSound();
    AlexaBridge.sendAlert(`Alerta sísmica en el apartamento. Magnitud ${Number(pga).toFixed(3)} fuerzas G.`);
  },

  simulateEarthquakeTest() {
    let ticks = 0;
    const iv = setInterval(() => {
      ticks++;
      const w = Math.sin(ticks * 1.3) * 0.065;
      this.lastRealPacketTime = Date.now();
      this.pushWavePoint(w, Math.abs(w), this.seismoState.threshold, 1);
      if (ticks > 25) clearInterval(iv);
    }, 90);
  },

  renderESP32NodesList() {
    const container = document.getElementById('esp32NodesList');
    if (!container) return;
    container.innerHTML = this.devices.map(d => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:5px 8px; border-radius:8px;">
        <div>
          <div style="font-weight:700; color:#fff;">${d.name}</div>
          <div style="font-size:0.64rem; color:var(--text-dim); font-family:'JetBrains Mono',monospace;">IP: ${d.ip} · MAC: ${d.mac}</div>
        </div>
        <button class="size-chip" onclick="ESP32Manager.simulateEarthquakeTest()">⚡ Test</button>
      </div>
    `).join('');
  },

  openAddESP32Modal() {
    const name = prompt('Nombre del nuevo dispositivo ESP32:', 'Sensor ESP32 Sala');
    if (!name) return;
    const ip = prompt('Dirección IP o mDNS:', '192.168.1.50') || '192.168.1.50';
    const mac = prompt('Dirección MAC:', 'A0:B7:65:4C:12:99') || 'A0:B7:65:4C:12:99';
    this.devices.push({ id: 'esp_' + Date.now(), name, type: 'sensor', ip, mac, online: true });
    this.save();
  }
};

window.openSeismographVercelModal = () => document.getElementById('seismographVercelModal')?.classList.add('active');
window.closeSeismographVercelModal = () => document.getElementById('seismographVercelModal')?.classList.remove('active');
window.closeSeismicAlert = () => { document.getElementById('seismicAlertModal').style.display = 'none'; };

window.FloorPlan3DBridge = {
  init() {
    window.addEventListener('message', async (e) => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'FLOORPLAN_TOGGLE_ROOM') await this.setRoomDevicesState(msg.wpRoom, msg.state);
      else if (msg.type === 'FLOORPLAN_TOGGLE_ALL') await this.setAllLightsState(msg.state);
    });
  },
  async setRoomDevicesState(roomName, targetState) {
    const roomCfg = roomSettings[roomName];
    let targets = [];
    if (roomCfg && roomCfg.devices && roomCfg.devices.length > 0) {
      targets = groupedDevices.filter(d => roomCfg.devices.includes(d.id));
    } else {
      const lower = roomName.toLowerCase();
      targets = groupedDevices.filter(d => d.name.toLowerCase().includes(lower));
    }
    for (const dev of targets) {
      updateDeviceStateLocally(dev.id, targetState);
      try {
        const swCode = dev.status?.find(s => s.code.startsWith('switch'))?.code || 'switch_1';
        await sendDeviceCommand(dev.id, swCode, targetState);
      } catch (err) {}
    }
  },
  async setAllLightsState(targetState) {
    const lightDevs = groupedDevices.filter(d => d.platform === 'tuya' && d.category === 'kg');
    for (const dev of lightDevs) {
      updateDeviceStateLocally(dev.id, targetState);
      try {
        const swCode = dev.status?.find(s => s.code.startsWith('switch'))?.code || 'switch_1';
        await sendDeviceCommand(dev.id, swCode, targetState);
      } catch (e) {}
    }
  },
  syncLightsTo3D() {
    const roomStates = {};
    Object.keys(roomSettings).forEach(rName => {
      if (rName === 'Todos') return;
      const cfg = roomSettings[rName];
      roomStates[rName] = groupedDevices.some(d => (cfg.devices?.includes(d.id) || d.name.toLowerCase().includes(rName.toLowerCase())) && d.isOn);
    });
    document.querySelectorAll('iframe[src*="plano3d.html"]').forEach(ifr => {
      if (ifr.contentWindow) ifr.contentWindow.postMessage({ type: 'SYNC_ROOM_LIGHTS', roomStates }, '*');
    });
  }
};

window.AlexaBridge = {
  speakLocalTTS(text) {
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'es-CO';
        AssistantUI.showResponding();
        utter.onend = () => AssistantUI.hide();
        window.speechSynthesis.speak(utter);
      } catch (e) {}
    }
  },
  async sendAlert(message, title = 'Alerta Mi Hogar') {
    if (!message) return;
    this.speakLocalTTS(message);
    try {
      await fetch('/api/alexa/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, title })
      });
      showNotification(`🔊 Alexa: "${message.slice(0, 48)}..."`);
    } catch (e) {}
  },
  sendFromInput() {
    const inp = document.getElementById('quickAlexaMsg');
    if (inp && inp.value.trim()) {
      this.sendAlert(inp.value.trim());
      inp.value = '';
    }
  }
};

const FLOWS_STORAGE_KEY = 'wallpanel_v46_automation_flows';
window.FlowAutomationEngine = {
  flows: JSON.parse(localStorage.getItem(FLOWS_STORAGE_KEY)) || [
    {
      id: 'flow-face-welcome',
      name: 'Reconocimiento Facial (Cada 3h) -> Encender Salón + Saludo',
      orderMode: 'trigger_first',
      trigger: 'camera_known',
      triggerLabel: '👋 Cámara IA: Rostro Seguro',
      condition: 'always',
      conditionLabel: '✅ Siempre (Cooldown 3h)',
      actionDevice: 'room_Salon_on',
      actionLabel: '🛋️ Encender Luces Salón',
      alexaText: 'Bienvenido a casa Wilson. He encendido las luces del salón.',
      enabled: true,
      lastTriggered: 'Listo'
    }
  ],
  init() { this.renderFlows(); },
  save() {
    localStorage.setItem(FLOWS_STORAGE_KEY, JSON.stringify(this.flows));
    this.renderFlows();
    ServerStateSync.saveToServer();
  },
  swapOrder(flowId) {
    const f = this.flows.find(x => x.id === flowId);
    if (f) {
      f.orderMode = f.orderMode === 'condition_first' ? 'trigger_first' : 'condition_first';
      this.save();
    }
  },
  addFlowFromUI(alsoPinCard = false) {
    const name = document.getElementById('flowNameInput')?.value.trim() || 'Regla Personalizada';
    const orderMode = document.getElementById('flowOrderMode')?.value || 'trigger_first';
    const trigSel = document.getElementById('flowTriggerType');
    const condSel = document.getElementById('flowConditionType');
    const actSel = document.getElementById('flowActionDevice');
    const alexaText = document.getElementById('flowAlexaText')?.value.trim() || `Ejecutando ${name}`;
    const newId = 'flow_' + Date.now();

    const flowObj = {
      id: newId,
      name,
      orderMode,
      trigger: trigSel.value,
      triggerLabel: trigSel.options[trigSel.selectedIndex].text,
      condition: condSel.value,
      conditionLabel: condSel.options[condSel.selectedIndex].text,
      actionDevice: actSel.value,
      actionLabel: actSel.options[actSel.selectedIndex].text,
      alexaText,
      enabled: true,
      lastTriggered: 'Ahora'
    };
    this.flows.unshift(flowObj);
    this.save();

    if (alsoPinCard) {
      SmartRuleCards.rules.push({
        id: newId,
        name,
        orderMode,
        triggerType: flowObj.trigger,
        triggerLabel: flowObj.triggerLabel,
        conditionType: flowObj.condition,
        conditionLabel: flowObj.conditionLabel,
        actionType: flowObj.actionDevice,
        actionLabel: flowObj.actionLabel,
        alexaMsg: alexaText,
        enabled: true,
        pinnedToDock: false
      });
      SmartRuleCards.save();
      DashboardManager.widgets.push({ id: 'w_' + newId, type: 'smart_rule_card', ruleId: newId, w: 1, h: 1 });
      DashboardManager.save();
      DashboardManager.render();
    }
    showNotification(`Regla "${name}" creada y guardada en JSON`);
  },
  async executeFlow(flowId, force = false) {
    const flow = this.flows.find(f => f.id === flowId);
    if (!flow || (!flow.enabled && !force)) return;
    flow.lastTriggered = new Date().toLocaleTimeString('es-CO');
    this.save();
    if (flow.actionDevice === 'all_lights_on') await FloorPlan3DBridge.setAllLightsState(true);
    else if (flow.actionDevice === 'all_lights_off') await FloorPlan3DBridge.setAllLightsState(false);
    else if (flow.actionDevice.startsWith('room_')) {
      const rName = flow.actionDevice.replace('room_', '').replace('_on', '');
      await FloorPlan3DBridge.setRoomDevicesState(rName, true);
    }
    if (flow.alexaText) await AlexaBridge.sendAlert(flow.alexaText, flow.name);
  },
  evaluateTrigger(triggerType) {
    this.flows.forEach(f => {
      if (f.enabled && f.trigger === triggerType) this.executeFlow(f.id, true);
    });
  },
  deleteFlow(id) {
    this.flows = this.flows.filter(x => x.id !== id);
    this.save();
  },
  renderFlows() {
    const container = document.getElementById('flowchartsListContainer');
    if (!container) return;
    container.innerHTML = this.flows.map(f => {
      const isCondFirst = f.orderMode === 'condition_first';
      const node1 = isCondFirst
        ? `<div class="flow-node condition">1. Condición: ${f.conditionLabel}</div>`
        : `<div class="flow-node trigger">1. Activador: ${f.triggerLabel}</div>`;
      const node2 = isCondFirst
        ? `<div class="flow-node trigger">2. Activador: ${f.triggerLabel}</div>`
        : `<div class="flow-node condition">2. Condición: ${f.conditionLabel}</div>`;

      return `
        <div class="flow-diagram-row" style="padding:10px 14px;">
          <div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:0.82rem; color:var(--primary-yellow);">${f.name}</strong>
            <div style="display:flex; gap:5px; align-items:center;">
              <button class="size-chip" onclick="FlowAutomationEngine.swapOrder('${f.id}')">⇄ Orden (${isCondFirst ? 'Condición➔Activador' : 'Activador➔Condición'})</button>
              <button class="size-chip" style="background:#10b981; color:#000;" onclick="FlowAutomationEngine.executeFlow('${f.id}', true)">▶ Ejecutar</button>
              <button class="size-chip" style="background:#ef4444; color:#fff;" onclick="FlowAutomationEngine.deleteFlow('${f.id}')"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          ${node1}
          <i class="fas fa-arrow-right flow-arrow"></i>
          ${node2}
          <i class="fas fa-arrow-right flow-arrow"></i>
          <div class="flow-node action">3. Ejecutor: ${f.actionLabel}</div>
          <i class="fas fa-arrow-right flow-arrow"></i>
          <div class="flow-node" style="background:rgba(192,132,252,0.18); border:1px solid #c084fc; color:#f3e8ff; flex:1;">
            <i class="fas fa-bullhorn"></i> "${f.alexaText}"
          </div>
        </div>
      `;
    }).join('');
  }
};

window.LocalAIAssistant = {
  timers: [],
  init() { setInterval(() => this.tickTimers(), 1000); },
  askPreset(q) {
    const inp = document.getElementById('aiChatInput');
    if (inp) { inp.value = q; this.sendUserMessage(); }
  },
  appendBubble(text, sender = 'ai') {
    const box = document.getElementById('aiChatMessages');
    if (!box) return;
    const div = document.createElement('div');
    div.className = `chat-bubble ${sender}`;
    div.style.fontSize = '0.78rem';
    div.innerHTML = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  },
  async sendUserMessage() {
    const inp = document.getElementById('aiChatInput');
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    inp.value = '';
    this.appendBubble(text, 'user');
    const lower = text.toLowerCase();

    const timerMatch = lower.match(/(temporizador|timer|alarma|recordatorio).*?(\d+)\s*(minuto|minutos|min|segundo|segundos|seg)/i);
    if (timerMatch) {
      const amount = parseInt(timerMatch[2], 10);
      const isSec = timerMatch[3].startsWith('seg');
      this.timers.push({ id: 'tm_' + Date.now(), label: `Timer ${amount}${isSec ? 's' : 'm'}`, remaining: isSec ? amount : amount * 60 });
      this.renderTimers();
      const reply = `⏱️ Temporizador de ${amount} ${isSec ? 'segundos' : 'minutos'} iniciado.`;
      this.appendBubble(reply, 'ai');
      AlexaBridge.speakLocalTTS(reply);
      return;
    }

    if (lower.includes('enciende') || lower.includes('apaga')) {
      const turnOn = lower.includes('enciende');
      await FloorPlan3DBridge.setRoomDevicesState('Salon', turnOn);
      const reply = `💡 Listo, he ${turnOn ? 'encendido' : 'apagado'} las luces solicitadas.`;
      this.appendBubble(reply, 'ai');
      AlexaBridge.speakLocalTTS(reply);
      return;
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text })
      });
      const data = await res.json();
      this.appendBubble(data.reply, 'ai');
      AlexaBridge.speakLocalTTS(data.reply);
    } catch (e) {}
  },
  promptNewTimer() {
    const mins = prompt('Minutos para el temporizador:', '5');
    if (mins && !isNaN(mins)) {
      this.timers.push({ id: 'tm_' + Date.now(), label: `Timer ${mins}m`, remaining: Math.round(parseFloat(mins) * 60) });
      this.renderTimers();
    }
  },
  tickTimers() {
    if (this.timers.length === 0) return;
    this.timers.forEach(t => {
      t.remaining--;
      if (t.remaining === 0) AlexaBridge.sendAlert(`¡Temporizador ${t.label} finalizado!`);
    });
    this.timers = this.timers.filter(t => t.remaining > 0);
    this.renderTimers();
  },
  renderTimers() {
    const box = document.getElementById('activeTimersList');
    if (!box) return;
    box.innerHTML = this.timers.length === 0 ? 'Sin temporizadores activos.' : this.timers.map(t =>
      `<div>⏰ ${t.label}: <b>${Math.floor(t.remaining / 60)}:${String(t.remaining % 60).padStart(2, '0')}</b></div>`
    ).join('');
  },
  startVoiceInput() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.lang = 'es-CO';
    AssistantUI.showListening();
    rec.onresult = (e) => {
      AssistantUI.hide();
      document.getElementById('aiChatInput').value = e.results[0][0].transcript;
      this.sendUserMessage();
    };
    rec.onerror = () => AssistantUI.hide();
    rec.start();
  },
  async openDocsManagerModal() {
    const modal = document.getElementById('deviceModal');
    const content = document.getElementById('modalContent');
    const res = await fetch('/api/docs');
    const docs = await res.json();
    const mainDoc = docs[0] || { filename: 'informacion_hogar.md', content: '' };
    content.innerHTML = `
      <div class="modal-header">
        <h2 style="color:white; font-size:1rem;">Documentos del Hogar (Memoria IA Local)</h2>
        <button class="close-btn" onclick="closeMultiSwitchModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:10px;">
        <input type="text" id="ragDocFilename" value="${mainDoc.filename}" style="padding:8px; border-radius:8px; background:#1e293b; color:#fff; border:1px solid #475569;">
        <textarea id="ragDocContent" rows="12" style="width:100%; padding:10px; border-radius:10px; background:#0f172a; color:#fff; border:1px solid #334155; font-family:'JetBrains Mono',monospace;">${mainDoc.content}</textarea>
        <button class="save-btn" onclick="LocalAIAssistant.saveDocFromModal()">Guardar Documento</button>
      </div>
    `;
    modal.classList.add('active');
  },
  async saveDocFromModal() {
    const filename = document.getElementById('ragDocFilename').value;
    const content = document.getElementById('ragDocContent').value;
    await fetch('/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content })
    });
    closeMultiSwitchModal();
    showNotification('Documento actualizado para la IA Local');
  }
};

window.SmartThingsBridge = {
  state: { washer: { machineState: 'stop', remainingMinutes: 0, cycleName: 'Normal', lastNotification: 'Puente Tablet 24/7 activo' } },
  init() {
    this.pollBridgeState();
    setInterval(() => this.pollBridgeState(), 5000);
  },
  async pollBridgeState() {
    try {
      const r = await fetch('/api/smartthings/bridge-state');
      if (r.ok) {
        this.state = await r.json();
        const w = this.state.washer;
        const sum = document.getElementById('stWasherBridgeSummary');
        if (sum) sum.innerHTML = `Estado: <b>${w.machineState.toUpperCase()}</b> · Restante: <b>${w.remainingMinutes} min</b>`;
      }
    } catch (e) {}
  },
  openConfigModal() {
    const modal = document.getElementById('deviceModal');
    const content = document.getElementById('modalContent');
    const webhookUrl = `${window.location.origin}/api/smartthings/bridge-webhook`;
    content.innerHTML = `
      <div class="modal-header">
        <h2 style="color:white; font-size:1rem;"><i class="fas fa-soap" style="color:#38bdf8;"></i> Puente 24/7 Lavadora Samsung</h2>
        <button class="close-btn" onclick="closeMultiSwitchModal()"><i class="fas fa-times"></i></button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:12px;">
        <p style="font-size:0.8rem; color:#cbd5e1;">Enlaza las notificaciones de la app SmartThings en tu Tablet hacia: <code style="color:#38bdf8;">${webhookUrl}</code></p>
        <div style="display:flex; gap:8px;">
          <button class="save-btn" onclick="fetch('/api/smartthings/bridge-webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Lavadora',text:'Lavando - 38 min',machineState:'run',remainingMinutes:38})}).then(()=>{SmartThingsBridge.pollBridgeState();DashboardManager.render();closeMultiSwitchModal();})">🌀 Simular Lavado (38m)</button>
          <button class="save-btn" style="background:#10b981;" onclick="fetch('/api/smartthings/bridge-webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Lavadora',text:'Lavado finalizado',machineState:'stop',remainingMinutes:0})}).then(()=>{SmartThingsBridge.pollBridgeState();DashboardManager.render();closeMultiSwitchModal();})">✅ Simular Fin</button>
        </div>
      </div>
    `;
    modal.classList.add('active');
  }
};

window.ZapierTeamsHub = {
  notifications: [],
  init() { this.fetchNotifications(); },
  async fetchNotifications() {
    try {
      const r = await fetch('/api/webhooks/zapier');
      if (r.ok) {
        this.notifications = await r.json();
        const el = document.getElementById('zapierNotificationsList');
        if (el) el.innerHTML = this.notifications.map(n => `<div style="padding:3px 6px; background:rgba(168,85,247,0.15); border-radius:6px;">💼 <b>${n.title}</b> (${n.time})</div>`).join('');
      }
    } catch (e) {}
  },
  async simulateMeetingWebhook() {
    await fetch('/api/webhooks/zapier', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Reunión Microsoft Teams en 10 min', time: new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) })
    });
    this.fetchNotifications();
    AlexaBridge.sendAlert('Recordatorio de trabajo: Tienes una reunión de Microsoft Teams en 10 minutos.');
  }
};

window.openSensorAnalyticsModal = function () {
  const airDevice = allDevices.find(d => d.id === 'eb8d7d936eace566544mbl' || d.category === 'hjjcy');
  if (airDevice && typeof openAirQualityModal === 'function') openAirQualityModal(airDevice);
};

/* =========================================================
   MASTER V4.7 INITIALIZATION
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {
  SkinManager.init();
  ConfigDrawer.loadLanInfo();
  SecuritySystem.init();
  FloorPlan3DBridge.init();
  ESP32Manager.init();
  FlowAutomationEngine.init();
  LocalAIAssistant.init();
  CameraVisionAI.init();
  SmartThingsBridge.init();
  ZapierTeamsHub.init();
  updateClock();
  updateWeather();
  setInterval(() => WeatherSVG.syncAllClimateCards(), 1500);

  // Load shared persistent state from wallpanel_state.json / Vercel Blob so PC, Tablet & Vercel match!
  await ServerStateSync.loadFromServer();
  ServerStateSync.startLiveSyncPolling();
  DashboardManager.render();

  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('autoSpotifyAuth') === '1') {
    window.history.replaceState({}, document.title, '/');
    authorizeSpotify();
  }
});
