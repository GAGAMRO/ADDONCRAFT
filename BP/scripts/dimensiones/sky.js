import { system, world, BlockPermutation, BlockVolume } from "@minecraft/server";

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const SKY_ID = "custom_dim:sky";
const SKY_TICKING_AREA_ID = "sky_gen_area";

// Radio de generación EN CHUNKS. Con RADIO_CHUNKS = 4, el área total
// generada es de 8x8 chunks (4 hacia cada lado desde el centro).
// Súbelo con cuidado: cada chunk extra son 16x16 columnas más que rellenar.
const RADIO_CHUNKS = 4;
const RADIO_BLOQUES = RADIO_CHUNKS * 16;

// Altura base ("nivel del mar" de esta dimensión) y cuánto puede subir/bajar
// el terreno respecto a esa base.
const ALTURA_BASE = 64;
const AMPLITUD = 20; // el terreno variará entre ALTURA_BASE-20 y ALTURA_BASE+20

// Piso absoluto de la dimensión (donde va el bedrock).
const PISO_Y = ALTURA_BASE - AMPLITUD - 10;

// Cuántas columnas procesar antes de ceder el control al siguiente tick.
// Más alto = genera más rápido pero arriesga más el watchdog del servidor.
const COLUMNAS_POR_TICK = 40;

const COUNTDOWN_SECONDS = 10;
const TICKING_AREA_TIMEOUT_MS = 10000;

// ============================================================================
// RUIDO DE TERRENO (sin librerías externas)
// ============================================================================

// Hash determinístico 2D -> número pseudoaleatorio en [0, 1).
// Mismo x,z siempre da el mismo resultado, así el terreno no cambia entre
// reinicios del servidor.
function hash2D(x, z) {
    const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
    return s - Math.floor(s);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function suavizar(t) {
    return t * t * (3 - 2 * t);
}

// Ruido de valor: interpola entre las 4 esquinas de la celda de rejilla que
// contiene a (x, z). Da colinas suaves en vez de bloques al azar.
function ruidoSuave(x, z) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const sx = suavizar(x - x0);
    const sz = suavizar(z - z0);

    const n00 = hash2D(x0, z0);
    const n10 = hash2D(x0 + 1, z0);
    const n01 = hash2D(x0, z0 + 1);
    const n11 = hash2D(x0 + 1, z0 + 1);

    const ix0 = lerp(n00, n10, sx);
    const ix1 = lerp(n01, n11, sx);
    return lerp(ix0, ix1, sz);
}

// Suma varias "octavas" de ruido (distintas frecuencias/amplitudes) para que
// el resultado tenga tanto colinas grandes como variación pequeña, como el
// terreno real. Devuelve un valor normalizado en [0, 1].
function ruidoFractal(x, z, octavas, escala, persistencia) {
    let total = 0;
    let amplitud = 1;
    let amplitudMaxima = 0;
    let frecuencia = 1 / escala;

    for (let i = 0; i < octavas; i++) {
        total += ruidoSuave(x * frecuencia, z * frecuencia) * amplitud;
        amplitudMaxima += amplitud;
        amplitud *= persistencia;
        frecuencia *= 2;
    }

    return total / amplitudMaxima;
}

// Altura final del terreno (bloque de superficie) para una columna x,z.
function alturaTerreno(x, z) {
    const n = ruidoFractal(x, z, 4, 32, 0.5); // 4 octavas, escala base 32 bloques
    return Math.round(ALTURA_BASE + (n - 0.5) * 2 * AMPLITUD);
}

// ============================================================================
// GENERACIÓN DEL TERRENO (repartida en varios ticks con system.runJob)
// ============================================================================

let cieloGenerado = false;

