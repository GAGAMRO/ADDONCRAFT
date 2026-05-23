import { world, system } from "@minecraft/server";

const itemsPermitidos = [
    "minecraft:stick",
    "minecraft:diamond_sword",
    "rg:tomahawk"
];

world.afterEvents.itemUse.subscribe((eventData) => {
    const player = eventData.source;
    const item = eventData.itemStack;

    if (!item) return;

    const esItemValido = itemsPermitidos.some(id => id === item.typeId);

    if (esItemValido) {
        //Efecto de velocidad
        //El tiempo es 5*20=100 Entonces t*20 = t_e
        //Efecto de velocidad
        //El tiempo es 5*20=100 Entonces t*20 = t_e
        player.addEffect("minecraft:speed", 100, { amplifier: 0 });
        //Fuerza
        player.addEffect("minecraft:strength", 100, { amplifier: 0 });
        //Spawn golem (Comandos)
        player.runCommand("summon iron_golem ~ ~ ~");
        //Mensaje al jugador
        player.sendMessage("§a¡Objeto mágico detectado! Poderes aplicados.§r");
    }
});