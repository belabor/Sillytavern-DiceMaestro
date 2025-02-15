import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { extension_settings, getContext } from "../../../extensions.js";
//import { callGenericPopup, Popup, POPUP_TYPE } from '../../../popup.js';
import { Popup } from '../../../popup.js';
import { animation_duration, saveSettingsDebounced } from '../../../../script.js';

const extensionName = "Sillytavern-DiceMaestro";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    prompt_impersonate: `[From {{user}} perspective, their plan is: \`\`\`{{action}}\`\`\`.  In a more general sense, they attempt to: \`{{move}}\`.  But, reguardless of their plans, the result is: {{outcome}}.  Be brief and distinct, describing their attempt and the end result, with no more than 5 sentences.]`
}

let maestroStats = {};
let moves = [];

async function loadMaestroSettings() {
    console.log("loadMaestroSettings: Starting");
    if (typeof extension_settings === 'undefined') {
        console.warn('extension_settings is undefined. wtf?');
        return;
    }

    extension_settings.maestro = extension_settings.maestro || {};
    console.log("loadMaestroSettings: extension_settings.maestro initialized", extension_settings.maestro);

    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    console.log("loadMaestroSettings: settingsHtml loaded", settingsHtml);
    $("#extensions_settings").append(settingsHtml);
    console.log("loadMaestroSettings: settingsHtml appended");

    // Load moves first to get the stats
    await loadMoves();
    console.log("loadMaestroSettings: moves loaded", moves);

    // Get unique stats from moves
    const currentStats = [...new Set(moves.map(move => move.stat))];
    console.log("loadMaestroSettings: unique stats extracted", currentStats);

    // Clear existing content
    $('#maestroExtensionDrawerContents').empty();

    // Create sliders for current stats
    for (const stat of currentStats) {
        const savedValue = extension_settings.maestro[stat] || 0;
        console.log(`loadMaestroSettings: Loading stat ${stat}, savedValue = ${savedValue}`);

        const sliderHtml = `
            <label for="maestro_stat_${stat}">+${stat}: <span id="maestro_stat_${stat}_value">${savedValue}</span></label>
            <div class="range-block">
                <input id="maestro_stat_${stat}" type="range" min="-2" max="3" step="1" value="${savedValue}" />
            </div>
            <br>
        `;

        $('#maestroExtensionDrawerContents').append(sliderHtml);

        const rangeInput = $(`#maestro_stat_${stat}`);
        const valueSpan = $(`#maestro_stat_${stat}_value`);

        maestroStats[stat] = savedValue;
        console.log(`loadMaestroSettings: Stat ${stat} initialized, maestroStats[${stat}] = ${savedValue}`);

        rangeInput.on('input', function() {
            const value = this.value;
            console.log(`loadMaestroSettings: Stat ${stat} input changed, value = ${value}`);
            valueSpan.text(value);
            extension_settings.maestro[stat] = parseInt(value);
            maestroStats[stat] = parseInt(value);
            saveSettingsDebounced();
            console.log(`loadMaestroSettings: Stat ${stat} updated, extension_settings.maestro[${stat}] = ${extension_settings.maestro[stat]}, maestroStats[${stat}] = ${maestroStats[stat]}`);
        });
    }

    // Remove obsolete stats from settings
    for (const stat in extension_settings.maestro) {
        if (!currentStats.includes(stat)) {
            console.log(`loadMaestroSettings: Removing obsolete stat ${stat} from settings`);
            delete extension_settings.maestro[stat];
            delete maestroStats[stat];
        }
    }

    console.log("loadMaestroSettings: Completed");
}

function replaceVariables(move, action, outcome) {
    return defaultSettings.prompt_impersonate.replace(/\{\{(\w+)\}\}/g, (match, variable) => {
        switch(variable) {
            /* case 'user': return user; */
            case 'move': return move;
            case 'action': return action;
            case 'outcome': return outcome;
            default: return match;
        }
    });
}

