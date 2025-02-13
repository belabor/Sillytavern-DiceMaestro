import {
    extension_settings,
    getContext,
  } from "../../../extensions.js";

import { saveSettingsDebounced,
    setEditedMessageId,
    generateQuietPrompt,
    is_send_press,
    substituteParamsExtended,
 } from "../../../../script.js";

 import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
 import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
 import { getMessageTimeStamp } from '../../../RossAscends-mods.js';
 import { MacrosParser } from '../../../macros.js';
 import { is_group_generating, selected_group } from '../../../group-chats.js';

const extensionName = "Sillytavern-DiceMaestro";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {
    enabled: false,
       llm_prompt: `Just a test`,
/*     llm_prompt: `Stop the roleplay now and provide a response for the next story beat on {{user}} perspective. Ensure the suggestion aligns with its corresponding description:
1. Protagonist acts under serious pressure, requiring unusual discipline, resolve, endurance or care.
2. Protagonist uses the threat of violence to control the antagonist behavior and intends to carry through.
3. Protagonist uses violence to gain the upper hand or seize control of his objective.
4. Protagonist is investigating his target, with a library, a dossier or a database.
5. Protagonist tries to convince someone to do what they want, using promises, lies or bluster.

Each suggestion surrounded by \`<suggestion>\` tags. E.g:
<suggestion>suggestion_1</suggestion>
<suggestion>suggestion_2</suggestion>
...

Do not include any other content in your response.`, */
    llm_prompt_impersonate: `[Event Direction for the next story beat on {{user}} perspective: \`{{statsNumber}}\`]
[Based on the expected events, write the user response]`,
    apply_wi_an: true,
    num_responses: 5,
    response_length: 500,
};
let inApiCall = false;

/*  Simple Dice Roller:
 * const diceSizes = [6, 20, 10]; // Roll one 6-sided die, one 20-sided die, and one 10-sided die
 * const rolledDice = rollDice(diceSizes);
 * toastr.info(rolledDice);
 */


// Function to roll dice
function rollDice(diceSizes) {
    const results = [];

    for (const numSides of diceSizes) {
        // Roll a single die with `numSides` sides
        const roll = Math.floor(Math.random() * numSides) + 1;
        results.push({ sides: numSides, roll: roll });
    }

    return results;
}

