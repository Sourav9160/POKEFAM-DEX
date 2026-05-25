# Premium Pokédex Pro (Generations I - IX)

A state-of-the-art, high-performance, and visually stunning Pokédex web application containing all 1,025 Pokémon from Generation I to Generation IX. 

Built entirely using **Vanilla HTML, CSS, and JavaScript**, this single-page application features interactive layouts, advanced statistical comparisons, cry audio playbacks, evolution timelines, and local storage/IndexedDB offline capabilities.

---

## 🌟 Key Features

1. **Complete Database (Gen 1 to 9)**: Search and browse all 1,025 unique Pokémon species.
2. **First-Time Boot Sync**: A real-time, game-like synchronization overlay that fetches basic data and stores it in the browser's local database.
3. **Instant Caching & Offline Compatibility**: Powered by **IndexedDB**. Once synced, search, filtering, sorting, and detailing load in under 10ms.
4. **Vibrant HSL Theming**: Clean CSS layouts dynamically adjust colors, borders, and glows matching the primary element of the active Pokémon card/modal.
5. **Advanced Filters & Sorters**:
   - Live character search by name or ID (e.g. `025` or `pikachu`).
   - Generation filter tabs (Kanto, Johto, Hoenn, Sinnoh, Unova, Kalos, Alola, Galar, Paldea).
   - Multi-type intersections (select multiple types to find Pokemon containing *both*).
   - Sort by ID, alphabetical name, and BST (Base Stat Total).
   - Quick "Favorites Only" toggles.
6. **Premium Detail Modal View**:
   - High-resolution official artwork with normal/shiny toggle.
   - Interactive timeline rendering evolutionary chains (supporting branching forms like Eevee) with click-to-navigate bindings.
   - Animated base stats progress bars.
   - Audio playback player fetching official Pokémon cry sounds.
   - Dynamic type matchup calculations for vulnerabilities, resistances, and immunities.
   - Pokedex species descriptions (flavor texts) with game version scroll selectors.
7. **Side-by-Side Compare Mode**: Select up to 3 Pokémon cards to compare their metrics and base stats side-by-side, highlighting the winners in each category.

---

## 🛠️ Technology Stack
- **Structure**: Semantic HTML5 (Single Page App)
- **Styling**: Vanilla CSS (CSS Grid, Flexbox, CSS Variables, HSL Color Mappings, Glassmorphism, animations)
- **Logic**: Vanilla JavaScript ES Modules
- **Storage**: IndexedDB API & LocalStorage API
- **Data Source**: PokéAPI (v2)

---

## 🚀 Running Locally

To run the application locally, you can use any static file server:

### Option 1: VS Code Live Server
Right-click on `index.html` and select **Open with Live Server**.

### Option 2: Node.js (http-server)
If you have Node.js installed, run:
```bash
npm install -g http-server
http-server . -p 3000
```
Then visit `http://localhost:3000` in your web browser.

### Option 3: Python (Instant Server)
Run the following in your terminal:
```bash
python -m http.server 3000
```
Then open `http://localhost:3000`.
