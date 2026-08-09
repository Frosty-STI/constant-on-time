#!/usr/bin/env python3
"""Structural lint for the PSpice-oriented text ladder.

This does not parse PSpice expressions and is not a substitute for PSpice A/D.
It catches missing include targets, unbalanced continuations/braces, mismatched
.SUBCKT/.ENDS blocks, missing top-level .END cards, and unknown subcircuit calls
in both libraries and decks.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PSPICE = ROOT / "pspice"


def logical_lines(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    result: list[str] = []
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("*"):
            continue
        if stripped.startswith("+"):
            if not result:
                errors.append(f"{path}:{number}: orphan continuation")
            else:
                result[-1] += " " + stripped[1:].strip()
        else:
            result.append(stripped)
    return result, errors


def subckt_reference(line: str) -> str | None:
    if not line[:1].upper() == "X":
        return None
    tokens = line.replace("=", " = ").split()
    upper = [token.upper() for token in tokens]
    stop = upper.index("PARAMS:") if "PARAMS:" in upper else len(tokens)
    if stop < 2:
        return None
    return tokens[stop - 1].upper()


def lint() -> list[str]:
    paths = (
        sorted((PSPICE / "lib").glob("*.lib"))
        + sorted((PSPICE / "testbenches").glob("*.cir"))
        + sorted((PSPICE / "validation").glob("*.cir"))
    )
    errors: list[str] = []
    definitions: set[str] = set()
    parsed: dict[Path, list[str]] = {}

    for path in paths:
        text = path.read_text(encoding="utf-8")
        if text.count("{") != text.count("}"):
            errors.append(f"{path}: unbalanced expression braces")
        lines, line_errors = logical_lines(path)
        parsed[path] = lines
        errors.extend(line_errors)
        stack: list[str] = []
        for line in lines:
            tokens = line.split()
            directive = tokens[0].upper()
            if directive == ".SUBCKT":
                if len(tokens) < 2:
                    errors.append(f"{path}: nameless .SUBCKT")
                else:
                    name = tokens[1].upper()
                    definitions.add(name)
                    stack.append(name)
            elif directive == ".ENDS":
                if not stack:
                    errors.append(f"{path}: .ENDS without .SUBCKT")
                else:
                    expected = stack.pop()
                    if len(tokens) > 1 and tokens[1].upper() != expected:
                        errors.append(
                            f"{path}: .ENDS {tokens[1]} closes {expected}"
                        )
            elif directive == ".INC":
                match = re.search(r'["\']([^"\']+)["\']', line)
                if not match:
                    errors.append(f"{path}: unquoted include path")
                elif not (ROOT / match.group(1)).is_file():
                    errors.append(f"{path}: missing include {match.group(1)}")
        if stack:
            errors.append(f"{path}: unclosed subcircuits {', '.join(stack)}")
        end_count = sum(line.upper() == ".END" for line in lines)
        if path.suffix == ".cir" and end_count != 1:
            errors.append(f"{path}: expected one .END, found {end_count}")
        if path.suffix == ".lib" and end_count:
            errors.append(f"{path}: library must not contain top-level .END")

    for path, lines in parsed.items():
        for line in lines:
            reference = subckt_reference(line)
            if reference and reference not in definitions:
                errors.append(f"{path}: unknown subcircuit {reference}")
    return errors


def main() -> int:
    errors = lint()
    if errors:
        print("PSpice structural lint: FAIL")
        print("\n".join(f"- {error}" for error in errors))
        return 1
    lib_count = len(list((PSPICE / "lib").glob("*.lib")))
    deck_count = len(list((PSPICE / "testbenches").glob("*.cir"))) + len(
        list((PSPICE / "validation").glob("*.cir"))
    )
    print(f"PSpice structural lint: PASS ({lib_count} libraries, {deck_count} decks)")
    print("Scope: structure/includes/subcircuit references only; PSpice not executed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