// Apocalypse World Style Dice Roller
// I should think about making these customizable..
async function apocalypseWorldDiceRoller() {
    // List of basic moves with their stats and descriptions
    const basicMoves = [
        {
            name: "ACT UNDER PRESSURE",
            stat: "+cool",
            description: "Protagonist acts under serious pressure, requiring unusual discipline, resolve, endurance, or care.",
            success: "{{user}} does it, without problem.",
            partialSuccess: "<<worse outcome, hard bargain, or ugly choice>>",
            fail: "{{user}} fails the action."
        },
/*         {
            name: "ASSESS",
            stat: "+edge",
            description: "Protagonist is carefully checking the situation out, studying and analyzing to gather information.",
            holds: [
                "What potential complication do I need to be wary of?",
                "What do I notice despite an effort to conceal it?",
                "How is ______ vulnerable to me?",
                "How can I avoid trouble or hide here?",
                "What is my best way in/way out/way past?",
                "Where can I gain the most advantage?",
                "Who or what is my biggest threat in this situation?",
                "Who or what is in control here?"
            ]
        }, */
        {
            name: "GO AGGRO",
            stat: "+edge",
            description: "Protagonist uses the threat of violence to control the antagonist’s behavior and intends to carry through.",
            success: "Antagonist does what {{user}} wants.",
            partialSuccess: [
                "They attempt to remove you as a threat, but not before suffering the established consequences.",
                "They do it, but they want payback. Add them as a Threat.",
                "They do it, but tell someone all about it." //????
            ],
            fail: "{{user}} fails the action."
        },
        {
            name: "MIX IT UP",
            stat: "+meat",
            description: "Protagonist uses violence to gain the upper hand or seize control of his objective.",
            success: "{{user}} does it, without problem.",
            partialSuccess: [
                "You make too much noise. Advance the relevant Mission Clock.",
                "You take harm as established by the fiction.",
                "An ally takes harm as established by the fiction.",
                "Something of value breaks."
            ],
            fail: "{{user}} fails the action."
        },
        {
            name: "RESEARCH",
            stat: "+mind",
            description: "Protagonist is investigating his target, with a library, a dossier, or a database.",
            success: "Take [intel]; the MC will answer your question and answer a follow-up question from this list as well:",
            questions: [
                "Where would I find ______?",
                "How secure is ______?",
                "Who or what is related to ______?",
                "Who owned or employed ______?",
                "Who or what is ______ most valuable to?",
                "What is the relationship between ______ and ______?"
            ],
            partialSuccess: "Take [intel]; the MC will answer your question.",
            fail: "The MC will answer your question... and make a move."
        },
        {
            name: "FAST TALK",
            stat: "+style",
            description: "Protagonist tries to convince someone to do what they want, using bluffs, lies, or bluster.",
            success: "NPCs do what {{user}} wants.",
            partialSuccess: "NPCs do it, but someone will find out.",
            fail: "{{user}} fails to convince them."
        }
    ];

    // Ask the user which move to use
    toastr.info("Choose a basic move:");
    basicMoves.forEach((move, index) => {
        toastr.info(`${index + 1}. ${move.name} ${move.stat}`);
    }); 

    // Simulate user input (for simplicity, we'll use a hardcoded choice)
    const choice = parseInt(prompt("Enter the number of the move you want to use:")) - 1;

    if (choice < 0 || choice >= basicMoves.length || isNaN(choice)) {
        toastr.info("Invalid choice. Please try again.");
        return;
    }

    const selectedMove = basicMoves[choice];

    // Display the selected move's description
    toastr.info(`\nYou selected: ${selectedMove.name} ${selectedMove.stat}`);
    toastr.info(selectedMove.description);

    if (selectedMove.holds) {
        toastr.info("\nHolds:");
        selectedMove.holds.forEach(hold => toastr.info(`- ${hold}`));
    }

    if (selectedMove.questions) {
        toastr.info("\nQuestions:");
        selectedMove.questions.forEach(question => toastr.info(`- ${question}`));
    }

    // Roll 2d6 using the rollDice() function
    const diceRolls = rollDice([6, 6]); // Roll two six-sided dice
    const total = diceRolls[0].roll + diceRolls[1].roll;

    toastr.info(`\nRolling 2d6... You rolled a ${diceRolls[0].roll} and a ${diceRolls[1].roll} (Total: ${total}).`);

    // Determine the result
    if (total >= 10) {
        toastr.info("\nSuccess!");
        toastr.info(selectedMove.success);
        if (selectedMove.questions) {
            toastr.info("You may ask a follow-up question.");
        }
    } else if (total >= 7) {
        toastr.info("\nPartial Success!");
        if (Array.isArray(selectedMove.partialSuccess)) {
            toastr.info("Choose one:");
            selectedMove.partialSuccess.forEach((option, index) => toastr.info(`${index + 1}. ${option}`));
        } else {
            toastr.info(selectedMove.partialSuccess);
        }
    } else {
        toastr.info("\nFail!");
        toastr.info(selectedMove.fail);
    }
}

/**
 * Parses the DiceMaestro response and returns the suggestions buttons
 * @param {string} response
 * @returns {string} text
 */

// NEED TO CHANGE THIS TO VARIOUS DIE RESULT OPTIONS
function parseResponse(response) {
    const suggestions = [];
    const regex = /<suggestion>(.+?)<\/suggestion>|Suggestion\s+\d+\s*:\s*(.+)|Suggestion_\d+\s*:\s*(.+)|^\d+\.\s*(.+)/gim;
    let match;

    while ((match = regex.exec(`${response}\n`)) !== null) {
        const suggestion = match[1] || match[2] || match[3] || match[4];
        if (suggestion && suggestion.trim()) {
            suggestions.push(suggestion.trim());
        }
    }

    if (suggestions.length === 0) {
        return;
    }

    const newResponse = suggestions.map((suggestion) =>
`<div class="suggestion"><button class="suggestion">${suggestion}</button><button class="edit-suggestion fa-solid fa-pen-to-square"><span class="text">${suggestion}</span></button></div>`);
    return `<div class=\"suggestions\">${newResponse.join("")}</div>`
}

