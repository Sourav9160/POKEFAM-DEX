allert("Hi users , welcome to the ultimate pokedex built with love by SOURAV, enjoy you time ...")
import { db } from './database.js';
import { syncBasicPokemonList, getPokemonDetail, getTypeMatchups } from './pokeapi.js';

// Application State
const state = {
  pokemonList: [],        // Full list of 1,025 basic Pokemon data
  filteredList: [],      // Active filtered/sorted subset
  renderedCount: 0,       // Track number of currently rendered cards (pagination)
  favorites: new Set(),   // Set of Pokemon IDs marked as favorite
  comparedPokemon: [],    // List of Pokemon selected for comparison (max 3)
  activeGen: 'all',       // Selected Gen filter
  activeTypes: [],        // Selected Type filters (multi-select)
  activeSort: 'id-asc',   // Current sort option
  activeTab: 'tab-stats', // Active tab in detail modal
  isShiny: false,         // Detail modal shiny toggle
  currentDetail: null,    // Detailed object of open Pokemon
  batchSize: 30           // Size of card batches to render on scroll
};

// Selectors
const els = {
  syncOverlay: document.getElementById('syncOverlay'),
  syncProgressBar: document.getElementById('syncProgressBar'),
  syncStatus: document.getElementById('syncStatus'),
  syncRegion: document.getElementById('syncRegion'),
  registeredCount: document.getElementById('registeredCount'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  moonIcon: document.getElementById('moonIcon'),
  sunIcon: document.getElementById('sunIcon'),
  searchInput: document.getElementById('searchInput'),
  sortBySelect: document.getElementById('sortBySelect'),
  filterFavSelect: document.getElementById('filterFavSelect'),
  genTabsContainer: document.getElementById('genTabsContainer'),
  typeFiltersGrid: document.getElementById('typeFiltersGrid'),
  pokemonGrid: document.getElementById('pokemonGrid'),
  gridSentinel: document.getElementById('gridSentinel'),
  
  // Compare Drawer
  compareDrawer: document.getElementById('compareDrawer'),
  compareSlots: document.getElementById('compareSlots'),
  clearCompareBtn: document.getElementById('clearCompareBtn'),
  compareBtn: document.getElementById('compareBtn'),
  
  // Detail Modal
  detailModal: document.getElementById('detailModal'),
  closeDetailModal: document.getElementById('closeDetailModal'),
  modalHeader: document.getElementById('modalHeader'),
  modalHeaderBg: document.getElementById('modalHeaderBg'),
  modalPokemonId: document.getElementById('modalPokemonId'),
  modalPokemonName: document.getElementById('modalPokemonName'),
  modalPokemonGenus: document.getElementById('modalPokemonGenus'),
  modalPokemonImg: document.getElementById('modalPokemonImg'),
  modalPokemonTypes: document.getElementById('modalPokemonTypes'),
  shinyToggleBtn: document.getElementById('shinyToggleBtn'),
  cryBtn: document.getElementById('cryBtn'),
  cryAudioPlayer: document.getElementById('cryAudioPlayer'),
  modalStatsContainer: document.getElementById('modalStatsContainer'),
  modalTypeMatchups: document.getElementById('modalTypeMatchups'),
  bioHeight: document.getElementById('bioHeight'),
  bioWeight: document.getElementById('bioWeight'),
  bioEggGroups: document.getElementById('bioEggGroups'),
  modalFlavorText: document.getElementById('modalFlavorText'),
  modalFlavorVersion: document.getElementById('modalFlavorVersion'),
  modalAbilitiesList: document.getElementById('modalAbilitiesList'),
  modalEvolutionChain: document.getElementById('modalEvolutionChain'),
  
  // Compare Modal
  compareModal: document.getElementById('compareModal'),
  closeCompareModal: document.getElementById('closeCompareModal'),
  compareGridContent: document.getElementById('compareGridContent'),

  headerLogo: document.getElementById('headerLogo')
};

// Initialize Application
async function init() {
  setupTheme();
  setupEventListeners();
  loadFavorites();

  try {
    // Synchronize basic Pokémon details on first run
    const basicList = await syncBasicPokemonList(handleSyncProgress);
    
    // Hide sync overlay with fade out
    els.syncOverlay.classList.add('fade-out');
    
    state.pokemonList = basicList;
    els.registeredCount.textContent = basicList.length;

    // Apply initial filters/renders
    applyFilters();
    setupInfiniteScroll();
  } catch (err) {
    console.error('Initialization error:', err);
    els.syncStatus.textContent = 'Sync Failed! Check connection and click logo to retry.';
    els.syncStatus.style.color = '#ff4a5a';
  }
}

// ----------------------------------------------------
// Core Synchronization Logic
// ----------------------------------------------------
function handleSyncProgress(progress) {
  const percent = progress.percent;
  els.syncProgressBar.style.width = `${percent}%`;
  
  if (percent === 100) {
    els.syncStatus.textContent = 'Sync Complete! Initializing Dex...';
  } else {
    els.syncStatus.textContent = `Syncing: #${progress.current} / ${progress.total} Pokémon...`;
    els.syncRegion.textContent = `Scanning ${progress.region} region`;
  }
}

// ----------------------------------------------------
// Theme System
// ----------------------------------------------------
function setupTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);
}

