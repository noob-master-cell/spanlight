#!/usr/bin/env bash
# Checks that every relative link in the given Markdown files points at something that exists.
#
#   scripts/check-links.sh README.md CONTRIBUTING.md
#   scripts/check-links.sh docs/runbooks/*.md
#
# What it checks:
#   - Inline links and images, [text](target) and ![alt](target), and reference definitions,
#     [label]: target. The target is resolved against the directory of the file that contains it
#     (a target that starts with "/" is resolved against the repository root, as GitHub does).
#   - The target must exist as a file or a directory, with exactly the spelling used. The case
#     must match, so a link that works on macOS but not on Linux or GitHub is reported.
#
# What it skips:
#   - Anything with a URL scheme (http:, https:, mailto:, ...), "//host" links and pure "#anchor"
#     links. A "#fragment" or "?query" on a file link is removed before the existence check;
#     whether the anchor exists in the target is not checked.
#   - Links inside fenced code blocks, inline code spans and HTML comments.
#   - HTML tags such as <a href> and <img src>. Only Markdown link syntax is read.
#
# Output: one "file:line: target" line per broken link, then "FAIL: N broken link(s)" and exit
# status 1. With no broken links it prints "ok" and exits 0. A file that cannot be read, or an
# unmatched glob that reaches the script as a literal pattern, is an error: exit status 2.
#
# Needs python3 (standard library only). Written for bash 3.2 (the macOS default) and Linux.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PYTHON=${PYTHON:-python3}