async function loadMoves() {
    console.log("loadMoves: Starting");
    try {
        const response = await fetch(`${extensionFolderPath}/moves.json`);
        moves = await response.json();
        console.log("loadMoves: Moves loaded successfully", moves);
    } catch (error) {
        console.error("loadMoves: Error loading moves:", error);
    }
    console.log("loadMoves: Completed");
}

function createMoveButtons(container) {
    console.log("createMoveButtons: Starting", container);
    moves.forEach(move => {
        console.log("createMoveButtons: Processing move", move);

        // Create a container for the button and description
        const moveContainer = $('<div>', {
            class: 'move-item' // Add a class for styling
        });

        const button = $('<button>', {
            class: 'menu_button',
            text: move.name,
        });
        button.on('click', () => performMove(move));

        // Create the description element
        const moveInfo = $('<span>', {
            class: 'move-description',
            text: `${move.description} (+${move.stat})`
        });

        // Append the button and description to the container
        moveContainer.append(button);
        moveContainer.append(moveInfo);

        // Append the container to the main container
        container.append(moveContainer);

        console.log("createMoveButtons: Button appended for move", move.name);
    });
    console.log("createMoveButtons: Completed");
}



async function performMove(move) {
    console.log("performMove: Starting", move);
    const context = getContext();
    const statBonus = maestroStats[move.stat] || 0;
    let actionDesc = ''; // Initialize actionDesc with an empty string

    actionDesc = await Popup.show.input(
        `[${move.name}] Okay, but what do you do? Explain what you're going to attempt "I shoot that guy!" "I run thru the giant's legs!" "I try to seduce him!"`,
        actionDesc,
        '',
        { okButton: 'Check it!', cancelButton: 'Nevermind..' }
    );
    context.sendSystemMessage('generic', `[${move.name}] - \"${actionDesc}\"`)

    console.info(`User is going to: ${actionDesc}`)

    const { die1, die2 } = roll2d6();

    console.log(`performMove: Stat bonus for ${move.stat} = ${statBonus}`);
    const finalTotal = die1 + die2 + statBonus;
    console.log(`performMove: finalTotal = ${finalTotal}`);
    
    let outcomeText;
    if (finalTotal >= 10) {
        outcomeText = move.success;
    } else if (finalTotal >= 7) {
        outcomeText = Array.isArray(move.partialsuccess) 
            ? move.partialsuccess[Math.floor(Math.random() * move.partialsuccess.length)]
            : move.partialsuccess;
    } else {
        outcomeText = move.fail;
    }

    console.log(`performMove: Outcome text = ${outcomeText}`);
    
    const rollMessage = formatRollResult(die1, die2, statBonus, finalTotal);
    console.info(rollMessage);
    console.info(`Outcome: ${outcomeText}`);
    console.log("performMove: Completed");

    context.sendSystemMessage('generic', `${rollMessage}\nOutcome: ${outcomeText}`);

    const inputTextarea = document.querySelector('#send_textarea');
    if (!(inputTextarea instanceof HTMLTextAreaElement)) {
        return;
    }

    console.log(String(extension_settings.maestro?.prompt_impersonate), {move: move.description, action: actionDesc, outcome: outcomeText});

    let impersonatePrompt = extension_settings.maestro?.prompt_impersonate
    impersonatePrompt = replaceVariables(move.description, actionDesc, outcomeText);

    const quiet_prompt = `/impersonate await=true ${impersonatePrompt}`;
    inputTextarea.value = quiet_prompt;

}


const roll2d6 = () => {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    console.log(`roll2d6: Rolling 2d6, die1 = ${die1}, die2 = ${die2}`);
    return { die1, die2 };
};


const formatRollResult = (die1, die2, statBonus, total) => {
    const signedBonus = statBonus >= 0 ? `+${statBonus}` : signedBonus;
    const message = `🎲🎲 Rolling 2d6${signedBonus}: [${die1}+${die2}]${signedBonus} = ${total}`;
    console.info(message);
    return message;
};