function updateThemeUI(theme) {
  if (theme === 'dark') {
    els.moonIcon.style.display = 'block';
    els.sunIcon.style.display = 'none';
  } else {
    els.moonIcon.style.display = 'none';
    els.sunIcon.style.display = 'block';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  updateThemeUI(next);
}

// ----------------------------------------------------
// Favorites Logic
// ----------------------------------------------------
function loadFavorites() {
  const saved = localStorage.getItem('favorites');
  if (saved) {
    state.favorites = new Set(JSON.parse(saved));
  }
}

function saveFavorites() {
  localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
}

function toggleFavorite(id, buttonEl) {
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    buttonEl.classList.remove('active');
  } else {
    state.favorites.add(id);
    buttonEl.classList.add('active');
  }
  saveFavorites();
  
  // If we are currently showing favorites only, re-apply filters to remove this card
  if (els.filterFavSelect.value === 'fav') {
    applyFilters();
  }
}

// ----------------------------------------------------
// Search and Filter Engine
// ----------------------------------------------------
function applyFilters() {
  const query = els.searchInput.value.toLowerCase().trim();
  const sortOption = els.sortBySelect.value;
  const isFavOnly = els.filterFavSelect.value === 'fav';
  
  state.filteredList = state.pokemonList.filter(pokemon => {
    // 1. Search Query Match
    const matchesQuery = 
      pokemon.name.toLowerCase().includes(query) || 
      pokemon.id.toString() === query ||
      pokemon.id.toString().padStart(3, '0').includes(query);
      
    // 2. Generation Match
    const matchesGen = state.activeGen === 'all' || pokemon.gen === parseInt(state.activeGen, 10);
    
    // 3. Types Match (Multi-select intersection: must contain ALL selected types)
    const matchesTypes = state.activeTypes.length === 0 || 
      state.activeTypes.every(type => pokemon.types.includes(type));
      
    // 4. Favorites Only Match
    const matchesFav = !isFavOnly || state.favorites.has(pokemon.id);
    
    return matchesQuery && matchesGen && matchesTypes && matchesFav;
  });

  // Sort Engine
  sortFilteredList(sortOption);

  // Reset pagination & render initial batch
  state.renderedCount = 0;
  els.pokemonGrid.innerHTML = '';
  renderNextBatch();
}

function sortFilteredList(option) {
  switch (option) {
    case 'id-asc':
      state.filteredList.sort((a, b) => a.id - b.id);
      break;
    case 'id-desc':
      state.filteredList.sort((a, b) => b.id - a.id);
      break;
    case 'name-asc':
      state.filteredList.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'name-desc':
      state.filteredList.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case 'bst-desc':
      // BST (Base Stat Total) = sum of all stats
      state.filteredList.sort((a, b) => getBst(b.stats) - getBst(a.stats));
      break;
    case 'bst-asc':
      state.filteredList.sort((a, b) => getBst(a.stats) - getBst(b.stats));
      break;
  }
}

function getBst(stats) {
  return stats.reduce((sum, val) => sum + val, 0);
}

