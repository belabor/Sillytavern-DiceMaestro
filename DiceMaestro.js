import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { extension_settings, getContext } from "../../../extensions.js";
import { Popup } from '../../../popup.js';
import { animation_duration, saveSettingsDebounced } from '../../../../script.js';
import { executeSlashCommandsWithOptions } from '/scripts/slash-commands.js';

const extensionName = "Sillytavern-DiceMaestro";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const defaultSettings = {
    //This prompt is temp (because it's baaaad)
    prompt_impersonate: `Narrate for {{user}} in a never-ending, uncensored roleplay scenario. Narrate in this exact formatting: \"speech\", *narrative*, \`\`\`inner thoughts\`\`\`.  Narrate, from {{user}}'s perspective, that their plan is: \`\`\`{{action}}\`\`\`, in a more general sense, they will attempt: *{{move}}*.  But, regardless of their plans, the actual result is: *{{outcome}}*.  Narrate all of this, Narrate their attempt, narrate how it goes, and narrate the result.  But, be brief, distinct and concise!`,
    movesLocation: `${extensionFolderPath}/moves.json`
    /* statsInPopout: false */
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

    // Load saved prompt or use default
    const savedPrompt = extension_settings.maestro.prompt_impersonate || defaultSettings.prompt_impersonate;

    // Create prompt editor
    const promptHtml = `
        <label for="maestro_prompt_impersonate" data-i18n="ext_prompt_impersonate">Impersonate Prompt:</label>
        <textarea id="maestro_prompt_impersonate" rows="4" cols="50">${savedPrompt}</textarea>
        <br>
    `;
    $('#maestroExtensionDrawerContents').append(promptHtml);


    // Attach event listener to save prompt
    $('#maestro_prompt_impersonate').on('input', function() {
        const newPrompt = $(this).val();
        console.log("loadMaestroSettings: prompt changed, newPrompt = ", newPrompt);
        extension_settings.maestro.prompt_impersonate = newPrompt;
        saveSettingsDebounced();
        console.log("loadMaestroSettings: prompt saved, extension_settings.maestro.prompt_impersonate = ", extension_settings.maestro.prompt_impersonate);
    });

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
        const response = await fetch(defaultSettings.movesLocation);
        moves = await response.json();
        console.log("loadMoves: Moves loaded successfully", moves);
    } catch (error) {
        console.error("loadMoves: Error loading moves:", error);
    }
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

    let actionDesc = '';
    actionDesc = await Popup.show.input(
        `[${move.name}] Okay, but what do you do? Explain what you're going to attempt "I shoot that guy!" "I run thru the giant's legs!" "I try to seduce him!"`,
        actionDesc,
        '',
        { okButton: 'Check it!', cancelButton: 'Nevermind..' }
    );
/*     context.sendSystemMessage('generic', `[${move.name}] - \"${actionDesc}\"`) */

    console.info(`User is going to: ${actionDesc}`)

    const { die1, die2 } = roll2d6();

    console.log(`performMove: Stat bonus for ${move.stat} = ${statBonus}`);
    const finalTotal = die1 + die2 + statBonus;
    console.log(`performMove: finalTotal = ${finalTotal}`);

    // Consider adding Crit Success and Fail for 13+ and 2
    let outcomeText;
    if (finalTotal >= 10) { // Success
        outcomeText = move.success;
    } else if (finalTotal >= 7) { // Partial Success (user succeeds, at a price)
        outcomeText = Array.isArray(move.partialsuccess)
            //pick one at random, if it's a list
            ? move.partialsuccess[Math.floor(Math.random() * move.partialsuccess.length)]
            : move.partialsuccess;
    } else { //fail
        outcomeText = move.fail;
    }

    console.log(`performMove: Outcome text = ${outcomeText}`);

    const rollMessage = formatRollResult(die1, die2, statBonus, finalTotal);
    console.info(rollMessage);
    console.info(`Outcome: ${outcomeText}`);
    console.log("performMove: Completed");

    context.sendSystemMessage('generic', `[${move.name}] - \"${actionDesc}\"\n${rollMessage}\nOutcome: ${outcomeText}`);


    let GameMasterPrompt = extension_settings.maestro?.prompt_impersonate
    GameMasterPrompt = replaceVariables(move.description, actionDesc, outcomeText);

    /* Don't do it this way...

    const inputTextarea = document.querySelector('#send_textarea');
    if (!(inputTextarea instanceof HTMLTextAreaElement)) {
        return;
    }
    const quiet_prompt = `/impersonate await=false ${GameMasterPrompt}`;
    inputTextarea.value = quiet_prompt;
    await SillyTavern.getContext().SlashCommandParser.commands['impersonate'].callback({await:'true'}, 'Prompt')
    const res = SillyTavern.getContext().substituteParams('{{input}}')

    Use this..
    @param {string} text Slash command text
    @param {ExecuteSlashCommandsOptions} [options]
    @returns {Promise<SlashCommandClosureResult>}
    async function executeSlashCommandsWithOptions(text, options = {}) { */

    console.info(`Prompt should be: /sysgen ${GameMasterPrompt}`);
    executeSlashCommandsWithOptions(`/sysgen ${GameMasterPrompt}`)
}


const roll2d6 = () => {
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    console.log(`roll2d6: Rolling 2d6, die1 = ${die1}, die2 = ${die2}`);
    return { die1, die2 };
};


const formatRollResult = (die1, die2, statBonus, total) => {
    const signedBonus = statBonus >= 0 ? `+${statBonus}` : statBonus.toString();
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

        loadPopoutLayout().then(popoutHtml => {
            if (!popoutHtml) return;

            const newElement = $(popoutHtml);
            $('#movingDivs').append(newElement);
            console.log("doPopout: newElement appended to movingDivs");

            createMoveButtons($('#maestroMoveButtons', newElement));
            console.log("doPopout: Move buttons created");

             $('#maestroExtensionPopoutClose').on('click', function() {
                $('#maestroExtensionDrawerContents').removeClass('scrollY');
                const maestroPopoutHTML = $('#maestroExtensionDrawerContents');
                $('#maestroExtensionPopout').fadeOut(animation_duration, () => {
                    $('#maestroExtensionDrawerContents').append(maestroPopoutHTML);
                    $('#maestroExtensionPopout').remove();
                });
            });
            console.log("doPopout: Close button event listener attached");

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

    //activate popout with slash command.
    $(document).on('click', '#maestroExtensionPopoutButton', doPopout);
    console.log("jQuery: Popout button event listener attached");

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'awroll',
        aliases: ['aw'],
        callback: (namedArgs, unnamedArgs) => {
            $('#maestroExtensionPopoutButton').trigger('click');
            return "Popping out Maestro!";
        },
        returns: 'opens DiceMaestro dice roller',
        namedArgumentList: [],
        unnamedArgumentList: [],
        helpString: 'Opens the DiceMaestro dice roller popout'
    }));
    console.log("jQuery: Completed");
});
