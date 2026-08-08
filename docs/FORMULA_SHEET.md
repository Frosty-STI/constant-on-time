# Formula sheet with conditions

Unless stated otherwise, use \(i_L>0\) from switch node to output and \(i_C>0\) into the output capacitor. “Ideal CCM” means ideal switches, negligible losses/dead time, fixed \(f_s\), periodic steady state, and current never reaching zero.

## Variable definitions

| Symbol | Meaning | SI unit |
|---|---|---|
| \(V_{in}, V_o\) | Input and output voltage | V |
| \(D\) | High-side commanded duty ratio over the stated averaging interval | unitless |
| \(f_s, T_s\) | Per-phase switching frequency and period | Hz, s |
| \(t_{on}, t_{off,min}\) | Commanded on-time and enforced minimum off-time | s |
| \(L, C\) | Per-phase inductance and shared output capacitance | H, F |
| \(i_L, i_C, i_{load}\) | Inductor, capacitor, and load currents with the declared arrows | A |
| \(R, R_{HS}, R_{DCR}, R_{ESR}\) | Load, high-side on, inductor winding, and capacitor ESR | Ω |
| \(N, k, \theta_k\) | Phase count, phase index, and ideal phase offset | count, count, degrees |
| \(G_{vd}, G_c, G_m, H\) | Control-to-output plant, compensator, modulator, and feedback gains | as defined per block |
| \(T, \omega_c, PM\) | Named loop gain, selected unity-crossover radian frequency, and phase margin | unitless, rad/s, degrees |
| \(x, f(x,t), h\) | Numerical state, its derivative function, and integration step | state unit, state unit/s, s |
| \(\Delta\), subscript `pp`, \(\langle\cdot\rangle_T\) | Change, peak-to-peak value, and average over interval \(T\) | same as quantity |

The **Sources** column is the derivation/reference trail; the relevant structured lesson in `packages/lesson-content/modules/` supplies the physical derivation and modeling consequence. Gain dimensions are not assumed: for example, a PWM modulator can carry inverse-volts while their product \(T\) remains unitless.