async function loadPopoutLayout() {
    console.log("loadPopoutLayout: Starting");
    try {
        const popoutHtml = await $.get(`${extensionFolderPath}/popout.html`);
        console.log("loadPopoutLayout: popoutHtml loaded", popoutHtml);
        return popoutHtml;
    } catch (error) {
        console.error("loadPopoutLayout: Error loading popout.html:", error);
        return null;
    }
}

function doPopout(e) {
    console.log("doPopout: Starting");
    const target = e.target;

    if ($('#maestroExtensionPopout').length === 0) {
        console.debug('doPopout: did not see popout yet, creating');
        const originalHTMLClone = $(target).closest('.inline-drawer').find('.inline-drawer-content').html();
        const originalElement = $(target).closest('.inline-drawer').find('.inline-drawer-content');

        loadPopoutLayout().then(popoutHtml => {
            if (!popoutHtml) return;

            const newElement = $(popoutHtml);
            $('#movingDivs').append(newElement);
            console.log("doPopout: newElement appended to movingDivs");
            
            createMoveButtons($('#maestroMoveButtons', newElement));
            console.log("doPopout: Move buttons created");
            
            $('.maestro_move_block', newElement).append(originalHTMLClone);
            console.log("doPopout: originalHTMLClone appended to maestro_move_block");

            $('#maestroExtensionPopoutClose').on('click', function() {
                $('#maestroExtensionDrawerContents').removeClass('scrollY');
                const maestroPopoutHTML = $('#maestroExtensionDrawerContents');
                $('#maestroExtensionPopout').fadeOut(animation_duration, () => {
                    originalElement.empty();
                    originalElement.append(maestroPopoutHTML);
                    $('#maestroExtensionPopout').remove();
                });
            });
            console.log("doPopout: Close button event listener attached");

            // Initialize values
            for (const stat of Object.keys(maestroStats)) {
                const mainValue = maestroStats[stat];
                const popoutSlider = $(`#maestro_stat_${stat}`, newElement);
                popoutSlider.val(mainValue);
                $(`#maestro_stat_${stat}_value`, newElement).text(mainValue);
                console.log(`doPopout: Stat ${stat} initialized in popout, value = ${mainValue}`);

                popoutSlider.on('input', function() {
                    const newValue = this.value;
                    $(`#maestro_stat_${stat}_value`, newElement).text(newValue);
                    $(`#maestro_stat_${stat}`).val(newValue);
                    $(`#maestro_stat_${stat}_value`).text(newValue);
                    extension_settings.maestro[stat] = parseInt(newValue);
                    maestroStats[stat] = parseInt(newValue);
                    saveSettingsDebounced();
                    console.log(`doPopout: Stat ${stat} in popout updated, newValue = ${newValue}`);
                });
            }
            $('#maestroExtensionPopout').fadeIn(animation_duration);
            console.log("doPopout: Popout fadeIn completed");
        });
    } else {
        console.debug('saw existing popout, removing');
        $('#maestroExtensionPopout').fadeOut(animation_duration, () => { $('#maestroExtensionPopoutClose').trigger('click'); });
    }
    console.log("doPopout: Completed");
}

jQuery(async () => {
    console.log("jQuery: Starting");
    try {
        await loadMaestroSettings();
        console.log("jQuery: loadMaestroSettings completed");
    } catch (error) {
        console.error("jQuery: Error loading Maestro settings or moves:", error);
    }

    $(document).on('click', '#maestroExtensionPopoutButton', doPopout);
    console.log("jQuery: Popout button event listener attached");

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'awroll',
        aliases: ['aw'],
        callback: (namedArgs, unnamedArgs) => {
            $('#maestroExtensionPopoutButton').trigger('click');
            return "Popping out Maestro!";
        },
        returns: 'opens PbtA dice roller',
        namedArgumentList: [],
        unnamedArgumentList: [],
        helpString: ``
    }));
    console.log("jQuery: Completed");
});
