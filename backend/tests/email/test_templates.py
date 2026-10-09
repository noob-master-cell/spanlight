"""The three transactional emails: subjects and bodies match the spec copy, and the HTML is safe."""

import re
from collections.abc import Callable
from html import escape

import pytest

from app.email.message import EmailMessage
from app.email.templates import render_invite, render_password_reset, render_verify_email

URL = "https://app.spanlight.dev/verify?token=abc123"
SCRIPT = "<script>alert(1)</script>"
ESCAPED_SCRIPT = "&lt;script&gt;alert(1)&lt;/script&gt;"
IDS = ["verify", "reset", "invite"]


def _all_messages(url: str = URL) -> list[EmailMessage]:
    return [
        render_verify_email("Ada", url),
        render_password_reset("Ada", url),
        render_invite(org_name="Acme", role="admin", url=url, inviter_name="Grace"),
    ]


def _html(message: EmailMessage) -> str:
    assert message.html is not None
    return message.html


def test_verify_email_matches_spec_copy() -> None:
    message = render_verify_email("Ada", URL)

    assert message.to == ""
    assert message.subject == "Verify your email for Spanlight"
    assert message.text == (
        "Hi Ada,\n\n"
        "Confirm that this is your email address for Spanlight:\n"
        f"{URL}\n\n"
        "The link works once and expires in 24 hours. If you didn't create a Spanlight account, "
        "you can ignore this email.\n"
    )


def test_password_reset_matches_spec_copy() -> None:
    message = render_password_reset("Ada", URL)

    assert message.to == ""
    assert message.subject == "Reset your Spanlight password"
    assert message.text == (
        "Hi Ada,\n\n"
        "Someone asked to reset the password for your Spanlight account. If that was you, "
        "choose a new password here:\n"
        f"{URL}\n\n"
        "The link works once and expires in 1 hour. Resetting your password signs you out on "
        "every device. If you didn't ask for this, ignore this email; your password stays the "
        "same.\n"
    )


def test_invite_matches_spec_copy() -> None:
    message = render_invite(org_name="Acme", role="admin", url=URL, inviter_name="Grace")

    assert message.to == ""
    assert message.subject == "Grace invited you to Acme on Spanlight"
    assert message.text == (
        "Grace invited you to join Acme on Spanlight as admin.\n\n"
        "Accept the invite:\n"
        f"{URL}\n\n"
        "The invite expires in 7 days. If you weren't expecting it, you can ignore this email.\n"
    )


@pytest.mark.parametrize("message", _all_messages(), ids=IDS)
def test_url_appears_once_in_the_text(message: EmailMessage) -> None:
    assert message.text.count(URL) == 1


@pytest.mark.parametrize("message", _all_messages(), ids=IDS)
def test_html_links_the_url_once(message: EmailMessage) -> None:
    html = _html(message)

    assert html.count(f'<a href="{URL}">{URL}</a>') == 1
    assert html.count('href="') == 1


@pytest.mark.parametrize("message", _all_messages(), ids=IDS)
def test_html_has_no_image_and_no_url_but_the_link(message: EmailMessage) -> None:
    html = _html(message)

    assert "<img" not in html
    assert set(re.findall(r"https?://[^\s\"<>]+", html)) == {URL}


@pytest.mark.parametrize("message", _all_messages(), ids=IDS)
def test_html_carries_the_same_paragraphs_as_the_text(message: EmailMessage) -> None:
    html = _html(message)

    for paragraph in message.text.rstrip("\n").split("\n\n"):
        if URL in paragraph:
            lead_in = paragraph.split("\n")[0]
            assert f"<p>{lead_in}<br>\n<a href=" in html
        else:
            assert f"<p>{paragraph}</p>" in html


@pytest.mark.parametrize(
    "render",
    [
        pytest.param(lambda name: render_verify_email(name, URL), id="verify"),
        pytest.param(lambda name: render_password_reset(name, URL), id="reset"),
    ],
)
def test_name_is_escaped_in_html_and_raw_in_text(
    render: Callable[[str], EmailMessage],
) -> None:
    message = render(SCRIPT)
    html = _html(message)

    assert "<script>" not in html
    assert ESCAPED_SCRIPT in html
    assert SCRIPT in message.text


@pytest.mark.parametrize("field", ["org_name", "role", "inviter_name"])
def test_invite_escapes_each_interpolated_value_in_html(field: str) -> None:
    values = {"org_name": "Acme", "role": "admin", "inviter_name": "Grace"}
    values[field] = SCRIPT
    message = render_invite(url=URL, **values)
    html = _html(message)

    assert "<script>" not in html
    assert ESCAPED_SCRIPT in html
    assert SCRIPT in message.text


def test_url_is_escaped_in_the_href_and_the_visible_text() -> None:
    url = 'https://app.spanlight.dev/invite?code=a&b="c"'
    message = render_invite(org_name="Acme", role="admin", url=url, inviter_name="Grace")
    escaped = "https://app.spanlight.dev/invite?code=a&amp;b=&quot;c&quot;"

    assert f'<a href="{escaped}">{escaped}</a>' in _html(message)
    assert url in message.text
    assert escape(url) == escaped
