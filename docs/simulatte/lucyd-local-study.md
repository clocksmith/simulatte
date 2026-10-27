# Local Lucyd study access

Owners: [local server](../../tools/serve-local.mjs), [local collection handler](../../tools/simulatte/lucyd-local-collection.mjs), and [collection lifecycle](../../public/simulatte/system-diagram/private-collection.js).

All 46 authored problems are public in local and hosted Lucyd. Open
<http://127.0.0.1:4173/system-diagram> and use Choose problem. No password or local
credential file is needed to study any problem or solution.

The default credential file is
`~/.local/state/deco/lucyd-local/password`, readable only by its owner (mode 600).
`LUCYD_PASSWORD_FILE` selects another file; `LUCYD_PASSWORD` is an optional
process environment override. Credentials remain outside `public/` and Git.
The collection password and encrypted catalogue are unchanged.

The optional developer convenience now opens only personal notes and older
encrypted diagram saves. The developer server authenticates that collection and provides its
derived collection key and ciphertext only to a local, same-origin browser
request. The browser imports a non-extractable key and uses the ordinary shared
study model. No plaintext catalogue file is generated. Responses use no-store;
remote addresses, foreign origins and non-loopback Host headers are refused.
When local access is configured, the server refuses a non-loopback bind address.

Public problem saves and exports use the ordinary public document path. Existing
private edits, backups and exports remain encrypted and can still be opened using
the existing password. Locking clears the private session normally.

Firebase serves the full public problem catalogue, with personal notes retained
in the separate encrypted file. Hosted pages do not request the local capability.
Only personal notes and older encrypted saves require the collection password.
Deleting the local credential file and restarting `npm run serve` disables
automatic local access.
