#!/usr/bin/env python3
"""Independent arithmetic checks for the nominal educational decks."""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.dont_write_bytecode = True
import generate_multiphase


ROOT = Path(__file__).resolve().parents[2]


def close(actual: float, expected: float, tolerance: float, label: str) -> None:
    error = abs(actual - expected)
    if error > tolerance:
        raise AssertionError(
            f"{label}: {actual:.12g} != {expected:.12g} (error {error:.3g})"
        )
    print(f"PASS {label}: {actual:.9g}")


def main() -> int:
    vin, vout, fsw, inductance = 12.0, 5.0, 500e3, 2e-6
    period = 1 / fsw
    duty = vout / vin
    ton = duty * period
    toff = period - ton
    slope_on = (vin - vout) / inductance
    slope_off = -vout / inductance
    ripple_on = slope_on * ton
    ripple_off = -slope_off * toff

    close(duty, 5 / 12, 1e-15, "ideal conversion duty")
    close(ton, 833.333333333e-9, 1e-18, "nominal on-time (s)")
    close(slope_on, 3.5e6, 1e-6, "high-side current slope (A/s)")
    close(slope_off, -2.5e6, 1e-6, "low-side current slope (A/s)")
    close(ripple_on, ripple_off, 1e-12, "volt-second/ripple balance (A)")
    close(ripple_on, 2.91666666667, 1e-9, "peak-to-peak ripple (A)")
    close(ripple_on / 2, 1.45833333333, 1e-9, "CCM boundary current (A)")

    phases = 4
    close(period / phases, 500e-9, 1e-18, "four-phase spacing (s)")
    close(fsw * phases, 2e6, 1e-6, "ideal effective ripple frequency (Hz)")

    # Integral of a zero-mean triangular capacitor-current ripple over a period.
    q_positive = 0.5 * (period / 2) * (ripple_on / 2)
    q_negative = -q_positive
    close(q_positive + q_negative, 0, 1e-18, "capacitor charge balance (C)")

    ton_12 = period * vout / 12
    ton_9 = period * vout / 9
    close(ton_12, ton, 1e-18, "adaptive TON at 12 V (s)")
    close(ton_9, 1.11111111111e-6, 2e-18, "adaptive TON at 9 V (s)")
    if not ton_9 > ton_12:
        raise AssertionError("adaptive law must increase TON as VIN falls")

    # Current-share trim signs: higher phase-1 current must raise FB1 and reduce
    # its future request probability in the supplied comparator convention.
    i1, i2, kbal = 6.0, 4.0, 30e-3
    trim1 = max(-0.1, min(0.1, kbal * (i1 - i2) / 2))
    trim2 = -trim1
    if not (trim1 > 0 and trim2 < 0 and math.isclose(trim1, -trim2)):
        raise AssertionError("current-balance trim polarity")
    print(f"PASS current-balance trim polarity: {trim1:.6g}, {trim2:.6g}")

    # A held level request must not fight an active inhibit clamp or precharge
    # TIMER. Check that both fixed- and command-duration forms drive SREQ from
    # the explicit REQ AND NOT INHIBIT ABM gate.
    oneshot_text = (ROOT / "pspice/lib/COT_ONESHOT.lib").read_text(
        encoding="utf-8"
    )
    fixed_start = oneshot_text.index(".SUBCKT COT_ONESHOT ")
    fixed_end = oneshot_text.index(".ENDS COT_ONESHOT", fixed_start)
    command_start = oneshot_text.index(".SUBCKT COT_ONESHOT_CMD ")
    command_end = oneshot_text.index(".ENDS COT_ONESHOT_CMD", command_start)
    for name, section in (
        ("COT_ONESHOT", oneshot_text[fixed_start:fixed_end]),
        ("COT_ONESHOT_CMD", oneshot_text[command_start:command_end]),
    ):
        compact = " ".join(section.upper().split())
        if "ECHARGE CHARGE01 0 VALUE={IF(V(INH01)>0.5,0,V(REQ01))}" not in compact:
            raise AssertionError(f"{name} missing REQ AND NOT INHIBIT charge gate")
        if "SREQ VHI NCHARGE CHARGE01 0 SW_SHOT_COTLAB" not in compact:
            raise AssertionError(f"{name} timer switch bypasses inhibit charge gate")
        print(f"PASS held-request inhibit gate structure: {name}")

    regression_text = (
        ROOT / "pspice/testbenches/oneshot_inhibit_level_request.cir"
    ).read_text(encoding="utf-8").upper()
    required_fixture_tokens = (
        "VREQ REQ 0 PWL",
        "XFIX REQ INHIBIT QFIX READYFIX COT_ONESHOT",
        "XCMD REQ INHIBIT TONCMD QCMD READYCMD COT_ONESHOT_CMD",
        "FIX_READY_TO_REASSERT",
        "CMD_READY_TO_REASSERT",
    )
    missing_tokens = [
        token for token in required_fixture_tokens if token not in regression_text
    ]
    if missing_tokens:
        raise AssertionError(
            "held-request inhibit fixture missing: " + ", ".join(missing_tokens)
        )
    print("PASS held-request inhibit regression fixture structure")

    # The fixture releases inhibit 100 ns after abort, while the off-lock
    # threshold requires 400 ns after QRAW releases it. The remaining 300 ns is
    # a conservative lower bound because timer-abort delay can only start the
    # off-lock decay later. Once READY rises, the idealized 10-ohm/100-pF timer
    # still needs finite time to reach STARTFRAC=0.99.
    inhibit_assert, inhibit_release, toff_min = 1.3005e-6, 1.4005e-6, 400e-9
    lock_margin = inhibit_assert + toff_min - inhibit_release
    if lock_margin <= 0:
        raise AssertionError("fixture releases inhibit after off-lock expiration")
    close(lock_margin, 300e-9, 1e-18, "held-request remaining off-lock (s)")
    timer_charge_delay = -10 * 100e-12 * math.log(1 - 0.99)
    if timer_charge_delay <= 0:
        raise AssertionError("post-lock timer charge delay must be positive")
    close(
        timer_charge_delay,
        4.60517018599e-9,
        1e-20,
        "post-lock timer charge lower-bound (s)",
    )

    # The current-priority scheduler must select one Boolean winner and derive
    # the other as its exact complement. A smooth analog selector would create
    # two half-scale grants at the tie and can cross both digital thresholds
    # when VLOGIC is greater than one volt.
    scheduler_text = (ROOT / "pspice/lib/PHASE_SCHEDULER.lib").read_text(
        encoding="utf-8"
    )
    priority_start = scheduler_text.index(".SUBCKT CURRENT_PRIORITY_2 ")
    priority_end = scheduler_text.index(".ENDS CURRENT_PRIORITY_2", priority_start)
    priority = " ".join(scheduler_text[priority_start:priority_end].upper().split())
    scheduler_tokens = (
        "EWIN1 WIN1 0 VALUE={IF(V(I1)-V(I2)>TIEBIAS,0,1)}",
        "EWIN2 WIN2 0 VALUE={1-V(WIN1)}",
        "V(NR2)*V(WIN1)",
        "V(NR1)*V(WIN2)",
    )
    missing_scheduler_tokens = [
        token for token in scheduler_tokens if token not in priority
    ]
    if missing_scheduler_tokens or "TANH" in priority or "VSOFT" in priority:
        raise AssertionError(
            "current-priority scheduler is not a single complementary Boolean choice"
        )
    print("PASS current-priority complementary Boolean selector structure")

    boundary_fixture = (
        ROOT / "pspice/testbenches/scheduler_current_priority_boundary.cir"
    ).read_text(encoding="utf-8").upper()
    for token in (
        "VLOGIC=5 TIEBIAS=50M",
        "EXACT_G1",
        "BELOW_G1",
        "ABOVE_G2",
    ):
        if token not in boundary_fixture:
            raise AssertionError(f"scheduler boundary fixture missing: {token}")
    print("PASS current-priority boundary regression fixture structure")

    def priority_grants(
        i1_sense: float, i2_sense: float, tie_bias: float, logic: float
    ) -> tuple[float, float]:
        win1 = 0.0 if i1_sense - i2_sense > tie_bias else 1.0
        return logic * win1, logic * (1 - win1)

    for logic in (1.0, 5.0):
        cases = (
            (4.050, 5.0, 0.0, "exact"),
            (4.049, 5.0, 0.0, "below"),
            (4.051, 0.0, 5.0, "above"),
        )
        for i1_sense, expected_g1, expected_g2, boundary_name in cases:
            scale = logic / 5.0
            grant1, grant2 = priority_grants(i1_sense, 4.0, 0.050, logic)
            close(
                grant1,
                expected_g1 * scale,
                1e-15,
                f"scheduler {boundary_name} G1 at {logic:g}-V logic",
            )
            close(
                grant2,
                expected_g2 * scale,
                1e-15,
                f"scheduler {boundary_name} G2 at {logic:g}-V logic",
            )
            close(
                grant1 + grant2,
                logic,
                1e-15,
                f"scheduler {boundary_name} complementary sum at {logic:g}-V logic",
            )

    # The scalable capstone generator must retain every cumulative late-stage
    # block for each supported phase count and both disclosed timing/scheduler
    # architectures. This is a text-contract test, not a PSpice parse or run.
    for phases in range(2, 9):
        for scheduler in ("fixed-window", "free-running"):
            for law in ("fixed", "adaptive"):
                args = generate_multiphase.parser().parse_args(
                    [
                        "--phases",
                        str(phases),
                        "--scheduler",
                        scheduler,
                        "--on-time-law",
                        law,
                        "--output",
                        "unused.cir",
                    ]
                )
                generate_multiphase.validate_args(args)
                deck = generate_multiphase.generate(args)
                counts = {
                    "buck phase": deck.count("\nXPH"),
                    "current-limit comparator": deck.count("\nXCL"),
                    "one-shot": deck.count("\nXSHOT"),
                    "request comparator": deck.count("\nXREQ"),
                    "balance cell": deck.count("\nXBAL"),
                    "denied marker": deck.count("\nEDENIED"),
                }
                wrong = [name for name, count in counts.items() if count != phases]
                if wrong:
                    raise AssertionError(
                        f"{phases}-phase {scheduler}/{law} wrong generated counts: "
                        + ", ".join(wrong)
                    )
                if deck.count("\nXSHED") != phases - 1:
                    raise AssertionError("generated phase-shedding cell count")
                required = (
                    "VCTRLEN CTRLEN 0 PWL",
                    "VLOADCMD LOADCMD 0 PWL",
                    "VIN IN 0 PWL",
                    "EACTIVECOUNT ACTIVECOUNT",
                    "EISHAREAVG ISHAREAVG",
                    "COT_ONESHOT_CMD",
                    "COMPLEMENTARY_DRIVER_ENABLE",
                    "V(TRIP1)",
                    "V(REF)",
                    "V(FB1)",
                    "V(ILIM)",
                    "V(DENIED1)",
                    "V(SHAREERR1)",
                    "Cadence PSpice execution NOT RUN",
                )
                missing = [token for token in required if token not in deck]
                if missing:
                    raise AssertionError(
                        f"{phases}-phase {scheduler}/{law} missing "
                        + ", ".join(missing)
                    )
                longest = max(len(line) for line in deck.splitlines())
                if longest > 120:
                    raise AssertionError(
                        f"{phases}-phase {scheduler}/{law} generated line "
                        f"length {longest} exceeds 120 characters"
                    )
                if ("ETONBASE TONBASE" in deck) != (law == "adaptive"):
                    raise AssertionError("generated adaptive timing-law selection")
                if ("VTONBASE TONBASE" in deck) != (law == "fixed"):
                    raise AssertionError("generated fixed timing-law selection")
                permit_is_window = "VPERMIT1 PERMIT1 0 PULSE" in deck
                if permit_is_window != (scheduler == "fixed-window"):
                    raise AssertionError("generated scheduler selection")
    print("PASS cumulative N-phase generator matrix: 2..8 phases, 28 configurations")

    # Balance-off and shed-off remain observable: current errors are still
    # formed, while balance gain is zero and all phases are explicitly active.
    off_args = generate_multiphase.parser().parse_args(
        [
            "--phases",
            "4",
            "--balance",
            "off",
            "--phase-shedding",
            "off",
            "--output",
            "unused.cir",
        ]
    )
    generate_multiphase.validate_args(off_args)
    off_deck = generate_multiphase.generate(off_args)
    if off_deck.count("KBAL=0") != 4 or off_deck.count("\nVACTIVE") != 4:
        raise AssertionError("generated balance/shed disable configuration")
    if "EISHAREAVG ISHAREAVG" not in off_deck:
        raise AssertionError("balance-off deck lost current-sharing observation")
    zero_command_args = generate_multiphase.parser().parse_args(
        [
            "--phases", "2",
            "--load", "0",
            "--load-step", "0",
            "--output", "unused.cir",
        ]
    )
    generate_multiphase.validate_args(zero_command_args)
    zero_command_deck = generate_multiphase.generate(zero_command_args)
    if "VLOADCMD LOADCMD 0 PWL(0 0 " not in zero_command_deck:
        raise AssertionError("generated zero commanded ideal-current load case")
    bad_skew_args = generate_multiphase.parser().parse_args(
        [
            "--phases", "2",
            "--phase-offset-skew-ns", "200",
            "--output", "unused.cir",
        ]
    )
    try:
        generate_multiphase.validate_args(bad_skew_args)
    except SystemExit as error:
        if "window width/skew" not in str(error):
            raise
    else:
        raise AssertionError("unsafe generated permit-slot skew was accepted")
    for flag, value in (
        ("--frequency", "nan"),
        ("--phase-offset-skew-ns", "inf"),
        ("--fixed-on-time", "-inf"),
    ):
        invalid_number_args = generate_multiphase.parser().parse_args(
            [f"{flag}={value}", "--output", "unused.cir"]
        )
        try:
            generate_multiphase.validate_args(invalid_number_args)
        except SystemExit as error:
            if "finite numeric values" not in str(error):
                raise
        else:
            raise AssertionError(f"non-finite generator input accepted: {flag}={value}")
    print("PASS generator rejects NaN/Infinity numeric inputs")
    print(
        "PASS generator disable/zero-command observability and permit-gap validation"
    )

    # The checked eight-phase example is generated from this exact option set.
    fixture_args = generate_multiphase.parser().parse_args(
        [
            "--phases", "8",
            "--scheduler", "fixed-window",
            "--on-time-law", "adaptive",
            "--balance", "on",
            "--phase-shedding", "on",
            "--load", "2",
            "--load-step", "22",
            "--l-mismatch-pct", "3",
            "--dcr-mismatch-pct", "4",
            "--resistance-mismatch-pct", "2",
            "--sense-gain-mismatch-pct", "1.5",
            "--sense-offset-mv", "12",
            "--timing-mismatch-pct", "2",
            "--phase-offset-skew-ns", "3",
            "--ripple-amplitude", ".008",
            "--ripple-phase-degrees", "45",
            "--esl", "500e-12",
            "--body-diode-extra-drop", ".05",
            "--max-step", "2e-9",
            "--output", "pspice/validation/generated-8phase-example.cir",
        ]
    )
    generate_multiphase.validate_args(fixture_args)
    expected_fixture = generate_multiphase.generate(fixture_args)
    actual_fixture = (
        ROOT / "pspice/validation/generated-8phase-example.cir"
    ).read_text(encoding="utf-8")
    if actual_fixture != expected_fixture:
        raise AssertionError("checked eight-phase capstone is stale; regenerate it")
    print("PASS checked eight-phase cumulative capstone reproducibility")

    buck_text = (ROOT / "pspice/lib/BUCK_PHASE.lib").read_text(encoding="utf-8")
    for token in ("VBDROP=0", "VBDH SW NBDH {VBDROP}", "VBDL NBDL SW {VBDROP}"):
        if token not in buck_text:
            raise AssertionError(f"buck body-diode offset structure missing: {token}")
    balance_text = (ROOT / "pspice/lib/CURRENT_BALANCE.lib").read_text(
        encoding="utf-8"
    )
    for token in (
        ".SUBCKT CURRENT_BALANCE_CELL",
        "V(IAVGINT)-V(IREFERENCE)",
        "KBAL*V(ERROR)",
    ):
        if token not in balance_text:
            raise AssertionError(f"N-phase balance-cell structure missing: {token}")
    print("PASS generated body-diode offset and N-phase balance-cell structure")

    print("Analytical checks: PASS (20 relationship groups; no circuit simulator invoked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
