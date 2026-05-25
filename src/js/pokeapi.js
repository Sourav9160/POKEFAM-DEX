import { db } from './database.js';

const TOTAL_POKEMON = 1025;
const BATCH_SIZE = 35; // Browser-friendly concurrent limit

// Helper to map IDs to Regions
function getRegionName(id) {
  if (id <= 151) return 'Kanto';
  if (id <= 251) return 'Johto';
  if (id <= 386) return 'Hoenn';
  if (id <= 493) return 'Sinnoh';
  if (id <= 649) return 'Unova';
  if (id <= 721) return 'Kalos';
  if (id <= 809) return 'Alola';
  if (id <= 898) return 'Galar';
  return 'Paldea';
}

function getGeneration(id) {
  if (id <= 151) return 1;
  if (id <= 251) return 2;
  if (id <= 386) return 3;
  if (id <= 493) return 4;
  if (id <= 649) return 5;
  if (id <= 721) return 6;
  if (id <= 809) return 7;
  if (id <= 898) return 8;
  return 9;
}

// Extractor for ID from PokéAPI URL (e.g., "https://pokeapi.co/api/v2/pokemon-species/25/")
function extractIdFromUrl(url) {
  const parts = url.split('/').filter(Boolean);
  return parseInt(parts[parts.length - 1], 10);
}

// Type effectiveness static matrix
const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2, fairy: 0.5 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  electric: { water: 2, grass: 0.5, electric: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, grass: 0.5, electric: 2, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { grass: 2, electric: 0.5, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 }
};

// Calculate defensive matchups for single or dual types
export function getTypeMatchups(types) {
  const weaknesses = {};
  const strengths = {};
  const immunities = {};

  const allTypes = Object.keys(TYPE_CHART);

  for (const defenseType of allTypes) {
    let multiplier = 1;

    for (const attackType of types) {
      if (TYPE_CHART[attackType] && TYPE_CHART[attackType].hasOwnProperty(defenseType)) {
        multiplier *= TYPE_CHART[attackType][defenseType];
      }
    }

    if (multiplier > 1) {
      weaknesses[defenseType] = multiplier;
    } else if (multiplier === 0) {
      immunities[defenseType] = multiplier;
    } else if (multiplier < 1) {
      strengths[defenseType] = multiplier;
    }
  }

  return { weaknesses, strengths, immunities };
}

// Fetch with retry
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// Sync all 1,025 Pokemon basic data
export async function syncBasicPokemonList(onProgress) {
  const cachedList = await db.get('basic_pokemon_list');
  if (cachedList && cachedList.length === TOTAL_POKEMON) {
    onProgress({ percent: 100, current: TOTAL_POKEMON, total: TOTAL_POKEMON, region: 'Complete' });
    return cachedList;
  }

  console.log('IndexedDB basic cache not found. Starting sync from PokeAPI...');
  const results = [];

  for (let i = 1; i <= TOTAL_POKEMON; i += BATCH_SIZE) {
    const end = Math.min(i + BATCH_SIZE - 1, TOTAL_POKEMON);
    const regionName = getRegionName(i);
    
    const promises = [];
    for (let id = i; id <= end; id++) {
      const url = `https://pokeapi.co/api/v2/pokemon/${id}/`;
      promises.push(
        fetchWithRetry(url)
          .then(data => {
            results.push({
              id: data.id,
              name: data.name,
              types: data.types.map(t => t.type.name),
              stats: data.stats.map(s => s.base_stat), // [hp, attack, defense, spAtk, spDef, speed]
              gen: getGeneration(data.id),
              height: data.height / 10,
              weight: data.weight / 10
            });
          })
          .catch(err => {
            console.error(`Sync error on Pokemon #${id}:`, err);
            results.push({
              id,
              name: `unknown-${id}`,
              types: ['normal'],
              stats: [50, 50, 50, 50, 50, 50],
              gen: getGeneration(id),
              height: 1.0,
              weight: 10.0
            });
          })
      );
    }

    await Promise.all(promises);
    const progressPercent = Math.min(Math.round((results.length / TOTAL_POKEMON) * 100), 100);
    onProgress({
      percent: progressPercent,
      current: results.length,
      total: TOTAL_POKEMON,
      region: regionName
    });

    // Small delay to respect rate limit
    await new Promise(r => setTimeout(r, 100));
  }

  // Sort by ID to ensure correct indexing
  results.sort((a, b) => a.id - b.id);

  // Cache basic list
  await db.set('basic_pokemon_list', results);
  return results;
}

