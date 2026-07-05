import { world, system } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

// Función para el menú principal
function abrirMenuPrincipal(player) {
    const form = new ActionFormData()
        .title("Menú Principal")
        .body("¿Qué deseas hacer?")
        .button("VELOCIDAD") // Botón 0
        .button("Armas", "textures/items/mace")     // Botón 1
        .button("Salida");   // Botón 2

    form.show(player).then((response) => {
        if (response.canceled) return;

        // IMPORTANTE: Envolvemos las acciones en system.run para evitar el error de "solo lectura"
        system.run(() => {
            switch (response.selection) {
                case 0:
                    // Se usa runCommand en lugar de runCommandAsync
                    player.runCommand("effect @s speed 2 1 true");
                    player.sendMessage("§b¡Velocidad activada!");
                    break;
                case 1:
                    abrirMenuArmas(player);
                    break;
                case 2:
                    player.sendMessage("§eHas salido del menú.");
                    break;
            }
        });
    }).catch(error => {
        console.error("Error en el menú principal: " + error);
    });
}

// Función para el submenú de armas
function abrirMenuArmas(player) {
    const form = new ActionFormData()
        .title("Menú de Armas")
        .body("Elige tu arma:")
        .button("Maza")      // Botón 0
        .button("Tridente")  // Botón 1
        .button("Salida");   // Botón 2

    form.show(player).then((response) => {
        if (response.canceled) return;

        // IMPORTANTE: Nuevamente usamos system.run
        system.run(() => {
            switch (response.selection) {
                case 0:
                    player.runCommand("give @s mace");
                    player.sendMessage("§aHas recibido una Maza.");
                    break;
                case 1:
                    player.runCommand("give @s trident");
                    player.sendMessage("§aHas recibido un Tridente.");
                    break;
                case 2:
                    player.sendMessage("§eHas salido del menú de armas.");
                    break;
            }
        });
    }).catch(error => {
        console.error("Error en el menú de armas: " + error);
    });
}

// Evento que detecta cuando se usa un ítem
world.afterEvents.itemUse.subscribe((event) => {
    const { source, itemStack } = event;

    if (source.typeId === "minecraft:player") {
        if (itemStack.typeId === "minecraft:compass" || itemStack.typeId === "minecraft:clock") {

            // Retrasar la apertura de la interfaz 1 tick (esto ya lo tenías y es correcto)
            system.run(() => {
                abrirMenuPrincipal(source);
            });
        }
    }
});