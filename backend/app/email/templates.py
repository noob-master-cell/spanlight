"""The transactional emails: verify an address, reset a password, accept an invite.

The copy is fixed here, not in a template engine. The plain-text part carries values raw, since
it is not markup. The HTML part renders the same paragraphs and escapes every value in them.
Templates return the message with `to=""`; the caller fills the recipient with
`dataclasses.replace`.
"""

from html import escape

from app.email.message import EmailMessage

# A paragraph is copy as is, or `(lead_in, url)`: the URL sits on its own line under the lead-in.
_Paragraph = str | tuple[str, str]


def render_verify_email(name: str, url: str) -> EmailMessage:
    """Confirm an address for a new account. The link works once and expires in 24 hours."""
    return _compose(
        subject="Verify your email for Spanlight",
        paragraphs=[
            f"Hi {name},",
            ("Confirm that this is your email address for Spanlight:", url),
            "The link works once and expires in 24 hours. "
            "If you didn't create a Spanlight account, you can ignore this email.",
        ],
    )


def render_password_reset(name: str, url: str) -> EmailMessage:
    """Start a password reset. The link works once and expires in 1 hour."""
    return _compose(
        subject="Reset your Spanlight password",
        paragraphs=[
            f"Hi {name},",
            (
                "Someone asked to reset the password for your Spanlight account. "
                "If that was you, choose a new password here:",
                url,
            ),
            "The link works once and expires in 1 hour. Resetting your password signs you out "
            "on every device. If you didn't ask for this, ignore this email; "
            "your password stays the same.",
        ],
    )


def render_invite(org_name: str, role: str, url: str, inviter_name: str) -> EmailMessage:
    """Invite someone to an org with a role. The invite expires in 7 days."""
    return _compose(
        subject=f"{inviter_name} invited you to {org_name} on Spanlight",
        paragraphs=[
            f"{inviter_name} invited you to join {org_name} on Spanlight as {role}.",
            ("Accept the invite:", url),
            "The invite expires in 7 days. If you weren't expecting it, you can ignore this email.",
        ],
    )


def _compose(subject: str, paragraphs: list[_Paragraph]) -> EmailMessage:
    text_parts: list[str] = []
    html_parts: list[str] = []
    for paragraph in paragraphs:
        if isinstance(paragraph, tuple):
            lead_in, url = paragraph
            text_parts.append(f"{lead_in}\n{url}")
            html_parts.append(
                f"<p>{escape(lead_in, quote=False)}<br>\n"
                f'<a href="{escape(url, quote=True)}">{escape(url, quote=True)}</a></p>'
            )
        else:
            text_parts.append(paragraph)
            html_parts.append(f"<p>{escape(paragraph, quote=False)}</p>")

    text = "\n\n".join(text_parts) + "\n"
    html = "<html><body>\n" + "\n".join(html_parts) + "\n</body></html>"
    return EmailMessage(to="", subject=subject, text=text, html=html)