function* generarTerrenoJob(dim, radio, alJugoTerminar) {
    const permBedrock = BlockPermutation.resolve("minecraft:bedrock");
    const permPiedra = BlockPermutation.resolve("minecraft:stone");
    const permTierra = BlockPermutation.resolve("minecraft:dirt");
    const permPasto = BlockPermutation.resolve("minecraft:grass_block");

    let columnasProcesadas = 0;

    for (let x = -radio; x <= radio; x++) {
        for (let z = -radio; z <= radio; z++) {
            const superficie = alturaTerreno(x, z);

            // Bedrock en el piso absoluto de la dimensión.
            dim.getBlock({ x, y: PISO_Y, z })?.setPermutation(permBedrock);

            // Relleno de piedra: del piso hasta 4 bloques antes de la superficie.
            const techoPiedra = superficie - 4;
            if (techoPiedra > PISO_Y) {
                dim.fillBlocks(
                    new BlockVolume({ x, y: PISO_Y + 1, z }, { x, y: techoPiedra, z }),
                    permPiedra,
                    { ignoreChunkBoundErrors: true }
                );
            }

            // Tierra: los 3 bloques justo antes de la superficie.
            dim.fillBlocks(
                new BlockVolume({ x, y: superficie - 3, z }, { x, y: superficie - 1, z }),
                permTierra,
                { ignoreChunkBoundErrors: true }
            );

            // Pasto en la superficie.
            dim.getBlock({ x, y: superficie, z })?.setPermutation(permPasto);

            columnasProcesadas++;

            // Cede el control al motor cada COLUMNAS_POR_TICK columnas, para
            // que el trabajo se reparta en varios ticks y no dispare el
            // watchdog del servidor por bloquear el hilo principal.
            if (columnasProcesadas % COLUMNAS_POR_TICK === 0) {
                yield;
            }
        }
    }

    // Esto se ejecuta al terminar TODAS las columnas (última "porción" del job).
    alJugoTerminar();
}

async function construirSky() {
    if (cieloGenerado) return;

    const dim = world.getDimension(SKY_ID);

    try {
        await world.tickingAreaManager.createTickingArea(SKY_TICKING_AREA_ID, {
            dimension: dim,
            from: { x: -RADIO_BLOQUES - 4, y: PISO_Y - 4, z: -RADIO_BLOQUES - 4 },
            to: { x: RADIO_BLOQUES + 4, y: ALTURA_BASE + AMPLITUD + 8, z: RADIO_BLOQUES + 4 },
        });
    } catch (error) {
        console.error(`[Sky] Error creando ticking area de generación: ${error}`);
        return;
    }

    console.warn(`[Sky] Generando terreno en ${RADIO_CHUNKS * 2}x${RADIO_CHUNKS * 2} chunks...`);

    system.runJob(
        generarTerrenoJob(dim, RADIO_BLOQUES, () => {
            world.tickingAreaManager.removeTickingArea(SKY_TICKING_AREA_ID);
            cieloGenerado = true;
            console.warn(`[Sky] Dimension generada correctamente.`);
        })
    );
}

// ============================================================================
// REGISTRO Y CARGA DEL MUNDO
// ============================================================================

system.beforeEvents.startup.subscribe((event) => {
    event.dimensionRegistry.registerCustomDimension(SKY_ID);
});

world.afterEvents.worldLoad.subscribe(() => {
    system.run(() => {
        construirSky().catch((error) => console.error(`[Sky] construirSky fallo: ${error}`));
    });
});

// ============================================================================
// TELETRANSPORTE CON VARITA DE BREEZE
// ============================================================================

const jugadoresEnCuentaRegresivaSky = new Set();

function construirBarraSky(fraccion, longitud) {
    const llenos = Math.round(fraccion * longitud);
    return "■".repeat(llenos) + "▢".repeat(longitud - llenos);
}

function conTimeoutSky(promesa, ms, mensajeError) {
    return Promise.race([
        promesa,
        new Promise((_, reject) => {
            system.runTimeout(() => reject(new Error(mensajeError)), Math.round(ms / 50));
        }),
    ]);
}

