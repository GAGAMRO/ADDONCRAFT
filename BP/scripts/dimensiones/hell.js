import { system, world, BlockPermutation, BlockVolume } from "@minecraft/server";

const HELL_ID = "custom_dim:hell";
const TICKING_AREA_ID = "hell_gen_area";

const SURFACE_Y = 64;
const DEEPSLATE_DEPTH = 40;
// Reducido de 48 a 16 SOLO para descartar que el problema sea un límite de
// chunks del TickingAreaManager. Una vez que confirmes que todo funciona,
// puedes subirlo de nuevo poco a poco (24, 32, 48...).
const RADIUS = 48;

const COUNTDOWN_SECONDS = 15;
const BAR_LENGTH = 10;

// Margen del área de ticking del jugador (antes 32, luego 8, ahora 4).
// Con margen 4 el área mide 9x16x9 bloques: cabe casi siempre en 1 chunk.
const PLAYER_AREA_MARGIN = 4;

// Chunks reales aproximados que cubre el área de ticking del jugador,
// usado solo para el texto de la barra de progreso.
const TOTAL_CHUNKS = Math.pow(Math.ceil((PLAYER_AREA_MARGIN * 2 + 1) / 16) + 1, 2);

// Tiempo máximo que esperamos por createTickingArea antes de rendirnos
// y avisar al jugador en vez de quedarnos colgados en silencio.
const TICKING_AREA_TIMEOUT_MS = 10000;

// Registrar la dimensión personalizada al iniciar el mundo
system.beforeEvents.startup.subscribe((event) => {
    event.dimensionRegistry.registerCustomDimension(HELL_ID);
});

let hellGenerada = false;

async function construirHell() {
    if (hellGenerada) return;

    const dim = world.getDimension(HELL_ID);

    try {
        await world.tickingAreaManager.createTickingArea(TICKING_AREA_ID, {
            dimension: dim,
            from: { x: -RADIUS - 4, y: SURFACE_Y - DEEPSLATE_DEPTH, z: -RADIUS - 4 },
            to: { x: RADIUS + 4, y: SURFACE_Y + 4, z: RADIUS + 4 },
        });
    } catch (error) {
        console.error(`[Hell] Error creando ticking area de generación: ${error}`);
        return;
    }

    const musgo = BlockPermutation.resolve("minecraft:moss_block");
    const pizarraProfunda = BlockPermutation.resolve("minecraft:deepslate");

    dim.fillBlocks(
        new BlockVolume({ x: -RADIUS, y: SURFACE_Y, z: -RADIUS }, { x: RADIUS, y: SURFACE_Y, z: RADIUS }),
        musgo,
        { ignoreChunkBoundErrors: true }
    );

    dim.fillBlocks(
        new BlockVolume({ x: -RADIUS, y: SURFACE_Y - DEEPSLATE_DEPTH, z: -RADIUS }, { x: RADIUS, y: SURFACE_Y - 1, z: RADIUS }),
        pizarraProfunda,
        { ignoreChunkBoundErrors: true }
    );

    world.tickingAreaManager.removeTickingArea(TICKING_AREA_ID);
    hellGenerada = true;
    console.warn(`[Hell] Dimension generada correctamente.`);
}

world.afterEvents.worldLoad.subscribe(() => {
    system.run(() => {
        construirHell().catch((error) => console.error(`[Hell] construirHell fallo: ${error}`));
    });
});

const jugadoresEnCuentaRegresiva = new Set();

function construirBarra(fraccion) {
    const llenos = Math.round(fraccion * BAR_LENGTH);
    return "■".repeat(llenos) + "▢".repeat(BAR_LENGTH - llenos);
}

// Envuelve una promesa con un timeout para que nunca nos quedemos
// esperando en silencio para siempre.
function conTimeout(promesa, ms, mensajeError) {
    return Promise.race([
        promesa,
        new Promise((_, reject) => {
            system.runTimeout(() => reject(new Error(mensajeError)), Math.round(ms / 50));
        }),
    ]);
}

