// Environment-specific settings
const ENV = import.meta.env.MODE;

interface Settings {
    apiUrl: string;
    appName: string;
    logoUrl: string;
    // Add other settings here as needed
}

// Get the current host
const currentHost = window.location.hostname;
const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

const productionSettings: Settings = {
    apiUrl: 'https://hopbot-api.ironcliff.ai',
    appName: 'HopBot',
    logoUrl: '/cognify-icon.svg'  // Using existing icon
};

const developmentSettings: Settings = {
    // Use the current host for the API URL in development
    apiUrl: isLocalhost ? 'http://localhost:8000' : `http://${currentHost}:8000`,
    appName: 'HopBot (Dev)',
    logoUrl: '/cognify-icon.svg'  // Using existing icon
};

// Select settings based on environment
const settings: Settings = ENV === 'production' ? productionSettings : developmentSettings;

export default settings; 