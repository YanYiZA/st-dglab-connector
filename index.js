import { saveSettingsDebounced, eventSource, event_types } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE_NAME = 'dglab_connector';
const DEFAULT_SETTINGS = {
    enabled: true,
    queueOverride: false,
    hubApiUrl: 'http://127.0.0.1:8920',
    targetId: '1',
    maxStrength: 20,
    intensityMap: {
        'low': 5,
        'medium': 10,
        'high': 15
    }
};

function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = { ...DEFAULT_SETTINGS };
    }
    return extension_settings[MODULE_NAME];
}

function renderSettings() {
    const settings = getSettings();
    const html = `
    <div class="dglab-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>DG-Lab Connector</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content" style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label class="checkbox_label" style="flex: 1;">
                        <input type="checkbox" id="dglab_enabled" ${settings.enabled ? 'checked' : ''} />
                        <span>启用插件</span>
                    </label>
                    <label class="checkbox_label" style="flex: 1;" title="开启后，收到新指令时将自动清空当前队列中积压的旧指令，优先执行最新反馈。">
                        <input type="checkbox" id="dglab_queue_override" ${settings.queueOverride ? 'checked' : ''} />
                        <span>覆盖旧指令 ⓘ</span>
                    </label>
                </div>
                
                <hr style="margin: 5px 0; border-color: rgba(255,255,255,0.1);">
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Hub API 地址</label>
                    <input type="text" id="dglab_hub_url" class="text_pole" style="width: 100%; box-sizing: border-box;" value="${settings.hubApiUrl || ''}" placeholder="http://127.0.0.1:8920" />
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">目标设备 ID (Target ID)</label>
                    <input type="text" id="dglab_target_id" class="text_pole" style="width: 100%; box-sizing: border-box;" value="${settings.targetId || ''}" placeholder="1" />
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">最大强度 (100% 对应值)</label>
                    <input type="number" id="dglab_max_strength" class="text_pole" style="width: 100%; box-sizing: border-box;" value="${settings.maxStrength || 20}" placeholder="20" />
                    <small style="opacity: 0.7;">为了安全，请设定一个物理强度上限。</small>
                </div>

                <div style="margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <button id="dglab_test_btn" class="menu_button" style="width: 100%; padding: 8px; font-weight: bold; background-color: var(--smart-theme-body-bg); border: 1px solid var(--smart-theme-border);">
                        测试电击 (50%)
                    </button>
                    <div id="dglab_status" style="margin-top: 5px; font-size: 0.9em; min-height: 1.2em;"></div>
                </div>
            </div>
        </div>
    </div>
    `;
    return html;
}

