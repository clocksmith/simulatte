# Local Lucyd study access

Owners: [local server](../../tools/serve-local.mjs), [local collection handler](../../tools/simulatte/lucyd-local-collection.mjs), and [collection lifecycle](../../public/simulatte/system-diagram/private-collection.js).

`npm run serve` automatically opens the full study collection on loopback when a
local password file is configured. Open <http://127.0.0.1:4173/system-diagram> and
use Choose problem. No password entry is required in the browser.

The default credential file is
`~/.local/state/deco/lucyd-local/password`, readable only by its owner (mode 600).
`LUCYD_PASSWORD_FILE` selects another file; `LUCYD_PASSWORD` is an optional
process environment override. Credentials remain outside `public/` and Git.
The collection password and encrypted catalogue are unchanged.

The developer server authenticates the encrypted collection and provides its
derived collection key and ciphertext only to a local, same-origin browser
request. The browser imports a non-extractable key and uses the ordinary shared
study model. No plaintext catalogue file is generated. Responses use no-store;
remote addresses, foreign origins and non-loopback Host headers are refused.
When local access is configured, the server refuses a non-loopback bind address.

All problems are immediately selectable locally. Saves, backups and exports
remain encrypted and can still be opened using the existing password. Locking
clears the session normally; reloading the local page opens it again.

Firebase serves only the encrypted catalogue. Hosted pages do not request the
local capability and still require the collection password. Static-only local
servers and unconfigured developer servers retain the password form as well.
Deleting the local credential file and restarting `npm run serve` disables
automatic local access.