// ----------------------------------------------------
// UI Rendering - Pokemon Grid & Cards
// ----------------------------------------------------
function renderNextBatch() {
  const start = state.renderedCount;
  const end = Math.min(start + state.batchSize, state.filteredList.length);
  
  if (start >= state.filteredList.length) return;

  const fragment = document.createDocumentFragment();

  for (let i = start; i < end; i++) {
    const pokemon = state.filteredList[i];
    const card = createPokemonCardEl(pokemon);
    fragment.appendChild(card);
  }

  els.pokemonGrid.appendChild(fragment);
  state.renderedCount = end;
}

function createPokemonCardEl(pokemon) {
  const card = document.createElement('a');
  card.className = `pokemon-card glow-${pokemon.types[0]}`;
  card.href = '#';
  card.dataset.id = pokemon.id;

  // Predictable official artwork url
  const imgUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;
  const formattedId = `#${pokemon.id.toString().padStart(4, '0')}`;
  
  const isFavorite = state.favorites.has(pokemon.id);
  const isCompared = state.comparedPokemon.some(p => p.id === pokemon.id);

  card.innerHTML = `
    <button class="fav-btn ${isFavorite ? 'active' : ''}" aria-label="Mark as favorite" data-id="${pokemon.id}">
      <svg viewBox="0 0 24 24">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </button>
    <button class="compare-toggle-btn ${isCompared ? 'active' : ''}" data-id="${pokemon.id}">
      ${isCompared ? 'Added' : '+ Compare'}
    </button>
    <div class="card-id">${formattedId}</div>
    <div class="card-img-wrapper">
      <img src="${imgUrl}" alt="${pokemon.name}" loading="lazy">
    </div>
    <h3 class="card-name">${pokemon.name.replace(/-/g, ' ')}</h3>
    <div class="card-types">
      ${pokemon.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join('')}
    </div>
    <div class="card-stats-preview">
      <div class="card-stat-item">
        <strong>${pokemon.stats[1]}</strong>
        ATK
      </div>
      <div class="card-stat-item">
        <strong>${pokemon.stats[2]}</strong>
        DEF
      </div>
      <div class="card-stat-item">
        <strong>${pokemon.stats[5]}</strong>
        SPD
      </div>
    </div>
  `;

  // Prevent default route & hook details popup
  card.addEventListener('click', (e) => {
    // If we clicked favorite or compare button, prevent opening modal
    if (e.target.closest('.fav-btn') || e.target.closest('.compare-toggle-btn')) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    openDetailModal(pokemon.id);
  });

  // Favorite button click listener
  const favBtn = card.querySelector('.fav-btn');
  favBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFavorite(pokemon.id, favBtn);
  });

  // Compare button click listener
  const compareBtn = card.querySelector('.compare-toggle-btn');
  compareBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleComparison(pokemon, compareBtn);
  });

  return card;
}

// ----------------------------------------------------
// Infinite Scrolling Observer
// ----------------------------------------------------
function setupInfiniteScroll() {
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.isIntersecting && state.renderedCount < state.filteredList.length) {
      renderNextBatch();
    }
  }, {
    rootMargin: '150px'
  });
  
  observer.observe(els.gridSentinel);
}

// ----------------------------------------------------
// Compare Mode Logic
// ----------------------------------------------------
function toggleComparison(pokemon, btnEl) {
  const index = state.comparedPokemon.findIndex(p => p.id === pokemon.id);
  
  if (index > -1) {
    // Remove
    state.comparedPokemon.splice(index, 1);
    btnEl.classList.remove('active');
    btnEl.textContent = '+ Compare';
  } else {
    // Add
    if (state.comparedPokemon.length >= 3) {
      alert('You can compare a maximum of 3 Pokemon side-by-side.');
      return;
    }
    state.comparedPokemon.push(pokemon);
    btnEl.classList.add('active');
    btnEl.textContent = 'Added';
  }

  updateCompareDrawer();
}

