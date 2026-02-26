const axios = require('axios');
const logger = require('./logger');

/**
 * Ping a healthcheck URL stored in an environment variable.
 *
 * @param {string} envKey Name of the environment variable containing the URL
 */
function ping(envKey) {
    const url = process.env[envKey];
    if (!url) {
        return;
    }

    axios.get(url).catch(err => {
        // Log a warning but don't let a failed ping crash the job
        logger.warn(`Healthcheck ping failed for ${envKey} (${url}):`, err.message);
    });
}

module.exports = {
    ping
};
