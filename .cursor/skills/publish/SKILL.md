---
name: publish
description: >-
  Publish verified project changes to GitHub and complete the corresponding
  Cloudflare Pages and Supabase deployments. Use when the user runs /publish
  or asks to publish this app.
disable-model-invocation: true
---

# /publish — GitHub and production deployment

Run this workflow end-to-end when invoked. A `/publish` request authorizes the
required commit, push, Cloudflare deployment, and applicable Supabase
deployments. Do not ask for routine confirmation.

## Rules

- Publish the current intended app/project changes, but leave `tmp/`,
  `tmp/reference/`, generated output, credentials, `.env*`, and unrelated
  untracked files local unless the user explicitly includes them.
- Never force-push, bypass hooks, rewrite published commits, or update Git
  configuration.
- Stop and explain if there are merge conflicts, the branch has diverged, a
  secret appears in the publish set, verification fails, or authentication is
  definitively denied.
- Preserve user changes. Do not discard or reset files to make publishing pass.

## 1. Inspect and classify

From the repository root, inspect in parallel:

```bash
git status --short --branch
git diff
git diff --cached
git log -8 --format='%h %s'
git remote -v
```

Before staging, record the files being published. Include uncommitted intended
files plus any commits ahead of the upstream branch. Use that recorded set to
decide whether Supabase deployment is needed:

- `supabase/migrations/**` → database deployment
- `supabase/functions/<name>/**` → deploy each changed `<name>`
- `supabase/config.toml` → project configuration deployment

App-only changes do not require a Supabase deployment.

## 2. Verify

When `app/**` changed, run from `app/`:

```bash
npm test
npm run build
```

Do not publish if either command fails. Treat Vite size warnings as warnings
unless the build exits unsuccessfully.

## 3. Commit

Stage only the intended files. Draft a concise commit message matching recent
repository history and focusing on why the change exists. Pass the message with
a heredoc. Run `git status --short --branch` after committing.

If there are no uncommitted intended changes, do not create an empty commit;
continue when the branch already contains unpublished commits.

## 4. Deploy Supabase when needed

Deploy from the repository root after the commit succeeds and before pushing
the app:

1. For changed migrations:

   ```bash
   supabase db push
   ```

2. For changed `supabase/config.toml`:

   ```bash
   supabase config push
   ```

3. For changed Edge Functions, deploy only the affected function names:

   ```bash
   supabase functions deploy <name...>
   ```

The repository is expected to be linked already. Do not relink it to a guessed
project. If authentication or project linking is missing, report the blocker
and stop before pushing production app changes.

## 5. Push and monitor Cloudflare

Push the current branch to its existing upstream. Production publishing is
normally `main` → `origin/main`; ask before merging or changing branches if
invoked elsewhere.

Cloudflare Pages deploys through the GitHub integration. After pushing:

1. Get the pushed commit SHA.
2. Use `gh` to watch its `Cloudflare Pages` check until completion.
3. On failure, return the GitHub check/log URL and the failure summary.
4. On success, verify `https://shader-studio.pages.dev/` responds. A `2xx` or
   `3xx` response is healthy because Cloudflare Access may redirect.

Do not claim deployment success while the check is pending or absent.

## 6. Report

Return:

- linked GitHub commit
- Cloudflare Pages result and production URL
- Supabase migrations, configuration, and function names deployed, or
  “Supabase unchanged”
- verification results
- any intentionally uncommitted local files
