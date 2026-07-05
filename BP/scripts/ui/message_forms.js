import { world, system } from "@minecraft/server";
import { MessageFormData } from "@minecraft/server-ui";

// Función para construir y mostrar el Message Form
function abrirMenuSuscripcion(player) {
    const form = new MessageFormData()
        .title("¡Atención!")
        .body("Suscríbete")
        .button1("Sí")               // Opción 0
        .button2("Ya estoy suscrito"); // Opción 1

    form.show(player).then((response) => {
        // Si el jugador cierra el menú (ej. presionando Escape)
        if (response.canceled) {
            player.sendMessage("§cHas ignorado el mensaje.");
            return;
        }

        // Usamos system.run por si en el futuro quieres agregar comandos aquí
        system.run(() => {
            if (response.selection === 0) {
                // Respuesta al botón 1 ("Sí")
                player.sendMessage("§a¡Excelente decisión! Bienvenido al canal.");
            } else if (response.selection === 1) {
                // Respuesta al botón 2 ("Ya estoy suscrito")
                player.sendMessage("§e¡Muchas gracias por tu apoyo continuo!");
            }
        });
    }).catch(error => {
        console.error("Error en el Message Form: " + error);
    });
}

// Evento que detecta cuando se usa un ítem
world.afterEvents.itemUse.subscribe((event) => {
    const { source, itemStack } = event;

    // Verificamos que sea un jugador y use el palo
    if (source.typeId === "minecraft:player" && itemStack.typeId === "minecraft:stick") {

        // Retrasamos la apertura 1 tick para evitar el bloqueo de la interfaz
        system.run(() => {
            abrirMenuSuscripcion(source);
        });
    }
});