| Relationship | Units | Valid when / assumptions | Common misuse | Sources |
|---|---|---|---|---|
| \(v_L=L\,di_L/dt\) | V, H, A/s | Lumped linear inductor; passive sign convention | Reversing current arrow without reversing voltage sign | FPE3, MIT622-L05 |
| \(i_C=C\,dv_C/dt\) | A, F, V/s | Lumped linear capacitance | Using terminal voltage when ESR/ESL separates it from capacitor state | FPE3 |
| \(\langle v_L\rangle_T=0\) | V | Periodic steady state; same inductor state after \(T\) | Applying during startup or a transient window | MIT622-L05, FPE3 |
| \(\langle i_C\rangle_T=0\) | A | Periodic steady state; capacitor voltage returns after \(T\) | Applying during load-step droop/recovery | FPE3, TI-SLVA057 |
| \(D=V_o/V_{in}\) | unitless | Ideal buck, CCM, periodic steady state, negligible dead time/loss | Treating it as exact with RDS(on), DCR, diode drop, DCM, or COT frequency variation | MIT622-L05, TI-SLVA057 |
| \(m_{on}=di_L/dt=(V_{in}-V_o)/L\) | A/s | Ideal high-side-on state | Ignoring \(i_L(R_{HS}+R_{DCR})\) in a nonideal model | MIT622-L05, TI-SLVA057 |
| \(m_{off}=di_L/dt=-V_o/L\) | A/s | Ideal low-side-on/freewheel node at 0 V | Using it during diode dead time or reverse current with a different switch-node clamp | MIT622-L05, TI-SLVA057 |
| \(\Delta i_{L,pp}=(V_{in}-V_o)D/(Lf_s)\) | A | Ideal fixed-frequency CCM triangular ripple | Using nominal \(D\) when timing varies or pulses skip | TI-SLVA057, TI-SLVA477 |
| \(I_{pk}=I_{L,avg}+\Delta i_L/2;\ I_{val}=I_{L,avg}-\Delta i_L/2\) | A | Symmetric linear ramps around average | Assuming symmetry with nonlinear L, asymmetric timing, or transients | TI-SLVA477 |
| \(I_{phase,BCM}=\Delta i_L/2;\ I_{o,BCM}=N\Delta i_L/2\) | A | Ideal unidirectional buck; balanced N-phase currents, equal per-phase ripple, and every phase continuously switching at its boundary (the single-phase case is \(N=1\)) | Calling the per-phase boundary the total output current, or applying it to phase shedding/forced reverse-current operation | MIT622-L08, TI-SLVA057, TI-SLVA882 |
| \(\Delta v_{C,pp}\approx\Delta i_L/(8Cf_s)\) | V | Single-phase triangular capacitor current, ideal C, CCM, steady state | Adding directly to ESR ripple without checking timing | TI-SLVA057, TI-SLVA477 |
| \(\Delta v_{ESR,pp}\approx\Delta i_LR_{ESR}\) | V | Lumped constant ESR, triangular current | Calling fast edge ringing “ESR ripple” when ESL/layout dominate | TI-SLVA477, ADI-AN1144 |
| \(i_C=\sum_{k=1}^{N}i_{L,k}-i_{load}\) | A | Shared output node, stated current directions | Averaging phases before evaluating switched capacitor current | FPE3, TI-SLVA882 |
| \(dv_C/dt=(\sum i_{L,k}-i_{load})/C\) | V/s | Lumped capacitor state; ESR handled separately | Integrating terminal voltage with ESR as capacitor state | FPE3, TI-SLVA882 |
| \(\Delta V\approx\Delta Q/C\) | V | Charge-deficit estimate before complete control/inductor response | Claiming it predicts full recovery | TI-SLYT139, FPE3 |
| \(f_0=1/(2\pi\sqrt{LC})\) | Hz | Ideal LC natural frequency; damping omitted | Calling it closed-loop bandwidth | FPE3, TI-SLVA301 |
| \(f_{ESR}=1/(2\pi R_{ESR}C)\) | Hz | Lumped constant ESR/C | Applying beyond lumped capacitor validity | FPE3, TI-SLVA301 |
| \(G_{vd}(s)=\dfrac{V_{in}(1+sR_{ESR}C)}{1+s(L/R+R_{ESR}C)+s^2LC(1+R_{ESR}/R)}\) | V/V | Exact passive-network denominator for the canonical ideal-inductor CCM buck with resistive load in parallel with a series ESR–C branch | Dropping ESR denominator terms without \(R_{ESR}\ll R\), or using it for DCM, constant-current load, or near \(f_s\) unchanged | FPE3, TI-SLVA301 |
| \(T(s)=G_cG_mG_{vd}H\) | unitless | Compatible linearized single-loop factorization with defined signs | Omitting modulator/feedback gain or assuming every COT loop factors identically | FPE3, TI-SLVA301 |
| \(PM=180^\circ+\angle T(j\omega_c)\) | degrees | Negative-feedback convention and selected unity crossing | Reporting PM without convention or with unidentified multiple crossings | FPE3, MIDDLEBROOK-1975 |
| \(20\log_{10}|G|\) | dB | Amplitude ratio | Using 10 log for voltage/current amplitude ratio | FPE3 |
| \(10\log_{10}(P_2/P_1)\) | dB | Power ratio | Using 20 log for direct power ratio | FPE3 |
| \(t_{on}=D/f_s\) | s | Fixed-frequency periodic PWM | Treating \(f_s\) as fixed in basic COT | TI-SLVA281 |
| \(f_{s,avg}\approx D/t_{on}\approx V_o/(V_{in}t_{on})\) | Hz | Ideal CCM basic fixed-on-time buck near steady \(V_o\), no skips/delay | Calling frequency instantaneous, exact, or constant | TI-SLVA281, RIDLEY-1990-COT |
| \(D_{max}\lesssim t_{on,max}/(t_{on,max}+t_{off,min})\) | unitless | Simple repeating pulses; no extra scheduler delay | Ignoring propagation, dead time, denied/skipped pulses, or adaptive laws | ON-FAN23SV10M |
| \(\theta_k=360^\circ k/N\) | degrees | Ideal equal phase spacing | Assuming it guarantees equal current | TI-SLVA882 |
| \(f_{ripple,ideal}=Nf_s\) | Hz | Symmetric equal-frequency phases, uniform spacing | Applying to free-running variable-frequency or mismatched phases | TI-SLVA882 |
| \(I_{phase,avg}\approx I_o/N\) | A | Balanced symmetric N-phase steady state | Treating it as guaranteed without sensing/balance | TI-SLVA882, TI-SSZTC61 |
| Euler: \(x_{n+1}=x_n+h f(x_n,t_n)\) | state units | Explicit first-order integration; small enough \(h\) between events | Assuming timestep convergence proves the physical model | FPE3 |
| Trapezoidal: \(x_{n+1}=x_n+\tfrac{h}{2}[f_n+f_{n+1}]\) | state units | Implicit/solved update with event treatment | Letting a step straddle an undiscovered edge | CAD-PSPICE-UG |

The source establishes or supports the relationship; the validity column controls its use. A design heuristic must never be promoted to an exact relationship. Additional sampled-data limits: RIDLEY-1991 and BROWN-1981; COT ripple dynamics: TI-SLVA546; multiphase current balance: INFINEON-APEC03.