async function iniciarCuentaRegresivaSky(player) {
    if (jugadoresEnCuentaRegresivaSky.has(player.id)) return;

    // Destino: aterriza justo encima del punto más alto del terreno en (0,0)
    // más un margen, para no aparecer enterrado si el ruido da una colina alta ahí.
    const destino = { x: 0, y: ALTURA_BASE + AMPLITUD + 3, z: 0 };

    let dimSky;
    try {
        dimSky = world.getDimension(SKY_ID);
    } catch (error) {
        console.error(`[Sky] No se pudo obtener la dimensión "${SKY_ID}": ${error}`);
        player.onScreenDisplay.setActionBar("Error: sky dimension not found. Check content log.");
        throw error;
    }

    jugadoresEnCuentaRegresivaSky.add(player.id);
    const areaJugadorId = `sky_portal_${player.id}`;

    const areaPromise = conTimeoutSky(
        world.tickingAreaManager.createTickingArea(areaJugadorId, {
            dimension: dimSky,
            from: { x: destino.x - 4, y: PISO_Y, z: destino.z - 4 },
            to: { x: destino.x + 4, y: ALTURA_BASE + AMPLITUD + 8, z: destino.z + 4 },
        }),
        TICKING_AREA_TIMEOUT_MS,
        "Timeout esperando la ticking area del portal a Sky"
    ).catch((error) => {
        console.error(`[Sky] ${error}`);
        return null;
    });

    let contador = 0;

    player.onScreenDisplay.setTitle("Ascending to Sky", {
        subtitle: `${COUNTDOWN_SECONDS}`,
        fadeInDuration: 4,
        stayDuration: COUNTDOWN_SECONDS * 20 + 40,
        fadeOutDuration: 8,
    });

    const limpiar = () => {
        jugadoresEnCuentaRegresivaSky.delete(player.id);
        world.tickingAreaManager.removeTickingArea(areaJugadorId);
    };

    const intervalo = system.runInterval(() => {
        try {
            if (!player.isValid) {
                system.clearRun(intervalo);
                limpiar();
                return;
            }

            contador += 1;
            const tiempoActual = Math.max(0, COUNTDOWN_SECONDS - contador);

            if (tiempoActual <= 0) {
                system.clearRun(intervalo);

                player.onScreenDisplay.updateSubtitle("Stabilized!");
                player.onScreenDisplay.setActionBar("Portal stabilized. Transporting...");

                system.run(async () => {
                    const resultadoArea = await areaPromise;
                    if (resultadoArea === null) {
                        player.onScreenDisplay.setActionBar("Warning: area may not be fully loaded.");
                    }

                    try {
                        player.teleport(destino, { dimension: dimSky });
                    } catch (error) {
                        console.error(`[Sky] Teleport fallo: ${error}`);
                        player.onScreenDisplay.setActionBar("Teleport failed. Please try again.");
                    } finally {
                        limpiar();
                    }
                });
                return;
            }

            const fraccionTranscurrida = 1 - tiempoActual / COUNTDOWN_SECONDS;
            const barra = construirBarraSky(fraccionTranscurrida, 10);

            player.onScreenDisplay.updateSubtitle(`${tiempoActual}s [${barra}]`);
            player.onScreenDisplay.setActionBar(`Ascending to Sky: ${tiempoActual}s [${barra}]`);
        } catch (error) {
            console.error(`[Sky] Error en el countdown: ${error}`);
            system.clearRun(intervalo);
            limpiar();
            player.onScreenDisplay.setActionBar("Portal error. Check content log.");
        }
    }, 20);
}

world.afterEvents.itemUse.subscribe((event) => {
    const { source, itemStack } = event;

    if (source.typeId !== "minecraft:player" || itemStack.typeId !== "minecraft:breeze_rod") return;

    const player = source;

    if (player.dimension.id === SKY_ID) {
        const overworld = world.getDimension("minecraft:overworld");
        player.onScreenDisplay.setActionBar("Returning to the overworld...");
        system.run(() => {
            player.teleport({ x: 0, y: 80, z: 0 }, { dimension: overworld });
        });
    } else {
        player.onScreenDisplay.setActionBar("Ascending to Sky...");
        iniciarCuentaRegresivaSky(player).catch((error) => {
            console.error(`[Sky] iniciarCuentaRegresivaSky fallo: ${error}`);
            player.onScreenDisplay.setActionBar("Portal failed to initialize.");
        });
    }
});