function updateCompareDrawer() {
  const count = state.comparedPokemon.length;
  
  if (count > 0) {
    els.compareDrawer.classList.add('active');
  } else {
    els.compareDrawer.classList.remove('active');
  }

  els.compareBtn.textContent = `Compare Pokémon (${count}/3)`;
  els.compareBtn.disabled = count < 2;

  // Render Slots
  for (let i = 0; i < 3; i++) {
    const slot = document.getElementById(`slot-${i}`);
    slot.innerHTML = '';
    slot.className = 'compare-slot';
    
    if (state.comparedPokemon[i]) {
      const pokemon = state.comparedPokemon[i];
      slot.classList.add('compare-slot-filled');
      const imgUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;
      
      slot.innerHTML = `
        <img src="${imgUrl}" alt="${pokemon.name}">
        <button class="remove-compare-slot" data-id="${pokemon.id}">&times;</button>
      `;

      slot.querySelector('.remove-compare-slot').addEventListener('click', () => {
        // Find corresponding card button and reset it
        const cardBtn = document.querySelector(`.pokemon-card[data-id="${pokemon.id}"] .compare-toggle-btn`);
        toggleComparison(pokemon, cardBtn || document.createElement('button'));
      });
    }
  }
}

function clearAllComparison() {
  state.comparedPokemon = [];
  updateCompareDrawer();
  
  // Reset all active compare buttons in card grid
  document.querySelectorAll('.compare-toggle-btn.active').forEach(btn => {
    btn.classList.remove('active');
    btn.textContent = '+ Compare';
  });
}

