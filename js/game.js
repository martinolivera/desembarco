/*
 * MOTOR DE ESTRATEGIA POR TURNOS (TBS) - v2
 * Escenario por defecto: Desembarco británico en Ensenada (1807), Virreinato del Río de la Plata
 */

const TILE_SIZE = 50;
const COLS = 16;
const ROWS = 12;

const COLORS = {
    GRID: 'rgba(0,0,0,0.1)',
    HIGHLIGHT_MOVE: 'rgba(46, 204, 113, 0.4)',
    HIGHLIGHT_ATTACK: 'rgba(231, 76, 60, 0.4)',
    SELECTED: 'rgba(241, 196, 15, 0.6)',
    PLAYER_UNIT: '#3498db',
    ENEMY_UNIT: '#e74c3c',
    TERRAIN_GRASS: '#5d6d7e',
    TERRAIN_OBSTACLE: '#2c3e50',
    DISABLED_UNIT: 'rgba(100, 100, 100, 0.5)'
};

const UNIT_TYPES = {
    INFANTRY: { name: 'Infantería', move: 3, range: 1, icon: '⚔️', hp: 10 },
    CAVALRY: { name: 'Caballería', move: 5, range: 1, icon: '🐎', hp: 8 },
    ARCHER: { name: 'Arqueros', move: 2, range: 3, icon: '🏹', hp: 6 }
};

const SCENARIOS = {
    ensenada1807: {
        title: "Desembarco británico en Ensenada (1807)",
        desc: "Intento de desembarco británico en las costas de Ensenada durante las invasiones inglesas al Río de la Plata.",
        objective: "Detener el desembarco o destruir las fuerzas enemigas.",
        map: Array.from({length: ROWS}, () => Array.from({length: COLS}, () => 0)),
        units: [
            // tropas criollas (jugador)
            { type: 'INFANTRY', side: 'player', x: 2, y: 5 },
            { type: 'INFANTRY', side: 'player', x: 3, y: 6 },
            { type: 'CAVALRY', side: 'player', x: 1, y: 2 },
            { type: 'CAVALRY', side: 'player', x: 1, y: 9 },
            // fuerzas británicas (enemigo)
            { type: 'INFANTRY', side: 'enemy', x: 13, y: 5 },
            { type: 'INFANTRY', side: 'enemy', x: 12, y: 6 },
            { type: 'INFANTRY', side: 'enemy', x: 14, y: 6 },
            { type: 'CAVALRY', side: 'enemy', x: 14, y: 3 }
        ]
    }
};

class Unit {
    constructor(data, x, y) {
        this.stats = UNIT_TYPES[data.type];
        this.side = data.side;
        this.x = x;
        this.y = y;
        this.hp = this.stats.hp;
        this.maxHp = this.stats.hp;
        this.hasMoved = false;
        this.hasAttacked = false;
        this.id = Math.random().toString(36).substr(2, 9);
    }

    resetTurn() {
        this.hasMoved = false;
        this.hasAttacked = false;
    }

    isActionable() {
        return !this.hasMoved || !this.hasAttacked;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.logPanel = document.getElementById('log-panel');
        this.tooltip = document.getElementById('tooltip');
        this.endTurnBtn = document.getElementById('end-turn-btn');
        this.activeCountSpan = document.getElementById('active-count');
        
        this.state = 'PLAYER_TURN';
        this.selectedUnit = null;
        this.validMoves = [];
        this.validAttacks = [];
        this.hoveredTile = { x: -1, y: -1 };
        // Assets
        this.mapImage = null;
        this.playerSprite = null;
        this.enemySprite = null;
        this.currentScenarioKey = 'ensenada1807';

    // audio assets container
    this.sounds = {};

        // Setup asset inputs
        this.setupAssetInputs();
        
        this.loadScenario('ensenada1807');
        // Ajustar tamaño del canvas según rejilla
        this.canvas.width = COLS * TILE_SIZE;
        this.canvas.height = ROWS * TILE_SIZE;
        this.setupInput();
        this.updateUI();
        this.loadDefaultAssets();
        this.loadSounds();
        this.loop();
    }

    loadSounds() {
        const base = 'assets/sounds/';
        const files = {
            cambioTurno: 'cambioTurno.wav',
            click: 'click.wav',
            correr: 'correr.wav',
            marchaPaso: 'marchaPaso.wav',
            marchaDosPasos: 'marchaDosPasos.wav',
            disparo: 'disparo.wav',
            impacto: 'impacto.wav'
        };

        Object.entries(files).forEach(([key, fname]) => {
            try {
                const a = new Audio(base + fname);
                a.preload = 'auto';
                a.volume = 0.7;
                // swallow errors silently
                a.addEventListener('error', () => {});
                this.sounds[key] = a;
            } catch (err) {
                // ignore
            }
        });
    }

