#!/usr/bin/env python3
"""JSONL adapter for a user-provided, zero-argument Bot.react implementation."""
import argparse
import contextlib
import importlib
import json
import os
import re
import sys


def reject_constant(_value):
    raise ValueError("Non-finite JSON number")


def loads(value):
    return json.loads(value, parse_constant=reject_constant)


@contextlib.contextmanager
def debug_to_stderr():
    """Keep Python and native-library debug prints out of the JSONL channel."""
    sys.stdout.flush()
    saved = os.dup(1)
    try:
        os.dup2(2, 1)
        with contextlib.redirect_stdout(sys.stderr):
            yield
    finally:
        sys.stderr.flush()
        os.dup2(saved, 1)
        os.close(saved)


def clean_action(value):
    if isinstance(value, str):
        value = loads(value)
    if not isinstance(value, dict) or not isinstance(value.get("type"), str):
        raise ValueError("Invalid action")
    # Reject non-JSON/non-finite values even inside metadata that will be removed.
    json.dumps(value, allow_nan=False)
    schemas = {
        "none": (), "dahai": ("actor", "pai", "tsumogiri"),
        "reach": ("actor",), "chi": ("actor", "target", "pai", "consumed"),
        "pon": ("actor", "target", "pai", "consumed"),
        "daiminkan": ("actor", "target", "pai", "consumed"),
        "ankan": ("actor", "consumed"), "kakan": ("actor", "pai", "consumed"),
        "hora": ("actor", "target", "pai"), "ryukyoku": ("actor",),
    }
    kind = value["type"]
    if kind not in schemas:
        raise ValueError("Unsupported action")
    action = {"type": kind}
    for key in schemas[kind]:
        field = value[key]
        if key in ("actor", "target"):
            if type(field) is not int or not 0 <= field <= 3:
                raise ValueError("Invalid seat")
        elif key == "tsumogiri":
            if type(field) is not bool:
                raise ValueError("Invalid discard")
        elif key == "pai":
            check_tile(field)
        elif key == "consumed":
            count = 4 if kind == "ankan" else 3 if kind in ("daiminkan", "kakan") else 2
            if not isinstance(field, list) or len(field) != count:
                raise ValueError("Invalid consumed tiles")
            for tile in field:
                check_tile(tile)
        action[key] = field
    return action


def check_tile(tile):
    if not isinstance(tile, str) or not re.fullmatch(r"(?:[1-9][mps]|5[mps]r|[ESWNPFC])", tile):
        raise ValueError("Invalid tile")


def main():
    parser = argparse.ArgumentParser(description="Adapt a user-provided Bot.react to mjai JSONL. Supply your own Python module and model weights; no model or third-party library is bundled or downloaded.")
    parser.add_argument("--module", required=True, help="Importable user module; its class configures weights itself")
    parser.add_argument("--class", dest="class_name", default="Bot", help="Zero-argument bot class (default: Bot)")
    parser.add_argument("--module-dir", help="Directory to add to Python's module search path")
    args = parser.parse_args()
    try:
        if args.module_dir:
            sys.path.insert(0, os.path.abspath(args.module_dir))
        with debug_to_stderr():
            module = importlib.import_module(args.module)
            bot = getattr(module, args.class_name)()
        # A fresh process handles one inference; never print observations back out.
        line = sys.stdin.buffer.readline(2 * 1024 * 1024 + 1)
        if len(line) > 2 * 1024 * 1024 or not line.endswith(b"\n"):
            raise ValueError("Invalid input size")
        events = loads(line.decode("utf-8"))
        if not isinstance(events, list) or not events or any(not isinstance(event, dict) for event in events):
            raise ValueError("Expected event array")
        with debug_to_stderr():
            raw = bot.react(json.dumps(events, ensure_ascii=True, allow_nan=False))
        result = json.dumps(clean_action(raw), ensure_ascii=True, allow_nan=False, separators=(",", ":"))
        sys.stdout.write(result + "\n")
        sys.stdout.flush()
        return 0
    except BaseException:
        sys.stderr.write("mjai wrapper failed\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
