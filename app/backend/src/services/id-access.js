// Identity documents on the admin PC: the computer holding the owner key opens ID numbers and
// photos without the admin PIN. Front desks still need the PIN.
//
// After the PIN has been entered once on the admin PC, the vault's private key is also wrapped
// with a secret derived from the owner key and kept in a file on this computer (beside the owner
// key, outside the hotel's data). At start-up the vault is opened from that file. Removing the
// owner key removes the file too.
const fs = require('fs');
const vault = require('./vault');
const logger = require('../lib/logger');

const PURPOSE = 'identity vault';

function createIdAccess({ store, owner, file }) {
  const secret = () => owner.deriveSecret(PURPOSE);

  /** True when identity documents open on this computer without a PIN. */
  function available() {
    return owner.loaded && vault.isUnlocked(store);
  }

  /** Keeps the vault open on this computer from now on (call while it is unlocked). */
  function remember() {
    if (!owner.loaded) return;
    const wrap = vault.wrapForMachine(store, secret());
    if (wrap) fs.writeFileSync(file, JSON.stringify(wrap), { mode: 0o600 });
  }

  /** Opens the vault from this computer's wrap, if there is one that fits the current data. */
  function restore() {
    if (!owner.loaded || vault.isUnlocked(store)) return;
    let wrap;
    try {
      wrap = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (_err) {
      return; // Not set up yet: the PIN is needed once on this computer.
    }
    if (!vault.unlockForMachine(store, wrap, secret())) logger.warn('Admin PC ID access needs the PIN again (data or owner key changed)');
  }

  function forget() {
    fs.rmSync(file, { force: true });
  }

  return { available, remember, restore, forget };
}

module.exports = { createIdAccess };
