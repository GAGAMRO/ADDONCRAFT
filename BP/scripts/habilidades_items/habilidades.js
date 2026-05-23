import { world } from "@minecraft/server";

// Detecta cuando el jugador hace clic derecho apuntando al aire
// ATENCIÓN: El palo normal ("minecraft:stick") NO activa este evento porque en el juego vanilla no tiene una acción de uso (como la comida o un arco).
world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    if (item.typeId === "minecraft:stick") {
        activarHabilidad(player);
    }
});

// Detecta cuando el jugador hace clic derecho SOBRE UN BLOQUE
// Este evento SÍ se activa con cualquier ítem, incluyendo el palo normal.
world.afterEvents.itemUseOn.subscribe((event) => {
    const player = event.source;
    const item = event.itemStack;

    if (item.typeId === "minecraft:stick") {
        activarHabilidad(player);
    }
});

// Función centralizada para dar el efecto
function activarHabilidad(player) {
    try {
        // Ejecutamos el comando
        player.runCommandAsync("effect @s speed 2 1");
        
        // Enviamos un mensaje al jugador para confirmar que el código sí se está ejecutando
        player.sendMessage("§a¡Velocidad activada!");
    } catch (e) {
        console.warn("Error al aplicar la habilidad: " + e);
    }
}
