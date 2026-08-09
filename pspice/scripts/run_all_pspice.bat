@echo off
setlocal
where psp_cmd.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: psp_cmd.exe is not on PATH.
  echo Open a Cadence command prompt or add the installed PSpice bin directory.
  exit /b 2
)

for %%F in (
  averaged_buck.cir
  switched_buck.cir
  nonideal_buck.cir
  oneshot.cir
  oneshot_inhibit_level_request.cir
  voltage_mode.cir
  loop_gain_averaged.cir
  peak_current.cir
  single_phase_cot.cir
  two_phase_cot.cir
  multiphase_cot.cir
  load_step.cir
  line_step.cir
  mismatch.cir
  current_limit.cir
  current_balance.cir
  scheduler.cir
  scheduler_current_priority_boundary.cir
  phase_shedding.cir
  capstone.cir
) do (
  echo Running %%F
  psp_cmd.exe "pspice\testbenches\%%F"
  if errorlevel 1 (
    echo FAILED: %%F
    exit /b 1
  )
)

echo All PSpice processes returned success. Inspect every .out file for warnings.
exit /b 0