function bindEvents() {
    const $settings = $('#extensions_settings');
    
    $settings.on('change', '#dglab_enabled', function() {
        getSettings().enabled = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $settings.on('change', '#dglab_queue_override', function() {
        getSettings().queueOverride = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $settings.on('input', '#dglab_hub_url', function() {
        getSettings().hubApiUrl = $(this).val();
        saveSettingsDebounced();
    });

    $settings.on('input', '#dglab_target_id', function() {
        getSettings().targetId = $(this).val();
        saveSettingsDebounced();
    });

    $settings.on('input', '#dglab_max_strength', function() {
        getSettings().maxStrength = parseInt($(this).val());
        saveSettingsDebounced();
    });

    $settings.on('click', '#dglab_test_btn', async function() {
        const btn = $(this);
        const originalText = btn.text();
        btn.prop('disabled', true).text('发送中...');
        
        try {
            await sendShock(50);
            $('#dglab_status').text('测试发送成功！').css('color', 'green');
        } catch (err) {
            $('#dglab_status').text('错误: ' + err.message).css('color', 'red');
        } finally {
            setTimeout(() => {
                btn.prop('disabled', false).text(originalText);
                setTimeout(() => $('#dglab_status').text(''), 3000);
            }, 1000);
        }
    });

}

async function sendShock(intensity, duration = 5.0) {
    const settings = getSettings();
    if (!settings.enabled) return;

    const maxStrength = settings.maxStrength || 20;
    let percentage = parseInt(intensity);
    if (percentage > 100) percentage = 100;
    if (percentage < 0) percentage = 0;

    const strengthVal = Math.round((percentage / 100) * maxStrength);
    const targetId = settings.targetId;
    const hubUrl = settings.hubApiUrl;

    console.log(`[DG-Lab] Processing shock: ${percentage}% -> Strength=${strengthVal}, Time=${duration}s`);

    const setStrength = async (val) => {
        const url = `${hubUrl}/api/v2/game/${targetId}/strength`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strength: { set: val }
            })
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
    };

    try {
        await setStrength(strengthVal);
        await new Promise(resolve => setTimeout(resolve, duration * 1000));
        await setStrength(0);
    } catch (err) {
        console.error('[DG-Lab] Shock failed:', err);
        try { await setStrength(0); } catch (e) { }
        throw err;
    }
}

// Regex to match [DG:10] or [DG:10:1.5] (Strength : Time in seconds)
// Improved to handle spaces: [DG: 10 : 1.5]
const SHOCK_REGEX = /\[(?:DG|SHOCK)\s*:\s*(\d+)(?:\s*:\s*(\d+(?:\.\d+)?))?\s*\]/gi;

const shockQueue = [];
let isProcessingQueue = false;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (shockQueue.length > 0) {
        const { intensity, duration } = shockQueue.shift();
        try {
            await sendShock(intensity, duration);
        } catch (err) {
            console.error('[DG-Lab] Queue processing error:', err);
            // If error, maybe wait a bit or just continue
            await delay(500); 
        }
    }

    isProcessingQueue = false;
}

function processMessage(text) {
    if (!text) return;
    
    const settings = getSettings();
    let match;
    let found = false;
    
    // Collect all new commands first
    const newCommands = [];
    while ((match = SHOCK_REGEX.exec(text)) !== null) {
        const intensity = parseInt(match[1]);
        // Default duration 5s if not specified
        const duration = match[2] ? parseFloat(match[2]) : 5.0; 

        if (!isNaN(intensity)) {
            console.log(`[DG-Lab] Found tag: Strength=${intensity}, Duration=${duration}s`);
            newCommands.push({ intensity, duration });
            found = true;
        }
    }

    if (found) {
        if (settings.queueOverride) {
            console.log('[DG-Lab] Override enabled: Clearing previous queue.');
            shockQueue.length = 0; // Clear existing queue
        }
        
        shockQueue.push(...newCommands);
        processQueue();
    }
}

// Hook into SillyTavern's message receiving
function onMessageReceived(id) {
    // id is the message index or object, depending on ST version.
    // Usually event passes the message id.
    // Let's try to get the message content from the DOM or context.
    
    // In recent ST versions, we can access chat history.
    // But for safety, let's look up the message element or use the context.
    
    // event_types.MESSAGE_RECEIVED is usually fired with the message id.
    console.log('[DG-Lab] Message received event:', id);
    
    // We can try to find the last message in the chat
    const chat = document.querySelector('#chat');
    if (!chat) return;
    
    const lastMessage = chat.querySelector('.mes:last-child .mes_text');
    if (lastMessage) {
        processMessage(lastMessage.innerText);
    }
}

function init() {
    console.log('[DG-Lab] Initializing extension...');
    
    // Inject Settings UI
    const $settingsContainer = $('#extensions_settings');
    if ($settingsContainer.length) {
        $settingsContainer.append(renderSettings());
        bindEvents();
    } else {
        console.error('[DG-Lab] #extensions_settings not found!');
    }

    // Monitor new messages using official event source
    eventSource.on(event_types.MESSAGE_RECEIVED, onMessageReceived);
    console.log('[DG-Lab] Event listener attached.');
}

// Wait for document ready
$(document).ready(init);
