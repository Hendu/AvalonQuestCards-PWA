// =============================================================================
// deviceId.ts
//
// Generates and persists a random device ID in localStorage.
// This is how the app knows "which player am I?" across page refreshes.
//
// When a player joins a room, their deviceId gets saved to the Firestore
// room document along with their name. When vote cards should appear,
// the app checks if THIS device's ID is in the mission player list.
//
// It's not authentication -- just a stable random identifier per browser/device.
// If someone clears their localStorage they'd get a new ID, but that's fine
// for a game session that lasts an hour.
// =============================================================================

const STORAGE_KEY = 'avalon_device_id';

// Generate a random 12-character ID
function generateDeviceId(): string {
  const chars = 'ABCDEFGHJKMNPQRTUWXYZabcdefghjkmnpqrtuwxyz234679';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Get the existing device ID or create one and save it
export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const newId = generateDeviceId();
    localStorage.setItem(STORAGE_KEY, newId);
    return newId;
  } catch (e) {
    // localStorage unavailable (private browsing on some browsers) -- generate ephemeral ID
    return generateDeviceId();
  }
}
