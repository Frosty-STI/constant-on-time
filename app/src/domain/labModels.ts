import {
  assessTimeStep,
  bodeSweep,
  buckControlToOutput,
  buckResonantFrequency,
  capacitorEsrZero,
  closedLoopFromLoopGain,
  closedLoopOutputImpedance,
  createBuckPlantState,
  createCotState,
  createCurrentBalanceState,
  createSchedulerState,
  effectiveRippleFrequency,
  evaluateCompensator,
  evaluateLoopGain,
  findLoopMargins,
  idealBuckOperatingPoint,
  idealInterleavedSumRipple,
  peakCurrentStability,
  pwmDrivesAt,
  pwmEventTimes,
  requestedCotOnTime,
  rippleInjectionAt,
  schedulePulseRequests,
  simulateBuckPlant,
  simulatePeakCurrentCycles,
  stepCotController,
  updateCurrentBalance,
} from '@constant-on-time/sim-core';
import type { BuckPlantSample, CompensatorConfig, DynamicLoadProfile, LoopModelConfig } from '@constant-on-time/sim-core';

import type { LabDefinition, LabId } from './labs';
import { validateLabParameters } from './scenario';

export interface SignalSeries {
  readonly name: string;
  readonly unit: string;
  readonly values: readonly number[];
  readonly color: string;
  readonly dash?: readonly number[];
  readonly marker?: 'circle' | 'square' | 'diamond' | 'none';
}

export interface LabMetric {
  readonly label: string;
  readonly value: number | string;
  readonly unit?: string;
  readonly tone?: 'normal' | 'good' | 'warning' | 'danger';
}

export interface LabEvent {
  readonly x: number;
  readonly label: string;
  readonly phase?: number;
  readonly kind: 'edge' | 'request' | 'grant' | 'waiting' | 'delayed' | 'denied' | 'load' | 'crossing' | 'artifact';
}

export interface LabPlot {
  readonly x: readonly number[];
  readonly xLabel: string;
  readonly xUnit: string;
  readonly signals: readonly SignalSeries[];
  readonly events: readonly LabEvent[];
}

export interface SupplementalPlot extends LabPlot {
  readonly title: string;
  readonly disclosure: string;
}

export interface LabResult extends LabPlot {
  readonly metrics: readonly LabMetric[];
  readonly expectedPrediction: number | string;
  readonly predictionTolerance?: number;
  readonly summary: string;
  readonly discrepancyHint: string;
  readonly warnings: readonly string[];
  readonly seed: number;
  readonly supplementalPlots?: readonly SupplementalPlot[];
}

const COLORS = ['#ffc400', '#36c7d8', '#f061c8', '#5bd26a', '#9b8cff', '#ff8a4c', '#62a0ff', '#f2f5f7'] as const;

const value = (parameters: Readonly<Record<string, number>>, key: string, fallback: number): number => {
  const candidate = parameters[key];
  return Number.isFinite(candidate) ? (candidate as number) : fallback;
};

const linspace = (start: number, stop: number, count: number): number[] => {
  if (count < 2) return [start];
  const step = (stop - start) / (count - 1);
  return Array.from({ length: count }, (_, index) => start + step * index);
};

const timeWeightedMean = (
  time: readonly number[],
  samples: readonly number[],
  transform: (sample: number) => number = (sample) => sample,
): number => {
  if (time.length !== samples.length || time.length === 0) throw new RangeError('Time-weighted data must be nonempty and length matched.');
  if (time.length === 1) return transform(samples[0] ?? 0);
  let integral = 0;
  for (let index = 1; index < time.length; index += 1) {
    const dt = (time[index] ?? 0) - (time[index - 1] ?? 0);
    if (!(dt >= 0)) throw new RangeError('Time-weighted data must be chronological.');
    integral += 0.5 * (transform(samples[index - 1] ?? 0) + transform(samples[index] ?? 0)) * dt;
  }
  const duration = (time[time.length - 1] ?? 0) - (time[0] ?? 0);
  return duration > 0 ? integral / duration : transform(samples[0] ?? 0);
};

const timeWeightedRms = (time: readonly number[], samples: readonly number[]): number =>
  Math.sqrt(Math.max(timeWeightedMean(time, samples, (sample) => sample ** 2), 0));

const triangle = (cyclePosition: number): number => {
  const wrapped = cyclePosition - Math.floor(cyclePosition);
  return 1 - 4 * Math.abs(wrapped - 0.5);
};

const dutyTriangle = (cyclePosition: number, duty: number): number => {
  const wrapped = ((cyclePosition % 1) + 1) % 1;
  if (duty <= 0 || duty >= 1) return 0;
  return wrapped < duty
    ? -0.5 + wrapped / duty
    : 0.5 - (wrapped - duty) / (1 - duty);
};

const clamp = (input: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, input));

/** Maps phase margin to the damping ratio of the canonical second-order,
 * unity-feedback model. This is intentionally a reduced-order interpretation,
 * not an assertion that an arbitrary converter loop is exactly second order. */
const dampingFromPhaseMargin = (phaseMarginDegrees: number): number => {
  const target = clamp(phaseMarginDegrees, 0.1, 89.9) * Math.PI / 180;
  const marginForDamping = (damping: number): number => Math.atan2(
    2 * damping,
    Math.sqrt(Math.max(Math.sqrt(1 + 4 * damping ** 4) - 2 * damping ** 2, 1e-18)),
  );
  let lower = 0.001;
  let upper = 10;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (marginForDamping(midpoint) < target) lower = midpoint;
    else upper = midpoint;
  }
  return (lower + upper) / 2;
};

/** Converts the unity-gain frequency of the canonical second-order loop to its
 * undamped natural frequency. */
const naturalFrequencyFromCrossover = (crossover: number, damping: number): number => {
  // For L(s)=ωn²/[s(s+2ζωn)], unity gain gives
  // (ωc/ωn)^4 + 4ζ²(ωc/ωn)² - 1 = 0.
  const ratioSquared = Math.sqrt(1 + 4 * damping ** 4) - 2 * damping ** 2;
  return crossover / Math.sqrt(Math.max(ratioSquared, 1e-18));
};

interface SecondOrderRecoveryOptions {
  readonly title: string;
  readonly disclosure: string;
  readonly naturalFrequency: number;
  readonly damping: number;
  readonly capacitance: number;
  readonly loadStep: number;
}

/** Closed-form load-disturbance response for
 *   d2v/dt2 + 2 zeta wn dv/dt + wn2 v = 0,
 * with dv/dt(0+) = -DeltaI/C. The companion current is reconstructed from
 * i_control = DeltaI + C dv/dt. */
const secondOrderRecoveryPlot = (options: SecondOrderRecoveryOptions): SupplementalPlot => {
  const damping = Math.max(options.damping, 0.001);
  const omega = 2 * Math.PI * Math.max(options.naturalFrequency, 1);
  const decayRate = damping < 1 ? damping * omega : omega * (damping - Math.sqrt(damping ** 2 - 1));
  const responseDuration = Math.min(Math.max(10 / Math.max(decayRate, 1), 40e-6), 20e-3);
  const stepTime = responseDuration * 0.08;
  const x = linspace(0, stepTime + responseDuration, 1201);
  const outputDeviation: number[] = [];
  const controllerCurrent: number[] = [];
  const loadCurrent: number[] = [];
  const initialSlope = -options.loadStep / options.capacitance;

  for (const time of x) {
    const elapsed = time - stepTime;
    if (elapsed < 0) {
      outputDeviation.push(0);
      controllerCurrent.push(0);
      loadCurrent.push(0);
      continue;
    }
    let deviation: number;
    let derivative: number;
    if (damping < 1 - 1e-8) {
      const dampedOmega = omega * Math.sqrt(1 - damping ** 2);
      const envelope = Math.exp(-damping * omega * elapsed);
      deviation = initialSlope * envelope * Math.sin(dampedOmega * elapsed) / dampedOmega;
      derivative = initialSlope * envelope * (
        Math.cos(dampedOmega * elapsed) - damping * omega * Math.sin(dampedOmega * elapsed) / dampedOmega
      );
    } else if (damping <= 1 + 1e-8) {
      const envelope = Math.exp(-omega * elapsed);
      deviation = initialSlope * elapsed * envelope;
      derivative = initialSlope * envelope * (1 - omega * elapsed);
    } else {
      const root = Math.sqrt(damping ** 2 - 1);
      const slowPole = -omega * (damping - root);
      const fastPole = -omega * (damping + root);
      const coefficient = initialSlope / (slowPole - fastPole);
      deviation = coefficient * (Math.exp(slowPole * elapsed) - Math.exp(fastPole * elapsed));
      derivative = coefficient * (slowPole * Math.exp(slowPole * elapsed) - fastPole * Math.exp(fastPole * elapsed));
    }
    outputDeviation.push(deviation);
    controllerCurrent.push(options.loadStep + options.capacitance * derivative);
    loadCurrent.push(options.loadStep);
  }

  return {
    title: options.title,
    disclosure: options.disclosure,
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'ΔvOUT', unit: 'V', values: outputDeviation, color: '#f061c8', marker: 'diamond' },
      { name: 'ΔiLOAD', unit: 'A', values: loadCurrent, color: '#ff8a4c', dash: [8, 5], marker: 'square' },
      { name: 'Controller current response', unit: 'A', values: controllerCurrent, color: '#36c7d8', dash: [3, 4], marker: 'circle' },
    ],
    events: [{ x: stepTime, label: `+${formatEngineering(options.loadStep, 'A')} averaged load step`, kind: 'load' }],
  };
};

const seededNoise = (seed: number): (() => number) => {
  let state = seed >>> 0 || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
};

interface BuckPoint {
  readonly vin: number;
  readonly vout: number;
  readonly fs: number;
  readonly inductance: number;
  readonly load: number;
  readonly phases: number;
  readonly duty: number;
  readonly period: number;
  readonly ripple: number;
  readonly phaseAverage: number;
  readonly peak: number;
  readonly valley: number;
}

const buckPoint = (parameters: Readonly<Record<string, number>>): BuckPoint => {
  const vin = Math.max(value(parameters, 'vin', 12), 1e-9);
  const vout = clamp(value(parameters, 'vout', 5), 0, vin * 0.999999);
  const fs = Math.max(value(parameters, 'fs', 500) * 1e3, 1);
  const inductance = Math.max(value(parameters, 'inductance', 1) * 1e-6, 1e-12);
  const load = Math.max(value(parameters, 'load', 8), 0);
  const phases = clamp(Math.round(value(parameters, 'phases', 2)), 1, 8);
  const operatingPoint = idealBuckOperatingPoint({ vin, vout, switchingFrequency: fs, inductance, loadCurrent: load, phases });
  const duty = clamp(operatingPoint.dutyRatio, 0.001, 0.999);
  const period = operatingPoint.period;
  const ripple = operatingPoint.ripplePeakToPeak;
  const phaseAverage = operatingPoint.averagePhaseCurrent;
  return {
    vin,
    vout,
    fs,
    inductance,
    load,
    phases,
    duty,
    period,
    ripple,
    phaseAverage,
    peak: operatingPoint.peakPhaseCurrent,
    valley: operatingPoint.valleyPhaseCurrent,
  };
};

interface PwmSimulationOptions {
  readonly capacitance?: number;
  readonly capacitorEsr?: number;
  readonly capacitorEsl?: number;
  readonly dcr?: number;
  readonly deadTime?: number;
  readonly requestedStep: number;
  readonly cycles: number;
  readonly load?: DynamicLoadProfile;
  readonly inductanceMismatchPercent?: number;
  readonly dcrMismatchPercent?: number;
  readonly senseMismatchPercent?: number;
  readonly phaseErrorDegrees?: number;
}

interface PwmSimulation {
  readonly samples: readonly BuckPlantSample[];
  readonly eventTimes: readonly number[];
  readonly warnings: readonly string[];
  readonly requestedStep: number;
  readonly effectiveStep: number;
  readonly integrationSteps: number;
}

const simulatePwmBuck = (point: BuckPoint, options: PwmSimulationOptions): PwmSimulation => {
  const duration = point.period * options.cycles;
  const effectiveStep = Math.max(options.requestedStep, duration / 25_000);
  const mismatch = (options.inductanceMismatchPercent ?? 0) / 100;
  const dcrMismatch = (options.dcrMismatchPercent ?? 0) / 100;
  const senseMismatch = (options.senseMismatchPercent ?? 0) / 100;
  const phaseError = (options.phaseErrorDegrees ?? 0) / 360 * point.period;
  const phases = Array.from({ length: point.phases }, (_, phase) => {
    const normalized = (phase - (point.phases - 1) / 2) / Math.max(point.phases - 1, 1);
    return {
      inductance: point.inductance * (1 + normalized * mismatch),
      dcr: (options.dcr ?? 0) * (1 + normalized * dcrMismatch),
      currentSenseGain: 1 + normalized * senseMismatch,
    };
  });
  const phaseOffsets = phases.map((_, phase) => phase / point.phases);
  const timingOffsets = phases.map((_, phase) => (phase % 2 === 0 ? phaseError : -phaseError));
  const plant = {
    vin: point.vin,
    capacitance: options.capacitance ?? 1,
    capacitorEsr: options.capacitorEsr ?? 0,
    capacitorEsl: options.capacitorEsl ?? 0,
    phases,
    load: options.load ?? { initial: { kind: 'constant-current' as const, current: point.load } },
  };
  const pwm = {
    switchingFrequency: point.fs,
    dutyRatio: point.duty,
    deadTime: options.deadTime ?? 0,
    phaseOffsets,
    timingOffsets,
  };
  const initialCurrents = phases.map((_, phase) => {
    const local = -(phaseOffsets[phase] ?? 0) - (timingOffsets[phase] ?? 0) / point.period;
    return point.phaseAverage + point.ripple * dutyTriangle(local, point.duty);
  });
  const startState = createBuckPlantState(plant, { vCap: point.vout, phaseCurrents: initialCurrents });
  const eventTimes = pwmEventTimes(0, duration, point.phases, pwm);
  const simulated = simulateBuckPlant(plant, {
    startState,
    stopTime: duration,
    maxStep: effectiveStep,
    driveAt: (time) => pwmDrivesAt(time, point.phases, pwm),
    eventTimes,
    maxSamples: 30_000,
  });
  const stride = Math.max(1, Math.ceil(simulated.samples.length / 1400));
  const samples = simulated.samples.filter((_, index) => index % stride === 0 || index === simulated.samples.length - 1);
  const assessment = assessTimeStep({
    integrationStep: options.requestedStep,
    switchingFrequency: point.fs,
    phaseCount: point.phases,
    deadTime: options.deadTime,
  });
  const warnings = assessment.warnings.map((warning) => warning.message);
  if (effectiveStep > options.requestedStep * (1 + 1e-12)) {
    warnings.push(`Interactive run capped at 25,000 RK4 intervals: effective step is ${formatEngineering(effectiveStep, 's')} rather than the requested ${formatEngineering(options.requestedStep, 's')}.`);
  }
  return { samples, eventTimes, warnings, requestedStep: options.requestedStep, effectiveStep, integrationSteps: simulated.integrationSteps };
};

const rippleLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const dt = value(parameters, 'dt', 2) * 1e-9;
  const simulation = simulatePwmBuck(point, {
    requestedStep: dt,
    cycles: 5,
    dcr: value(parameters, 'dcr', 3) * 1e-3,
    deadTime: value(parameters, 'deadTime', 50) * 1e-9,
  });
  const x = simulation.samples.map((sample) => sample.time);
  const currents: SignalSeries[] = Array.from({ length: point.phases }, (_, phase) => ({
    name: `iL${phase + 1}`,
    unit: 'A',
    values: simulation.samples.map((sample) => sample.phaseCurrents[phase] ?? 0),
    color: COLORS[phase % COLORS.length] as string,
    dash: phase % 2 === 0 ? undefined : [8, 5],
    marker: phase % 3 === 0 ? 'circle' : phase % 3 === 1 ? 'square' : 'diamond',
  }));
  const summed: SignalSeries = {
    name: 'Σ iL', unit: 'A', values: simulation.samples.map((sample) => sample.sumInductorCurrent),
    color: '#f061c8', dash: [3, 4], marker: 'diamond',
  };
  const measuredRipple = Math.max(...(currents[0]?.values ?? [0])) - Math.min(...(currents[0]?.values ?? [0]));
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [...currents, summed],
    metrics: [
      { label: 'On slope', value: (point.vin - point.vout) / point.inductance, unit: 'A/s' },
      { label: 'Off slope', value: -point.vout / point.inductance, unit: 'A/s' },
      { label: 'Ripple / phase', value: point.ripple, unit: 'A' },
      { label: 'Measured RK4 ripple P1', value: measuredRipple, unit: 'A' },
      { label: 'Peak / phase', value: point.peak, unit: 'A' },
      { label: 'Valley / phase', value: point.valley, unit: 'A', tone: point.valley > 0 ? 'good' : 'warning' },
      { label: 'Conduction prediction', value: point.valley > 0 ? 'CCM' : point.valley === 0 ? 'Boundary' : 'DCM or reverse-current capable' },
      { label: 'Effective RK4 step', value: simulation.effectiveStep, unit: 's' },
    ],
    events: simulation.eventTimes.slice(0, 24).map((event, index) => ({ x: event, label: `switch boundary ${index + 1}`, kind: 'edge' as const })),
    expectedPrediction: point.ripple,
    predictionTolerance: Math.max(point.ripple * 0.12, 0.02),
    summary: `Each phase carries ${formatEngineering(point.phaseAverage, 'A')} average with ${formatEngineering(point.ripple, 'A')} peak-to-peak ripple.`,
    discrepancyHint: 'The ideal derivation uses Vout/Vin for duty and omits DCR and dead-time voltage loss; the switched trace exposes timing, while the analytical value is the comparison baseline.',
    warnings: simulation.warnings,
    seed,
  };
};

const currentPathLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const vin = value(parameters, 'vin', 12);
  const vout = value(parameters, 'vout', 5);
  const current = value(parameters, 'current', 5);
  const diodeDrop = value(parameters, 'diodeDrop', 0.7);
  const state = Math.round(value(parameters, 'state', 2));
  const stateNames = ['High-side on', 'Low-side on', 'Dead time', 'Asynchronous freewheel', 'Reverse current · low-side on', 'Diode emulation', 'Startup'] as const;
  const switchNode = state === 0 || state === 6
    ? vin
    : state === 1
      ? 0
      : state === 2
        ? (current > 0 ? -diodeDrop : current < 0 ? vin + diodeDrop : vout)
        : state === 3
          ? (current > 0 ? -diodeDrop : current < 0 ? vin + diodeDrop : vout)
          : state === 4
            ? (current < 0 ? 0 : vout)
            : state === 5
              ? (current > 0 ? 0 : current < 0 ? vin + diodeDrop : vout)
              : vout;
  const inductorVoltage = switchNode - vout;
  const slope = inductorVoltage / 1e-6;
  const zeroCrossing = current * slope < 0 ? Math.abs(current / slope) : Number.POSITIVE_INFINITY;
  // A selected topology is valid only until current changes sign. Stop the
  // frozen-state teaching trace before that boundary instead of silently
  // continuing with the wrong body diode.
  const duration = Math.max(20e-9, Math.min(2e-6, zeroCrossing * 0.9));
  const x = linspace(0, duration, 121);
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'vSW', unit: 'V', values: x.map(() => switchNode), color: '#ffc400', marker: 'square' },
      { name: 'vL', unit: 'V', values: x.map(() => inductorVoltage), color: '#36c7d8', dash: [8, 5], marker: 'circle' },
      { name: 'iL', unit: 'A', values: x.map((time) => current + slope * time), color: '#f061c8', dash: [3, 4], marker: 'diamond' },
    ],
    metrics: [
      { label: 'Selected state', value: stateNames[clamp(state, 0, stateNames.length - 1)] ?? 'Unknown' },
      { label: 'Switch node', value: switchNode, unit: 'V' },
      { label: 'Inductor voltage', value: inductorVoltage, unit: 'V' },
      { label: 'Current direction', value: current >= 0 ? 'Toward output' : 'Toward switch node' },
    ],
    events: [{ x: 0, label: stateNames[clamp(state, 0, stateNames.length - 1)] ?? 'State', kind: 'edge' }],
    // The predict-before-reveal question is deliberately fixed to positive
    // current during dead time. State/current controls are the transfer task.
    expectedPrediction: 'low-side body diode',
    summary: `The resolved switch node is ${formatEngineering(switchNode, 'V')}, so vL = vSW − vO = ${formatEngineering(inductorVoltage, 'V')}.`,
    discrepancyHint: 'During dead time the inductor current cannot change instantaneously; its sign selects which body diode clamps the switch node.',
    warnings: [
      ...(state === 4 && current >= 0 ? ['Reverse-current state requires negative inductor current; the open-state voltage is shown until the sign is corrected.'] : []),
      ...(state === 5 && current < 0 ? ['Diode emulation prevents sustained reverse current, but stored negative current first commutates through the high-side body diode and slews to zero before the phase opens.'] : []),
      ...(state === 3 && current < 0 ? ['An asynchronous catch diode prevents sustained reverse current, but stored negative current first commutates through the high-side body diode and slews to zero before the phase opens.'] : []),
      ...(Number.isFinite(zeroCrossing) && zeroCrossing < 2e-6 ? ['The trace stops before the predicted zero-current crossing because the selected conduction topology must change there.'] : []),
    ],
    seed,
  };
};

const capacitorLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const capacitance = Math.max(value(parameters, 'capacitance', 100) * 1e-6, 1e-12);
  const esr = Math.max(value(parameters, 'esr', 5) * 1e-3, 0);
  const esl = Math.max(value(parameters, 'esl', 0) * 1e-9, 0);
  const loadStep = value(parameters, 'loadStep', 5);
  const recoveryFrequency = value(parameters, 'recoveryFrequency', 35) * 1e3;
  const recoveryDamping = value(parameters, 'recoveryDamping', 0.7);
  const stepTime = point.period * 4;
  const simulation = simulatePwmBuck(point, {
    capacitance,
    capacitorEsr: esr,
    capacitorEsl: esl,
    requestedStep: value(parameters, 'dt', 2) * 1e-9,
    cycles: 8,
    load: {
      initial: { kind: 'constant-current', current: point.load },
      steps: [{ at: stepTime, load: { kind: 'constant-current', current: point.load + loadStep } }],
    },
  });
  const x = simulation.samples.map((sample) => sample.time);
  const capacitorCurrent = simulation.samples.map((sample) => sample.capacitorCurrent);
  const capacitorVoltage = simulation.samples.map((sample) => sample.vCap);
  const outputVoltage = simulation.samples.map((sample) => sample.vOut);
  const summedRipple = idealInterleavedSumRipple(point.ripple, point.duty, point.phases);
  const rippleFrequency = effectiveRippleFrequency(point.fs, point.phases);
  const capacitiveRipple = summedRipple / (8 * rippleFrequency * capacitance);
  const esrRipple = summedRipple * esr;
  const recoveryPlot = secondOrderRecoveryPlot({
    title: 'Separate averaged control-loop recovery cross-check',
    disclosure: `This is a separate linear, averaged second-order disturbance model (fn=${formatEngineering(recoveryFrequency, 'Hz')}, ζ=${recoveryDamping.toFixed(2)}). It does not feed back into, splice onto, or alter the switched open-loop trace above; saturation, delay, switching ripple, and controller-specific limits are excluded.`,
    naturalFrequency: recoveryFrequency,
    damping: recoveryDamping,
    capacitance,
    loadStep,
  });
  const recoveryDeviation = recoveryPlot.signals.find((signal) => signal.name === 'ΔvOUT')?.values ?? [];
  const predictedTrough = recoveryDeviation.length > 0 ? Math.min(...recoveryDeviation) : 0;
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'iC', unit: 'A', values: capacitorCurrent, color: '#36c7d8', dash: [8, 5], marker: 'circle' },
      { name: 'vC', unit: 'V', values: capacitorVoltage, color: '#ffc400', marker: 'square' },
      { name: 'vOUT', unit: 'V', values: outputVoltage, color: '#f061c8', dash: [3, 4], marker: 'diamond' },
    ],
    metrics: [
      { label: 'Capacitive estimate', value: capacitiveRipple, unit: 'V' },
      { label: 'ESR estimate', value: esrRipple, unit: 'V' },
      { label: 'Dominant estimate', value: esrRipple > capacitiveRipple ? 'ESR' : 'Capacitance' },
      { label: 'Immediate charge deficit', value: loadStep / capacitance, unit: 'V/s', tone: loadStep > 0 ? 'warning' : 'normal' },
      { label: 'Averaged recovery trough', value: predictedTrough, unit: 'V' },
      { label: 'Recovery fn / damping', value: `${formatEngineering(recoveryFrequency, 'Hz')} / ${recoveryDamping.toFixed(2)}` },
      { label: 'Effective RK4 step', value: simulation.effectiveStep, unit: 's' },
    ],
    events: [{ x: stepTime, label: `+${formatEngineering(loadStep, 'A')} load`, kind: 'load' }],
    expectedPrediction: esrRipple > capacitiveRipple ? 'ESR' : 'capacitance',
    summary: `The primary switched trace separates capacitor-state motion from the algebraic ESR/optional ESL contributions. The second plot independently cross-checks how an explicitly reduced-order averaged voltage loop could recover from the same load step.`,
    discrepancyHint: 'The familiar Δi/(8fC) expression assumes a single triangular capacitor-current waveform; multiphase cancellation and the load event change that shape.',
    warnings: [
      ...simulation.warnings,
      ...(esl > 0 ? ['ESL is an output-only first-difference estimate; it does not feed back into the state equations or model an ESL resonance.'] : []),
      ...(loadStep > 0 ? ['The switched power-stage trace remains open loop. Control recovery is intentionally isolated in the supplemental averaged plot so the two abstraction levels are never combined into one waveform.'] : []),
    ],
    seed,
    supplementalPlots: [recoveryPlot],
  };
};

const conductionLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const modeCase = clamp(Math.round(value(parameters, 'modeCase', 1)), 0, 6);
  const modes = ['CCM', 'DCM', 'Boundary conduction', 'Reverse-current operation', 'Pulse skipping', 'Diode-emulation clamp', 'Numerical artifact'] as const;
  const diodeEmulation = value(parameters, 'diodeEmulation', 1) >= 0.5;
  const x = linspace(0, point.period * 5, 501);
  const raw = x.map((time, index) => {
    const base = point.phaseAverage + point.ripple * triangle(time / point.period) / 2;
    if (modeCase === 0) return Math.max(base + point.ripple, point.ripple * 0.1);
    if (modeCase === 1) return Math.max(0, base - point.phaseAverage * 1.2);
    if (modeCase === 2) return Math.max(0, point.ripple * (1 + triangle(time / point.period)) / 2);
    if (modeCase === 3) {
      const reverseCandidate = base - point.phaseAverage * 1.4;
      return diodeEmulation ? Math.max(reverseCandidate, 0) : reverseCandidate;
    }
    if (modeCase === 4) return Math.floor(time / point.period) % 3 === 0 ? Math.max(base, 0) : 0;
    if (modeCase === 5) return Math.max(base - point.phaseAverage, 0);
    return base + (index % 2 === 0 ? point.ripple * 0.25 : -point.ripple * 0.25);
  });
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [{ name: 'iL', unit: 'A', values: raw, color: '#ffc400', marker: 'circle' }],
    metrics: [
      { label: 'Minimum current', value: Math.min(...raw), unit: 'A' },
      { label: 'Zero intervals', value: raw.filter((sample) => sample === 0).length, unit: 'samples' },
      { label: 'Case seed', value: modeCase },
    ],
    events: modeCase === 6 ? [{ x: point.period * 2.5, label: 'alternating sample error', kind: 'artifact' }] : [],
    expectedPrediction: modeCase === 3 && diodeEmulation ? 'Diode-emulation clamp' : modes[modeCase] ?? 'Unknown',
    summary: `This deterministic case represents ${modeCase === 3 && diodeEmulation ? 'reverse-current demand clamped by diode emulation' : modes[modeCase] ?? 'an unknown mode'}.`,
    discrepancyHint: 'Look for finite zero-current intervals, negative current, missing pulse packets, and sample-to-sample behavior that is not synchronized with a physical state.',
    warnings: [
      ...(modeCase === 6 ? ['This trace intentionally contains a numerical artifact; convergence alone would not validate it.'] : []),
      ...(modeCase === 3 && diodeEmulation ? ['Diode emulation is enabled, so the would-be negative-current interval is clamped at zero rather than classified as reverse-current operation.'] : []),
    ],
    seed,
  };
};

const operatingPointLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const target = value(parameters, 'rippleTarget', 30) / 100;
  const currentLimit = value(parameters, 'currentLimit', 12);
  const capacitance = value(parameters, 'capacitance', 220) * 1e-6;
  const esr = value(parameters, 'esr', 5) * 1e-3;
  const rippleFraction = point.phaseAverage > 0 ? point.ripple / point.phaseAverage : Number.POSITIVE_INFINITY;
  const rippleScore = Math.max(0, 100 - Math.abs(rippleFraction - target) * 160);
  const currentMargin = currentLimit - point.peak;
  const limitScore = clamp((currentMargin / Math.max(currentLimit, 1e-9)) * 200, 0, 100);
  const summedRipple = idealInterleavedSumRipple(point.ripple, point.duty, point.phases);
  const rippleVoltage = summedRipple / (8 * effectiveRippleFrequency(point.fs, point.phases) * capacitance) + summedRipple * esr;
  const score = Math.round(rippleScore * 0.45 + limitScore * 0.45 + (rippleVoltage < point.vout * 0.01 ? 10 : 4));
  const x = linspace(0, 1, 101);
  return {
    x,
    xLabel: 'Normalized design dimension',
    xUnit: '',
    signals: [
      { name: 'Ripple margin', unit: '%', values: x.map((v) => rippleScore * v), color: '#36c7d8', marker: 'circle' },
      { name: 'Current-limit margin', unit: '%', values: x.map((v) => limitScore * v), color: '#ffc400', dash: [8, 5], marker: 'square' },
    ],
    metrics: [
      { label: 'Design score', value: score, unit: '/100', tone: score >= 75 ? 'good' : score >= 50 ? 'warning' : 'danger' },
      { label: 'Ripple / average', value: Number.isFinite(rippleFraction) ? rippleFraction * 100 : 'undefined at zero load', unit: Number.isFinite(rippleFraction) ? '%' : undefined },
      { label: 'Peak-current margin', value: currentMargin, unit: 'A', tone: currentMargin > 0 ? 'good' : 'danger' },
      { label: 'Output-ripple estimate', value: rippleVoltage, unit: 'V' },
    ],
    events: [],
    expectedPrediction: currentMargin > 0 && rippleFraction <= target * 1.2 ? 'yes' : 'no',
    summary: `The score preserves multiple valid designs: it reports ripple proximity, peak-current margin, and output-ripple consequences separately.`,
    discrepancyHint: 'A design can score well with more than one L/fs/N combination; transient slew, loss, size, and cost decide among physically valid candidates.',
    warnings: currentMargin <= 0 ? ['The selected per-phase peak exceeds the current limit.'] : [],
    seed,
  };
};

const bodeLab = (id: 'pole-zero' | 'crossover-tuning' | 'error-amplifier', parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  let plant: LoopModelConfig['plant'];
  let compensator: CompensatorConfig;
  let componentMetrics: LabMetric[] = [];
  let componentSummary = '';
  let modulatorGain = value(parameters, 'modGain', 1);
  let feedbackGain = value(parameters, 'feedback', 0.2);

  if (id === 'pole-zero') {
    plant = {
      vin: 12,
      inductance: value(parameters, 'inductance', 0.5) * 1e-6,
      capacitance: value(parameters, 'capacitance', 100) * 1e-6,
      loadResistance: value(parameters, 'resistance', 1),
      capacitorEsr: value(parameters, 'esr', 5) * 1e-3,
    };
    compensator = {
      type: 'II',
      gain: 2 * Math.PI * 10 * 10,
      zeroHz: value(parameters, 'compZero', 8) * 1e3,
      poleHz: value(parameters, 'compPole', 250) * 1e3,
    };
  } else {
    const resonance = value(parameters, 'plantPole', 22) * 1e3;
    const q = Math.max(value(parameters, 'plantQ', 1.2), 0.1);
    const capacitance = 100e-6;
    const inductance = 1 / ((2 * Math.PI * resonance) ** 2 * capacitance);
    // Keep the user-selected resonance and Q exact in the compensation labs.
    // ESR is explored independently in the pole/zero lab; including it here
    // would move both denominator frequency and damping away from the controls.
    plant = { vin: 12, inductance, capacitance, loadResistance: q * Math.sqrt(inductance / capacitance), capacitorEsr: 0 };
    modulatorGain = 1;
    feedbackGain = 0.2;
    if (id === 'error-amplifier') {
      const topology = Math.round(value(parameters, 'topology', 3));
      const r1 = value(parameters, 'r1', 20) * 1e3;
      const r2 = value(parameters, 'r2', 5) * 1e3;
      const r3 = value(parameters, 'r3', 5) * 1e3;
      const c1 = value(parameters, 'c1', 220) * 1e-12;
      const c2 = value(parameters, 'c2', 2.2) * 1e-9;
      const c3 = value(parameters, 'c3', 1) * 1e-9;
      const zero1 = 1 / (2 * Math.PI * r2 * c2);
      const pole1 = (c1 + c2) / (2 * Math.PI * r2 * c1 * c2);
      const zero2 = 1 / (2 * Math.PI * (r1 + r3) * c3);
      const pole2 = 1 / (2 * Math.PI * r3 * c3);
      const lowFrequencyCoefficient = 1 / (r1 * (c1 + c2));
      // Figure 12's passive network is already defined from VSENSE to
      // VCONTROL, so a separate feedback-divider gain would double count it.
      feedbackGain = 1;
      compensator = topology === 2
        ? { type: 'II', gain: lowFrequencyCoefficient, zeroHz: zero1, poleHz: pole1 }
        : {
            type: 'III',
            gain: lowFrequencyCoefficient,
            zeroHz: [zero1, zero2],
            poleHz: [pole1, pole2],
          };
      componentMetrics = [
        { label: 'Active network', value: topology === 2 ? 'Type II reduction' : 'TI Figure 12 Type III' },
        { label: 'fz1 · R2 C2', value: zero1, unit: 'Hz' },
        { label: 'fp1 · R2 C1 C2', value: pole1, unit: 'Hz', tone: pole1 > zero1 ? 'good' : 'danger' },
        ...(topology === 3 ? [
          { label: 'fz2 · (R1+R3) C3', value: zero2, unit: 'Hz' } as LabMetric,
          { label: 'fp2 · R3 C3', value: pole2, unit: 'Hz', tone: pole2 > zero2 ? 'good' : 'danger' } as LabMetric,
        ] : []),
        { label: 'Origin-pole coefficient K', value: lowFrequencyCoefficient, unit: 'rad/s' },
      ];
      componentSummary = topology === 2
        ? 'The Type II reduction removes the R3-C3 input-lead branch. R2-C2 creates the zero, while C1 closes the high-frequency feedback path and produces fp1 with R2 and C2.'
        : 'This is the TI SLVA301 Figure 12 passive-network result under the explicit high-op-amp-gain approximation. Both passive pairs add phase lead because each displayed pole lies above its associated zero for this component set.';
    } else {
      compensator = {
        type: 'III',
        gain: 2 * Math.PI * 10 * 10 ** (value(parameters, 'dcGain', 42) / 20),
        zeroHz: [value(parameters, 'zero1', 8) * 1e3, value(parameters, 'zero2', 18) * 1e3],
        poleHz: [value(parameters, 'pole1', 250) * 1e3, 2e6],
      };
    }
  }

  const loopConfig: LoopModelConfig = { plant, compensator, modulatorGain, feedbackGain };
  const plantSweep = bodeSweep((frequency) => buckControlToOutput(plant, frequency), 10, 10e6, 601);
  const compensatorSweep = bodeSweep((frequency) => evaluateCompensator(compensator, frequency), 10, 10e6, 601);
  const loopSweep = bodeSweep((frequency) => evaluateLoopGain(loopConfig, frequency), 10, 10e6, 601);
  const closedLoopSweep = bodeSweep((frequency) => closedLoopFromLoopGain(evaluateLoopGain(loopConfig, frequency)), 10, 10e6, 601);
  const outputImpedanceSweep = bodeSweep((frequency) => closedLoopOutputImpedance(loopConfig, frequency), 10, 10e6, 601);
  const frequency = loopSweep.map((point) => point.frequency);
  const margins = findLoopMargins(loopSweep);
  const crossover = margins.crossoverFrequency;
  const phaseMargin = margins.phaseMargin;
  const fs = value(parameters, 'fs', 500) * 1e3;
  const switchingSeparation = crossover === null ? null : fs / crossover;
  const warnings: string[] = id === 'crossover-tuning' && crossover !== null && crossover > fs / 5
    ? ['Crossover approaches the switching frequency. This averaged model omits sampling, delay, and switching sidebands; no universal fs ratio guarantees validity.']
    : [];
  const phaseMarginMapsToSecondOrder = phaseMargin !== null && phaseMargin > 0 && phaseMargin < 89.5;
  const reducedDamping = phaseMarginMapsToSecondOrder
    ? dampingFromPhaseMargin(phaseMargin)
    : phaseMargin !== null && phaseMargin >= 89.5 ? 1 : 0.15;
  const reducedNaturalFrequency = crossover === null
    ? buckResonantFrequency(plant)
    : naturalFrequencyFromCrossover(crossover, reducedDamping);
  const crossoverLoadStep = value(parameters, 'loadStep', 5);
  const crossoverRecoveryPlot = id === 'crossover-tuning'
    ? secondOrderRecoveryPlot({
        title: 'Margin-derived averaged load-step cross-check',
        disclosure: `This separate reduced-order cross-check uses the measured loop crossover ${phaseMarginMapsToSecondOrder ? 'and maps its phase margin' : 'but cannot map the selected phase margin outside the canonical 0–90° range; critical/low damping is used only as a visible placeholder'} in a canonical second-order model (fn=${formatEngineering(reducedNaturalFrequency, 'Hz')}, ζ=${reducedDamping.toFixed(3)}). It uses C=${formatEngineering(plant.capacitance, 'F')} and a ${formatEngineering(crossoverLoadStep, 'A')} load step. It is not an inverse transform of the full plotted Type III loop and excludes saturation, switching, sampling, and slew limits.`,
        naturalFrequency: reducedNaturalFrequency,
        damping: reducedDamping,
        capacitance: plant.capacitance,
        loadStep: crossoverLoadStep,
      })
    : null;
  if (margins.gainCrossovers.length > 1) warnings.push(`The loop has ${margins.gainCrossovers.length} unity-gain crossings. The reported phase margin is the lowest-margin downward crossing, not the first crossing encountered.`);
  if (id === 'error-amplifier') warnings.push('Component mapping uses the high-op-amp-gain Hcomp≈1/β approximation from TI SLVA301 Figure 12. Verify finite open-loop gain and GBW for a selected amplifier or controller.');
  if (id === 'crossover-tuning') warnings.push('The supplemental transient is a margin-derived canonical second-order cross-check, not the exact time-domain response of the full fifth-order loop. Use it to test damping intuition; use a full averaged or switched transient model for design validation.');
  if (id === 'crossover-tuning' && phaseMargin !== null && !phaseMarginMapsToSecondOrder) warnings.push(`The selected ${phaseMargin.toFixed(1)}° phase margin cannot be mapped to the canonical second-order 0–90° relationship. The supplemental plot therefore uses ${reducedDamping === 1 ? 'critical' : 'low'} damping as an explicitly disclosed placeholder rather than inventing a damping ratio.`);
  return {
    x: frequency,
    xLabel: 'Frequency',
    xUnit: 'Hz',
    signals: [
      { name: 'Plant magnitude', unit: 'dB', values: plantSweep.map((point) => point.magnitudeDb), color: '#36c7d8', marker: 'circle' },
      { name: 'Compensator magnitude', unit: 'dB', values: compensatorSweep.map((point) => point.magnitudeDb), color: '#ffc400', dash: [8, 5], marker: 'square' },
      { name: 'Loop magnitude', unit: 'dB', values: loopSweep.map((point) => point.magnitudeDb), color: '#f061c8', dash: [3, 4], marker: 'diamond' },
      { name: 'Loop phase', unit: 'deg', values: loopSweep.map((point) => point.phaseDegrees), color: '#5bd26a', dash: [10, 4, 2, 4], marker: 'circle' },
      { name: 'Complementary sensitivity |T/(1+T)|', unit: 'dB', values: closedLoopSweep.map((point) => point.magnitudeDb), color: '#9b8cff', dash: [7, 3], marker: 'square' },
      { name: 'Closed-loop output Z', unit: 'dBΩ', values: outputImpedanceSweep.map((point) => point.magnitudeDb), color: '#ff8a4c', dash: [2, 3], marker: 'diamond' },
    ],
    metrics: [
      ...componentMetrics,
      { label: 'LC resonance', value: buckResonantFrequency(plant), unit: 'Hz' },
      { label: 'ESR zero', value: capacitorEsrZero(plant) ?? 'none' , unit: capacitorEsrZero(plant) === null ? undefined : 'Hz' },
      { label: 'Crossover', value: crossover ?? 'No 0 dB crossing', unit: crossover === null ? undefined : 'Hz' },
      ...(id === 'crossover-tuning' ? [{
        label: 'Switching / crossover separation',
        value: switchingSeparation ?? 'undefined without crossover',
        unit: switchingSeparation === null ? undefined : '×',
        tone: switchingSeparation === null ? 'warning' as const : switchingSeparation >= 10 ? 'good' as const : switchingSeparation >= 5 ? 'warning' as const : 'danger' as const,
      }, {
        label: 'Reduced-order damping ζ',
        value: reducedDamping,
        tone: reducedDamping >= 0.5 ? 'good' as const : reducedDamping >= 0.3 ? 'warning' as const : 'danger' as const,
      }, {
        label: 'Reduced-order natural frequency',
        value: reducedNaturalFrequency,
        unit: 'Hz',
      }] : []),
      { label: 'Phase margin', value: phaseMargin ?? 'undefined', unit: phaseMargin === null ? undefined : 'deg', tone: phaseMargin === null ? 'warning' : phaseMargin >= 45 ? 'good' : phaseMargin >= 30 ? 'warning' : 'danger' },
      { label: 'Gain margin', value: margins.gainMarginDb ?? 'No −180° crossing', unit: margins.gainMarginDb === null ? undefined : 'dB' },
      { label: 'Unity-gain crossings', value: margins.gainCrossovers.length === 0 ? 'none' : margins.gainCrossovers.map((crossing) => `${formatEngineering(crossing.frequency, 'Hz')} ${crossing.direction}`).join(' · ') },
      { label: 'Feedback gain', value: feedbackGain, unit: 'V/V' },
      { label: 'Modulator gain', value: modulatorGain, unit: 'V/V' },
    ],
    events: margins.gainCrossovers.map((crossing) => ({ x: crossing.frequency, label: `${crossing.direction} 0 dB crossing · PM ${crossing.phaseMargin.toFixed(1)}°`, kind: 'crossing' as const })),
    expectedPrediction: id === 'pole-zero' ? buckResonantFrequency(plant) : id === 'crossover-tuning' ? (phaseMargin !== null && phaseMargin >= 45 ? 'yes' : 'no') : 'R2 and C2',
    predictionTolerance: id === 'pole-zero' ? buckResonantFrequency(plant) * 0.12 : undefined,
    summary: componentSummary || (crossover === null
      ? 'The total loop includes plant, compensator, modulator, and feedback gain, but it has no 0 dB crossing in the displayed range.'
      : `The total loop includes plant, compensator, modulator, and feedback gain. Estimated crossover is ${formatEngineering(crossover, 'Hz')} with ${phaseMargin?.toFixed(1) ?? 'undefined'}° phase margin.`),
    discrepancyHint: id === 'error-amplifier'
      ? 'The named poles and zeros belong to this exact voltage-op-amp topology. An OTA/gm error amplifier has a different component mapping, and finite op-amp gain can move the realized response.'
      : 'Crossover and closed-loop bandwidth are related through the full loop shape, not defined as identical. This averaged view cannot predict all sampled switching behavior.',
    warnings,
    seed,
    ...(crossoverRecoveryPlot ? { supplementalPlots: [crossoverRecoveryPlot] } : {}),
  };
};

const peakCurrentLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const senseGain = value(parameters, 'senseGain', 0.05);
  const artificialSlope = value(parameters, 'slopeComp', 20) * 1e3;
  const threshold = value(parameters, 'threshold', 0.35);
  const blanking = value(parameters, 'blanking', 80) * 1e-9;
  const delay = value(parameters, 'delay', 35) * 1e-9;
  const config = {
    vin: point.vin,
    vout: point.vout,
    inductance: point.inductance,
    switchingFrequency: point.fs,
    currentCommand: threshold,
    artificialRampSlope: artificialSlope,
    currentSenseGain: senseGain,
    leadingEdgeBlanking: blanking,
    propagationDelay: delay,
    minimumOnTime: 0,
    maximumOnTime: point.period * 0.95,
    currentLimit: value(parameters, 'currentLimit', 20) * senseGain,
    allowReverseCurrent: false,
  };
  const cycles = simulatePeakCurrentCycles(config, Math.max(point.valley, 0), 8);
  const stability = peakCurrentStability(config);
  const x = linspace(0, point.period * 8, 1601);
  const current = x.map((time) => {
    const cycleIndex = Math.min(Math.floor(time / point.period), cycles.length - 1);
    const cycle = cycles[cycleIndex];
    if (!cycle) return 0;
    const local = time - cycleIndex * point.period;
    if (local < cycle.onTime) return cycle.valleyCurrent + ((point.vin - point.vout) / point.inductance) * local;
    return Math.max(0, cycle.peakCurrent - (point.vout / point.inductance) * (local - cycle.onTime));
  });
  const compensation = x.map((time) => artificialSlope * (time % point.period));
  const sense = current.map((sample, index) => sample * senseGain + (compensation[index] ?? 0));
  const gate = x.map((time) => {
    const cycleIndex = Math.min(Math.floor(time / point.period), cycles.length - 1);
    return time - cycleIndex * point.period < (cycles[cycleIndex]?.onTime ?? 0) ? 1 : 0;
  });
  const unstable = !stability.stable;
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'iL', unit: 'A', values: current, color: '#ffc400', marker: 'circle' },
      { name: 'sense + ramp', unit: 'V', values: sense, color: '#36c7d8', dash: [8, 5], marker: 'square' },
      { name: 'gate', unit: 'logic', values: gate, color: '#5bd26a', dash: [3, 4], marker: 'diamond' },
    ],
    metrics: [
      { label: 'Duty estimate', value: point.duty * 100, unit: '%' },
      { label: 'Artificial ramp', value: artificialSlope, unit: 'V/s' },
      { label: 'Cycle alternation', value: unstable ? 'Visible in simplified map' : 'Damped', tone: unstable ? 'warning' : 'good' },
      { label: 'Cycle-map eigenvalue', value: stability.eigenvalue },
      { label: 'Minimum artificial slope', value: stability.minimumArtificialRampSlope, unit: 'V/s' },
      { label: 'Trip delay overshoot', value: ((point.vin - point.vout) / point.inductance) * delay, unit: 'A' },
    ],
    events: cycles.flatMap((cycle) => [
      { x: cycle.cycle * point.period, label: `clock set ${cycle.cycle + 1}`, kind: 'edge' as const },
      cycle.comparatorTripTime <= cycle.onTime + 1e-15
        ? { x: cycle.cycle * point.period + cycle.comparatorTripTime, label: `comparator trip ${cycle.cycle + 1}`, kind: 'crossing' as const }
        : { x: cycle.cycle * point.period + cycle.onTime, label: `maximum on-time stop ${cycle.cycle + 1}`, kind: 'edge' as const },
    ]),
    expectedPrediction: unstable ? 'yes' : 'no',
    summary: `This is a deliberately simplified sampled-data demonstration. It animates clock set, comparator reset, and cycle alternation; it is not a complete commercial current-mode model.`,
    discrepancyHint: 'The selected stability indicator is conditional on the simplified ramp map. Full converter dynamics, sampling, compensator, and protection logic can change the result.',
    warnings: unstable ? [`Alternating-cycle pole |λ|=${stability.magnitude.toFixed(3)} is unstable in the stated fixed-period, fixed-command CCM cycle map. Blanking, delay, saturation, DCM, and outer-loop motion are excluded from that eigenvalue.`] : [],
    seed,
  };
};

const cotPulseLab = (parameters: Readonly<Record<string, number>>, seed: number, injectionChallenge = false): LabResult => {
  // This lab is intentionally a single-phase controller/power-stage pair. A
  // separate scheduler lab owns multiphase pulse allocation.
  const point = buckPoint({ ...parameters, phases: 1 });
  const random = seededNoise(seed);
  const fixedTon = injectionChallenge ? point.duty / point.fs : value(parameters, 'ton', 800) * 1e-9;
  const minTon = injectionChallenge ? fixedTon * 0.2 : value(parameters, 'minTon', 100) * 1e-9;
  const maxTon = injectionChallenge ? fixedTon * 4 : value(parameters, 'maxTon', 2000) * 1e-9;
  const minOff = injectionChallenge ? clamp(fixedTon, minTon, maxTon) * 0.15 : value(parameters, 'minOff', 150) * 1e-9;
  const delay = injectionChallenge ? 20e-9 : value(parameters, 'delay', 30) * 1e-9;
  const capacitance = (injectionChallenge ? 100 : value(parameters, 'capacitance', 100)) * 1e-6;
  const capacitorEsr = (injectionChallenge ? 0 : value(parameters, 'esr', 5)) * 1e-3;
  const naturalRipple = injectionChallenge ? value(parameters, 'naturalRipple', 1) : 0;
  const injectedRipple = injectionChallenge ? value(parameters, 'injectedRipple', 12) : value(parameters, 'ripple', 15);
  const phaseDegrees = value(parameters, 'ripplePhase', 0);
  const hysteresis = value(parameters, 'hysteresis', 5);
  const noise = value(parameters, 'noise', 1);
  const useSyntheticRipple = injectionChallenge || value(parameters, 'rippleSource', 1) >= 0.5;
  const useAdaptiveOnTime = !injectionChallenge && value(parameters, 'onTimeLaw', 0) >= 0.5;
  const controllerConfig = {
    referenceVoltage: point.vout,
    onTimeLaw: useAdaptiveOnTime
      ? { kind: 'adaptive-vout-vin' as const, nominalFrequency: point.fs, outputVoltageTarget: point.vout }
      : { kind: 'fixed' as const, onTime: fixedTon },
    minimumOnTime: minTon,
    maximumOnTime: maxTon,
    minimumOffTime: minOff,
    comparatorDelay: delay,
    comparatorHysteresis: hysteresis * 1e-3,
    injectedRippleGain: 1,
    ...(!injectionChallenge ? { currentLimit: value(parameters, 'currentLimit', 20) } : {}),
  };
  const selectedOnTime = requestedCotOnTime(controllerConfig, point.vin);
  const appliedTon = selectedOnTime.applied;
  const nominalOff = Math.max(appliedTon * (1 - point.duty) / point.duty, minOff);
  const nominalPeriod = appliedTon + nominalOff + delay;
  const nominalFrequency = 1 / nominalPeriod;
  const injectedPhaseReferenceAt = (((-phaseDegrees / 360) % 1) + 1) % 1 * nominalPeriod;
  const requestedStep = injectionChallenge
    ? Math.max(Math.min(appliedTon, minOff, Math.max(delay, 1e-12)) / 20, 0.5e-9)
    : value(parameters, 'dt', 2) * 1e-9;
  let controllerState = createCotState(controllerConfig);
  const pulseStarts: number[] = [];
  const pulseEnds: Array<{ readonly time: number; readonly reason: 'one-shot' | 'current-limit' }> = [];
  const requests: number[] = [];
  const x: number[] = [];
  const gate: number[] = [];
  const rippleSignal: number[] = [];
  const naturalRippleTrace: number[] = [];
  const injectedRippleTrace: number[] = [];
  const threshold: number[] = [];
  const phaseCurrent: number[] = [];
  const outputVoltage: number[] = [];
  let current = point.load;
  let vCap = point.vout;
  let time = 0;
  const endTime = Math.max(nominalPeriod, point.period) * 24;
  // Keep the worker/UI payload bounded while retaining explicit controller
  // event stops. At the default operating point this still resolves each
  // on-time with hundreds of samples; coarser requests remain visible below.
  const integrationStep = Math.max(requestedStep, endTime / 12_000);
  while (time <= endTime + 1e-15 && x.length < 15_000) {
    const natural = rippleInjectionAt({
      source: 'synthetic', waveform: 'triangle', amplitudePeakToPeak: naturalRipple * 1e-3,
      frequency: nominalFrequency,
    }, time);
    const injected = rippleInjectionAt({
      source: 'synthetic', waveform: 'sawtooth', amplitudePeakToPeak: useSyntheticRipple ? injectedRipple * 1e-3 : 0,
      frequency: nominalFrequency, phaseDegrees,
    }, time);
    const capacitorCurrent = current - point.load;
    const vOut = vCap + capacitorEsr * capacitorCurrent;
    const step = stepCotController(controllerConfig, controllerState, {
      time,
      vin: point.vin,
      feedback: vOut,
      naturalRipple: natural,
      injectedRipple: injected,
      noise: noise * 1e-3 * random(),
      sensedCurrent: current,
    });
    controllerState = step.state;
    if (step.pulseRequested) requests.push(time);
    if (step.pulseStarted) pulseStarts.push(time);
    if (step.pulseEnded && step.endReason) pulseEnds.push({ time, reason: step.endReason });
    x.push(time);
    gate.push(step.switchHigh ? 1 : 0);
    rippleSignal.push(step.comparatorInput);
    naturalRippleTrace.push(natural * 1e3);
    injectedRippleTrace.push(injected * 1e3);
    threshold.push(step.lowerThreshold);
    phaseCurrent.push(current);
    outputVoltage.push(vOut);
    const nextGrid = time + integrationStep;
    const nextEvent = step.nextEventAt !== null && step.nextEventAt > time + 1e-15 ? step.nextEventAt : Infinity;
    const nextTime = Math.min(nextGrid, nextEvent, endTime);
    if (nextTime <= time + 1e-15) break;
    const interval = nextTime - time;
    const slope = step.switchHigh ? (point.vin - vOut) / point.inductance : -vOut / point.inductance;
    const nextCurrent = Math.max(0, current + slope * interval);
    vCap += (((current + nextCurrent) / 2) - point.load) / capacitance * interval;
    current = nextCurrent;
    time = nextTime;
  }
  const intervals = pulseStarts.slice(1).map((start, index) => start - (pulseStarts[index] ?? 0));
  const meanInterval = intervals.length > 0
    ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
    : Number.POSITIVE_INFINITY;
  const rmsJitter = Math.sqrt(intervals.reduce((sum, interval) => sum + (interval - meanInterval) ** 2, 0) / Math.max(intervals.length, 1));
  const meanFrequency = Number.isFinite(meanInterval) ? 1 / meanInterval : null;
  const jitterRatio = Number.isFinite(meanInterval) && meanInterval > 0 ? rmsJitter / meanInterval : Number.POSITIVE_INFINITY;
  const finalWindow = outputVoltage.slice(-Math.max(1, Math.floor(outputVoltage.length / 5)));
  const meanOutput = finalWindow.reduce((sum, sample) => sum + sample, 0) / Math.max(finalWindow.length, 1);
  const regulationError = Math.abs(meanOutput - point.vout);
  const frequencyError = meanFrequency === null ? Number.POSITIVE_INFINITY : Math.abs(meanFrequency - nominalFrequency) / nominalFrequency;
  const cleanTiming = pulseStarts.length >= 4 && jitterRatio < 0.12 && regulationError < Math.max(0.03, point.vout * 0.015) && frequencyError < 0.35;
  const observedQuality = cleanTiming
    ? 1 / Math.max(jitterRatio + regulationError / Math.max(point.vout, 1e-9) + frequencyError, 1e-6)
    : 0;
  const warnings: string[] = [];
  if (!cleanTiming) warnings.push('Observed threshold crossings do not meet this lab\'s disclosed clean-timing criteria (at least four pulses, <12% period jitter, <1.5%/30 mV regulation error, and <35% mean-frequency error).');
  warnings.push(...assessTimeStep({
    integrationStep,
    switchingFrequency: nominalFrequency,
    minimumOnTime: minTon,
    minimumOffTime: minOff,
    comparatorDelay: delay,
    rippleTimingInterval: nominalPeriod / 2,
  }).warnings.map((warning) => warning.message));
  if (integrationStep > requestedStep * (1 + 1e-12)) warnings.push(`Interactive COT run is capped near 12,000 integration intervals: effective grid step is ${formatEngineering(integrationStep, 's')} rather than the requested ${formatEngineering(requestedStep, 's')}; controller event boundaries remain explicit.`);
  if (time < endTime - 1e-15) warnings.push('The COT horizon ended at the defensive sample cap; displayed statistics cover only the simulated prefix.');
  if (injectionChallenge) warnings.push('The “emulated natural-ripple” control is an independent nominal-frequency triangle phase-locked to the test clock; it is not derived from capacitor ESR/current or actual pulse timing. The integrated output state is separate.');
  warnings.push('The power-stage estimate uses a unidirectional diode-emulation clamp at iL=0 during off-time. Forced-synchronous reverse current is excluded rather than removed by numerical damping.');
  if (pulseStarts.length < 2) warnings.push('Fewer than two pulses were granted; mean switching frequency and jitter are undefined for this comparator waveform.');
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'feedback + ripple', unit: 'V', values: rippleSignal, color: '#36c7d8', marker: 'circle' },
      ...(injectionChallenge ? [
        { name: 'emulated natural ripple', unit: 'mV', values: naturalRippleTrace, color: '#5bd26a', dash: [10, 4, 2, 4], marker: 'circle' as const },
        { name: 'injected ripple', unit: 'mV', values: injectedRippleTrace, color: '#9b8cff', dash: [2, 3], marker: 'diamond' as const },
      ] : []),
      { name: 'threshold', unit: 'V', values: threshold, color: '#f2f5f7', dash: [8, 5], marker: 'square' },
      { name: 'one-shot / gate', unit: 'logic', values: gate, color: '#ffc400', dash: [3, 4], marker: 'diamond' },
      { name: 'iL estimate', unit: 'A', values: phaseCurrent, color: '#f061c8', dash: [10, 4, 2, 4], marker: 'circle' },
      { name: 'vOUT', unit: 'V', values: outputVoltage, color: '#ff8a4c', dash: [2, 3], marker: 'square' },
    ],
    metrics: [
      { label: 'On-time', value: appliedTon, unit: 's' },
      { label: 'Mean switching frequency', value: meanFrequency ?? 'undefined', unit: meanFrequency === null ? undefined : 'Hz' },
      { label: 'RMS period jitter', value: rmsJitter, unit: 's', tone: cleanTiming ? 'good' : 'warning' },
      { label: 'Observed timing quality', value: observedQuality, unit: 'score', tone: cleanTiming ? 'good' : 'warning' },
      { label: 'Mean regulation error', value: regulationError, unit: 'V', tone: regulationError < Math.max(0.03, point.vout * 0.015) ? 'good' : 'warning' },
      { label: 'Minimum off-time', value: minOff, unit: 's' },
      { label: 'Effective integration grid', value: integrationStep, unit: 's' },
      { label: 'Current-limit terminations', value: controllerState.currentLimitStopCount },
      { label: 'On-time law', value: useAdaptiveOnTime ? 'Adaptive VOUT/(VIN·fNOM)' : 'Fixed one-shot' },
      { label: 'Light-load conduction policy', value: 'Unidirectional diode-emulation clamp at iL=0' },
      ...(injectionChallenge ? [
        { label: 'Emulated natural ripple', value: naturalRipple, unit: 'mV pp' },
        { label: 'Injected ripple', value: injectedRipple, unit: 'mV pp' },
        { label: 'Injected-ripple phase', value: phaseDegrees, unit: 'deg' },
        { label: 'First injected-ramp reset', value: injectedPhaseReferenceAt, unit: 's' },
      ] satisfies LabMetric[] : []),
    ],
    events: ([
      ...(injectionChallenge ? [
        { x: 0, label: 'emulated-ripple phase reference', kind: 'edge' as const },
        { x: injectedPhaseReferenceAt, label: `injected-ripple ${phaseDegrees.toFixed(0)}° reference`, kind: 'edge' as const },
      ] : []),
      ...requests.map((request, index) => ({ x: request, label: `request ${index + 1}`, kind: 'request' as const })),
      ...pulseStarts.map((start, index) => ({ x: start, label: `pulse ${index + 1}`, kind: 'grant' as const })),
      ...pulseEnds.map((end, index) => ({ x: end.time, label: `${end.reason} end ${index + 1}`, kind: 'edge' as const })),
    ] satisfies LabEvent[]).sort((a, b) => a.x - b.x || a.label.localeCompare(b.label)),
    expectedPrediction: injectionChallenge ? (cleanTiming ? 'yes' : 'no') : nominalFrequency / 1e3,
    predictionTolerance: injectionChallenge ? undefined : nominalFrequency / 1e3 * 0.15,
    summary: `The tested generic ${useAdaptiveOnTime ? 'adaptive' : 'fixed'} on-time controller drives an integrated single-phase L-C state. Comparator timing and minimum-off eligibility set the next pulse; mean frequency is ${meanFrequency === null ? 'undefined because fewer than two pulses fired' : formatEngineering(meanFrequency, 'Hz')}.`,
    discrepancyHint: 'The D/ton estimate omits comparator delay, minimum off-time, ripple/noise crossing displacement, pulse skipping, and the distinction between commanded and clamped on-time.',
    warnings,
    seed,
  };
};

const controlComparisonLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const loadStep = value(parameters, 'loadStep', 8);
  const scenario = clamp(Math.round(value(parameters, 'scenario', 2)), 0, 5);
  const currentLimit = value(parameters, 'currentLimit', 12);
  const bandwidth = value(parameters, 'loopBandwidth', 45) * 1e3;
  const delay = value(parameters, 'delay', 80) * 1e-9;
  const noise = value(parameters, 'noise', 2) * 1e-3;
  const random = seededNoise(seed);
  const observationTime = 300e-6;
  const requiredSampleRate = Math.max(20 * point.fs, 40 * bandwidth);
  const sampleCount = Math.max(1001, Math.ceil(observationTime * requiredSampleRate) + 1);
  const x = linspace(0, observationTime, sampleCount);
  const stepTime = 70e-6;
  const commonNoise = x.map(() => noise * random());
  const response = (mode: 'vm' | 'pcm' | 'cot'): number[] => {
    const speed = mode === 'cot' ? 1.35 : mode === 'pcm' ? 1.15 : 0.9;
    const damping = mode === 'vm' ? 0.72 : mode === 'pcm' ? 0.82 : 0.68;
    const omega = 2 * Math.PI * bandwidth * speed;
    return x.map((time, index) => {
      if (scenario === 0) return point.vout * (1 - Math.exp(-omega * Math.max(time - delay, 0))) + (commonNoise[index] ?? 0) * 0.1;
      if (scenario === 3) return point.vout + (commonNoise[index] ?? 0) * (mode === 'pcm' ? 1.3 : mode === 'cot' ? 1.1 : 0.7);
      if (scenario === 5) {
        const skipFactor = mode === 'cot' ? 3 : mode === 'pcm' ? 4 : 1;
        const rippleAmplitude = mode === 'cot' ? 0.012 : mode === 'pcm' ? 0.009 : 0.006;
        return point.vout + rippleAmplitude * Math.sin(2 * Math.PI * point.fs / skipFactor * time);
      }
      if (time < stepTime) return point.vout;
      const elapsed = time - stepTime;
      const envelope = Math.exp(-damping * omega * elapsed);
      const disturbance = scenario === 1 ? point.vout * 0.035 : loadStep * point.inductance / Math.max(point.phases, 1) * bandwidth * 0.05;
      const limited = scenario === 4 && point.peak + loadStep / point.phases > currentLimit;
      const droop = disturbance * (limited ? 2.2 : 1);
      const ringing = Math.cos(omega * Math.sqrt(Math.max(1 - damping ** 2, 0.01)) * Math.max(0, elapsed - delay));
      const modeNoise = mode === 'pcm' ? noise * 1.3 : mode === 'cot' ? noise * 1.1 : noise * 0.7;
      return point.vout - droop * envelope * ringing + modeNoise * (commonNoise[index] ?? 0) / Math.max(noise, 1e-12);
    });
  };
  const vm = response('vm');
  const pcm = response('pcm');
  const cot = response('cot');
  const vmDutyCommand = vm.map((sample) => clamp(point.duty + 0.55 * (point.vout - sample) / Math.max(point.vout, 1e-9), 0, 1));
  const pcmSenseRamp = x.map((time, index) => {
    const cyclePosition = (time % point.period) / point.period;
    const inductorComponent = point.phaseAverage + point.ripple * dutyTriangle(cyclePosition, point.duty);
    const outerCommandComponent = 0.35 * point.phaseAverage * (point.vout - (pcm[index] ?? point.vout)) / Math.max(point.vout, 1e-9);
    const artificialRampEquivalent = point.ripple * 0.12 * cyclePosition;
    return Math.max(0, inductorComponent + outerCommandComponent + artificialRampEquivalent);
  });
  let cotTimingPhase = 0;
  const cotPulseRequests = x.map((time, index) => {
    const previousTime = x[index - 1] ?? time;
    const previousCycle = Math.floor(cotTimingPhase);
    const outputError = (point.vout - (cot[index] ?? point.vout)) / Math.max(point.vout, 1e-9);
    const skipFactor = scenario === 5 ? 1 / 3 : 1;
    const delayAdjustedBaseFrequency = 1 / (point.period + delay);
    const variableFrequency = delayAdjustedBaseFrequency * skipFactor * clamp(1 + 0.8 * outputError, 0.55, 1.45);
    cotTimingPhase += variableFrequency * Math.max(time - previousTime, 0);
    return index === 0 || Math.floor(cotTimingPhase) > previousCycle ? 1 : 0;
  });
  const cotRequestTimes = cotPulseRequests.flatMap((request, index) => request > 0 ? [x[index] ?? 0] : []);
  const cotMeanRequestFrequency = cotRequestTimes.length > 1
    ? (cotRequestTimes.length - 1) / Math.max((cotRequestTimes.at(-1) ?? 0) - (cotRequestTimes[0] ?? 0), 1e-18)
    : null;
  const settling = (samples: readonly number[], eventTime: number) => {
    const tolerance = point.vout * 0.005;
    const displayStep = (x[1] ?? observationTime) - (x[0] ?? 0);
    const dwellSamples = Math.max(2, Math.ceil(5e-6 / Math.max(displayStep, 1e-18)));
    const index = samples.findIndex((_, i) => (x[i] ?? 0) >= eventTime && samples.slice(i, i + dwellSamples).length === dwellSamples && samples.slice(i, i + dwellSamples).every((sample) => Math.abs(sample - point.vout) < tolerance));
    return index >= 0 ? (x[index] ?? eventTime) - eventTime : (x[x.length - 1] ?? eventTime) - eventTime;
  };
  const samplesByMode = { 'Voltage mode': vm, 'Peak current mode': pcm, 'Constant on-time': cot } as const;
  const performance = Object.fromEntries(Object.entries(samplesByMode).map(([label, samples]) => {
    if (scenario === 3) {
      const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / samples.length);
      return [label, rms];
    }
    if (scenario === 5) return [label, Math.max(...samples) - Math.min(...samples)];
    return [label, settling(samples, scenario === 0 ? 0 : stepTime)];
  })) as Record<keyof typeof samplesByMode, number>;
  const rankedPerformance = Object.entries(performance).sort((a, b) => a[1] - b[1]);
  const bestValue = rankedPerformance[0]?.[1] ?? Number.NaN;
  const comparisonResolution = scenario === 3 || scenario === 5
    ? Math.max(1e-12, Math.abs(bestValue) * 1e-6)
    : ((x[1] ?? 0) - (x[0] ?? 0)) * 0.5;
  const tiedBest = rankedPerformance.filter(([, metric]) => Math.abs(metric - bestValue) <= comparisonResolution);
  const best = tiedBest.length === 1 ? (tiedBest[0]?.[0] ?? 'None') : 'No unique winner';
  const performanceLabel = scenario === 3 ? 'output noise RMS' : scenario === 5 ? 'light-load ripple pp' : 'settling';
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'Voltage mode', unit: 'V', values: vm, color: '#36c7d8', marker: 'circle' },
      { name: 'Peak current mode', unit: 'V', values: pcm, color: '#ffc400', dash: [8, 5], marker: 'square' },
      { name: 'Constant on-time', unit: 'V', values: cot, color: '#f061c8', dash: [3, 4], marker: 'diamond' },
      { name: 'VM duty command', unit: 'normalized', values: vmDutyCommand, color: '#62a0ff', dash: [10, 4, 2, 4], marker: 'circle' },
      { name: 'PCM sensed current + ramp', unit: 'A', values: pcmSenseRamp, color: '#ff8a4c', dash: [2, 3], marker: 'square' },
      { name: 'COT pulse request', unit: 'logic', values: cotPulseRequests, color: '#5bd26a', dash: [6, 3], marker: 'diamond' },
    ],
    metrics: [
      ...Object.entries(performance).map(([label, metric]) => ({ label: `${label} ${performanceLabel}`, value: metric, unit: scenario === 3 || scenario === 5 ? 'V' : 's' })),
      { label: 'Scenario', value: ['Startup', 'Line step', 'Load step', 'Noise injection', 'Current limit', 'Light-load skipping'][scenario] ?? 'Unknown' },
      { label: 'VM / PCM nominal frequency', value: point.fs, unit: 'Hz' },
      { label: 'COT measured request frequency', value: cotMeanRequestFrequency ?? 'undefined', unit: cotMeanRequestFrequency === null ? undefined : 'Hz' },
      { label: 'Displayed samples / nominal cycle', value: 1 / (point.fs * Math.max((x[1] ?? 0) - (x[0] ?? 0), 1e-18)), unit: 'samples' },
      { label: 'Observation window', value: observationTime, unit: 's' },
      { label: 'Ideal duty baseline', value: point.duty * 100, unit: '%' },
      { label: 'Voltage-mode timing', value: 'fixed clock starts; duty/ramp crossing ends' },
      { label: 'Voltage-mode sensing / compensation', value: 'VOUT divider; outer voltage compensator; no modeled current inner loop' },
      { label: 'Peak-current timing', value: 'fixed clock starts; sensed-current + slope-ramp crossing ends' },
      { label: 'Peak-current sensing / compensation', value: 'phase current + artificial ramp; simplified inner current loop and outer voltage compensator' },
      { label: 'COT timing', value: 'feedback/ripple comparator starts; one-shot expires to end' },
      { label: 'COT sensing / compensation', value: 'VOUT/ripple timing signal; direct comparator model here, while servo/error-amplifier variants remain possible' },
    ],
    events: scenario === 0 || scenario === 3 || scenario === 5 ? [] : [{ x: stepTime, label: scenario === 1 ? 'input line step' : scenario === 4 ? 'current-limit demand' : `+${formatEngineering(loadStep, 'A')} load`, kind: 'load' }],
    expectedPrediction: best,
    summary: tiedBest.length === 1
      ? `${best} has the lowest ${performanceLabel} under this explicitly simplified controller set. That result is conditional, scenario-specific, and not a universal ranking.`
      : `${tiedBest.map(([label]) => label).join(', ')} are tied within the displayed model/sample resolution for ${performanceLabel}; there is no unique winner. The result is conditional, scenario-specific, and not a universal ranking.`,
    discrepancyHint: 'Identical power stages do not imply identical sensing, compensation, delay, light-load logic, or limiting. Change assumptions before drawing a mode-level conclusion.',
    warnings: [
      'Response curves use visible normalized behavioral factors (speed VM/PCM/COT = 0.90/1.15/1.35; damping = 0.72/0.82/0.68). They are not commercial-controller implementations or a universal ranking.',
      'The displayed VM duty command, PCM A-equivalent sensed ramp, and COT request impulses are representative educational timing signals generated from the same scenario. They do not form a transistor-level or vendor-specific controller simulation.',
      ...(bandwidth * observationTime < 1 ? ['The fixed 300 µs observation window is shorter than one nominal loop-bandwidth cycle; settling metrics are window-limited at this operating point.'] : []),
    ],
    seed,
  };
};

const interleavingLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const phaseError = value(parameters, 'phaseError', 0);
  const lMismatch = value(parameters, 'lMismatch', 0);
  const dcrMismatch = value(parameters, 'dcrMismatch', 0);
  const senseMismatch = value(parameters, 'senseMismatch', 0);
  const simulation = simulatePwmBuck(point, {
    capacitance: 100e-6,
    capacitorEsr: 5e-3,
    dcr: 3e-3,
    requestedStep: value(parameters, 'dt', 2) * 1e-9,
    cycles: 4,
    inductanceMismatchPercent: lMismatch,
    dcrMismatchPercent: dcrMismatch,
    senseMismatchPercent: senseMismatch,
    phaseErrorDegrees: phaseError,
  });
  const x = simulation.samples.map((sample) => sample.time);
  const currents: SignalSeries[] = Array.from({ length: point.phases }, (_, phase) => ({
    name: `iL${phase + 1}`, unit: 'A', values: simulation.samples.map((sample) => sample.phaseCurrents[phase] ?? 0),
    color: COLORS[phase % COLORS.length] as string,
    dash: phase % 2 === 0 ? undefined : [8, 5], marker: phase % 2 === 0 ? 'circle' : 'square',
  }));
  const switchNodes: SignalSeries[] = Array.from({ length: point.phases }, (_, phase) => ({
    name: `vSW${phase + 1}`, unit: 'V', values: simulation.samples.map((sample) => sample.switchNodeVoltages[phase] ?? 0),
    color: COLORS[(phase + 3) % COLORS.length] as string,
    dash: phase % 2 === 0 ? [2, 3] : [10, 4, 2, 4], marker: phase % 2 === 0 ? 'diamond' : 'square',
  }));
  const sum: SignalSeries = { name: 'Σ iL', unit: 'A', values: simulation.samples.map((sample) => sample.sumInductorCurrent), color: '#f061c8', dash: [3, 4], marker: 'diamond' };
  const capCurrent: SignalSeries = { name: 'iC', unit: 'A', values: simulation.samples.map((sample) => sample.capacitorCurrent), color: '#f2f5f7', dash: [10, 4, 2, 4], marker: 'circle' };
  const inputCurrent: SignalSeries = {
    name: 'iIN', unit: 'A', color: '#9b8cff', dash: [6, 3], marker: 'square',
    values: simulation.samples.map((sample) => sample.phaseCurrents.reduce((total, current, phase) => total + (sample.conductionModes[phase] === 'high-side' ? current : 0), 0)),
  };
  const outputVoltage: SignalSeries = { name: 'vOUT', unit: 'V', values: simulation.samples.map((sample) => sample.vOut), color: '#ff8a4c', dash: [2, 3], marker: 'diamond' };
  const idealSpacing = 360 / point.phases;
  const capRms = timeWeightedRms(x, capCurrent.values);
  const sumPp = Math.max(...sum.values) - Math.min(...sum.values);
  const inputPp = Math.max(...inputCurrent.values) - Math.min(...inputCurrent.values);
  const outputPp = Math.max(...outputVoltage.values) - Math.min(...outputVoltage.values);
  const idealSumRipple = idealInterleavedSumRipple(point.ripple, point.duty, point.phases);
  const phaseRms = currents.map((series) => timeWeightedRms(x, series.values));
  const sensedAverages = Array.from({ length: point.phases }, (_, phase) => timeWeightedMean(x, simulation.samples.map((sample) => sample.sensedCurrents[phase] ?? 0)));
  const sensedSpread = Math.max(...sensedAverages) - Math.min(...sensedAverages);
  const normalizedOffsets = Array.from({ length: point.phases }, (_, phase) => {
    const signed = phase % 2 === 0 ? phaseError / 360 : -phaseError / 360;
    return ((phase / point.phases + signed) % 1 + 1) % 1;
  }).sort((a, b) => a - b);
  const spacings = normalizedOffsets.map((offset, index) => (((normalizedOffsets[(index + 1) % point.phases] ?? offset) - offset + 1) % 1) * 360);
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [...currents, ...switchNodes, sum, capCurrent, inputCurrent, outputVoltage],
    metrics: [
      { label: 'Ideal spacing', value: idealSpacing, unit: 'deg' },
      { label: 'Applied timing error', value: phaseError, unit: 'deg', tone: phaseError === 0 ? 'good' : 'warning' },
      { label: 'Actual spacing range', value: `${Math.min(...spacings).toFixed(1)}°…${Math.max(...spacings).toFixed(1)}°` },
      { label: 'Summed ripple', value: sumPp, unit: 'A' },
      { label: 'Ideal analytical summed ripple', value: idealSumRipple, unit: 'A' },
      { label: 'Capacitor RMS current', value: capRms, unit: 'A' },
      { label: 'Per-phase RMS', value: phaseRms.map((rms, phase) => `P${phase + 1} ${rms.toFixed(3)} A`).join(' · ') },
      { label: 'Sensed average / phase', value: sensedAverages.map((average, phase) => `P${phase + 1} ${average.toFixed(3)} A`).join(' · ') },
      { label: 'Sense-indicated spread', value: sensedSpread, unit: 'A', tone: Math.abs(senseMismatch) < 1e-12 ? 'good' : 'warning' },
      { label: 'Input-current ripple', value: inputPp, unit: 'A' },
      { label: 'Output-voltage ripple', value: outputPp, unit: 'V' },
      { label: 'Nominal interleaved event rate', value: effectiveRippleFrequency(point.fs, point.phases), unit: 'Hz' },
    ],
    events: currents.flatMap((_, phase) => {
      const raw = (phase / point.phases + phaseError / 360 * (phase % 2 === 0 ? 1 : -1)) * point.period;
      const wrapped = ((raw % point.period) + point.period) % point.period;
      return [{ x: wrapped, label: `phase ${phase + 1}`, phase, kind: 'edge' as const }];
    }).sort((a, b) => a.x - b.x || (a.phase ?? 0) - (b.phase ?? 0)),
    expectedPrediction: idealSpacing,
    predictionTolerance: 1,
    summary: `With uniform ${idealSpacing.toFixed(1)}° spacing, switching edges repeat at the nominal ${formatEngineering(point.fs * point.phases, 'Hz')} interleaved event rate; the dominant residual-ripple harmonic still depends on duty, alignment, and matching.`,
    discrepancyHint: 'Interleaving rearranges ripple timing; it does not force equal DC current. Mismatch and nonideal phase offsets leave residual ripple.',
    warnings: [
      ...simulation.warnings,
      ...(Math.abs(phaseError) > idealSpacing * 0.25 ? ['Large timing error deliberately degrades cancellation and may bunch edges.'] : []),
    ],
    seed,
  };
};

const schedulerLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const strategy = clamp(Math.round(value(parameters, 'strategy', 2)), 0, 5);
  const minSeparation = value(parameters, 'minSeparation', 180) * 1e-9;
  const dropDeadline = value(parameters, 'dropDeadline', 400) * 1e-9;
  const jitter = value(parameters, 'requestJitter', 30) * 1e-9;
  const imbalance = value(parameters, 'imbalance', 15) / 100;
  const phaseShedding = value(parameters, 'phaseShedding', 1) >= 0.5 && point.phases > 1;
  const phaseReentryAt = value(parameters, 'phaseReentryAfter', 6) * point.period;
  const activeBeforeReentry = phaseShedding ? point.phases - 1 : point.phases;
  const activePhaseCountAt = (time: number): number => phaseShedding && time < phaseReentryAt ? activeBeforeReentry : point.phases;
  const random = seededNoise(seed);
  const methods = ['ideal-fixed-spacing', 'first-eligible', 'round-robin', 'minimum-separation', 'current-priority', 'free-running'] as const;
  const method = methods[strategy] ?? 'round-robin';
  const config = {
    method,
    phaseCount: point.phases,
    minimumSeparation: minSeparation,
    basePeriod: point.period,
    currentPriority: 'lowest-current' as const,
    maximumRequestAge: dropDeadline,
  };
  let state = createSchedulerState(config);
  const nominalRequestCount = point.phases * 16;
  const allRequestEvents = Array.from({ length: nominalRequestCount }, (_, index) => {
    const base = index * point.period / point.phases;
    const primary = { id: `r${index}-a`, desired: Math.max(0, base + random() * jitter), source: index % point.phases };
    const collision = index % 5 === 0
      ? [{ id: `r${index}-b`, desired: primary.desired, source: (primary.source + 1) % point.phases }]
      : [];
    return [primary, ...collision];
  }).flat().sort((a, b) => a.desired - b.desired || a.source - b.source);
  const requestEvents = allRequestEvents.filter((request) => request.source < activePhaseCountAt(request.desired));
  const inhibitedRequests = allRequestEvents.filter((request) => request.source >= activePhaseCountAt(request.desired));
  type Request = (typeof allRequestEvents)[number];
  const grants: Array<{ time: number; phase: number; delayed: boolean; requestId: string }> = [];
  const decisions: LabEvent[] = inhibitedRequests.map((request) => ({
    x: request.desired,
    label: `P${request.source + 1} denied: phase shed`,
    phase: request.source,
    kind: 'denied',
  }));
  const queues: Request[][] = Array.from({ length: point.phases }, () => []);
  const lastStatus = new Map<string, 'waiting' | 'delayed'>();
  const lastRequestTime = allRequestEvents[allRequestEvents.length - 1]?.desired ?? point.period;
  const flushEnd = lastRequestTime + point.period * 4;
  const fixedSlotTimes = method === 'ideal-fixed-spacing'
    ? Array.from({ length: Math.floor(flushEnd / (point.period / point.phases)) + 1 }, (_, index) => index * point.period / point.phases)
    : [];
  const decisionTimes = [
    ...requestEvents.map((request) => request.desired),
    ...fixedSlotTimes,
  ].sort((a, b) => a - b);
  const addDecisionTime = (time: number, after: number): void => {
    if (time <= after + 1e-15 || time > flushEnd + 1e-15) return;
    if (!decisionTimes.some((candidate) => Math.abs(candidate - time) <= 1e-15)) {
      decisionTimes.push(time);
      decisionTimes.sort((a, b) => a - b);
    }
  };
  let requestCursor = 0;
  let lastDecisionTime = -Infinity;
  while (decisionTimes.length > 0) {
    const decisionTime = decisionTimes.shift();
    if (decisionTime === undefined || decisionTime < lastDecisionTime + 1e-15) continue;
    lastDecisionTime = decisionTime;
    while ((requestEvents[requestCursor]?.desired ?? Infinity) <= decisionTime + 1e-15) {
      const request = requestEvents[requestCursor];
      if (request) queues[request.source]?.push(request);
      requestCursor += 1;
    }
    const heads = queues.flatMap((queue) => queue[0] ? [queue[0]] : []);
    if (heads.length === 0) continue;
    const requests = heads.map((request) => ({
      phase: request.source,
      requestedAt: request.desired,
      eligibleAt: Math.max(request.desired, (state.lastGrantAt[request.source] ?? -Infinity) + point.period * 0.8),
      measuredCurrent: point.phaseAverage * (1 + ((request.source / Math.max(point.phases - 1, 1)) - 0.5) * imbalance),
    }));
    const step = schedulePulseRequests(config, state, decisionTime, requests, point.period * 4);
    state = step.state;
    step.grants.forEach((grant) => {
      const request = queues[grant.phase]?.shift();
      if (!request) return;
      grants.push({ time: grant.grantedAt, phase: grant.phase, delayed: grant.waitTime > 1e-15, requestId: request.id });
      lastStatus.delete(request.id);
    });
    for (const decision of step.decisions) {
      const request = heads.find((candidate) => candidate.source === decision.phase);
      if (!request) continue;
      if (decision.status === 'denied') {
        queues[decision.phase]?.shift();
        lastStatus.delete(request.id);
        decisions.push({
          x: decisionTime,
          label: `P${decision.phase + 1} denied: ${decision.reason}`,
          phase: decision.phase,
          kind: 'denied',
        });
        if ((queues[decision.phase]?.length ?? 0) > 0) {
          addDecisionTime(decisionTime + Math.max(2e-15, point.period * 1e-9), decisionTime);
        }
        continue;
      }
      if (decision.status !== 'waiting' && decision.status !== 'delayed') continue;
      if (lastStatus.get(request.id) === decision.status) continue;
      lastStatus.set(request.id, decision.status);
      decisions.push({
        x: decisionTime,
        label: `P${decision.phase + 1} ${decision.status}: ${decision.reason}`,
        phase: decision.phase,
        kind: decision.status,
      });
    }
    const nextHeads = queues.flatMap((queue) => queue[0] ? [queue[0]] : []);
    for (const request of nextHeads) {
      const eligibleAt = Math.max(request.desired, (state.lastGrantAt[request.source] ?? -Infinity) + point.period * 0.8);
      addDecisionTime(eligibleAt, decisionTime);
      addDecisionTime(request.desired + dropDeadline, decisionTime);
    }
    if (method === 'minimum-separation' && state.lastGlobalGrantAt !== null && nextHeads.length > 0) {
      addDecisionTime(state.lastGlobalGrantAt + minSeparation, decisionTime);
    }
  }
  grants.sort((a, b) => a.time - b.time || a.phase - b.phase);
  const pendingCount = queues.reduce((sum, queue) => sum + queue.length, 0);
  const endTime = Math.max(grants[grants.length - 1]?.time ?? point.period, lastRequestTime, phaseReentryAt, point.period) + point.period;
  const x = linspace(0, endTime, 1601);
  const grantSignals: SignalSeries[] = Array.from({ length: point.phases }, (_, phase) => ({
    name: `grant P${phase + 1}`,
    unit: 'logic',
    values: x.map((time) => grants.some((grant) => grant.phase === phase && time >= grant.time && time < grant.time + point.period * point.duty * 0.35) ? 1 + phase * 1.2 : phase * 1.2),
    color: COLORS[phase % COLORS.length] as string,
    dash: phase % 2 === 0 ? undefined : [8, 5],
    marker: phase % 2 === 0 ? 'circle' : 'square',
  }));
  const priorityCurrents = Array.from({ length: point.phases }, (_, phase) =>
    point.phaseAverage * (1 + ((phase / Math.max(point.phases - 1, 1)) - 0.5) * imbalance));
  const prioritySignals: SignalSeries[] = priorityCurrents.map((current, phase) => ({
    name: `priority sensed I P${phase + 1}`,
    unit: 'A',
    values: x.map(() => current),
    color: COLORS[(phase + 4) % COLORS.length] as string,
    dash: [2 + phase, 5],
    marker: 'diamond',
  }));
  const phaseActivitySignals: SignalSeries[] = [
    {
      name: 'active phase count',
      unit: 'phases',
      values: x.map((time) => activePhaseCountAt(time)),
      color: '#f2f5f7',
      dash: [10, 4, 2, 4],
      marker: 'square',
    },
    {
      name: `enable P${point.phases}`,
      unit: 'logic',
      values: x.map((time) => point.phases <= activePhaseCountAt(time) ? 1 : 0),
      color: '#ff8a4c',
      dash: [3, 4],
      marker: 'diamond',
    },
  ];
  const counts = Array.from({ length: point.phases }, (_, phase) => grants.filter((grant) => grant.phase === phase).length);
  const requestCounts = Array.from({ length: point.phases }, (_, phase) => allRequestEvents.filter((request) => request.source === phase).length);
  const minActual = grants.length > 1
    ? grants.slice(1).reduce((minimum, grant, index) => Math.min(minimum, grant.time - (grants[index]?.time ?? 0)), Infinity)
    : null;
  const fairness = state.grantCount.reduce((sum, count) => sum + count, 0) === 0
    ? 1
    : (state.grantCount.reduce((sum, count) => sum + count, 0) ** 2) /
      (point.phases * state.grantCount.reduce((sum, count) => sum + count ** 2, 0));
  const serviceRatios = requestCounts.flatMap((requestCount, phase) => requestCount > 0 ? [(counts[phase] ?? 0) / requestCount] : []);
  const serviceRatioSum = serviceRatios.reduce((sum, ratio) => sum + ratio, 0);
  const serviceRatioSquares = serviceRatios.reduce((sum, ratio) => sum + ratio ** 2, 0);
  const serviceFairness = serviceRatioSquares === 0 ? 1 : serviceRatioSum ** 2 / (serviceRatios.length * serviceRatioSquares);
  const delayedGrants = grants.filter((grant) => grant.delayed).length;
  const waitingTransitions = decisions.filter((decision) => decision.kind === 'waiting').length;
  const delayedTransitions = decisions.filter((decision) => decision.kind === 'delayed').length;
  const deniedPulses = state.deniedCount.reduce((sum, count) => sum + count, 0) + inhibitedRequests.length;
  const strategies = ['Ideal fixed spacing', 'First eligible', 'Round robin', 'Minimum separation', 'Current priority', 'Simplified free running'] as const;
  const elapsed = Math.max(endTime, 1e-12);
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [...grantSignals, ...prioritySignals, ...phaseActivitySignals],
    metrics: [
      { label: 'Strategy', value: strategies[strategy] ?? 'Unknown' },
      { label: 'Pulse requests', value: allRequestEvents.length },
      { label: 'Granted pulses', value: grants.length },
      { label: 'Denied pulses', value: deniedPulses, tone: deniedPulses > 0 ? 'danger' : 'good' },
      { label: 'Delayed grants', value: delayedGrants, tone: delayedGrants > 0 ? 'warning' : 'good' },
      { label: 'Still pending', value: pendingCount, tone: pendingCount > 0 ? 'danger' : 'good' },
      { label: 'Status transitions', value: `${waitingTransitions} waiting · ${delayedTransitions} delayed · ${deniedPulses} denied` },
      { label: 'Minimum actual separation', value: minActual ?? 'undefined', unit: minActual === null ? undefined : 's' },
      { label: 'Grant-allocation Jain index', value: fairness, tone: fairness > 0.9 ? 'good' : 'warning' },
      { label: 'Service-ratio Jain index', value: serviceFairness, tone: serviceFairness > 0.9 ? 'good' : 'warning' },
      { label: 'Per-phase frequency', value: counts.map((count, phase) => `P${phase + 1} ${(count / elapsed / 1e3).toFixed(1)} kHz`).join(' · ') },
      { label: 'Priority current snapshot', value: priorityCurrents.map((current, phase) => `P${phase + 1} ${current.toFixed(3)} A`).join(' · ') },
      { label: 'Observation window', value: endTime, unit: 's' },
      { label: 'Flush allowance', value: flushEnd - lastRequestTime, unit: 's' },
      { label: 'Per-phase re-eligibility', value: 0.8 * point.period, unit: 's' },
      { label: 'Displayed grant width', value: 0.35 * point.duty * point.period, unit: 's' },
      { label: 'Offered requests / phase', value: requestCounts.map((count, phase) => `P${phase + 1} ${count}`).join(' · ') },
      { label: 'Request generator', value: `${nominalRequestCount} nominal events (${16} per phase); coincident request every fifth event` },
      { label: 'Phase-shedding state', value: phaseShedding ? `P${point.phases} shed, then re-enabled` : 'All phases enabled' },
      { label: 'Phase re-entry', value: phaseShedding ? phaseReentryAt : 'disabled', unit: phaseShedding ? 's' : undefined },
      { label: 'Requests inhibited while shed', value: inhibitedRequests.length, tone: inhibitedRequests.length > 0 ? 'warning' : 'normal' },
      { label: 'Core collision count', value: state.collisionCount, tone: state.collisionCount === 0 ? 'good' : 'warning' },
    ],
    events: ([
      ...allRequestEvents.map((request) => ({ x: request.desired, label: `P${request.source + 1} request`, phase: request.source, kind: 'request' as const })),
      ...grants.map((grant) => ({ x: grant.time, label: `P${grant.phase + 1} ${grant.delayed ? 'delayed grant' : 'grant'}`, phase: grant.phase, kind: 'grant' as const })),
      ...decisions,
      ...(phaseShedding ? [
        { x: 0, label: `phase shed: ${activeBeforeReentry} of ${point.phases} active`, phase: point.phases - 1, kind: 'edge' as const },
        { x: phaseReentryAt, label: `P${point.phases} phase re-entry`, phase: point.phases - 1, kind: 'edge' as const },
      ] : []),
    ] satisfies LabEvent[]).sort((a, b) => a.x - b.x || a.label.localeCompare(b.label)),
    expectedPrediction: strategy === 2 ? `phase ${state.nextRoundRobinPhase + 1}` : 'depends on visible eligibility and priority',
    summary: `${strategies[strategy] ?? 'The scheduler'} grants ${grants.length}, explicitly denies ${deniedPulses} request(s) through deadline or phase-enable logic, and leaves ${pendingCount} pending from ${allRequestEvents.length} requests. Grant-allocation Jain index is ${fairness.toFixed(3)} and served/request Jain index is ${serviceFairness.toFixed(3)}. These are educational arbitration rules, not a universal commercial scheduler.`,
    discrepancyHint: 'The round-robin answer is the stored pointer assuming that phase is eligible; otherwise arbitration advances to the next eligible phase. Allocation equality and equal service ratios are different fairness questions.',
    warnings: [
      `The educational workload uses ${nominalRequestCount} nominal request events (16 per phase), injects a coincident request every fifth event, enforces per-phase re-eligibility at 0.8·T, and flushes for four additional periods. The displayed grant width is 0.35·D·T and does not alter arbitration.`,
      ...(phaseShedding ? [`P${point.phases} requests are explicitly inhibited until the ${formatEngineering(phaseReentryAt, 's')} timed re-entry event. This simple enable gate does not implement a load-threshold hysteresis loop, soft current handoff, or a commercial phase manager.`] : []),
      ...(counts.some((count) => count === 0) ? ['At least one phase is starved in the displayed window.'] : []),
      ...(pendingCount > 0 ? [`${pendingCount} unique request(s) remain queued after the four-period flush window; they were not silently overwritten or counted as denied.`] : []),
    ],
    seed,
  };
};

const currentSharingLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const point = buckPoint(parameters);
  const lMismatch = value(parameters, 'lMismatch', 10) / 100;
  const dcrMismatch = value(parameters, 'dcrMismatch', 8) / 100;
  const senseMismatch = value(parameters, 'senseGainMismatch', 3) / 100;
  const offset = value(parameters, 'senseOffset', 30) * 1e-3;
  const timing = value(parameters, 'timingMismatch', 40) * 1e-9;
  const resistanceVariation = value(parameters, 'resistanceVariation', 3) / 100;
  const thermalVariation = value(parameters, 'thermalVariation', 5) / 100;
  const gain = value(parameters, 'balanceGain', 4);
  const shareBandwidth = value(parameters, 'shareBandwidth', 5) * 1e3;
  const voltageBandwidth = value(parameters, 'voltageBandwidth', 50) * 1e3;
  const interactionRatio = shareBandwidth / Math.max(voltageBandwidth, 1);
  const fastestBandwidth = Math.max(shareBandwidth, voltageBandwidth);
  const slowestBandwidth = Math.min(shareBandwidth, voltageBandwidth);
  const observationTime = 10 / (2 * Math.PI * slowestBandwidth);
  const fastWindow = Math.min(observationTime, 10 / (2 * Math.PI * fastestBandwidth));
  const fastGrid = linspace(0, fastWindow, 801);
  const bandwidthRatio = fastestBandwidth / slowestBandwidth;
  const slowGrid = bandwidthRatio > 1 + 1e-12
    ? Array.from({ length: 1200 }, (_, index) => fastWindow * (observationTime / fastWindow) ** ((index + 1) / 1200))
    : [];
  // The early uniform region resolves the faster loop; the logarithmic tail
  // covers ten time constants of the slower loop without millions of points.
  const x = [...fastGrid, ...slowGrid];
  const physicalBias = Array.from({ length: point.phases }, (_, phase) => {
    const normalized = (phase - (point.phases - 1) / 2) / Math.max(point.phases - 1, 1);
    const dcResistanceBias = -point.phaseAverage * normalized * (dcrMismatch + resistanceVariation + thermalVariation);
    const architectureSpecificTimingBias = normalized * timing * point.vout / point.inductance;
    return dcResistanceBias + architectureSpecificTimingBias;
  });
  const controllerConfig = {
    proportionalGain: gain,
    integralGain: 2 * Math.PI * shareBandwidth * gain,
    maxTrim: Math.max(point.phaseAverage, 0.1),
    sharingLoopBandwidth: shareBandwidth,
    voltageLoopBandwidth: voltageBandwidth,
  };
  let balanceState = createCurrentBalanceState(point.phases);
  let actualCurrents = physicalBias.map((bias) => point.phaseAverage + bias);
  const traces = Array.from({ length: point.phases }, () => [] as number[]);
  const sensedTraces = Array.from({ length: point.phases }, () => [] as number[]);
  const trimTraces = Array.from({ length: point.phases }, () => [] as number[]);
  const sharingErrorTrace: number[] = [];
  const voltageProxy: number[] = [];
  let finalBalance = updateCurrentBalance(controllerConfig, balanceState, actualCurrents, Math.max(x[1] ?? 1e-9, 1e-9));
  x.forEach((time, index) => {
    const measured = actualCurrents.map((current, phase) => {
      const normalized = (phase - (point.phases - 1) / 2) / Math.max(point.phases - 1, 1);
      return current * (1 + normalized * senseMismatch) + normalized * offset;
    });
    const dt = index === 0 ? Math.max(x[1] ?? 1e-9, 1e-9) : Math.max(time - (x[index - 1] ?? 0), 1e-9);
    finalBalance = updateCurrentBalance(controllerConfig, balanceState, measured, dt);
    balanceState = finalBalance.state;
    actualCurrents.forEach((current, phase) => traces[phase]?.push(current));
    measured.forEach((current, phase) => sensedTraces[phase]?.push(current));
    finalBalance.trims.forEach((trim, phase) => trimTraces[phase]?.push(trim));
    sharingErrorTrace.push(finalBalance.rmsSharingError);
    const interactionDecay = 2 * Math.PI * Math.min(shareBandwidth, voltageBandwidth) * 0.35;
    voltageProxy.push(point.vout + (interactionRatio >= 1 / 3 ? 0.01 * Math.sin(2 * Math.PI * voltageBandwidth * time) * Math.exp(-interactionDecay * time) : 0));
    const plantRate = 2 * Math.PI * Math.max(shareBandwidth, 10);
    actualCurrents = actualCurrents.map((current, phase) => {
      const normalized = (phase - (point.phases - 1) / 2) / Math.max(point.phases - 1, 1);
      const interaction = interactionRatio >= 1 / 3
        ? normalized * point.phaseAverage * 0.04 * Math.sin(2 * Math.PI * voltageBandwidth * time)
        : 0;
      const target = point.phaseAverage + (physicalBias[phase] ?? 0) + (finalBalance.trims[phase] ?? 0) + interaction;
      return current + (target - current) * clamp(plantRate * dt, 0, 1);
    });
  });
  const currents: SignalSeries[] = traces.map((values, phase) => ({
    name: `Iavg P${phase + 1}`, unit: 'A', values,
    color: COLORS[phase % COLORS.length] as string,
    dash: phase % 2 === 0 ? undefined : [8, 5],
    marker: phase % 2 === 0 ? 'circle' : 'square',
  }));
  const sensedCurrents: SignalSeries[] = sensedTraces.map((values, phase) => ({
    name: `Isense P${phase + 1}`, unit: 'A', values,
    color: COLORS[(phase + 3) % COLORS.length] as string,
    dash: [2 + phase, 4],
    marker: 'diamond',
  }));
  const finalValues = currents.map((series) => series.values[series.values.length - 1] ?? 0);
  const localRipples = Array.from({ length: point.phases }, (_, phase) => {
    const normalized = (phase - (point.phases - 1) / 2) / Math.max(point.phases - 1, 1);
    const localInductance = point.inductance * (1 + normalized * lMismatch);
    return ((point.vin - point.vout) / localInductance) * point.duty * point.period;
  });
  const mismatch = Math.max(...finalValues) - Math.min(...finalValues);
  const balanceControls: SignalSeries[] = trimTraces.map((values, phase) => ({
    name: `balance trim P${phase + 1}`,
    unit: 'A',
    values,
    color: COLORS[(phase + 5) % COLORS.length] as string,
    dash: [3 + phase, 5],
    marker: phase % 2 === 0 ? 'diamond' : 'square',
  }));
  const sharingErrorSignal: SignalSeries = {
    name: 'RMS sharing error',
    unit: 'A',
    values: sharingErrorTrace,
    color: '#ffc400',
    dash: [10, 4, 2, 4],
    marker: 'circle',
  };
  const primaryLoopEnvelope: SignalSeries = {
    name: 'primary-loop reference response',
    unit: 'normalized',
    values: x.map((time) => 1 - Math.exp(-2 * Math.PI * voltageBandwidth * time)),
    color: '#36c7d8',
    marker: 'circle',
  };
  const sharingLoopEnvelope: SignalSeries = {
    name: 'sharing-loop reference response',
    unit: 'normalized',
    values: x.map((time) => 1 - Math.exp(-2 * Math.PI * shareBandwidth * time)),
    color: '#f061c8',
    dash: [8, 5],
    marker: 'square',
  };
  const voltageSignal: SignalSeries = { name: 'Voltage-loop proxy', unit: 'V', values: voltageProxy, color: '#9b8cff', dash: [10, 4, 2, 4], marker: 'square' };
  const finalSensedValues = sensedTraces.map((trace) => trace[trace.length - 1] ?? 0);
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      ...currents,
      ...sensedCurrents,
      ...balanceControls,
      sharingErrorSignal,
      primaryLoopEnvelope,
      sharingLoopEnvelope,
      voltageSignal,
    ],
    metrics: [
      { label: 'Final max-min mismatch', value: mismatch, unit: 'A', tone: mismatch < point.phaseAverage * 0.05 ? 'good' : 'warning' },
      { label: 'Sharing / voltage BW', value: interactionRatio, unit: 'ratio', tone: interactionRatio < 0.2 ? 'good' : interactionRatio < 0.5 ? 'warning' : 'danger' },
      { label: 'Initial mismatch', value: Math.max(...physicalBias) - Math.min(...physicalBias), unit: 'A' },
      { label: 'Final average current / phase', value: finalValues.map((current, phase) => `P${phase + 1} ${current.toFixed(3)} A`).join(' · ') },
      { label: 'Final sensed current / phase', value: finalSensedValues.map((current, phase) => `P${phase + 1} ${current.toFixed(3)} A`).join(' · ') },
      { label: 'Estimated peak current / phase', value: finalValues.map((current, phase) => `P${phase + 1} ${(current + (localRipples[phase] ?? point.ripple) / 2).toFixed(3)} A`).join(' · ') },
      { label: 'Final measured RMS share error', value: finalBalance.rmsSharingError, unit: 'A' },
      { label: 'Primary-loop reference time constant', value: 1 / (2 * Math.PI * voltageBandwidth), unit: 's' },
      { label: 'Sharing-loop reference time constant', value: 1 / (2 * Math.PI * shareBandwidth), unit: 's' },
      { label: 'Multi-rate observation window', value: observationTime, unit: 's' },
      { label: 'Minimum display/integration step', value: x[1] ?? 0, unit: 's' },
      { label: 'Loop-response disclosure', value: 'normalized first-order reference envelopes; interaction appears in current and voltage-proxy traces' },
      { label: 'Interaction indicator', value: interactionRatio > 0.35 ? 'Visible' : 'Separated' },
    ],
    events: [{ x: 0, label: 'balance enabled', kind: 'edge' }],
    expectedPrediction: interactionRatio >= 0.35 ? 'yes' : 'no',
    summary: `The simplified balancing loop reduces actual current error, but a sensor gain/offset error can bias the current it believes is balanced. Higher modeled DC path resistance biases that phase lower; inductance mismatch changes its ripple/peak estimate rather than being treated as a generic DC-sharing cause.`,
    discrepancyHint: 'A fast current-sharing loop can compete with the voltage loop or scheduler; “faster” is not automatically better.',
    warnings: [
      ...finalBalance.warnings,
      'The normalized primary- and sharing-loop traces are disclosed first-order bandwidth references, not independent switched simulations. A multi-rate grid resolves the faster loop early and then follows ten time constants of the slower loop; actual modeled sharing error, per-phase trim, and the voltage-loop proxy show the behavioral-loop interaction.',
    ],
    seed,
  };
};

const pspiceBlocksLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const architecture = Math.round(value(parameters, 'architecture', 0));
  const blocks = ['Feedback divider'];
  if (architecture === 2) blocks.push('Servo signal');
  blocks.push('Ripple sum', 'Comparator', 'Minimum off-time gate');
  if (architecture >= 1) blocks.push('Phase scheduler');
  blocks.push('One-shot', 'Buck phase', 'Current sense');
  const parallel = [
    ...(value(parameters, 'currentLimit', 1) ? ['current-limit override'] : []),
    ...(value(parameters, 'balance', 1) ? ['current-balance loop'] : []),
    ...(value(parameters, 'phaseShedding', 1) ? ['phase-shedding logic'] : []),
  ];
  const x = blocks.map((_, index) => index);
  return {
    x,
    xLabel: 'Block order',
    xUnit: 'index',
    signals: [{ name: 'Valid signal flow', unit: 'stage', values: x.map((index) => index + 1), color: '#36c7d8', marker: 'square' }],
    metrics: [
      { label: 'Required blocks', value: blocks.length },
      { label: 'Architecture', value: architecture === 0 ? 'Basic COT' : architecture === 1 ? 'Scheduled multiphase' : 'Servo-assisted COT' },
      { label: 'Current-limit path', value: value(parameters, 'currentLimit', 1) ? 'Included' : 'Omitted', tone: value(parameters, 'currentLimit', 1) ? 'good' : 'warning' },
      { label: 'Balance loop', value: value(parameters, 'balance', 1) ? 'Included' : 'Omitted' },
      { label: 'Parallel paths', value: parallel.length > 0 ? parallel.join(' · ') : 'none selected' },
    ],
    events: blocks.map((block, index) => ({ x: index, label: block, kind: 'edge' })),
    expectedPrediction: 'Minimum off-time gate',
    summary: `One valid fast path is ${blocks.join(' → ')}. ${parallel.length > 0 ? `The selected ${parallel.join(', ')} paths act in parallel at their disclosed command, inhibit, or enable nodes.` : 'No optional parallel path is selected.'}`,
    discrepancyHint: 'A valid implementation depends on where pulse requests are formed, where eligibility is enforced, and whether the one-shot directly drives one phase or follows arbitration.',
    warnings: value(parameters, 'currentLimit', 1) === 0 ? ['The educational power stage has no current-limit override in this configuration.'] : [],
    seed,
  };
};

const brokenModelLab = (parameters: Readonly<Record<string, number>>, seed: number): LabResult => {
  const cases = [
    'Ideal comparator chatter', 'Zero-delay algebraic loop', 'Transient step too large', 'Missing hysteresis', 'Floating node', 'Ideal-switch conditioning',
    'Wrong current-sense polarity', 'Incorrect phase order', 'Simultaneous phase firing', 'No current-balance mechanism', 'Incorrect initial condition',
    'Wrong load-current sign', 'Wrong inductor-voltage sign', 'Excessive controller gain', 'Missing minimum off-time', 'Missing propagation delay',
    'Numerical oscillation mistaken for physics', 'Averaged model used near switching frequency',
  ] as const;
  const evidence = [
    'Alternation follows comparator samples and collapses when a finite threshold band is introduced.',
    'The output changes state repeatedly at one simulation time because the command feeds back with no causal delay.',
    'The oscillation frequency follows the requested transient step instead of L, C, load, or switching period.',
    'Noise produces repeated threshold recrossing because the comparator has no state-dependent release level.',
    'The node drifts with integration history and seeded perturbation because it lacks a DC reference path.',
    'Low Roff creates visible leakage error; extreme Roff/Ron creates a stiff ideal-switch proxy.',
    'A rising sensed-current signal increases rather than terminates commanded energy, producing positive feedback.',
    'The edge sequence repeats out of intended round-robin order and creates a subharmonic phase packet.',
    'Narrow coincident-pulse spikes appear at the nominal phase boundary instead of being interleaved.',
    'A slow deterministic phase-current divergence remains because timing alone does not enforce DC sharing.',
    'The waveform starts from the wrong stored-energy state and relaxes toward the independent reference.',
    'A load increase raises output voltage, violating capacitor-current sign and energy balance.',
    'The inductor-voltage sign makes the error grow in the wrong direction during both switch states.',
    'The oscillation envelope grows at the configured loop scale, consistent with excessive loop gain.',
    'Pulse packets bunch without an eligibility gap, producing repeated narrow output disturbances.',
    'The command chatters at the decision boundary because an ideal zero-delay path removes causality.',
    'Adjacent integration samples alternate while the physical reference remains smooth.',
    'The averaged trace omits a switching-frequency component that is visible in the independent reference.',
  ] as const;
  const actions = [
    'Comparator conditioning',
    'Numerical regularization',
    'Sign / order correction',
    'Scheduler / balance constraint',
    'Initial / boundary-state correction',
    'Loop / abstraction redesign',
  ] as const;
  const correctActionByCase = [0, 0, 1, 0, 1, 1, 2, 2, 3, 3, 4, 2, 2, 5, 3, 0, 1, 5] as const;
  const faultCase = clamp(Math.round(value(parameters, 'faultCase', 0)), 0, cases.length - 1);
  const dt = value(parameters, 'dt', 500) * 1e-9;
  const hysteresis = value(parameters, 'hysteresis', 0) * 1e-3;
  const delay = value(parameters, 'delay', 0) * 1e-9;
  const switchRoff = value(parameters, 'switchRoff', 1000) * 1e6;
  const switchRon = 10e-3;
  const switchConditionRatio = switchRoff / switchRon;
  const actionChoice = clamp(Math.round(value(parameters, 'actionChoice', 0)), 0, actions.length - 1);
  const correctAction = correctActionByCase[faultCase] ?? 1;
  const random = seededNoise(seed);
  const x = linspace(0, 50e-6, 1001);
  const physical = x.map((time) => 5 + 0.08 * Math.exp(-time / 12e-6) * Math.sin(2 * Math.PI * 120e3 * time)
    + (faultCase === 17 ? 0.025 * Math.sin(2 * Math.PI * 500e3 * time) : 0));
  const flawed = x.map((time, index) => {
    if (faultCase === 0) return 5 + 0.035 * (index % 2 === 0 ? 1 : -1) / (1 + hysteresis * 1e3);
    if (faultCase === 1) return 5 + 0.05 * ([0, 1, -1][index % 3] ?? 0) / (1 + delay / 20e-9);
    if (faultCase === 2) return 5 + 0.2 * Math.sin(2 * Math.PI * (1 / Math.max(dt * 8, 1e-12)) * time);
    if (faultCase === 3) return 5 + 0.025 * Math.sign(Math.sin(2 * Math.PI * 4e6 * time) + 0.2 * random()) / (1 + hysteresis * 1e3);
    if (faultCase === 4) return 5 + 0.12 * time / 50e-6 + 0.015 * random();
    if (faultCase === 5) {
      const leakageError = 0.18 / (1 + switchRoff / 1e6);
      const stiffnessRipple = 0.01 * clamp((Math.log10(Math.max(switchConditionRatio, 1)) - 8) / 6, 0, 1);
      return (physical[index] ?? 5) - leakageError + stiffnessRipple * (index % 2 === 0 ? 1 : -1);
    }
    if (faultCase === 6) return 5 + 0.35 * (Math.exp(time / 35e-6) - 1);
    if (faultCase === 7) return 5 + 0.07 * Math.sin(2 * Math.PI * 250e3 * time) + 0.025 * Math.sin(2 * Math.PI * 62.5e3 * time);
    if (faultCase === 8) return (physical[index] ?? 5) + (index % 80 < 3 ? 0.28 : 0);
    if (faultCase === 9) return 5 + 0.14 * time / 50e-6 + 0.015 * Math.sin(2 * Math.PI * 20e3 * time);
    if (faultCase === 10) return 4.45 + 0.55 * (1 - Math.exp(-time / 15e-6)) + 0.02 * Math.sin(2 * Math.PI * 120e3 * time);
    if (faultCase === 11) return 5 + 0.45 * (1 - Math.exp(-time / 15e-6));
    if (faultCase === 12) return 5 - 0.5 * (Math.exp(time / 30e-6) - 1);
    if (faultCase === 13) return 5 + 0.06 * Math.exp(8e4 * time) * Math.sin(2 * Math.PI * 80e3 * time);
    if (faultCase === 14) return (physical[index] ?? 5) + (index % 120 < 3 || (index + 8) % 120 < 3 ? 0.18 : 0);
    if (faultCase === 15) return 5 + 0.03 * (index % 2 === 0 ? 1 : -1) / (1 + delay / 20e-9);
    if (faultCase === 16) return (physical[index] ?? 5) + 0.05 * (index % 2 === 0 ? 1 : -1) * clamp(dt / 500e-9, 0.1, 5);
    return 5 + 0.03 * Math.exp(-time / 12e-6) * Math.sin(2 * Math.PI * 30e3 * time);
  });
  return {
    x,
    xLabel: 'Time',
    xUnit: 's',
    signals: [
      { name: 'Observed trace', unit: 'V', values: flawed, color: '#ffc400', marker: 'square' },
      { name: 'Independent reference', unit: 'V', values: physical, color: '#36c7d8', dash: [8, 5], marker: 'circle' },
    ],
    metrics: [
      { label: 'Fault case', value: cases[faultCase] ?? 'Unknown' },
      { label: 'Time step', value: dt, unit: 's' },
      { label: 'Hysteresis', value: hysteresis, unit: 'V' },
      { label: 'Delay', value: delay, unit: 's' },
      { label: 'Switch Roff/Ron ratio', value: switchConditionRatio, unit: 'ratio', tone: faultCase === 5 && (switchConditionRatio < 1e6 || switchConditionRatio > 1e12) ? 'warning' : 'normal' },
      { label: 'Evidence', value: evidence[faultCase] ?? 'Compare against an independent invariant.' },
      { label: 'Selected corrective action', value: actions[actionChoice] ?? 'Unknown', tone: actionChoice === correctAction ? 'good' : 'warning' },
      { label: 'Recommended corrective action', value: actions[correctAction] ?? 'Unknown' },
    ],
    events: [{ x: 25e-6, label: 'inspect evidence', kind: 'artifact' }],
    expectedPrediction: actions[correctAction] ?? 'Numerical regularization',
    summary: `The injected defect is “${cases[faultCase] ?? 'Unknown'}.” ${evidence[faultCase] ?? ''} The recommended category is ${actions[correctAction] ?? 'independent review'}.`,
    discrepancyHint: 'Change one numerical or modeling assumption, compare against an analytical invariant, and determine whether the oscillation tracks physical component values or solver/controller timing.',
    warnings: [
      'This laboratory intentionally renders a flawed case. A converged trace is not treated as validation.',
      ...(faultCase === 5 ? ['The controlled-switch trace combines visible off-state leakage at low Roff with a disclosed stiffness proxy at extreme Roff/Ron ratio; it is a numerical-conditioning exercise, not a MOSFET leakage model.'] : []),
    ],
    seed,
  };
};

export const runLab = (
  lab: LabDefinition,
  parameters: Readonly<Record<string, number>>,
  seed = 0xc072024,
): LabResult => {
  validateLabParameters(lab, parameters);
  const dispatch: Record<LabId, () => LabResult> = {
    'current-path': () => currentPathLab(parameters, seed),
    'inductor-ripple': () => rippleLab(parameters, seed),
    'capacitor-ripple': () => capacitorLab(parameters, seed),
    'conduction-identification': () => conductionLab(parameters, seed),
    'operating-point': () => operatingPointLab(parameters, seed),
    'pole-zero': () => bodeLab('pole-zero', parameters, seed),
    'crossover-tuning': () => bodeLab('crossover-tuning', parameters, seed),
    'error-amplifier': () => bodeLab('error-amplifier', parameters, seed),
    'peak-current': () => peakCurrentLab(parameters, seed),
    'cot-pulse': () => cotPulseLab(parameters, seed),
    'ripple-injection': () => cotPulseLab(parameters, seed, true),
    'control-comparison': () => controlComparisonLab(parameters, seed),
    interleaving: () => interleavingLab(parameters, seed),
    'cot-scheduler': () => schedulerLab(parameters, seed),
    'current-sharing': () => currentSharingLab(parameters, seed),
    'pspice-blocks': () => pspiceBlocksLab(parameters, seed),
    'broken-model': () => brokenModelLab(parameters, seed),
  };
  const result = dispatch[lab.id]();
  if (result.x.length < 2 || result.x.some((sample) => !Number.isFinite(sample))) throw new Error(`${lab.title} produced an invalid independent-axis vector.`);
  if (result.signals.some((signal) => signal.values.length !== result.x.length || signal.values.some((sample) => !Number.isFinite(sample)))) throw new Error(`${lab.title} produced a nonfinite or length-mismatched signal.`);
  if (result.metrics.some((metric) => typeof metric.value === 'number' && !Number.isFinite(metric.value))) throw new Error(`${lab.title} produced a nonfinite metric.`);
  return result;
};

export const formatEngineering = (input: number, unit = '', digits = 3): string => {
  if (!Number.isFinite(input)) return 'invalid';
  if (input === 0) return `0 ${unit}`.trim();
  const prefixes = [
    { exponent: 12, symbol: 'T' }, { exponent: 9, symbol: 'G' }, { exponent: 6, symbol: 'M' },
    { exponent: 3, symbol: 'k' }, { exponent: 0, symbol: '' }, { exponent: -3, symbol: 'm' },
    { exponent: -6, symbol: 'µ' }, { exponent: -9, symbol: 'n' }, { exponent: -12, symbol: 'p' },
  ] as const;
  const exponent = Math.floor(Math.log10(Math.abs(input)) / 3) * 3;
  const prefix = prefixes.find((candidate) => candidate.exponent === clamp(exponent, -12, 12)) ?? prefixes[4];
  const scaled = input / 10 ** (prefix?.exponent ?? 0);
  return `${Number(scaled.toPrecision(digits))} ${prefix?.symbol ?? ''}${unit}`.trim();
};
