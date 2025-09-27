(function() {
  const STORAGE_KEY = 'pff_esports_session_v1';

  /** @typedef {{
   *  match_id:string,
   *  player:string,
   *  mode:string,
   *  event:string,
   *  value:number,
   *  video_time:number
   * }} ChipEvent */

  /** @type {{ match:string, matchId:string|null, player:string, mode:string, events:ChipEvent[], youtubeId:string|null, youtubeStartSeconds:number, crop?:string }} */
  const state = {
    match: '',
    matchId: null,
    player: '',
    mode: '',
    events: [],
    youtubeId: null,
    youtubeStartSeconds: 0
  };

  // Elements
  const matchLink = document.getElementById('matchLink');
  const playerSelect = document.getElementById('playerSelect');
  const playersList = document.getElementById('playersList');
  const loadPlayersBtn = document.getElementById('loadPlayersBtn');
  const playersFile = document.getElementById('playersFile');
  const playersHint = document.getElementById('playersHint');
  const modeSelect = document.getElementById('modeSelect');
  const chips = {
    // Good
    goodRoute: document.getElementById('goodRoute'),
    gotSpawns: document.getElementById('gotSpawns'),
    goodTrade: document.getElementById('goodTrade'),
    playedLife: document.getElementById('playedLife'),
    flank: document.getElementById('flank'),
    freeKill: document.getElementById('freeKill'),
    // Bad
    badRoute: document.getElementById('badRoute'),
    lostSpawns: document.getElementById('lostSpawns'),
    badTrade: document.getElementById('badTrade'),
    gaveUpLife: document.getElementById('gaveUpLife'),
    freeDeath: document.getElementById('freeDeath')
  };
  const livesEl = document.getElementById('lives');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const resetBtn = document.getElementById('resetBtn');
  const matchIdDisplay = document.getElementById('matchIdDisplay');
  // YouTube elements
  const youtubeUrl = document.getElementById('youtubeUrl');
  const youtubeHint = document.getElementById('youtubeHint');
  const loadVideoBtn = document.getElementById('loadVideoBtn');
  const youtubeFrame = document.getElementById('youtubeFrame');
  const cropSelect = document.getElementById('cropSelect');
  const videoBox = document.getElementById('videoBox');
  const toggleZoomBtn = document.getElementById('toggleZoomBtn');

  // YouTube API state
  let ytPlayer = null;
  let youTubeApiReady = false;

  // Load session
  loadFromStorage();
  bindEvents();
  renderEvents();
  reflectHeaderInputs();
  updateMatchIdDisplay();
  loadPlayersCsv();
  reflectYouTube();

  function bindEvents() {
    matchLink.addEventListener('input', () => { state.match = matchLink.value.trim(); autoParseMatchId(); persist(); });
    playerSelect.addEventListener('input', () => { state.player = playerSelect.value; persist(); });
    modeSelect.addEventListener('change', () => { state.mode = modeSelect.value; persist(); });

    bindChipEvents();
    exportCsvBtn.addEventListener('click', exportCsv);
    resetBtn.addEventListener('click', resetSession);
    if (loadPlayersBtn && playersFile) {
      loadPlayersBtn.addEventListener('click', function(){ playersFile.click(); });
      playersFile.addEventListener('change', onPlayersFileChosen);
    }
    if (youtubeUrl && loadVideoBtn) {
      youtubeUrl.addEventListener('input', () => setYouTubeFromUrl(youtubeUrl.value));
      loadVideoBtn.addEventListener('click', () => setYouTubeFromUrl(youtubeUrl.value, true));
    }
    if (cropSelect) {
      cropSelect.addEventListener('change', onCropChange);
    }
    if (toggleZoomBtn) {
      toggleZoomBtn.addEventListener('click', onToggleZoom);
    }
  }

  function bindChipEvents() {
    /** @type {Record<string, string>} */
    const keyMap = {
      goodRoute: 'good_route',
      gotSpawns: 'got_spawns',
      goodTrade: 'good_trade',
      playedLife: 'played_life',
      flank: 'flank',
      freeKill: 'free_kill',
      badRoute: 'bad_route',
      lostSpawns: 'lost_spawns',
      badTrade: 'bad_trade',
      gaveUpLife: 'gave_up_life',
      freeDeath: 'free_death'
    };
    Object.entries(chips).forEach(function(entry){
      const key = entry[0];
      const input = entry[1];
      if (!input) return;
      input.addEventListener('change', function(){
        const eventName = keyMap[key] || key;
        // Always record as 1 on press, then reset UI back to unchecked
        logChipEvent(eventName, 1);
        try { input.checked = false; } catch {}
      });
    });
  }

  // Expose API-ready callback for YouTube IFrame API
  try {
    window.onYouTubeIframeAPIReady = function(){
      youTubeApiReady = true;
      createOrUpdateYouTubePlayer();
    };
  } catch {}
  async function loadPlayersCsv() {
    try {
      const res = await fetch('players.csv', { cache: 'no-store' });
      if (!res.ok) throw new Error('not ok');
      const text = await res.text();
      const names = parsePlayersCsv(text);
      populatePlayersDatalist(names);
      setPlayersHint(`Loaded ${names.length} players from players.csv`);
    } catch {
      setPlayersHint('Could not auto-load players.csv. Use "Load Players CSV" to choose a file.');
    }
  }

  function parsePlayersCsv(text) {
    const lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
    if (lines.length === 0) return [];
    const header = lines[0].split(',').map(function(h){ return h.trim().toLowerCase(); });
    const nameIdx = header.indexOf('player_name');
    if (nameIdx === -1) {
      // If header missing, treat each line as a name
      return lines.map(function(l){ return l.split(',')[0]; }).slice(0);
    }
    const names = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const name = (cols[nameIdx] || '').trim();
      if (name) names.push(name);
    }
    // Deduplicate
    return Array.from(new Set(names));
  }

  function populatePlayersDatalist(names) {
    if (!playersList) return;
    playersList.innerHTML = '';
    names.forEach(function(n){
      const opt = document.createElement('option');
      opt.value = n;
      playersList.appendChild(opt);
    });
  }

  function onPlayersFileChosen(evt) {
    const file = evt.target && evt.target.files && evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const text = String(e.target.result || '');
        const names = parsePlayersCsv(text);
        populatePlayersDatalist(names);
        setPlayersHint(`Loaded ${names.length} players from ${file.name}`);
      } catch { setPlayersHint('Failed to read CSV file.'); }
    };
    reader.readAsText(file);
  }

  function setPlayersHint(msg) {
    if (!playersHint) return;
    playersHint.textContent = msg || '';
  }

  function setYouTubeFromUrl(url, withNotify) {
    url = (url || '').trim();
    if (!url) { state.youtubeId = null; state.youtubeStartSeconds = 0; reflectYouTube(); return; }
    const parsed = parseYouTube(url);
    if (!parsed) { if (withNotify && youtubeHint) { youtubeHint.textContent = 'Invalid YouTube URL'; youtubeHint.classList.add('error'); } return; }
    state.youtubeId = parsed.id;
    state.youtubeStartSeconds = parsed.start || 0;
    if (youtubeHint) { youtubeHint.textContent = ''; youtubeHint.classList.remove('error'); }
    persist();
    reflectYouTube();
  }

  function parseYouTube(url) {
    try {
      const u = new URL(url);
      const host = u.hostname;
      const path = u.pathname || '';
      let id = null;
      let start = 0;
      if (host.includes('youtube.com')) {
        if (path.startsWith('/watch')) {
          id = u.searchParams.get('v');
          start = parseStartParam(u.searchParams.get('t') || u.searchParams.get('start'));
        } else if (path.startsWith('/embed/')) {
          id = path.split('/')[2] || null;
          start = parseStartParam(u.searchParams.get('start') || u.searchParams.get('t'));
        } else if (path.startsWith('/live/')) {
          id = path.split('/')[2] || null;
          start = parseStartParam(u.searchParams.get('t') || u.searchParams.get('start'));
        }
      } else if (host === 'youtu.be') {
        id = path.replace(/^\//,'').split('/')[0] || null;
        start = parseStartParam(u.searchParams.get('t'));
      }
      if (!id) return null;
      return { id: id, start: start };
    } catch {
      // Fallback regex parsing
      const idMatch = url.match(/[?&]v=([^&#]+)/) || url.match(/youtu\.be\/([^?&#/]+)/) || url.match(/youtube\.com\/embed\/([^?&#/]+)/) || url.match(/youtube\.com\/live\/([^?&#/]+)/);
      const id = idMatch && idMatch[1] ? idMatch[1] : null;
      const tMatch = url.match(/[?&]t=([^&#]+)/) || url.match(/[?&]start=([^&#]+)/);
      const start = parseStartParam(tMatch ? tMatch[1] : null);
      if (!id) return null;
      return { id: id, start: start };
    }
  }

  function parseStartParam(value) {
    if (!value) return 0;
    // Accept numbers, numbers ending with s, or 1h2m3s notation
    const v = String(value).trim();
    if (/^\d+$/.test(v)) return parseInt(v, 10);
    if (/^\d+s$/.test(v)) return parseInt(v, 10);
    const re = /((\d+)h)?((\d+)m)?((\d+)s)?/i;
    const m = v.match(re);
    if (m) {
      const h = m[2] ? parseInt(m[2], 10) : 0;
      const mnt = m[4] ? parseInt(m[4], 10) : 0;
      const s = m[6] ? parseInt(m[6], 10) : 0;
      const total = h * 3600 + mnt * 60 + s;
      if (total > 0) return total;
    }
    return 0;
  }

  function reflectYouTube() {
    if (youtubeUrl) youtubeUrl.value = state.youtubeId ? `https://www.youtube.com/watch?v=${state.youtubeId}` : (youtubeUrl.value || '');
    if (state.youtubeId) {
      // If API is ready, ensure player; else fallback to embed with enablejsapi for future takeover
      if (youTubeApiReady) {
        createOrUpdateYouTubePlayer();
      } else if (youtubeFrame) {
        const start = state.youtubeStartSeconds > 0 ? `&start=${state.youtubeStartSeconds}` : '';
        const origin = location && location.origin ? `&origin=${encodeURIComponent(location.origin)}` : '';
        youtubeFrame.src = `https://www.youtube.com/embed/${state.youtubeId}?enablejsapi=1${start}${origin}`;
      }
    } else if (youtubeFrame) {
      youtubeFrame.src = '';
    }
    applyCropClass();
    reflectCropControls();
  }

  function createOrUpdateYouTubePlayer() {
    if (!youTubeApiReady || !youtubeFrame) return;
    const vars = {
      start: state.youtubeStartSeconds || 0,
      rel: 0,
      playsinline: 1
    };
    // Create if missing
    if (!ytPlayer) {
      try {
        ytPlayer = new YT.Player('youtubeFrame', {
          videoId: state.youtubeId || '',
          playerVars: vars,
          events: {
            onReady: function(){ /* no-op */ }
          }
        });
      } catch {}
      return;
    }
    // Update existing player if video differs
    try {
      if (state.youtubeId) {
        ytPlayer.loadVideoById({ videoId: state.youtubeId, startSeconds: state.youtubeStartSeconds || 0 });
      }
    } catch {}
  }

  function onCropChange() {
    const value = (cropSelect && cropSelect.value) || 'none';
    state.crop = value;
    applyCropClass();
    reflectCropControls();
    persist();
  }

  function applyCropClass() {
    if (!videoBox) return;
    const allowed = ['none','full','center','tl','tr','bl','br'];
    const val = allowed.includes(state.crop) ? state.crop : 'none';
    videoBox.className = 'video-box crop-' + val;
  }

  function reflectCropControls() {
    if (cropSelect) {
      const allowed = ['none','full','center','tl','tr','bl','br'];
      const val = allowed.includes(state.crop) ? state.crop : 'none';
      cropSelect.value = val;
    }
    if (toggleZoomBtn) {
      const isBottomLeft = state.crop === 'bl';
      toggleZoomBtn.textContent = isBottomLeft ? 'None' : 'Bottom Left';
    }
  }

  function onToggleZoom() {
    state.crop = state.crop === 'bl' ? 'none' : 'bl';
    applyCropClass();
    reflectCropControls();
    persist();
  }

  function autoParseMatchId() {
    const url = (state.match || '').trim();
    if (!url) { state.matchId = null; updateMatchIdDisplay(); return; }
    const id = parseMatchIdFromUrl(url);
    if (!id) { state.matchId = null; showMatchIdError('Invalid match URL. Expected https://www.breakingpoint.gg/match/{id}/{slug}'); return; }
    state.matchId = id;
    updateMatchIdDisplay();
  }

  function parseMatchIdFromUrl(url) {
    // Valid: https://www.breakingpoint.gg/match/{match_id}/{some string}
    const regex = /^https:\/\/www\.breakingpoint\.gg\/match\/([^\/]+)\/.+/i;
    const m = url.match(regex);
    return m ? m[1] : null;
  }

  function showMatchIdError(msg) {
    matchIdDisplay.textContent = msg;
    matchIdDisplay.classList.add('error');
  }

  function updateMatchIdDisplay() {
    if (state.matchId) {
      matchIdDisplay.textContent = `Match ID: ${state.matchId}`;
      matchIdDisplay.classList.remove('error');
    } else {
      matchIdDisplay.textContent = '';
      matchIdDisplay.classList.remove('error');
    }
  }

  function logChipEvent(eventName, value) {
    const t = Math.floor(getCurrentVideoTime());
    const ev = /** @type {ChipEvent} */ ({
      match_id: state.matchId || '',
      player: state.player || '',
      mode: state.mode || '',
      event: eventName,
      value: Number(value) === 1 ? 1 : 0,
      video_time: t
    });
    state.events.push(ev);
    persist();
    renderEvents();
  }

  function getCurrentVideoTime() {
    try {
      if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
        const t = Number(ytPlayer.getCurrentTime());
        if (Number.isFinite(t) && t >= 0) return t;
      }
      // Fallback: if we had a start time and no player yet, return approximate start
      return Number(state.youtubeStartSeconds || 0);
    } catch { return Number(state.youtubeStartSeconds || 0); }
  }

  function renderEvents() {
    livesEl.innerHTML = '';
    if (!state.events || state.events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No events yet. Toggle chips to log at the current time.';
      livesEl.appendChild(empty);
      return;
    }
    const items = state.events.slice().sort(function(a,b){ return b.video_time - a.video_time; });
    items.forEach(function(ev){
      const item = document.createElement('div');
      item.className = 'life-item';

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = `${formatTime(ev.video_time)} — ${ev.event.toUpperCase()}`;
      left.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const matchStr = ev.match_id ? ` | ID: ${ev.match_id}` : '';
      meta.textContent = `${ev.player} | ${ev.mode}${matchStr}`;
      left.appendChild(meta);

      const right = document.createElement('div');
      right.className = 'life-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = 'Delete';
      const originalIndex = state.events.indexOf(ev);
      delBtn.addEventListener('click', function(){ deleteEvent(originalIndex); });
      right.appendChild(delBtn);

      item.appendChild(left);
      item.appendChild(right);
      livesEl.appendChild(item);
    });
  }

  function deleteEvent(index) {
    if (index < 0 || index >= state.events.length) return;
    const ev = state.events[index];
    if (!confirm(`Delete ${ev.event} at ${formatTime(ev.video_time)}?`)) return;
    state.events.splice(index, 1);
    persist();
    renderEvents();
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = function(n){ return n < 10 ? '0' + n : String(n); };
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${m}:${pad(sec)}`;
  }

  function reflectHeaderInputs() {
    matchLink.value = state.match;
    playerSelect.value = state.player;
    modeSelect.value = state.mode;
  }

  function persist() {
    const data = {
      match: state.match,
      matchId: state.matchId,
      player: state.player,
      mode: state.mode,
      events: state.events,
      youtubeId: state.youtubeId,
      youtubeStartSeconds: state.youtubeStartSeconds,
      crop: state.crop || 'none'
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      state.match = saved.match || '';
      state.matchId = saved.matchId || null;
      state.player = saved.player || '';
      state.mode = saved.mode || '';
      state.youtubeId = saved.youtubeId || null;
      state.youtubeStartSeconds = Number(saved.youtubeStartSeconds || 0);
      state.crop = saved.crop || 'none';
      state.events = Array.isArray(saved.events) ? saved.events.slice(0) : [];
    } catch {}
  }

  function exportCsv() {
    if (!state.events || state.events.length === 0) { alert('No events to export.'); return; }
    const rows = [];
    const headers = ['match_id','game_mode','player','event','value','video_time','youtube_url'];
    rows.push(headers);
    const youtubeUrlCsv = state.youtubeId ? `https://www.youtube.com/watch?v=${state.youtubeId}` : '';
    state.events.slice().sort(function(a,b){ return a.video_time - b.video_time; }).forEach(function(ev){
      rows.push([
        ev.match_id || '',
        ev.mode || '',
        ev.player || '',
        ev.event,
        String(ev.value || 0),
        String(ev.video_time || 0),
        youtubeUrlCsv
      ]);
    });
    const csv = rows.map(r => r.map(cell => needsCsvEscaping(cell) ? '"' + String(cell).replaceAll('"','""') + '"' : cell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const playerSlug = state.player ? state.player.replace(/\s+/g,'_') : 'player';
    const modeSlug = state.mode ? state.mode.replace(/\s+/g,'_') : 'mode';
    const idSlug = state.matchId ? state.matchId : 'noid';
    a.href = url;
    a.download = `events_${idSlug}_${playerSlug}_${modeSlug}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function needsCsvEscaping(value) {
    return /[",\n]/.test(String(value));
  }

  function resetSession() {
    if (!confirm('This will clear all lives and session settings. Continue?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    state.match = '';
    state.matchId = null;
    state.player = '';
    state.mode = '';
    state.events = [];
    state.crop = 'none';
    if (cropSelect) cropSelect.value = 'none';
    applyCropClass();
    reflectCropControls();
    reflectHeaderInputs();
    renderEvents();
    updateMatchIdDisplay();
  }
})();


