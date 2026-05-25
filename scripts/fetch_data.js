import fs from 'fs';
import path from 'path';

const TOTAL_POKEMON = 1025;
const BATCH_SIZE = 40; // Moderate batch size to prevent hitting rate limits too hard
const OUTPUT_DIR = path.join(process.cwd(), 'src', 'js');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pokemon_data.js');

// Determine Generation based on ID
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

// Fetch with retry and backoff
async function fetchWithRetry(url, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`[Warning] Fetch failed for ${url} (Attempt ${i + 1}/${retries}). Retrying in ${delay}ms...`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

async function fetchPokemonDetails(id) {
  const url = `https://pokeapi.co/api/v2/pokemon/${id}/`;
  const data = await fetchWithRetry(url);
  
  // Stats mapping: hp, atk, def, spatk, spdef, speed
  // PokeAPI returns stats in this order: hp, attack, defense, special-attack, special-defense, speed
  const stats = data.stats.map(s => s.base_stat);
  const types = data.types.map(t => t.type.name);
  
  return {
    id: data.id,
    name: data.name,
    types: types,
    stats: stats, // [hp, attack, defense, spAtk, spDef, speed]
    gen: getGeneration(data.id),
    height: data.height / 10, // decimetres to meters
    weight: data.weight / 10, // hectograms to kg
  };
}

async function main() {
  console.log(`Starting compilation of ${TOTAL_POKEMON} Pokémon from Gen 1 to Gen 9...`);
  const startTime = Date.now();
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = [];
  
  // Fetch details in batches to run concurrently and speed up
  for (let i = 1; i <= TOTAL_POKEMON; i += BATCH_SIZE) {
    const end = Math.min(i + BATCH_SIZE - 1, TOTAL_POKEMON);
    console.log(`Fetching batch ${i} to ${end}...`);
    
    const batchPromises = [];
    for (let id = i; id <= end; id++) {
      batchPromises.push(
        fetchPokemonDetails(id)
          .then(data => {
            results.push(data);
          })
          .catch(err => {
            console.error(`[Error] Failed to fetch Pokemon #${id}:`, err.message);
            // Push placeholder so we don't break the list indexing, but retry mechanism should prevent this
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
    
    // Wait for current batch to complete
    await Promise.all(batchPromises);
    
    // Brief sleep between batches to respect PokeAPI rate limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Sort results by ID to ensure order is preserved
  results.sort((a, b) => a.id - b.id);

  console.log(`Successfully fetched details for ${results.length} Pokémon!`);

  // Write to JS file as a module
  const fileContent = `// Pre-compiled list of all Generation 1 to 9 Pokémon (1 to 1025)
// Generated automatically by scripts/fetch_data.js
export const pokemonData = ${JSON.stringify(results, null, 2)};
`;

  fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf-8');
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Saved basic Pokémon metadata to ${OUTPUT_FILE}`);
  console.log(`Task completed in ${elapsed} seconds!`);
}

main().catch(error => {
  console.error('Fatal execution error:', error);
  process.exit(1);
});
