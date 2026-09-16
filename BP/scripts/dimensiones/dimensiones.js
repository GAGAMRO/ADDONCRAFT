import { system, world, BlockPermutation, BlockVolume } from "@minecraft/server";

const VOID_ARENA_ID = "custom_dim:void_arena";
const TICKING_AREA_ID = "void_arena_construccion";

// 1. Registrar la dimensión personalizada durante el evento de inicio
system.beforeEvents.startup.subscribe((event) => {
    event.dimensionRegistry.registerCustomDimension(VOID_ARENA_ID);
});

// Evita reconstruir la plataforma si el script se recarga
let plataformaConstruida = false;

// 2. Función asíncrona para generar la plataforma inicial
async function construirPlataforma() {
    if (plataformaConstruida) return;

    const miDimension = world.getDimension(VOID_ARENA_ID);

    // Crear un área activa (Ticking Area) con la API nativa en vez de un comando de consola
    await world.tickingAreaManager.createTickingArea(TICKING_AREA_ID, {
        dimension: miDimension,
        from: { x: -7, y: 62, z: -7 },
        to: { x: 7, y: 66, z: 7 },
    });

    // Definir el material y colocar una plataforma de 11x11 de piedra
    const materialPlataforma = BlockPermutation.resolve("minecraft:stone");

    miDimension.fillBlocks(
        new BlockVolume({ x: -5, y: 63, z: -5 }, { x: 5, y: 63, z: 5 }),
        materialPlataforma,
        { ignoreChunkBoundErrors: true }
    );

    // Liberar la memoria eliminando el área temporal
    world.tickingAreaManager.removeTickingArea(TICKING_AREA_ID);

    plataformaConstruida = true;
}

// Ejecutar la construcción SOLO cuando el mundo ya terminó de cargar
world.afterEvents.worldLoad.subscribe(() => {
    system.run(() => {
        construirPlataforma();
    });
});

// 3. Evento para viajar entre dimensiones usando el catalejo 
world.afterEvents.itemUse.subscribe((event) => {
    const { source, itemStack } = event;

    if (source.typeId === "minecraft:player" && itemStack.typeId === "minecraft:spyglass") {

        // Si el jugador ya está en la dimensión personalizada, regresa al Overworld
        if (source.dimension.id === VOID_ARENA_ID) {
            const overworld = world.getDimension("minecraft:overworld");
            source.teleport({ x: 0, y: 80, z: 0 }, { dimension: overworld });
        } else {
            // Si está en otro lugar, lo teletransporta a la nueva dimensión
            const miDimension = world.getDimension(VOID_ARENA_ID);
            source.teleport({ x: 0, y: 64, z: 0 }, { dimension: miDimension });
        }
    }
});