// Parse evolution chain from API format
function parseEvolutionChain(chain) {
  const result = [];
  
  function traverse(node) {
    if (!node) return;
    
    const speciesName = node.species.name;
    const speciesId = extractIdFromUrl(node.species.url);
    
    let details = null;
    if (node.evolution_details && node.evolution_details.length > 0) {
      const detail = node.evolution_details[0];
      details = {
        trigger: detail.trigger ? detail.trigger.name.replace('-', ' ') : null,
        level: detail.min_level,
        item: detail.item ? detail.item.name.replace('-', ' ') : null,
        stone: detail.held_item ? detail.held_item.name.replace('-', ' ') : null,
        happiness: detail.min_happiness,
        time: detail.time_of_day,
        knowsMove: detail.known_move ? detail.known_move.name.replace('-', ' ') : null,
      };
    }

    result.push({
      id: speciesId,
      name: speciesName,
      details: details
    });

    if (node.evolves_to && node.evolves_to.length > 0) {
      // Handle branches (like Eevee or Tyrogue), traverse first child for simplicity or store branches
      // We will parse all branches but return a structure that supports branches.
      // To keep it simple but powerful, we'll store branches under a 'branchIndex' or just parse the first chain path.
      // Eevee is a special case. Let's return the tree or an array of evolution steps.
      // Let's create a list with relationships: e.g., { id, name, evolvesTo: [ids] }
      // To support linear rendering, we can parse multiple options. Let's map each evolves_to node recursively.
      node.evolves_to.forEach(child => traverse(child));
    }
  }

  traverse(chain);
  return result;
}

// Parse recursive tree structure of evolution chain properly, supporting branching paths (like Eevee)
function getEvolutionTree(node) {
  if (!node) return null;
  const id = extractIdFromUrl(node.species.url);
  const name = node.species.name;
  
  let triggerInfo = null;
  if (node.evolution_details && node.evolution_details.length > 0) {
    const detail = node.evolution_details[0];
    const triggerType = detail.trigger ? detail.trigger.name : 'level-up';
    
    if (triggerType === 'level-up' && detail.min_level) {
      triggerInfo = `Lvl ${detail.min_level}`;
    } else if (triggerType === 'use-item' && detail.item) {
      triggerInfo = detail.item.name.replace(/-/g, ' ');
    } else if (triggerType === 'trade') {
      triggerInfo = 'Trade' + (detail.held_item ? ` with ${detail.held_item.name.replace(/-/g, ' ')}` : '');
    } else if (detail.min_happiness) {
      triggerInfo = `Happiness (${detail.min_happiness})`;
    } else if (detail.known_move) {
      triggerInfo = `Move: ${detail.known_move.name.replace(/-/g, ' ')}`;
    } else {
      triggerInfo = triggerType.replace(/-/g, ' ');
    }
  }

  return {
    id,
    name,
    trigger: triggerInfo,
    evolvesTo: node.evolves_to.map(getEvolutionTree)
  };
}

// Fetch details (cries, species info, evolution chain) for a Pokemon and cache them
export async function getPokemonDetail(id) {
  const cacheKey = `detail_${id}`;
  const cachedDetail = await db.get(cacheKey);
  if (cachedDetail) return cachedDetail;

  try {
    // 1. Fetch raw pokemon details (for abilities and cries)
    const pokemonUrl = `https://pokeapi.co/api/v2/pokemon/${id}/`;
    const pokemonData = await fetchWithRetry(pokemonUrl);

    // 2. Fetch species details (for descriptions and evolution chain URL)
    const speciesUrl = `https://pokeapi.co/api/v2/pokemon-species/${id}/`;
    const speciesData = await fetchWithRetry(speciesUrl);

    // 3. Fetch evolution chain
    const evolutionChainUrl = speciesData.evolution_chain.url;
    const evolutionChainData = await fetchWithRetry(evolutionChainUrl);

    // Process flavor texts (descriptions) - filter for English entries
    const englishEntries = speciesData.flavor_text_entries
      .filter(entry => entry.language.name === 'en')
      .map(entry => ({
        version: entry.version.name.replace(/-/g, ' '),
        text: entry.flavor_text.replace(/\f/g, ' ').replace(/\n/g, ' ')
      }));

    // Deduplicate entries by text
    const seenTexts = new Set();
    const uniqueEntries = [];
    for (const entry of englishEntries) {
      const cleanText = entry.text.trim();
      if (!seenTexts.has(cleanText)) {
        seenTexts.add(cleanText);
        uniqueEntries.push({ version: entry.version, text: cleanText });
      }
    }

    // Process abilities with full names and links
    const abilities = pokemonData.abilities.map(a => ({
      name: a.ability.name.replace(/-/g, ' '),
      isHidden: a.is_hidden,
      url: a.ability.url
    }));

    // Species description details
    const genus = speciesData.genera.find(g => g.language.name === 'en')?.genus || 'Unknown Pokemon';
    
    // Parse evolution tree
    const evolutionTree = getEvolutionTree(evolutionChainData.chain);

    // Cries audio URL
    const cryUrl = pokemonData.cries?.latest || pokemonData.cries?.legacy || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/cries/${id}.ogg`;

    const detailResult = {
      id: pokemonData.id,
      name: pokemonData.name,
      genus: genus,
      cryUrl: cryUrl,
      abilities: abilities,
      flavorTexts: uniqueEntries.slice(0, 5), // Keep top 5 descriptions
      evolutionTree: evolutionTree,
      eggGroups: speciesData.egg_groups.map(g => g.name),
      habitat: speciesData.habitat ? speciesData.habitat.name : 'unknown',
      genderRate: speciesData.gender_rate, // -1 means genderless, otherwise female rate in eighths
      baseHappiness: speciesData.base_happiness,
      captureRate: speciesData.capture_rate
    };

    // Cache the detail
    await db.set(cacheKey, detailResult);
    return detailResult;
  } catch (error) {
    console.error(`Failed to fetch detailed info for Pokemon #${id}:`, error);
    throw error;
  }
}
