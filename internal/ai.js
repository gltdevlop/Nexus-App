const fs = require('fs');
const path = require('path');

/**
 * AI Service Module
 * Handles configuration for AI provider selection (Gemini, ChatGPT, Claude, etc.)
 */

const AI_PROVIDERS = {
    gemini: {
        name: 'Gemini',
        url: 'https://gemini.google.com',
        icon: '🤖'
    },
    chatgpt: {
        name: 'ChatGPT',
        url: 'https://chat.openai.com',
        icon: '💬'
    },
    claude: {
        name: 'Claude',
        url: 'https://claude.ai',
        icon: '🧠'
    },
    deepseek: {
        name: 'DeepSeek',
        url: 'https://chat.deepseek.com',
        icon: '🔍'
    },
    grok: {
        name: 'Grok',
        url: 'https://x.com/i/grok',
        icon: '🚀'
    },
    perplexity: {
        name: 'Perplexity',
        url: 'https://www.perplexity.ai',
        icon: '🔮'
    },
    mistral: {
        name: 'Mistral',
        url: 'https://chat.mistral.ai',
        icon: '🌪️'
    },
    llama: {
        name: 'Llama',
        url: 'https://www.llama.com',
        icon: '🦙'
    }
};

module.exports = function setupAi(ipcMain, userDataPath) {
    const configPath = path.join(userDataPath, 'ai-config.json');

    /**
     * Get AI configuration
     */
    ipcMain.handle('ai:getConfig', async () => {
        try {
            if (!fs.existsSync(configPath)) {
                return {
                    configured: false,
                    provider: null,
                    url: null
                };
            }

            const data = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(data);

            // Ensure the provider exists and add URL if missing
            if (config.provider && AI_PROVIDERS[config.provider]) {
                config.url = AI_PROVIDERS[config.provider].url;
                config.configured = true;
            }

            return config;
        } catch (error) {
            console.error('Error reading AI config:', error);
            return {
                configured: false,
                provider: null,
                url: null,
                error: error.message
            };
        }
    });

    /**
     * Save AI configuration
     */
    ipcMain.handle('ai:saveConfig', async (event, config) => {
        try {
            // Validate provider
            if (config.provider && !AI_PROVIDERS[config.provider]) {
                return {
                    success: false,
                    error: 'Invalid AI provider'
                };
            }

            // Add URL from provider definition
            if (config.provider) {
                config.url = AI_PROVIDERS[config.provider].url;
                config.configured = true;
            }

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');

            return {
                success: true,
                config: config
            };
        } catch (error) {
            console.error('Error saving AI config:', error);
            return {
                success: false,
                error: error.message
            };
        }
    });

    /**
     * Get available AI providers
     */
    ipcMain.handle('ai:getProviders', async () => {
        return AI_PROVIDERS;
    });
};