if [[ $# -eq 0 ]]; then
  echo "usage: ${0##*/} FILE.md [FILE.md ...]" >&2
  exit 2
fi
if [[ "$1" == "-h" || "$1" == "--help" ]]; then
  echo "usage: ${0##*/} FILE.md [FILE.md ...]"
  exit 0
fi

# -I keeps the interpreter from importing anything out of the current directory.
REPO_ROOT="$REPO_ROOT" exec "$PYTHON" -I - "$@" <<'PY'
import os
import re
import sys
from urllib.parse import unquote

REPO_ROOT = os.environ["REPO_ROOT"]

FENCE = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")
BLANK_LINE = re.compile(r"\n[ \t]*\n")
HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
# "[text](" where the text may hold escapes and one level of nested brackets (an image in a link).
LINK_START = re.compile(r"\[(?:[^\[\]\\]|\\.|\[[^\[\]]*\])*\]\(")
REFERENCE = re.compile(r"^ {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*(<[^>\n]*>|\S+)", re.MULTILINE)
URL_SCHEME = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")


def blank(text):
    """Replace everything except newlines with spaces, so offsets and line numbers stay valid."""
    return re.sub(r"[^\n]", " ", text)


def mask_fenced_blocks(text):
    lines = text.split("\n")
    fence = None  # (character, length) of the open fence
    for number, line in enumerate(lines):
        match = FENCE.match(line)
        if fence is None:
            # A backtick fence cannot have a backtick in its info string: that is inline code.
            if match and not (match.group(1)[0] == "`" and "`" in match.group(2)):
                fence = (match.group(1)[0], len(match.group(1)))
                lines[number] = blank(line)
            continue
        lines[number] = blank(line)
        if (
            match
            and match.group(1)[0] == fence[0]
            and len(match.group(1)) >= fence[1]
            and not match.group(2).strip()
        ):
            fence = None
    return "\n".join(lines)


def is_escaped(text, index):
    backslashes = 0
    while index - backslashes > 0 and text[index - backslashes - 1] == "\\":
        backslashes += 1
    return backslashes % 2 == 1


def backtick_run(text, index):
    end = index
    while end < len(text) and text[end] == "`":
        end += 1
    return end


def mask_code_spans(text):
    """Blank `code` spans: a run of N backticks closes at the next run of exactly N, in the same
    paragraph. A run with no closing partner is literal text."""
    chars = list(text)
    index = 0
    while index < len(text):
        if text[index] != "`" or is_escaped(text, index):
            index += 1
            continue
        opener_end = backtick_run(text, index)
        width = opener_end - index
        paragraph_end = BLANK_LINE.search(text, opener_end)
        limit = paragraph_end.start() if paragraph_end else len(text)
        cursor = opener_end
        closer = None
        while cursor < limit:
            if text[cursor] != "`":
                cursor += 1
                continue
            run_end = backtick_run(text, cursor)
            if run_end - cursor == width:
                closer = run_end
                break
            cursor = run_end
        if closer is None:
            index = opener_end
            continue
        chars[index:closer] = blank("".join(chars[index:closer]))
        index = closer
    return "".join(chars)


def masked(text):
    text = mask_code_spans(mask_fenced_blocks(text))
    return HTML_COMMENT.sub(lambda match: blank(match.group()), text)


def skip_blanks(text, index):
    while index < len(text) and text[index] in " \t\n":
        index += 1
    return index


def read_destination(text, start):
    """Read a link destination, plain or in <angle brackets>. Returns (offset, destination, end)
    or None."""
    if text.startswith("<", start):
        end = text.find(">", start + 1)
        if end < 0 or "\n" in text[start:end]:
            return None
        return start + 1, text[start + 1 : end], end + 1
    depth, cursor = 0, start
    while cursor < len(text) and text[cursor] not in " \t\n":
        character = text[cursor]
        if character == "\\":
            cursor += 2
            continue
        if character == "(":
            depth += 1
        elif character == ")":
            if depth == 0:
                break
            depth -= 1
        cursor += 1
    return start, text[start:cursor], cursor


def skip_title(text, index):
    """Skip an optional "title", 'title' or (title). Returns None when the title is unterminated."""
    if index < len(text) and text[index] in "\"'(":
        end = text.find({'"': '"', "'": "'", "(": ")"}[text[index]], index + 1)
        if end < 0:
            return None
        return skip_blanks(text, end + 1)
    return index


def parse_destination(text, start):
    """Read the "(destination "title")" part of an inline link, starting just after the "(".
    Returns (offset, destination), or None when the text is not a valid link."""
    destination = read_destination(text, skip_blanks(text, start))
    if destination is None:
        return None
    offset, target, end = destination
    index = skip_title(text, skip_blanks(text, end))
    if index is not None and text.startswith(")", index):
        return offset, target
    return None


def link_targets(text):
    """Yield (offset, target) for every link target in already masked text."""
    seen = set()
    position = 0
    while True:
        match = LINK_START.search(text, position)
        if match is None:
            break
        position = match.start() + 1  # the next search may find a link nested in this one
        if is_escaped(text, match.start()):
            continue
        found = parse_destination(text, match.end())
        if found and found[0] not in seen:
            seen.add(found[0])
            yield found
    for match in REFERENCE.finditer(text):
        yield match.start(1), match.group(1).strip("<>")


def local_path(target):
    """The file part of a link target, or None when it does not point at a local file."""
    target = target.strip()
    if not target or target.startswith(("#", "//")) or URL_SCHEME.match(target):
        return None
    target = target.split("#", 1)[0].split("?", 1)[0]
    return unquote(target) or None


def exists_exactly(base, relative):
    """True when base/relative exists and every component is spelled exactly as on disk."""
    current = base
    for part in relative.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            current = os.path.dirname(current)
            continue
        try:
            if part not in os.listdir(current):
                return False
        except OSError:
            return False
        current = os.path.join(current, part)
    return True


def broken_links(path):
    with open(path, encoding="utf-8") as handle:
        text = handle.read()
    base = os.path.dirname(os.path.abspath(path))
    clean = masked(text)
    for offset, target in sorted(link_targets(clean)):
        relative = local_path(target)
        if relative is None:
            continue
        if relative.startswith("/"):
            directory, relative = REPO_ROOT, relative.lstrip("/")
        else:
            directory = base
        if not exists_exactly(directory, relative):
            yield text.count("\n", 0, offset) + 1, target


def main(paths):
    broken = 0
    unreadable = 0
    for path in paths:
        try:
            for line, target in broken_links(path):
                print("%s:%d: %s" % (path, line, target))
                broken += 1
        except (OSError, UnicodeDecodeError) as error:
            print("error: %s: %s" % (path, getattr(error, "strerror", None) or error), file=sys.stderr)
            unreadable += 1
    if unreadable:
        return 2
    if broken:
        print("FAIL: %d broken link(s)" % broken)
        return 1
    print("ok")
    return 0


sys.exit(main(sys.argv[1:]))
PY