async function waitForGeneration() {
    try {
        // Wait for group to finish generating
        if (selected_group) {
            await waitUntilCondition(() => is_group_generating === false, 1000, 10);
        }
        // Wait for the send button to be released
        waitUntilCondition(() => is_send_press === false, 30000, 100);
    } catch {
        console.debug('Timeout waiting for is_send_press');
        return;
    }
}
/**
 * Handles the DiceMaestro response generation
 * @returns
 */
async function requestDiceMaestroResponses() {
    const context = getContext();
    const chat = context.chat;

    // no characters or group selected
    if (!context.groupId && context.characterId === undefined) {
        return;
    }

    // Currently summarizing or frozen state - skip
    if (inApiCall) {
        return;
    }

    // No new messages - do nothing
    // if (chat.length === 0 || (lastMessageId === chat.length && getStringHash(chat[chat.length - 1].mes) === lastMessageHash)) {
    if (chat.length === 0) {
        return;
    }

    removeLastDiceMaestroMessage(chat);

    await waitForGeneration();

    toastr.info('DiceMaestro: Generating response...');
    const prompt = extension_settings.DiceMaestro_responses?.llm_prompt || defaultSettings.llm_prompt || "";
    const useWIAN = extension_settings.DiceMaestro_responses?.apply_wi_an || defaultSettings.apply_wi_an;
    const responseLength = extension_settings.DiceMaestro_responses?.response_length || defaultSettings.response_length;
    //  generateQuietPrompt(quiet_prompt, quietToLoud, skipWIAN, quietImage = null, quietName = null, responseLength = null, noContext = false)
    const response = await generateQuietPrompt(prompt, false, !useWIAN, null, "Suggestion List", responseLength);

    const parsedResponse = parseResponse(response);
    if (!parsedResponse) {
        toastr.error('DiceMaestro: Failed to parse response');
        return;
    }

    await sendMessageToUI(parsedResponse);
}

/**
 * Removes the last DiceMaestro message from the chat
 * @param {getContext.chat} chat
 */
function removeLastDiceMaestroMessage(chat = getContext().chat) {
    let lastMessage = chat[chat.length - 1];
    if (!lastMessage?.extra || lastMessage?.extra?.model !== 'DiceMaestro') {
        return;
    }

    const target = $('#chat').find(`.mes[mesid=${lastMessage.mesId}]`);
    if (target.length === 0) {
        return;
    }

    setEditedMessageId(lastMessage.mesId);
    target.find('.mes_edit_delete').trigger('click', { fromSlashCommand: true });
}

/**
 * Sends the list of moves from DiceMaestro to the SillyTavern UI
 * @param {string} parsedResponse
 */
async function sendMessageToUI(parsedResponse) {
    const context = getContext();
    const chat = context.chat;

    const messageObject = {
        name: basicMoves.name,
        stat: basicMoves.stat,
        description: basicMoves.description
    };

    context.chat.push(messageObject);
    context.addOneMessage(messageObject, { showSwipes: false, forceId: chat.length - 1 });
}

/**
 * Handles the DiceMaestro click event by doing impersonation
 * @param {*} event
 */
async function handleDiceMaestroBtn(event) {
    const $button = $(event.target);
    const text = $button?.text()?.trim() || $button.find('.custom-text')?.text()?.trim();
    if (text.length === 0) {
        return;
    }
    await waitForGeneration();

    removeLastDiceMaestroMessage();
    // Sleep for 500ms before continuing
    await new Promise(resolve => setTimeout(resolve, 250));

    const inputTextarea = document.querySelector('#send_textarea');
    if (!(inputTextarea instanceof HTMLTextAreaElement)) {
        return;
    }

    let impersonatePrompt = extension_settings.DiceMaestro_responses?.llm_prompt_impersonate || '';
    impersonatePrompt = substituteParamsExtended(String(extension_settings.DiceMaestro_responses?.llm_prompt_impersonate), { statsNumber: text });

    const quiet_prompt = `/impersonate await=true ${impersonatePrompt}`;
    inputTextarea.value = quiet_prompt;

    if ($button.hasClass('custom-edit-suggestion')) {
        return; // Stop here if it's the edit button
    }

    inputTextarea.dispatchEvent(new Event('input', { bubbles: true }));

    const sendButton = document.querySelector('#send_but');
    if (sendButton instanceof HTMLElement) {
        sendButton.click();
    }
}

