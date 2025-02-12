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
    llm_prompt: `Stop the roleplay now and provide a response for the next story beat on {{user}} perspective. Ensure the suggestion aligns with its corresponding description:
1. Protagonist acts under serious pressure, requiring unusual discipline, resolve, endurance or care.
2. Protagonist uses the threat of violence to control the antagonist behavior and intends to carry through.
3. Protagonist uses violence to gain the upper hand or seize control of his objective.
4. Protagonist is investigating his target, with a library, a dossier or a database.
5. Protagonist tries to convince someone to do what they want, using promises, lies or bluster.

Each suggestion surrounded by \`<suggestion>\` tags. E.g:
<suggestion>suggestion_1</suggestion>
<suggestion>suggestion_2</suggestion>
...

Do not include any other content in your response.`,
    llm_prompt_impersonate: `[Event Direction for the next story beat on {{user}} perspective: \`{{statsNumber}}\`]
[Based on the expected events, write the user response]`,
    apply_wi_an: true,
    num_responses: 5,
    response_length: 500,
};
let inApiCall = false;

/**
 * Parses the DiceMaestro response and returns the suggestions buttons
 * @param {string} response
 * @returns {string} text
 */
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
 * Sends the parsed DiceMaestro response to the SillyTavern UI
 * @param {string} parsedResponse
 */
async function sendMessageToUI(parsedResponse) {
    const context = getContext();
    const chat = context.chat;

    const messageObject = {
        name: "DiceMaestro Suggestions",
        is_user: true,
        is_system: false,
        send_date: getMessageTimeStamp(),
        mes: `${parsedResponse}`,
        mesId: context.chat.length,
        extra: {
            api: 'manual',
            model: 'DiceMaestro',
        }
    };

    context.chat.push(messageObject);
    // await eventSource.emit(event_types.MESSAGE_SENT, (chat.length - 1));
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
        helpString: 'Triggers DiceMaestro responses generation.',
    }));

    MacrosParser.registerMacro('suggestionNumber', () => `${extension_settings.DiceMaestro_responses?.num_responses || defaultSettings.num_responses}`);

    // Event delegation for DiceMaestro buttons
    $(document).on('click', 'button.custom-edit-suggestion', handleDiceMaestroBtn);
    $(document).on('click', 'button.custom-suggestion', handleDiceMaestroBtn);
});
