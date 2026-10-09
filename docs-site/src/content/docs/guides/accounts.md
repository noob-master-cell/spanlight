---
title: Accounts and sign-in
description: Verify your email, reset a password, sign in with GitHub or Google, turn on two-factor authentication and manage your sessions.
sidebar:
  order: 1
---

This page is the task-oriented view of how people sign in to Spanlight. The exact request and response of every route is in the [API conventions](/docs/api/conventions/) and the [Auth reference](/docs/api/auth/); the variables that switch each feature on are in [Configuration](/docs/configuration/).

Some of these features need the operator to configure something first. When one is missing, the dashboard hides it, or the API refuses: `409 NOT_CONFIGURED` naming the setting, or `404` for a sign-in provider that is not configured.

| Feature | Needs |
| --- | --- |
| Verification and reset emails, invitation emails | `EMAIL_PROVIDER` set up (`resend` or `smtp`) |
| Sign in with GitHub or Google | The client ID and secret of that provider |
| Two-factor authentication | `CREDENTIALS_KEYS` |

## Email verification

Verification is soft. A new account works straight away, and Spanlight emails a link when email is configured. The link opens `/verify-email` and is valid for 24 hours. The token travels in the URL fragment, so it never reaches a server log.

While an address is unverified, two actions are refused with `409 EMAIL_UNVERIFIED`: turning on two-factor authentication and linking a GitHub or Google account. The reason is recovery. Anyone can register an address that is not theirs, and a second factor or a provider attached to that account would outlast the real owner taking it back.

You can ask for a new link from the banner the dashboard shows, up to three times an hour. When the operator has not configured email, nobody can verify an address, and these two restrictions do not apply.

## Forgot your password

Choose **Forgot password?** on the sign-in page and enter your address. The answer is the same whether or not an account exists, so the form cannot be used to find out who has one. If the account exists, an email arrives with a link that is valid for one hour and works once. Asking again retires the earlier link.

Setting a new password:

- ends every session of the account, on every device;
- marks the address as verified, because the link reached the inbox;
- does not sign you in. You sign in afterwards with the new password.

If the address had never been verified, the reset also removes any GitHub or Google account linked to it, because that link was made while the address was unproven. You can link them again afterwards.

Limits: three requests per email address and ten per client address in 15 minutes. If email is not configured, the operator resets passwords from the command line with `spanlight reset-password`; see [Self-hosting](/docs/self-hosting/).

## Sign in with GitHub or Google

Providers the operator configured appear as buttons on the sign-in page. The operator registers `<APP_BASE_URL>/api/v1/auth/oauth/<provider>/callback` as the callback URL with the provider.

How a sign-in is resolved:

1. If you have signed in with this provider account before, you are signed in.
2. Otherwise, if an account with the same email exists, the provider account is linked to it, but only when the provider says the address is verified and your Spanlight address is verified too. Without email nobody can verify an address, so on such an instance a provider cannot match an existing account by email.
3. Otherwise a new account is created, but only when the provider says the address is verified. An unverified address creates nothing.

A person who signed up through a provider has no password. When email is configured they can set one with the forgot password flow; otherwise the operator sets it with `spanlight reset-password`.

To link or unlink a provider for the account you already have, open **Settings, Personal, Security**. You cannot remove your last way of signing in. The shared demo account cannot link a provider.

## Two-factor authentication

Spanlight supports authenticator apps (time-based codes, six digits, 30 seconds) with ten one-time recovery codes.

To turn it on, open **Settings, Personal, Security**, scan the QR code (or type the secret), and enter the first code. Spanlight then shows the recovery codes **once**. Save them somewhere safe. Each works one time, and turning two-factor authentication off, then on again, creates a new set.

After that, a password sign-in asks for a code on a second step, and so does a GitHub or Google sign-in. A code is accepted once, so a code that was seen cannot be replayed. Wrong codes count towards the same sign-in limit as wrong passwords: after five failures for an address (or 20 for a client address) in 15 minutes, the next attempt waits. Turning two-factor authentication off allows five attempts per 15 minutes. Signing up is limited to ten attempts per client address an hour.

Turning it off also needs a current code or a recovery code. If you lose both the app and the recovery codes, the operator can clear your second factor from the host with `spanlight reset-2fa --email <address>`. The command is written to the audit log.

### Requiring it for an organization

An organization owner can require two-factor authentication for all members in **Settings, Organization**. The owner must have it turned on first. From then on, a member without it gets `403 TWO_FACTOR_REQUIRED` for everything in that organization, and the dashboard sends them to **Security** to enrol. Ingestion with an API key is not affected, because a key is not a person signing in.

## Sessions

Signing in creates a server-side session in an httpOnly cookie. It lasts seven days from the last use and never more than 30 days in total. **Settings, Personal, Security** lists your sessions with the browser, the address and when each was last used. You can end any one of them, or choose **Sign out of all other sessions** (shown when there is another session). The session you are using keeps working.

## Joining an organization

An owner or admin invites someone from **Settings, Organization, Members**, choosing a role. The invitation is a link. If the owner also types an email address and email is configured, Spanlight mails the link as well, up to 20 mailed invitations per organization per hour. Whoever opens the link while signed in can accept it, so treat it like a password until it is used.