    playSound(name) {
        const s = this.sounds && this.sounds[name];
        if (!s) return;
        try { s.currentTime = 0; } catch (e) {}
        const p = s.play();
        if (p && p.catch) p.catch(() => {});
    }

    setupAssetInputs() {
        const mapFile = document.getElementById('map-file');
        const playerSpriteFile = document.getElementById('player-sprite-file');
        const enemySpriteFile = document.getElementById('enemy-sprite-file');
        const scenarioFile = document.getElementById('scenario-file');
        const loadScenarioBtn = document.getElementById('load-scenario-btn');

        mapFile.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            this.loadImageFromFile(f).then(img => {
                this.mapImage = img;
                this.log('Mapa cargado desde archivo.', 'system');
            }).catch(() => this.log('No se pudo cargar la imagen del mapa.', 'system'));
        });

        playerSpriteFile.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            this.loadImageFromFile(f).then(img => {
                this.playerSprite = img;
                this.log('Sprite jugador cargado.', 'system');
            }).catch(() => this.log('No se pudo cargar sprite jugador.', 'system'));
        });

        enemySpriteFile.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            this.loadImageFromFile(f).then(img => {
                this.enemySprite = img;
                this.log('Sprite enemigo cargado.', 'system');
            }).catch(() => this.log('No se pudo cargar sprite enemigo.', 'system'));
        });

        scenarioFile.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    this.loadScenarioData(data);
                    this.log('Guion cargado desde archivo.', 'system');
                } catch (err) {
                    this.log('Error parseando el guion JSON.', 'system');
                }
            };
            reader.readAsText(f);
        });

        loadScenarioBtn.addEventListener('click', () => this.promptScenarioPaste());
    }

    loadImageFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    promptScenarioPaste() {
        const pasted = prompt('Pega aquí el JSON del guion (escenario) y pulsa OK');
        if (!pasted) return;
        try {
            const data = JSON.parse(pasted);
            this.loadScenarioData(data);
            this.log('Guion cargado desde texto pegado.', 'system');
        } catch (err) {
            this.log('JSON inválido al pegar el guion.', 'system');
        }
    }

    loadScenario(key) {
        // soporta pasar un objeto directamente
        if (typeof key === 'string') {
            const data = SCENARIOS[key];
            if (!data) {
                this.log('Escenario no encontrado: ' + key, 'system');
                return;
            }
            this.loadScenarioData(data);
            return;
        }
        // si pasaron un objeto
        this.loadScenarioData(key);
    }

    loadScenarioData(data) {
        document.getElementById('battle-title').innerText = data.title || 'Escenario';
        document.getElementById('battle-desc').innerText = data.desc || '';
        document.getElementById('battle-objective').innerText = data.objective ? ('Objetivo: ' + data.objective) : '';

        // Validaciones mínimas
        this.map = data.map && Array.isArray(data.map) ? data.map : SCENARIOS.ensenada1806.map;
        this.units = (data.units && Array.isArray(data.units)) ? data.units.map(u => new Unit(u, u.x, u.y)) : [];
        this.log(`Batalla iniciada: ${data.title || 'Escenario custom'}`, 'system');
        this.updateUI();
    }

    setupInput() {
        // Click
        this.canvas.addEventListener('mousedown', (e) => {
            if (this.state !== 'PLAYER_TURN') return;
            const { gridX, gridY } = this.getGridCoords(e);
            this.handleInput(gridX, gridY);
        });

        // Hover para tooltip
        this.canvas.addEventListener('mousemove', (e) => {
            const { gridX, gridY } = this.getGridCoords(e);
            this.hoveredTile = { x: gridX, y: gridY };
            this.updateTooltip(e);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.tooltip.style.display = 'none';
        });

        // Botón Finalizar Turno
        this.endTurnBtn.addEventListener('click', () => {
            if (this.state === 'PLAYER_TURN') {
                this.endPlayerTurn();
            }
        });
    }

    getGridCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        return {
            gridX: Math.floor(mouseX / TILE_SIZE),
            gridY: Math.floor(mouseY / TILE_SIZE)
        };
    }

    updateTooltip(e) {
        const unit = this.units.find(u => u.x === this.hoveredTile.x && u.y === this.hoveredTile.y);
        
        if (unit) {
            this.tooltip.style.display = 'block';
            this.tooltip.style.left = (e.clientX + 15) + 'px';
            this.tooltip.style.top = (e.clientY + 15) + 'px';
            this.tooltip.innerHTML = `
                <h3>${unit.stats.icon} ${unit.stats.name}</h3>
                <p>Lado: ${unit.side === 'player' ? '🔵 Jugador' : '🔴 Enemigo'}</p>
                <p>HP: ${unit.hp}/${unit.maxHp}</p>
                <p>Mov: ${unit.stats.move} | Atq: ${unit.stats.range}</p>
                ${unit.hasMoved ? '<p style="color:#e74c3c">Ya se movió</p>' : ''}
                ${unit.hasAttacked ? '<p style="color:#e74c3c">Ya atacó</p>' : ''}
            `;
        } else {
            this.tooltip.style.display = 'none';
        }
    }

    handleInput(x, y) {
        const clickedUnit = this.units.find(u => u.x === x && u.y === y && u.side === 'player');
        
        if (clickedUnit) {
            if (clickedUnit.isActionable()) {
                this.selectUnit(clickedUnit);
                this.playSound('click');
            } else {
                this.log("Esta unidad ya ha actuado este turno.", "system");
            }
            return;
        }

        if (this.selectedUnit && this.validMoves.some(m => m.x === x && m.y === y)) {
            this.moveUnit(this.selectedUnit, x, y);
            return;
        }

        if (this.selectedUnit && this.validAttacks.some(a => a.x === x && a.y === y)) {
            const target = this.units.find(u => u.x === x && u.y === y);
            this.attackUnit(this.selectedUnit, target);
            return;
        }

        this.deselect();
    }

    selectUnit(unit) {
        this.selectedUnit = unit;
        this.validMoves = unit.hasMoved ? [] : this.calculateMoves(unit);
        this.validAttacks = unit.hasAttacked ? [] : this.calculateAttacks(unit);
    }

    deselect() {
        this.selectedUnit = null;
        this.validMoves = [];
        this.validAttacks = [];
    }

    calculateMoves(unit) {
        let moves = [];
        let queue = [{x: unit.x, y: unit.y, dist: 0}];
        let visited = new Set();
        visited.add(`${unit.x},${unit.y}`);

        while(queue.length > 0) {
            let current = queue.shift();
            
            if (current.dist < unit.stats.move) {
                const directions = [[0,1], [0,-1], [1,0], [-1,0]];
                for (let dir of directions) {
                    let nx = current.x + dir[0];
                    let ny = current.y + dir[1];
                    
                    if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS && 
                        this.map[ny][nx] === 0 &&
                        !this.units.some(u => u.x === nx && u.y === ny) &&
                        !visited.has(`${nx},${ny}`)) {
                        
                        visited.add(`${nx},${ny}`);
                        moves.push({x: nx, y: ny});
                        queue.push({x: nx, y: ny, dist: current.dist + 1});
                    }
                }
            }
        }
        return moves;
    }

    calculateAttacks(unit) {
        let attacks = [];
        const range = unit.stats.range;
        
        for (let x = -range; x <= range; x++) {
            for (let y = -range; y <= range; y++) {
                if (Math.abs(x) + Math.abs(y) > range) continue;
                if (x === 0 && y === 0) continue;

                let tx = unit.x + x;
                let ty = unit.y + y;

                let target = this.units.find(u => u.x === tx && u.y === ty && u.side === 'enemy');
                if (target) {
                    attacks.push({x: tx, y: ty});
                }
            }
        }
        return attacks;
    }

    moveUnit(unit, x, y) {
        unit.x = x;
        unit.y = y;
        unit.hasMoved = true;
        this.playSound('marchaPaso');
        this.log(`${unit.stats.name} se mueve a (${x},${y})`, unit.side);
        
        this.validMoves = [];
        this.validAttacks = unit.hasAttacked ? [] : this.calculateAttacks(unit);
        this.updateUI();
    }

    attackUnit(attacker, defender) {
        const damage = Math.floor(Math.random() * 3) + 2;
        defender.hp -= damage;
        attacker.hasAttacked = true;
        
    this.playSound('disparo');
    // pequeño retardo para impacto
    setTimeout(() => this.playSound('impacto'), 120);

    this.log(`${attacker.stats.name} ataca a ${defender.stats.name} (-${damage} HP)`, attacker.side);

        if (defender.hp <= 0) {
            this.units = this.units.filter(u => u !== defender);
            this.log(`${defender.stats.name} eliminado.`, 'system');
            this.checkWinCondition();
        }

        this.deselect();
        this.updateUI();
    }

    endPlayerTurn() {
        this.state = 'ENEMY_TURN';
        this.deselect();
        this.updateUI();
    this.log("--- Turno del Enemigo ---", 'system');
    this.playSound('cambioTurno');
        
        setTimeout(() => this.runEnemyAI(), 1000);
    }

    runEnemyAI() {
        const enemies = this.units.filter(u => u.side === 'enemy');
        const players = this.units.filter(u => u.side === 'player');

        if (players.length === 0) return;

        let actionsPending = enemies.length;

        enemies.forEach(enemy => {
            setTimeout(() => {
                let target = null;
                let minDist = Infinity;

                players.forEach(p => {
                    let dist = Math.abs(p.x - enemy.x) + Math.abs(p.y - enemy.y);
                    if (dist < minDist) {
                        minDist = dist;
                        target = p;
                    }
                });

                if (target) {
                    if (minDist <= enemy.stats.range) {
                        this.attackUnit(enemy, target);
                    } else {
                        let dx = Math.sign(target.x - enemy.x);
                        let dy = Math.sign(target.y - enemy.y);
                        
                        if (dx !== 0 && this.isValidMove(enemy, enemy.x + dx, enemy.y)) {
                            enemy.x += dx;
                            this.playSound('marchaPaso');
                        } else if (dy !== 0 && this.isValidMove(enemy, enemy.x, enemy.y + dy)) {
                            enemy.y += dy;
                            this.playSound('marchaPaso');
                        }
                    }
                }
                
                actionsPending--;
                if (actionsPending === 0) {
                    this.startPlayerTurn();
                }
            }, Math.random() * 500 + 500);
        });
    }

    isValidMove(unit, x, y) {
        return x >= 0 && x < COLS && y >= 0 && y < ROWS &&
               this.map[y][x] === 0 &&
               !this.units.some(u => u.x === x && u.y === y);
    }

    startPlayerTurn() {
        this.state = 'PLAYER_TURN';
        this.units.forEach(u => {
            if (u.side === 'player') u.resetTurn();
        });
        this.deselect();
        this.updateUI();
        this.log("--- Tu Turno ---", 'system');
    }

    updateUI() {
        const playerUnits = this.units.filter(u => u.side === 'player');
        const activeUnits = playerUnits.filter(u => u.isActionable()).length;
        
        this.activeCountSpan.innerText = `${activeUnits}/${playerUnits.length}`;
        
        const turnIndicator = document.getElementById('turn-indicator');
        if (this.state === 'PLAYER_TURN') {
            turnIndicator.className = 'turn-player';
            turnIndicator.innerText = 'Turno: Jugador';
            this.endTurnBtn.disabled = false;
            this.endTurnBtn.innerText = 'Finalizar Turno';
        } else {
            turnIndicator.className = 'turn-enemy';
            turnIndicator.innerText = 'Turno: Enemigo';
            this.endTurnBtn.disabled = true;
            this.endTurnBtn.innerText = 'Esperando...';
        }
    }

    checkWinCondition() {
        const enemies = this.units.filter(u => u.side === 'enemy');
        const players = this.units.filter(u => u.side === 'player');

        if (enemies.length === 0) {
            alert("¡Victoria Histórica! Has detenido el desembarco.");
            this.state = 'GAME_OVER';
            this.endTurnBtn.disabled = true;
        } else if (players.length === 0) {
            alert("Derrota. El desembarco tuvo éxito.");
            this.state = 'GAME_OVER';
            this.endTurnBtn.disabled = true;
        }
    }

    log(msg, type) {
        const div = document.createElement('div');
        div.className = `log-entry log-${type}`;
        div.innerText = `> ${msg}`;
        this.logPanel.prepend(div);
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Mapa: si hay imagen, estirarla para cubrir todo el mapa; si no, dibujar tiles
        if (this.mapImage) {
            // ajustar proporción: dibujar la imagen en todo el canvas
            this.ctx.drawImage(this.mapImage, 0, 0, this.canvas.width, this.canvas.height);
            // overlay de cuadricula
            this.ctx.strokeStyle = COLORS.GRID;
            for (let y = 0; y <= ROWS; y++) {
                this.ctx.beginPath();
                this.ctx.moveTo(0, y * TILE_SIZE);
                this.ctx.lineTo(this.canvas.width, y * TILE_SIZE);
                this.ctx.stroke();
            }
            for (let x = 0; x <= COLS; x++) {
                this.ctx.beginPath();
                this.ctx.moveTo(x * TILE_SIZE, 0);
                this.ctx.lineTo(x * TILE_SIZE, this.canvas.height);
                this.ctx.stroke();
            }
        } else {
            for (let y = 0; y < ROWS; y++) {
                for (let x = 0; x < COLS; x++) {
                    const tileType = this.map[y][x];
                    this.ctx.fillStyle = tileType === 1 ? COLORS.TERRAIN_OBSTACLE : COLORS.TERRAIN_GRASS;
                    this.ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    this.ctx.strokeStyle = COLORS.GRID;
                    this.ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }
            }
        }

        // Highlights
        if (this.selectedUnit) {
            this.ctx.fillStyle = COLORS.HIGHLIGHT_MOVE;
            this.validMoves.forEach(m => {
                this.ctx.fillRect(m.x * TILE_SIZE, m.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            });
            this.ctx.fillStyle = COLORS.HIGHLIGHT_ATTACK;
            this.validAttacks.forEach(a => {
                this.ctx.fillRect(a.x * TILE_SIZE, a.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            });
            this.ctx.fillStyle = COLORS.SELECTED;
            this.ctx.fillRect(this.selectedUnit.x * TILE_SIZE, this.selectedUnit.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // Hover highlight
        if (this.hoveredTile.x >= 0) {
            this.ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(this.hoveredTile.x * TILE_SIZE, this.hoveredTile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }

        // Unidades: dibujar sprite si existe, sino círculo con icono
        this.units.forEach(u => {
            const cx = u.x * TILE_SIZE + TILE_SIZE / 2;
            const cy = u.y * TILE_SIZE + TILE_SIZE / 2;

            // Unidades del jugador gastadas se ven más oscuras
            if (u.side === 'player' && !u.isActionable()) {
                this.ctx.globalAlpha = 0.5;
            }

            const sprite = u.side === 'player' ? this.playerSprite : this.enemySprite;
            if (sprite) {
                // dibujar centrado y ajustado al tile
                if (u.side === 'player') {
                    // dibujar espejo horizontal dentro del tile con padding de 4px
                    const drawW = TILE_SIZE - 8;
                    const drawH = TILE_SIZE - 8;
                    // trasladar al extremo derecho del tile menos padding superior, escalar en X a -1 y dibujar en 0,0
                    this.ctx.save();
                    this.ctx.translate(u.x * TILE_SIZE + TILE_SIZE - 4, u.y * TILE_SIZE + 4);
                    this.ctx.scale(-1, 1);
                    this.ctx.drawImage(sprite, 0, 0, drawW, drawH);
                    this.ctx.restore();
                } else {
                    this.ctx.drawImage(sprite, u.x * TILE_SIZE + 4, u.y * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
                }
            } else {
                this.ctx.fillStyle = u.side === 'player' ? COLORS.PLAYER_UNIT : COLORS.ENEMY_UNIT;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, TILE_SIZE / 2 - 5, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#fff';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                this.ctx.fillStyle = '#fff';
                this.ctx.font = '20px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(u.stats.icon, cx, cy);
            }

            // Barra de vida
            const hpPct = Math.max(0, u.hp) / u.maxHp;
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(u.x * TILE_SIZE + 5, u.y * TILE_SIZE + 5, TILE_SIZE - 10, 4);
            this.ctx.fillStyle = '#2ecc71';
            this.ctx.fillRect(u.x * TILE_SIZE + 5, u.y * TILE_SIZE + 5, (TILE_SIZE - 10) * hpPct, 4);

            this.ctx.globalAlpha = 1.0;
        });
    }

    loop() {
        this.draw();
        requestAnimationFrame(() => this.loop());
    }

    loadDefaultAssets() {
        // mapa por defecto
        const mapImg = new Image();
        mapImg.onload = () => { this.mapImage = mapImg; this.log('Mapa por defecto cargado (assets/mapa.png).', 'system'); };
        mapImg.onerror = () => this.log('No se pudo cargar mapa por defecto.', 'system');
        mapImg.src = 'assets/mapa.png';

        // sprite jugador por defecto (usar criolloA)
        const pImg = new Image();
        pImg.onload = () => { this.playerSprite = pImg; this.log('Sprite jugador por defecto cargado (assets/criolloA/00.standing.png).', 'system'); };
        pImg.onerror = () => this.log('No se pudo cargar sprite jugador por defecto.', 'system');
        pImg.src = 'assets/criolloA/00.standing.png';

        // sprite enemigo por defecto (usar britanico)
        const eImg = new Image();
        eImg.onload = () => { this.enemySprite = eImg; this.log('Sprite enemigo por defecto cargado (assets/britanico/00.standing.a.png).', 'system'); };
        eImg.onerror = () => this.log('No se pudo cargar sprite enemigo por defecto.', 'system');
        eImg.src = 'assets/britanico/00.standing.a.png';
    }
}

window.onload = () => {
    const game = new Game();
};
