#!/usr/bin/env python3
"""Generate an inspectable 2..8-phase educational COT PSpice capstone.

The generated architecture can use fixed eligibility windows or deliberately
free-running requests. It adds N-phase average-current balance, staged phase
shedding/re-entry, fixed or representative adaptive on-time, startup gating,
line/load events, current limit, and deterministic component/sense/timing
mismatch. It does not reproduce a commercial multiphase controller and it has
not been executed in Cadence PSpice. Run from the repository root.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path


def engineering(value: float) -> str:
    """Format SI values with PSpice-friendly engineering suffixes."""
    scales = (
        (1e9, "G"),
        (1e6, "MEG"),
        (1e3, "k"),
        (1e-3, "m"),
        (1e-6, "u"),
        (1e-9, "n"),
        (1e-12, "p"),
    )
    if value == 0:
        return "0"
    for scale, suffix in scales:
        scaled = value / scale
        if 1 <= abs(scaled) < 1000:
            return f"{scaled:.9g}{suffix}"
    return f"{value:.9g}"


def normalized_position(index: int, phases: int) -> float:
    """Return a deterministic symmetric mismatch position in [-1, 1]."""
    midpoint = (phases + 1) / 2
    maximum = (phases - 1) / 2
    return (index - midpoint) / maximum


def permit_source(
    index: int,
    phases: int,
    period: float,
    width_fraction: float,
    offset_skew: float,
) -> str:
    """Emit a one-volt fixed eligibility window for one zero-based phase."""
    spacing = period / phases
    position = normalized_position(index + 1, phases)
    delay = (index * spacing + position * offset_skew) % period
    width = spacing * width_fraction
    return (
        f"VPERMIT{index + 1} PERMIT{index + 1} 0 PULSE(0 1 "
        f"{engineering(delay)} 1n 1n {engineering(width)} {engineering(period)})"
    )


def pwl_step(
    name: str,
    node: str,
    initial: float,
    stepped: float,
    start: float,
    end: float,
    stop: float,
) -> str:
    """Emit a deterministic finite-duration PWL step with 1 ns edges."""
    return (
        f"V{name} {node} 0 PWL(0 {initial:.9g} "
        f"{engineering(start)} {initial:.9g} "
        f"{engineering(start + 1e-9)} {stepped:.9g} "
        f"{engineering(end)} {stepped:.9g} "
        f"{engineering(end + 1e-9)} {initial:.9g} "
        f"{engineering(stop)} {initial:.9g})"
    )


def append_wrapped_sum(
    lines: list[str], header: str, terms: list[str], footer: str
) -> None:
    """Append a continued ABM sum with at most two terms per source line."""
    lines.append(header)
    for start in range(0, len(terms), 2):
        operator = "" if start == 0 else "+"
        lines.append("+ " + operator + "+".join(terms[start : start + 2]))
    lines.append("+ " + footer)


def validate_args(args: argparse.Namespace) -> None:
    """Validate and complete CLI values before text generation."""
    nonfinite = [
        name
        for name, value in vars(args).items()
        if isinstance(value, (int, float))
        and not isinstance(value, bool)
        and not math.isfinite(value)
    ]
    if nonfinite:
        raise SystemExit("require finite numeric values: " + "/".join(nonfinite))
    positive = {
        "frequency": args.frequency,
        "vin": args.vin,
        "vout": args.vout,
        "inductance": args.inductance,
        "dcr": args.dcr,
        "rhs": args.rhs,
        "rls": args.rls,
        "capacitance": args.capacitance,
        "esr": args.esr,
        "bleed-resistance": args.bleed_resistance,
        "current-limit": args.current_limit,
        "current-limit-delay": args.current_limit_delay,
        "ton-min": args.ton_min,
        "ton-max": args.ton_max,
        "min-off-time": args.min_off_time,
        "dead-time": args.dead_time,
        "comparator-delay": args.comparator_delay,
        "startup-ramp": args.startup_ramp,
        "max-step": args.max_step,
        "stop-time": args.stop_time,
    }
    invalid = [name for name, value in positive.items() if value <= 0]
    if invalid:
        raise SystemExit("require positive " + "/".join(invalid))
    if not args.vin > args.vout > 0 or not args.vin_step > args.vout:
        raise SystemExit("require VIN and line-step VIN to remain above VOUT>0")
    if not 0.1 <= args.window_fraction <= 0.9:
        raise SystemExit("--window-fraction must be between 0.1 and 0.9")
    if args.ton_min > args.ton_max:
        raise SystemExit("require TONMIN <= TONMAX")
    if args.esl < 0 or args.load < 0 or args.load_step < 0:
        raise SystemExit("ESL, baseline load, and load-step increment must be nonnegative")
    if args.ripple_amplitude < 0:
        raise SystemExit("ripple amplitude must be nonnegative")
    if args.body_diode_extra_drop < 0 or args.comparator_hysteresis < 0:
        raise SystemExit("body-diode extra drop and hysteresis must be nonnegative")
    if args.balance_bandwidth <= 0 or args.balance_gain < 0 or args.balance_trim < 0:
        raise SystemExit("balance bandwidth must be positive; gain/trim nonnegative")
    if args.phase_add_step <= 0 or not 0 < args.phase_shed_hysteresis < args.phase_add_step:
        raise SystemExit("require 0 < phase-shed-hysteresis < phase-add-step")
    if args.phase_reentry_ramp <= 0:
        raise SystemExit("phase re-entry ramp must be positive")
    if not (
        0 < args.startup_enable < args.load_step_time < args.load_step_end
        < args.line_step_time < args.line_step_end < args.stop_time
    ):
        raise SystemExit(
            "require startup < load-step start < load-step end < line-step start "
            "< line-step end < stop-time"
        )
    if args.startup_enable + args.startup_ramp >= args.load_step_time:
        raise SystemExit("startup reference ramp must finish before the load step")

    nominal_ton = args.vout / args.vin / args.frequency
    if args.fixed_on_time is None:
        args.fixed_on_time = nominal_ton
    if args.fixed_on_time <= 0:
        raise SystemExit("fixed on-time must be positive")

    spacing = 1 / args.frequency / args.phases
    offset_skew = args.phase_offset_skew_ns * 1e-9
    if args.scheduler == "free-running" and args.phase_offset_skew_ns != 0:
        raise SystemExit("permit-slot skew applies only to fixed-window scheduling")
    if args.scheduler == "fixed-window":
        delays = sorted(
            (
                index * spacing
                + normalized_position(index + 1, args.phases) * offset_skew
            )
            % (1 / args.frequency)
            for index in range(args.phases)
        )
        cyclic_gaps = [
            delays[index + 1] - delays[index]
            for index in range(args.phases - 1)
        ] + [1 / args.frequency - delays[-1] + delays[0]]
        if min(cyclic_gaps) - spacing * args.window_fraction <= 2e-9:
            raise SystemExit(
                "fixed window width/skew needs more than 2 ns between adjacent slots"
            )

    for index in range(1, args.phases + 1):
        position = normalized_position(index, args.phases)
        values = {
            "L": args.inductance * (1 + position * args.l_mismatch_pct / 100),
            "DCR": args.dcr * (1 - position * args.dcr_mismatch_pct / 100),
            "RHS": args.rhs * (1 + position * args.resistance_mismatch_pct / 100),
            "RLS": args.rls * (1 - position * args.resistance_mismatch_pct / 100),
            "sense gain": 1 + position * args.sense_gain_mismatch_pct / 100,
            "timing scale": 1 + position * args.timing_mismatch_pct / 100,
        }
        nonpositive = [name for name, value in values.items() if value <= 0]
        if nonpositive:
            raise SystemExit(
                f"phase {index} mismatch creates nonpositive " + "/".join(nonpositive)
            )


def generate(args: argparse.Namespace) -> str:
    """Return the complete generated netlist after ``validate_args``."""
    n = args.phases
    period = 1.0 / args.frequency
    startup_end = args.startup_enable + args.startup_ramp
    load_enabled = startup_end + 1e-6
    ripple_phase = args.ripple_phase_degrees % 360
    minimum_timing_scale = min(
        1 + normalized_position(i, n) * args.timing_mismatch_pct / 100
        for i in range(1, n + 1)
    )
    shortest_event = minimum_timing_scale * min(
        args.dead_time, args.comparator_delay, args.current_limit_delay
    )
    lines = [
        f"Constant On-Time Lab -- generated {n}-phase cumulative COT capstone",
        "* Generated by pspice/scripts/generate_multiphase.py.",
        "* Educational behavioral architecture; not a commercial-controller model.",
        "* STRUCTURAL/ANALYTICAL REVIEW ONLY: Cadence PSpice execution NOT RUN.",
        f"* Scheduler={args.scheduler}; permit-slot-skew={args.phase_offset_skew_ns:.9g} ns;",
        f"* on-time-law={args.on_time_law}; balance={args.balance}; "
        f"phase-shedding={args.phase_shedding}.",
        "* One volt on TONBASE/TONCMD represents one second of commanded on-time.",
        '.INC "pspice/lib/BUCK_PHASE.lib"',
        '.INC "pspice/lib/COT_ONESHOT.lib"',
        '.INC "pspice/lib/COT_CONTROLLER.lib"',
        '.INC "pspice/lib/CURRENT_BALANCE.lib"',
        '.INC "pspice/lib/PHASE_SHEDDING.lib"',
        f".PARAM NPHASES={n} VIN_NOM={args.vin:.9g} VREF_DC={args.vout:.9g}",
        f".PARAM FSW={args.frequency:.9g} TPER={engineering(period)} "
        f"TONFIX={engineering(args.fixed_on_time)}",
        f".PARAM TONMIN={engineering(args.ton_min)} TONMAX={engineering(args.ton_max)} "
        f"TOFFMIN={engineering(args.min_off_time)}",
        f".PARAM BAL_BW={args.balance_bandwidth:.9g} BAL_GAIN={args.balance_gain:.9g} "
        f"BAL_TRIM={args.balance_trim:.9g}",
        pwl_step(
            "IN",
            "IN",
            args.vin,
            args.vin_step,
            args.line_step_time,
            args.line_step_end,
            args.stop_time,
        ),
        f"VREF REF 0 PWL(0 0 {engineering(args.startup_enable)} 0 "
        f"{engineering(startup_end)} {{VREF_DC}} {engineering(args.stop_time)} "
        "{VREF_DC})",
        f"VCTRLEN CTRLEN 0 PWL(0 0 {engineering(args.startup_enable)} 0 "
        f"{engineering(args.startup_enable + 1e-9)} 1 "
        f"{engineering(args.stop_time)} 1)",
        f"VRIPPLE RIPPLE 0 SIN(0 {engineering(args.ripple_amplitude)} "
        f"{{FSW}} 0 0 {ripple_phase:.9g})",
        f"VILIM ILIM 0 {args.current_limit:.9g}",
        "VFORCEON FORCEON 0 0",
        "* LOADCMD is 1 V/A. LOADEN prevents an ideal current sink at zero output.",
        pwl_step(
            "LOADCMD",
            "LOADCMD",
            args.load,
            args.load + args.load_step,
            args.load_step_time,
            args.load_step_end,
            args.stop_time,
        ),
        f"VLOADEN LOADEN 0 PWL(0 0 {engineering(load_enabled)} 0 "
        f"{engineering(load_enabled + 10e-6)} 1 {engineering(args.stop_time)} 1)",
        "ELOADACT LOADACT 0 VALUE={V(LOADCMD)*V(LOADEN)}",
        "GLOAD OUT 0 VALUE={V(LOADACT)}",
    ]
    if args.max_step > shortest_event / 2:
        lines.insert(
            6,
            "* TIMESTEP WARNING: maximum step exceeds half the shortest modeled "
            "delay; refine before interpreting edge timing.",
        )

    if args.on_time_law == "adaptive":
        lines.extend(
            [
                "* Representative feed-forward adaptive law; not universal COT behavior.",
                "ETONBASE TONBASE 0 VALUE={LIMIT(TPER*V(REF)/",
                "+ IF(V(IN)>1,V(IN),1),TONMIN,TONMAX)}",
            ]
        )
    else:
        lines.extend(
            [
                "* Fixed nominal on-time, bounded again at each phase command.",
                "VTONBASE TONBASE 0 {TONFIX}",
            ]
        )

    lines.append("* ACTIVE1 is mandatory; later phases use staged hysteretic shedding.")
    lines.append("VACTIVE1 ACTIVE1 0 1")
    for i in range(2, n + 1):
        if args.phase_shedding == "on":
            add = (i - 1) * args.phase_add_step
            shed = add - args.phase_shed_hysteresis
            lines.extend(
                [
                    f"XSHED{i} LOADACT FORCEON ACTIVE{i} SHEDSTATE{i} "
                    "PHASE_SHEDDING_2 PARAMS:",
                    f"+ ISHED={shed:.9g} IADD={add:.9g} "
                    f"TRAMP={engineering(args.phase_reentry_ramp)} VLOGIC=1",
                ]
            )
        else:
            lines.append(f"VACTIVE{i} ACTIVE{i} 0 1")

    if args.scheduler == "fixed-window":
        lines.extend(
            permit_source(
                i,
                n,
                period,
                args.window_fraction,
                args.phase_offset_skew_ns * 1e-9,
            )
            for i in range(n)
        )
        lines.append(
            "* Fixed windows serialize request opportunities; power pulses can still overlap."
        )
    else:
        for i in range(1, n + 1):
            lines.append(f"VPERMIT{i} PERMIT{i} 0 1")
        lines.append(
            "* Free-running policy intentionally allows collisions and pulse bunching."
        )

    # Current monitors are filtered first. Their active-weighted average is a
    # generated N-phase shared reference; each balance cell then produces a
    # positive feedback trim for an over-current phase.
    effective_balance_gain = "{BAL_GAIN}" if args.balance == "on" else "0"
    append_wrapped_sum(
        lines,
        "EACTIVECOUNT ACTIVECOUNT 0 VALUE={",
        [f"V(ACTIVE{i})" for i in range(1, n + 1)],
        "}",
    )
    append_wrapped_sum(
        lines,
        'EISHAREAVG ISHAREAVG 0 VALUE={(',
        [f"V(IAVG{i})*V(ACTIVE{i})" for i in range(1, n + 1)],
        ")/IF(V(ACTIVECOUNT)>0.5,V(ACTIVECOUNT),1)}",
    )
    for i in range(1, n + 1):
        lines.extend(
            [
                f"XBAL{i} SENSE{i} ISHAREAVG ACTIVE{i} IAVG{i} TRIM{i} "
                f"SHAREERR{i} CURRENT_BALANCE_CELL PARAMS:",
                f"+ BW={{BAL_BW}} KBAL={effective_balance_gain} "
                "TRIMMAX={BAL_TRIM} VLOGIC=1",
            ]
        )

    for i in range(1, n + 1):
        position = normalized_position(i, n)
        l_value = args.inductance * (1 + position * args.l_mismatch_pct / 100)
        dcr_value = args.dcr * (1 - position * args.dcr_mismatch_pct / 100)
        rhs_value = args.rhs * (1 + position * args.resistance_mismatch_pct / 100)
        rls_value = args.rls * (1 - position * args.resistance_mismatch_pct / 100)
        sense_gain = 1 + position * args.sense_gain_mismatch_pct / 100
        sense_offset = position * args.sense_offset_mv * 1e-3
        timing_scale = 1 + position * args.timing_mismatch_pct / 100
        comparator_delay = args.comparator_delay * timing_scale
        current_limit_delay = args.current_limit_delay * timing_scale
        dead_time = args.dead_time * timing_scale
        lines.extend(
            [
                f"* Phase {i}: normalized mismatch position {position:+.6f}.",
                f"ESENSE{i} SENSE{i} 0 VALUE={{{sense_gain:.9g}*V(IMON{i})"
                f"{sense_offset:+.9g}}}",
                f"EFB{i} FB{i} 0 VALUE={{V(OUT)+V(TRIM{i})}}",
                f"XREQ{i} FB{i} REF RIPPLE REQC{i} COT_REQUEST PARAMS:",
                f"+ VLOGIC=5 VSOFT=2m VHYST={engineering(args.comparator_hysteresis)} "
                f"TDELAY={engineering(comparator_delay)}",
                f"EPHASEEN{i} PHASEEN{i} 0 VALUE={{V(CTRLEN)*V(ACTIVE{i})}}",
                f"EREQ{i} REQ{i} 0 VALUE={{V(REQC{i})*V(PERMIT{i})*V(PHASEEN{i})}}",
                f"EDENIED{i} DENIED{i} 0 VALUE={{V(REQC{i})*",
                f"+ (1-V(PERMIT{i})*V(PHASEEN{i}))}}",
                f"XCL{i} SENSE{i} ILIM TRIP{i} COT_CURRENT_LIMIT PARAMS:",
                f"+ VLOGIC=5 TDELAY={engineering(current_limit_delay)}",
                f"ETON{i} TONCMD{i} 0 VALUE={{LIMIT(V(TONBASE)*{timing_scale:.9g},",
                "+ TONMIN,TONMAX)}",
                f"XSHOT{i} REQ{i} TRIP{i} TONCMD{i} GATE{i} READY{i} "
                "COT_ONESHOT_CMD PARAMS:",
                "+ TONMIN={TONMIN} TONMAX={TONMAX} TOFFMIN={TOFFMIN} VLOGIC=5",
                f"XDRV{i} GATE{i} PHASEEN{i} GH{i} GL{i} "
                "COMPLEMENTARY_DRIVER_ENABLE PARAMS:",
                f"+ VLOGIC=5 VENHIGH=1 DEAD={engineering(dead_time)}",
                f"XPH{i} IN OUT GH{i} GL{i} SW{i} IMON{i} BUCK_PHASE PARAMS:",
                f"+ LPH={engineering(l_value)} DCR={engineering(dcr_value)} "
                f"RHS={engineering(rhs_value)} RLS={engineering(rls_value)} "
                f"VBDROP={engineering(args.body_diode_extra_drop)} IMONGAIN=1",
            ]
        )

    sum_expression = "+".join(f"V(IMON{i})" for i in range(1, n + 1))
    lines.extend(
        [
            f"EISUM ISUM 0 VALUE={{{sum_expression}}}",
            f"RESR OUT NESR {engineering(args.esr)}",
        ]
    )
    if args.esl > 0:
        lines.append(f"LESL NESR NCAP {engineering(args.esl)}")
    else:
        lines.append("VNOESL NESR NCAP 0")
    lines.extend(
        [
            f"COUT NCAP 0 {engineering(args.capacitance)} IC=0",
            f"RBLEED OUT 0 {engineering(args.bleed_resistance)}",
            f"ECAPCURRENT ICAPMON 0 VALUE={{V(ISUM)-V(LOADACT)-"
            f"V(OUT)/{args.bleed_resistance:.9g}}}",
            ".IC V(OUT)=0",
            ".OPTIONS RELTOL=1m ABSTOL=10n VNTOL=1u ITL4=2500",
            f".TRAN {engineering(args.max_step)} {engineering(args.stop_time)} "
            f"0 {engineering(args.max_step)}",
            f".MEAS TRAN STARTUP_MAX MAX V(OUT) FROM=0 TO={engineering(args.load_step_time)}",
            f".MEAS TRAN LOADSTEP_MIN MIN V(OUT) FROM={engineering(args.load_step_time)} "
            f"TO={engineering(args.load_step_end)}",
            f".MEAS TRAN LINESTEP_MIN MIN V(OUT) FROM={engineering(args.line_step_time)} "
            f"TO={engineering(args.line_step_end)}",
            f".MEAS TRAN FINAL_VOUT AVG V(OUT) FROM={engineering(args.stop_time * .9)} "
            f"TO={engineering(args.stop_time)}",
            f".MEAS TRAN FINAL_ACTIVE AVG V(ACTIVECOUNT) FROM={engineering(args.stop_time * .9)} "
            f"TO={engineering(args.stop_time)}",
            ".PROBE V(IN) V(OUT) V(NCAP) V(REF) V(ILIM)",
            "+ V(LOADCMD) V(LOADEN) V(LOADACT) V(CTRLEN)",
            "+ V(TONBASE) V(RIPPLE) V(ISUM) V(ICAPMON)",
        ]
    )
    for i in range(1, n + 1):
        lines.append(
            f"+ V(IMON{i}) V(SENSE{i}) V(IAVG{i}) V(SW{i}) V(GATE{i}) "
            f"V(GH{i}) V(GL{i}) V(TONCMD{i}) V(PERMIT{i}) V(READY{i})"
        )
        lines.append(
            f"+ V(FB{i}) V(REQC{i}) V(REQ{i}) V(DENIED{i}) V(TRIP{i}) V(TRIM{i}) "
            f"V(SHAREERR{i}) V(ACTIVE{i})"
        )
    lines.extend(["+ V(ISHAREAVG) V(ACTIVECOUNT)", ".END", ""])
    return "\n".join(lines)


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--phases", type=int, default=4, choices=range(2, 9))
    p.add_argument("--scheduler", choices=("fixed-window", "free-running"), default="fixed-window")
    p.add_argument("--on-time-law", choices=("fixed", "adaptive"), default="adaptive")
    p.add_argument("--balance", choices=("on", "off"), default="on")
    p.add_argument("--phase-shedding", choices=("on", "off"), default="on")
    p.add_argument("--frequency", type=float, default=500e3, help="timing-law/window Hz")
    p.add_argument("--vin", type=float, default=12.0)
    p.add_argument("--vin-step", type=float, default=9.0)
    p.add_argument("--vout", type=float, default=5.0)
    p.add_argument("--load", type=float, default=2.0, help="baseline ideal-current load, A; may be zero")
    p.add_argument("--load-step", type=float, default=14.0, help="added ideal-current load, A")
    p.add_argument("--inductance", type=float, default=2e-6, help="nominal H")
    p.add_argument("--dcr", type=float, default=10e-3, help="nominal ohm")
    p.add_argument("--rhs", type=float, default=15e-3, help="nominal high-side ohm")
    p.add_argument("--rls", type=float, default=8e-3, help="nominal low-side ohm")
    p.add_argument("--body-diode-extra-drop", type=float, default=0.0, help="V added in series with junction")
    p.add_argument("--capacitance", type=float, default=470e-6, help="F")
    p.add_argument("--esr", type=float, default=5e-3, help="ohm")
    p.add_argument("--esl", type=float, default=0.0, help="H; zero emits an ideal short")
    p.add_argument("--bleed-resistance", type=float, default=100.0, help="ohm")
    p.add_argument("--current-limit", type=float, default=6.0, help="sensed A/phase")
    p.add_argument("--current-limit-delay", type=float, default=8e-9, help="s")
    p.add_argument("--fixed-on-time", type=float, default=None, help="s; default VOUT/VIN/FSW")
    p.add_argument("--ton-min", type=float, default=100e-9)
    p.add_argument("--ton-max", type=float, default=1.5e-6)
    p.add_argument("--min-off-time", type=float, default=100e-9)
    p.add_argument("--dead-time", type=float, default=20e-9)
    p.add_argument("--comparator-delay", type=float, default=10e-9)
    p.add_argument("--comparator-hysteresis", type=float, default=4e-3)
    p.add_argument("--ripple-amplitude", type=float, default=0.0, help="injected sine peak, V")
    p.add_argument("--ripple-phase-degrees", type=float, default=0.0)
    p.add_argument("--l-mismatch-pct", type=float, default=0.0, help="outer phases are +/- this percent")
    p.add_argument("--dcr-mismatch-pct", type=float, default=0.0, help="outer phases are -/+ this percent")
    p.add_argument("--resistance-mismatch-pct", type=float, default=0.0)
    p.add_argument("--sense-gain-mismatch-pct", type=float, default=0.0)
    p.add_argument("--sense-offset-mv", type=float, default=0.0, help="outer phases are +/- this many mV")
    p.add_argument("--timing-mismatch-pct", type=float, default=0.0)
    p.add_argument(
        "--phase-offset-skew-ns",
        type=float,
        default=0.0,
        help="symmetric outer-phase permit-slot displacement, ns",
    )
    p.add_argument("--balance-bandwidth", type=float, default=2e3, help="Hz")
    p.add_argument("--balance-gain", type=float, default=25e-3, help="V trim per A error")
    p.add_argument("--balance-trim", type=float, default=75e-3, help="absolute V clamp")
    p.add_argument("--phase-add-step", type=float, default=3.0, help="A between staged add thresholds")
    p.add_argument("--phase-shed-hysteresis", type=float, default=0.5, help="A below add threshold")
    p.add_argument("--phase-reentry-ramp", type=float, default=20e-6, help="s")
    p.add_argument("--window-fraction", type=float, default=0.7)
    p.add_argument("--startup-enable", type=float, default=20e-6)
    p.add_argument("--startup-ramp", type=float, default=20e-6)
    p.add_argument("--load-step-time", type=float, default=400e-6)
    p.add_argument("--load-step-end", type=float, default=800e-6)
    p.add_argument("--line-step-time", type=float, default=1.0e-3)
    p.add_argument("--line-step-end", type=float, default=1.3e-3)
    p.add_argument("--max-step", type=float, default=2e-9)
    p.add_argument("--stop-time", type=float, default=2e-3)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--force", action="store_true")
    return p


def main() -> int:
    args = parser().parse_args()
    validate_args(args)
    if args.output.exists() and not args.force:
        raise SystemExit(f"refusing to overwrite {args.output}; add --force")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(generate(args), encoding="utf-8")
    print(
        f"wrote {args.output} ({args.phases} phases, {args.scheduler}, "
        f"{args.on_time_law} on-time)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
