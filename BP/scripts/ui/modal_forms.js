import { world, system } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";

// Función para construir y mostrar el Modal Form de Ragnarok
function abrirConfiguracionRagnarok(player) {
    const modalform = new ModalFormData()
        .title("Configuración de Ragnarok")
        .toggle("Activar furia espartana:", { defaultValue: false })
        .toggle("Energía", { defaultValue: true })
        .slider("Nivel de dificultad de los enemigos", 1, 5, { valueStep: 1, defaultValue: 3 })
        .dropdown("Selecciona tu facción:", ["Aesir", "Vanir", "Gigante"], { defaultValueIndex: 0 })
        .textField("Nombre de tu arma:", "Ej. Leviatán", { defaultValue: "" });

    modalform.show(player).then((response) => {
        // Si el jugador cierra el menú presionando Escape o la 'X'
        if (response.canceled) {
            player.sendMessage("§cConfiguración cancelada.");
            return;
        }

        // Usamos system.run para procesar los datos de forma segura
        system.run(() => {
            // Extraemos los valores en el mismo orden que agregamos los componentes
            const [furiaEspartana, energia, dificultad, faccionIndex, nombreArma] = response.formValues;

            // Acciones basadas en las respuestas del jugador
            player.sendMessage(`§a¡Configuración guardada con éxito para ${nombreArma || 'tu arma'}!`);
            player.sendMessage(`§eFuria Espartana: ${furiaEspartana ? "Activada" : "Desactivada"}`);
            // Aquí puedes agregar la lógica para guardar estos datos en variables o tags
        });
    }).catch(error => {
        console.error("Error en el Modal Form de Ragnarok: " + error);
    });
}

// Evento que detecta cuando se usa un ítem
world.afterEvents.itemUse.subscribe((event) => {
    const { source, itemStack } = event;

    // Verificamos que sea un jugador y use el palo
    if (source.typeId === "minecraft:player" && itemStack.typeId === "minecraft:web") {

        // Retrasamos la apertura 1 tick para evitar el bloqueo de la interfaz por la animación del ítem
        system.run(() => {
            abrirConfiguracionRagnarok(source);
        });
    }
});