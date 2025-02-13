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
        results.push({
            sides: numSides,
            roll: Math.floor(Math.random() * numSides) + 1
        });
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

    // Send move list to UI
    let moveList = "Choose a basic move:\n";
    const Moves = basicMoves.forEach((move, index) => {
            moveList += `${index + 1}. <div class="move"><button class="move">${move.name}</button><span class="text"> ${move.stat}</span></button></div>`;
        }
        newMoves = `<div class=\"moves\">${Moves.join("")}</div>`
    );
        
    await sendMessageToUI(newMoves);

    // Wait for user input
    const userChoice = await waitForUserInput();
    const choice = parseInt(userChoice) - 1;

    // Validate input
    if (isNaN(choice) || choice < 0 || choice >= basicMoves.length) {
        await sendMessageToUI("Invalid choice. Please try again.");
        return;
    }

    const selectedMove = basicMoves[choice];
    
    // Send move details to UI
    let falloutDetails = `You selected: ${selectedMove.name} ${selectedMove.stat}\n`;
    falloutDetails += selectedMove.description + "\n";

    if (selectedMove.holds) {
        falloutDetails += "\nHolds:\n" + selectedMove.holds.join("\n");
    }
    
    if (selectedMove.questions) {
        falloutDetails += "\nQuestions:\n" + selectedMove.questions.join("\n");
    }

    toastr.info(falloutDetails);

    // Roll dice and show results
    const diceRolls = rollDice([6, 6]);
    const total = diceRolls[0].roll + diceRolls[1].roll;
    
    let rollResult = `Rolling 2d6...\n`;
    rollResult += `Dice 1: ${diceRolls[0].roll}\n`;
    rollResult += `Dice 2: ${diceRolls[1].roll}\n`;
    rollResult += `Total: ${total}\n\n`;

    if (total >= 10) {
        rollResult += "Success!\n" + selectedMove.success;
        if (selectedMove.questions) {
            rollResult += "\nYou may ask a follow-up question.";
        }
    } else if (total >= 7) {
        rollResult += "Partial Success!\n";
        if (Array.isArray(selectedMove.partialSuccess)) {
            rollResult += "Choose one:\n" + 
                selectedMove.partialSuccess.map((o, i) => `${i+1}. ${o}`).join("\n");
        } else {
            rollResult += selectedMove.partialSuccess;
        }
    } else {
        rollResult += "Fail!\n" + selectedMove.fail;
    }

    toastr.info(rollResult);
}

// Helper function to wait for user input
async function waitForUserInput() {
    return new Promise(resolve => {
        const context = getContext();
        const originalLength = context.chat.length;
        
        const checkInterval = setInterval(() => {
            if (context.chat.length > originalLength) {
                clearInterval(checkInterval);
                const lastMessage = context.chat[context.chat.length - 1];
                resolve(lastMessage.mes.trim());
            }
        }, 100);
    });
}

/**
 * Parses the DiceMaestro response and returns the fallout buttons
 * @param {string} response
 * @returns {string} text
 */

// NEED TO CHANGE THIS TO VARIOUS MOVES OPTIONS
function parseMoves(response) {
    const moves = [];
 
    if (moves.length === 0) {
        return;
    }

    const newMoves = moves.map((suggestion) =>
`<div class="move"><button class="move">${move}</button><span class="text">${move}</span></button></div>`);
    return `<div class=\"move\">${newMoves.join("")}</div>`
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
 * Handles the DiceMaestro move fallout generation
 * @returns
 */
async function requestDiceMaestroFallout() {
    const context = getContext();
    const chat = context.chat;

    // no action specified
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
        //Put options for moves here
    };

    context.chat.push(messageObject);
    context.addOneMessage(messageObject, { showSwipes: false, forceId: chat.length - 1 });
}

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
            await beginDiceMaestro();
            return '';
        },
        helpString: 'Triggers DiceMaestro Roller Interface.',
        SlashCommandArgument.fromProps({ description: 'action user is taking',
            typeList: ARGUMENT_TYPE.STRING
            isRequired: false,
        })
    }));

    MacrosParser.registerMacro('suggestionNumber', () => `${extension_settings.DiceMaestro_responses?.num_responses || defaultSettings.num_responses}`);


});
