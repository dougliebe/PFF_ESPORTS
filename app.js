(function() {
  const STORAGE_KEY = 'pff_esports_session_v1';

  /** @typedef {{
   *  match_id:string,
   *  player:string,
   *  mode:string,
   *  lifeNum:number,
   *  score:number,
   *  // Good chips
   *  good_route:number,
   *  got_spawns:number,
   *  good_trade:number,
   *  played_life:number,
   *  flank:number,
   *  free_kill:number,
   *  // Bad chips
   *  bad_route:number,
   *  lost_spawns:number,
   *  bad_trade:number,
   *  gave_up_life:number,
   *  free_death:number
   * }} Life */

  /** @type {{ match:string, matchId:string|null, player:string, mode:string, lives:Life[], nextLifeNum:number, editingIndex:number|null, selectedScore:number|null, youtubeId:string|null, youtubeStartSeconds:number }} */
  const state = {
    match: '',
    matchId: null,
    player: '',
    mode: '',
    lives: [],
    nextLifeNum: 1,
    editingIndex: null,
    selectedScore: 0,
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
  const scoreButtons = Array.from(document.querySelectorAll('.score-btn'));
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
  const submitBtn = document.getElementById('submitBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
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

  // Load session
  loadFromStorage();
  bindEvents();
  renderLives();
  reflectHeaderInputs();
  reflectSelectedScore();
  updateMatchIdDisplay();
  loadPlayersCsv();
  reflectYouTube();

  function bindEvents() {
    matchLink.addEventListener('input', () => { state.match = matchLink.value.trim(); autoParseMatchId(); persist(); });
    playerSelect.addEventListener('input', () => { state.player = playerSelect.value; persist(); });
    modeSelect.addEventListener('change', () => { state.mode = modeSelect.value; persist(); });

    scoreButtons.forEach(btn => btn.addEventListener('click', () => {
      const score = Number(btn.getAttribute('data-score'));
      state.selectedScore = score;
      reflectSelectedScore();
    }));

    submitBtn.addEventListener('click', onSubmitLife);
    cancelEditBtn.addEventListener('click', clearEditMode);
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
  }
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
    if (youtubeFrame) {
      if (state.youtubeId) {
        const startParam = state.youtubeStartSeconds > 0 ? `?start=${state.youtubeStartSeconds}` : '';
        youtubeFrame.src = `https://www.youtube.com/embed/${state.youtubeId}${startParam}`;
      } else { youtubeFrame.src = ''; }
    }
    applyCropClass();
  }

  function onCropChange() {
    const value = (cropSelect && cropSelect.value) || 'none';
    state.crop = value;
    applyCropClass();
    persist();
  }

  function applyCropClass() {
    if (!videoBox) return;
    const allowed = ['none','full','center','tl','tr','bl','br'];
    const val = allowed.includes(state.crop) ? state.crop : 'none';
    videoBox.className = 'video-box crop-' + val;
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

  function onSubmitLife() {
    if (!state.player || !state.mode) {
      alert('Please select a player and a game/mode first.');
      return;
    }
    if (state.selectedScore === null) {
      state.selectedScore = 0;
    }

    const life = /** @type {Life} */ ({
      match_id: state.matchId || '',
      player: state.player,
      mode: state.mode,
      lifeNum: state.editingIndex === null ? state.nextLifeNum : state.lives[state.editingIndex].lifeNum,
      score: Number(state.selectedScore),
      // Good
      good_route: chips.goodRoute.checked ? 1 : 0,
      got_spawns: chips.gotSpawns.checked ? 1 : 0,
      good_trade: chips.goodTrade.checked ? 1 : 0,
      played_life: chips.playedLife.checked ? 1 : 0,
      flank: chips.flank.checked ? 1 : 0,
      free_kill: chips.freeKill.checked ? 1 : 0,
      // Bad
      bad_route: chips.badRoute.checked ? 1 : 0,
      lost_spawns: chips.lostSpawns.checked ? 1 : 0,
      bad_trade: chips.badTrade.checked ? 1 : 0,
      gave_up_life: chips.gaveUpLife.checked ? 1 : 0,
      free_death: chips.freeDeath.checked ? 1 : 0
    });

    if (state.editingIndex === null) {
      state.lives.push(life);
      state.nextLifeNum += 1;
    } else {
      state.lives[state.editingIndex] = life;
    }

    persist();
    renderLives();
    clearForm();
  }

  function renderLives() {
    livesEl.innerHTML = '';
    if (state.lives.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No lives recorded yet. Submit the first one to start.';
      livesEl.appendChild(empty);
      return;
    }
    state.lives
      .slice()
      .sort((a, b) => b.lifeNum - a.lifeNum)
      .forEach((life, index) => {
        const item = document.createElement('div');
        item.className = 'life-item';

        const left = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'title';
        title.textContent = `Life ${life.lifeNum} — Score ${life.score}`;
        left.appendChild(title);

        const meta = document.createElement('div');
        meta.className = 'meta';
        const matchStr = life.match_id ? ` | ID: ${life.match_id}` : '';
        meta.textContent = `${life.player} | ${life.mode}${matchStr}`;
        left.appendChild(meta);

        const tags = document.createElement('div');
        tags.className = 'tags';
        const tagList = [
          // Good
          life.good_route ? 'GOOD ROUTE' : null,
          life.got_spawns ? 'GOT SPAWNS' : null,
          life.good_trade ? 'GOOD TRADE' : null,
          life.played_life ? 'PLAYED LIFE' : null,
          life.flank ? 'FLANK' : null,
          life.free_kill ? 'FREE KILL' : null,
          // Bad
          life.bad_route ? 'BAD ROUTE' : null,
          life.lost_spawns ? 'LOST SPAWNS' : null,
          life.bad_trade ? 'BAD TRADE' : null,
          life.gave_up_life ? 'GAVE UP LIFE' : null,
          life.free_death ? 'FREE DEATH' : null
        ].filter(Boolean);
        if (tagList.length) {
          tagList.forEach(t => {
            const span = document.createElement('span');
            span.className = 'tag';
            span.textContent = t;
            tags.appendChild(span);
          });
        }
        left.appendChild(tags);

        const right = document.createElement('div');
        right.className = 'life-actions';
        const editBtn = document.createElement('button');
        editBtn.className = 'ghost';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => startEdit(index));
        const delBtn = document.createElement('button');
        delBtn.className = 'danger';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteLife(index));
        right.appendChild(editBtn);
        right.appendChild(delBtn);

        item.appendChild(left);
        item.appendChild(right);
        livesEl.appendChild(item);
      });
  }

  function startEdit(index) {
    const life = state.lives[index];
    state.editingIndex = index;
    state.player = life.player;
    state.mode = life.mode;
    state.selectedScore = life.score;

    // Keep current parsed URL and matchId as session-level; do not override from life
    playerSelect.value = state.player;
    modeSelect.value = state.mode;
    chips.goodRoute.checked = life.good_route === 1;
    chips.gotSpawns.checked = life.got_spawns === 1;
    chips.goodTrade.checked = life.good_trade === 1;
    chips.playedLife.checked = life.played_life === 1;
    chips.flank.checked = life.flank === 1;
    chips.lostSpawns.checked = life.lost_spawns === 1;
    chips.badRoute.checked = life.bad_route === 1;
    chips.badTrade.checked = life.bad_trade === 1;
    chips.gaveUpLife.checked = life.gave_up_life === 1;
    chips.freeKill.checked = life.free_kill === 1;
    chips.freeDeath.checked = life.free_death === 1;

    submitBtn.textContent = 'Update Life';
    cancelEditBtn.style.display = '';
    reflectSelectedScore();
  }

  function deleteLife(index) {
    const life = state.lives[index];
    if (!confirm(`Delete Life ${life.lifeNum}?`)) return;
    state.lives.splice(index, 1);
    // Re-number lives to keep sequence tight
    state.lives.sort((a,b) => a.lifeNum - b.lifeNum).forEach((l, i) => l.lifeNum = i + 1);
    state.nextLifeNum = state.lives.length + 1;
    persist();
    renderLives();
    if (state.editingIndex === index) clearEditMode();
  }

  function clearForm() {
    state.selectedScore = 0;
    Object.values(chips).forEach(chk => chk.checked = false);
    reflectSelectedScore();
    clearEditMode();
  }

  function clearEditMode() {
    state.editingIndex = null;
    submitBtn.textContent = 'Submit Life';
    cancelEditBtn.style.display = 'none';
    // Keep header inputs as-is; they are session-level
  }

  function reflectSelectedScore() {
    scoreButtons.forEach(btn => {
      const score = Number(btn.getAttribute('data-score'));
      btn.classList.toggle('active', state.selectedScore === score);
    });
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
      lives: state.lives,
      nextLifeNum: state.nextLifeNum,
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
      // Migrate any historical records that used `match` to `match_id`
      state.lives = Array.isArray(saved.lives) ? saved.lives.map(function(l){
        if (typeof l === 'object' && l !== null) {
          if (!('match_id' in l) && 'match' in l) {
            l.match_id = l.match || '';
          }
        }
        return l;
      }) : [];
      state.nextLifeNum = Number(saved.nextLifeNum) || (state.lives.length + 1);
    } catch {}
  }

  function exportCsv() {
    if (state.lives.length === 0) { alert('No lives to export.'); return; }
    const rows = [];
    const headers = [
      'match_id','game_mode','player','life_num','score',
      // Good
      'good_route','got_spawns','good_trade','played_life','flank','free_kill',
      // Bad
      'bad_route','lost_spawns','bad_trade','gave_up_life','free_death'
    ];
    rows.push(headers);
    state.lives
      .slice()
      .sort((a,b) => a.lifeNum - b.lifeNum)
      .forEach(l => {
        rows.push([
          l.match_id || '',
          l.mode,
          l.player,
          String(l.lifeNum),
          String(l.score),
          // Good
          String(l.good_route || 0),
          String(l.got_spawns || 0),
          String(l.good_trade || 0),
          String(l.played_life || 0),
          String(l.flank || 0),
          String(l.free_kill || 0),
          // Bad
          String(l.bad_route || 0),
          String(l.lost_spawns || 0),
          String(l.bad_trade || 0),
          String(l.gave_up_life || 0),
          String(l.free_death || 0)
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
    a.download = `lives_${idSlug}_${playerSlug}_${modeSlug}.csv`;
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
    state.lives = [];
    state.nextLifeNum = 1;
    state.editingIndex = null;
    state.selectedScore = null;
    reflectHeaderInputs();
    reflectSelectedScore();
    renderLives();
    updateMatchIdDisplay();
  }
})();


