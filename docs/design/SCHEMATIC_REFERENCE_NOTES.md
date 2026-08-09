# Schematic reference notes

The course diagrams are original, code-native teaching graphics. No third-party figure is copied into the application. The references below were reviewed to check electrical topology, current direction, state separation, labeling, and the visual grammar used to explain a synchronous multiphase buck.

## Decisions carried into the UI

- Show every visible phase as its own `QH / QL → SW → L` lane and join those lanes at one `VOUT`, output capacitor, and load. When more than three phases are selected, show three complete representative lanes plus an explicit count of the additional identical branches.
- Keep the power story left-to-right: source, switching phase, energy storage, shared output, load.
- Show high-side on, low-side on, and dead time as distinct states. During positive-current dead time, identify the low-side body diode directly; during negative current, identify the high-side return path.
- Use arrows, ON/OFF text, path style, and a written route in addition to color.
- Pair every conduction state with the applicable inductor-voltage relation and a plain-language rising/falling-current explanation.
- For multiphase operation, label phase lanes and their ideal `360° / N` timing offsets instead of implying that one drawn phase represents the complete topology.

## Reviewed references

### Public educational and manufacturer material

- [MIT IAP 2025, Lecture 04: Common electrical topologies](https://pcb.mit.edu/lectures/slides/lecture04.pdf) separates buck switch-on and switch-off modes and pairs each topology with the corresponding inductor-current trend.
- [TI, Understanding Dead-Time Based on TPS51225/275/285](https://www.ti.com/lit/pdf/slua919) shows complementary gate timing and the body-diode interval that occurs while both gates are off.
- [Analog Devices, Considerations for the Output Current and Voltage Ripple in a Multiphase Buck](https://www.analog.com/en/resources/analog-dialogue/articles/output-current-and-volt-ripple-in-multiphase-buck.html) uses explicit parallel phase branches and distinguishes per-phase current from summed output current.
- [TI Power Topologies Handbook](https://www.ti.com/lit/eb/slyu036a/slyu036a.pdf) was used to confirm the conventional `Q1 / Q2 → L → COUT / load` topology and signal names.

### Learner-confusion and community examples

- [Reddit: “the low side mosfet in a synchronous buck converter appears to conduct backwards”](https://www.reddit.com/r/diyelectronics/comments/1gjfrjd/the_low_side_mosfet_in_a_synchronous_buck/) captures a common misconception: positive freewheel current travels from ground toward the switch node, while an enhanced MOSFET channel can conduct in either direction. The revised UI spells out this route instead of relying on symbol orientation alone.
- [Reddit: synchronous CC/CV buck review](https://www.reddit.com/r/PrintedCircuitBoard/comments/10h0z23/review_request_synchronous_cccv_buck_converter/) was used only as a readability counterexample: learners should not need to untangle discontinuous or ambiguously oriented power flow.
- [Chegg: high-side, low-side, and half-bridge gate-driver exercise](https://www.chegg.com/homework-help/questions-and-answers/pleas-help-thank-need-part-e-q110445043) exposes an LTspice synchronous-buck exercise with complementary high-/low-side drive. It is a weak, paywalled reference and was not treated as a technical authority or copied.

### Video walkthroughs

- [FesZ Electronics, Synchronous Buck Converters](https://www.youtube.com/watch?v=fwUft6ewZlo) uses schematic and simulation views to distinguish asynchronous and synchronous conduction.
- [Sam Ben-Yaakov, Deciphering multiphase interleaved PWM converters with coupled inductors](https://www.youtube.com/watch?v=jz8GuP6Jupc) uses per-phase and summed-current visual language to explain interleaving.

These sources inform presentation only. The course's equations, sign conventions, simulation state, and cited technical claims remain governed by the reviewed repository sources and tests.