async function iniciarCuentaRegresiva(player) {
    if (jugadoresEnCuentaRegresiva.has(player.id)) return;

    const destino = { x: 0, y: SURFACE_Y + 2, z: 0 };

    let dimHell;
    try {
        dimHell = world.getDimension(HELL_ID);
    } catch (error) {
        // Si esto falla, la dimensión custom nunca se registró bien
        // (revisa manifest.json: "@minecraft/server" debe ser "beta",
        // y el mundo debe tener el experimento "Beta APIs" activado).
        console.error(`[Hell] No se pudo obtener la dimensión "${HELL_ID}": ${error}`);
        player.onScreenDisplay.setActionBar("Error: custom dimension not found. Check content log.");
        throw error;
    }

    jugadoresEnCuentaRegresiva.add(player.id);
    const areaJugadorId = `hell_portal_${player.id}`;

    // Empezamos a crear el área de ticking del jugador en PARALELO al
    // countdown, en vez de bloquear todo el flujo esperándola primero.
    // Así el jugador siempre ve el countdown avanzar, y si el área de
    // ticking falla o se tarda demasiado, lo sabremos por el timeout
    // en vez de quedarnos congelados en "Portal stabilizing...".
    const areaPromise = conTimeout(
        world.tickingAreaManager.createTickingArea(areaJugadorId, {
            dimension: dimHell,
            from: { x: destino.x - PLAYER_AREA_MARGIN, y: SURFACE_Y - 8, z: destino.z - PLAYER_AREA_MARGIN },
            to: { x: destino.x + PLAYER_AREA_MARGIN, y: SURFACE_Y + 8, z: destino.z + PLAYER_AREA_MARGIN },
        }),
        TICKING_AREA_TIMEOUT_MS,
        "Timeout esperando la ticking area del portal"
    ).catch((error) => {
        console.error(`[Hell] ${error}`);
        return null; // no interrumpe el countdown, solo lo marcamos como fallido
    });

    let contador = 0;

    // Se llama UNA sola vez: fija el título grande "Portal Stabilizing" en
    // pantalla. El número/barra de abajo se actualiza cada segundo con
    // updateSubtitle(), que no repite la animación de fade (sin parpadeo).
    player.onScreenDisplay.setTitle("Portal Stabilizing", {
        subtitle: `${COUNTDOWN_SECONDS}`,
        fadeInDuration: 4,
        stayDuration: COUNTDOWN_SECONDS * 20 + 40,
        fadeOutDuration: 8,
    });

    const limpiar = () => {
        jugadoresEnCuentaRegresiva.delete(player.id);
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
                    // Nos aseguramos de que el área de ticking haya terminado
                    // (o fallado) antes de teletransportar, pero sin poder
                    // colgarnos gracias al timeout de arriba.
                    const resultadoArea = await areaPromise;
                    if (resultadoArea === null) {
                        player.onScreenDisplay.setActionBar("Warning: area may not be fully loaded.");
                    }

                    try {
                        player.teleport(destino, { dimension: dimHell });
                    } catch (error) {
                        console.error(`[Hell] Teleport fallo: ${error}`);
                        player.onScreenDisplay.setActionBar("Teleport failed. Please try again.");
                    } finally {
                        limpiar();
                    }
                });
                return;
            }

            const fraccionTranscurrida = 1 - (tiempoActual / COUNTDOWN_SECONDS);
            const chunksRestantes = Math.round(TOTAL_CHUNKS * (1 - fraccionTranscurrida));
            const barra = construirBarra(fraccionTranscurrida);

            // Actualiza SOLO el subtítulo (número grande + barra), sin volver a
            // disparar el fade-in/fade-out del título. Esto es lo que evita el
            // parpadeo y hace que se vea como un countdown fluido.
            player.onScreenDisplay.updateSubtitle(`${tiempoActual}s [${barra}] ${chunksRestantes} chunks left`);

            player.onScreenDisplay.setActionBar(
                `Portal stabilizing: ${tiempoActual}s [${barra}] ${chunksRestantes} chunks left`
            );
        } catch (error) {
            // Si algo dentro del intervalo falla, lo registramos en vez de
            // quedarnos congelados en silencio (como pasó con isValid()).
            console.error(`[Hell] Error en el countdown: ${error}`);
            system.clearRun(intervalo);
            limpiar();
            player.onScreenDisplay.setActionBar("Portal error. Check content log.");
        }
    }, 20);
}

world.afterEvents.itemUse.subscribe((event) => {
    const { source, itemStack } = event;

    if (source.typeId !== "minecraft:player" || itemStack.typeId !== "minecraft:blaze_rod") return;

    const player = source;

    if (player.dimension.id === HELL_ID) {
        const overworld = world.getDimension("minecraft:overworld");
        player.onScreenDisplay.setActionBar("Returning to the overworld...");
        system.run(() => {
            player.teleport({ x: 0, y: 80, z: 0 }, { dimension: overworld });
        });
    } else {
        player.onScreenDisplay.setActionBar("Portal stabilizing...");
        iniciarCuentaRegresiva(player).catch((error) => {
            console.error(`[Hell] iniciarCuentaRegresiva fallo: ${error}`);
            player.onScreenDisplay.setActionBar("Portal failed to initialize.");
        });
    }
});