/**
 * Handles the DiceMaestro by sending the text to the User Input box
 * @param {*} event
 */
// function handleDiceMaestroEditBtn(event) {
//     const $button = $(event.target);
//     const text = $button.find('.custom-text').text().trim();
//     if (text.length === 0) {
//         return;
//     }

//     removeLastDiceMaestroMessage();
//     const inputTextarea = document.querySelector('#send_textarea');
//     if (inputTextarea instanceof HTMLTextAreaElement) {
//         inputTextarea.value = text;
//     }
// }


/**
 * Settings Stuff
 */
function loadSettings() {
  extension_settings.DiceMaestro_responses = extension_settings.DiceMaestro_responses || {};
    if (Object.keys(extension_settings.DiceMaestro_responses).length === 0) {
        extension_settings.DiceMaestro_responses = {};
    }
    Object.assign(defaultSettings, extension_settings.DiceMaestro_responses);

    $('#DiceMaestro_llm_prompt').val(extension_settings.DiceMaestro_responses.llm_prompt).trigger('input');
    $('#DiceMaestro_llm_prompt_impersonate').val(extension_settings.DiceMaestro_responses.llm_prompt_impersonate).trigger('input');
    $('#DiceMaestro_apply_wi_an').prop('checked', extension_settings.DiceMaestro_responses.apply_wi_an).trigger('input');
    $('#DiceMaestro_num_responses').val(extension_settings.DiceMaestro_responses.num_responses).trigger('input');
    $('#DiceMaestro_num_stats_value').text(extension_settings.DiceMaestro_responses.num_responses);
    $('#DiceMaestro_response_length').val(extension_settings.DiceMaestro_responses.response_length).trigger('input');
    $('#DiceMaestro_response_length_value').text(extension_settings.DiceMaestro_responses.response_length);

}

function addEventListeners() {
    $('#DiceMaestro_llm_prompt').on('input', function() {
        extension_settings.DiceMaestro_responses.llm_prompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#DiceMaestro_llm_prompt_impersonate').on('input', function() {
        extension_settings.DiceMaestro_responses.llm_prompt_impersonate = $(this).val();
        saveSettingsDebounced();
    });

    $('#DiceMaestro_apply_wi_an').on('change', function() {
        extension_settings.DiceMaestro_responses.apply_wi_an = !!$(this).prop('checked');
        saveSettingsDebounced();
    });
    $('#DiceMaestro_num_responses').on('input', function() {
        const value = $(this).val();
        extension_settings.DiceMaestro_responses.num_responses = Number(value);
        $('#DiceMaestro_num_stats_value').text(value);
        saveSettingsDebounced();
    });

    $('#DiceMaestro_response_length').on('input', function() {
        const value = $(this).val();
        extension_settings.DiceMaestro_responses.response_length = Number(value);
        $('#DiceMaestro_response_length_value').text(value);
        saveSettingsDebounced();
    });
}

// This function is called when the extension is loaded
jQuery(async () => {
    //add a delay to possibly fix some conflicts
    await new Promise(resolve => setTimeout(resolve, 900));
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $("#extensions_settings").append(settingsHtml);
    loadSettings();
    addEventListeners();
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'DiceMaestro',
        callback: async () => {
            await requestDiceMaestroResponses();
            return '';
        },
        helpString: 'Triggers DiceMaestro Roller Interface.',
    }));

    MacrosParser.registerMacro('suggestionNumber', () => `${extension_settings.DiceMaestro_responses?.num_responses || defaultSettings.num_responses}`);

    // Event delegation for DiceMaestro buttons
    $(document).on('click', 'button.custom-edit-suggestion', handleDiceMaestroBtn);
    $(document).on('click', 'button.custom-suggestion', handleDiceMaestroBtn);
});