function openCompareModal() {
  if (state.comparedPokemon.length < 2) return;
  els.compareModal.classList.add('active');
  
  // Build comparison table layout
  let html = `
    <!-- Header Labels Column (Desktop only) -->
    <div class="compare-col compare-row-header" style="background: transparent; border: none; align-items: flex-start; justify-content: flex-end; text-align: left; padding-bottom: 2rem;">
      <h3 class="filter-label" style="font-size: 1rem;">Combat Stats</h3>
    </div>
  `;

  // Find max stats for highlighting winners
  const statsNames = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed', 'BST'];
  const maxValues = Array(7).fill(0);

  state.comparedPokemon.forEach(pokemon => {
    const stats = [...pokemon.stats, getBst(pokemon.stats)];
    stats.forEach((val, idx) => {
      if (val > maxValues[idx]) maxValues[idx] = val;
    });
  });

  state.comparedPokemon.forEach(pokemon => {
    const bst = getBst(pokemon.stats);
    const stats = [...pokemon.stats, bst];
    const artworkUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;

    html += `
      <div class="compare-col glow-${pokemon.types[0]}">
        <img class="compare-col-img" src="${artworkUrl}" alt="${pokemon.name}">
        <div class="card-id">#${pokemon.id.toString().padStart(4, '0')}</div>
        <h3 class="compare-col-name">${pokemon.name.replace(/-/g, ' ')}</h3>
        <div class="card-types" style="margin-top: 4px;">
          ${pokemon.types.map(t => `<span class="type-pill type-${t}">${t}</span>`).join('')}
        </div>
        
        <div class="compare-stats-table">
          ${stats.map((val, idx) => {
            const isWinner = val === maxValues[idx];
            return `
              <div class="compare-stat-row">
                <span class="stat-label" style="text-align: left;">${statsNames[idx]}</span>
                <strong class="${isWinner ? 'winner-highlight' : ''}">${val}</strong>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  els.compareGridContent.innerHTML = html;
}

// ----------------------------------------------------
// Pokémon Detailed Modal Handler
// ----------------------------------------------------
async function openDetailModal(id) {
  state.activeDetailId = id;
  state.isShiny = false;
  els.shinyToggleBtn.classList.remove('active');
  els.detailModal.classList.add('active');
  document.body.style.overflow = 'hidden'; // Lock background scroll

  // Reset tab selection to stats
  switchDetailTab('tab-stats');

  // Find basic pokemon data from list to render headers immediately
  const basic = state.pokemonList.find(p => p.id === id);
  if (basic) {
    renderDetailHeader(basic);
    renderStatsTabPlaceholder();
  }

  try {
    const detail = await getPokemonDetail(id);
    if (state.activeDetailId !== id) return; // Prevent async race conditions
    state.currentDetail = detail;
    
    // Fill detailed views
    renderDetailSpeciesData(detail);
    renderStatsTab(basic, detail);
    renderBioTab(basic, detail);
    renderEvolutionTab(detail);
  } catch (err) {
    console.error('Error fetching detail:', err);
    els.modalPokemonGenus.textContent = 'Error loading details.';
  }
}

function closeDetailModal() {
  els.detailModal.classList.remove('active');
  document.body.style.overflow = '';
  // Stop audio if playing
  els.cryAudioPlayer.pause();
}

function renderDetailHeader(pokemon) {
  els.modalPokemonId.textContent = `#${pokemon.id.toString().padStart(4, '0')}`;
  els.modalPokemonName.textContent = pokemon.name.replace(/-/g, ' ');
  els.modalPokemonImg.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.id}.png`;
  
  // Set type header color accent dynamically
  const primaryType = pokemon.types[0];
  els.modalHeaderBg.style.background = `hsl(var(--type-${primaryType}-h), var(--type-${primaryType}-s), var(--type-${primaryType}-l))`;
  els.modalHeader.className = `modal-header glow-${primaryType}`;

  // Type pills
  els.modalPokemonTypes.innerHTML = pokemon.types
    .map(t => `<span class="type-pill type-${t}">${t}</span>`)
    .join('');
}

function renderDetailSpeciesData(detail) {
  els.modalPokemonGenus.textContent = detail.genus;
}

function renderStatsTabPlaceholder() {
  els.modalStatsContainer.innerHTML = '<div class="skeleton" style="height: 180px; border-radius: 8px;"></div>';
  els.modalTypeMatchups.innerHTML = '<div class="skeleton" style="height: 60px; border-radius: 8px;"></div>';
}

function renderStatsTab(basic, detail) {
  const statNames = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
  const statKeys = ['hp', 'attack', 'defense', 'spatk', 'spdef', 'speed'];
  
  const bst = getBst(basic.stats);

  let html = '';
  basic.stats.forEach((val, idx) => {
    // Calculate percentage based on max possible stat (e.g. Blissey has 255 HP, Shuckle 230 Def)
    // 255 is a standard maximum base stat value in Pokemon games.
    const pct = Math.min((val / 255) * 100, 100);
    html += `
      <div class="stat-row">
        <span class="stat-label">${statNames[idx]}</span>
        <span class="stat-val">${val}</span>
        <div class="stat-bar-outer">
          <div class="stat-bar-inner ${statKeys[idx]}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  });

  // Append Base Stat Total
  html += `
    <div class="stat-row" style="margin-top: 8px; border-top: 1px solid var(--glass-border); padding-top: 8px;">
      <span class="stat-label" style="font-weight: 800; color: var(--text-primary)">Total BST</span>
      <span class="stat-val" style="font-weight: 800; color: var(--accent-color)">${bst}</span>
      <div></div>
    </div>
  `;

  els.modalStatsContainer.innerHTML = html;

  // Render Matchups (Weaknesses & Strengths)
  const matchups = getTypeMatchups(basic.types);
  let matchupHtml = '';

  // Weaknesses (2x, 4x)
  Object.entries(matchups.weaknesses).forEach(([type, mult]) => {
    matchupHtml += `
      <span class="matchup-badge">
        <span class="type-pill type-${type}" style="padding: 2px 8px; font-size: 0.65rem;">${type}</span>
        <strong class="matchup-multiplier weak">${mult}x</strong>
      </span>
    `;
  });

  // Immunities (0x)
  Object.entries(matchups.immunities).forEach(([type, mult]) => {
    matchupHtml += `
      <span class="matchup-badge">
        <span class="type-pill type-${type}" style="padding: 2px 8px; font-size: 0.65rem;">${type}</span>
        <strong class="matchup-multiplier immune">0x</strong>
      </span>
    `;
  });

  // Resists (0.5x, 0.25x)
  Object.entries(matchups.strengths).forEach(([type, mult]) => {
    matchupHtml += `
      <span class="matchup-badge">
        <span class="type-pill type-${type}" style="padding: 2px 8px; font-size: 0.65rem;">${type}</span>
        <strong class="matchup-multiplier resist">${mult}x</strong>
      </span>
    `;
  });

  if (matchupHtml === '') {
    matchupHtml = '<span class="text-secondary" style="font-size: 0.85rem;">Standard effectiveness from all types.</span>';
  }

  els.modalTypeMatchups.innerHTML = matchupHtml;
}

function renderBioTab(basic, detail) {
  // Height & Weight
  els.bioHeight.textContent = `${basic.height.toFixed(1)} m`;
  els.bioWeight.textContent = `${basic.weight.toFixed(1)} kg`;
  els.bioEggGroups.textContent = detail.eggGroups.join(', ') || 'Unknown';

  // Flavor Text slider
  if (detail.flavorTexts && detail.flavorTexts.length > 0) {
    const entry = detail.flavorTexts[0];
    els.modalFlavorText.innerHTML = `
      "${entry.text}"
      <span class="flavor-version" id="modalFlavorVersion">Flavor entry from Pokemon ${entry.version}</span>
    `;
    
    // If multiple entries, let's create a cycle click handler!
    let entryIndex = 0;
    els.modalFlavorText.style.cursor = 'pointer';
    els.modalFlavorText.onclick = () => {
      entryIndex = (entryIndex + 1) % detail.flavorTexts.length;
      const cur = detail.flavorTexts[entryIndex];
      els.modalFlavorText.innerHTML = `
        "${cur.text}"
        <span class="flavor-version" id="modalFlavorVersion">Flavor entry from Pokemon ${cur.version} (Click for next)</span>
      `;
    };
  } else {
    els.modalFlavorText.textContent = "No data entries recorded.";
    els.modalFlavorText.onclick = null;
  }

  // Abilities
  els.modalAbilitiesList.innerHTML = detail.abilities.map(a => `
    <div class="ability-card">
      <div class="ability-name">
        ${a.name}
        ${a.isHidden ? '<span class="ability-hidden-badge">Hidden</span>' : ''}
      </div>
    </div>
  `).join('');
}

function renderEvolutionTab(detail) {
  els.modalEvolutionChain.innerHTML = '';
  
  if (!detail.evolutionTree) {
    els.modalEvolutionChain.innerHTML = '<span class="text-secondary">This Pokemon does not evolve.</span>';
    return;
  }

  // Convert evolution tree nodes recursively into sequential flex nodes
  const container = els.modalEvolutionChain;
  
  function renderTreeNodes(node, targetEl) {
    if (!node) return;

    // Create node wrapper
    const nodeEl = document.createElement('div');
    nodeEl.className = 'evolution-node';
    const artworkUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${node.id}.png`;

    nodeEl.innerHTML = `
      <div class="evolution-node-img">
        <img src="${artworkUrl}" alt="${node.name}">
      </div>
      <div class="evolution-node-name">${node.name.replace(/-/g, ' ')}</div>
    `;

    // Click on evolution node navigates detail modal
    nodeEl.addEventListener('click', () => {
      openDetailModal(node.id);
    });

    targetEl.appendChild(nodeEl);

    // Render branches
    if (node.evolvesTo && node.evolvesTo.length > 0) {
      // Eevee branching helper - if branches, wrap children in sub-flex container
      const branchContainer = document.createElement('div');
      branchContainer.className = 'evolution-branches';
      branchContainer.style.display = 'flex';
      branchContainer.style.flexDirection = 'column';
      branchContainer.style.gap = '1.25rem';
      
      node.evolvesTo.forEach(child => {
        const stepRow = document.createElement('div');
        stepRow.style.display = 'flex';
        stepRow.style.alignItems = 'center';
        stepRow.style.gap = '1rem';

        // Render arrow
        const arrowEl = document.createElement('div');
        arrowEl.className = 'evolution-arrow';
        arrowEl.innerHTML = `
          <span class="evolution-trigger">${child.trigger || 'Evolve'}</span>
          <svg viewBox="0 0 24 24"><path d="M5 13h11.86l-5.43 5.43 1.42 1.42L21.14 12l-8.29-8.29-1.42 1.42L16.86 11H5v2z"/></svg>
        `;
        
        stepRow.appendChild(arrowEl);
        renderTreeNodes(child, stepRow);
        
        branchContainer.appendChild(stepRow);
      });

      targetEl.after(branchContainer);
    }
  }

  // Kickstart tree traversal
  const startRow = document.createElement('div');
  startRow.style.display = 'flex';
  startRow.style.alignItems = 'center';
  startRow.style.gap = '1rem';
  container.appendChild(startRow);
  
  renderTreeNodes(detail.evolutionTree, startRow);
}

function switchDetailTab(tabId) {
  state.activeTab = tabId;
  
  // Toggle tab headers
  document.querySelectorAll('.modal-tab-header').forEach(el => {
    if (el.getAttribute('data-tab') === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Toggle tab panes
  document.querySelectorAll('.modal-tab-pane').forEach(el => {
    if (el.getAttribute('id') === tabId) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });
}

function toggleShinyImage() {
  if (!state.currentDetail) return;
  state.isShiny = !state.isShiny;
  
  const id = state.currentDetail.id;
  const baseUrl = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
  
  if (state.isShiny) {
    els.shinyToggleBtn.classList.add('active');
    els.modalPokemonImg.src = `${baseUrl}/shiny/${id}.png`;
  } else {
    els.shinyToggleBtn.classList.remove('active');
    els.modalPokemonImg.src = `${baseUrl}/${id}.png`;
  }
}

function playPokemonCry() {
  if (!state.currentDetail) return;
  
  els.cryAudioPlayer.src = state.currentDetail.cryUrl;
  els.cryAudioPlayer.play().catch(e => {
    console.warn('Audio cry playback blocked by browser/failed:', e);
    alert('Cry audio file cannot be loaded or playback was blocked by browser autoplay settings.');
  });
}

// ----------------------------------------------------
// UI Bindings & Event Listeners
// ----------------------------------------------------
function setupEventListeners() {
  // Theme toggle
  els.themeToggleBtn.addEventListener('click', toggleTheme);
  
  // Search inputs
  els.searchInput.addEventListener('input', debounce(applyFilters, 250));
  els.sortBySelect.addEventListener('change', applyFilters);
  els.filterFavSelect.addEventListener('change', applyFilters);

  // Generation tabs
  els.genTabsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    
    // Set active tab styling
    document.querySelectorAll('#genTabsContainer .tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    state.activeGen = btn.getAttribute('data-gen');
    applyFilters();
  });

  // Multi-type selection grid
  els.typeFiltersGrid.addEventListener('click', (e) => {
    const typePill = e.target.closest('.type-pill');
    if (!typePill) return;

    const type = typePill.getAttribute('data-type');
    
    if (state.activeTypes.includes(type)) {
      // Remove filter
      state.activeTypes = state.activeTypes.filter(t => t !== type);
      typePill.classList.remove('filter-active');
    } else {
      // Add filter
      state.activeTypes.push(type);
      typePill.classList.add('filter-active');
    }

    applyFilters();
  });

  // Logo refresh listener (clears DB cache and triggers full reload)
  els.headerLogo.addEventListener('click', async () => {
    if (confirm('Clear local Pokédex cache and re-download data from PokéAPI? (Useful if data is corrupted)')) {
      els.syncOverlay.classList.remove('fade-out');
      els.syncProgressBar.style.width = '0%';
      els.syncStatus.textContent = 'Clearing Cache...';
      els.syncRegion.textContent = 'Database purging';
      await db.clear();
      window.location.reload();
    }
  });

  // Detail Modal Tab Toggles
  document.querySelectorAll('.modal-tab-header').forEach(header => {
    header.addEventListener('click', () => {
      const tabId = header.getAttribute('data-tab');
      switchDetailTab(tabId);
    });
  });

  // Detail Modal Controls
  els.closeDetailModal.addEventListener('click', closeDetailModal);
  els.shinyToggleBtn.addEventListener('click', toggleShinyImage);
  els.cryBtn.addEventListener('click', playPokemonCry);
  
  // Close modal when clicking outside contents
  els.detailModal.addEventListener('click', (e) => {
    if (e.target === els.detailModal) closeDetailModal();
  });

  // Compare Drawer Controls
  els.clearCompareBtn.addEventListener('click', clearAllComparison);
  els.compareBtn.addEventListener('click', openCompareModal);
  
  // Compare Modal Controls
  els.closeCompareModal.addEventListener('click', () => els.compareModal.classList.remove('active'));
  els.compareModal.addEventListener('click', (e) => {
    if (e.target === els.compareModal) els.compareModal.classList.remove('active');
  });
}

// Debounce helper for smooth searches
function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

// Start app
window.addEventListener('DOMContentLoaded', init);
