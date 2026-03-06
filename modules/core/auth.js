const logger = require('./logger');

// Cache for admin role id per guild
const adminRoleCache = new Map();

function setCachedAdminRole(guildId, roleId) {
    adminRoleCache.set(guildId, roleId || null);
}

async function getCachedAdminRole(guildId, getAdminRole) {
    if (!adminRoleCache.has(guildId)) {
        const roleId = await getAdminRole(guildId);
        adminRoleCache.set(guildId, roleId || null);
    }
    return adminRoleCache.get(guildId);
}

async function hasAdminAccess(interaction, getAdminRole) {
    const { guildId, memberPermissions, member } = interaction;

    if (!guildId) {
        return memberPermissions?.has('Administrator') || false;
    }

    const adminRoleId = await getCachedAdminRole(guildId, getAdminRole);

    if (!adminRoleId) {
        return memberPermissions?.has('Administrator') || false;
    }

    if (!member || !member.roles || !member.roles.cache) {
        return false;
    }

    return member.roles.cache.has(adminRoleId);
}

module.exports = {
    hasAdminAccess,
    setCachedAdminRole,
    getCachedAdminRole,
    adminRoleCache
};
