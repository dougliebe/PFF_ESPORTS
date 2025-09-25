(function() {
  const STORAGE_KEY = 'pff_esports_session_v1';

  /** @typedef {{match_id:string, player:string, mode:string, lifeNum:number, score:number, good_fight:number, good_route:number, bad_route:number, got_spawns:number, lost_spawns:number, free_kill:number, free_death:number}} Life */

  /** @type {{ match:string, matchId:string|null, player:string, mode:string, lives:Life[], nextLifeNum:number, editingIndex:number|null, selectedScore:number|null }} */
  const state = {
    match: '',
    matchId: null,
    player: '',
    mode: '',
    lives: [],
    nextLifeNum: 1,
    editingIndex: null,
    selectedScore: 0
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
    goodFight: document.getElementById('goodFight'),
    goodRoute: document.getElementById('goodRoute'),
    badRoute: document.getElementById('badRoute'),
    gotSpawns: document.getElementById('gotSpawns'),
    lostSpawns: document.getElementById('lostSpawns'),
    freeKill: document.getElementById('freeKill'),
    freeDeath: document.getElementById('freeDeath')
  };
  const submitBtn = document.getElementById('submitBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const livesEl = document.getElementById('lives');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const resetBtn = document.getElementById('resetBtn');
  const matchIdDisplay = document.getElementById('matchIdDisplay');

  // Load session
  loadFromStorage();
  bindEvents();
  renderLives();
  reflectHeaderInputs();
  reflectSelectedScore();
  updateMatchIdDisplay();
  loadPlayersCsv();

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
      if (!confirm('No score selected. Submit with score = 0?')) return; else state.selectedScore = 0;
    }

    const life = /** @type {Life} */ ({
      match_id: state.matchId || '',
      player: state.player,
      mode: state.mode,
      lifeNum: state.editingIndex === null ? state.nextLifeNum : state.lives[state.editingIndex].lifeNum,
      score: Number(state.selectedScore),
      good_fight: chips.goodFight.checked ? 1 : 0,
      good_route: chips.goodRoute.checked ? 1 : 0,
      bad_route: chips.badRoute.checked ? 1 : 0,
      got_spawns: chips.gotSpawns.checked ? 1 : 0,
      lost_spawns: chips.lostSpawns.checked ? 1 : 0,
      free_kill: chips.freeKill.checked ? 1 : 0,
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
          life.good_fight ? 'GOOD FIGHT' : null,
          life.good_route ? 'GOOD ROUTE' : null,
          life.bad_route ? 'BAD ROUTE' : null,
          life.got_spawns ? 'GOT SPAWNS' : null,
          life.lost_spawns ? 'LOST SPAWNS' : null,
          life.free_kill ? 'FREE KILL' : null,
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
    chips.goodFight.checked = life.good_fight === 1;
    chips.goodRoute.checked = life.good_route === 1;
    chips.badRoute.checked = life.bad_route === 1;
    chips.gotSpawns.checked = life.got_spawns === 1;
    chips.lostSpawns.checked = life.lost_spawns === 1;
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
      nextLifeNum: state.nextLifeNum
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
    const headers = ['match_id','game_mode','player','life_num','score','good_route','bad_route','good_fight','got_spawns','lost_spawns','free_kill','free_death'];
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
          String(l.good_route),
          String(l.bad_route),
          String(l.good_fight),
          String(l.got_spawns),
          String(l.lost_spawns),
          String(l.free_kill),
          String(l.free_death)
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


