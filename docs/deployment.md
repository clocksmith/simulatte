# Deploy Simulatte

Firebase Hosting serves `public/` from project `simulatte-world`.

## Owner contracts

| Contract | Job |
| --- | --- |
| [`firebase.json`](../firebase.json) | Hosting root, cache headers, predeploy gate, and build stamp. |
| [`.firebaserc`](../.firebaserc) | Default Firebase project. |
| [`package.json`](../package.json) | Account checks, preview deploys, production deploys, and model-lock commands. |
| [model-runtime lock](../public/data/simulatte-embedder/model-runtime-lock.json) | Doppler package, model artifacts, hashes, URLs, and integrity values. |

## Preflight

```bash
npm run check:deploy
npm run firebase:whoami
npm run firebase:check
```

`check:deploy` validates the model lock, its synced references, the vendored
Doppler runtime, registry integrity, and the static deploy surface. Keep the
gate strict when the registry tarball differs from the lock. Update the lock and
its synced references instead of weakening the comparison.

## Select an account

The Firebase CLI may have multiple authenticated accounts:

```bash
firebase login:list
firebase login:use <account-email>
firebase use
```

The repository also provides account-pinned checks:

Set `SIMULATTE_FIREBASE_D4DA_ACCOUNT` and
`SIMULATTE_FIREBASE_PERSONAL_ACCOUNT` in the invoking shell. Their values stay
outside the repository.

| Account | Check |
| --- | --- |
| D4DA | `npm run firebase:check:d4da` |
| Personal | `npm run firebase:check:personal` |

If the selected credential has expired:

```bash
firebase login --reauth
```

## Deploy

Use a preview channel before production:

```bash
npm run deploy:preview
npm run deploy:hosting
```

Account-pinned variants avoid dependence on global Firebase CLI state:

| Account | Preview | Production |
| --- | --- | --- |
| D4DA | `npm run deploy:preview:d4da` | `npm run deploy:hosting:d4da` |
| Personal | `npm run deploy:preview:personal` | `npm run deploy:hosting:personal` |

The production command runs the predeploy gate and build stamp from
`firebase.json`. A successful local check does not prove deployment; the
Firebase command must complete.

## Verify the hosted surface

```bash
curl -I https://simulatte.world
curl -I https://simulatte.world/blank/
curl -I https://simulatte.world/autonomy/
curl -I https://simulatte-world.web.app
```

Both domains should resolve to the `simulatte-world` Hosting site. The root
serves Simulatte, `/blank/` serves the prompt-to-pixels compiler, and
`/autonomy/` redirects to the root while the custom domain remains attached.
